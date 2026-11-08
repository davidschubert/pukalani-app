import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import {
  mailRecipientAddress,
  nextUndeliverablePrefs,
  readResendWebhookEvent,
  undeliverableNoticeReason,
} from '../shared/mailUndeliverable'
import {
  applyMailUndeliverable,
  checkResendSignature,
  mailUndeliverableEmailHash,
  registerMailUndeliverableHandler,
} from '../server/utils/mailUndeliverable'

/**
 * RS1 b — der Resend-Webhook: Signatur, Regeln und die ECHTE Route.
 *
 * Gestellt sind nur die Nitro-Auto-Imports und Appwrite (`createAdminClient`
 * liefert einen Fake-`users`); Signaturprüfung, Regel und Konto-Schreiber
 * laufen im Original. Jeder Wirkungs-Test hat eine Gegenprobe („und sonst
 * passiert nichts"), sonst wäre er auch bei einer toten Route grün.
 */

// ── Fake-Appwrite ──────────────────────────────────────────────────────────

interface FakeUser { $id: string, email: string, prefs: Record<string, unknown> }
let accounts: FakeUser[]
let usersBroken: boolean
const users = {
  list: vi.fn(async ({ queries }: { queries: string[] }) => {
    if (usersBroken) throw Object.assign(new Error('boom'), { code: 500 })
    const equal = queries.map(query => JSON.parse(query) as { method: string, attribute?: string, values?: unknown[] })
      .find(query => query.method === 'equal' && query.attribute === 'email')
    const wanted = String(equal?.values?.[0] ?? '')
    const found = accounts.filter(user => user.email === wanted)
    return { users: found, total: found.length }
  }),
  updatePrefs: vi.fn(async ({ userId, prefs }: { userId: string, prefs: Record<string, unknown> }) => {
    const user = accounts.find(entry => entry.$id === userId)!
    user.prefs = prefs
    return user
  }),
}

// ── Nitro-Auto-Imports ─────────────────────────────────────────────────────

const SECRET = `whsec_${Buffer.from('ein-ganz-geheimer-schluessel-32b').toString('base64')}`
let configuredSecret: string
let rawBody: string
let headers: Record<string, string | undefined>
let logs: { level: string, name: string, data: Record<string, unknown> }[]

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({ resendWebhookSecret: configuredSecret }))
vi.stubGlobal('readRawBody', async () => rawBody)
vi.stubGlobal('getHeader', (_event: H3Event, name: string) => headers[name])
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('logEvent', (level: string, name: string, data: Record<string, unknown> = {}) => {
  logs.push({ level, name, data })
})
vi.stubGlobal('createAdminClient', () => ({ users }))
vi.stubGlobal('checkResendSignature', checkResendSignature)
vi.stubGlobal('applyMailUndeliverable', applyMailUndeliverable)

const route = (await import('../server/api/mail/resend-webhook.post')).default as unknown as (event: H3Event) => Promise<unknown>
const event = { context: {} } as unknown as H3Event

// Ein Produkt-Layer am Vertrag (im echten Leben: insights).
let productCalls: { emailLower: string, reason: string }[]
let productBroken: boolean
registerMailUndeliverableHandler({
  id: 'newsletter',
  handle: async (_event, input) => {
    if (productBroken) throw Object.assign(new Error('table gone sick'), { code: 503 })
    productCalls.push(input)
    return 'changed'
  },
})

function sign(body: string, id = 'msg_test', timestamp = String(Math.floor(Date.now() / 1000))) {
  const key = Buffer.from(SECRET.slice('whsec_'.length), 'base64')
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
  return { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` }
}

function deliver(payload: unknown, id = 'msg_test') {
  rawBody = JSON.stringify(payload)
  headers = sign(rawBody, id)
  return route(event)
}

const bounced = (type: string, to: unknown = ['Aloha Kalani <Aloha@Example.com>']) => ({
  type: 'email.bounced',
  created_at: '2026-11-08T10:00:00.000Z',
  data: { email_id: 'em_1', to, bounce: { type, subType: 'Suppressed', message: 'nope' } },
})

async function status(promise: Promise<unknown>): Promise<number> {
  try {
    await promise
    return 200
  }
  catch (error) {
    return (error as { status?: number }).status ?? -1
  }
}

beforeEach(() => {
  accounts = [{ $id: 'u1', email: 'aloha@example.com', prefs: { bio: 'Surfer', emailNotifications: 'instant', emailLocale: 'de' } }]
  usersBroken = false
  configuredSecret = SECRET
  rawBody = ''
  headers = {}
  logs = []
  productCalls = []
  productBroken = false
  users.list.mockClear()
  users.updatePrefs.mockClear()
})

// ── 1. Signatur ────────────────────────────────────────────────────────────

describe('checkResendSignature', () => {
  // Testvektor aus der Svix-Doku („Verifying payloads manually").
  const vector = {
    secret: 'whsec_plJ3nmyCDGBKInavdOK15jsl',
    id: 'msg_loFOjxBNrRLzqYUf',
    timestamp: '1731705121',
    body: '{"event_type":"ping","data":{"success":true}}',
    signature: 'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=',
  }

  it('akzeptiert den offiziellen Svix-Testvektor', () => {
    expect(checkResendSignature({ ...vector, nowSeconds: 1731705121 })).toBe('ok')
  })

  it('findet die passende Signatur auch in einer Liste (Schlüsseltausch, fremde Versionen)', () => {
    const signature = `v2,abc v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= ${vector.signature}`
    expect(checkResendSignature({ ...vector, signature, nowSeconds: 1731705121 })).toBe('ok')
  })

  it('lehnt einen veränderten Body ab', () => {
    expect(checkResendSignature({ ...vector, body: vector.body.replace('true', 'false'), nowSeconds: 1731705121 })).toBe('mismatch')
  })

  it('lehnt ein fremdes Secret ab', () => {
    expect(checkResendSignature({ ...vector, secret: SECRET, nowSeconds: 1731705121 })).toBe('mismatch')
  })

  it('lehnt eine zu alte (oder zu junge) Zustellung ab — Replay-Fenster 5 Minuten', () => {
    expect(checkResendSignature({ ...vector, nowSeconds: 1731705121 + 301 })).toBe('stale')
    expect(checkResendSignature({ ...vector, nowSeconds: 1731705121 - 301 })).toBe('stale')
    expect(checkResendSignature({ ...vector, nowSeconds: 1731705121 + 300 })).toBe('ok')
  })

  it('lehnt fehlende Kopfzeilen ab', () => {
    expect(checkResendSignature({ ...vector, id: undefined, nowSeconds: 1731705121 })).toBe('missing_header')
    expect(checkResendSignature({ ...vector, timestamp: undefined, nowSeconds: 1731705121 })).toBe('missing_header')
    expect(checkResendSignature({ ...vector, signature: undefined, nowSeconds: 1731705121 })).toBe('missing_header')
  })
})

// ── 2. Die puren Regeln ────────────────────────────────────────────────────

describe('readResendWebhookEvent', () => {
  it('harter Bounce ⇒ unzustellbar, Adresse nackt und kleingeschrieben', () => {
    expect(readResendWebhookEvent(bounced('Permanent'))).toEqual({
      kind: 'undeliverable', reason: 'bounce', recipients: ['aloha@example.com'], subType: 'Suppressed', emailId: 'em_1',
    })
  })

  it('weicher Bounce ⇒ nur zählen', () => {
    expect(readResendWebhookEvent(bounced('Temporary')).kind).toBe('soft_bounce')
  })

  it('Beschwerde und Sperrlisten-Treffer ⇒ unzustellbar mit eigenem Grund', () => {
    const complained = readResendWebhookEvent({ type: 'email.complained', data: { email_id: 'em_2', to: ['a@b.de'] } })
    expect(complained).toMatchObject({ kind: 'undeliverable', reason: 'complaint', recipients: ['a@b.de'] })
    const suppressed = readResendWebhookEvent({ type: 'email.suppressed', data: { to: ['a@b.de'], suppressed: { type: 'OnAccountSuppressionList' } } })
    expect(suppressed).toMatchObject({ kind: 'undeliverable', reason: 'suppressed', subType: 'OnAccountSuppressionList' })
  })

  it('alles andere ⇒ ignorieren (auch Öffnungen/Klicks und kaputte Nutzlasten)', () => {
    for (const payload of [
      { type: 'email.delivered', data: { to: ['a@b.de'] } },
      { type: 'email.opened', data: { to: ['a@b.de'] } },
      { type: 'suppression.added', data: { email: 'a@b.de' } },
      { type: 'email.bounced', data: { to: ['keine-adresse'], bounce: { type: 'Permanent' } } },
      null,
      'text',
    ]) {
      expect(readResendWebhookEvent(payload)).toEqual({ kind: 'ignore' })
    }
  })

  it('mailRecipientAddress zieht Adressen aus Anzeigenamen und verwirft Unsinn', () => {
    expect(mailRecipientAddress('Kai <KAI@Example.org>')).toBe('kai@example.org')
    expect(mailRecipientAddress(' kai@example.org ')).toBe('kai@example.org')
    expect(mailRecipientAddress('kai at example')).toBeNull()
    expect(mailRecipientAddress(42)).toBeNull()
  })
})

describe('nextUndeliverablePrefs / undeliverableNoticeReason', () => {
  const hash = mailUndeliverableEmailHash('aloha@example.com')

  it('führt zusammen, schaltet aus und setzt den Merker', () => {
    const next = nextUndeliverablePrefs({ bio: 'Surfer', emailNotifications: 'digest' }, { reason: 'bounce', emailHash: hash, at: 'T1' })
    expect(next).toEqual({ bio: 'Surfer', emailNotifications: 'off', emailUndeliverable: { reason: 'bounce', at: 'T1', emailHash: hash } })
  })

  it('schreibt nichts, wenn derselbe Merker steht und die Mails schon aus sind', () => {
    const prefs = { emailNotifications: 'off', emailUndeliverable: { reason: 'bounce', at: 'T1', emailHash: hash } }
    expect(nextUndeliverablePrefs(prefs, { reason: 'suppressed', emailHash: hash, at: 'T2' })).toBeNull()
  })

  it('wieder eingeschaltet ⇒ wieder aus, erster Grund und Zeitpunkt bleiben', () => {
    const prefs = { emailNotifications: 'instant', emailUndeliverable: { reason: 'bounce', at: 'T1', emailHash: hash } }
    expect(nextUndeliverablePrefs(prefs, { reason: 'suppressed', emailHash: hash, at: 'T2' })).toMatchObject({
      emailNotifications: 'off', emailUndeliverable: { reason: 'bounce', at: 'T1' },
    })
  })

  it('der Hinweis gilt nur für die AKTUELLE Adresse', () => {
    const prefs = { emailUndeliverable: { reason: 'complaint', at: 'T1', emailHash: hash } }
    expect(undeliverableNoticeReason(prefs, hash)).toBe('complaint')
    expect(undeliverableNoticeReason(prefs, mailUndeliverableEmailHash('neu@example.com'))).toBeNull()
    expect(undeliverableNoticeReason({}, hash)).toBeNull()
    expect(undeliverableNoticeReason({ emailUndeliverable: { reason: 'quatsch', at: 'T', emailHash: hash } }, hash)).toBeNull()
  })
})

// ── 3. Die Route ───────────────────────────────────────────────────────────

describe('POST /api/mail/resend-webhook', () => {
  it('ohne Secret ⇒ 404, kein Datenzugriff', async () => {
    configuredSecret = ''
    rawBody = JSON.stringify(bounced('Permanent'))
    headers = sign(rawBody)
    expect(await status(route(event))).toBe(404)
    expect(users.list).not.toHaveBeenCalled()
  })

  it('ungültige Signatur ⇒ 401, kein Datenzugriff', async () => {
    rawBody = JSON.stringify(bounced('Permanent'))
    headers = { ...sign(rawBody), 'svix-signature': 'v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' }
    expect(await status(route(event))).toBe(401)
    headers = {}
    expect(await status(route(event))).toBe(401)
    headers = sign(rawBody, 'msg_test', String(Math.floor(Date.now() / 1000) - 3600))
    expect(await status(route(event))).toBe(401)
    expect(users.list).not.toHaveBeenCalled()
    expect(productCalls).toEqual([])
  })

  it('harter Bounce ⇒ Mails aus (Prefs zusammengeführt), Abonnent abgemeldet', async () => {
    expect(await status(deliver(bounced('Permanent')))).toBe(200)
    expect(accounts[0]!.prefs).toEqual({
      bio: 'Surfer',
      emailLocale: 'de',
      emailNotifications: 'off',
      emailUndeliverable: { reason: 'bounce', at: expect.any(String), emailHash: mailUndeliverableEmailHash('aloha@example.com') },
    })
    expect(productCalls).toEqual([{ emailLower: 'aloha@example.com', reason: 'bounce' }])
  })

  it('Beschwerde ⇒ dieselbe Wirkung mit Grund complaint', async () => {
    expect(await status(deliver({ type: 'email.complained', data: { email_id: 'em_9', to: ['aloha@example.com'] } }))).toBe(200)
    expect(accounts[0]!.prefs).toMatchObject({ emailNotifications: 'off', emailUndeliverable: { reason: 'complaint' } })
    expect(productCalls).toEqual([{ emailLower: 'aloha@example.com', reason: 'complaint' }])
  })

  it('Wiederholung (gleiche svix-id) ⇒ 200 und kein zweiter Schreibvorgang', async () => {
    await deliver(bounced('Permanent'), 'msg_same')
    await deliver(bounced('Permanent'), 'msg_same')
    expect(users.updatePrefs).toHaveBeenCalledTimes(1)
    const marker = accounts[0]!.prefs.emailUndeliverable
    await deliver({ type: 'email.suppressed', data: { to: ['aloha@example.com'] } }, 'msg_later')
    expect(users.updatePrefs).toHaveBeenCalledTimes(1)
    expect(accounts[0]!.prefs.emailUndeliverable).toEqual(marker)
  })

  it('unbekannte Adresse ⇒ 200, kein Konto angefasst (Produkt-Layer fragt trotzdem)', async () => {
    expect(await status(deliver(bounced('Permanent', ['fremd@example.net'])))).toBe(200)
    expect(users.updatePrefs).not.toHaveBeenCalled()
    expect(productCalls).toEqual([{ emailLower: 'fremd@example.net', reason: 'bounce' }])
    expect(logs.find(entry => entry.name === 'mail.undeliverable')?.data.outcomes).toEqual({ account: 'none', newsletter: 'changed' })
  })

  it('weicher Bounce und fremde Ereignisse ⇒ 200, nichts geschrieben', async () => {
    expect(await status(deliver(bounced('Temporary')))).toBe(200)
    expect(await status(deliver({ type: 'email.delivered', data: { to: ['aloha@example.com'] } }))).toBe(200)
    expect(users.list).not.toHaveBeenCalled()
    expect(productCalls).toEqual([])
    expect(logs.map(entry => entry.name)).toEqual(['mail.bounce_soft'])
  })

  it('kaputter Produkt-Layer ⇒ 500 (Resend wiederholt), das Konto ist trotzdem erledigt', async () => {
    productBroken = true
    expect(await status(deliver(bounced('Permanent')))).toBe(500)
    expect(accounts[0]!.prefs.emailNotifications).toBe('off')
    expect(logs.find(entry => entry.name === 'mail.undeliverable_failed')?.data.outcomes).toEqual({ account: 'changed', newsletter: 'error' })
  })

  it('kranke Konto-Ablage ⇒ 500', async () => {
    usersBroken = true
    expect(await status(deliver(bounced('Permanent')))).toBe(500)
  })

  it('kein Log trägt eine Adresse — nur Ids und Domains', async () => {
    await deliver(bounced('Permanent'))
    await deliver(bounced('Temporary'))
    productBroken = true
    await status(deliver({ type: 'email.complained', data: { to: ['aloha@example.com'] } }))
    const text = JSON.stringify(logs)
    expect(text).not.toMatch(/aloha/i)
    expect(text).toContain('example.com')
    expect(text).toContain('msg_test')
  })
})

describe('applyMailUndeliverable', () => {
  it('meldet die Domain statt der Adresse', async () => {
    const summary = await applyMailUndeliverable(event, { emailLower: 'aloha@example.com', reason: 'bounce', at: 'T' })
    expect(summary).toEqual({ domain: 'example.com', outcomes: { account: 'changed', newsletter: 'changed' } })
  })
})
