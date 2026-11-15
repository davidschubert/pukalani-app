import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { listAllRows, listAllRowsIfTableExists } from '../../../packages/core/server/utils/listAllRows'
import { isAppwriteUserMissing } from '../../../packages/core/server/utils/userDataOrchestration'

/**
 * ERSTGESPRÄCH-ANFRAGEN IN AUSKUNFT UND LÖSCHUNG (SEC-026, 2026-11-15): vorher
 * gab es für `intro_requests` keinen Contributor — Name, Firma, Adresse und
 * Telefon blieben nach einer Kontolöschung stehen.
 */

interface FakeRow { $id: string, $createdAt: string, [key: string]: unknown }
interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

let rows: FakeRow[]
let listError: unknown
let getUser: () => Promise<unknown>
let deletedIds: string[]

const tablesDB = {
  listRows: vi.fn(async ({ queries }: { tableId: string, queries: string[] }) => {
    if (listError) throw listError
    const parsed = queries.map(query => JSON.parse(query) as ParsedQuery)
    const all = rows.filter(row =>
      parsed.every(filter => filter.method !== 'equal' || (filter.values ?? []).includes(row[filter.attribute!])))
    return { rows: all, total: all.length }
  }),
  deleteRow: vi.fn(async ({ rowId }: { rowId: string }) => {
    deletedIds.push(rowId)
    rows = rows.filter(row => row.$id !== rowId)
    return {}
  }),
}

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB, users: { get: async () => getUser() } }))
vi.stubGlobal('listAllRows', listAllRows)
vi.stubGlobal('listAllRowsIfTableExists', listAllRowsIfTableExists)
vi.stubGlobal('isAppwriteUserMissing', isAppwriteUserMissing)

const { introRequestsDeleteUserData, introRequestsExportUserData } = await import('../server/utils/introRequestsUserData')

const event = {} as H3Event
const T = '2026-11-01T00:00:00.000Z'
const request = (id: string, email: string): FakeRow => ({
  $id: id, $createdAt: T, name: 'Ada', company: 'ACME', email, phone: '+49', goals: '["brand"]', projectType: 'new',
  industry: '', budget: 'b', teamSize: 't', market: '', currentSetup: 's', timing: 'soon', note: 'Hallo', locale: 'de',
})

beforeEach(() => {
  rows = [request('q1', 'ada@example.com'), request('q2', 'bob@example.com')]
  listError = undefined
  deletedIds = []
  getUser = async () => ({ $id: 'u1', email: 'Ada@Example.com', emailVerification: true })
})

describe('introRequestsDeleteUserData', () => {
  it('löscht die Anfragen unter der bestätigten Adresse, fremde bleiben', async () => {
    expect(await introRequestsDeleteUserData(event, 'u1')).toEqual({ deleted: 1, anonymized: 0 })
    expect(rows.map(row => row.$id)).toEqual(['q2'])
  })

  it('zweiter Lauf findet nichts mehr', async () => {
    await introRequestsDeleteUserData(event, 'u1')
    expect(await introRequestsDeleteUserData(event, 'u1')).toEqual({ deleted: 0, anonymized: 0 })
  })

  it('unbestätigte Adresse ⇒ nichts wird angefasst', async () => {
    getUser = async () => ({ $id: 'u1', email: 'ada@example.com', emailVerification: false })
    expect(await introRequestsDeleteUserData(event, 'u1')).toEqual({ deleted: 0, anonymized: 0 })
    expect(deletedIds).toEqual([])
  })

  it('Konto schon weg (404 user_not_found) ⇒ übersprungen', async () => {
    getUser = async () => { throw new AppwriteException('User not found', 404, 'user_not_found') }
    expect(await introRequestsDeleteUserData(event, 'u1')).toEqual({ deleted: 0, anonymized: 0 })
  })

  it('users.get mit 500 ⇒ die Löschung bricht ab', async () => {
    getUser = async () => { throw new AppwriteException('Server Error', 500, 'general_unknown') }
    await expect(introRequestsDeleteUserData(event, 'u1')).rejects.toThrow('Server Error')
  })

  it('fehlende Tabelle ⇒ Erfolg; ein 500 beim Lesen ⇒ Abbruch', async () => {
    listError = new AppwriteException('Table not found', 404, 'table_not_found')
    expect(await introRequestsDeleteUserData(event, 'u1')).toEqual({ deleted: 0, anonymized: 0 })
    listError = new AppwriteException('Server Error', 500, 'general_unknown')
    await expect(introRequestsDeleteUserData(event, 'u1')).rejects.toThrow('Server Error')
  })
})

describe('introRequestsExportUserData', () => {
  it('liefert die eigene Anfrage vollständig, keine fremde', async () => {
    const result = await introRequestsExportUserData(event, 'u1')
    expect(result.introRequests).toEqual([expect.objectContaining({ name: 'Ada', company: 'ACME', email: 'ada@example.com', phone: '+49', note: 'Hallo' })])
    expect(JSON.stringify(result)).not.toContain('bob@example.com')
  })
})
