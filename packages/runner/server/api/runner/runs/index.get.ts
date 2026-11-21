import { Query } from 'node-appwrite'
import { RUNS_TABLE, type RunRow, type RunsListResponse } from '../../../../shared/types/runner'

/**
 * Die Läufe EINES Subjekts, neueste zuerst — docs/archiv/AI-RUNNER.md § 5.
 *
 * Beide Parameter sind Pflicht und bewusst nicht optional: eine Liste „alle
 * Läufe" braucht im Ticket-Modal niemand, und ohne Filter wäre der Default
 * ein pool-weiter Abzug aller Repo-Schlüssel und Kostendaten.
 */
export default defineEventHandler(async (event): Promise<RunsListResponse> => {
  requirePermission(event, 'runner.manage')

  const query = getQuery(event)
  const subjectType = typeof query.subjectType === 'string' ? query.subjectType : ''
  const subjectId = typeof query.subjectId === 'string' ? query.subjectId : ''
  if (!subjectType || !subjectId) {
    throw createError({ status: 400, statusText: 'Missing subjectType or subjectId' })
  }

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)

  const runs = await tablesDB.listRows<RunRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: RUNS_TABLE,
    // Limit IMMER explizit (CLAUDE.md) — der Default wäre 25, aber das soll
    // hier stehen und nicht geraten werden.
    queries: [
      Query.equal('subjectType', subjectType),
      Query.equal('subjectId', subjectId),
      Query.orderDesc('$createdAt'),
      Query.limit(25),
    ],
  }).catch((error) => {
    throw toH3Error(error, 'Could not load runs')
  })

  return { runs: runs.rows }
})
