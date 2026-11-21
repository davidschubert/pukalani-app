import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ENTITLEMENTS_TABLE } from '../shared/types/entitlement'
import { WEBSITES_TABLE } from '../shared/types/website'

/**
 * WEBSITE AUSTRAGEN: KEIN „OK" ÜBER LIEGENGEBLIEBENE ENTITLEMENTS (Bahn 2,
 * Q13-Stelle 1). Echter Handler, gestellt sind nur die Datenbank und die
 * Wachen (deren Rollen-Fragen stellt route-roles-operator-websites.test.ts).
 *
 *  - Liste nicht lesbar ⇒ 503, nichts gelöscht.
 *  - Löschen einer Entitlement-Zeile scheitert ⇒ 503, der Eintrag bleibt —
 *    derselbe Klick noch einmal räumt den Rest ab.
 *  - Gegenprobe: alles klappt ⇒ `ok`, Entitlements UND Eintrag sind weg.
 */

interface Row { $id: string, [key: string]: unknown }
let tables: Record<string, Row[]>
let listFails = false
let failDeleteOf = new Set<string>()

const tablesDB = {
  getRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    const row = tables[tableId]!.find(entry => entry.$id === rowId)
    if (!row) throw Object.assign(new Error('not found'), { code: 404, type: 'row_not_found' })
    return row
  }),
  listRows: vi.fn(async ({ tableId }: { tableId: string }) => {
    if (listFails) throw Object.assign(new Error('down'), { code: 500, type: 'general_unknown' })
    return { rows: [...tables[tableId]!], total: tables[tableId]!.length }
  }),
  deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    if (failDeleteOf.has(rowId)) throw Object.assign(new Error('down'), { code: 500, type: 'general_unknown' })
    const list = tables[tableId]!
    const at = list.findIndex(entry => entry.$id === rowId)
    if (at < 0) throw Object.assign(new Error('not found'), { code: 404, type: 'row_not_found' })
    list.splice(at, 1)
  }),
}

type Handler = (event: unknown) => Promise<{ ok: boolean, slug: string }>
let handler: Handler

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('requirePermission', () => {})
  vi.stubGlobal('requireRecentAuth', async () => {})
  vi.stubGlobal('getRouterParam', () => 'w-silo')
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'db' } }))
  vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
  vi.stubGlobal('logEvent', vi.fn())
  vi.stubGlobal('createError', (input: { status: number, statusText: string, data?: unknown }) =>
    Object.assign(new Error(input.statusText), input))
  vi.stubGlobal('toH3Error', (_error: unknown, message: string) => Object.assign(new Error(message), { status: 500 }))
  handler = (await import('../server/api/control/websites/[id].delete')).default as unknown as Handler
})

beforeEach(() => {
  listFails = false
  failDeleteOf = new Set()
  tables = {
    [WEBSITES_TABLE]: [{ $id: 'w-silo', slug: 'silo', projectId: 'p-silo' }],
    [ENTITLEMENTS_TABLE]: [
      { $id: 'e-1', siteProjectId: 'p-silo' },
      { $id: 'e-2', siteProjectId: 'p-silo' },
    ],
  }
})

describe('DELETE /api/control/websites/:id', () => {
  it('Liste der Entitlements nicht lesbar ⇒ 503 und NICHTS gelöscht', async () => {
    listFails = true
    await expect(handler({})).rejects.toMatchObject({ status: 500 })
    expect(tables[WEBSITES_TABLE]).toHaveLength(1)
    expect(tables[ENTITLEMENTS_TABLE]).toHaveLength(2)
  })

  it('eine Entitlement-Zeile bleibt liegen ⇒ 503 entitlements_left, der Eintrag bleibt', async () => {
    failDeleteOf = new Set(['e-2'])
    await expect(handler({})).rejects.toMatchObject({ status: 503, data: { code: 'entitlements_left' } })
    expect(tables[WEBSITES_TABLE]).toHaveLength(1)
    expect(tables[ENTITLEMENTS_TABLE]!.map(row => row.$id)).toEqual(['e-2'])

    // Derselbe Klick noch einmal räumt den Rest ab.
    failDeleteOf = new Set()
    await expect(handler({})).resolves.toEqual({ ok: true, slug: 'silo' })
    expect(tables[WEBSITES_TABLE]).toHaveLength(0)
    expect(tables[ENTITLEMENTS_TABLE]).toHaveLength(0)
  })

  it('Gegenprobe: alles gelingt ⇒ ok, Entitlements und Eintrag sind weg', async () => {
    await expect(handler({})).resolves.toEqual({ ok: true, slug: 'silo' })
    expect(tables[WEBSITES_TABLE]).toHaveLength(0)
    expect(tables[ENTITLEMENTS_TABLE]).toHaveLength(0)
  })
})
