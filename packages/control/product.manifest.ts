import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'control',
  tier: 'optional',
  kind: 'seam',
  // admin: `recordAudit`; feedback: das Plugin registriert das Backend der
  // Rückmeldungen (Auto-Import, Q18 — ohne feedback startet der Server nicht).
  requires: ['admin', 'feedback'],
  hasMigrations: true,
  userData: true,
  // Schema-Probe (OPS-008): control-040 ist die jüngste ablesbare Spalte;
  // 041 (Index) und 042 (Katalog-Zahlen, KK1 c) sind nicht ablesbar.
  schema: { latest: '042', probe: { migration: '040', table: 'communities', column: 'customDomainApproved' } },
  apiPrefixes: ['/api/control'],
  title: { en: 'Control Plane', de: 'Control Plane' },
  description: {
    en: 'The platform control plane: site registry, health overview, provisioning and entitlements. Runs only on the control site.',
    de: 'Das Control Plane der Plattform: Sites-Register, Health-Übersicht, Provisionierung und Entitlements. Läuft nur auf der Control-Site.',
  },
  customerDescription: {
    en: 'Management of all sites on the platform.',
    de: 'Die Verwaltung aller Sites der Plattform.',
  },
  icon: 'i-ph-globe-hemisphere-west',
} satisfies ProductManifest
