import { Query } from 'node-appwrite'
import { runTransitionAllowed } from '../../../../shared/runGuards'
import { RUNS_TABLE, type ClaimResponse, type RunRow } from '../../../../shared/types/runner'

/**
 * „Hast du was für mich?" — docs/archiv/AI-RUNNER.md § 5, Runner-Seite.
 *
 * Der Kern der Naht: der Rechner ZIEHT sich Arbeit, sie wird ihm nie
 * zugeschoben (§ 3.2 — Polling statt Realtime, weil ein Hintergrunddienst
 * Standby, Netzwechsel und VPN überleben soll). `{ run: null }` ist der
 * Normalfall und kein Fehler.
 *
 * Der ganze Handler läuft im Claim-Mutex (server/utils/claimMutex.ts, dort
 * steht die Annahme, auf der er ruht): Appwrite kann kein Compare-and-swap,
 * also serialisiert ein In-Prozess-Mutex das Lesen-und-Setzen.
 */
export default defineEventHandler(async (event): Promise<ClaimResponse> => {
  const caller = await requireRunner(event)

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  return await withClaimMutex(async () => {
    const queued = await tablesDB.listRows<RunRow>({
      databaseId, tableId: RUNS_TABLE,
      queries: [
        Query.equal('status', 'queued'),
        // Array = ODER: ein freier Lauf ('') oder einer, der ausdrücklich auf
        // DIESEN Rechner wartet. Ein Runner kann sich damit keinen fremden
        // Auftrag greifen, auch nicht durch Raten einer Row-Id — er kann gar
        // keine Id nennen.
        Query.equal('runnerId', ['', caller.$id]),
        // Älteste zuerst: die Schlange ist eine Schlange, kein Stapel.
        Query.orderAsc('$createdAt'),
        Query.limit(1),
      ],
    }).catch((error) => {
      throw toH3Error(error, 'Could not load queue')
    })

    const run = queued.rows[0]
    if (!run) return { run: null }

    // Die Tabelle aus § 4 auch hier, statt eines stillen `status = 'claimed'`:
    // sollte die Abfrage je etwas anderes als `queued` liefern (geänderter
    // Index, geänderter Filter), gibt es lieber nichts zu tun als einen
    // zweiten Runner auf einem laufenden Auftrag.
    if (!runTransitionAllowed(run.status, 'claimed', 'runner')) return { run: null }

    const claimed = await tablesDB.updateRow<RunRow>({
      databaseId, tableId: RUNS_TABLE, rowId: run.$id,
      data: {
        status: 'claimed',
        claimedAt: new Date().toISOString(),
        // Auch bei einem freien Lauf ('') — ab jetzt gehört er diesem
        // Rechner, und `requireOwnRun` misst genau daran.
        runnerId: caller.$id,
      },
    }).catch((error) => {
      throw toH3Error(error, 'Could not claim run')
    })

    return { run: claimed }
  })
})
