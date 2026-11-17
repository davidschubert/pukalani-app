import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import * as retention from '../../../packages/core/server/utils/rowRetention'
import { retentionDepsIgnoringMissingTable } from '../../../packages/core/server/utils/auditLogRetention'
import { requirePermission } from '../../../packages/core/server/utils/requirePermission'
import type { RowRetentionResult } from '../../../packages/core/shared/rowRetention'
import {
  INTRO_REQUEST_RETENTION_DAYS,
  INTRO_REQUEST_RETENTION_JOB,
  decideIntroRequestRetention,
} from '#shared/introRequestRetention'

/**
 * DER FRISTEN-LAUF DER GESPRÄCHSANFRAGEN VON pukalani.studio (EL1 c) — Regel
 * mit gestellter Uhr, gefälschte Ablage, ECHTER Lauf über das Core-Gerüst,
 * echte Hand-Route mit der ECHTEN Rechte-Prüfung und echtes Plugin.
 *
 * Löschen ist nicht umkehrbar. Geprüft wird deshalb: die Frist an ihrer
 * Grenze (genau 365 Tage ⇒ bleibt, eine Millisekunde mehr ⇒ fällig), dass
 * `count` nichts schreibt und dieselbe Zahl nennt, die `apply` löscht, dass
 * eine fehlende Tabelle (ensure-Skript) „nichts zu tun" heisst und jeder
 * andere Lesefehler wirft, dass die Hand-Route ohne Angabe nur zählt und nie
 * am Schalter vorbei löscht, und dass das Plugin bei `off` nichts anmeldet.
 * Wer durch die Route darf, steht AUSGESCHRIEBEN: nur `admin`.
 */

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-17T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const daysAgo = (days: number) => ago(days * DAY)

interface FakeRow { $id: string, $createdAt: string, [key: string]: unknown }
interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

let rows: FakeRow[]
let brokenDeletes: Set<string>
let tableMissing: boolean
let gate: Promise<void> | null
let appConfig: Record<string, unknown>
let user: { $id: string, labels: string[] } | null
let body: Record<string, unknown> | undefined
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
    if (tableMissing || tableId !== 'intro_requests') throw new AppwriteException('Table not found', 404, 'table_not_found')
    const found = select(queries)
    return { total: found.length, rows: found }
  }),
  deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    if (tableId !== 'intro_requests') throw new Error(`falsche Tabelle ${tableId}`)
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
vi.stubGlobal('readValidatedBody', async (_event: H3Event, run: (input: unknown) => unknown) => run(body))
vi.stubGlobal('defineTimedJob', (options: (typeof registered)[number]) => {
  registered.push(options)
})
// Die ECHTEN Bausteine des Core — gefälscht ist nur die Ablage.
vi.stubGlobal('requirePermission', requirePermission)
vi.stubGlobal('retentionModeOf', retention.retentionModeOf)
vi.stubGlobal('tableRetentionDeps', retention.tableRetentionDeps)
vi.stubGlobal('runRetentionJob', retention.runRetentionJob)
vi.stubGlobal('retentionTick', retention.retentionTick)
vi.stubGlobal('retentionDepsIgnoringMissingTable', retentionDepsIgnoringMissingTable)

const { introRequestRetentionMode, runIntroRequestRetention } = await import('../server/utils/introRequestRetentionRun')
const runHandler = (await import('../server/api/admin/intro-requests/retention/run.post'))
  .default as unknown as (event: H3Event) => Promise<RowRetentionResult>
const plugin = (await import('../server/plugins/intro-request-retention')).default as unknown as () => void

const call = () => runHandler({ context: { user } } as unknown as H3Event)

function row(id: string, createdAt: string): FakeRow {
  return { $id: id, $createdAt: createdAt, $updatedAt: createdAt, name: `Name ${id}`, email: `${id}@kailua.coffee`, phone: '+49' }
}

function mixedTable(): FakeRow[] {
  return [
    row('old-1', daysAgo(500)),
    row('old-2', daysAgo(366)),
    row('edge', ago(365 * DAY)),
    row('young', daysAgo(200)),
    row('fresh', daysAgo(1)),
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
  tableMissing = false
  gate = null
  appConfig = { pukalani: {} }
  user = { $id: 'u-admin', labels: ['admin'] }
  body = undefined
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

describe('shared/introRequestRetention (die pure Regel)', () => {
  it('die Frist ist 365 Tage', () => {
    expect(INTRO_REQUEST_RETENTION_DAYS).toBe(365)
  })

  it('genau 365 Tage nach dem Eingang bleibt, eine Millisekunde mehr ist fällig', () => {
    expect(decideIntroRequestRetention({ $createdAt: ago(365 * DAY) }, NOW)).toBeNull()
    expect(decideIntroRequestRetention({ $createdAt: ago(365 * DAY + 1) }, NOW)).toBe('expired')
  })

  it('ein leerer oder unlesbarer Zeitpunkt heisst „bleibt"', () => {
    expect(decideIntroRequestRetention({ $createdAt: '' }, NOW)).toBeNull()
    expect(decideIntroRequestRetention({ $createdAt: null }, NOW)).toBeNull()
    expect(decideIntroRequestRetention({ $createdAt: 'gestern' }, NOW)).toBeNull()
  })
})

describe('der Lauf (echtes Gerüst, gefälschte Ablage)', () => {
  it('count schreibt nichts und nennt dieselbe Zahl, die apply danach löscht', async () => {
    rows = mixedTable()
    const counted = await runIntroRequestRetention('count', { now: NOW })
    expect(tablesDB.deleteRow).not.toHaveBeenCalled()
    expect(rows).toHaveLength(5)
    expect(counted).toMatchObject({ mode: 'count', expired: 2, deleted: 0, failed: 0, byReason: { expired: 2 } })

    const applied = await runIntroRequestRetention('apply', { now: NOW })
    expect(applied).toMatchObject({ mode: 'apply', expired: 2, deleted: 2, failed: 0 })
    expect(ids()).toEqual(['edge', 'fresh', 'young'])
  })

  it('die Vorauswahl ist „angelegt vor mehr als 365 Tagen" — frische Anfragen sieht der Lauf gar nicht', async () => {
    rows = [row('young', daysAgo(364)), row('fresh', daysAgo(1))]
    const result = await runIntroRequestRetention('apply', { now: NOW })
    expect(result).toMatchObject({ considered: 0, expired: 0, deleted: 0 })
    expect(lastQueries).toContainEqual({ method: 'lessThan', attribute: '$createdAt', values: [daysAgo(365)] })
    expect(ids()).toEqual(['fresh', 'young'])
  })

  it('ein Lösch-Fehler zählt als `failed`, der Lauf macht weiter, die Zeile bleibt', async () => {
    rows = mixedTable()
    brokenDeletes = new Set(['old-1'])
    const result = await runIntroRequestRetention('apply', { now: NOW })
    expect(result).toMatchObject({ expired: 2, deleted: 1, failed: 1 })
    expect(ids()).toContain('old-1')
    await expect(retention.retentionTick(async () => result)()).rejects.toThrow('unvollständig')
  })

  it('viele fällige Zeilen über mehrere Seiten: keine wird übersprungen', async () => {
    rows = Array.from({ length: 250 }, (_, i) => row(`r${String(i).padStart(3, '0')}`, daysAgo(400)))
    const result = await runIntroRequestRetention('apply', { now: NOW })
    expect(result).toMatchObject({ considered: 250, expired: 250, deleted: 250 })
    expect(rows).toHaveLength(0)
  })

  it('fehlt die Tabelle (ensure-Skript nicht gelaufen), ist nichts zu tun — kein Scheitern', async () => {
    tableMissing = true
    const result = await runIntroRequestRetention('apply', { now: NOW })
    expect(result).toMatchObject({ considered: 0, expired: 0, deleted: 0, failed: 0 })
  })

  it('jeder andere Lesefehler wirft statt „nichts zu tun" zu melden', async () => {
    tablesDB.listRows.mockImplementationOnce(async () => {
      throw new AppwriteException('Server Error', 500, 'general_unknown')
    })
    await expect(runIntroRequestRetention('count', { now: NOW })).rejects.toThrow('Server Error')
    tablesDB.listRows.mockImplementationOnce(async () => {
      throw new AppwriteException('Not Found', 404, '')
    })
    await expect(runIntroRequestRetention('count', { now: NOW })).rejects.toThrow('Not Found')
  })
})

describe('Schalter `pukalani.portfolio.introRequestRetention`', () => {
  it.each([
    [undefined, 'off'],
    ['off', 'off'],
    ['count', 'count'],
    ['apply', 'apply'],
    ['dry-run', 'off'],
    ['APPLY', 'off'],
  ] as const)('%s ⇒ %s', (value, mode) => {
    appConfig = { pukalani: { portfolio: { introRequestRetention: value } } }
    expect(introRequestRetentionMode()).toBe(mode)
  })

  it('ohne Abschnitt `portfolio` heisst es `off`', () => {
    appConfig = {}
    expect(introRequestRetentionMode()).toBe('off')
  })

  it('pukalani.studio löscht seit der Freigabe vom 2026-11-17', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const app = readFileSync(join(here, '..', 'app', 'app.config.ts'), 'utf8')
    expect(app).toContain(`portfolio: { introRequestRetention: 'apply' },`)
  })
})

describe('server/plugins/intro-request-retention.ts', () => {
  it('die Kennung im Quelltext ist die Konstante des Laufs', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(join(here, '..', 'server', 'plugins', 'intro-request-retention.ts'), 'utf8')
    expect(source).toContain(`name: '${INTRO_REQUEST_RETENTION_JOB}',`)
  })

  it('bei `off` (auch ohne Wert) meldet es nichts an', () => {
    plugin()
    appConfig = { pukalani: { portfolio: { introRequestRetention: 'off' } } }
    plugin()
    expect(registered).toHaveLength(0)
  })

  it('bei `count` meldet es den stündlichen Lauf an, und der Takt fährt wirklich den Lauf — ohne zu löschen', async () => {
    appConfig = { pukalani: { portfolio: { introRequestRetention: 'count' } } }
    plugin()
    expect(registered).toHaveLength(1)
    const job = registered[0]!
    expect(job).toMatchObject({ name: 'intro-request-retention', everyMs: 60 * 60 * 1000, firstRunMs: 10 * 60 * 1000, unref: true })

    rows = mixedTable()
    await expect(job.run()).resolves.toBeUndefined()
    expect(tablesDB.listRows).toHaveBeenCalled()
    expect(tablesDB.deleteRow).not.toHaveBeenCalled()
    expect(rows).toHaveLength(5)
  })

  it('bei `apply` löscht der Takt', async () => {
    appConfig = { pukalani: { portfolio: { introRequestRetention: 'apply' } } }
    plugin()
    rows = mixedTable()
    await expect(registered[0]!.run()).resolves.toBeUndefined()
    expect(rows).toHaveLength(3)
  })
})

describe('POST /api/admin/intro-requests/retention/run', () => {
  it.each([
    ['Gast', null, 401],
    ['Konto ohne Rolle', { $id: 'u-1', labels: [] }, 403],
    ['Moderator', { $id: 'u-2', labels: ['moderator'] }, 403],
  ] as const)('%s ⇒ %s — vor jedem Lesen, auch mit `apply` und Schalter `apply`', async (_label, who, status) => {
    appConfig = { pukalani: { portfolio: { introRequestRetention: 'apply' } } }
    rows = mixedTable()
    user = who === null ? null : { $id: who.$id, labels: [...who.labels] }
    body = { apply: true }
    await expect(call()).rejects.toMatchObject({ status })
    expect(tablesDB.listRows).not.toHaveBeenCalled()
    expect(rows).toHaveLength(5)
  })

  it('Betreiber ohne Body: es wird nur gezählt — auch bei Schalter `apply`', async () => {
    appConfig = { pukalani: { portfolio: { introRequestRetention: 'apply' } } }
    rows = mixedTable()
    const result = await call()
    expect(result).toMatchObject({ mode: 'count', expired: 2, deleted: 0 })
    expect(tablesDB.deleteRow).not.toHaveBeenCalled()
    expect(rows).toHaveLength(5)
  })

  it('die Antwort trägt nur Zahlen, keine Ids, Namen oder Adressen', async () => {
    rows = mixedTable()
    const result = await call()
    expect(JSON.stringify(result)).not.toMatch(/kailua|Name |old-/)
  })

  it.each(['off', 'count', undefined])('`apply: true` bei Schalter %s ⇒ 409 `intro_retention_not_apply`, nichts gelesen, nichts gelöscht', async (mode) => {
    appConfig = { pukalani: { portfolio: { introRequestRetention: mode } } }
    rows = mixedTable()
    body = { apply: true }
    await expect(call()).rejects.toMatchObject({ status: 409, data: { code: 'intro_retention_not_apply' } })
    expect(tablesDB.listRows).not.toHaveBeenCalled()
    expect(rows).toHaveLength(5)
  })

  it('`apply: true` bei Schalter `apply` ⇒ der echte Lauf', async () => {
    appConfig = { pukalani: { portfolio: { introRequestRetention: 'apply' } } }
    rows = mixedTable()
    body = { apply: true }
    const result = await call()
    expect(result).toMatchObject({ mode: 'apply', deleted: 2 })
    expect(rows).toHaveLength(3)
  })

  it('ein ungültiger Body wird abgelehnt', async () => {
    body = { apply: 'ja' }
    await expect(call()).rejects.toThrow()
    expect(tablesDB.listRows).not.toHaveBeenCalled()
  })

  it('läuft gerade ein Lauf ⇒ 409 `intro_retention_busy`', async () => {
    let release!: () => void
    gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const running = runIntroRequestRetention('count', { now: NOW })
    await expect(call()).rejects.toMatchObject({ status: 409, data: { code: 'intro_retention_busy' } })
    release()
    await running
  })
})
