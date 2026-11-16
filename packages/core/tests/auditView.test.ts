import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * ANSICHTEN ENTPRELLEN (BE-021; seit SEC-033 im Core, damit auch die
 * Moderation privater Nachrichten sie benutzt).
 *
 * Ein Eintrag je Schlüssel in 15 Minuten, gemerkt erst nach einem gelungenen
 * Eintrag, Karte gedeckelt. Der Handelnde kommt immer aus dem Kontext der
 * Anfrage, nie vom Aufrufer.
 */

let failing = false
const rows: Record<string, unknown>[] = []

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({
  tablesDB: {
    createRow: async ({ data }: { data: Record<string, unknown> }) => {
      if (failing) throw new Error('audit down')
      rows.push(data)
      return {}
    },
  },
}))
vi.stubGlobal('trustedClientIp', () => '')
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))

const { AUDIT_VIEW_WINDOW_MS, createAuditViewThrottle, recordAuditView } = await import('../server/utils/auditView')

const ACTOR = { $id: 'betreiber-1', name: 'Max Betreiber' }
const event = (user: unknown = ACTOR) => ({ context: { user } }) as unknown as H3Event

beforeEach(() => {
  rows.length = 0
  failing = false
})

describe('Entprell-Regel (pur)', () => {
  it('ein Eintrag je Schlüssel und Fenster; nach Ablauf wieder fällig', () => {
    const throttle = createAuditViewThrottle(1000, 10)
    expect(throttle.due('a', 0)).toBe(true)
    throttle.mark('a', 0)
    expect(throttle.due('a', 999)).toBe(false)
    expect(throttle.due('b', 999)).toBe(true)
    expect(throttle.due('a', 1000)).toBe(true)
    expect(AUDIT_VIEW_WINDOW_MS).toBe(15 * 60 * 1000)
  })

  it('die Karte bleibt gedeckelt — und wirft lieber den ältesten Eintrag als einen neuen', () => {
    const throttle = createAuditViewThrottle(1000, 3)
    for (const [i, key] of ['a', 'b', 'c', 'd'].entries()) throttle.mark(key, i)
    expect(throttle.size()).toBe(3)
    expect(throttle.due('a', 4)).toBe(true)
    expect(throttle.due('d', 4)).toBe(false)
  })
})

describe('recordAuditView', () => {
  it('erst nach gelungenem Eintrag gemerkt — ein Ausfall unterdrückt den nächsten Versuch nicht', async () => {
    const key = `probe:${Math.random()}`
    failing = true
    await recordAuditView(event(), key, { action: 'user.viewed' }, 0)
    failing = false
    await recordAuditView(event(), key, { action: 'user.viewed' }, 1)
    await recordAuditView(event(), key, { action: 'user.viewed' }, 2)
    expect(rows).toHaveLength(1)
  })

  it('der Handelnde kommt aus dem Kontext', async () => {
    await recordAuditView(event(), `probe:${Math.random()}`, {
      action: 'message_report.viewed', targetType: 'message', targetId: 'msg-1',
    }, 0)
    expect(rows[0]).toMatchObject({
      actorId: 'betreiber-1', actorName: 'Max Betreiber', action: 'message_report.viewed', targetType: 'message', targetId: 'msg-1',
    })
  })

  it('ohne angemeldetes Konto kein Eintrag', async () => {
    await recordAuditView(event(null), `probe:${Math.random()}`, { action: 'user.viewed' }, 0)
    expect(rows).toEqual([])
  })
})
