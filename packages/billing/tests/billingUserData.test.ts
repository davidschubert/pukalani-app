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
let updated: { tableId: string, rowId: string, data: Record<string, unknown> }[]
let queriesSeen: Record<string, string[]>
let stripeError: unknown
const logged: { level: string, name: string, fields: Record<string, unknown> }[] = []

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    queriesSeen[tableId] = queries
    if (errors[tableId]) throw errors[tableId]
    const rows = tables[tableId] ?? []
    return { total: rows.length, rows }
  }),
  deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    deleted.push(`${tableId}/${rowId}`)
  }),
  updateRow: vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    updated.push({ tableId, rowId, data })
    const target = (tables[tableId] ?? []).find(entry => entry.$id === rowId)
    if (target) Object.assign(target, data)
    return target
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
    stripe_settings: [{ $id: 'stripe', $createdAt: '2026-11-01T00:00:00.000Z', updatedBy: 'u1' }],
  }
  errors = {}
  deleted = []
  updated = []
  queriesSeen = {}
  stripeError = undefined
  logged.length = 0
})

describe('billingDeleteUserData', () => {
  it('Normalfall: beide Zeilen weg, kein Log', async () => {
    tables.stripe_settings = []
    expect(await billingDeleteUserData(event, 'u1')).toEqual({ deleted: 2, anonymized: 0 })
    expect(logged).toEqual([])
  })

  it('stripe_settings.updatedBy der Person wird geleert, die Zeile bleibt (SEC-026)', async () => {
    expect(await billingDeleteUserData(event, 'u1')).toEqual({ deleted: 2, anonymized: 1 })
    expect(updated).toEqual([{ tableId: 'stripe_settings', rowId: 'stripe', data: { updatedBy: '' } }])
    expect(deleted).not.toContain('stripe_settings/stripe')
  })

  it('stripe_settings wird nur mit $id und updatedBy gelesen — nie die Schlüssel', async () => {
    await billingDeleteUserData(event, 'u1')
    const select = (queriesSeen.stripe_settings ?? []).map(query => JSON.parse(query) as { method: string, values?: unknown[] })
      .find(query => query.method === 'select')
    expect(select?.values).toEqual(['$id', 'updatedBy'])
  })

  it('Gegenprobe: ein anderes Konto an stripe_settings bleibt; zweiter Lauf ändert nichts', async () => {
    tables.stripe_settings = [{ $id: 'stripe', $createdAt: '', updatedBy: 'other' }]
    expect((await billingDeleteUserData(event, 'u1')).anonymized).toBe(0)
    tables.stripe_settings = [{ $id: 'stripe', $createdAt: '', updatedBy: '' }]
    expect((await billingDeleteUserData(event, 'u1')).anonymized).toBe(0)
    expect(updated).toEqual([])
  })

  it('fehlt stripe_settings (Silo ohne billing-002), läuft die Löschung durch', async () => {
    errors.stripe_settings = new AppwriteException('Table not found', 404, 'table_not_found')
    expect(await billingDeleteUserData(event, 'u1')).toEqual({ deleted: 2, anonymized: 0 })
  })

  it('ein 500 auf stripe_settings ⇒ die Löschung bricht ab', async () => {
    errors.stripe_settings = serverError()
    await expect(billingDeleteUserData(event, 'u1')).rejects.toThrow('Server Error')
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
    tables.stripe_settings = []
    expect(await billingDeleteUserData(event, 'u1')).toEqual({ deleted: 2, anonymized: 0 })
    expect(logged).toEqual([
      { level: 'error', name: 'billing.stripe_customer_delete_failed', fields: { userId: 'u1' } },
    ])
  })
})

describe('billingExportUserData', () => {
  it('meldet, dass die Person die Stripe-Einstellungen gesetzt hat (ohne Werte)', async () => {
    const result = await billingExportUserData(event, 'u1')
    expect(result.stripeSettingsUpdated).toBe(1)
  })

  it('ein 500 auf billing_customers ⇒ der Export bricht ab', async () => {
    errors.billing_customers = serverError()
    await expect(billingExportUserData(event, 'u1')).rejects.toThrow('Server Error')
  })

  it('ein 500 auf billing_subscriptions ⇒ der Export bricht ab', async () => {
    errors.billing_subscriptions = serverError()
    await expect(billingExportUserData(event, 'u1')).rejects.toThrow('Server Error')
  })
})
