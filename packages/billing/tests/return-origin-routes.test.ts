import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * WOHIN SCHICKT STRIPE ZURÜCK? — an den geladenen Routen (SE1 f, 2026-11-17).
 *
 * Die Regel selbst prüft `checkout-fulfillment-gate.test.ts` pur. Hier geht
 * es um ihre ANWENDUNG: Checkout und Kundenportal bauen ihre Rückkehr-
 * Adressen aus der aktiven eigenen Domain der Site, sonst aus der
 * konfigurierten Adresse — nie aus dem Namen der Anfrage, solange es eine
 * feste Wahrheit gibt.
 *
 * Stripe ist gestellt: es geht kein Aufruf hinaus, der Test liest nur, was
 * die Route an Stripe GESCHICKT hätte.
 */

type Handler = (event: object) => Promise<{ url: string }>

const BAD = 'https://boese.example'

let siteOrigin: string | null
let publicConfig: { appUrl?: string, i18n?: { baseUrl?: string }, appwriteDatabaseId: string }
let requestOrigin: string
let sent: Record<string, unknown>[]
const logged = vi.fn()

beforeEach(async () => {
  siteOrigin = null
  publicConfig = { appUrl: 'https://standard.example', i18n: { baseUrl: '' }, appwriteDatabaseId: 'db' }
  requestOrigin = BAD
  sent = []
  logged.mockReset()
  vi.resetModules()

  vi.doMock('../../core/server/utils/siteOrigin', () => ({ resolveSiteOrigin: async () => siteOrigin }))

  const stripe = {
    checkout: { sessions: { create: async (input: Record<string, unknown>) => { sent.push(input); return { url: 'https://stripe.example/c' } } } },
    billingPortal: { sessions: { create: async (input: Record<string, unknown>) => { sent.push(input); return { url: 'https://stripe.example/p' } } } },
  }
  const { billingReturnOrigin } = await import('../server/utils/stripe')

  vi.stubGlobal('defineEventHandler', (handler: Handler) => handler)
  vi.stubGlobal('createError', (input: { status: number, statusText: string }) => Object.assign(new Error(input.statusText), input))
  vi.stubGlobal('useRuntimeConfig', () => ({ public: publicConfig }))
  vi.stubGlobal('getRequestURL', () => new URL(`${requestOrigin}/api/billing/x`))
  vi.stubGlobal('getQuery', () => ({ locale: 'de' }))
  vi.stubGlobal('logEvent', logged)
  vi.stubGlobal('billingReturnOrigin', billingReturnOrigin)
  vi.stubGlobal('requireBillingEnabled', async () => ({
    plans: [{ id: 'pro', lookupKeys: { monthly: 'probe_monthly', yearly: 'probe_yearly' } }],
  }))
  vi.stubGlobal('readValidatedBody', async () => ({ planId: 'pro', interval: 'monthly' }))
  vi.stubGlobal('getActiveSubscription', async () => null)
  vi.stubGlobal('ensureCustomer', async () => ({ stripeCustomerId: 'cus_probe' }))
  vi.stubGlobal('resolvePlanPrice', async () => ({ id: 'price_probe' }))
  vi.stubGlobal('useStripe', async () => stripe)
  vi.stubGlobal('toStripeSafeError', (error: unknown) => { throw error })
  vi.stubGlobal('createAdminClient', () => ({
    tablesDB: { listRows: async () => ({ rows: [{ stripeCustomerId: 'cus_probe' }] }) },
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.doUnmock('../../core/server/utils/siteOrigin')
})

const event = () => ({ context: { user: { $id: 'konto-probe' } } })
const guest = () => ({ context: {} })
const checkout = async () => (await import('../server/api/billing/checkout.post')).default as unknown as Handler
const portal = async () => (await import('../server/api/billing/portal.post')).default as unknown as Handler

describe('wer darf: nur ein angemeldetes Konto, und nur für sich', () => {
  it('Gast ⇒ 401 an beiden Routen, nichts geht an Stripe', async () => {
    await expect((await checkout())(guest())).rejects.toMatchObject({ status: 401 })
    await expect((await portal())(guest())).rejects.toMatchObject({ status: 401 })
    expect(sent).toEqual([])
  })

  it('Zahlungen abgeschaltet ⇒ 404 vor allem anderen', async () => {
    vi.stubGlobal('requireBillingEnabled', async () => { throw Object.assign(new Error('Not found'), { status: 404 }) })
    await expect((await checkout())(event())).rejects.toMatchObject({ status: 404 })
    await expect((await portal())(event())).rejects.toMatchObject({ status: 404 })
    expect(sent).toEqual([])
  })

  it('Checkout mit laufendem Abo ⇒ 409, nichts geht an Stripe', async () => {
    vi.stubGlobal('getActiveSubscription', async () => ({ status: 'active' }))
    await expect((await checkout())(event())).rejects.toMatchObject({ status: 409 })
    expect(sent).toEqual([])
  })

  it('Checkout und Portal tragen das Konto der SITZUNG — der Kunde wird über dessen Id gesucht', async () => {
    const lookups: unknown[] = []
    vi.stubGlobal('ensureCustomer', async (_event: object, user: { $id: string }) => {
      lookups.push(user.$id)
      return { stripeCustomerId: 'cus_probe' }
    })
    vi.stubGlobal('createAdminClient', () => ({
      tablesDB: {
        listRows: async ({ queries }: { queries: string[] }) => {
          lookups.push(queries.find(query => query.includes('userId')) ?? '')
          return { rows: [{ stripeCustomerId: 'cus_probe' }] }
        },
      },
    }))
    await (await checkout())(event())
    await (await portal())(event())
    expect(lookups[0]).toBe('konto-probe')
    expect(String(lookups[1])).toContain('konto-probe')
    expect(sent[0]).toMatchObject({ client_reference_id: 'konto-probe', metadata: { userId: 'konto-probe' } })
  })

  it('Portal ohne Kundenkonto bei Stripe ⇒ 404', async () => {
    vi.stubGlobal('createAdminClient', () => ({ tablesDB: { listRows: async () => ({ rows: [] }) } }))
    await expect((await portal())(event())).rejects.toMatchObject({ status: 404 })
    expect(sent).toEqual([])
  })
})

describe('Rückkehr-Adressen von Stripe', () => {
  it('Checkout: aktive eigene Domain ⇒ beide Adressen beginnen mit ihr', async () => {
    siteOrigin = 'https://kunde.example'
    await (await checkout())(event())
    expect(sent[0]).toMatchObject({
      success_url: 'https://kunde.example/de/account/billing?checkout=success',
      cancel_url: 'https://kunde.example/de/pricing',
    })
  })

  it('Portal: aktive eigene Domain ⇒ die Rückkehr-Adresse beginnt mit ihr', async () => {
    siteOrigin = 'https://kunde.example'
    await (await portal())(event())
    expect(sent[0]).toMatchObject({ return_url: 'https://kunde.example/de/account/billing' })
  })

  it('GEGENPROBE: ohne eigene Domain gilt die feste Adresse der App — nie der Name der Anfrage', async () => {
    await (await checkout())(event())
    await (await portal())(event())
    expect(sent[0]).toMatchObject({ success_url: 'https://standard.example/de/account/billing?checkout=success' })
    expect(sent[1]).toMatchObject({ return_url: 'https://standard.example/de/account/billing' })
    expect(JSON.stringify(sent)).not.toContain('boese.example')
    expect(logged).not.toHaveBeenCalled()
  })

  it('die Basis-URL schlägt die feste Adresse, die eigene Domain schlägt beide', async () => {
    publicConfig.i18n = { baseUrl: 'https://basis.example' }
    await (await portal())(event())
    expect(sent[0]).toMatchObject({ return_url: 'https://basis.example/de/account/billing' })
    siteOrigin = 'https://kunde.example'
    await (await portal())(event())
    expect(sent[1]).toMatchObject({ return_url: 'https://kunde.example/de/account/billing' })
  })

  it('nichts eingestellt auf einem öffentlichen Host ⇒ Fehlerzeile, die Zahlung geht trotzdem', async () => {
    publicConfig = { appUrl: '', i18n: { baseUrl: '' }, appwriteDatabaseId: 'db' }
    requestOrigin = 'https://oeffentlich.example'
    await (await portal())(event())
    expect(sent[0]).toMatchObject({ return_url: 'https://oeffentlich.example/de/account/billing' })
    expect(logged.mock.calls).toEqual([['error', 'billing.return_origin_unconfigured', {}]])
  })

  it('nichts eingestellt auf localhost ⇒ der lokale Name, keine Fehlerzeile', async () => {
    publicConfig = { appUrl: '', i18n: { baseUrl: '' }, appwriteDatabaseId: 'db' }
    requestOrigin = 'http://localhost:3001'
    await (await portal())(event())
    expect(sent[0]).toMatchObject({ return_url: 'http://localhost:3001/de/account/billing' })
    expect(logged).not.toHaveBeenCalled()
  })
})
