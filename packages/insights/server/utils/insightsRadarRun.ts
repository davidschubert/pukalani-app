import type { H3Event } from 'h3'
import type { RunLeaseRow, RunLeaseStore } from '../../../core/server/utils/runLease'
import { INSIGHTS_RUNS_TABLE } from '../../shared/insightsRows'
import {
  INSIGHTS_RADAR_RUN_OUTCOMES,
  INSIGHTS_RADAR_RUN_SCOPE,
  INSIGHTS_RADAR_RUN_SUBJECT,
  toInsightsRadarRunDetail,
} from '../../shared/insightsRadarRun'
import type { InsightsRadarSweepResult } from './insightsRadarSweep'
import { runInsightsRadarSweep } from './insightsRadarSweep'
import { insightsDb } from './insightsStore'

/**
 * DER KNOPF-LAUF DES RADARS HINTER DER ANTWORT (LL1 a, 2026-11-17) — die
 * Arbeit, die bis dahin in `POST /api/insights/radar/run` selbst stand.
 *
 * ── WAS ER TUT ──────────────────────────────────────────────────────────
 * Denselben Lauf wie nachts (`runInsightsRadarSweep`), OHNE Frist — die gab
 * es nur, solange die Anfrage auf das Ergebnis wartete. Daneben schreibt ein
 * Herzschlag alle 20 s in die Lauf-Zeile; am Ende steht dort `done` mit den
 * Zahlen im `detail` (`shared/insightsRadarRun.ts`), bei einem geworfenen
 * Fehler `failed` und die Diagnose im Log (nur Kennungen).
 *
 * ── WENN DER HERZSCHLAG VERLOREN GEHT ───────────────────────────────────
 * Nach drei verpassten Schlägen meldet `lost()` true — die Zeile sieht dann
 * bald abgebrochen aus, und ein anderer Prozess darf einen neuen Lauf
 * starten. Der Sweep fragt dafür vor jedem neuen Abruf seinen Haken `stop`
 * und beginnt keinen mehr; was geholt war, schreibt er, und das Ergebnis
 * trägt `partial`.
 *
 * ── DER NÄCHTLICHE LAUF NIMMT DIESELBE SPERRE (LL1 c, 2026-11-17) ──────
 * Bis hierher schloss ihn nur ein Merker im Prozess aus — das trug, solange
 * die App mit EINEM Prozess lief. Jetzt nimmt der Zeit-Lauf dieselbe Zeile
 * (Art `radar`, fester Gegenstand) wie der Knopf (`runInsightsRadarTimed`):
 * läuft schon ein Lauf, überspringt er diesen Takt (`skipped: 'running'`,
 * kein Fehler), und während ER läuft, bekommt der Knopf den gewohnten
 * `409 run_running`. Der Merker im Sweep bleibt als zweites Netz im Prozess.
 *
 * ── DER `event` ─────────────────────────────────────────────────────────
 * Reist beim Knopf mit und wird nur LESEND benutzt (Runtime-Config,
 * Admin-Client) — dasselbe gilt beim Marktvergleich; in die Antwort schreibt
 * niemand mehr. Der Zeit-Lauf hat keinen und baut dieselben Helfer ohne
 * (wie `messages/server/utils/reportEvidenceSweep.ts`).
 */

/** Der Store über `insights_runs` für den Radar — mit Event (Knopf) oder ohne (Zeit-Lauf). */
export function insightsRadarRunStore(event?: H3Event): RunLeaseStore {
  const { tablesDB, databaseId } = event
    ? insightsDb(event)
    : { tablesDB: createAdminClient().tablesDB, databaseId: useRuntimeConfig().public.appwriteDatabaseId }
  return appwriteRunLeaseStore({ tablesDB, databaseId, tableId: INSIGHTS_RUNS_TABLE })
}

/**
 * Den Lauf unter einer schon genommenen Sperre fahren: Herzschlag, Sweep mit
 * Halt-Haken, Ende an der Zeile. Wirft nie; `failed` heisst, der Sweep hat
 * geworfen (dann ohne Zahlen an der Zeile).
 */
async function runInsightsRadarUnderLease(
  event: H3Event | undefined,
  input: { store: RunLeaseStore, lease: Pick<RunLeaseRow, '$id'> },
): Promise<{ result: InsightsRadarSweepResult | null }> {
  const { store, lease } = input
  const alive = keepRunLeaseAlive(store, lease)
  let outcome: string = INSIGHTS_RADAR_RUN_OUTCOMES.done
  let detail: unknown
  let result: InsightsRadarSweepResult | null = null
  try {
    result = await runInsightsRadarSweep({ ...(event ? { event } : {}), stop: () => alive.lost() })
    detail = toInsightsRadarRunDetail(result)
    if (alive.lost()) logEvent('warn', 'insights.radar_run_lease_lost', { partial: result.partial === true })
  }
  catch (error) {
    outcome = INSIGHTS_RADAR_RUN_OUTCOMES.failed
    logEvent('warn', 'insights.radar_run_failed', { error: error instanceof Error ? error.name : 'unknown' })
  }
  finally {
    alive.stop()
  }

  try {
    await finishRunLease(store, lease, { outcome, ...(detail !== undefined ? { detail } : {}) })
  }
  catch (error) {
    // Die Zeile bleibt offen und gilt nach der Frist als abgebrochen — der
    // Knopf ist dann von selbst wieder frei.
    logEvent('warn', 'insights.radar_run_unfinished', { error: error instanceof Error ? error.name : 'unknown' })
  }
  return { result }
}

export async function runInsightsRadarInBackground(
  event: H3Event,
  input: { store: RunLeaseStore, lease: Pick<RunLeaseRow, '$id'> },
): Promise<void> {
  await runInsightsRadarUnderLease(event, input)
}

/** Der HTTP-Status eines geworfenen Fehlers (h3 `statusCode`, Appwrite `code`). */
function errorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null
  const value = (error as { statusCode?: unknown, status?: unknown, code?: unknown })
  for (const candidate of [value.statusCode, value.status, value.code]) {
    if (typeof candidate === 'number') return candidate
  }
  return null
}

const EMPTY_RESULT: InsightsRadarSweepResult = {
  channels: 0, videos: 0, upserted: 0, deleted: 0, tooOld: 0, errors: 0, quotaUnits: 0,
}

/**
 * DER NÄCHTLICHE LAUF UNTER DER SPERRE (LL1 c) — gerufen vom Zeit-Lauf
 * `insights-radar` (`server/plugins/radar-sweep.ts`).
 *
 * Reihenfolge:
 *  1. OHNE SCHLÜSSEL keine Sperre: der Sweep tut dann nichts und meldet das
 *     einmal je Prozess. Eine Lauf-Zeile je Nacht mit „kein Schlüssel" wäre
 *     nur Lärm in der Anzeige des letzten Laufs.
 *  2. GIBT ES DIE LAUF-TABELLE NICHT (404, Instanz ohne insights-012), läuft
 *     der Sweep wie vor LL1 c ohne Sperre — dann gibt es auch keinen
 *     Knopf-Lauf (der Knopf antwortet dort 503), und der Merker im Prozess
 *     schliesst den Rest aus. Jeder ANDERE Lesefehler wirft: „nicht prüfbar"
 *     heisst nie „frei", und `defineTimedJob` meldet den Takt als `failed`.
 *  3. SPERRE — 409 heisst „ein Lauf ist unterwegs" ⇒ `skipped: 'running'`.
 *  4. Lauf mit Herzschlag und Halt-Haken, Ende und Zahlen an der Zeile. Ein
 *     geworfener Sweep steht als `failed` an der Zeile und wirft hier weiter,
 *     damit der Takt als gescheitert zählt.
 */
export async function runInsightsRadarTimed(
  deps: { store?: RunLeaseStore } = {},
): Promise<InsightsRadarSweepResult> {
  if (!useRuntimeConfig().insightsYoutubeKey) return await runInsightsRadarSweep()

  const store = deps.store ?? insightsRadarRunStore()
  try {
    await store.latest(INSIGHTS_RADAR_RUN_SCOPE, INSIGHTS_RADAR_RUN_SUBJECT)
  }
  catch (error) {
    if (errorStatus(error) !== 404) throw error
    logEvent('warn', 'insights.radar_run_table_missing', {})
    return await runInsightsRadarSweep()
  }

  let lease: RunLeaseRow
  try {
    ({ lease } = await acquireRunLease(store, {
      scope: INSIGHTS_RADAR_RUN_SCOPE,
      subject: INSIGHTS_RADAR_RUN_SUBJECT,
    }))
  }
  catch (error) {
    if (errorStatus(error) === 409) return { ...EMPTY_RESULT, skipped: 'running' }
    throw error
  }

  const { result } = await runInsightsRadarUnderLease(undefined, { store, lease })
  if (!result) throw new Error('insights radar sweep failed')
  return result
}
