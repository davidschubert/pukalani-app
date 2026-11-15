import { AppwriteException, Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { redactEventContent } from './eventRedaction'
import { EVENT_RSVPS_TABLE, EVENT_TICKETS_TABLE, EVENT_VOTES_TABLE, EVENTS_TABLE, type EventRow, type EventRsvpRow, type EventTicketRow, type EventVote } from '../../shared/types/event'

/**
 * GDPR-Contributor des events-Layers (Vertrag: core/server/utils/userData.ts).
 *
 * RSVPs → Hard-Delete (reine Verhaltens-Daten des Users); war die RSVP
 * 'going', sinkt der denormalisierte attendeeCount atomar mit.
 * Organisierte Events → abgesagt und GESCHWÄRZT (der Termin ist Kontext der
 * Teilnehmer, wie Posts-Tombstones — Muster Phase 25; die Schwärzung seit
 * SEC-032, s. unten).
 */
export async function eventsExportUserData(event: H3Event, userId: string) {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const rsvps = await listAllRows<EventRsvpRow>(tablesDB, databaseId, EVENT_RSVPS_TABLE, [Query.equal('userId', userId)])
  const organized = await listAllRows<EventRow>(tablesDB, databaseId, EVENTS_TABLE, [Query.equal('organizerId', userId)])
  // Degradiert auf leer, solange Migration 003 auf einer Instanz aussteht —
  // NUR dann (fehlende Tabelle, SEC-026 Teil 2). Vorher schluckte ein `catch`
  // auf leer auch jeden 500, und der Export sah vollständig aus.
  const votes = await listAllRowsIfTableExists<EventVote>(tablesDB, databaseId, EVENT_VOTES_TABLE, [Query.equal('userId', userId)])
  // Kauf-Metadaten (Rechnungen liegen bei Stripe); degradiert vor Migration 004
  const tickets = await listAllRowsIfTableExists<EventTicketRow>(tablesDB, databaseId, EVENT_TICKETS_TABLE, [Query.equal('userId', userId)])

  return {
    rsvps: rsvps.map(r => ({ eventId: r.eventId, status: r.status, createdAt: r.$createdAt })),
    votes: votes.map(v => ({ eventId: v.eventId, value: v.value, createdAt: v.$createdAt })),
    tickets: tickets.map(tk => ({ eventId: tk.eventId, status: tk.status, amount: tk.amount, createdAt: tk.$createdAt })),
    organizedEvents: organized.map(e => ({
      title: e.title, description: e.description, startAt: e.startAt, endAt: e.endAt,
      location: e.location, status: e.status, createdAt: e.$createdAt,
      // SEC-032 (2026-11-15): auch diese Texte hat die Person gewählt — sie
      // fehlten in der Auskunft, obwohl die Löschung sie jetzt leert.
      address: e.address, locationNotes: e.locationNotes, url: e.url, replayUrl: e.replayUrl,
    })),
  }
}

export async function eventsDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  let deleted = 0
  let anonymized = 0

  // RSVPs: Hard-Delete. STRIKT — deleteUserCompletely gated users.delete auf
  // Voll-Erfolg, ein geschluckter Fehler wäre eine Lücke.
  //
  // Der Zähler-Decrement ist die EINE bewusste Ausnahme und bleibt best
  // effort: `attendeeCount` ist eine Zahl über den TERMIN, kein Datum über
  // diesen Menschen — ein veralteter Zähler hinterlässt nichts Persönliches,
  // und an ihm darf die Löschung nicht hängen. Still ist er aber nicht mehr:
  // ein 404 heisst „Termin schon weg" (nichts zu tun), jeder andere Fehler
  // steht als Zeile im Log, damit der Drift auffindbar bleibt.
  const rsvps = await listAllRows<EventRsvpRow>(tablesDB, databaseId, EVENT_RSVPS_TABLE, [Query.equal('userId', userId)])
  for (const rsvp of rsvps) {
    await tablesDB.deleteRow({ databaseId, tableId: EVENT_RSVPS_TABLE, rowId: rsvp.$id })
    deleted++
    if (rsvp.status === 'going') {
      await tablesDB.decrementRowColumn({
        databaseId, tableId: EVENTS_TABLE, rowId: rsvp.eventId, column: 'attendeeCount', value: 1, min: 0,
      }).catch((error: unknown) => {
        if (error instanceof AppwriteException && error.code === 404) return
        logEvent('warn', 'events.gdpr_attendee_count_failed', { eventId: rsvp.eventId })
      })
    }
  }

  // Up-/Downvotes: Hard-Delete (Zähler-Drift bis zum nächsten Vote
  // akzeptiert — Präzedenzfall posts/comments). List degradiert vor
  // Migration 003 (fehlende Tabelle) — jeder andere Lesefehler hält an.
  const votes = await listAllRowsIfTableExists<EventVote>(tablesDB, databaseId, EVENT_VOTES_TABLE, [Query.equal('userId', userId)])
  for (const vote of votes) {
    await tablesDB.deleteRow({ databaseId, tableId: EVENT_VOTES_TABLE, rowId: vote.$id })
    deleted++
  }

  // Tickets: Hard-Delete (Kauf-Metadaten des Users; die steuerliche
  // Wahrheit liegt bei Stripe). List degradiert vor Migration 004 (fehlende
  // Tabelle) — jeder andere Lesefehler hält an.
  const tickets = await listAllRowsIfTableExists<EventTicketRow>(tablesDB, databaseId, EVENT_TICKETS_TABLE, [Query.equal('userId', userId)])
  for (const ticket of tickets) {
    await tablesDB.deleteRow({ databaseId, tableId: EVENT_TICKETS_TABLE, rowId: ticket.$id })
    deleted++
  }

  /**
   * Organisierte Events: ABSAGEN UND TEXTE LEEREN (Davids Entscheidung
   * 2026-11-15, SEC-032). Bis hierher bekam der Termin nur `cancelled` und
   * einen leeren Namen — Konto-Id, Titel, Beschreibung, Ort, Adresse, Links,
   * Übersetzungen und das Titelbild blieben. Jetzt dieselbe Schwärzung wie
   * bei der Moderation (`redactEventContent`, utils/eventRedaction.ts), dazu
   * Status, Name und Konto-Id im SELBEN Schreibvorgang. Der Termin bleibt als
   * abgesagter Platzhalter stehen: Zusagen und Tickets ANDERER hängen an ihm
   * (deren Daten), sie sehen „abgesagt".
   *
   * `redactedAt` wird mitgesetzt: daran hängen die Platzhalter-Überschrift
   * der Oberfläche, die Sperre des Übersetzens und die Moderations-Queue
   * (kein zweites „Schwärzen" für einen leeren Termin).
   *
   * Das Titelbild STRIKT (`coverFailure: 'throw'`, 404 = schon weg = Erfolg):
   * gelöscht wird es VOR dem Schreiben der Zeile, ein Fehler bricht also ab,
   * während `organizerId` und `coverFileId` noch dastehen — das Konto bleibt
   * gesperrt, ein zweiter Lauf findet den Termin wieder. Idempotent über die
   * Suche: wer abgearbeitet ist, trägt keine `organizerId` mehr.
   */
  const organized = await listAllRows<EventRow>(tablesDB, databaseId, EVENTS_TABLE, [Query.equal('organizerId', userId)])
  for (const row of organized) {
    await redactEventContent(event, row, {
      write: data => tablesDB.updateRow({ databaseId, tableId: EVENTS_TABLE, rowId: row.$id, data }),
      extra: {
        status: 'cancelled',
        organizerName: '',
        organizerId: '',
        redactedAt: row.redactedAt || new Date().toISOString(),
      },
      coverFailure: 'throw',
    })
    anonymized++
  }

  return { deleted, anonymized }
}
