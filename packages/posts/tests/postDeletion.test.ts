import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { Permission, Role } from 'node-appwrite'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeDoor, type FakeRow, fakeDoor, runDoorRoute } from '../../core/tests/support/doorFake'
import { listAllRows, listAllRowsIfTableExists } from '../../core/server/utils/listAllRows'
import { removeObjectNotifications } from '../../core/server/utils/notificationCleanup'
import { postMentionNotificationId } from '../server/utils/postMentions'
import { POSTS_TABLE } from '../shared/types/post'

/**
 * SEC-032 — was nach dem Löschen eines Beitrags übrig bleibt.
 *
 *  - Kontolöschung: der Grabstein trug noch `authorId`, die Umfrage-Optionen
 *    und den Übersetzungs-Cache (der Text in bis zu sechs Sprachen).
 *  - Fremde Zähler-Zeilen trugen in `invitedBy` die Konto-Id der gelöschten
 *    Person.
 *  - Eigenes Löschen ließ den Feed-Eintrag mit dem Schnappschuss des Titels
 *    stehen, und die Erwähnungs-Meldungen mit demselben Auszug.
 *  - Bearbeiten zog den Schnappschuss im Feed nicht nach.
 */

const removeActivitiesForObject = vi.fn(async () => 0)
const updateActivitySnippetForObject = vi.fn(async () => 0)

beforeEach(() => {
  removeActivitiesForObject.mockClear()
  updateActivitySnippetForObject.mockClear()
})

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

/* ── Kontolöschung ──────────────────────────────────────────────────────── */

type Row = { $id: string, $createdAt: string, [key: string]: unknown }

function adminFake(tables: Record<string, Row[]>) {
  const updates: { tableId: string, rowId: string, data: Record<string, unknown>, permissions?: string[] }[] = []
  const tablesDB = {
    listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
      const filters = queries
        .map(q => JSON.parse(q) as { method: string, attribute: string, values: unknown[] })
        .filter(q => q.method === 'equal')
      const rows = (tables[tableId] ?? []).filter(row => filters.every(f => f.values.includes(row[f.attribute])))
      return { total: rows.length, rows: rows.map(r => ({ ...r })) }
    }),
    deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
      tables[tableId] = (tables[tableId] ?? []).filter(r => r.$id !== rowId)
    }),
    updateRow: vi.fn(async (args: { tableId: string, rowId: string, data: Record<string, unknown>, permissions?: string[] }) => {
      updates.push(args)
      const row = (tables[args.tableId] ?? []).find(r => r.$id === args.rowId)
      if (row) Object.assign(row, args.data)
      return row
    }),
  }
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
  vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
  vi.stubGlobal('listAllRows', listAllRows)
  vi.stubGlobal('listAllRowsIfTableExists', listAllRowsIfTableExists)
  vi.stubGlobal('logEvent', () => {})
  vi.stubGlobal('removeActivitiesForObject', removeActivitiesForObject)
  return { tablesDB, updates }
}

const event = { context: {} } as unknown as H3Event
const at = '2026-11-01T00:00:00.000Z'

describe('postsDeleteUserData — der Grabstein ist wirklich leer', () => {
  it('leert Umfrage-Optionen, Übersetzung UND die Konto-Id, und räumt den Feed', async () => {
    const tables: Record<string, Row[]> = {
      community_posts: [{
        $id: 'p1', $createdAt: at, communityId: 'c-a', authorId: 'u1', authorName: 'Ada', type: 'poll',
        title: 'Frage?', body: 'Text', status: 'published',
        pollOptions: JSON.stringify(['Ja', 'Nein']), translations: JSON.stringify({ en: { body: 'Text' } }),
      }],
    }
    const { updates } = adminFake(tables)
    const { postsDeleteUserData } = await import('../server/utils/postsUserData')

    expect(await postsDeleteUserData(event, 'u1')).toMatchObject({ anonymized: 1 })
    expect(updates[0]!.data).toMatchObject({
      status: 'deleted', title: null, body: '', authorName: '', authorId: '', pollOptions: null, translations: '',
    })
    expect(removeActivitiesForObject).toHaveBeenCalledWith(event, { objectType: 'post', objectId: 'p1' })

    // Ein zweiter Lauf findet über `authorId` nichts mehr und endet.
    updates.length = 0
    expect(await postsDeleteUserData(event, 'u1')).toMatchObject({ anonymized: 0 })
    expect(updates).toHaveLength(0)
  })

  it('ein Grabstein aus der Zeit VOR diesem Paket wird nachgeräumt (nicht übersprungen)', async () => {
    const tables: Record<string, Row[]> = {
      community_posts: [{
        $id: 'p1', $createdAt: at, authorId: 'u1', authorName: '', title: null, body: '', status: 'deleted',
        pollOptions: JSON.stringify(['Ja', 'Nein']), translations: '{"en":{"title":"x"}}',
      }],
    }
    const { updates } = adminFake(tables)
    const { postsDeleteUserData } = await import('../server/utils/postsUserData')
    await postsDeleteUserData(event, 'u1')
    expect(updates[0]!.data).toMatchObject({ authorId: '', pollOptions: null, translations: '' })
  })

  it('`invitedBy` in FREMDEN Zähler-Zeilen wird geleert — die eigene Zeile fällt ganz', async () => {
    const tables: Record<string, Row[]> = {
      member_counters: [
        { $id: 'mc-own', $createdAt: at, userId: 'u1', invitedBy: '' },
        { $id: 'mc-foreign', $createdAt: at, userId: 'u2', invitedBy: 'u1' },
        { $id: 'mc-other', $createdAt: at, userId: 'u3', invitedBy: 'u9' },
      ],
    }
    const { updates } = adminFake(tables)
    const { postsDeleteUserData } = await import('../server/utils/postsUserData')
    await postsDeleteUserData(event, 'u1')

    expect(tables.member_counters!.map(r => r.$id)).toEqual(['mc-foreign', 'mc-other'])
    expect(updates).toEqual([expect.objectContaining({ tableId: 'member_counters', rowId: 'mc-foreign', data: { invitedBy: '' } })])
    // Gegenprobe: die Einladung eines anderen Menschen bleibt stehen.
    expect(tables.member_counters!.find(r => r.$id === 'mc-other')!.invitedBy).toBe('u9')
  })

  it('ein Lesefehler auf `invitedBy` hält die Löschung an', async () => {
    const tables: Record<string, Row[]> = { member_counters: [] }
    const { tablesDB } = adminFake(tables)
    const original = tablesDB.listRows.getMockImplementation()!
    tablesDB.listRows.mockImplementation(async (args) => {
      if (args.tableId === 'member_counters' && args.queries.some(q => q.includes('invitedBy'))) {
        throw Object.assign(new Error('Server Error'), { code: 500 })
      }
      return original(args)
    })
    const { postsDeleteUserData } = await import('../server/utils/postsUserData')
    await expect(postsDeleteUserData(event, 'u1')).rejects.toThrow('Server Error')
  })
})

/* ── Eigenes Löschen und Bearbeiten ─────────────────────────────────────── */

const MEMBER = 'u-member'

function post(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    $id: 'p-1',
    $createdAt: at,
    communityId: 'c-a',
    type: 'text',
    title: 'Mein Titel',
    body: 'Mein Text',
    authorId: MEMBER,
    authorName: 'Autorin',
    status: 'published',
    categoryId: null,
    $permissions: [Permission.read(Role.any()), Permission.update(Role.user(MEMBER))],
    ...overrides,
  }
}

function withPermissionWrites(door: FakeDoor) {
  return (e: H3Event, options?: { as?: 'member' | 'operator', actor?: string }) => ({
    ...door.tenantDb(e, options),
    async updatePermissions(table: string, id: string, permissions: string[]) {
      const row = (door.rows[table] ?? []).find(r => r.$id === id)!
      row.$permissions = permissions
      return { ...row }
    },
  })
}

describe('DELETE /api/posts/:id — Feed-Eintrag und Erwähnungs-Meldungen gehen mit', () => {
  it('entfernt den Feed-Eintrag und die Meldungen mit dem Auszug', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post()] } })
    const removePostMentionNotifications = vi.fn(async () => 0)
    const run = await runDoorRoute(() => import('../server/api/posts/[id].delete'), {
      door, params: { id: 'p-1' },
      globals: { tenantDb: withPermissionWrites(door), removeActivitiesForObject, removePostMentionNotifications },
    })
    expect(run.status).toBe(200)
    expect(door.rows[POSTS_TABLE]![0]!.status).toBe('deleted')
    expect(removeActivitiesForObject).toHaveBeenCalledWith(expect.anything(), { objectType: 'post', objectId: 'p-1' })
    expect(removePostMentionNotifications).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $id: 'p-1', authorId: MEMBER }))
  })
})

describe('PATCH /api/posts/:id — der Feed-Schnappschuss folgt dem Text', () => {
  const load = () => import('../server/api/posts/[id].patch')

  it('echte Änderung ⇒ Snippet = neuer Titel', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post()] } })
    const run = await runDoorRoute(load, {
      door, params: { id: 'p-1' }, body: { title: 'Neuer Titel', body: 'Mein Text' },
      globals: { updateActivitySnippetForObject, syncTopicLinks: async () => ({ added: 0, removed: 0 }) },
    })
    expect(run.status).toBe(200)
    expect(updateActivitySnippetForObject).toHaveBeenCalledWith(expect.anything(), 'post', 'p-1', 'Neuer Titel')
  })

  it('Gegenprobe: Speichern ohne Änderung fasst den Feed nicht an', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post()] } })
    await runDoorRoute(load, {
      door, params: { id: 'p-1' }, body: { title: 'Mein Titel', body: 'Mein Text' },
      globals: { updateActivitySnippetForObject, syncTopicLinks: async () => ({ added: 0, removed: 0 }) },
    })
    expect(updateActivitySnippetForObject).not.toHaveBeenCalled()
  })
})

/* ── Erwähnungs-Meldungen eines Beitrags ────────────────────────────────── */

describe('removePostMentionNotifications — nur die Meldungen GENAU dieses Beitrags', () => {
  it('löscht per Schlüssel-Abgleich, lässt andere Beiträge und fremde Typen stehen', async () => {
    const own = postMentionNotificationId('t-a', 'p-1', 'u-r1')
    const otherPost = postMentionNotificationId('t-a', 'p-2', 'u-r1')
    const tables: Record<string, Row[]> = {
      notifications: [
        { $id: own, $createdAt: at, senderId: MEMBER, type: 'post.mention', recipientId: 'u-r1' },
        { $id: otherPost, $createdAt: at, senderId: MEMBER, type: 'post.mention', recipientId: 'u-r1' },
        { $id: 'n-reply', $createdAt: at, senderId: MEMBER, type: 'reply', recipientId: 'u-r1' },
      ],
    }
    adminFake(tables)
    vi.stubGlobal('useTenant', () => ({ mode: 'pool', tenantId: 't-a' }))
    // Die ECHTE Core-Räumung: Layer-Formel (Typ, Id) und Core-Vertrag zusammen.
    vi.stubGlobal('removeObjectNotifications', removeObjectNotifications)
    const { removePostMentionNotifications } = await import('../server/utils/postMentionCleanup')

    expect(await removePostMentionNotifications(event, { $id: 'p-1', authorId: MEMBER })).toBe(1)
    expect(tables.notifications!.map(r => r.$id)).toEqual([otherPost, 'n-reply'])
  })
})

/* ── Betreiber-Export ───────────────────────────────────────────────────── */

describe('postsCommunityExport — gelöschte Beiträge als Platzhalter ohne Text', () => {
  it('Titel, Text, Name und Umfrage-Optionen fehlen; der Nachbar bleibt', async () => {
    const rows = [
      post({ status: 'deleted', type: 'poll', pollOptions: '["Ja","Nein"]' }),
      post({ $id: 'p-2', title: 'Sichtbar', body: 'Bleibt' }),
    ]
    vi.stubGlobal('tenantDb', () => ({ count: async () => 0 }))
    vi.stubGlobal('collectTenantRows', async (_db: unknown, table: string) => (table === POSTS_TABLE ? rows.map(r => ({ ...r })) : []))
    const { postsCommunityExport } = await import('../server/utils/postsCommunityExport')
    const result = await postsCommunityExport(event)

    expect(result.posts).toHaveLength(2)
    expect(result.posts[0]).toMatchObject({ id: 'p-1', status: 'deleted', title: null, body: '', authorName: '', pollOptions: null })
    expect(JSON.stringify(result.posts[0])).not.toContain('Mein')
    expect(result.posts[1]).toMatchObject({ id: 'p-2', title: 'Sichtbar', body: 'Bleibt' })
  })
})
