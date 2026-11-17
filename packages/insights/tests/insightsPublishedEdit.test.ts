import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import type { InsightsPost, InsightsPostEdit, InsightsSource } from '../shared/insightsPost'
import { INSIGHTS_POSTS_TABLE, fromInsightsPost } from '../shared/insightsRows'
import type {
  InsightsPostSavedResponse,
  InsightsPostStateResponse,
  InsightsTranslateResponse,
} from '../shared/types/insightsApi'

/**
 * BE-009 — EIN VERÖFFENTLICHTER ARTIKEL WIRD NUR GEPRÜFT GEÄNDERT.
 *
 * Gefälschte Ablage, gefälschter Seitenabruf (zählt jeden Abruf), gestellte
 * Nitro-Auto-Imports — und darüber die ECHTEN Handler von PATCH, Zustand und
 * Übersetzen samt echter `insightsReview`/`insightsPostsAdmin`-Utils. Kein
 * KI-Aufruf: der Übersetzen-Lauf bekommt eine gestellte Antwort.
 *
 * Die Zusage: was öffentlich steht, hat die sieben Prüfregeln bestanden —
 * beim ersten Veröffentlichen UND bei jeder Änderung danach. Dazu die
 * Gegenproben (ein Entwurf speichert frei, eine regelkonforme Änderung geht
 * durch, ein Tippfehler ruft keine fremde Seite ab) und ein Wächter, der die
 * Schreibwege zählt.
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

// Der Übersetzen-Lauf: Kette und Modell gestellt, KEIN echter Aufruf.
vi.stubGlobal('insightsBeginAiRun', async () => ({ model: 'test/model', providerRouting: undefined }))
vi.stubGlobal('insightsLogAi', () => {})
vi.stubGlobal('insightsAiErrorCode', () => 'test')
vi.stubGlobal('aiCompleteJsonDetailed', async () => ({
  value: {
    title: 'Why roasters roast themselves',
    dek: 'A look at the roastery.',
    body: 'Just a machine text.',
  },
  promptTokens: 10,
  completionTokens: 20,
  finishReason: 'stop',
}))

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
const changeState = (await import('../server/api/insights/posts/[id]/state.post'))
  .default as unknown as (event: H3Event) => Promise<InsightsPostStateResponse>
const translate = (await import('../server/api/insights/posts/[id]/translate.post'))
  .default as unknown as (event: H3Event) => Promise<InsightsTranslateResponse>

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
})

// ── 1–7: der PATCH ─────────────────────────────────────────────────────────

describe('PATCH an einem veröffentlichten Artikel läuft durch die Prüfregeln', () => {
  it('1 · ein Zitat, das nicht in der Quelle steht ⇒ nichts geschrieben, Liste zurück', async () => {
    const current = articlePost()
    putPost(current)
    const before = storedRow()
    body = editOf(current, { sources: [sourceA({ quote: 'Wir rösten seit 1980 selbst.' }), sourceB()] })

    const result = await patch(event)

    expect(storedRow()).toBe(before)
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(result.saved).toBe(false)
    expect(result.issues).toContainEqual({ code: 'quote_not_grounded', at: { kind: 'source', index: 0 } })
    // Die Antwort trägt den ÖFFENTLICHEN Stand, nicht die abgelehnte Eingabe.
    expect(result.post.sources[0]?.quote).toBe('Wir rösten seit 1990 selbst.')
  })

  it('2 · Gegenprobe: derselbe PATCH an einem ENTWURF speichert — ohne Abruf', async () => {
    const current = articlePost({ state: 'draft', publishedAt: '', reviewedAt: '', reviewedBy: '' })
    putPost(current)
    body = editOf(current, { sources: [sourceA({ quote: 'Wir rösten seit 1980 selbst.' }), sourceB()] })

    const result = await patch(event)

    expect(result.saved).toBe(true)
    expect(fetchState.calls).toHaveLength(0)
    expect(tablesDB.updateRow).toHaveBeenCalledTimes(1)
    expect(result.post.sources[0]?.quote).toBe('Wir rösten seit 1980 selbst.')
  })

  it('3 · eine regelkonforme Änderung geht durch', async () => {
    const current = articlePost()
    putPost(current)
    body = editOf(current, { sources: [sourceA({ quote: 'Mehr auf der Seite.' }), sourceB()] })

    const result = await patch(event)

    expect(result.saved).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.post.sources[0]?.quote).toBe('Mehr auf der Seite.')
    expect(result.post.state).toBe('published')
    expect(tablesDB.updateRow).toHaveBeenCalledTimes(1)
  })

  it('4a · ein Tippfehler im Text ruft KEINE fremde Seite ab', async () => {
    const current = articlePost()
    putPost(current)
    body = editOf(current, { bodyDe: BODY_DE.replace('Ein Absatz über das Rösten.', 'Ein Absatz über das Rösten, korrigiert.') })

    const result = await patch(event)

    expect(result.saved).toBe(true)
    expect(fetchState.calls).toEqual([])
  })

  it('4b · umsortierte Quellen sind keine geänderten — kein Abruf', async () => {
    const current = articlePost()
    putPost(current)
    body = editOf(current, { sources: [sourceB(), sourceA()] })

    const result = await patch(event)

    expect(result.saved).toBe(true)
    expect(fetchState.calls).toEqual([])
  })

  it('4c · EINE geänderte Quelle ⇒ genau EIN Abruf, nur diese', async () => {
    const current = articlePost()
    putPost(current)
    body = editOf(current, { sources: [sourceA(), sourceB({ quote: 'Die Marke wächst um zehn' })] })

    const result = await patch(event)

    expect(result.saved).toBe(true)
    expect(fetchState.calls).toEqual([URL_B])
  })

  it('4d · eine geänderte fremde Seite blockiert keinen UNVERÄNDERTEN Beleg an derselben Adresse', async () => {
    const current = articlePost({ sources: [sourceA(), sourceA({ quote: 'Mehr auf der Seite.' })] })
    putPost(current)
    // Die Seite hat sich geändert: der alte Beleg 0 stünde dort nicht mehr.
    fetchState.pages[URL_A] = 'Neu: Wir rösten selbst. Mehr auf der Seite.'
    body = editOf(current, { sources: [sourceA(), sourceA({ quote: 'Neu: Wir rösten selbst.' })] })

    const result = await patch(event)

    expect(result.saved).toBe(true)
    expect(fetchState.calls).toEqual([URL_A])
  })

  it('5 · eine Regel ohne Abruf (Schlussfrage fehlt) ⇒ nichts geschrieben', async () => {
    const current = articlePost()
    putPost(current)
    const before = storedRow()
    body = editOf(current, { bodyDe: BODY_DE.replace('Was meint ihr dazu?', 'Das war es.') })

    const result = await patch(event)

    expect(result.saved).toBe(false)
    expect(result.issues.map(issue => issue.code)).toContain('text_without_closing_question')
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(storedRow()).toBe(before)
  })

  it('5b · Herabsetzung im Titel ⇒ nichts geschrieben', async () => {
    const current = articlePost()
    putPost(current)
    body = editOf(current, { titleDe: 'Warum Röster billig rösten' })

    const result = await patch(event)

    expect(result.saved).toBe(false)
    expect(result.issues.map(issue => issue.code)).toContain('disparagement')
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('6 · `updated` verhält sich wie `published`', async () => {
    const current = articlePost({ state: 'updated' })
    putPost(current)
    const before = storedRow()
    body = editOf(current, { sources: [sourceA({ quote: 'Wir rösten seit 1980 selbst.' }), sourceB()] })

    const result = await patch(event)

    expect(result.saved).toBe(false)
    expect(result.issues).toContainEqual({ code: 'quote_not_grounded', at: { kind: 'source', index: 0 } })
    expect(storedRow()).toBe(before)

    // Gegenprobe im selben Zustand: regelkonform geht durch.
    body = editOf(current, { dekDe: 'Ein neuer Vorspann.' })
    expect((await patch(event)).saved).toBe(true)
  })

  it('7 · das Häkchen „Übersetzung redigiert" über einer Fassung, die Regel 7 verletzt ⇒ nichts geschrieben', async () => {
    const current = articlePost({
      titleEn: 'Why roasters roast themselves',
      bodyEn: 'Just a machine text.',
      translatedAt: '2026-11-02T00:00:00.000Z',
      translationModel: 'test/model',
    })
    putPost(current)
    const before = storedRow()
    body = editOf(current, { translationReviewed: true })

    const result = await patch(event)

    expect(result.saved).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'text_without_closing_question', detail: 'en' }))
    expect(storedRow()).toBe(before)
  })
})

// ── 8: der Zustandswechsel ─────────────────────────────────────────────────

describe('Der Zustandswechsel prüft weiter mit vollem Abruf', () => {
  it('8 · review → published ruft ALLE Quellen ab und schreibt nur bei bestandener Prüfung', async () => {
    const blocked = articlePost({ state: 'review', publishedAt: '', reviewedAt: '', reviewedBy: '', sources: [sourceA({ quote: 'Steht nirgends.' }), sourceB()] })
    putPost(blocked)
    body = { to: 'published' }

    const no = await changeState(event)
    expect(no.changed).toBe(false)
    expect(no.issues).toContainEqual({ code: 'quote_not_grounded', at: { kind: 'source', index: 0 } })
    expect(fetchState.calls.sort()).toEqual([URL_A, URL_B])
    expect(tablesDB.updateRow).not.toHaveBeenCalled()

    fetchState.calls = []
    putPost(articlePost({ state: 'review', publishedAt: '', reviewedAt: '', reviewedBy: '' }))
    const yes = await changeState(event)
    expect(yes.changed).toBe(true)
    expect(yes.post.state).toBe('published')
    expect(yes.post.reviewedBy).toBe('redaktion')
    expect(fetchState.calls.sort()).toEqual([URL_A, URL_B])
    expect(tablesDB.updateRow).toHaveBeenCalledTimes(1)
  })

  it('8b · Zurückziehen braucht keine Prüfung', async () => {
    putPost(articlePost({ sources: [sourceA({ quote: 'Steht nirgends.' })] }))
    body = { to: 'draft' }

    const result = await changeState(event)
    expect(result.changed).toBe(true)
    expect(result.post.state).toBe('draft')
    expect(fetchState.calls).toEqual([])
  })
})

// ── 9: der Übersetzen-Lauf ─────────────────────────────────────────────────

describe('Übersetzen an einem veröffentlichten Artikel', () => {
  it('9 · speichert die Maschinen-Fassung ausgeblendet, die Grundfassung bleibt', async () => {
    const current = articlePost({ translationReviewed: true, titleEn: 'Old', bodyEn: 'Old text?' })
    putPost(current)

    const result = await translate(event)

    expect(result.post.translationReviewed).toBe(false)
    expect(result.post.bodyEn).toBe('Just a machine text.')
    expect(result.post.state).toBe('published')
    expect(result.post.bodyDe).toBe(current.bodyDe)
    expect(result.post.titleDe).toBe(current.titleDe)
    expect(result.post.sources).toEqual(current.sources)
    expect(tablesDB.updateRow).toHaveBeenCalledTimes(1)
    expect(fetchState.calls).toEqual([])
  })
})

// ── 10: die Schreib-Funktion und ihre Zeichen ──────────────────────────────

describe('Die Schreib-Funktion verlangt für jeden öffentlichen Stand ein Zeichen', () => {
  it('10a · öffentlich ohne Zeichen ⇒ `gate_skipped`, nichts geschrieben, Log ohne Inhalt', async () => {
    putPost(articlePost({ state: 'draft' }))
    const before = storedRow()

    await expect(admin.saveInsightsPostRow(event, 'p1', articlePost())).rejects.toMatchObject({ status: 500, data: { code: 'gate_skipped' } })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(storedRow()).toBe(before)
    const line = logs.find(entry => entry.name === 'insights.gate_skipped')
    expect(line?.level).toBe('error')
    expect(line?.data).toEqual({ rowId: 'p1' })
  })

  it('10b · ein Zeichen für ein ANDERES Objekt gilt nicht — auch nicht für eine Kopie', async () => {
    putPost(articlePost({ state: 'draft' }))
    const checked = articlePost()
    const verdict = await review.insightsPublicationGate({ next: checked, brandRows: [] })
    expect(verdict.passed).toBe(true)
    if (!verdict.passed) return

    await expect(admin.saveInsightsPostRow(event, 'p1', structuredClone(checked), verdict.clearance))
      .rejects.toMatchObject({ data: { code: 'gate_skipped' } })
    await expect(admin.saveInsightsPostRow(event, 'p1', articlePost({ titleDe: 'Anders' }), verdict.clearance))
      .rejects.toMatchObject({ data: { code: 'gate_skipped' } })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()

    // Gegenprobe: dasselbe Objekt mit seinem Zeichen schreibt.
    await admin.saveInsightsPostRow(event, 'p1', checked, verdict.clearance)
    expect(tablesDB.updateRow).toHaveBeenCalledTimes(1)
  })

  it('10c · ein nach der Prüfung VERÄNDERTER Stand gilt nicht', async () => {
    putPost(articlePost({ state: 'draft' }))
    const checked = articlePost()
    const verdict = await review.insightsPublicationGate({ next: checked, brandRows: [] })
    if (!verdict.passed) throw new Error('Gate sollte bestehen')
    checked.bodyDe = 'Ungeprüft eingeschoben.'

    await expect(admin.saveInsightsPostRow(event, 'p1', checked, verdict.clearance))
      .rejects.toMatchObject({ data: { code: 'gate_skipped' } })
  })

  it('10d · ein von Hand gebautes Zeichen gilt nicht', async () => {
    putPost(articlePost({ state: 'draft' }))
    const post = articlePost()
    const forged = Object.freeze({ post, kind: 'gate' as const })

    await expect(admin.saveInsightsPostRow(event, 'p1', post, forged))
      .rejects.toMatchObject({ data: { code: 'gate_skipped' } })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('10e · Gegenprobe: ein Entwurf braucht kein Zeichen', async () => {
    putPost(articlePost({ state: 'draft' }))
    await admin.saveInsightsPostRow(event, 'p1', articlePost({ state: 'draft', titleDe: 'Neu' }))
    expect(tablesDB.updateRow).toHaveBeenCalledTimes(1)
    expect(tables[INSIGHTS_POSTS_TABLE]?.[0]?.titleDe).toBe('Neu')
  })

  it('10f · ein Gate, das NICHT besteht, stellt kein Zeichen aus', async () => {
    const verdict = await review.insightsPublicationGate({ next: articlePost({ bodyDe: 'Ohne Frage.' }), brandRows: [] })
    expect(verdict.passed).toBe(false)
    expect('clearance' in verdict).toBe(false)
  })

  it('10g · eine neue Zeile in einem öffentlichen Zustand wird nie angelegt', async () => {
    await expect(admin.createInsightsPostRow(event, articlePost())).rejects.toMatchObject({ data: { code: 'gate_skipped' } })
    expect(tablesDB.createRow).not.toHaveBeenCalled()
  })
})

describe('Das enge Zeichen des Übersetzen-Laufs', () => {
  const current = articlePost({ translationReviewed: true, titleEn: 'Old', bodyEn: 'Old?' })
  const translated = (overrides: Partial<InsightsPost> = {}): InsightsPost => ({
    ...current,
    titleEn: 'New',
    dekEn: 'New dek',
    bodyEn: 'New body',
    translatedAt: '2026-11-15T00:00:00.000Z',
    translationModel: 'test/model',
    translationPromptVersion: 'v9',
    translationReviewed: false,
    ...overrides,
  })

  it('gilt für genau die Maschinen-Fassung — und deckt den Stand', () => {
    const next = translated()
    const clearance = review.insightsHiddenTranslationClearance(current, next)
    expect(clearance).not.toBeNull()
    expect(review.insightsClearanceCovers(clearance, next)).toBe(true)
  })

  it('ist `null`, sobald die Grundfassung abweicht', () => {
    expect(review.insightsHiddenTranslationClearance(current, translated({ bodyDe: 'Anders?' }))).toBeNull()
    expect(review.insightsHiddenTranslationClearance(current, translated({ titleDe: 'Anders' }))).toBeNull()
    expect(review.insightsHiddenTranslationClearance(current, translated({ dekDe: 'Anders' }))).toBeNull()
  })

  it('ist `null`, sobald eine Quelle abweicht', () => {
    expect(review.insightsHiddenTranslationClearance(current, translated({ sources: [sourceA({ quote: 'Anders.' }), sourceB()] }))).toBeNull()
  })

  it('ist `null`, sobald das Häkchen an ist', () => {
    expect(review.insightsHiddenTranslationClearance(current, translated({ translationReviewed: true }))).toBeNull()
  })

  it('ist `null`, sobald der Zustand oder die Grundsprache abweicht', () => {
    expect(review.insightsHiddenTranslationClearance(current, translated({ state: 'updated' }))).toBeNull()
    expect(review.insightsHiddenTranslationClearance(current, translated({ baseLocale: 'en' }))).toBeNull()
  })
})

describe('Welche Quellen ein Gate-Lauf abruft (pur)', () => {
  it('ohne öffentlichen Stand: jede Quelle mit Zitat und Adresse', () => {
    const next = articlePost({ sources: [sourceA(), sourceB({ quote: '' })] })
    expect(review.insightsSourcesToFetch(next)).toEqual([sourceA()])
  })

  it('mit öffentlichem Stand: nur neue oder geänderte Paare, unabhängig von der Reihenfolge', () => {
    const published = articlePost()
    expect(review.insightsSourcesToFetch(articlePost({ sources: [sourceB(), sourceA()] }), published)).toEqual([])
    const changed = sourceB({ quote: 'Neu.' })
    expect(review.insightsSourcesToFetch(articlePost({ sources: [sourceA(), changed] }), published)).toEqual([changed])
    const moved = sourceA({ url: 'https://c.example/' })
    expect(review.insightsSourcesToFetch(articlePost({ sources: [moved, sourceB()] }), published)).toEqual([moved])
  })
})

// ── 11: der Wächter ────────────────────────────────────────────────────────

const LAYER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function filesBelow(dir: string): string[] {
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) found.push(...filesBelow(path))
    else if (path.endsWith('.ts')) found.push(path)
  }
  return found
}

function layerPath(path: string): string {
  return relative(LAYER_ROOT, path).split(sep).join('/')
}

function countOf(text: string, needle: string): number {
  return text.split(needle).length - 1
}

/**
 * WER DIE BEITRAGS-TABELLE ÜBERHAUPT ANFASST — mit Zahl und Grund.
 *
 * Die Schreib-Tür (`saveInsightsPostRow`) hilft nur, wenn niemand an ihr
 * vorbei schreibt. Ein neuer direkter Zugriff auf `INSIGHTS_POSTS_TABLE` ist
 * deshalb eine Entscheidung, die hier eingetragen wird — mit Begründung.
 */
const POSTS_TABLE_USES: Record<string, { count: number, why: string }> = {
  'server/utils/insightsPostsAdmin.ts': { count: 7, why: 'die Schreib-Tür: Laden, Anlegen, Schreiben (mit Zeichen), Löschen, Adress-Suche' },
  'server/utils/insightsPublic.ts': { count: 5, why: 'nur Lesen für die öffentlichen Seiten' },
  'server/utils/insightsUserData.ts': { count: 4, why: 'Konto-Löschung: Export liest, Löschung leert NUR `reviewedBy`' },
  'server/utils/insightsStore.ts': { count: 1, why: 'Re-Export der Tabellen-Konstante' },
  'server/api/insights/public/corrections.post.ts': { count: 2, why: 'nur Lesen: ist das Ziel eines Korrekturvorschlags öffentlich?' },
}

/**
 * `unsigned` zählt die Aufrufe OHNE Zeichen, die eine 'gate'-Route haben darf
 * — für ihren nicht-öffentlichen Zweig, den `branch` im Quelltext belegen muss.
 */
type WriteGuard =
  | { kind: 'gate', unsigned: number, branch: string, why: string }
  | { kind: 'hidden-translation' }
  | { kind: 'never-public', why: string }

/** Jede Route, die `saveInsightsPostRow` ruft — und womit sie sich sichert. */
const SAVE_CALLERS: Record<string, WriteGuard> = {
  'server/api/insights/posts/[id].patch.ts': {
    kind: 'gate',
    unsigned: 1,
    branch: 'insightsIsPublic(current)',
    why: 'ein Entwurf oder ein Beitrag in `review` ist nicht öffentlich und speichert frei',
  },
  'server/api/insights/posts/[id]/state.post.ts': {
    kind: 'gate',
    unsigned: 1,
    branch: `to === 'draft'`,
    why: 'Zurückziehen ist frei und führt in einen nicht-öffentlichen Zustand',
  },
  'server/api/insights/posts/[id]/translate.post.ts': { kind: 'hidden-translation' },
  'server/api/insights/posts/[id]/draft.post.ts': { kind: 'never-public', why: 'der KI-Entwurf läuft nur im Zustand `draft` (409 `not_draft`)' },
}

/** Die Argumente eines Aufrufs auf oberster Ebene zählen (Klammern beachtet). */
function topLevelArgCount(source: string, start: number): number {
  let depth = 0
  let args = 1
  for (let index = start; index < source.length; index++) {
    const char = source[index]
    if (char === '(' || char === '[' || char === '{') depth++
    else if (char === ')' || char === ']' || char === '}') {
      if (depth === 0) return args
      depth--
    }
    else if (char === ',' && depth === 0) args++
  }
  return args
}

describe('Wächter: kein Schreibweg an der Prüfung vorbei', () => {
  const serverFiles = filesBelow(join(LAYER_ROOT, 'server'))

  it('a · `INSIGHTS_POSTS_TABLE` steht nur an den eingetragenen Stellen', () => {
    const found: Record<string, number> = {}
    for (const file of serverFiles) {
      const count = countOf(readFileSync(file, 'utf8'), 'INSIGHTS_POSTS_TABLE')
      if (count > 0) found[layerPath(file)] = count
    }
    const problems: string[] = []
    for (const [file, count] of Object.entries(found)) {
      const allowed = POSTS_TABLE_USES[file]
      if (!allowed) {
        problems.push(`${file}: greift ${count}× direkt auf die Beitrags-Tabelle zu. Schreiben geht NUR über saveInsightsPostRow (mit Freigabe-Zeichen); reines Lesen mit Grund in POSTS_TABLE_USES eintragen.`)
      }
      else if (allowed.count !== count) {
        problems.push(`${file}: ${count} statt ${allowed.count} Vorkommen. Ist ein neuer Schreibweg dazugekommen? Prüfen, dann Zahl und Grund in POSTS_TABLE_USES anpassen.`)
      }
    }
    for (const file of Object.keys(POSTS_TABLE_USES)) {
      if (!found[file]) problems.push(`${file}: steht in POSTS_TABLE_USES, nutzt die Tabelle aber nicht mehr — Eintrag streichen.`)
    }
    expect(problems).toEqual([])
  })

  it('b · jeder Aufruf von `saveInsightsPostRow` in einer Route trägt seine Sicherung', () => {
    const problems: string[] = []
    const callers = serverFiles.filter(file => layerPath(file).startsWith('server/api/'))
    for (const file of callers) {
      const path = layerPath(file)
      const source = readFileSync(file, 'utf8')
      const calls = [...source.matchAll(/saveInsightsPostRow\(/g)]
      if (calls.length === 0) continue
      const guard = SAVE_CALLERS[path]
      if (!guard) {
        problems.push(`${path}: ruft saveInsightsPostRow, steht aber nicht in SAVE_CALLERS. Einen öffentlichen Stand nur mit Zeichen aus insightsPublicationGate schreiben und die Route mit ihrer Sicherung eintragen.`)
        continue
      }
      if (guard.kind === 'never-public') {
        for (const call of calls) {
          if (!source.includes('not_draft') || source.indexOf('not_draft') > (call.index ?? 0)) {
            problems.push(`${path}: als 'never-public' eingetragen, prüft aber vor dem Schreiben nicht den Zustand (not_draft).`)
          }
        }
        continue
      }
      const signed = calls.filter(call => topLevelArgCount(source, (call.index ?? 0) + call[0].length) === 4).length
      const unsigned = calls.length - signed
      const allowedUnsigned = guard.kind === 'gate' ? guard.unsigned : 0
      if (signed === 0) problems.push(`${path}: kein Aufruf von saveInsightsPostRow mit Freigabe-Zeichen (viertes Argument).`)
      if (unsigned !== allowedUnsigned) {
        problems.push(`${path}: ${unsigned} Aufruf(e) ohne Freigabe-Zeichen, erlaubt sind ${allowedUnsigned}. Ein öffentlicher Stand braucht das Zeichen aus insightsPublicationGate.`)
      }
      if (guard.kind === 'gate' && unsigned > 0 && !source.includes(guard.branch)) {
        problems.push(`${path}: der Zweig ohne Zeichen (${guard.branch}) ist im Quelltext nicht mehr zu finden.`)
      }
      const issuer = guard.kind === 'gate' ? 'insightsPublicationGate(' : 'insightsHiddenTranslationClearance('
      if (!source.includes(issuer)) problems.push(`${path}: als '${guard.kind}' eingetragen, ruft aber ${issuer}) nicht.`)
    }
    for (const path of Object.keys(SAVE_CALLERS)) {
      if (!callers.some(file => layerPath(file) === path)) problems.push(`${path}: steht in SAVE_CALLERS, die Datei gibt es nicht mehr.`)
    }
    expect(problems).toEqual([])
  })

  // ── IN1 c (2026-11-17): dieselben zwei Fragen für die Marken-Tabelle ──────

  it('c · `INSIGHTS_BRANDS_TABLE` steht nur an den eingetragenen Stellen', () => {
    const found: Record<string, number> = {}
    for (const file of serverFiles) {
      const count = countOf(readFileSync(file, 'utf8'), 'INSIGHTS_BRANDS_TABLE')
      if (count > 0) found[layerPath(file)] = count
    }
    const problems: string[] = []
    for (const [file, count] of Object.entries(found)) {
      const allowed = BRANDS_TABLE_USES[file]
      if (!allowed) {
        problems.push(`${file}: greift ${count}× direkt auf die Marken-Tabelle zu. Schreiben geht NUR über saveInsightsBrandRow/createInsightsBrandRow; reines Lesen mit Grund in BRANDS_TABLE_USES eintragen.`)
      }
      else if (allowed.count !== count) {
        problems.push(`${file}: ${count} statt ${allowed.count} Vorkommen. Ist ein neuer Schreibweg dazugekommen? Prüfen, dann Zahl und Grund in BRANDS_TABLE_USES anpassen.`)
      }
    }
    for (const file of Object.keys(BRANDS_TABLE_USES)) {
      if (!found[file]) problems.push(`${file}: steht in BRANDS_TABLE_USES, nutzt die Tabelle aber nicht mehr — Eintrag streichen.`)
    }
    expect(problems).toEqual([])
  })

  it('d · die Konto-Löschung leert an einer Marke NUR `claimedBy`', () => {
    const source = readFileSync(join(LAYER_ROOT, 'server/utils/insightsUserData.ts'), 'utf8')
    const writes = [...source.matchAll(/clear\(INSIGHTS_BRANDS_TABLE,[^)]*\)/g)].map(match => match[0])
    expect(writes).toEqual([`clear(INSIGHTS_BRANDS_TABLE, row.$id, { claimedBy: '' })`])
  })

  it('e · jeder Aufruf von `saveInsightsBrandRow` in einer Route trägt seine Sicherung', () => {
    const problems: string[] = []
    const callers = serverFiles.filter(file => layerPath(file).startsWith('server/api/'))
    for (const file of callers) {
      const path = layerPath(file)
      const source = readFileSync(file, 'utf8')
      const calls = [...source.matchAll(/saveInsightsBrandRow\(/g)]
      if (calls.length === 0) continue
      const guard = BRAND_SAVE_CALLERS[path]
      if (!guard) {
        problems.push(`${path}: ruft saveInsightsBrandRow, steht aber nicht in BRAND_SAVE_CALLERS. Einen veröffentlichten Stand nur mit Zeichen aus insightsBrandPublicationGate schreiben und die Route eintragen.`)
        continue
      }
      const signed = calls.filter(call => topLevelArgCount(source, (call.index ?? 0) + call[0].length) === 4).length
      const unsigned = calls.length - signed
      if (signed === 0) problems.push(`${path}: kein Aufruf von saveInsightsBrandRow mit Freigabe-Zeichen (viertes Argument).`)
      if (unsigned !== guard.unsigned) problems.push(`${path}: ${unsigned} Aufruf(e) ohne Zeichen, erlaubt sind ${guard.unsigned}.`)
      if (unsigned > 0 && !source.includes(guard.branch)) problems.push(`${path}: der Zweig ohne Zeichen (${guard.branch}) ist im Quelltext nicht mehr zu finden.`)
      if (!source.includes('insightsBrandPublicationGate(')) problems.push(`${path}: ruft insightsBrandPublicationGate() nicht.`)
    }
    for (const path of Object.keys(BRAND_SAVE_CALLERS)) {
      if (!callers.some(file => layerPath(file) === path)) problems.push(`${path}: steht in BRAND_SAVE_CALLERS, die Datei gibt es nicht mehr.`)
    }
    expect(problems).toEqual([])
  })
})

/**
 * WER DIE MARKEN-TABELLE ANFASST (IN1 c) — dieselbe Liste wie für Beiträge.
 * Geschrieben wird nur in `insightsPostsAdmin.ts` (Anlegen nie `published`,
 * Speichern `published` nur mit Zeichen) und in der Konto-Löschung, die
 * ausschliesslich `claimedBy` leert (Test d) — nichts Öffentliches.
 */
const BRANDS_TABLE_USES: Record<string, { count: number, why: string }> = {
  'server/utils/insightsPostsAdmin.ts': { count: 6, why: 'die Schreib-Tür: Liste, Anlegen (nie published), Laden, Schreiben (published mit Zeichen), Adress-Suche' },
  'server/utils/insightsPublic.ts': { count: 5, why: 'nur Lesen für die öffentlichen Seiten' },
  'server/utils/insightsUserData.ts': { count: 4, why: 'Konto-Löschung: Export liest, Löschung leert NUR `claimedBy` (Test d)' },
  'server/utils/insightsStore.ts': { count: 1, why: 'Re-Export der Tabellen-Konstante' },
  'server/api/insights/public/corrections.post.ts': { count: 2, why: 'nur Lesen: ist das Ziel eines Korrekturvorschlags öffentlich?' },
}

/** Jede Route, die `saveInsightsBrandRow` ruft — `unsigned` ist ihr Zweig für
 *  `draft`/`removed`, den `branch` im Quelltext belegen muss. */
const BRAND_SAVE_CALLERS: Record<string, { unsigned: number, branch: string, why: string }> = {
  'server/api/insights/brands/[id].patch.ts': {
    unsigned: 1,
    branch: `next.state === 'published'`,
    why: '`draft` und `removed` sind nicht öffentlich; das Entfernen auf Wunsch hängt an keiner Regel',
  },
}
