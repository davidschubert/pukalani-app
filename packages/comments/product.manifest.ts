import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'comments',
  tier: 'optional',
  requires: ['moderation'],
  hasMigrations: true,
  // Schema-Probe (OPS-008): comments-020 legt comments.translations an.
  schema: { latest: '020', probe: { migration: '020', table: 'comments', column: 'translations' } },
  apiPrefixes: ['/api/comments'],
  title: { en: 'Comments', de: 'Kommentare' },
  description: {
    en: 'Threaded comments with realtime updates, votes, mentions, markdown, guest reading, AI translation and an embeddable widget.',
    de: 'Verschachtelte Kommentare mit Realtime, Votes, @-Mentions, Markdown, Gast-Lesezugriff, KI-Übersetzung und Embed-Widget.',
  },
  icon: 'i-ph-chat-circle',
} satisfies ProductManifest
