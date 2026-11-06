import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import type {
  InsightsNewsletterConfirmResponse,
  InsightsNewsletterSubscribeResponse,
  InsightsNewsletterUnsubscribeResponse,
} from '../shared/types/insightsApi'
import * as newsletter from '../server/utils/insightsNewsletter'
import { insightsDb, isInsightsRowConflict, isInsightsRowMissing } from '../server/utils/insightsStore'
import { insightsStorageError } from '../server/utils/insightsPostsAdmin'
import { insightsNewsletterAllowed, insightsIpHash, insightsPublicMissing } from '../server/utils/insightsPublic'

/**
 * DIE DREI NEWSLETTER-WEGE — gefälschte Ablage, gefälschter Mailer, ECHTE
 * Handler und echte Server-Utils (BI1 I5a).
 *
 * Nur die Nitro-Auto-Imports sind gestellt (`createAdminClient`,
 * `useRuntimeConfig`, `useAppConfig`, `sendMail`, `useRateLimitStore`, …); die
 * Arbeit darüber — Riegel, Drossel, Token, Zeile, Mail — läuft im Original.
 * Ein Test, der die eigenen Helfer wegstellt, prüft nur noch seine Stubs.
 *
 * Was geprüft wird, ist die REIHENFOLGE und was sie VERRÄT:
 *
 *  1. RIEGEL ZU ⇒ 404 mit demselben Code wie eine unbekannte Seite, und zwar
 *     an ALLEN DREI Routen — vor jedem Appwrite-Ruf.
 *  2. HONIGTOPF ⇒ dieselbe 200, ohne Zeile und ohne Mail.
 *  3. DROSSEL ⇒ 429 VOR der Ablage und VOR der Mail (Mail-Bombing-Schutz).
 *  4. VIER FÄLLE, EINE ANTWORT: neu, wartend, BESTÄTIGT (keine Mail, keine
 *     Änderung) und abgemeldet (frischer Link).
 *  5. MAIL GESCHEITERT ⇒ 503 und die Zeile BLEIBT.
 *  6. BESTÄTIGEN löscht den Hash; der zweite Klick ist ein 400.
 *  7. ABMELDEN ist idempotent und löscht eine nie bestätigte Zeile.
 */

interface FakeRow {
  $id: string
  $createdAt: string
  [key: string]: unknown
}

let rows: FakeRow[]
let riegelOpen: boolean
let storeBroken: boolean
let mailWorks: boolean
let mails: { to: string, subject: string, text: string }[]
let logs: { level: string, name: string, data: Record<string, unknown> }[]
let hits: Record<string, number>
let body: Record<string, unknown>


const SECRET = 'test-schluessel'

const tablesDB = {
  listRows: vi.fn(async ({ queries }: { queries?: string[] }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    const parsed = (queries ?? []).map(query => JSON.parse(query) as {
      method: string
      attribute?: string
      values?: unknown[]
    })
    const equal = parsed.find(query => query.method === 'equal')
    if (!equal) return { rows: [], total: 0 }
    const attribute = String(equal.attribute ?? '')
    const wanted = String(equal.values?.[0] ?? '')
    const found = rows.filter(row => String(row[attribute] ?? '') === wanted)
    return { rows: found, total: found.length }
  }),
  getRow: vi.fn(async ({ rowId }: { rowId: string }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    const row = rows.find(entry => entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404)
    return row
  }),
  createRow: vi.fn(async ({ rowId, data }: { rowId: string, data: Record<string, unknown> }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    // Der Unique-Index auf `emailLower` — im Fake wie in Appwrite ein 409.
    if (rows.some(row => row.emailLower === data.emailLower)) {
      throw new AppwriteException('Document already exists', 409)
    }
    const row: FakeRow = { $id: rowId, $createdAt: new Date().toISOString(), ...data }
    rows.push(row)
    return row
  }),
  updateRow: vi.fn(async ({ rowId, data }: { rowId: string, data: Record<string, unknown> }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    const row = rows.find(entry => entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404)
    Object.assign(row, data)
    return row
  }),
  deleteRow: vi.fn(async ({ rowId }: { rowId: string }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    const at = rows.findIndex(entry => entry.$id === rowId)
    if (at < 0) throw new AppwriteException('Row not found', 404)
    rows.splice(at, 1)
    return {}
  }),
}

// ── Die Nitro-Auto-Imports ─────────────────────────────────────────────────
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({
  appwriteKey: SECRET,
  public: { appwriteDatabaseId: 'main', appwriteProjectId: 'branding', appUrl: 'https://branding.supply' },
}))
vi.stubGlobal('useAppConfig', () => ({ pukalani: { insights: { newsletter: { enabled: riegelOpen } } } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('logEvent', (level: string, name: string, data: Record<string, unknown> = {}) => {
  logs.push({ level, name, data })
})
vi.stubGlobal('readValidatedBody', async (_event: H3Event, parse: (input: unknown) => unknown) => parse(body))
vi.stubGlobal('setHeader', () => {})
vi.stubGlobal('trustedClientIp', () => '203.0.113.7')
vi.stubGlobal('sendMail', async (_event: H3Event, mail: { to: string, subject: string, text: string }) => {
  if (!mailWorks) return false
  mails.push(mail)
  return true
})
vi.stubGlobal('useRateLimitStore', () => ({
  prefix: 'rl:test:',
  store: {
    hit: async (key: string) => {
      hits[key] = (hits[key] ?? 0) + 1
      return { count: hits[key], resetInMs: 60_000 }
    },
  },
}))

// ── Die ECHTEN Server-Utils, als Auto-Import gestellt ──────────────────────
vi.stubGlobal('insightsDb', insightsDb)
vi.stubGlobal('isInsightsRowMissing', isInsightsRowMissing)
vi.stubGlobal('isInsightsRowConflict', isInsightsRowConflict)
vi.stubGlobal('insightsStorageError', insightsStorageError)
vi.stubGlobal('insightsNewsletterAllowed', insightsNewsletterAllowed)
vi.stubGlobal('insightsPublicMissing', insightsPublicMissing)
vi.stubGlobal('insightsIpHash', insightsIpHash)
vi.stubGlobal('createInsightsNewsletterToken', newsletter.createInsightsNewsletterToken)
vi.stubGlobal('hashInsightsNewsletterToken', newsletter.hashInsightsNewsletterToken)
vi.stubGlobal('maskInsightsNewsletterEmail', newsletter.maskInsightsNewsletterEmail)
vi.stubGlobal('sendInsightsNewsletterConfirmMail', newsletter.sendInsightsNewsletterConfirmMail)
vi.stubGlobal('insightsNewsletterRowIdFromToken', newsletter.insightsNewsletterRowIdFromToken)

const subscribe = (await import('../server/api/insights/public/newsletter/subscribe.post'))
  .default as unknown as (event: H3Event) => Promise<InsightsNewsletterSubscribeResponse>
const confirm = (await import('../server/api/insights/public/newsletter/confirm.post'))
  .default as unknown as (event: H3Event) => Promise<InsightsNewsletterConfirmResponse>
const unsubscribe = (await import('../server/api/insights/public/newsletter/unsubscribe.post'))
  .default as unknown as (event: H3Event) => Promise<InsightsNewsletterUnsubscribeResponse>

const event = { context: {} } as unknown as H3Event

/** Der Token, den die Mail getragen hätte — 64 hex, wie `randomBytes(32)`. */
const TOKEN = 'a'.repeat(64)

function pendingRow(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    $id: 'n1',
    $createdAt: '2026-10-01T00:00:00.000Z',
    emailLower: 'aloha@example.com',
    email: 'aloha@example.com',
    locale: 'de',
    tokenHash: newsletter.hashInsightsNewsletterToken(TOKEN),
    tokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    confirmedAt: '',
    unsubscribedAt: '',
    source: 'list',
    ipHash: 'alt',
    retentionAt: null,
    ...overrides,
  }
}

/** Die Adresse aus dem Bestätigungs-Link, den die Mail trägt. */
function tokenFromMail(text: string): string {
  return /newsletter\/confirm\?token=([a-f0-9]+)/.exec(text)?.[1] ?? ''
}

function unsubTokenFromMail(text: string): string {
  return /newsletter\/unsubscribe\?token=([A-Za-z0-9._-]+)/.exec(text)?.[1] ?? ''
}

beforeEach(() => {
  rows = []
  riegelOpen = true
  storeBroken = false
  mailWorks = true
  mails = []
  logs = []
  hits = {}

  body = { email: 'aloha@example.com', locale: 'de', source: 'list' }
  Object.values(tablesDB).forEach(fn => fn.mockClear())
})

describe('Der Riegel schliesst an allen drei Türen', () => {
  it('antwortet 404 mit dem Code einer unbekannten Seite — und rührt die Ablage nicht an', async () => {
    riegelOpen = false

    for (const [handler, payload] of [
      [subscribe, { email: 'aloha@example.com' }],
      [confirm, { token: TOKEN }],
      [unsubscribe, { token: TOKEN }],
    ] as const) {
      body = payload as Record<string, unknown>
      await expect(handler(event)).rejects.toMatchObject({
        status: 404,
        data: { code: 'post_not_found' },
      })
    }

    expect(tablesDB.listRows).not.toHaveBeenCalled()
    expect(tablesDB.getRow).not.toHaveBeenCalled()
    expect(mails).toHaveLength(0)
  })
})

describe('POST …/newsletter/subscribe', () => {
  it('legt die Zeile an und schickt EINE Mail mit beiden Links', async () => {
    const result = await subscribe(event)

    expect(result).toEqual({ ok: true })
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.emailLower).toBe('aloha@example.com')
    expect(row.confirmedAt).toBe('')
    expect(row.source).toBe('list')
    expect(row.tokenHash).toHaveLength(64)
    expect(mails).toHaveLength(1)
    expect(tokenFromMail(mails[0]!.text)).toHaveLength(64)
    expect(unsubTokenFromMail(mails[0]!.text)).toBe(
      newsletter.insightsNewsletterUnsubToken(row.$id, SECRET),
    )
    // Weder die Adresse noch ein Token stehen im Log.
    expect(JSON.stringify(logs)).not.toContain('aloha@example.com')
    expect(JSON.stringify(logs)).not.toContain(tokenFromMail(mails[0]!.text))
  })

  it('schickt dem Wartenden einen FRISCHEN Link, ohne zweite Zeile', async () => {
    rows = [pendingRow()]

    const result = await subscribe(event)

    expect(result).toEqual({ ok: true })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.tokenHash).not.toBe(newsletter.hashInsightsNewsletterToken(TOKEN))
    expect(mails).toHaveLength(1)
    expect(tablesDB.createRow).not.toHaveBeenCalled()
  })

  it('behält `source` der ERSTEN Eintragung (die Zahl aus §9.7)', async () => {
    rows = [pendingRow({ source: 'post:erstes-stueck' })]
    body = { email: 'aloha@example.com', locale: 'de', source: 'list' }

    await subscribe(event)

    expect(rows[0]!.source).toBe('post:erstes-stueck')
  })

  it('verrät eine BESTÄTIGTE Adresse nicht: gleiche Antwort, keine Mail, keine Änderung', async () => {
    rows = [pendingRow({
      confirmedAt: '2026-10-02T00:00:00.000Z',
      tokenHash: '',
      tokenExpiresAt: '',
    })]
    const before = JSON.stringify(rows)

    const result = await subscribe(event)

    expect(result).toEqual({ ok: true })
    expect(JSON.stringify(rows)).toBe(before)
    expect(mails).toHaveLength(0)
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('nimmt eine ABGEMELDETE Adresse wieder auf — frischer Link, Frist weg', async () => {
    rows = [pendingRow({
      confirmedAt: '2026-05-01T00:00:00.000Z',
      unsubscribedAt: '2026-06-01T00:00:00.000Z',
      retentionAt: '2027-06-01T00:00:00.000Z',
      tokenHash: '',
    })]

    const result = await subscribe(event)

    expect(result).toEqual({ ok: true })
    const row = rows[0]!
    expect(row.confirmedAt).toBe('')
    expect(row.unsubscribedAt).toBe('')
    expect(row.retentionAt).toBeNull()
    expect(row.tokenHash).toHaveLength(64)
    expect(mails).toHaveLength(1)
  })

  it('schnappt beim Honigtopf zu: gleiche Antwort, keine Zeile, keine Mail', async () => {
    body = { email: 'bot@example.com', locale: 'en', source: 'list', hp: 'ich bin ein Skript' }

    const result = await subscribe(event)

    expect(result).toEqual({ ok: true })
    expect(rows).toHaveLength(0)
    expect(mails).toHaveLength(0)
    expect(logs.map(entry => entry.name)).toContain('insights.newsletter_honeypot')
  })

  it('bremst den vierten Versuch einer Stunde — VOR Ablage und Mail', async () => {
    for (let i = 0; i < 3; i++) {
      rows = []
      await subscribe(event)
    }
    rows = []
    tablesDB.createRow.mockClear()
    mails = []

    await expect(subscribe(event)).rejects.toMatchObject({
      status: 429,
      data: { code: 'rate_limited_hour' },
    })
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect(mails).toHaveLength(0)
  })

  it('antwortet 503 und LÄSST DIE ZEILE STEHEN, wenn die Mail nicht rausgeht', async () => {
    mailWorks = false

    await expect(subscribe(event)).rejects.toMatchObject({
      status: 503,
      data: { code: 'newsletter_mail_failed' },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.confirmedAt).toBe('')
  })

  it('macht aus dem Rennen gegen eine gleichzeitige Anfrage keinen Fehler', async () => {
    // Der Fake wirft denselben 409, den der Unique-Index wirft: die
    // Vorab-Abfrage sah nichts, der Index fängt die zweite Anfrage.
    tablesDB.listRows.mockImplementationOnce(async () => ({ rows: [], total: 0 }))
    rows = [pendingRow()]

    const result = await subscribe(event)

    expect(result).toEqual({ ok: true })
    expect(rows).toHaveLength(1)
    expect(mails).toHaveLength(0)
  })

  it('antwortet 503, wenn die Ablage nicht erreichbar ist', async () => {
    storeBroken = true

    await expect(subscribe(event)).rejects.toMatchObject({
      status: 503,
      data: { code: 'storage_unavailable' },
    })
    // Die MASKIERTE Adresse darf ins Log, die ganze nicht.
    expect(JSON.stringify(logs)).toContain('a***@example.com')
    expect(JSON.stringify(logs)).not.toContain('aloha@example.com')
  })
})

describe('POST …/newsletter/confirm', () => {
  beforeEach(() => {
    rows = [pendingRow()]
    body = { token: TOKEN }
  })

  it('stempelt die Zeile und LÖSCHT Hash und Frist', async () => {
    const result = await confirm(event)

    expect(result).toEqual({ ok: true, state: 'confirmed' })
    const row = rows[0]!
    expect(row.confirmedAt).not.toBe('')
    expect(row.tokenHash).toBe('')
    expect(row.tokenExpiresAt).toBe('')
  })

  it('macht aus dem ZWEITEN Klick auf denselben Link ein 400', async () => {
    await confirm(event)

    await expect(confirm(event)).rejects.toMatchObject({
      status: 400,
      data: { code: 'token_invalid' },
    })
  })

  it('antwortet auf eine abgelaufene Frist 410 und lässt die Zeile wartend', async () => {
    rows = [pendingRow({ tokenExpiresAt: '2026-10-01T00:00:00.000Z' })]

    await expect(confirm(event)).rejects.toMatchObject({
      status: 410,
      data: { code: 'token_expired' },
    })
    expect(rows[0]!.confirmedAt).toBe('')
  })

  it('sagt bei einer schon bestätigten Zeile „schon bestätigt"', async () => {
    rows = [pendingRow({ confirmedAt: '2026-10-02T00:00:00.000Z' })]

    expect(await confirm(event)).toEqual({ ok: true, state: 'already_confirmed' })
  })

  it('antwortet 503, wenn die Ablage nicht erreichbar ist', async () => {
    storeBroken = true

    await expect(confirm(event)).rejects.toMatchObject({
      status: 503,
      data: { code: 'storage_unavailable' },
    })
  })

  it('schreibt den Token in keine Log-Zeile', async () => {
    await confirm(event)
    expect(JSON.stringify(logs)).not.toContain(TOKEN)
  })
})

describe('POST …/newsletter/unsubscribe', () => {
  function unsubToken(rowId: string): string {
    return newsletter.insightsNewsletterUnsubToken(rowId, SECRET)
  }

  it('stempelt eine BESTÄTIGTE Zeile ab, mit Frist, und leert die Token-Felder', async () => {
    rows = [pendingRow({ confirmedAt: '2026-10-02T00:00:00.000Z' })]
    body = { token: unsubToken('n1') }

    expect(await unsubscribe(event)).toEqual({ ok: true })
    const row = rows[0]!
    expect(row.unsubscribedAt).not.toBe('')
    expect(row.tokenHash).toBe('')
    expect(row.tokenExpiresAt).toBe('')
    expect(typeof row.retentionAt).toBe('string')
    // Der Nachweis bleibt: Adresse noch da, Zeile noch da.
    expect(row.emailLower).toBe('aloha@example.com')
  })

  it('LÖSCHT eine nie bestätigte Zeile — es gab keine Einwilligung', async () => {
    rows = [pendingRow()]
    body = { token: unsubToken('n1') }

    expect(await unsubscribe(event)).toEqual({ ok: true })
    expect(rows).toHaveLength(0)
  })

  it('antwortet beim zweiten Klick dieselbe 200 (idempotent)', async () => {
    rows = [pendingRow({
      confirmedAt: '2026-10-02T00:00:00.000Z',
      unsubscribedAt: '2026-10-03T00:00:00.000Z',
    })]
    body = { token: unsubToken('n1') }

    expect(await unsubscribe(event)).toEqual({ ok: true })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(tablesDB.deleteRow).not.toHaveBeenCalled()
  })

  it('antwortet 200 auf einen Token aus der Zeit vor einem Schlüsseltausch', async () => {
    rows = [pendingRow({ confirmedAt: '2026-10-02T00:00:00.000Z' })]
    body = { token: newsletter.insightsNewsletterUnsubToken('n1', 'alter-schluessel') }

    expect(await unsubscribe(event)).toEqual({ ok: true })
    expect(rows[0]!.unsubscribedAt).toBe('')
    expect(logs.map(entry => entry.name)).toContain('insights.newsletter_unsub_token_invalid')
  })

  it('antwortet 200, wenn die Zeile längst gelöscht ist', async () => {
    rows = []
    body = { token: unsubToken('weg') }

    expect(await unsubscribe(event)).toEqual({ ok: true })
  })
})
