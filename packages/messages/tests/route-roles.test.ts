import { describeRoleGateToDoor } from '../../core/tests/support/participationHarness'
import { getReportedMessage, listReportedMessages } from '../server/utils/messageReports'

/**
 * ROLLEN-PROBEN FÜR DIE MODERATION DER PRIVATEN NACHRICHTEN (P27, OPS-009).
 *
 * Die Moderation liest über den Admin-Client, der Leserechte absichtlich
 * umgeht — das Rollen-Tor `reports.moderate` ist also die EINZIGE Schranke
 * vor dem eingefrorenen Text einer gemeldeten Nachricht. Echte Handler, echte
 * Core-Wachen, echte Layer-Helfer (`messageReports.ts`); nachgebildet wird
 * nur die Naht zum moderation-Layer (`openReportsForTarget`: eine offene
 * Meldung).
 *
 * `reports.moderate` (abgelesen aus `core/shared/communityAuthz.ts`, nicht
 * berechnet): Moderator, Admin, Owner und der Betreiber im Not-Zugang. Der
 * Redakteur verfasst, er moderiert nicht; das Mitglied ebenso wenig.
 */

const MODERATE_REPORTS = {
  allow: ['owner', 'admin', 'moderator', 'operator'],
  deny: ['editor', 'member'],
} as const

/** Layer-Helfer als Auto-Imports, dazu die Naht zum moderation-Layer. */
const GLOBALS = {
  getReportedMessage,
  listReportedMessages,
  openReportsForTarget: async () => [{ reason: 'spam', note: null }],
  openReportCountsForTargets: async () => new Map<string, number>(),
  recordAuditView: async () => {},
}

describeRoleGateToDoor(
  'GET /api/messages/moderation',
  () => import('../server/api/messages/moderation/index.get'),
  MODERATE_REPORTS,
  { query: { limit: '20' }, globals: GLOBALS },
)

describeRoleGateToDoor(
  'GET /api/messages/moderation/:id',
  () => import('../server/api/messages/moderation/[id].get'),
  MODERATE_REPORTS,
  { params: { id: 'm-1' }, globals: GLOBALS },
)
