import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'admin',
  tier: 'foundation',
  kind: 'foundation',
  // Menü des Kontos zeigt den Farbmodus über `useTheme` (Auto-Import, Q18).
  requires: ['themes'],
  hasMigrations: true,
  userData: false,
  // Schema-Probe (OPS-008): admin-003 legt changelog.titleEn an.
  schema: { latest: '003', probe: { migration: '003', table: 'changelog', column: 'titleEn' } },
  title: { en: 'Admin Dashboard', de: 'Admin-Dashboard' },
  description: {
    en: 'Dashboard shell with module registry, user management, moderation UI, global search and runtime configuration.',
    de: 'Dashboard-Gerüst mit Modul-Registry, Nutzerverwaltung, Moderations-UI, globaler Suche und Laufzeit-Konfiguration.',
  },
  icon: 'i-ph-squares-four',
} satisfies ProductManifest
