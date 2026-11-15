import { Query } from 'node-appwrite'
import { TICKETS_TABLE, TICKET_LISTS_TABLE, type TicketRow } from '../../../../shared/types/ticket'
import { requireTicketCleanup } from '../../../utils/ticketCleanup'

/**
 * Liste MITSAMT ihrer Karten löschen — das UI bestätigt IMMER vorher und
 * nennt die Kartenzahl (Entscheidung 2026-07-08: kein 409-Schutz mehr;
 * wer Karten behalten will, verschiebt sie vorher).
 *
 * JEDE KARTE RÄUMT AUF WIE EINE EINZELNE LÖSCHUNG (BE-024, 2026-11-15):
 * vorher fielen hier nur die Karten-Zeilen, Anhänge (Bucket + Zeile) und
 * Beobachtungen blieben unerreichbar liegen. Jetzt läuft je Karte dieselbe
 * Aufräumung wie bei `DELETE /api/tickets/:id` (`requireTicketCleanup`), erst
 * danach fällt die Karte. Beim ERSTEN Fehler hört die Route auf und antwortet
 * 502 `ticket_cleanup_incomplete`: die Karten, die bis dahin gelöscht sind,
 * BLEIBEN gelöscht (sie waren vollständig aufgeräumt), die übrigen und die
 * Liste bleiben stehen. Ein zweiter Versuch macht genau dort weiter — jeder
 * Schritt ist idempotent.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'tickets.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const { tablesDB } = admin
  const databaseId = config.public.appwriteDatabaseId

  const cards = await listAllRows<TicketRow>(tablesDB, databaseId, TICKETS_TABLE, [Query.equal('listId', id)])
    .catch((error) => {
      throw toH3Error(error, 'Could not load list cards')
    })
  let files = 0
  let watchers = 0
  for (const card of cards) {
    const cleanup = await requireTicketCleanup(admin, databaseId, card.$id)
    files += cleanup.files
    watchers += cleanup.watchers
    await tablesDB.deleteRow({ databaseId, tableId: TICKETS_TABLE, rowId: card.$id }).catch((error) => {
      throw toH3Error(error, 'Could not delete list cards')
    })
  }

  await tablesDB.deleteRow({ databaseId, tableId: TICKET_LISTS_TABLE, rowId: id }).catch((error) => {
    throw toH3Error(error, 'Could not delete list')
  })

  return { ok: true, deletedCards: cards.length, files, watchers }
})
