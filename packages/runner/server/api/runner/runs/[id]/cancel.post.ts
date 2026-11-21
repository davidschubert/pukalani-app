import { isTerminalRunStatus, runTransitionAllowed } from '../../../../../shared/runGuards'
import { RUNS_TABLE, type RunRow } from '../../../../../shared/types/runner'

/**
 * „Abbrechen" vom Board — docs/archiv/AI-RUNNER.md § 4/§ 9.
 *
 * Wirkt in DREI Zuständen, auch VOR dem Claim (`queued`): der Knopf soll auch
 * dann etwas tun, wenn noch kein Rechner gefragt hat. Der laufende Prozess auf
 * dem Mac wird davon nicht angehalten — er ERFÄHRT den Abbruch bei seiner
 * nächsten Ereignis-Meldung (`events` antwortet mit dem Zustand, § 9) und hört
 * dann selbst auf. Ein Rückkanal in einen fremden Prozess existiert nicht,
 * und ihn zu erfinden wäre teurer als zwei Sekunden Nachlauf.
 */
export default defineEventHandler(async (event): Promise<RunRow> => {
  requirePermission(event, 'runner.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const run = await tablesDB.getRow<RunRow>({ databaseId, tableId: RUNS_TABLE, rowId: id }).catch((error) => {
    throw toH3Error(error, 'Could not load run')
  })

  if (!runTransitionAllowed(run.status, 'cancelled', 'board')) {
    // Fachlicher Grund statt „ging nicht": ein bereits beendeter Lauf ist kein
    // Fehler des Klickenden, sondern eine Nachricht (die Liste war veraltet).
    throw createError({ status: 409, statusText: 'Run cannot be cancelled', data: { code: 'not_cancellable' } })
  }

  return await tablesDB.updateRow<RunRow>({
    databaseId, tableId: RUNS_TABLE, rowId: id,
    data: {
      status: 'cancelled',
      // `cancelled` IST terminal — die Abfrage steht trotzdem hier, weil sie
      // die Regel benennt: ein Endzustand bekommt seine Endzeit, damit die
      // Dauer im Bericht nicht offen bleibt.
      ...(isTerminalRunStatus('cancelled') ? { finishedAt: new Date().toISOString() } : {}),
    },
  }).catch((error) => {
    throw toH3Error(error, 'Could not cancel run')
  })
})
