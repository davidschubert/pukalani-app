import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppwriteException } from 'node-appwrite'
import * as retention from '../server/utils/rowRetention'
import {
  AUDIT_LOG_RETENTION_DAYS,
  AUDIT_LOG_RETENTION_JOB,
  decideAuditLogRetention,
} from '../shared/auditLogRetention'

/**
 * DER FRISTEN-LAUF DES KONTO-PROTOKOLLS (EL1 c) — Regel mit gestellter Uhr,
 * gefälschte Ablage, ECHTER Lauf über das Gerüst und echtes Plugin. Die
 * Hand-Route liegt im admin-Layer und hat ihren Test dort
 * (`admin/tests/auditLogRetentionRoute.test.ts`).
 *
 * Löschen ist nicht umkehrbar. Geprüft wird deshalb: die Frist an ihrer
 * Grenze (genau 365 Tage ⇒ bleibt, eine Millisekunde mehr ⇒ fällig), dass
 * `count` nichts schreibt und dieselbe Zahl nennt, die `apply` löscht, dass
 * eine FEHLENDE Tabelle „nichts zu tun" heisst und JEDER ANDERE Lesefehler
 * wirft, und dass das Plugin bei `off` gar nichts anmeldet.
 *
 * Der Fake filtert SELBST nach den Abfragen (`lessThan`, `orderAsc`,
 * `cursorAfter`, `limit`) — sonst hinge „nur alte Zeilen" am Test-Aufbau statt
 * am Code.
 */

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-17T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const daysAgo = (days: number) => ago(days * DAY)

interface FakeRow { $id: string, $createdAt: string, $updatedAt: string, action: string, [key: string]: unknown }
interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

let rows: FakeRow[]
let brokenDeletes: Set<string>
let tableMissing: boolean
let appConfig: Record<string, unknown>
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
    if (tableMissing || tableId !== 'audit_logs') throw new AppwriteException('Table not found', 404, 'table_not_found')
    const found = select(queries)
    return { total: found.length, rows: found }
  }),
  deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    if (tableId !== 'audit_logs') throw new Error(`falsche Tabelle ${tableId}`)
    if (brokenDeletes.has(rowId)) throw new AppwriteException('Server Error', 500, 'general_unknown')
    const at = rows.findIndex(row => row.$id === rowId)
    if (at < 0) throw new AppwriteException('Row not found', 404, 'row_not_found')
    rows.splice(at, 1)
  }),
  createRow: vi.fn(async () => {
    throw new Error('der Lauf schreibt nie ins Protokoll')
  }),
}

vi.stubGlobal('defineNitroPlugin', (fn: unknown) => fn)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('useAppConfig', () => appConfig)
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('defineTimedJob', (options: (typeof registered)[number]) => {
  registered.push(options)
})

const { auditLogRetentionMode, runAuditLogRetention } = await import('../server/utils/auditLogRetention')
const plugin = (await import('../server/plugins/audit-log-retention')).default as unknown as () => void

function row(id: string, createdAt: string, action = 'user.blocked', updatedAt: string = createdAt): FakeRow {
  return { $id: id, $createdAt: createdAt, $updatedAt: updatedAt, action, actorName: `Betreiber ${id}`, ip: '203.0.113.7' }
}

/** Alte und frische Einträge, darunter Handlungen des Betreibers. */
function mixedTable(): FakeRow[] {
  return [
    row('a-old', daysAgo(400), 'user.blocked'),
    row('a-operator', daysAgo(366), 'audit_log.retention_applied'),
    // pseudonymisiert vor kurzem — `$updatedAt` verlängert die Frist nicht
    row('a-pseudo', daysAgo(500), 'user.login', daysAgo(1)),
    row('a-edge', ago(365 * DAY)),
    row('a-young', daysAgo(300)),
    row('a-fresh', daysAgo(1)),
  ]
}

const ids = () => rows.map(entry => entry.$id).sort()

beforeEach(() => {
  // Takt und Lauf rechnen mit der Uhr des Prozesses — gestellt auf NOW.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  retention.__resetRetentionJobsForTests()
  rows = []
  brokenDeletes = new Set()
  tableMissing = false
  appConfig = { pukalani: {} }
  lastQueries = []
  registered = []
  tablesDB.listRows.mockClear()
  tablesDB.deleteRow.mockClear()
  tablesDB.createRow.mockClear()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
})

describe('shared/auditLogRetention (die pure Regel)', () => {
  it('die Frist ist 365 Tage', () => {
    expect(AUDIT_LOG_RETENTION_DAYS).toBe(365)
  })

  it('genau 365 Tage nach dem Schreiben bleibt, eine Millisekunde mehr ist fällig', () => {
    expect(decideAuditLogRetention({ $createdAt: ago(365 * DAY) }, NOW)).toBeNull()
    expect(decideAuditLogRetention({ $createdAt: ago(365 * DAY + 1) }, NOW)).toBe('expired')
  })

  it('ein leerer oder unlesbarer Zeitpunkt heisst „bleibt"', () => {
    expect(decideAuditLogRetention({ $createdAt: '' }, NOW)).toBeNull()
    expect(decideAuditLogRetention({ $createdAt: null }, NOW)).toBeNull()
    expect(decideAuditLogRetention({ $createdAt: 'letztes Jahr' }, NOW)).toBeNull()
  })
})

describe('der Lauf (echtes Gerüst, gefälschte Ablage)', () => {
  it('count schreibt nichts und nennt dieselbe Zahl, die apply danach löscht — auch Einträge über Betreiber-Handlungen', async () => {
    rows = mixedTable()
    const counted = await runAuditLogRetention('count', { now: NOW })
    expect(tablesDB.deleteRow).not.toHaveBeenCalled()
    expect(rows).toHaveLength(6)
    expect(counted).toMatchObject({ mode: 'count', expired: 3, deleted: 0, failed: 0, byReason: { expired: 3 } })

    const applied = await runAuditLogRetention('apply', { now: NOW })
    expect(applied).toMatchObject({ mode: 'apply', expired: 3, deleted: 3, failed: 0 })
    expect(ids()).toEqual(['a-edge', 'a-fresh', 'a-young'])
    // Kein Eintrag je gelöschter Zeile.
    expect(tablesDB.createRow).not.toHaveBeenCalled()
  })

  it('die Vorauswahl ist „angelegt vor mehr als 365 Tagen" — frische Einträge sieht der Lauf gar nicht', async () => {
    rows = [row('a-young', daysAgo(300)), row('a-fresh', daysAgo(1))]
    const result = await runAuditLogRetention('apply', { now: NOW })
    expect(result).toMatchObject({ considered: 0, expired: 0, deleted: 0 })
    expect(lastQueries).toContainEqual({ method: 'lessThan', attribute: '$createdAt', values: [daysAgo(365)] })
    expect(ids()).toEqual(['a-fresh', 'a-young'])
  })

  it('ein Lösch-Fehler zählt als `failed`, der Lauf macht weiter, die Zeile bleibt', async () => {
    rows = mixedTable()
    brokenDeletes = new Set(['a-operator'])
    const result = await runAuditLogRetention('apply', { now: NOW })
    expect(result).toMatchObject({ expired: 3, deleted: 2, failed: 1 })
    expect(ids()).toContain('a-operator')
    await expect(retention.retentionTick(async () => result)()).rejects.toThrow('unvollständig')
  })

  it('viele fällige Einträge über mehrere Seiten: keiner wird übersprungen', async () => {
    rows = Array.from({ length: 250 }, (_, i) =>
      row(`r${String(i).padStart(3, '0')}`, i % 2 === 0 ? daysAgo(400) : daysAgo(300)))
    // Die jungen tragen ein jüngeres `$createdAt` und fallen schon aus der Vorauswahl.
    const result = await runAuditLogRetention('apply', { now: NOW })
    expect(result).toMatchObject({ considered: 125, expired: 125, deleted: 125 })
    expect(rows).toHaveLength(125)
  })

  it('fehlt die Tabelle (404 `table_not_found`), ist nichts zu tun — kein Scheitern', async () => {
    tableMissing = true
    const result = await runAuditLogRetention('apply', { now: NOW })
    expect(result).toMatchObject({ considered: 0, expired: 0, deleted: 0, failed: 0 })
    await expect(retention.retentionTick(async () => result)()).resolves.toBeUndefined()
  })

  it.each([
    ['500', new AppwriteException('Server Error', 500, 'general_unknown')],
    ['404 ohne Art (Proxy)', new AppwriteException('Not Found', 404, '')],
    ['404 einer fehlenden Datenbank', new AppwriteException('Database not found', 404, 'database_not_found')],
    ['Netzfehler', new Error('fetch failed')],
  ])('jeder andere Lesefehler wirft statt „nichts zu tun" zu melden (%s)', async (_label, error) => {
    tablesDB.listRows.mockImplementationOnce(async () => {
      throw error
    })
    await expect(runAuditLogRetention('count', { now: NOW })).rejects.toBe(error)
  })
})

describe('Schalter `pukalani.audit.retention`', () => {
  it.each([
    [undefined, 'off'],
    ['off', 'off'],
    ['count', 'count'],
    ['apply', 'apply'],
    ['dry-run', 'off'],
    ['APPLY', 'off'],
  ] as const)('%s ⇒ %s', (value, mode) => {
    appConfig = { pukalani: { audit: { retention: value } } }
    expect(auditLogRetentionMode()).toBe(mode)
  })

  it('der Core gibt `off` vor; die ausgerollten Apps löschen seit der Freigabe vom 2026-11-17, die Test-App zählt nur', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const core = readFileSync(join(here, '..', 'app', 'app.config.ts'), 'utf8')
    expect(core).toContain(`retention: 'off' as RowRetentionMode,`)
    const expected: Record<string, string> = { control: 'apply', platform: 'apply', branding: 'apply', portfolio: 'apply', comments: 'count' }
    for (const [app, mode] of Object.entries(expected)) {
      const source = readFileSync(join(here, '..', '..', '..', 'apps', app, 'app', 'app.config.ts'), 'utf8')
      expect(source, app).toContain(`audit: { retention: '${mode}' },`)
    }
  })
})

describe('server/plugins/audit-log-retention.ts', () => {
  it('die Kennung im Quelltext ist die Konstante des Laufs', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(join(here, '..', 'server', 'plugins', 'audit-log-retention.ts'), 'utf8')
    expect(source).toContain(`name: '${AUDIT_LOG_RETENTION_JOB}',`)
  })

  it('bei `off` meldet es nichts an', () => {
    plugin()
    appConfig = { pukalani: { audit: { retention: 'off' } } }
    plugin()
    appConfig = { pukalani: { audit: { retention: 'quatsch' } } }
    plugin()
    expect(registered).toHaveLength(0)
  })

  it('bei `count` meldet es den stündlichen Lauf an, und der Takt fährt wirklich den Lauf — ohne zu löschen', async () => {
    appConfig = { pukalani: { audit: { retention: 'count' } } }
    plugin()
    expect(registered).toHaveLength(1)
    const job = registered[0]!
    expect(job).toMatchObject({ name: 'audit-log-retention', everyMs: 60 * 60 * 1000, firstRunMs: 14 * 60 * 1000, unref: true })

    rows = mixedTable()
    await expect(job.run()).resolves.toBeUndefined()
    expect(tablesDB.listRows).toHaveBeenCalled()
    expect(tablesDB.deleteRow).not.toHaveBeenCalled()
    expect(rows).toHaveLength(6)
  })

  it('bei `apply` löscht der Takt — und schreibt keinen Protokoll-Eintrag', async () => {
    appConfig = { pukalani: { audit: { retention: 'apply' } } }
    plugin()
    rows = mixedTable()
    await expect(registered[0]!.run()).resolves.toBeUndefined()
    expect(rows).toHaveLength(3)
    expect(tablesDB.createRow).not.toHaveBeenCalled()
  })

  it('ohne Tabelle meldet der Takt Erfolg, nicht Scheitern', async () => {
    appConfig = { pukalani: { audit: { retention: 'count' } } }
    plugin()
    tableMissing = true
    await expect(registered[0]!.run()).resolves.toBeUndefined()
  })
})
