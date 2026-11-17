import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import * as retention from '../../core/server/utils/rowRetention'
import { auditLogRetentionMode, runAuditLogRetention } from '../../core/server/utils/auditLogRetention'
import { writeAuditLog } from '../../core/server/utils/auditLog'
import { requirePermission } from '../../core/server/utils/requirePermission'
import type { RowRetentionResult } from '../../core/shared/rowRetention'
import { recordAudit } from '../server/utils/audit'

/**
 * POST /api/admin/audit-logs/retention/run (EL1 c) — die Hand-Route neben dem
 * stündlichen Fristen-Lauf des Konto-Protokolls (`core/server/plugins/
 * audit-log-retention.ts`).
 *
 * Ausgeführt werden der ECHTE Handler, die ECHTE Rechte-Prüfung
 * (`requirePermission` mit der Rechte-Matrix), der ECHTE Lauf über das
 * Core-Gerüst und der ECHTE Protokoll-Schreiber (`recordAudit` →
 * `writeAuditLog`); gefälscht ist nur die Ablage. Wer durch darf, steht hier
 * AUSGESCHRIEBEN: nur `admin` (`system.manage`).
 */

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-17T12:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString()

interface FakeRow { $id: string, $createdAt: string, [key: string]: unknown }

let rows: FakeRow[]
let written: Record<string, unknown>[]
let gate: Promise<void> | null
let appConfig: Record<string, unknown>
let user: { $id: string, name: string, labels: string[] } | null
let body: Record<string, unknown> | undefined

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    if (gate) {
      const wait = gate
      gate = null
      await wait
    }
    if (tableId !== 'audit_logs') throw new AppwriteException('Table not found', 404, 'table_not_found')
    const parsed = queries.map(q => JSON.parse(q) as { method: string, values?: unknown[] })
    const bound = String(parsed.find(entry => entry.method === 'lessThan')?.values?.[0])
    const cursor = parsed.find(entry => entry.method === 'cursorAfter')?.values?.[0]
    let found = rows.filter(entry => entry.$createdAt < bound).sort((a, b) => a.$createdAt.localeCompare(b.$createdAt))
    if (typeof cursor === 'string') found = found.slice(found.findIndex(entry => entry.$id === cursor) + 1)
    const limit = parsed.find(entry => entry.method === 'limit')?.values?.[0]
    if (typeof limit === 'number') found = found.slice(0, limit)
    return { total: found.length, rows: found }
  }),
  deleteRow: vi.fn(async ({ rowId }: { rowId: string }) => {
    rows = rows.filter(entry => entry.$id !== rowId)
  }),
  createRow: vi.fn(async ({ tableId, data }: { tableId: string, data: Record<string, unknown> }) => {
    if (tableId !== 'audit_logs') throw new Error(`falsche Tabelle ${tableId}`)
    written.push(data)
    return {}
  }),
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('useAppConfig', () => appConfig)
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('readValidatedBody', async (_event: H3Event, run: (input: unknown) => unknown) => run(body))
vi.stubGlobal('trustedClientIp', () => '203.0.113.9')
vi.stubGlobal('logEvent', () => {})
// Die ECHTEN Bausteine aus Core und admin — gefälscht ist nur die Ablage.
vi.stubGlobal('requirePermission', requirePermission)
vi.stubGlobal('auditLogRetentionMode', auditLogRetentionMode)
vi.stubGlobal('runAuditLogRetention', runAuditLogRetention)
vi.stubGlobal('writeAuditLog', writeAuditLog)
vi.stubGlobal('recordAudit', recordAudit)

const ROUTE = '../server/api/admin/audit-logs/retention/run.post.ts'
const runHandler = (await import('../server/api/admin/audit-logs/retention/run.post'))
  .default as unknown as (event: H3Event) => Promise<RowRetentionResult>

const call = () => runHandler({ context: { user } } as unknown as H3Event)

const ADMIN = { $id: 'u-admin', name: 'Ada Admin', labels: ['admin'] }

function mixedTable(): FakeRow[] {
  return [
    { $id: 'old-1', $createdAt: daysAgo(400), action: 'user.blocked', actorName: 'Ada Admin' },
    { $id: 'old-2', $createdAt: daysAgo(366), action: 'user.login', actorName: 'Bea' },
    { $id: 'young', $createdAt: daysAgo(200), action: 'user.login', actorName: 'Cem' },
  ]
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  retention.__resetRetentionJobsForTests()
  rows = mixedTable()
  written = []
  gate = null
  appConfig = { pukalani: { audit: { retention: 'count' } } }
  user = ADMIN
  body = undefined
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

describe('POST /api/admin/audit-logs/retention/run', () => {
  it.each([
    ['Gast', null, 401],
    ['Konto ohne Rolle', { $id: 'u-1', name: 'Udo', labels: [] }, 403],
    ['Moderator', { $id: 'u-2', name: 'Mo', labels: ['moderator'] }, 403],
    ['Community-Label', { $id: 'u-3', name: 'Lu', labels: ['c-123'] }, 403],
  ] as const)('%s ⇒ %s — vor jedem Lesen, auch mit `apply` und Schalter `apply`', async (_label, who, status) => {
    appConfig = { pukalani: { audit: { retention: 'apply' } } }
    user = who === null ? null : { ...who, labels: [...who.labels] }
    body = { apply: true }
    await expect(call()).rejects.toMatchObject({ status })
    expect(tablesDB.listRows).not.toHaveBeenCalled()
    expect(rows).toHaveLength(3)
    expect(written).toHaveLength(0)
  })

  it('Betreiber (`admin`) ohne Body: es wird nur gezählt — auch bei Schalter `apply`, und ohne Protokoll-Eintrag', async () => {
    appConfig = { pukalani: { audit: { retention: 'apply' } } }
    const result = await call()
    expect(result).toMatchObject({ mode: 'count', expired: 2, deleted: 0 })
    expect(tablesDB.deleteRow).not.toHaveBeenCalled()
    expect(rows).toHaveLength(3)
    expect(written).toHaveLength(0)
  })

  it('die Antwort trägt nur Zahlen, keine Ids und keine Namen', async () => {
    const result = await call()
    expect(JSON.stringify(result)).not.toMatch(/old-|young|Ada|Bea/)
  })

  it.each(['off', 'count', undefined])('`apply: true` bei Schalter %s ⇒ 409 `audit_retention_not_apply`, nichts gelesen, nichts gelöscht', async (mode) => {
    appConfig = { pukalani: { audit: { retention: mode } } }
    body = { apply: true }
    await expect(call()).rejects.toMatchObject({ status: 409, data: { code: 'audit_retention_not_apply' } })
    expect(tablesDB.listRows).not.toHaveBeenCalled()
    expect(rows).toHaveLength(3)
    expect(written).toHaveLength(0)
  })

  it('`apply: true` bei Schalter `apply` ⇒ der echte Lauf und GENAU EIN Protokoll-Eintrag mit nur Zahlen', async () => {
    appConfig = { pukalani: { audit: { retention: 'apply' } } }
    body = { apply: true }
    const result = await call()
    expect(result).toMatchObject({ mode: 'apply', expired: 2, deleted: 2, failed: 0 })
    expect(rows.map(entry => entry.$id)).toEqual(['young'])
    expect(written).toHaveLength(1)
    const entry = written[0]!
    expect(entry).toMatchObject({ actorId: 'u-admin', action: 'audit_log.retention_applied', targetType: 'audit_logs', targetId: '' })
    expect(JSON.parse(String(entry.metadata))).toEqual({ considered: 2, expired: 2, deleted: 2, failed: 0, truncated: false })
  })

  it('scheitert der Protokoll-Eintrag, bleibt die Antwort des Laufs (nicht strikt)', async () => {
    appConfig = { pukalani: { audit: { retention: 'apply' } } }
    body = { apply: true }
    tablesDB.createRow.mockImplementationOnce(async () => {
      throw new AppwriteException('Server Error', 500, 'general_unknown')
    })
    await expect(call()).resolves.toMatchObject({ mode: 'apply', deleted: 2 })
  })

  it('ein ungültiger Body wird abgelehnt', async () => {
    body = { apply: 'ja' }
    await expect(call()).rejects.toThrow()
    expect(tablesDB.listRows).not.toHaveBeenCalled()
  })

  it('läuft gerade ein Lauf ⇒ 409 `audit_retention_busy`', async () => {
    let release!: () => void
    gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const running = runAuditLogRetention('count', { now: NOW })
    await expect(call()).rejects.toMatchObject({ status: 409, data: { code: 'audit_retention_busy' } })
    release()
    await running
  })

  it('das Rechte-Tor steht VOR dem Lesen des Bodys (Quelltext)', () => {
    const source = readFileSync(fileURLToPath(new URL(ROUTE, import.meta.url)), 'utf8')
    const gateAt = source.indexOf(`requirePermission(event, 'system.manage')`)
    expect(gateAt).toBeGreaterThan(-1)
    expect(gateAt).toBeLessThan(source.indexOf('readValidatedBody('))
  })
})
