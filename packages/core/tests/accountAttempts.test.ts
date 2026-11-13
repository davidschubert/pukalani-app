import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRateLimitStore } from '../server/utils/rateLimitStore'
import type { RateLimitStore } from '../server/utils/rateLimitStore'

/**
 * FEHLVERSUCHE JE KONTO (SEC-003) — gegen den echten Helfer, gezählt mit dem
 * echten Memory-Store. Gestubbt sind nur die Nitro-Globals, die der Helfer
 * (und der 429-Helfer aus `rateLimited.ts`) wirklich anfasst.
 */

interface FakeRes {
  statusCode: number
  listeners: (() => void)[]
  once: (name: string, fn: () => void) => void
}

interface FakeEvent {
  headers: Record<string, string | number>
  node: { res: FakeRes }
}

interface RateLimitedError extends Error {
  status: number
  data: { code: string }
}

type Helpers = typeof import('../server/utils/accountAttempts')

let store: RateLimitStore
const logEvent = vi.fn()
let mod: Helpers

beforeAll(async () => {
  vi.stubGlobal('useRateLimitStore', () => ({ store, prefix: 'rl:test:' }))
  vi.stubGlobal('setHeader', (event: FakeEvent, name: string, value: string | number) => {
    event.headers[name] = value
  })
  vi.stubGlobal('createError', (input: { status: number, statusText: string, data: { code: string } }) =>
    Object.assign(new Error(input.statusText), { status: input.status, data: input.data }))
  vi.stubGlobal('logEvent', logEvent)
  mod = await import('../server/utils/accountAttempts')
})

beforeEach(() => {
  logEvent.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

function fakeEvent(): FakeEvent {
  const res: FakeRes = {
    statusCode: 200,
    listeners: [],
    once(name, fn) {
      if (name === 'finish') res.listeners.push(fn)
    },
  }
  return { headers: {}, node: { res } }
}

function finish(event: FakeEvent, status: number): void {
  event.node.res.statusCode = status
  for (const fn of event.node.res.listeners.splice(0)) fn()
}

/** Ein Versuch: `null` = an die Prüfung durchgelassen, sonst die 429. */
async function attempt(
  event: FakeEvent,
  account: string,
  scope: 'login' | 'otp' | 'mfa' = 'login',
): Promise<{ status: number, code: string, retryAfter: number } | null> {
  try {
    await mod.limitAccountAttempts(event as never, scope, account)
    return null
  }
  catch (error) {
    const e = error as RateLimitedError
    return { status: e.status, code: e.data.code, retryAfter: Number(event.headers['Retry-After']) }
  }
}

/** Ein vollständiger Fehlversuch (durchgelassen ⇒ Route antwortet 401). */
async function failedAttempt(account: string, scope: 'login' | 'otp' | 'mfa' = 'login') {
  const event = fakeEvent()
  const result = await attempt(event, account, scope)
  if (result === null) finish(event, 401)
  return result
}

function delayedStore(ms: number): RateLimitStore {
  const base = createMemoryRateLimitStore()
  const wait = () => new Promise<void>(resolve => setTimeout(resolve, ms))
  return {
    ...base,
    hit: async (key, windowMs) => {
      await wait()
      return base.hit(key, windowMs)
    },
  }
}

describe('limitAccountAttempts', () => {
  it('lässt von 20 GLEICHZEITIGEN Fehlversuchen auf dasselbe Konto (20 verschiedene IPs) höchstens den Deckel durch', async () => {
    store = delayedStore(5)
    // Der Helfer kennt keine IP — jede Anfrage ist ein eigenes Event, wie von
    // 20 verschiedenen Adressen.
    const events = Array.from({ length: 20 }, () => fakeEvent())
    const results = await Promise.all(events.map(e => attempt(e, 'opfer@example.com')))
    const passed = events.filter((_, i) => results[i] === null)
    for (const event of passed) finish(event, 401)
    expect(passed.length).toBe(mod.ACCOUNT_ATTEMPT_MAX)
    expect(results.filter(r => r?.status === 429)).toHaveLength(20 - mod.ACCOUNT_ATTEMPT_MAX)
    expect(logEvent).toHaveBeenCalledTimes(1)
    expect(logEvent).toHaveBeenCalledWith('warn', 'auth.account_attempts_blocked', { scope: 'login' })
  })

  describe('nacheinander', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-11-13T10:00:00Z'))
      store = createMemoryRateLimitStore()
    })

    it('Erfolg bucht zurück: erfolgreiche Anmeldungen verbrauchen nichts', async () => {
      for (let i = 0; i < 20; i++) {
        const event = fakeEvent()
        expect(await attempt(event, 'a@b.de')).toBeNull()
        finish(event, 200)
      }
      for (let i = 0; i < mod.ACCOUNT_ATTEMPT_MAX; i++) expect(await failedAttempt('a@b.de')).toBeNull()
      expect((await failedAttempt('a@b.de'))?.status).toBe(429)
    })

    it('keine Dauersperre: nach dem Fenster ist das Konto frei, auch wenn währenddessen weiter angefragt wurde', async () => {
      for (let i = 0; i < mod.ACCOUNT_ATTEMPT_MAX; i++) await failedAttempt('a@b.de')
      const first = await failedAttempt('a@b.de')
      expect(first?.status).toBe(429)
      expect(first?.retryAfter).toBeGreaterThan(90)
      expect(first?.retryAfter).toBeLessThanOrEqual(mod.ACCOUNT_ATTEMPT_WINDOW_MS / 1000)

      // Während der Pause weiter anfragen: jede Minute ein Versuch.
      for (let minute = 1; minute < 15; minute++) {
        vi.advanceTimersByTime(60_000)
        expect((await failedAttempt('a@b.de'))?.status, `Minute ${minute}`).toBe(429)
      }
      vi.advanceTimersByTime(60_001)
      expect(await failedAttempt('a@b.de')).toBeNull()
      // Der Übergang wurde genau einmal gemeldet, trotz der vielen 429.
      expect(logEvent).toHaveBeenCalledTimes(1)
    })

    it('clearAccountAttempts gibt sofort frei', async () => {
      for (let i = 0; i <= mod.ACCOUNT_ATTEMPT_MAX; i++) await failedAttempt('a@b.de')
      expect((await failedAttempt('a@b.de'))?.status).toBe(429)
      await mod.clearAccountAttempts(fakeEvent() as never, 'login', 'A@B.de ')
      expect(await failedAttempt('a@b.de')).toBeNull()
    })

    it('die Scopes zählen getrennt', async () => {
      for (let i = 0; i <= mod.ACCOUNT_ATTEMPT_MAX; i++) await failedAttempt('u1', 'mfa')
      expect((await failedAttempt('u1', 'mfa'))?.status).toBe(429)
      expect(await failedAttempt('u1', 'otp')).toBeNull()
    })

    it('die 429 ist für ein existierendes und ein nicht existierendes Konto identisch', async () => {
      // Der Helfer weiss nicht, ob es das Konto gibt — und darf es auch nicht
      // verraten: dieselbe Zahl Versuche ergibt dieselbe Antwort.
      for (let i = 0; i < mod.ACCOUNT_ATTEMPT_MAX; i++) {
        await failedAttempt('gibt-es@example.com')
        await failedAttempt('gibt-es-nicht@example.com')
      }
      const a = await failedAttempt('gibt-es@example.com')
      const b = await failedAttempt('gibt-es-nicht@example.com')
      expect(a).toEqual({ status: 429, code: 'rate_limited', retryAfter: expect.any(Number) })
      expect(b).toEqual(a)
    })
  })
})

describe('accountAttemptKey', () => {
  it('enthält die E-Mail nicht im Klartext', () => {
    const key = mod.accountAttemptKey('rl:test:', 'login', 'opfer@example.com')
    expect(key).not.toContain('opfer')
    expect(key).not.toContain('example.com')
    expect(key).toMatch(/^rl:test:acct:login:[0-9a-f]{32}$/)
  })

  it('normalisiert: `A@b.de ` und `a@b.de` sind derselbe Schlüssel', () => {
    expect(mod.accountAttemptKey('p:', 'login', 'A@b.de ')).toBe(mod.accountAttemptKey('p:', 'login', 'a@b.de'))
  })

  it('verschiedene Scopes ergeben verschiedene Schlüssel (auch im Hash)', () => {
    const login = mod.accountAttemptKey('p:', 'login', 'u1')
    const otp = mod.accountAttemptKey('p:', 'otp', 'u1')
    expect(login).not.toBe(otp)
    expect(login.split(':').at(-1)).not.toBe(otp.split(':').at(-1))
  })
})

/**
 * WELCHE ROUTEN ZÄHLEN (Liste, wie `rateLimitRoutes.test.ts`): ein fehlender
 * Aufruf sieht aus wie gar nichts — die Route antwortet, nur zählt sie nicht.
 */
function routeSource(path: string): string {
  return readFileSync(new URL(`../server/api/auth/${path}`, import.meta.url), 'utf8')
}

describe('Konto-Zählung in den Auth-Routen', () => {
  it.each([
    ['login.post.ts', 'login'],
    ['otp/verify.post.ts', 'otp'],
    ['mfa/challenge.post.ts', 'mfa'],
    ['mfa/verify.post.ts', 'mfa'],
    ['mfa/disable.post.ts', 'mfa'],
  ])('%s ruft limitAccountAttempts mit Scope %s', (path, scope) => {
    expect(routeSource(path)).toMatch(new RegExp(`limitAccountAttempts\\(event, '${scope}', `))
  })

  it('die MFA-Challenge zählt auf die userId der CHALLENGE, nicht auf eine Behauptung', () => {
    const quelle = routeSource('mfa/challenge.post.ts')
    expect(quelle).toContain("limitAccountAttempts(event, 'mfa', challenge.userId)")
    expect(quelle.indexOf('limitAccountAttempts(')).toBeGreaterThan(quelle.indexOf('createMFAChallenge('))
    expect(quelle.indexOf('limitAccountAttempts(')).toBeLessThan(quelle.indexOf('updateMFAChallenge('))
  })

  it('recovery.put.ts löscht nach dem Reset den Login-Zähler — und zählt selbst nicht', () => {
    const quelle = routeSource('recovery.put.ts')
    expect(quelle).toContain("clearAccountAttempts(event, 'login', ")
    expect(quelle.indexOf('clearAccountAttempts(')).toBeGreaterThan(quelle.indexOf('updateRecovery('))
    expect(quelle).not.toContain('limitAccountAttempts(')
  })
})
