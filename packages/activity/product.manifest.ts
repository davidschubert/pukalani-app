import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'activity',
  tier: 'optional',
  kind: 'product',
  // Liest nur die system-eigene activities-Table (recordActivity im Core) —
  // keine harten Layer-Abhängigkeiten, ohne Content-Produkte nur leerer.
  hasMigrations: false,
  userData: false,
  apiPrefixes: ['/api/activity'],
  title: { en: 'Activity Feed', de: 'Activity-Feed' },
  description: {
    en: 'Chronological activity feed of what happens on the site (posts, comments, signups).',
    de: 'Chronologischer Activity-Feed der Site-Ereignisse (Beiträge, Kommentare, Anmeldungen).',
  },
  customerDescription: {
    en: 'A timeline of what happens in your community: new posts, comments and members.',
    de: 'Ein Verlauf, der zeigt, was in deiner Community passiert: neue Beiträge, Kommentare und Mitglieder.',
  },
  icon: 'i-ph-pulse',
} satisfies ProductManifest
