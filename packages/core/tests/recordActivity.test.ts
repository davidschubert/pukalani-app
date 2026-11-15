import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * SEC-032 — der Feed räumt hinter gelöschtem und bearbeitetem Inhalt auf.
 *
 * `removeActivitiesForObject` hörte nach 10 × 25 Zeilen STILL auf: ein Objekt
 * mit mehr Einträgen behielt seinen Rest, und niemand erfuhr davon. Jetzt
 * liest es bis zur leeren Seite, meldet die Anzahl und loggt, wenn der
 * Notanker greift. `updateActivitySnippetForObject` ist das Gegenstück für
 * die Bearbeitung: der Schnappschuss im Feed folgt dem neuen Text.
 *
 * Nachgebildet ist nur die Datenbank (Zeilen, `Query.equal`, `Query.limit`),
 * nicht die Datentür — beide Funktionen laufen bewusst am Admin-Client.
 */

type Row = { $id: string, objectType: string, objectId: string, metadata: string }

let rows: Row[]
let failDelete: boolean
const updates: { rowId: string, data: Record<string, unknown> }[] = []

interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

function parse(queries: string[]): ParsedQuery[] {
  return queries.map(q => JSON.parse(q) as ParsedQuery)
}

const tablesDB = {
  listRows: vi.fn(async ({ queries }: { queries: string[] }) => {
    const parsed = parse(queries)
    const limit = Number(parsed.find(q => q.method === 'limit')?.values?.[0] ?? 25)
    const cursor = parsed.find(q => q.method === 'cursorAfter')?.values?.[0]
    let found = rows.filter(row => parsed.every(q => q.method !== 'equal'
      || (q.values ?? []).includes(row[q.attribute as keyof Row])))
    if (cursor) found = found.slice(found.findIndex(row => row.$id === cursor) + 1)
    return { total: found.length, rows: found.slice(0, limit).map(row => ({ ...row })) }
  }),
  deleteRow: vi.fn(async ({ rowId }: { rowId: string }) => {
    if (failDelete) throw new Error('boom')
    rows = rows.filter(row => row.$id !== rowId)
  }),
  updateRow: vi.fn(async ({ rowId, data }: { rowId: string, data: Record<string, unknown> }) => {
    updates.push({ rowId, data })
    const row = rows.find(r => r.$id === rowId)
    if (row) Object.assign(row, data)
    return row
  }),
}

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))

const { removeActivitiesForObject, updateActivitySnippetForObject } = await import('../server/utils/recordActivity')

const event = { context: {} } as unknown as H3Event

function entries(count: number, objectId = 'post-1'): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    $id: `a-${objectId}-${i}`,
    objectType: 'post',
    objectId,
    metadata: JSON.stringify({ snippet: 'alter Text' }),
  }))
}

beforeEach(() => {
  rows = []
  failDelete = false
  updates.length = 0
  vi.restoreAllMocks()
})

describe('removeActivitiesForObject', () => {
  it('entfernt ALLE 300 Einträge eines Objekts und meldet die Anzahl', async () => {
    rows = [...entries(300), ...entries(3, 'post-2')]
    expect(await removeActivitiesForObject(event, { objectType: 'post', objectId: 'post-1' })).toBe(300)
    expect(rows.filter(row => row.objectId === 'post-1')).toHaveLength(0)
    // Gegenprobe: ein anderes Objekt bleibt unberührt.
    expect(rows.filter(row => row.objectId === 'post-2')).toHaveLength(3)
  })

  it('kein Eintrag ⇒ 0, ohne Fehler', async () => {
    expect(await removeActivitiesForObject(event, { objectType: 'post', objectId: 'nix' })).toBe(0)
  })

  it('ein Fehler bleibt best effort: kein Wurf, aber eine Log-Zeile', async () => {
    rows = entries(2)
    failDelete = true
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(removeActivitiesForObject(event, { objectType: 'post', objectId: 'post-1' })).resolves.toBe(0)
    expect(error).toHaveBeenCalledTimes(1)
  })
})

describe('updateActivitySnippetForObject', () => {
  it('ersetzt den Schnappschuss jedes Eintrags und lässt andere Felder stehen', async () => {
    rows = [
      { $id: 'a1', objectType: 'comment', objectId: 'k-1', metadata: JSON.stringify({ snippet: 'alt', extra: 1 }) },
      { $id: 'a2', objectType: 'comment', objectId: 'k-2', metadata: JSON.stringify({ snippet: 'fremd' }) },
    ]
    expect(await updateActivitySnippetForObject(event, 'comment', 'k-1', 'neu')).toBe(1)
    expect(JSON.parse(rows[0]!.metadata)).toEqual({ snippet: 'neu', extra: 1 })
    // Gegenprobe: der Eintrag eines anderen Kommentars bleibt.
    expect(JSON.parse(rows[1]!.metadata)).toEqual({ snippet: 'fremd' })
  })

  it('ein Eintrag ohne Schnappschuss bleibt unangetastet', async () => {
    rows = [{ $id: 'a1', objectType: 'post', objectId: 'p-1', metadata: '' }]
    expect(await updateActivitySnippetForObject(event, 'post', 'p-1', 'neu')).toBe(0)
    expect(updates).toHaveLength(0)
  })
})
