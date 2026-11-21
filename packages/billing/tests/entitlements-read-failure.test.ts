import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { BILLING_UNAVAILABLE_CODE, type BillingSubscriptionRow } from '../shared/types/billing'
import { getActiveSubscription, getEntitledProducts } from '../server/utils/entitlements'

/**
 * EIN LESEFEHLER IST „UNBEKANNT", NIE „KEIN ABO" (Bahn 2, Q13-Stelle 4).
 *
 * Vorher machte `getActiveSubscription` aus jedem Lesefehler eine leere Liste:
 * Zahlende verloren für diese Anfrage ihr Bezahltes, und der Checkout hätte
 * ein zweites Abo verkauft. Jetzt: 503 mit Grund, nichts gemerkt.
 * Gegenprobe: der Normalfall liefert das aktive Abo und merkt es je Anfrage.
 */

let failWith: unknown = null
const subscriptions: BillingSubscriptionRow[] = []
const listRows = vi.fn(async () => {
  if (failWith) throw failWith
  return { rows: subscriptions }
})
const logged: Array<{ level: string, name: string, data: Record<string, unknown> }> = []

const g = globalThis as Record<string, unknown>
g.useRuntimeConfig = () => ({ public: { appwriteDatabaseId: 'db' } })
g.createAdminClient = () => ({ tablesDB: { listRows } })
g.createError = (input: { status: number, statusText: string, data?: unknown }) =>
  Object.assign(new Error(input.statusText), input)
g.logEvent = (level: string, name: string, data: Record<string, unknown>) => { logged.push({ level, name, data }) }
g.getBillingConfig = async () => ({ plans: [{ id: 'pro', products: ['courses'] }] })

function makeEvent(): H3Event {
  return { context: { user: { $id: 'u-1' } } } as unknown as H3Event
}

beforeEach(() => {
  failWith = null
  subscriptions.length = 0
  logged.length = 0
  listRows.mockClear()
})

describe('getActiveSubscription bei einem Lesefehler', () => {
  it('antwortet 503 billing_unavailable statt „kein Abo"', async () => {
    failWith = Object.assign(new Error('connection reset'), { code: 500, type: 'general_unknown' })
    await expect(getActiveSubscription(makeEvent())).rejects.toMatchObject({
      status: 503,
      data: { code: BILLING_UNAVAILABLE_CODE },
    })
    expect(logged).toEqual([expect.objectContaining({ level: 'error', name: 'billing.subscription_read_failed' })])
    // Die Meldung des Fehlers reist nie ins Protokoll.
    expect(JSON.stringify(logged)).not.toContain('connection reset')
  })

  it('getEntitledProducts wirft dieselbe 503 — keine leere Produktliste', async () => {
    failWith = new Error('timeout')
    await expect(getEntitledProducts(makeEvent())).rejects.toMatchObject({ status: 503 })
  })

  it('merkt sich nach einem Fehler nichts: der zweite Versuch derselben Anfrage fragt neu', async () => {
    const event = makeEvent()
    failWith = new Error('timeout')
    await expect(getActiveSubscription(event)).rejects.toMatchObject({ status: 503 })
    failWith = null
    subscriptions.push({ $id: 's-1', userId: 'u-1', status: 'active', planId: 'pro' } as BillingSubscriptionRow)
    await expect(getActiveSubscription(event)).resolves.toMatchObject({ $id: 's-1' })
    expect(listRows).toHaveBeenCalledTimes(2)
  })
})

describe('Gegenprobe: der Normalfall', () => {
  it('liefert das aktive Abo und dessen Produkte, gemerkt je Anfrage', async () => {
    subscriptions.push({ $id: 's-1', userId: 'u-1', status: 'active', planId: 'pro' } as BillingSubscriptionRow)
    const event = makeEvent()
    await expect(getEntitledProducts(event)).resolves.toEqual(['courses'])
    await expect(getActiveSubscription(event)).resolves.toMatchObject({ $id: 's-1' })
    expect(listRows).toHaveBeenCalledTimes(1)
  })

  it('ohne Abo-Zeile ist es wirklich „kein Abo" (null, keine 503)', async () => {
    await expect(getActiveSubscription(makeEvent())).resolves.toBeNull()
    await expect(getEntitledProducts(makeEvent())).resolves.toEqual([])
  })
})
