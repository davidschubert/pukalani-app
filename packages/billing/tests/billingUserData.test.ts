import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { listAllRows, listAllRowsIfTableExists } from '../../core/server/utils/listAllRows'

/**
 * EIN LESEFEHLER IST EIN FEHLER, KEIN „NICHTS GEFUNDEN" (SEC-026, Teil 2).
 *
 * Kunden- und Abo-Zeilen wurden mit `.catch(() => [])` gelesen: ein 500 hiess
 * „kein Kunde", die Löschung meldete Erfolg, das Konto verschwand — samt der
 * einzigen Spur zum Stripe-Kunden. Der Stripe-Aufruf selbst bleibt best
 * effort (Stripe ist die Wahrheit über Rechnungen), aber nicht mehr still.
 */

type Row = { $id: string, $createdAt: string, [key: string]: unknown }

let tables: Record<string, Row[]>
let errors: Record<string, unknown>
let deleted: string[]
let stripeError: unknown
const logged: { level: string, name: string, fields: Record<string, unknown> }[] = []

const tablesDB = {
  listRows: vi.fn(async ({ tableId }: { tableId: string }) => {
    if (errors[tableId]) throw errors[tableId]
    const rows = tables[tableId] ?? []
    return { total: rows.length, rows }
  }),
  deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    deleted.push(`${tableId}/${rowId}`)
  }),
}

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('listAllRows', listAllRows)
vi.stubGlobal('listAllRowsIfTableExists', listAllRowsIfTableExists)
vi.stubGlobal('logEvent', (level: string, name: string, fields: Record<string, unknown>) => {
  logged.push({ level, name, fields })
})
vi.stubGlobal('useStripe', async () => ({
  customers: {
    del: async () => {
      if (stripeError) throw stripeError
      return {}
    },
  },
}))

const { billingDeleteUserData, billingExportUserData } = await import('../server/utils/billingUserData')

const event = { context: {} } as unknown as H3Event
const row = (id: string, extra: Record<string, unknown> = {}): Row =>
  ({ $id: id, $createdAt: '2026-11-01T00:00:00.000Z', userId: 'u1', ...extra })
const serverError = () => new AppwriteException('Server Error', 500, 'general_unknown')

beforeEach(() => {
  tables = {
    billing_subscriptions: [row('s1')],
    billing_customers: [row('k1', { stripeCustomerId: 'cus_secret' })],
  }
  errors = {}
  deleted = []
  stripeError = undefined
  logged.length = 0
})

describe('billingDeleteUserData', () => {
  it('Normalfall: beide Zeilen weg, kein Log', async () => {
    expect(await billingDeleteUserData(event, 'u1')).toEqual({ deleted: 2, anonymized: 0 })
    expect(logged).toEqual([])
  })

  it('ein 500 auf billing_subscriptions ⇒ die Löschung bricht ab', async () => {
    errors.billing_subscriptions = serverError()
    await expect(billingDeleteUserData(event, 'u1')).rejects.toThrow('Server Error')
  })

  it('ein 500 auf billing_customers ⇒ die Löschung bricht ab', async () => {
    errors.billing_customers = serverError()
    await expect(billingDeleteUserData(event, 'u1')).rejects.toThrow('Server Error')
  })

  it('Stripe scheitert ⇒ Löschung gelingt, aber eine Log-Zeile ohne Stripe-Text', async () => {
    stripeError = new Error('No such customer: cus_secret')
    expect(await billingDeleteUserData(event, 'u1')).toEqual({ deleted: 2, anonymized: 0 })
    expect(logged).toEqual([
      { level: 'error', name: 'billing.stripe_customer_delete_failed', fields: { userId: 'u1' } },
    ])
  })
})

describe('billingExportUserData', () => {
  it('ein 500 auf billing_customers ⇒ der Export bricht ab', async () => {
    errors.billing_customers = serverError()
    await expect(billingExportUserData(event, 'u1')).rejects.toThrow('Server Error')
  })

  it('ein 500 auf billing_subscriptions ⇒ der Export bricht ab', async () => {
    errors.billing_subscriptions = serverError()
    await expect(billingExportUserData(event, 'u1')).rejects.toThrow('Server Error')
  })
})
