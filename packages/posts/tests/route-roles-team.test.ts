import { afterEach, describe, expect, it, vi } from 'vitest'
import * as permission from '../../core/server/utils/communityPermission'
import { fakeDoor } from '../../core/tests/support/doorFake'
import {
  describeRoleGatedRoute,
  resetCommunityWorld,
  userIdOf,
  type RoleExpectation,
} from '../../core/tests/support/participationHarness'
import { createMicrocache } from '../../core/server/utils/microcache'
import { POSTS_TABLE } from '../shared/types/post'
import { operatorCalls, runRead, topic } from './support/readRoute'

/**
 * ROLLEN-TORE DER BEITRÄGE (P27, OPS-009) — Moderation, „Meine Beiträge",
 * Kategorien-Verwaltung und Vertrauensstufen.
 *
 * Echte Handler, echte Core-Wachen (Prüfstand
 * `core/tests/support/participationHarness.ts`). Die Erwartung je Capability
 * steht hier AUSGESCHRIEBEN, Person für Person — abgelesen aus der
 * Rechte-Matrix, nicht aus ihr berechnet. `operator` ist der Betreiber im
 * protokollierten Not-Zugang.
 */

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

/** `posts.moderate`: Moderator, Admin, Owner — kein Editor, kein Mitglied. */
const MODERATE: RoleExpectation = {
  allow: ['owner', 'admin', 'moderator', 'operator'],
  deny: ['editor', 'member'],
}

/** `posts.write`: Editor, Admin, Owner — der Moderator verfasst nicht. */
const WRITE: RoleExpectation = {
  allow: ['owner', 'admin', 'editor', 'operator'],
  deny: ['moderator', 'member'],
}

/** `posts.manage`: die Kategorien-Struktur gehört Admin und Owner. */
const MANAGE: RoleExpectation = {
  allow: ['owner', 'admin', 'operator'],
  deny: ['moderator', 'editor', 'member'],
}

/** `posts.appoint`: Stufe 4 ernennt nur der Owner. */
const APPOINT: RoleExpectation = {
  allow: ['owner', 'operator'],
  deny: ['admin', 'moderator', 'editor', 'member'],
}

// ── Moderation ──────────────────────────────────────────────────────────────

describeRoleGatedRoute('GET /api/posts/moderation', () => import('../server/api/posts/moderation.get'), MODERATE)

describeRoleGatedRoute('POST /api/posts/:id/hide', () => import('../server/api/posts/[id]/hide.post'), MODERATE, {
  params: { id: 'p-1' },
})

describeRoleGatedRoute('POST /api/posts/:id/restore', () => import('../server/api/posts/[id]/restore.post'), MODERATE, {
  params: { id: 'p-1' },
})

describeRoleGatedRoute('POST /api/posts/:id/assist', () => import('../server/api/posts/[id]/assist.post'), MODERATE, {
  params: { id: 'p-1' },
})

// ── Meine Beiträge ──────────────────────────────────────────────────────────

describeRoleGatedRoute('GET /api/posts/mine', () => import('../server/api/posts/mine.get'), WRITE)

describe('GET /api/posts/mine — nur die eigenen Beiträge', () => {
  it('Editor: die Liste enthält keinen fremden Beitrag', async () => {
    const door = fakeDoor({ rows: { [POSTS_TABLE]: [topic('p-own', userIdOf('editor')), topic('p-other', 'u-other')] } })
    const run = await runRead(() => import('../server/api/posts/mine.get'), {
      who: 'editor',
      door,
      globals: { requireCommunityPermission: permission.requireCommunityPermission },
    })
    expect(run.status).toBe(200)
    const rows = (run.body as { rows: Array<{ $id: string }> }).rows
    expect(rows.map(row => row.$id)).toEqual(['p-own'])
    // Gelesen wird über die Operator-Klinke (begründet in der Route) — nur
    // die Beitrags-Tabelle, nur lesend.
    expect(operatorCalls(door.calls).every(call => call.table === POSTS_TABLE && call.method === 'list')).toBe(true)
  })
})

// ── Kategorien-Verwaltung ───────────────────────────────────────────────────

describeRoleGatedRoute('GET /api/posts/categories/manage', () => import('../server/api/posts/categories/manage.get'), MANAGE)

describeRoleGatedRoute('POST /api/posts/categories', () => import('../server/api/posts/categories/index.post'), MANAGE, {
  body: { name: 'Neu', slug: 'neu' },
})

describeRoleGatedRoute('PATCH /api/posts/categories/:id', () => import('../server/api/posts/categories/[id].patch'), MANAGE, {
  params: { id: 'cat-1' }, body: { name: 'Umbenannt' },
})

describeRoleGatedRoute('DELETE /api/posts/categories/:id', () => import('../server/api/posts/categories/[id].delete'), MANAGE, {
  params: { id: 'cat-1' },
})

describeRoleGatedRoute('PATCH /api/posts/categories/order', () => import('../server/api/posts/categories/order.patch'), MANAGE, {
  body: { ids: ['cat-1'] },
})

describeRoleGatedRoute('POST /api/posts/categories/translate', () => import('../server/api/posts/categories/translate.post'), MANAGE, {
  body: { locale: 'en', name: 'Hilfe' },
  globals: {
    // Technik hinter dem Tor: Modell-Konfiguration und KI-Aufruf.
    getEffectiveAiConfig: async () => ({ model: 'test-model' }),
    aiCompleteJson: async () => ({ name: 'Help', description: '' }),
  },
})

// ── Vertrauensstufen ────────────────────────────────────────────────────────

describeRoleGatedRoute('GET /api/posts/trust-levels', () => import('../server/api/posts/trust-levels/index.get'), APPOINT)

describeRoleGatedRoute('PATCH /api/posts/trust-levels/:userId', () => import('../server/api/posts/trust-levels/[userId].patch'), APPOINT, {
  params: { userId: 'u-target' },
  body: { leader: true },
  globals: {
    // Der echte Layer-Helfer (er öffnet die Datentür). Sein Modul legt beim
    // Laden einen Zwischenspeicher an — der Core-Baustein dafür ist zur
    // Testzeit ein Global und wird deshalb vor dem Laden gesetzt.
    setTrustLevelLeader: async (...args: unknown[]) => {
      vi.stubGlobal('createMicrocache', createMicrocache)
      const { setTrustLevelLeader } = await import('../server/utils/trustLevel')
      return setTrustLevelLeader(...(args as Parameters<typeof setTrustLevelLeader>))
    },
  },
})
