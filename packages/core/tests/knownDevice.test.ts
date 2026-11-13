import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRateLimitStore } from '../server/utils/rateLimitStore'
import type { RateLimitStore } from '../server/utils/rateLimitStore'

/**
 * BEKANNTES GERÄT (P29) — das Merkzeichen selbst (pure Funktionen) und seine
 * Wirkung auf die Konto-Bremse aus SEC-003, gegen den echten Helfer und den
 * echten Memory-Store. Gestubbt sind nur die Nitro-/h3-Globals.
 */

interface FakeRes {
  statusCode: number
  listeners: (() => void)[]
  once: (name: string, fn: () => void) => void
}

interface FakeEvent {
  headers: Record<string, string | number>
  cookies: Record<string, string>
  setCookies: Record<string, { value: string, options: Record<string, unknown> }>
  node: { res: FakeRes }
}

interface RateLimitedError extends Error {
  status: number
}

type Device = typeof import('../server/utils/knownDevice')
type Attempts = typeof import('../server/utils/accountAttempts')

const SERVER_SECRET = 'test-appwrite-key-0123456789'
let store: RateLimitStore
let device: Device
let attempts: Attempts

beforeAll(async () => {
  vi.stubGlobal('useRateLimitStore', () => ({ store, prefix: 'rl:test:' }))
  vi.stubGlobal('setHeader', (event: FakeEvent, name: string, value: string | number) => {
    event.headers[name] = value
  })
  vi.stubGlobal('createError', (input: { status: number, statusText: string }) =>
    Object.assign(new Error(input.statusText), { status: input.status }))
  vi.stubGlobal('logEvent', vi.fn())
  vi.stubGlobal('useRuntimeConfig', () => ({ appwriteKey: SERVER_SECRET }))
  vi.stubGlobal('getCookie', (event: FakeEvent, name: string) => event.cookies[name])
  vi.stubGlobal('setCookie', (event: FakeEvent, name: string, value: string, options: Record<string, unknown>) => {
    event.setCookies[name] = { value, options }
  })
  device = await import('../server/utils/knownDevice')
  attempts = await import('../server/utils/accountAttempts')
})

afterAll(() => {
  vi.unstubAllGlobals()
})

function fakeEvent(cookie?: string): FakeEvent {
  const res: FakeRes = {
    statusCode: 200,
    listeners: [],
    once(name, fn) {
      if (name === 'finish') res.listeners.push(fn)
    },
  }
  return { headers: {}, cookies: cookie ? { [device.KNOWN_DEVICE_COOKIE]: cookie } : {}, setCookies: {}, node: { res } }
}

const NOW = Date.parse('2026-11-13T10:00:00Z')

describe('Merkzeichen (pur)', () => {
  const key = () => device.deriveKnownDeviceKey(SERVER_SECRET)!
  const issue = (over: Partial<{ deviceId: string, email: string, userId: string, expiresAt: number }> = {}) =>
    device.issueKnownDeviceToken(key(), { deviceId: 'dev1abc', email: 'a@b.de', userId: 'u1', expiresAt: NOW + 60_000, ...over })

  it('ohne Server-Geheimnis gibt es keinen Schlüssel (fail-closed)', () => {
    expect(device.deriveKnownDeviceKey('')).toBeNull()
    expect(device.deriveKnownDeviceKey(undefined)).toBeNull()
  })

  it('gültig: Geräte-Kennung und Marken kommen zurück, passend zu E-Mail (login) und userId (otp/mfa)', () => {
    const payload = device.verifyKnownDeviceToken(key(), issue(), NOW)
    expect(payload?.deviceId).toBe('dev1abc')
    expect(device.knownDeviceMatches(key(), payload!, 'login', ' A@B.de ')).toBe(true)
    expect(device.knownDeviceMatches(key(), payload!, 'otp', 'u1')).toBe(true)
    expect(device.knownDeviceMatches(key(), payload!, 'mfa', 'u1')).toBe(true)
  })

  it('verrät weder Adresse noch userId', () => {
    const token = issue({ email: 'opfer@example.com', userId: 'userid-klartext' })
    expect(token).not.toContain('opfer')
    expect(token).not.toContain('example')
    expect(token).not.toContain('userid-klartext')
  })

  it('verändert: jede geänderte Stelle bricht die Signatur', () => {
    const token = issue()
    const parts = token.split('.')
    // Geräte-Kennung getauscht (fremden Topf wählen)
    expect(device.verifyKnownDeviceToken(key(), [parts[0], 'anderes', ...parts.slice(2)].join('.'), NOW)).toBeNull()
    // Ablauf verlängert
    expect(device.verifyKnownDeviceToken(key(), [parts[0], parts[1], (NOW + 9e9).toString(36), ...parts.slice(3)].join('.'), NOW)).toBeNull()
    // Signatur verändert
    const sig = parts[5]!
    const flipped = `${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`
    expect(device.verifyKnownDeviceToken(key(), [...parts.slice(0, 5), flipped].join('.'), NOW)).toBeNull()
  })

  it('abgelaufen', () => {
    expect(device.verifyKnownDeviceToken(key(), issue({ expiresAt: NOW - 1 }), NOW)).toBeNull()
  })

  it('anderes Konto: die Marken passen nicht', () => {
    const payload = device.verifyKnownDeviceToken(key(), issue(), NOW)!
    expect(device.knownDeviceMatches(key(), payload, 'login', 'c@d.de')).toBe(false)
    expect(device.knownDeviceMatches(key(), payload, 'mfa', 'u2')).toBe(false)
    // Die E-Mail-Marke taugt nicht als userId-Marke und umgekehrt.
    expect(device.knownDeviceMatches(key(), payload, 'otp', 'a@b.de')).toBe(false)
  })

  it('anderer Schlüssel (andere App, rotierter Schlüssel)', () => {
    const other = device.deriveKnownDeviceKey('anderer-schluessel')!
    expect(device.verifyKnownDeviceToken(other, issue(), NOW)).toBeNull()
  })

  // Die Fälle als Fabriken: die Tabelle wird beim SAMMELN gelesen, das Modul
  // ist erst in beforeAll geladen.
  it.each<[string, () => unknown]>([
    ['leer', () => ''],
    ['kein String', () => 42],
    ['zu wenige Teile', () => 'v1.a.b'],
    ['falsche Version', () => issue().replace(/^v1\./, 'v2.')],
    ['fremde Zeichen', () => `${issue()}!`],
    ['riesig', () => 'v1.'.padEnd(2000, 'a')],
  ])('kaputtes Format: %s', (_name, token) => {
    expect(device.verifyKnownDeviceToken(key(), token(), NOW)).toBeNull()
  })
})

describe('rememberKnownDevice', () => {
  it('setzt ein httpOnly-, lax-Cookie mit 180 Tagen Laufzeit', () => {
    const event = fakeEvent()
    device.rememberKnownDevice(event as never, { email: 'a@b.de', userId: 'u1' })
    const set = event.setCookies[device.KNOWN_DEVICE_COOKIE]!
    expect(set.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' })
    const days = ((set.options.expires as Date).getTime() - Date.now()) / 86_400_000
    expect(Math.round(days)).toBe(180)
    expect(device.knownDeviceId(fakeEvent(set.value) as never, 'login', 'a@b.de')).toMatch(/^[\w-]{22}$/)
  })

  it('dasselbe Konto behält seine Geräte-Kennung, ein anderes Konto ersetzt sie', () => {
    const first = fakeEvent()
    device.rememberKnownDevice(first as never, { email: 'a@b.de', userId: 'u1' })
    const token = first.setCookies[device.KNOWN_DEVICE_COOKIE]!.value
    const id = device.knownDeviceId(fakeEvent(token) as never, 'login', 'a@b.de')

    const again = fakeEvent(token)
    device.rememberKnownDevice(again as never, { email: 'A@b.de', userId: 'u1' })
    expect(device.knownDeviceId(fakeEvent(again.setCookies[device.KNOWN_DEVICE_COOKIE]!.value) as never, 'otp', 'u1')).toBe(id)

    const other = fakeEvent(token)
    device.rememberKnownDevice(other as never, { email: 'c@d.de', userId: 'u2' })
    const replaced = other.setCookies[device.KNOWN_DEVICE_COOKIE]!.value
    expect(device.knownDeviceId(fakeEvent(replaced) as never, 'login', 'a@b.de')).toBeNull()
    expect(device.knownDeviceId(fakeEvent(replaced) as never, 'login', 'c@d.de')).not.toBe(id)
  })
})

describe('Konto-Bremse mit bekanntem Gerät', () => {
  beforeEach(() => {
    store = createMemoryRateLimitStore()
  })

  function tokenFor(email: string, userId: string): string {
    const event = fakeEvent()
    device.rememberKnownDevice(event as never, { email, userId })
    return event.setCookies[device.KNOWN_DEVICE_COOKIE]!.value
  }

  /** Ein vollständiger Fehlversuch; `null` = durchgelassen, sonst der Status. */
  async function failedAttempt(account: string, cookie?: string, scope: 'login' | 'otp' | 'mfa' = 'login'): Promise<number | null> {
    const event = fakeEvent(cookie)
    try {
      await attempts.limitAccountAttempts(event as never, scope, account)
    }
    catch (error) {
      return (error as RateLimitedError).status
    }
    event.node.res.statusCode = 401
    for (const fn of event.node.res.listeners.splice(0)) fn()
    return null
  }

  it('(a) für Fremde pausiert — dieselbe Anfrage MIT gültigem Merkzeichen kommt durch', async () => {
    const cookie = tokenFor('opfer@example.com', 'u-opfer')
    for (let i = 0; i < attempts.ACCOUNT_ATTEMPT_MAX; i++) expect(await failedAttempt('opfer@example.com')).toBeNull()
    expect(await failedAttempt('opfer@example.com')).toBe(429)
    expect(await failedAttempt('opfer@example.com', cookie)).toBeNull()
    // Auch für den zweiten Schritt (userId) gilt der eigene Topf.
    for (let i = 0; i <= attempts.ACCOUNT_ATTEMPT_MAX; i++) await failedAttempt('u-opfer', undefined, 'mfa')
    expect(await failedAttempt('u-opfer', undefined, 'mfa')).toBe(429)
    expect(await failedAttempt('u-opfer', cookie, 'mfa')).toBeNull()
  })

  it('(b) das bekannte Gerät ist selbst gedeckelt und füllt den gemeinsamen Topf nicht', async () => {
    const cookie = tokenFor('a@b.de', 'u1')
    for (let i = 0; i < attempts.ACCOUNT_ATTEMPT_MAX; i++) expect(await failedAttempt('a@b.de', cookie)).toBeNull()
    expect(await failedAttempt('a@b.de', cookie)).toBe(429)
    // Der gemeinsame Topf ist unberührt: ein Fremder hat noch alle Versuche.
    for (let i = 0; i < attempts.ACCOUNT_ATTEMPT_MAX; i++) expect(await failedAttempt('a@b.de')).toBeNull()
    expect(await failedAttempt('a@b.de')).toBe(429)
  })

  it('(c) ein gefälschtes oder fremdes Merkzeichen zählt im gemeinsamen Topf', async () => {
    const fremd = tokenFor('c@d.de', 'u2')
    const parts = tokenFor('a@b.de', 'u1').split('.')
    const gefaelscht = [parts[0], 'eigener-topf', ...parts.slice(2)].join('.')
    for (let i = 0; i < attempts.ACCOUNT_ATTEMPT_MAX / 2; i++) {
      expect(await failedAttempt('a@b.de', fremd)).toBeNull()
      expect(await failedAttempt('a@b.de', gefaelscht)).toBeNull()
    }
    expect(await failedAttempt('a@b.de')).toBe(429)
    expect(await failedAttempt('a@b.de', fremd)).toBe(429)
    expect(await failedAttempt('a@b.de', gefaelscht)).toBe(429)
  })
})

/** (d) Wer das Merkzeichen setzt — und wo nicht (Quelltext lesen). */
function routeSource(path: string): string {
  return readFileSync(new URL(`../server/api/auth/${path}`, import.meta.url), 'utf8')
}

describe('Merkzeichen in den Auth-Routen', () => {
  it.each(['login.post.ts', 'otp/verify.post.ts', 'mfa/challenge.post.ts', 'signup.post.ts'])('%s ruft rememberKnownDevice', (path) => {
    expect(routeSource(path)).toContain('rememberKnownDevice(event, {')
  })

  it.each(['login.post.ts', 'otp/verify.post.ts'])('%s setzt es NICHT, solange ein zweiter Faktor aussteht', (path) => {
    const quelle = routeSource(path)
    const weiche = quelle.indexOf('secondFactorPending(')
    const zweig = quelle.indexOf('mfaRequired: true }', weiche)
    expect(weiche).toBeGreaterThan(-1)
    expect(zweig).toBeGreaterThan(weiche)
    // Genau ein Aufruf, und der steht HINTER dem Zweig „zweiter Faktor steht aus".
    expect(quelle.split('rememberKnownDevice(').length - 1).toBe(1)
    expect(quelle.indexOf('rememberKnownDevice(')).toBeGreaterThan(zweig)
  })

  it('die MFA-Challenge setzt es erst nach gelöster Challenge', () => {
    const quelle = routeSource('mfa/challenge.post.ts')
    expect(quelle.indexOf('rememberKnownDevice(')).toBeGreaterThan(quelle.indexOf('updateMFAChallenge('))
  })
})
