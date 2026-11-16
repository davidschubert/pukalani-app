import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'pages',
  tier: 'optional',
  hasMigrations: true,
  userData: false,
  // Schema-Probe (OPS-008): pages-005 legt pages.communityId an; 006 löscht nur tenantId (nicht ablesbar).
  schema: { latest: '006', probe: { migration: '005', table: 'pages', column: 'communityId' } },
  apiPrefixes: ['/api/pages'],
  title: { en: 'Pages', de: 'Seiten' },
  description: {
    en: 'Editable content pages (Imprint, Terms, Privacy) with a WYSIWYG editor and per-language versions.',
    de: 'Editierbare Inhaltsseiten (Impressum, AGB, Datenschutz) mit WYSIWYG-Editor und Sprachversionen.',
  },
  icon: 'i-ph-file-text',
} satisfies ProductManifest
