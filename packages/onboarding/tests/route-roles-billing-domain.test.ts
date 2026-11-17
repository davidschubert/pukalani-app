import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeRoute, resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { controlSeam, describeControlGate, describeRoleGateToAnswer, describeRoleGateToEffect } from './support/controlSeam'

/**
 * ABO, TESTPHASE, SPERRE UND EIGENE DOMAIN — ROLLEN-TESTS AN DER ECHTEN ROUTE
 * (OPS-009, BT1 b).
 *
 * Echter Handler, echte Core-Wachen; nachgebildet sind die Naht zum Control
 * Plane (`support/controlSeam.ts`) und der Sweep hinter der Handroute.
 *
 * Ausgeschrieben aus der Rechte-Matrix (`core/shared/communityAuthz.ts`):
 *  - `community.billing` und `community.domain`: NUR der Owner (dazu der
 *    Betreiber im protokollierten Not-Zugang). Admin, Moderator, Editor und
 *    Mitglied NICHT — wer kauft oder eine fremde Domain anbindet, handelt nach
 *    außen.
 *  - `system.manage` (Instanz-Recht, `core/shared/authz.ts`): NUR der Betreiber.
 *    Keine Community-Rolle reicht, auch nicht der Owner.
 */

const pastDue = vi.hoisted(() => ({ sweeps: 0 }))
vi.mock('../server/utils/pastDueNotice', () => ({
  pastDueNoticeAvailable: () => true,
  runPastDueNoticeSweep: async () => {
    pastDue.sweeps += 1
    return { notified: [] }
  },
}))

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

const OWNER_ONLY = {
  allow: ['owner', 'operator'],
  deny: ['admin', 'moderator', 'editor', 'member'],
} as const

const OPERATOR_ONLY = {
  allow: ['operator'],
  deny: ['owner', 'admin', 'moderator', 'editor', 'member'],
} as const

// ── Abo ─────────────────────────────────────────────────────────────────────

describeControlGate(
  'POST /api/community/billing/checkout',
  () => import('../server/api/community/billing/checkout.post'),
  OWNER_ONLY,
  '/api/control/billing/community/checkout',
  { body: { plan: 'pro' }, reply: () => ({ url: 'https://checkout.example.test/s' }) },
)

describeControlGate(
  'POST /api/community/billing/portal',
  () => import('../server/api/community/billing/portal.post'),
  OWNER_ONLY,
  '/api/control/billing/community/portal',
  { reply: () => ({ url: 'https://portal.example.test/s' }) },
)

describeRoleGateToAnswer(
  'GET /api/community/billing/trial',
  () => import('../server/api/community/billing/trial.get'),
  OWNER_ONLY,
  { tenantFields: { trialEndsAt: '2026-12-01T00:00:00.000Z', billingStatus: '' } },
)

describe('GET /api/community/billing/trial — ohne Pool-Mandanten', () => {
  it('Silo: 404 auch für den Betreiber', async () => {
    const run = await probeRoute(() => import('../server/api/community/billing/trial.get'), { who: 'operator', mode: 'silo' })
    expect(run.status).toBe(404)
  })
})

// ── Sperre (M13) ────────────────────────────────────────────────────────────

describeControlGate(
  'GET /api/community/suspension (gesperrt)',
  () => import('../server/api/community/suspension.get'),
  OWNER_ONLY,
  '/api/control/community/suspension',
  { suspended: true, reply: () => ({ reason: 'Zahlung offen' }) },
)

describe('GET /api/community/suspension — nicht gesperrt', () => {
  const load = () => import('../server/api/community/suspension.get')

  it('Owner: leere Antwort, kein Ruf ins Control Plane', async () => {
    const seam = controlSeam()
    const run = await probeRoute(load, { who: 'owner', globals: seam.globals })
    expect(run.status).toBe(200)
    expect(seam.calls).toEqual([])
  })

  it('Mitglied: 403 auch ohne Sperre — der Zustand ist Vertragssache', async () => {
    const run = await probeRoute(load, { who: 'member', globals: controlSeam().globals })
    expect(run.status).toBe(403)
  })
})

// ── Zahlungswarnungen von Hand (Betreiber) ──────────────────────────────────

describeRoleGateToEffect(
  'POST /api/community/billing/run-past-due-notice',
  () => import('../server/api/community/billing/run-past-due-notice.post'),
  OPERATOR_ONLY,
  () => {
    const before = pastDue.sweeps
    return { globals: {}, reached: () => pastDue.sweeps > before }
  },
)

// ── Eigene Domain ───────────────────────────────────────────────────────────

const domainState = () => ({ domain: '', status: 'none', forms: [], needsPlatformRegistration: false })

describeControlGate(
  'GET /api/community/domain',
  () => import('../server/api/community/domain/index.get'),
  OWNER_ONLY,
  '/api/control/community/domain/state',
  { reply: domainState },
)

describeControlGate(
  'PUT /api/community/domain',
  () => import('../server/api/community/domain/index.put'),
  OWNER_ONLY,
  '/api/control/community/domain/set',
  { body: { domain: 'forum.beispiel-verein.de' }, reply: domainState },
)

describeControlGate(
  'DELETE /api/community/domain',
  () => import('../server/api/community/domain/index.delete'),
  OWNER_ONLY,
  '/api/control/community/domain/state',
  { reply: domainState, globals: { removeAppwriteWebPlatforms: async () => {} } },
)

describeControlGate(
  'POST /api/community/domain/verify',
  () => import('../server/api/community/domain/verify.post'),
  OWNER_ONLY,
  '/api/control/community/domain/verify',
  { reply: domainState },
)

describe('Domain-Routen: ein Admin bekommt 403, bevor eine Eingabe geprüft wird', () => {
  it('PUT mit ungültiger Domain: 403, nicht 400', async () => {
    const run = await probeRoute(() => import('../server/api/community/domain/index.put'), {
      who: 'admin',
      body: { domain: 'kein domain' },
      globals: controlSeam().globals,
    })
    expect(run.status).toBe(403)
  })

  it('DELETE: der Owner ruft erst den Stand, dann das Entfernen — beide mit der Community des Hosts', async () => {
    const seam = controlSeam(domainState)
    await probeRoute(() => import('../server/api/community/domain/index.delete'), {
      who: 'owner',
      globals: { ...seam.globals, removeAppwriteWebPlatforms: async () => {} },
    })
    expect(seam.calls.map(call => [call.path, call.body.communityId])).toEqual([
      ['/api/control/community/domain/state', 'c-a'],
      ['/api/control/community/domain/remove', 'c-a'],
    ])
  })
})
