import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import type { InsightsPost } from '../shared/insightsPost'
import { INSIGHTS_NEWSLETTER_BATCH } from '../shared/insightsNewsletter'
import { INSIGHTS_POSTS_TABLE, INSIGHTS_SENDS_TABLE, INSIGHTS_SUBSCRIBERS_TABLE, fromInsightsPost } from '../shared/insightsRows'
import type {
  InsightsNewsletterSendBatchResponse,
  InsightsNewsletterSendStatusResponse,
} from '../shared/types/insightsApi'
import * as newsletter from '../server/utils/insightsNewsletter'
import * as send from '../server/utils/insightsNewsletterSend'
import { insightsDb, isInsightsRowConflict, isInsightsRowMissing } from '../server/utils/insightsStore'
import { insightsPostMissing, insightsStorageError, loadInsightsBrandRow, loadInsightsPostRow } from '../server/utils/insightsPostsAdmin'
import { insightsNewsletterAllowed, insightsPublicFormats, insightsPublicMissing } from '../server/utils/insightsPublic'

/**
 * DER VERSAND EINER AUSGABE — gefälschte Ablage, gefälschter Mailer, ECHTE
 * Handler, echte Stapel-Mechanik (BI1 I5b).
 *
 * Gestellt sind nur die Nitro-Auto-Imports; die Arbeit darüber — Riegel,
 * Adress-Prüfung, Zählung, Cursor, Mail-Bau — läuft im Original. Geprüft wird
 * die EINE Zusage, von der dieses Paket lebt:
 *
 *   NIEMAND BEKOMMT ETWAS ZWEIMAL.
 *
 * Deshalb zählt jeder Test hier die Empfänger der verschickten Mails und
 * besteht darauf, dass die Liste ohne Dubletten ist — auch über einen
 * Abbruch, ein Fortsetzen und einen zweiten Druck auf den Knopf hinweg.
 *
 * Dazu die Gegenproben:
 *  1. RIEGEL ZU ⇒ beide Routen 404 mit dem Code einer unbekannten Seite.
 *  2. ENTWURF ⇒ 409 `not_public` (die GET-Route sagt es als Auskunft).
 *  3. GESPERRTES FORMAT ⇒ 409 `no_public_address` — eine Mail auf eine
 *     404-Seite wären fünfhundert Klicks ins Leere.
 *  4. WER BEKOMMT ES: nur bestätigt, nicht abgemeldet, Adresse vorhanden.
 *  5. ZWEI STAPEL: 51 Empfänger ⇒ zwei Aufrufe, keine Dublette.
 *  6. EINE KAPUTTE ADRESSE hält den Lauf NICHT auf.
 *  7. KEIN MAILER ⇒ Abbruch mit `failed`, Cursor unberührt, danach
 *     fortsetzbar — und am Ende hat jeder GENAU EINE Mail.
 *  8. ZWEITER DRUCK nach `done` ⇒ 409 `already_sent`.
 *  9. JEDE MAIL trägt ihren eigenen `List-Unsubscribe`-Header.
 * 10. DIE SPRACHE ist die des Empfängers, mit §3.2-Rückfall.
 */

interface FakeRow {
  $id: string
  $createdAt: string
  [key: string]: unknown
}

type Query = { method: string, attribute?: string, values?: unknown[] }

let tables: Record<string, FakeRow[]>
let riegelOpen: boolean
let formats: string[]
let mailWorks: boolean
/** Adressen, bei denen SMTP wirft (eine kaputte Adresse, kein Server-Problem). */
let brokenAddresses: Set<string>
let mails: { to: string, subject: string, text: string, headers?: Record<string, string> }[]
let logs: { level: string, name: string, data: Record<string, unknown> }[]
let body: Record<string, unknown>

function rowsOf(tableId: string): FakeRow[] {
  tables[tableId] ??= []
  return tables[tableId]
}

/** Nur die Query-Methoden, die dieser Weg wirklich benutzt — mehr zu bauen
 *  hiesse, einen Appwrite-Nachbau zu testen statt unseren Code. */
function applyQueries(rows: FakeRow[], queries: string[]): FakeRow[] {
  const parsed = queries.map(query => JSON.parse(query) as Query)
  let result = [...rows]
  for (const query of parsed) {
    const attribute = String(query.attribute ?? '')
    const wanted = query.values?.[0]
    if (query.method === 'equal') {
      result = result.filter(row => String(row[attribute] ?? '') === String(wanted))
    }
    else if (query.method === 'notEqual') {
      result = result.filter(row => String(row[attribute] ?? '') !== String(wanted))
    }
    else if (query.method === 'greaterThan') {
      result = result.filter(row => String(row[attribute] ?? '') > String(wanted))
    }
    else if (query.method === 'orderAsc') {
      result.sort((a, b) => String(a[attribute] ?? '').localeCompare(String(b[attribute] ?? '')))
    }
  }
  const limit = parsed.find(query => query.method === 'limit')
  // Ein fehlendes `limit` wäre im Original die 25-Falle — hier soll es
  // AUFFALLEN statt still zu kürzen.
  if (!limit) throw new Error('Query.limit fehlt')
  return result.slice(0, Number(limit.values?.[0] ?? 25))
}

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries?: string[] }) => {
    const found = applyQueries(rowsOf(tableId), queries ?? [])
    return { rows: found, total: found.length }
  }),
  getRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    const row = rowsOf(tableId).find(entry => entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404)
    return row
  }),
  createRow: vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    // Der Unique-Index `uq_post_id` — im Fake wie in Appwrite ein 409.
    if (tableId === INSIGHTS_SENDS_TABLE && rowsOf(tableId).some(row => row.postId === data.postId)) {
      throw new AppwriteException('Document already exists', 409)
    }
    const row: FakeRow = { $id: rowId, $createdAt: new Date().toISOString(), ...data }
    rowsOf(tableId).push(row)
    return row
  }),
  updateRow: vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    const row = rowsOf(tableId).find(entry => entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404)
    Object.assign(row, data)
    return row
  }),
}

// ── Die Nitro-Auto-Imports ─────────────────────────────────────────────────
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({
  appwriteKey: 'test-schluessel',
  public: { appwriteDatabaseId: 'main', appwriteProjectId: 'branding', appUrl: 'https://branding.supply' },
}))
vi.stubGlobal('useAppConfig', () => ({
  pukalani: { insights: { newsletter: { enabled: riegelOpen }, publicFormats: formats } },
}))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('logEvent', (level: string, name: string, data: Record<string, unknown> = {}) => {
  logs.push({ level, name, data })
})
vi.stubGlobal('readValidatedBody', async (_event: H3Event, parse: (input: unknown) => unknown) => parse(body))
vi.stubGlobal('getRouterParam', () => 'p1')
vi.stubGlobal('requirePermission', () => ({ $id: 'redaktion' }))
vi.stubGlobal('sendMail', async (_event: H3Event, mail: { to: string, subject: string, text: string, headers?: Record<string, string> }) => {
  if (!mailWorks) return false
  if (brokenAddresses.has(mail.to)) throw new Error('550 mailbox unavailable')
  mails.push(mail)
  return true
})

// ── Die ECHTEN Server-Utils, als Auto-Import gestellt ──────────────────────
vi.stubGlobal('insightsDb', insightsDb)
vi.stubGlobal('isInsightsRowMissing', isInsightsRowMissing)
vi.stubGlobal('isInsightsRowConflict', isInsightsRowConflict)
vi.stubGlobal('insightsStorageError', insightsStorageError)
vi.stubGlobal('insightsPostMissing', insightsPostMissing)
vi.stubGlobal('loadInsightsPostRow', loadInsightsPostRow)
vi.stubGlobal('loadInsightsBrandRow', loadInsightsBrandRow)
vi.stubGlobal('insightsNewsletterAllowed', insightsNewsletterAllowed)
vi.stubGlobal('insightsPublicFormats', insightsPublicFormats)
vi.stubGlobal('insightsPublicMissing', insightsPublicMissing)
vi.stubGlobal('sendInsightsNewsletterIssueMail', newsletter.sendInsightsNewsletterIssueMail)
vi.stubGlobal('resolveInsightsSendTarget', send.resolveInsightsSendTarget)
vi.stubGlobal('insightsSendSubjectPreview', send.insightsSendSubjectPreview)
vi.stubGlobal('loadInsightsSendRow', send.loadInsightsSendRow)
vi.stubGlobal('toInsightsNewsletterSendState', send.toInsightsNewsletterSendState)
vi.stubGlobal('countInsightsNewsletterRecipients', send.countInsightsNewsletterRecipients)
vi.stubGlobal('runInsightsNewsletterBatch', send.runInsightsNewsletterBatch)
vi.stubGlobal('createInsightsSendRow', send.createInsightsSendRow)
vi.stubGlobal('insightsSendAlreadySent', send.insightsSendAlreadySent)

const status = (await import('../server/api/insights/posts/[id]/newsletter.get'))
  .default as unknown as (event: H3Event) => Promise<InsightsNewsletterSendStatusResponse>
const runBatch = (await import('../server/api/insights/posts/[id]/newsletter.post'))
  .default as unknown as (event: H3Event) => Promise<InsightsNewsletterSendBatchResponse>

const event = { context: {} } as unknown as H3Event

function articlePost(overrides: Partial<InsightsPost> = {}): InsightsPost {
  return {
    format: 'article',
    slug: 'zwei-marken',
    slugHistory: [],
    state: 'published',
    baseLocale: 'en',
    titleDe: 'Zwei Marken im Vergleich',
    titleEn: 'Two brands compared',
    dekDe: 'Zwei Marken, ein Blick.',
    dekEn: 'Two brands, one look.',
    bodyDe: '## Vergleich',
    bodyEn: '## Comparison',
    translatedAt: '',
    translationModel: '',
    translationPromptVersion: '',
    translationReviewed: true,
    topics: ['brand-analysis'],
    sources: [],
    brandRefs: [],
    facts: [],
    ranking: null,
    readingMinutes: 3,
    publishedAt: '2026-10-20T08:00:00.000Z',
    reviewedAt: '2026-10-20T07:00:00.000Z',
    reviewedBy: 'user-1',
    noteInternal: '',
    draftModel: '',
    draftPromptVersion: '',
    ...overrides,
  }
}

function putPost(post: InsightsPost): void {
  tables[INSIGHTS_POSTS_TABLE] = [{
    $id: 'p1',
    $createdAt: '2026-10-01T00:00:00.000Z',
    ...fromInsightsPost(post),
  }]
}

/** Ein bestätigter, aktiver Abonnent. Die `$id` ist aufsteigend sortierbar —
 *  der Cursor hängt daran. */
function subscriber(index: number, overrides: Partial<FakeRow> = {}): FakeRow {
  const id = `s${String(index).padStart(4, '0')}`
  return {
    $id: id,
    $createdAt: '2026-10-01T00:00:00.000Z',
    emailLower: `${id}@example.test`,
    email: `${id}@example.test`,
    locale: 'en',
    tokenHash: '',
    tokenExpiresAt: '',
    confirmedAt: '2026-10-02T00:00:00.000Z',
    unsubscribedAt: '',
    source: 'list',
    ipHash: '',
    retentionAt: null,
    ...overrides,
  }
}

function putSubscribers(rows: FakeRow[]): void {
  tables[INSIGHTS_SUBSCRIBERS_TABLE] = rows
}

/** Die Zusage dieses Pakets, als Funktion: keine Adresse zweimal. */
function recipientsOfMails(): string[] {
  return mails.map(mail => mail.to)
}

function hasDuplicates(values: string[]): boolean {
  return new Set(values).size !== values.length
}

beforeEach(() => {
  tables = {}
  riegelOpen = true
  formats = ['article']
  mailWorks = true
  brokenAddresses = new Set()
  mails = []
  logs = []
  body = {}
  putPost(articlePost())
  Object.values(tablesDB).forEach(fn => fn.mockClear())
})

describe('Der Riegel schliesst an beiden Türen', () => {
  it('antwortet 404 mit dem Code einer unbekannten Seite — an GET und POST', async () => {
    riegelOpen = false
    putSubscribers([subscriber(1)])

    for (const handler of [status, runBatch]) {
      await expect(handler(event)).rejects.toMatchObject({ status: 404, data: { code: 'post_not_found' } })
    }
    expect(mails).toHaveLength(0)
    expect(tables[INSIGHTS_SENDS_TABLE]).toBeUndefined()
  })

  it('schickt bei offenem Riegel dieselbe Liste sehr wohl (Gegenprobe)', async () => {
    putSubscribers([subscriber(1)])
    const result = await runBatch(event)
    expect(result.done).toBe(true)
    expect(mails).toHaveLength(1)
  })
})

describe('Ein Beitrag ohne öffentliche Adresse wird nicht verschickt', () => {
  it('weist einen ENTWURF mit 409 ab und sagt es in der GET-Route als Auskunft', async () => {
    putPost(articlePost({ state: 'draft' }))
    putSubscribers([subscriber(1)])

    await expect(runBatch(event)).rejects.toMatchObject({ status: 409, data: { code: 'not_public' } })

    const view = await status(event)
    expect(view.sendable).toBe(false)
    expect(view.blocked).toBe('not_public')
    expect(mails).toHaveLength(0)
  })

  it('weist ein GESPERRTES Format ab — die Seite wäre draussen ein 404', async () => {
    formats = ['article']
    putPost(articlePost({ format: 'duel', slug: 'a-vs-b' }))
    putSubscribers([subscriber(1)])

    await expect(runBatch(event)).rejects.toMatchObject({ status: 409, data: { code: 'no_public_address' } })
    expect((await status(event)).blocked).toBe('no_public_address')
  })

  it('weist ein Markenprofil ohne Marken-Zeile ab', async () => {
    formats = ['article', 'profile']
    putPost(articlePost({ format: 'profile', brandRefs: [{ brandId: 'b-weg', checkId: '', libraryKey: '', publicationId: '' }] }))
    putSubscribers([subscriber(1)])

    await expect(runBatch(event)).rejects.toMatchObject({ status: 409, data: { code: 'no_public_address' } })
  })
})

describe('Wer eine Ausgabe bekommt', () => {
  it('zählt und bedient NUR bestätigte, aktive Zeilen mit Adresse', async () => {
    putSubscribers([
      subscriber(1),
      subscriber(2, { confirmedAt: '' }),
      subscriber(3, { unsubscribedAt: '2026-10-20T00:00:00.000Z' }),
      subscriber(4, { email: '', emailLower: 'removed:s0004' }),
      subscriber(5),
    ])

    const view = await status(event)
    expect(view.recipients).toBe(2)
    expect(view.remaining).toBe(2)
    expect(view.sendable).toBe(true)

    const result = await runBatch(event)
    expect(result.done).toBe(true)
    expect(result.sent).toBe(2)
    expect(recipientsOfMails().sort()).toEqual(['s0001@example.test', 's0005@example.test'])
  })

  it('zeigt einen leeren Zustand, wenn niemand bestätigt hat', async () => {
    putSubscribers([subscriber(1, { confirmedAt: '' })])
    const view = await status(event)
    expect(view.recipients).toBe(0)
    // `sendable` bleibt `true` — die Route hat nichts zu beanstanden; dass
    // niemand da ist, entscheidet das Panel über die ZAHL.
    expect(view.blocked).toBe('')
  })
})

describe('Zwei Stapel, keine Dublette', () => {
  it('arbeitet 51 Empfänger in zwei Aufrufen ab und schickt keinem zweimal', async () => {
    putSubscribers(Array.from({ length: INSIGHTS_NEWSLETTER_BATCH + 1 }, (_, index) => subscriber(index + 1)))

    const first = await runBatch(event)
    expect(first.sent).toBe(INSIGHTS_NEWSLETTER_BATCH)
    expect(first.done).toBe(false)
    expect(first.remaining).toBe(1)
    expect(first.send.state).toBe('running')

    const second = await runBatch(event)
    expect(second.sent).toBe(1)
    expect(second.done).toBe(true)
    expect(second.remaining).toBe(0)
    expect(second.send.state).toBe('done')
    expect(second.send.sent).toBe(INSIGHTS_NEWSLETTER_BATCH + 1)

    expect(mails).toHaveLength(INSIGHTS_NEWSLETTER_BATCH + 1)
    expect(hasDuplicates(recipientsOfMails())).toBe(false)
  })

  it('schreibt die Sende-Zeile VOR der ersten Mail — mit gezählter Empfängerzahl', async () => {
    putSubscribers([subscriber(1), subscriber(2)])
    await runBatch(event)
    const row = tables[INSIGHTS_SENDS_TABLE]?.[0]
    expect(row?.postId).toBe('p1')
    expect(row?.recipients).toBe(2)
    expect(row?.subject).toBe('Two brands compared')
    expect(String(row?.startedAt ?? '')).not.toBe('')
    expect(String(row?.finishedAt ?? '')).not.toBe('')
  })
})

describe('Eine kaputte Adresse hält den Lauf nicht auf', () => {
  it('zählt sie in `failed`, macht weiter und kommt durch', async () => {
    brokenAddresses = new Set(['s0002@example.test'])
    putSubscribers([subscriber(1), subscriber(2), subscriber(3)])

    const result = await runBatch(event)
    expect(result.done).toBe(true)
    expect(result.sent).toBe(2)
    expect(result.failed).toBe(1)
    expect(recipientsOfMails().sort()).toEqual(['s0001@example.test', 's0003@example.test'])
  })

  it('bleibt beim Fortsetzen nicht an ihr hängen (Cursor rückt vor)', async () => {
    brokenAddresses = new Set(Array.from({ length: INSIGHTS_NEWSLETTER_BATCH }, (_, i) => `s${String(i + 1).padStart(4, '0')}@example.test`))
    putSubscribers(Array.from({ length: INSIGHTS_NEWSLETTER_BATCH + 1 }, (_, index) => subscriber(index + 1)))

    const first = await runBatch(event)
    expect(first.failed).toBe(INSIGHTS_NEWSLETTER_BATCH)
    expect(first.done).toBe(false)

    const second = await runBatch(event)
    expect(second.sent).toBe(1)
    expect(second.done).toBe(true)
    expect(recipientsOfMails()).toEqual([`s${String(INSIGHTS_NEWSLETTER_BATCH + 1).padStart(4, '0')}@example.test`])
  })
})

describe('Fehlt der Mailer, bricht der Lauf ab — und niemand bekommt etwas doppelt', () => {
  it('meldet `aborted`, geht auf `failed` und lässt den Cursor unberührt', async () => {
    mailWorks = false
    putSubscribers([subscriber(1), subscriber(2), subscriber(3)])

    const result = await runBatch(event)
    expect(result.aborted).toBe(true)
    expect(result.done).toBe(false)
    expect(result.sent).toBe(0)
    expect(result.send.state).toBe('failed')
    expect(mails).toHaveLength(0)
    expect(tables[INSIGHTS_SENDS_TABLE]?.[0]?.cursor).toBe('')
    expect(logs.some(line => line.name === 'insights.newsletter_send_failed')).toBe(true)
  })

  it('setzt danach genau dort fort — jeder bekommt GENAU EINE Mail', async () => {
    putSubscribers([subscriber(1), subscriber(2), subscriber(3)])

    mailWorks = true
    brokenAddresses = new Set()
    // Erst zwei durch, dann fällt der Mailer aus.
    const originalSend = globalThis.sendMail as unknown
    let count = 0
    vi.stubGlobal('sendMail', async (_event: H3Event, mail: { to: string, subject: string, text: string }) => {
      count++
      if (count > 2) return false
      mails.push(mail)
      return true
    })

    const first = await runBatch(event)
    expect(first.sent).toBe(2)
    expect(first.aborted).toBe(true)

    // Mailer wieder da.
    vi.stubGlobal('sendMail', originalSend)
    const second = await runBatch(event)
    expect(second.sent).toBe(1)
    expect(second.done).toBe(true)

    expect(mails).toHaveLength(3)
    expect(hasDuplicates(recipientsOfMails())).toBe(false)
  })
})

describe('Ein Beitrag, eine Mail', () => {
  it('weist den zweiten Druck nach `done` mit 409 ab', async () => {
    putSubscribers([subscriber(1)])
    expect((await runBatch(event)).done).toBe(true)

    await expect(runBatch(event)).rejects.toMatchObject({ status: 409, data: { code: 'already_sent' } })
    expect(mails).toHaveLength(1)

    const view = await status(event)
    expect(view.sendable).toBe(false)
    expect(view.blocked).toBe('already_sent')
    expect(view.send?.state).toBe('done')
  })

  it('ignoriert beim Fortsetzen eine NEUE Einleitung — sonst bekäme die zweite Hälfte einen anderen Text', async () => {
    putSubscribers(Array.from({ length: INSIGHTS_NEWSLETTER_BATCH + 1 }, (_, index) => subscriber(index + 1)))

    body = { intro: 'Die erste Fassung.' }
    await runBatch(event)
    body = { intro: 'Etwas ganz anderes.' }
    await runBatch(event)

    expect(mails).toHaveLength(INSIGHTS_NEWSLETTER_BATCH + 1)
    for (const mail of mails) {
      expect(mail.text.startsWith('Die erste Fassung.')).toBe(true)
      expect(mail.text).not.toContain('Etwas ganz anderes.')
    }
  })
})

describe('Jede Mail trägt ihren eigenen Abmelde-Weg', () => {
  it('setzt `List-Unsubscribe` je Empfänger verschieden — und kein One-Click', async () => {
    putSubscribers([subscriber(1), subscriber(2)])
    await runBatch(event)

    const headers = mails.map(mail => mail.headers?.['List-Unsubscribe'] ?? '')
    expect(headers).toHaveLength(2)
    for (const header of headers) {
      expect(header.startsWith('<https://branding.supply/')).toBe(true)
      expect(header.endsWith('>')).toBe(true)
      expect(header).toContain('/newsletter/unsubscribe?token=')
    }
    expect(headers[0]).not.toBe(headers[1])
    for (const mail of mails) {
      expect(mail.headers).not.toHaveProperty('List-Unsubscribe-Post')
    }
  })

  it('wiederholt den Link auch IM TEXT (die Regel kennt keine Ausnahme)', async () => {
    putSubscribers([subscriber(1)])
    await runBatch(event)
    expect(mails[0]?.text).toContain('/newsletter/unsubscribe?token=')
  })
})

describe('Die Sprache ist die des Empfängers', () => {
  it('schickt dem deutschen Abonnenten die deutsche Fassung und den /de-Link', async () => {
    putSubscribers([subscriber(1, { locale: 'de' }), subscriber(2, { locale: 'en' })])
    await runBatch(event)

    const de = mails.find(mail => mail.to === 's0001@example.test')
    const en = mails.find(mail => mail.to === 's0002@example.test')
    expect(de?.subject).toBe('Zwei Marken im Vergleich')
    expect(de?.text).toContain('https://branding.supply/de/insights/zwei-marken')
    expect(en?.subject).toBe('Two brands compared')
    expect(en?.text).toContain('https://branding.supply/insights/zwei-marken')
  })

  it('schickt die GRUNDFASSUNG, solange die Übersetzung nicht redigiert ist (§3.2)', async () => {
    putPost(articlePost({ translationReviewed: false }))
    putSubscribers([subscriber(1, { locale: 'de' })])
    await runBatch(event)

    expect(mails[0]?.subject).toBe('Two brands compared')
    // Der Link zeigt auf die Fassung, die in der Mail steht — nicht auf /de.
    expect(mails[0]?.text).toContain('https://branding.supply/insights/zwei-marken')
  })
})

describe('Das Log trägt Zahlen und die Beitrags-Id, nie eine Adresse', () => {
  it('nennt start, batch und finished — und keine Mailadresse', async () => {
    putSubscribers([subscriber(1), subscriber(2)])
    await runBatch(event)

    const names = logs.map(line => line.name)
    expect(names).toContain('insights.newsletter_send_started')
    expect(names).toContain('insights.newsletter_send_batch')
    expect(names).toContain('insights.newsletter_send_finished')
    expect(JSON.stringify(logs)).not.toContain('@example.test')
    expect(logs.find(line => line.name === 'insights.newsletter_send_finished')?.data).toMatchObject({
      postId: 'p1',
      sent: 2,
      failed: 0,
    })
  })
})
