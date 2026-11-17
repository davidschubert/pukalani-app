import { describe, expect, it } from 'vitest'
import {
  MINUTE_BRAKE_FALLBACK_SEC,
  RUN_BUSY_REASON,
  RUN_POLL_INTERVAL_MS,
  RUN_POLL_MAX_MS,
  minuteBrakeWaitSec,
  runPollDecision,
  startRunRespectingBrake,
  waitForRun,
} from '../scripts/lib/runStart.mjs'
import { RUN_LEASE_BUSY_CODE, RUN_LEASE_POLL_MS } from '../../core/shared/runLease'

/**
 * DER ABSTAND DER BEWEIS-SKRIPTE ZUR MINUTEN-BREMSE (LL1 c) — pur.
 *
 * Die Skripte selbst laufen nur gegen einen Dev-Server mit lokaler Datenbank;
 * hier steht die Entscheidung, die sie treffen: nur die 429 der Bremse
 * (`reason: rate_limited`) wird abgewartet und EINMAL wiederholt, die 429 des
 * Tages-Kontingents nie.
 */

type Response = { status: number, json: { reason?: string } | null, headers?: Record<string, string> }

function brake(retryAfter?: string): Response {
  return { status: 429, json: { reason: 'rate_limited' }, headers: retryAfter ? { 'retry-after': retryAfter } : {} }
}

describe('minuteBrakeWaitSec', () => {
  it('nimmt `Retry-After` der Bremse, sonst 70 s', () => {
    expect(minuteBrakeWaitSec(brake('42'))).toBe(42)
    expect(minuteBrakeWaitSec(brake())).toBe(MINUTE_BRAKE_FALLBACK_SEC)
    expect(MINUTE_BRAKE_FALLBACK_SEC).toBe(70)
    expect(minuteBrakeWaitSec(brake('kaputt'))).toBe(70)
  })

  it('liest den Kopf auch aus einem `Headers`-Objekt', () => {
    expect(minuteBrakeWaitSec({ status: 429, json: { reason: 'rate_limited' }, headers: new Headers({ 'Retry-After': '9' }) })).toBe(9)
  })

  it('GEGENPROBE: Tages-Kontingent, andere Codes und Erfolg werden nicht abgewartet', () => {
    expect(minuteBrakeWaitSec({ status: 429, json: { reason: 'market_run_limit' }, headers: { 'retry-after': '3600' } })).toBeNull()
    expect(minuteBrakeWaitSec({ status: 429, json: { reason: 'market_instance_limit' } })).toBeNull()
    expect(minuteBrakeWaitSec({ status: 429, json: null })).toBeNull()
    expect(minuteBrakeWaitSec({ status: 202, json: {} })).toBeNull()
    expect(minuteBrakeWaitSec({ status: 409, json: { reason: 'run_running' } })).toBeNull()
  })
})

describe('startRunRespectingBrake', () => {
  it('wartet bei der Bremse die genannte Zeit, sagt es, und versucht es EINMAL noch', async () => {
    const answers: Response[] = [brake('12'), brake('12'), { status: 202, json: {} }]
    const lines: string[] = []
    const slept: number[] = []
    let calls = 0
    const result = await startRunRespectingBrake(async () => answers[calls++]!, {
      log: line => lines.push(line),
      sleep: async (ms) => { slept.push(ms) },
    })
    // Nur EIN zweiter Versuch: die zweite Bremse geht unverändert zurück.
    expect(calls).toBe(2)
    expect(result.status).toBe(429)
    expect(slept).toEqual([12_000])
    expect(lines).toEqual(['  … warte 12 s (Minuten-Bremse)'])
  })

  it('nach dem Warten kommt die zweite Antwort zurück', async () => {
    const answers: Response[] = [brake(), { status: 202, json: {} }]
    let calls = 0
    const result = await startRunRespectingBrake(async () => answers[calls++]!, { log: () => {}, sleep: async () => {} })
    expect(result.status).toBe(202)
  })

  it('GEGENPROBE: die 429 des Tages-Kontingents wird NICHT wiederholt', async () => {
    let calls = 0
    const slept: number[] = []
    const result = await startRunRespectingBrake(async () => {
      calls++
      return { status: 429, json: { reason: 'market_run_limit' }, headers: { 'retry-after': '60' } }
    }, { log: () => {}, sleep: async (ms) => { slept.push(ms) } })
    expect(calls).toBe(1)
    expect(slept).toEqual([])
    expect(result.json?.reason).toBe('market_run_limit')
  })
})

/**
 * AUF DEN LAUF WARTEN (LL1 c) — die pure Entscheidung, mit der
 * `market-library-compute.mjs` seit P18 den 202-Lauf abfragt.
 */
describe('runPollDecision', () => {
  const T0 = '2026-11-17T10:00:00.000Z'

  it('Takt und Grund hängen an denselben Werten wie Seite und Sperre', () => {
    expect(RUN_POLL_INTERVAL_MS).toBe(RUN_LEASE_POLL_MS)
    expect(RUN_BUSY_REASON).toBe(RUN_LEASE_BUSY_CODE)
    // Über den rund 25 min, die ein Lauf über fünf Kandidaten rechnen kann.
    expect(RUN_POLL_MAX_MS).toBeGreaterThan(25 * 60_000)
  })

  it('läuft ⇒ warten; fertig ⇒ done', () => {
    expect(runPollDecision({ state: 'running', startedAt: T0 }, { startedAt: T0, elapsedMs: 1000 })).toEqual({ action: 'wait' })
    expect(runPollDecision({ state: 'done', startedAt: T0, failed: false }, { startedAt: T0, elapsedMs: 1000 })).toEqual({ action: 'done' })
  })

  it('die Übersicht zeigt noch den VORGÄNGER ⇒ warten, auch wenn er fertig ist', () => {
    const earlier = '2026-11-17T09:00:00.000Z'
    expect(runPollDecision({ state: 'done', startedAt: earlier }, { startedAt: T0, elapsedMs: 1000 })).toEqual({ action: 'wait' })
  })

  it('nach 409 ohne eigenen Beginn zählt der jüngste Lauf', () => {
    expect(runPollDecision({ state: 'done', startedAt: T0 }, { startedAt: '', elapsedMs: 1000 })).toEqual({ action: 'done' })
  })

  it('abgebrochen, gescheitert, kein Lauf ⇒ klarer Abbruch mit Grund', () => {
    const stalled = runPollDecision({ state: 'stalled', startedAt: T0 }, { startedAt: T0, elapsedMs: 1000 })
    expect(stalled).toMatchObject({ action: 'abort', reason: expect.stringContaining('abgebrochen') })
    expect(runPollDecision({ state: 'failed', startedAt: T0, failed: true, failure: 'ai_endpoint_unavailable' }, { startedAt: T0, elapsedMs: 1 }))
      .toEqual({ action: 'abort', reason: 'gescheitert (ai_endpoint_unavailable)' })
    expect(runPollDecision({ state: 'failed', startedAt: T0, failed: true }, { startedAt: T0, elapsedMs: 1 }))
      .toEqual({ action: 'abort', reason: 'gescheitert' })
    expect(runPollDecision(null, { elapsedMs: 1 }).action).toBe('abort')
    expect(runPollDecision({ state: 'none', startedAt: '' }, { elapsedMs: 1 }).action).toBe('abort')
  })

  it('der Deckel trifft nur einen Lauf, der noch läuft', () => {
    expect(runPollDecision({ state: 'running', startedAt: T0 }, { startedAt: T0, elapsedMs: RUN_POLL_MAX_MS }))
      .toMatchObject({ action: 'abort', reason: expect.stringContaining('Deckel') })
    expect(runPollDecision({ state: 'done', startedAt: T0 }, { startedAt: T0, elapsedMs: RUN_POLL_MAX_MS })).toEqual({ action: 'done' })
  })
})

describe('waitForRun', () => {
  it('fragt im Takt nach, bis der Lauf endet, und gibt den letzten Stand zurück', async () => {
    const T0 = '2026-11-17T10:00:00.000Z'
    const answers = [
      { state: 'running', startedAt: T0 },
      { state: 'running', startedAt: T0 },
      { state: 'done', startedAt: T0, failed: false, done: 3, total: 3 },
    ]
    let reads = 0
    const slept: number[] = []
    const result = await waitForRun(async () => answers[reads++], {
      startedAt: T0,
      sleep: async (ms) => { slept.push(ms) },
      now: () => 0,
    })
    expect(result.action).toBe('done')
    expect(result.run).toMatchObject({ done: 3, total: 3 })
    expect(reads).toBe(3)
    expect(slept).toEqual([RUN_POLL_INTERVAL_MS, RUN_POLL_INTERVAL_MS, RUN_POLL_INTERVAL_MS])
  })

  it('bricht am Deckel ab, statt ewig zu fragen', async () => {
    let clock = 0
    const result = await waitForRun(async () => ({ state: 'running', startedAt: 'x' }), {
      maxMs: 20_000,
      sleep: async (ms) => { clock += ms },
      now: () => clock,
    })
    expect(result.action).toBe('abort')
    expect(clock).toBe(20_000)
  })
})
