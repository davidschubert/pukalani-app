import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { Permission, Role } from 'node-appwrite'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeDoor, type FakeRow, fakeDoor, runDoorRoute } from '../../core/tests/support/doorFake'
import { listAllRows } from '../../core/server/utils/listAllRows'
import { COMMENTS_TABLE } from '../shared/types/comment'

/**
 * SEC-032 — „Gelöschte Kommentare, Übersetzungen und Vorschauen werden
 * wirklich geleert" (Davids Entscheidung). Bis hierher setzte das eigene
 * Löschen nur `status: 'deleted'`: Text, Name, Konto-Id und der
 * Übersetzungs-Cache blieben in der Zeile, lesbar direkt bei Appwrite und
 * über Realtime, und die Liste schickte Übersetzung und `$permissions`
 * (darin `update("user:<id>")` — der Autor) mit.
 *
 * Geprüft wird die GESPEICHERTE Zeile, nicht nur die Antwort: eine Antwort
 * ohne Text bewiese nur, dass die Route ihn versteckt.
 */

vi.mock('../server/utils/commentReactions', () => ({
  allowedCommentReactionsFor: () => [],
  loadCommentReactionSummary: async () => ({}),
}))

const MEMBER = 'u-member'
const readAny = Permission.read(Role.any())

function comment(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    $id: 'k-1',
    $createdAt: '2026-11-10T00:00:00.000Z',
    $updatedAt: '2026-11-10T00:00:00.000Z',
    communityId: 'c-a',
    targetType: 'post',
    targetId: 'p-1',
    targetUrl: '/feed',
    parentId: null,
    rootId: null,
    depth: 0,
    content: 'Mein geheimer Text',
    authorId: MEMBER,
    authorName: 'Autorin',
    authorKind: 'user',
    editedAt: '2026-11-11T00:00:00.000Z',
    translations: JSON.stringify({ en: 'My secret text' }),
    status: 'active',
    upvotes: 2,
    downvotes: 0,
    score: 2,
    $permissions: [readAny, Permission.update(Role.user(MEMBER)), Permission.delete(Role.user(MEMBER))],
    ...overrides,
  }
}

/** Die Tür des Prüfstands kennt `updatePermissions` nicht — hier ergänzt, mit Protokoll. */
function withPermissionWrites(door: FakeDoor) {
  const permissionWrites: { handle: string, id: string, permissions: string[] }[] = []
  const tenantDb = (event: H3Event, options?: { as?: 'member' | 'operator', actor?: string }) => {
    const handle = door.tenantDb(event, options)
    return {
      ...handle,
      async updatePermissions(table: string, id: string, permissions: string[]) {
        permissionWrites.push({ handle: options?.as ?? 'member', id, permissions })
        const row = (door.rows[table] ?? []).find(r => r.$id === id)
        if (!row) throw Object.assign(new Error('Not found'), { status: 404 })
        row.$permissions = permissions
        return { ...row }
      },
    }
  }
  return { tenantDb, permissionWrites }
}

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

const loadDelete = () => import('../server/api/comments/[id].delete')
const loadPatch = () => import('../server/api/comments/[id].patch')
const loadList = () => import('../server/api/comments/index.get')

describe('DELETE /api/comments/:id — der Grabstein ist leer, auch in der Datenbank', () => {
  it('Text, Name, Konto-Id, Übersetzung und Bearbeitungsmarke sind aus der gespeicherten Zeile weg', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment(), comment({ $id: 'k-2', content: 'Bleibt' })] } })
    const { tenantDb, permissionWrites } = withPermissionWrites(door)
    const run = await runDoorRoute(loadDelete, {
      door, params: { id: 'k-1' },
      globals: { tenantDb, assertNotMaintenance: async () => {}, removeActivitiesForObject },
    })

    expect(run.status).toBe(200)
    const stored = door.rows[COMMENTS_TABLE]!.find(r => r.$id === 'k-1')!
    expect(stored).toMatchObject({ status: 'deleted', content: '', authorName: '', authorId: '', translations: '', editedAt: null })
    // Der Platzhalter BLEIBT im Faden (Antworten darunter hängen an ihm) …
    expect(stored.parentId).toBeNull()
    // … und behält sein Publikum, verliert aber die Rechte des Autors.
    expect(stored.$permissions).toEqual([readAny])
    // Text und Rechte schreibt der Server (Operator-Klinke) — seit SEC-002
    // belegt die Route die Urheberschaft selbst, nicht mehr ein Schreibvorgang
    // mit der Sitzung des Kontos (Proben dazu: server-writes.test.ts).
    expect(permissionWrites).toEqual([{ handle: 'operator', id: 'k-1', permissions: [readAny] }])
    expect(door.calls.filter(c => c.method === 'update').map(c => c.handle)).toEqual(['operator'])

    // Der Feed-Eintrag mit dem Schnappschuss des Textes geht mit.
    expect(removeActivitiesForObject).toHaveBeenCalledWith(expect.anything(), { objectType: 'comment', objectId: 'k-1' })

    // Die Antwort trägt weder Text noch Rechte.
    expect(run.body).toMatchObject({ $id: 'k-1', status: 'deleted', content: '', authorId: '' })
    expect(run.body).not.toHaveProperty('translations')
    expect((run.body as { $permissions: string[] }).$permissions).toEqual([])
  })

  it('Gegenprobe: der Nachbar-Kommentar bleibt unberührt', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment(), comment({ $id: 'k-2', content: 'Bleibt' })] } })
    const { tenantDb } = withPermissionWrites(door)
    await runDoorRoute(loadDelete, {
      door, params: { id: 'k-1' },
      globals: { tenantDb, assertNotMaintenance: async () => {}, removeActivitiesForObject },
    })
    const sibling = door.rows[COMMENTS_TABLE]!.find(r => r.$id === 'k-2')!
    expect(sibling).toMatchObject({ status: 'active', content: 'Bleibt', authorId: MEMBER })
    expect(sibling.translations).toBe(JSON.stringify({ en: 'My secret text' }))
  })

  it('ein schon gelöschter Kommentar bleibt 409 — nichts wird ein zweites Mal geschrieben', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment({ status: 'deleted' })] } })
    const { tenantDb, permissionWrites } = withPermissionWrites(door)
    const run = await runDoorRoute(loadDelete, {
      door, params: { id: 'k-1' },
      globals: { tenantDb, assertNotMaintenance: async () => {}, removeActivitiesForObject },
    })
    expect(run.status).toBe(409)
    expect(permissionWrites).toHaveLength(0)
  })
})

describe('GET /api/comments — ein gelöschter Kommentar reist als leerer Platzhalter', () => {
  function listGlobals(door: FakeDoor) {
    return {
      tenantDb: door.tenantDb,
      getQuery: () => ({ targetId: 'p-1', targetType: 'post' }),
      createMicrocache: () => ({ get: () => undefined, set: () => {} }),
      resolveAvatars: async () => new Map<string, string>(),
      resolveFormerMembers: async () => new Set<string>(),
      resolveUserHandles: async () => new Map<string, string>(),
      myOpenReportTargetIds: async () => new Set<string>(),
    }
  }

  it('Bestand (Text noch gespeichert): weder Übersetzung noch Rechte noch Text in der Antwort', async () => {
    const door = fakeDoor({
      rows: { [COMMENTS_TABLE]: [comment({ status: 'deleted' }), comment({ $id: 'k-2', content: 'Aktiv' })] },
    })
    const run = await runDoorRoute(loadList, { door, globals: listGlobals(door) })
    expect(run.status).toBe(200)
    const rows = (run.body as { rows: Record<string, unknown>[] }).rows
    const deleted = rows.find(r => r.$id === 'k-1')!
    expect(deleted).toMatchObject({ status: 'deleted', content: '', authorName: '', authorId: '', targetUrl: null, editedAt: null })
    expect(deleted).not.toHaveProperty('translations')
    expect(deleted).not.toHaveProperty('communityId')
    expect(deleted.$permissions).toEqual([])
    expect(JSON.stringify(deleted)).not.toContain('geheim')
    expect(JSON.stringify(deleted)).not.toContain(MEMBER)

    // Gegenprobe: der aktive Kommentar behält Text und Übersetzung — nur die
    // Rechte-Liste fehlt auch ihm (sie verriete den Autor ohnehin, und die
    // Oberfläche liest sie nicht).
    const active = rows.find(r => r.$id === 'k-2')!
    expect(active).toMatchObject({ content: 'Aktiv', authorId: MEMBER })
    expect(active.translations).toBe(JSON.stringify({ en: 'My secret text' }))
    expect(active.$permissions).toEqual([])
  })
})

describe('PATCH /api/comments/:id — der Feed-Schnappschuss folgt dem Text', () => {
  it('echte Änderung ⇒ Snippet des Feed-Eintrags wird nachgezogen', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment()] } })
    const run = await runDoorRoute(loadPatch, {
      door, params: { id: 'k-1' }, body: { content: 'Neuer Text' },
      globals: { updateActivitySnippetForObject },
    })
    expect(run.status).toBe(200)
    expect(updateActivitySnippetForObject).toHaveBeenCalledWith(expect.anything(), 'comment', 'k-1', 'Neuer Text')
  })

  it('Gegenprobe: Speichern ohne Änderung fasst den Feed nicht an', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment()] } })
    await runDoorRoute(loadPatch, {
      door, params: { id: 'k-1' }, body: { content: 'Mein geheimer Text' },
      globals: { updateActivitySnippetForObject },
    })
    expect(updateActivitySnippetForObject).not.toHaveBeenCalled()
  })
})

describe('commentsDeleteUserData — die Kontolöschung schreibt denselben Grabstein', () => {
  it('leert auch den Übersetzungs-Cache und nimmt nur die Rechte des Autors', async () => {
    const updates: { rowId: string, data: Record<string, unknown>, permissions: string[] }[] = []
    const stored = [comment({ authorId: 'u1', $permissions: [readAny, Permission.update(Role.user('u1')), Permission.delete(Role.user('u1'))] })]
    const tablesDB = {
      listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
        if (tableId !== COMMENTS_TABLE) return { total: 0, rows: [] }
        const userId = (JSON.parse(queries[0]!) as { values: string[] }).values[0]
        const rows = stored.filter(r => r.authorId === userId)
        return { total: rows.length, rows }
      }),
      updateRow: vi.fn(async (args: { rowId: string, data: Record<string, unknown>, permissions: string[] }) => {
        updates.push(args)
        return {}
      }),
      deleteRow: vi.fn(async () => {}),
    }
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
    vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
    vi.stubGlobal('listAllRows', listAllRows)
    vi.stubGlobal('removeActivitiesForObject', removeActivitiesForObject)

    const { commentsDeleteUserData } = await import('../server/utils/userDataContributor')
    await commentsDeleteUserData({ context: {} } as unknown as H3Event, 'u1')

    expect(updates).toHaveLength(1)
    expect(updates[0]!.data).toMatchObject({ status: 'deleted', content: '', authorName: '', authorId: '', translations: '', editedAt: null })
    expect(updates[0]!.permissions).toEqual([readAny])
  })
})

describe('commentsCommunityExport — gelöschte Kommentare als Platzhalter ohne Text', () => {
  it('Faden-Struktur bleibt, Text, Name und Bearbeitungsmarke nicht', async () => {
    const rows = [
      comment({ status: 'deleted' }),
      comment({ $id: 'k-2', parentId: 'k-1', rootId: 'k-1', depth: 1, content: 'Antwort' }),
    ]
    vi.stubGlobal('tenantDb', () => ({ count: async () => 0 }))
    vi.stubGlobal('collectTenantRows', async () => rows.map(r => ({ ...r })))
    const { commentsCommunityExport } = await import('../server/utils/commentsCommunityExport')
    const result = await commentsCommunityExport({ context: {} } as unknown as H3Event)

    expect(result.comments).toHaveLength(2)
    expect(result.comments[0]).toMatchObject({ id: 'k-1', status: 'deleted', content: '', authorName: '', editedAt: null, parentId: null })
    expect(JSON.stringify(result.comments[0])).not.toContain('geheim')
    // Gegenprobe: die Antwort darunter behält Text und Platz im Baum.
    expect(result.comments[1]).toMatchObject({ id: 'k-2', content: 'Antwort', parentId: 'k-1' })
  })
})
