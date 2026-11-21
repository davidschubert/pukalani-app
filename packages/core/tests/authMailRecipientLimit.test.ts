import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRateLimitStore } from '../server/utils/rateLimitStore'
import type { RateLimitStore } from '../server/utils/rateLimitStore'

/**
 * ANMELDE-MAILS JE EMPFÄNGER (AB1 e / SR1 c, AB1 g) — die drei Routen gegen den
 * ECHTEN Baustein `allowRecipientMail` und den echten Memory-Store. Gestubbt
 * sind Appwrite und die Nitro-Globals.
 *
 * Belegt wird je Route:
 *  - bis zur Grenze geht je Anfrage eine Mail hinaus, darüber keine;
 *  - die Antwort über der Grenze hat dieselbe Form wie darunter;
 *  - eine andere Adresse zählt getrennt.
 *
 * Die Bestätigungs-Mail (AB1 g) ist die eine Route mit Anmeldung: sie fragt
 * für die EIGENE Adresse und sagt die Grenze deshalb offen (429) — die
 * anderen zwei antworten wortgleich, weil dort jeder für jede Adresse fragt.
 */

interface FakeEvent {
  body: unknown
  context: Record<string, unknown>
}

let store: RateLimitStore
let registrationEnabled = true
/** Konten, die es „gibt": Adresse → userId. */
let accounts: Record<string, string> = {}

const createRecovery = vi.fn(async (_input: { email: string, url: string }) => ({}))
const createVerification = vi.fn(async (_input: { url: string }) => ({}))
/** `Retry-After` der letzten 429 — die echte `tooManyRequests` setzt ihn. */
let retryAfter: unknown
const createEmailToken = vi.fn(async (input: { userId: string, email: string }) => ({
  userId: accounts[input.email] ?? input.userId,
  phrase: 'Echte Phrase',
  secret: 'nie-nach-aussen',
}))
const listUsers = vi.fn(async (input: { queries: string[] }) => {
  const hit = Object.entries(accounts).find(([email]) => input.queries.some(q => q.includes(email)))
  return hit ? { total: 1, users: [{ $id: hit[1], name: 'Person' }] } : { total: 0, users: [] }
})

vi.mock('../server/lib/appwrite', () => ({
  createSessionClient: () => ({ account: { createRecovery, createVerification } }),
  createAdminClient: () => ({ account: { createEmailToken }, users: { list: listUsers } }),
}))
vi.mock('../server/utils/trustedOrigin', () => ({
  resolveTrustedOrigin: async () => ({ origin: 'https://community.example' }),
}))
vi.mock('../server/utils/siteOrigin', () => ({
  resolveSiteLinkBase: async () => 'https://community.example',
}))

type Handler = (event: FakeEvent) => Promise<Record<string, unknown>>
let recovery: Handler
let otp: Handler
let verification: Handler
let limit: typeof import('../server/utils/recipientMailLimit')

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('readValidatedBody', async (event: FakeEvent, parse: (body: unknown) => unknown) => parse(event.body))
  vi.stubGlobal('requireTurnstile', async () => {})
  vi.stubGlobal('useRateLimitStore', () => ({ store, prefix: 'rl:test:' }))
  vi.stubGlobal('logEvent', vi.fn())
  vi.stubGlobal('logAuthEvent', async () => {})
  vi.stubGlobal('getAppConfig', async () => ({ registrationEnabled, maintenanceMode: false }))
  vi.stubGlobal('tenantRegistrationOpen', () => true)
  vi.stubGlobal('toH3Error', (error: unknown) => error)
  vi.stubGlobal('createError', (input: { status: number, statusText: string, data?: unknown }) =>
    Object.assign(new Error(input.statusText), { status: input.status, data: input.data }))
  vi.stubGlobal('setHeader', (_event: unknown, name: string, value: unknown) => {
    if (name === 'Retry-After') retryAfter = value
  })
  vi.stubGlobal('tooManyRequests', (await import('../server/utils/rateLimited')).tooManyRequests)
  limit = await import('../server/utils/recipientMailLimit')
  vi.stubGlobal('allowRecipientMail', limit.allowRecipientMail)
  vi.stubGlobal('AUTH_MAIL_RECIPIENT_LIMIT', limit.AUTH_MAIL_RECIPIENT_LIMIT)
  recovery = (await import('../server/api/auth/recovery.post')).default as unknown as Handler
  otp = (await import('../server/api/auth/otp.post')).default as unknown as Handler
  verification = (await import('../server/api/auth/verification.post')).default as unknown as Handler
})

beforeEach(() => {
  store = createMemoryRateLimitStore()
  registrationEnabled = true
  accounts = { 'person@example.com': 'user-person' }
  createRecovery.mockClear()
  createEmailToken.mockClear()
  createVerification.mockClear()
  listUsers.mockClear()
  retryAfter = undefined
})

const ask = (email: string): FakeEvent => ({ body: { email }, context: {} })

describe('Anmelde-Mails: die Zahl', () => {
  it('5 je Stunde, eigener Zähler je Bereich', () => {
    expect(limit.AUTH_MAIL_RECIPIENT_LIMIT).toEqual({ max: 5, windowMs: 60 * 60_000 })
  })
})

describe('POST /api/auth/recovery — Grenze je Empfänger', () => {
  it('verschickt bis zur Grenze, darüber nicht — und antwortet immer gleich', async () => {
    const answers: unknown[] = []
    for (let i = 0; i < 8; i++) answers.push(await recovery(ask('person@example.com')))
    expect(createRecovery).toHaveBeenCalledTimes(5)
    for (const answer of answers) expect(answer).toEqual({ ok: true })
  })

  it('zählt auch Adressen ohne Konto und antwortet dort genauso', async () => {
    createRecovery.mockRejectedValue(Object.assign(new Error('nope'), { code: 404, type: 'user_not_found' }))
    const answers: unknown[] = []
    for (let i = 0; i < 7; i++) answers.push(await recovery(ask('niemand@example.com')))
    expect(createRecovery).toHaveBeenCalledTimes(5)
    for (const answer of answers) expect(answer).toEqual({ ok: true })
    createRecovery.mockResolvedValue({})
  })

  it('zählt eine andere Adresse getrennt, auch in anderer Schreibweise dieselbe', async () => {
    for (let i = 0; i < 5; i++) await recovery(ask('person@example.com'))
    await recovery(ask('Person@Example.com'))
    expect(createRecovery).toHaveBeenCalledTimes(5)
    await recovery(ask('andere@example.com'))
    expect(createRecovery).toHaveBeenCalledTimes(6)
  })
})

describe('POST /api/auth/otp — Grenze je Empfänger', () => {
  it('verschickt bis zur Grenze, darüber nicht — die Antwort behält Form und Konto-Kennung', async () => {
    const answers: Record<string, unknown>[] = []
    for (let i = 0; i < 8; i++) answers.push(await otp(ask('person@example.com')))
    expect(createEmailToken).toHaveBeenCalledTimes(5)
    for (const answer of answers) {
      expect(Object.keys(answer).sort()).toEqual(['ok', 'phrase', 'userId'])
      expect(answer.ok).toBe(true)
      expect(answer.userId).toBe('user-person')
      expect(typeof answer.phrase).toBe('string')
      expect(String(answer.phrase).length).toBeGreaterThan(0)
    }
  })

  it('gibt über der Grenze nichts aus der Appwrite-Antwort weiter', async () => {
    for (let i = 0; i < 5; i++) await otp(ask('person@example.com'))
    const answer = await otp(ask('person@example.com'))
    expect(JSON.stringify(answer)).not.toContain('nie-nach-aussen')
    expect(answer.phrase).not.toBe('Echte Phrase')
  })

  it('zählt eine andere Adresse getrennt', async () => {
    for (let i = 0; i < 6; i++) await otp(ask('person@example.com'))
    expect(createEmailToken).toHaveBeenCalledTimes(5)
    accounts['andere@example.com'] = 'user-andere'
    const answer = await otp(ask('andere@example.com'))
    expect(createEmailToken).toHaveBeenCalledTimes(6)
    expect(answer.userId).toBe('user-andere')
  })

  it('zählt die stille Antwort bei geschlossener Registrierung nicht (dort geht keine Mail hinaus)', async () => {
    registrationEnabled = false
    for (let i = 0; i < 7; i++) await otp(ask('niemand@example.com'))
    expect(createEmailToken).not.toHaveBeenCalled()
    // Danach ist das Budget der Adresse unberührt.
    registrationEnabled = true
    for (let i = 0; i < 6; i++) await otp(ask('niemand@example.com'))
    expect(createEmailToken).toHaveBeenCalledTimes(5)
  })

  it('Lesefehler über der Grenze ⇒ 503 auth_unavailable, keine erfundene Kennung (Bahn 2)', async () => {
    for (let i = 0; i < 5; i++) await otp(ask('person@example.com'))
    listUsers.mockRejectedValueOnce(Object.assign(new Error('db down'), { code: 500 }))
    await expect(otp(ask('person@example.com'))).rejects.toMatchObject({
      status: 503,
      data: { code: 'auth_unavailable' },
    })
    expect(createEmailToken).toHaveBeenCalledTimes(5)
    // Gegenprobe: ist die Datenbank wieder da, kommt dieselbe Konto-Kennung.
    expect((await otp(ask('person@example.com'))).userId).toBe('user-person')
  })

  it('der Lesefehler sieht für vorhandene und unbekannte Adressen gleich aus', async () => {
    const failures: unknown[] = []
    for (const email of ['person@example.com', 'niemand@example.com']) {
      for (let i = 0; i < 5; i++) await otp(ask(email))
      listUsers.mockRejectedValueOnce(Object.assign(new Error('db down'), { code: 500 }))
      failures.push(await otp(ask(email)).catch((error: { status: number, data: unknown, message: string }) =>
        ({ status: error.status, data: error.data, message: error.message })))
    }
    expect(failures[0]).toEqual(failures[1])
  })

  it('Code- und Reset-Mails zählen getrennt', async () => {
    for (let i = 0; i < 6; i++) await otp(ask('person@example.com'))
    await recovery(ask('person@example.com'))
    expect(createRecovery).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/auth/verification — Grenze je Empfänger (AB1 g)', () => {
  const signedIn = (email: string, extra: Record<string, unknown> = {}): FakeEvent => ({
    body: undefined,
    context: { user: { $id: 'user-person', email, emailVerification: false, ...extra } },
  })

  it('verschickt bis zur Grenze, darüber 429 `rate_limited` mit Retry-After — und keine Mail', async () => {
    for (let i = 0; i < 5; i++) expect(await verification(signedIn('person@example.com'))).toEqual({ ok: true })
    expect(createVerification).toHaveBeenCalledTimes(5)

    await expect(verification(signedIn('person@example.com')))
      .rejects.toMatchObject({ status: 429, data: { code: 'rate_limited' } })
    expect(createVerification).toHaveBeenCalledTimes(5)
    expect(retryAfter).toBe(3600)
  })

  it('zählt je Adresse über Sitzungen hinweg, eine andere Adresse getrennt', async () => {
    // Dieselbe Adresse aus einer anderen Sitzung (anderes Gerät) — und in
    // anderer Schreibweise: ein Zähler.
    for (let i = 0; i < 3; i++) await verification(signedIn('person@example.com'))
    for (let i = 0; i < 2; i++) await verification(signedIn('Person@Example.com', { $id: 'user-person' }))
    await expect(verification(signedIn('person@example.com'))).rejects.toMatchObject({ status: 429 })

    expect(await verification(signedIn('andere@example.com', { $id: 'user-andere' }))).toEqual({ ok: true })
    expect(createVerification).toHaveBeenCalledTimes(6)
  })

  it('zählt nicht, was keine Mail verschickt: schon bestätigt, nicht angemeldet', async () => {
    for (let i = 0; i < 7; i++) {
      expect(await verification(signedIn('person@example.com', { emailVerification: true })))
        .toEqual({ ok: true, alreadyVerified: true })
    }
    await expect(verification({ body: undefined, context: {} })).rejects.toMatchObject({ status: 401 })
    expect(createVerification).not.toHaveBeenCalled()

    // Das Budget der Adresse ist danach unberührt.
    for (let i = 0; i < 5; i++) await verification(signedIn('person@example.com'))
    expect(createVerification).toHaveBeenCalledTimes(5)
  })

  it('zählt getrennt von Code- und Reset-Mails', async () => {
    for (let i = 0; i < 5; i++) await verification(signedIn('person@example.com'))
    await recovery(ask('person@example.com'))
    await otp(ask('person@example.com'))
    expect(createRecovery).toHaveBeenCalledTimes(1)
    expect(createEmailToken).toHaveBeenCalledTimes(1)
  })

  it('gleichzeitige Anfragen: genau fünf Mails', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => verification(signedIn('person@example.com'))),
    )
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(5)
    expect(createVerification).toHaveBeenCalledTimes(5)
  })
})
