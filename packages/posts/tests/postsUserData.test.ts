import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { listAllRows, listAllRowsIfTableExists } from '../../core/server/utils/listAllRows'

/**
 * EIN LESEFEHLER IST EIN FEHLER, KEIN „NICHTS GEFUNDEN" (SEC-026, Teil 2).
 *
 * Stimmen, Zähler, Abzeichen und Reaktionen wurden mit `.catch(() => [])`
 * gelesen: ein 500 hiess „dieser Mensch hat hier nichts", die Löschung meldete
 * Erfolg, das Konto verschwand — die Zeilen blieben. Geduldet ist nur die
 * FEHLENDE Tabelle (Migration auf der Instanz offen).
 */

type Row = { $id: string, $createdAt: string, [key: string]: unknown }

let tables: Record<string, Row[]>
let errors: Record<string, unknown>
let deleted: string[]

function equalFilters(queries: string[]): { attribute: string, values: unknown[] }[] {
  return queries
    .map(q => JSON.parse(q) as { method: string, attribute: string, values: unknown[] })
    .filter(q => q.method === 'equal')
}

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    if (errors[tableId]) throw errors[tableId]
    const filters = equalFilters(queries)
    const rows = (tables[tableId] ?? []).filter(row => filters.every(f => f.values.includes(row[f.attribute])))
    return { total: rows.length, rows }
  }),
  deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    deleted.push(`${tableId}/${rowId}`)
  }),
  updateRow: vi.fn(async () => ({})),
}

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('listAllRows', listAllRows)
vi.stubGlobal('listAllRowsIfTableExists', listAllRowsIfTableExists)
vi.stubGlobal('logEvent', () => {})

const { postsDeleteUserData, postsExportUserData } = await import('../server/utils/postsUserData')

const event = { context: {} } as unknown as H3Event
const row = (id: string): Row => ({ $id: id, $createdAt: '2026-11-01T00:00:00.000Z', userId: 'u1' })
const serverError = () => new AppwriteException('Server Error', 500, 'general_unknown')
const tableMissing = () => new AppwriteException('Table not found', 404, 'table_not_found')

beforeEach(() => {
  tables = {
    poll_votes: [row('pv1')],
    post_votes: [row('v1')],
    member_counters: [row('c1')],
    user_badges: [row('b1')],
    discussion_reactions: [row('r1')],
    community_posts: [],
  }
  errors = {}
  deleted = []
})

describe('postsDeleteUserData', () => {
  it('räumt im Normalfall alle Arten ab', async () => {
    expect(await postsDeleteUserData(event, 'u1')).toEqual({ deleted: 5, anonymized: 0 })
  })

  for (const table of ['post_votes', 'member_counters', 'user_badges', 'discussion_reactions']) {
    it(`ein 500 auf ${table} ⇒ die Löschung bricht ab`, async () => {
      errors[table] = serverError()
      await expect(postsDeleteUserData(event, 'u1')).rejects.toThrow('Server Error')
    })
  }

  it('fehlende Tabellen (Migration offen) ⇒ Erfolg', async () => {
    errors.user_badges = tableMissing()
    errors.discussion_reactions = tableMissing()
    expect(await postsDeleteUserData(event, 'u1')).toEqual({ deleted: 3, anonymized: 0 })
  })
})

describe('postsExportUserData', () => {
  for (const table of ['post_votes', 'member_counters', 'user_badges', 'discussion_reactions']) {
    it(`ein 500 auf ${table} ⇒ der Export bricht ab`, async () => {
      errors[table] = serverError()
      await expect(postsExportUserData(event, 'u1')).rejects.toThrow('Server Error')
    })
  }

  it('fehlende Tabelle ⇒ leerer Abschnitt', async () => {
    errors.member_counters = tableMissing()
    const result = await postsExportUserData(event, 'u1')
    expect(result.counters).toEqual([])
    expect(result.badges).toHaveLength(1)
  })
})
