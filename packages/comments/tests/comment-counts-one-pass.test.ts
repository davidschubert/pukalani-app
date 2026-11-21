import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { COMMENTS_TABLE } from '../shared/types/comment'

/**
 * Q12 (PERF-004): `/api/comments/counts` zählt in EINEM Zug statt je Ziel.
 *
 * Die nachgebaute Tür kann, was die Route braucht und die Datenbank leistet:
 * `equal` (auch mit Liste), `notEqual`, `select`, `orderAsc('$id')`, `limit`,
 * `cursorAfter` — und ein Leserecht je Zeile wie die Row-Permissions der
 * Mitglieder-Klinke. Die Erwartungen stehen AUSGESCHRIEBEN im Test, nicht aus
 * der Tür berechnet.
 */

interface Row { $id: string, targetId: string, targetType: string, status: string, readable?: boolean }
interface Q { method: string, attribute?: string, values?: unknown[] }

const calls: Array<{ method: 'list' | 'count', queries: string[] }> = []
let rows: Row[] = []
let failList = false

function apply(all: Row[], queries: string[]): Row[] {
  let out = all.filter(row => row.readable !== false)
  let limit = 25
  let after: string | undefined
  for (const raw of queries) {
    const q = JSON.parse(raw) as Q
    const value = (row: Row) => (row as unknown as Record<string, unknown>)[q.attribute ?? '']
    if (q.method === 'equal') out = out.filter(row => (q.values ?? []).includes(value(row)))
    if (q.method === 'notEqual') out = out.filter(row => !(q.values ?? []).includes(value(row)))
    if (q.method === 'limit') limit = Number(q.values?.[0])
    if (q.method === 'cursorAfter') after = String(q.values?.[0])
  }
  out = out.sort((a, b) => a.$id.localeCompare(b.$id))
  if (after) out = out.filter(row => row.$id > after!)
  return out.slice(0, limit)
}

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('createError', (init: { status: number, statusText: string }) => Object.assign(new Error(init.statusText), init))
vi.stubGlobal('tenantDb', (_event: H3Event, options?: { as?: string }) => {
  // Diese Route liest NUR über die Mitglieder-Klinke (Leserechte wirken).
  expect(options?.as).toBeUndefined()
  return {
    async list(table: string, queries: string[]) {
      expect(table).toBe(COMMENTS_TABLE)
      calls.push({ method: 'list', queries })
      if (failList) throw Object.assign(new Error('unavailable'), { code: 503 })
      const page = apply(rows, queries)
      return { rows: page, total: page.length }
    },
    async count(table: string, queries: string[]) {
      expect(table).toBe(COMMENTS_TABLE)
      calls.push({ method: 'count', queries })
      return apply(rows, [...queries, JSON.stringify({ method: 'limit', values: [1_000_000] })]).length
    },
  }
})

let currentQuery: Record<string, string> = {}
vi.stubGlobal('getQuery', () => currentQuery)

const { default: handler } = await import('../server/api/comments/counts.get') as unknown as {
  default: (event: H3Event) => Promise<{ counts: Record<string, number> }>
}

async function counts(targetIds: string[]) {
  currentQuery = { targetType: 'post', targetIds: targetIds.join(',') }
  return (await handler({} as H3Event)).counts
}

function many(prefix: string, targetId: string, n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({ $id: `${prefix}-${String(i).padStart(5, '0')}`, targetId, targetType: 'post', status: 'active' }))
}

afterEach(() => {
  calls.length = 0
  rows = []
  failList = false
})

describe('/api/comments/counts — in einem Zug', () => {
  it('ein Feed mit drei Beiträgen: EINE Abfrage, richtige Zahlen', async () => {
    rows = [
      { $id: 'c01', targetId: 'p-1', targetType: 'post', status: 'active' },
      { $id: 'c02', targetId: 'p-1', targetType: 'post', status: 'deleted' }, // Platzhalter zählt
      { $id: 'c03', targetId: 'p-1', targetType: 'post', status: 'hidden' }, // versteckt zählt nie
      { $id: 'c04', targetId: 'p-2', targetType: 'post', status: 'active', readable: false }, // kein Leserecht
      { $id: 'c05', targetId: 'p-2', targetType: 'post', status: 'active' },
      { $id: 'c06', targetId: 'p-1', targetType: 'event', status: 'active' }, // anderes Ziel-Art
      { $id: 'c07', targetId: 'p-9', targetType: 'post', status: 'active' }, // nicht gefragt
    ]
    expect(await counts(['p-1', 'p-2', 'p-3'])).toEqual({ 'p-1': 2, 'p-2': 1, 'p-3': 0 })
    expect(calls.map(c => c.method)).toEqual(['list'])
  })

  it('viele Kommentare: blättert, zählt vollständig', async () => {
    rows = [...many('a', 'p-1', 1500), ...many('b', 'p-2', 700)]
    expect(await counts(['p-1', 'p-2'])).toEqual({ 'p-1': 1500, 'p-2': 700 })
    expect(calls.map(c => c.method)).toEqual(['list', 'list', 'list'])
  })

  it('sehr viele Kommentare: ab der Obergrenze wieder je Ziel gezählt — nichts geht verloren', async () => {
    rows = [...many('a', 'p-1', 4200), ...many('b', 'p-2', 1300)]
    expect(await counts(['p-1', 'p-2'])).toEqual({ 'p-1': 4200, 'p-2': 1300 })
    expect(calls.filter(c => c.method === 'count')).toHaveLength(2)
  })

  it('doppelte Ids zählen einmal', async () => {
    rows = many('a', 'p-1', 3)
    expect(await counts(['p-1', 'p-1'])).toEqual({ 'p-1': 3 })
  })

  it('Lesefehler: jede Zahl 0 (wie vorher), keine Ausnahme', async () => {
    rows = many('a', 'p-1', 3)
    failList = true
    expect(await counts(['p-1', 'p-2'])).toEqual({ 'p-1': 0, 'p-2': 0 })
  })

  it('ohne Ziele 400, mehr als 50 Ziele 422', async () => {
    await expect(counts([])).rejects.toMatchObject({ status: 400 })
    await expect(counts(Array.from({ length: 51 }, (_, i) => `p-${i}`))).rejects.toMatchObject({ status: 422 })
  })
})
