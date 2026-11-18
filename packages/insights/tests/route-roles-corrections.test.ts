import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeRoleGateToDoor, probeRoute, resetCommunityWorld } from '../../core/tests/support/participationHarness'
import type { Who } from '../../core/tests/support/participationHarness'
import { INSIGHTS_CORRECTIONS_TABLE } from '../shared/insightsRows'
import {
  INSIGHTS_MANAGE_ONLY,
  brandRow,
  correctionRow,
  fakeInsightsTables,
  insightsRouteGlobals,
  postRow,
} from './support/insightsRouteKit'
import type { FakeTables } from './support/insightsRouteKit'

/**
 * DER KORREKTUR-WEG — die Arbeitsliste der Redaktion und das öffentliche
 * Formular (OPS-009, BT1 b).
 *
 *  - `GET /corrections` und `POST /corrections/[id]/decision` hängen an
 *    `insights.manage`: nur der Betreiber. Die Entscheidung liest erst die
 *    Zeile und entscheidet dann — die Ablage zählt, dass eine Ablehnung VOR
 *    dem ersten Lesen kommt und eine entschiedene Zeile nicht neu geschrieben
 *    wird.
 *  - `POST /public/corrections` ist eine ÖFFENTLICHE Schreibroute ohne Konto.
 *    Statt Rollen: was sie ablehnt (Honigtopf, fremde Felder, Drossel, ein
 *    Ziel, das nicht öffentlich ist), dass sie nur eine OFFENE Zeile anlegt
 *    und dass ihre Antwort nichts aus der Ablage verrät.
 */

describeRoleGateToDoor('GET /api/insights/corrections', () => import('../server/api/insights/corrections/index.get'), INSIGHTS_MANAGE_ONLY, {
  globals: insightsRouteGlobals(),
})

describeRoleGateToDoor('POST /api/insights/corrections/[id]/decision', () => import('../server/api/insights/corrections/[id]/decision.post'), INSIGHTS_MANAGE_ONLY, {
  params: { id: 'k1' },
  body: { status: 'accepted' },
  globals: insightsRouteGlobals(),
})

function cleanup() {
  afterEach(() => {
    resetCommunityWorld()
    vi.unstubAllGlobals()
  })
}

describe('POST /api/insights/corrections/[id]/decision — Ablehnung vor dem Lesen', () => {
  cleanup()
  const load = () => import('../server/api/insights/corrections/[id]/decision.post')
  const decide = (who: Who, tables: FakeTables, body: Record<string, unknown> = { status: 'accepted' }) =>
    probeRoute(load, { who, params: { id: 'k1' }, body, globals: insightsRouteGlobals({ tablesDB: tables.tablesDB }) })

  for (const who of ['guest', 'stranger', 'removed', 'owner', 'admin', 'moderator', 'editor', 'member'] as const) {
    it(`${who}: abgelehnt, die Zeile wird weder gelesen noch geändert`, async () => {
      const tables = fakeInsightsTables([correctionRow('k1')])
      const run = await decide(who, tables)
      expect([401, 403]).toContain(run.status)
      expect(tables.reads()).toBe(0)
      expect(tables.writes()).toBe(0)
      expect(tables.rows[0]?.status).toBe('open')
    })
  }

  it('Betreiber: eine offene Korrektur wird angenommen', async () => {
    const tables = fakeInsightsTables([correctionRow('k1')])
    const run = await decide('operator', tables)
    expect(run.status).toBe(200)
    expect(tables.rows[0]?.status).toBe('accepted')
  })

  it('Betreiber: eine schon entschiedene Korrektur bleibt, wie sie ist (409)', async () => {
    const tables = fakeInsightsTables([correctionRow('k1', { status: 'declined', decisionNote: 'Stimmt so.' })])
    const run = await decide('operator', tables)
    expect(run.status).toBe(409)
    expect(run.error?.data?.code).toBe('already_decided')
    expect(tables.writes()).toBe(0)
  })
})

// ── Das öffentliche Formular ────────────────────────────────────────────────

describe('POST /api/insights/public/corrections — öffentliche Schreibroute', () => {
  cleanup()
  const load = () => import('../server/api/insights/public/corrections.post')

  const submission = (overrides: Record<string, unknown> = {}) => ({
    targetKind: 'post',
    targetId: 'p1',
    kind: 'correction',
    field: 'titleDe',
    proposed: 'Richtiger Titel',
    ...overrides,
  })

  const seed = () => fakeInsightsTables([
    postRow('p1', { state: 'published' }),
    postRow('p2', { state: 'draft' }),
    postRow('p3', { state: 'published', format: 'ranking', ranking: { issue: 1, asOf: '2026-09-01', entries: [] } }),
    brandRow('b1', { state: 'published' }),
    brandRow('b2', { state: 'draft' }),
    correctionRow('k-fremd', { targetKind: 'post', targetId: 'p1', ipHash: 'hash-fremd', contactEmail: 'fremde-person@example.test' }),
  ])

  const submit = (tables: FakeTables, body: Record<string, unknown>, extra: { publicFormats?: readonly string[], who?: Who, hits?: number } = {}) => {
    const globals = insightsRouteGlobals({ tablesDB: tables.tablesDB, publicFormats: extra.publicFormats ?? ['article', 'profile'] })
    if (extra.hits !== undefined) {
      const count = extra.hits
      globals.useRateLimitStore = () => ({ prefix: '', store: { hit: async () => ({ count, resetInMs: 60_000 }) } })
    }
    return probeRoute(load, { who: extra.who ?? 'guest', body, globals })
  }

  const correctionsIn = (tables: FakeTables) => tables.rows.filter(row => row.$tableId === INSIGHTS_CORRECTIONS_TABLE)

  it('ein veröffentlichter Beitrag: genau eine OFFENE Zeile, die Antwort ist nur { ok: true }', async () => {
    const tables = seed()
    const run = await submit(tables, submission())
    expect(run.status).toBe(200)
    expect(run.result).toEqual({ ok: true })
    const created = correctionsIn(tables).filter(row => row.$id !== 'k-fremd')
    expect(created).toHaveLength(1)
    expect(created[0]?.status).toBe('open')
    expect(created[0]?.decisionNote).toBe('')
  })

  it('ein Feld, das dem Formular nicht gehört (`status`), wird abgelehnt — nichts geschrieben', async () => {
    const tables = seed()
    const run = await submit(tables, submission({ status: 'accepted' }))
    expect(run.status).not.toBe(200)
    expect(tables.writes()).toBe(0)
  })

  it('ein Entfernungs-Wunsch ohne Grund wird abgelehnt — nichts geschrieben', async () => {
    const tables = seed()
    const run = await submit(tables, submission({ kind: 'removal', field: '', proposed: '' }))
    expect(run.status).not.toBe(200)
    expect(tables.writes()).toBe(0)
  })

  it('Honigtopf: dieselbe Antwort, aber weder gelesen noch geschrieben', async () => {
    const tables = seed()
    const run = await submit(tables, submission({ hp: 'bot' }))
    expect(run.result).toEqual({ ok: true })
    expect(tables.reads()).toBe(0)
    expect(tables.writes()).toBe(0)
  })

  it('Drossel: 429 vor dem ersten Lesen', async () => {
    const tables = seed()
    const run = await submit(tables, submission(), { hits: 4 })
    expect(run.status).toBe(429)
    expect(tables.reads()).toBe(0)
    expect(tables.writes()).toBe(0)
  })

  for (const [label, body, formats] of [
    ['ein Beitrags-Entwurf', submission({ targetId: 'p2' }), undefined],
    ['eine unbekannte Id', submission({ targetId: 'gibt-es-nicht' }), undefined],
    ['ein Marken-Entwurf', submission({ targetKind: 'brand', targetId: 'b2' }), undefined],
    ['ein veröffentlichter Beitrag, dessen Format zu ist', submission({ targetId: 'p3' }), undefined],
    ['eine veröffentlichte Marke, wenn Profile zu sind', submission({ targetKind: 'brand', targetId: 'b1' }), ['article']],
  ] as const) {
    it(`${label}: 404 target_not_found, nichts geschrieben, nichts verraten`, async () => {
      const tables = seed()
      const run = await submit(tables, body, { publicFormats: formats })
      expect(run.status).toBe(404)
      expect(run.error?.data?.code).toBe('target_not_found')
      expect(tables.writes()).toBe(0)
      expect(JSON.stringify(run.error?.data)).not.toContain('INTERN')
    })
  }

  it('eine veröffentlichte Marke: angenommen', async () => {
    const tables = seed()
    const run = await submit(tables, submission({ targetKind: 'brand', targetId: 'b1' }))
    expect(run.result).toEqual({ ok: true })
  })

  it('zweiter Vorschlag desselben Anschlusses zum selben Ziel: 409 — der fremde offene Vorschlag zählt nicht und wird nicht verraten', async () => {
    const tables = seed()
    const first = await submit(tables, submission())
    expect(first.result).toEqual({ ok: true })
    const second = await submit(tables, submission())
    expect(second.status).toBe(409)
    expect(second.error?.data?.code).toBe('correction_open')
    expect(JSON.stringify(second.error ?? {})).not.toContain('fremde-person')
    expect(correctionsIn(tables)).toHaveLength(2)
  })

  it('angemeldet ändert nichts: auch der Betreiber legt nur eine offene Zeile an', async () => {
    const tables = seed()
    const run = await submit(tables, submission(), { who: 'operator' })
    expect(run.result).toEqual({ ok: true })
    const created = correctionsIn(tables).filter(row => row.$id !== 'k-fremd')
    expect(created.map(row => row.status)).toEqual(['open'])
  })
})
