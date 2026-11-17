import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import type { BillingCustomerRow } from '../shared/types/billing'
import { CUSTOMER_IDEMPOTENCY_KEY_LENGTH, customerIdempotencyKey } from '../server/utils/checkoutIdempotency'

/**
 * AR1 b — DIE ZWEI RESTE DES TICKET-KAUFS (nach BE-023 / GA1 P26).
 *
 *  (a) Zwei GLEICHZEITIGE erste Käufe eines Kontos ⇒ EIN Stripe-Kunde: beide
 *      `customers.create` tragen denselben Idempotenz-Schlüssel, beide Aufrufe
 *      enden mit derselben gespeicherten Kunden-Id, und der gemeinsame Kunde
 *      wird NICHT als „Doppel" gelöscht.
 *  (b) Erneuter Klick, während die Session bezahlt, das Ticket aber noch
 *      nicht ausgestellt ist ⇒ 409 mit `data.code: 'already_paid'`, keine
 *      zweite Session. Gegenprobe: ohne bezahlte Session läuft der normale Weg.
 *
 * Alles mit gestellten Stripe- und Appwrite-Antworten — kein Netz, kein
 * Schlüssel.
 */

// ── Nachgebildetes Stripe: Idempotenz wie bei Stripe (gleicher Schlüssel ⇒
//    dieselbe Antwort, solange der Schlüssel „lebt") ──────────────────────────

let customerSeq = 0
let keyStore = new Map<string, { id: string }>()
/** Simuliert „Schlüssel abgelaufen": jeder Aufruf bekommt einen neuen Kunden. */
let honourKeys = true

const customersCreate = vi.fn(async (_params: Record<string, unknown>, options?: { idempotencyKey?: string }) => {
  // Netzlaufzeit: beide gleichzeitigen Aufrufe sind hier, bevor einer zurück ist
  await new Promise(resolve => setTimeout(resolve, 5))
  const key = options?.idempotencyKey
  if (honourKeys && key && keyStore.has(key)) return keyStore.get(key)!
  const customer = { id: `cus_${++customerSeq}` }
  if (key) keyStore.set(key, customer)
  return customer
})
const customersDel = vi.fn(async (_id: string) => ({ deleted: true }))

const sessionsCreate = vi.fn(async (_params: Record<string, unknown>, _options?: { idempotencyKey?: string }) =>
  ({ url: 'https://checkout.stripe.test/s/1' }))
let completedSessions: Array<{ metadata: Record<string, string> | null, payment_status: string }> = []
const sessionsList = vi.fn(async (_params: Record<string, unknown>) => ({ data: completedSessions }))

// ── Nachgebildetes Appwrite: billing_customers mit Unique-Index uq_user ──────

let rows: BillingCustomerRow[] = []
const listRows = vi.fn(async ({ queries }: { queries: string[] }) => {
  await Promise.resolve()
  const userId = JSON.parse(queries[0]!).values[0] as string
  return { rows: rows.filter(row => row.userId === userId) }
})
const createRow = vi.fn(async ({ data }: { data: { userId: string, stripeCustomerId: string, email: string } }) => {
  if (rows.some(row => row.userId === data.userId || row.stripeCustomerId === data.stripeCustomerId)) {
    throw Object.assign(new Error('Row already exists'), { code: 409 })
  }
  const row = { $id: `row_${rows.length + 1}`, ...data } as unknown as BillingCustomerRow
  rows.push(row)
  return row
})

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'db', appwriteProjectId: 'proj' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB: { listRows, createRow } }))
vi.stubGlobal('useStripe', async () => ({
  customers: { create: customersCreate, del: customersDel },
  checkout: { sessions: { create: sessionsCreate, list: sessionsList } },
}))
vi.stubGlobal('toStripeSafeError', (error: unknown) => { throw error })
vi.stubGlobal('toH3Error', (error: unknown) => { throw error })
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('requireBillingEnabled', async () => ({}))
vi.stubGlobal('resolveOneTimePrice', async () => ({ id: 'price_1' }))

const { ensureCustomer } = await import('../server/utils/billingCustomer')
// createPaymentCheckoutSession ruft ensureCustomer als Auto-Import — hier
// derselbe echte Helfer
vi.stubGlobal('ensureCustomer', ensureCustomer)
const { createPaymentCheckoutSession, findPaidCheckoutSession, ALREADY_PAID_REASON } = await import('../server/utils/fulfillment')

const user = { $id: 'u1', email: 'a@b.test', name: 'Ana' } as unknown as Models.User<Models.Preferences>
const event = { context: { user } } as unknown as H3Event

beforeEach(() => {
  customerSeq = 0
  keyStore = new Map()
  honourKeys = true
  rows = []
  completedSessions = []
  vi.clearAllMocks()
})

describe('customerIdempotencyKey', () => {
  const base = { projectId: 'proj', userId: 'u1', email: 'a@b.test', name: 'Ana' }

  it('gleich für dasselbe Konto mit denselben Werten', () => {
    expect(customerIdempotencyKey(base)).toBe(customerIdempotencyKey({ ...base }))
  })

  it.each([
    ['anderes Projekt', { projectId: 'proj2' }],
    ['anderes Konto', { userId: 'u2' }],
    ['andere E-Mail', { email: 'c@d.test' }],
    ['anderer Name', { name: 'Bea' }],
  ])('verschieden bei %s', (_label, change) => {
    expect(customerIdempotencyKey({ ...base, ...change })).not.toBe(customerIdempotencyKey(base))
  })

  it('passt in Stripes Grenze von 255 Zeichen', () => {
    const key = customerIdempotencyKey(base)
    expect(key).toHaveLength(CUSTOMER_IDEMPOTENCY_KEY_LENGTH)
    expect(key).toMatch(/^pk-customer-[0-9a-f]{64}$/)
  })
})

describe('(a) ensureCustomer — zwei gleichzeitige erste Käufe', () => {
  it('ein Kunde: derselbe Schlüssel, dieselbe gespeicherte Id, nichts gelöscht', async () => {
    const [a, b] = await Promise.all([ensureCustomer(event, user), ensureCustomer(event, user)])

    // beide sahen „keiner da" und fragten Stripe — mit DEMSELBEN Schlüssel
    expect(customersCreate).toHaveBeenCalledTimes(2)
    const keys = customersCreate.mock.calls.map(call => call[1]?.idempotencyKey)
    expect(keys[0]).toBe(customerIdempotencyKey({ projectId: 'proj', userId: 'u1', email: 'a@b.test', name: 'Ana' }))
    expect(keys[1]).toBe(keys[0])
    // Stripe hat genau einen Kunden angelegt
    expect(customerSeq).toBe(1)
    // eine Zeile, beide Aufrufe mit derselben Id
    expect(rows).toHaveLength(1)
    expect(a.stripeCustomerId).toBe('cus_1')
    expect(b.stripeCustomerId).toBe('cus_1')
    // der gemeinsame Kunde ist KEIN Doppel — nie löschen
    expect(customersDel).not.toHaveBeenCalled()
  })

  it('zwei gleichzeitige erste Ticket-Käufe ⇒ dieselbe Session-Option (derselbe Kunde im Schlüssel)', async () => {
    const input = {
      lookupKey: 'event_ticket_x',
      metadata: { eventId: 'ev1' },
      successUrl: 'https://a.test/events/ev1?ticket=success',
      cancelUrl: 'https://a.test/events/ev1',
      idempotencyScope: 'event-ticket:ev1',
    }
    await Promise.all([createPaymentCheckoutSession(event, input), createPaymentCheckoutSession(event, input)])
    expect(sessionsCreate).toHaveBeenCalledTimes(2)
    expect(sessionsCreate.mock.calls[0]![0].customer).toBe('cus_1')
    expect(sessionsCreate.mock.calls[1]![0].customer).toBe('cus_1')
    expect(sessionsCreate.mock.calls[0]![1]).toEqual(sessionsCreate.mock.calls[1]![1])
  })

  it('Gegenprobe Schlüssel abgelaufen (zwei verschiedene Kunden): der Verlierer räumt NUR seinen eigenen ab', async () => {
    honourKeys = false
    const [a, b] = await Promise.all([ensureCustomer(event, user), ensureCustomer(event, user)])
    expect(customerSeq).toBe(2)
    expect(rows).toHaveLength(1)
    expect(a.stripeCustomerId).toBe(rows[0]!.stripeCustomerId)
    expect(b.stripeCustomerId).toBe(rows[0]!.stripeCustomerId)
    expect(customersDel).toHaveBeenCalledTimes(1)
    expect(customersDel.mock.calls[0]![0]).not.toBe(rows[0]!.stripeCustomerId)
  })

  it('Normalweg: steht die Zeile, fragt niemand Stripe', async () => {
    rows = [{ $id: 'row_1', userId: 'u1', stripeCustomerId: 'cus_alt', email: 'a@b.test' } as unknown as BillingCustomerRow]
    const row = await ensureCustomer(event, user)
    expect(row.stripeCustomerId).toBe('cus_alt')
    expect(customersCreate).not.toHaveBeenCalled()
  })
})

describe('(b) erneuter Klick zwischen Bezahlen und Ausstellen', () => {
  const input = {
    lookupKey: 'event_ticket_x',
    metadata: { eventId: 'ev1' },
    successUrl: 'https://a.test/events/ev1?ticket=success',
    cancelUrl: 'https://a.test/events/ev1',
    idempotencyScope: 'event-ticket:ev1',
  }

  it('bezahlte Session für genau diesen Kauf ⇒ 409 already_paid, keine Session', async () => {
    completedSessions = [{ metadata: { eventId: 'ev1', userId: 'u1' }, payment_status: 'paid' }]
    const error = await createPaymentCheckoutSession(event, input).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ status: 409, data: { code: ALREADY_PAID_REASON } })
    expect(ALREADY_PAID_REASON).toBe('already_paid')
    expect(sessionsCreate).not.toHaveBeenCalled()
    // gefragt wurde nach den ABGESCHLOSSENEN Sessions dieses Kunden
    expect(sessionsList).toHaveBeenCalledWith({ customer: 'cus_1', status: 'complete', limit: 100 })
  })

  it('auch aus der anderen Sprache (andere Rückkehr-Adresse) ⇒ already_paid', async () => {
    completedSessions = [{ metadata: { eventId: 'ev1', userId: 'u1' }, payment_status: 'paid' }]
    const error = await createPaymentCheckoutSession(event, {
      ...input,
      successUrl: 'https://a.test/de/events/ev1?ticket=success',
      cancelUrl: 'https://a.test/de/events/ev1',
    }).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ status: 409, data: { code: 'already_paid' } })
    expect(sessionsCreate).not.toHaveBeenCalled()
  })

  it('Gegenprobe: ohne bezahlte Session läuft der normale Weg', async () => {
    completedSessions = []
    await expect(createPaymentCheckoutSession(event, input)).resolves.toBe('https://checkout.stripe.test/s/1')
    expect(sessionsCreate).toHaveBeenCalledTimes(1)
  })

  it('Gegenprobe: bezahlte Session eines ANDEREN Events oder unbezahlte ⇒ normaler Weg', async () => {
    completedSessions = [
      { metadata: { eventId: 'ev2', userId: 'u1' }, payment_status: 'paid' },
      { metadata: { eventId: 'ev1', userId: 'u1' }, payment_status: 'unpaid' },
    ]
    await expect(createPaymentCheckoutSession(event, input)).resolves.toBe('https://checkout.stripe.test/s/1')
    expect(sessionsCreate).toHaveBeenCalledTimes(1)
  })

  it('ohne Bereich wird Stripe nicht nach bezahlten Sessions gefragt (Verhalten wie bisher)', async () => {
    const { idempotencyScope: _scope, ...withoutScope } = input
    await createPaymentCheckoutSession(event, withoutScope)
    expect(sessionsList).not.toHaveBeenCalled()
    expect(sessionsCreate).toHaveBeenCalledTimes(1)
  })
})

describe('findPaidCheckoutSession (pur)', () => {
  const metadata = { eventId: 'ev1', userId: 'u1' }

  it('paid und no_payment_required zählen, unpaid nicht', () => {
    expect(findPaidCheckoutSession([{ metadata, payment_status: 'paid' }], metadata)).not.toBeNull()
    expect(findPaidCheckoutSession([{ metadata, payment_status: 'no_payment_required' }], metadata)).not.toBeNull()
    expect(findPaidCheckoutSession([{ metadata, payment_status: 'unpaid' }], metadata)).toBeNull()
  })

  it('JEDER Metadaten-Schlüssel muss passen — fremdes Konto zählt nicht', () => {
    expect(findPaidCheckoutSession([{ metadata: { eventId: 'ev1', userId: 'u2' }, payment_status: 'paid' }], metadata)).toBeNull()
    expect(findPaidCheckoutSession([{ metadata: null, payment_status: 'paid' }], metadata)).toBeNull()
  })

  it('leere Metadaten treffen nie (sonst wäre JEDE Session „dieser Kauf")', () => {
    expect(findPaidCheckoutSession([{ metadata: {}, payment_status: 'paid' }], {})).toBeNull()
  })
})
