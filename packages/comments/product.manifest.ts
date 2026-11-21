import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'comments',
  tier: 'optional',
  kind: 'product',
  // admin: Moderations-Präsenz im Dashboard und `recordAudit` beim Ändern
  // des Status (Auto-Import, Q18).
  requires: ['moderation', 'admin'],
  hasMigrations: true,
  userData: true,
  // Schema-Probe (OPS-008): comments-020 legt comments.translations an.
  schema: { latest: '022', probe: { migration: '020', table: 'comments', column: 'translations' } },
  // Die Moderations-Routen liegen unter `/api/admin/…`, gehören aber diesem
  // Layer — ohne die zwei Einträge blieben Queue, Sammel-Aktion, Assistent und
  // die Einbetter-Liste erreichbar, wenn das Produkt abgeschaltet ist (BE-005).
  apiPrefixes: ['/api/comments', '/api/admin/comments', '/api/admin/embed-sites'],
  title: { en: 'Comments', de: 'Kommentare' },
  description: {
    en: 'Threaded comments with realtime updates, votes, mentions, markdown, guest reading, AI translation and an embeddable widget.',
    de: 'Verschachtelte Kommentare mit Realtime, Votes, @-Mentions, Markdown, Gast-Lesezugriff, KI-Übersetzung und Embed-Widget.',
  },
  icon: 'i-ph-chat-circle',
} satisfies ProductManifest
