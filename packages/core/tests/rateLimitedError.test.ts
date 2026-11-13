import { describe, expect, it } from 'vitest'
import { isRateLimited, rateLimitRetrySeconds, rateLimitWait } from '../app/utils/fetchError'

/**
 * G7 — die Minuten-Sperre muss sich als solche zu erkennen geben.
 *
 * Vorher warf `05.rate-limit.ts` eine nackte 429, und jedes Auth-Formular
 * schrieb daraufhin seinen allgemeinen Satz („Passwort falsch", „bitte erneut
 * versuchen"). Diese zwei Helfer sind die ganze Erkennung; sie sind hier
 * festgenagelt, weil beide Quellen (Envelope-`reason`, `Retry-After`-Header)
 * unabhängig voneinander wegbrechen können.
 */
function fetchErrorLike(init: {
  reason?: string
  statusCode?: number
  retryAfter?: string
}) {
  const headers = new Headers()
  if (init.retryAfter !== undefined) headers.set('Retry-After', init.retryAfter)
  return {
    data: init.reason ? { ok: false, code: 'TOO_MANY_REQUESTS', reason: init.reason } : undefined,
    statusCode: init.statusCode,
    response: { headers },
  }
}

describe('isRateLimited', () => {
  it('erkennt den Grund aus dem Envelope', () => {
    expect(isRateLimited(fetchErrorLike({ reason: 'rate_limited', statusCode: 429 }))).toBe(true)
  })

  it('erkennt eine 429 auch ohne unseren Grund (fremder Proxy)', () => {
    expect(isRateLimited(fetchErrorLike({ statusCode: 429 }))).toBe(true)
    expect(isRateLimited({ status: 429 })).toBe(true)
  })

  it('hält andere Fehler heraus — sonst hieße jeder Fehlversuch „gesperrt"', () => {
    expect(isRateLimited(fetchErrorLike({ statusCode: 401 }))).toBe(false)
    expect(isRateLimited(fetchErrorLike({ reason: 'otp_unavailable', statusCode: 503 }))).toBe(false)
    expect(isRateLimited(new Error('offline'))).toBe(false)
    expect(isRateLimited(null)).toBe(false)
    expect(isRateLimited(undefined)).toBe(false)
  })
})

describe('rateLimitRetrySeconds', () => {
  it('liest die Wartezeit aus Retry-After', () => {
    expect(rateLimitRetrySeconds(fetchErrorLike({ statusCode: 429, retryAfter: '42' }))).toBe(42)
    expect(rateLimitRetrySeconds(fetchErrorLike({ statusCode: 429, retryAfter: '1' }))).toBe(1)
  })

  it('rät NICHT, wenn der Header fehlt oder unbrauchbar ist', () => {
    // Ohne Zahl sagt die Oberfläche „warte kurz" — eine erfundene Minute wäre
    // dieselbe Sorte Unwahrheit wie das „Passwort falsch" davor.
    expect(rateLimitRetrySeconds(fetchErrorLike({ statusCode: 429 }))).toBeNull()
    expect(rateLimitRetrySeconds(fetchErrorLike({ statusCode: 429, retryAfter: '0' }))).toBeNull()
    expect(rateLimitRetrySeconds(fetchErrorLike({ statusCode: 429, retryAfter: 'Wed, 21 Oct 2026 07:28:00 GMT' }))).toBeNull()
    expect(rateLimitRetrySeconds(new Error('offline'))).toBeNull()
  })
})

describe('rateLimitWait (SEC-003: Konto-Bremse bis 15 Minuten)', () => {
  it('bleibt bis 90 Sekunden bei Sekunden', () => {
    expect(rateLimitWait(1)).toEqual({ unit: 'seconds', value: 1 })
    expect(rateLimitWait(60)).toEqual({ unit: 'seconds', value: 60 })
    expect(rateLimitWait(90)).toEqual({ unit: 'seconds', value: 90 })
  })

  it('meldet darüber Minuten, aufgerundet', () => {
    expect(rateLimitWait(91)).toEqual({ unit: 'minutes', value: 2 })
    expect(rateLimitWait(120)).toEqual({ unit: 'minutes', value: 2 })
    expect(rateLimitWait(121)).toEqual({ unit: 'minutes', value: 3 })
    expect(rateLimitWait(900)).toEqual({ unit: 'minutes', value: 15 })
  })
})
