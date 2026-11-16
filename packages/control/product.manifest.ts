import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'control',
  tier: 'optional',
  hasMigrations: true,
  // Schema-Probe (OPS-008): control-038 legt communities.timezone an.
  schema: { latest: '038', probe: { migration: '038', table: 'communities', column: 'timezone' } },
  apiPrefixes: ['/api/control'],
  title: { en: 'Control Plane', de: 'Control Plane' },
  description: {
    en: 'The platform control plane: site registry, health overview, provisioning and entitlements. Runs only on the control site.',
    de: 'Das Control Plane der Plattform: Sites-Register, Health-Übersicht, Provisionierung und Entitlements. Läuft nur auf der Control-Site.',
  },
  icon: 'i-ph-globe-hemisphere-west',
} satisfies ProductManifest
