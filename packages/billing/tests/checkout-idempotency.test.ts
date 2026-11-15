import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { CHECKOUT_IDEMPOTENCY_KEY_LENGTH, checkoutIdempotencyKey, type CheckoutIdempotencyInput } from '../server/utils/checkoutIdempotency'

/**
 * BE-023 — KEIN ZWEITES BEZAHLBARES TICKET AUS ZWEI TABS.
 *
 * Zwei Aussagen:
 *  1. Der Schlüssel ist für denselben Kauf gleich und für JEDEN anderen
 *     verschieden. „Anders" heißt alles, was in die Stripe-Parameter eingeht —
 *     sonst lehnt Stripe den zweiten Aufruf als `idempotency_error` ab, statt
 *     eine neue Session zu bauen (Preisänderung, andere Sprache).
 *  2. Der Schlüssel kommt als REQUEST-OPTION bei Stripe an (zweites Argument,
 *     nicht in den Parametern) — und ohne Bereich kommt keiner an.
 */

const BASE: CheckoutIdempotencyInput = {
  scope: 'event-ticket:ev1',
  userId: 'u1',
  customerId: 'cus_1',
  priceId: 'price_1',
  successUrl: 'https://a.test/events/ev1?ticket=success',
  cancelUrl: 'https://a.test/events/ev1',
  metadata: { eventId: 'ev1', userId: 'u1' },
}

describe('checkoutIdempotencyKey', () => {
  it('gleich bei gleichen Eingaben — auch bei anderer Reihenfolge der Metadaten', () => {
    expect(checkoutIdempotencyKey(BASE)).toBe(checkoutIdempotencyKey({ ...BASE }))
    expect(checkoutIdempotencyKey(BASE))
      .toBe(checkoutIdempotencyKey({ ...BASE, metadata: { userId: 'u1', eventId: 'ev1' } }))
  })

  it.each([
    ['anderes Konto', { userId: 'u2' }],
    ['anderer Stripe-Kunde', { customerId: 'cus_2' }],
    ['anderes Event', { scope: 'event-ticket:ev2' }],
    ['anderer Preis', { priceId: 'price_2' }],
    ['andere Erfolgs-Adresse (Sprache)', { successUrl: 'https://a.test/de/events/ev1?ticket=success' }],
    ['andere Abbruch-Adresse', { cancelUrl: 'https://a.test/de/events/ev1' }],
    ['andere Metadaten', { metadata: { eventId: 'ev1', userId: 'u1', extra: 'x' } }],
  ] as const)('verschieden bei %s', (_label, change) => {
    expect(checkoutIdempotencyKey({ ...BASE, ...change })).not.toBe(checkoutIdempotencyKey(BASE))
  })

  it('verschiebt keine Grenze zwischen Feldern (kein Zusammenkleben)', () => {
    // 'ab' + 'c' und 'a' + 'bc' dürfen nicht denselben Text ergeben.
    expect(checkoutIdempotencyKey({ ...BASE, scope: 'ab', userId: 'c' }))
      .not.toBe(checkoutIdempotencyKey({ ...BASE, scope: 'a', userId: 'bc' }))
  })

  it('Länge fest und für Stripe zulässig, nur unkritische Zeichen', () => {
    const key = checkoutIdempotencyKey(BASE)
    expect(key).toHaveLength(CHECKOUT_IDEMPOTENCY_KEY_LENGTH)
    expect(key.length).toBeLessThanOrEqual(255)
    expect(key).toMatch(/^pk-checkout-[0-9a-f]{64}$/)
  })
})

// ── Der Weg bis Stripe: echter Helfer, nachgebildete Umgebung ────────────────

const create = vi.fn(async (_params: Record<string, unknown>, _options?: { idempotencyKey?: string }) =>
  ({ url: 'https://checkout.stripe.test/s/1' }))

vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('requireBillingEnabled', async () => ({}))
vi.stubGlobal('ensureCustomer', async () => ({ stripeCustomerId: 'cus_1' }))
vi.stubGlobal('resolveOneTimePrice', async () => ({ id: 'price_1' }))
vi.stubGlobal('useStripe', async () => ({ checkout: { sessions: { create } } }))
vi.stubGlobal('toStripeSafeError', (error: unknown) => { throw error })

const { createPaymentCheckoutSession } = await import('../server/utils/fulfillment')

const event = { context: { user: { $id: 'u1' } } } as unknown as H3Event
const input = {
  lookupKey: 'event_ticket_x',
  metadata: { eventId: 'ev1' },
  successUrl: BASE.successUrl,
  cancelUrl: BASE.cancelUrl,
}

describe('createPaymentCheckoutSession — Request-Option', () => {
  beforeEach(() => create.mockClear())

  it('mit Bereich: der Schlüssel aus checkoutIdempotencyKey kommt als zweites Argument an', async () => {
    await createPaymentCheckoutSession(event, { ...input, idempotencyScope: 'event-ticket:ev1' })
    expect(create).toHaveBeenCalledTimes(1)
    const [params, options] = create.mock.calls[0]!
    expect(options).toEqual({ idempotencyKey: checkoutIdempotencyKey(BASE) })
    // nicht versehentlich in die Parameter gerutscht
    expect(params).not.toHaveProperty('idempotencyKey')
  })

  it('zwei Aufrufe mit gleichem Bereich ⇒ derselbe Schlüssel', async () => {
    await createPaymentCheckoutSession(event, { ...input, idempotencyScope: 'event-ticket:ev1' })
    await createPaymentCheckoutSession(event, { ...input, idempotencyScope: 'event-ticket:ev1' })
    expect(create.mock.calls[0]![1]).toEqual(create.mock.calls[1]![1])
  })

  it('ohne Bereich: kein Schlüssel — Verhalten wie bisher', async () => {
    await createPaymentCheckoutSession(event, input)
    expect(create.mock.calls[0]![1]).toBeUndefined()
  })
})
