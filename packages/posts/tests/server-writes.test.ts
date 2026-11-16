import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { Permission, Role } from 'node-appwrite'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeDoor, type FakeRow, fakeDoor, runDoorRoute } from '../../core/tests/support/doorFake'
import { POSTS_TABLE } from '../shared/types/post'

/**
 * SEC-002 (GA1 P13) — „Beiträge schreibt künftig nur noch unser Server."
 *
 * Anlegen und das Bearbeiten durch den Autor liefen bis hierher mit der
 * Sitzung des Kontos. Jetzt schreibt der Server; wer darf, entscheidet allein
 * die Route. Geprüft wird, WIE geschrieben wird (Operator-Klinke, neue Zeilen
 * nur mit Leserechten) und dass ein fremdes Konto nichts ändert und nichts
 * löscht, obwohl die nachgebaute Tür jeden Schreibvorgang annähme.
 */

const MEMBER = 'u-member'
const OTHER = 'u-other'
const readAny = Permission.read(Role.any())

function post(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    $id: 'p-1',
    $createdAt: '2026-11-10T00:00:00.000Z',
    $updatedAt: '2026-11-10T00:00:00.000Z',
    communityId: 'c-a',
    type: 'text',
    title: 'Mein Titel',
    body: 'Mein Text',
    authorId: MEMBER,
    authorName: 'Autorin',
    status: 'published',
    categoryId: null,
    pinned: false,
    closed: false,
    solved: false,
    $permissions: [readAny],
    ...overrides,
  }
}

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
        const row = (door.rows[table] ?? []).find(r => r.$id === id)!
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

const loadCreate = () => import('../server/api/posts/index.post')
const loadPatch = () => import('../server/api/posts/[id].patch')
const loadDelete = () => import('../server/api/posts/[id].delete')

function createGlobals(tenantDb: unknown) {
  return {
    tenantDb,
    resolveCategoryId: async () => '',
    withPublishedRead: (base: string[]) => [...base, readAny],
    ensureAccountHandle: async () => {},
    ensureAccountHandleAudience: async () => {},
    notifyPostMentions: async () => {},
    syncTopicLinks: async () => ({ added: 0, removed: 0 }),
  }
}

const editGlobals = {
  updateActivitySnippetForObject: async () => 0,
  syncTopicLinks: async () => ({ added: 0, removed: 0 }),
}

describe('POST /api/posts — der Server legt an, die Zeile trägt nur Leserechte', () => {
  it('veröffentlicht: Operator-Klinke, gehandelt hat ein Mitglied, nur das Lese-Publikum', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [] } })
    const { tenantDb, created } = recordingDoor(door)
    const run = await runDoorRoute(loadCreate, {
      door, body: { type: 'post', title: 'Titel', body: 'Text' }, globals: createGlobals(tenantDb),
    })
    expect(run.status).toBe(200)
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ handle: 'operator', actor: 'member', table: POSTS_TABLE })
    expect(created[0]!.permissions).toEqual([readAny])
    expect(sessionWrites(door)).toEqual([])
  })

  it('geplant: nur der Autor liest, weiterhin kein Schreibrecht an der Zeile', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [] } })
    const { tenantDb, created } = recordingDoor(door)
    const run = await runDoorRoute(loadCreate, {
      door,
      body: { type: 'post', title: 'Titel', body: 'Text', scheduledAt: new Date(Date.now() + 86_400_000).toISOString() },
      globals: createGlobals(tenantDb),
    })
    expect(run.status).toBe(200)
    expect(created[0]!.permissions).toEqual([Permission.read(Role.user(MEMBER))])
  })

  it('Autor, Zähler und Zustände kommen vom Server, nicht aus der Anfrage', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [] } })
    const { tenantDb } = recordingDoor(door)
    await runDoorRoute(loadCreate, {
      door,
      body: { type: 'post', title: 'Titel', body: 'Text', authorId: OTHER, pinned: true, score: 99, status: 'hidden' },
      globals: createGlobals(tenantDb),
    })
    expect(door.rows[POSTS_TABLE]![0]).toMatchObject({ authorId: MEMBER, pinned: false, score: 0, status: 'published' })
  })
})

describe('PATCH /api/posts/:id — der Autor schreibt über den Server, Fremde gar nicht', () => {
  it('der Autor ändert seinen Beitrag über die Operator-Klinke', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post()] } })
    const run = await runDoorRoute(loadPatch, {
      door, params: { id: 'p-1' }, body: { title: 'Neuer Titel', body: 'Mein Text' }, globals: editGlobals,
    })
    expect(run.status).toBe(200)
    expect(door.rows[POSTS_TABLE]![0]!.title).toBe('Neuer Titel')
    expect(sessionWrites(door)).toEqual([])
    expect(anyWrites(door).map(c => c.handle)).toEqual(['operator'])
    expect(door.calls[0]).toMatchObject({ handle: 'member', method: 'get', table: POSTS_TABLE })
  })

  it('ein fremdes Mitglied ohne Stufen-Recht bekommt 403 — nichts wird geschrieben', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post({ authorId: OTHER })] } })
    const run = await runDoorRoute(loadPatch, {
      door, params: { id: 'p-1' }, body: { title: 'Übernommen', body: 'Übernommen' }, globals: editGlobals,
    })
    expect(run.status).toBe(403)
    expect(door.rows[POSTS_TABLE]![0]).toMatchObject({ title: 'Mein Titel', body: 'Mein Text' })
    expect(anyWrites(door)).toEqual([])
  })

  it('ein entleerter Beitrag (ohne Autor) gehört niemandem: 403', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post({ authorId: '' })] } })
    const run = await runDoorRoute(loadPatch, {
      door, params: { id: 'p-1' }, body: { title: 'Übernommen', body: 'Übernommen' }, globals: editGlobals,
    })
    expect(run.status).toBe(403)
    expect(anyWrites(door)).toEqual([])
  })
})

describe('DELETE /api/posts/:id — der Grabstein trägt nur noch das Leserecht des Autors', () => {
  const globals = (tenantDb: unknown) => ({
    tenantDb, removeActivitiesForObject: async () => 0, removePostMentionNotifications: async () => 0,
  })

  it('der Autor löscht; die Zeile behält kein Schreibrecht', async () => {
    const legacy = [readAny, Permission.update(Role.user(MEMBER)), Permission.delete(Role.user(MEMBER))]
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post({ $permissions: legacy })] } })
    const { tenantDb, permissionWrites } = recordingDoor(door)
    const run = await runDoorRoute(loadDelete, { door, params: { id: 'p-1' }, globals: globals(tenantDb) })
    expect(run.status).toBe(200)
    expect(door.rows[POSTS_TABLE]![0]!.status).toBe('deleted')
    expect(permissionWrites).toEqual([{ handle: 'operator', id: 'p-1', permissions: [Permission.read(Role.user(MEMBER))] }])
    expect(sessionWrites(door)).toEqual([])
  })

  it('ein fremdes Konto bekommt 403 — der Beitrag bleibt unberührt', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post({ authorId: OTHER })] } })
    const { tenantDb, permissionWrites } = recordingDoor(door)
    const run = await runDoorRoute(loadDelete, { door, params: { id: 'p-1' }, globals: globals(tenantDb) })
    expect(run.status).toBe(403)
    expect(door.rows[POSTS_TABLE]![0]!.status).toBe('published')
    expect(anyWrites(door)).toEqual([])
    expect(permissionWrites).toEqual([])
  })
})
