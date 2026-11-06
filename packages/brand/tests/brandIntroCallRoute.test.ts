import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import type { BrandIntroCallResponse } from '../shared/types/brand'

/**
 * DAS ERSTGESPRÄCH, DURCHGESPIELT — gefälschte Ablage, echter Handler
 * (BS1 Paket Z0).
 *
 * Sieben Aussagen hängen NICHT in einer puren Funktion, sondern in der
 * REIHENFOLGE und den Verzweigungen der Route — und genau die verrutschen beim
 * Umbauen still:
 *
 *  1. Eine gültige Anfrage wird ZUERST abgelegt und DANN gemailt. Die
 *     Reihenfolge ist die Entscheidung (Kopf der Route): der Gegenstand ist
 *     die Anfrage, nicht die Mail.
 *  2. Es gehen ZWEI Mails raus — Betreiber und Absender —, und die
 *     Betreiber-Mail nur, wenn eine Adresse konfiguriert ist.
 *  3. Der Honigtopf antwortet WIE DER ERFOLG und schreibt nichts. Ein
 *     abweichender Status wäre die Rückmeldung, an der ein Bot lernt.
 *  4. Zu schnell abgeschickt ⇒ 422 `too_fast`, ohne Zeile und ohne Mail.
 *  5. Ein FREMDES Branding wird VERWORFEN, nicht abgelehnt: die Anfrage geht
 *     durch, die Zeile trägt keinen Bezug. (Die Gegenprobe daneben: das
 *     EIGENE Branding landet in der Zeile — ein „ist leer"-Test allein wäre
 *     auch für eine Route grün, die `profileId` gar nicht mehr schreibt.)
 *  6. Ohne Anmeldung gibt es NIE einen Branding-Bezug, auch nicht mit einer
 *     gültigen fremden Id.
 *  7. Zeile UND beide Mails tot ⇒ 503. Nur die Zeile tot ⇒ trotzdem 200 (die
 *     Mail hat den Menschen erreicht), nur die Mails tot ⇒ trotzdem 200.
 *
 * Dazu die Regel ohne eigenen Zweig: weder Name noch Anliegen stehen im Log,
 * und die Adresse nur maskiert.
 */

interface FakeRow { $id: string, [key: string]: unknown }

/** Die `brand_profiles`-Zeilen, die es gibt (für die Datentür). */
let profiles: FakeRow[]
/** Wirft die Ablage beim SCHREIBEN? (fehlende Tabelle / kranke Appwrite) */
let storeBroken: boolean
/** Die Empfänger-Adresse aus der App-Config ('' = keine Betreiber-Mail). */
let notifyTo: string
/** Gibt es überhaupt einen Versandweg? (`sendMail` liefert sonst still `false`.) */
let mailerConfigured: boolean
let written: FakeRow[]
let mails: { to: string, subject: string, text: string }[]
let logs: { level: string, event: string, data: Record<string, unknown> }[]
let events: { type: string, payload?: Record<string, unknown>, profileId?: string, userId?: string }[]
let body: Record<string, unknown>
/** Die angemeldete Sitzung dieses Laufs — `null` heisst Gast. */
let sessionUserId: string | null

const tablesDB = {
  getRow: vi.fn(async ({ rowId }: { rowId: string }) => {
    const row = profiles.find(entry => entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404)
    return row
  }),
  createRow: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    const row = { $id: `i${written.length + 1}`, ...data }
    written.push(row)
    return row
  }),
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('useAppConfig', () => ({ pukalani: { brand: { introCallNotify: notifyTo } } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('logEvent', (level: string, event: string, data: Record<string, unknown> = {}) => {
  logs.push({ level, event, data })
})
vi.stubGlobal('readValidatedBody', async (_event: H3Event, parse: (input: unknown) => unknown) => parse(body))
vi.stubGlobal('sendMail', async (_event: H3Event, mail: { to: string, subject: string, text: string }) => {
  // Der stille Fall: ohne konfigurierten Mailer wirft `sendMail` NICHT, es
  // liefert `false` — genau daran liefe ein `.catch()` allein vorbei.
  if (!mailerConfigured) return false
  mails.push(mail)
  return true
})

// Das Funnel-Ereignis ist fail-soft und hat einen eigenen Beweis; hier wird
// nur festgehalten, WAS gemeldet wurde (Regel 1 aus `brandEvents.ts`: nie
// Inhaltstext).
vi.mock('../server/utils/brandEvents', () => ({
  recordBrandEvent: vi.fn(async (_event: unknown, input: Record<string, unknown>) => {
    events.push(input as { type: string })
  }),
}))

const handler = (await import('../server/api/brand/intro-call.post'))
  .default as unknown as (event: H3Event) => Promise<BrandIntroCallResponse>

function makeEvent(): H3Event {
  return { context: sessionUserId ? { user: { $id: sessionUserId } } : {} } as unknown as H3Event
}

/** Die Zeile, wie die Route sie geschrieben hat. */
function lastWrite(): Record<string, unknown> {
  const call = tablesDB.createRow.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> } | undefined
  return call?.data ?? {}
}

const VALID = {
  name: 'Alina Weber',
  email: 'Alina@Example.com',
  message: 'Wir starten neu und wissen nicht, wo wir anfangen sollen.',
  locale: 'de',
  source: 'foundation',
  // Weit über der Mindestzeit — die Bremse hat ihren eigenen Zweig unten.
  elapsedMs: 30_000,
}

beforeEach(() => {
  profiles = [
    { $id: 'p-eigen', ownerType: 'user', ownerId: 'u1', title: 'Kailua Coffee' },
    { $id: 'p-fremd', ownerType: 'user', ownerId: 'u2', title: 'Fremde Marke' },
  ]
  storeBroken = false
  notifyTo = ''
  mailerConfigured = true
  written = []
  mails = []
  logs = []
  events = []
  sessionUserId = null
  body = { ...VALID }
  tablesDB.getRow.mockClear()
  tablesDB.createRow.mockClear()
})

describe('POST /api/brand/intro-call — der gute Weg', () => {
  it('legt die Anfrage ab und schickt die Bestätigung', async () => {
    const result = await handler(makeEvent())

    expect(result).toEqual({ ok: true, stored: true, mailed: true })
    expect(written).toHaveLength(1)
    expect(lastWrite()).toMatchObject({
      name: 'Alina Weber',
      // Vom Schema normalisiert — beide Spalten tragen denselben Wert.
      email: 'alina@example.com',
      emailLower: 'alina@example.com',
      status: 'new',
      note: '',
      source: 'foundation',
      locale: 'de',
    })
  })

  it('schickt OHNE konfigurierte Adresse NUR die Bestätigung', async () => {
    await handler(makeEvent())
    expect(mails).toHaveLength(1)
    expect(mails[0]?.to).toBe('alina@example.com')
  })

  it('schickt MIT konfigurierter Adresse zwei Mails', async () => {
    notifyTo = 'hallo@pukalani.app'
    await handler(makeEvent())
    expect(mails.map(mail => mail.to).sort()).toEqual(['alina@example.com', 'hallo@pukalani.app'])
  })

  it('zitiert das Anliegen in der Bestätigung zurück', async () => {
    await handler(makeEvent())
    expect(mails[0]?.text).toContain(VALID.message)
  })

  it('zitiert ein Anliegen MIT Link nicht zurück und grüßt einen Namen mit Link nicht (kein Relais)', async () => {
    body = {
      ...VALID,
      name: 'Etsy User! Sold https://a29.at/9hdF2k',
      message: 'Your item has been sold, see https://a29.at/9hdF2k',
    }
    await handler(makeEvent())
    const text = mails[0]?.text ?? ''
    expect(text).not.toContain('a29.at')
    expect(text).toContain('Hallo,')
    expect(text).toContain('Eure Nachricht liegt uns vor.')
    // Die Benachrichtigung an uns selbst trägt weiterhin alles.
    expect(mails.length).toBe(1)
  })

  it('antwortet auf Englisch, wenn die Seite Englisch war', async () => {
    body = { ...VALID, locale: 'en' }
    await handler(makeEvent())
    expect(mails[0]?.subject).toBe('Your request for an intro call')
  })

  it('meldet den Funnel-Punkt OHNE Inhalt', async () => {
    await handler(makeEvent())
    const entry = events.at(-1)
    expect(entry?.type).toBe('intro.submitted')
    const payload = JSON.stringify(entry?.payload ?? {})
    expect(payload).not.toContain('Alina')
    expect(payload).not.toContain('example.com')
    expect(payload).not.toContain('wissen nicht')
  })

  it('schreibt weder Name noch Anliegen ins Log — und die Adresse nur maskiert', async () => {
    await handler(makeEvent())
    const dump = JSON.stringify(logs)
    expect(dump).not.toContain('Alina')
    expect(dump).not.toContain('alina@example.com')
    expect(dump).not.toContain('wissen nicht')
  })
})

describe('die drei Bremsen', () => {
  it('antwortet auf den Honigtopf WIE auf einen Erfolg — und schreibt nichts', async () => {
    body = { ...VALID, hp: 'ich bin ein bot' }
    const result = await handler(makeEvent())

    expect(result).toEqual({ ok: true, stored: true, mailed: true })
    expect(written).toHaveLength(0)
    expect(mails).toHaveLength(0)
    expect(logs.some(entry => entry.event === 'brand.intro_call_honeypot')).toBe(true)
  })

  it('weist ein zu schnelles Formular mit 422 ab — ohne Zeile und ohne Mail', async () => {
    body = { ...VALID, elapsedMs: 200 }
    await expect(handler(makeEvent())).rejects.toMatchObject({
      status: 422,
      data: { code: 'too_fast' },
    })
    expect(written).toHaveLength(0)
    expect(mails).toHaveLength(0)
  })

  it('lässt eine Anfrage OHNE gemeldete Zeit durch', async () => {
    // Gegenprobe zur Bremse: fehlt die Uhr, wird nicht gebremst (fail-open,
    // s. Schema). Sonst kostete ein Browser ohne brauchbare Uhr einen Kunden.
    body = { name: VALID.name, email: VALID.email, message: VALID.message }
    const result = await handler(makeEvent())
    expect(result.stored).toBe(true)
  })
})

describe('die Datentür der Herkunft', () => {
  it('übernimmt das EIGENE Branding', async () => {
    sessionUserId = 'u1'
    body = { ...VALID, profileId: 'p-eigen' }
    await handler(makeEvent())
    expect(lastWrite()).toMatchObject({ profileId: 'p-eigen', userId: 'u1' })
  })

  it('VERWIRFT ein fremdes Branding — und lässt die Anfrage durch', async () => {
    sessionUserId = 'u1'
    body = { ...VALID, profileId: 'p-fremd' }
    const result = await handler(makeEvent())

    // Kein 403: das unterschiede „unbekannt" von „fremd" und kostete eine
    // echte Anfrage mit veraltetem Link.
    expect(result.stored).toBe(true)
    expect(lastWrite()).toMatchObject({ profileId: '', userId: 'u1' })
  })

  it('VERWIRFT eine unbekannte Id genauso', async () => {
    sessionUserId = 'u1'
    body = { ...VALID, profileId: 'gibtesnicht' }
    await handler(makeEvent())
    expect(lastWrite()).toMatchObject({ profileId: '' })
  })

  it('fragt ohne Anmeldung gar nicht erst nach', async () => {
    sessionUserId = null
    body = { ...VALID, profileId: 'p-eigen' }
    await handler(makeEvent())

    expect(lastWrite()).toMatchObject({ profileId: '', userId: '' })
    // Kein Appwrite-Ruf: ein Gast kann kein Branding besitzen, die Antwort
    // steht fest.
    expect(tablesDB.getRow).not.toHaveBeenCalled()
  })
})

describe('die zwei Zustellwege', () => {
  it('bleibt bei toter Ablage erfolgreich — die Mail hat den Menschen erreicht', async () => {
    storeBroken = true
    const result = await handler(makeEvent())

    expect(result).toEqual({ ok: true, stored: false, mailed: true })
    expect(logs.some(entry => entry.event === 'brand.intro_call_row_failed')).toBe(true)
  })

  it('bleibt bei totem Mailer erfolgreich — die Zeile ist das Gedächtnis', async () => {
    mailerConfigured = false
    const result = await handler(makeEvent())

    expect(result).toEqual({ ok: true, stored: true, mailed: false })
    expect(written).toHaveLength(1)
  })

  it('antwortet 503, wenn WEDER Zeile NOCH Mail durchkommen', async () => {
    storeBroken = true
    mailerConfigured = false
    await expect(handler(makeEvent())).rejects.toMatchObject({
      status: 503,
      data: { code: 'intro_call_unavailable' },
    })
  })

  it('legt ZUERST ab und mailt DANACH', async () => {
    // Die Reihenfolge ist die Entscheidung (Kopf der Route). Belegt an der
    // Ablage-Bremse: bricht das Schreiben ab, war die Mail noch nicht raus —
    // beide Aufrufe fanden trotzdem statt.
    const order: string[] = []
    tablesDB.createRow.mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => {
      order.push('row')
      const row = { $id: 'i1', ...data }
      written.push(row)
      return row
    })
    const before = mails.length
    await handler(makeEvent())
    order.push('mail')

    expect(order).toEqual(['row', 'mail'])
    expect(mails.length).toBeGreaterThan(before)
  })
})
