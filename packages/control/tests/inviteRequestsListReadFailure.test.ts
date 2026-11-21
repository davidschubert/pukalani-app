import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { INVITE_CODES_TABLE } from '../shared/types/inviteCode'
import { INVITE_REQUESTS_TABLE } from '../shared/types/inviteRequest'
import { COMMUNITIES_TABLE } from '../shared/types/tenantRecord'

/**
 * DIE WARTESCHLANGE MIT FEHLENDEN ZUSATZANGABEN (Bahn 2, Q13-Stelle 3).
 *
 * Die Liste bleibt sichtbar, aber ein Lesefehler beim Nachschlagen heißt
 * nicht mehr „ohne Code": `incomplete` nennt, was fehlt, und eine Anfrage mit
 * Code ist dann nicht erinnerbar (`code-unknown`). Gegenprobe: ohne Fehler
 * ist `incomplete` leer und „Erinnern" folgt der gewöhnlichen Regel.
 */

const HOUR = 60 * 60 * 1000
const assignedAt = new Date(Date.now() - 48 * HOUR).toISOString()

let failing = new Set<string>()
const tablesDB = {
  listRows: vi.fn(async ({ tableId }: { tableId: string }) => {
    if (failing.has(tableId)) throw Object.assign(new Error('down'), { code: 500, type: 'general_unknown' })
    if (tableId === INVITE_REQUESTS_TABLE) {
      return {
        total: 1,
        rows: [{ $id: 'r-1', $createdAt: assignedAt, email: 'a@example.com', note: '', status: 'assigned', assignedAt, inviteCodeId: 'code-1', communityId: 'c-1', reminders: 0, lastReminderAt: null }],
      }
    }
    if (tableId === INVITE_CODES_TABLE) return { total: 1, rows: [{ $id: 'code-1', status: 'active', expiresAt: new Date(Date.now() + 72 * HOUR).toISOString() }] }
    if (tableId === COMMUNITIES_TABLE) return { total: 1, rows: [{ $id: 'c-1', host: 'probe.example.com' }] }
    return { total: 0, rows: [] }
  }),
}

type Handler = (event: unknown) => Promise<{ incomplete: string[], requests: Array<{ canRemind: boolean, remindBlocked: string, host: string, codeStatus: string }> }>
let handler: Handler

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('requirePermission', () => {})
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'db' } }))
  vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
  vi.stubGlobal('logEvent', vi.fn())
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  handler = (await import('../server/api/control/invite-requests/index.get')).default as unknown as Handler
})

beforeEach(() => {
  failing = new Set()
})

describe('GET /api/control/invite-requests', () => {
  it('Codes nicht lesbar ⇒ incomplete nennt es, Erinnern ist gesperrt (code-unknown)', async () => {
    failing = new Set([INVITE_CODES_TABLE])
    const result = await handler({})
    expect(result.incomplete).toEqual(['codes'])
    expect(result.requests[0]).toMatchObject({ canRemind: false, remindBlocked: 'code-unknown', host: 'probe.example.com' })
  })

  it('Communities nicht lesbar ⇒ incomplete nennt es, Erinnern bleibt erlaubt', async () => {
    failing = new Set([COMMUNITIES_TABLE])
    const result = await handler({})
    expect(result.incomplete).toEqual(['communities'])
    expect(result.requests[0]).toMatchObject({ canRemind: true, host: '' })
  })

  it('Gegenprobe: alles lesbar ⇒ incomplete leer, Code und Host da', async () => {
    const result = await handler({})
    expect(result.incomplete).toEqual([])
    expect(result.requests[0]).toMatchObject({ canRemind: true, remindBlocked: '', codeStatus: 'active', host: 'probe.example.com' })
  })
})
