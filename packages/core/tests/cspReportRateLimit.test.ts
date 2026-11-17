import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRateLimitStore } from '../server/utils/rateLimitStore'
import type { RateLimitStore } from '../server/utils/rateLimitStore'
import { CSP_REPORT_PATH } from '../shared/cspReport'

/**
 * DIE BREMSE VOR DER BERICHTE-ANNAHME (SE1 a, 2026-11-17).
 *
 * Geprüft wird die echte Middleware (`05.rate-limit.ts`), nicht ihre Liste:
 * 30 Berichte je Anschluss und Minute kommen durch, der nächste nicht —
 * auch wenn alle GLEICHZEITIG eintreffen. Und: der Topf ist ein eigener, ein
 * Schwall Berichte braucht die Fehler-Annahme daneben nicht auf.
 */

interface FakeEvent {
  method: string
  path: string
  ip: string
  context: Record<string, unknown>
  headers: Record<string, string | number>
  node: { res: { statusCode: number, once: (name: string, fn: () => void) => void } }
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
  handler = (await import('../server/middleware/05.rate-limit')).default as unknown as (event: FakeEvent) => Promise<void>
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-17T01:00:00Z'))
  store = createMemoryRateLimitStore()
})

afterEach(() => {
  vi.useRealTimers()
})

function fakeEvent(ip: string, path: string): FakeEvent {
  return { method: 'POST', path, ip, context: {}, headers: {}, node: { res: { statusCode: 204, once: () => {} } } }
}

async function status(event: FakeEvent): Promise<number> {
  try {
    await handler(event)
    return 204
  }
  catch (error) {
    return (error as { status: number }).status
  }
}

describe('Bremse: POST /api/telemetry/csp-report', () => {
  it('40 gleichzeitige Berichte eines Anschlusses ⇒ 30 kommen durch, 10 bekommen 429', async () => {
    const results = await Promise.all(Array.from({ length: 40 }, () => status(fakeEvent('203.0.113.7', CSP_REPORT_PATH))))
    expect(results.filter(code => code === 204)).toHaveLength(30)
    expect(results.filter(code => code === 429)).toHaveLength(10)
  })

  it('ein anderer Anschluss ist davon nicht betroffen, und nach einer Minute ist der Topf wieder offen', async () => {
    for (let i = 0; i < 30; i++) await status(fakeEvent('203.0.113.7', CSP_REPORT_PATH))
    expect(await status(fakeEvent('203.0.113.7', CSP_REPORT_PATH))).toBe(429)
    expect(await status(fakeEvent('203.0.113.8', CSP_REPORT_PATH))).toBe(204)
    vi.advanceTimersByTime(61_000)
    expect(await status(fakeEvent('203.0.113.7', CSP_REPORT_PATH))).toBe(204)
  })

  it('eigener Topf: aufgebrauchte Berichte bremsen die Fehler-Annahme nicht', async () => {
    for (let i = 0; i < 31; i++) await status(fakeEvent('203.0.113.7', CSP_REPORT_PATH))
    expect(await status(fakeEvent('203.0.113.7', '/api/telemetry/error'))).toBe(204)
  })
})
