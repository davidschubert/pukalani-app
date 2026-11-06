import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import {
  decideBrandWaitlistDecline,
  decideBrandWaitlistInvite,
  brandWaitlistStatusValues,
  normalizeBrandWaitlistStatus,
} from '../shared/brandWaitlistAdmin'
import { hashBrandInviteCode } from '../server/utils/brandInvites'
import type {
  BrandWaitlistAdminListResponse,
  BrandWaitlistDeclineResponse,
  BrandWaitlistInviteResponse,
  BrandWaitlistNoteResponse,
} from '../shared/types/brand'

/**
 * DIE BETREIBER-WARTELISTE, DURCHGESPIELT — gefälschte Ablage, echte Handler.
 *
 * Sechs Aussagen hängen NICHT an einer puren Funktion, sondern an der
 * Reihenfolge der Routen — und genau die verrutscht beim Umbauen still:
 *
 *  1. Die Liste zeigt NIE `tokenHash`/`tokenExpiresAt`. Das Geheimnis des
 *     Double-Opt-in gehört nicht in ein Browser-Fenster.
 *  2. Einladen erzeugt einen Code, der NUR als sha256 in der Ablage landet und
 *     im KLARTEXT ausschliesslich in der Mail steht — nicht in der Antwort,
 *     nicht im Log.
 *  3. Kein Code ohne Mail: schlägt der Versand fehl, wird die frisch angelegte
 *     Einladung wieder GELÖSCHT und der Status bleibt `confirmed`. Sonst wäre
 *     jemand still ausgeschlossen (eine `invited`-Zeile bekommt hier keinen
 *     zweiten Code).
 *  4. Zwei Absagen, zwei Codes: `not_confirmed` und `already_invited` sind auf
 *     der Seite zwei verschiedene Sätze.
 *  5. Ablehnen LÖSCHT NICHT — und aus `invited` geht es gar nicht.
 *  6. Jede Route ist ein Betreiber-Tor: ohne Session 401, ohne `users.manage`
 *     403 — und zwar BEVOR irgendetwas gelesen wird.
 */

interface FakeRow { $id: string, $createdAt: string, [key: string]: unknown }

/** `brand_waitlist` */
let waitlist: FakeRow[]
/** `brand_invites` */
let invites: FakeRow[]
let storeBroken: boolean
let mailBroken: boolean
let mailerConfigured: boolean
let mails: { to: string, subject: string, text: string }[]
let logs: { level: string, event: string, data: Record<string, unknown> }[]
let headers: Record<string, string>
/** Die Labels der Session — `null` = gar keine Session. */
let labels: string[] | null
let routeId: string
let query: Record<string, unknown>
let body: Record<string, unknown>

interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

function parse(queries: string[]): ParsedQuery[] {
  return queries.map(entry => JSON.parse(entry) as ParsedQuery)
}

/**
 * Der Fake filtert SELBST nach den Abfragen — sonst hinge „Filter wirkt" am
 * Test-Aufbau statt am Code (die Tautologie-Falle aus dem Presence-Beweis).
 */
const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    const parsed = parse(queries)
    let rows = tableId === 'brand_waitlist' ? [...waitlist] : [...invites]

    for (const entry of parsed) {
      if (entry.method === 'equal' && entry.attribute) {
        rows = rows.filter(row => (entry.values ?? []).includes(row[entry.attribute!] as never))
      }
    }
    if (parsed.some(entry => entry.method === 'orderDesc')) {
      rows.sort((a, b) => b.$createdAt.localeCompare(a.$createdAt))
    }
    const total = rows.length

    const cursor = parsed.find(entry => entry.method === 'cursorAfter')?.values?.[0] as string | undefined
    if (cursor) {
      const at = rows.findIndex(row => row.$id === cursor)
      rows = at >= 0 ? rows.slice(at + 1) : rows
    }
    const limit = parsed.find(entry => entry.method === 'limit')?.values?.[0] as number | undefined
    if (typeof limit === 'number') rows = rows.slice(0, limit)

    return { rows, total }
  }),
  getRow: vi.fn(async ({ rowId }: { rowId: string }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    const row = waitlist.find(entry => entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404)
    return row
  }),
  createRow: vi.fn(async ({ tableId, data }: { tableId: string, data: Record<string, unknown> }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    const row: FakeRow = { $id: `i${invites.length + 1}`, $createdAt: new Date().toISOString(), ...data }
    if (tableId === 'brand_invites') invites.push(row)
    else waitlist.push(row)
    return row
  }),
  updateRow: vi.fn(async ({ rowId, data }: { rowId: string, data: Record<string, unknown> }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    const row = waitlist.find(entry => entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404)
    Object.assign(row, data)
    return row
  }),
  deleteRow: vi.fn(async ({ rowId }: { rowId: string }) => {
    invites = invites.filter(entry => entry.$id !== rowId)
    return {}
  }),
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({
  public: { appwriteDatabaseId: 'main', appUrl: 'https://branding.supply' },
}))
vi.stubGlobal('useAppConfig', () => ({ pukalani: { brand: {} } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('logEvent', (level: string, event: string, data: Record<string, unknown> = {}) => {
  logs.push({ level, event, data })
})
/** Dieselbe Rechnung wie core/server/utils/requirePermission.ts. */
vi.stubGlobal('requirePermission', (_event: H3Event, capability: string) => {
  if (labels === null) throw createError({ status: 401, statusText: 'Unauthorized' })
  if (!labels.includes('admin') && capability !== 'dashboard.access') {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }
  return { $id: 'u-operator', labels }
})
vi.stubGlobal('getRouterParam', () => routeId)
vi.stubGlobal('getValidatedQuery', async (_event: H3Event, run: (input: unknown) => unknown) => run(query))
vi.stubGlobal('readValidatedBody', async (_event: H3Event, run: (input: unknown) => unknown) => run(body))
vi.stubGlobal('setHeader', (_event: H3Event, key: string, value: string) => {
  headers[key] = value
})
vi.stubGlobal('sendMail', async (_event: H3Event, mail: { to: string, subject: string, text: string }) => {
  if (mailBroken) throw new Error('SMTP down')
  if (!mailerConfigured) return false
  mails.push(mail)
  return true
})

const listHandler = (await import('../server/api/brand/admin/waitlist/index.get'))
  .default as unknown as (event: H3Event) => Promise<BrandWaitlistAdminListResponse>
const exportHandler = (await import('../server/api/brand/admin/waitlist/export.get'))
  .default as unknown as (event: H3Event) => Promise<string>
const inviteHandler = (await import('../server/api/brand/admin/waitlist/[id]/invite.post'))
  .default as unknown as (event: H3Event) => Promise<BrandWaitlistInviteResponse>
const declineHandler = (await import('../server/api/brand/admin/waitlist/[id]/decline.post'))
  .default as unknown as (event: H3Event) => Promise<BrandWaitlistDeclineResponse>
const noteHandler = (await import('../server/api/brand/admin/waitlist/[id]/index.patch'))
  .default as unknown as (event: H3Event) => Promise<BrandWaitlistNoteResponse>

const event = { context: {} } as unknown as H3Event

function row(id: string, over: Record<string, unknown> = {}): FakeRow {
  return {
    $id: id,
    $createdAt: `2026-09-0${id.slice(-1)}T10:00:00.000Z`,
    emailLower: `${id}@kailua.coffee`,
    email: `${id}@kailua.coffee`,
    name: 'Kai',
    company: 'Kailua Coffee',
    website: 'https://kailua.coffee',
    locale: 'de',
    source: 'about',
    status: 'confirmed',
    note: '',
    tokenHash: 'f'.repeat(64),
    tokenExpiresAt: '2026-09-09T10:00:00.000Z',
    confirmedAt: '2026-09-02T10:00:00.000Z',
    ...over,
  }
}

/** Der rohe Code aus der Mail — er steht sonst nirgends. */
function codeFromMail(): string {
  return /code=([a-f0-9]+)/.exec(mails.at(-1)?.text ?? '')?.[1] ?? ''
}

beforeEach(() => {
  waitlist = []
  invites = []
  storeBroken = false
  mailBroken = false
  mailerConfigured = true
  mails = []
  logs = []
  headers = {}
  labels = ['admin']
  routeId = 'w1'
  query = {}
  body = {}
  tablesDB.listRows.mockClear()
  tablesDB.getRow.mockClear()
  tablesDB.createRow.mockClear()
  tablesDB.updateRow.mockClear()
  tablesDB.deleteRow.mockClear()
})

describe('shared/brandWaitlistAdmin (die puren Regeln)', () => {
  it('rechnet den Bestands-Wert "new" auf pending um — und alles Unbekannte auch', () => {
    expect(normalizeBrandWaitlistStatus('new')).toBe('pending')
    expect(normalizeBrandWaitlistStatus('')).toBe('pending')
    expect(normalizeBrandWaitlistStatus('quatsch')).toBe('pending')
    expect(normalizeBrandWaitlistStatus('invited')).toBe('invited')
  })

  it('der pending-Filter fasst den Alt-Wert mit ein, "all" filtert gar nicht', () => {
    expect(brandWaitlistStatusValues('pending')).toEqual(['pending', 'new'])
    expect(brandWaitlistStatusValues('invited')).toEqual(['invited'])
    expect(brandWaitlistStatusValues('all')).toBeNull()
  })

  it('einladen nur aus confirmed — mit zwei unterscheidbaren Absagen', () => {
    expect(decideBrandWaitlistInvite('confirmed')).toEqual({ ok: true })
    expect(decideBrandWaitlistInvite('pending')).toEqual({ ok: false, code: 'not_confirmed' })
    expect(decideBrandWaitlistInvite('declined')).toEqual({ ok: false, code: 'not_confirmed' })
    expect(decideBrandWaitlistInvite('invited')).toEqual({ ok: false, code: 'already_invited' })
  })

  it('ablehnen: aus invited nie, aus declined folgenlos', () => {
    expect(decideBrandWaitlistDecline('confirmed')).toEqual({ action: 'decline' })
    expect(decideBrandWaitlistDecline('pending')).toEqual({ action: 'decline' })
    expect(decideBrandWaitlistDecline('declined')).toEqual({ action: 'noop' })
    expect(decideBrandWaitlistDecline('invited')).toEqual({ action: 'refuse', code: 'already_invited' })
  })
})

describe('GET /api/brand/admin/waitlist', () => {
  beforeEach(() => {
    waitlist = [
      row('w1', { status: 'confirmed' }),
      row('w2', { status: 'pending' }),
      row('w3', { status: 'invited' }),
      row('w4', { status: 'declined' }),
      row('w5', { status: 'new' }),
    ]
  })

  it('zeigt ohne Angabe die ARBEITSLISTE: nur bestätigte Einträge', async () => {
    const result = await listHandler(event)

    expect(result.items.map(item => item.id)).toEqual(['w1'])
    expect(result.total).toBe(1)
  })

  it('liefert NIE den Token-Hash oder die Frist nach draußen', async () => {
    query = { status: 'all' }
    const result = await listHandler(event)

    expect(result.items).toHaveLength(5)
    const dump = JSON.stringify(result)
    expect(dump).not.toContain('tokenHash')
    expect(dump).not.toContain('f'.repeat(64))
    expect(dump).not.toContain('tokenExpiresAt')
  })

  it('zählt IMMER alle vier Zustände, unabhängig vom Filter — inkl. Alt-Wert', async () => {
    query = { status: 'invited' }
    const result = await listHandler(event)

    expect(result.items.map(item => item.id)).toEqual(['w3'])
    // w2 (pending) + w5 (new): der Bestands-Wert zählt zu den Wartenden.
    expect(result.counts).toEqual({ pending: 2, confirmed: 1, invited: 1, declined: 1 })
  })

  it('normalisiert den Status der Zeile (aus "new" wird pending)', async () => {
    query = { status: 'pending' }
    const result = await listHandler(event)

    expect(result.items.map(item => item.status)).toEqual(['pending', 'pending'])
  })

  it('respektiert das Limit und meldet den Cursor nur bei voller Seite', async () => {
    query = { status: 'all', limit: 2 }
    const first = await listHandler(event)

    expect(first.items).toHaveLength(2)
    expect(first.nextCursor).toBe(first.items[1]!.id)

    query = { status: 'all', limit: 2, cursor: first.nextCursor }
    const second = await listHandler(event)
    expect(second.items.map(item => item.id)).not.toContain(first.items[0]!.id)

    query = { status: 'confirmed' }
    const last = await listHandler(event)
    expect(last.nextCursor).toBe('')
  })

  it('lehnt ein Limit über dem Deckel ab, statt es stillschweigend zu nehmen', async () => {
    query = { status: 'all', limit: 5000 }
    await expect(listHandler(event)).rejects.toThrow()
  })

  it('kaputte Ablage ⇒ 503 `waitlist_unavailable`', async () => {
    storeBroken = true
    await expect(listHandler(event)).rejects.toMatchObject({
      status: 503,
      data: { code: 'waitlist_unavailable' },
    })
  })

  it('ohne Session 401, ohne users.manage 403 — und ohne einen einzigen Lesezugriff', async () => {
    labels = null
    await expect(listHandler(event)).rejects.toMatchObject({ status: 401 })

    labels = []
    await expect(listHandler(event)).rejects.toMatchObject({ status: 403 })

    expect(tablesDB.listRows).not.toHaveBeenCalled()
  })
})

describe('POST /api/brand/admin/waitlist/:id/invite', () => {
  beforeEach(() => {
    waitlist = [row('w1', { status: 'confirmed' })]
  })

  it('legt einen an die Adresse gebundenen Code an, schickt ihn und stempelt "invited"', async () => {
    const result = await inviteHandler(event)

    expect(result).toEqual({ ok: true, status: 'invited' })
    expect(invites).toHaveLength(1)
    expect(invites[0]).toMatchObject({
      emailLower: 'w1@kailua.coffee',
      createdByUserId: 'u-operator',
    })
    expect(typeof invites[0]!.expiresAt).toBe('string')
    expect(waitlist[0]!.status).toBe('invited')

    // Die Mail trägt den ROHEN Code, die Ablage nur seinen sha256.
    const code = codeFromMail()
    expect(code).toHaveLength(64)
    expect(invites[0]!.codeHash).toBe(hashBrandInviteCode(code))
    expect(invites[0]!.codeHash).not.toBe(code)
  })

  it('die Mail spricht die Sprache der Zeile und verlinkt den Einlöse-Weg', async () => {
    await inviteHandler(event)
    expect(mails[0]!.subject).toBe('Euer Zugang zu Branding Supply')
    expect(mails[0]!.text).toContain('https://branding.supply/de/invite?code=')

    waitlist = [row('w1', { status: 'confirmed', locale: 'en' })]
    mails = []
    await inviteHandler(event)
    expect(mails[0]!.subject).toBe('Your access to Branding Supply')
    expect(mails[0]!.text).toContain('https://branding.supply/invite?code=')
  })

  it('der rohe Code steht in KEINER Log-Zeile und in KEINER Antwort', async () => {
    const result = await inviteHandler(event)
    const code = codeFromMail()

    expect(JSON.stringify(result)).not.toContain(code)
    const dump = JSON.stringify(logs)
    expect(logs.length).toBeGreaterThan(0)
    expect(dump).not.toContain(code)
    expect(dump).not.toContain(code.slice(0, 8))
  })

  it('unbestätigt ⇒ 409 `not_confirmed`, ohne Code und ohne Mail', async () => {
    waitlist = [row('w1', { status: 'pending' })]

    await expect(inviteHandler(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'not_confirmed' },
    })
    expect(invites).toHaveLength(0)
    expect(mails).toHaveLength(0)
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('schon eingeladen ⇒ 409 `already_invited` (kein zweiter Code über diese Fläche)', async () => {
    waitlist = [row('w1', { status: 'invited' })]

    await expect(inviteHandler(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'already_invited' },
    })
    expect(invites).toHaveLength(0)
  })

  it('ausgefallene Mail ⇒ 503, der Code wird GELÖSCHT und der Status bleibt confirmed', async () => {
    mailBroken = true

    await expect(inviteHandler(event)).rejects.toMatchObject({
      status: 503,
      data: { code: 'invite_mail_failed' },
    })
    expect(invites).toHaveLength(0)
    expect(tablesDB.deleteRow).toHaveBeenCalledTimes(1)
    expect(waitlist[0]!.status).toBe('confirmed')
  })

  it('kein konfigurierter Mailer zählt genauso — `sendMail` wirft dort nicht, es liefert false', async () => {
    mailerConfigured = false

    await expect(inviteHandler(event)).rejects.toMatchObject({
      status: 503,
      data: { code: 'invite_mail_failed' },
    })
    expect(invites).toHaveLength(0)
    expect(waitlist[0]!.status).toBe('confirmed')
  })

  it('unbekannte Zeile ⇒ 404', async () => {
    routeId = 'gibtsnicht'
    await expect(inviteHandler(event)).rejects.toMatchObject({
      status: 404,
      data: { code: 'not_found' },
    })
  })

  it('ohne users.manage 403 — bevor irgendein Code entsteht', async () => {
    labels = []
    await expect(inviteHandler(event)).rejects.toMatchObject({ status: 403 })
    expect(invites).toHaveLength(0)
    expect(mails).toHaveLength(0)
  })
})

describe('POST /api/brand/admin/waitlist/:id/decline', () => {
  it('setzt den Status auf declined — und löscht die Zeile NICHT', async () => {
    waitlist = [row('w1', { status: 'confirmed' })]

    const result = await declineHandler(event)

    expect(result).toEqual({ ok: true, status: 'declined' })
    expect(waitlist).toHaveLength(1)
    expect(waitlist[0]!.status).toBe('declined')
    // Notiz und Angaben bleiben unangetastet.
    expect(waitlist[0]!.company).toBe('Kailua Coffee')
  })

  it('geht auch aus pending', async () => {
    waitlist = [row('w1', { status: 'pending' })]
    await declineHandler(event)
    expect(waitlist[0]!.status).toBe('declined')
  })

  it('aus invited nicht ⇒ 409 `already_invited`', async () => {
    waitlist = [row('w1', { status: 'invited' })]

    await expect(declineHandler(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'already_invited' },
    })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('zweimal ablehnen ist kein Fehler und schreibt nicht noch einmal', async () => {
    waitlist = [row('w1', { status: 'declined' })]

    const result = await declineHandler(event)

    expect(result).toEqual({ ok: true, status: 'declined' })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('ohne users.manage 403', async () => {
    waitlist = [row('w1')]
    labels = []
    await expect(declineHandler(event)).rejects.toMatchObject({ status: 403 })
  })
})

describe('PATCH /api/brand/admin/waitlist/:id', () => {
  beforeEach(() => {
    waitlist = [row('w1', { note: 'alt' })]
  })

  it('schreibt die Notiz — und nur sie', async () => {
    body = { note: '  Kennt David aus dem Studio  ' }

    const result = await noteHandler(event)

    expect(result).toEqual({ ok: true })
    expect(waitlist[0]!.note).toBe('Kennt David aus dem Studio')
    expect(waitlist[0]!.status).toBe('confirmed')
    expect(tablesDB.updateRow).toHaveBeenCalledWith(expect.objectContaining({
      data: { note: 'Kennt David aus dem Studio' },
    }))
  })

  it('eine leere Notiz löscht sie', async () => {
    body = { note: '' }
    await noteHandler(event)
    expect(waitlist[0]!.note).toBe('')
  })

  it('über 500 Zeichen ⇒ abgelehnt, bevor die Ablage es sieht', async () => {
    body = { note: 'x'.repeat(501) }

    await expect(noteHandler(event)).rejects.toThrow()
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('ein Status im Rumpf wird abgewiesen (strict) — die Zustands-Regeln gelten', async () => {
    body = { note: 'ok', status: 'invited' }

    await expect(noteHandler(event)).rejects.toThrow()
    expect(waitlist[0]!.status).toBe('confirmed')
  })

  it('ohne users.manage 403', async () => {
    labels = []
    body = { note: 'egal' }
    await expect(noteHandler(event)).rejects.toMatchObject({ status: 403 })
  })
})

describe('GET /api/brand/admin/waitlist/export', () => {
  beforeEach(() => {
    waitlist = [
      row('w1', { status: 'confirmed' }),
      row('w2', { status: 'pending', company: '=SUM(1+1)', name: 'Zeile\nUmbruch' }),
    ]
  })

  it('liefert Excel-taugliches CSV: BOM, Semikolon, CRLF', async () => {
    query = { status: 'all' }
    const csv = await exportHandler(event)

    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('\r\n')
    const [header] = csv.replace('﻿', '').split('\r\n')
    expect(header).toBe('id;email;name;company;website;locale;source;status;note;createdAt;confirmedAt')
    expect(headers['Content-Type']).toBe('text/csv; charset=utf-8')
    expect(headers['Content-Disposition']).toContain('warteliste-')
  })

  it('entschärft Formeln und Zeilenumbrüche aus fremder Eingabe', async () => {
    query = { status: 'all' }
    const csv = await exportHandler(event)

    expect(csv).toContain('"\'=SUM(1+1)"')
    expect(csv).toContain('"Zeile Umbruch"')
  })

  it('folgt dem Filter — was man sieht, lädt man herunter', async () => {
    query = { status: 'confirmed' }
    const csv = await exportHandler(event)

    expect(csv).toContain('w1@kailua.coffee')
    expect(csv).not.toContain('w2@kailua.coffee')
  })

  it('trägt keinen Token-Hash', async () => {
    query = { status: 'all' }
    const csv = await exportHandler(event)
    expect(csv).not.toContain('f'.repeat(64))
  })

  it('ohne users.manage 403', async () => {
    labels = []
    await expect(exportHandler(event)).rejects.toMatchObject({ status: 403 })
  })
})
