import type { EventRow } from './types/event'

/**
 * WAS DIE ZUSAGE ZURÜCKGIBT (SEC-031, seit 2026-11-13).
 *
 * `POST /api/events/:id/rsvp` schreibt über die Operator-Klinke (Zusagen und
 * Teilnehmerzahl tragen kein Schreibrecht für Konten) und gab bis dahin den
 * ganzen, frisch gelesenen Termin zurück — Beschreibung, Link, Ort, Adresse,
 * Ortshinweise, gelesen an den Row-Permissions vorbei. Die Oberfläche braucht
 * danach nur die neue Teilnehmerzahl und die eigene Zusage; alles andere hat
 * sie aus der Leseroute. Eine Erlaubnisliste statt eines Weglassens: ein neues
 * Feld an der Zeile wandert so nie von selbst in diese Antwort, und die Antwort
 * kann nie MEHR zeigen als die Leseroute demselben Konto.
 *
 * Das Like auf einen Termin nimmt die gemeinsame Form `toVoteCounts`
 * (core/shared/voteCounts.ts).
 */

export type EventRsvpCounts = Pick<EventRow, '$id' | 'attendeeCount'>

export function toEventRsvpCounts(row: EventRsvpCounts): EventRsvpCounts {
  return { $id: row.$id, attendeeCount: row.attendeeCount }
}
