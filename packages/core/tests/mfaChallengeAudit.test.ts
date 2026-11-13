import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * DER FEHLVERSUCH BEIM ZWEITEN FAKTOR GEHÖRT EINEM KONTO (KE2, 2026-11-13).
 *
 * Bis dahin fragte die Route nach einem falschen Code `account.get()`, um zu
 * erfahren, wessen Fehlversuch das war — mit einer halben Session antwortet
 * Appwrite darauf aber IMMER 401. Die Kennung war also stets leer und im
 * Protokoll entstand keine Zeile (lokal gemessen mit
 * `packages/onboarding/scripts/verify-account-events.mjs`). Das eine Signal,
 * für das es `user.mfa_challenge_failed` gibt — jemand mit gültigem Passwort
 * rät am zweiten Faktor —, sah damit niemand.
 *
 * Der Test baut genau diesen Zustand nach: `account.get()` WIRFT, und der
 * Eintrag muss trotzdem das Konto tragen, das die Challenge belegt.
 */
const createMFAChallenge = vi.fn()
const updateMFAChallenge = vi.fn()
const accountGet = vi.fn()
const getSession = vi.fn()
const logAuthEvent = vi.fn()
const limitAccountAttempts = vi.fn()

vi.mock('../server/lib/appwrite', () => ({
  createSessionClient: () => ({
    account: { createMFAChallenge, updateMFAChallenge, get: accountGet, getSession },
  }),
}))

type Handler = (event: object) => Promise<{ ok: boolean }>
let handler: Handler

class AppwriteLikeError extends Error {
  constructor(public type: string, public code = 401) {
    super(type)
  }
}

beforeEach(async () => {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('readValidatedBody', async () => ({ mode: 'totp', code: '123456' }))
  vi.stubGlobal('createError', (input: { status: number, statusText: string, data?: unknown }) =>
    Object.assign(new Error(input.statusText), input))
  vi.stubGlobal('logAuthEvent', logAuthEvent)
  vi.stubGlobal('limitAccountAttempts', limitAccountAttempts)

  for (const mock of [createMFAChallenge, updateMFAChallenge, accountGet, getSession, logAuthEvent, limitAccountAttempts]) {
    mock.mockReset()
  }
  createMFAChallenge.mockResolvedValue({ $id: 'challenge-1', userId: 'user-from-challenge' })
  // So verhält sich Appwrite, solange der zweite Faktor fehlt.
  accountGet.mockRejectedValue(new AppwriteLikeError('user_more_factors_required'))

  vi.resetModules()
  handler = (await import('../server/api/auth/mfa/challenge.post')).default as unknown as Handler
})

describe('mfa/challenge — Fehlversuch im Protokoll', () => {
  it('schreibt den Fehlversuch MIT dem Konto aus der Challenge', async () => {
    updateMFAChallenge.mockRejectedValue(new AppwriteLikeError('user_invalid_token'))

    await expect(handler({})).rejects.toMatchObject({ status: 401, data: { code: 'mfa_invalid_code' } })

    expect(logAuthEvent).toHaveBeenCalledTimes(1)
    const [, action, opts] = logAuthEvent.mock.calls[0]!
    expect(action).toBe('user.mfa_challenge_failed')
    expect(opts).toMatchObject({ userId: 'user-from-challenge', method: 'totp' })
  })

  it('hängt dafür NICHT an `account.get()` — das antwortet hier 401', async () => {
    // Gegenprobe zum alten Weg: selbst wenn die Abfrage des Kontos scheitert
    // (und das tut sie mit einer halben Session immer), bleibt die Kennung
    // gesetzt und nicht leer.
    updateMFAChallenge.mockRejectedValue(new AppwriteLikeError('user_invalid_token'))

    await expect(handler({})).rejects.toBeTruthy()

    expect(logAuthEvent.mock.calls[0]![2].userId).not.toBe('')
    expect(accountGet).not.toHaveBeenCalled()
  })

  it('nimmt dieselbe Kennung wie die Konto-Bremse', async () => {
    updateMFAChallenge.mockRejectedValue(new AppwriteLikeError('user_invalid_token'))

    await expect(handler({})).rejects.toBeTruthy()

    expect(limitAccountAttempts.mock.calls[0]![2]).toBe('user-from-challenge')
    expect(logAuthEvent.mock.calls[0]![2].userId).toBe(limitAccountAttempts.mock.calls[0]![2])
  })

  it('schreibt bei einem ANDEREN Fehler keinen Fehlversuch', async () => {
    // Abgelaufene Challenge, Appwrite nicht erreichbar: das ist kein falscher
    // Code, und ein Eintrag „falscher Code" wäre eine falsche Anschuldigung.
    updateMFAChallenge.mockRejectedValue(new AppwriteLikeError('general_unknown', 500))

    await expect(handler({})).rejects.toMatchObject({ status: 401 })

    expect(logAuthEvent).not.toHaveBeenCalled()
  })

  it('schreibt ohne belegte Challenge gar nichts', async () => {
    // Kein Cookie oder kein zweiter Faktor fällig: es gibt kein Konto, dem
    // man etwas zuschreiben könnte.
    createMFAChallenge.mockRejectedValue(new AppwriteLikeError('user_unauthorized'))

    await expect(handler({})).rejects.toMatchObject({ status: 401 })

    expect(logAuthEvent).not.toHaveBeenCalled()
    expect(limitAccountAttempts).not.toHaveBeenCalled()
  })

  it('der erfolgreiche Weg schreibt weiter die Anmeldung, keinen Fehlversuch', async () => {
    updateMFAChallenge.mockResolvedValue({})
    accountGet.mockResolvedValue({ $id: 'user-from-challenge', name: 'Test' })
    getSession.mockResolvedValue({ factors: ['password', 'totp'] })

    await expect(handler({})).resolves.toEqual({ ok: true })

    expect(logAuthEvent).toHaveBeenCalledTimes(1)
    expect(logAuthEvent.mock.calls[0]![1]).toBe('user.login')
  })
})
