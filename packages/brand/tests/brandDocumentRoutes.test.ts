import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { confirmableRequiredSlotsForStep } from '../shared/slotRegistry'

/**
 * DAS DOKUMENT UND DER PRÜFBLICK AN DER ROUTE (BW2 Paket 7, Plan §10).
 *
 * ── WAS HIER GEPRÜFT WIRD UND IN `brandDocument.test.ts` NICHT ───────────
 * Die reinen Regeln (Idempotenz-Schlüssel, Deckel-Auswahl) stehen dort. Hier
 * läuft, was ihnen erst Bedeutung gibt: ob übersprungene Kapitel WIRKLICH
 * fehlen, ob die Nachholung WIRKLICH bei zehn aufhört, ob der Dokument-Blick
 * WIRKLICH fünffach bucht und ob derselbe Stand WIRKLICH keinen zweiten Aufruf
 * kostet. Vier Zusagen über Geld und Schreibvorgänge, und keine davon sieht man
 * einer puren Funktion an.
 *
 * Die Doppel sind dieselben wie in `brandReviewRoutes.test.ts`: Zeilen im
 * Speicher, ein `tablesDB`-Doppel, eine Warteschlange von Modell-Antworten.
 */

const profileRow = {
  $id: 'p1',
  $createdAt: '2026-09-01T00:00:00.000Z',
  $updatedAt: '2026-09-01T00:00:00.000Z',
  createdByUserId: 'u1',
  ownerType: 'user',
  ownerId: 'u1',
  title: 'Testmarke',
  contentLocale: 'de',
  pathKind: 'new',
  hasName: true,
  team: 'solo',
  subBrands: 'no',
  progressPct: 0,
  currentStepKey: 'values',
  lastActivityAt: '2026-09-01T00:00:00.000Z',
}

interface FakeRow { $id: string, [key: string]: unknown }

let stepRows: FakeRow[]
let findingRows: FakeRow[]
let query: Record<string, string>
let aiEnabled: boolean
let findingSeq = 0

let aiQueue: unknown[]
const aiPrompts: string[] = []
const aiModels: string[] = []
/** Jeder Treffer im Drossel-Eimer — die Länge IST das Gewicht. */
const hits: string[] = []

function stepRow(stepKey: string): FakeRow {
  return stepRows.find(row => row.stepKey === stepKey)!
}

function storedSlots(stepKey: string): Record<string, Record<string, unknown>> {
  return JSON.parse(String(stepRow(stepKey).slots))
}

const tablesDB = {
  getRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    if (tableId === 'brand_profiles') return profileRow
    if (tableId === 'app_config') return { $id: 'global', brandAiEnabled: aiEnabled }
    if (tableId === 'brand_steps') {
      const row = stepRows.find(entry => entry.$id === rowId)
      if (row) return row
      throw Object.assign(new Error('not found'), { code: 404 })
    }
    throw new Error(`unerwartete Tabelle ${tableId}`)
  }),
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries?: unknown[] }) => {
    if (tableId === 'brand_steps') return { rows: stepRows }
    if (tableId === 'brand_messages') return { rows: [] }
    if (tableId === 'brand_findings') {
      const wanted = new Map<string, unknown>()
      for (const entry of (queries ?? []) as string[]) {
        try {
          const parsed = JSON.parse(entry) as { method?: string, attribute?: string, values?: unknown[] }
          if (parsed.method === 'equal' && parsed.attribute) wanted.set(parsed.attribute, parsed.values?.[0])
        }
        catch { /* Query.limit & Co. */ }
      }
      return {
        rows: findingRows.filter(row =>
          [...wanted].every(([attribute, value]) => row[attribute] === value)),
      }
    }
    return { rows: [] }
  }),
  updateRow: vi.fn(async ({ tableId, rowId, data }: {
    tableId: string
    rowId: string
    data: Record<string, unknown>
  }) => {
    const table = tableId === 'brand_findings' ? findingRows : stepRows
    const row = table.find(entry => entry.$id === rowId)
    if (row) Object.assign(row, data)
    return row ?? { $id: rowId }
  }),
  createRow: vi.fn(async ({ tableId, data }: { tableId: string, data: Record<string, unknown> }) => {
    if (tableId === 'brand_findings') {
      const row: FakeRow = { $id: `f${++findingSeq}`, $createdAt: '2026-09-05T00:00:00.000Z', ...data }
      findingRows.push(row)
      return row
    }
    return { $id: 'x1' }
  }),
  deleteRow: vi.fn(async ({ rowId }: { rowId: string }) => ({ $id: rowId })),
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('useAppConfig', () => ({
  pukalani: { brand: { devStubGenerator: false, ai: { reviewModel: 'cheap/model' } } },
}))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('toH3Error', (error: unknown) => error)
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('requireBrandAccess', async () => ({ userId: 'u1' }))
vi.stubGlobal('assertBrandOwnerAccess', () => {})
vi.stubGlobal('getRouterParam', (_event: H3Event, name: string) => (name === 'id' ? 'p1' : ''))
vi.stubGlobal('getQuery', () => query)
vi.stubGlobal('setHeader', () => {})
vi.stubGlobal('useRateLimitStore', () => ({
  prefix: 'rl:test:',
  store: {
    hit: async (key: string) => {
      hits.push(key.replace('rl:test:', ''))
      return { count: 1, resetInMs: 3_600_000 }
    },
  },
}))
vi.stubGlobal('getEffectiveAiConfig', async () => ({
  enabled: true,
  model: 'george/model',
  baseUrl: '',
  defaultModel: 'george/model',
}))
vi.stubGlobal('aiCompleteJson', async (_event: H3Event, prompt: string, options: { model?: string }) => {
  aiPrompts.push(prompt)
  aiModels.push(options.model ?? '')
  const next = aiQueue.shift()
  if (next instanceof Error) throw next
  return next
})

const documentRoute = (await import('../server/api/brand/profiles/[id]/document.get'))
  .default as unknown as (event: H3Event) => Promise<Record<string, unknown>>
const reviewRoute = (await import('../server/api/brand/profiles/[id]/review.post'))
  .default as unknown as (event: H3Event) => Promise<Record<string, unknown>>
const { clearBrandDocumentReviews } = await import('../server/utils/brandReview')

const event = { context: {} } as unknown as H3Event

interface DocumentChapter {
  stepKey: string
  storedState: string
  revision: number
  acceptance: { accepted: number, total: number }
  sessions: { slotId: string, value: string, confirmed: boolean }[]
}
interface DocumentResponse {
  chapters: DocumentChapter[]
  findings: unknown[]
  review: { unreviewed: string[], lastRunAt?: string }
}
interface ReviewResponse {
  ran: boolean
  caughtUp: string[]
  stillUnreviewed: string[]
  findings: { kind: string, slots: string[] }[]
  reviewedBy: string | null
  revisionKey: string
}

/** Alle Pflicht-Slots eines Kapitels bestätigt — optional schon gegengelesen. */
function confirmedSlots(stepKey: string, reviewed = false): Record<string, unknown> {
  return Object.fromEntries(confirmableRequiredSlotsForStep(stepKey as 'values')
    .map(slot => [slot.id, { confirmed: 'steht', ...(reviewed ? { reviewed: true } : {}) }]))
}

function makeStep(stepKey: string, extra: Record<string, unknown> = {}): FakeRow {
  return {
    $id: `p1_${stepKey}`,
    profileId: 'p1',
    stepKey,
    state: 'open',
    slots: '{}',
    generations: '{"items":[],"count":0}',
    revision: 2,
    activeSeconds: 0,
    ...extra,
  }
}

function answer(overrides: Record<string, unknown> = {}) {
  return {
    goalReached: true,
    missing: [],
    notes: ['Eine Notiz.'],
    findings: [],
    nextSession: null,
    ...overrides,
  }
}

const CONFLICT = { kind: 'conflict', slots: ['c.final', 'b.purpose'], why: 'reibt sich' }

beforeEach(() => {
  query = {}
  aiEnabled = true
  aiQueue = []
  aiPrompts.length = 0
  aiModels.length = 0
  hits.length = 0
  findingRows = []
  findingSeq = 0
  clearBrandDocumentReviews()
  stepRows = [
    makeStep('context', { state: 'done', slots: JSON.stringify(confirmedSlots('context', true)) }),
    makeStep('pvm', { state: 'done', slots: JSON.stringify(confirmedSlots('pvm', true)) }),
    makeStep('architecture'),
    makeStep('values', { state: 'active', slots: JSON.stringify(confirmedSlots('values')) }),
    makeStep('archetype'),
    makeStep('manifesto'),
    makeStep('verbal'),
    makeStep('naming'),
    makeStep('result'),
  ]
  tablesDB.updateRow.mockClear()
  tablesDB.createRow.mockClear()
})

describe('GET …/document — was die Seite zeigt', () => {
  it('liefert die Kapitel des WEGES in Registry-Reihenfolge', async () => {
    const result = await documentRoute(event) as unknown as DocumentResponse
    expect(result.chapters.map(chapter => chapter.stepKey)).toEqual([
      'context', 'pvm', 'values', 'archetype', 'manifesto', 'verbal', 'result',
    ])
  })

  it('ÜBERSPRUNGENE Kapitel fehlen — `architecture` (subBrands: no) und `naming`', async () => {
    const result = await documentRoute(event) as unknown as DocumentResponse
    const keys = result.chapters.map(chapter => chapter.stepKey)
    expect(keys).not.toContain('architecture')
    expect(keys).not.toContain('naming')
  })

  it('je Kapitel dieselben Blöcke wie die Abnahme — mit Wert, Zähler und Revision', async () => {
    const result = await documentRoute(event) as unknown as DocumentResponse
    const values = result.chapters.find(chapter => chapter.stepKey === 'values')!
    expect(values.revision).toBe(2)
    expect(values.storedState).toBe('active')
    expect(values.acceptance.total).toBeGreaterThan(0)
    const confirmed = values.sessions.filter(session => session.confirmed)
    expect(confirmed.length).toBeGreaterThan(0)
    expect(confirmed[0]!.value).toBe('steht')
  })

  it('`unreviewed` nennt die bestätigten Sessions OHNE Urteil, in Registry-Reihenfolge', async () => {
    const result = await documentRoute(event) as unknown as DocumentResponse
    const expected = confirmableRequiredSlotsForStep('values').map(slot => slot.id)
    expect(result.review.unreviewed).toEqual(expected)
  })

  it('GEGENPROBE: eine gegengelesene Session steht NICHT darin', async () => {
    stepRow('values').slots = JSON.stringify(confirmedSlots('values', true))
    const result = await documentRoute(event) as unknown as DocumentResponse
    expect(result.review.unreviewed).toEqual([])
  })

  it('ruft NICHTS an — der Prüfblick ist eine eigene Route (§16)', async () => {
    await documentRoute(event)
    expect(aiPrompts).toHaveLength(0)
    expect(hits).toHaveLength(0)
  })
})

describe('POST …/review — der Prüfblick (§10)', () => {
  it('holt die ungeprüften Sessions nach und prüft danach das Dokument', async () => {
    const unreviewed = confirmableRequiredSlotsForStep('values').length
    aiQueue = Array.from({ length: unreviewed + 1 }, () => answer())

    const result = await reviewRoute(event) as unknown as ReviewResponse
    expect(result.ran).toBe(true)
    expect(result.caughtUp).toHaveLength(unreviewed)
    expect(result.stillUnreviewed).toEqual([])
    // Die Marke steht an der Zeile — und die Kapitel-Zeile wurde EINMAL
    // geschrieben, nicht je Session.
    const slots = storedSlots('values')
    expect(Object.values(slots).every(record => record.reviewed === true)).toBe(true)
    expect(stepRow('values').revision).toBe(3)
  })

  it('der DOKUMENT-Aufruf ist der letzte und trägt die Aufgabe des Prüfblicks', async () => {
    aiQueue = Array.from({ length: 20 }, () => answer())
    await reviewRoute(event)
    const last = aiPrompts.at(-1) ?? ''
    expect(last).toContain('reading the WHOLE brand foundation at once')
    expect(last).toContain('Only "findings" carries content in this mode')
    // Der Dokument-Blick nennt die Werte GENAU EINMAL (kein doppelter Block).
    expect(last).toContain('every chapter, in the order it was built')
    expect(last).not.toContain('the confirmed values of chapter')
  })

  it('bucht 1 je Nachholung und 5 für den Dokument-Blick (§13)', async () => {
    const unreviewed = confirmableRequiredSlotsForStep('values').length
    aiQueue = Array.from({ length: unreviewed + 1 }, () => answer())
    await reviewRoute(event)
    const booked = hits.filter(key => key.startsWith('brand-ai-review-day:'))
    expect(booked).toHaveLength(unreviewed + 5)
    // Weder Gesprächs- noch Slot-Eimer werden angefasst.
    expect(hits.some(key => key.startsWith('brand-ai-talk-day:'))).toBe(false)
    expect(hits.some(key => key.startsWith('brand-ai-slot-day:'))).toBe(false)
  })

  it('DECKEL: höchstens zehn Nachholungen, der Rest wird gemeldet', async () => {
    // Zwei volle Kapitel ohne Urteil — zusammen mehr als zehn Sessions.
    stepRow('context').slots = JSON.stringify(confirmedSlots('context'))
    stepRow('values').slots = JSON.stringify(confirmedSlots('values'))
    aiQueue = Array.from({ length: 30 }, () => answer())

    const result = await reviewRoute(event) as unknown as ReviewResponse
    expect(result.caughtUp).toHaveLength(10)
    expect(result.stillUnreviewed.length).toBeGreaterThan(0)
    // Die ERSTEN zehn in Registry-Reihenfolge: Kapitel A steht vor Kapitel C.
    expect(result.caughtUp[0]).toBe(confirmableRequiredSlotsForStep('context')[0]!.id)
    // Zehn Nachholungen (je 1) plus der Dokument-Blick (5).
    expect(hits.filter(key => key.startsWith('brand-ai-review-day:'))).toHaveLength(15)
  })

  it('IDEMPOTENT: derselbe Stand läuft kein zweites Mal', async () => {
    aiQueue = Array.from({ length: 20 }, () => answer())
    const first = await reviewRoute(event) as unknown as ReviewResponse
    const calls = aiPrompts.length
    expect(first.ran).toBe(true)

    const again = await reviewRoute(event) as unknown as ReviewResponse
    expect(again.ran).toBe(false)
    expect(aiPrompts).toHaveLength(calls)
    // Die Auskunft bleibt vollständig — der Riegel spart den Aufruf, nicht sie.
    expect(again.caughtUp).toEqual(first.caughtUp)
    expect(again.revisionKey).toBe(first.revisionKey)
  })

  it('GEGENPROBE: bewegt sich eine Kapitel-Revision, läuft er wieder', async () => {
    aiQueue = Array.from({ length: 20 }, () => answer())
    await reviewRoute(event)
    const calls = aiPrompts.length

    stepRow('archetype').revision = 7
    aiQueue = Array.from({ length: 20 }, () => answer())
    const again = await reviewRoute(event) as unknown as ReviewResponse
    expect(again.ran).toBe(true)
    expect(aiPrompts.length).toBeGreaterThan(calls)
  })

  it('schreibt einen Dokument-Befund an das Kapitel SEINES Feldes', async () => {
    stepRow('values').slots = JSON.stringify(confirmedSlots('values', true))
    aiQueue = [answer({ findings: [CONFLICT] }), answer({ findings: [CONFLICT] })]

    const result = await reviewRoute(event) as unknown as ReviewResponse
    expect(result.reviewedBy).toBe('stage2')
    expect(findingRows).toHaveLength(1)
    // `c.final` wohnt in `values` — der Stempel folgt dem Feld, nicht dem Lauf.
    expect(findingRows[0]!.stepKey).toBe('values')
    expect(findingRows[0]!.sourceSession).toBe('c.final')
  })

  it('DEDUP: ein schon offener Befund erzeugt keine zweite Zeile', async () => {
    stepRow('values').slots = JSON.stringify(confirmedSlots('values', true))
    findingRows.push({
      $id: 'f0',
      $createdAt: '2026-09-04T00:00:00.000Z',
      profileId: 'p1',
      stepKey: 'values',
      kind: 'conflict',
      slots: JSON.stringify(['b.purpose', 'c.final']),
      why: 'schon gemeldet',
      status: 'open',
      sourceSession: 'c.final',
    })
    aiQueue = [answer({ findings: [CONFLICT] }), answer({ findings: [CONFLICT] })]
    await reviewRoute(event)
    expect(findingRows).toHaveLength(1)
  })

  it('FAIL-SOFT: eine gescheiterte Nachholung bleibt ungeprüft und schreibt nichts', async () => {
    stepRow('context').slots = JSON.stringify(confirmedSlots('context', true))
    stepRow('pvm').slots = JSON.stringify(confirmedSlots('pvm', true))
    // Erste Nachholung scheitert, die zweite geht durch, danach das Dokument.
    aiQueue = [new Error('provider down'), ...Array.from({ length: 20 }, () => answer())]

    const result = await reviewRoute(event) as unknown as ReviewResponse
    const first = confirmableRequiredSlotsForStep('values')[0]!.id
    expect(result.stillUnreviewed).toContain(first)
    expect(storedSlots('values')[first]!.reviewed).toBeUndefined()
    // Der Prüfblick läuft trotzdem — eine Zugabe sperrt nichts.
    expect(result.ran).toBe(true)
  })

  it('FAIL-SOFT: ausgeschaltete KI ruft gar nicht erst an', async () => {
    aiEnabled = false
    const result = await reviewRoute(event) as unknown as ReviewResponse
    expect(aiPrompts).toHaveLength(0)
    expect(hits).toHaveLength(0)
    expect(result.reviewedBy).toBeNull()
    expect(result.caughtUp).toEqual([])
    expect(result.stillUnreviewed.length).toBeGreaterThan(0)
  })

  it('meldet danach den letzten Lauf an der Leseroute', async () => {
    aiQueue = Array.from({ length: 20 }, () => answer())
    const run = await reviewRoute(event) as unknown as ReviewResponse
    const page = await documentRoute(event) as unknown as DocumentResponse
    expect(page.review.lastRunAt).toBeTruthy()
    expect(run.revisionKey).toHaveLength(64)
  })
})
