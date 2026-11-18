import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRateLimitStore } from '../server/utils/rateLimitStore'
import type { RateLimitStore } from '../server/utils/rateLimitStore'

/**
 * DAS KONTAKTFORMULAR VON apps/photos ZÄHLT IM BREMSEN-SPEICHER (NF1 b).
 *
 * Bis 2026-11-18 zählte `apps/photos/server/api/contact.post.ts` selbst, in
 * einer `Map` im Speicher des Prozesses — ohne den Redis-Weg des Core und ohne
 * Stundenfenster. Jetzt steht die Route in `WRITE_LIMITED` (Bucket
 * `photos:contact`, 3 je 10 Minuten und IP) und in den Gast-Mail-Eimern.
 * Dieser Test ruft den echten Handler (Muster: `rateLimitFailureRoutes.test.ts`).
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

function fakeEvent(ip: string): FakeEvent {
  return {
    method: 'POST',
    path: '/api/contact',
    ip,
    context: {},
    headers: {},
    node: { res: { statusCode: 200, once: () => {} } },
  }
}

async function call(event: FakeEvent): Promise<{ status: number, retryAfter: number } | null> {
  try {
    await handler(event)
    return null
  }
  catch (error) {
    const e = error as RateLimitedError
    return { status: e.status, retryAfter: Number(event.headers['Retry-After']) }
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

describe('POST /api/contact (apps/photos) im Bremsen-Speicher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-18T10:00:00Z'))
    store = createMemoryRateLimitStore()
  })

  it('lässt drei Nachrichten je IP durch, die vierte bekommt 429 mit dem Zehn-Minuten-Fenster', async () => {
    for (let i = 0; i < 3; i++) {
      expect(await call(fakeEvent('203.0.113.20')), `Nachricht ${i + 1}`).toBeNull()
    }
    const blocked = await call(fakeEvent('203.0.113.20'))
    expect(blocked?.status).toBe(429)
    // Das Fenster ist zehn Minuten lang, nicht die Minute der Core-Vorgabe.
    expect(blocked?.retryAfter).toBeGreaterThan(60)
    expect(blocked?.retryAfter).toBeLessThanOrEqual(600)
  })

  it('zählt je IP — eine zweite Adresse hat ihr eigenes Budget', async () => {
    for (let i = 0; i < 3; i++) await call(fakeEvent('203.0.113.21'))
    expect((await call(fakeEvent('203.0.113.21')))?.status).toBe(429)
    expect(await call(fakeEvent('203.0.113.22'))).toBeNull()
  })

  it('nach zehn Minuten ist das Fenster wieder offen', async () => {
    for (let i = 0; i < 3; i++) await call(fakeEvent('203.0.113.23'))
    expect((await call(fakeEvent('203.0.113.23')))?.status).toBe(429)
    vi.setSystemTime(new Date('2026-11-18T10:10:01Z'))
    expect(await call(fakeEvent('203.0.113.23'))).toBeNull()
  })

  it('hängt an der Notbremse der Gast-Mail-Eimer: die 61. Nachricht der Stunde über alle IPs bekommt 429', async () => {
    for (let i = 0; i < 60; i++) {
      expect(await call(fakeEvent(`198.51.100.${i + 1}`)), `IP ${i + 1}`).toBeNull()
    }
    expect((await call(fakeEvent('198.51.100.200')))?.status).toBe(429)
  })
})

describe('POST /api/contact: gleichzeitige Anfragen', () => {
  it('lässt von 10 GLEICHZEITIGEN Anfragen einer IP höchstens 3 an die Route', async () => {
    store = delayedStore(5)
    const results = await Promise.all(Array.from({ length: 10 }, () => call(fakeEvent('203.0.113.24'))))
    const passed = results.filter(r => r === null).length
    const blocked = results.filter(r => r?.status === 429).length
    expect({ passed, blocked }).toEqual({ passed: 3, blocked: 7 })
  })
})
