import { vi } from 'vitest'
import { requireRecentAuth } from '../../core/server/utils/recentAuth'
import { describeOperatorRoute, type OperatorExpectation } from './support/controlRouteHarness'

/**
 * BETREIBER-ROUTEN: COMMUNITIES, PLÄNE, NAMEN, KATALOG, AUFTRÄGE (OPS-009, BT1 b).
 *
 * Echter Handler, echte Wache `requirePermission(event, 'sites.manage')` aus
 * dem Core (Prüfstand `support/controlRouteHarness.ts`). Die Datentür endet
 * beim ersten `createAdminClient`.
 *
 * `sites.manage` — ausgeschrieben, nicht aus der Rechte-Matrix berechnet: nur
 * die Instanz-Rolle `admin` (der Betreiber). Die Instanz-Rolle `moderator`
 * NICHT, ein Community-Label (so trägt es ein Owner) NICHT, ein Konto ohne
 * Label NICHT.
 *
 * Löschen verlangt zusätzlich eine frische Anmeldung (`requireRecentAuth`,
 * echt aus dem Core; nachgebildet ist nur der Session-Client).
 */

vi.mock('../../core/server/lib/appwrite', () => import('./support/sessionClient'))

const OPERATOR_ONLY: OperatorExpectation = {
  allow: ['operator'],
  deny: ['konto', 'community', 'moderator'],
}

const recentAuth = { requireRecentAuth }

describeOperatorRoute('DELETE /api/control/tenants/:id', () => import('../server/api/control/tenants/[id].delete'), OPERATOR_ONLY, {
  params: { id: 'c-a' },
  globals: recentAuth,
}, { recentAuth: true })

describeOperatorRoute('PATCH /api/control/tenants/:id', () => import('../server/api/control/tenants/[id].patch'), OPERATOR_ONLY, {
  params: { id: 'c-a' },
  body: { status: 'disabled' },
})

describeOperatorRoute('POST /api/control/tenants/:id/suspension', () => import('../server/api/control/tenants/[id]/suspension.post'), OPERATOR_ONLY, {
  params: { id: 'c-a' },
  body: { suspension: '' },
})

describeOperatorRoute('GET /api/control/plans', () => import('../server/api/control/plans/index.get'), OPERATOR_ONLY)

describeOperatorRoute('PATCH /api/control/plans/:key', () => import('../server/api/control/plans/[key].patch'), OPERATOR_ONLY, {
  params: { key: 'personal' },
  body: { posts: { perDay: 10 } },
})

describeOperatorRoute('GET /api/control/reserved-names', () => import('../server/api/control/reserved-names/index.get'), OPERATOR_ONLY)

describeOperatorRoute('POST /api/control/reserved-names', () => import('../server/api/control/reserved-names/index.post'), OPERATOR_ONLY, {
  body: { name: 'probe-name' },
})

describeOperatorRoute('DELETE /api/control/reserved-names/:name', () => import('../server/api/control/reserved-names/[name].delete'), OPERATOR_ONLY, {
  params: { name: 'probe-name' },
})

describeOperatorRoute('GET /api/control/products', () => import('../server/api/control/products/index.get'), OPERATOR_ONLY)

describeOperatorRoute('GET /api/control/market-signal', () => import('../server/api/control/market-signal.get'), OPERATOR_ONLY)

describeOperatorRoute('GET /api/control/jobs', () => import('../server/api/control/jobs/index.get'), OPERATOR_ONLY)

describeOperatorRoute('POST /api/control/jobs', () => import('../server/api/control/jobs/index.post'), OPERATOR_ONLY, {
  body: { type: 'site.create', name: 'probe-site', products: [] },
})

describeOperatorRoute('POST /api/control/sweeps/past-due', () => import('../server/api/control/sweeps/past-due.post'), OPERATOR_ONLY)
