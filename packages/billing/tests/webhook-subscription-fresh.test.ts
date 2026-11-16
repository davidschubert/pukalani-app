import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type Stripe from 'stripe'
import { invoiceSubscriptionId, isStripeResourceMissing, subscriptionForEvent, subscriptionReadFailure } from '../server/utils/webhookMapping'

/**
 * BE-016 — DIE REIHENFOLGE DER STRIPE-EREIGNISSE ENTSCHEIDET NICHTS MEHR.
 *
 * Die drei `customer.subscription.*`-Zweige lesen das Abo FRISCH bei Stripe und
 * schreiben diesen Stand — nicht den Schnappschuss des Ereignisses. Geprüft
 * wird der ECHTE Handler (`server/api/stripe/webhook.post.ts`) mit einem
 * nachgebildeten Stripe (`constructEvent` reicht das Ereignis durch,
 * `subscriptions.retrieve` liefert den Stand, den der Test setzt) und einer
 * In-Memory-Ablage für `billing_subscriptions`.
 *
 * Vor BE-016 schrieben (a) und (b) den älteren Schnappschuss über den neueren
 * (`isStale` verwirft nur ältere SEKUNDEN), und (d) endete mit 200, weil gar
 * nicht gelesen wurde.
 */

// ── Ablage ──────────────────────────────────────────────────────────────────

interface SubRow { $id: string, [key: string]: unknown }
const rows = new Map<string, SubRow>()
let nextId = 0

interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

const tablesDB = {
  listRows: vi.fn(async ({ queries = [] }: { tableId: string, queries?: string[] }) => {
    const parsed = queries.map(query => JSON.parse(query) as ParsedQuery)
    let found = [...rows.values()]
    for (const query of parsed) {
      if (query.method === 'equal') found = found.filter(row => (query.values ?? []).includes(row[query.attribute ?? '']))
    }
    return { rows: found.map(row => ({ ...row })), total: found.length }
  }),
  createRow: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const row = { ...data, $id: `row-${++nextId}` }
    rows.set(row.$id, row)
    return { ...row }
  }),
  updateRow: vi.fn(async ({ rowId, data }: { rowId: string, data: Record<string, unknown> }) => {
    const row = rows.get(rowId)
    if (!row) throw Object.assign(new Error('Row not found'), { code: 404 })
    Object.assign(row, data)
    return { ...row }
  }),
}

// ── Stripe ──────────────────────────────────────────────────────────────────

/** Was Stripe JETZT über das Abo weiß — `retrieve` liefert genau das. */
let stripeState: Stripe.Subscription | null = null
let retrieveError: unknown = null
const retrieve = vi.fn(async (_id: string) => {
  if (retrieveError) throw retrieveError
  if (!stripeState) throw Object.assign(new Error('No such subscription'), { statusCode: 404, code: 'resource_missing' })
  return stripeState
})
let currentEvent: Stripe.Event

const fulfillments = vi.fn(async (_event: H3Event, _update: { status: string }) => {})

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('requireBillingEnabled', async () => ({}))
vi.stubGlobal('resolveStripeWebhookSecret', async () => ({ value: 'whsec_test', source: 'env' }))
vi.stubGlobal('warnMisconfiguredOnce', () => {})
vi.stubGlobal('readRawBody', async () => '{}')
vi.stubGlobal('getHeader', () => 'sig')
vi.stubGlobal('useStripe', async () => ({
  webhooks: { constructEvent: () => currentEvent },
  subscriptions: { retrieve },
}))
vi.stubGlobal('getBillingConfig', async () => ({ enabled: true, currency: 'eur', trialDays: 0, plans: [] }))
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('runSubscriptionFulfillments', fulfillments)
vi.stubGlobal('runCheckoutFulfillments', async () => {})
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('notify', async () => {})
vi.stubGlobal('resolveEmailPrefs', () => ({}))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))

const handler = (await import('../server/api/stripe/webhook.post')).default as unknown as (event: H3Event) => Promise<unknown>
const event = { context: {} } as unknown as H3Event

// ── Bausteine ───────────────────────────────────────────────────────────────

const SECOND = 1_800_000_000

function subscription(status: string, overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status,
    cancel_at_period_end: false,
    trial_end: null,
    items: { data: [{ current_period_end: SECOND + 3600, price: { id: 'price_1', lookup_key: 'pk_personal_monthly' } }] },
    metadata: { userId: 'u1' },
    ...overrides,
  } as unknown as Stripe.Subscription
}

function subscriptionEvent(type: 'created' | 'updated' | 'deleted', snapshot: Stripe.Subscription, id = `evt_${type}`): Stripe.Event {
  return {
    id,
    type: `customer.subscription.${type}`,
    created: SECOND,
    data: { object: snapshot },
  } as unknown as Stripe.Event
}

async function deliver(stripeEvent: Stripe.Event): Promise<unknown> {
  currentEvent = stripeEvent
  return handler(event)
}

function storedStatus(): unknown {
  const all = [...rows.values()]
  expect(all).toHaveLength(1)
  return all[0]?.status
}

beforeEach(() => {
  rows.clear()
  nextId = 0
  stripeState = null
  retrieveError = null
  vi.clearAllMocks()
})

// ── Route ───────────────────────────────────────────────────────────────────

describe('customer.subscription.* — frisch gelesen statt Schnappschuss', () => {
  it('(a) updated (active), danach created (incomplete) derselben Sekunde ⇒ bleibt active', async () => {
    stripeState = subscription('active')
    await deliver(subscriptionEvent('updated', subscription('active')))
    await deliver(subscriptionEvent('created', subscription('incomplete')))

    expect(storedStatus()).toBe('active')
    expect(retrieve).toHaveBeenCalledTimes(2)
    expect(fulfillments.mock.calls.map(([, update]) => update.status)).toEqual(['active', 'active'])
  })

  it('(b) deleted, danach ein spätes updated (Schnappschuss active) derselben Sekunde ⇒ bleibt canceled', async () => {
    stripeState = subscription('canceled')
    await deliver(subscriptionEvent('deleted', subscription('canceled')))
    await deliver(subscriptionEvent('updated', subscription('active')))

    expect(storedStatus()).toBe('canceled')
    expect(fulfillments).toHaveBeenCalledTimes(2)
    expect(fulfillments.mock.calls.every(([, update]) => update.status === 'canceled')).toBe(true)
  })

  it('(c) dasselbe Ereignis zweimal zugestellt ⇒ die zweite Zustellung ändert nichts', async () => {
    stripeState = subscription('active')
    const once = subscriptionEvent('updated', subscription('active'))
    await deliver(once)
    const after = JSON.stringify([...rows.values()])
    await deliver(once)

    expect(JSON.stringify([...rows.values()])).toBe(after)
    expect(tablesDB.createRow).toHaveBeenCalledTimes(1)
  })

  it('(d) Stripe antwortet beim Lesen mit einem anderen Fehler als 404 ⇒ 500, nichts geschrieben', async () => {
    retrieveError = Object.assign(new Error('api down'), { statusCode: 500, type: 'StripeAPIError' })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(deliver(subscriptionEvent('updated', subscription('active')))).rejects.toMatchObject({ status: 500 })
    consoleError.mockRestore()

    expect(rows.size).toBe(0)
    expect(fulfillments).not.toHaveBeenCalled()
  })

  it('(d2) auch ein 404 bei created/updated wird geworfen — nur deleted fällt auf den Schnappschuss', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(deliver(subscriptionEvent('updated', subscription('active')))).rejects.toMatchObject({ status: 500 })
    consoleError.mockRestore()
    expect(rows.size).toBe(0)
  })

  it('(e) deleted und Stripe kennt das Abo nicht (404) ⇒ der Schnappschuss wird geschrieben', async () => {
    stripeState = null
    await deliver(subscriptionEvent('deleted', subscription('canceled')))

    expect(storedStatus()).toBe('canceled')
    expect(fulfillments.mock.calls.map(([, update]) => update.status)).toEqual(['canceled'])
  })
})

// ── Reine Regeln ────────────────────────────────────────────────────────────

describe('subscriptionReadFailure', () => {
  const missing = { statusCode: 404, code: 'resource_missing' }

  it('nur deleted + 404 nimmt den Schnappschuss', () => {
    expect(subscriptionReadFailure('customer.subscription.deleted', missing)).toBe('use_snapshot')
    expect(subscriptionReadFailure('customer.subscription.deleted', { code: 'resource_missing' })).toBe('use_snapshot')
    expect(subscriptionReadFailure('customer.subscription.deleted', { statusCode: 404 })).toBe('use_snapshot')
  })

  it('alles andere wird geworfen', () => {
    expect(subscriptionReadFailure('customer.subscription.updated', missing)).toBe('rethrow')
    expect(subscriptionReadFailure('customer.subscription.created', missing)).toBe('rethrow')
    expect(subscriptionReadFailure('customer.subscription.deleted', { statusCode: 500 })).toBe('rethrow')
    expect(subscriptionReadFailure('customer.subscription.deleted', new Error('network'))).toBe('rethrow')
    expect(subscriptionReadFailure('customer.subscription.deleted', null)).toBe('rethrow')
  })

  it('isStripeResourceMissing liest nur Felder, nie den Text', () => {
    expect(isStripeResourceMissing(new Error('No such subscription'))).toBe(false)
    expect(isStripeResourceMissing('resource_missing')).toBe(false)
  })
})

describe('subscriptionForEvent', () => {
  it('liefert den frischen Stand und meldet die Quelle', async () => {
    const fresh = subscription('active')
    const result = await subscriptionForEvent('customer.subscription.created', subscription('incomplete'), async () => fresh)
    expect(result).toEqual({ subscription: fresh, source: 'fresh' })
  })

  it('fällt nur bei deleted + 404 auf den Schnappschuss', async () => {
    const snapshot = subscription('canceled')
    const missing = async () => { throw Object.assign(new Error('gone'), { statusCode: 404 }) }
    await expect(subscriptionForEvent('customer.subscription.deleted', snapshot, missing))
      .resolves.toEqual({ subscription: snapshot, source: 'snapshot' })
    await expect(subscriptionForEvent('customer.subscription.updated', snapshot, missing)).rejects.toThrow('gone')
  })
})

describe('invoiceSubscriptionId — beide Formen der Rechnung', () => {
  const invoice = (shape: Record<string, unknown>) => shape as unknown as Stripe.Invoice

  it('Form seit 2025 (Basil): parent.subscription_details.subscription', () => {
    expect(invoiceSubscriptionId(invoice({ parent: { subscription_details: { subscription: 'sub_new' } } }))).toBe('sub_new')
    expect(invoiceSubscriptionId(invoice({ parent: { subscription_details: { subscription: { id: 'sub_obj' } } } }))).toBe('sub_obj')
  })

  it('ältere Form: subscription direkt an der Rechnung', () => {
    expect(invoiceSubscriptionId(invoice({ subscription: 'sub_old' }))).toBe('sub_old')
    expect(invoiceSubscriptionId(invoice({ subscription: { id: 'sub_old_obj' } }))).toBe('sub_old_obj')
  })

  it('die neue Form hat Vorrang, ohne Bezug ⇒ null', () => {
    expect(invoiceSubscriptionId(invoice({ parent: { subscription_details: { subscription: 'sub_new' } }, subscription: 'sub_old' }))).toBe('sub_new')
    expect(invoiceSubscriptionId(invoice({ parent: null, subscription: null }))).toBeNull()
    expect(invoiceSubscriptionId(invoice({}))).toBeNull()
  })
})
