import type { Models } from 'node-appwrite'
import { Query } from 'node-appwrite'
import { BRAND_EVENTS_TABLE } from './brandStore'
import { brandEventSweepDue, brandEventsRetentionCutoff } from '../../shared/brandEventsRetention'

/**
 * DER EREIGNIS-SWEEP (BS1 R1b) — die Mechanik zur 24-Monats-Frist aus dem Kopf
 * von `scripts/migrations/007-brand-events.ts`.
 *
 * Er löst ein, was dort seit Tag eins steht („Ein Sweep im Layer räumt Älteres
 * weg") und was das Faktenblatt als Baubefund gefunden hat. Die Regel selbst
 * ist pur und liegt in `shared/brandEventsRetention.ts`.
 *
 * ── ES WIRD GELÖSCHT, NICHT GELEERT ──────────────────────────────────────
 * Der Unterschied zum Rohtext-Sweep nebenan (`market`) ist der Zweck der
 * Zeile: dort ist die Zeile ein KANDIDAT, der weiterlebt, und nur ein Feld
 * daran ist befristet. Hier IST die Zeile das Ereignis — eine Ereignis-Zeile
 * ohne Nutzlast wäre kein Beleg mehr, sondern Datenmüll mit einem Zeitstempel,
 * der die Frist überlebt. Gleiche Wahl und gleiche Begründung wie bei
 * `pruneGuestAuthors` im comments-Layer.
 *
 * ── OHNE `H3Event`, UND DAS IST EINE DOKUMENTIERTE AUSNAHME ──────────────
 * Ein Sweep bedient keinen Request. Er liegt deshalb in `server/utils` und
 * nicht in `server/plugins` — dieselbe Wahl wie bei `guestAuthorPrune.ts` und
 * `marketRawSweep.ts`: der richtige ORT ist die bessere Antwort als eine
 * `eslint-disable`-Zeile. (Der Datentür-Backstop listet `brand` ohnehin nicht:
 * der Layer ist ein SILO auf der Single-Tenant-Instanz `branding`, seine
 * Tabellen tragen kein `communityId`. Die Ausnahme wäre also gar nicht nötig —
 * der Ort bleibt trotzdem derselbe, damit die drei Sweeps dieses Projekts an
 * derselben Stelle stehen.)
 *
 * Der Admin-Client wird ohne Event gebaut (`createAdminClient()`),
 * `useRuntimeConfig()` ebenso — CLAUDE.md nennt Sweeps ausdrücklich als
 * erlaubt ausserhalb der Datentür.
 *
 * ── ÜBER ALLE BRANDINGS UND ALLE KONTEN ──────────────────────────────────
 * Kein Filter auf `profileId` oder `userId`. Die Frist gehört der TABELLE,
 * nicht dem einzelnen Branding; ein Sweep je Branding hätte genau die Zeilen
 * liegen lassen, deren Branding niemand mehr anfasst — und das sind die
 * ältesten. Ereignisse ohne Profil (Trichter-Einstieg) hätte er nie gesehen.
 *
 * ── `$createdAt` BRAUCHT KEINEN EIGENEN INDEX ────────────────────────────
 * Gemessen gegen die lokale Appwrite 1.9.6 (`Query.lessThan('$createdAt', …)`
 * auf `brand_events` antwortet, ohne einen Index zu verlangen) — genau die
 * Annahme, die der Kopf von brand-007 begründet („auf INTERNE Attribute legt
 * dieses Projekt nirgends Indizes"), und dieselbe Abfrage, die
 * `pruneGuestAuthors` seit 2026-08-01 in Produktion fährt. Der Sweep kostet
 * deshalb KEINE Migration.
 *
 * ── LOGZEILEN OHNE INHALT ────────────────────────────────────────────────
 * `brand.events_swept` trägt ZAHLEN. Keine Ereignis-Typen, keine Branding-Id,
 * keine Nutzlast — die Log-Regel des Schemas (§6) gilt für dieselben Zeilen,
 * die dieser Sweep gerade löscht. Die Zeilen-Id im FEHLER-Fall ist die
 * Ausnahme: sie ist die einzige Angabe, mit der ein Betreiber eine hängende
 * Zeile wiederfindet.
 */

/**
 * Wie viele Zeilen ein Lauf höchstens anfasst.
 *
 * Explizit, weil Appwrites Vorgabe 25 ist und eine Liste, die still bei 25
 * endet, wie ein leeres Ende aussieht. 200 ist reichlich für eine Tabelle, die
 * in Monaten altert: fällig wird an einem Tag nur, was vor genau zwei Jahren
 * an EINEM Tag entstanden ist. Was übrig bleibt, nimmt der nächste Lauf — der
 * Filter ist das Alter, und das wird nicht kleiner.
 */
const SWEEP_BATCH = 200

let sweepRunning = false

export interface BrandEventsSweepResult {
  /** Wie viele Zeilen die Abfrage geliefert hat. */
  checked: number
  /** Wie viele davon gelöscht wurden (die pure Regel entscheidet). */
  deleted: number
  /** Wie viele Löschversuche fehlgeschlagen sind — fail-soft, aber gezählt. */
  errors: number
}

/**
 * Einen Durchgang fahren. `now` ist ein Argument, damit der Takt keine zweite
 * Zeitquelle hat und ein Test die Uhr stellen kann — der E2E-Beweis braucht es
 * nicht, weil Appwrite `$createdAt` beim Anlegen mit dem Server-Schlüssel
 * annimmt und eine wirklich alte Zeile deshalb herstellbar ist.
 */
export async function runBrandEventsSweep(now: Date = new Date()): Promise<BrandEventsSweepResult> {
  const result: BrandEventsSweepResult = { checked: 0, deleted: 0, errors: 0 }
  if (sweepRunning) return result
  sweepRunning = true

  try {
    const { tablesDB } = createAdminClient()
    const databaseId = useRuntimeConfig().public.appwriteDatabaseId

    const listed = await tablesDB.listRows<Models.DefaultRow>({
      databaseId,
      tableId: BRAND_EVENTS_TABLE,
      queries: [
        Query.lessThan('$createdAt', brandEventsRetentionCutoff(now)),
        // Älteste zuerst: liegt je mehr an, als ein Stapel fasst, arbeitet sich
        // der Sweep garantiert vorwärts, statt immer denselben Ausschnitt zu
        // sehen.
        Query.orderAsc('$createdAt'),
        Query.limit(SWEEP_BATCH),
      ],
    }).catch(() => null)

    // FAIL-SOFT UND STILL: auf einer Instanz OHNE die brand-Migrationen gibt es
    // die Tabelle nicht, und der Layer kann trotzdem einkompiliert sein (der
    // Playground ist genau so). Ein täglicher Fehler-Stapel wäre dort kein
    // Hinweis, sondern Rauschen.
    if (!listed) return result

    result.checked = listed.rows.length

    for (const row of listed.rows) {
      // Die pure Regel bleibt als Netz HINTER der Abfrage stehen.
      if (!brandEventSweepDue(row, now)) continue
      try {
        await tablesDB.deleteRow({ databaseId, tableId: BRAND_EVENTS_TABLE, rowId: row.$id })
        result.deleted += 1
      }
      catch (error) {
        result.errors += 1
        logEvent('warn', 'brand.events_sweep_failed', {
          rowId: row.$id,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return result
  }
  finally {
    sweepRunning = false
  }
}
