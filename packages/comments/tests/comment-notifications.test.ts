import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException, Permission, Role } from 'node-appwrite'
import { resetCommunityWorld, TENANT_SCOPE } from '../../core/tests/support/participationHarness'
import { type FakeRow, fakeDoor, runDoorRoute } from '../../core/tests/support/doorFake'
import { listAllRows } from '../../core/server/utils/listAllRows'
import { COMMENTS_TABLE } from '../shared/types/comment'
import { commentNotificationRowId } from '../server/utils/commentNotifications'

/**
 * SEC-032, Rest „Vorschauen werden wirklich geleert": die Meldungen `reply`,
 * `mention` und `reply.guest` tragen im `body` einen Auszug des Kommentars.
 * Nach dem Löschen oder Ausblenden stand er bis hierher weiter in FREMDEN
 * Glocken — die Zeilen ließen sich keinem Kommentar zuordnen (Link = Seite,
 * Row-Id zufällig). Jetzt entstehen sie unter einer festen Id aus
 * (Typ, Community, Kommentar, Empfänger), und genau diese Id wird geräumt.
 *
 * Geprüft wird die GESPEICHERTE Glocke, nicht nur ein Aufruf: jede Räumung
 * hat ihre Gegenprobe (eine Meldung eines ANDEREN Kommentars desselben
 * Absenders bleibt stehen), sonst wäre „alles löschen" auch grün.
 */

const MEMBER = 'u-member'
const PARENT_AUTHOR = 'u-parent'
const MENTIONED = 'u-mentioned'
const readAny = Permission.read(Role.any())

function comment(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    $id: 'k-1',
    $createdAt: '2026-11-10T00:00:00.000Z',
    $updatedAt: '2026-11-10T00:00:00.000Z',
    communityId: TENANT_SCOPE,
    targetType: 'post',
    targetId: 'p-1',
    targetUrl: '/feed',
    parentId: 'k-p',
    rootId: 'k-p',
    depth: 1,
    content: 'Geheimer Auszug',
    authorId: MEMBER,
    authorName: 'Autorin',
    authorKind: 'user',
    editedAt: null,
    translations: '',
    status: 'active',
    upvotes: 0,
    downvotes: 0,
    score: 0,
    $permissions: [readAny, Permission.update(Role.user(MEMBER)), Permission.delete(Role.user(MEMBER))],
    ...overrides,
  }
}

function parentComment(overrides: Partial<FakeRow> = {}): FakeRow {
  return comment({ $id: 'k-p', parentId: null, rootId: null, depth: 0, authorId: PARENT_AUTHOR, content: 'Eltern', ...overrides })
}

interface NotificationRow extends FakeRow {
  recipientId: string
  senderId?: string
  type: string
  body: string
}

function notification(type: string, commentId: string, recipientId: string, senderId?: string): NotificationRow {
  return {
    $id: commentNotificationRowId({ communityId: TENANT_SCOPE, commentId, recipientId, type }),
    recipientId,
    type,
    body: 'Geheimer Auszug',
    ...(senderId ? { senderId } : {}),
  }
}

/** Die Glocke als Tabelle — nur was die Räumung braucht: Filter `equal`, Löschen mit 404. */
function fakeBell(initial: NotificationRow[], options: { failList?: boolean } = {}) {
  const rows = [...initial]
  const tablesDB = {
    listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
      if (options.failList) throw new AppwriteException('Server error', 500, 'general_unknown')
      if (tableId !== 'notifications') return { total: 0, rows: [] }
      const filters = queries.map(q => JSON.parse(q) as { method: string, attribute?: string, values?: unknown[] })
        .filter(q => q.method === 'equal')
      const found = rows.filter(r => filters.every(f => (f.values ?? []).includes(r[f.attribute!])))
      return { total: found.length, rows: found.map(r => ({ ...r })) }
    }),
    deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
      const index = tableId === 'notifications' ? rows.findIndex(r => r.$id === rowId) : -1
      if (index < 0) throw new AppwriteException('Row not found', 404, 'row_not_found')
      rows.splice(index, 1)
    }),
  }
  return { rows, tablesDB }
}

function bellGlobals(bell: ReturnType<typeof fakeBell>, logEvent = vi.fn()) {
  return {
    createAdminClient: () => ({ tablesDB: bell.tablesDB }),
    useRuntimeConfig: () => ({ public: { appwriteDatabaseId: 'main' } }),
    listAllRows,
    logEvent,
  }
}

const removeActivitiesForObject = vi.fn(async () => 0)

beforeEach(() => {
  removeActivitiesForObject.mockClear()
})

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

describe('commentNotificationRowId — eine feste Id je (Typ, Community, Kommentar, Empfänger)', () => {
  const base = { communityId: TENANT_SCOPE, commentId: 'k-1', recipientId: PARENT_AUTHOR, type: 'reply' }

  it('ist stabil und eine gültige Appwrite-Row-Id', () => {
    const id = commentNotificationRowId(base)
    expect(commentNotificationRowId({ ...base })).toBe(id)
    expect(id.length).toBeLessThanOrEqual(36)
    expect(id).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
  })

  it('unterscheidet Empfänger, Typ, Kommentar und Community', () => {
    const id = commentNotificationRowId(base)
    expect(commentNotificationRowId({ ...base, recipientId: MENTIONED })).not.toBe(id)
    expect(commentNotificationRowId({ ...base, type: 'mention' })).not.toBe(id)
    expect(commentNotificationRowId({ ...base, type: 'reply.guest' })).not.toBe(id)
    expect(commentNotificationRowId({ ...base, commentId: 'k-2' })).not.toBe(id)
    expect(commentNotificationRowId({ ...base, communityId: '' })).not.toBe(id)
  })
})

describe('Schreiben — jede Meldung mit Auszug entsteht unter ihrer festen Id', () => {
  it('POST /api/comments: Antwort und Erwähnung tragen die Id aus (Typ, Community, Kommentar, Empfänger)', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [parentComment()] } })
    const notify = vi.fn(async () => ({ created: true }))
    const run = await runDoorRoute(() => import('../server/api/comments/index.post'), {
      door,
      body: { targetType: 'post', targetId: 'p-1', content: 'Hallo @jemand', parentId: 'k-p', targetUrl: '/feed' },
      globals: { notify, resolveMentions: async () => [{ userId: MENTIONED }] },
    })
    expect(run.status).toBe(200)
    const created = (run.body as { $id: string }).$id

    expect(notify).toHaveBeenCalledTimes(2)
    expect(notify).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      type: 'reply',
      recipientId: PARENT_AUTHOR,
      rowId: commentNotificationRowId({ communityId: TENANT_SCOPE, commentId: created, recipientId: PARENT_AUTHOR, type: 'reply' }),
    }))
    expect(notify).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      type: 'mention',
      recipientId: MENTIONED,
      rowId: commentNotificationRowId({ communityId: TENANT_SCOPE, commentId: created, recipientId: MENTIONED, type: 'mention' }),
    }))
  })

  it('POST /api/comments/guest: die Gast-Antwort trägt ihre Id, ohne Absender', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [parentComment()] } })
    const notify = vi.fn(async () => ({ created: true }))
    const run = await runDoorRoute(() => import('../server/api/comments/guest.post'), {
      door,
      who: 'guest',
      body: { targetType: 'post', targetId: 'p-1', content: 'Gast sagt hallo', parentId: 'k-p', targetUrl: '/feed', guestName: 'Gast' },
      globals: {
        notify,
        useAppConfig: () => ({ pukalani: { comments: { embed: { enabled: true, guests: true } } } }),
      },
    })
    expect(run.status).toBe(200)
    const created = (run.body as { $id: string }).$id
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      type: 'reply.guest',
      recipientId: PARENT_AUTHOR,
      rowId: commentNotificationRowId({ communityId: TENANT_SCOPE, commentId: created, recipientId: PARENT_AUTHOR, type: 'reply.guest' }),
    }))
    expect(notify.mock.calls[0]![1]).not.toHaveProperty('senderId')
  })
})

describe('DELETE /api/comments/:id — die Meldungen DIESES Kommentars verlassen fremde Glocken', () => {
  function withPermissionWrites(door: ReturnType<typeof fakeDoor>) {
    return (event: H3Event, options?: { as?: 'member' | 'operator', actor?: string }) => ({
      ...door.tenantDb(event, options),
      async updatePermissions(table: string, id: string, permissions: string[]) {
        const row = (door.rows[table] ?? []).find(r => r.$id === id)!
        row.$permissions = permissions
        return { ...row }
      },
    })
  }

  it('Antwort und Erwähnung von k-1 fallen; k-2 desselben Absenders, fremde Typen und Bestand bleiben', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [parentComment(), comment(), comment({ $id: 'k-2' })] } })
    const otherComment = notification('reply', 'k-2', PARENT_AUTHOR, MEMBER)
    const legacy: NotificationRow = { $id: 'legacy-random-id', recipientId: PARENT_AUTHOR, senderId: MEMBER, type: 'reply', body: 'Alt' }
    const postMention: NotificationRow = { ...notification('post.mention', 'k-1', MENTIONED, MEMBER) }
    const bell = fakeBell([
      notification('reply', 'k-1', PARENT_AUTHOR, MEMBER),
      notification('mention', 'k-1', MENTIONED, MEMBER),
      otherComment,
      legacy,
      postMention,
    ])
    const run = await runDoorRoute(() => import('../server/api/comments/[id].delete'), {
      door, params: { id: 'k-1' },
      globals: { tenantDb: withPermissionWrites(door), assertNotMaintenance: async () => {}, removeActivitiesForObject, ...bellGlobals(bell) },
    })

    expect(run.error).toBeUndefined()
    expect(run.status).toBe(200)
    expect(bell.rows.map(r => r.$id).sort()).toEqual([otherComment.$id, legacy.$id, postMention.$id].sort())
  })

  it('eine gestörte Glocke lässt das Löschen nicht scheitern — sie wird geloggt', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [parentComment(), comment()] } })
    const bell = fakeBell([notification('reply', 'k-1', PARENT_AUTHOR, MEMBER)], { failList: true })
    const logEvent = vi.fn()
    const run = await runDoorRoute(() => import('../server/api/comments/[id].delete'), {
      door, params: { id: 'k-1' },
      globals: { tenantDb: withPermissionWrites(door), assertNotMaintenance: async () => {}, removeActivitiesForObject, ...bellGlobals(bell, logEvent) },
    })

    expect(run.status).toBe(200)
    expect(door.rows[COMMENTS_TABLE]!.find(r => r.$id === 'k-1')).toMatchObject({ status: 'deleted', content: '' })
    expect(logEvent).toHaveBeenCalledWith('warn', 'comments.notification_cleanup_failed', expect.objectContaining({ commentId: 'k-1' }))
  })
})

describe('Ausblenden (Moderation) — auch Gast-Antworten und die Kaskade', () => {
  function moderationGlobals(door: ReturnType<typeof fakeDoor>, bell: ReturnType<typeof fakeBell>) {
    vi.stubGlobal('tenantDb', door.tenantDb)
    vi.stubGlobal('withoutPublishedRead', (permissions: string[]) => permissions)
    vi.stubGlobal('removeActivitiesForObject', removeActivitiesForObject)
    vi.stubGlobal('useTenant', (e: H3Event) => (e.context as { tenant?: unknown }).tenant ?? null)
    for (const [name, value] of Object.entries(bellGlobals(bell))) vi.stubGlobal(name, value)
  }
  const event = { context: { tenant: { mode: 'pool', tenantId: TENANT_SCOPE } } } as unknown as H3Event

  it('Gast-Antwort: die Meldung an den Eltern-Autor fällt über die berechnete Id; die einer anderen Gast-Antwort bleibt', async () => {
    const guest = comment({ $id: 'k-g', authorId: '', authorKind: 'guest', authorName: 'Gast' })
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [parentComment(), guest, comment({ $id: 'k-g2', authorId: '', authorKind: 'guest' })] } })
    const other = notification('reply.guest', 'k-g2', PARENT_AUTHOR)
    const bell = fakeBell([notification('reply.guest', 'k-g', PARENT_AUTHOR), other])
    moderationGlobals(door, bell)

    const { hideCommentRow } = await import('../server/utils/commentModeration')
    await hideCommentRow(event, { ...guest } as unknown as Parameters<typeof hideCommentRow>[1])

    expect(bell.rows.map(r => r.$id)).toEqual([other.$id])
  })

  it('Kaskade: blendet der Moderator den Eltern-Kommentar aus, fallen auch die Meldungen der Antworten darunter', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [parentComment({ authorId: 'u-root' }), comment()] } })
    const elsewhere = notification('reply', 'k-elsewhere', 'u-root', MEMBER)
    const bell = fakeBell([notification('mention', 'k-1', MENTIONED, MEMBER), notification('reply', 'k-1', 'u-root', MEMBER), elsewhere])
    moderationGlobals(door, bell)

    const { hideCommentRow, hideCommentDescendants } = await import('../server/utils/commentModeration')
    const root = door.rows[COMMENTS_TABLE]![0]!
    await hideCommentRow(event, { ...root } as unknown as Parameters<typeof hideCommentRow>[1])
    await hideCommentDescendants(event, { ...root } as unknown as Parameters<typeof hideCommentDescendants>[1])

    expect(bell.rows.map(r => r.$id)).toEqual([elsewhere.$id])
  })

  it('eine gestörte Glocke lässt das Ausblenden nicht scheitern', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [parentComment(), comment()] } })
    const bell = fakeBell([notification('reply', 'k-1', PARENT_AUTHOR, MEMBER)], { failList: true })
    moderationGlobals(door, bell)

    const { hideCommentRow } = await import('../server/utils/commentModeration')
    const hidden = await hideCommentRow(event, { ...comment() } as unknown as Parameters<typeof hideCommentRow>[1])
    expect(hidden.status).toBe('hidden')
    expect(bell.rows).toHaveLength(1)
  })
})
