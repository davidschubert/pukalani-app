import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openReportCountsForTargets, reportEvidenceStateForTarget } from '../server/utils/reportQueries'

/**
 * SEC-033 — ZWEI NEUE VERTRÄGE DES MODERATION-LAYERS.
 *
 *  · `openReportCountsForTargets`: offene Zahlen für eine ganze Seite der
 *    Melde-Liste in Bündeln zu 100 — mit dem Mandanten-Filter der Anfrage.
 *  · `reportEvidenceStateForTarget`: Stand der Meldungen OHNE Anfrage, für den
 *    Lösch-Lauf — ausdrücklich in EINER Community, nie darüber hinaus.
 *
 * Gestubbt ist nur Appwrite; ausgewertet werden die Abfragen, die wirklich
 * hinausgehen.
 */

interface Q { method: string, attribute?: string, values?: unknown[] }
interface Row { $id: string, communityId: string, targetType: string, targetId: string, status: string, $updatedAt: string }

let reports: Row[]
let sent: Q[][]

function matches(row: Row, q: Q): boolean {
  const value = (row as unknown as Record<string, unknown>)[q.attribute ?? '']
  switch (q.method) {
    case 'equal': return (q.values ?? []).includes(value)
    case 'notEqual': return !(q.values ?? []).includes(value)
    case 'isNull': return value === null || value === undefined
    case 'or': return (q.values as unknown as Q[]).some(inner => matches(row, typeof inner === 'string' ? JSON.parse(inner) as Q : inner))
    default: return true
  }
}

function listRows({ queries }: { queries: string[] }) {
  const parsed = queries.map(raw => JSON.parse(raw) as Q)
  sent.push(parsed)
  let rows = reports.filter(row => parsed.every(q => matches(row, q)))
  const order = parsed.find(q => q.method === 'orderDesc')
  if (order) rows = [...rows].sort((a, b) => String(b[order.attribute as keyof Row]).localeCompare(String(a[order.attribute as keyof Row])))
  const after = parsed.find(q => q.method === 'cursorAfter')?.values?.[0]
  if (after) rows = rows.slice(rows.findIndex(r => r.$id === after) + 1)
  const limit = Number(parsed.find(q => q.method === 'limit')?.values?.[0] ?? 25)
  return Promise.resolve({ total: rows.length, rows: rows.slice(0, limit) })
}

beforeEach(() => {
  sent = []
  reports = []
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'db' } }))
  vi.stubGlobal('createAdminClient', () => ({ tablesDB: { listRows } }))
  vi.stubGlobal('scopeQuery', (_e: unknown, queries: string[]) => [...queries, JSON.stringify({ method: 'equal', attribute: 'communityId', values: ['t-a'] })])
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const row = (id: string, communityId: string, targetId: string, status: string, updated = '2026-11-01T00:00:00.000Z'): Row =>
  ({ $id: id, communityId, targetType: 'message', targetId, status, $updatedAt: updated })

describe('openReportCountsForTargets', () => {
  it('zählt je Ziel, nur offene, nur in der Community der Anfrage', async () => {
    reports = [
      row('r1', 't-a', 'm1', 'open'),
      row('r2', 't-a', 'm1', 'open'),
      row('r3', 't-a', 'm2', 'resolved'),
      row('r4', 't-b', 'm2', 'open'),
    ]
    const counts = await openReportCountsForTargets({} as H3Event, 'message', ['m1', 'm2', 'm3'])
    expect(counts.get('m1')).toBe(2)
    expect(counts.get('m2')).toBeUndefined()
    expect(counts.get('m3')).toBeUndefined()
  })

  it('bündelt zu 100 Ids je Abfrage', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `m${i}`)
    await openReportCountsForTargets({} as H3Event, 'message', ids)
    const sizes = sent.map(qs => (qs.find(q => q.attribute === 'targetId')?.values ?? []).length)
    expect(sizes).toEqual([100, 100, 50])
  })

  it('leere Liste ⇒ keine Abfrage', async () => {
    expect((await openReportCountsForTargets({} as H3Event, 'message', [])).size).toBe(0)
    expect(sent).toEqual([])
  })
})

describe('reportEvidenceStateForTarget', () => {
  it('offen, erledigt und die späteste Erledigung — nur in der genannten Community', async () => {
    reports = [
      row('r1', 't-a', 'm1', 'resolved', '2026-08-01T00:00:00.000Z'),
      row('r2', 't-a', 'm1', 'resolved', '2026-09-01T00:00:00.000Z'),
      row('r3', 't-b', 'm1', 'open'),
      row('r4', 't-b', 'm1', 'resolved', '2026-10-01T00:00:00.000Z'),
    ]
    const state = await reportEvidenceStateForTarget({ communityId: 't-a', targetType: 'message', targetId: 'm1' })
    expect(state).toEqual({ open: 0, closed: 2, lastClosedAt: '2026-09-01T00:00:00.000Z' })
    for (const queries of sent) {
      expect(queries).toContainEqual({ method: 'equal', attribute: 'communityId', values: ['t-a'] })
    }
  })

  it('ohne Community (Einzelbetrieb) nur Zeilen ohne Community', async () => {
    reports = [
      row('r1', '', 'm1', 'open'),
      row('r2', 't-a', 'm1', 'open'),
    ]
    const state = await reportEvidenceStateForTarget({ communityId: '', targetType: 'message', targetId: 'm1' })
    expect(state.open).toBe(1)
  })
})
