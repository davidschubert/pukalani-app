import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { EVENT_RSVPS_TABLE, EVENTS_TABLE } from '../../shared/types/event'

/**
 * `attendeeCount` aus den Zusagen NACHZÄHLEN (BE-018) — der Rettungsweg, wenn
 * ein Zurückrollen des Zählers scheitert und Zusagen und Zähler sonst
 * auseinanderliefen.
 *
 * Gezählt wird die WAHRHEIT: die `going`-Zusagen dieses Termins. `count` der
 * Datentür liest nur `total`, überträgt also keine Zeilen.
 *
 * WER HANDELT (F17): KEIN `actor` — ein abgeleiteter Zähler, kein Inhalt
 * (dieselbe Begründung wie `syncLessonCount` in courses). Unter der M13-Sperre
 * stünde eine gesperrte Community sonst mit einer falschen Zahl da.
 *
 * BEST-EFFORT: ein Fehler wird geloggt, nie geworfen — der Aufrufer antwortet
 * mit seinem eigenen Fehler weiter. Kein atomarer Schritt: eine gleichzeitige
 * Zusage zwischen Zählen und Schreiben kann die Zahl um eins verfehlen; das
 * ist kleiner als der Drift, den der Weg verhindert.
 */
export async function recountAttendeeCount(event: H3Event, eventId: string): Promise<void> {
  try {
    const db = tenantDb(event, { as: 'operator' })
    const going = await db.count(EVENT_RSVPS_TABLE, [
      Query.equal('eventId', eventId),
      Query.equal('status', 'going'),
    ])
    await db.update(EVENTS_TABLE, eventId, { attendeeCount: going }, 'Event not found')
  }
  catch {
    logEvent('error', 'events.attendee_recount_failed', { eventId })
  }
}
