import { Query } from 'node-appwrite'
import { INTERACTIVE_SESSION_END_MARKER, RUNS_TABLE, RUN_EVENTS_TABLE, type RunEventRow, type RunRow, type SessionEndStateResponse } from '../../../../../shared/types/runner'

/**
 * Der POLL eines interaktiven Laufs — docs/archiv/AI-RUNNER.md § 7.3.
 *
 * Der Daemon fragt hier, während das Terminal im Vordergrund läuft: „ist die
 * Sitzung vorbei?". `ended` liest er an der Ende-Markierung, die der
 * SessionEnd-Hook über `POST …/session-end` hinterlegt hat; `status` deckt
 * zusätzlich einen Board-Abbruch (`cancelled`) auf, den ein interaktiver Lauf
 * sonst nirgends erführe. `seq` ist die Sequenz der Markierung — der Runner
 * richtet daran seinen Ereigniszähler aus, bevor er den Abschluss meldet.
 */
export default defineEventHandler(async (event): Promise<SessionEndStateResponse> => {
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

  // Dieselbe Suche wie beim Schreiben (session-end.post): die jüngsten
  // Ereignisse lesen und die Markierung darin suchen — `message` trägt keinen
  // Index, ein `Query.equal` darauf würfe.
  const recent = await tablesDB.listRows<RunEventRow>({
    databaseId, tableId: RUN_EVENTS_TABLE,
    queries: [Query.equal('runId', id), Query.orderDesc('seq'), Query.limit(50)],
  }).catch((error) => {
    throw toH3Error(error, 'Could not read event log')
  })

  const marker = recent.rows.find(row => row.message === INTERACTIVE_SESSION_END_MARKER)
  return { ended: Boolean(marker), status: run.status, seq: marker?.seq ?? -1 }
})
