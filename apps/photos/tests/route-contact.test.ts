import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * DAS KONTAKT-FORMULAR (OPS-009, N14).
 *
 * `POST /api/contact` ist öffentlich: keine Anmeldung, keine Rolle. Geprüft
 * werden die Schutz-Stufen, die die Route SELBST trägt, am echten Handler:
 *  1. Eingabe-Prüfung (Zod) — ungültig ⇒ abgelehnt, nichts versendet,
 *  2. die eigene Bremse je Adresse (3 Nachrichten in 10 Minuten),
 *  3. der Honigtopf — gefüllt ⇒ freundliche Antwort, nichts versendet,
 *  4. ohne eingerichteten Mail-Versand ⇒ 503, nichts versendet.
 * Nitros Auto-Imports sind Globals; `sendMail` ist ein Spion.
 */

interface ThrownLike { status?: number, statusText?: string }

function makeError(init: Record<string, unknown>): Error {
  return Object.assign(new Error(String(init.statusText ?? 'Error')), init)
}

const load = () => import('../server/api/contact.post')

let mails: Array<{ to: string, subject: string, text: string }> = []
let mailerReady = true

const VALID = { name: 'Probe Person', email: 'probe@example.test', message: 'Eine Anfrage zur Probe.' }

beforeEach(() => {
  mails = []
  mailerReady = true
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
  vi.stubGlobal('useRuntimeConfig', () => ({ contactEmail: 'inbox@example.test' }))
  vi.stubGlobal('sendMail', async (_event: unknown, mail: { to: string, subject: string, text: string }) => {
    mails.push(mail)
    return true
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Jede Probe nimmt eine eigene Adresse — die Bremse der Route lebt im Modul. */
let nextIp = 0
async function post(body: unknown, ip = `198.51.100.${++nextIp}`): Promise<{ status: number, result?: unknown, error?: ThrownLike }> {
  const handler = (await load()).default as unknown as (event: unknown) => Promise<unknown>
  try {
    return { status: 200, result: await handler({ body, ip }) }
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

  it('Bremse: die vierte Nachricht derselben Adresse in 10 Minuten ⇒ 429, nicht versendet', async () => {
    const ip = '203.0.113.7'
    for (let i = 0; i < 3; i++) expect((await post(VALID, ip)).status).toBe(200)
    const fourth = await post(VALID, ip)
    expect(fourth.status).toBe(429)
    expect(mails).toHaveLength(3)
  })

  it('Mail-Versand nicht eingerichtet: 503, nichts versendet', async () => {
    mailerReady = false
    const run = await post(VALID)
    expect(run.status).toBe(503)
    expect(mails).toEqual([])
  })

  it.todo('Bot-Prüfung (Turnstile) vor dem Versand (offen)')
})
