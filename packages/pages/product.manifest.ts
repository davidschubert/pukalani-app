import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'pages',
  tier: 'optional',
  hasMigrations: true,
  userData: false,
  // Schema-Probe (OPS-008): pages-007 legt `pages_runs` an (Lauf-Sperre der
  // Seiten-Übersetzung, LL1 d); `result` ist die letzte Spalte, die sie anlegt.
  schema: { latest: '007', probe: { migration: '007', table: 'pages_runs', column: 'result' } },
  apiPrefixes: ['/api/pages'],
  title: { en: 'Pages', de: 'Seiten' },
  description: {
    en: 'Editable content pages (Imprint, Terms, Privacy) with a WYSIWYG editor and per-language versions.',
    de: 'Editierbare Inhaltsseiten (Impressum, AGB, Datenschutz) mit WYSIWYG-Editor und Sprachversionen.',
  },
  icon: 'i-ph-file-text',
} satisfies ProductManifest
