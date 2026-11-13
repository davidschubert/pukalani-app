import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeRow, fakeDoor, firstOperatorCall, runDoorRoute } from '../../core/tests/support/doorFake'
import { POLL_VOTES_TABLE, POSTS_TABLE, POST_VOTES_TABLE } from '../shared/types/post'

/**
 * SEC-031 — Mitmachen gibt nichts heraus, was das Konto nicht lesen darf.
 *
 * Die Stimme auf einen Beitrag (Like) und die Umfrage-Stimme schreiben über die
 * Operator-Klinke, weil die Tabellen bewusst kein Schreibrecht für Konten
 * tragen. Bevor diese Klinke etwas anfasst, muss das Ziel über die
 * Mitglieder-Klinke gelesen sein: wer den Beitrag nicht lesen darf, bekommt
 * dasselbe 404 wie für eine erfundene Id, und es entsteht nichts. Die Antwort
 * trägt nur Zähler und eigenen Zustand — nie den Beitrag selbst.
 */

const loadScore = () => import('../server/api/posts/[id]/score.post')
const loadPoll = () => import('../server/api/posts/[id]/vote.post')

function post(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    $id: 'p-1',
    communityId: 'c-a',
    type: 'post',
    status: 'published',
    title: 'Geheimer Titel',
    body: 'Geheimer Inhalt',
    authorId: 'u-author',
    upvotes: 0,
    downvotes: 0,
    score: 0,
    pollOptions: null,
    pollEndsAt: null,
    ...overrides,
  }
}

const hidden = (table: string, row: FakeRow) => !(table === POSTS_TABLE && row.status !== 'published')

async function pollGlobals() {
  const feed = await import('../server/utils/postsFeed')
  return { pollStatesFor: feed.pollStatesFor, parsePollOptions: feed.parsePollOptions }
}

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

describe('POST /api/posts/:id/score — Lesen vor dem Operator', () => {
  it('nicht lesbarer Beitrag: 404 wie „nicht gefunden", kein Operator-Zugriff, keine Stimme', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post({ status: 'hidden' })] }, readable: hidden })
    const run = await runDoorRoute(loadScore, { door, params: { id: 'p-1' }, body: { value: 1 } })

    expect(run.status).toBe(404)
    expect(run.error?.statusText).toBe('Post not found')
    expect(firstOperatorCall(door.calls)).toBe(-1)
    expect(door.rows[POST_VOTES_TABLE] ?? []).toHaveLength(0)
    expect(run.body).toBeUndefined()
  })

  it('unbekannte Id: dieselbe Antwort', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [] } })
    const run = await runDoorRoute(loadScore, { door, params: { id: 'nope' }, body: { value: 1 } })
    expect(run.status).toBe(404)
    expect(run.error?.statusText).toBe('Post not found')
  })

  it('lesbarer Beitrag: die Mitglieder-Klinke liest ZUERST, die Antwort trägt nur Zähler', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [post()] } })
    const run = await runDoorRoute(loadScore, { door, params: { id: 'p-1' }, body: { value: 1 } })

    expect(run.status).toBe(200)
    expect(door.calls[0]).toEqual({ handle: 'member', method: 'get', table: POSTS_TABLE, id: 'p-1' })
    expect(firstOperatorCall(door.calls)).toBeGreaterThan(0)
    expect(run.body).toEqual({
      post: { $id: 'p-1', upvotes: 1, downvotes: 0, score: 1 },
      myVote: 1,
    })
  })
})

describe('POST /api/posts/:id/vote (Umfrage) — Lesen vor dem Operator', () => {
  const poll = () => post({ type: 'poll', pollOptions: JSON.stringify(['Ja', 'Nein']) })

  it('nicht lesbare Umfrage: 404, kein Operator-Zugriff, keine Stimme', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [{ ...poll(), status: 'scheduled' }] }, readable: hidden })
    const run = await runDoorRoute(loadPoll, { door, params: { id: 'p-1' }, body: { optionIndex: 0 }, globals: await pollGlobals() })

    expect(run.status).toBe(404)
    expect(run.error?.statusText).toBe('Post not found')
    expect(firstOperatorCall(door.calls)).toBe(-1)
    expect(door.rows[POLL_VOTES_TABLE] ?? []).toHaveLength(0)
  })

  it('lesbare Umfrage: Mitglieder-Klinke zuerst, Antwort = nur der Umfrage-Zustand', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [poll()] } })
    const run = await runDoorRoute(loadPoll, { door, params: { id: 'p-1' }, body: { optionIndex: 1 }, globals: await pollGlobals() })

    expect(run.status).toBe(200)
    expect(door.calls[0]).toEqual({ handle: 'member', method: 'get', table: POSTS_TABLE, id: 'p-1' })
    expect(run.body).toEqual({
      poll: { options: ['Ja', 'Nein'], counts: [0, 1], totalVotes: 1, myVote: 1, results: true, ended: false },
    })
    expect(JSON.stringify(run.body)).not.toContain('Geheimer')
  })
})
