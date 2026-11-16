import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { ConsentConfig } from '../shared/consent'

/**
 * DER NACHWEIS DER ZUSTIMMUNG (SEC-008) UND DIE TÜR (SEC-007) — in einer
 * kleinen, echten Welt: Schreiber, Leser, Tür und die drei Anlage-Routen
 * laufen unverändert. Nachgebildet wird nur Appwrite (Tabelle
 * `consent_records`, Konten, Sitzungen) und Nitros Auto-Imports als Globals.
 */

interface FakeEvent {
  path: string
  method: string
  context: { user?: { $id: string, $createdAt: string, prefs: Record<string, unknown> } }
  cookies: Record<string, string>
  setCookies: Array<{ name: string, value: string | null }>
  body?: unknown
}

interface StoredRow { $id: string, [key: string]: unknown }

const world = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  tableMissing: false,
  readFails: false,
  calls: { createRow: 0, getRow: 0, accountCreate: 0, usersGet: 0 },
  accountCreatedAt: '2026-11-20T00:00:00.000Z',
  accountPrefs: {} as Record<string, unknown>,
  logs: [] as Array<{ level: string, event: string }>,
}))

function appwriteError(code: number, type: string): Error {
  return Object.assign(new Error(type), { code, type })
}

const tablesDB = {
  async createRow(input: { rowId: string, data: Record<string, unknown> }) {
    world.calls.createRow += 1
    if (world.tableMissing) throw appwriteError(404, 'table_not_found')
    if (world.rows.has(input.rowId)) throw appwriteError(409, 'row_already_exists')
    world.rows.set(input.rowId, { ...input.data })
    return { $id: input.rowId, ...input.data }
  },
  async getRow(input: { rowId: string }): Promise<StoredRow> {
    world.calls.getRow += 1
    if (world.readFails) throw new Error('database unreachable')
    if (world.tableMissing) throw appwriteError(404, 'table_not_found')
    const row = world.rows.get(input.rowId)
    if (!row) throw appwriteError(404, 'row_not_found')
    return { $id: input.rowId, ...row }
  },
}

const users = {
  async get({ userId }: { userId: string }) {
    world.calls.usersGet += 1
    return {
      $id: userId,
      $createdAt: world.accountCreatedAt,
      prefs: world.accountPrefs,
      email: 'person@example.test',
      name: 'Person',
      emailVerification: false,
      passwordUpdate: '',
    }
  },
  async updatePrefs({ prefs }: { prefs: Record<string, unknown> }) {
    world.accountPrefs = prefs
    return {}
  },
  async list() {
    return { total: 1 }
  },
}

const account = {
  async create() {
    world.calls.accountCreate += 1
    return {}
  },
  async createEmailPasswordSession() {
    return { secret: 's', expire: '2027-01-01T00:00:00.000Z', userId: 'u-new' }
  },
  async createSession() {
    return { secret: 's', expire: '2027-01-01T00:00:00.000Z', userId: 'u-new', $id: 'sess' }
  },
}

vi.mock('../server/lib/appwrite', () => ({
  createAdminClient: () => ({ tablesDB, users, account }),
  createSessionClient: () => ({ account: { get: async () => ({ $id: 'u-new' }) } }),
  requestLocale: () => undefined,
  setSessionCookie: () => {},
}))

vi.mock('../server/utils/logEvent', () => ({
  logEvent: (level: string, event: string) => { world.logs.push({ level, event }) },
}))

let authConfig: ConsentConfig = {}

function makeError(init: Record<string, unknown>): Error {
  return Object.assign(new Error(String(init.statusText ?? 'Error')), init, { statusCode: init.status })
}

function makeEvent(init: Partial<FakeEvent> & { userId?: string, createdAt?: string, prefs?: Record<string, unknown> } = {}): FakeEvent {
  return {
    path: init.path ?? '/api/brand/projects',
    method: init.method ?? 'POST',
    context: init.userId
      ? { user: { $id: init.userId, $createdAt: init.createdAt ?? world.accountCreatedAt, prefs: init.prefs ?? {} } }
      : {},
    cookies: init.cookies ?? {},
    setCookies: [],
    body: init.body,
  }
}

type Records = typeof import('../server/utils/consentRecords')
let records: Records

beforeEach(async () => {
  world.rows.clear()
  world.tableMissing = false
  world.readFails = false
  world.calls = { createRow: 0, getRow: 0, accountCreate: 0, usersGet: 0 }
  world.accountCreatedAt = '2026-11-20T00:00:00.000Z'
  world.accountPrefs = {}
  world.logs = []
  authConfig = { termsUrl: '/terms', termsVersion: 'v1', businessOnly: true }

  const log = (level: string, event: string) => { world.logs.push({ level, event }) }
  vi.stubGlobal('useAppConfig', () => ({ pukalani: { auth: authConfig } }))
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'db', appUrl: '' } }))
  vi.stubGlobal('getRequestHost', () => 'branding.example.test')
  vi.stubGlobal('getRequestProtocol', () => 'https')
  vi.stubGlobal('getCookie', (event: FakeEvent, name: string) => event.cookies[name])
  vi.stubGlobal('setCookie', (event: FakeEvent, name: string, value: string) => { event.setCookies.push({ name, value }) })
  vi.stubGlobal('deleteCookie', (event: FakeEvent, name: string) => { event.setCookies.push({ name, value: null }) })
  vi.stubGlobal('createError', makeError)
  vi.stubGlobal('logEvent', log)
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('readValidatedBody', async (event: FakeEvent, parse: (b: unknown) => unknown) => {
    try {
      return parse(event.body ?? {})
    }
    catch {
      throw makeError({ status: 400, statusText: 'Validation failed' })
    }
  })
  vi.stubGlobal('createAdminClient', () => ({ tablesDB, users, account }))

  records = await import('../server/utils/consentRecords')
  records.__resetConsentRecords()
  vi.stubGlobal('recordTermsAcceptance', (await import('../server/utils/termsAcceptance')).recordTermsAcceptance)
  vi.stubGlobal('recordBusinessConfirmation', (await import('../server/utils/businessConfirmation')).recordBusinessConfirmation)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function storedRows(): Array<Record<string, unknown>> {
  return [...world.rows.values()]
}

const asEvent = (event: FakeEvent) => event as unknown as H3Event

describe('writeConsentRecord', () => {
  it('schreibt eine Zeile mit Host, nie eine IP', async () => {
    const result = await records.writeConsentRecord(asEvent(makeEvent()), { userId: 'u-1', kind: 'terms', version: 'v1', way: 'prompt' })
    expect(result).toBe('recorded')
    expect(storedRows()).toEqual([expect.objectContaining({ userId: 'u-1', kind: 'terms', version: 'v1', way: 'prompt', source: 'branding.example.test' })])
  })

  it('409 ist Erfolg, der erste Zeitpunkt bleibt', async () => {
    const event = asEvent(makeEvent())
    await records.writeConsentRecord(event, { userId: 'u-1', kind: 'terms', version: 'v1', way: 'prompt', acceptedAt: '2026-01-01T00:00:00.000Z' })
    const second = await records.writeConsentRecord(event, { userId: 'u-1', kind: 'terms', version: 'v1', way: 'password' })
    expect(second).toBe('exists')
    expect(storedRows()).toHaveLength(1)
    expect(storedRows()[0]).toMatchObject({ acceptedAt: '2026-01-01T00:00:00.000Z', way: 'prompt' })
  })

  it('fehlende Tabelle wirft nicht und meldet sich einmal im Log', async () => {
    world.tableMissing = true
    const event = asEvent(makeEvent())
    expect(await records.writeConsentRecord(event, { userId: 'u-1', kind: 'terms', version: 'v1', way: 'prompt' })).toBe('unavailable')
    expect(await records.writeConsentRecord(event, { userId: 'u-2', kind: 'terms', version: 'v1', way: 'prompt' })).toBe('unavailable')
    expect(world.logs.filter(l => l.event === 'auth.consent_table_missing')).toHaveLength(1)
  })
})

describe('missingConsents', () => {
  it('ist leer ohne Pflicht — ohne jeden Aufruf', async () => {
    authConfig = {}
    expect(await records.missingConsents(asEvent(makeEvent({ userId: 'u-1' })), 'u-1')).toEqual([])
    expect(world.calls.getRow).toBe(0)
  })

  it('nennt die fehlenden Arten; eine vorhandene Zeile wird gemerkt', async () => {
    const event = asEvent(makeEvent({ userId: 'u-1' }))
    await records.writeConsentRecord(event, { userId: 'u-1', kind: 'terms', version: 'v1', way: 'prompt' })
    records.__resetConsentRecords()
    expect(await records.missingConsents(event, 'u-1')).toEqual(['business'])
    const reads = world.calls.getRow
    await records.writeConsentRecord(event, { userId: 'u-1', kind: 'business', version: '', way: 'prompt' })
    expect(await records.missingConsents(event, 'u-1')).toEqual([])
    // beide aus dem Speicher: kein weiterer Lesezugriff
    expect(world.calls.getRow).toBe(reads)
    expect(await records.missingConsents(event, 'u-1')).toEqual([])
    expect(world.calls.getRow).toBe(reads)
  })

  it('eine neue Fassung fehlt wieder', async () => {
    const event = asEvent(makeEvent({ userId: 'u-1' }))
    authConfig = { termsUrl: '/terms', termsVersion: 'v1' }
    await records.writeConsentRecord(event, { userId: 'u-1', kind: 'terms', version: 'v1', way: 'prompt' })
    expect(await records.missingConsents(event, 'u-1')).toEqual([])
    authConfig = { termsUrl: '/terms', termsVersion: 'v2' }
    expect(await records.missingConsents(event, 'u-1')).toEqual(['terms'])
  })

  it('übernimmt alte Konten aus den Prefs und kennzeichnet sie', async () => {
    const event = asEvent(makeEvent({
      userId: 'u-old',
      createdAt: '2026-10-01T00:00:00.000Z',
      prefs: { termsAcceptedAt: '2026-10-01T00:00:01.000Z', termsVersion: 'v1', businessConfirmedAt: '2026-10-01T00:00:01.000Z' },
    }))
    expect(await records.missingConsents(event, 'u-old')).toEqual([])
    expect(storedRows()).toEqual([
      expect.objectContaining({ kind: 'terms', way: 'adopted', acceptedAt: '2026-10-01T00:00:01.000Z' }),
      expect.objectContaining({ kind: 'business', way: 'adopted' }),
    ])
  })

  it('übernimmt nichts für neue Konten, auch wenn die Prefs es behaupten', async () => {
    const event = asEvent(makeEvent({
      userId: 'u-new',
      createdAt: '2026-11-20T00:00:00.000Z',
      prefs: { termsAcceptedAt: '2026-11-20T00:00:01.000Z', termsVersion: 'v1', businessConfirmedAt: '2026-11-20T00:00:01.000Z' },
    }))
    expect(await records.missingConsents(event, 'u-new')).toEqual(['terms', 'business'])
    expect(storedRows()).toEqual([])
  })

  it('fehlende Tabelle: nichts fehlt (sonst wäre jedes Konto gesperrt)', async () => {
    world.tableMissing = true
    expect(await records.missingConsents(asEvent(makeEvent({ userId: 'u-1' })), 'u-1')).toEqual([])
  })

  it('ein Lesefehler wird geworfen', async () => {
    world.readFails = true
    await expect(records.missingConsents(asEvent(makeEvent({ userId: 'u-1' })), 'u-1')).rejects.toThrow()
  })
})

describe('recordTermsAcceptance / recordBusinessConfirmation auf dem Google-Weg', () => {
  it('mit Merkzeichen: Zeilen mit way oauth, Merkzeichen gelöscht', async () => {
    const fake = makeEvent({ path: '/api/auth/oauth/callback', method: 'GET', cookies: { pk_consent: 'terms.business' } })
    const { recordTermsAcceptance } = await import('../server/utils/termsAcceptance')
    const { recordBusinessConfirmation } = await import('../server/utils/businessConfirmation')
    await recordTermsAcceptance(asEvent(fake), 'u-g')
    await recordBusinessConfirmation(asEvent(fake), 'u-g')
    expect(storedRows()).toEqual([
      expect.objectContaining({ userId: 'u-g', kind: 'terms', version: 'v1', way: 'oauth' }),
      expect.objectContaining({ userId: 'u-g', kind: 'business', way: 'oauth' }),
    ])
    expect(fake.setCookies.at(-1)).toEqual({ name: 'pk_consent', value: null })
  })

  it('ohne Merkzeichen: keine Zeile', async () => {
    const fake = makeEvent({ path: '/api/auth/oauth/callback', method: 'GET' })
    const { recordTermsAcceptance } = await import('../server/utils/termsAcceptance')
    await recordTermsAcceptance(asEvent(fake), 'u-g')
    expect(storedRows()).toEqual([])
  })

  it('ohne Pflicht in der App: kein Aufruf', async () => {
    authConfig = {}
    const fake = makeEvent({ path: '/api/auth/oauth/callback', method: 'GET', cookies: { pk_consent: 'terms' } })
    const { recordTermsAcceptance } = await import('../server/utils/termsAcceptance')
    await recordTermsAcceptance(asEvent(fake), 'u-g')
    expect(world.calls.createRow + world.calls.usersGet).toBe(0)
  })
})

// ── Passwort-Anlage ──────────────────────────────────────────────────────────

function stubSignupWorld(): void {
  vi.stubGlobal('getAppConfig', async () => ({ maintenanceMode: false, registrationEnabled: true }))
  vi.stubGlobal('hasSignupAdmissionProvider', () => false)
  vi.stubGlobal('signupAdmissionOpensRegistration', async () => false)
  vi.stubGlobal('tenantRegistrationOpen', () => true)
  vi.stubGlobal('inviteOpensRegistrationFor', async () => false)
  vi.stubGlobal('requireTurnstile', async () => {})
  vi.stubGlobal('rememberKnownDevice', () => {})
  vi.stubGlobal('logAuthEvent', async () => {})
  vi.stubGlobal('joinCommunity', async () => {})
  vi.stubGlobal('recordActivity', async () => {})
  vi.stubGlobal('maybeRecordMilestone', async () => {})
  vi.stubGlobal('limitAccountAttempts', async () => {})
}

const SIGNUP_BODY = { name: 'Person Eins', email: 'person@example.test', password: 'Sicher-123!' }

type Handler = (event: H3Event) => Promise<unknown>

async function runSignup(body: Record<string, unknown>): Promise<{ status: number, code?: string }> {
  stubSignupWorld()
  const handler = (await import('../server/api/auth/signup.post')).default as unknown as Handler
  try {
    await handler(asEvent(makeEvent({ path: '/api/auth/signup', body })))
    return { status: 200 }
  }
  catch (error) {
    const e = error as { status?: number, data?: { code?: string } }
    return { status: e.status ?? 500, code: e.data?.code }
  }
}

describe('signup.post.ts', () => {
  it('ohne AGB-Bestätigung: 400 terms_required und KEIN Konto', async () => {
    const result = await runSignup({ ...SIGNUP_BODY })
    expect(result).toEqual({ status: 400, code: 'terms_required' })
    expect(world.calls.accountCreate).toBe(0)
  })

  it('ohne Unternehmer-Bestätigung: 400 business_required und KEIN Konto', async () => {
    const result = await runSignup({ ...SIGNUP_BODY, terms: true })
    expect(result).toEqual({ status: 400, code: 'business_required' })
    expect(world.calls.accountCreate).toBe(0)
  })

  it('mit beiden Bestätigungen: Konto und zwei Zeilen mit way password', async () => {
    const result = await runSignup({ ...SIGNUP_BODY, terms: true, business: true })
    expect(result.status).toBe(200)
    expect(world.calls.accountCreate).toBe(1)
    expect(storedRows()).toEqual([
      expect.objectContaining({ userId: 'u-new', kind: 'terms', version: 'v1', way: 'password' }),
      expect.objectContaining({ userId: 'u-new', kind: 'business', way: 'password' }),
    ])
  })

  it('App ohne Pflicht: wie bisher, ohne jeden Zustimmungs-Aufruf', async () => {
    authConfig = {}
    const result = await runSignup({ ...SIGNUP_BODY })
    expect(result.status).toBe(200)
    expect(world.calls.accountCreate).toBe(1)
    expect(world.calls.createRow + world.calls.getRow + world.calls.usersGet).toBe(0)
  })
})

// ── Code-Anmeldung ───────────────────────────────────────────────────────────

async function runOtpVerify(body: Record<string, unknown>): Promise<number> {
  stubSignupWorld()
  const handler = (await import('../server/api/auth/otp/verify.post')).default as unknown as Handler
  try {
    await handler(asEvent(makeEvent({ path: '/api/auth/otp/verify', body })))
    return 200
  }
  catch (error) {
    return (error as { status?: number }).status ?? 500
  }
}

describe('otp/verify.post.ts', () => {
  it('erster Beitritt mit Bestätigungen: Zeilen mit way otp', async () => {
    expect(await runOtpVerify({ userId: 'u-new', code: '123456', terms: true, business: true })).toBe(200)
    expect(storedRows()).toEqual([
      expect.objectContaining({ kind: 'terms', way: 'otp' }),
      expect.objectContaining({ kind: 'business', way: 'otp' }),
    ])
  })

  it('ohne Bestätigungen: Anmeldung gelingt, keine Zeile', async () => {
    expect(await runOtpVerify({ userId: 'u-new', code: '123456' })).toBe(200)
    expect(storedRows()).toEqual([])
  })

  it('fehlende Tabelle kippt die Anmeldung nicht', async () => {
    world.tableMissing = true
    expect(await runOtpVerify({ userId: 'u-new', code: '123456', terms: true, business: true })).toBe(200)
  })
})

// ── Die Tür ──────────────────────────────────────────────────────────────────

async function runGate(event: FakeEvent): Promise<{ status: number, code?: string }> {
  const handler = (await import('../server/middleware/07.consent-required')).default as unknown as Handler
  try {
    await handler(asEvent(event))
    return { status: 0 }
  }
  catch (error) {
    const e = error as { status?: number, data?: { code?: string } }
    return { status: e.status ?? 500, code: e.data?.code }
  }
}

describe('07.consent-required.ts', () => {
  it('GET geht durch, ohne nachzusehen', async () => {
    expect(await runGate(makeEvent({ userId: 'u-1', method: 'GET', path: '/api/brand/projects' }))).toEqual({ status: 0 })
    expect(world.calls.getRow).toBe(0)
  })

  it('POST ohne Zustimmung: 403 consent_required', async () => {
    expect(await runGate(makeEvent({ userId: 'u-1', method: 'POST', path: '/api/brand/projects' })))
      .toEqual({ status: 403, code: 'consent_required' })
  })

  it('Erlaubnisliste geht durch, ohne nachzusehen', async () => {
    for (const path of ['/api/auth/consent', '/api/auth/account', '/api/telemetry/error', '/api/presence/heartbeat']) {
      expect(await runGate(makeEvent({ userId: 'u-1', method: path === '/api/auth/account' ? 'DELETE' : 'POST', path })), path).toEqual({ status: 0 })
    }
    expect(world.calls.getRow).toBe(0)
  })

  it('mit Zustimmung geht durch', async () => {
    const event = makeEvent({ userId: 'u-1', method: 'POST', path: '/api/brand/projects' })
    await records.writeConsentRecord(asEvent(event), { userId: 'u-1', kind: 'terms', version: 'v1', way: 'prompt' })
    await records.writeConsentRecord(asEvent(event), { userId: 'u-1', kind: 'business', version: '', way: 'prompt' })
    expect(await runGate(event)).toEqual({ status: 0 })
  })

  it('App ohne Pflicht: Ausstieg vor jedem Nachsehen', async () => {
    authConfig = {}
    expect(await runGate(makeEvent({ userId: 'u-1', method: 'POST', path: '/api/brand/projects' }))).toEqual({ status: 0 })
    expect(world.calls.getRow + world.calls.usersGet).toBe(0)
  })

  it('Gast: nichts zu prüfen', async () => {
    expect(await runGate(makeEvent({ method: 'POST', path: '/api/brand/projects' }))).toEqual({ status: 0 })
    expect(world.calls.getRow).toBe(0)
  })

  it('Lesefehler: durchlassen und protokollieren', async () => {
    world.readFails = true
    expect(await runGate(makeEvent({ userId: 'u-1', method: 'POST', path: '/api/brand/projects' }))).toEqual({ status: 0 })
    expect(world.logs.some(l => l.event === 'auth.consent_check_failed')).toBe(true)
  })

  it('Seite: nichts abgewiesen, der Stand reist im Kontext', async () => {
    const event = makeEvent({ userId: 'u-1', method: 'GET', path: '/de/dashboard' })
    expect(await runGate(event)).toEqual({ status: 0 })
    expect((event.context as { consentMissing?: string[] }).consentMissing).toEqual(['terms', 'business'])
  })
})

// ── Die Nachfrage ────────────────────────────────────────────────────────────

describe('POST /api/auth/consent', () => {
  it('schreibt die fehlenden Arten mit way prompt und meldet den neuen Stand', async () => {
    const handler = (await import('../server/api/auth/consent.post')).default as unknown as Handler
    const result = await handler(asEvent(makeEvent({ userId: 'u-1', path: '/api/auth/consent', body: { terms: true, business: true } })))
    expect(result).toMatchObject({ missing: [] })
    expect(storedRows().map(r => r.way)).toEqual(['prompt', 'prompt'])
  })

  it('ohne Bestätigung: 400, keine Zeile', async () => {
    const handler = (await import('../server/api/auth/consent.post')).default as unknown as Handler
    await expect(handler(asEvent(makeEvent({ userId: 'u-1', path: '/api/auth/consent', body: { terms: true } }))))
      .rejects.toMatchObject({ status: 400 })
    expect(storedRows()).toEqual([])
  })

  it('ohne Konto: 401', async () => {
    const handler = (await import('../server/api/auth/consent.post')).default as unknown as Handler
    await expect(handler(asEvent(makeEvent({ path: '/api/auth/consent', body: {} })))).rejects.toMatchObject({ status: 401 })
  })
})

// ── Wächter: kein zweiter Schalter ──────────────────────────────────────────

describe('kein Schalter außer termsUrl/businessOnly', () => {
  const sources = {
    gate: readFileSync(new URL('../server/middleware/07.consent-required.ts', import.meta.url), 'utf8'),
    signup: readFileSync(new URL('../server/api/auth/signup.post.ts', import.meta.url), 'utf8'),
    shared: readFileSync(new URL('../shared/consent.ts', import.meta.url), 'utf8'),
  }

  it('die Tür und die Anlage lesen die Pflicht nur über requiredConsents', () => {
    expect(sources.gate).toContain('requiredConsents(')
    expect(sources.signup).toContain('requiredConsents(')
    for (const [name, source] of Object.entries({ gate: sources.gate, signup: sources.signup })) {
      // Keine Config- oder Env-Abfrage, die den Zustimmungs-Teil abschalten könnte.
      expect(source, name).not.toMatch(/consent(Gate)?(Enabled|Disabled|Off|Skip)/i)
      expect(source, name).not.toMatch(/process\.env/)
      expect(source, name).not.toMatch(/pukalani\?\.(consent|gdpr)/)
    }
  })

  it('requiredConsents liest genau termsUrl, termsVersion und businessOnly', () => {
    const body = sources.shared.slice(sources.shared.indexOf('export function requiredConsents'), sources.shared.indexOf('export function isConsentKind'))
    const fields = [...body.matchAll(/config\?\.(\w+)/g)].map(m => m[1])
    expect(new Set(fields)).toEqual(new Set(['termsUrl', 'termsVersion', 'businessOnly']))
  })
})
