import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * SEC-033 — DEN TEXT GIBT ES NUR BEI OFFENER MELDUNG, IN BEIDEN ROUTEN.
 *
 * Bis hierher gab die LISTE zu jeder je gemeldeten Nachricht den
 * eingefrorenen Text aus, auch nach der Erledigung; nur die Einzel-Route
 * fragte nach einer offenen Meldung. Jetzt entscheidet für beide dieselbe
 * Funktion (`moderatorVisibleBody` mit der Zahl offener Meldungen), und jede
 * herausgegebene Einsicht steht im Betreiber-Protokoll.
 *
 * Bestand: `msg-open` hat eine offene Meldung, `msg-closed` nur eine
 * erledigte (Zeile aus der Zeit vor dieser Regel), beide sind eingefroren.
 */

const MODERATOR = { $id: 'u-mod', name: 'Mo Derator' }

const rows = [
  { $id: 'msg-open', conversationId: 'conv-1', authorId: 'u-a', body: 'LEBEND-1', reportedBody: 'BELEG-OFFEN', reportedAt: '2026-11-10T00:00:00.000Z', $createdAt: '2026-11-09T00:00:00.000Z' },
  { $id: 'msg-closed', conversationId: 'conv-1', authorId: 'u-a', body: 'LEBEND-2', reportedBody: 'BELEG-ERLEDIGT', reportedAt: '2026-08-01T00:00:00.000Z', $createdAt: '2026-07-31T00:00:00.000Z' },
]
const OPEN: Record<string, number> = { 'msg-open': 2 }

let audits: Array<{ key: string, input: Record<string, unknown> }>
let countCalls: string[][]

beforeEach(() => {
  audits = []
  countCalls = []
  const error = (init: Record<string, unknown>) => Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status })
  vi.stubGlobal('createError', error)
  vi.stubGlobal('logEvent', () => {})
  vi.stubGlobal('tenantDb', () => ({
    async list() { return { rows, total: rows.length } },
    async get(_table: string, id: string) {
      const row = rows.find(r => r.$id === id)
      if (row) return row
      if (id === 'conv-1') return { $id: 'conv-1', participants: ['u-a', 'u-b'] }
      throw error({ status: 404, statusText: 'Not found' })
    },
  }))
  vi.stubGlobal('openReportCountsForTargets', async (_e: unknown, targetType: string, ids: string[]) => {
    expect(targetType).toBe('message')
    countCalls.push(ids)
    return new Map(ids.filter(id => OPEN[id]).map(id => [id, OPEN[id]!]))
  })
  vi.stubGlobal('openReportsForTarget', async (_e: unknown, _type: string, id: string) =>
    Array.from({ length: OPEN[id] ?? 0 }, (_, i) => ({ $id: `r-${i}` })))
  vi.stubGlobal('resolveUserCards', async (_e: unknown, ids: string[]) =>
    new Map(ids.map(id => [id, { name: id, avatarUrl: '' }])))
  vi.stubGlobal('recordAuditView', async (_e: unknown, key: string, input: Record<string, unknown>) => {
    audits.push({ key, input })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const event = { context: { user: MODERATOR } } as unknown as H3Event

describe('Liste der gemeldeten Nachrichten', () => {
  it('erledigt ⇒ kein Text, mit Kennzeichen; offen ⇒ der eingefrorene Text', async () => {
    const { listReportedMessages } = await import('../server/utils/messageReports')
    const list = await listReportedMessages(event, 50)
    const byId = Object.fromEntries(list.map(v => [v.id, v]))

    expect(byId['msg-open']).toMatchObject({ body: 'BELEG-OFFEN', textAvailable: true, openReports: 2 })
    expect(byId['msg-closed']).toMatchObject({ body: '', textAvailable: false, openReports: 0 })
    // Nie der lebende Text, in keiner Zeile.
    expect(JSON.stringify(list)).not.toContain('LEBEND')
    expect(JSON.stringify(list)).not.toContain('BELEG-ERLEDIGT')
  })

  it('fragt die offenen Zahlen GEBÜNDELT (eine Abfrage für die ganze Seite)', async () => {
    const { listReportedMessages } = await import('../server/utils/messageReports')
    await listReportedMessages(event, 50)
    expect(countCalls).toEqual([['msg-open', 'msg-closed']])
  })

  it('hält die Einsicht fest: nur die Zahl, kein Text, keine Id', async () => {
    const { listReportedMessages } = await import('../server/utils/messageReports')
    await listReportedMessages(event, 50)
    expect(audits).toHaveLength(1)
    expect(audits[0]!.key).toBe('message-report-queue:u-mod')
    expect(audits[0]!.input).toEqual({ action: 'message_report.queue_viewed', metadata: { withText: 1 } })
  })

  it('ohne herausgegebenen Text kein Protokoll-Eintrag', async () => {
    OPEN['msg-open'] = 0
    try {
      const { listReportedMessages } = await import('../server/utils/messageReports')
      await listReportedMessages(event, 50)
      expect(audits).toEqual([])
    }
    finally {
      OPEN['msg-open'] = 2
    }
  })
})

describe('Einzel-Route', () => {
  it('offen ⇒ Text und ein Eintrag `message_report.viewed` ohne Text', async () => {
    const { getReportedMessage } = await import('../server/utils/messageReports')
    const view = await getReportedMessage(event, 'msg-open')
    expect(view).toMatchObject({ body: 'BELEG-OFFEN', textAvailable: true, openReports: 2 })
    expect(audits).toEqual([{
      key: 'message-report:u-mod:msg-open',
      input: { action: 'message_report.viewed', targetType: 'message', targetId: 'msg-open' },
    }])
  })

  it('erledigt ⇒ 404 not_reported und kein Eintrag', async () => {
    const { getReportedMessage } = await import('../server/utils/messageReports')
    await expect(getReportedMessage(event, 'msg-closed')).rejects.toMatchObject({ status: 404, data: { code: 'not_reported' } })
    expect(audits).toEqual([])
  })
})
