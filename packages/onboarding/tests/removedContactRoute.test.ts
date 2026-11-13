import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { createMemoryRateLimitStore } from '../../core/server/utils/rateLimitStore'

/**
 * SEC-030 Teil 2 (2026-11-13): `POST /api/community/removed-contact` — die
 * EINE Nachricht einer entfernten Person an die Leitung ihrer Community.
 *
 * Echt laufen: die Route, ihre puren Regeln und der Zähl-Speicher der Bremse
 * (In-Memory, dieselbe atomare `hit`-Semantik wie Redis). Nachgebildet wird,
 * was hinter einer Naht liegt: das Team (Control Plane), die Konten
 * (Appwrite), die Glocke (`notify`, mit echter Idempotenz über die Row-Id)
 * und der Mail-Versand.
 */

const team = {
  members: [
    { runtimeUserId: 'u-owner', role: 'owner', name: '', avatarUrl: '' },
    { runtimeUserId: 'u-admin', role: 'admin', name: '', avatarUrl: '' },
    { runtimeUserId: 'u-mod', role: 'moderator', name: '', avatarUrl: '' },
  ],
}
const controlPlane = vi.fn(async () => team)
vi.mock('../server/utils/controlPlane', () => ({ callControlPlane: controlPlane }))

const accounts: Record<string, { $id: string, name: string, email: string, emailVerification: boolean, prefs: Record<string, unknown> }> = {
  'u-owner': { $id: 'u-owner', name: 'Olga Owner', email: 'olga@example.test', emailVerification: true, prefs: { emailLocale: 'de', emailNotifications: 'off' } },
  'u-admin': { $id: 'u-admin', name: 'Adam Admin', email: 'adam@example.test', emailVerification: true, prefs: { emailLocale: 'en' } },
  'u-mod': { $id: 'u-mod', name: 'Mo Mod', email: 'mo@example.test', emailVerification: true, prefs: {} },
}

const bellRows = new Set<string>()
const notify = vi.fn(async (_event: unknown, input: { recipientId: string, rowId?: string, mail?: string }) => {
  // Echte Idempotenz wie in core/server/utils/notify.ts: derselbe Schlüssel
  // schreibt GENAU EINE Zeile, der zweite Versuch ist eine Dublette.
  const key = input.rowId ?? `${Math.random()}`
  if (bellRows.has(key)) return { created: false, duplicate: true }
  bellRows.add(key)
  return { created: true }
})
const sendMail = vi.fn(async () => true)
let store = createMemoryRateLimitStore()
let mailer = true
const headers = new Map<string, string | number>()

function makeError(init: Record<string, unknown>): Error {
  return Object.assign(new Error(String(init.statusText ?? 'Error')), init, { statusCode: init.status })
}

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('createError', makeError)
vi.stubGlobal('useTenant', (e: H3Event) => e.context.tenant ?? null)
vi.stubGlobal('readValidatedBody', async (e: H3Event & { body?: unknown }, parse: (b: unknown) => unknown) => {
  try {
    return parse(e.body ?? {})
  }
  catch {
    throw makeError({ status: 400, statusText: 'Validation Error' })
  }
})
vi.stubGlobal('useRateLimitStore', () => ({ store, prefix: 'rl:test:' }))
vi.stubGlobal('setHeader', (_e: unknown, name: string, value: string | number) => { headers.set(name, value) })
vi.stubGlobal('getRequestURL', () => new URL('http://kunde-a.localhost:3150/api/community/removed-contact'))
vi.stubGlobal('createAdminClient', () => ({
  users: {
    list: async ({ queries }: { queries: string[] }) => {
      const wanted = JSON.parse(queries[0] ?? '{}').values as string[]
      return { users: wanted.map(id => accounts[id]).filter(Boolean) }
    },
  },
}))
vi.stubGlobal('notify', notify)
vi.stubGlobal('sendMail', sendMail)
vi.stubGlobal('mailerConfigured', async () => mailer)
vi.stubGlobal('resolveCommunityHosts', async () => ({ 't-a': 'kunde-a.localhost' }))
vi.stubGlobal('logEvent', () => {})

const { default: handler } = await import('../server/api/community/removed-contact.post') as unknown as {
  default: (event: H3Event) => Promise<unknown>
}

const MESSAGE = 'Ich glaube, das war ein Versehen — bitte meldet euch bei mir.'

function event(init: { removed?: boolean, user?: boolean, body?: unknown, silo?: boolean } = {}): H3Event {
  return {
    method: 'POST',
    path: '/api/community/removed-contact',
    body: init.body ?? { message: MESSAGE },
    context: {
      user: init.user === false ? undefined : { $id: 'u-sender', name: 'Eve Entfernt', email: 'eve@example.test', labels: [] },
      tenant: init.silo ? null : { mode: 'pool', communityId: 'c-a', tenantId: 't-a', projectId: 'pool', name: 'Morgenlicht' },
      ...(init.removed === false ? {} : { communityRemoved: true }),
    },
  } as unknown as H3Event
}

async function call(e: H3Event): Promise<{ status: number, body?: unknown, code?: string }> {
  try {
    return { status: 200, body: await handler(e) }
  }
  catch (error) {
    const thrown = error as { status?: number, data?: { code?: string } }
    return { status: thrown.status ?? 500, code: thrown.data?.code }
  }
}

beforeEach(() => {
  store = createMemoryRateLimitStore()
  bellRows.clear()
  notify.mockClear()
  sendMail.mockClear()
  controlPlane.mockClear()
  controlPlane.mockImplementation(async () => team)
  mailer = true
  headers.clear()
})

describe('POST /api/community/removed-contact', () => {
  it('ohne Konto ⇒ 401', async () => {
    expect((await call(event({ user: false }))).status).toBe(401)
  })

  it('nicht entfernt ⇒ 404 (kein allgemeines Kontaktformular)', async () => {
    expect((await call(event({ removed: false }))).status).toBe(404)
    expect((await call(event({ silo: true }))).status).toBe(404)
    expect(notify).not.toHaveBeenCalled()
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('entfernt ⇒ 200; je owner/admin EINE Glocke und EINE Mail mit Reply-To, der Moderator nichts', async () => {
    const res = await call(event())
    expect(res.status).toBe(200)
    expect(notify.mock.calls.map(([, input]) => input.recipientId).sort()).toEqual(['u-admin', 'u-owner'])
    for (const [, input] of notify.mock.calls) {
      expect(input).toMatchObject({
        type: 'member.appeal',
        title: 'Eve Entfernt',
        link: '/dashboard/members',
        scope: 'tenant',
        senderId: 'u-sender',
        mail: 'skip',
      })
      expect(input.rowId).toMatch(/^appeal-/)
    }
    const mails = sendMail.mock.calls.map(([, mail]) => mail as { to: string, replyTo: string, subject: string, text: string })
    expect(mails.map(mail => mail.to).sort()).toEqual(['adam@example.test', 'olga@example.test'])
    for (const mail of mails) expect(mail.replyTo).toBe('eve@example.test')
    // Sprache des Empfängers — Olga de (trotz abgeschalteter Benachrichtigungs-Mails), Adam en.
    expect(mails.find(mail => mail.to === 'olga@example.test')?.text).toContain('Antworte einfach')
    expect(mails.find(mail => mail.to === 'adam@example.test')?.text).toContain('Simply reply')
    expect(mails.some(mail => mail.to === 'mo@example.test')).toBe(false)
  })

  it('die Antwort verrät nichts über die Empfänger', async () => {
    const res = await call(event())
    expect(res.body).toEqual({ ok: true })
    controlPlane.mockImplementation(async () => ({ members: [] }))
    store = createMemoryRateLimitStore()
    const empty = await call(event())
    expect(empty).toEqual(res)
  })

  it('zweite Nachricht in derselben Woche ⇒ 429 removed_contact_limit, Retry-After, KEIN Versand', async () => {
    expect((await call(event())).status).toBe(200)
    notify.mockClear()
    sendMail.mockClear()
    const second = await call(event())
    expect(second.status).toBe(429)
    expect(second.code).toBe('removed_contact_limit')
    expect(Number(headers.get('Retry-After'))).toBeGreaterThan(6 * 86_400)
    expect(notify).not.toHaveBeenCalled()
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('zwei GLEICHZEITIGE Anfragen ⇒ genau ein Versand', async () => {
    const [a, b] = await Promise.all([call(event()), call(event())])
    expect([a.status, b.status].sort()).toEqual([200, 429])
    expect(sendMail).toHaveBeenCalledTimes(2) // eine Mail je Empfänger, einmal
    expect(notify).toHaveBeenCalledTimes(2)
  })

  it('verlorener Zähler (Neustart ohne Redis): die Glocken-Zeile der Woche hält trotzdem', async () => {
    expect((await call(event())).status).toBe(200)
    store = createMemoryRateLimitStore()
    sendMail.mockClear()
    const again = await call(event())
    expect(again.status).toBe(429)
    expect(again.code).toBe('removed_contact_limit')
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('Control Plane gestört ⇒ 503 und das Kontingent ist NICHT verbraucht', async () => {
    controlPlane.mockImplementationOnce(async () => { throw new Error('down') })
    expect((await call(event())).status).toBe(503)
    expect((await call(event())).status).toBe(200)
  })

  it('kein Mailer ⇒ nur Glocke, trotzdem 200', async () => {
    mailer = false
    expect((await call(event())).status).toBe(200)
    expect(notify).toHaveBeenCalledTimes(2)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('zu kurz oder zu lang ⇒ 400, ohne das Kontingent zu verbrauchen', async () => {
    expect((await call(event({ body: { message: 'zu kurz' } }))).status).toBe(400)
    expect((await call(event({ body: { message: 'x'.repeat(1001) } }))).status).toBe(400)
    // nur Steuerzeichen und Leerraum: nach der Bereinigung zu kurz
    expect((await call(event({ body: { message: `${'\u0000'.repeat(30)}   ` } }))).status).toBe(400)
    expect((await call(event({ body: { message: 1 } }))).status).toBe(400)
    expect((await call(event())).status).toBe(200)
  })
})
