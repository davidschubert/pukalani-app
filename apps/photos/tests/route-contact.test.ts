import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requireTurnstile, __resetTurnstileWarnings } from '../../../packages/core/server/utils/turnstile'

/**
 * DAS KONTAKT-FORMULAR (OPS-009, N14).
 *
 * `POST /api/contact` ist öffentlich: keine Anmeldung, keine Rolle. Geprüft
 * werden die Schutz-Stufen, die die Route SELBST trägt, am echten Handler:
 *  1. Eingabe-Prüfung (Zod) — ungültig ⇒ abgelehnt, nichts versendet,
 *  2. der Honigtopf — gefüllt ⇒ freundliche Antwort, nichts versendet,
 *  3. die Bot-Prüfung (Turnstile, Aktion `photos_contact`) mit dem ECHTEN
 *     `requireTurnstile` des Core — mit Schlüsseln und ohne Token abgelehnt,
 *     ohne Schlüssel ein No-op,
 *  4. ohne eingerichteten Mail-Versand ⇒ 503, nichts versendet.
 * Die Bremse je Adresse (3 Nachrichten in 10 Minuten) sitzt seit NF1 b in der
 * Core-Middleware und läuft hier nicht mit — ihr Beweis ist
 * `packages/core/tests/rateLimitPhotosContact.test.ts`.
 * Nitros Auto-Imports sind Globals; `sendMail` und Cloudflares Gegenprüfung
 * (`$fetch`) sind Spione.
 */

interface ThrownLike { status?: number, statusText?: string }

function makeError(init: Record<string, unknown>): Error {
  return Object.assign(new Error(String(init.statusText ?? 'Error')), init)
}

const load = () => import('../server/api/contact.post')

let mails: Array<{ to: string, subject: string, text: string }> = []
let mailerReady = true
/** Leer = aus (wie heute auf dem Server), beide gesetzt = an. */
let turnstileKeys = { site: '', secret: '' }
const siteverify = vi.fn()

const VALID = { name: 'Probe Person', email: 'probe@example.test', message: 'Eine Anfrage zur Probe.' }

beforeEach(() => {
  mails = []
  mailerReady = true
  turnstileKeys = { site: '', secret: '' }
  siteverify.mockReset()
  __resetTurnstileWarnings()
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('createError', makeError)
  vi.stubGlobal('logEvent', () => {})
  vi.stubGlobal('readValidatedBody', async (event: { body: unknown }, parse: (b: unknown) => unknown) => {
    // Wie h3: ein Fehler der Prüf-Funktion wird zu 400.
    try { return parse(event.body) }
    catch { throw makeError({ status: 400, statusText: 'Validation Error' }) }
  })
  vi.stubGlobal('trustedClientIp', (event: { ip: string }) => event.ip)
  vi.stubGlobal('mailerConfigured', async () => mailerReady)
  vi.stubGlobal('useRuntimeConfig', () => ({
    contactEmail: 'inbox@example.test',
    turnstileSecret: turnstileKeys.secret,
    public: { turnstileSiteKey: turnstileKeys.site },
  }))
  vi.stubGlobal('$fetch', siteverify)
  vi.stubGlobal('requireTurnstile', requireTurnstile)
  vi.stubGlobal('useAppConfig', () => ({ pukalani: { brand: { name: 'Testmarke' } } }))
  vi.stubGlobal('sendMail', async (_event: unknown, mail: { to: string, subject: string, text: string }) => {
    mails.push(mail)
    return true
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Jede Probe nimmt eine eigene Adresse (wie vor dem Umzug der Bremse). */
let nextIp = 0
async function post(body: unknown, ip = `198.51.100.${++nextIp}`): Promise<{ status: number, result?: unknown, error?: ThrownLike }> {
  const handler = (await load()).default as unknown as (event: unknown) => Promise<unknown>
  try {
    return { status: 200, result: await handler({ body, ip, context: {} }) }
  }
  catch (thrown) {
    const error = thrown as ThrownLike
    return { status: error.status ?? 500, error }
  }
}

describe('POST /api/contact (öffentliches Formular)', () => {
  it('gültige Anfrage: genau eine Mail an die Kontakt-Adresse', async () => {
    const run = await post(VALID)
    expect(run.status, run.error?.statusText).toBe(200)
    expect(run.result).toEqual({ ok: true })
    expect(mails).toHaveLength(1)
    expect(mails[0]?.to).toBe('inbox@example.test')
    // Rahmen (Q06): englisch, ohne Namen, Schluss mit der Marke.
    expect(mails[0]?.text.startsWith('Hi,\n\n')).toBe(true)
    expect(mails[0]?.text).toContain('Best regards\nTestmarke')
  })

  it.each([
    ['ohne E-Mail', { name: 'Probe', message: 'Eine Anfrage zur Probe.' }],
    ['E-Mail ungültig', { ...VALID, email: 'keine-adresse' }],
    ['Nachricht zu kurz', { ...VALID, message: 'Hi' }],
    ['unbekanntes Feld', { ...VALID, extra: 'x' }],
  ])('%s: 400, nichts versendet', async (_label, body) => {
    const run = await post(body)
    expect(run.status).toBe(400)
    expect(mails).toEqual([])
  })

  it('Honigtopf gefüllt: freundliche Antwort, nichts versendet', async () => {
    const run = await post({ ...VALID, website: 'https://spam.example.test' })
    expect(run.status).toBe(200)
    expect(run.result).toEqual({ ok: true })
    expect(mails).toEqual([])
  })

  it('zählt nicht mehr selbst: auch die vierte Nachricht derselben Adresse geht durch (die Bremse sitzt im Core)', async () => {
    const ip = '203.0.113.7'
    for (let i = 0; i < 4; i++) expect((await post(VALID, ip)).status).toBe(200)
    expect(mails).toHaveLength(4)
  })

  it('Mail-Versand nicht eingerichtet: 503, nichts versendet', async () => {
    mailerReady = false
    const run = await post(VALID)
    expect(run.status).toBe(503)
    expect(mails).toEqual([])
  })

})

describe('POST /api/contact: Bot-Prüfung (Turnstile, NF1 b)', () => {
  it('ohne Schlüssel: das Formular geht durch wie vorher — ohne Token, ohne Gegenprüfung', async () => {
    const run = await post(VALID)
    expect(run.status, run.error?.statusText).toBe(200)
    expect(run.result).toEqual({ ok: true })
    expect(mails).toHaveLength(1)
    expect(siteverify).not.toHaveBeenCalled()
  })

  it('mit Schlüsseln und ohne Token: 403 bot_check_required, nichts versendet', async () => {
    turnstileKeys = { site: 'site', secret: 'secret' }
    const run = await post(VALID)
    expect(run.status).toBe(403)
    expect((run.error as { data?: { code?: string } } | undefined)?.data?.code).toBe('bot_check_required')
    expect(mails).toEqual([])
    expect(siteverify).not.toHaveBeenCalled()
  })

  it('mit Schlüsseln und abgelehntem Token: 403 bot_check_failed, nichts versendet', async () => {
    turnstileKeys = { site: 'site', secret: 'secret' }
    siteverify.mockResolvedValue({ 'success': false, 'error-codes': ['invalid-input-response'] })
    const run = await post({ ...VALID, turnstileToken: 'token-aus-dem-widget' })
    expect(run.status).toBe(403)
    expect((run.error as { data?: { code?: string } } | undefined)?.data?.code).toBe('bot_check_failed')
    expect(mails).toEqual([])
  })

  it('mit Schlüsseln und einem Token aus einem anderen Formular: abgelehnt', async () => {
    turnstileKeys = { site: 'site', secret: 'secret' }
    siteverify.mockResolvedValue({ 'success': true, 'action': 'intro_call', 'error-codes': [] })
    const run = await post({ ...VALID, turnstileToken: 'token-aus-dem-widget' })
    expect(run.status).toBe(403)
    expect(mails).toEqual([])
  })

  it('mit Schlüsseln und bestätigtem Token der Aktion photos_contact: durch', async () => {
    turnstileKeys = { site: 'site', secret: 'secret' }
    siteverify.mockResolvedValue({ 'success': true, 'action': 'photos_contact', 'error-codes': [] })
    const run = await post({ ...VALID, turnstileToken: 'token-aus-dem-widget' })
    expect(run.status, run.error?.statusText).toBe(200)
    expect(mails).toHaveLength(1)
    expect(siteverify).toHaveBeenCalledTimes(1)
  })

  it('der Honigtopf antwortet auch mit Schlüsseln still mit Erfolg — ohne Gegenprüfung', async () => {
    turnstileKeys = { site: 'site', secret: 'secret' }
    const run = await post({ ...VALID, website: 'gefüllt' })
    expect(run.status).toBe(200)
    expect(mails).toEqual([])
    expect(siteverify).not.toHaveBeenCalled()
  })
})
