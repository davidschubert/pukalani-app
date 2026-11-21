import { parseRunAttachments } from '../../../../../shared/runAttachments'
import { RUNS_TABLE, type RunAttachmentsResponse, type RunRow } from '../../../../../shared/types/runner'

/**
 * Die Anhänge eines Laufs — docs/archiv/AI-RUNNER.md § 6, RUNNER-Seite
 * (Bearer-Secret, kein Session-Cookie).
 *
 * Der Runner fragt sie EINMAL nach dem Claim und legt sie in
 * `<state>/<runId>/files/` ab (§ 7.2 Schritt 4). Genau deshalb darf die Liste
 * sich danach nicht mehr ändern — sie ist mit `queue` versiegelt.
 *
 * Nur der EIGENE Lauf (`requireOwnRun`): ein Runner sieht die Anhänge fremder
 * Aufträge nicht, auch nicht durch Raten einer Row-Id.
 */
export default defineEventHandler(async (event): Promise<RunAttachmentsResponse> => {
  const caller = await requireRunner(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)

  const run = await tablesDB.getRow<RunRow>({
    databaseId: config.public.appwriteDatabaseId, tableId: RUNS_TABLE, rowId: id,
  }).catch((error) => {
    throw toH3Error(error, 'Could not load run')
  })
  requireOwnRun(caller.$id, run.runnerId)

  return { attachments: parseRunAttachments(run.attachmentsJson) }
})
