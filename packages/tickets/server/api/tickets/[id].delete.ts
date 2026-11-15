import { TICKETS_TABLE } from '../../../shared/types/ticket'
import { requireTicketCleanup } from '../../utils/ticketCleanup'

/**
 * Ticket endgültig löschen (Zurückstellen = Verschieben, kein Delete) —
 * kaskadiert auf Watcher, Anhang-Metadaten und Storage-Dateien (P4).
 *
 * ERST AUFRÄUMEN, DANN DAS TICKET (BE-024, 2026-11-15): bleibt beim Aufräumen
 * etwas hängen (`failed > 0`) oder scheitert schon das Lesen, bleibt das
 * Ticket STEHEN und die Route antwortet 502 `ticket_cleanup_incomplete`.
 * Vorher wurden alle Fehler geschluckt und das Ticket trotzdem gelöscht —
 * zurück blieben Dateien im Bucket, die keine Oberfläche mehr erreicht. So
 * bleibt das Ticket der Griff, über den ein zweiter Versuch den Rest findet;
 * jeder Schritt ist idempotent (404 zählt als „schon weg").
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'tickets.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const cleanup = await requireTicketCleanup(admin, databaseId, id)

  await admin.tablesDB.deleteRow({
    databaseId,
    tableId: TICKETS_TABLE,
    rowId: id,
  }).catch((error) => {
    throw toH3Error(error, 'Could not delete ticket')
  })

  return { ok: true, files: cleanup.files, watchers: cleanup.watchers }
})

