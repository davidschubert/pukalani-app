import { Query } from 'node-appwrite'
import { toRunnerPublic } from '../../../../shared/runnerPublic'
import { RUNNERS_TABLE, type RunnerRow, type RunnersListResponse } from '../../../../shared/types/runner'

/**
 * Die registrierten Rechner — docs/archiv/AI-RUNNER.md § 5, Board-Seite.
 *
 * Gibt `RunnerPublic` zurück, nicht die Zeile: `secretHash` bleibt auf dem
 * Server (Begründung am Typ). Das ist die zweite Schicht — die erste ist,
 * dass die Tabelle nur `read(label:admin)` trägt.
 */
export default defineEventHandler(async (event): Promise<RunnersListResponse> => {
  requirePermission(event, 'runner.manage')

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)

  const runners = await tablesDB.listRows<RunnerRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: RUNNERS_TABLE,
    queries: [Query.orderAsc('name'), Query.limit(25)],
  }).catch((error) => {
    throw toH3Error(error, 'Could not load runners')
  })

  return { runners: runners.rows.map(toRunnerPublic) }
})
