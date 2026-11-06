import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import type { BrandWaitlistConfirmResponse } from '../shared/types/brand'
import { hashBrandWaitlistToken } from '../server/utils/brandWaitlist'

/**
 * DER KLICK AUS DER MAIL — gefälschte Ablage, echter Handler.
 *
 * Was hier geprüft wird, ist die REIHENFOLGE, und die ist der ganze Punkt des
 * Double-Opt-in:
 *
 *  1. Gültiger Token ⇒ die Zeile wird bestätigt UND ihr Hash GELÖSCHT. Ohne
 *     das Löschen bliebe ein weitergeleiteter Link auf Dauer scharf.
 *  2. ERST DANACH geht die Meldung an den Betreiber — sie ist der Ertrag der
 *     Bestätigung, nicht ihre Bedingung (fail-soft: ein SMTP-Aussetzer darf die
 *     geschriebene Bestätigung nicht zurücknehmen).
 *  3. Abgelaufen ⇒ 410, und die Zeile bleibt `pending`. Sie zu verwerfen wäre
 *     Datenverlust für einen Menschen, der nur zu spät geklickt hat.
 *  4. Unbekannt ⇒ 400. Dazu gehört der ZWEITE Klick auf denselben Link: sein
 *     Hash steht nach der Bestätigung nicht mehr in der Tabelle.
 *  5. Der Token steht in keiner Log-Zeile — auch nicht gekürzt.
 */

interface FakeRow { $id: string, [key: string]: unknown }

let stored: FakeRow[]
let storeBroken: boolean
let updateBroken: boolean
let notifyTo: string
let mailBroken: boolean
let mails: { to: string, subject: string, text: string }[]
let logs: { level: string, event: string, data: Record<string, unknown> }[]
let body: Record<string, unknown>

/** Der Token, den die Mail getragen hätte — 64 hex, wie `randomBytes(32)`. */
const TOKEN = 'a'.repeat(64)
const OTHER_TOKEN = 'b'.repeat(64)

const tablesDB = {
  listRows: vi.fn(async ({ queries }: { queries: string[] }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    // Der Fake filtert selbst, damit „falscher Token findet nichts" wirklich
    // an der ABFRAGE hängt und nicht daran, dass der Test nichts hinlegt.
    const wanted = /"values":\["([a-f0-9]+)"\]/.exec(queries.join(' '))?.[1] ?? ''
    const rows = stored.filter(row => row.tokenHash === wanted)
    return { rows, total: rows.length }
  }),
  updateRow: vi.fn(async ({ rowId, data }: { rowId: string, data: Record<string, unknown> }) => {
    if (updateBroken) throw new AppwriteException('Table not found', 404)
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
  mails.push(mail)
  return true
})

const handler = (await import('../server/api/brand/waitlist/confirm.post'))
  .default as unknown as (event: H3Event) => Promise<BrandWaitlistConfirmResponse>

const event = { context: {} } as unknown as H3Event

/** Eine wartende Zeile mit gültigem Link. */
function pendingRow(overrides: Record<string, unknown> = {}): FakeRow {
  return {
    $id: 'w1',
    emailLower: 'aloha@kailua.coffee',
    email: 'aloha@kailua.coffee',
    name: 'Kai',
    company: 'Kailua Coffee',
    website: 'https://kailua.coffee',
    locale: 'de',
    source: 'about',
    status: 'pending',
    note: '',
    tokenHash: hashBrandWaitlistToken(TOKEN),
    tokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    confirmedAt: '',
    ...overrides,
  }
}

beforeEach(() => {
  stored = [pendingRow()]
  storeBroken = false
  updateBroken = false
  notifyTo = ''
  mailBroken = false
  mails = []
  logs = []
  body = { token: TOKEN }
  tablesDB.listRows.mockClear()
  tablesDB.updateRow.mockClear()
})

describe('POST /api/brand/waitlist/confirm', () => {
  it('bestätigt die Zeile und LÖSCHT dabei Hash und Frist', async () => {
    const result = await handler(event)

    expect(result).toEqual({ ok: true, state: 'confirmed' })
    const patch = (tablesDB.updateRow.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data
    expect(patch.status).toBe('confirmed')
    expect(patch.tokenHash).toBe('')
    expect(patch.tokenExpiresAt).toBe('')
    expect(Date.parse(String(patch.confirmedAt))).toBeGreaterThan(0)
  })

  it('sucht über den HASH, nie über den rohen Token', async () => {
    await handler(event)
    const queries = (tablesDB.listRows.mock.calls[0]?.[0] as { queries: string[] }).queries.join(' ')
    expect(queries).toContain(hashBrandWaitlistToken(TOKEN))
    expect(queries).not.toContain(TOKEN)
    expect(queries).toContain('limit')
  })

  it('meldet dem Betreiber ERST JETZT — mit den Angaben aus der Zeile', async () => {
    notifyTo = 'hallo@pukalani.app'

    await handler(event)

    expect(mails).toHaveLength(1)
    expect(mails[0]!.to).toBe('hallo@pukalani.app')
    expect(mails[0]!.subject).toBe('Neue Warteliste-Anfrage: Kailua Coffee')
    expect(mails[0]!.text).toContain('aloha@kailua.coffee')
    expect(mails[0]!.text).toContain('about')
  })

  it('ohne konfigurierte Adresse geht keine Meldung raus', async () => {
    await handler(event)
    expect(mails).toHaveLength(0)
  })

  it('ein Fehler der Betreiber-Mail ändert die Antwort NICHT', async () => {
    notifyTo = 'hallo@pukalani.app'
    mailBroken = true

    const result = await handler(event)

    expect(result).toEqual({ ok: true, state: 'confirmed' })
    expect(stored[0]!.status).toBe('confirmed')
  })

  it('der ZWEITE Klick auf denselben Link ist unbekannt ⇒ 400', async () => {
    await handler(event)

    await expect(handler(event)).rejects.toMatchObject({
      status: 400,
      data: { code: 'token_invalid' },
    })
  })

  it('unbekannter Token ⇒ 400 `token_invalid`', async () => {
    body = { token: OTHER_TOKEN }

    await expect(handler(event)).rejects.toMatchObject({
      status: 400,
      data: { code: 'token_invalid' },
    })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('abgelaufener Token ⇒ 410 `token_expired`, die Zeile bleibt pending', async () => {
    stored = [pendingRow({ tokenExpiresAt: new Date(Date.now() - 1000).toISOString() })]

    await expect(handler(event)).rejects.toMatchObject({
      status: 410,
      data: { code: 'token_expired' },
    })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(stored[0]!.status).toBe('pending')
    expect(stored[0]!.tokenHash).toBe(hashBrandWaitlistToken(TOKEN))
  })

  it('fehlende Frist gilt als abgelaufen (fail-closed)', async () => {
    stored = [pendingRow({ tokenExpiresAt: '' })]

    await expect(handler(event)).rejects.toMatchObject({
      status: 410,
      data: { code: 'token_expired' },
    })
  })

  it('Treffer mit Status "confirmed" ⇒ `already_confirmed`, ohne zweiten Stempel', async () => {
    stored = [pendingRow({ status: 'confirmed' })]

    const result = await handler(event)

    expect(result).toEqual({ ok: true, state: 'already_confirmed' })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(mails).toHaveLength(0)
  })

  it('kaputte Ablage ⇒ 503 `waitlist_unavailable` (Lesen wie Schreiben)', async () => {
    storeBroken = true
    await expect(handler(event)).rejects.toMatchObject({
      status: 503,
      data: { code: 'waitlist_unavailable' },
    })

    storeBroken = false
    updateBroken = true
    await expect(handler(event)).rejects.toMatchObject({
      status: 503,
      data: { code: 'waitlist_unavailable' },
    })
  })

  it('der Token steht in KEINER Log-Zeile — auch nicht gekürzt', async () => {
    await handler(event)
    body = { token: OTHER_TOKEN }
    await handler(event).catch(() => null)
    stored = [pendingRow({ tokenExpiresAt: '' })]
    body = { token: TOKEN }
    await handler(event).catch(() => null)

    const dump = JSON.stringify(logs)
    expect(logs.length).toBeGreaterThan(0)
    expect(dump).not.toContain(TOKEN)
    expect(dump).not.toContain(OTHER_TOKEN)
    expect(dump).not.toContain(TOKEN.slice(0, 8))
  })
})
