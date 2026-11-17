import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeInstanceRoleGate, probeAs } from '../../core/tests/support/instanceRoleGate'
import { resetCommunityWorld, userIdOf, type RouteProbe } from '../../core/tests/support/participationHarness'
import { getActiveSubscription, getEntitledProducts } from '../server/utils/entitlements'
import { getBillingConfig, requireBillingEnabled } from '../server/utils/stripe'
import { BILLING_SUBSCRIPTIONS_TABLE } from '../shared/types/billing'

/**
 * ROLLEN-PROBEN FÜR DIE LESENDEN BILLING-ROUTEN (OPS-009).
 *
 * Drei Routen, drei Antworten auf „wer darf das?":
 *  - `GET /api/billing/admin/subscriptions` — alle Abos mit Namen und
 *    E-Mail: Instanz-Recht `billing.manage`, nur der Betreiber.
 *  - `GET /api/billing/subscription` — das EIGENE Abo. Ohne Konto gibt es
 *    keins (Antwort „nicht berechtigt", nichts gelesen); mit Konto wird nur
 *    nach diesem Konto gefragt.
 *  - `GET /api/billing/prices` — die öffentliche Preisliste: jede Person
 *    bekommt dieselbe Antwort, auch ohne Konto.
 * Ist Billing in der App aus, antworten alle drei mit 404.
 *
 * Die Wachen (`requireBillingEnabled`) und die Abo-Suche laufen echt; Stripe
 * wird nicht gerufen (die Preis-Auflösung ist nachgebildet).
 */

const PLANS = [{
  id: 'personal',
  products: ['feed'],
  lookupKeys: { monthly: 'probe_personal_monthly', yearly: 'probe_personal_yearly' },
}]

const appConfig = (enabled: boolean) => () => ({ pukalani: { billing: { enabled, currency: 'eur', plans: PLANS } } })

const globalsFor = (enabled: boolean): Record<string, unknown> => ({
  useAppConfig: appConfig(enabled),
  useRuntimeConfig: () => ({ public: { appwriteDatabaseId: 'main' } }),
  requireBillingEnabled,
  getBillingConfig,
  getActiveSubscription,
  getEntitledProducts,
  resolvePriceByLookupKey: async (_event: unknown, lookupKey: string) => ({
    unit_amount: lookupKey.endsWith('monthly') ? 2900 : 26100,
    currency: 'eur',
  }),
})

const on: Omit<RouteProbe, 'who'> = { globals: globalsFor(true) }
const off: Omit<RouteProbe, 'who'> = { globals: globalsFor(false) }

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

// ── Übersicht für den Betreiber ────────────────────────────────────────────

const loadAdmin = () => import('../server/api/billing/admin/subscriptions.get')

describeInstanceRoleGate('GET /api/billing/admin/subscriptions', loadAdmin, {
  allow: ['operator'],
  deny: ['owner', 'admin', 'moderator', 'editor', 'member', 'staff'],
}, on)

describe('GET /api/billing/admin/subscriptions — Billing aus', () => {
  it('Betreiber: 404, Datentür zu', async () => {
    const run = await probeAs(loadAdmin, 'operator', off)
    expect(run.status).toBe(404)
    expect(run.doorOpened).toBe(false)
  })

  it('Konto ohne Label: 403 vor der Billing-Frage', async () => {
    const run = await probeAs(loadAdmin, 'stranger', off)
    expect(run.status).toBe(403)
  })
})

// ── Das eigene Abo ─────────────────────────────────────────────────────────

const loadSubscription = () => import('../server/api/billing/subscription.get')

/** Eine Abo-Tabelle mit je einem aktiven Abo für Mitglied und Betreiber. */
function subscriptionTable(seen: string[]) {
  const rows = [
    { $id: 's-member', userId: userIdOf('member'), status: 'active', planId: 'personal' },
    { $id: 's-operator', userId: userIdOf('operator'), status: 'active', planId: 'personal' },
  ]
  return () => ({
    tablesDB: {
      listRows: async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
        // Die Route fängt Lesefehler ab — eine fremde Tabelle fällt deshalb
        // über `seen` auf, nicht über einen Wurf.
        if (tableId !== BILLING_SUBSCRIPTIONS_TABLE) {
          seen.push(`(Tabelle ${tableId})`)
          return { total: 0, rows: [] }
        }
        const byUser = queries
          .map(query => JSON.parse(query) as { method: string, attribute?: string, values?: unknown[] })
          .find(query => query.method === 'equal' && query.attribute === 'userId')
        seen.push(String(byUser?.values?.[0] ?? '(ohne Filter)'))
        return { total: 0, rows: byUser ? rows.filter(row => byUser.values?.includes(row.userId)) : rows }
      },
    },
  })
}

describe('GET /api/billing/subscription (eigenes Konto)', () => {
  it('ohne Konto: kein Abo, nichts gelesen', async () => {
    const run = await probeAs(loadSubscription, 'guest', on)
    expect(run.status).toBe(200)
    expect(run.doorOpened).toBe(false)
    expect(run.result).toMatchObject({ subscription: null, entitled: false, products: [] })
  })

  it('Mitglied: sein eigenes Abo, gefragt wird nur nach seinem Konto', async () => {
    const seen: string[] = []
    const run = await probeAs(loadSubscription, 'member', { globals: { ...globalsFor(true), createAdminClient: subscriptionTable(seen) } })
    expect(run.status).toBe(200)
    expect(seen).toEqual([userIdOf('member')])
    expect(run.result).toMatchObject({ entitled: true, planId: 'personal', products: ['feed'], subscription: { $id: 's-member' } })
  })

  it('Konto ohne Abo: nicht berechtigt — ein fremdes Abo zählt nicht', async () => {
    const seen: string[] = []
    const run = await probeAs(loadSubscription, 'stranger', { globals: { ...globalsFor(true), createAdminClient: subscriptionTable(seen) } })
    expect(run.status).toBe(200)
    expect(seen).toEqual([userIdOf('stranger')])
    expect(run.result).toMatchObject({ subscription: null, entitled: false, products: [] })
  })

  it('Billing aus: 404, nichts gelesen', async () => {
    const run = await probeAs(loadSubscription, 'member', off)
    expect(run.status).toBe(404)
    expect(run.doorOpened).toBe(false)
  })
})

// ── Die öffentliche Preisliste ─────────────────────────────────────────────

const loadPrices = () => import('../server/api/billing/prices.get')

describe('GET /api/billing/prices (öffentlich)', () => {
  const PRICES = { prices: { personal: { monthly: { amount: 2900, currency: 'eur' }, yearly: { amount: 26100, currency: 'eur' } } } }

  for (const who of ['guest', 'stranger', 'member', 'operator'] as const) {
    it(`${who}: dieselbe Preisliste, nichts aus der Datenbank`, async () => {
      const run = await probeAs(loadPrices, who, on)
      expect(run.status).toBe(200)
      expect(run.doorOpened).toBe(false)
      expect(run.result).toEqual(PRICES)
    })
  }

  it('Billing aus: 404', async () => {
    const run = await probeAs(loadPrices, 'guest', off)
    expect(run.status).toBe(404)
  })
})
