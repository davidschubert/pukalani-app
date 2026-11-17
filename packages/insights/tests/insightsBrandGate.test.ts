import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import type { InsightsBrand, InsightsBrandEdit, InsightsSource } from '../shared/insightsPost'
import { insightsBrandReviewIssues } from '../shared/insightsPost'
import { INSIGHTS_BRANDS_TABLE, fromInsightsBrand } from '../shared/insightsRows'
import type { InsightsBrandSavedResponse } from '../shared/types/insightsApi'

/**
 * IN1 c (2026-11-17) — MARKEN-SEITEN LAUFEN DURCH DIESELBE PRÜFUNG WIE
 * ARTIKEL (Davids Entscheidung vom 2026-11-16).
 *
 * Bauart wie `insightsPublishedEdit.test.ts`: gefälschte Ablage, gefälschter
 * Seitenabruf (zählt jeden Abruf), gestellte Nitro-Auto-Imports — darüber der
 * ECHTE PATCH-Handler samt echter `insightsReview`/`insightsPostsAdmin`-Utils.
 * Kein Netz, kein Modell.
 *
 * Die Zusage: eine Marken-Seite wird nur geprüft öffentlich und nur geprüft
 * geändert; abgelehnt heisst „nichts geschrieben"; der Entwurf und das
 * Entfernen auf Wunsch gehen IMMER.
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
    const row: FakeRow = { $id: rowId, $createdAt: '2026-11-17T00:00:00.000Z', $updatedAt: '2026-11-17T00:00:00.000Z', ...data }
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
vi.stubGlobal('getRouterParam', () => 'b1')
vi.stubGlobal('requirePermission', () => ({ $id: 'redaktion' }))

// ── Die ECHTEN Server-Utils, als Auto-Import gestellt ──────────────────────
vi.stubGlobal('INSIGHTS_BRANDS_LIMIT', store.INSIGHTS_BRANDS_LIMIT)
vi.stubGlobal('insightsDb', store.insightsDb)
vi.stubGlobal('isInsightsRowMissing', store.isInsightsRowMissing)
vi.stubGlobal('insightsStorageError', admin.insightsStorageError)
vi.stubGlobal('insightsBrandMissing', admin.insightsBrandMissing)
vi.stubGlobal('loadInsightsBrandRow', admin.loadInsightsBrandRow)
vi.stubGlobal('saveInsightsBrandRow', admin.saveInsightsBrandRow)
vi.stubGlobal('listInsightsBrandRows', admin.listInsightsBrandRows)
vi.stubGlobal('applyInsightsSlugChange', admin.applyInsightsSlugChange)
vi.stubGlobal('toInsightsBrandListItem', admin.toInsightsBrandListItem)
vi.stubGlobal('insightsKnownBrandIds', admin.insightsKnownBrandIds)
vi.stubGlobal('insightsBrandPublicationGate', review.insightsBrandPublicationGate)

const patch = (await import('../server/api/insights/brands/[id].patch'))
  .default as unknown as (event: H3Event) => Promise<InsightsBrandSavedResponse>

const event = { context: {} } as unknown as H3Event

// ── Die Bühne ──────────────────────────────────────────────────────────────

const URL_A = 'https://roesterei.example/about'
const URL_B = 'https://presse.example/roesterei'

function sourceA(overrides: Partial<InsightsSource> = {}): InsightsSource {
  return { url: URL_A, publisher: 'Rösterei GmbH', date: '2026-01-10', kind: 'brand-site', quote: 'Wir rösten seit 1990 selbst.', license: '', ...overrides }
}

function sourceB(overrides: Partial<InsightsSource> = {}): InsightsSource {
  return { url: URL_B, publisher: 'Presse', date: '2026-02-01', kind: 'press', quote: 'Die Rösterei wächst um zehn Prozent.', license: '', ...overrides }
}

function brand(overrides: Partial<InsightsBrand> = {}): InsightsBrand {
  return {
    slug: 'roesterei',
    slugHistory: [],
    name: 'Rösterei',
    homepage: 'https://roesterei.example',
    libraryKey: '',
    checkId: '',
    publicationId: '',
    industry: 'food',
    country: 'DE',
    foundedYear: 1990,
    archetype: '',
    archetypeSecondary: '',
    paletteId: '',
    marks: [{ kind: 'claim', text: 'Selbst geröstet seit 1990', sourceIndex: 0 }],
    history: [{ year: 1990, text: 'Gründung in Hamburg', sourceIndex: 0 }],
    relations: [],
    sources: [sourceA(), sourceB()],
    state: 'published',
    removedAt: '',
    removalReason: '',
    claimedBy: '',
    ...overrides,
  }
}

/** Was das Marken-Formular schickt: alles ausser den Server-Feldern. */
function editOf(current: InsightsBrand, overrides: Partial<InsightsBrandEdit> = {}): InsightsBrandEdit {
  return {
    slug: current.slug,
    name: current.name,
    homepage: current.homepage,
    libraryKey: current.libraryKey,
    checkId: current.checkId,
    publicationId: current.publicationId,
    industry: current.industry,
    country: current.country,
    foundedYear: current.foundedYear,
    archetype: current.archetype,
    archetypeSecondary: current.archetypeSecondary,
    paletteId: current.paletteId,
    marks: current.marks.map(mark => ({ ...mark })),
    history: current.history.map(entry => ({ ...entry })),
    relations: [...current.relations],
    sources: current.sources.map(source => ({ ...source })),
    state: current.state,
    removalReason: current.removalReason,
    ...overrides,
  }
}

function putBrand(current: InsightsBrand, others: { id: string, brand: InsightsBrand }[] = []): void {
  tables[INSIGHTS_BRANDS_TABLE] = [
    { $id: 'b1', $createdAt: '2026-10-01T00:00:00.000Z', $updatedAt: '2026-10-01T00:00:00.000Z', ...fromInsightsBrand(current) },
    ...others.map(other => ({ $id: other.id, $createdAt: '2026-10-01T00:00:00.000Z', $updatedAt: '2026-10-01T00:00:00.000Z', ...fromInsightsBrand(other.brand) })),
  ]
}

function storedRow(): string {
  return JSON.stringify(tables[INSIGHTS_BRANDS_TABLE]?.find(row => row.$id === 'b1') ?? null)
}

const OTHER = { id: 'b2', brand: brand({ slug: 'kaffeehaus', name: 'Kaffeehaus Nord', homepage: 'https://kaffeehaus-nord.example' }) }

beforeEach(() => {
  tables = {}
  logs = []
  body = {}
  fetchState.pages = {
    [URL_A]: 'Wir rösten seit 1990 selbst. Mehr auf der Seite.',
    [URL_B]: 'Die Rösterei wächst um zehn Prozent.',
  }
  fetchState.calls = []
  Object.values(tablesDB).forEach(fn => fn.mockClear())
})

// ── 1–2: veröffentlichen ───────────────────────────────────────────────────

describe('Entwurf → veröffentlicht läuft durch die Prüfung', () => {
  it('1 · ein Zitat, das nicht in der Quelle steht ⇒ nicht gespeichert, die Liste nennt die Quelle', async () => {
    const current = brand({ state: 'draft' })
    putBrand(current)
    const before = storedRow()
    body = editOf(current, { state: 'published', sources: [sourceA({ quote: 'Wir rösten seit 1980 selbst.' }), sourceB()] })

    const result = await patch(event)

    expect(result.saved).toBe(false)
    expect(result.issues).toContainEqual({ code: 'quote_not_grounded', at: { kind: 'source', index: 0 } })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(storedRow()).toBe(before)
    // Die Antwort trägt den Bestand, nicht die abgelehnte Eingabe.
    expect(result.brand.state).toBe('draft')
    expect(result.listItem.state).toBe('draft')
    // Ohne veröffentlichten Stand wird JEDE belegte Quelle abgerufen.
    expect(fetchState.calls.sort()).toEqual([URL_B, URL_A].sort())
  })

  it('2 · mit belegtem Zitat ⇒ gespeichert und veröffentlicht', async () => {
    const current = brand({ state: 'draft' })
    putBrand(current)
    body = editOf(current, { state: 'published' })

    const result = await patch(event)

    expect(result.saved).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.brand.state).toBe('published')
    expect(tablesDB.updateRow).toHaveBeenCalledTimes(1)
    expect(logs.some(line => line.name === 'insights.brand_state_changed')).toBe(true)
  })

  it('2b · die Quellen-Regeln ohne Abruf sind dieselben wie am Artikel (pur)', () => {
    // Herausgeber, Datum und Lizenz hält bei der Marke schon das Schema der
    // Quelle (400). Die Prüfung nennt sie trotzdem — dieselbe Funktion wie
    // am Beitrag, dieselben Codes in derselben Reihenfolge.
    const issues = insightsBrandReviewIssues(brand({
      sources: [
        sourceA({ quote: 'x'.repeat(301), publisher: '', date: '' }),
        sourceB({ kind: 'wikipedia', license: '' }),
      ],
    }))
    expect(issues).toEqual([
      { code: 'quote_too_long', at: { kind: 'source', index: 0 } },
      { code: 'source_missing_publisher', at: { kind: 'source', index: 0 } },
      { code: 'source_missing_date', at: { kind: 'source', index: 0 } },
      { code: 'source_missing_license', at: { kind: 'source', index: 1 } },
    ])
  })

  it('2c · eine nicht lesbare Quelle gilt als nicht belegt (fail-closed)', async () => {
    const current = brand({ state: 'draft' })
    putBrand(current)
    fetchState.pages = { [URL_A]: 'Wir rösten seit 1990 selbst. Mehr auf der Seite.' }
    body = editOf(current, { state: 'published' })

    const result = await patch(event)

    expect(result.saved).toBe(false)
    expect(result.issues).toContainEqual({ code: 'quote_not_grounded', at: { kind: 'source', index: 1 } })
  })
})

// ── 3–4: eine veröffentlichte Seite ändern ─────────────────────────────────

describe('Eine veröffentlichte Marken-Seite wird nur geprüft geändert', () => {
  it('3 · regelwidrig ändern ⇒ nicht gespeichert, die Zeile bleibt wie sie war', async () => {
    const current = brand()
    putBrand(current)
    const before = storedRow()
    body = editOf(current, { sources: [sourceA(), sourceB({ quote: 'Die Rösterei wächst um zwanzig Prozent.' })] })

    const result = await patch(event)

    expect(result.saved).toBe(false)
    expect(result.issues).toContainEqual({ code: 'quote_not_grounded', at: { kind: 'source', index: 1 } })
    expect(storedRow()).toBe(before)
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(result.brand.sources[1]?.quote).toBe('Die Rösterei wächst um zehn Prozent.')
  })

  it('3b · eine abgelehnte Änderung hinterlässt auch keine neue Adresse', async () => {
    const current = brand()
    putBrand(current)
    const before = storedRow()
    body = editOf(current, { slug: 'roesterei-neu', marks: [{ kind: 'claim', text: 'Billiger als alle anderen', sourceIndex: 0 }] })

    const result = await patch(event)

    expect(result.saved).toBe(false)
    expect(storedRow()).toBe(before)
    expect(result.brand.slug).toBe('roesterei')
    expect(result.brand.slugHistory).toEqual([])
  })

  it('4 · regelkonform ändern geht — und ein unveränderter Beleg wird NICHT neu abgerufen', async () => {
    const current = brand()
    putBrand(current)
    // Die fremde Seite hat sich inzwischen geändert: sie darf eine Korrektur
    // am Text nicht blockieren.
    fetchState.pages[URL_A] = 'Ganz anderer Text.'
    body = editOf(current, {
      history: [{ year: 1990, text: 'Gründung in Hamburg-Altona', sourceIndex: 0 }],
      sources: [sourceB(), sourceA()],
      marks: [{ kind: 'claim', text: 'Selbst geröstet seit 1990', sourceIndex: 1 }],
    })

    const result = await patch(event)

    expect(result.saved).toBe(true)
    expect(fetchState.calls).toEqual([])
    expect(result.brand.history[0]?.text).toBe('Gründung in Hamburg-Altona')
    expect(tablesDB.updateRow).toHaveBeenCalledTimes(1)
  })

  it('4b · EIN geänderter Beleg ⇒ genau EIN Abruf, nur dieser', async () => {
    const current = brand()
    putBrand(current)
    body = editOf(current, { sources: [sourceA({ quote: 'Mehr auf der Seite.' }), sourceB()] })

    const result = await patch(event)

    expect(result.saved).toBe(true)
    expect(fetchState.calls).toEqual([URL_A])
  })
})

// ── 5: Herabsetzung und fremde Namen ───────────────────────────────────────

describe('Der Namens- und Herabsetzungsfilter läuft über Zeichen und Historie', () => {
  it('5 · Herabsetzung in einem Zeichen-Text ⇒ blockiert, mit Stelle', async () => {
    const current = brand({ state: 'draft' })
    putBrand(current)
    body = editOf(current, { state: 'published', marks: [{ kind: 'claim', text: 'Nie überteuert, nie billig', sourceIndex: 0 }] })

    const result = await patch(event)

    expect(result.saved).toBe(false)
    expect(result.issues).toContainEqual({ code: 'disparagement', at: { kind: 'mark', index: 0 }, detail: 'disparagement' })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('5b · eine andere Marke in der Historie ⇒ blockiert; als Beziehung eingetragen ⇒ geht', async () => {
    const current = brand({ state: 'draft' })
    putBrand(current, [OTHER])
    const history = [{ year: 2001, text: 'Partnerschaft mit Kaffeehaus Nord', sourceIndex: 0 }]
    body = editOf(current, { state: 'published', history })

    const blocked = await patch(event)
    expect(blocked.saved).toBe(false)
    // Name oder Website der anderen Marke — welcher Grund zuerst greift,
    // entscheidet der Riegel im Fundament.
    expect(blocked.issues).toContainEqual({ code: 'disparagement', at: { kind: 'history', index: 0 }, detail: expect.stringMatching(/^competitor_(name|domain)$/) })

    body = editOf(current, { state: 'published', history, relations: [OTHER.id] })
    const passed = await patch(event)
    expect(passed.saved).toBe(true)
  })

  it('5c · der eigene Name sperrt nicht — auch nicht nach einer Umbenennung', async () => {
    const current = brand({ state: 'draft' })
    putBrand(current, [OTHER])
    body = editOf(current, {
      state: 'published',
      name: 'Rösterei Süd',
      marks: [{ kind: 'claim', text: 'Rösterei Süd röstet selbst', sourceIndex: 0 }],
    })

    const result = await patch(event)

    expect(result.issues).toEqual([])
    expect(result.saved).toBe(true)
  })

  it('5d · `removalReason` ist nicht öffentlich und wird nicht geprüft (pur)', () => {
    const issues = insightsBrandReviewIssues(
      brand({ state: 'removed', removalReason: 'billig', marks: [], history: [], sources: [] }),
      { flagText: text => (text.includes('billig') ? ['disparagement'] : []) },
    )
    expect(issues).toEqual([])
  })
})

// ── 6: die Auswege gehen immer ─────────────────────────────────────────────

describe('Entwurf und Entfernen hängen an keiner Regel', () => {
  const broken = { sources: [sourceA({ quote: 'Steht nirgends.' })], marks:[{ kind: 'claim' as const, text: 'Billiger Abklatsch', sourceIndex: 0 }] }

  it('6 · `removed` geht IMMER — auch mit regelwidrigem Inhalt und ohne Abruf', async () => {
    const current = brand()
    putBrand(current)
    body = editOf(current, { ...broken, state: 'removed', removalReason: 'Auf Wunsch der Marke' })

    const result = await patch(event)

    expect(result.saved).toBe(true)
    expect(result.brand.state).toBe('removed')
    expect(result.brand.removedAt).not.toBe('')
    expect(fetchState.calls).toEqual([])
  })

  it('6b · als Entwurf speichern geht — auch eine veröffentlichte Seite zurück', async () => {
    const current = brand()
    putBrand(current)
    body = editOf(current, { ...broken, state: 'draft' })

    const result = await patch(event)

    expect(result.saved).toBe(true)
    expect(result.brand.state).toBe('draft')
    expect(fetchState.calls).toEqual([])
  })
})

// ── 7: die Schreib-Funktion und ihr Zeichen ────────────────────────────────

describe('Die Schreib-Funktion verlangt für `published` ein Zeichen', () => {
  it('7a · ohne Zeichen ⇒ `gate_skipped`, nichts geschrieben, Log ohne Inhalt', async () => {
    putBrand(brand({ state: 'draft' }))
    const before = storedRow()

    await expect(admin.saveInsightsBrandRow(event, 'b1', brand())).rejects.toMatchObject({ status: 500, data: { code: 'gate_skipped' } })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(storedRow()).toBe(before)
    expect(logs.find(line => line.name === 'insights.gate_skipped')?.data).toEqual({ rowId: 'b1' })
  })

  it('7b · ein Zeichen für ein anderes Objekt, ein veränderter Stand, ein gefälschtes Zeichen — alle ungültig', async () => {
    putBrand(brand({ state: 'draft' }))
    const checked = brand()
    const verdict = await review.insightsBrandPublicationGate({ next: checked, brandRows: [], selfId: 'b1' })
    if (!verdict.passed) throw new Error('Gate sollte bestehen')

    await expect(admin.saveInsightsBrandRow(event, 'b1', structuredClone(checked), verdict.clearance))
      .rejects.toMatchObject({ data: { code: 'gate_skipped' } })
    const forged = Object.freeze({ brand: checked, kind: 'brand-gate' as const })
    await expect(admin.saveInsightsBrandRow(event, 'b1', checked, forged))
      .rejects.toMatchObject({ data: { code: 'gate_skipped' } })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()

    // Gegenprobe: dasselbe Objekt mit seinem Zeichen schreibt.
    await admin.saveInsightsBrandRow(event, 'b1', checked, verdict.clearance)
    expect(tablesDB.updateRow).toHaveBeenCalledTimes(1)

    checked.name = 'Nachträglich geändert'
    await expect(admin.saveInsightsBrandRow(event, 'b1', checked, verdict.clearance))
      .rejects.toMatchObject({ data: { code: 'gate_skipped' } })
  })

  it('7c · ein Zeichen deckt nur das geprüfte Objekt, nicht eine gleich aussehende Marke', async () => {
    const verdict = await review.insightsBrandPublicationGate({ next: brand(), brandRows: [], selfId: 'b1' })
    if (!verdict.passed) throw new Error('Gate sollte bestehen')
    expect(review.insightsBrandClearanceCovers(verdict.clearance, verdict.clearance.brand)).toBe(true)
    expect(review.insightsBrandClearanceCovers(verdict.clearance, brand())).toBe(false)
    expect(review.insightsBrandClearanceCovers(undefined, verdict.clearance.brand)).toBe(false)
  })

  it('7d · `draft` und `removed` brauchen kein Zeichen', async () => {
    putBrand(brand({ state: 'draft' }))
    await admin.saveInsightsBrandRow(event, 'b1', brand({ state: 'draft', name: 'Neu' }))
    await admin.saveInsightsBrandRow(event, 'b1', brand({ state: 'removed', removalReason: 'Wunsch', removedAt: '2026-11-17T00:00:00.000Z' }))
    expect(tablesDB.updateRow).toHaveBeenCalledTimes(2)
  })

  it('7e · eine neue Zeile wird nie veröffentlicht angelegt', async () => {
    await expect(admin.createInsightsBrandRow(event, brand())).rejects.toMatchObject({ data: { code: 'gate_skipped' } })
    expect(tablesDB.createRow).not.toHaveBeenCalled()
  })

  it('7f · ein Gate, das NICHT besteht, stellt kein Zeichen aus', async () => {
    const verdict = await review.insightsBrandPublicationGate({
      next: brand({ marks: [{ kind: 'claim', text: 'Billiger Abklatsch', sourceIndex: 0 }] }),
      brandRows: [],
      selfId: 'b1',
    })
    expect(verdict.passed).toBe(false)
    expect('clearance' in verdict).toBe(false)
  })
})
