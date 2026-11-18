import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ControlPlanCatalog } from '../../../packages/control/shared/types/planCatalog'
import { COMMUNITIES_TABLE } from '../../../packages/control/shared/types/tenantRecord'
import {
  COMMUNITY_ID,
  POOL_PROJECT,
  describeSeamTeamRoute,
  jwtOf,
  probeControlRoute,
  resetControlWorld,
  type ControlProbe,
  type RuntimeWho,
  type TeamExpectation,
} from '../../../packages/control/tests/support/controlRouteHarness'
import { createStripeFake } from './support/stripeFake'

/**
 * NAHT-ROUTEN DER COMMUNITY-ABRECHNUNG: GEHEIMNIS + JWT + ROLLE (OPS-009, N14).
 *
 * Die Platform-App ruft Checkout und Stripe-Portal im Namen des Owners. Drei
 * Beweise, alle echt (Prüfstand `packages/control/tests/support/controlRouteHarness.ts`):
 *  1. das Naht-Geheimnis (`requireOnboardingCaller`),
 *  2. das JWT, das das Control Plane selbst gegen das Pool-Projekt prüft
 *     (`verifyRuntimeIdentity`; nachgebildet ist nur die Antwort von Appwrite),
 *  3. die Rolle in GENAU dieser Community (`community_members`).
 *
 * `community.billing` — AUSGESCHRIEBEN, nicht aus der Rechte-Matrix berechnet:
 * nur der Owner. Stripe ist eine Attrappe; bei jeder Ablehnung kommt dort
 * nichts an und in der Ablage wird nichts geschrieben.
 */

vi.mock('node-appwrite', async importOriginal =>
  (await import('../../../packages/control/tests/support/runtimeAccounts')).withFakeAccount(await importOriginal<typeof import('node-appwrite')>()))

const OWNER_ONLY: TeamExpectation = {
  allow: ['owner'],
  deny: ['admin', 'moderator', 'editor', 'viewer'],
}

const PLANS: ControlPlanCatalog = {
  personal: { lookupKey: 'probe-personal-monthly', lookupKeyYearly: 'probe-personal-yearly', products: [] },
}

const stripe = createStripeFake()

beforeEach(() => {
  stripe.reset()
  stripe.respond({
    'customers.create': () => ({ id: 'cus-probe' }),
    'checkout.sessions.create': () => ({ url: 'https://checkout.example.test/probe' }),
    'billingPortal.sessions.create': () => ({ url: 'https://portal.example.test/probe' }),
  })
})

const globals: Record<string, unknown> = {
  useAppConfig: () => ({ pukalani: { control: { plans: PLANS } } }),
  useStripe: async () => stripe.client,
  resolvePriceByLookupKey: async () => ({ id: 'price-probe' }),
  toStripeSafeError: (_error: unknown, log: string) => { throw new Error(log) },
}

/** Die Probe-Community `c-a` mit einem Stripe-Kunden (für das Portal). */
function withCustomer(db: Parameters<NonNullable<ControlProbe['seed']>>[0]): void {
  db.seed(COMMUNITIES_TABLE, {
    $id: COMMUNITY_ID,
    projectId: POOL_PROJECT,
    name: `Probe ${COMMUNITY_ID}`,
    host: `${COMMUNITY_ID}.probe.example.test`,
    status: 'active',
    plan: 'personal',
    openRegistration: false,
    suspension: '',
    profile: '',
    stripeCustomerId: 'cus-probe',
  })
}

interface BillingRoute {
  name: string
  load: () => Promise<{ default: unknown }>
  bodyFor: (jwt: string, communityId: string) => Record<string, unknown>
  base: Omit<ControlProbe, 'secret' | 'body'>
  /** Die Stripe-Aufrufe des Owners — ausgeschrieben. */
  ownerStripeCalls: string[]
}

const CHECKOUT: BillingRoute = {
  name: 'POST /api/control/billing/community/checkout',
  load: () => import('../server/api/control/billing/community/checkout.post'),
  bodyFor: (jwt, communityId) => ({ jwt, communityId, plan: 'personal', interval: 'monthly' }),
  base: { globals },
  ownerStripeCalls: ['customers.create', 'checkout.sessions.create'],
}

const PORTAL: BillingRoute = {
  name: 'POST /api/control/billing/community/portal',
  load: () => import('../server/api/control/billing/community/portal.post'),
  bodyFor: (jwt, communityId) => ({ jwt, communityId }),
  base: { globals, seed: withCustomer },
  ownerStripeCalls: ['billingPortal.sessions.create'],
}

for (const route of [CHECKOUT, PORTAL]) {
  describeSeamTeamRoute(route.name, route.load, OWNER_ONLY, route.bodyFor, route.base)

  describe(`${route.name} (Stripe-Attrappe)`, () => {
    afterEach(resetControlWorld)

    const probe = (who: RuntimeWho | 'unbekannt', secret: ControlProbe['secret'] = 'right') =>
      probeControlRoute(route.load, {
        ...route.base,
        secret,
        body: route.bodyFor(who === 'unbekannt' ? 'jwt-unbekannt' : jwtOf(who), COMMUNITY_ID),
      })

    const denied: (RuntimeWho | 'unbekannt')[] = [...OWNER_ONLY.deny, 'removed', 'stranger', 'foreign', 'unbekannt']
    for (const who of denied) {
      it(`${who}: abgelehnt, kein Stripe-Aufruf, nichts geschrieben`, async () => {
        const run = await probe(who)
        expect([401, 403]).toContain(run.status)
        expect(stripe.calls).toEqual([])
        expect(run.writes).toEqual([])
      })
    }

    it('Owner ohne Naht-Geheimnis: 401, kein Stripe-Aufruf', async () => {
      const run = await probe('owner', 'none')
      expect(run.status).toBe(401)
      expect(stripe.calls).toEqual([])
      expect(run.writes).toEqual([])
    })

    it('Owner: durch, Stripe erreicht', async () => {
      const run = await probe('owner')
      expect(run.status, run.error?.statusText).toBe(200)
      expect(stripe.calls).toEqual(route.ownerStripeCalls)
      expect(run.result).toEqual({ url: expect.stringMatching(/^https:\/\/(checkout|portal)\.example\.test\//) })
    })
  })
}

describe('Checkout: der Stripe-Kunde gehört der Community', () => {
  afterEach(resetControlWorld)

  it('der Owner legt ihn an, er wird an der Community-Zeile verankert', async () => {
    const run = await probeControlRoute(CHECKOUT.load, {
      ...CHECKOUT.base,
      secret: 'right',
      body: CHECKOUT.bodyFor(jwtOf('owner'), COMMUNITY_ID),
    })
    expect(run.status, run.error?.statusText).toBe(200)
    expect(run.writes).toEqual([{ method: 'updateRow', table: COMMUNITIES_TABLE }])
  })
})
