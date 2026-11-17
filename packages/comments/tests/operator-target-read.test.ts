import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { Permission, Role } from 'node-appwrite'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeDoor, type FakeRow, fakeDoor, runDoorRoute } from '../../core/tests/support/doorFake'
import { COMMENTS_TABLE } from '../shared/types/comment'

/**
 * BE-020 (2) — „Interne Kommentare bleiben intern."
 *
 * Kommentare an Betreiber-Zielen (`pukalani.comments.operatorTargets`, z. B.
 * `ticket`) tragen beim Anlegen NUR die Leserechte für Betreiber. Das
 * Wiederherstellen setzte bis hierher immer das Publikums-Leserecht — nach
 * Ausblenden und Wiederherstellen war ein interner Kommentar für jeden lesbar.
 * Seither leitet EINE Funktion das Leserecht aus der Art des Ziels ab; geprüft
 * wird sie an allen drei Stellen: Anlegen, Wiederherstellen einzeln, in der
 * Sammel-Aktion.
 */

vi.mock('../server/utils/commentReactions', () => ({
  allowedCommentReactionsFor: () => [],
  loadCommentReactionSummary: async () => ({}),
}))

const readAny = Permission.read(Role.any())
const readMembers = Permission.read(Role.label('c-a'))
const readAdmin = Permission.read(Role.label('admin'))
const readModerator = Permission.read(Role.label('moderator'))
/** Ein fremdes, unbeteiligtes Recht an der Zeile — es darf nicht verloren gehen. */
const readAuthor = Permission.read(Role.user('u-member'))

/** Die öffentliche Community des Prüfstands: „veröffentlicht" heißt `read(any)`. */
const audience = {
  withoutPublishedRead: (permissions: readonly string[]) => permissions.filter(p => p !== readAny && p !== readMembers),
  withPublishedRead: (permissions: readonly string[]) => [...permissions.filter(p => p !== readAny && p !== readMembers), readAny],
}

const operatorConfig = { useAppConfig: () => ({ pukalani: { comments: { operatorTargets: ['ticket'] } } }) }

function comment(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    $id: 'k-1',
    communityId: 'c-a',
    targetType: 'post',
    targetId: 'p-1',
    parentId: null,
    rootId: null,
    depth: 0,
    content: 'Text',
    authorId: 'u-member',
    authorName: 'Autorin',
    status: 'hidden',
    $permissions: [],
    ...overrides,
  }
}

/** Tür mit `updatePermissions` (die nachgebaute kennt es nicht) und Protokoll. */
function permissionDoor(door: FakeDoor) {
  const created: { permissions?: string[] }[] = []
  const tenantDb = (event: H3Event, options?: { as?: 'member' | 'operator', actor?: string }) => {
    const handle = door.tenantDb(event, options) as { create: (t: string, d: Record<string, unknown>) => Promise<FakeRow> }
    return {
      ...handle,
      async create(table: string, data: Record<string, unknown>, createOptions?: { permissions?: string[] }) {
        created.push({ permissions: createOptions?.permissions })
        return handle.create(table, data)
      },
      async updatePermissions(table: string, id: string, permissions: string[]) {
        const row = (door.rows[table] ?? []).find(r => r.$id === id)
        if (!row) throw Object.assign(new Error('Not found'), { status: 404 })
        row.$permissions = permissions
        return { ...row }
      },
    }
  }
  return { tenantDb, created }
}

const moderationGlobals = {
  ...audience,
  ...operatorConfig,
  requireCommunityPermission: async () => ({ user: { $id: 'u-mod' } }),
  recordAudit: async () => {},
  resolveReportsForTarget: async () => 0,
  hideCommentRow: async () => { throw new Error('nicht erwartet') },
  hideCommentDescendants: async () => {},
}

const loadStatus = () => import('../server/api/admin/comments/[id]/status.patch')
const loadBulk = () => import('../server/api/admin/comments/bulk.post')
const loadCreate = () => import('../server/api/comments/index.post')

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

const rowOf = (door: FakeDoor, id = 'k-1') => door.rows[COMMENTS_TABLE]!.find(r => r.$id === id)!

describe('Wiederherstellen einzeln (PATCH /api/admin/comments/:id/status)', () => {
  it('BE-020: ein Ticket-Kommentar bleibt intern — kein read(any), kein Publikums-Label, Betreiber-Leserechte bleiben', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment({ targetType: 'ticket', $permissions: [readAdmin, readModerator, readAuthor] })] } })
    const { tenantDb } = permissionDoor(door)
    const run = await runDoorRoute(loadStatus, { door, params: { id: 'k-1' }, body: { status: 'active' }, globals: { ...moderationGlobals, tenantDb } })

    expect(run.status).toBe(200)
    const permissions = rowOf(door).$permissions as string[]
    expect(permissions).not.toContain(readAny)
    expect(permissions).not.toContain(readMembers)
    expect(permissions).toEqual(expect.arrayContaining([readAdmin, readModerator, readAuthor]))
    expect(rowOf(door).status).toBe('active')
  })

  it('BE-020: ein Ticket-Kommentar mit altem Publikums-Recht verliert es und bekommt die Betreiber-Leserechte', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment({ targetType: 'ticket', $permissions: [readAny, readAuthor] })] } })
    const { tenantDb } = permissionDoor(door)
    await runDoorRoute(loadStatus, { door, params: { id: 'k-1' }, body: { status: 'active' }, globals: { ...moderationGlobals, tenantDb } })

    const permissions = rowOf(door).$permissions as string[]
    expect(permissions).not.toContain(readAny)
    expect(permissions).toEqual(expect.arrayContaining([readAdmin, readModerator, readAuthor]))
  })

  it('ein Community-Kommentar bekommt weiter das Publikum der Community', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment({ $permissions: [] })] } })
    const { tenantDb } = permissionDoor(door)
    const run = await runDoorRoute(loadStatus, { door, params: { id: 'k-1' }, body: { status: 'active' }, globals: { ...moderationGlobals, tenantDb } })

    expect(run.status).toBe(200)
    expect(rowOf(door).$permissions).toEqual([readAny])
  })
})

describe('Wiederherstellen in der Sammel-Aktion (POST /api/admin/comments/bulk)', () => {
  it('BE-020: Ticket-Kommentar bleibt intern, Community-Kommentar wird wieder öffentlich', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [
      comment({ $id: 'k-ticket', targetType: 'ticket', $permissions: [readAdmin, readModerator] }),
      comment({ $id: 'k-post', $permissions: [] }),
    ] } })
    const { tenantDb } = permissionDoor(door)
    const run = await runDoorRoute(loadBulk, { door, body: { action: 'restore', ids: ['k-ticket', 'k-post'] }, globals: { ...moderationGlobals, tenantDb } })

    expect(run.status).toBe(200)
    expect(run.body).toMatchObject({ ok: true, failed: [] })
    const ticket = rowOf(door, 'k-ticket').$permissions as string[]
    expect(ticket).not.toContain(readAny)
    expect(ticket).not.toContain(readMembers)
    expect(ticket).toEqual(expect.arrayContaining([readAdmin, readModerator]))
    expect(rowOf(door, 'k-post').$permissions).toEqual([readAny])
  })
})

describe('Anlegen (POST /api/comments) — dieselben Rechte wie vorher', () => {
  it('Betreiber-Ziel: genau die zwei Betreiber-Leserechte', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [] } })
    const { tenantDb, created } = permissionDoor(door)
    const run = await runDoorRoute(loadCreate, {
      door,
      body: { targetType: 'ticket', targetId: 't-1', content: 'Intern' },
      globals: { ...audience, ...operatorConfig, tenantDb, requirePermission: () => {} },
    })

    expect(run.status).toBe(200)
    expect(created[0]!.permissions).toEqual([readAdmin, readModerator])
  })

  it('Community-Ziel: das Publikum der Community', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [] } })
    const { tenantDb, created } = permissionDoor(door)
    const run = await runDoorRoute(loadCreate, {
      door,
      body: { targetType: 'post', targetId: 'p-1', content: 'Hallo' },
      globals: { ...audience, ...operatorConfig, tenantDb },
    })

    expect(run.status).toBe(200)
    expect(created[0]!.permissions).toEqual([readAny])
  })
})
