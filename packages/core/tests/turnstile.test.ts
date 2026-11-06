import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { turnstileMode } from '../shared/turnstile'

/**
 * BOT-BEWEIS (Turnstile, Vorfall 2026-10-27).
 *
 * Zwei Teile: die pure Regel (`turnstileMode`) und das Verhalten von
 * `requireTurnstile`. Für Letzteres stehen die Nitro-Auto-Imports als Globals
 * gestubbt (dasselbe Muster wie rateLimitMailRoutes.test.ts) — `$fetch` ist
 * die Attrappe für Cloudflare `siteverify`. JEDER Ablehnungs-Fall prüft den
 * Grund-Schlüssel, nicht nur den Status: 403 heißt an denselben Routen auch
 * „Registrierung zu", und das Formular braucht die Unterscheidung.
 */

describe('turnstileMode', () => {
  it('ist aus, wenn beide Schlüssel fehlen', () => {
    expect(turnstileMode('', '')).toBe('off')
  })
  it('ist an, wenn beide gesetzt sind', () => {
    expect(turnstileMode('0x4AAA-site', '0x4AAA-secret')).toBe('on')
  })
  it('ist fehlkonfiguriert mit Site-Key ohne Secret', () => {
    expect(turnstileMode('0x4AAA-site', '')).toBe('misconfigured')
  })
  it('ist fehlkonfiguriert mit Secret ohne Site-Key (Leerzeichen zählen nicht)', () => {
    expect(turnstileMode('   ', '0x4AAA-secret')).toBe('misconfigured')
  })
})

interface ShapedError extends Error {
  status: number
  data: { code: string }
}

const runtime = { turnstileSecret: '', public: { turnstileSiteKey: '' } }
const fetchMock = vi.fn()
const logEvent = vi.fn()
let requireTurnstile: (event: object, action: 'signup' | 'otp' | 'recovery', token: string | undefined) => Promise<void>
let resetWarnings: () => void

beforeAll(async () => {
  vi.stubGlobal('useRuntimeConfig', () => runtime)
  vi.stubGlobal('logEvent', logEvent)
  vi.stubGlobal('trustedClientIp', () => '203.0.113.7')
  vi.stubGlobal('$fetch', fetchMock)
  vi.stubGlobal('createError', (input: { status: number, statusText: string, data: { code: string } }) =>
    Object.assign(new Error(input.statusText), { status: input.status, data: input.data }))
  const mod = await import('../server/utils/turnstile')
  requireTurnstile = mod.requireTurnstile as unknown as typeof requireTurnstile
  resetWarnings = mod.__resetTurnstileWarnings
})

afterAll(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  runtime.turnstileSecret = 'secret'
  runtime.public.turnstileSiteKey = 'site'
  fetchMock.mockReset()
  logEvent.mockClear()
  resetWarnings()
})

async function rejection(promise: Promise<void>): Promise<{ status: number, code: string }> {
  try {
    await promise
  }
  catch (error) {
    const e = error as ShapedError
    return { status: e.status, code: e.data.code }
  }
  throw new Error('expected requireTurnstile to reject')
}

describe('requireTurnstile', () => {
  it('ist ohne Schlüssel ein No-Op — kein Aufruf bei Cloudflare, auch ohne Token', async () => {
    runtime.turnstileSecret = ''
    runtime.public.turnstileSiteKey = ''
    await expect(requireTurnstile({}, 'signup', undefined)).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it('verlangt einen Token, wenn an (403 bot_check_required, ohne Netzaufruf)', async () => {
    expect(await rejection(requireTurnstile({}, 'signup', undefined))).toEqual({ status: 403, code: 'bot_check_required' })
    expect(await rejection(requireTurnstile({}, 'otp', ''))).toEqual({ status: 403, code: 'bot_check_required' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lässt einen gültigen Token durch und schickt Secret, Token und Client-IP', async () => {
    fetchMock.mockResolvedValue({ success: true, action: 'signup', hostname: 'example.test' })
    await expect(requireTurnstile({}, 'signup', 'tok')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0] as [string, { method: string, body: Record<string, unknown>, timeout: number }]
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    expect(options.method).toBe('POST')
    expect(options.body).toEqual({ secret: 'secret', response: 'tok', remoteip: '203.0.113.7' })
    expect(options.timeout).toBe(5000)
  })

  it('lehnt success:false ab (403 bot_check_failed) und loggt die Codes', async () => {
    fetchMock.mockResolvedValue({ success: false, 'error-codes': ['invalid-input-response'] })
    expect(await rejection(requireTurnstile({}, 'recovery', 'tok'))).toEqual({ status: 403, code: 'bot_check_failed' })
    expect(logEvent).toHaveBeenCalledWith('warn', 'auth.turnstile_rejected', expect.objectContaining({ action: 'recovery', codes: ['invalid-input-response'] }))
  })

  it('lehnt einen Token aus einem ANDEREN Formular ab (action-Mismatch)', async () => {
    fetchMock.mockResolvedValue({ success: true, action: 'recovery' })
    expect(await rejection(requireTurnstile({}, 'signup', 'tok'))).toEqual({ status: 403, code: 'bot_check_failed' })
  })

  it('akzeptiert eine Antwort ohne action (Gegenprobe zum Mismatch)', async () => {
    fetchMock.mockResolvedValue({ success: true })
    await expect(requireTurnstile({}, 'otp', 'tok')).resolves.toBeUndefined()
  })

  it('ist fail-closed, wenn Cloudflare nicht erreichbar ist (503 bot_check_unavailable)', async () => {
    fetchMock.mockRejectedValue(new Error('fetch failed'))
    expect(await rejection(requireTurnstile({}, 'signup', 'tok'))).toEqual({ status: 503, code: 'bot_check_unavailable' })
    expect(logEvent).toHaveBeenCalledWith('error', 'auth.turnstile_unavailable', expect.objectContaining({ action: 'signup' }))
  })

  it('prüft bei Secret OHNE Site-Key trotzdem — und meldet es genau einmal', async () => {
    runtime.public.turnstileSiteKey = ''
    expect(await rejection(requireTurnstile({}, 'signup', undefined))).toEqual({ status: 403, code: 'bot_check_required' })
    expect(await rejection(requireTurnstile({}, 'signup', undefined))).toEqual({ status: 403, code: 'bot_check_required' })
    const misconfigured = logEvent.mock.calls.filter(call => call[1] === 'auth.turnstile_misconfigured')
    expect(misconfigured).toHaveLength(1)
    expect(misconfigured[0]?.[0]).toBe('error')
  })

  it('lässt bei Site-Key OHNE Secret durch (nichts zu prüfen), meldet es aber', async () => {
    runtime.turnstileSecret = ''
    await expect(requireTurnstile({}, 'otp', undefined)).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(logEvent).toHaveBeenCalledWith('error', 'auth.turnstile_misconfigured', expect.objectContaining({ action: 'otp' }))
  })
})
