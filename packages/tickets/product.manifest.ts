import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'tickets',
  tier: 'optional',
  hasMigrations: true,
  userData: true,
  // Schema-Probe (OPS-008): tickets-004 legt tickets.origin an.
  schema: { latest: '004', probe: { migration: '004', table: 'tickets', column: 'origin' } },
  apiPrefixes: ['/api/tickets'],
  title: { en: 'Support Tickets', de: 'Support-Tickets' },
  description: {
    en: 'Support ticket board with assignment, notifications and optional AI triage.',
    de: 'Support-Ticket-Board mit Zuweisung, Benachrichtigungen und optionaler KI-Triage.',
  },
  icon: 'i-ph-lifebuoy',
} satisfies ProductManifest
