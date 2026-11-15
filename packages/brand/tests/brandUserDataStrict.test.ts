import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { listAllRows, listAllRowsIfTableExists } from '../../core/server/utils/listAllRows'
import { isAppwriteUserMissing } from '../../core/server/utils/userDataOrchestration'

/**
 * DIE LÖSCHUNG EINES BRANDINGS HÖRT NICHT MEHR „TROTZDEM" AUF (SEC-026,
 * Teil 2 und Nachtrag).
 *
 * Zwei Stellen meldeten Erfolg, wo keiner war:
 *
 *  1. DIE KASKADE. `runBrandProfileCascades` fing den Fehler eines Mitläufers
 *     (heute `market`) ab, loggte und gab `-1` zurück; Löschroute und
 *     GDPR-Contributor löschten danach das PROFIL. Die Zeilen des anderen
 *     Layers hängen aber an genau diesem Profil — ohne Kopf findet sie keine
 *     Route und kein zweiter Lauf mehr. Jetzt bleibt das Profil stehen, die
 *     Route antwortet 502 `profile_delete_incomplete`, der Contributor wirft.
 *  2. DIE ADRESSE. `accountEmailLower` las das Konto mit einem `catch`, das
 *     JEDEN Fehler zu „Konto weg" machte — die Einladungen an diese Adresse
 *     blieben dann still unangetastet. Jetzt ist nur das 404 „weg".
 */

interface FakeRow { $id: string, $createdAt: string, [key: string]: unknown }

let tables: Record<string, FakeRow[]>
let deletedRows: string[]
let getUser: () => Promise<unknown>
const routerParams: Record<string, string> = {}

function equalFilters(queries: string[]): { attribute: string, values: unknown[] }[] {
  return queries
    .map(q => JSON.parse(q) as { method: string, attribute: string, values: unknown[] })
    .filter(q => q.method === 'equal')
}

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    const filters = equalFilters(queries)
    const rows = (tables[tableId] ?? []).filter(row => filters.every(f => f.values.includes(row[f.attribute])))
    return { total: rows.length, rows }
  }),
  getRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    const found = (tables[tableId] ?? []).find(row => row.$id === rowId)
    if (!found) throw new AppwriteException('Row not found', 404, 'row_not_found')
    return found
  }),
  deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    const rows = tables[tableId] ?? []
    const at = rows.findIndex(row => row.$id === rowId)
    if (at < 0) throw new AppwriteException('Row not found', 404, 'row_not_found')
    rows.splice(at, 1)
    deletedRows.push(`${tableId}/${rowId}`)
  }),
  updateRow: vi.fn(async () => ({})),
}

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('useAppConfig', () => ({ pukalani: { brand: {} } }))
vi.stubGlobal('createAdminClient', () => ({
  tablesDB,
  storage: { deleteFile: async () => {} },
  users: { get: async () => getUser() },
}))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('toH3Error', (error: unknown) => error)
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('listAllRows', listAllRows)
vi.stubGlobal('listAllRowsIfTableExists', listAllRowsIfTableExists)
vi.stubGlobal('isAppwriteUserMissing', isAppwriteUserMissing)
vi.stubGlobal('BRAND_INVITES_TABLE', 'brand_invites')
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('requireBrandAccess', async () => ({ userId: 'u1' }))
vi.stubGlobal('assertBrandOwnerAccess', () => {})
vi.stubGlobal('getRouterParam', (_event: H3Event, name: string) => routerParams[name] ?? '')

const { registerBrandProfileCascade } = await import('../server/utils/brandProfileCascade')
const { brandDeleteUserData } = await import('../server/utils/brandUserData')
const deleteRoute = (await import('../server/api/brand/profiles/[id]/index.delete')).default as unknown as
  (event: H3Event) => Promise<unknown>

const event = { context: {} } as unknown as H3Event
const row = (id: string, extra: Record<string, unknown> = {}): FakeRow =>
  ({ $id: id, $createdAt: '2026-11-01T00:00:00.000Z', ...extra })

let cascadeError: unknown
registerBrandProfileCascade({
  id: 'market',
  removeProfileData: async () => {
    if (cascadeError) throw cascadeError
    return 2
  },
})

beforeEach(() => {
  tables = {
    brand_profiles: [row('p1', { ownerType: 'user', ownerId: 'u1' })],
    brand_steps: [row('s1', { profileId: 'p1' })],
    brand_invites: [row('i1', { emailLower: 'a@example.com' })],
  }
  deletedRows = []
  cascadeError = undefined
  getUser = async () => ({ $id: 'u1', email: 'A@example.com' })
  routerParams.id = 'p1'
  tablesDB.updateRow.mockClear()
})

describe('brandDeleteUserData — die Kaskade', () => {
  it('Normalfall: Kinder, Mitläufer und Profil sind weg', async () => {
    const result = await brandDeleteUserData(event, 'u1')
    expect(deletedRows).toContain('brand_profiles/p1')
    expect(result.deleted).toBe(4) // Baustein + 2 Mitläufer-Zeilen + Profil
  })

  it('ein scheiternder Mitläufer ⇒ Abbruch, das PROFIL bleibt stehen', async () => {
    cascadeError = new Error('market down')
    await expect(brandDeleteUserData(event, 'u1')).rejects.toThrow()
    expect(deletedRows).not.toContain('brand_profiles/p1')
    expect(tables.brand_profiles).toHaveLength(1)
  })
})

describe('brandDeleteUserData — die Adresse', () => {
  it('users.get mit 500 ⇒ Abbruch statt „Konto weg"', async () => {
    getUser = async () => { throw new AppwriteException('Server Error', 500, 'general_unknown') }
    await expect(brandDeleteUserData(event, 'u1')).rejects.toThrow('Server Error')
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('users.get mit 404 ⇒ Konto weg, Löschung endet erfolgreich ohne Einladungen', async () => {
    getUser = async () => { throw new AppwriteException('User not found', 404, 'user_not_found') }
    await expect(brandDeleteUserData(event, 'u1')).resolves.toMatchObject({ anonymized: 0 })
  })

  it('Normalfall: die Einladung an die Adresse wird anonymisiert', async () => {
    await expect(brandDeleteUserData(event, 'u1')).resolves.toMatchObject({ anonymized: 1 })
  })
})

describe('DELETE /api/brand/profiles/:id — die Kaskade', () => {
  it('Normalfall: das Profil ist weg', async () => {
    await deleteRoute(event)
    expect(deletedRows).toContain('brand_profiles/p1')
  })

  it('ein scheiternder Mitläufer ⇒ 502 profile_delete_incomplete, das Profil bleibt', async () => {
    cascadeError = new Error('market down')
    await expect(deleteRoute(event)).rejects.toMatchObject({
      status: 502,
      data: { code: 'profile_delete_incomplete' },
    })
    expect(deletedRows).not.toContain('brand_profiles/p1')
    // Wiederholbar: die eigenen Kinder sind schon weg, ein zweiter Lauf mit
    // gesundem Mitläufer räumt den Rest ab.
    cascadeError = undefined
    await deleteRoute(event)
    expect(deletedRows).toContain('brand_profiles/p1')
  })
})
