import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'moderation',
  tier: 'optional',
  kind: 'foundation',
  hasMigrations: true,
  userData: true,
  // Schema-Probe (OPS-008): moderation-003 legt reports.communityId an; 004 löscht nur tenantId (nicht ablesbar).
  schema: { latest: '005', probe: { migration: '003', table: 'reports', column: 'communityId' } },
  apiPrefixes: ['/api/reports'],
  title: { en: 'Moderation', de: 'Moderation' },
  description: {
    en: 'Reports, escalation handling and moderator workflows. Activated automatically by content products like comments and posts.',
    de: 'Meldungen, Eskalations-Handling und Moderations-Workflows. Wird von Content-Produkte wie Kommentaren und Posts automatisch mitaktiviert.',
  },
  customerDescription: {
    en: 'Collect and handle reports. Comes automatically with posts and comments.',
    de: 'Meldungen sammeln und bearbeiten. Kommt automatisch mit Beiträgen und Kommentaren.',
  },
  icon: 'i-ph-shield-check',
} satisfies ProductManifest
