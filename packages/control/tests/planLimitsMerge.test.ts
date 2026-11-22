import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { mergeTenantPlanLimits } from '../shared/types/tenantRecord'
import { createRaceTablesDB } from './support/raceTablesDB'

/**
 * KK1 c — DIE PLAN-ROUTE FÜHRT ZUSAMMEN, statt die Grenzen-Zeile zu
 * überschreiben. Vorher löschte „Kommentar-Grenzen speichern" jede andere Art
 * (Seiten, Termine, Mediathek) aus dem Katalog.
 */

describe('mergeTenantPlanLimits (pur)', () => {
  it('ersetzt nur die genannte Art und lässt die anderen stehen', () => {
    const stored = { comments: { perDay: 200, total: 5000 }, pages: { perDay: 50, total: 300 } }
    expect(mergeTenantPlanLimits(stored, { comments: { perDay: 10 } })).toEqual({
      comments: { perDay: 10 },
      pages: { perDay: 50, total: 300 },
    })
  })
  it('null nimmt eine Art heraus', () => {
    expect(mergeTenantPlanLimits({ pages: { total: 1 }, comments: { total: 2 } }, { pages: null })).toEqual({ comments: { total: 2 } })
  })
  it('ändert den gespeicherten Stand nicht', () => {
    const stored = { pages: { total: 1 } }
    mergeTenantPlanLimits(stored, { pages: { total: 9 } })
    expect(stored).toEqual({ pages: { total: 1 } })
  })
})

const race = createRaceTablesDB()
const { table, seed } = race
let body: unknown = {}

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
/** Die Renn-Ablage kennt kein `upsertRow` — hier wie Appwrite: ändern, sonst anlegen. */
const tablesDB = {
  ...race.tablesDB,
  async upsertRow(args: { databaseId: string, tableId: string, rowId: string, data: Record<string, unknown> }) {
    if (table(args.tableId).has(args.rowId)) return await race.tablesDB.updateRow(args)
    return await race.tablesDB.createRow(args)
  },
}
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('requirePermission', () => ({ $id: 'op' }))
vi.stubGlobal('getRouterParam', () => 'personal')
vi.stubGlobal('readValidatedBody', async (_event: unknown, parse: (value: unknown) => unknown) => parse(body))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('createError', (init: Record<string, unknown>) => Object.assign(new Error(String(init.statusText)), init))
vi.stubGlobal('toH3Error', (error: unknown) => error)

const route = (await import('../server/api/control/plans/[key].patch')).default as unknown as (event: H3Event) => Promise<{ key: string, limits: Record<string, unknown> }>
const event = { context: {} } as H3Event

beforeEach(() => {
  race.reset()
})

describe('PATCH /api/control/plans/:key', () => {
  it('Kommentar-Grenzen speichern lässt die Seiten-Grenzen im Katalog', async () => {
    seed('community_plans', { $id: 'personal', key: 'personal', limits: JSON.stringify({ comments: { perDay: 1000, total: 50000 }, pages: { perDay: 50, total: 300 } }) })
    body = { comments: { perDay: 10, total: 20 } }
    const result = await route(event)
    expect(result.limits).toEqual({ comments: { perDay: 10, total: 20 }, pages: { perDay: 50, total: 300 } })
    expect(JSON.parse(String(table('community_plans').get('personal')!.limits))).toEqual(result.limits)
  })

  it('legt eine fehlende Zeile an', async () => {
    body = { pages: { perDay: 5 } }
    const result = await route(event)
    expect(result.limits).toEqual({ pages: { perDay: 5 } })
  })

  it('lässt keine Sperr-Zeile zurück', async () => {
    body = { pages: { perDay: 5 } }
    await route(event)
    expect([...table('control_locks').values(), ...table('system_runs').values()]).toEqual([])
  })
})
