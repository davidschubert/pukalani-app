import type { H3Event } from 'h3'
import { eventIsPubliclyVisible } from '../../shared/eventModerationPolicy'
import { EVENTS_TABLE, type EventRow } from '../../shared/types/event'

/**
 * Einen Termin so lesen, wie das Publikum ihn liest (BE-017) — für die
 * Leserouten Detail, ICS und Übersetzen.
 *
 * ZWEI PRÜFUNGEN, NICHT EINE: das Leserecht der Zeile (Mitglieder-Klinke) UND
 * der Zustand (`published`/`cancelled`). Bis dahin entschied allein das
 * Leserecht; bleibt es nach einem halb gescheiterten Ausblenden stehen, war
 * ein `hidden`-Termin über die App lesbar. Alles andere bekommt dasselbe 404
 * wie eine unbekannte Id. Entwürfe trugen nie ein Leserecht — für sie ändert
 * sich nichts.
 */
export async function getPubliclyVisibleEvent(event: H3Event, id: string): Promise<EventRow> {
  const row = await tenantDb(event).get<EventRow>(EVENTS_TABLE, id, 'Event not found')
  if (!eventIsPubliclyVisible(row.status)) {
    throw createError({ status: 404, statusText: 'Event not found' })
  }
  return row
}
