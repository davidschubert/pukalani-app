import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import type { BrandWaitlistResponse } from '../shared/types/brand'
import { hashBrandWaitlistToken } from '../server/utils/brandWaitlist'

/**
 * DIE WARTELISTE, DURCHGESPIELT — gefälschte Ablage, echter Handler.
 *
 * Fünf Aussagen hängen NICHT in einer puren Funktion, sondern in der
 * Reihenfolge der Route, und genau die verrutscht beim Umbauen still:
 *
 *  1. Eine neue Adresse entsteht als `pending` MIT Token-Hash und Frist — und
 *     der Betreiber erfährt an dieser Stelle NICHTS. Genau dafür ist das
 *     Double-Opt-in da (Davids Entscheidung: „sonst spammen die mir das Fach
 *     voll").
 *  2. Eine unbestätigte Zeile bekommt einen NEUEN Hash und eine neue Mail —
 *     und dieselbe Antwort wie eine neue Adresse. Ein Unterschied wäre eine
 *     Auskunft über eine fremde Adresse.
 *  3. Eine bestätigte Zeile wird NICHT angefasst und bekommt KEINE Mail.
 *  4. Eine ausgefallene Mail wird zu 503 `waitlist_mail_failed` — NICHT zu
 *     einem 200. Ohne Link gibt es keine Bestätigung, ein „geschafft!" wäre
 *     eine Lüge. Die Zeile bleibt trotzdem stehen (pending, unschädlich).
 *  5. Der Honigtopf antwortet WIE DER ERFOLG — und schreibt nichts. Ein
 *     abweichender Status wäre die Rückmeldung, an der ein Bot lernt.
 *
 * Dazu die Regel, die keinen eigenen Zweig hat und trotzdem gilt: der ROHE
 * Token steht in der Mail und NIRGENDS sonst — schon gar nicht im Log.
 */

interface FakeRow { $id: string, [key: string]: unknown }

/** Was in der Tabelle liegt, wenn die Route nachsieht. */
let stored: FakeRow[]
/** Wirft die Ablage? (fehlende Tabelle / kranke Appwrite) */
let storeBroken: boolean
/** Die Empfänger-Adresse aus der App-Config ('' = keine Mail). */
let notifyTo: string
/** Wirft der Mailer? */
let mailBroken: boolean
/** Gibt es überhaupt einen Versandweg? (`sendMail` liefert sonst still `false`.) */
let mailerConfigured: boolean
/** Die zugestellten Mails dieses Laufs. */
let mails: { to: string, subject: string, text: string }[]
let logs: { level: string, event: string, data: Record<string, unknown> }[]
let body: Record<string, unknown>

const tablesDB = {
  listRows: vi.fn(async () => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    return { rows: stored, total: stored.length }
  }),
  createRow: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    const row = { $id: `w${stored.length + 1}`, ...data }
    stored.push(row)
    return row
  }),
  updateRow: vi.fn(async ({ rowId, data }: { rowId: string, data: Record<string, unknown> }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    const row = stored.find(entry => entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404)
    Object.assign(row, data)
    return row
  }),
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({
  public: { appwriteDatabaseId: 'main', appUrl: 'https://branding.supply' },
}))
vi.stubGlobal('useAppConfig', () => ({ pukalani: { brand: { waitlistNotify: notifyTo } } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('logEvent', (level: string, event: string, data: Record<string, unknown> = {}) => {
  logs.push({ level, event, data })
})
vi.stubGlobal('readValidatedBody', async (_event: H3Event, parse: (input: unknown) => unknown) => parse(body))
vi.stubGlobal('sendMail', async (_event: H3Event, mail: { to: string, subject: string, text: string }) => {
  if (mailBroken) throw new Error('SMTP down')
  // Der stille Fall: ohne konfigurierten Mailer wirft `sendMail` NICHT, es
  // liefert `false` — genau daran liefe ein `.catch()` allein vorbei.
  if (!mailerConfigured) return false
  mails.push(mail)
  return true
})

const handler = (await import('../server/api/brand/waitlist.post'))
  .default as unknown as (event: H3Event) => Promise<BrandWaitlistResponse>

const event = { context: {} } as unknown as H3Event

/** Eine Zeile, wie die Route sie schreibt. */
function lastWrite(): Record<string, unknown> {
  const call = tablesDB.createRow.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> } | undefined
  return call?.data ?? {}
}

/** Der rohe Token aus der zugestellten Mail — er steht sonst nirgends. */
function tokenFromMail(): string {
  return /token=([a-f0-9]+)/.exec(mails.at(-1)?.text ?? '')?.[1] ?? ''
}

beforeEach(() => {
  stored = []
  storeBroken = false
  notifyTo = ''
  mailBroken = false
  mailerConfigured = true
  mails = []
  logs = []
  body = { email: 'Aloha@Kailua.Coffee', name: 'Kai', company: 'Kailua Coffee', website: 'kailua.coffee', locale: 'de', source: 'about' }
  tablesDB.listRows.mockClear()
  tablesDB.createRow.mockClear()
  tablesDB.updateRow.mockClear()
})

describe('POST /api/brand/waitlist', () => {
  it('legt eine neue Anfrage als "pending" an — mit Hash, Frist und Bestätigungs-Mail', async () => {
    const result = await handler(event)

    expect(result).toEqual({ ok: true, state: 'mail_sent' })
    expect(tablesDB.createRow).toHaveBeenCalledTimes(1)

    const written = lastWrite()
    expect(written).toMatchObject({
      emailLower: 'aloha@kailua.coffee',
      email: 'aloha@kailua.coffee',
      name: 'Kai',
      company: 'Kailua Coffee',
      website: 'https://kailua.coffee',
      locale: 'de',
      source: 'about',
      status: 'pending',
      note: '',
      confirmedAt: '',
    })

    // Der HASH steht in der Zeile, der ROHE Token nur in der Mail.
    const token = tokenFromMail()
    expect(token).toHaveLength(64)
    expect(written.tokenHash).toBe(hashBrandWaitlistToken(token))
    expect(JSON.stringify(written)).not.toContain(token)

    // Die Frist liegt rund 24 Stunden voraus.
    const expires = Date.parse(String(written.tokenExpiresAt))
    const hours = (expires - Date.now()) / 3_600_000
    expect(hours).toBeGreaterThan(23.5)
    expect(hours).toBeLessThan(24.5)
  })

  it('schickt die Bestätigung an die ADRESSE — mit Sprach-Präfix und 24-Stunden-Hinweis', async () => {
    await handler(event)

    expect(mails).toHaveLength(1)
    expect(mails[0]!.to).toBe('aloha@kailua.coffee')
    expect(mails[0]!.subject).toBe('Bitte bestätigt eure Warteliste-Anfrage — Branding Supply')
    expect(mails[0]!.text).toContain('https://branding.supply/de/waitlist/confirm?token=')
    expect(mails[0]!.text).toContain('24 Stunden')
    expect(mails[0]!.text).toContain('ignoriert diese Mail')
  })

  it('englische Anfragen bekommen den Link OHNE Präfix', async () => {
    body = { ...body, locale: 'en' }

    await handler(event)

    expect(mails[0]!.subject).toBe('Please confirm your waitlist request — Branding Supply')
    expect(mails[0]!.text).toContain('https://branding.supply/waitlist/confirm?token=')
  })

  it('meldet dem Betreiber NICHTS — das passiert erst beim Bestätigen', async () => {
    notifyTo = 'hallo@pukalani.app'

    await handler(event)

    expect(mails).toHaveLength(1)
    expect(mails.map(mail => mail.to)).not.toContain('hallo@pukalani.app')
  })

  it('protokolliert nur Herkunft, Sprache und Zustand — nie Adresse oder Token', async () => {
    await handler(event)

    const joined = logs.find(entry => entry.event === 'brand.waitlist_joined')
    expect(joined?.data).toEqual({ source: 'about', locale: 'de', state: 'mail_sent' })
    expect(JSON.stringify(logs)).not.toContain('kailua.coffee')
    expect(JSON.stringify(logs)).not.toContain(tokenFromMail())
  })

  it('unbestätigte Zeile: neuer Hash, neue Mail, dieselbe Antwort', async () => {
    stored = [{
      $id: 'w1',
      emailLower: 'aloha@kailua.coffee',
      status: 'pending',
      tokenHash: 'alter-hash',
      tokenExpiresAt: '2020-01-01T00:00:00.000Z',
      note: 'Betreiber-Notiz',
    }]

    const result = await handler(event)

    expect(result).toEqual({ ok: true, state: 'mail_sent' })
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect(tablesDB.updateRow).toHaveBeenCalledTimes(1)

    const patch = (tablesDB.updateRow.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data
    // NUR die Token-Felder: die Notiz und der Status der ersten Anfrage bleiben.
    expect(Object.keys(patch).sort()).toEqual(['tokenExpiresAt', 'tokenHash'])
    expect(patch.tokenHash).toBe(hashBrandWaitlistToken(tokenFromMail()))
    expect(patch.tokenHash).not.toBe('alter-hash')
    expect(stored[0]!.note).toBe('Betreiber-Notiz')
    expect(mails).toHaveLength(1)
  })

  it('der Altwert "new" gilt wie "pending"', async () => {
    stored = [{ $id: 'w1', emailLower: 'aloha@kailua.coffee', status: 'new' }]

    const result = await handler(event)

    expect(result).toEqual({ ok: true, state: 'mail_sent' })
    expect(tablesDB.updateRow).toHaveBeenCalledTimes(1)
    expect(mails).toHaveLength(1)
  })

  it('bestätigte Zeile: nichts schreiben, nichts mailen, `already_confirmed`', async () => {
    notifyTo = 'hallo@pukalani.app'
    stored = [{ $id: 'w1', emailLower: 'aloha@kailua.coffee', status: 'confirmed' }]

    const result = await handler(event)

    expect(result).toEqual({ ok: true, state: 'already_confirmed' })
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(mails).toHaveLength(0)
    expect(logs.find(entry => entry.event === 'brand.waitlist_joined')?.data.state)
      .toBe('already_confirmed')
  })

  it('fragt mit Limit 1 nach der kleingeschriebenen Adresse', async () => {
    await handler(event)
    const queries = (tablesDB.listRows.mock.calls[0]?.[0] as { queries: string[] }).queries
    expect(queries).toHaveLength(2)
    expect(queries.join(' ')).toContain('aloha@kailua.coffee')
    expect(queries.join(' ')).toContain('limit')
  })

  it('HONIGTOPF: antwortet wie der Erfolg, speichert und mailt aber nichts', async () => {
    body = { ...body, hp: 'ich bin ein Skript' }

    const result = await handler(event)

    expect(result).toEqual({ ok: true, state: 'mail_sent' })
    expect(tablesDB.listRows).not.toHaveBeenCalled()
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect(mails).toHaveLength(0)
    expect(logs.map(entry => entry.event)).toContain('brand.waitlist_honeypot')
  })

  it('kaputte Ablage ⇒ 503 mit `waitlist_unavailable`, Adresse nur maskiert im Log', async () => {
    storeBroken = true

    await expect(handler(event)).rejects.toMatchObject({
      status: 503,
      data: { code: 'waitlist_unavailable' },
    })
    const warned = logs.find(entry => entry.event === 'brand.waitlist_unavailable')
    expect(warned?.level).toBe('warn')
    expect(warned?.data.email).toBe('a***@kailua.coffee')
  })

  it('SMTP-Fehler ⇒ 503 `waitlist_mail_failed`, die Zeile bleibt stehen', async () => {
    mailBroken = true

    await expect(handler(event)).rejects.toMatchObject({
      status: 503,
      data: { code: 'waitlist_mail_failed' },
    })
    // Geschrieben wurde VOR dem Versand — die Zeile ist pending und harmlos.
    expect(tablesDB.createRow).toHaveBeenCalledTimes(1)
    expect(stored).toHaveLength(1)
    expect(logs.find(entry => entry.event === 'brand.waitlist_mail_failed')?.data.email)
      .toBe('a***@kailua.coffee')
  })

  it('KEIN Mailer konfiguriert ⇒ derselbe 503 (kein stilles "geschafft")', async () => {
    mailerConfigured = false

    await expect(handler(event)).rejects.toMatchObject({
      status: 503,
      data: { code: 'waitlist_mail_failed' },
    })
  })
})
