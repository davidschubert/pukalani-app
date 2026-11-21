import { ID, Query } from 'node-appwrite'
import { INTERACTIVE_SESSION_END_MARKER, RUNS_TABLE, RUN_EVENTS_TABLE, type RunEventRow, type RunRow, type SessionEndReportResponse } from '../../../../../shared/types/runner'

/**
 * Der RÜCKKANAL eines interaktiven Laufs — docs/archiv/AI-RUNNER.md § 7.3.
 *
 * Ein interaktiver Lauf läuft in Terminal.app im Vordergrund; kein
 * Elternprozess liest seinen Ausgang mit. Deshalb meldet ein SessionEnd-Hook
 * das Ende SELBST hierher (mit dem Bearer-Secret des Runners aus dessen
 * Config-Datei — nie über die Board-Session). Die Route legt GENAU die eine
 * Ende-Markierung in `run_events` ab: sie macht das Ende in der Zeitleiste
 * sichtbar UND ist der migrationsfreie Speicher, an dem der Daemon-Poll
 * (`GET …/session-end`) das Ende erkennt.
 *
 * SIE SCHLIESST DEN LAUF NICHT AB: Commit, Diffstat und Tests macht der Daemon
 * danach (§ 7.3, wie im headless Fall) — der Hook trägt nur die Nachricht.
 */
export default defineEventHandler(async (event): Promise<SessionEndReportResponse> => {
  const caller = await requireRunner(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const run = await tablesDB.getRow<RunRow>({ databaseId, tableId: RUNS_TABLE, rowId: id }).catch((error) => {
    throw toH3Error(error, 'Could not load run')
  })
  requireOwnRun(caller.$id, run.runnerId)

  // Nur ein interaktiver Lauf hat ein Sitzungs-Ende zu melden — ein headless
  // Lauf schließt über `finish`, nicht hierüber.
  if (!run.interactive) {
    throw createError({ status: 409, statusText: 'Run is not interactive', data: { code: 'not_interactive' } })
  }

  /**
   * Die jüngsten Ereignisse lesen — daraus zweierlei: der höchste `seq` (für
   * eine neue Markierung) UND ob die Markierung schon steht. BEWUSST kein
   * `Query.equal('message', …)`: `message` trägt keinen Index, eine Gleichheit
   * darauf wirft. Ein interaktiver Lauf hat wenige Ereignisse, 50 reichen also,
   * um die Markierung zu finden.
   */
  const recent = await tablesDB.listRows<RunEventRow>({
    databaseId, tableId: RUN_EVENTS_TABLE,
    queries: [Query.equal('runId', id), Query.orderDesc('seq'), Query.limit(50)],
  }).catch((error) => {
    throw toH3Error(error, 'Could not read event log')
  })

  // IDEMPOTENT: ein SessionEnd-Hook feuert einmal, aber ein verlorener
  // Antwort-Weg lässt ihn wiederholen — die Markierung darf nicht doppelt stehen.
  const existing = recent.rows.find(row => row.message === INTERACTIVE_SESSION_END_MARKER)
  if (existing) return { ok: true, seq: existing.seq }

  const seq = (recent.rows[0]?.seq ?? 0) + 1
  await tablesDB.createRow<RunEventRow>({
    databaseId, tableId: RUN_EVENTS_TABLE, rowId: ID.unique(),
    data: { runId: id, seq, kind: 'status', message: INTERACTIVE_SESSION_END_MARKER, at: new Date().toISOString() },
  }).catch((error) => {
    throw toH3Error(error, 'Could not store session end')
  })

  return { ok: true, seq }
})
