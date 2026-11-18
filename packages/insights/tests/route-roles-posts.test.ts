import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeRoleGateToDoor, probeRoute, resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { INSIGHTS_POSTS_TABLE } from '../shared/insightsRows'
import { INSIGHTS_MANAGE_ONLY, fakeInsightsTables, insightsRouteGlobals, postRow } from './support/insightsRouteKit'

/**
 * DIE REDAKTION DER BEITRÄGE HINTER IHREM ROLLEN-TOR (OPS-009, BT1 b).
 *
 * Sechs Routen an `insights.manage` (Instanz-Recht): nur der Betreiber. Je
 * Route Gast ⇒ 401, fremdes/entferntes Konto und jede Community-Rolle ⇒ 403,
 * Datentür zu; der Betreiber erreicht sie. Entwurf und Beleg-Prüfung rufen
 * hinter der Tür ein Modell bzw. eine fremde Seite — die Probe endet VORHER
 * an der Datentür, es gibt keinen echten Aufruf.
 *
 * Dazu für das Löschen (liest erst, entscheidet dann) eine Ablage, die die
 * Zugriffe zählt: die Ablehnung kommt vor dem ersten Lesen.
 */

describeRoleGateToDoor('GET /api/insights/posts', () => import('../server/api/insights/posts/index.get'), INSIGHTS_MANAGE_ONLY, {
  globals: insightsRouteGlobals(),
})

describeRoleGateToDoor('POST /api/insights/posts', () => import('../server/api/insights/posts/index.post'), INSIGHTS_MANAGE_ONLY, {
  body: { format: 'article', baseLocale: 'de', title: 'Ein neuer Beitrag' },
  globals: insightsRouteGlobals(),
})

describeRoleGateToDoor('GET /api/insights/posts/[id]', () => import('../server/api/insights/posts/[id].get'), INSIGHTS_MANAGE_ONLY, {
  params: { id: 'p1' },
  globals: insightsRouteGlobals(),
})

describeRoleGateToDoor('DELETE /api/insights/posts/[id]', () => import('../server/api/insights/posts/[id].delete'), INSIGHTS_MANAGE_ONLY, {
  params: { id: 'p1' },
  globals: insightsRouteGlobals(),
})

describeRoleGateToDoor('POST /api/insights/posts/[id]/draft', () => import('../server/api/insights/posts/[id]/draft.post'), INSIGHTS_MANAGE_ONLY, {
  params: { id: 'p1' },
  body: { brief: 'Worum es gehen soll.' },
  globals: insightsRouteGlobals(),
})

describeRoleGateToDoor('POST /api/insights/posts/[id]/evidence', () => import('../server/api/insights/posts/[id]/evidence.post'), INSIGHTS_MANAGE_ONLY, {
  params: { id: 'p1' },
  body: { sourceIndex: 0 },
  globals: insightsRouteGlobals(),
})

describe('DELETE /api/insights/posts/[id] — Ablehnung vor dem Lesen, Zustand nach dem Lesen', () => {
  afterEach(() => {
    resetCommunityWorld()
    vi.unstubAllGlobals()
  })
  const load = () => import('../server/api/insights/posts/[id].delete')

  for (const who of ['guest', 'stranger', 'owner', 'admin', 'editor'] as const) {
    it(`${who}: abgelehnt, die Ablage wird weder gelesen noch beschrieben`, async () => {
      const tables = fakeInsightsTables([postRow('p1', { state: 'draft' })])
      const run = await probeRoute(load, { who, params: { id: 'p1' }, globals: insightsRouteGlobals({ tablesDB: tables.tablesDB }) })
      expect([401, 403]).toContain(run.status)
      expect(tables.reads()).toBe(0)
      expect(tables.writes()).toBe(0)
      expect(tables.rows).toHaveLength(1)
    })
  }

  it('Betreiber: ein Entwurf wird gelöscht', async () => {
    const tables = fakeInsightsTables([postRow('p1', { state: 'draft' })])
    const run = await probeRoute(load, { who: 'operator', params: { id: 'p1' }, globals: insightsRouteGlobals({ tablesDB: tables.tablesDB }) })
    expect(run.status).toBe(200)
    expect(run.result).toEqual({ id: 'p1', deleted: true })
    expect(tables.rows.filter(row => row.$tableId === INSIGHTS_POSTS_TABLE)).toHaveLength(0)
  })

  it('Betreiber: ein veröffentlichter Beitrag bleibt stehen (409 not_deletable)', async () => {
    const tables = fakeInsightsTables([postRow('p1', { state: 'published' })])
    const run = await probeRoute(load, { who: 'operator', params: { id: 'p1' }, globals: insightsRouteGlobals({ tablesDB: tables.tablesDB }) })
    expect(run.status).toBe(409)
    expect(run.error?.data?.code).toBe('not_deletable')
    expect(tables.writes()).toBe(0)
  })
})
