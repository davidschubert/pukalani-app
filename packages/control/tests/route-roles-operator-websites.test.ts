import { vi } from 'vitest'
import { requireRecentAuth } from '../../core/server/utils/recentAuth'
import { describeOperatorRoute, type OperatorExpectation } from './support/controlRouteHarness'

/**
 * BETREIBER-ROUTEN: DAS WEBSITE-REGISTER (Silos, OPS-009, BT1 b).
 *
 * Echter Handler, echte Wache `requirePermission(event, 'sites.manage')` aus
 * dem Core (Prüfstand `support/controlRouteHarness.ts`). Die Datentür endet
 * beim ersten `createAdminClient` — ploi, DNS und der Gesundheits-Abruf
 * liegen dahinter und werden nie erreicht.
 *
 * `sites.manage` — ausgeschrieben: nur die Instanz-Rolle `admin`.
 * Austragen verlangt zusätzlich eine frische Anmeldung (`requireRecentAuth`,
 * echt aus dem Core; nachgebildet ist nur der Session-Client).
 */

vi.mock('../../core/server/lib/appwrite', () => import('./support/sessionClient'))

const OPERATOR_ONLY: OperatorExpectation = {
  allow: ['operator'],
  deny: ['konto', 'community', 'moderator'],
}

describeOperatorRoute('GET /api/control/websites', () => import('../server/api/control/websites/index.get'), OPERATOR_ONLY)

describeOperatorRoute('DELETE /api/control/websites/:id', () => import('../server/api/control/websites/[id].delete'), OPERATOR_ONLY, {
  params: { id: 'w-silo' },
  globals: { requireRecentAuth },
}, { recentAuth: true })

describeOperatorRoute('PUT /api/control/websites/:id/domain', () => import('../server/api/control/websites/[id]/domain.put'), OPERATOR_ONLY, {
  params: { id: 'w-silo' },
  body: { domain: 'probe-kunde.example.com' },
})

describeOperatorRoute('DELETE /api/control/websites/:id/domain', () => import('../server/api/control/websites/[id]/domain.delete'), OPERATOR_ONLY, {
  params: { id: 'w-silo' },
})

describeOperatorRoute('POST /api/control/websites/:id/domain/verify', () => import('../server/api/control/websites/[id]/domain/verify.post'), OPERATOR_ONLY, {
  params: { id: 'w-silo' },
})

describeOperatorRoute('PUT /api/control/websites/:id/entitlements', () => import('../server/api/control/websites/[id]/entitlements.put'), OPERATOR_ONLY, {
  params: { id: 'w-silo' },
  body: { products: ['comments'] },
})

describeOperatorRoute('POST /api/control/websites/:id/health', () => import('../server/api/control/websites/[id]/health.post'), OPERATOR_ONLY, {
  params: { id: 'w-silo' },
})
