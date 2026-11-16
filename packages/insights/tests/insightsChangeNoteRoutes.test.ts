import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import type { InsightsChangeNote, InsightsPost, InsightsPostEdit, InsightsSource } from '../shared/insightsPost'
import { INSIGHTS_POSTS_TABLE, fromInsightsPost } from '../shared/insightsRows'
import { INSIGHTS_CHANGE_NOTE_MAX } from '../shared/insightsPost'
import type {
  InsightsChangeNoteSuggestionResponse,
  InsightsPostSavedResponse,
} from '../shared/types/insightsApi'

/**
 * DIE ÄNDERUNGSHINWEISE AN DEN ROUTEN (2026-11-16) — dieselbe Bühne wie
 * `insightsPublishedEdit.test.ts`: gefälschte Ablage, gefälschter
 * Seitenabruf, gestellte Nitro-Auto-Importe, darüber die ECHTEN Handler.
 * KEIN KI-Aufruf: der Stellvertreter zählt seine Aufrufe und antwortet, was
 * der Test ihm vorgibt.
 */

// ── Der gefälschte Seitenabruf (über den Vertrag zum brand-Layer) ──────────

const fetchState = vi.hoisted(() => ({
  pages: {} as Record<string, string>,
  calls: [] as string[],
}))

vi.mock('../server/contracts/brandContract', () => {
  class BrandSiteBlockedError extends Error {
    reason: 'robots' | 'tdm'
    constructor(reason: 'robots' | 'tdm') {
      super(reason)
      this.reason = reason
    }
  }
  return {
    BrandSiteBlockedError,
    fetchBrandSiteForCheck: async (url: string) => {
      fetchState.calls.push(url)
      const text = fetchState.pages[url]
      if (text === undefined) throw new Error('fetch failed')
      return { content: { title: '', description: '', text } }
    },
    brandPublicationSlug: (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    brandPublicationSlugCandidate: (base: string, index: number) => (index === 1 ? base : `${base}-${index}`),
  }
})

const review = await import('../server/utils/insightsReview')
const admin = await import('../server/utils/insightsPostsAdmin')
const store = await import('../server/utils/insightsStore')

// ── Die gefälschte Ablage ──────────────────────────────────────────────────

interface FakeRow {
  $id: string
  $createdAt: string
  $updatedAt: string
  [key: string]: unknown
}

type Query = { method: string, attribute?: string, values?: unknown[] }

let tables: Record<string, FakeRow[]>
let logs: { level: string, name: string, data: Record<string, unknown> }[]
let body: unknown

function rowsOf(tableId: string): FakeRow[] {
  tables[tableId] ??= []
  return tables[tableId]
}

function applyQueries(rows: FakeRow[], queries: string[]): FakeRow[] {
  const parsed = queries.map(query => JSON.parse(query) as Query)
  let result = [...rows]
  for (const query of parsed) {
    if (query.method === 'equal') {
      const wanted = (query.values ?? []).map(String)
      result = result.filter(row => wanted.includes(String(row[String(query.attribute)] ?? '')))
    }
  }
  const limit = parsed.find(query => query.method === 'limit')
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
    return { ...row }
  }),
  createRow: vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    const row: FakeRow = { $id: rowId, $createdAt: '2026-11-15T00:00:00.000Z', $updatedAt: '2026-11-15T00:00:00.000Z', ...data }
    rowsOf(tableId).push(row)
    return { ...row }
  }),
  updateRow: vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    const row = rowsOf(tableId).find(entry => entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404)
    Object.assign(row, data)
    return { ...row }
  }),
}

// ── Die Nitro-Auto-Imports ─────────────────────────────────────────────────
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('logEvent', (level: string, name: string, data: Record<string, unknown> = {}) => {
  logs.push({ level, name, data })
})
vi.stubGlobal('readValidatedBody', async (_event: H3Event, parse: (input: unknown) => unknown) => parse(body))
vi.stubGlobal('getRouterParam', () => 'p1')
vi.stubGlobal('requirePermission', () => ({ $id: 'redaktion' }))

// Die KI-Kette: gestellt, KEIN echter Aufruf. Der Stellvertreter zählt.
const ai = vi.hoisted(() => ({
  begin: [] as string[],
  calls: [] as string[],
  reject: null as null | { status: number, code: string },
  answer: { de: 'Jahreszahl im zweiten Absatz korrigiert.', en: 'Corrected the year in the second paragraph.' } as unknown,
  aiLogs: [] as { phase: string, kind: string, data: Record<string, unknown> }[],
}))
vi.stubGlobal('insightsBeginAiRun', async (_event: H3Event, userId: string, kind: string) => {
  ai.begin.push(kind)
  if (ai.reject) {
    const { status, code } = ai.reject
    throw Object.assign(new Error('rejected'), { status, statusCode: status, data: { code } })
  }
  return { model: 'test/model', providerRouting: { zdr: true, dataCollection: 'deny', allowFallbacks: false }, userId }
})
vi.stubGlobal('insightsLogAi', (phase: string, kind: string, data: Record<string, unknown>) => {
  ai.aiLogs.push({ phase, kind, data })
})
vi.stubGlobal('insightsAiErrorCode', () => 'test')
vi.stubGlobal('aiCompleteJsonDetailed', async (_event: H3Event, prompt: string) => {
  ai.calls.push(prompt)
  return { value: ai.answer, promptTokens: 10, completionTokens: 20, finishReason: 'stop' }
})

// ── Die ECHTEN Server-Utils, als Auto-Import gestellt ──────────────────────
vi.stubGlobal('INSIGHTS_BRANDS_LIMIT', store.INSIGHTS_BRANDS_LIMIT)
vi.stubGlobal('insightsDb', store.insightsDb)
vi.stubGlobal('isInsightsRowMissing', store.isInsightsRowMissing)
vi.stubGlobal('insightsStorageError', admin.insightsStorageError)
vi.stubGlobal('insightsPostMissing', admin.insightsPostMissing)
vi.stubGlobal('loadInsightsPostRow', admin.loadInsightsPostRow)
vi.stubGlobal('saveInsightsPostRow', admin.saveInsightsPostRow)
vi.stubGlobal('listInsightsBrandRows', admin.listInsightsBrandRows)
vi.stubGlobal('applyInsightsSlugChange', admin.applyInsightsSlugChange)
vi.stubGlobal('insightsKnownBrandIds', admin.insightsKnownBrandIds)
vi.stubGlobal('insightsFormIssues', review.insightsFormIssues)
vi.stubGlobal('insightsPublicationGate', review.insightsPublicationGate)
vi.stubGlobal('insightsHiddenTranslationClearance', review.insightsHiddenTranslationClearance)

const patch = (await import('../server/api/insights/posts/[id].patch'))
  .default as unknown as (event: H3Event) => Promise<InsightsPostSavedResponse>
const suggest = (await import('../server/api/insights/posts/[id]/change-note.post'))
  .default as unknown as (event: H3Event) => Promise<InsightsChangeNoteSuggestionResponse>

const event = { context: {} } as unknown as H3Event

// ── Die Bühne ──────────────────────────────────────────────────────────────

const URL_A = 'https://a.example/about'
const URL_B = 'https://b.example/press'

function sourceA(overrides: Partial<InsightsSource> = {}): InsightsSource {
  return { url: URL_A, publisher: 'A GmbH', date: '2026-01-10', kind: 'brand-site', quote: 'Wir rösten seit 1990 selbst.', license: '', ...overrides }
}

function sourceB(overrides: Partial<InsightsSource> = {}): InsightsSource {
  return { url: URL_B, publisher: 'B Presse', date: '2026-02-01', kind: 'press', quote: 'Die Marke wächst um zehn Prozent.', license: '', ...overrides }
}

const BODY_DE = [
  'Die Antwort steht vorn.',
  '',
  '## Warum rösten Marken selbst?',
  '',
  'Ein Absatz über das Rösten.',
  '',
  '## Was heisst das für euch?',
  '',
  'Ein zweiter Absatz.',
  '',
  'Was meint ihr dazu?',
].join('\n')

function articlePost(overrides: Partial<InsightsPost> = {}): InsightsPost {
  return {
    format: 'article',
    slug: 'warum-roester-selbst-roesten',
    slugHistory: [],
    state: 'published',
    baseLocale: 'de',
    titleDe: 'Warum Röster selbst rösten',
    titleEn: '',
    dekDe: 'Ein Blick in die Rösterei.',
    dekEn: '',
    bodyDe: BODY_DE,
    bodyEn: '',
    translatedAt: '',
    translationModel: '',
    translationPromptVersion: '',
    translationReviewed: false,
    topics: [],
    sources: [sourceA(), sourceB()],
    brandRefs: [],
    facts: [],
    ranking: null,
    readingMinutes: 1,
    publishedAt: '2026-11-01T08:00:00.000Z',
    reviewedAt: '2026-11-01T07:00:00.000Z',
    reviewedBy: 'user-1',
    noteInternal: '',
    brief: '',
    briefModel: '',
    briefPromptVersion: '',
    briefVideoId: '',
    draftModel: '',
    draftPromptVersion: '',
    changeNotes: [],
    ...overrides,
  }
}

/** Was ein Redaktions-Formular schickt: alles ausser den Server-Feldern. */
function editOf(post: InsightsPost, overrides: Partial<InsightsPostEdit> = {}): InsightsPostEdit {
  return {
    format: post.format,
    slug: post.slug,
    baseLocale: post.baseLocale,
    titleDe: post.titleDe,
    titleEn: post.titleEn,
    dekDe: post.dekDe,
    dekEn: post.dekEn,
    bodyDe: post.bodyDe,
    bodyEn: post.bodyEn,
    translationReviewed: post.translationReviewed,
    topics: [...post.topics],
    sources: post.sources.map(source => ({ ...source })),
    brandRefs: post.brandRefs.map(ref => ({ ...ref })),
    facts: post.facts.map(fact => ({ ...fact })),
    ranking: post.ranking,
    noteInternal: post.noteInternal,
    brief: post.brief,
    changeNotes: post.changeNotes.map(note => ({ ...note })),
    ...overrides,
  }
}

function putPost(post: InsightsPost): void {
  tables[INSIGHTS_POSTS_TABLE] = [{
    $id: 'p1',
    $createdAt: '2026-10-01T00:00:00.000Z',
    $updatedAt: '2026-10-01T00:00:00.000Z',
    ...fromInsightsPost(post),
  }]
}

function storedRow(): string {
  return JSON.stringify(tables[INSIGHTS_POSTS_TABLE]?.[0] ?? null)
}

beforeEach(() => {
  tables = {}
  logs = []
  body = {}
  fetchState.pages = {
    [URL_A]: 'Wir rösten seit 1990 selbst. Mehr auf der Seite.',
    [URL_B]: 'Die Marke wächst um zehn Prozent.',
  }
  fetchState.calls = []
  Object.values(tablesDB).forEach(fn => fn.mockClear())
  ai.begin = []
  ai.calls = []
  ai.reject = null
  ai.answer = { de: 'Jahreszahl im zweiten Absatz korrigiert.', en: 'Corrected the year in the second paragraph.' }
  ai.aiLogs = []
})

const OLD_NOTE: InsightsChangeNote = { at: '2026-11-05T10:00:00.000Z', de: 'Quelle ergänzt.', en: 'Added a source.' }

// ── PATCH ──────────────────────────────────────────────────────────────────

describe('PATCH: Änderungshinweise und Unterschrift', () => {
  it('ein neuer Hinweis an einem veröffentlichten Artikel ⇒ gespeichert, Datum vom Server, Unterschrift des Speichernden', async () => {
    const current = articlePost({ changeNotes: [OLD_NOTE] })
    putPost(current)
    const before = Date.now()
    body = editOf(current, {
      bodyDe: BODY_DE.replace('Ein Absatz über das Rösten.', 'Ein Absatz über das Rösten seit 1991.'),
      // Ein erfundenes Datum gilt nicht: der Hinweis ist NEU.
      changeNotes: [{ at: '2020-01-01T00:00:00.000Z', de: 'Jahreszahl korrigiert.', en: '' }, OLD_NOTE],
    })

    const result = await patch(event)

    expect(result.saved).toBe(true)
    const [fresh, kept] = result.post.changeNotes
    expect(fresh?.de).toBe('Jahreszahl korrigiert.')
    expect(Date.parse(fresh?.at ?? '')).toBeGreaterThanOrEqual(before - 1000)
    expect(kept).toEqual(OLD_NOTE)
    // Das Speichern eines öffentlichen Stands ist eine Freigabe — mit Namen.
    expect(result.post.reviewedBy).toBe('redaktion')
    expect(result.post.reviewedAt).toBe(fresh?.at)
    expect(result.post.publishedAt).toBe(current.publishedAt)
  })

  it('an einem nie veröffentlichten Entwurf wird ein neuer Hinweis verworfen — und nichts unterschrieben', async () => {
    const current = articlePost({ state: 'draft', publishedAt: '', reviewedAt: '', reviewedBy: '' })
    putPost(current)
    body = editOf(current, { changeNotes: [{ at: '', de: 'Neu.', en: '' }] })

    const result = await patch(event)

    expect(result.saved).toBe(true)
    expect(result.post.changeNotes).toEqual([])
    expect(result.post.reviewedBy).toBe('')
  })

  it('ein zurückgezogener Beitrag (war schon draussen) behält und sammelt Hinweise', async () => {
    const current = articlePost({ state: 'draft', changeNotes: [OLD_NOTE] })
    putPost(current)
    body = editOf(current, { changeNotes: [{ at: '', de: 'Neu.', en: '' }, OLD_NOTE] })

    const result = await patch(event)

    expect(result.saved).toBe(true)
    expect(result.post.changeNotes).toHaveLength(2)
    // Kein öffentlicher Stand ⇒ keine neue Unterschrift.
    expect(result.post.reviewedBy).toBe(current.reviewedBy)
  })

  it('ein Hinweis mit herabsetzendem Wort ⇒ `saved: false`, nichts geschrieben', async () => {
    const current = articlePost()
    putPost(current)
    const before = storedRow()
    body = editOf(current, { changeNotes: [{ at: '', de: 'Billig gemachte Zahl ersetzt.', en: '' }] })

    const result = await patch(event)

    expect(result.saved).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'disparagement', at: { kind: 'changeNote', index: 0 } }))
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(storedRow()).toBe(before)
  })
})

// ── Vorschlags-Route ───────────────────────────────────────────────────────

describe('POST …/change-note: der Vorschlag', () => {
  it('nie veröffentlicht ⇒ 409 `not_published`, kein Lauf, kein Eimer', async () => {
    const current = articlePost({ state: 'draft', publishedAt: '', reviewedAt: '', reviewedBy: '' })
    putPost(current)
    body = editOf(current, { bodyDe: BODY_DE.replace('Ein Absatz', 'Ein neuer Absatz') })

    await expect(suggest(event)).rejects.toMatchObject({ status: 409, data: { code: 'not_published' } })
    expect(ai.calls).toEqual([])
    expect(ai.begin).toEqual([])
  })

  it('keine inhaltliche Änderung ⇒ 409 `no_change`, kein Lauf', async () => {
    const current = articlePost()
    putPost(current)
    body = editOf(current, { noteInternal: 'Nur intern.', changeNotes: [{ at: '', de: 'Hinweis.', en: '' }] })

    await expect(suggest(event)).rejects.toMatchObject({ status: 409, data: { code: 'no_change' } })
    expect(ai.calls).toEqual([])
    expect(ai.begin).toEqual([])
  })

  it('Erfolg ⇒ `{ de, en }`, die Ablage bleibt unberührt, das Protokoll trägt keinen Text', async () => {
    const current = articlePost()
    putPost(current)
    const before = storedRow()
    body = editOf(current, { bodyDe: BODY_DE.replace('Ein Absatz über das Rösten.', 'Ein Absatz über das Rösten seit 1991.') })

    const result = await suggest(event)

    expect(result).toEqual({ de: 'Jahreszahl im zweiten Absatz korrigiert.', en: 'Corrected the year in the second paragraph.' })
    expect(ai.begin).toEqual(['changeNote'])
    expect(ai.calls).toHaveLength(1)
    expect(ai.calls[0]).toContain('Ein Absatz über das Rösten seit 1991.')
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect(storedRow()).toBe(before)
    expect(ai.aiLogs.map(entry => entry.phase)).toEqual(['requested', 'completed'])
    const logged = JSON.stringify(ai.aiLogs) + JSON.stringify(logs)
    expect(logged).not.toContain('Jahreszahl')
    expect(logged).not.toContain('Corrected')
    expect(logged).not.toContain('Rösten')
  })

  it('zu langer Text wird gekürzt statt abgelehnt; eine fehlende Sprache bleibt leer', async () => {
    const current = articlePost()
    putPost(current)
    body = editOf(current, { dekDe: 'Ein neuer Vorspann.' })
    ai.answer = { de: 'x'.repeat(INSIGHTS_CHANGE_NOTE_MAX + 40) }

    const result = await suggest(event)

    expect(result.de).toHaveLength(INSIGHTS_CHANGE_NOTE_MAX)
    expect(result.en).toBe('')
  })

  it('beide Sprachen leer ⇒ gescheitert (502 `ai_empty`), als `failed` protokolliert', async () => {
    const current = articlePost()
    putPost(current)
    body = editOf(current, { dekDe: 'Ein neuer Vorspann.' })
    ai.answer = { de: '   ', en: 42 }

    await expect(suggest(event)).rejects.toMatchObject({ status: 502, data: { code: 'ai_empty' } })
    expect(ai.aiLogs.map(entry => entry.phase)).toEqual(['requested', 'failed'])
  })

  it('Abschalter und Kontingent lehnen VOR dem Lauf ab', async () => {
    const current = articlePost()
    putPost(current)
    body = editOf(current, { dekDe: 'Ein neuer Vorspann.' })

    ai.reject = { status: 409, code: 'ai_disabled' }
    await expect(suggest(event)).rejects.toMatchObject({ status: 409, data: { code: 'ai_disabled' } })
    ai.reject = { status: 429, code: 'ai_hourly_limit' }
    await expect(suggest(event)).rejects.toMatchObject({ status: 429, data: { code: 'ai_hourly_limit' } })
    expect(ai.calls).toEqual([])
  })
})
