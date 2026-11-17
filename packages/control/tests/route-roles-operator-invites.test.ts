import { describeOperatorRoute, type OperatorExpectation } from './support/controlRouteHarness'

/**
 * BETREIBER-ROUTEN: EINLADUNGS-CODES, ANFRAGEN, MISSBRAUCHS-MELDUNGEN
 * (OPS-009, BT1 b).
 *
 * Echter Handler, echte Wache `requirePermission(event, 'sites.manage')` aus
 * dem Core (Prüfstand `support/controlRouteHarness.ts`). Die Datentür endet
 * beim ersten `createAdminClient`.
 *
 * `sites.manage` — ausgeschrieben: nur die Instanz-Rolle `admin`. Die
 * Instanz-Rolle `moderator` bearbeitet Meldungen in den Communities, aber
 * NICHT die Missbrauchs-Meldungen des Betreibers (dort hängt eine Sperre der
 * ganzen Community dran).
 */

const OPERATOR_ONLY: OperatorExpectation = {
  allow: ['operator'],
  deny: ['konto', 'community', 'moderator'],
}

describeOperatorRoute('GET /api/control/invites', () => import('../server/api/control/invites/index.get'), OPERATOR_ONLY)

describeOperatorRoute('POST /api/control/invites', () => import('../server/api/control/invites/index.post'), OPERATOR_ONLY, {
  body: { label: 'Probe' },
})

describeOperatorRoute('POST /api/control/invites/bulk', () => import('../server/api/control/invites/bulk.post'), OPERATOR_ONLY, {
  body: { count: 2 },
})

describeOperatorRoute('PATCH /api/control/invites/:id', () => import('../server/api/control/invites/[id].patch'), OPERATOR_ONLY, {
  params: { id: 'code-1' },
  body: { status: 'revoked' },
})

describeOperatorRoute('PATCH /api/control/invites/gate', () => import('../server/api/control/invites/gate.patch'), OPERATOR_ONLY, {
  body: { inviteRequired: true },
})

describeOperatorRoute('GET /api/control/invite-requests', () => import('../server/api/control/invite-requests/index.get'), OPERATOR_ONLY)

describeOperatorRoute('PATCH /api/control/invite-requests/:id', () => import('../server/api/control/invite-requests/[id].patch'), OPERATOR_ONLY, {
  params: { id: 'req-1' },
  body: { status: 'declined' },
})

describeOperatorRoute('POST /api/control/invite-requests/:id/assign', () => import('../server/api/control/invite-requests/[id]/assign.post'), OPERATOR_ONLY, {
  params: { id: 'req-1' },
})

describeOperatorRoute('GET /api/control/abuse-reports', () => import('../server/api/control/abuse-reports/index.get'), OPERATOR_ONLY)

describeOperatorRoute('PATCH /api/control/abuse-reports/:id', () => import('../server/api/control/abuse-reports/[id].patch'), OPERATOR_ONLY, {
  params: { id: 'report-1' },
  body: { status: 'dismissed' },
})
