import { describe, expect, it } from 'vitest'
import {
  MINUTE_BRAKE_FALLBACK_SEC,
  minuteBrakeWaitSec,
  startRunRespectingBrake,
} from '../scripts/lib/runStart.mjs'

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
