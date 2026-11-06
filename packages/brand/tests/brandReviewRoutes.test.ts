import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { confirmableRequiredSlotsForStep } from '../shared/slotRegistry'

/**
 * DER SPEZIALIST AN DER ROUTE (BW2 Paket 4, Plan §7/§8) — schliessen, prüfen,
 * entscheiden.
 *
 * ── WARUM DAS HIER UND NICHT NUR PUR GEPRÜFT WIRD ─────────────────────────
 * Die reinen Regeln (Schema, Dedup-Schlüssel, Zweistufigkeit, adaptive Wahl)
 * stehen in `brandFindings.test.ts`. Hier läuft, was ihnen erst Bedeutung gibt:
 * ob fail-soft WIRKLICH nichts schreibt, ob ein zweiter Klick WIRKLICH nichts
 * kostet, ob der Ablehnungs-Grund WIRKLICH an der Quell-Session landet und ob
 * ein offener Konflikt WIRKLICH die Abnahme sperrt. Das sind vier Zusagen über
 * Schreibvorgänge, und keine davon sieht man einer puren Funktion an.
 *
 * Die Doppel sind dieselben wie in `brandAcceptanceRoutes.test.ts`: Zeilen im
 * Speicher, ein `tablesDB`-Doppel, sonst nichts — plus ein `aiCompleteJson`,
 * das eine Warteschlange von Antworten abarbeitet, damit die Zweistufigkeit
 * ohne Anbieter prüfbar ist.
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
let body: Record<string, unknown>
let query: Record<string, string>
let routeStepKey: string
let routeSlotId: string
let routeFindingId: string
let aiEnabled: boolean
let findingSeq = 0

/** Die Antworten des „Modells", in der Reihenfolge, in der sie geholt werden. */
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
    if (tableId === 'brand_findings') {
      const row = findingRows.find(entry => entry.$id === rowId)
      if (row) return row
      throw Object.assign(new Error('not found'), { code: 404 })
    }
    throw new Error(`unerwartete Tabelle ${tableId}`)
  }),
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries?: unknown[] }) => {
    if (tableId === 'brand_steps') return { rows: stepRows }
    if (tableId === 'brand_findings') {
      // Appwrite-Queries sind JSON-Zeichenketten — gelesen wird, was wirklich
      // drinsteht, nicht ein Muster über der Serialisierung des Arrays.
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
  deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    if (tableId === 'brand_findings') {
      findingRows = findingRows.filter(row => row.$id !== rowId)
    }
    return { $id: rowId }
  }),
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
vi.stubGlobal('getRouterParam', (_event: H3Event, name: string) => {
  if (name === 'id') return 'p1'
  if (name === 'stepKey') return routeStepKey
  if (name === 'findingId') return routeFindingId
  return routeSlotId
})
vi.stubGlobal('getQuery', () => query)
vi.stubGlobal('readValidatedBody', async (_event: H3Event, parse: (value: unknown) => unknown) => parse(body))
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

const close = (await import(
  '../server/api/brand/profiles/[id]/steps/[stepKey]/sessions/[slotId]/close.post'
)).default as unknown as (event: H3Event) => Promise<Record<string, unknown>>
const chapterReview = (await import('../server/api/brand/profiles/[id]/steps/[stepKey]/review.post'))
  .default as unknown as (event: H3Event) => Promise<Record<string, unknown>>
const listFindings = (await import('../server/api/brand/profiles/[id]/findings.get'))
  .default as unknown as (event: H3Event) => Promise<Record<string, unknown>>
const decideFinding = (await import('../server/api/brand/profiles/[id]/findings/[findingId].post'))
  .default as unknown as (event: H3Event) => Promise<Record<string, unknown>>
const acceptance = (await import('../server/api/brand/profiles/[id]/steps/[stepKey]/acceptance.get'))
  .default as unknown as (event: H3Event) => Promise<Record<string, unknown>>
const complete = (await import('../server/api/brand/profiles/[id]/steps/[stepKey]/complete.post'))
  .default as unknown as (event: H3Event) => Promise<Record<string, unknown>>
const { clearBrandChapterReviews } = await import('../server/utils/brandReview')

const event = { context: {} } as unknown as H3Event

function confirmedSlots(stepKey: string, accepted = false): Record<string, unknown> {
  return Object.fromEntries(confirmableRequiredSlotsForStep(stepKey as 'values')
    .map(slot => [slot.id, { confirmed: 'steht', ...(accepted ? { accepted: true } : {}) }]))
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

/** Eine vollständige Antwort des Modells — der Normalfall ohne Befund. */
function answer(overrides: Record<string, unknown> = {}) {
  return {
    goalReached: true,
    missing: [],
    notes: ['Sie erzählen gern über den Vater.'],
    findings: [],
    nextSession: null,
    ...overrides,
  }
}

const CONFLICT = { kind: 'conflict', slots: ['c.final', 'b.purpose'], why: 'reibt sich' }

beforeEach(() => {
  routeStepKey = 'values'
  routeSlotId = 'c.final'
  routeFindingId = ''
  query = {}
  aiEnabled = true
  aiQueue = []
  aiPrompts.length = 0
  aiModels.length = 0
  hits.length = 0
  findingRows = []
  findingSeq = 0
  clearBrandChapterReviews()
  stepRows = [
    makeStep('context', { state: 'done' }),
    makeStep('pvm', { state: 'done' }),
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

describe('POST …/sessions/:id/close — der Schliess-Aufruf', () => {
  it('weist eine UNBESTÄTIGTE Session mit 409 not_confirmed ab', async () => {
    stepRow('values').slots = '{}'
    body = { revision: 2 }
    await expect(close(event)).rejects.toMatchObject({ status: 409, data: { code: 'not_confirmed' } })
    expect(aiPrompts).toHaveLength(0)
  })

  it('weist eine veraltete `revision` mit 409 ab — VOR jedem Aufruf', async () => {
    body = { revision: 1 }
    await expect(close(event)).rejects.toMatchObject({ status: 409, data: { code: 'revision_conflict' } })
    expect(aiPrompts).toHaveLength(0)
  })

  it('schreibt Urteil, Notizen und Befunde — und erhöht die revision', async () => {
    aiQueue = [answer({ goalReached: false, missing: ['nennt keinen Moment'] })]
    body = { revision: 2 }
    const result = await close(event)

    expect(result.reviewed).toBe(true)
    expect(result.reviewedBy).toBe('stage1')
    expect(result.revision).toBe(3)
    const record = storedSlots('values')['c.final']!
    expect(record.reviewed).toBe(true)
    expect(record.notes).toBe('Sie erzählen gern über den Vater.')
    expect((record.review as Record<string, unknown>).goalReached).toBe(false)
    // Ein NICHT erreichtes Ziel darf George einmal aussprechen (§7).
    expect(record.briefDelivered).toBe(false)
  })

  it('`goalReached: false` sperrt NICHTS — der bestätigte Wert bleibt stehen', async () => {
    aiQueue = [answer({ goalReached: false, missing: ['zu allgemein'] })]
    body = { revision: 2 }
    const result = await close(event)
    expect(result.reviewed).toBe(true)
    expect(storedSlots('values')['c.final']!.confirmed).toBe('steht')
  })

  it('ist idempotent: der zweite Klick kostet keinen Aufruf', async () => {
    aiQueue = [answer()]
    body = { revision: 2 }
    await close(event)
    expect(aiPrompts).toHaveLength(1)

    body = { revision: 3 }
    const again = await close(event)
    expect(aiPrompts).toHaveLength(1)
    expect(again.reviewed).toBe(true)
    expect(again.revision).toBe(3)
  })

  it('`force` prüft trotzdem neu', async () => {
    aiQueue = [answer(), answer()]
    body = { revision: 2 }
    await close(event)
    body = { revision: 3, force: true }
    await close(event)
    expect(aiPrompts).toHaveLength(2)
  })

  it('FAIL-SOFT: ein Schema-Fehler schreibt NICHTS und meldet reviewed:false', async () => {
    aiQueue = [{ notes: 'kein Array' }]
    body = { revision: 2 }
    const result = await close(event)

    expect(result.reviewed).toBe(false)
    expect(result.reviewedBy).toBeNull()
    expect(result.revision).toBe(2)
    expect(storedSlots('values')['c.final']!.reviewed).toBeUndefined()
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('FAIL-SOFT: ein Anbieter-Fehler ebenso', async () => {
    aiQueue = [new Error('provider down')]
    body = { revision: 2 }
    const result = await close(event)
    expect(result.reviewed).toBe(false)
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('FAIL-SOFT: ausgeschaltete KI ruft gar nicht erst an', async () => {
    aiEnabled = false
    body = { revision: 2 }
    const result = await close(event)
    expect(result.reviewed).toBe(false)
    expect(aiPrompts).toHaveLength(0)
    expect(hits).toHaveLength(0)
  })
})

describe('Die zwei Stufen (§7, Davids Entscheidung)', () => {
  it('läuft NICHT, wenn Stufe 1 nichts Teures meldet', async () => {
    aiQueue = [answer()]
    body = { revision: 2 }
    const result = await close(event)
    expect(aiModels).toEqual(['cheap/model'])
    expect(result.reviewedBy).toBe('stage1')
  })

  it('läuft bei einem Konflikt — mit dem George-Modell und der Hypothese', async () => {
    aiQueue = [
      answer({ findings: [CONFLICT], notes: ['Notiz aus Stufe 1'] }),
      answer({ findings: [{ ...CONFLICT, why: 'geschärft' }], notes: ['Notiz aus Stufe 2'] }),
    ]
    body = { revision: 2 }
    const result = await close(event)

    expect(aiModels).toEqual(['cheap/model', 'george/model'])
    expect(aiPrompts[1]).toMatch(/HYPOTHESIS/)
    expect(result.reviewedBy).toBe('stage2')
    // Die BEFUNDE kommen von Stufe 2 …
    expect(findingRows[0]!.why).toBe('geschärft')
    // … die NOTIZEN bleiben von Stufe 1 (§7).
    expect(storedSlots('values')['c.final']!.notes).toBe('Notiz aus Stufe 1')
  })

  it('Stufe 2 darf STREICHEN — dann bleibt kein Befund übrig', async () => {
    aiQueue = [answer({ findings: [CONFLICT] }), answer({ findings: [] })]
    body = { revision: 2 }
    const result = await close(event)
    expect(result.reviewedBy).toBe('stage2')
    expect(findingRows).toHaveLength(0)
  })

  it('scheitert Stufe 2, gilt Stufe 1 mit reviewedBy stage1', async () => {
    aiQueue = [answer({ findings: [CONFLICT] }), new Error('stage 2 down')]
    body = { revision: 2 }
    const result = await close(event)
    expect(result.reviewedBy).toBe('stage1')
    expect(findingRows).toHaveLength(1)
    expect(findingRows[0]!.why).toBe('reibt sich')
  })

  it('bucht auf den EIGENEN Eimer — Stufe 1 einmal, Stufe 2 dreimal', async () => {
    aiQueue = [answer({ findings: [CONFLICT] }), answer({ findings: [CONFLICT] })]
    body = { revision: 2 }
    await close(event)

    const review = hits.filter(key => key.startsWith('brand-ai-review-day:'))
    expect(review).toHaveLength(4)
    // Weder Gesprächs- noch Slot-Eimer werden angefasst.
    expect(hits.some(key => key.startsWith('brand-ai-talk-day:'))).toBe(false)
    expect(hits.some(key => key.startsWith('brand-ai-slot-day:'))).toBe(false)
  })
})

describe('Die Befund-Dedup', () => {
  it('legt denselben Befund kein zweites Mal an', async () => {
    aiQueue = [answer({ findings: [CONFLICT] }), answer({ findings: [CONFLICT] })]
    body = { revision: 2 }
    await close(event)
    expect(findingRows).toHaveLength(1)

    // Stufe 2 lief bereits; ein zweiter Schliess-Aufruf mit `force`.
    aiQueue = [answer({ findings: [{ ...CONFLICT, slots: ['b.purpose', 'c.final'], why: 'anders gesagt' }] }),
      answer({ findings: [{ ...CONFLICT, slots: ['b.purpose', 'c.final'], why: 'anders gesagt' }] })]
    body = { revision: 3, force: true }
    await close(event)
    expect(findingRows).toHaveLength(1)
    expect(findingRows[0]!.why).toBe('reibt sich')
  })

  it('ein ANGENOMMENER Befund blockiert keine neue Zeile — seine Korrektur hat das Feld verändert', async () => {
    findingRows.push({
      $id: 'f0',
      $createdAt: '2026-09-04T00:00:00.000Z',
      profileId: 'p1',
      stepKey: 'values',
      kind: 'conflict',
      slots: JSON.stringify(['b.purpose', 'c.final']),
      why: 'alt',
      status: 'accepted',
      sourceSession: 'c.final',
    })
    aiQueue = [answer({ findings: [CONFLICT] }), answer({ findings: [CONFLICT] })]
    body = { revision: 2 }
    await close(event)
    expect(findingRows).toHaveLength(2)
  })

  it('ein ABGELEHNTER Befund kommt NICHT wieder — die Entscheidung des Menschen gilt (Kailua, 2026-09-08)', async () => {
    // Vorher blockierten nur OFFENE Befunde die Dedup: ein mit Grund abgelehnter
    // Konflikt kam beim nächsten Blick als neue offene Zeile zurück, und das
    // Kapitel liess sich nie abnehmen.
    findingRows.push({
      $id: 'f0',
      $createdAt: '2026-09-04T00:00:00.000Z',
      profileId: 'p1',
      stepKey: 'values',
      kind: 'conflict',
      slots: JSON.stringify(['b.purpose', 'c.final']),
      why: 'alt',
      status: 'dismissed',
      dismissReason: 'Das ist Absicht.',
      sourceSession: 'c.final',
    })
    aiQueue = [answer({ findings: [CONFLICT] }), answer({ findings: [CONFLICT] })]
    body = { revision: 2 }
    await close(event)
    expect(findingRows).toHaveLength(1)
    expect(findingRows[0]!.status).toBe('dismissed')
  })
})

describe('Der Wegweiser (§6)', () => {
  /** Kapitel `values` mit nur zwei bestätigten Feldern — mehrere offene Sessions. */
  function partialValues(): void {
    stepRow('values').slots = JSON.stringify({
      'c.discovery1': { confirmed: 'steht' },
      'c.discovery2': { confirmed: 'steht' },
    })
    routeSlotId = 'c.discovery2'
  }

  it('folgt dem Vorschlag des Spezialisten', async () => {
    partialValues()
    aiQueue = [answer({ nextSession: 'c.discovery3' })]
    body = { revision: 2 }
    const result = await close(event)
    expect(result.next).toEqual({ stepKey: 'values', sessionKey: 'c.discovery3' })
  })

  it('GEGENPROBE: ein Vorschlag auf eine GESPERRTE Session fällt auf die Grundfassung', async () => {
    partialValues()
    // `c.candidates` liest sieben bestätigte Felder — hier stehen zwei.
    aiQueue = [answer({ nextSession: 'c.candidates' })]
    body = { revision: 2 }
    const result = await close(event)
    expect(result.next).toEqual({ stepKey: 'values', sessionKey: 'c.discovery3' })
  })

  it('GEGENPROBE: ein Vorschlag aus einem FREMDEN Kapitel ebenso', async () => {
    partialValues()
    aiQueue = [answer({ nextSession: 'b.purpose' })]
    body = { revision: 2 }
    const result = await close(event)
    expect(result.next).toEqual({ stepKey: 'values', sessionKey: 'c.discovery3' })
  })

  it('ohne Vorschlag gilt die Grundfassung', async () => {
    partialValues()
    aiQueue = [answer()]
    body = { revision: 2 }
    const result = await close(event)
    expect(result.next).toEqual({ stepKey: 'values', sessionKey: 'c.discovery3' })
  })
})

describe('POST …/review — der Kapitel-Modus (§5a)', () => {
  it('prüft das Kapitel und schreibt Befunde', async () => {
    aiQueue = [answer({ findings: [CONFLICT] }), answer({ findings: [CONFLICT] })]
    body = { revision: 2 }
    const result = await chapterReview(event)

    expect(result.reviewed).toBe(true)
    expect((result.findings as unknown[])).toHaveLength(1)
    expect(aiPrompts[0]).toMatch(/Only "findings" carries content in this mode/)
    // Gewicht 2 für Stufe 1 plus 3 für Stufe 2.
    expect(hits.filter(key => key.startsWith('brand-ai-review-day:'))).toHaveLength(5)
  })

  it('ist idempotent je Fassung: der zweite Blick kostet nichts', async () => {
    aiQueue = [answer({ findings: [] })]
    body = { revision: 2 }
    await chapterReview(event)
    expect(aiPrompts).toHaveLength(1)

    const again = await chapterReview(event)
    expect(aiPrompts).toHaveLength(1)
    expect(again.reviewed).toBe(true)
  })

  it('eine NEUE Fassung wird wieder geprüft', async () => {
    aiQueue = [answer({ findings: [] }), answer({ findings: [] })]
    body = { revision: 2 }
    await chapterReview(event)
    stepRow('values').revision = 3
    body = { revision: 3 }
    await chapterReview(event)
    expect(aiPrompts).toHaveLength(2)
  })

  it('FAIL-SOFT: die Seite bekommt trotzdem ihre Befunde aus der Tabelle', async () => {
    findingRows.push({
      $id: 'f0',
      $createdAt: '2026-09-04T00:00:00.000Z',
      profileId: 'p1',
      stepKey: 'values',
      kind: 'gap',
      slots: JSON.stringify(['c.final']),
      why: 'fehlt',
      status: 'open',
      sourceSession: 'c.final',
    })
    aiQueue = [new Error('down')]
    body = { revision: 2 }
    const result = await chapterReview(event)
    expect(result.reviewed).toBe(false)
    expect((result.findings as unknown[])).toHaveLength(1)
  })
})

describe('Ein offener Konflikt sperrt die Abnahme (§5a Schritt 3)', () => {
  beforeEach(() => {
    stepRow('values').slots = JSON.stringify(confirmedSlots('values', true))
    findingRows.push({
      $id: 'f1',
      $createdAt: '2026-09-04T00:00:00.000Z',
      profileId: 'p1',
      stepKey: 'values',
      kind: 'conflict',
      slots: JSON.stringify(['c.final', 'b.purpose']),
      why: 'reibt sich',
      status: 'open',
      sourceSession: 'c.final',
    })
  })

  it('die Abnahme-Seite ist NICHT bereit und nennt den Grund', async () => {
    const page = await acceptance(event) as {
      acceptance: { ready: boolean, blockers: { slotId: string, reason: string }[] }
      sessions: { slotId: string, findings: unknown[] }[]
    }
    expect(page.acceptance.ready).toBe(false)
    expect(page.acceptance.blockers).toContainEqual({ slotId: 'c.final', reason: 'conflict' })
    // Der Chip-Datensatz hängt am Block (Paket 5 rendert ihn).
    expect(page.sessions.find(entry => entry.slotId === 'c.final')!.findings).toHaveLength(1)
  })

  it('`complete` weist mit `acceptance_incomplete` ab', async () => {
    body = { confidence: 'fits' }
    await expect(complete(event)).rejects.toMatchObject({
      status: 400,
      data: { code: 'acceptance_incomplete' },
    })
  })

  it('nach dem ABLEHNEN ist die Abnahme wieder bereit', async () => {
    routeFindingId = 'f1'
    body = { status: 'dismissed', dismissReason: 'Das ist Absicht.' }
    await decideFinding(event)

    const page = await acceptance(event) as { acceptance: { ready: boolean } }
    expect(page.acceptance.ready).toBe(true)

    body = { confidence: 'fits' }
    await expect(complete(event)).resolves.toMatchObject({ storedState: 'done' })
  })

  it('das ANNEHMEN öffnet sie ebenso — entschieden ist entschieden', async () => {
    routeFindingId = 'f1'
    body = { status: 'accepted' }
    await decideFinding(event)
    const page = await acceptance(event) as { acceptance: { ready: boolean } }
    expect(page.acceptance.ready).toBe(true)
  })
})

describe('POST …/findings/:id — die Entscheidung (§8)', () => {
  beforeEach(() => {
    findingRows.push({
      $id: 'f1',
      $createdAt: '2026-09-04T00:00:00.000Z',
      profileId: 'p1',
      stepKey: 'values',
      kind: 'conflict',
      slots: JSON.stringify(['c.final', 'b.purpose']),
      why: 'reibt sich',
      status: 'open',
      sourceSession: 'c.final',
    })
    routeFindingId = 'f1'
  })

  it('„ablehnen" VERLANGT einen Grund', async () => {
    body = { status: 'dismissed' }
    await expect(decideFinding(event)).rejects.toBeTruthy()
    body = { status: 'dismissed', dismissReason: 'ok' }
    await expect(decideFinding(event)).rejects.toBeTruthy()
    expect(findingRows[0]!.status).toBe('open')
  })

  it('hängt den Grund als NOTIZ an die Quell-Session und meldet die neue revision', async () => {
    body = { status: 'dismissed', dismissReason: 'Das ist bei uns Absicht.' }
    const result = await decideFinding(event) as { revision: number, finding: { status: string } }

    expect(result.finding.status).toBe('dismissed')
    expect(storedSlots('values')['c.final']!.notes).toBe('Das ist bei uns Absicht.')
    expect(result.revision).toBe(3)
  })

  it('hängt AN, statt zu ersetzen', async () => {
    stepRow('values').slots = JSON.stringify({
      ...confirmedSlots('values'),
      'c.final': { confirmed: 'steht', notes: 'Aus dem Schliess-Aufruf.' },
    })
    body = { status: 'dismissed', dismissReason: 'Absicht.' }
    await decideFinding(event)
    expect(storedSlots('values')['c.final']!.notes).toBe('Aus dem Schliess-Aufruf.\nAbsicht.')
  })

  it('„annehmen" schreibt keinen Grund', async () => {
    body = { status: 'accepted' }
    await decideFinding(event)
    expect(findingRows[0]!.status).toBe('accepted')
    expect(findingRows[0]!.dismissReason).toBe('')
    expect(storedSlots('values')['c.final']!.notes).toBeUndefined()
  })

  it('ein zweites Mal entscheiden ist ein Konflikt, kein Eingabefehler', async () => {
    body = { status: 'accepted' }
    await decideFinding(event)
    await expect(decideFinding(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'already_decided' },
    })
  })

  it('eine FREMDE Zeile antwortet wie eine fehlende (404)', async () => {
    findingRows[0]!.profileId = 'p2'
    body = { status: 'accepted' }
    await expect(decideFinding(event)).rejects.toMatchObject({ status: 404 })
  })
})

describe('GET …/findings — die Liste', () => {
  beforeEach(() => {
    findingRows.push(
      {
        $id: 'f1',
        $createdAt: '2026-09-04T00:00:00.000Z',
        profileId: 'p1',
        stepKey: 'values',
        kind: 'conflict',
        slots: JSON.stringify(['c.final', 'b.purpose']),
        why: 'offen',
        status: 'open',
        sourceSession: 'c.final',
      },
      {
        $id: 'f2',
        $createdAt: '2026-09-04T00:00:00.000Z',
        profileId: 'p1',
        stepKey: 'values',
        kind: 'gap',
        slots: JSON.stringify(['c.definitions']),
        why: 'erledigt',
        status: 'dismissed',
        sourceSession: 'c.final',
      },
    )
  })

  it('zeigt standardmässig nur die offenen', async () => {
    query = {}
    const result = await listFindings(event) as { findings: { id: string }[] }
    expect(result.findings.map(entry => entry.id)).toEqual(['f1'])
  })

  it('`?status=dismissed` zeigt die erledigten', async () => {
    query = { status: 'dismissed' }
    const result = await listFindings(event) as { findings: { id: string, kind: string }[] }
    expect(result.findings.map(entry => entry.id)).toEqual(['f2'])
    expect(result.findings[0]!.kind).toBe('gap')
  })

  it('ein unbekannter Status wird abgewiesen', async () => {
    query = { status: 'irgendwas' }
    await expect(listFindings(event)).rejects.toMatchObject({ status: 400 })
  })
})

/**
 * DER `correct`-MODUS UND DIE EINGRENZUNG (BW2 Paket 6, Plan §9).
 *
 * ── DIE FRAGE, DIE HIER ENTSCHIEDEN WIRD ──────────────────────────────────
 * Nach einer Korrektur ist JEDES abhängige Feld mechanisch veraltet. Ob der
 * Mensch dafür zwanzig Gespräche führen muss oder keines, hängt an genau
 * dieser Route: was der Spezialist NICHT als getroffen nennt, bekommt seinen
 * Quell-Hash neu und ist wieder fertig.
 *
 * ── UND DIE GEGENPROBE IST DIE WICHTIGERE HÄLFTE ─────────────────────────
 * Ohne Antwort (Drossel, Anbieter, Schema) bleibt ALLES veraltet — fail-soft
 * ist hier fail-CLOSED in Richtung „bitte ansehen" (§7). Ein Test, der nur
 * den freundlichen Fall prüft, wäre auch dann grün, wenn die Route bei einem
 * Ausfall alles blind grün stempelte.
 */
describe('POST …/sessions/:id/close — der `correct`-Modus (Paket 6)', () => {
  /**
   * `c.final` gerade korrigiert (`previousValue` steht), und ZWEI bestätigte
   * Abhängige daran: `c.definitions` im eigenen Kapitel, `e.statements` im
   * Manifest. Genau so sieht der Stand nach „Korrigieren + neu bestätigen" aus.
   */
  function afterCorrection(): void {
    stepRow('values').slots = JSON.stringify({
      ...confirmedSlots('values'),
      'c.final': { confirmed: '- Mut\n- Klarheit\n- Geduld', previousValue: '- Mut\n- Klarheit\n- Ruhe' },
      'c.definitions': { confirmed: '- Mut — wir sagen es.', sourcesHash: 'von-gestern' },
    })
    stepRow('manifesto').slots = JSON.stringify({
      'e.statements': { confirmed: '- Wir fangen an.', sourcesHash: 'von-gestern' },
    })
  }

  it('läuft im Modus `correct`, sieht den ALTEN Wortlaut und die veralteten Felder', async () => {
    afterCorrection()
    aiQueue = [answer({ affected: [] })]
    body = { revision: 2 }
    await close(event)

    const prompt = aiPrompts[0] ?? ''
    expect(prompt).toContain('checking a CORRECTION')
    expect(prompt).toContain('BEFORE this correction')
    expect(prompt).toContain('- Mut\n- Klarheit\n- Ruhe')
    expect(prompt).toContain('mechanically out of date')
    expect(prompt).toContain('c.definitions')
    expect(prompt).toContain('e.statements')
  })

  it('STEMPELT die nicht getroffenen Felder neu — auch über die Kapitel-Grenze', async () => {
    afterCorrection()
    aiQueue = [answer({ affected: [] })]
    body = { revision: 2 }
    const response = await close(event) as { correction?: { affected: string[], restamped: string[] } }

    expect(response.correction?.affected).toEqual([])
    // Die ganze Hülle: drei Felder des eigenen Kapitels und eines im Manifest.
    expect(response.correction?.restamped)
      .toEqual(['c.definitions', 'c.livedExamples', 'c.conflictRule', 'e.statements'])
    expect(storedSlots('values')['c.definitions']!.sourcesHash).not.toBe('von-gestern')
    expect(storedSlots('manifesto')['e.statements']!.sourcesHash).not.toBe('von-gestern')
    // Der VOR-Wert hat seine Arbeit getan und ist weg.
    expect(storedSlots('values')['c.final']).not.toHaveProperty('previousValue')
  })

  it('LÄSST das getroffene Feld veraltet — und legt seinen Befund an', async () => {
    afterCorrection()
    aiQueue = [
      answer({
        affected: ['e.statements'],
        findings: [{ kind: 'affected', slots: ['e.statements'], why: 'Der dritte Wert ist ein anderer.' }],
      }),
      // Ein `affected`-Befund löst die zweite Stufe aus (§7) — sie bestätigt ihn.
      answer({
        affected: ['e.statements'],
        findings: [{ kind: 'affected', slots: ['e.statements'], why: 'Der dritte Wert ist ein anderer.' }],
      }),
    ]
    body = { revision: 2 }
    const response = await close(event) as { correction?: { affected: string[], restamped: string[] } }

    expect(response.correction?.affected).toEqual(['e.statements'])
    expect(response.correction?.restamped)
      .toEqual(['c.definitions', 'c.livedExamples', 'c.conflictRule'])
    expect(storedSlots('manifesto')['e.statements']!.sourcesHash).toBe('von-gestern')
    expect(findingRows.map(row => row.kind)).toEqual(['affected'])
    expect(findingRows[0]!.slots).toBe('["e.statements"]')
  })

  it('FAIL-CLOSED: ohne gültige Antwort bleibt ALLES veraltet und es gibt keinen Befund', async () => {
    afterCorrection()
    // Kein Urteil (Schema-Fehler) ⇒ die Route schreibt gar nichts.
    aiQueue = [{ kaputt: true }]
    body = { revision: 2 }
    const response = await close(event) as { reviewed: boolean, correction?: unknown }

    expect(response.reviewed).toBe(false)
    expect(response.correction).toBeUndefined()
    expect(storedSlots('values')['c.definitions']!.sourcesHash).toBe('von-gestern')
    expect(storedSlots('manifesto')['e.statements']!.sourcesHash).toBe('von-gestern')
    expect(findingRows).toHaveLength(0)
    // Und der VOR-Wert bleibt stehen: der nächste Versuch ist wieder eine
    // Korrektur, keine gewöhnliche Bestätigung.
    expect(storedSlots('values')['c.final']).toMatchObject({ previousValue: '- Mut\n- Klarheit\n- Ruhe' })
  })

  it('OHNE `previousValue` ist es eine gewöhnliche Bestätigung — Modus `session`', async () => {
    stepRow('values').slots = JSON.stringify({
      ...confirmedSlots('values'),
      'c.definitions': { confirmed: '- Mut — wir sagen es.', sourcesHash: 'von-gestern' },
    })
    aiQueue = [answer()]
    body = { revision: 2 }
    const response = await close(event) as { correction?: unknown }

    expect(aiPrompts[0]).not.toContain('checking a CORRECTION')
    expect(response.correction).toBeUndefined()
    // Nichts wurde nachgestempelt — die Eingrenzung gehört der Korrektur.
    expect(storedSlots('values')['c.definitions']!.sourcesHash).toBe('von-gestern')
  })

  it('die Idempotenz-Weiche gilt für die Korrektur NICHT — sonst liefe sie nie', async () => {
    afterCorrection()
    const slots = JSON.parse(String(stepRow('values').slots)) as Record<string, Record<string, unknown>>
    slots['c.final']!.reviewed = true
    stepRow('values').slots = JSON.stringify(slots)
    aiQueue = [answer({ affected: [] })]
    body = { revision: 2 }
    await close(event)

    expect(aiPrompts).toHaveLength(1)
    expect(aiPrompts[0]).toContain('checking a CORRECTION')
  })
})
