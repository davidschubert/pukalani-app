import { describe, expect, it } from 'vitest'
import { RUN_LEASE_DETAIL_MAX, RUN_LEASE_STALL_MS } from '../../core/shared/runLease'
import {
  emptyMarketRunDetail,
  fitMarketRunDetail,
  isMarketAiEndpointUnavailable,
  marketRunInheritsBooking,
  parseMarketRunDetail,
  toMarketRunView,
} from '../shared/marketRun'

/**
 * DAS DETAIL EINES MARKTVERGLEICHS-LAUFS (GA1 P18) — pur.
 *
 * Daran hängt das Kontingent (`paid`/`booked` entscheiden, ob ein Neustart
 * nach einem Absturz einen zweiten Tageslauf kostet) und die Anzeige der
 * Seite. Beides muss aus einer kaputten oder fremden Zeile einen SICHEREN
 * Stand machen.
 */

const NOW = Date.parse('2026-11-16T12:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

describe('parseMarketRunDetail', () => {
  it('klemmt Kaputtes und Fremdes auf sichere Vorgaben', () => {
    expect(parseMarketRunDetail('')).toEqual(emptyMarketRunDetail())
    expect(parseMarketRunDetail('{kaputt')).toEqual(emptyMarketRunDetail())
    expect(parseMarketRunDetail('[1,2]')).toEqual(emptyMarketRunDetail())
    const parsed = parseMarketRunDetail(JSON.stringify({
      total: -3,
      done: 'zwei',
      phase: 'erfunden',
      paid: 'true',
      booked: 1,
      steps: [{ competitorId: 'a', status: 'quatsch', pagesRead: -1, excludedReason: 'nope' }, { name: 'ohne Id' }],
    }))
    expect(parsed).toMatchObject({ total: 0, done: 0, phase: 'fetch', paid: false, booked: false })
    expect(parsed.steps).toEqual([{ competitorId: 'a', status: 'failed', robotsChecked: false, pagesRead: 0 }])
  })

  it('`paid` zählt nur als echtes `true`', () => {
    expect(parseMarketRunDetail('{"paid":true}').paid).toBe(true)
    expect(parseMarketRunDetail('{"paid":"yes"}').paid).toBe(false)
  })
})

describe('fitMarketRunDetail', () => {
  it('lässt zuerst die Schritte fallen, nie Fortschritt und `paid`', () => {
    const huge = emptyMarketRunDetail({
      total: 5,
      done: 5,
      paid: true,
      booked: true,
      steps: Array.from({ length: 200 }, (_, index) => ({
        competitorId: `c${index}-${'x'.repeat(30)}`,
        status: 'fetched' as const,
        robotsChecked: true,
        pagesRead: 8,
      })),
    })
    expect(JSON.stringify(huge).length).toBeGreaterThan(RUN_LEASE_DETAIL_MAX)
    const fitted = fitMarketRunDetail(huge)
    expect(fitted.steps).toEqual([])
    expect(fitted).toMatchObject({ total: 5, done: 5, paid: true, booked: true })
  })

  it('lässt ein passendes Detail unverändert', () => {
    const small = emptyMarketRunDetail({ total: 1 })
    expect(fitMarketRunDetail(small)).toBe(small)
  })
})

describe('marketRunInheritsBooking', () => {
  const unpaid = JSON.stringify({ booked: true, paid: false })
  it('erbt nur von einem abgebrochenen, gebuchten, unbezahlten Lauf', () => {
    expect(marketRunInheritsBooking('stalled', unpaid)).toBe(true)
    expect(marketRunInheritsBooking('stalled', JSON.stringify({ booked: true, paid: true }))).toBe(false)
    expect(marketRunInheritsBooking('stalled', JSON.stringify({ booked: false }))).toBe(false)
    expect(marketRunInheritsBooking('stalled', '')).toBe(false)
    for (const state of ['none', 'done', 'failed', 'running'] as const) {
      expect(marketRunInheritsBooking(state, unpaid)).toBe(false)
    }
  })
})

describe('toMarketRunView', () => {
  const names = new Map([['a', 'Rösterei A']])
  const detail = JSON.stringify({
    total: 2,
    done: 1,
    phase: 'fetch',
    aiEnabled: true,
    steps: [
      { competitorId: 'a', status: 'fetched', robotsChecked: true, pagesRead: 3 },
      { competitorId: 'weg', status: 'fetched', robotsChecked: true, pagesRead: 1 },
    ],
  })

  it('kein Lauf ⇒ `none`', () => {
    expect(toMarketRunView(null, NOW, names).state).toBe('none')
  })

  it('setzt Namen dazu und lässt Schritte gelöschter Kandidaten weg', () => {
    const view = toMarketRunView({
      startedAt: iso(NOW - 1000),
      heartbeatAt: iso(NOW - 1000),
      finishedAt: '',
      outcome: '',
      detail,
    }, NOW, names)
    expect(view).toMatchObject({ state: 'running', total: 2, done: 1, aiEnabled: true, failed: false })
    expect(view.steps).toEqual([{ competitorId: 'a', name: 'Rösterei A', status: 'fetched', robotsChecked: true, pagesRead: 3 }])
  })

  it('rechnet `stalled` gegen die Server-Uhr und `failed` aus dem Ausgang', () => {
    const base = { startedAt: iso(NOW - RUN_LEASE_STALL_MS - 1), heartbeatAt: iso(NOW - RUN_LEASE_STALL_MS - 1), detail }
    expect(toMarketRunView({ ...base, finishedAt: '', outcome: '' }, NOW, names).state).toBe('stalled')
    const failed = toMarketRunView({ ...base, finishedAt: iso(NOW), outcome: 'lease_lost' }, NOW, names)
    expect(failed).toMatchObject({ state: 'failed', failed: true })
    expect(toMarketRunView({ ...base, finishedAt: iso(NOW), outcome: 'done' }, NOW, names)).toMatchObject({ state: 'done', failed: false })
  })
})

describe('isMarketAiEndpointUnavailable (KI1 d)', () => {
  it('erkennt nur den kurzen Code des Transports', () => {
    expect(isMarketAiEndpointUnavailable({ statusCode: 503, data: { code: 'ai_endpoint_unavailable' } })).toBe(true)
    expect(isMarketAiEndpointUnavailable({ statusCode: 503, statusText: 'AI not configured' })).toBe(false)
    expect(isMarketAiEndpointUnavailable({ data: { code: 'ai_disabled' } })).toBe(false)
    expect(isMarketAiEndpointUnavailable(new Error('ai_endpoint_unavailable'))).toBe(false)
    expect(isMarketAiEndpointUnavailable(null)).toBe(false)
  })

  it('die Übersicht nennt den Grund nur für genau diesen Ausgang', () => {
    const base = { startedAt: iso(NOW - 60_000), heartbeatAt: iso(NOW - 1_000), finishedAt: iso(NOW - 1_000), detail: '' }
    expect(toMarketRunView({ ...base, outcome: 'ai_endpoint_unavailable' }, NOW, new Map()))
      .toMatchObject({ state: 'failed', failed: true, failure: 'ai_endpoint_unavailable' })
    expect(toMarketRunView({ ...base, outcome: 'failed' }, NOW, new Map()).failure).toBeUndefined()
    expect(toMarketRunView({ ...base, outcome: 'done' }, NOW, new Map()).failure).toBeUndefined()
  })
})
