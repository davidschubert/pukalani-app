import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'media',
  tier: 'optional',
  hasMigrations: true,
  userData: false,
  // Schema-Probe (OPS-008): media-004 legt media_items.communityId an; 005 löscht nur tenantId (nicht ablesbar).
  schema: { latest: '005', probe: { migration: '004', table: 'media_items', column: 'communityId' } },
  apiPrefixes: ['/api/media'],
  title: { en: 'Media Gallery', de: 'Medien-Galerie' },
  description: {
    en: 'Managed image gallery: upload, captions, ordering and publish state — the content source for photo and portfolio pages.',
    de: 'Verwaltete Bild-Galerie: Upload, Bildunterschriften, Sortierung und Publish-Status — die Inhalts-Quelle für Foto- und Portfolio-Seiten.',
  },
  icon: 'i-ph-images',
} satisfies ProductManifest
