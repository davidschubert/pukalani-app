import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeRow, fakeDoor, firstOperatorCall, runDoorRoute } from '../../core/tests/support/doorFake'
import { toVoteCounts } from '../../core/shared/voteCounts'
import { COMMENTS_TABLE, VOTES_TABLE } from '../shared/types/comment'

/**
 * SEC-031 — die Stimme auf einen Kommentar gibt nichts heraus, was das Konto
 * nicht lesen darf. Das Ziel wird zuerst über die Mitglieder-Klinke gelesen
 * (dort entscheidet das Leserecht der Zeile, ein ausgeblendeter Kommentar hat
 * keines mehr); erst danach zählt und schreibt die Operator-Klinke. Die Antwort
 * trägt nur die Zähler und die eigene Stimme.
 */

const loadVote = () => import('../server/api/comments/[id]/vote.post')

function comment(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    $id: 'k-1',
    communityId: 'c-a',
    targetType: 'post',
    targetId: 'p-1',
    content: 'Geheimer Kommentar',
    authorId: 'u-author',
    authorName: 'Autorin',
    status: 'active',
    upvotes: 0,
    downvotes: 0,
    score: 0,
    ...overrides,
  }
}

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

describe('POST /api/comments/:id/vote — Lesen vor dem Operator', () => {
  it('nicht lesbarer Kommentar: 404 wie „nicht gefunden", kein Operator-Zugriff, keine Stimme', async () => {
    const door = fakeDoor({
      rows: { [COMMENTS_TABLE]: [comment({ status: 'hidden' })] },
      readable: (table, row) => !(table === COMMENTS_TABLE && row.status === 'hidden'),
    })
    const run = await runDoorRoute(loadVote, { door, params: { id: 'k-1' }, body: { value: 1 } })

    expect(run.status).toBe(404)
    expect(run.error?.statusText).toBe('Comment not found')
    expect(firstOperatorCall(door.calls)).toBe(-1)
    expect(door.rows[VOTES_TABLE] ?? []).toHaveLength(0)
    expect(run.body).toBeUndefined()
  })

  it('lesbarer Kommentar: Mitglieder-Klinke zuerst, Antwort nur Zähler + eigene Stimme', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment()] } })
    const run = await runDoorRoute(loadVote, { door, params: { id: 'k-1' }, body: { value: 1 } })

    expect(run.status).toBe(200)
    expect(door.calls[0]).toEqual({ handle: 'member', method: 'get', table: COMMENTS_TABLE, id: 'k-1' })
    expect(firstOperatorCall(door.calls)).toBeGreaterThan(0)
    expect(run.body).toEqual({ comment: { $id: 'k-1', upvotes: 1, downvotes: 0, score: 1 }, myVote: 1 })
  })
})

describe('toVoteCounts — die Feldauswahl der Antwort', () => {
  it('nimmt nur Id und Zähler, egal was die Zeile sonst trägt', () => {
    const row = { ...comment({ upvotes: 3, downvotes: 1, score: 2 }), authorEmail: 'x@example.com' }
    expect(toVoteCounts(row as unknown as Parameters<typeof toVoteCounts>[0]))
      .toEqual({ $id: 'k-1', upvotes: 3, downvotes: 1, score: 2 })
  })
})
