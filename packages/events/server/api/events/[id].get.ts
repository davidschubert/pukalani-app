import type { EventDetailResponse } from '../../../shared/types/event'

/**
 * Event-Detail: published/cancelled sind über die Row-Permission read(any)
 * öffentlich lesbar; drafts liefern 404 (Session-Client sieht sie nicht),
 * `hidden` ebenfalls — auch wenn die Zeile nach einem halb gescheiterten
 * Ausblenden noch ein Leserecht trägt (BE-017, `getPubliclyVisibleEvent`).
 * Datentür (member): get belegt die Zugehörigkeit — ein fremder Mandant
 * bekommt 404, auch wenn die Row read(any) trägt.
 * Angereichert um eigene RSVP + eigenen Vote, die Teilnehmerliste
 * (PRIVACY-GATE: Namen/Avatare nur für Eingeloggte — Gäste sehen die
 * Anzahl, die UI rendert Platzhalter) und den Organizer-Avatar.
 */
export default defineEventHandler(async (event): Promise<EventDetailResponse> => {
  // Produkt-Gate (P4): Events sind ab Plan pro enthalten.
  requirePlanProduct(event, 'events')
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  // Leserecht UND Zustand (BE-017): nur published/cancelled, sonst 404.
  const row = await getPubliclyVisibleEvent(event, id)

  const userId = event.context.user?.$id ?? null

  const [rsvps, votes, attendees, avatars] = await Promise.all([
    myRsvpsFor(event, [row.$id], userId),
    myVotesFor(event, [row.$id], userId),
    attendeesFor(event, row.$id, userId),
    resolveAvatars(event, [row.organizerId]),
  ])

  return {
    ...row,
    myRsvp: rsvps.get(row.$id) ?? null,
    myVote: votes.get(row.$id) ?? null,
    attendeeAvatars: attendees.map(a => a.avatarUrl),
    attendees,
    organizerAvatarUrl: avatars.get(row.organizerId) ?? null,
  }
})
