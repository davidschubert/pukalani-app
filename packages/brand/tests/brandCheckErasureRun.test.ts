import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { listAllRows } from '../../core/server/utils/listAllRows'

/**
 * DER STÜNDLICHE LÖSCH-LAUF DER PRÜFERGEBNISSE (SEC-015, SEC-026) —
 * gefälschte Ablage, ECHTER Lauf.
 *
 * Die Regel je Zeile ist pur und in `brandCheckErasure.test.ts` als Tabelle
 * geprüft. Hier geht es um das, was erst der Lauf entscheidet: welche Zeilen
 * er überhaupt sieht, in welcher Reihenfolge er schreibt, was ein Probelauf
 * NICHT tut, und dass er Zeilen ohne `erasedAt` nie anfasst — auch sehr alte.
 *
 * Der Fake filtert SELBST nach den Abfragen (`lessThan`, `equal`,
 * `orderAsc`, `cursorAfter`, `limit`) — sonst hinge „nur fällige Zeilen" am
 * Test-Aufbau statt am Code.
 */

interface FakeRow { $id: string, $createdAt: string, [key: string]: unknown }
interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

const NOW = new Date('2026-12-31T12:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

let tables: Record<string, FakeRow[]>
let brokenRead: boolean
/** Zeilen-Ids, deren Schreiben (update/delete) mit 500 scheitert. */
let brokenWrites: Set<string>
/** Hält das nächste `listRows` an, bis der Test es freigibt (Sperr-Test). */
let gate: Promise<void> | null
let logs: { level: string, event: string, data: Record<string, unknown> }[]
let appConfig: Record<string, unknown>
let labels: string[] | null
let body: Record<string, unknown> | undefined

function select(tableId: string, queries: string[]): FakeRow[] {
  const parsed = queries.map(q => JSON.parse(q) as ParsedQuery)
  let rows = [...(tables[tableId] ?? [])]
  for (const entry of parsed) {
    const attribute = entry.attribute ?? ''
    if (entry.method === 'equal') rows = rows.filter(row => (entry.values ?? []).includes(row[attribute]))
    if (entry.method === 'lessThan') {
      const bound = String(entry.values?.[0])
      rows = rows.filter(row => typeof row[attribute] === 'string' && (row[attribute] as string) < bound)
    }
  }
  const order = parsed.find(entry => entry.method === 'orderAsc')
  if (order?.attribute) {
    const attribute = order.attribute
    rows.sort((a, b) => String(a[attribute]).localeCompare(String(b[attribute])) || a.$id.localeCompare(b.$id))
  }
  const cursor = parsed.find(entry => entry.method === 'cursorAfter')?.values?.[0]
  if (typeof cursor === 'string') {
    const at = rows.findIndex(row => row.$id === cursor)
    if (at < 0) throw new AppwriteException('Cursor not found', 400, 'general_cursor_not_found')
    rows = rows.slice(at + 1)
  }
  const limit = parsed.find(entry => entry.method === 'limit')?.values?.[0]
  if (typeof limit === 'number') rows = rows.slice(0, limit)
  return rows
}

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    if (gate) {
      const wait = gate
      gate = null
      await wait
    }
    if (brokenRead) throw new AppwriteException('Server Error', 500, 'general_unknown')
    const rows = select(tableId, queries)
    return { total: rows.length, rows }
  }),
  updateRow: vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    if (brokenWrites.has(rowId)) throw new AppwriteException('Server Error', 500, 'general_unknown')
    const row = (tables[tableId] ?? []).find(entry => entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404, 'row_not_found')
    Object.assign(row, data)
    return row
  }),
  deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    if (brokenWrites.has(rowId)) throw new AppwriteException('Server Error', 500, 'general_unknown')
    const rows = tables[tableId] ?? []
    const at = rows.findIndex(entry => entry.$id === rowId)
    if (at < 0) throw new AppwriteException('Row not found', 404, 'row_not_found')
    rows.splice(at, 1)
  }),
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('useAppConfig', () => appConfig)
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('listAllRows', listAllRows)
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('logEvent', (level: string, event: string, data: Record<string, unknown> = {}) => {
  logs.push({ level, event, data })
})
vi.stubGlobal('requirePermission', (_event: H3Event, capability: string) => {
  if (labels === null) throw createError({ status: 401, statusText: 'Unauthorized' })
  if (!labels.includes('admin') && capability !== 'dashboard.access') {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }
  return { $id: 'u-operator', labels }
})
vi.stubGlobal('readValidatedBody', async (_event: H3Event, run: (input: unknown) => unknown) => run(body))

const {
  BRAND_CHECK_CORRECTION_ADDRESS_RETENTION_DAYS,
  brandCheckErasureMode,
  resolveBrandCheckErasureMode,
  runBrandCheckErasure,
} = await import('../server/utils/brandCheckErasureRun')
const runHandler = (await import('../server/api/brand/admin/check-erasure/run.post'))
  .default as unknown as (event: H3Event) => Promise<Record<string, unknown>>

const event = { context: {} } as unknown as H3Event

const check = (id: string, extra: Record<string, unknown> = {}): FakeRow => ({
  $id: id,
  $createdAt: daysAgo(400),
  userId: 'u1',
  profileId: 'p1',
  ipHash: 'hash-u1',
  rankingOptIn: true,
  hidden: false,
  source: 'website',
  erasedAt: null,
  ...extra,
})

const correction = (id: string, extra: Record<string, unknown> = {}): FakeRow => ({
  $id: id,
  $createdAt: daysAgo(10),
  checkId: 'none',
  reporterEmail: 'reporter@example.com',
  ipHash: 'hash-reporter',
  reason: 'Branche stimmt nicht',
  proposed: 'cafe',
  status: 'open',
  ...extra,
})

const checks = () => tables.brand_checks!
const corrections = () => tables.brand_check_corrections!
const findCheck = (id: string) => checks().find(row => row.$id === id)
const findCorrection = (id: string) => corrections().find(row => row.$id === id)

beforeEach(() => {
  tables = { brand_checks: [], brand_check_corrections: [] }
  brokenRead = false
  brokenWrites = new Set()
  gate = null
  logs = []
  appConfig = { pukalani: { brand: {} } }
  labels = ['admin']
  body = undefined
  tablesDB.listRows.mockClear()
  tablesDB.updateRow.mockClear()
  tablesDB.deleteRow.mockClear()
})

describe('Teil A · gelöschte Checks nach 90 Tagen', () => {
  it('ein Dokument-Check wird gelöscht — zusammen mit seinen Korrekturvorschlägen, diese ZUERST', async () => {
    tables.brand_checks = [check('doc', { source: 'document', erasedAt: daysAgo(91) })]
    tables.brand_check_corrections = [
      correction('c1', { checkId: 'doc' }),
      correction('c2', { checkId: 'doc' }),
      correction('c-other', { checkId: 'elsewhere' }),
    ]

    const result = await runBrandCheckErasure('apply', { now: NOW })

    expect(findCheck('doc')).toBeUndefined()
    expect(corrections().map(row => row.$id)).toEqual(['c-other'])
    const order = tablesDB.deleteRow.mock.calls.map(([args]) => `${args.tableId}/${args.rowId}`)
    expect(order).toEqual(['brand_check_corrections/c1', 'brand_check_corrections/c2', 'brand_checks/doc'])
    expect(result).toMatchObject({ mode: 'apply', candidates: 1, deleted: 1, anonymized: 0, correctionsRemoved: 2, failed: 0, truncated: false })
  })

  it('ein Website-Check wird anonymisiert — ohne Person, wieder sichtbar, `hidden` unverändert', async () => {
    tables.brand_checks = [
      check('web', { erasedAt: daysAgo(120) }),
      check('web-hidden', { erasedAt: daysAgo(120), hidden: true }),
    ]

    const result = await runBrandCheckErasure('apply', { now: NOW })

    expect(findCheck('web')).toMatchObject({ userId: '', profileId: '', ipHash: '', rankingOptIn: false, erasedAt: null, hidden: false })
    expect(findCheck('web-hidden')).toMatchObject({ userId: '', profileId: '', ipHash: '', rankingOptIn: false, erasedAt: null, hidden: true })
    for (const [args] of tablesDB.updateRow.mock.calls) expect(args.data).not.toHaveProperty('hidden')
    expect(tablesDB.deleteRow).not.toHaveBeenCalled()
    expect(result).toMatchObject({ candidates: 2, deleted: 0, anonymized: 2, correctionsRemoved: 0, failed: 0 })
  })

  it('vor 89 Tagen gelöscht ⇒ unberührt', async () => {
    tables.brand_checks = [
      check('doc-young', { source: 'document', erasedAt: daysAgo(89) }),
      check('web-young', { erasedAt: daysAgo(89) }),
    ]
    const before = structuredClone(tables.brand_checks)

    const result = await runBrandCheckErasure('apply', { now: NOW })

    expect(tables.brand_checks).toEqual(before)
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(tablesDB.deleteRow).not.toHaveBeenCalled()
    expect(result).toMatchObject({ candidates: 0, deleted: 0, anonymized: 0 })
  })

  it('GEGENPROBE: eine Zeile ohne `erasedAt` wird NIE angefasst — auch eine sehr alte', async () => {
    tables.brand_checks = [
      check('ancient-doc', { source: 'document', $createdAt: daysAgo(2000) }),
      check('ancient-web', { $createdAt: daysAgo(2000), erasedAt: undefined }),
      check('erased', { source: 'document', erasedAt: daysAgo(100) }),
    ]
    tables.brand_check_corrections = [correction('c-ancient', { checkId: 'ancient-doc', $createdAt: daysAgo(10) })]

    await runBrandCheckErasure('apply', { now: NOW })

    expect(findCheck('ancient-doc')).toMatchObject({ userId: 'u1', erasedAt: null })
    expect(findCheck('ancient-web')).toMatchObject({ userId: 'u1', ipHash: 'hash-u1' })
    expect(findCorrection('c-ancient')).toBeDefined()
    expect(findCheck('erased')).toBeUndefined()
    const touched = [
      ...tablesDB.updateRow.mock.calls.map(([args]) => args.rowId),
      ...tablesDB.deleteRow.mock.calls.map(([args]) => args.rowId),
    ]
    expect(touched).toEqual(['erased'])
  })

  it('ein zweiter Lauf direkt danach findet nichts mehr', async () => {
    tables.brand_checks = [
      check('doc', { source: 'document', erasedAt: daysAgo(91) }),
      check('web', { erasedAt: daysAgo(91) }),
    ]
    await runBrandCheckErasure('apply', { now: NOW })
    tablesDB.updateRow.mockClear()
    tablesDB.deleteRow.mockClear()

    const second = await runBrandCheckErasure('apply', { now: NOW })

    expect(second).toMatchObject({ candidates: 0, deleted: 0, anonymized: 0, correctionsRemoved: 0, correctionAddresses: 0 })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(tablesDB.deleteRow).not.toHaveBeenCalled()
  })
})

describe('Teil B · Absender-Adressen der Korrekturvorschläge', () => {
  it('die Frist ist 90 Tage ab dem Anlegen', () => {
    expect(BRAND_CHECK_CORRECTION_ADDRESS_RETENTION_DAYS).toBe(90)
  })

  it('älter als 90 Tage ⇒ Adresse und ipHash leer, der Vorschlag selbst bleibt; jünger ⇒ beides bleibt', async () => {
    tables.brand_check_corrections = [
      correction('old', { $createdAt: daysAgo(91), status: 'declined' }),
      correction('old-ip-only', { $createdAt: daysAgo(200), reporterEmail: '' }),
      correction('old-clean', { $createdAt: daysAgo(300), reporterEmail: '', ipHash: '' }),
      correction('young', { $createdAt: daysAgo(89) }),
    ]

    const result = await runBrandCheckErasure('apply', { now: NOW })

    expect(findCorrection('old')).toMatchObject({ reporterEmail: '', ipHash: '', reason: 'Branche stimmt nicht', proposed: 'cafe', status: 'declined' })
    expect(findCorrection('old-ip-only')).toMatchObject({ reporterEmail: '', ipHash: '' })
    expect(findCorrection('young')).toMatchObject({ reporterEmail: 'reporter@example.com', ipHash: 'hash-reporter' })
    // Die schon leere Zeile kostet keinen Schreibvorgang.
    expect(tablesDB.updateRow.mock.calls.map(([args]) => args.rowId).sort()).toEqual(['old', 'old-ip-only'])
    expect(result).toMatchObject({ correctionAddresses: 2, failed: 0 })
  })
})

describe('Probelauf', () => {
  it('`dry-run` schreibt nichts und meldet dieselben Zahlen wie `apply`', async () => {
    const seed = () => {
      tables.brand_checks = [
        check('doc', { source: 'document', erasedAt: daysAgo(91) }),
        check('web', { erasedAt: daysAgo(91) }),
        check('young', { erasedAt: daysAgo(10) }),
      ]
      tables.brand_check_corrections = [
        correction('c-doc', { checkId: 'doc', $createdAt: daysAgo(5) }),
        correction('c-old', { checkId: 'web', $createdAt: daysAgo(150) }),
      ]
    }
    seed()
    const before = structuredClone(tables)

    const dry = await runBrandCheckErasure('dry-run', { now: NOW })

    expect(tables).toEqual(before)
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(tablesDB.deleteRow).not.toHaveBeenCalled()
    expect(logs.filter(entry => entry.event === 'brand.check_erasure')).toHaveLength(1)

    seed()
    const applied = await runBrandCheckErasure('apply', { now: NOW })
    const { mode: _dryMode, ...dryCounts } = dry!
    const { mode: _applyMode, ...applyCounts } = applied!
    expect(dryCounts).toEqual(applyCounts)
    expect(dryCounts).toEqual({ candidates: 2, deleted: 1, anonymized: 1, correctionsRemoved: 1, correctionAddresses: 1, failed: 0, truncated: false })
  })

  it('ein `apply`-Lauf ohne jeden Fund schreibt keine Zeile ins Log, ein Probelauf schon', async () => {
    await runBrandCheckErasure('apply', { now: NOW })
    expect(logs.filter(entry => entry.event === 'brand.check_erasure')).toHaveLength(0)
    await runBrandCheckErasure('dry-run', { now: NOW })
    expect(logs.filter(entry => entry.event === 'brand.check_erasure')).toHaveLength(1)
  })
})

describe('Fehler, Sperre, Deckel', () => {
  it('ein Schreibfehler wird gezählt, der Lauf macht weiter', async () => {
    tables.brand_checks = [
      check('web-broken', { erasedAt: daysAgo(150) }),
      check('web-ok', { erasedAt: daysAgo(140) }),
      check('doc', { source: 'document', erasedAt: daysAgo(130) }),
    ]
    tables.brand_check_corrections = [
      correction('c-doc-broken', { checkId: 'doc' }),
      correction('c-old', { $createdAt: daysAgo(100) }),
    ]
    brokenWrites = new Set(['web-broken', 'c-doc-broken'])

    const result = await runBrandCheckErasure('apply', { now: NOW })

    expect(findCheck('web-ok')).toMatchObject({ userId: '', erasedAt: null })
    // Der Vorschlag liess sich nicht löschen ⇒ der Check bleibt stehen, sonst
    // hinge eine Adresse an einer Zeile, die es nicht mehr gibt.
    expect(findCheck('doc')).toBeDefined()
    expect(findCorrection('c-old')).toMatchObject({ reporterEmail: '', ipHash: '' })
    expect(result).toMatchObject({ anonymized: 1, deleted: 0, correctionAddresses: 1, failed: 2 })
    expect(logs).toContainEqual({ level: 'error', event: 'brand.check_erasure_incomplete', data: { failed: 2 } })
  })

  it('ein 404 beim Schreiben heisst „schon weg" und zählt als erledigt', async () => {
    tables.brand_checks = [check('doc', { source: 'document', erasedAt: daysAgo(91) })]
    const realDelete = tablesDB.deleteRow.getMockImplementation()!
    tablesDB.deleteRow.mockImplementationOnce(async () => {
      throw new AppwriteException('Row not found', 404, 'row_not_found')
    })
    const result = await runBrandCheckErasure('apply', { now: NOW })
    tablesDB.deleteRow.mockImplementation(realDelete)
    expect(result).toMatchObject({ deleted: 1, failed: 0 })
  })

  it('ein Lesefehler bricht den Lauf ab und wird gemeldet', async () => {
    brokenRead = true
    await expect(runBrandCheckErasure('apply', { now: NOW })).rejects.toThrow('Server Error')
    expect(logs).toContainEqual({ level: 'error', event: 'brand.check_erasure_failed', data: { message: 'Server Error' } })
    // Die Sperre ist danach wieder frei.
    brokenRead = false
    await expect(runBrandCheckErasure('dry-run', { now: NOW })).resolves.not.toBeNull()
  })

  it('ein zweiter Aufruf während eines Laufs bekommt `null`', async () => {
    let release!: () => void
    gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = runBrandCheckErasure('dry-run', { now: NOW })
    const second = await runBrandCheckErasure('dry-run', { now: NOW })
    expect(second).toBeNull()
    expect(logs).toContainEqual({ level: 'warn', event: 'brand.check_erasure_busy', data: {} })
    release()
    await expect(first).resolves.not.toBeNull()
  })

  it('mehr als 500 fällige Zeilen ⇒ 500 je Lauf, `truncated`, der nächste Lauf macht weiter', async () => {
    tables.brand_checks = Array.from({ length: 520 }, (_, i) =>
      check(`w${String(i).padStart(4, '0')}`, { erasedAt: daysAgo(100 + (i % 7)) }))

    const first = await runBrandCheckErasure('apply', { now: NOW })
    expect(first).toMatchObject({ candidates: 500, anonymized: 500, truncated: true })

    const second = await runBrandCheckErasure('apply', { now: NOW })
    expect(second).toMatchObject({ candidates: 20, anonymized: 20, truncated: false })
    expect(checks().every(row => row.erasedAt === null && row.userId === '')).toBe(true)
  })

  it('der Deckel gilt auch im Probelauf', async () => {
    tables.brand_checks = Array.from({ length: 501 }, (_, i) =>
      check(`d${String(i).padStart(4, '0')}`, { source: 'document', erasedAt: daysAgo(100) }))
    const result = await runBrandCheckErasure('dry-run', { now: NOW })
    expect(result).toMatchObject({ candidates: 500, deleted: 500, truncated: true })
    expect(checks()).toHaveLength(501)
  })
})

describe('Schalter `pukalani.brand.checkErasure`', () => {
  it.each([
    [undefined, 'off', false],
    ['off', 'off', false],
    ['dry-run', 'dry-run', false],
    ['apply', 'apply', false],
    ['APPLY', 'off', true],
    ['yes', 'off', true],
    [true, 'off', true],
  ] as const)('%s ⇒ %s (ungültig: %s)', (value, mode, invalid) => {
    expect(resolveBrandCheckErasureMode(value)).toEqual({ mode, invalid })
  })

  it('ein ungültiger Wert gilt als `off` und schreibt eine Fehlerzeile', () => {
    appConfig = { pukalani: { brand: { checkErasure: 'sofort' } } }
    expect(brandCheckErasureMode()).toBe('off')
    expect(logs).toContainEqual({ level: 'error', event: 'brand.check_erasure_invalid_mode', data: { value: 'sofort' } })
  })
})

describe('POST /api/brand/admin/check-erasure/run', () => {
  it('ohne Session 401, ohne `users.manage` 403 — vor jedem Lesen', async () => {
    labels = null
    await expect(runHandler(event)).rejects.toMatchObject({ status: 401 })
    labels = []
    await expect(runHandler(event)).rejects.toMatchObject({ status: 403 })
    expect(tablesDB.listRows).not.toHaveBeenCalled()
  })

  it('ohne Body ist es ein Probelauf', async () => {
    tables.brand_checks = [check('doc', { source: 'document', erasedAt: daysAgo(400) })]
    const result = await runHandler(event)
    expect(result).toMatchObject({ mode: 'dry-run', deleted: 1 })
    expect(findCheck('doc')).toBeDefined()
  })

  it('`dryRun: false` bei Schalter `dry-run` ⇒ 409 `check_erasure_not_apply`, nichts geschrieben', async () => {
    appConfig = { pukalani: { brand: { checkErasure: 'dry-run' } } }
    tables.brand_checks = [check('doc', { source: 'document', erasedAt: daysAgo(400) })]
    body = { dryRun: false }
    await expect(runHandler(event)).rejects.toMatchObject({ status: 409, data: { code: 'check_erasure_not_apply' } })
    expect(findCheck('doc')).toBeDefined()
    expect(tablesDB.listRows).not.toHaveBeenCalled()
  })

  it('`dryRun: false` bei Schalter `apply` ⇒ der echte Lauf', async () => {
    appConfig = { pukalani: { brand: { checkErasure: 'apply' } } }
    tables.brand_checks = [check('doc', { source: 'document', erasedAt: daysAgo(400) })]
    body = { dryRun: false }
    const result = await runHandler(event)
    expect(result).toMatchObject({ mode: 'apply', deleted: 1 })
    expect(findCheck('doc')).toBeUndefined()
  })

  it('läuft gerade ein Lauf ⇒ 409 `check_erasure_busy`', async () => {
    let release!: () => void
    gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const running = runBrandCheckErasure('dry-run', { now: NOW })
    await expect(runHandler(event)).rejects.toMatchObject({ status: 409, data: { code: 'check_erasure_busy' } })
    release()
    await running
  })
})
