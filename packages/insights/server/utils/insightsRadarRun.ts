import type { H3Event } from 'h3'
import type { RunLeaseRow, RunLeaseStore } from '../../../core/server/utils/runLease'
import { INSIGHTS_RUNS_TABLE } from '../../shared/insightsRows'
import { INSIGHTS_RADAR_RUN_OUTCOMES, toInsightsRadarRunDetail } from '../../shared/insightsRadarRun'
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
 * ── DER NÄCHTLICHE LAUF ─────────────────────────────────────────────────
 * Der Sweep hält zusätzlich ein Modul-Flag gegen den Parallel-Lauf im selben
 * Prozess. Läuft gerade der nächtliche Lauf, antwortet er `skipped:
 * 'running'` — das ist ein beendeter Knopf-Lauf mit genau diesem Grund im
 * Ergebnis, kein Fehler.
 *
 * ── DER `event` ─────────────────────────────────────────────────────────
 * Reist mit und wird nur LESEND benutzt (Runtime-Config, Admin-Client) —
 * dasselbe gilt beim Marktvergleich; in die Antwort schreibt niemand mehr.
 */

/** Der Store über `insights_runs` für den Radar. */
export function insightsRadarRunStore(event: H3Event): RunLeaseStore {
  const { tablesDB, databaseId } = insightsDb(event)
  return appwriteRunLeaseStore({ tablesDB, databaseId, tableId: INSIGHTS_RUNS_TABLE })
}

export async function runInsightsRadarInBackground(
  event: H3Event,
  input: { store: RunLeaseStore, lease: Pick<RunLeaseRow, '$id'> },
): Promise<void> {
  const { store, lease } = input
  const alive = keepRunLeaseAlive(store, lease)
  let outcome: string = INSIGHTS_RADAR_RUN_OUTCOMES.done
  let detail: unknown
  try {
    const result = await runInsightsRadarSweep({ event, stop: () => alive.lost() })
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
}
