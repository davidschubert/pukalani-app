import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import * as retention from '../../core/server/utils/rowRetention'
import type { RowRetentionResult } from '../../core/shared/rowRetention'
import {
  BRAND_WAITLIST_DECIDED_DAYS,
  BRAND_WAITLIST_RETENTION_JOB,
  BRAND_WAITLIST_SHORTEST_DAYS,
  BRAND_WAITLIST_UNCONFIRMED_DAYS,
  BRAND_WAITLIST_WAITING_DAYS,
  decideBrandWaitlistRetention,
} from '../shared/brandWaitlistRetention'

/**
 * DER FRISTEN-LAUF DER WARTELISTE (EL1 c) — Regel mit gestellter Uhr,
 * gefälschte Ablage, ECHTER Lauf über das Core-Gerüst, echte Hand-Route und
 * echtes Plugin.
 *
 * Löschen ist nicht umkehrbar. Geprüft wird deshalb: jede Frist an ihrer
 * Grenze (genau N Tage ⇒ bleibt, eine Millisekunde mehr ⇒ fällig), dass
 * `count` nichts schreibt und dieselbe Zahl nennt, die `apply` löscht, dass
 * die Hand-Route ohne Angabe nur zählt und nie am Schalter vorbei löscht, und
 * dass das Plugin bei `off` gar nichts anmeldet.
 *
 * Der Fake filtert SELBST nach den Abfragen (`lessThan`, `orderAsc`,
 * `cursorAfter`, `limit`) — sonst hinge „nur alte Zeilen" am Test-Aufbau statt
 * am Code.
 */

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-17T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const daysAgo = (days: number) => ago(days * DAY)

interface FakeRow { $id: string, $createdAt: string, $updatedAt: string, status: string, [key: string]: unknown }
interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

let rows: FakeRow[]
let brokenDeletes: Set<string>
let gate: Promise<void> | null
let appConfig: Record<string, unknown>
let labels: string[] | null
let body: Record<string, unknown> | undefined
let productActive: boolean
let lastQueries: ParsedQuery[]
let registered: { name: string, everyMs: number, firstRunMs?: number, unref?: boolean, run: () => Promise<'skipped' | undefined> }[]

function select(queries: string[]): FakeRow[] {
  const parsed = queries.map(q => JSON.parse(q) as ParsedQuery)
  lastQueries = parsed
  let out = [...rows]
  for (const entry of parsed) {
    if (entry.method === 'lessThan') {
      const attribute = entry.attribute ?? ''
      const bound = String(entry.values?.[0])
      out = out.filter(row => typeof row[attribute] === 'string' && (row[attribute] as string) < bound)
    }
  }
  const orders = parsed.filter(entry => entry.method === 'orderAsc').map(entry => entry.attribute ?? '')
  out.sort((a, b) => {
    for (const attribute of orders) {
      const diff = String(a[attribute]).localeCompare(String(b[attribute]))
      if (diff !== 0) return diff
    }
    return 0
  })
  const cursor = parsed.find(entry => entry.method === 'cursorAfter')?.values?.[0]
  if (typeof cursor === 'string') {
    const at = out.findIndex(row => row.$id === cursor)
    if (at < 0) throw new AppwriteException('Cursor not found', 400, 'general_cursor_not_found')
    out = out.slice(at + 1)
  }
  const limit = parsed.find(entry => entry.method === 'limit')?.values?.[0]
  if (typeof limit === 'number') out = out.slice(0, limit)
  return out
}

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    if (gate) {
      const wait = gate
      gate = null
      await wait
    }
    if (tableId !== 'brand_waitlist') throw new AppwriteException('Table not found', 404, 'table_not_found')
    const found = select(queries)
    return { total: found.length, rows: found }
  }),
  deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    if (tableId !== 'brand_waitlist') throw new Error(`falsche Tabelle ${tableId}`)
    if (brokenDeletes.has(rowId)) throw new AppwriteException('Server Error', 500, 'general_unknown')
    const at = rows.findIndex(row => row.$id === rowId)
    if (at < 0) throw new AppwriteException('Row not found', 404, 'row_not_found')
    rows.splice(at, 1)
  }),
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('defineNitroPlugin', (fn: unknown) => fn)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('useAppConfig', () => appConfig)
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('logEvent', () => {})
/** Dieselbe Rechnung wie core/server/utils/requirePermission.ts. */
vi.stubGlobal('requirePermission', (_event: H3Event, capability: string) => {
  if (labels === null) throw createError({ status: 401, statusText: 'Unauthorized' })
  if (!labels.includes('admin') && capability !== 'dashboard.access') {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }
  return { $id: 'u-operator', labels }
})
vi.stubGlobal('readValidatedBody', async (_event: H3Event, run: (input: unknown) => unknown) => run(body))
vi.stubGlobal('getProductRegistry', () => ({ has: (key: string) => productActive && key === 'brand' }))
vi.stubGlobal('defineTimedJob', (options: (typeof registered)[number]) => {
  registered.push(options)
})
// Das ECHTE Gerüst des Core — gefälscht ist nur die Ablage.
vi.stubGlobal('retentionModeOf', retention.retentionModeOf)
vi.stubGlobal('tableRetentionDeps', retention.tableRetentionDeps)
vi.stubGlobal('runRetentionJob', retention.runRetentionJob)
vi.stubGlobal('retentionTick', retention.retentionTick)

const { brandWaitlistRetentionMode, runBrandWaitlistRetention } = await import('../server/utils/brandWaitlistRetentionRun')
const runHandler = (await import('../server/api/brand/admin/waitlist-retention/run.post'))
  .default as unknown as (event: H3Event) => Promise<RowRetentionResult>
const plugin = (await import('../server/plugins/brand-waitlist-retention')).default as unknown as () => void

const event = { context: {} } as unknown as H3Event

function row(id: string, status: string, createdAt: string, updatedAt: string = createdAt): FakeRow {
  return { $id: id, $createdAt: createdAt, $updatedAt: updatedAt, status, emailLower: `${id}@kailua.coffee` }
}

/** Ein Bestand mit je einer fälligen und einer bleibenden Zeile je Frist. */
function mixedTable(): FakeRow[] {
  return [
    row('p-old', 'pending', daysAgo(45)),
    row('p-renewed', 'pending', daysAgo(45), daysAgo(2)),
    row('i-old', 'invited', daysAgo(200), daysAgo(91)),
    row('i-fresh', 'invited', daysAgo(200), daysAgo(89)),
    row('d-old', 'declined', daysAgo(120), daysAgo(95)),
    row('c-old', 'confirmed', daysAgo(400), daysAgo(1)),
    row('c-fresh', 'confirmed', daysAgo(300)),
    row('n-old', 'new', daysAgo(366)),
    row('fresh', 'pending', daysAgo(3)),
  ]
}

const ids = () => rows.map(entry => entry.$id).sort()

beforeEach(() => {
  // Takt und Hand-Route rechnen mit der Uhr des Prozesses — gestellt auf NOW.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  retention.__resetRetentionJobsForTests()
  rows = []
  brokenDeletes = new Set()
  gate = null
  appConfig = { pukalani: { brand: {} } }
  labels = ['admin']
  body = undefined
  productActive = true
  lastQueries = []
  registered = []
  tablesDB.listRows.mockClear()
  tablesDB.deleteRow.mockClear()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
})

describe('shared/brandWaitlistRetention (die pure Regel)', () => {
  it('die drei Fristen sind 30, 90 und 365 Tage; die Vorauswahl nimmt die kürzeste', () => {
    expect([BRAND_WAITLIST_UNCONFIRMED_DAYS, BRAND_WAITLIST_DECIDED_DAYS, BRAND_WAITLIST_WAITING_DAYS]).toEqual([30, 90, 365])
    expect(BRAND_WAITLIST_SHORTEST_DAYS).toBe(30)
  })

  it('nie bestätigt: genau 30 Tage nach der letzten Anforderung bleibt, eine Millisekunde mehr ist fällig', () => {
    const created = daysAgo(400)
    expect(decideBrandWaitlistRetention({ status: 'pending', $createdAt: created, $updatedAt: ago(30 * DAY) }, NOW)).toBeNull()
    expect(decideBrandWaitlistRetention({ status: 'pending', $createdAt: created, $updatedAt: ago(30 * DAY + 1) }, NOW)).toBe('unconfirmed')
  })

  it('nie bestätigt zählt ab `$updatedAt`: eine erneute Anforderung hält die alte Zeile', () => {
    expect(decideBrandWaitlistRetention({ status: 'pending', $createdAt: daysAgo(200), $updatedAt: daysAgo(1) }, NOW)).toBeNull()
  })

  it.each(['invited', 'declined'] as const)('%s: genau 90 Tage bleibt, eine Millisekunde mehr ist fällig', (status) => {
    const created = daysAgo(400)
    expect(decideBrandWaitlistRetention({ status, $createdAt: created, $updatedAt: ago(90 * DAY) }, NOW)).toBeNull()
    expect(decideBrandWaitlistRetention({ status, $createdAt: created, $updatedAt: ago(90 * DAY + 1) }, NOW)).toBe(status)
    // 60 Tage nach der Entscheidung: die 30-Tage-Frist gilt hier NICHT.
    expect(decideBrandWaitlistRetention({ status, $createdAt: created, $updatedAt: daysAgo(60) }, NOW)).toBeNull()
  })

  it.each(['confirmed', 'new', 'quatsch', ''])('„%s" wartet: genau 365 Tage ab dem Eintragen bleibt, eine Millisekunde mehr ist fällig', (status) => {
    expect(decideBrandWaitlistRetention({ status, $createdAt: ago(365 * DAY), $updatedAt: daysAgo(1) }, NOW)).toBeNull()
    expect(decideBrandWaitlistRetention({ status, $createdAt: ago(365 * DAY + 1), $updatedAt: daysAgo(1) }, NOW)).toBe('waiting')
  })

  it('wartend zählt ab `$createdAt` — eine Notiz verlängert die zwölf Monate nicht', () => {
    expect(decideBrandWaitlistRetention({ status: 'confirmed', $createdAt: daysAgo(366), $updatedAt: daysAgo(0) }, NOW)).toBe('waiting')
  })

  it('ein leerer oder unlesbarer Zeitpunkt heisst „bleibt"', () => {
    expect(decideBrandWaitlistRetention({ status: 'pending', $createdAt: daysAgo(400), $updatedAt: '' }, NOW)).toBeNull()
    expect(decideBrandWaitlistRetention({ status: 'invited', $updatedAt: 'gestern' }, NOW)).toBeNull()
    expect(decideBrandWaitlistRetention({ status: 'confirmed', $createdAt: null }, NOW)).toBeNull()
  })
})

describe('der Lauf (echtes Gerüst, gefälschte Ablage)', () => {
  it('count schreibt nichts und nennt dieselbe Zahl, die apply danach löscht', async () => {
    rows = mixedTable()
    const counted = await runBrandWaitlistRetention('count', { now: NOW })
    expect(tablesDB.deleteRow).not.toHaveBeenCalled()
    expect(rows).toHaveLength(9)
    expect(counted).toMatchObject({
      mode: 'count',
      expired: 5,
      deleted: 0,
      failed: 0,
      byReason: { unconfirmed: 1, invited: 1, declined: 1, waiting: 2 },
    })

    const applied = await runBrandWaitlistRetention('apply', { now: NOW })
    expect(applied).toMatchObject({ mode: 'apply', expired: 5, deleted: 5, failed: 0 })
    expect(ids()).toEqual(['c-fresh', 'fresh', 'i-fresh', 'p-renewed'])
  })

  it('die Vorauswahl ist „angelegt vor mehr als 30 Tagen" — frische Einträge sieht der Lauf gar nicht', async () => {
    rows = [row('fresh', 'pending', daysAgo(3)), row('young-declined', 'declined', daysAgo(29), daysAgo(29))]
    const result = await runBrandWaitlistRetention('apply', { now: NOW })
    expect(result).toMatchObject({ considered: 0, expired: 0, deleted: 0 })
    expect(lastQueries).toContainEqual({ method: 'lessThan', attribute: '$createdAt', values: [daysAgo(30)] })
    expect(ids()).toEqual(['fresh', 'young-declined'])
  })

  it('ein Lösch-Fehler zählt als `failed`, der Lauf macht weiter, die Zeile bleibt', async () => {
    rows = mixedTable()
    brokenDeletes = new Set(['i-old'])
    const result = await runBrandWaitlistRetention('apply', { now: NOW })
    expect(result).toMatchObject({ expired: 5, deleted: 4, failed: 1 })
    expect(ids()).toContain('i-old')
    // Der Takt meldet das als gescheitert (job.run).
    await expect(retention.retentionTick(async () => result)()).rejects.toThrow('unvollständig')
  })

  it('viele fällige Zeilen über mehrere Seiten: keine wird übersprungen', async () => {
    rows = Array.from({ length: 250 }, (_, i) =>
      row(`p${String(i).padStart(3, '0')}`, i % 2 === 0 ? 'pending' : 'confirmed', daysAgo(40)))
    const result = await runBrandWaitlistRetention('apply', { now: NOW })
    expect(result).toMatchObject({ considered: 250, expired: 125, deleted: 125 })
    expect(rows.every(entry => entry.status === 'confirmed')).toBe(true)
  })

  it('ein Lesefehler wirft statt „nichts zu tun" zu melden', async () => {
    tablesDB.listRows.mockImplementationOnce(async () => {
      throw new AppwriteException('Server Error', 500, 'general_unknown')
    })
    await expect(runBrandWaitlistRetention('count', { now: NOW })).rejects.toThrow('Server Error')
  })
})

describe('Schalter `pukalani.brand.waitlistRetention`', () => {
  it.each([
    [undefined, 'off'],
    ['off', 'off'],
    ['count', 'count'],
    ['apply', 'apply'],
    ['dry-run', 'off'],
    ['APPLY', 'off'],
  ] as const)('%s ⇒ %s', (value, mode) => {
    appConfig = { pukalani: { brand: { waitlistRetention: value } } }
    expect(brandWaitlistRetentionMode()).toBe(mode)
  })

  it('der Layer gibt `off` vor, branding.supply zählt nur', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const layer = readFileSync(join(here, '..', 'app', 'app.config.ts'), 'utf8')
    const app = readFileSync(join(here, '..', '..', '..', 'apps', 'branding', 'app', 'app.config.ts'), 'utf8')
    expect(layer).toContain(`waitlistRetention: 'off' as RowRetentionMode,`)
    expect(app).toContain(`waitlistRetention: 'count',`)
  })
})

describe('server/plugins/brand-waitlist-retention.ts', () => {
  it('die Kennung im Quelltext ist die Konstante des Laufs', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(join(here, '..', 'server', 'plugins', 'brand-waitlist-retention.ts'), 'utf8')
    expect(source).toContain(`name: '${BRAND_WAITLIST_RETENTION_JOB}',`)
  })

  it('bei `off` meldet es nichts an', () => {
    plugin()
    appConfig = { pukalani: { brand: { waitlistRetention: 'off' } } }
    plugin()
    expect(registered).toHaveLength(0)
  })

  it('bei `count` meldet es den stündlichen Lauf an, und der Takt fährt wirklich den Lauf — ohne zu löschen', async () => {
    appConfig = { pukalani: { brand: { waitlistRetention: 'count' } } }
    plugin()
    expect(registered).toHaveLength(1)
    const job = registered[0]!
    expect(job).toMatchObject({ name: 'brand-waitlist-retention', everyMs: 60 * 60 * 1000, firstRunMs: 8 * 60 * 1000, unref: true })

    rows = mixedTable()
    await expect(job.run()).resolves.toBeUndefined()
    expect(tablesDB.listRows).toHaveBeenCalled()
    expect(tablesDB.deleteRow).not.toHaveBeenCalled()
    expect(rows).toHaveLength(9)
  })

  it('bei `apply` löscht der Takt', async () => {
    appConfig = { pukalani: { brand: { waitlistRetention: 'apply' } } }
    plugin()
    rows = mixedTable()
    await expect(registered[0]!.run()).resolves.toBeUndefined()
    expect(rows).toHaveLength(4)
  })

  it('ohne aktives Produkt `brand` ⇒ `skipped`, ohne zu lesen', async () => {
    appConfig = { pukalani: { brand: { waitlistRetention: 'apply' } } }
    productActive = false
    plugin()
    rows = mixedTable()
    await expect(registered[0]!.run()).resolves.toBe('skipped')
    expect(tablesDB.listRows).not.toHaveBeenCalled()
  })
})

describe('POST /api/brand/admin/waitlist-retention/run', () => {
  it('Gast 401, Konto ohne `users.manage` 403 — vor jedem Lesen', async () => {
    rows = mixedTable()
    labels = null
    await expect(runHandler(event)).rejects.toMatchObject({ status: 401 })
    labels = []
    await expect(runHandler(event)).rejects.toMatchObject({ status: 403 })
    labels = ['moderator']
    await expect(runHandler(event)).rejects.toMatchObject({ status: 403 })
    expect(tablesDB.listRows).not.toHaveBeenCalled()
    expect(rows).toHaveLength(9)
  })

  it('Betreiber ohne Body: es wird nur gezählt — auch bei Schalter `apply`', async () => {
    appConfig = { pukalani: { brand: { waitlistRetention: 'apply' } } }
    rows = mixedTable()
    const result = await runHandler(event)
    expect(result).toMatchObject({ mode: 'count', expired: 5, deleted: 0 })
    expect(tablesDB.deleteRow).not.toHaveBeenCalled()
    expect(rows).toHaveLength(9)
  })

  it('die Antwort trägt nur Zahlen, keine Ids und keine Adressen', async () => {
    rows = mixedTable()
    const result = await runHandler(event)
    expect(JSON.stringify(result)).not.toMatch(/kailua|p-old|i-old/)
  })

  it.each(['off', 'count', undefined])('`apply: true` bei Schalter %s ⇒ 409 `waitlist_retention_not_apply`, nichts gelesen, nichts gelöscht', async (mode) => {
    appConfig = { pukalani: { brand: { waitlistRetention: mode } } }
    rows = mixedTable()
    body = { apply: true }
    await expect(runHandler(event)).rejects.toMatchObject({ status: 409, data: { code: 'waitlist_retention_not_apply' } })
    expect(tablesDB.listRows).not.toHaveBeenCalled()
    expect(rows).toHaveLength(9)
  })

  it('`apply: true` bei Schalter `apply` ⇒ der echte Lauf', async () => {
    appConfig = { pukalani: { brand: { waitlistRetention: 'apply' } } }
    rows = mixedTable()
    body = { apply: true }
    const result = await runHandler(event)
    expect(result).toMatchObject({ mode: 'apply', deleted: 5 })
    expect(rows).toHaveLength(4)
  })

  it('ein ungültiger Body wird abgelehnt', async () => {
    body = { apply: 'ja' }
    await expect(runHandler(event)).rejects.toThrow()
    expect(tablesDB.listRows).not.toHaveBeenCalled()
  })

  it('läuft gerade ein Lauf ⇒ 409 `waitlist_retention_busy`', async () => {
    let release!: () => void
    gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const running = runBrandWaitlistRetention('count', { now: NOW })
    await expect(runHandler(event)).rejects.toMatchObject({ status: 409, data: { code: 'waitlist_retention_busy' } })
    release()
    await running
  })
})
