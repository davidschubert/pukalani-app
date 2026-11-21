import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requireTurnstile, __resetTurnstileWarnings } from '../../../packages/core/server/utils/turnstile'

/**
 * DIE ERSTGESPRÄCH-ANFRAGE (OPS-009, N14).
 *
 * `POST /api/intro-call` ist öffentlich: keine Anmeldung, keine Rolle. Geprüft
 * werden die Schutz-Stufen, die die Route SELBST trägt, am echten Handler:
 *  1. Eingabe-Prüfung (Zod, Auswahl-Schlüssel aus dem Vertrag) — ungültig ⇒
 *     abgelehnt, keine Mail, keine Zeile,
 *  2. der Honigtopf — gefüllt ⇒ freundliche Antwort, keine Mail, keine Zeile,
 *  3. beide Zustellwege tot ⇒ 500 `delivery_failed` statt eines falschen „ok",
 *  4. die Bot-Prüfung (Turnstile, Aktion `portfolio_intro_call`, NF1 b) mit
 *     dem ECHTEN `requireTurnstile` des Core — mit Schlüsseln und ohne Token
 *     abgelehnt vor Mail und Zeile, ohne Schlüssel ein No-op.
 * Die Bremse (5/min je Adresse) sitzt in der Core-Middleware und läuft hier
 * nicht mit. Nitros Auto-Imports sind Globals; `sendMail` und die Ablage sind
 * Spione.
 */

interface ThrownLike { status?: number, statusText?: string, data?: { code?: string } }

function makeError(init: Record<string, unknown>): Error {
  return Object.assign(new Error(String(init.statusText ?? 'Error')), init)
}

const load = () => import('../server/api/intro-call.post')

let mails: unknown[] = []
let rows: Array<{ tableId: string, data: Record<string, unknown> }> = []
let mailWorks = true
let rowWorks = true
/** Leer = aus (wie heute auf dem Server), beide gesetzt = an. */
let turnstileKeys = { site: '', secret: '' }
const siteverify = vi.fn()

const VALID = {
  goals: ['brand-design', 'unsure'],
  projectType: 'new',
  budget: 'open',
  teamSize: 'solo',
  currentSetup: 'none',
  timing: 'exploring',
  name: 'Probe Person',
  company: 'Probe GmbH',
  email: 'probe@example.test',
  locale: 'de',
}

beforeEach(() => {
  mails = []
  rows = []
  mailWorks = true
  rowWorks = true
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
  vi.stubGlobal('useRuntimeConfig', () => ({
    turnstileSecret: turnstileKeys.secret,
    public: { appwriteDatabaseId: 'main', turnstileSiteKey: turnstileKeys.site },
  }))
  vi.stubGlobal('trustedClientIp', () => '203.0.113.7')
  vi.stubGlobal('$fetch', siteverify)
  vi.stubGlobal('requireTurnstile', requireTurnstile)
  vi.stubGlobal('useAppConfig', () => ({ pukalani: { brand: { name: 'Testmarke' } } }))
  vi.stubGlobal('sendMail', async (_event: unknown, mail: unknown) => {
    mails.push(mail)
    return mailWorks
  })
  vi.stubGlobal('createAdminClient', () => ({
    tablesDB: {
      createRow: async (args: { tableId: string, data: Record<string, unknown> }) => {
        if (!rowWorks) throw new Error('row write failed')
        rows.push({ tableId: args.tableId, data: args.data })
        return { $id: 'row-1' }
      },
    },
  }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function post(body: unknown): Promise<{ status: number, result?: unknown, error?: ThrownLike }> {
  const handler = (await load()).default as unknown as (event: unknown) => Promise<unknown>
  try {
    return { status: 200, result: await handler({ body, context: {} }) }
  }
  catch (thrown) {
    const error = thrown as ThrownLike
    return { status: error.status ?? 500, error }
  }
}

describe('POST /api/intro-call (öffentliches Formular)', () => {
  it('gültige Anfrage: eine Mail und eine Zeile in intro_requests', async () => {
    const run = await post(VALID)
    expect(run.status, run.error?.statusText).toBe(200)
    expect(run.result).toEqual({ ok: true })
    expect(mails).toHaveLength(1)
    expect(rows.map(row => row.tableId)).toEqual(['intro_requests'])
    // Rahmen (Q06): Betreiber-Mail auf Deutsch, ohne Namen, Schluss mit der Marke.
    const text = (mails[0] as { text: string }).text
    expect(text.startsWith('Hallo,\n\n')).toBe(true)
    expect(text).toContain('Viele Grüße\nTestmarke')
  })

  it.each([
    ['ohne E-Mail', { ...VALID, email: undefined }],
    ['E-Mail ungültig', { ...VALID, email: 'keine-adresse' }],
    ['unbekanntes Ziel', { ...VALID, goals: ['erfunden'] }],
    ['kein Ziel', { ...VALID, goals: [] }],
    ['unbekannter Projekttyp', { ...VALID, projectType: 'erfunden' }],
    ['unbekanntes Feld', { ...VALID, extra: 'x' }],
    ['Name zu lang', { ...VALID, name: 'x'.repeat(121) }],
  ])('%s: 400, keine Mail, keine Zeile', async (_label, body) => {
    const run = await post(body)
    expect(run.status).toBe(400)
    expect(mails).toEqual([])
    expect(rows).toEqual([])
  })

  it('Honigtopf gefüllt: freundliche Antwort, keine Mail, keine Zeile', async () => {
    const run = await post({ ...VALID, website: 'https://spam.example.test' })
    expect(run.status).toBe(200)
    expect(run.result).toEqual({ ok: true })
    expect(mails).toEqual([])
    expect(rows).toEqual([])
  })

  it('Mail tot, Zeile geschrieben: ok (ein Zustellweg genügt)', async () => {
    mailWorks = false
    const run = await post(VALID)
    expect(run.status).toBe(200)
    expect(rows).toHaveLength(1)
  })

  it('beide Zustellwege tot: 500 delivery_failed', async () => {
    mailWorks = false
    rowWorks = false
    const run = await post(VALID)
    expect(run.status).toBe(500)
    expect(run.error?.data?.code).toBe('delivery_failed')
  })

})

describe('POST /api/intro-call: Bot-Prüfung (Turnstile, NF1 b)', () => {
  it('ohne Schlüssel: die Anfrage geht durch wie vorher — ohne Token, ohne Gegenprüfung', async () => {
    const run = await post(VALID)
    expect(run.status, run.error?.statusText).toBe(200)
    expect(run.result).toEqual({ ok: true })
    expect(mails).toHaveLength(1)
    expect(rows).toHaveLength(1)
    expect(siteverify).not.toHaveBeenCalled()
  })

  it('mit Schlüsseln und ohne Token: 403 bot_check_required, keine Mail, keine Zeile', async () => {
    turnstileKeys = { site: 'site', secret: 'secret' }
    const run = await post(VALID)
    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('bot_check_required')
    expect(mails).toEqual([])
    expect(rows).toEqual([])
    expect(siteverify).not.toHaveBeenCalled()
  })

  it('mit Schlüsseln und abgelehntem Token: 403 bot_check_failed, keine Mail, keine Zeile', async () => {
    turnstileKeys = { site: 'site', secret: 'secret' }
    siteverify.mockResolvedValue({ 'success': false, 'error-codes': ['invalid-input-response'] })
    const run = await post({ ...VALID, turnstileToken: 'token-aus-dem-widget' })
    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('bot_check_failed')
    expect(mails).toEqual([])
    expect(rows).toEqual([])
  })

  it('mit Schlüsseln und einem Token des Erstgesprächs von branding.supply: abgelehnt', async () => {
    turnstileKeys = { site: 'site', secret: 'secret' }
    siteverify.mockResolvedValue({ 'success': true, 'action': 'intro_call', 'error-codes': [] })
    const run = await post({ ...VALID, turnstileToken: 'token-aus-dem-widget' })
    expect(run.status).toBe(403)
    expect(mails).toEqual([])
    expect(rows).toEqual([])
  })

  it('Cloudflare nicht erreichbar: 503 bot_check_unavailable, keine Mail, keine Zeile', async () => {
    turnstileKeys = { site: 'site', secret: 'secret' }
    siteverify.mockRejectedValue(new Error('timeout'))
    const run = await post({ ...VALID, turnstileToken: 'token-aus-dem-widget' })
    expect(run.status).toBe(503)
    expect(run.error?.data?.code).toBe('bot_check_unavailable')
    expect(mails).toEqual([])
    expect(rows).toEqual([])
  })

  it('mit Schlüsseln und bestätigtem Token der Aktion portfolio_intro_call: Mail und Zeile', async () => {
    turnstileKeys = { site: 'site', secret: 'secret' }
    siteverify.mockResolvedValue({ 'success': true, 'action': 'portfolio_intro_call', 'error-codes': [] })
    const run = await post({ ...VALID, turnstileToken: 'token-aus-dem-widget' })
    expect(run.status, run.error?.statusText).toBe(200)
    expect(mails).toHaveLength(1)
    expect(rows).toHaveLength(1)
    expect(siteverify).toHaveBeenCalledTimes(1)
    // Der Token landet nicht in der Zeile.
    expect(rows[0]?.data).not.toHaveProperty('turnstileToken')
  })

  it('der Honigtopf antwortet auch mit Schlüsseln still mit Erfolg — ohne Gegenprüfung', async () => {
    turnstileKeys = { site: 'site', secret: 'secret' }
    const run = await post({ ...VALID, website: 'gefüllt' })
    expect(run.status).toBe(200)
    expect(mails).toEqual([])
    expect(rows).toEqual([])
    expect(siteverify).not.toHaveBeenCalled()
  })
})
