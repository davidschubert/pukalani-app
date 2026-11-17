import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeRow, fakeDoor, runDoorRoute } from '../../core/tests/support/doorFake'
import { writerDoor, writesTo } from '../../core/tests/support/writerDoor'
import {
  __resetContentWriteGuards,
  assertContentWritable,
  registerContentWriteGuard,
} from '../../core/server/utils/contentWritable'
import { COMMENTS_TABLE, COMMENT_REACTIONS_TABLE, VOTES_TABLE } from '../shared/types/comment'

/**
 * GESCHLOSSENES THEMA: AUCH KEINE STIMMEN UND REAKTIONEN (MM1, Davids
 * Entscheidung 2026-11-16).
 *
 * Kommentieren war unter einem geschlossenen Thema schon zu; Likes und
 * Reaktionen an den vorhandenen Antworten liefen weiter. Beide Routen fragen
 * jetzt denselben Core-Vertrag wie das Kommentieren (`assertContentWritable`).
 *
 * Der Vertrag läuft hier ECHT (Registry aus dem Core); nachgebildet ist nur
 * der Besitzer des Ziels — so, wie ihn der posts-Layer anmeldet: 403 mit dem
 * Grund `topic_closed`. Dass dessen Regel selbst stimmt, belegt
 * `packages/posts/tests/content-writable.test.ts`.
 *
 * Jede Probe hat ihre Gegenprobe am OFFENEN Thema: ohne sie wäre „nichts
 * geschrieben" auch dann grün, wenn die Route aus einem anderen Grund
 * scheitert.
 */

const MEMBER = 'u-member'
const CLOSED_TOPIC = 'p-closed'
const OPEN_TOPIC = 'p-open'

const comment = (targetId: string): FakeRow => ({
  $id: 'k-1', communityId: 'c-a', targetType: 'post', targetId, content: 'Text',
  authorId: 'u-author', status: 'active', upvotes: 0, downvotes: 0, score: 0,
})
const vote = (): FakeRow => ({ $id: `v-${MEMBER}`, communityId: 'c-a', commentId: 'k-1', userId: MEMBER, value: 1 })
const reaction = (): FakeRow => ({ $id: `r-${MEMBER}`, communityId: 'c-a', targetId: 'k-1', userId: MEMBER, reaction: 'laugh' })

let guardCalls: Array<{ targetType: string, targetId: string }> = []

beforeEach(() => {
  guardCalls = []
  registerContentWriteGuard('post', (_event, target) => {
    guardCalls.push(target)
    if (target.targetId === CLOSED_TOPIC) {
      throw Object.assign(new Error('This topic is closed'), { status: 403, statusText: 'This topic is closed', data: { code: 'topic_closed' } })
    }
  })
})

afterEach(() => {
  __resetContentWriteGuards()
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

describe('POST /api/comments/:id/vote unter einem geschlossenen Thema', () => {
  const load = () => import('../server/api/comments/[id]/vote.post')

  function world(targetId: string, votes: FakeRow[] = []) {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment(targetId)], [VOTES_TABLE]: votes } })
    const { tenantDb, writes } = writerDoor(door)
    const spent = { count: 0 }
    const globals = {
      tenantDb,
      assertContentWritable,
      spendLikeAllowance: async () => {
        spent.count += 1
        return { ok: true }
      },
    }
    return { door, writes, spent, globals }
  }

  it('neues Like: 403 topic_closed — keine Stimme, kein Zähler, kein Tages-Kontingent', async () => {
    const { door, writes, spent, globals } = world(CLOSED_TOPIC)
    const run = await runDoorRoute(load, { door, params: { id: 'k-1' }, body: { value: 1 }, globals })

    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('topic_closed')
    expect(writes).toEqual([])
    expect(door.rows[VOTES_TABLE]).toEqual([])
    expect(spent.count).toBe(0)
    expect(guardCalls).toEqual([{ targetType: 'post', targetId: CLOSED_TOPIC }])
  })

  it('auch das Zurücknehmen ist zu: die vorhandene Stimme bleibt stehen', async () => {
    const { door, writes, globals } = world(CLOSED_TOPIC, [vote()])
    const run = await runDoorRoute(load, { door, params: { id: 'k-1' }, body: { value: 1 }, globals })

    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('topic_closed')
    expect(writes).toEqual([])
    expect(door.rows[VOTES_TABLE]).toEqual([vote()])
  })

  it('Gegenprobe, offenes Thema: die Stimme entsteht', async () => {
    const { door, writes, globals } = world(OPEN_TOPIC)
    const run = await runDoorRoute(load, { door, params: { id: 'k-1' }, body: { value: 1 }, globals })

    expect(run.status).toBe(200)
    expect(writesTo(writes, VOTES_TABLE).map(w => w.method)).toEqual(['create'])
    expect(guardCalls).toEqual([{ targetType: 'post', targetId: OPEN_TOPIC }])
  })

  it('ein fremdes Konto erfährt nichts über das Thema: 403 not_a_member vor der Frage', async () => {
    const { door, globals } = world(CLOSED_TOPIC)
    const run = await runDoorRoute(load, { door, who: 'stranger', params: { id: 'k-1' }, body: { value: 1 }, globals })

    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('not_a_member')
    expect(guardCalls).toEqual([])
  })
})

describe('POST /api/comments/:id/reactions unter einem geschlossenen Thema', () => {
  const load = () => import('../server/api/comments/[id]/reactions.post')
  const probe = { params: { id: 'k-1' }, body: { reaction: 'laugh' } }

  function world(targetId: string, reactions: FakeRow[] = []) {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment(targetId)], [COMMENT_REACTIONS_TABLE]: reactions } })
    const { tenantDb, writes } = writerDoor(door)
    const throttle = { hits: 0 }
    const globals = {
      tenantDb,
      assertContentWritable,
      setHeader: () => {},
      useRateLimitStore: () => ({
        store: {
          hit: async () => {
            throttle.hits += 1
            return { count: 1, resetInMs: 1000 }
          },
        },
        prefix: '',
      }),
    }
    return { door, writes, throttle, globals }
  }

  it('neue Reaktion: 403 topic_closed — nichts geschrieben, die Drossel nicht berührt', async () => {
    const { door, writes, throttle, globals } = world(CLOSED_TOPIC)
    const run = await runDoorRoute(load, { door, ...probe, globals })

    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('topic_closed')
    expect(writes).toEqual([])
    expect(throttle.hits).toBe(0)
  })

  it('auch das Zurücknehmen ist zu: die vorhandene Reaktion bleibt stehen', async () => {
    const { door, writes, globals } = world(CLOSED_TOPIC, [reaction()])
    const run = await runDoorRoute(load, { door, ...probe, globals })

    expect(run.status).toBe(403)
    expect(writes).toEqual([])
    expect(door.rows[COMMENT_REACTIONS_TABLE]).toEqual([reaction()])
  })

  it('Gegenprobe, offenes Thema: die Reaktion entsteht', async () => {
    const { door, writes, globals } = world(OPEN_TOPIC)
    const run = await runDoorRoute(load, { door, ...probe, globals })

    expect(run.status).toBe(200)
    expect(writesTo(writes, COMMENT_REACTIONS_TABLE).map(w => w.method)).toEqual(['create'])
  })
})

describe('Ein Ziel ohne angemeldete Regel bleibt offen', () => {
  it('Kommentar an einer Seite: Stimme entsteht, der Vertrag fragt niemanden', async () => {
    const door = fakeDoor({
      rows: { [COMMENTS_TABLE]: [{ ...comment('t-1'), targetType: 'page' }], [VOTES_TABLE]: [] },
    })
    const { tenantDb, writes } = writerDoor(door)
    const run = await runDoorRoute(() => import('../server/api/comments/[id]/vote.post'), {
      door, params: { id: 'k-1' }, body: { value: 1 }, globals: { tenantDb, assertContentWritable },
    })

    expect(run.status).toBe(200)
    expect(writesTo(writes, VOTES_TABLE).map(w => w.method)).toEqual(['create'])
    expect(guardCalls).toEqual([])
  })
})
