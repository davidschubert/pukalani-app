import type { ProductManifest } from './shared/types/manifest'

export default {
  key: 'core',
  tier: 'foundation',
  hasMigrations: false,
  // Der Core besitzt keine Tabellen, räumt aber Konto, Sitzungen, Einstellungen und
  // Avatar selbst ab — er ist der Orchestrator (`server/utils/userData.ts`).
  userData: true,
  title: { en: 'Core', de: 'Core' },
  description: {
    en: 'Foundation layer: authentication, profiles, notifications, realtime, design system and shared utilities. Owns no tables.',
    de: 'Fundament-Layer: Auth, Profile, Benachrichtigungen, Realtime, Design-Fundament und geteilte Utilities. Besitzt keine Tables.',
  },
  icon: 'i-ph-cube',
} satisfies ProductManifest
