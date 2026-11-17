import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeDoor, type FakeRow, fakeDoor, runDoorRoute } from '../../core/tests/support/doorFake'
import { POSTS_TABLE, POST_VOTES_TABLE } from '../shared/types/post'

/**
 * BE-020 (3) — das Tages-Kontingent für Likes und ein gescheitertes Schreiben.
 *
 * Gebucht wird VOR dem Schreiben der Stimme (Begründung im Core-Vertrag
 * `likeAllowance.ts`). Scheitert das Schreiben danach mit einem FEHLER, gibt
 * die Route das eine Like zurück — nie bei einer regulären Rücknahme der
 * Stimme (sonst wäre das Limit einen Klick entfernt) und nie beim 409 des
 * Doppelklick-Rennens (dort steht die Stimme).
 */

const MEMBER = 'u-member'

const post = (): FakeRow => ({
  $id: 'p-1', communityId: 'c-a', type: 'post', status: 'published', title: 'Titel', body: 'Text',
  authorId: 'u-author', categoryId: 'cat-1', upvotes: 0, downvotes: 0, score: 0,
})
const vote = (value: 1 | -1): FakeRow => ({ $id: `v-${MEMBER}`, communityId: 'c-a', postId: 'p-1', userId: MEMBER, value })

/** Die Tür, deren Schreibvorgänge auf die Stimmen-Tabelle scheitern. */
function failingDoor(door: FakeDoor, error: () => Error) {
  return (event: H3Event, options?: { as?: 'member' | 'operator', actor?: string }) => {
    const handle = door.tenantDb(event, options) as Record<string, (...args: unknown[]) => Promise<unknown>>
    const failOnVotes = (method: string) => async (table: string, ...rest: unknown[]) => {
      if (table === POST_VOTES_TABLE) throw error()
      return handle[method]!(table, ...rest)
    }
    return { ...handle, create: failOnVotes('create'), update: failOnVotes('update'), remove: failOnVotes('remove') }
  }
}

const loadVote = () => import('../server/api/posts/[id]/score.post')

function spies() {
  return {
    spendLikeAllowance: vi.fn(async () => ({ ok: true as const })),
    refundLikeAllowance: vi.fn(async () => {}),
  }
}

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

describe('POST /api/posts/:id/score — Like-Kontingent bei gescheitertem Schreiben', () => {
  it('BE-020: neue Aufstimme scheitert ⇒ genau eine Rückgabe, die Route antwortet mit dem Fehler', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post()], [POST_VOTES_TABLE]: [] } })
    const s = spies()
    const run = await runDoorRoute(loadVote, {
      door, params: { id: 'p-1' }, body: { value: 1 },
      globals: { ...s, tenantDb: failingDoor(door, () => new AppwriteException('boom', 500)) },
    })

    expect(run.status).toBe(500)
    expect(s.spendLikeAllowance).toHaveBeenCalledTimes(1)
    expect(s.refundLikeAllowance).toHaveBeenCalledTimes(1)
    expect(s.refundLikeAllowance).toHaveBeenCalledWith(expect.anything(), MEMBER)
  })

  it('BE-020: Wechsel von Ab- auf Aufstimme scheitert ⇒ genau eine Rückgabe', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post()], [POST_VOTES_TABLE]: [vote(-1)] } })
    const s = spies()
    const run = await runDoorRoute(loadVote, {
      door, params: { id: 'p-1' }, body: { value: 1 },
      globals: { ...s, tenantDb: failingDoor(door, () => Object.assign(new Error('down'), { status: 503 })) },
    })

    expect(run.status).toBe(503)
    expect(s.spendLikeAllowance).toHaveBeenCalledTimes(1)
    expect(s.refundLikeAllowance).toHaveBeenCalledTimes(1)
  })

  it('Schreiben gelingt ⇒ keine Rückgabe', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post()], [POST_VOTES_TABLE]: [] } })
    const s = spies()
    const run = await runDoorRoute(loadVote, { door, params: { id: 'p-1' }, body: { value: 1 }, globals: { ...s } })

    expect(run.status).toBe(200)
    expect(s.spendLikeAllowance).toHaveBeenCalledTimes(1)
    expect(s.refundLikeAllowance).not.toHaveBeenCalled()
  })

  it('reguläre Rücknahme eines Likes ⇒ weder Buchung noch Rückgabe', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post()], [POST_VOTES_TABLE]: [vote(1)] } })
    const s = spies()
    const run = await runDoorRoute(loadVote, { door, params: { id: 'p-1' }, body: { value: 1 }, globals: { ...s } })

    expect(run.status).toBe(200)
    expect(door.rows[POST_VOTES_TABLE]).toEqual([])
    expect(s.spendLikeAllowance).not.toHaveBeenCalled()
    expect(s.refundLikeAllowance).not.toHaveBeenCalled()
  })

  it('Rücknahme scheitert ⇒ trotzdem keine Rückgabe (es wurde nichts gebucht)', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post()], [POST_VOTES_TABLE]: [vote(1)] } })
    const s = spies()
    const run = await runDoorRoute(loadVote, {
      door, params: { id: 'p-1' }, body: { value: 1 },
      globals: { ...s, tenantDb: failingDoor(door, () => Object.assign(new Error('down'), { status: 503 })) },
    })

    expect(run.status).toBe(503)
    expect(s.refundLikeAllowance).not.toHaveBeenCalled()
  })

  it('Abstimme (−1) ⇒ weder Buchung noch Rückgabe', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post()], [POST_VOTES_TABLE]: [] } })
    const s = spies()
    const run = await runDoorRoute(loadVote, { door, params: { id: 'p-1' }, body: { value: -1 }, globals: { ...s } })

    expect(run.status).toBe(200)
    expect(s.spendLikeAllowance).not.toHaveBeenCalled()
    expect(s.refundLikeAllowance).not.toHaveBeenCalled()
  })

  it('Doppelklick-Rennen (409 beim Anlegen) ⇒ keine Rückgabe, die Stimme des Gewinners steht', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post()], [POST_VOTES_TABLE]: [] } })
    const s = spies()
    const run = await runDoorRoute(loadVote, {
      door, params: { id: 'p-1' }, body: { value: 1 },
      globals: { ...s, tenantDb: failingDoor(door, () => new AppwriteException('exists', 409)) },
    })

    expect(run.status).toBe(200)
    expect(s.spendLikeAllowance).toHaveBeenCalledTimes(1)
    expect(s.refundLikeAllowance).not.toHaveBeenCalled()
  })
})
