import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'posts',
  tier: 'optional',
  requires: ['moderation'],
  hasMigrations: true,
  userData: true,
  // Schema-Probe (OPS-008): posts-023 legt community_posts.translations an.
  schema: { latest: '024', probe: { migration: '023', table: 'community_posts', column: 'translations' } },
  apiPrefixes: ['/api/posts'],
  title: { en: 'Posts', de: 'Beiträge' },
  description: {
    en: 'User-generated posts with markdown, moderation assist, one-click AI translation and activity feed integration.',
    de: 'Nutzer-Beiträge mit Markdown, Moderations-Assist, KI-Übersetzung per Klick und Anbindung an den Activity-Feed.',
  },
  icon: 'i-ph-note-pencil',
} satisfies ProductManifest
