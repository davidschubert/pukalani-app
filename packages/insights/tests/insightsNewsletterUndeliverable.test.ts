import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { insightsNewsletterMailUndeliverable } from '../server/utils/insightsNewsletterUnsubscribe'

/**
 * RS1 b — der Newsletter am Resend-Webhook: eine unzustellbare Adresse meldet
 * ihren Abonnenten ab, mit DEMSELBEN Schreibvorgang wie der Abmelde-Link
 * (bestätigt ⇒ markieren + 12-Monats-Frist, nie bestätigt ⇒ löschen).
 * Gestellt sind nur die Auto-Imports und die Ablage.
 */

interface FakeRow { $id: string, [key: string]: unknown }

let rows: FakeRow[]
let tableMissing: boolean
let productActive: boolean

const tablesDB = {
  listRows: vi.fn(async ({ queries }: { queries: string[] }) => {
    if (tableMissing) throw new AppwriteException('Table not found', 404)
    const equal = queries.map(query => JSON.parse(query) as { method: string, attribute?: string, values?: unknown[] })
      .find(query => query.method === 'equal')
    const found = rows.filter(row => row[String(equal?.attribute)] === equal?.values?.[0])
    return { rows: found, total: found.length }
  }),
  updateRow: vi.fn(async ({ rowId, data }: { rowId: string, data: Record<string, unknown> }) => {
    const row = rows.find(entry => entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404)
    Object.assign(row, data)
    return row
  }),
  deleteRow: vi.fn(async ({ rowId }: { rowId: string }) => {
    const at = rows.findIndex(entry => entry.$id === rowId)
    if (at < 0) throw new AppwriteException('Row not found', 404)
    rows.splice(at, 1)
    return {}
  }),
}

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('getProductRegistry', () => ({ has: (key: string) => productActive && key === 'insights' }))

const event = { context: {} } as unknown as H3Event

function subscriber(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    $id: 's1',
    emailLower: 'aloha@example.com',
    email: 'Aloha@Example.com',
    tokenHash: 'offen',
    tokenExpiresAt: '2026-12-01T00:00:00.000Z',
    confirmedAt: '2026-10-01T00:00:00.000Z',
    unsubscribedAt: '',
    retentionAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  rows = []
  tableMissing = false
  productActive = true
  Object.values(tablesDB).forEach(fn => fn.mockClear())
})

describe('insightsNewsletterMailUndeliverable', () => {
  it('bestätigter Abonnent ⇒ abgemeldet, Token leer, Frist gesetzt — die Zeile bleibt als Nachweis', async () => {
    rows = [subscriber()]
    expect(await insightsNewsletterMailUndeliverable(event, { emailLower: 'aloha@example.com' })).toBe('changed')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ tokenHash: '', tokenExpiresAt: '' })
    expect(Date.parse(String(rows[0]!.unsubscribedAt))).not.toBeNaN()
    expect(Date.parse(String(rows[0]!.retentionAt))).toBeGreaterThan(Date.now())
  })

  it('Wiederholung ⇒ unchanged, kein zweiter Schreibvorgang', async () => {
    rows = [subscriber()]
    await insightsNewsletterMailUndeliverable(event, { emailLower: 'aloha@example.com' })
    const first = { ...rows[0] }
    expect(await insightsNewsletterMailUndeliverable(event, { emailLower: 'aloha@example.com' })).toBe('unchanged')
    expect(tablesDB.updateRow).toHaveBeenCalledTimes(1)
    expect(rows[0]).toEqual(first)
  })

  it('nie bestätigt ⇒ Zeile gelöscht (keine Einwilligung, nichts aufzubewahren); danach none', async () => {
    rows = [subscriber({ confirmedAt: '' })]
    expect(await insightsNewsletterMailUndeliverable(event, { emailLower: 'aloha@example.com' })).toBe('changed')
    expect(rows).toEqual([])
    expect(await insightsNewsletterMailUndeliverable(event, { emailLower: 'aloha@example.com' })).toBe('none')
  })

  it('unbekannte Adresse ⇒ none, die fremde Zeile bleibt unberührt', async () => {
    rows = [subscriber()]
    expect(await insightsNewsletterMailUndeliverable(event, { emailLower: 'fremd@example.net' })).toBe('none')
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(rows[0]!.unsubscribedAt).toBe('')
  })

  it('ohne Tabelle oder ohne aktives Produkt ⇒ none, ohne Fehler', async () => {
    tableMissing = true
    expect(await insightsNewsletterMailUndeliverable(event, { emailLower: 'aloha@example.com' })).toBe('none')
    tableMissing = false
    productActive = false
    rows = [subscriber()]
    expect(await insightsNewsletterMailUndeliverable(event, { emailLower: 'aloha@example.com' })).toBe('none')
    expect(tablesDB.listRows).toHaveBeenCalledTimes(1)
    expect(rows[0]!.unsubscribedAt).toBe('')
  })
})
