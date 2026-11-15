import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { listAllRows } from '../../core/server/utils/listAllRows'

/**
 * SEC-032 — auf verfassten Kursen blieb nach der Kontolöschung die Konto-Id
 * stehen (`authorId`), nur der Name wurde geleert. Gefunden wird über
 * `authorId`, also findet ein zweiter Lauf danach nichts mehr.
 */

type Row = { $id: string, $createdAt: string, [key: string]: unknown }

let tables: Record<string, Row[]>

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    const filters = queries
      .map(q => JSON.parse(q) as { method: string, attribute: string, values: unknown[] })
      .filter(q => q.method === 'equal')
    const rows = (tables[tableId] ?? []).filter(row => filters.every(f => f.values.includes(row[f.attribute])))
    return { total: rows.length, rows: rows.map(r => ({ ...r })) }
  }),
  deleteRow: vi.fn(async () => {}),
  updateRow: vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    const row = (tables[tableId] ?? []).find(r => r.$id === rowId)!
    Object.assign(row, data)
    return { ...row }
  }),
}

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('listAllRows', listAllRows)

const { coursesDeleteUserData } = await import('../server/utils/coursesUserData')
const event = { context: {} } as unknown as H3Event
const at = '2026-11-01T00:00:00.000Z'

beforeEach(() => {
  tables = {
    lesson_progress: [],
    enrollments: [],
    courses: [
      { $id: 'k1', $createdAt: at, authorId: 'u1', authorName: 'Ada', title: 'Kurs' },
      // Bestand: Name schon leer, Konto-Id noch da — darf nicht übersprungen werden.
      { $id: 'k2', $createdAt: at, authorId: 'u1', authorName: '', title: 'Alt' },
      { $id: 'k3', $createdAt: at, authorId: 'u2', authorName: 'Bob', title: 'Fremd' },
    ],
  }
})

describe('coursesDeleteUserData', () => {
  it('leert Name UND Konto-Id auf jedem verfassten Kurs', async () => {
    expect(await coursesDeleteUserData(event, 'u1')).toMatchObject({ anonymized: 2 })
    expect(tables.courses!.filter(c => c.authorId === 'u1')).toHaveLength(0)
    expect(tables.courses!.find(c => c.$id === 'k1')).toMatchObject({ authorId: '', authorName: '' })
    expect(tables.courses!.find(c => c.$id === 'k2')).toMatchObject({ authorId: '', authorName: '' })
    // Gegenprobe: der Kurs eines anderen Menschen bleibt.
    expect(tables.courses!.find(c => c.$id === 'k3')).toMatchObject({ authorId: 'u2', authorName: 'Bob' })
  })

  it('zweiter Lauf findet nichts mehr', async () => {
    await coursesDeleteUserData(event, 'u1')
    expect(await coursesDeleteUserData(event, 'u1')).toMatchObject({ anonymized: 0 })
  })
})
