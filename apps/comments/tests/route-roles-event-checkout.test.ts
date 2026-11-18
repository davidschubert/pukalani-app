import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { probeRoute, resetCommunityWorld, type Who } from '../../../packages/core/tests/support/participationHarness'

/**
 * TICKET-KAUF FÜR EIN BEZAHLTES EVENT (OPS-009, N14).
 *
 * `POST /api/events/:id/checkout` ist eine APP-Route dieses Silos (A14: sie
 * komponiert events + billing). Echter Handler; die Welt kommt aus dem
 * Core-Prüfstand (`packages/core/tests/support/participationHarness.ts`,
 * Modus `silo`: kein Mandant, das Projekt ist die Grenze). Stripe wird NIE
 * gerufen: `createPaymentCheckoutSession` (billing-Layer, legt die
 * Stripe-Sitzung an) ist ein Spion, die Event-Zeile kommt aus einer Attrappe.
 *
 * Die Wache der Route ist allein die Anmeldung (`event.context.user`). Wer
 * durch darf — AUSGESCHRIEBEN: ein angemeldetes Mitglied und der Betreiber.
 * Ohne Anmeldung: 401, kein Stripe-Aufruf.
 */

interface EventRowLike {
  $id: string
  status: string
  access?: string
  priceLookupKey?: string
}

const PAID_EVENT: EventRowLike = { $id: 'ev-1', status: 'published', access: 'paid', priceLookupKey: 'probe-ticket' }

const load = () => import('../server/api/events/[id]/checkout.post')

let sessions: unknown[] = []
let adminOpened = 0

function globalsFor(row: EventRowLike, ticketOwned = false): Record<string, unknown> {
  return {
    useRuntimeConfig: () => ({ public: { appwriteDatabaseId: 'main' } }),
    createAdminClient: () => {
      adminOpened += 1
      return { tablesDB: { getRow: async () => ({ ...row }) } }
    },
    hasEventTicket: async () => ticketOwned,
    billingReturnOrigin: async () => 'https://comments.example.test',
    createPaymentCheckoutSession: async (_event: unknown, input: unknown) => {
      sessions.push(input)
      return 'https://checkout.example.test/probe'
    },
  }
}

const run = (who: Who, row: EventRowLike = PAID_EVENT, ticketOwned = false) =>
  probeRoute(load, { who, mode: 'silo', params: { id: row.$id }, globals: globalsFor(row, ticketOwned) })

describe('POST /api/events/:id/checkout (Ticket-Kauf, Silo)', () => {
  beforeEach(() => {
    sessions = []
    adminOpened = 0
  })
  afterEach(() => {
    resetCommunityWorld()
    vi.unstubAllGlobals()
  })

  it('ohne Anmeldung: 401, Ablage zu, kein Stripe-Aufruf', async () => {
    const result = await run('guest')
    expect(result.status).toBe(401)
    expect(adminOpened).toBe(0)
    expect(sessions).toEqual([])
  })

  const ALLOWED: readonly Who[] = ['member', 'operator']
  for (const who of ALLOWED) {
    it(`${who}: durch, genau eine Checkout-Sitzung für dieses Event`, async () => {
      const result = await run(who)
      expect(result.status, result.error?.statusText).toBe(200)
      expect(result.result).toEqual({ url: 'https://checkout.example.test/probe' })
      expect(sessions).toEqual([expect.objectContaining({
        lookupKey: 'probe-ticket',
        metadata: { eventId: 'ev-1' },
        idempotencyScope: 'event-ticket:ev-1',
      })])
    })
  }

  it.todo('Konto ohne Mitgliedschaft im Silo: dieselbe Teilnahme-Wache wie die übrigen Event-Routen (offen)')

  it('Event nicht käuflich (frei): 409, kein Stripe-Aufruf', async () => {
    const result = await run('member', { $id: 'ev-2', status: 'published', access: 'free' })
    expect(result.status).toBe(409)
    expect(sessions).toEqual([])
  })

  it('Event nicht veröffentlicht: 409, kein Stripe-Aufruf', async () => {
    const result = await run('member', { ...PAID_EVENT, status: 'draft' })
    expect(result.status).toBe(409)
    expect(sessions).toEqual([])
  })

  it('Ticket schon vorhanden: 409, kein Stripe-Aufruf', async () => {
    const result = await run('member', PAID_EVENT, true)
    expect(result.status).toBe(409)
    expect(sessions).toEqual([])
  })
})
