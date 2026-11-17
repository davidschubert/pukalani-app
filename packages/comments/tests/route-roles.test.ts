import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeDoor, firstOperatorCall, type FakeRow } from '../../core/tests/support/doorFake'
import {
  describeRoleGateToDoor,
  probeRoute,
  resetCommunityWorld,
} from '../../core/tests/support/participationHarness'
import { createMicrocache } from '../../core/server/utils/microcache'
import { COMMENTS_TABLE } from '../shared/types/comment'

/**
 * ROLLEN-PROBEN FÜR DIE KOMMENTAR-ROUTEN (P27, OPS-009).
 *
 * Echte Handler, echte Core-Wachen (Prüfstand
 * `core/tests/support/participationHarness.ts`). Die Erwartungen stehen
 * Person für Person AUSGESCHRIEBEN — abgelesen aus der Rechte-Matrix
 * (`core/shared/communityAuthz.ts`), nicht aus ihr berechnet:
 *
 *  - `comments.moderate`: Moderator, Admin, Owner (über MODERATOR ⊂ ADMIN ⊂
 *    OWNER) und der Betreiber im protokollierten Not-Zugang. Redakteur und
 *    Mitglied nicht.
 *  - `community.embed`: nur der Owner (und der Betreiber) — wer eine fremde
 *    Domain freigibt, öffnet die Community nach außen.
 */

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

const MODERATE = {
  allow: ['owner', 'admin', 'moderator', 'operator'],
  deny: ['editor', 'member'],
} as const

const EMBED = {
  allow: ['owner', 'operator'],
  deny: ['admin', 'moderator', 'editor', 'member'],
} as const

/** Der Zwischenspeicher des Registers (Technik, Auto-Import beim Laden des Helfers). */
const EMBED_GLOBALS = { createMicrocache }

// ── Moderation der Kommentare ───────────────────────────────────────────────

describeRoleGateToDoor(
  'POST /api/admin/comments/:id/assist',
  () => import('../server/api/admin/comments/[id]/assist.post'),
  MODERATE,
  { params: { id: 'cm-1' } },
)

describeRoleGateToDoor(
  'PATCH /api/admin/comments/:id/status',
  () => import('../server/api/admin/comments/[id]/status.patch'),
  MODERATE,
  { params: { id: 'cm-1' }, body: { status: 'hidden' } },
)

describeRoleGateToDoor(
  'POST /api/admin/comments/bulk',
  () => import('../server/api/admin/comments/bulk.post'),
  MODERATE,
  { body: { action: 'hide', ids: ['cm-1'] } },
)

describeRoleGateToDoor(
  'GET /api/admin/comments',
  () => import('../server/api/admin/comments/index.get'),
  MODERATE,
  { query: { status: 'reported' } },
)

// ── Einbetter-Register (Owner-Sache) ────────────────────────────────────────

describeRoleGateToDoor(
  'GET /api/admin/embed-sites',
  () => import('../server/api/admin/embed-sites/index.get'),
  EMBED,
  { globals: EMBED_GLOBALS },
)

describeRoleGateToDoor(
  'POST /api/admin/embed-sites',
  () => import('../server/api/admin/embed-sites/index.post'),
  EMBED,
  { body: { host: 'blog.example.test', label: 'Blog' }, globals: EMBED_GLOBALS },
)

describeRoleGateToDoor(
  'PATCH /api/admin/embed-sites/:id',
  () => import('../server/api/admin/embed-sites/[id].patch'),
  EMBED,
  { params: { id: 'es-1' }, body: { active: false }, globals: EMBED_GLOBALS },
)

describeRoleGateToDoor(
  'DELETE /api/admin/embed-sites/:id',
  () => import('../server/api/admin/embed-sites/[id].delete'),
  EMBED,
  { params: { id: 'es-1' }, globals: EMBED_GLOBALS },
)

// ── POST /api/comments/:id/translate ────────────────────────────────────────

/**
 * Übersetzen ist LESEN, nicht Mitmachen (`.claude/rules/tenant-isolation.md`,
 * „MITMACHEN VERLANGT ZUGEHÖRIGKEIT"): verlangt wird nur die Anmeldung, das
 * Ziel wird über die Mitglieder-Klinke gelesen — dort entscheidet das
 * Leserecht der Zeile, was sichtbar ist. Erst danach schreibt die
 * Operator-Klinke den Zwischenspeicher.
 */
describe('POST /api/comments/:id/translate (Lesen mit Anmeldung)', () => {
  const load = () => import('../server/api/comments/[id]/translate.post')

  function comment(): FakeRow {
    return { $id: 'cm-1', content: 'Hallo zusammen', status: 'active', translations: '', authorId: 'u-other' }
  }

  /** KI-Transport (Technik): zählt nur die Aufrufe. */
  function aiGlobals() {
    let calls = 0
    return {
      calls: () => calls,
      globals: {
        getEffectiveAiConfig: async () => ({ model: 'test-model' }),
        aiCompleteJson: async () => {
          calls += 1
          return { body: 'Hello everyone' }
        },
      },
    }
  }

  it('ohne Konto: 401, Datentür zu, kein KI-Aufruf', async () => {
    const ai = aiGlobals()
    const run = await probeRoute(load, { who: 'guest', params: { id: 'cm-1' }, body: { locale: 'en' }, globals: ai.globals })
    expect(run.status).toBe(401)
    expect(run.doorOpened).toBe(false)
    expect(ai.calls()).toBe(0)
  })

  for (const who of ['member', 'stranger'] as const) {
    it(`${who}: lesbarer Kommentar ⇒ 200, gelesen zuerst über die Mitglieder-Klinke`, async () => {
      const ai = aiGlobals()
      const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment()] } })
      const run = await probeRoute(load, {
        who, params: { id: 'cm-1' }, body: { locale: 'en' }, door: door.tenantDb, globals: ai.globals,
      })
      expect(run.status).toBe(200)
      expect(door.calls[0]).toEqual({ handle: 'member', method: 'get', table: COMMENTS_TABLE, id: 'cm-1' })
      // Die Operator-Klinke schreibt nur den Zwischenspeicher, und erst nach dem Lesen.
      const operatorCalls = door.calls.filter(call => call.handle === 'operator')
      expect(operatorCalls.map(call => call.method)).toEqual(['update'])
      expect(firstOperatorCall(door.calls)).toBeGreaterThan(0)
    })
  }

  it('Kommentar ohne Leserecht für das Konto: 404, keine Operator-Klinke, kein KI-Aufruf', async () => {
    const ai = aiGlobals()
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [comment()] }, readable: () => false })
    const run = await probeRoute(load, {
      who: 'stranger', params: { id: 'cm-1' }, body: { locale: 'en' }, door: door.tenantDb, globals: ai.globals,
    })
    expect(run.status).toBe(404)
    expect(door.calls.every(call => call.handle === 'member')).toBe(true)
    expect(ai.calls()).toBe(0)
    expect(door.rows[COMMENTS_TABLE]?.[0]?.translations).toBe('')
  })
})
