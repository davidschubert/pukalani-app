import { Query } from 'node-appwrite'
import type { InsightsCorrectionRow } from '../../shared/insightsRows'
import { INSIGHTS_CORRECTIONS_TABLE } from '../../shared/insightsRows'
import { insightsCorrectionSweepDue } from '../../shared/insightsCorrection'

/**
 * DER FRISTEN-SWEEP DER KORREKTUR-ZEILEN (Plan §9.3 „Retention und
 * Kaskaden"; Muster: `brand/server/utils/brandEventsSweep.ts`).
 *
 * Er löst die Zusage aus §9.3 ein: „Was NICHT bleibt: `contactEmail` und
 * `ipHash` werden nach 12 Monaten geleert (ein Sweep nach dem Muster
 * `brandEventsSweep.ts`, Frist als EINE Konstante)."
 *
 * ── ES WIRD GELEERT, NICHT GELÖSCHT ──────────────────────────────────────
 * Genau umgekehrt zum Ereignis-Sweep im brand-Layer, und aus demselben
 * Denkschritt: dort IST die Zeile das Ereignis, eine Ereignis-Zeile ohne
 * Nutzlast wäre Datenmüll. Hier ist die Zeile der NACHWEIS eines
 * Korrekturvorgangs — sie beweist, dass jemand widersprochen hat und dass wir
 * entschieden haben, und genau danach fragt Anwaltsfrage 3. Befristet sind
 * nur die zwei Felder, die eine PERSON benennen. Das ist dieselbe Wahl wie
 * beim Rohtext-Sweep im market-Layer (Zeile bleibt, Feld geht) — nur mit
 * einer Frist in Monaten statt in Stunden.
 *
 * ── DIE FRIST STEHT ALS DATUM IN DER ZEILE, NICHT ALS RECHNUNG ──────────
 * `retentionAt` wird beim ANLEGEN gesetzt (`insightsCorrectionRetentionAt`).
 * Der Sweep vergleicht deshalb nur — er braucht keinen Kalender, und der
 * Lesepfad ist ein INDEX (`idx_retention`) statt eines Scans über alle
 * Zeilen. Der zweite Gewinn ist Ehrlichkeit: ein späterer Wechsel der Frist
 * verlängert nicht rückwirkend, was schon zugesagt wurde.
 *
 * ── DIE FRIST GEHT MIT (Prüf-Befund I1, 2026-09-09) ─────────────────────
 * Beim Leeren wird `retentionAt` auf null gesetzt — nicht aus Ordnungsliebe,
 * sondern weil der Lesepfad `retentionAt <= now` sonst JEDE schon geleerte
 * Zeile bei jedem Lauf erneut liefert. Mit `SWEEP_BATCH` = 200 und
 * `orderAsc(retentionAt)` hieße das: sobald 200 geleerte Zeilen existieren,
 * füllen sie den Batch allein, und jede NEU fällige Zeile dahinter würde nie
 * mehr erreicht — die Zusage aus §9.3 liefe still leer. Die pure Regel
 * `insightsCorrectionSweepDue` bleibt als zweites Netz (leere Felder ⇒ kein
 * Schreibvorgang), aber sie sieht nur, was die Abfrage ihr zeigt. Dieselbe
 * Nullung macht der GDPR-Contributor, wenn er dieselben Felder leert.
 *
 * ── OHNE `H3Event`, UND DAS IST EINE DOKUMENTIERTE AUSNAHME ─────────────
 * Ein Sweep bedient keinen Request. Er liegt deshalb in `server/utils` und
 * nicht in `server/plugins` — dieselbe Wahl wie bei `brandEventsSweep.ts`,
 * `marketRawSweep.ts` und `guestAuthorPrune.ts`: der richtige ORT ist die
 * bessere Antwort als eine `eslint-disable`-Zeile. (Der Datentür-Backstop
 * listet `insights` ohnehin nicht: der Layer ist ein SILO auf der
 * Single-Tenant-Instanz `branding`, seine Tabellen tragen kein `communityId`.
 * Die Ausnahme wäre also gar nicht nötig — der Ort bleibt trotzdem derselbe,
 * damit die Sweeps dieses Projekts an derselben Stelle stehen.)
 *
 * Der Admin-Client wird ohne Event gebaut (`createAdminClient()`),
 * `useRuntimeConfig()` ebenso — CLAUDE.md nennt Sweeps ausdrücklich als
 * erlaubt ausserhalb der Datentür.
 *
 * ── LOGZEILEN OHNE INHALT ────────────────────────────────────────────────
 * `insights.corrections_swept` trägt ZAHLEN. Keine Adresse, kein Ziel, kein
 * Grund — die Felder, die dieser Sweep gerade leert, gehören nicht in ein
 * Log, das sie überlebt. Die Zeilen-Id im FEHLER-Fall ist die Ausnahme: sie
 * ist die einzige Angabe, mit der ein Betreiber eine hängende Zeile
 * wiederfindet.
 */

/**
 * Wie viele Zeilen ein Lauf höchstens anfasst.
 *
 * Explizit, weil Appwrites Vorgabe 25 ist und eine Liste, die still bei 25
 * endet, wie ein leeres Ende aussieht. 200 ist reichlich für eine Tabelle,
 * die in Monaten altert: fällig wird an einem Tag nur, was vor genau einem
 * Jahr an EINEM Tag entstanden ist. Was übrig bleibt, nimmt der nächste
 * Lauf — der Filter ist das Datum, und das rückt nicht weg.
 */
const SWEEP_BATCH = 200

let sweepRunning = false

export interface InsightsCorrectionsSweepResult {
  /** Wie viele Zeilen die Abfrage geliefert hat. */
  checked: number
  /** Wie viele davon geleert wurden (die pure Regel entscheidet). */
  cleared: number
  /** Wie viele Schreibversuche fehlgeschlagen sind — fail-soft, aber gezählt. */
  errors: number
}

/**
 * Einen Durchgang fahren. `now` ist ein Argument, damit der Takt keine zweite
 * Zeitquelle hat und ein Test die Uhr stellen kann.
 */
export async function runInsightsCorrectionsSweep(
  now: Date = new Date(),
): Promise<InsightsCorrectionsSweepResult> {
  const result: InsightsCorrectionsSweepResult = { checked: 0, cleared: 0, errors: 0 }
  if (sweepRunning) return result
  sweepRunning = true

  try {
    const { tablesDB } = createAdminClient()
    const databaseId = useRuntimeConfig().public.appwriteDatabaseId

    const listed = await tablesDB.listRows<InsightsCorrectionRow>({
      databaseId,
      tableId: INSIGHTS_CORRECTIONS_TABLE,
      queries: [
        Query.lessThanEqual('retentionAt', now.toISOString()),
        // Älteste zuerst: liegt je mehr an, als ein Stapel fasst, arbeitet
        // sich der Sweep garantiert vorwärts, statt immer denselben
        // Ausschnitt zu sehen.
        Query.orderAsc('retentionAt'),
        Query.limit(SWEEP_BATCH),
      ],
    }).catch(() => null)

    // FAIL-SOFT UND STILL: auf einer Instanz OHNE die insights-Migrationen
    // gibt es die Tabelle nicht, und der Layer kann trotzdem einkompiliert
    // sein (der Playground ist genau so). Ein täglicher Fehler-Stapel wäre
    // dort kein Hinweis, sondern Rauschen.
    if (!listed) return result

    result.checked = listed.rows.length

    for (const row of listed.rows) {
      // Die pure Regel bleibt als Netz HINTER der Abfrage stehen — und sie
      // ist zugleich der Grund, warum eine schon geleerte Zeile keinen
      // zweiten Schreibvorgang bekommt.
      if (!insightsCorrectionSweepDue(row, now)) continue
      try {
        await tablesDB.updateRow({
          databaseId,
          tableId: INSIGHTS_CORRECTIONS_TABLE,
          rowId: row.$id,
          // `retentionAt` geht MIT auf null (s. Kopf „Die Frist geht mit")
          // — sonst bleibt die geleerte Zeile fällig und füllt jeden Batch.
          data: { contactEmail: '', ipHash: '', retentionAt: null },
        })
        result.cleared += 1
      }
      catch (error) {
        result.errors += 1
        logEvent('warn', 'insights.corrections_sweep_failed', {
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
