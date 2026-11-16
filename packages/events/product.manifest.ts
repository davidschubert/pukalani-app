import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'events',
  tier: 'optional',
  hasMigrations: true,
  userData: true,
  // Schema-Probe (OPS-008): events-013 legt events.translations an.
  schema: { latest: '014', probe: { migration: '013', table: 'events', column: 'translations' } },
  apiPrefixes: ['/api/events'],
  title: { en: 'Events', de: 'Events' },
  description: {
    en: 'Events with series, RSVPs, tickets and AI translation — including an embeddable event view.',
    de: 'Events mit Serien, Zusagen, Tickets und KI-Übersetzung — inklusive einbettbarer Event-Ansicht.',
  },
  icon: 'i-ph-calendar',
} satisfies ProductManifest
