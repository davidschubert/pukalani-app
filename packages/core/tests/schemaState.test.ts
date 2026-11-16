import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aggregateSchemaState, classifyProbeError } from '../shared/schemaState'
import type { ProductManifest } from '../shared/types/manifest'

/**
 * SCHEMA-STAND (OPS-008): passt die Datenbank zum ausgerollten Programm?
 *
 * Die Fehlerbilder sind gegen Appwrite 2.7.1 mit dem Laufzeit-Schlüssel
 * gemessen: fehlende Spalte ⇒ 400 `general_query_invalid`, fehlende Tabelle
 * ⇒ 404 `table_not_found`. Alles andere darf NIE als „Migration ausstehend"
 * gelesen werden.
 */

function appwriteError(code: number, type: string): Error & { code: number, type: string } {
  return Object.assign(new Error(type), { code, type })
}

describe('classifyProbeError', () => {
  it('404 table_not_found ⇒ missing', () => {
    expect(classifyProbeError(appwriteError(404, 'table_not_found'))).toBe('missing')
  })
  it('400 general_query_invalid ⇒ missing', () => {
    expect(classifyProbeError(appwriteError(400, 'general_query_invalid'))).toBe('missing')
  })
  it.each([
    ['404 ohne Art (Proxy)', appwriteError(404, '')],
    ['404 database_not_found', appwriteError(404, 'database_not_found')],
    ['401', appwriteError(401, 'general_unauthorized_scope')],
    ['500', appwriteError(500, 'general_unknown')],
    ['Netzfehler', new TypeError('fetch failed')],
    ['null', null],
    ['String', 'kaputt'],
  ])('%s ⇒ unknown', (_label, error) => {
    expect(classifyProbeError(error)).toBe('unknown')
  })
})

describe('aggregateSchemaState', () => {
  it('keine Proben ⇒ ok 0/0', () => {
    expect(aggregateSchemaState([])).toEqual({ state: 'ok', expected: 0, found: 0 })
  })
  it('alle da ⇒ ok', () => {
    expect(aggregateSchemaState(['present', 'present'])).toEqual({ state: 'ok', expected: 2, found: 2 })
  })
  it('ein sicheres Fehlen schlägt einen Lesefehler', () => {
    expect(aggregateSchemaState(['present', 'missing', 'unknown'])).toEqual({ state: 'behind', expected: 3, found: 1 })
  })
  it('nur Lesefehler ⇒ unknown ohne Zahl', () => {
    expect(aggregateSchemaState(['present', 'unknown'])).toEqual({ state: 'unknown', expected: 2, found: null })
  })
})

// ── Server-Teil mit falschem tablesDB ──────────────────────────────────────

const listRows = vi.fn<(params: { tableId: string, queries: string[], total?: boolean }) => Promise<unknown>>()
const createAdminClient = vi.fn(() => ({ tablesDB: { listRows } }))

vi.mock('../server/lib/appwrite', () => ({
  createAdminClient: () => createAdminClient(),
}))

type Util = typeof import('../server/utils/schemaState')
let util: Util
let logLines: string[]

function manifest(key: string, migration: string, table: string, column?: string): ProductManifest {
  return {
    key, tier: 'optional', hasMigrations: true, userData: false,
    schema: { latest: migration, probe: { migration, table, ...(column ? { column } : {}) } },
    title: { en: key, de: key }, description: { en: key, de: key }, icon: 'i-ph-x',
  }
}

/** Tabelle → Spalten, die „in der Datenbank" stehen. */
let schema: Record<string, string[]> = {}

function fakeListRows({ tableId, queries }: { tableId: string, queries: string[] }): Promise<unknown> {
  const columns = schema[tableId]
  if (!columns) return Promise.reject(appwriteError(404, 'table_not_found'))
  const select = queries.map(q => JSON.parse(q) as { method: string, values: string[] }).find(q => q.method === 'select')
  const wanted = select?.values[0] ?? '$id'
  if (wanted !== '$id' && !columns.includes(wanted)) return Promise.reject(appwriteError(400, 'general_query_invalid'))
  return Promise.resolve({ total: 0, rows: [] })
}

async function register(...manifests: ProductManifest[]) {
  const { registerProductManifest } = await import('../server/utils/productRegistry')
  for (const m of manifests) registerProductManifest(m)
}

const event = {} as Parameters<Util['resolveSchemaState']>[0]

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-15T10:00:00Z'))
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
  logLines = []
  vi.spyOn(console, 'error').mockImplementation((line: string) => {
    logLines.push(line)
  })
  schema = { brand_checks: ['erasedAt'], app_config: ['brandAiEnabled'] }
  listRows.mockReset()
  listRows.mockImplementation(fakeListRows)
  createAdminClient.mockClear()
  vi.resetModules()
  util = await import('../server/utils/schemaState')
  await register(manifest('brand', '026', 'brand_checks', 'erasedAt'), manifest('system', '038', 'app_config', 'brandAiEnabled'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('resolveSchemaState', () => {
  it('alles da ⇒ ok, fragt mit limit(1), select([spalte]) und ohne Zählung', async () => {
    expect(await util.resolveSchemaState(event)).toEqual({ state: 'ok', expected: 2, found: 2 })
    const call = listRows.mock.calls.find(([p]) => p.tableId === 'brand_checks')![0]
    expect(call.total).toBe(false)
    expect(call.queries.map(q => JSON.parse(q) as unknown)).toEqual([
      { method: 'limit', values: [1] },
      { method: 'select', values: ['erasedAt'] },
    ])
  })

  it('ohne Spalte im Manifest wird nur `$id` gewählt', async () => {
    vi.resetModules()
    util = await import('../server/utils/schemaState')
    await register(manifest('runner', '001', 'runs'))
    schema = { runs: [] }
    expect(await util.resolveSchemaState(event)).toEqual({ state: 'ok', expected: 1, found: 1 })
    expect(JSON.parse(listRows.mock.calls[0]![0].queries[1]!)).toEqual({ method: 'select', values: ['$id'] })
  })

  it('fehlende Spalte ⇒ behind', async () => {
    schema.brand_checks = []
    expect(await util.resolveSchemaState(event)).toEqual({ state: 'behind', expected: 2, found: 1 })
  })

  it('fehlende Tabelle ⇒ behind', async () => {
    delete schema.app_config
    expect(await util.resolveSchemaState(event)).toEqual({ state: 'behind', expected: 2, found: 1 })
  })

  it.each([
    ['401', appwriteError(401, 'general_unauthorized_scope')],
    ['500', appwriteError(500, 'general_unknown')],
  ])('%s ⇒ unknown', async (_label, error) => {
    listRows.mockImplementation(p => (p.tableId === 'app_config' ? Promise.reject(error) : fakeListRows(p)))
    expect(await util.resolveSchemaState(event)).toEqual({ state: 'unknown', expected: 2, found: null })
  })

  it('eine Probe, die nicht antwortet, ist nach 4 s unknown', async () => {
    listRows.mockImplementation(p => (p.tableId === 'app_config' ? new Promise(() => {}) : fakeListRows(p)))
    const pending = util.resolveSchemaState(event)
    let settled = false
    void pending.then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(3_999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await pending).toEqual({ state: 'unknown', expected: 2, found: null })
  })

  it('gemischt: ein sicheres Fehlen schlägt einen Ausfall', async () => {
    schema.brand_checks = []
    listRows.mockImplementation(p => (p.tableId === 'app_config' ? Promise.reject(appwriteError(500, 'x')) : fakeListRows(p)))
    expect(await util.resolveSchemaState(event)).toEqual({ state: 'behind', expected: 2, found: 0 })
  })

  it('keine Proben ⇒ ok 0/0 ohne Appwrite-Aufruf', async () => {
    vi.resetModules()
    util = await import('../server/utils/schemaState')
    expect(await util.resolveSchemaState(event)).toEqual({ state: 'ok', expected: 0, found: 0 })
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('wirft nie — auch wenn der Client selbst wirft oder listRows synchron wirft', async () => {
    createAdminClient.mockImplementationOnce(() => {
      throw new Error('501')
    })
    await expect(util.resolveSchemaState(event)).resolves.toEqual({ state: 'unknown', expected: 2, found: null })
    util.resetSchemaStateCache()
    listRows.mockImplementation(() => {
      throw new Error('sync')
    })
    await expect(util.resolveSchemaState(event)).resolves.toEqual({ state: 'unknown', expected: 2, found: null })
    util.resetSchemaStateCache()
    vi.stubGlobal('useRuntimeConfig', () => {
      throw new Error('keine Config')
    })
    await expect(util.resolveSchemaState(event)).resolves.toEqual({ state: 'unknown', expected: 2, found: null })
  })
})

describe('resolveSchemaState — Zwischenspeicher', () => {
  it('ok wird 5 Minuten gehalten', async () => {
    await util.resolveSchemaState(event)
    vi.advanceTimersByTime(4 * 60_000)
    await util.resolveSchemaState(event)
    expect(listRows).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(60_001)
    await util.resolveSchemaState(event)
    expect(listRows).toHaveBeenCalledTimes(4)
  })

  it('behind wird nach 30 s neu geprüft — und wird grün, sobald die Migration lief', async () => {
    schema.brand_checks = []
    expect((await util.resolveSchemaState(event)).state).toBe('behind')
    vi.advanceTimersByTime(29_000)
    expect((await util.resolveSchemaState(event)).state).toBe('behind')
    expect(listRows).toHaveBeenCalledTimes(2)
    schema.brand_checks = ['erasedAt']
    vi.advanceTimersByTime(1_001)
    expect((await util.resolveSchemaState(event)).state).toBe('ok')
    expect(listRows).toHaveBeenCalledTimes(4)
  })

  it('unknown wird nach 10 s neu geprüft', async () => {
    listRows.mockRejectedValue(appwriteError(500, 'x'))
    await util.resolveSchemaState(event)
    vi.advanceTimersByTime(9_000)
    await util.resolveSchemaState(event)
    expect(listRows).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1_001)
    await util.resolveSchemaState(event)
    expect(listRows).toHaveBeenCalledTimes(4)
  })

  it('10 gleichzeitige Aufrufe teilen sich EINE laufende Prüfung', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => util.resolveSchemaState(event)))
    expect(listRows).toHaveBeenCalledTimes(2)
    expect(results.every(r => r.state === 'ok')).toBe(true)
  })
})

describe('resolveSchemaState — Server-Log', () => {
  it('EINE Zeile beim Wechsel zu behind, mit Migrationsnamen und ohne Tabellen-/Spaltennamen', async () => {
    schema.brand_checks = []
    await util.resolveSchemaState(event)
    await vi.advanceTimersByTimeAsync(0)
    expect(logLines).toHaveLength(1)
    const line = JSON.parse(logLines[0]!) as { event: string, missing: string[] }
    expect(line.event).toBe('schema.behind')
    expect(line.missing).toEqual(['brand-026'])
    expect(logLines[0]).not.toMatch(/brand_checks|erasedAt/)

    // Derselbe Stand nach Ablauf ⇒ keine zweite Zeile.
    vi.advanceTimersByTime(30_001)
    await util.resolveSchemaState(event)
    await vi.advanceTimersByTimeAsync(0)
    expect(logLines).toHaveLength(1)

    // Grün und wieder hinten ⇒ neuer Wechsel, neue Zeile.
    schema.brand_checks = ['erasedAt']
    vi.advanceTimersByTime(30_001)
    await util.resolveSchemaState(event)
    schema.brand_checks = []
    vi.advanceTimersByTime(5 * 60_000 + 1)
    await util.resolveSchemaState(event)
    await vi.advanceTimersByTimeAsync(0)
    expect(logLines).toHaveLength(2)
  })

  it('ok und unknown loggen nichts', async () => {
    await util.resolveSchemaState(event)
    util.resetSchemaStateCache()
    listRows.mockRejectedValue(appwriteError(500, 'x'))
    await util.resolveSchemaState(event)
    await vi.advanceTimersByTimeAsync(0)
    expect(logLines).toHaveLength(0)
  })
})
