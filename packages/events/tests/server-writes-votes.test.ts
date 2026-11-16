import { afterEach, describe, expect, it, vi } from 'vitest'
import { Permission, Role } from 'node-appwrite'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeRow, fakeDoor, runDoorRoute } from '../../core/tests/support/doorFake'
import { writerDoor, writesTo } from '../../core/tests/support/writerDoor'
import { EVENTS_TABLE, EVENT_VOTES_TABLE } from '../shared/types/event'

/**
 * SEC-002 (GA1 P13, Etappe 2) — die Stimme auf einen Termin schreibt der
 * Server: Operator-Klinke, gehandelt hat das Mitglied (`actor: 'member'` —
 * Inhalts-Sperre und Beitritt gelten). Neue Zeilen tragen nur das eigene
 * Leserecht; die Stimme eines anderen Kontos bleibt unberührt.
 */

const MEMBER = 'u-member'
const OTHER = 'u-other'

const eventRow = (): FakeRow => ({
  $id: 'e-1', communityId: 'c-a', title: 'Termin', status: 'published', authorId: 'u-author',
  upvotes: 0, downvotes: 0, score: 0,
})
const vote = (userId: string, value: 1 | -1): FakeRow => ({ $id: `v-${userId}`, communityId: 'c-a', eventId: 'e-1', userId, value })

const loadScore = () => import('../server/api/events/[id]/score.post')

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

describe('POST /api/events/:id/score — die Stimme schreibt der Server', () => {
  it('neue Stimme: Operator-Klinke als Mitglied, nur das eigene Leserecht', async () => {
    const door = fakeDoor({ rows: { [EVENTS_TABLE]: [eventRow()], [EVENT_VOTES_TABLE]: [] } })
    const { tenantDb, writes } = writerDoor(door)
    const run = await runDoorRoute(loadScore, { door, params: { id: 'e-1' }, body: { value: 1 }, globals: { tenantDb } })

    expect(run.status).toBe(200)
    const votes = writesTo(writes, EVENT_VOTES_TABLE)
    expect(votes.map(w => [w.method, w.handle, w.actor])).toEqual([['create', 'operator', 'member']])
    expect(votes[0]!.permissions).toEqual([Permission.read(Role.user(MEMBER))])
    expect(writes.filter(w => w.handle === 'member')).toEqual([])
  })

  it('eigene Stimme zurücknehmen und umdrehen: nur die eigene Zeile, über den Server', async () => {
    for (const [value, method] of [[1, 'remove'], [-1, 'update']] as const) {
      const door = fakeDoor({ rows: { [EVENTS_TABLE]: [eventRow()], [EVENT_VOTES_TABLE]: [vote(OTHER, 1), vote(MEMBER, 1)] } })
      const { tenantDb, writes } = writerDoor(door)
      const run = await runDoorRoute(loadScore, { door, params: { id: 'e-1' }, body: { value }, globals: { tenantDb } })

      expect(run.status).toBe(200)
      expect(writesTo(writes, EVENT_VOTES_TABLE).map(w => [w.method, w.handle, w.actor, w.id]))
        .toEqual([[method, 'operator', 'member', `v-${MEMBER}`]])
      expect(door.rows[EVENT_VOTES_TABLE]!.find(r => r.userId === OTHER)).toEqual(vote(OTHER, 1))
    }
  })

  it('die Stimme eines anderen Kontos bleibt unberührt — es entsteht nur die eigene', async () => {
    const door = fakeDoor({ rows: { [EVENTS_TABLE]: [eventRow()], [EVENT_VOTES_TABLE]: [vote(OTHER, 1)] } })
    const { tenantDb, writes } = writerDoor(door)
    const run = await runDoorRoute(loadScore, { door, params: { id: 'e-1' }, body: { value: 1 }, globals: { tenantDb } })

    expect(run.status).toBe(200)
    expect(writesTo(writes, EVENT_VOTES_TABLE).map(w => w.method)).toEqual(['create'])
    expect(door.rows[EVENT_VOTES_TABLE]!.find(r => r.userId === OTHER)).toEqual(vote(OTHER, 1))
  })

  it('gesperrte Community: 403 community_suspended, keine Stimme, kein Zähler', async () => {
    const door = fakeDoor({ rows: { [EVENTS_TABLE]: [eventRow()], [EVENT_VOTES_TABLE]: [] } })
    const { tenantDb, writes } = writerDoor(door)
    const run = await runDoorRoute(loadScore, { door, suspended: true, params: { id: 'e-1' }, body: { value: 1 }, globals: { tenantDb } })

    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('community_suspended')
    expect(door.rows[EVENT_VOTES_TABLE]).toEqual([])
    expect(writesTo(writes, EVENTS_TABLE)).toEqual([])
  })
})
