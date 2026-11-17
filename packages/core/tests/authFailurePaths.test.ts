import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRateLimitStore } from '../server/utils/rateLimitStore'
import type { RateLimitStore } from '../server/utils/rateLimitStore'
import { AUTH_UNAVAILABLE_CODE, isAuthBackendOutage, unexpectedRecoveryFailure } from '../shared/authFailure'
import { isAuthUnavailable } from '../app/utils/fetchError'

/**
 * ZWEI FEHLERWEGE DER ANMELDUNG (AB1 d).
 *
 *  1. Die pure Regel: was ist ein Ausfall, was ein erwarteter Reset-Fehlschlag.
 *  2. Anmeldung und Code-Prüfung gegen den ECHTEN Konto-Zähler und den echten
 *     Memory-Store: ein Ausfall antwortet 503 mit Grund und zählt nicht, ein
 *     abgelehntes Geheimnis antwortet 401 und zählt.
 *  3. Die Reset-Anforderung: gleiche Antwort in jedem Fall, eine Log-Zeile nur
 *     beim unerwarteten Grund.
 */

/** Wie eine AppwriteException aussieht — mehr braucht die Regel nicht. */
function appwriteError(code: number, type: string): Error {
  return Object.assign(new Error('Appwrite sagt etwas Internes'), { code, type })
}

describe('isAuthBackendOutage', () => {
  it('ein 4xx von Appwrite ist KEIN Ausfall (das Geheimnis wurde geprüft)', () => {
    expect(isAuthBackendOutage(appwriteError(401, 'user_invalid_credentials'))).toBe(false)
    expect(isAuthBackendOutage(appwriteError(401, 'user_invalid_token'))).toBe(false)
    expect(isAuthBackendOutage(appwriteError(404, 'user_not_found'))).toBe(false)
    expect(isAuthBackendOutage(appwriteError(429, 'general_rate_limit_exceeded'))).toBe(false)
  })

  it('5xx, Netzfehler und alles ohne Status sind ein Ausfall', () => {
    expect(isAuthBackendOutage(appwriteError(500, 'general_unknown'))).toBe(true)
    expect(isAuthBackendOutage(appwriteError(502, ''))).toBe(true)
    expect(isAuthBackendOutage(appwriteError(503, 'general_service_disabled'))).toBe(true)
    expect(isAuthBackendOutage(new TypeError('fetch failed'))).toBe(true)
    expect(isAuthBackendOutage(Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }))).toBe(true)
    expect(isAuthBackendOutage(appwriteError(0, ''))).toBe(true)
    expect(isAuthBackendOutage(undefined)).toBe(true)
    expect(isAuthBackendOutage('kaputt')).toBe(true)
  })
})

describe('unexpectedRecoveryFailure', () => {
  it('unbekanntes oder gesperrtes Konto: erwartet, keine Zeile', () => {
    expect(unexpectedRecoveryFailure(appwriteError(404, 'user_not_found'))).toBeNull()
    expect(unexpectedRecoveryFailure(appwriteError(401, 'user_blocked'))).toBeNull()
  })

  it('alles andere: Typ und Status, nie die Meldung', () => {
    expect(unexpectedRecoveryFailure(appwriteError(400, 'general_argument_invalid')))
      .toEqual({ type: 'general_argument_invalid', code: 400 })
    expect(unexpectedRecoveryFailure(appwriteError(503, 'general_smtp_disabled')))
      .toEqual({ type: 'general_smtp_disabled', code: 503 })
    expect(unexpectedRecoveryFailure(new TypeError('fetch failed'))).toEqual({ type: 'unknown', code: null })
    expect(unexpectedRecoveryFailure(null)).toEqual({ type: 'unknown', code: null })
  })
})

describe('isAuthUnavailable (Client)', () => {
  it('liest den Grund aus dem Envelope, nicht den Status', () => {
    expect(isAuthUnavailable({ status: 503, data: { reason: AUTH_UNAVAILABLE_CODE } })).toBe(true)
    expect(isAuthUnavailable({ status: 503, data: { reason: 'otp_unavailable' } })).toBe(false)
    expect(isAuthUnavailable({ status: 503 })).toBe(false)
    expect(isAuthUnavailable(null)).toBe(false)
  })
})

// ── Routen ──────────────────────────────────────────────────────────────

interface FakeRes {
  statusCode: number
  listeners: (() => void)[]
  once: (name: string, fn: () => void) => void
}

interface FakeEvent {
  body: unknown
  headers: Record<string, string | number>
  context: Record<string, unknown>
  node: { res: FakeRes }
}

interface Thrown extends Error {
  status: number
  data?: { code?: string }
}

let store: RateLimitStore
const logEvent = vi.fn()
/** Was Appwrite auf die Prüfung des Geheimnisses antwortet. */
let secretCheck: () => Promise<{ secret: string, expire: string, userId: string }>
let recoveryCall: () => Promise<unknown>
const logAuthEvent = vi.fn(async () => {})

vi.mock('../server/lib/appwrite', () => ({
  createAdminClient: () => ({
    account: {
      createEmailPasswordSession: () => secretCheck(),
      createSession: () => secretCheck(),
    },
    users: {
      get: async () => ({ $id: 'user-1', email: 'person@example.com', emailVerification: true, passwordUpdate: 'x', name: 'Person' }),
      list: async () => ({ total: 1, users: [{ $id: 'user-1', name: 'Person' }] }),
    },
  }),
  createSessionClient: () => ({
    account: { get: async () => ({ $id: 'user-1' }), createRecovery: () => recoveryCall() },
  }),
  setSessionCookie: () => {},
}))
vi.mock('../server/utils/trustedOrigin', () => ({
  resolveTrustedOrigin: async () => ({ origin: 'https://community.example' }),
}))

type Handler = (event: FakeEvent) => Promise<unknown>
let login: Handler
let verify: Handler
let recovery: Handler
let attempts: typeof import('../server/utils/accountAttempts')

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('readValidatedBody', async (event: FakeEvent, parse: (body: unknown) => unknown) => parse(event.body))
  vi.stubGlobal('useRateLimitStore', () => ({ store, prefix: 'rl:test:' }))
  vi.stubGlobal('setHeader', (event: FakeEvent, name: string, value: string | number) => {
    event.headers[name] = value
  })
  vi.stubGlobal('createError', (input: { status: number, statusText: string, data?: { code?: string } }) =>
    Object.assign(new Error(input.statusText), { status: input.status, data: input.data }))
  vi.stubGlobal('logEvent', logEvent)
  vi.stubGlobal('logAuthEvent', logAuthEvent)
  vi.stubGlobal('rememberKnownDevice', () => {})
  vi.stubGlobal('useRuntimeConfig', () => ({ appwriteKey: 'test-secret' }))
  vi.stubGlobal('getCookie', () => undefined)
  vi.stubGlobal('requireTurnstile', async () => {})
  vi.stubGlobal('allowRecipientMail', async () => true)
  vi.stubGlobal('AUTH_MAIL_RECIPIENT_LIMIT', { max: 5, windowMs: 3_600_000 })
  attempts = await import('../server/utils/accountAttempts')
  vi.stubGlobal('limitAccountAttempts', attempts.limitAccountAttempts)
  vi.stubGlobal('skipAccountAttempt', attempts.skipAccountAttempt)
  login = (await import('../server/api/auth/login.post')).default as unknown as Handler
  verify = (await import('../server/api/auth/otp/verify.post')).default as unknown as Handler
  recovery = (await import('../server/api/auth/recovery.post')).default as unknown as Handler
})

beforeEach(() => {
  store = createMemoryRateLimitStore()
  logEvent.mockClear()
  logAuthEvent.mockClear()
  secretCheck = async () => ({ secret: 's', expire: '2099-01-01T00:00:00.000Z', userId: 'user-1' })
  recoveryCall = async () => ({})
})

function fakeEvent(body: unknown): FakeEvent {
  const res: FakeRes = {
    statusCode: 200,
    listeners: [],
    once(name, fn) {
      if (name === 'finish') res.listeners.push(fn)
    },
  }
  return { body, headers: {}, context: {}, node: { res } }
}

/** Route ausführen und die Antwort „abschicken" (löst die Rückbuchung aus). */
async function run(handler: Handler, body: unknown): Promise<{ status: number, code?: string }> {
  const event = fakeEvent(body)
  let status = 200
  let code: string | undefined
  try {
    await handler(event)
  }
  catch (error) {
    status = (error as Thrown).status
    code = (error as Thrown).data?.code
  }
  event.node.res.statusCode = status
  for (const fn of event.node.res.listeners.splice(0)) fn()
  // Die Rückbuchung läuft ohne `await` (`void store.refund`).
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  return { status, code }
}

const LOGIN = { email: 'person@example.com', password: 'ein-langes-passwort' }
const VERIFY = { userId: 'user-1', code: '123456' }

describe.each([
  ['POST /api/auth/login', () => login, LOGIN, 'password'],
  ['POST /api/auth/otp/verify', () => verify, VERIFY, 'otp'],
] as const)('%s — Ausfall ist kein Fehlversuch', (_name, handler, body, method) => {
  it('abgelehntes Geheimnis: 401 ohne Grund, zählt auf das Konto', async () => {
    secretCheck = async () => {
      throw appwriteError(401, 'user_invalid_credentials')
    }
    for (let i = 0; i < attempts.ACCOUNT_ATTEMPT_MAX; i++) {
      expect(await run(handler(), body)).toEqual({ status: 401, code: undefined })
    }
    expect(await run(handler(), body)).toEqual({ status: 429, code: 'rate_limited' })
    expect(logEvent).not.toHaveBeenCalledWith('error', 'auth.login_unavailable', expect.anything())
  })

  it('Appwrite nicht erreichbar: 503 mit Grund, eine Log-Zeile, das Konto bleibt frei', async () => {
    secretCheck = async () => {
      throw new TypeError('fetch failed')
    }
    for (let i = 0; i < attempts.ACCOUNT_ATTEMPT_MAX + 5; i++) {
      expect(await run(handler(), body)).toEqual({ status: 503, code: AUTH_UNAVAILABLE_CODE })
    }
    expect(logEvent).toHaveBeenCalledWith('error', 'auth.login_unavailable', { method })

    // Appwrite ist wieder da: die Anmeldung geht sofort.
    secretCheck = async () => ({ secret: 's', expire: '2099-01-01T00:00:00.000Z', userId: 'user-1' })
    expect((await run(handler(), body)).status).toBe(200)
  })

  it('ein 5xx von Appwrite zählt ebenso nicht', async () => {
    secretCheck = async () => {
      throw appwriteError(500, 'general_unknown')
    }
    for (let i = 0; i < attempts.ACCOUNT_ATTEMPT_MAX + 2; i++) {
      expect((await run(handler(), body)).status).toBe(503)
    }
  })

  it('Ausfälle heben echte Fehlversuche nicht auf', async () => {
    secretCheck = async () => {
      throw appwriteError(401, 'user_invalid_credentials')
    }
    for (let i = 0; i < attempts.ACCOUNT_ATTEMPT_MAX; i++) await run(handler(), body)
    secretCheck = async () => {
      throw new TypeError('fetch failed')
    }
    // Der Deckel ist erreicht: die Bremse steht VOR der Prüfung, auch im Ausfall.
    expect(await run(handler(), body)).toEqual({ status: 429, code: 'rate_limited' })
  })
})

describe('POST /api/auth/recovery — Log-Zeile beim unerwarteten Grund', () => {
  const ask = () => fakeEvent({ email: 'person@example.com' })

  it('verschickt: gleiche Antwort, keine Fehler-Zeile', async () => {
    expect(await recovery(ask())).toEqual({ ok: true })
    expect(logEvent).not.toHaveBeenCalled()
    expect(logAuthEvent).toHaveBeenCalledTimes(1)
  })

  it('unbekannte Adresse: gleiche Antwort, keine Zeile', async () => {
    recoveryCall = async () => {
      throw appwriteError(404, 'user_not_found')
    }
    expect(await recovery(ask())).toEqual({ ok: true })
    expect(logEvent).not.toHaveBeenCalled()
    expect(logAuthEvent).not.toHaveBeenCalled()
  })

  it('Konfigurationsgrund: gleiche Antwort, EINE Zeile mit Typ und Status — ohne Adresse und Meldung', async () => {
    recoveryCall = async () => {
      throw appwriteError(400, 'general_argument_invalid')
    }
    expect(await recovery(ask())).toEqual({ ok: true })
    expect(logEvent).toHaveBeenCalledTimes(1)
    expect(logEvent).toHaveBeenCalledWith('error', 'auth.recovery_failed', { type: 'general_argument_invalid', code: 400 })
    const logged = JSON.stringify(logEvent.mock.calls)
    expect(logged).not.toContain('person@example.com')
    expect(logged).not.toContain('Internes')
  })

  it('Appwrite nicht erreichbar: gleiche Antwort, eine Zeile', async () => {
    recoveryCall = async () => {
      throw new TypeError('fetch failed')
    }
    expect(await recovery(ask())).toEqual({ ok: true })
    expect(logEvent).toHaveBeenCalledWith('error', 'auth.recovery_failed', { type: 'unknown', code: null })
  })
})
