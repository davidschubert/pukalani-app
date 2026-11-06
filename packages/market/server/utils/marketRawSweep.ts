import { Query } from 'node-appwrite'
import type { MarketCompetitorRow } from '../../shared/types/market'
import { MARKET_COMPETITORS_TABLE } from '../../shared/types/market'
import { marketRawSweepDue, marketRawSweepPatch } from '../../shared/marketRetention'

/**
 * DER ROHTEXT-SWEEP (Plan §2.6, §2.9 Nr. 6; MV1 M5).
 *
 * Er löst die 24-Stunden-Zusage ein: abgelaufener `rawText` wird geleert, der
 * Stempel `rawExpiresAt` fällt mit. Was BLEIBT, ist das Marktprofil mit seinen
 * kurzen Belegzitaten und der Quell-Adresse — genau das, was §1.7 Nr. 4
 * zusagt. Die Regel selbst ist pur und liegt in `shared/marketRetention.ts`.
 *
 * ── OHNE `H3Event`, UND DAS IST EINE DOKUMENTIERTE AUSNAHME ──────────────
 * Ein Sweep bedient keinen Request. Er liegt deshalb in `server/utils` und
 * nicht in `server/plugins` (dort greift der ESLint-Backstop gegen rohes
 * `.tablesDB`) — dasselbe Muster und dieselbe Begründung wie bei
 * `guestAuthorPrune.ts` im comments-Layer: der richtige ORT ist die bessere
 * Antwort als eine `eslint-disable`-Zeile. Der Admin-Client wird ohne Event
 * gebaut (`createAdminClient()`), `useRuntimeConfig()` ebenso.
 *
 * Die Datentür (`tenantDb`) ist hier ohnehin kein Thema: `market` ist ein
 * Silo-Layer auf der `branding`-Instanz, seine Tabellen tragen kein
 * `communityId`, und CLAUDE.md nennt Sweeps ausdrücklich als erlaubt
 * ausserhalb der Tür.
 *
 * ── MANDANTEN-ÜBERGREIFEND IST HIER „ÜBER ALLE BRANDINGS" ────────────────
 * Der Sweep filtert bewusst NICHT auf `profileId`: die Frist gehört dem
 * fremden Website-Betreiber, nicht dem Kunden, der den Lauf gestartet hat. Ein
 * Sweep je Branding hätte genau die Zeilen liegen lassen, deren Branding
 * niemand mehr anfasst — und das sind die ältesten.
 *
 * ── REENTRANZ-GUARD IM UTIL, NICHT IM PLUGIN ─────────────────────────────
 * Takt-Plugin und die manuelle Route (`POST /api/market/ops/sweep`) dürfen
 * sich nicht überlappen. Der Guard steht deshalb hier, wo beide durchkommen —
 * dasselbe Muster wie `sweepRunning` in `emailDigest.ts`. Mehrere Prozesse
 * teilen ihn nicht; das ist die Single-Instanz-Annahme aller Sweeps dieses
 * Projekts und kostet hier nichts: zweimal dasselbe Feld zu leeren ist
 * idempotent.
 *
 * ── LOGZEILEN OHNE INHALT ────────────────────────────────────────────────
 * `market.raw_swept` trägt ZAHLEN. Kein Name, keine Adresse, kein Zitat und
 * erst recht kein Rohtext — die Log-Regel des Plans (§2.9 Nr. 6) gilt für
 * denselben Text, den dieser Sweep gerade löscht.
 */

/**
 * Wie viele Zeilen ein Lauf höchstens anfasst.
 *
 * Explizit, weil Appwrites Vorgabe 25 ist und eine Liste, die still bei 25
 * endet, wie ein leeres Ende aussieht. 200 ist reichlich: bei fünf
 * Wettbewerbern je Branding und drei Läufen am Tag entstehen selbst bei
 * dreizehn aktiven Brandings weniger fällige Zeilen, als ein Halbstunden-Takt
 * abarbeitet. Was übrig bleibt, nimmt der nächste Lauf — der Filter ist der
 * Ablaufzeitpunkt, und der wird nicht jünger.
 */
const SWEEP_BATCH = 200

let sweepRunning = false

export interface MarketRawSweepResult {
  /** Wie viele Zeilen die Abfrage geliefert hat. */
  checked: number
  /** Wie viele davon geleert wurden (die pure Regel entscheidet). */
  swept: number
  /** Wie viele Schreibvorgänge fehlgeschlagen sind — fail-soft, aber gezählt. */
  errors: number
}

/**
 * Einen Durchgang fahren. `now` ist ein Argument, damit der Beweis nicht auf
 * die Uhr warten muss und der Takt keine zweite Zeitquelle hat.
 */
export async function runMarketRawSweep(now: Date = new Date()): Promise<MarketRawSweepResult> {
  const result: MarketRawSweepResult = { checked: 0, swept: 0, errors: 0 }
  if (sweepRunning) return result
  sweepRunning = true

  try {
    const { tablesDB } = createAdminClient()
    const databaseId = useRuntimeConfig().public.appwriteDatabaseId

    const listed = await tablesDB.listRows<MarketCompetitorRow>({
      databaseId,
      tableId: MARKET_COMPETITORS_TABLE,
      queries: [
        // Der Index `idx_raw_expires` aus market-001 — er steht dort genau für
        // diese Abfrage („eine Aufbewahrungsfrist ohne Lesepfad wäre ein
        // Versprechen ohne Einlösung", Anhang B).
        Query.lessThanEqual('rawExpiresAt', now.toISOString()),
        // Älteste zuerst: liegt je mehr an, als ein Stapel fasst, arbeitet
        // sich der Sweep garantiert vorwärts, statt immer denselben
        // Ausschnitt zu sehen.
        Query.orderAsc('rawExpiresAt'),
        Query.limit(SWEEP_BATCH),
      ],
    }).catch(() => null)

    // FAIL-SOFT UND STILL: auf einer Instanz OHNE die market-Migration gibt es
    // die Tabelle nicht, und der Layer kann trotzdem einkompiliert sein (genau
    // der Zustand von `branding`, solange die Prod-Migration aussteht). Ein
    // halbstündlicher Fehler-Stapel wäre dort kein Hinweis, sondern Rauschen.
    if (!listed) return result

    result.checked = listed.rows.length

    for (const row of listed.rows) {
      // Die pure Regel bleibt als Netz HINTER der Abfrage stehen.
      if (!marketRawSweepDue(row, now)) continue
      try {
        await tablesDB.updateRow({
          databaseId,
          tableId: MARKET_COMPETITORS_TABLE,
          rowId: row.$id,
          data: marketRawSweepPatch(),
        })
        result.swept += 1
      }
      catch (error) {
        result.errors += 1
        logEvent('warn', 'market.raw_sweep_failed', {
          // Die Zeilen-Id ist keine Kundenaussage — sie ist die einzige
          // Angabe, mit der ein Betreiber eine hängende Zeile wiederfindet.
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
