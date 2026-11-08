import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import {
  MAIL_BUDGET_ACCOUNT_RESERVE,
  decideMailBatch,
  readResendDailyRemaining,
} from '../shared/mailBudget'

/**
 * RS1 a — DIE MAIL-BREMSE: lesen, entscheiden, abfragen.
 *
 * Davids Entscheidung vom 2026-11-08 war „freier Tarif behalten UND bremsen".
 * Die Bremse ist damit das EINZIGE, was verhindert, dass eine Newsletter-
 * Ausgabe das Anmelde-Budget (OTP, Verifizierung) des Tages mitnimmt — sie
 * braucht deshalb zu jeder Zusage eine Gegenprobe.
 *
 * Geprüft wird:
 *  1. Die Antwort von `GET /usage` lesen — Zahl, `limit: null` (= Tarif ohne
 *     Tagesgrenze), und JEDE unlesbare Form als „unbekannt" statt als „frei".
 *  2. Die Entscheidung: voller Stapel, TEIL-Stapel, angehalten — und die
 *     Rücklage, die den Anmeldeweg freihält.
 *  3. Der Netzzugriff: ohne Schlüssel, bei Netzfehler, bei 4xx/5xx und bei
 *     unlesbarem Rumpf ist das Ergebnis `null` — und `null` BREMST.
 *
 * Die Gegenprobe zur ganzen Datei ist Test 2d: bei `'unlimited'` lässt die
 * Bremse alles durch. Ohne ihn könnte die Rechnung überall 0 liefern und
 * jeder „hält an"-Test wäre trotzdem grün.
 */

describe('readResendDailyRemaining — die Tages-Antwort lesen', () => {
  it('rechnet Grenze minus verbraucht', () => {
    expect(readResendDailyRemaining({ emails: { daily: { used: 6, limit: 100 } } })).toBe(94)
  })

  it('nennt einen Tarif OHNE Tagesgrenze `unlimited` (limit: null)', () => {
    // Das ist der Selbst-Abschalter: wechselt David auf Pro, wird die Bremse
    // von sich aus wirkungslos — ohne Rückbau im Code.
    expect(readResendDailyRemaining({ emails: { daily: { used: 4200, limit: null } } })).toBe('unlimited')
  })

  it('klemmt einen negativen Rest auf 0', () => {
    // Resend darf mehr gezählt haben als die Grenze; eine negative Zahl wäre
    // für jede Rechnung danach eine Falle.
    expect(readResendDailyRemaining({ emails: { daily: { used: 120, limit: 100 } } })).toBe(0)
  })

  it.each([
    ['null', null],
    ['ein String', 'viele'],
    ['ohne emails', { object: 'usage' }],
    ['ohne daily', { emails: { monthly: { used: 1, limit: 2 } } }],
    ['used fehlt', { emails: { daily: { limit: 100 } } }],
    ['limit fehlt', { emails: { daily: { used: 6 } } }],
    ['used ist Text', { emails: { daily: { used: '6', limit: 100 } } }],
    ['limit ist NaN', { emails: { daily: { used: 6, limit: Number.NaN } } }],
  ])('sagt „unbekannt" (null) bei: %s', (_name, payload) => {
    // GEGENPROBE zur Zeile oben: eine unlesbare Antwort ist NICHT „alles frei".
    expect(readResendDailyRemaining(payload)).toBeNull()
  })
})

describe('decideMailBatch — darf dieser Stapel raus?', () => {
  it('lässt den vollen Stapel durch, wenn genug Luft ist', () => {
    // 94 frei − 20 Rücklage = 74 ≥ 50 ⇒ voller Stapel.
    expect(decideMailBatch({ remaining: 94, batchSize: 50 })).toEqual({ go: true, allowed: 50, code: 'ok' })
  })

  it('schneidet auf den Rest zu — ein TEIL-Stapel ist der Normalfall', () => {
    // 45 frei − 20 Rücklage = 25 ⇒ 25 Mails heute, der Rest morgen.
    expect(decideMailBatch({ remaining: 45, batchSize: 50 })).toEqual({ go: true, allowed: 25, code: 'ok' })
  })

  it('hält an, wenn nur noch die Rücklage übrig ist', () => {
    expect(decideMailBatch({ remaining: MAIL_BUDGET_ACCOUNT_RESERVE, batchSize: 50 }))
      .toEqual({ go: false, allowed: 0, code: 'budget_exhausted' })
    expect(decideMailBatch({ remaining: 0, batchSize: 50 }))
      .toEqual({ go: false, allowed: 0, code: 'budget_exhausted' })
  })

  it('hält die Rücklage auch dann frei, wenn EINE Mail noch gepasst hätte', () => {
    // 20 frei: ohne Rücklage wären das 20 Ausgaben — und danach scheitert die
    // nächste Anmeldung. Genau das ist der Zweck der Zahl.
    expect(decideMailBatch({ remaining: 21, batchSize: 50 }).allowed).toBe(1)
    expect(decideMailBatch({ remaining: 20, batchSize: 50 }).go).toBe(false)
  })

  it('lässt bei `unlimited` alles durch (GEGENPROBE: die Bremse kann auch Ja sagen)', () => {
    expect(decideMailBatch({ remaining: 'unlimited', batchSize: 50 }))
      .toEqual({ go: true, allowed: 50, code: 'ok' })
  })

  it('hält bei „unbekannt" an — fail-closed', () => {
    expect(decideMailBatch({ remaining: null, batchSize: 50 }))
      .toEqual({ go: false, allowed: 0, code: 'budget_unknown' })
  })

  it('nimmt eine eigene Rücklage an', () => {
    expect(decideMailBatch({ remaining: 45, batchSize: 50, reserve: 0 }).allowed).toBe(45)
    expect(decideMailBatch({ remaining: 45, batchSize: 50, reserve: 40 }).allowed).toBe(5)
  })

  it('überschreitet die gewünschte Stapelgröße nie', () => {
    expect(decideMailBatch({ remaining: 5000, batchSize: 50 }).allowed).toBe(50)
    expect(decideMailBatch({ remaining: 'unlimited', batchSize: 7 }).allowed).toBe(7)
  })

  it('hält bei Stapelgröße 0 an, statt `allowed: 0` als Ja auszugeben', () => {
    expect(decideMailBatch({ remaining: 'unlimited', batchSize: 0 }).go).toBe(false)
  })
})

// ── Der Netzzugriff ────────────────────────────────────────────────────────

let apiKey: string
let logs: { level: string, name: string, data: Record<string, unknown> }[]

const { mailDailyRemaining } = await import('../server/utils/mailBudget')
const event = { context: {} } as unknown as H3Event

describe('mailDailyRemaining — Resend fragen, nie werfen', () => {
  // Die Nitro-Auto-Imports werden je Test NEU gestellt: `unstubAllGlobals` im
  // afterEach würde sie sonst mit `fetch` zusammen abräumen, und ab dem
  // zweiten Test wäre `useRuntimeConfig` weg (erst rot gesehen, dann so).
  beforeEach(() => {
    apiKey = 're_test_schluessel'
    logs = []
    vi.stubGlobal('useRuntimeConfig', () => ({ resendApiKey: apiKey }))
    vi.stubGlobal('logEvent', (level: string, name: string, data: Record<string, unknown> = {}) => {
      logs.push({ level, name, data })
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('liefert den Rest aus der Antwort und schickt den Schlüssel mit', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ emails: { daily: { used: 6, limit: 100 } } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)

    await expect(mailDailyRemaining(event)).resolves.toBe(94)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/usage')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_test_schluessel')
  })

  it('fragt OHNE Schlüssel gar nicht erst und meldet es EINMAL im Log', async () => {
    apiKey = ''
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(mailDailyRemaining(event)).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(logs.map(entry => entry.name)).toEqual(['mail.budget_no_key'])
  })

  it('liefert bei Netzfehler/Timeout `null` — ohne Ursachentext im Log', async () => {
    // Die fetch-Meldung darf NICHT ins Log: sie kann die Kopfzeilen zitieren,
    // und darin steht der Schlüssel.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('getaddrinfo ENOTFOUND api.resend.com') }))

    await expect(mailDailyRemaining(event)).resolves.toBeNull()
    expect(logs[0]?.name).toBe('mail.budget_unreachable')
    expect(JSON.stringify(logs)).not.toContain('ENOTFOUND')
    expect(JSON.stringify(logs)).not.toContain('re_test_schluessel')
  })

  it('liefert bei 401/429/500 `null` und protokolliert nur den Status', async () => {
    for (const status of [401, 429, 500]) {
      logs = []
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"unauthorized"}', { status })))
      await expect(mailDailyRemaining(event)).resolves.toBeNull()
      expect(logs[0]).toMatchObject({ name: 'mail.budget_http_error', data: { status } })
      // Der Rumpf ist fremder Text — er bleibt draussen.
      expect(JSON.stringify(logs)).not.toContain('unauthorized')
    }
  })

  it('liefert bei unlesbarem Rumpf `null`', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('kein json', { status: 200 })))
    await expect(mailDailyRemaining(event)).resolves.toBeNull()
    expect(logs[0]?.name).toBe('mail.budget_unreadable')
  })

  it('gibt `unlimited` weiter, wenn der Tarif keine Tagesgrenze hat', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ emails: { daily: { used: 4200, limit: null } } }), { status: 200 },
    )))
    await expect(mailDailyRemaining(event)).resolves.toBe('unlimited')
    // GEGENPROBE: der gute Fall warnt nicht.
    expect(logs).toEqual([])
  })
})
