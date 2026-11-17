import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { fakeDoor, type FakeRow } from '../../core/tests/support/doorFake'
import {
  describeAccountRoute,
  probeRoute,
  resetCommunityWorld,
  userIdOf,
} from '../../core/tests/support/participationHarness'
import { awardedBadges } from '../server/utils/badges'
import { listCategories, toDiscussionTopic, topicCountsFor } from '../server/utils/discussions'
import { memberLikeLimitFor } from '../server/utils/memberCounters'
import { pollStatesFor, postVotesFor } from '../server/utils/postsFeed'
import {
  DISCUSSION_LINKS_TABLE,
  DISCUSSION_REACTIONS_TABLE,
  POST_CATEGORIES_TABLE,
  POST_VOTES_TABLE,
  POSTS_TABLE,
} from '../shared/types/post'
import {
  category,
  hiddenRows,
  memberHandleOnly,
  operatorCalls,
  runRead,
  topic,
} from './support/readRoute'

/**
 * LESENDE ROUTEN DER BEITRÄGE (P27, OPS-009).
 *
 * Diese Routen bedienen auch Gäste. Die Zusage ist deshalb nicht „wer darf
 * durch", sondern: (1) ohne Konto keine 401 — Lesen ist kein Mitmachen;
 * (2) gelesen wird über die MITGLIEDER-Klinke, damit das Leserecht der Zeile
 * die Sichtbarkeit entscheidet (die Tür hier ist nachgebaut, `readable`
 * spielt die Row-Permissions); (3) persönliche Zusätze (eigene Stimme,
 * eigene Reaktion, eigene Kategorien) gibt es nur für das eigene Konto.
 *
 * Wo eine Route begründet über die Operator-Klinke liest (eigene Stimmen,
 * Verweis-Index), prüft der Test genau die dort beschriebene Zusage: nur
 * diese Tabelle, nur lesend, nur für das eigene Konto.
 */

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

type Rows = Array<{ $id: string }>

const noMap = async () => new Map()

/** Was hinter einer Feed-Liste angereichert wird, aber nicht Gegenstand hier ist. */
const FEED_EXTRAS = {
  // Die Veröffentlichung geplanter Beiträge hat ihren eigenen Test
  // (`publish-on-read-suspension.test.ts`).
  publishDuePosts: async () => {},
  resolveAvatars: noMap,
  resolveUserHandles: noMap,
  mentionsForPosts: noMap,
  topicLinksForPosts: noMap,
  topicLinksForPost: async () => [],
  recordTopicView: async () => {},
  topicViewsFor: noMap,
  // Die echten Helfer des Layers — sie entscheiden über die eigene Stimme.
  pollStatesFor,
  postVotesFor,
  listCategories,
  topicCountsFor,
  toDiscussionTopic,
}

/** Eine Stimme von `userId` auf `postId`. */
function vote(id: string, postId: string, userId: string, value: 1 | -1): FakeRow {
  return { $id: id, postId, userId, value }
}

// ── GET /api/posts (Feed) ───────────────────────────────────────────────────

describe('GET /api/posts (Feed, auch für Gäste)', () => {
  const load = () => import('../server/api/posts/index.get')
  const feedDoor = () => fakeDoor({
    rows: {
      [POSTS_TABLE]: [topic('p-1', 'u-author', ''), topic('p-secret', 'u-author', '')],
      [POST_VOTES_TABLE]: [vote('v-member', 'p-1', userIdOf('member'), 1), vote('v-other', 'p-1', 'u-other', -1)],
    },
    readable: hiddenRows('p-secret'),
  })

  for (const who of ['guest', 'member', 'stranger'] as const) {
    it(`${who}: kein 401, Beiträge über die Mitglieder-Klinke, Unlesbares fehlt`, async () => {
      const door = feedDoor()
      const run = await runRead(load, { who, door, globals: FEED_EXTRAS })
      expect(run.status).toBe(200)
      expect((run.body as { rows: Rows }).rows.map(row => row.$id)).toEqual(['p-1'])
      expect(door.calls.filter(call => call.table === POSTS_TABLE).every(call => call.handle === 'member')).toBe(true)
    })
  }

  it('Gast: keine eigene Stimme, die Operator-Klinke bleibt zu', async () => {
    const door = feedDoor()
    const run = await runRead(load, { who: 'guest', door, globals: FEED_EXTRAS })
    const rows = (run.body as { rows: Array<{ myPostVote: unknown }> }).rows
    expect(rows[0]?.myPostVote).toBeNull()
    expect(operatorCalls(door.calls)).toEqual([])
  })

  it('Mitglied: genau die eigene Stimme, gelesen nur aus der Stimmen-Tabelle', async () => {
    const door = feedDoor()
    const run = await runRead(load, { who: 'member', door, globals: FEED_EXTRAS })
    const rows = (run.body as { rows: Array<{ myPostVote: unknown }> }).rows
    expect(rows[0]?.myPostVote).toBe(1)
    const ops = operatorCalls(door.calls)
    expect(ops.length).toBeGreaterThan(0)
    expect(ops.every(call => call.table === POST_VOTES_TABLE && call.method === 'list')).toBe(true)
  })

  it('fremdes Konto: keine fremde Stimme als eigene', async () => {
    const run = await runRead(load, { who: 'stranger', door: feedDoor(), globals: FEED_EXTRAS })
    const rows = (run.body as { rows: Array<{ myPostVote: unknown }> }).rows
    expect(rows[0]?.myPostVote).toBeNull()
  })
})

// ── GET /api/posts/discussions/:id ──────────────────────────────────────────

describe('GET /api/posts/discussions/:id (Thema, auch für Gäste)', () => {
  const load = () => import('../server/api/posts/discussions/[id].get')
  const topicDoor = () => fakeDoor({
    rows: {
      [POSTS_TABLE]: [topic('p-1', 'u-author'), topic('p-secret', 'u-author')],
      [POST_CATEGORIES_TABLE]: [category()],
      [POST_VOTES_TABLE]: [vote('v-member', 'p-1', userIdOf('member'), -1)],
    },
    readable: hiddenRows('p-secret'),
  })

  it('Gast: kein 401, Thema und Kategorie über die Mitglieder-Klinke, keine eigene Stimme', async () => {
    const door = topicDoor()
    const run = await runRead(load, { who: 'guest', door, params: { id: 'p-1' }, globals: FEED_EXTRAS })
    expect(run.status).toBe(200)
    expect((run.body as { post: { myPostVote: unknown } }).post.myPostVote).toBeNull()
    expect(memberHandleOnly(door.calls)).toBe(true)
  })

  it('unlesbares Thema: 404, keine Operator-Klinke, kein Aufruf gezählt', async () => {
    const door = topicDoor()
    const recordTopicView = vi.fn(async () => {})
    const run = await runRead(load, {
      who: 'member', door, params: { id: 'p-secret' }, globals: { ...FEED_EXTRAS, recordTopicView },
    })
    expect(run.status).toBe(404)
    expect(operatorCalls(door.calls)).toEqual([])
    expect(recordTopicView).not.toHaveBeenCalled()
  })

  it('Mitglied: die eigene Stimme, Operator-Klinke nur für die Stimmen-Tabelle', async () => {
    const door = topicDoor()
    const run = await runRead(load, { who: 'member', door, params: { id: 'p-1' }, globals: FEED_EXTRAS })
    expect((run.body as { post: { myPostVote: unknown } }).post.myPostVote).toBe(-1)
    expect(operatorCalls(door.calls).every(call => call.table === POST_VOTES_TABLE && call.method === 'list')).toBe(true)
  })
})

// ── GET /api/posts/discussions ──────────────────────────────────────────────

describe('GET /api/posts/discussions (Themenliste, auch für Gäste)', () => {
  const load = () => import('../server/api/posts/discussions/index.get')

  for (const who of ['guest', 'member'] as const) {
    it(`${who}: kein 401, nur Mitglieder-Klinke, Unlesbares fehlt`, async () => {
      const door = fakeDoor({
        rows: {
          [POSTS_TABLE]: [topic('p-1', 'u-author'), topic('p-secret', 'u-author')],
          [POST_CATEGORIES_TABLE]: [category()],
        },
        readable: hiddenRows('p-secret'),
      })
      const run = await runRead(load, { who, door, globals: FEED_EXTRAS })
      expect(run.status).toBe(200)
      expect((run.body as { rows: Rows }).rows.map(row => row.$id)).toEqual(['p-1'])
      expect(memberHandleOnly(door.calls)).toBe(true)
    })
  }
})

// ── GET /api/posts/discussions/sidebar ──────────────────────────────────────

describe('GET /api/posts/discussions/sidebar (auch für Gäste)', () => {
  const load = () => import('../server/api/posts/discussions/sidebar.get')
  const sidebarDoor = () => fakeDoor({
    rows: {
      [POST_CATEGORIES_TABLE]: [category('cat-1', 'hilfe'), category('cat-2', 'technik')],
      [POSTS_TABLE]: [topic('p-own', userIdOf('member'), 'cat-2'), topic('p-a', 'u-author'), topic('p-b', 'u-author')],
    },
  })
  const globals = { ...FEED_EXTRAS, collectUserActivity: async () => [] }

  it('Gast: die größten Kategorien, keine eigene Auswahl, nur Mitglieder-Klinke', async () => {
    const door = sidebarDoor()
    const run = await runRead(load, { who: 'guest', door, globals })
    expect(run.status).toBe(200)
    expect((run.body as { source: string }).source).toBe('largest')
    expect(door.calls.some(call => call.table === POSTS_TABLE && call.method === 'list')).toBe(false)
    expect(memberHandleOnly(door.calls)).toBe(true)
  })

  it('Mitglied: die Kategorien der eigenen Beiträge, gelesen über die Mitglieder-Klinke', async () => {
    const door = sidebarDoor()
    const run = await runRead(load, { who: 'member', door, globals })
    expect(run.body).toEqual({ rows: [expect.objectContaining({ $id: 'cat-2' })], source: 'mine' })
    expect(memberHandleOnly(door.calls)).toBe(true)
  })
})

// ── GET /api/posts/discussions/about ────────────────────────────────────────

describe('GET /api/posts/discussions/about (auch für Gäste)', () => {
  const load = () => import('../server/api/posts/discussions/about.get')
  const aboutDoor = () => fakeDoor({
    rows: { [POSTS_TABLE]: [topic('p-1', 'u-author')], [POST_CATEGORIES_TABLE]: [category()] },
  })
  /** Dieselbe Community, nur mit dem Publikum „nur Mitglieder". */
  const membersOnly = (e: H3Event) => ({ ...e.context.tenant, audience: 'members' })

  it('Gast, öffentliche Community: kein 401, Zahlen über die Mitglieder-Klinke', async () => {
    const door = aboutDoor()
    const resolveRecentJoinCount = vi.fn(async () => 3)
    const run = await runRead(load, { who: 'guest', door, globals: { ...FEED_EXTRAS, resolveRecentJoinCount } })
    expect(run.status).toBe(200)
    expect((run.body as { signupsLast7Days?: number }).signupsLast7Days).toBe(3)
    expect(memberHandleOnly(door.calls)).toBe(true)
  })

  it('Gast, Community nur für Mitglieder: keine Beitritts-Zahl, nicht einmal gefragt', async () => {
    const resolveRecentJoinCount = vi.fn(async () => 3)
    const run = await runRead(load, {
      who: 'guest', door: aboutDoor(), globals: { ...FEED_EXTRAS, resolveRecentJoinCount, useTenant: membersOnly },
    })
    expect(run.status).toBe(200)
    expect(run.body).not.toHaveProperty('signupsLast7Days')
    expect(resolveRecentJoinCount).not.toHaveBeenCalled()
  })

  it('Mitglied, Community nur für Mitglieder: bekommt die Beitritts-Zahl', async () => {
    const resolveRecentJoinCount = vi.fn(async () => 3)
    const run = await runRead(load, {
      who: 'member', door: aboutDoor(), globals: { ...FEED_EXTRAS, resolveRecentJoinCount, useTenant: membersOnly },
    })
    expect((run.body as { signupsLast7Days?: number }).signupsLast7Days).toBe(3)
  })
})

// ── GET /api/posts/discussions/backlinks ────────────────────────────────────

describe('GET /api/posts/discussions/backlinks (auch für Gäste)', () => {
  const load = () => import('../server/api/posts/discussions/backlinks.get')

  for (const who of ['guest', 'member'] as const) {
    it(`${who}: nur Verweise aus lesbaren Themen; Themen über die Mitglieder-Klinke`, async () => {
      const door = fakeDoor({
        rows: {
          [DISCUSSION_LINKS_TABLE]: [
            { $id: 'l-1', targetId: 'p-target', sourceId: 'p-open' },
            { $id: 'l-2', targetId: 'p-target', sourceId: 'p-secret' },
          ],
          [POSTS_TABLE]: [topic('p-open', 'u-author'), topic('p-secret', 'u-author')],
          [POST_CATEGORIES_TABLE]: [category()],
        },
        readable: hiddenRows('p-secret'),
      })
      const run = await runRead(load, { who, door, query: { targetId: 'p-target' } })
      expect(run.status).toBe(200)
      expect((run.body as { backlinks: Rows }).backlinks.map(link => link.$id)).toEqual(['p-open'])
      // Der Verweis-Index liest begründet über die Operator-Klinke (er gehört
      // keinem Menschen) — die Themen selbst nie.
      expect(operatorCalls(door.calls).every(call => call.table === DISCUSSION_LINKS_TABLE && call.method === 'list')).toBe(true)
      expect(door.calls.filter(call => call.table !== DISCUSSION_LINKS_TABLE).every(call => call.handle === 'member')).toBe(true)
    })
  }
})

// ── GET /api/posts/discussions/reactions ────────────────────────────────────

describe('GET /api/posts/discussions/reactions (auch für Gäste)', () => {
  const load = () => import('../server/api/posts/discussions/reactions.get')
  const reactionDoor = () => fakeDoor({
    rows: {
      [DISCUSSION_REACTIONS_TABLE]: [
        { $id: 'r-member', targetId: 'p-1', reaction: 'tada', userId: userIdOf('member') },
        { $id: 'r-other', targetId: 'p-1', reaction: 'tada', userId: 'u-other' },
        { $id: 'r-secret', targetId: 'p-1', reaction: 'tada', userId: 'u-third' },
      ],
    },
    readable: hiddenRows('r-secret'),
  })
  type Chips = Record<string, Array<{ reaction: string, count: number, mine: boolean }>>

  it('Gast: kein 401, nur Lesbares gezählt, nichts als „eigene" markiert', async () => {
    const door = reactionDoor()
    const run = await runRead(load, { who: 'guest', door, query: { targetIds: 'p-1' } })
    expect(run.status).toBe(200)
    expect((run.body as { reactions: Chips }).reactions['p-1']).toEqual([{ reaction: 'tada', count: 2, mine: false }])
    expect(memberHandleOnly(door.calls)).toBe(true)
  })

  it('Mitglied: die eigene Reaktion ist markiert, gelesen über die Mitglieder-Klinke', async () => {
    const door = reactionDoor()
    const run = await runRead(load, { who: 'member', door, query: { targetIds: 'p-1' } })
    expect((run.body as { reactions: Chips }).reactions['p-1']).toEqual([{ reaction: 'tada', count: 2, mine: true }])
    expect(memberHandleOnly(door.calls)).toBe(true)
  })
})

// ── GET /api/posts/discussions/badges ───────────────────────────────────────

describe('GET /api/posts/discussions/badges (Galerie)', () => {
  const load = () => import('../server/api/posts/discussions/badges.get')

  it('Gast: der Katalog ohne Fortschritt, die Datentür bleibt zu', async () => {
    const door = fakeDoor({ rows: {} })
    const run = await runRead(load, { who: 'guest', door, globals: { memberLikeLimitFor } })
    expect(run.status).toBe(200)
    const body = run.body as { rows: Array<{ earned: boolean }>, facts: unknown }
    expect(body.rows.length).toBeGreaterThan(0)
    expect(body.rows.every(row => !row.earned)).toBe(true)
    expect(body.facts).toBeNull()
    expect(door.calls).toEqual([])
  })

  it('Mitglied: wird bedient (kein 401/403), die Datentür öffnet sich', async () => {
    const run = await probeRoute(load, { who: 'member', globals: { awardedBadges } })
    expect([401, 403]).not.toContain(run.status)
    expect(run.doorOpened).toBe(true)
  })
})

// ── GET /api/posts/categories ───────────────────────────────────────────────

describe('GET /api/posts/categories (auch für Gäste)', () => {
  const load = () => import('../server/api/posts/categories/index.get')

  for (const who of ['guest', 'member'] as const) {
    it(`${who}: kein 401, Kategorien und Zahlen über die Mitglieder-Klinke`, async () => {
      const door = fakeDoor({
        rows: {
          [POST_CATEGORIES_TABLE]: [category('cat-1', 'hilfe'), category('cat-secret', 'intern')],
          [POSTS_TABLE]: [topic('p-1', 'u-author')],
        },
        readable: hiddenRows('cat-secret'),
      })
      const run = await runRead(load, { who, door, query: { counts: '1' }, globals: FEED_EXTRAS })
      expect(run.status).toBe(200)
      const rows = (run.body as { rows: Array<{ category: { $id: string }, topicCount: number }> }).rows
      expect(rows).toEqual([expect.objectContaining({ category: expect.objectContaining({ $id: 'cat-1' }), topicCount: 1 })])
      expect(memberHandleOnly(door.calls)).toBe(true)
    })
  }
})

// ── GET /api/posts/scheduled ────────────────────────────────────────────────

describeAccountRoute('GET /api/posts/scheduled', () => import('../server/api/posts/scheduled.get'))

describe('GET /api/posts/scheduled — nur die eigenen geplanten Beiträge', () => {
  it('Mitglied: kein fremder geplanter Beitrag, gelesen über die Mitglieder-Klinke', async () => {
    const scheduled = (id: string, authorId: string): FakeRow => ({ ...topic(id, authorId), status: 'scheduled' })
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [scheduled('p-own', userIdOf('member')), scheduled('p-other', 'u-other')] } })
    const run = await runRead(() => import('../server/api/posts/scheduled.get'), { who: 'member', door })
    expect(run.status).toBe(200)
    expect((run.body as { rows: Rows }).rows.map(row => row.$id)).toEqual(['p-own'])
    expect(memberHandleOnly(door.calls)).toBe(true)
  })
})

// ── POST /api/posts/:id/translate ───────────────────────────────────────────

describe('POST /api/posts/:id/translate (Übersetzen ist Lesen)', () => {
  const load = () => import('../server/api/posts/[id]/translate.post')
  /** Ein Beitrag, dessen englische Fassung schon in der Zeile steht. */
  const translated = (id: string): FakeRow => ({
    ...topic(id, 'u-author'),
    translations: JSON.stringify({ en: { title: 'Title', body: 'Text in English' } }),
  })
  const translateDoor = () => fakeDoor({
    rows: { [POSTS_TABLE]: [translated('p-1'), translated('p-secret')] },
    readable: hiddenRows('p-secret'),
  })
  const globals = { isAiConfigured: async () => true }

  it('ohne Konto: 401, Datentür zu', async () => {
    const door = translateDoor()
    const run = await runRead(load, { who: 'guest', door, params: { id: 'p-1' }, body: { locale: 'en' }, globals })
    expect(run.status).toBe(401)
    expect(door.calls).toEqual([])
  })

  for (const who of ['member', 'stranger'] as const) {
    it(`${who}: angemeldet genügt; gelesen nur über die Mitglieder-Klinke`, async () => {
      const door = translateDoor()
      const run = await runRead(load, { who, door, params: { id: 'p-1' }, body: { locale: 'en' }, globals })
      expect(run.status).toBe(200)
      expect(run.body).toMatchObject({ locale: 'en', body: 'Text in English', cached: true })
      expect(memberHandleOnly(door.calls)).toBe(true)
    })
  }

  it('unlesbarer Beitrag: 404, kein Zugriff über die Operator-Klinke', async () => {
    const door = translateDoor()
    const run = await runRead(load, { who: 'member', door, params: { id: 'p-secret' }, body: { locale: 'en' }, globals })
    expect(run.status).toBe(404)
    expect(operatorCalls(door.calls)).toEqual([])
  })
})
