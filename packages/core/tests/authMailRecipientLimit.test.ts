import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRateLimitStore } from '../server/utils/rateLimitStore'
import type { RateLimitStore } from '../server/utils/rateLimitStore'

/**
 * ANMELDE-MAILS JE EMPFÄNGER (AB1 e / SR1 c) — die zwei Routen gegen den
 * ECHTEN Baustein `allowRecipientMail` und den echten Memory-Store. Gestubbt
 * sind Appwrite und die Nitro-Globals.
 *
 * Belegt wird je Route:
 *  - bis zur Grenze geht je Anfrage eine Mail hinaus, darüber keine;
 *  - die Antwort über der Grenze hat dieselbe Form wie darunter;
 *  - eine andere Adresse zählt getrennt.
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
  createSessionClient: () => ({ account: { createRecovery } }),
  createAdminClient: () => ({ account: { createEmailToken }, users: { list: listUsers } }),
}))
vi.mock('../server/utils/trustedOrigin', () => ({
  resolveTrustedOrigin: async () => ({ origin: 'https://community.example' }),
}))

type Handler = (event: FakeEvent) => Promise<Record<string, unknown>>
let recovery: Handler
let otp: Handler
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
  vi.stubGlobal('createError', (input: { status: number, statusText: string }) =>
    Object.assign(new Error(input.statusText), { status: input.status }))
  limit = await import('../server/utils/recipientMailLimit')
  vi.stubGlobal('allowRecipientMail', limit.allowRecipientMail)
  vi.stubGlobal('AUTH_MAIL_RECIPIENT_LIMIT', limit.AUTH_MAIL_RECIPIENT_LIMIT)
  recovery = (await import('../server/api/auth/recovery.post')).default as unknown as Handler
  otp = (await import('../server/api/auth/otp.post')).default as unknown as Handler
})

beforeEach(() => {
  store = createMemoryRateLimitStore()
  registrationEnabled = true
  accounts = { 'person@example.com': 'user-person' }
  createRecovery.mockClear()
  createEmailToken.mockClear()
  listUsers.mockClear()
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

  it('Code- und Reset-Mails zählen getrennt', async () => {
    for (let i = 0; i < 6; i++) await otp(ask('person@example.com'))
    await recovery(ask('person@example.com'))
    expect(createRecovery).toHaveBeenCalledTimes(1)
  })
})
