import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'control',
  tier: 'optional',
  hasMigrations: true,
  userData: true,
  // Schema-Probe (OPS-008): control-039 legt trial_claims an (BE-015).
  schema: { latest: '039', probe: { migration: '039', table: 'trial_claims', column: 'runtimeUserId' } },
  apiPrefixes: ['/api/control'],
  title: { en: 'Control Plane', de: 'Control Plane' },
  description: {
    en: 'The platform control plane: site registry, health overview, provisioning and entitlements. Runs only on the control site.',
    de: 'Das Control Plane der Plattform: Sites-Register, Health-Übersicht, Provisionierung und Entitlements. Läuft nur auf der Control-Site.',
  },
  icon: 'i-ph-globe-hemisphere-west',
} satisfies ProductManifest
