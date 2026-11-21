import { describe, expect, it } from 'vitest'
import { eventStructuredData, type EventStructuredDataInput } from '../shared/eventStructuredData'

/**
 * Strukturierte Daten der Community-Seiten (SU1, SEO-003). Erwartungen stehen
 * AUSGESCHRIEBEN (Beweis-Regel 1); jede Seitenart hat ihre Gegenprobe.
 */
describe('Termin: Event', () => {
  const base: EventStructuredDataInput = {
    title: 'Sonntagsrunde',
    description: 'Wir treffen uns im Park.',
    startAt: '2026-12-06T10:00:00.000Z',
    endAt: '2026-12-06T12:00:00.000Z',
    status: 'published',
    location: 'Stadtpark',
    address: 'Parkweg 1, 12345 Musterstadt',
    locationType: 'venue',
    url: null,
    organizerName: 'Mia',
    $createdAt: '2026-11-01T10:00:00.000Z',
    $updatedAt: '2026-11-01T10:00:00.000Z',
    redactedAt: null,
    pageUrl: 'https://demo.example.test/events/e1',
    inLanguage: 'de',
  }

  it('Präsenz-Termin: Ort mit Anschrift, wie die Seite sie zeigt', () => {
    expect(eventStructuredData(base)).toEqual({
      '@type': 'Event',
      'url': 'https://demo.example.test/events/e1',
      'name': 'Sonntagsrunde',
      'description': 'Wir treffen uns im Park.',
      'startDate': '2026-12-06T10:00:00.000Z',
      'endDate': '2026-12-06T12:00:00.000Z',
      'eventStatus': 'https://schema.org/EventScheduled',
      'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
      'location': { '@type': 'Place', 'name': 'Stadtpark', 'address': 'Parkweg 1, 12345 Musterstadt' },
      'organizer': { '@type': 'Person', 'name': 'Mia' },
      'inLanguage': 'de',
    })
  })

  it('Online-Termin: Ort ist die Seite, NIE der Teilnahme-Link', () => {
    const graph = eventStructuredData({ ...base, locationType: 'online', url: 'https://meet.example.test/geheim', location: null, address: null })!
    expect(graph.location).toEqual({ '@type': 'VirtualLocation', 'url': 'https://demo.example.test/events/e1' })
    expect(graph.eventAttendanceMode).toBe('https://schema.org/OnlineEventAttendanceMode')
    expect(JSON.stringify(graph)).not.toContain('meet.example.test')
  })

  it('abgesagt ⇒ EventCancelled', () => {
    expect(eventStructuredData({ ...base, status: 'cancelled' })!.eventStatus).toBe('https://schema.org/EventCancelled')
  })

  it('Gegenprobe: geschwärzter Termin trägt keine Daten', () => {
    expect(eventStructuredData({ ...base, redactedAt: '2026-11-20T10:00:00.000Z' })).toBeNull()
  })
})
