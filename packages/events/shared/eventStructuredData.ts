import { ldCompact, ldDate, ldPerson } from '../../core/shared/communityStructuredData'
import { markdownExcerpt } from '../../core/shared/markdownExcerpt'
import { eventIsRedacted } from './eventModerationPolicy'
import { effectiveLocationType, type EventRow } from './types/event'

/**
 * JSON-LD eines Termins (SU1, SEO-003): `Event`.
 *
 * Nur, was die Seite öffentlich zeigt: Titel, Beschreibung, Beginn und Ende,
 * abgesagt oder nicht, Ort (Name und Anschrift, wie sie dastehen),
 * angezeigter Name der veranstaltenden Person. BEWUSST NICHT: der
 * Teilnahme-Link eines Online-Termins (die Seite gibt ihn erst kurz vor
 * Beginn und nur Zusagenden frei) — als Ort steht dort die Adresse dieser
 * Seite —, Teilnehmende, Preis, Konto-Ids. Ein GESCHWÄRZTER Termin (F46)
 * bekommt keine Daten; Entwurf und ausgeblendet erreichen die Seite nicht.
 */
export type EventStructuredDataInput = Pick<EventRow,
  'title' | 'description' | 'startAt' | 'endAt' | 'status' | 'location' | 'address' | 'locationType' | 'url' | 'organizerName' | '$createdAt' | '$updatedAt'
> & {
  redactedAt?: string | null
  pageUrl: string
  inLanguage: string
}

export function eventStructuredData(input: EventStructuredDataInput): Record<string, unknown> | null {
  if (eventIsRedacted(input.redactedAt)) return null
  const name = input.title?.trim()
  const startDate = ldDate(input.startAt)
  if (!name || !startDate) return null

  const online = effectiveLocationType(input) === 'online'
  const venueName = input.location?.trim()
  const address = input.address?.trim()
  const location = online
    ? { '@type': 'VirtualLocation', 'url': input.pageUrl }
    : (venueName || address)
        ? ldCompact({ '@type': 'Place', 'name': venueName || address, 'address': address || undefined })
        : undefined

  return ldCompact({
    '@type': 'Event',
    'url': input.pageUrl,
    'name': name,
    'description': markdownExcerpt(input.description) || undefined,
    'startDate': startDate,
    'endDate': ldDate(input.endAt),
    'eventStatus': input.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    'eventAttendanceMode': online
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : 'https://schema.org/OfflineEventAttendanceMode',
    'location': location,
    'organizer': ldPerson(input.organizerName),
    'inLanguage': input.inLanguage,
  })
}
