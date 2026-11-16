import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { Permission, Role } from 'node-appwrite'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeDoor, type FakeRow, fakeDoor, runDoorRoute } from '../../core/tests/support/doorFake'
import { COMMENTS_TABLE } from '../shared/types/comment'

/**
 * SEC-002 (GA1 P13) — „Kommentare schreibt künftig nur noch unser Server."
 *
 * Bis hierher schrieben Anlegen, Bearbeiten und Löschen mit der Sitzung des
 * Kontos; ob jemand der Autor ist, prüfte beim Bearbeiten und Löschen allein
 * das Zeilen-Recht der Datenbank. Jetzt schreibt der Server — und die Route
 * muss die Frage selbst stellen. Geprüft wird deshalb zweierlei:
 *  - WIE geschrieben wird (jede Schreibstelle über die Operator-Klinke, neue
 *    Zeilen nur mit Leserechten);
 *  - dass ein FREMDES Konto nichts ändert und nichts löscht, obwohl die
 *    nachgebaute Tür (wie der Admin-Client) jeden Schreibvorgang annähme.
 */

vi.mock('../server/utils/commentReactions', () => ({
  allowedCommentReactionsFor: () => [],
  loadCommentReactionSummary: async () => ({}),
}))

const MEMBER = 'u-member'
const OTHER = 'u-other'
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
    content: 'Ursprünglicher Text',
    authorId: MEMBER,
    authorName: 'Autorin',
    authorKind: 'user',
    editedAt: null,
    translations: '',
    status: 'active',
    upvotes: 0,
    downvotes: 0,
    score: 0,
    $permissions: [readAny],
    ...overrides,
  }
}

/** Die Tür des Prüfstands, mit Protokoll der Rechte beim Anlegen und Umrechten. */
function recordingDoor(door: FakeDoor) {
  const created: { handle: string, actor?: string, table: string, permissions?: string[] }[] = []
  const permissionWrites: { handle: string, id: string, permissions: string[] }[] = []
  const tenantDb = (event: H3Event, options?: { as?: 'member' | 'operator', actor?: string }) => {
    const handle = door.tenantDb(event, options) as { create: (t: string, d: Record<string, unknown>) => Promise<FakeRow> }
    return {
      ...handle,
      async create(table: string, data: Record<string, unknown>, createOptions?: { permissions?: string[] }) {
        created.push({ handle: options?.as ?? 'member', actor: options?.actor, table, permissions: createOptions?.permissions })
        return handle.create(table, data)
      },
      async updatePermissions(table: string, id: string, permissions: string[]) {
        permissionWrites.push({ handle: options?.as ?? 'member', id, permissions })
        const row = (door.rows[table] ?? []).find(r => r.$id === id)
        if (!row) throw Object.assign(new Error('Not found'), { status: 404 })
        row.$permissions = permissions
        return { ...row }
      },
    }
  }
  return { tenantDb, created, permissionWrites }
}

const WRITES = ['create', 'update', 'remove', 'increment', 'decrement']
const sessionWrites = (door: FakeDoor) => door.calls.filter(c => c.handle === 'member' && WRITES.includes(c.method))
const anyWrites = (door: FakeDoor) => door.calls.filter(c => WRITES.includes(c.method))

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

const loadCreate = () => import('../server/api/comments/index.post')
const loadPatch = () => import('../server/api/comments/[id].patch')
const loadDelete = () => import('../server/api/comments/[id].delete')
const removeActivitiesForObject = async () => 0
const updateActivitySnippetForObject = async () => 0

describe('POST /api/comments — der Server legt an, die Zeile trägt nur Leserechte', () => {
  it('angelegt über die Operator-Klinke, gehandelt hat ein Mitglied', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [] } })
    const { tenantDb, created } = recordingDoor(door)
    const run = await runDoorRoute(loadCreate, {
      door,
      body: { targetType: 'post', targetId: 'p-1', content: 'Hallo', targetUrl: '/feed' },
      globals: { tenantDb, withPublishedRead: (base: string[]) => [...base, readAny] },
    })
    expect(run.status).toBe(200)
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ handle: 'operator', actor: 'member', table: COMMENTS_TABLE })
    // Nur Leserechte — kein `update`/`delete` für irgendwen.
    expect(created[0]!.permissions).toEqual([readAny])
    expect(sessionWrites(door)).toEqual([])
    // Autor ist das angemeldete Konto, egal was der Body sagt.
    expect(door.rows[COMMENTS_TABLE]![0]).toMatchObject({ authorId: MEMBER, status: 'active' })
  })

  it('Autor, Zähler und Zustand kommen vom Server, nicht aus der Anfrage', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [] } })
    const { tenantDb } = recordingDoor(door)
    await runDoorRoute(loadCreate, {
      door,
      body: { targetType: 'post', targetId: 'p-1', content: 'Hallo', authorId: OTHER, score: 99, status: 'hidden', depth: 7 },
      globals: { tenantDb },
    })
    expect(door.rows[COMMENTS_TABLE]![0]).toMatchObject({ authorId: MEMBER, score: 0, status: 'active', depth: 0 })
  })
})

describe('PATCH /api/comments/:id — nur der Autor, geprüft von der Route', () => {
  it('der Autor ändert seinen Kommentar; geschrieben wird über die Operator-Klinke', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment()] } })
    const run = await runDoorRoute(loadPatch, {
      door, params: { id: 'k-1' }, body: { content: 'Neuer Text' },
      globals: { updateActivitySnippetForObject },
    })
    expect(run.status).toBe(200)
    expect(door.rows[COMMENTS_TABLE]![0]!.content).toBe('Neuer Text')
    expect(sessionWrites(door)).toEqual([])
    expect(anyWrites(door).map(c => c.handle)).toEqual(['operator'])
    // Gelesen wird weiter zuerst über die Mitglieder-Klinke (Leserecht der Zeile).
    expect(door.calls[0]).toMatchObject({ handle: 'member', method: 'get', table: COMMENTS_TABLE })
  })

  it('ein fremdes Konto bekommt 403 — und es wird NICHTS geschrieben', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment({ authorId: OTHER })] } })
    const run = await runDoorRoute(loadPatch, {
      door, params: { id: 'k-1' }, body: { content: 'Übernommen' },
      globals: { updateActivitySnippetForObject },
    })
    expect(run.status).toBe(403)
    expect(door.rows[COMMENTS_TABLE]![0]!.content).toBe('Ursprünglicher Text')
    expect(anyWrites(door)).toEqual([])
  })

  it('ein Gast-Kommentar (ohne Konto) gehört niemandem: 403, nichts geschrieben', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment({ authorId: '', authorKind: 'guest' })] } })
    const run = await runDoorRoute(loadPatch, {
      door, params: { id: 'k-1' }, body: { content: 'Übernommen' },
      globals: { updateActivitySnippetForObject },
    })
    expect(run.status).toBe(403)
    expect(anyWrites(door)).toEqual([])
  })

  it('was das Konto nicht lesen darf, gibt es nicht: 404, nichts geschrieben', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment()] }, readable: () => false })
    const run = await runDoorRoute(loadPatch, {
      door, params: { id: 'k-1' }, body: { content: 'Neuer Text' },
      globals: { updateActivitySnippetForObject },
    })
    expect(run.status).toBe(404)
    expect(anyWrites(door)).toEqual([])
  })

  it('ein ausgeblendeter eigener Kommentar bleibt gesperrt (409)', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment({ status: 'hidden' })] } })
    const run = await runDoorRoute(loadPatch, {
      door, params: { id: 'k-1' }, body: { content: 'Neuer Text' },
      globals: { updateActivitySnippetForObject },
    })
    expect(run.status).toBe(409)
    expect(anyWrites(door)).toEqual([])
  })
})

describe('DELETE /api/comments/:id — nur der Autor, geprüft von der Route', () => {
  const globals = (tenantDb: unknown) => ({ tenantDb, assertNotMaintenance: async () => {}, removeActivitiesForObject })

  it('der Autor löscht; Daten und Rechte schreibt der Server', async () => {
    const legacy = [readAny, Permission.update(Role.user(MEMBER)), Permission.delete(Role.user(MEMBER))]
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment({ $permissions: legacy })] } })
    const { tenantDb, permissionWrites } = recordingDoor(door)
    const run = await runDoorRoute(loadDelete, { door, params: { id: 'k-1' }, globals: globals(tenantDb) })
    expect(run.status).toBe(200)
    expect(door.rows[COMMENTS_TABLE]![0]).toMatchObject({ status: 'deleted', content: '', authorId: '' })
    expect(sessionWrites(door)).toEqual([])
    // Bestand mit alten Schreibrechten: sie fallen beim Löschen, das Publikum bleibt.
    expect(permissionWrites).toEqual([{ handle: 'operator', id: 'k-1', permissions: [readAny] }])
  })

  it('eine Zeile ohne alte Schreibrechte braucht keinen zweiten Schreibvorgang', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment()] } })
    const { tenantDb, permissionWrites } = recordingDoor(door)
    const run = await runDoorRoute(loadDelete, { door, params: { id: 'k-1' }, globals: globals(tenantDb) })
    expect(run.status).toBe(200)
    expect(permissionWrites).toEqual([])
    expect(door.rows[COMMENTS_TABLE]![0]!.$permissions).toEqual([readAny])
  })

  it('ein fremdes Konto bekommt 403 — der Kommentar bleibt unberührt', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment({ authorId: OTHER })] } })
    const { tenantDb, permissionWrites } = recordingDoor(door)
    const run = await runDoorRoute(loadDelete, { door, params: { id: 'k-1' }, globals: globals(tenantDb) })
    expect(run.status).toBe(403)
    expect(door.rows[COMMENTS_TABLE]![0]).toMatchObject({ status: 'active', content: 'Ursprünglicher Text', authorId: OTHER })
    expect(anyWrites(door)).toEqual([])
    expect(permissionWrites).toEqual([])
  })

  it('ein Gast-Kommentar lässt sich nicht selbst löschen (403)', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment({ authorId: '', authorKind: 'guest' })] } })
    const { tenantDb } = recordingDoor(door)
    const run = await runDoorRoute(loadDelete, { door, params: { id: 'k-1' }, globals: globals(tenantDb) })
    expect(run.status).toBe(403)
    expect(anyWrites(door)).toEqual([])
  })
})
