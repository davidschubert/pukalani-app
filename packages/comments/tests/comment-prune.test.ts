import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { Permission, Role } from 'node-appwrite'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeDoor, type FakeRow, fakeDoor, runDoorRoute } from '../../core/tests/support/doorFake'
import { COMMENTS_TABLE, type Comment } from '../shared/types/comment'

/**
 * KC2 — gelöscht OHNE Antworten ⇒ ganz weg; MIT Antworten bleibt der
 * Platzhalter. Geprüft wird die GESPEICHERTE Tabelle (was übrig bleibt, zählen
 * `count.get`/`counts.get`: alles außer `hidden`) und die Antwort der Route
 * (`removedIds`, daraus räumt der Browser die Liste).
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
    content: 'Text',
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

const reply = (id: string, parentId: string, overrides: Partial<FakeRow> = {}) =>
  comment({ $id: id, parentId, rootId: parentId, depth: 1, authorId: OTHER, ...overrides })

/** Die Tür des Prüfstands kennt `updatePermissions` nicht — hier ergänzt. */
function withPermissionWrites(door: FakeDoor) {
  return (event: H3Event, options?: { as?: 'member' | 'operator', actor?: string }) => ({
    ...door.tenantDb(event, options),
    async updatePermissions(table: string, id: string, permissions: string[]) {
      const row = (door.rows[table] ?? []).find(r => r.$id === id)!
      row.$permissions = permissions
      return { ...row }
    },
  })
}

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

const loadDelete = () => import('../server/api/comments/[id].delete')

async function deleteAs(rows: FakeRow[], options: { id?: string, openReports?: string[] } = {}) {
  const door = fakeDoor({ rows: { [COMMENTS_TABLE]: rows } })
  const run = await runDoorRoute(loadDelete, {
    door,
    params: { id: options.id ?? 'k-1' },
    globals: {
      tenantDb: withPermissionWrites(door),
      assertNotMaintenance: async () => {},
      removeActivitiesForObject: async () => 0,
      removeObjectNotifications: async () => 0,
      openReportsForTarget: async (_e: unknown, _t: string, id: string) => (options.openReports ?? []).includes(id) ? [{ $id: 'r-1' }] : [],
    },
  })
  const stored = door.rows[COMMENTS_TABLE] ?? []
  const counted = stored.filter(r => r.status !== 'hidden').length
  return { run, stored, counted, body: run.body as { removedIds?: string[], status?: string } }
}

describe('DELETE /api/comments/:id — ohne Antworten ganz weg', () => {
  it('ohne Antworten: Zeile weg, removedIds nennt sie, der Zähler sinkt', async () => {
    const { run, stored, counted, body } = await deleteAs([comment(), comment({ $id: 'k-2', authorId: OTHER })])
    expect(run.status).toBe(200)
    expect(stored.map(r => r.$id)).toEqual(['k-2'])
    expect(body.removedIds).toEqual(['k-1'])
    expect(counted).toBe(1)
  })

  it('Gegenprobe: mit Antwort bleibt der Platzhalter (leer), removedIds leer, Zähler zählt ihn', async () => {
    const { stored, counted, body } = await deleteAs([comment(), reply('k-2', 'k-1')])
    expect(stored.find(r => r.$id === 'k-1')).toMatchObject({ status: 'deleted', content: '', authorId: '' })
    expect(body).toMatchObject({ status: 'deleted', removedIds: [] })
    expect(counted).toBe(2)
  })

  it('eine AUSGEBLENDETE Antwort zählt als Antwort (die Moderation kann sie wiederherstellen)', async () => {
    const { stored, body } = await deleteAs([comment(), reply('k-2', 'k-1', { status: 'hidden', $permissions: [] })])
    expect(stored.map(r => r.$id).sort()).toEqual(['k-1', 'k-2'])
    expect(body.removedIds).toEqual([])
  })

  it('offene Meldung: der Platzhalter bleibt für die Moderation', async () => {
    const { stored, body } = await deleteAs([comment()], { openReports: ['k-1'] })
    expect(stored.find(r => r.$id === 'k-1')).toMatchObject({ status: 'deleted' })
    expect(body.removedIds).toEqual([])
  })

  it('letzte Antwort unter einem gelöschten Kommentar: beide fallen', async () => {
    const parent = comment({ $id: 'k-0', status: 'deleted', content: '', authorId: '', authorName: '' })
    const own = comment({ $id: 'k-1', parentId: 'k-0', rootId: 'k-0', depth: 1 })
    const { stored, body, counted } = await deleteAs([parent, own, comment({ $id: 'k-9', authorId: OTHER })])
    expect(body.removedIds).toEqual(['k-1', 'k-0'])
    expect(stored.map(r => r.$id)).toEqual(['k-9'])
    expect(counted).toBe(1)
  })

  it('Gegenprobe: hat der gelöschte Eltern-Kommentar noch eine Antwort, bleibt er', async () => {
    const parent = comment({ $id: 'k-0', status: 'deleted', content: '', authorId: '', authorName: '' })
    const own = comment({ $id: 'k-1', parentId: 'k-0', rootId: 'k-0', depth: 1 })
    const { stored, body } = await deleteAs([parent, own, reply('k-2', 'k-0')])
    expect(body.removedIds).toEqual(['k-1'])
    expect(stored.map(r => r.$id).sort()).toEqual(['k-0', 'k-2'])
  })

  it('ein AKTIVER Eltern-Kommentar bleibt unberührt', async () => {
    const parent = comment({ $id: 'k-0', authorId: OTHER })
    const own = comment({ $id: 'k-1', parentId: 'k-0', rootId: 'k-0', depth: 1 })
    const { stored, body } = await deleteAs([parent, own])
    expect(body.removedIds).toEqual(['k-1'])
    expect(stored.find(r => r.$id === 'k-0')).toMatchObject({ status: 'active', content: 'Text' })
  })
})

describe('pruneDeletedComment — Wettlauf mit einer Antwort', () => {
  it('kommt zwischen Zählen und Löschen eine Antwort, steht der Grabstein mit Id und Rechten wieder da', async () => {
    vi.stubGlobal('logEvent', () => {})
    const { pruneDeletedComment } = await import('../server/utils/commentPrune')
    const tombstone = comment({ status: 'deleted', content: '', authorId: '', authorName: '', $permissions: [readAny] }) as unknown as Comment
    let removed = false
    const created: Array<{ data: Record<string, unknown>, rowId?: string, permissions?: string[] }> = []
    const ops = {
      // Vor dem Löschen: keine Kinder; danach ist eine Antwort da.
      count: async () => (removed ? 1 : 0),
      remove: async () => { removed = true },
      create: async (_t: string, data: Record<string, unknown>, opts: { rowId?: string, permissions?: string[] }) => {
        created.push({ data, ...opts })
        return data
      },
      get: async () => { throw new Error('unused') },
    }
    vi.stubGlobal('tenantDb', () => ops)
    const result = await pruneDeletedComment({} as H3Event, tombstone, async () => false)
    expect(result).toEqual([])
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ rowId: 'k-1', permissions: [readAny], data: { status: 'deleted', content: '', targetId: 'p-1' } })
    expect(Object.keys(created[0]!.data).some(key => key.startsWith('$'))).toBe(false)
  })

  it('Gegenprobe: ohne späte Antwort wird nichts wieder angelegt', async () => {
    vi.stubGlobal('logEvent', () => {})
    const { pruneDeletedComment } = await import('../server/utils/commentPrune')
    const tombstone = comment({ status: 'deleted' }) as unknown as Comment
    const create = vi.fn()
    const ops = { count: async () => 0, remove: async () => {}, create, get: async () => null }
    vi.stubGlobal('tenantDb', () => ops)
    expect(await pruneDeletedComment({} as H3Event, tombstone, async () => false)).toEqual(['k-1'])
    expect(create).not.toHaveBeenCalled()
  })
})
