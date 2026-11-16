import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunLeaseCreateData, RunLeaseRow, RunLeaseStore, RunLeaseUpdateData } from '../../core/server/utils/runLease'
import {
  createReportEvidenceSweepRunner,
  sweepReportEvidence,
  type EvidenceRow,
  type EvidenceSweepStore,
} from '../server/utils/reportEvidenceSweep'

/**
 * SEC-033 — DER LÖSCH-LAUF FÜR DEN BELEG GEMELDETER NACHRICHTEN.
 *
 * Gefahren gegen einen Fake-Store (Nachrichten + Meldungen je Community) und
 * eine Fake-Sperre. Geprüft wird, was man im Betrieb nicht sieht, bis es zu
 * spät ist: `count` schreibt nichts, `apply` leert NUR fällige und NUR
 * `reportedBody`, ein zweiter Lauf ändert nichts, eine offene Meldung schützt
 * (auch eine, die erst zwischen Zählen und Schreiben aufgeht), die Sperre
 * hält einen zweiten Lauf auf, und der Stand wird nur in der Community der
 * Nachricht gefragt.
 */

const NOW = Date.parse('2026-11-16T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const iso = (ms: number) => new Date(ms).toISOString()

interface FakeReport { communityId: string, targetId: string, status: 'open' | 'resolved', updatedAt: string }
interface FakeMessage extends EvidenceRow { body: string }

function world() {
  const messages: FakeMessage[] = [
    // fällig: erledigt vor 91 Tagen
    { $id: 'm-due', communityId: 't-a', body: 'lebend-1', reportedBody: 'beleg-1', reportedAt: iso(NOW - 120 * DAY) },
    // erledigt vor 10 Tagen: noch nicht fällig
    { $id: 'm-fresh', communityId: 't-a', body: 'lebend-2', reportedBody: 'beleg-2', reportedAt: iso(NOW - 120 * DAY) },
    // offene Meldung: geschützt, egal wie alt
    { $id: 'm-open', communityId: 't-a', body: 'lebend-3', reportedBody: 'beleg-3', reportedAt: iso(NOW - 300 * DAY) },
    // Meldung zurückgezogen (keine Zeile mehr), gemeldet vor 100 Tagen: fällig über reportedAt
    { $id: 'm-withdrawn', communityId: 't-b', body: 'lebend-4', reportedBody: 'beleg-4', reportedAt: iso(NOW - 100 * DAY) },
    // schon geleert
    { $id: 'm-cleared', communityId: 't-b', body: 'lebend-5', reportedBody: '', reportedAt: iso(NOW - 400 * DAY) },
  ]
  const reports: FakeReport[] = [
    { communityId: 't-a', targetId: 'm-due', status: 'resolved', updatedAt: iso(NOW - 91 * DAY) },
    { communityId: 't-a', targetId: 'm-fresh', status: 'resolved', updatedAt: iso(NOW - 10 * DAY) },
    { communityId: 't-a', targetId: 'm-open', status: 'open', updatedAt: iso(NOW - 300 * DAY) },
    // Eine OFFENE Meldung zu m-due in einer FREMDEN Community darf nicht
    // zählen (dort gibt es diese Nachricht nicht) — sie belegt, dass der Lauf
    // nur in der eigenen Community fragt.
    { communityId: 't-x', targetId: 'm-due', status: 'open', updatedAt: iso(NOW) },
  ]
  const writes: Array<{ id: string, data: Record<string, unknown> }> = []
  const asked: string[] = []
  const hooks: { beforeFreshRead?: (id: string) => void } = {}

  const store: EvidenceSweepStore = {
    async listReported({ after, limit }) {
      const all = messages.filter(m => m.reportedAt !== '')
      const start = after ? all.findIndex(m => m.$id === after) + 1 : 0
      return all.slice(start, start + limit).map(({ body: _body, ...row }) => ({ ...row }))
    },
    async getMessage(id) {
      hooks.beforeFreshRead?.(id)
      const row = messages.find(m => m.$id === id)
      if (!row) return null
      const { body: _body, ...rest } = row
      return { ...rest }
    },
    async reportState(communityId, messageId) {
      asked.push(`${communityId}/${messageId}`)
      const mine = reports.filter(r => r.communityId === communityId && r.targetId === messageId)
      const closed = mine.filter(r => r.status !== 'open').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      return { open: mine.filter(r => r.status === 'open').length, closed: closed.length, lastClosedAt: closed[0]?.updatedAt ?? '' }
    },
    async clearEvidence(id) {
      const row = messages.find(m => m.$id === id)
      if (!row) throw new Error('weg')
      writes.push({ id, data: { reportedBody: '' } })
      row.reportedBody = ''
    },
  }
  return { messages, reports, writes, asked, hooks, store }
}

function leaseStore(opts: { missingTable?: boolean } = {}) {
  const rows = new Map<string, RunLeaseRow>()
  const store: RunLeaseStore = {
    async latest(scope, subject) {
      if (opts.missingTable) throw Object.assign(new Error('Table not found'), { status: 404 })
      const mine = [...rows.values()].filter(r => r.scope === scope && r.subject === subject)
      return mine.sort((a, b) => b.seq - a.seq)[0] ?? null
    },
    async create(id: string, data: RunLeaseCreateData) {
      if (rows.has(id)) throw Object.assign(new Error('conflict'), { conflict: true })
      const row: RunLeaseRow = { $id: id, finishedAt: '', outcome: '', ...data }
      rows.set(id, row)
      return row
    },
    async update(id: string, data: RunLeaseUpdateData) {
      const row = rows.get(id)!
      Object.assign(row, data)
      return row
    },
    async remove(id) { rows.delete(id) },
    isConflict: error => Boolean((error as { conflict?: boolean }).conflict),
  }
  return { rows, store }
}

beforeEach(() => {
  vi.stubGlobal('createError', (init: Record<string, unknown>) =>
    Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const now = () => NOW

describe('count', () => {
  it('zählt und schreibt NICHTS — weder Nachrichten noch eine Sperr-Zeile', async () => {
    const w = world()
    const lease = leaseStore()
    const result = await sweepReportEvidence('count', { store: w.store, lease: lease.store, now })
    expect(result).toMatchObject({ mode: 'count', reported: 5, withText: 4, closedWithText: 3, due: 2, cleared: 0, failed: 0 })
    expect(w.writes).toEqual([])
    expect(lease.rows.size).toBe(0)
    expect(w.messages.find(m => m.$id === 'm-due')?.reportedBody).toBe('beleg-1')
  })

  it('fragt den Stand nur in der Community der Nachricht', async () => {
    const w = world()
    await sweepReportEvidence('count', { store: w.store, lease: leaseStore().store, now })
    expect(w.asked).toContain('t-a/m-due')
    expect(w.asked).toContain('t-b/m-withdrawn')
    expect(w.asked.some(entry => entry.startsWith('t-x/'))).toBe(false)
  })
})

describe('apply', () => {
  it('leert NUR fällige Belege und NUR reportedBody', async () => {
    const w = world()
    const lease = leaseStore()
    const result = await sweepReportEvidence('apply', { store: w.store, lease: lease.store, now })
    expect(result).toMatchObject({ mode: 'apply', due: 2, cleared: 2, failed: 0 })
    expect(w.writes.map(x => x.id).sort()).toEqual(['m-due', 'm-withdrawn'])
    for (const write of w.writes) expect(Object.keys(write.data)).toEqual(['reportedBody'])

    const byId = Object.fromEntries(w.messages.map(m => [m.$id, m]))
    expect(byId['m-due']).toMatchObject({ reportedBody: '', body: 'lebend-1', reportedAt: iso(NOW - 120 * DAY) })
    expect(byId['m-fresh']?.reportedBody).toBe('beleg-2')
    expect(byId['m-open']?.reportedBody).toBe('beleg-3')
    // Die Meldungen selbst bleiben stehen.
    expect(w.reports).toHaveLength(4)

    // Die Sperre ist genommen und beendet — im detail nur Zahlen.
    const leaseRow = [...lease.rows.values()][0]!
    expect(leaseRow.outcome).toBe('done')
    expect(leaseRow.detail).not.toMatch(/m-|beleg|lebend/)
  })

  it('ein zweiter Lauf findet nichts mehr', async () => {
    const w = world()
    const lease = leaseStore()
    await sweepReportEvidence('apply', { store: w.store, lease: lease.store, now })
    const second = await sweepReportEvidence('apply', { store: w.store, lease: lease.store, now })
    expect(second).toMatchObject({ due: 0, cleared: 0 })
    expect(w.writes).toHaveLength(2)
  })

  it('eine Meldung, die zwischen Zählen und Schreiben aufgeht, schützt den Beleg', async () => {
    const w = world()
    w.hooks.beforeFreshRead = (id) => {
      if (id === 'm-due') w.reports.push({ communityId: 't-a', targetId: 'm-due', status: 'open', updatedAt: iso(NOW) })
    }
    const result = await sweepReportEvidence('apply', { store: w.store, lease: leaseStore().store, now })
    expect(result).toMatchObject({ due: 2, cleared: 1 })
    expect(w.messages.find(m => m.$id === 'm-due')?.reportedBody).toBe('beleg-1')
  })

  it('Sperre besetzt ⇒ übersprungen, nichts geschrieben', async () => {
    const w = world()
    const lease = leaseStore()
    await lease.store.create('busy', {
      scope: 'message-report-evidence', subject: 'messages', seq: 1, startedAt: iso(NOW), heartbeatAt: iso(NOW), detail: '',
    })
    const result = await sweepReportEvidence('apply', { store: w.store, lease: lease.store, now })
    expect(result).toEqual({ skipped: 'busy' })
    expect(w.writes).toEqual([])
  })

  it('fehlt die Sperr-Tabelle ⇒ übersprungen und EINMAL gemeldet', async () => {
    const w = world()
    const logs: string[] = []
    const run = createReportEvidenceSweepRunner({
      mode: 'apply',
      deps: () => ({ store: w.store, lease: leaseStore({ missingTable: true }).store, now }),
      log: (_level, name, data) => logs.push(`${name}:${String(data.reason)}`),
    })
    expect(await run()).toBe('skipped')
    expect(await run()).toBe('skipped')
    expect(logs).toEqual(['messages.report_evidence_sweep_skipped:no_lease_table'])
    expect(w.writes).toEqual([])
  })

  it('unlesbarer Meldungs-Stand ⇒ nicht geleert, als Fehlschlag gezählt', async () => {
    const w = world()
    const original = w.store.reportState
    w.store.reportState = async (communityId, id) => {
      if (id === 'm-due') throw new Error('down')
      return original(communityId, id)
    }
    const result = await sweepReportEvidence('apply', { store: w.store, lease: leaseStore().store, now })
    expect(result).toMatchObject({ failed: 1, cleared: 1 })
    expect(w.messages.find(m => m.$id === 'm-due')?.reportedBody).toBe('beleg-1')
  })
})

describe('Deckel und Takt', () => {
  it('ein gedeckelter Lauf macht im nächsten Takt dort weiter, wo er aufgehört hat', async () => {
    const w = world()
    const first = await sweepReportEvidence('count', { store: w.store, lease: leaseStore().store, now, pageSize: 2, maxRows: 3 })
    expect(first).toMatchObject({ reported: 3, capped: true, nextAfter: 'm-open' })
    const second = await sweepReportEvidence('count', {
      store: w.store, lease: leaseStore().store, now, pageSize: 2, maxRows: 3, startAfter: 'm-open',
    })
    expect(second).toMatchObject({ reported: 2, capped: false, nextAfter: null })
  })

  it('count meldet beim ersten Lauf und danach nur, wenn sich „fällig" ändert', async () => {
    const w = world()
    const logs: Array<Record<string, unknown>> = []
    const run = createReportEvidenceSweepRunner({
      mode: 'count',
      deps: () => ({ store: w.store, lease: leaseStore().store, now }),
      log: (_level, name, data) => { if (name === 'messages.report_evidence_sweep') logs.push(data) },
    })
    await run()
    await run()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toEqual({ mode: 'count', reported: 5, withText: 4, closedWithText: 3, due: 2, cleared: 0, failed: 0, capped: false })
    // Kein Text, keine Id in der Zeile.
    expect(JSON.stringify(logs)).not.toMatch(/m-|beleg|lebend/)

    w.messages.find(m => m.$id === 'm-due')!.reportedBody = ''
    await run()
    expect(logs).toHaveLength(2)
    expect(logs[1]?.due).toBe(1)
  })
})
