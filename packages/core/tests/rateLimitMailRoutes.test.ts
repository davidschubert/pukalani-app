import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRateLimitStore } from '../server/utils/rateLimitStore'
import type { RateLimitStore } from '../server/utils/rateLimitStore'

/**
 * MAIL-ROUTEN: STUNDE JE IP + NOTBREMSE (Vorfall 2026-10-27).
 *
 * 209 Spam-Verifizierungsmails von EINER IP im 20-Sekunden-Takt — knapp unter
 * dem 5/min-Deckel, den `rateLimitRoutes.test.ts` als LISTE prüft. Hier geht es
 * um das VERHALTEN, deshalb ruft der Test den echten Handler auf. Die
 * Nitro-Auto-Imports, an denen er hängt, sind als Globals gestubbt (das ist die
 * „halbe Attrappe", die der Nachbartest scheut) — bewusst nur die sieben, die
 * die Middleware wirklich anfasst; gezählt wird mit dem ECHTEN Memory-Store,
 * die Zeit läuft über Fake-Timer (der Store liest `Date.now()`).
 */

interface FakeEvent {
  method: string
  path: string
  ip: string
  context: Record<string, unknown>
  headers: Record<string, string | number>
  node: { res: { statusCode: number, once: (name: string, fn: () => void) => void } }
}

interface RateLimitedError extends Error {
  status: number
  data: { code: string }
}

let store: RateLimitStore
const logEvent = vi.fn()
let handler: (event: FakeEvent) => Promise<void>

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('getRequestURL', (event: FakeEvent) => new URL(`http://localhost${event.path}`))
  vi.stubGlobal('trustedClientIp', (event: FakeEvent) => event.ip)
  vi.stubGlobal('useRateLimitStore', () => ({ store, prefix: 'rl:test:' }))
  vi.stubGlobal('setHeader', (event: FakeEvent, name: string, value: string | number) => {
    event.headers[name] = value
  })
  vi.stubGlobal('createError', (input: { status: number, statusText: string, data: { code: string } }) =>
    Object.assign(new Error(input.statusText), { status: input.status, data: input.data }))
  vi.stubGlobal('logEvent', logEvent)
  const mod = await import('../server/middleware/05.rate-limit')
  handler = mod.default as unknown as (event: FakeEvent) => Promise<void>
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-27T01:00:00Z'))
  store = createMemoryRateLimitStore()
  logEvent.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

function fakeEvent(ip: string, path = '/api/auth/signup', method = 'POST'): FakeEvent {
  return {
    method,
    path,
    ip,
    context: {},
    headers: {},
    node: { res: { statusCode: 200, once: () => {} } },
  }
}

/** Ein Aufruf: `null` = durchgelassen, sonst die 429 samt Retry-After. */
async function call(event: FakeEvent): Promise<{ status: number, code: string, retryAfter: number } | null> {
  try {
    await handler(event)
    return null
  }
  catch (error) {
    const e = error as RateLimitedError
    return { status: e.status, code: e.data.code, retryAfter: Number(event.headers['Retry-After']) }
  }
}

describe('Mail-Routen: Stundenfenster je IP', () => {
  it('lässt den 20-s-Takt des Vorfalls 20-mal durch und blockt den 21. — obwohl das Minutenfenster frei ist', async () => {
    for (let i = 1; i <= 20; i++) {
      expect(await call(fakeEvent('203.0.113.7')), `Signup ${i}`).toBeNull()
      vi.advanceTimersByTime(20_000)
    }
    // Das Minutenfenster sieht in diesem Takt höchstens drei Anfragen — es
    // allein hätte (wie in der Nacht) nie gegriffen.
    const blocked = await call(fakeEvent('203.0.113.7'))
    expect(blocked).toEqual({ status: 429, code: 'rate_limited', retryAfter: expect.any(Number) })
    // Retry-After stammt aus dem STUNDEN-Fenster (Rest von 3600 s nach 400 s),
    // nicht aus dem Minutenfenster.
    expect(blocked?.retryAfter).toBeGreaterThan(60)
    expect(blocked?.retryAfter).toBeLessThanOrEqual(3_600 - 400)
  })

  it('gibt die IP nach Ablauf der Stunde wieder frei', async () => {
    for (let i = 0; i < 20; i++) {
      await call(fakeEvent('203.0.113.7'))
      vi.advanceTimersByTime(20_000)
    }
    expect(await call(fakeEvent('203.0.113.7'))).not.toBeNull()
    vi.advanceTimersByTime(3_600_000)
    expect(await call(fakeEvent('203.0.113.7'))).toBeNull()
  })

  it('zählt je Route — die Registrierung leert das Budget von „Passwort vergessen" nicht', async () => {
    for (let i = 0; i < 20; i++) {
      await call(fakeEvent('203.0.113.7'))
      vi.advanceTimersByTime(20_000)
    }
    expect(await call(fakeEvent('203.0.113.7'))).not.toBeNull()
    expect(await call(fakeEvent('203.0.113.7', '/api/auth/recovery'))).toBeNull()
  })

  it('lässt das Minutenfenster weiter zuerst greifen (6. Anfrage in derselben Minute)', async () => {
    for (let i = 0; i < 5; i++) expect(await call(fakeEvent('203.0.113.7'))).toBeNull()
    const blocked = await call(fakeEvent('203.0.113.7'))
    expect(blocked?.status).toBe(429)
    expect(blocked?.retryAfter).toBeLessThanOrEqual(60)
  })
})

describe('Mail-Routen: Notbremse über alle IPs', () => {
  it('blockt die 61. Registrierung der Stunde, auch von einer frischen IP, und meldet das EINMAL', async () => {
    for (let i = 1; i <= 60; i++) {
      expect(await call(fakeEvent(`198.51.100.${i}`)), `Signup ${i}`).toBeNull()
    }
    const blocked = await call(fakeEvent('192.0.2.200'))
    expect(blocked).toEqual({ status: 429, code: 'rate_limited', retryAfter: expect.any(Number) })
    expect(blocked?.retryAfter).toBeGreaterThan(60)
    expect(logEvent).toHaveBeenCalledTimes(1)
    expect(logEvent).toHaveBeenCalledWith('warn', 'auth.mail_route_breaker', { route: 'POST /api/auth/signup' })

    // Weitere Treffer im selben Fenster: weiter 429, aber KEINE zweite Log-Zeile.
    expect(await call(fakeEvent('192.0.2.201'))).not.toBeNull()
    expect(logEvent).toHaveBeenCalledTimes(1)
  })

  it('ist je Route getrennt — eine volle Registrierungs-Bremse sperrt die Passwort-Mail nicht', async () => {
    for (let i = 1; i <= 61; i++) await call(fakeEvent(`198.51.100.${i}`))
    expect(await call(fakeEvent('192.0.2.200', '/api/auth/recovery'))).toBeNull()
  })

  it('zählt nur, was die IP-Fenster durchgelassen haben — eine gesperrte IP leert den Eimer nicht', async () => {
    // Eine IP schickt 30 Anfragen im 20-s-Takt: 20 kommen durch, 10 prallen am
    // Stundenfenster ab und dürfen die Notbremse NICHT füllen.
    for (let i = 0; i < 30; i++) {
      await call(fakeEvent('203.0.113.7'))
      vi.advanceTimersByTime(20_000)
    }
    // Im Eimer liegen also 20 — noch 40 andere IPs passen hinein, die 41. nicht.
    for (let i = 1; i <= 40; i++) {
      expect(await call(fakeEvent(`198.51.100.${i}`)), `fremde IP ${i}`).toBeNull()
    }
    expect((await call(fakeEvent('192.0.2.200')))?.status).toBe(429)
  })

  it('lässt Routen außerhalb der Mail-Liste unberührt (Login zählt nur Fehlversuche)', async () => {
    for (let i = 1; i <= 61; i++) await call(fakeEvent(`198.51.100.${i}`))
    expect(await call(fakeEvent('192.0.2.200', '/api/auth/login'))).toBeNull()
  })
})

describe('Gast-Mail-Formulare: dieselben Fenster je Bucket', () => {
  it('Erstgespräch (brand:intro-call): 5/min, dann Stundenfenster — die 21. der Stunde bekommt 429', async () => {
    for (let i = 0; i < 20; i++) {
      if (i > 0 && i % 5 === 0) vi.advanceTimersByTime(61_000)
      expect(await call(fakeEvent('203.0.113.9', '/api/brand/intro-call'))).toBeNull()
    }
    vi.advanceTimersByTime(61_000)
    const blocked = await call(fakeEvent('203.0.113.9', '/api/brand/intro-call'))
    expect(blocked?.status).toBe(429)
    expect(blocked?.code).toBe('rate_limited')
    // Ein anderes Gast-Formular derselben IP ist davon nicht betroffen.
    expect(await call(fakeEvent('203.0.113.9', '/api/insights/public/newsletter/subscribe'))).toBeNull()
  })

  it('Notbremse je Bucket: die 61. Warteliste-Anfrage der Stunde über viele IPs bekommt 429', async () => {
    for (let i = 0; i < 60; i++) {
      expect(await call(fakeEvent(`198.51.100.${i}`, '/api/brand/waitlist'))).toBeNull()
    }
    const blocked = await call(fakeEvent('198.51.100.200', '/api/brand/waitlist'))
    expect(blocked?.status).toBe(429)
    expect(logEvent).toHaveBeenCalledWith('warn', 'auth.mail_route_breaker', { route: 'brand:waitlist' })
  })

  it('Schreib-Routen ohne Mail (Kommentar) bekommen kein Stundenfenster', async () => {
    for (let i = 0; i < 25; i++) {
      if (i > 0 && i % 5 === 0) vi.advanceTimersByTime(61_000)
      expect(await call(fakeEvent('203.0.113.10', '/api/comments'))).toBeNull()
    }
  })
})
