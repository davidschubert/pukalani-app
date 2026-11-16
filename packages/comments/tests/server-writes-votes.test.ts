import { afterEach, describe, expect, it, vi } from 'vitest'
import { Permission, Role } from 'node-appwrite'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeRow, fakeDoor, runDoorRoute } from '../../core/tests/support/doorFake'
import { grantsWrite, writerDoor, writesTo } from '../../core/tests/support/writerDoor'
import { COMMENTS_TABLE, COMMENT_REACTIONS_TABLE, VOTES_TABLE } from '../shared/types/comment'

/**
 * SEC-002 (GA1 P13, Etappe 2) — Stimmen und Reaktionen auf Kommentare schreibt
 * der Server.
 *
 * Die eigene Stimme und die eigene Reaktion entstehen, wechseln und
 * verschwinden über die Operator-Klinke; gehandelt hat das Mitglied
 * (`actor: 'member'` — Inhalts-Sperre und Beitritt gelten). Neue Zeilen tragen
 * nur Leserechte. Die Zeile eines anderen Kontos bleibt unberührt, obwohl die
 * nachgebaute Tür jeden Schreibvorgang annähme.
 */

const MEMBER = 'u-member'
const OTHER = 'u-other'

const comment = (overrides: Partial<FakeRow> = {}): FakeRow => ({
  $id: 'k-1', communityId: 'c-a', targetType: 'page', targetId: 't-1', content: 'Text',
  authorId: 'u-author', status: 'active', upvotes: 0, downvotes: 0, score: 0, ...overrides,
})
const vote = (userId: string, value: 1 | -1): FakeRow => ({ $id: `v-${userId}`, communityId: 'c-a', commentId: 'k-1', userId, value })
const reaction = (userId: string): FakeRow =>
  ({ $id: `r-${userId}`, communityId: 'c-a', targetId: 'k-1', userId, reaction: 'laugh' })

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

describe('POST /api/comments/:id/vote — die Stimme schreibt der Server', () => {
  const loadVote = () => import('../server/api/comments/[id]/vote.post')

  it('neue Stimme: Operator-Klinke als Mitglied, nur das eigene Leserecht', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment()], [VOTES_TABLE]: [] } })
    const { tenantDb, writes } = writerDoor(door)
    const run = await runDoorRoute(loadVote, { door, params: { id: 'k-1' }, body: { value: 1 }, globals: { tenantDb } })

    expect(run.status).toBe(200)
    const votes = writesTo(writes, VOTES_TABLE)
    expect(votes.map(w => [w.method, w.handle, w.actor])).toEqual([['create', 'operator', 'member']])
    expect(votes[0]!.permissions).toEqual([Permission.read(Role.user(MEMBER))])
    expect(writes.filter(w => w.handle === 'member')).toEqual([])
  })

  it('eigene Stimme zurücknehmen und umdrehen: nur die eigene Zeile, über den Server', async () => {
    for (const [value, method] of [[1, 'remove'], [-1, 'update']] as const) {
      const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment()], [VOTES_TABLE]: [vote(OTHER, 1), vote(MEMBER, 1)] } })
      const { tenantDb, writes } = writerDoor(door)
      const run = await runDoorRoute(loadVote, { door, params: { id: 'k-1' }, body: { value }, globals: { tenantDb } })

      expect(run.status).toBe(200)
      expect(writesTo(writes, VOTES_TABLE).map(w => [w.method, w.handle, w.actor, w.id]))
        .toEqual([[method, 'operator', 'member', `v-${MEMBER}`]])
      expect(door.rows[VOTES_TABLE]!.find(r => r.userId === OTHER)).toEqual(vote(OTHER, 1))
    }
  })

  it('die Stimme eines anderen Kontos bleibt unberührt — es entsteht nur die eigene', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment()], [VOTES_TABLE]: [vote(OTHER, -1)] } })
    const { tenantDb, writes } = writerDoor(door)
    const run = await runDoorRoute(loadVote, { door, params: { id: 'k-1' }, body: { value: -1 }, globals: { tenantDb } })

    expect(run.status).toBe(200)
    expect(writesTo(writes, VOTES_TABLE).map(w => w.method)).toEqual(['create'])
    expect(door.rows[VOTES_TABLE]!.find(r => r.userId === OTHER)).toEqual(vote(OTHER, -1))
  })

  it('gesperrte Community: 403 community_suspended, keine Stimme, kein Zähler', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment()], [VOTES_TABLE]: [] } })
    const { tenantDb, writes } = writerDoor(door)
    const run = await runDoorRoute(loadVote, { door, suspended: true, params: { id: 'k-1' }, body: { value: 1 }, globals: { tenantDb } })

    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('community_suspended')
    expect(door.rows[VOTES_TABLE]).toEqual([])
    expect(writesTo(writes, COMMENTS_TABLE)).toEqual([])
  })
})

describe('POST /api/comments/:id/reactions — die Reaktion schreibt der Server', () => {
  const loadReaction = () => import('../server/api/comments/[id]/reactions.post')
  const globals = (tenantDb: unknown) => ({
    tenantDb,
    setHeader: () => {},
    useRateLimitStore: () => ({ store: { hit: async () => ({ count: 1, resetInMs: 1000 }) }, prefix: '' }),
  })
  const probe = { params: { id: 'k-1' }, body: { reaction: 'laugh' } }

  it('neue Reaktion: Operator-Klinke als Mitglied, nur das Lese-Publikum', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment()], [COMMENT_REACTIONS_TABLE]: [] } })
    const { tenantDb, writes } = writerDoor(door)
    const run = await runDoorRoute(loadReaction, { door, ...probe, globals: globals(tenantDb) })

    expect(run.status).toBe(200)
    const created = writesTo(writes, COMMENT_REACTIONS_TABLE)
    expect(created.map(w => [w.method, w.handle, w.actor])).toEqual([['create', 'operator', 'member']])
    expect(created[0]!.permissions!.length).toBeGreaterThan(0)
    expect(created[0]!.permissions!.every(p => p.startsWith('read('))).toBe(true)
    expect(grantsWrite(created[0]!.permissions)).toBe(false)
    expect(writes.filter(w => w.handle === 'member')).toEqual([])
  })

  it('eigene Reaktion zurücknehmen: nur die eigene Zeile, die fremde bleibt', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment()], [COMMENT_REACTIONS_TABLE]: [reaction(OTHER), reaction(MEMBER)] } })
    const { tenantDb, writes } = writerDoor(door)
    const run = await runDoorRoute(loadReaction, { door, ...probe, globals: globals(tenantDb) })

    expect(run.status).toBe(200)
    expect(writesTo(writes, COMMENT_REACTIONS_TABLE).map(w => [w.method, w.handle, w.actor, w.id]))
      .toEqual([['remove', 'operator', 'member', `r-${MEMBER}`]])
    expect(door.rows[COMMENT_REACTIONS_TABLE]).toEqual([reaction(OTHER)])
  })

  it('nur eine fremde Reaktion da: sie bleibt, es entsteht die eigene', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment()], [COMMENT_REACTIONS_TABLE]: [reaction(OTHER)] } })
    const { tenantDb, writes } = writerDoor(door)
    const run = await runDoorRoute(loadReaction, { door, ...probe, globals: globals(tenantDb) })

    expect(run.status).toBe(200)
    expect(writesTo(writes, COMMENT_REACTIONS_TABLE).map(w => w.method)).toEqual(['create'])
    expect(door.rows[COMMENT_REACTIONS_TABLE]![0]).toEqual(reaction(OTHER))
  })

  it('gesperrte Community: 403 community_suspended, nichts entsteht', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment()], [COMMENT_REACTIONS_TABLE]: [] } })
    const { tenantDb } = writerDoor(door)
    const run = await runDoorRoute(loadReaction, { door, suspended: true, ...probe, globals: globals(tenantDb) })

    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('community_suspended')
    expect(door.rows[COMMENT_REACTIONS_TABLE]).toEqual([])
  })
})
