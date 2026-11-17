import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeDoor, type FakeRow } from '../../core/tests/support/doorFake'
import {
  describeGuardedRoute,
  probeRoute,
  resetCommunityWorld,
  userIdOf,
  type RouteProbe,
} from '../../core/tests/support/participationHarness'
import { POSTS_TABLE } from '../shared/types/post'

/**
 * ROLLEN-PROBEN FÜR BEITRÄGE (P27, OPS-009).
 *
 * Ergänzt `participation-guard.test.ts` um die Routen, die dort noch fehlten:
 * Bearbeiten, Themen-Zustand und die Verlinkungs-Suche. Echte Handler, echte
 * Core-Wachen (Prüfstand `core/tests/support/participationHarness.ts`).
 *
 * Wo eine Route ihr Ziel lesen muss, bevor sie über Rollen entscheiden kann,
 * steht eine nachgebaute Datentür (`doorFake.ts`) dahinter.
 */

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

/** Ein veröffentlichter Beitrag von `authorId`. */
function post(authorId: string): FakeRow {
  return {
    $id: 'p-1',
    authorId,
    status: 'published',
    type: 'post',
    title: 'Titel',
    body: 'Text',
    categoryId: '',
    pinned: false,
    closed: false,
    solved: false,
  }
}

/** Eine Datentür mit genau einem Beitrag. */
function doorWith(authorId: string): RouteProbe['door'] {
  return fakeDoor({ rows: { [POSTS_TABLE]: [post(authorId)] } }).tenantDb
}

/** Was hinter dem Speichern eines bearbeiteten Beitrags passiert (nicht Gegenstand hier). */
const AFTER_EDIT = {
  recordUserCounterEvents: async () => {},
  updateActivitySnippetForObject: async () => {},
  syncTopicLinks: async () => ({ added: 0, removed: 0 }),
  resolveCategoryId: async () => '',
}

// ── PATCH /api/posts/:id ────────────────────────────────────────────────────

describe('PATCH /api/posts/:id (bearbeiten)', () => {
  const load = () => import('../server/api/posts/[id].patch')
  const sameText = { title: 'Titel', body: 'Text' }
  const newTitle = { title: 'Neuer Titel', body: 'Text' }

  it('ohne Konto: 401, Datentür zu', async () => {
    const run = await probeRoute(load, { who: 'guest', params: { id: 'p-1' }, body: sameText })
    expect(run.status).toBe(401)
    expect(run.doorOpened).toBe(false)
  })

  it('Autorin (Mitglied): die Mitgliedschafts-Wache lässt durch', async () => {
    const run = await probeRoute(load, {
      who: 'member', params: { id: 'p-1' }, body: sameText, door: doorWith(userIdOf('member')), globals: AFTER_EDIT,
    })
    expect(run.guardPassed).toBe(true)
    expect(run.status).toBe(200)
  })

  it('fremdes Konto, fremder Beitrag: 403', async () => {
    const run = await probeRoute(load, {
      who: 'stranger', params: { id: 'p-1' }, body: newTitle, door: doorWith('u-other'), globals: AFTER_EDIT,
    })
    expect(run.status).toBe(403)
  })

  it('entfernte Autorin, eigener Beitrag: 403 not_a_member', async () => {
    const run = await probeRoute(load, {
      who: 'removed', params: { id: 'p-1' }, body: newTitle, door: doorWith(userIdOf('removed')), globals: AFTER_EDIT,
    })
    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('not_a_member')
  })

  // Diese Route muss den Beitrag LESEN, bevor sie entscheiden kann (erst die
  // Zeile sagt, ob hier die Autorin steht). Die Zusage ist deshalb: bis zur
  // Ablehnung wird nur über die Mitglieder-Klinke gelesen — kein Schreiben,
  // keine Operator-Klinke.
  for (const [who, authorId] of [['stranger', 'u-other'], ['removed', userIdOf('removed')], ['member', 'u-other']] as const) {
    it(`${who}: bis zur Ablehnung wird nur gelesen (Mitglieder-Klinke)`, async () => {
      const door = fakeDoor({ rows: { [POSTS_TABLE]: [post(authorId)] } })
      const run = await probeRoute(load, {
        who, params: { id: 'p-1' }, body: newTitle, door: door.tenantDb, globals: AFTER_EDIT,
      })
      expect(run.status).toBe(403)
      expect(door.calls.length).toBeGreaterThan(0)
      expect(door.calls.every(call => call.handle === 'member' && call.method === 'get')).toBe(true)
      expect(door.rows[POSTS_TABLE]?.[0]?.title).toBe('Titel')
    })
  }

  // Titel eines FREMDEN Beitrags: `posts.curate` (Moderator, Admin, Owner,
  // Betreiber im Not-Zugang). Die Liste steht hier ausgeschrieben.
  for (const who of ['owner', 'admin', 'moderator', 'operator'] as const) {
    it(`${who}: darf den Titel eines fremden Beitrags ändern`, async () => {
      const run = await probeRoute(load, {
        who, params: { id: 'p-1' }, body: newTitle, door: doorWith('u-other'), globals: AFTER_EDIT,
      })
      expect(run.status).toBe(200)
    })
  }

  for (const who of ['editor', 'member'] as const) {
    it(`${who}: darf einen fremden Beitrag nicht ändern (403)`, async () => {
      const run = await probeRoute(load, {
        who, params: { id: 'p-1' }, body: newTitle, door: doorWith('u-other'), globals: AFTER_EDIT,
      })
      expect(run.status).toBe(403)
    })
  }
})

// ── PATCH /api/posts/:id/state ──────────────────────────────────────────────

describeGuardedRoute('PATCH /api/posts/:id/state', () => import('../server/api/posts/[id]/state.patch'), 'membership', {
  params: { id: 'p-1' }, body: { field: 'solved', value: true },
})

describe('PATCH /api/posts/:id/state — wer anheften darf', () => {
  const load = () => import('../server/api/posts/[id]/state.patch')
  const pin = { field: 'pinned', value: true }

  // `posts.arrange`: Moderator, Admin, Owner, Betreiber im Not-Zugang.
  for (const who of ['owner', 'admin', 'moderator', 'operator'] as const) {
    it(`${who}: heftet ein fremdes Thema an`, async () => {
      const run = await probeRoute(load, { who, params: { id: 'p-1' }, body: pin, door: doorWith('u-other') })
      expect(run.status).toBe(200)
    })
  }

  for (const who of ['editor', 'member'] as const) {
    it(`${who}: darf ein fremdes Thema nicht anheften (403)`, async () => {
      const run = await probeRoute(load, { who, params: { id: 'p-1' }, body: pin, door: doorWith('u-other') })
      expect(run.status).toBe(403)
    })
  }

  it('fremdes Konto: 403 not_a_member, bevor die Tür aufgeht', async () => {
    const run = await probeRoute(load, { who: 'stranger', params: { id: 'p-1' }, body: pin, door: doorWith('u-other') })
    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('not_a_member')
    expect(run.doorOpened).toBe(false)
  })
})

// ── GET /api/posts/discussions/link-search ──────────────────────────────────

describeGuardedRoute(
  'GET /api/posts/discussions/link-search',
  () => import('../server/api/posts/discussions/link-search.get'),
  'membership',
  { query: { q: 'Titel' } },
)
