import { Query } from 'node-appwrite'
import { RUN_EVENTS_TABLE, type RunEventRow, type RunEventsListResponse } from '../../../../../shared/types/runner'

/**
 * Die Zeitleiste eines Laufs — docs/archiv/AI-RUNNER.md § 9, Board-Seite.
 *
 * DER ERSTE STAND, nicht der laufende: danach übernimmt Realtime (`run_events`
 * trägt Table-Read für `admin`, § 4). Beides zusammen, weil eins allein nicht
 * reicht — wer ein Fenster mitten im Lauf öffnet, sähe per Realtime nur die
 * Zeilen NACH dem Öffnen; wer nur diese Route pollt, hätte die Live-Anzeige,
 * für die § 4 die Tabelle überhaupt anlegt.
 *
 * Sortiert nach `seq`, NICHT nach `$createdAt`: die Ereignisse kommen
 * GEBÜNDELT an (§ 7.2 Schritt 6) — innerhalb eines Bündels haben sie
 * praktisch denselben Anlege-Zeitstempel, und ihre Reihenfolge steckt allein
 * im Zähler des Runners.
 *
 * 200 Zeilen: ein verdichteter Lauf bleibt darunter (der Runner schickt
 * Statuszeilen, Werkzeugaufrufe und Fehler, nicht das `stream-json`). Wer mehr
 * hat, hat einen Lauf, dessen Protokoll ohnehin ins Transkript gehört.
 */
export default defineEventHandler(async (event): Promise<RunEventsListResponse> => {
  requirePermission(event, 'runner.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)

  const events = await tablesDB.listRows<RunEventRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: RUN_EVENTS_TABLE,
    queries: [Query.equal('runId', id), Query.orderAsc('seq'), Query.limit(200)],
  }).catch((error) => {
    throw toH3Error(error, 'Could not load run events')
  })

  return { events: events.rows }
})
