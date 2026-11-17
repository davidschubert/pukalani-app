import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeAuditLog, auditUnavailableError } from '../../core/server/utils/auditLog'
import { recordAuditView } from '../../core/server/utils/auditView'
import { listUserActivity } from '../server/utils/userActivity'
import type { AdminUserDetailResponse } from '../shared/types/admin'

/**
 * ROLLEN-TEST AN DER ECHTEN ROUTE `GET /api/admin/users/[id]` (AL1, OPS-009).
 *
 * Ausgeführt wird der echte Handler mit dem echten Leser
 * (`listUserActivity` → `readUserActivity`); gestubbt sind nur Appwrite und
 * die Nitro-Auto-Imports. Gefragt wird:
 *   · ohne Recht (Gast, Konto ohne `users.manage`) ⇒ die Wache wirft, und
 *     NICHTS wird gelesen — weder das Konto noch das Protokoll;
 *   · Betreiber ⇒ Antwort mit den Ereignissen des Kontos;
 *   · Protokoll nicht lesbar ⇒ `activityFailed: true`, Profil und Sitzungen
 *     kommen trotzdem, eine Log-Zeile ohne Personen-Daten.
 */

const OPERATOR = { $id: 'betreiber-1', name: 'Max Betreiber', labels: ['admin'] }
const PERSON = 'person-42'

let reads: string[]
let logs: Array<{ event: string, data: Record<string, unknown> }>
let auditRows: Record<string, unknown>[]
let auditReadFails: boolean
let permissionGranted: boolean
let storedRows: Array<Record<string, unknown>>

function stubAll() {
  vi.resetModules()
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('requirePermission', (event: { context: { user?: unknown } }, permission: string) => {
    if (!event.context.user) throw Object.assign(new Error('Unauthorized'), { status: 401 })
    if (!permissionGranted || permission !== 'users.manage') throw Object.assign(new Error('Forbidden'), { status: 403 })
    return event.context.user
  })
  vi.stubGlobal('getRouterParam', (ev: { params: Record<string, string> }, name: string) => ev.params[name])
  vi.stubGlobal('createError', (init: Record<string, unknown>) =>
    Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
  vi.stubGlobal('trustedClientIp', () => '')
  vi.stubGlobal('logEvent', (_level: string, event: string, data: Record<string, unknown> = {}) => { logs.push({ event, data }) })
  vi.stubGlobal('writeAuditLog', writeAuditLog)
  vi.stubGlobal('auditUnavailableError', auditUnavailableError)
  vi.stubGlobal('recordAuditView', recordAuditView)
  vi.stubGlobal('listUserActivity', listUserActivity)
  vi.stubGlobal('createSessionClient', () => ({ account: { getSession: async () => ({ $id: 's' }) } }))
  vi.stubGlobal('tenantDb', () => ({ list: async () => { reads.push('comments'); return { total: 0, rows: [] } } }))
  vi.stubGlobal('listOnlinePresences', async () => [])
  vi.stubGlobal('mapSafeSession', (session: unknown) => session)
  vi.stubGlobal('lookupCityForIp', async (_event: unknown, ip: string) => ip === '203.0.113.7' ? { city: 'Wailuku', region: 'Hawaii' } : null)
  vi.stubGlobal('createAdminClient', () => ({
    users: {
      get: async ({ userId }: { userId: string }) => { reads.push(`user:${userId}`); return { $id: userId, name: 'Erika Beispiel', email: 'erika@example.org', prefs: {}, labels: [], registration: '' } },
      listSessions: async () => { reads.push('sessions'); return { sessions: [{ $id: 'sess-1', ip: '203.0.113.7' }] } },
      listTargets: async () => ({ targets: [] }),
    },
    tablesDB: {
      createRow: async ({ data }: { data: Record<string, unknown> }) => { auditRows.push(data); return {} },
      listRows: async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
        reads.push(`listRows:${tableId}`)
        if (auditReadFails) throw Object.assign(new Error(`Invalid query: equal("actorId", ["${PERSON}"])`), { code: 500, type: 'general_server_error' })
        const parsed = queries.map(q => JSON.parse(q) as { method: string, attribute?: string, values?: unknown[] })
        const byActor = parsed.find(q => q.method === 'equal' && q.attribute === 'actorId')
        const byTarget = parsed.find(q => q.method === 'equal' && q.attribute === 'targetId')
        return {
          total: 0,
          rows: storedRows.filter(r =>
            byActor ? r.actorId === byActor.values?.[0] && !r.targetId : r.targetType === 'user' && r.targetId === byTarget?.values?.[0]),
        }
      },
    },
  }))
}

async function handler() {
  const module = await import('../server/api/admin/users/[id]/index.get.ts') as { default: (event: unknown) => Promise<AdminUserDetailResponse> }
  return module.default
}

function event(user: unknown) {
  return { context: { user }, params: { id: PERSON } }
}

beforeEach(() => {
  reads = []
  logs = []
  auditRows = []
  auditReadFails = false
  permissionGranted = true
  storedRows = [
    { $id: 'r1', $createdAt: '2026-11-17T10:01:00.000Z', actorId: PERSON, actorName: 'Erika Beispiel', action: 'user.login', targetType: '', targetId: '', metadata: '{"method":"otp"}', ip: '203.0.113.7' },
    { $id: 'r2', $createdAt: '2026-11-17T10:05:00.000Z', actorId: OPERATOR.$id, actorName: OPERATOR.name, action: 'user.block', targetType: 'user', targetId: PERSON, metadata: '', ip: '198.51.100.9' },
  ]
  stubAll()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GET /api/admin/users/[id] — wer darf, was kommt', () => {
  it('Gast: die Wache wirft 401, nichts wird gelesen', async () => {
    const run = await handler()
    await expect(run(event(undefined))).rejects.toMatchObject({ status: 401 })
    expect(reads).toEqual([])
    expect(auditRows).toEqual([])
  })

  it('Konto ohne users.manage: 403, nichts wird gelesen', async () => {
    permissionGranted = false
    const run = await handler()
    await expect(run(event({ $id: 'fremd-1', name: 'Fremd', labels: [] }))).rejects.toMatchObject({ status: 403 })
    expect(reads).toEqual([])
    expect(auditRows).toEqual([])
  })

  it('Betreiber: Antwort trägt die Aktivität des Kontos — Selbst mit Ort, Betreiber mit Namen, ohne dessen IP', async () => {
    const run = await handler()
    const result = await run(event(OPERATOR))
    expect(result.activityFailed).toBe(false)
    expect(result.activityTruncated).toBe(false)
    expect(result.activity).toEqual([
      expect.objectContaining({ id: 'r2', action: 'user.block', origin: 'operator', operatorName: 'Max Betreiber', ip: '', place: '' }),
      expect.objectContaining({ id: 'r1', action: 'user.login', origin: 'self', operatorName: '', ip: '203.0.113.7', place: 'Wailuku, Hawaii', method: 'otp' }),
    ])
    expect(JSON.stringify(result.activity)).not.toContain('198.51.100.9')
    // Das Öffnen der Seite steht im Protokoll — und wird von der Liste nicht gezeigt.
    expect(auditRows.map(row => row.action)).toEqual(['user.viewed'])
    expect(logs).toEqual([])
  })

  it('Protokoll nicht lesbar: activityFailed, Profil und Sitzungen bleiben, Log ohne Personen-Daten', async () => {
    auditReadFails = true
    const run = await handler()
    const result = await run(event(OPERATOR))
    expect(result.activityFailed).toBe(true)
    expect(result.activity).toEqual([])
    expect(result.activityTruncated).toBe(false)
    expect(result.user).toMatchObject({ $id: PERSON, name: 'Erika Beispiel' })
    expect(result.sessions).toHaveLength(1)
    expect(logs.map(entry => entry.event)).toEqual(['admin.user_activity_read_failed'])
    const logged = JSON.stringify(logs)
    expect(logged).not.toContain(PERSON)
    expect(logged).not.toContain('Erika')
    expect(logs[0]!.data).toEqual({ type: 'general_server_error', code: 500 })
  })
})
