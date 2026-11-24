import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requirePlanProduct } from '../../../packages/core/server/utils/tenantPlanProducts'
import { probeRoute, resetCommunityWorld, type RouteProbe, type Who } from '../../../packages/core/tests/support/participationHarness'
import { assertEventsWritable } from '../../../packages/events/server/utils/eventPolicy'

/**
 * TICKET-KAUF FÜR EIN BEZAHLTES EVENT (OPS-009, N14; Wachen seit NF1 a).
 *
 * `POST /api/events/:id/checkout` ist eine APP-Route dieses Silos (A14: sie
 * komponiert events + billing). Echter Handler; die Welt kommt aus dem
 * Core-Prüfstand (`packages/core/tests/support/participationHarness.ts`).
 * Stripe wird NIE gerufen: `createPaymentCheckoutSession` (billing-Layer,
 * legt die Stripe-Sitzung an) ist ein Spion, die Event-Zeile kommt aus einer
 * Attrappe.
 *
 * Die Route trägt dieselben Wachen wie die Termin-Routen des events-Layers,
 * in der Reihenfolge der Zusage: Produkt des Plans (`requirePlanProduct`),
 * Zugehörigkeit (`requireCommunityParticipant` — Kaufen ist ein erster
 * eigener Schritt wie Zusagen), Wartungs-Sperre (`assertEventsWritable`).
 * Alle drei laufen hier ECHT; jede Ablehnung endet, bevor die Ablage
 * geöffnet oder Stripe gerufen wird.
 *
 * Wer durch darf — AUSGESCHRIEBEN: im Silo jedes angemeldete Konto (es gibt
 * keinen Mandanten, das Projekt ist die Grenze), darunter Mitglied und
 * Betreiber; im Pool das Mitglied, und ein fremdes Konto nur bei offener
 * Registrierung (dann ist der Kauf der Beitritt).
 */

interface EventRowLike {
  $id: string
  status: string
  access?: string
  priceLookupKey?: string
}

const PAID_EVENT: EventRowLike = { $id: 'ev-1', status: 'published', access: 'paid', priceLookupKey: 'probe-ticket' }

/** Pool-Pläne wie in der App: Events ab `pro`. */
const PLAN_CONFIG = {
  pukalani: {
    tenancy: {
      quota: { plans: { basic: {}, personal: {}, pro: {} } },
      products: { events: 'pro' },
    },
  },
}

const load = () => import('../server/api/events/[id]/checkout.post')

let sessions: unknown[] = []
let adminOpened = 0

function globalsFor(row: EventRowLike, options: { ticketOwned?: boolean, maintenance?: boolean, foreign?: boolean } = {}): Record<string, unknown> {
  return {
    requirePlanProduct,
    assertEventsWritable,
    useAppConfig: () => PLAN_CONFIG,
    getAppConfig: async () => ({ maintenanceMode: options.maintenance ?? false }),
    useRuntimeConfig: () => ({ public: { appwriteDatabaseId: 'main' } }),
    // Der Termin kommt über die Datentür (AR1 d): ein Termin einer anderen
    // Community ist dort 404, die Tür wirft wie im echten Betrieb.
    tenantDb: () => {
      adminOpened += 1
      return {
        get: async (_table: string, id: string) => {
          if (id !== row.$id || options.foreign) throw createError({ status: 404, statusText: 'Event not found' })
          return { ...row }
        },
      }
    },
    hasEventTicket: async () => options.ticketOwned ?? false,
    billingReturnOrigin: async () => 'https://comments.example.test',
    createPaymentCheckoutSession: async (_event: unknown, input: unknown) => {
      sessions.push(input)
      return 'https://checkout.example.test/probe'
    },
  }
}

type RunOptions = Omit<RouteProbe, 'who' | 'params' | 'globals'> & {
  row?: EventRowLike
  ticketOwned?: boolean
  maintenance?: boolean
  foreign?: boolean
}

const run = (who: Who, options: RunOptions = {}) => {
  const { row = PAID_EVENT, ticketOwned, maintenance, foreign, ...world } = options
  return probeRoute(load, {
    mode: 'silo',
    ...world,
    who,
    params: { id: row.$id },
    globals: globalsFor(row, { ticketOwned, maintenance, foreign }),
  })
}

/** Pool-Welt mit dem Plan, der Events enthält. */
const POOL: RunOptions = { mode: 'pool', tenantFields: { plan: 'pro' } }

function expectNothingTouched(): void {
  expect(adminOpened, 'die Ablage bleibt zu').toBe(0)
  expect(sessions, 'kein Stripe-Aufruf').toEqual([])
}

function expectOneSession(result: Awaited<ReturnType<typeof run>>): void {
  expect(result.status, result.error?.statusText).toBe(200)
  expect(result.result).toEqual({ url: 'https://checkout.example.test/probe' })
  expect(sessions).toEqual([expect.objectContaining({
    lookupKey: 'probe-ticket',
    metadata: { eventId: 'ev-1' },
    idempotencyScope: 'event-ticket:ev-1',
  })])
}

describe('POST /api/events/:id/checkout (Ticket-Kauf)', () => {
  beforeEach(() => {
    sessions = []
    adminOpened = 0
  })
  afterEach(() => {
    resetCommunityWorld()
    vi.unstubAllGlobals()
  })

  describe('Silo', () => {
    it('ohne Anmeldung: 401, Ablage zu, kein Stripe-Aufruf', async () => {
      const result = await run('guest')
      expect(result.status).toBe(401)
      expectNothingTouched()
    })

    const ALLOWED: readonly Who[] = ['member', 'operator']
    for (const who of ALLOWED) {
      it(`${who}: durch, genau eine Checkout-Sitzung für dieses Event`, async () => {
        const result = await run(who)
        expect(result.guardPassed).toBe(true)
        expectOneSession(result)
      })
    }

    it('Konto ohne Mitgliedschaft: angemeldet genügt (kein Mandant, das Projekt ist die Grenze)', async () => {
      const result = await run('stranger')
      expect(result.guardPassed).toBe(true)
      expectOneSession(result)
    })

    it('Wartungs-Sperre: 403 maintenance, Ablage zu, kein Stripe-Aufruf', async () => {
      const result = await run('member', { maintenance: true })
      expect(result.status).toBe(403)
      expect(result.error?.data?.code).toBe('maintenance')
      expectNothingTouched()
    })

    it('Event nicht käuflich (frei): 409, kein Stripe-Aufruf', async () => {
      const result = await run('member', { row: { $id: 'ev-2', status: 'published', access: 'free' } })
      expect(result.status).toBe(409)
      expect(sessions).toEqual([])
    })

    it('Event nicht veröffentlicht: 409, kein Stripe-Aufruf', async () => {
      const result = await run('member', { row: { ...PAID_EVENT, status: 'draft' } })
      expect(result.status).toBe(409)
      expect(sessions).toEqual([])
    })

    it('Ticket schon vorhanden: 409, kein Stripe-Aufruf', async () => {
      const result = await run('member', { ticketOwned: true })
      expect(result.status).toBe(409)
      expect(sessions).toEqual([])
    })
  })

  describe('Pool (dieselbe Route, falls sie dort je läuft)', () => {
    it('ohne Anmeldung: 401, Ablage zu, kein Stripe-Aufruf', async () => {
      const result = await run('guest', POOL)
      expect(result.status).toBe(401)
      expectNothingTouched()
    })

    it('Mitglied, Plan pro: durch, genau eine Checkout-Sitzung', async () => {
      const result = await run('member', POOL)
      expect(result.guardPassed).toBe(true)
      expectOneSession(result)
    })

    it('Konto ohne Mitgliedschaft, geschlossene Registrierung: 403 not_a_member, Ablage zu', async () => {
      const result = await run('stranger', { ...POOL, registration: 'closed' })
      expect(result.status).toBe(403)
      expect(result.error?.data?.code).toBe('not_a_member')
      expect(result.guardPassed).toBe(false)
      expectNothingTouched()
    })

    it('entfernt (Rollen-Cache sagt noch „viewer"): 403 not_a_member, Ablage zu', async () => {
      const result = await run('removed', POOL)
      expect(result.status).toBe(403)
      expect(result.error?.data?.code).toBe('not_a_member')
      expectNothingTouched()
    })

    it('Konto ohne Mitgliedschaft, offene Registrierung: der Kauf ist der Beitritt', async () => {
      const result = await run('stranger', { ...POOL, registration: 'open' })
      expect(result.joinHandlerCalls).toBe(1)
      expect(result.guardPassed).toBe(true)
      expectOneSession(result)
    })

    it('gesperrte Community: 403 community_suspended, kein Beitritt, kein Stripe-Aufruf', async () => {
      const result = await run('stranger', { ...POOL, registration: 'open', suspended: true })
      expect(result.status).toBe(403)
      expect(result.error?.data?.code).toBe('community_suspended')
      expect(result.joinHandlerCalls).toBe(0)
      expectNothingTouched()
    })

    it.each(['basic', 'personal'])('Plan %s (ohne events): 404 vor der Zugehörigkeit, Ablage zu', async (plan) => {
      const result = await run('member', { mode: 'pool', tenantFields: { plan } })
      expect(result.status).toBe(404)
      expect(result.guardPassed).toBe(false)
      expectNothingTouched()
    })

    it('Termin einer anderen Community: 404 aus der Datentür, kein Stripe-Aufruf (AR1 d)', async () => {
      const result = await run('member', { ...POOL, foreign: true })
      expect(result.status).toBe(404)
      expect(sessions, 'kein Stripe-Aufruf').toEqual([])
    })

    it('Wartungs-Sperre: 403 maintenance, Ablage zu, kein Stripe-Aufruf', async () => {
      const result = await run('member', { ...POOL, maintenance: true })
      expect(result.status).toBe(403)
      expect(result.error?.data?.code).toBe('maintenance')
      expectNothingTouched()
    })
  })
})
