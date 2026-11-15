import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { listAllRows, listAllRowsIfTableExists } from '../../core/server/utils/listAllRows'
import { isAppwriteUserMissing } from '../../core/server/utils/userDataOrchestration'

/**
 * „KONTO WEG" IST EIN 404, NICHT JEDER FEHLER (SEC-026, Nachtrag).
 *
 * `accountEmailLower` las das Konto mit einem `catch`, das JEDEN Fehler zu
 * „Konto weg" machte. Die Folge: Korrekturvorschläge und die
 * Newsletter-Eintragung unter dieser Adresse blieben bei einem Wackler still
 * stehen, und die Löschung meldete Erfolg. Jetzt ist nur das 404 für den
 * Nutzer „weg"; jeder andere Fehler bricht ab. Und ein Lesefehler auf einer
 * Tabelle ist ein Fehler — nur die FEHLENDE Tabelle ist eine Null.
 */

interface FakeRow { $id: string, $createdAt: string, [key: string]: unknown }

let tables: Record<string, FakeRow[]>
let errors: Record<string, unknown>
let getUser: () => Promise<unknown>

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
  updateRow: vi.fn(async () => ({})),
}

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB, users: { get: async () => getUser() } }))
vi.stubGlobal('listAllRows', listAllRows)
vi.stubGlobal('listAllRowsIfTableExists', listAllRowsIfTableExists)
vi.stubGlobal('isAppwriteUserMissing', isAppwriteUserMissing)
vi.stubGlobal('logEvent', () => {})

const { insightsDeleteUserData, insightsExportUserData } = await import('../server/utils/insightsUserData')

const event = { context: {} } as unknown as H3Event
const row = (id: string, extra: Record<string, unknown>): FakeRow =>
  ({ $id: id, $createdAt: '2026-11-01T00:00:00.000Z', ...extra })

beforeEach(() => {
  tables = {
    insights_corrections: [row('k1', { contactEmail: 'a@example.com' })],
    insights_subscribers: [row('n1', { emailLower: 'a@example.com' })],
  }
  errors = {}
  getUser = async () => ({ $id: 'u1', email: 'A@example.com', emailVerification: true })
})

describe('insightsDeleteUserData', () => {
  it('Normalfall: Korrektur und Newsletter werden anonymisiert', async () => {
    expect(await insightsDeleteUserData(event, 'u1')).toEqual({ deleted: 0, anonymized: 2 })
  })

  it('users.get mit 500 ⇒ Abbruch statt „Konto weg"', async () => {
    getUser = async () => { throw new AppwriteException('Server Error', 500, 'general_unknown') }
    await expect(insightsDeleteUserData(event, 'u1')).rejects.toThrow('Server Error')
  })

  it('users.get mit 404 ⇒ Konto weg, ohne Adresse weiter', async () => {
    getUser = async () => { throw new AppwriteException('User not found', 404, 'user_not_found') }
    expect(await insightsDeleteUserData(event, 'u1')).toEqual({ deleted: 0, anonymized: 0 })
  })

  it('ein 500 auf eine Tabelle ⇒ Abbruch', async () => {
    errors.insights_subscribers = new AppwriteException('Server Error', 500, 'general_unknown')
    await expect(insightsDeleteUserData(event, 'u1')).rejects.toThrow('Server Error')
  })

  it('GEGENPROBE: ein 404 einer anderen Art auf eine Tabelle ist KEINE fehlende Tabelle', async () => {
    errors.insights_subscribers = new AppwriteException('Database not found', 404, 'database_not_found')
    await expect(insightsDeleteUserData(event, 'u1')).rejects.toThrow('Database not found')
  })

  it('fehlende Tabelle (Migration offen) ⇒ Erfolg', async () => {
    errors.insights_subscribers = new AppwriteException('Table not found', 404, 'table_not_found')
    expect(await insightsDeleteUserData(event, 'u1')).toEqual({ deleted: 0, anonymized: 1 })
  })
})

describe('insightsExportUserData', () => {
  it('users.get mit 500 ⇒ der Export bricht ab', async () => {
    getUser = async () => { throw new AppwriteException('Server Error', 500, 'general_unknown') }
    await expect(insightsExportUserData(event, 'u1')).rejects.toThrow('Server Error')
  })
})
