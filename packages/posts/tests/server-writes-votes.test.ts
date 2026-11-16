import { afterEach, describe, expect, it, vi } from 'vitest'
import { Permission, Role } from 'node-appwrite'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeRow, fakeDoor, runDoorRoute } from '../../core/tests/support/doorFake'
import { grantsWrite, writerDoor, writesTo } from '../../core/tests/support/writerDoor'
import { DISCUSSION_REACTIONS_TABLE, POSTS_TABLE, POST_VOTES_TABLE } from '../shared/types/post'

/**
 * SEC-002 (GA1 P13, Etappe 2) — Stimmen und Reaktionen schreibt der Server.
 *
 * Die eigene Stimme auf einen Beitrag und die eigene Reaktion auf ein Thema
 * entstehen, wechseln und verschwinden über die Operator-Klinke; gehandelt hat
 * das Mitglied (`actor: 'member'` — Inhalts-Sperre und Beitritt gelten). Neue
 * Zeilen tragen nur Leserechte. Die Zeile eines anderen Kontos bleibt
 * unberührt, obwohl die nachgebaute Tür jeden Schreibvorgang annähme.
 */

const MEMBER = 'u-member'
const OTHER = 'u-other'

const post = (overrides: Partial<FakeRow> = {}): FakeRow => ({
  $id: 'p-1', communityId: 'c-a', type: 'post', status: 'published', title: 'Titel', body: 'Text',
  authorId: 'u-author', categoryId: 'cat-1', upvotes: 0, downvotes: 0, score: 0, ...overrides,
})
const vote = (userId: string, value: 1 | -1, $id = `v-${userId}`): FakeRow => ({ $id, communityId: 'c-a', postId: 'p-1', userId, value })
const reaction = (userId: string, $id = `r-${userId}`): FakeRow =>
  ({ $id, communityId: 'c-a', targetType: 'post', targetId: 'p-1', userId, reaction: 'laugh' })

const ownRead = Permission.read(Role.user(MEMBER))

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

describe('POST /api/posts/:id/score — die Stimme schreibt der Server', () => {
  const loadScore = () => import('../server/api/posts/[id]/score.post')

  it('neue Stimme: Operator-Klinke als Mitglied, nur das eigene Leserecht', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post()], [POST_VOTES_TABLE]: [] } })
    const { tenantDb, writes } = writerDoor(door)
    const run = await runDoorRoute(loadScore, { door, params: { id: 'p-1' }, body: { value: 1 }, globals: { tenantDb } })

    expect(run.status).toBe(200)
    const votes = writesTo(writes, POST_VOTES_TABLE)
    expect(votes.map(w => [w.method, w.handle, w.actor])).toEqual([['create', 'operator', 'member']])
    expect(votes[0]!.permissions).toEqual([ownRead])
    expect(writes.filter(w => w.handle === 'member')).toEqual([])
  })

  it('eigene Stimme zurücknehmen und umdrehen: nur die eigene Zeile, über den Server', async () => {
    for (const [value, method] of [[1, 'remove'], [-1, 'update']] as const) {
      const door = fakeDoor({ rows: { [POSTS_TABLE]: [post()], [POST_VOTES_TABLE]: [vote(OTHER, 1), vote(MEMBER, 1)] } })
      const { tenantDb, writes } = writerDoor(door)
      const run = await runDoorRoute(loadScore, { door, params: { id: 'p-1' }, body: { value }, globals: { tenantDb } })

      expect(run.status).toBe(200)
      expect(writesTo(writes, POST_VOTES_TABLE).map(w => [w.method, w.handle, w.actor, w.id]))
        .toEqual([[method, 'operator', 'member', `v-${MEMBER}`]])
      expect(door.rows[POST_VOTES_TABLE]!.find(r => r.userId === OTHER)).toEqual(vote(OTHER, 1))
    }
  })

  it('die Stimme eines anderen Kontos bleibt unberührt — es entsteht nur die eigene', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post()], [POST_VOTES_TABLE]: [vote(OTHER, 1)] } })
    const { tenantDb, writes } = writerDoor(door)
    const run = await runDoorRoute(loadScore, { door, params: { id: 'p-1' }, body: { value: 1 }, globals: { tenantDb } })

    expect(run.status).toBe(200)
    expect(writesTo(writes, POST_VOTES_TABLE).map(w => w.method)).toEqual(['create'])
    expect(door.rows[POST_VOTES_TABLE]!.find(r => r.userId === OTHER)).toEqual(vote(OTHER, 1))
    expect(door.rows[POST_VOTES_TABLE]!.filter(r => r.userId === MEMBER)).toHaveLength(1)
  })

  it('gesperrte Community: 403 community_suspended, keine Stimme, kein Zähler', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post()], [POST_VOTES_TABLE]: [] } })
    const { tenantDb, writes } = writerDoor(door)
    const run = await runDoorRoute(loadScore, { door, suspended: true, params: { id: 'p-1' }, body: { value: 1 }, globals: { tenantDb } })

    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('community_suspended')
    expect(door.rows[POST_VOTES_TABLE]).toEqual([])
    expect(writesTo(writes, POSTS_TABLE)).toEqual([])
  })
})

describe('POST /api/posts/discussions/reactions — die Reaktion schreibt der Server', () => {
  const loadReaction = () => import('../server/api/posts/discussions/reactions.post')
  const body = { targetType: 'post', targetId: 'p-1', reaction: 'laugh' }
  const globals = (tenantDb: unknown) => ({
    tenantDb,
    setHeader: () => {},
    useRateLimitStore: () => ({ store: { hit: async () => ({ count: 1, resetInMs: 1000 }) }, prefix: '' }),
  })

  it('neue Reaktion: Operator-Klinke als Mitglied, nur das Lese-Publikum', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post()], [DISCUSSION_REACTIONS_TABLE]: [] } })
    const { tenantDb, writes } = writerDoor(door)
    const run = await runDoorRoute(loadReaction, { door, body, globals: globals(tenantDb) })

    expect(run.status).toBe(200)
    const created = writesTo(writes, DISCUSSION_REACTIONS_TABLE)
    expect(created.map(w => [w.method, w.handle, w.actor])).toEqual([['create', 'operator', 'member']])
    expect(created[0]!.permissions!.length).toBeGreaterThan(0)
    expect(created[0]!.permissions!.every(p => p.startsWith('read('))).toBe(true)
    expect(grantsWrite(created[0]!.permissions)).toBe(false)
    expect(writes.filter(w => w.handle === 'member')).toEqual([])
  })

  it('eigene Reaktion zurücknehmen: nur die eigene Zeile, die fremde bleibt', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post()], [DISCUSSION_REACTIONS_TABLE]: [reaction(OTHER), reaction(MEMBER)] } })
    const { tenantDb, writes } = writerDoor(door)
    const run = await runDoorRoute(loadReaction, { door, body, globals: globals(tenantDb) })

    expect(run.status).toBe(200)
    expect(writesTo(writes, DISCUSSION_REACTIONS_TABLE).map(w => [w.method, w.handle, w.actor, w.id]))
      .toEqual([['remove', 'operator', 'member', `r-${MEMBER}`]])
    expect(door.rows[DISCUSSION_REACTIONS_TABLE]).toEqual([reaction(OTHER)])
  })

  it('nur eine fremde Reaktion da: sie bleibt, es entsteht die eigene', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post()], [DISCUSSION_REACTIONS_TABLE]: [reaction(OTHER)] } })
    const { tenantDb, writes } = writerDoor(door)
    const run = await runDoorRoute(loadReaction, { door, body, globals: globals(tenantDb) })

    expect(run.status).toBe(200)
    expect(writesTo(writes, DISCUSSION_REACTIONS_TABLE).map(w => w.method)).toEqual(['create'])
    expect(door.rows[DISCUSSION_REACTIONS_TABLE]![0]).toEqual(reaction(OTHER))
  })

  it('gesperrte Community: 403 community_suspended, nichts entsteht', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post()], [DISCUSSION_REACTIONS_TABLE]: [] } })
    const { tenantDb } = writerDoor(door)
    const run = await runDoorRoute(loadReaction, { door, suspended: true, body, globals: globals(tenantDb) })

    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('community_suspended')
    expect(door.rows[DISCUSSION_REACTIONS_TABLE]).toEqual([])
  })
})
