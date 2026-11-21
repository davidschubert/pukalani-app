import { ID, Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { TICKETS_TABLE, TICKET_LISTS_TABLE, type TicketLabel, type TicketListRow, type TicketRow } from '../../shared/types/ticket'
import {
  dependencyTicketDescription,
  dependencyTicketKey,
  dependencyTicketTitle,
  type DependencyTicketInput,
} from '../../shared/dependencyTicket'
import type { TicketOrigin } from '../../shared/ticketOrigin'

/**
 * „Prüfen, ob wir updaten können" — Ticket aus einer VERALTETEN Abhängigkeit
 * (Systemseite /dashboard/system, npm-Paket oder Appwrite-Serverversion).
 * Der tickets-Layer kennt admin genauso wenig wie feedback: die Frage kommt
 * über den core-Vertrag `registerDependencyTicketCreator` herein (A14), Titel
 * und Text stehen pur in shared/dependencyTicket.ts.
 *
 * DEDUP ÜBER `feedbackId` — und das ist kein Missbrauch der Spalte: sie ist die
 * generische „externe Referenz + Doppel-Anlage-Sperre" dieses Boards (der Name
 * stammt vom ersten, inzwischen entfernten Weg „Rückmeldung wird Ticket").
 * Kollidieren kann nichts, weil unsere Schlüssel das Präfix `dep:` tragen, eine
 * Appwrite-Row-Id aber nie ein `:` enthält.
 */
export async function createTicketFromDependency(event: H3Event, input: DependencyTicketInput): Promise<TicketRow> {
  const user = requirePermission(event, 'tickets.manage')
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const key = dependencyTicketKey(input)
  const existing = await tablesDB.listRows<TicketRow>({
    databaseId, tableId: TICKETS_TABLE,
    queries: [Query.equal('feedbackId', key), Query.limit(1)],
  }).catch((error) => {
    throw toH3Error(error, 'Could not check existing tickets')
  })
  if (existing.total > 0) {
    // Fachlicher Grund als `data.code` — der zentrale Fehler-Handler hebt ihn
    // als `reason` ins Envelope, der Knopf zeigt dann einen Hinweis statt
    // eines roten Fehlers (CLAUDE.md, core/server/error.ts).
    throw createError({ status: 409, statusText: 'Ticket already exists', data: { code: 'ticket_exists' } })
  }

  const lists = await tablesDB.listRows<TicketListRow>({
    databaseId, tableId: TICKET_LISTS_TABLE,
    queries: [Query.orderAsc('position'), Query.limit(1)],
  })
  const inbox = lists.rows[0]
  if (!inbox) {
    throw createError({ status: 400, statusText: 'Board has no lists' })
  }

  const position = await nextTicketPosition(tablesDB, databaseId, TICKETS_TABLE, inbox.$id)

  return await tablesDB.createRow<TicketRow>({
    databaseId, tableId: TICKETS_TABLE, rowId: ID.unique(),
    data: {
      listId: inbox.$id,
      title: dependencyTicketTitle(input),
      description: dependencyTicketDescription(input),
      // 'other': ein Update ist weder Idee noch Fehler. Priorität und Aufwand
      // bleiben leer — genau das soll die Prüfung ja erst beantworten.
      label: 'other' satisfies TicketLabel,
      priority: '',
      effort: '',
      startAt: null,
      dueAt: null,
      checklist: '',
      membersJson: '',
      status: 'open',
      doneAt: null,
      dueRemindedAt: null,
      position,
      feedbackId: key,
      // Maschinell erzeugt, kein Betreiber hat den Text geschrieben (SEC-038).
      origin: 'dependency' satisfies TicketOrigin,
      createdBy: user.$id,
      createdByName: user.name ?? '',
    },
  }).catch((error) => {
    throw toH3Error(error, 'Could not create ticket for dependency update')
  })
}
