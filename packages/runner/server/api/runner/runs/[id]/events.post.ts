import { ID, Query } from 'node-appwrite'
import { runEventsSchema } from '../../../../../schemas/run'
import { runTransitionAllowed } from '../../../../../shared/runGuards'
import { RUNS_TABLE, RUN_EVENTS_TABLE, type EventsAckResponse, type RunEventRow, type RunRow } from '../../../../../shared/types/runner'

/**
 * Fortschritt melden — docs/archiv/AI-RUNNER.md § 5/§ 7.2 Schritt 6.
 *
 * GEBÜNDELT, nicht je Zeile: der Runner verdichtet `stream-json` auf
 * Statuszeilen, Werkzeugaufrufe und Fehler und schickt alle 2 s oder alle 20
 * Zeilen. Das volle Transkript geht am Ende als DATEI in den eigenen Bucket
 * (`transcript.post.ts`), nie hierhin.
 *
 * Die ANTWORT ist der Rückkanal für „Abbrechen" (§ 9): der Runner erfährt hier
 * — und nur hier —, dass das Board seinen Lauf gestoppt hat.
 */
export default defineEventHandler(async (event): Promise<EventsAckResponse> => {
  const caller = await requireRunner(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const body = await readValidatedBody(event, runEventsSchema.parse)

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const run = await tablesDB.getRow<RunRow>({ databaseId, tableId: RUNS_TABLE, rowId: id }).catch((error) => {
    throw toH3Error(error, 'Could not load run')
  })
  requireOwnRun(caller.$id, run.runnerId)

  /**
   * ERST-WERT-REGEL (§ 7.2 Schritt 1): `sessionId` und `workBranch` werden
   * gestempelt, solange die Spalte leer ist — danach NIE überschrieben. Die
   * Session-Id ist der Schlüssel für `--resume`; würde ein späteres Bündel sie
   * ersetzen (etwa nach einem Neustart des Runners mit frischer UUID), zeigte
   * das Ticket auf eine Sitzung, die nichts von dieser Arbeit weiss.
   */
  const stamps: Record<string, string> = {}
  if (body.sessionId && !run.sessionId) stamps.sessionId = body.sessionId
  if (body.workBranch && !run.workBranch) stamps.workBranch = body.workBranch

  /**
   * `claimed → running` beim ersten Lebenszeichen — der Runner meldet den
   * Start nicht getrennt. Nur aus `claimed`: ein Lauf, den das Board
   * inzwischen abgebrochen hat, wird davon nicht wiederbelebt (die
   * Zustandstabelle sagt es, § 4).
   */
  const lift = runTransitionAllowed(run.status, 'running', 'runner')
  const status = lift ? 'running' : run.status

  if (lift || Object.keys(stamps).length) {
    await tablesDB.updateRow<RunRow>({
      databaseId, tableId: RUNS_TABLE, rowId: id,
      data: {
        ...stamps,
        ...(lift ? { status: 'running', startedAt: run.startedAt ?? new Date().toISOString() } : {}),
      },
    }).catch((error) => {
      throw toH3Error(error, 'Could not update run')
    })
  }

  /**
   * RETRY-DEDUPE. Ein Bündel, dessen Antwort im Netz verloren ging, wird vom
   * Runner erneut geschickt — er weiss ja nicht, ob es ankam. Ohne diesen
   * Filter stünde die halbe Zeitleiste doppelt da. Gemessen wird am höchsten
   * bereits gespeicherten `seq` (der Runner zählt monoton, § 4): alles bis
   * dahin ist gesehen und wird still verworfen, nicht abgelehnt — ein 409 auf
   * einen Wiederholungsversuch wäre für den Runner nicht von einem echten
   * Fehler zu unterscheiden.
   */
  const seen = await tablesDB.listRows<RunEventRow>({
    databaseId, tableId: RUN_EVENTS_TABLE,
    queries: [Query.equal('runId', id), Query.orderDesc('seq'), Query.limit(1)],
  }).catch((error) => {
    throw toH3Error(error, 'Could not read event log')
  })
  let highest = seen.rows[0]?.seq ?? -1

  let accepted = 0
  // Aufsteigend, damit `highest` innerhalb EINES Bündels mitwandert und ein
  // doppelter `seq` im selben Rumpf ebenfalls fällt.
  for (const entry of [...body.events].sort((a, b) => a.seq - b.seq)) {
    if (entry.seq <= highest) continue
    await tablesDB.createRow<RunEventRow>({
      databaseId, tableId: RUN_EVENTS_TABLE, rowId: ID.unique(),
      data: { runId: id, seq: entry.seq, kind: entry.kind, message: entry.message, at: entry.at },
    }).catch((error) => {
      throw toH3Error(error, 'Could not store event')
    })
    highest = entry.seq
    accepted++
  }

  return { status, accepted }
})
