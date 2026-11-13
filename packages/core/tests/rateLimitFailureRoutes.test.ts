import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRateLimitStore } from '../server/utils/rateLimitStore'
import type { RateLimitStore } from '../server/utils/rateLimitStore'

/**
 * FEHLVERSUCHS-ROUTEN ZÄHLEN VORAB (SEC-003).
 *
 * Bis 2026-11 las die Middleware für Login, Code-Prüfung und Zwei-Faktor nur
 * den Zählerstand und zählte erst NACH der Antwort. Gleichzeitige Anfragen
 * sahen damit alle denselben alten Stand — der Deckel „5 je Minute" hielt nur
 * für Anfragen, die schön nacheinander kamen. Dieser Test ruft den echten
 * Handler (Muster: `rateLimitMailRoutes.test.ts`) mit einem Store, dessen
 * Zugriffe echte Latenz haben, wie ein Redis über das Netz.
 */

interface FakeRes {
  statusCode: number
  listeners: (() => void)[]
  once: (name: string, fn: () => void) => void
}

interface FakeEvent {
  method: string
  path: string
  ip: string
  context: Record<string, unknown>
  headers: Record<string, string | number>
  node: { res: FakeRes }
}

interface RateLimitedError extends Error {
  status: number
  data: { code: string }
}

let store: RateLimitStore
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
  vi.stubGlobal('logEvent', vi.fn())
  const mod = await import('../server/middleware/05.rate-limit')
  handler = mod.default as unknown as (event: FakeEvent) => Promise<void>
})

afterEach(() => {
  vi.useRealTimers()
})

function fakeEvent(ip: string, path = '/api/auth/login', method = 'POST'): FakeEvent {
  const res: FakeRes = {
    statusCode: 200,
    listeners: [],
    once(name, fn) {
      if (name === 'finish') res.listeners.push(fn)
    },
  }
  return { method, path, ip, context: {}, headers: {}, node: { res } }
}

/** Die Route antwortet: Status setzen und `finish` auslösen. */
function finish(event: FakeEvent, status: number): void {
  event.node.res.statusCode = status
  for (const fn of event.node.res.listeners.splice(0)) fn()
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

/** Memory-Store mit echter Latenz je Zugriff (wie ein Redis über das Netz). */
function delayedStore(ms: number): RateLimitStore {
  const base = createMemoryRateLimitStore()
  const wait = () => new Promise<void>(resolve => setTimeout(resolve, ms))
  return {
    ...base,
    peek: async (key, windowMs) => {
      await wait()
      return base.peek(key, windowMs)
    },
    hit: async (key, windowMs) => {
      await wait()
      return base.hit(key, windowMs)
    },
  }
}

describe('Fehlversuchs-Routen: gleichzeitige Anfragen (SEC-003)', () => {
  it('lässt von 20 GLEICHZEITIGEN Fehlversuchen einer IP höchstens 5 an die Route', async () => {
    store = delayedStore(5)
    const events = Array.from({ length: 20 }, () => fakeEvent('203.0.113.7'))
    const results = await Promise.all(events.map(call))
    const passed = events.filter((_, i) => results[i] === null)
    // Die Route lehnt jeden durchgelassenen Versuch ab (falsches Passwort).
    for (const event of passed) finish(event, 401)

    const blocked = results.filter(r => r?.status === 429)
    expect({ passed: passed.length, blocked: blocked.length }).toEqual({ passed: 5, blocked: 15 })
  })
})

describe('Fehlversuchs-Routen: nacheinander', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-13T10:00:00Z'))
    store = createMemoryRateLimitStore()
  })

  it('Erfolg bucht zurück: fünf erfolgreiche Anmeldungen verbrauchen nichts', async () => {
    for (let i = 0; i < 5; i++) {
      const event = fakeEvent('203.0.113.8')
      expect(await call(event), `Anmeldung ${i + 1}`).toBeNull()
      finish(event, 200)
    }
    // Das volle Budget von fünf Fehlversuchen steht danach noch zur Verfügung.
    for (let i = 0; i < 5; i++) {
      const event = fakeEvent('203.0.113.8')
      expect(await call(event), `Fehlversuch ${i + 1}`).toBeNull()
      finish(event, 401)
    }
    expect((await call(fakeEvent('203.0.113.8')))?.status).toBe(429)
  })

  it('der 6. Fehlversuch in der Minute bekommt 429 mit Retry-After', async () => {
    for (let i = 0; i < 5; i++) {
      const event = fakeEvent('203.0.113.9')
      expect(await call(event)).toBeNull()
      finish(event, 401)
    }
    const blocked = await call(fakeEvent('203.0.113.9'))
    expect(blocked).toEqual({ status: 429, code: 'rate_limited', retryAfter: expect.any(Number) })
    expect(blocked?.retryAfter).toBeGreaterThan(0)
    expect(blocked?.retryAfter).toBeLessThanOrEqual(60)
  })

  it('GET /api/auth/site-session wird gezählt (der Eintrag war vor SEC-003 wirkungslos)', async () => {
    for (let i = 0; i < 5; i++) {
      const event = fakeEvent('203.0.113.10', '/api/auth/site-session', 'GET')
      expect(await call(event)).toBeNull()
      finish(event, 400)
    }
    expect((await call(fakeEvent('203.0.113.10', '/api/auth/site-session', 'GET')))?.status).toBe(429)
  })

  it('eine ungelistete GET-Route bleibt frei', async () => {
    for (let i = 0; i < 200; i++) {
      const event = fakeEvent('203.0.113.11', '/api/posts', 'GET')
      expect(await call(event)).toBeNull()
      finish(event, 404)
    }
  })
})
