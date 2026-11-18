import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { MemoryStore } from '../../core/tests/support/runLeaseMemoryStore'
import { memoryStore } from '../../core/tests/support/runLeaseMemoryStore'
import { BRAND_RUN_SCOPES, parseBrandRunDetail } from '../shared/brandRun'
import { confirmableRequiredSlotsForStep } from '../shared/slotRegistry'

/**
 * DAS DOKUMENT UND DER PRÜFBLICK AN DER ROUTE (BW2 Paket 7, Plan §10; seit
 * LL1 d im Hintergrund).
 *
 * ── WAS HIER GEPRÜFT WIRD UND IN `brandDocument.test.ts` NICHT ───────────
 * Die reinen Regeln (Idempotenz-Schlüssel, Deckel-Auswahl) stehen dort. Hier
 * läuft, was ihnen erst Bedeutung gibt: ob übersprungene Kapitel WIRKLICH
 * fehlen, ob die Nachholung WIRKLICH bei zehn aufhört, ob der Dokument-Blick
 * WIRKLICH fünffach bucht und ob derselbe Stand WIRKLICH keinen zweiten Aufruf
 * kostet.
 *
 * ── SEIT LL1 d: DER LAUF HINTER DER ANTWORT ──────────────────────────────
 * Die Route antwortet `202`, der Lauf rechnet in `startBrandRun`. Die
 * Lauf-Sperre ist die ECHTE Logik des Core (Store im Speicher, wie in
 * `brandDocumentCheckRoute.test.ts`). Geprüft wird zusätzlich, was nur ein
 * Lauf im Hintergrund falsch machen kann: gegen einen alten Stand schreiben,
 * nach verlorenem Herzschlag oder gelöschter Marke weiterschreiben, bei
 * gleichzeitigen Starts zweimal laufen.
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
/** Läuft VOR jeder Modell-Antwort — so speichert „der Mensch" mitten im Lauf. */
let onAiCall: ((call: number) => void) | null
/** Hält jede Modell-Antwort auf, solange es gesetzt ist. */
let aiGate: Promise<void> | null

/** Wer fragt — `null` heisst ohne Zugang (Gast, Konto ohne Freischaltung). */
let caller: string | null
/** Die Marke ist gelöscht (oder es gab sie nie). */
let profileGone: boolean
/** Die Lauf-Sperre — echte Logik, Store im Speicher. */
let store: MemoryStore
/** Der Lauf hinter der Antwort — Tests warten darauf. */
let detached: Promise<void> = Promise.resolve()
let status: number
/** Der Herzschlag gilt als verloren. */
let heartbeatLost: boolean

function stepRow(stepKey: string): FakeRow {
  return stepRows.find(row => row.stepKey === stepKey)!
}

function storedSlots(stepKey: string): Record<string, Record<string, unknown>> {
  return JSON.parse(String(stepRow(stepKey).slots))
}

function notFound(): Error {
  return Object.assign(new Error('not found'), { code: 404, status: 404 })
}

const tablesDB = {
  getRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    if (tableId === 'brand_profiles') {
      if (profileGone || rowId !== 'p1') throw notFound()
      return profileRow
    }
    if (tableId === 'app_config') return { $id: 'global', brandAiEnabled: aiEnabled }
    if (tableId === 'brand_steps') {
      const row = stepRows.find(entry => entry.$id === rowId)
      if (row) return row
      throw notFound()
    }
    throw new Error(`unerwartete Tabelle ${tableId}`)
  }),
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries?: unknown[] }) => {
    if (tableId === 'brand_steps') return { rows: stepRows.map(row => ({ ...row })) }
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
vi.stubGlobal('requireBrandAccess', async () => {
  if (caller === null) throw Object.assign(new Error('Not Found'), { status: 404 })
  return { userId: caller }
})
// Ein FREMDES Konto bekommt dieselbe Antwort wie eine unbekannte Marke.
vi.stubGlobal('assertBrandOwnerAccess', (_event: H3Event, row: { createdByUserId?: string }, userId: string) => {
  if (row.createdByUserId !== userId) throw Object.assign(new Error('Not Found'), { status: 404 })
})
vi.stubGlobal('getRouterParam', (_event: H3Event, name: string) => (name === 'id' ? routeProfileId : ''))
vi.stubGlobal('getQuery', () => query)
vi.stubGlobal('setHeader', () => {})
vi.stubGlobal('setResponseStatus', (_event: unknown, code: number) => {
  status = code
})
vi.stubGlobal('isAiEndpointUnavailable', (error: unknown) =>
  (error as { data?: { code?: string } } | null)?.data?.code === 'ai_endpoint_unavailable')
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
  if (aiGate) await aiGate
  aiPrompts.push(prompt)
  aiModels.push(options.model ?? '')
  onAiCall?.(aiPrompts.length)
  const next = aiQueue.shift()
  if (next instanceof Error) throw next
  return next
})

// Die ECHTE Sperr-Logik — nur der Store ist im Speicher.
const lease = await import('../../core/server/utils/runLease')
vi.stubGlobal('appwriteRunLeaseStore', () => store)
vi.stubGlobal('acquireRunLease', lease.acquireRunLease)
vi.stubGlobal('dropRunLease', lease.dropRunLease)
vi.stubGlobal('touchRunLease', lease.touchRunLease)
vi.stubGlobal('finishRunLease', lease.finishRunLease)
vi.stubGlobal('keepRunLeaseAlive', (...args: Parameters<typeof lease.keepRunLeaseAlive>) => {
  const alive = lease.keepRunLeaseAlive(...args)
  return { stop: alive.stop, lost: () => heartbeatLost || alive.lost() }
})
vi.stubGlobal('runDetached', (label: string, work: () => Promise<void>) => {
  detached = new Promise<void>((resolve) => {
    lease.runDetached(label, async () => {
      try {
        await work()
      }
      finally {
        resolve()
      }
    })
  })
})

let routeProfileId = 'p1'

const documentRoute = (await import('../server/api/brand/profiles/[id]/document.get'))
  .default as unknown as (event: H3Event) => Promise<Record<string, unknown>>
const reviewRoute = (await import('../server/api/brand/profiles/[id]/review.post'))
  .default as unknown as (event: H3Event) => Promise<StartResponse>

const event = { context: {} } as unknown as H3Event

interface DocumentChapter {
  stepKey: string
  storedState: string
  revision: number
  acceptance: { accepted: number, total: number }
  sessions: { slotId: string, value: string, confirmed: boolean }[]
}
interface RunView { state: string, failure: string, created: number }
interface DocumentResponse {
  chapters: DocumentChapter[]
  findings: unknown[]
  review: { unreviewed: string[] }
  reviewRun: RunView
}
interface StartResponse {
  ok: true
  started: boolean
  run: RunView
}

/** Starten UND das Ende des Laufs abwarten. */
async function review(): Promise<StartResponse> {
  status = 200
  const result = await reviewRoute(event)
  await detached
  return result
}

/** Die jüngste Lauf-Zeile der Marke. */
async function latestRun() {
  return await store.latest(BRAND_RUN_SCOPES.documentReview, 'p1')
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
const VALUES = confirmableRequiredSlotsForStep('values').map(slot => slot.id)

beforeEach(() => {
  query = {}
  aiEnabled = true
  aiQueue = []
  aiPrompts.length = 0
  aiModels.length = 0
  hits.length = 0
  onAiCall = null
  aiGate = null
  caller = 'u1'
  routeProfileId = 'p1'
  profileGone = false
  heartbeatLost = false
  store = memoryStore()
  detached = Promise.resolve()
  status = 200
  findingRows = []
  findingSeq = 0
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
    aiQueue = Array.from({ length: VALUES.length + 1 }, () => answer())

    const result = await review()
    expect(result.started).toBe(true)
    const run = await latestRun()
    expect(run?.outcome).toBe('done')
    expect(parseBrandRunDetail(run?.detail).created).toBe(VALUES.length)
    const slots = storedSlots('values')
    expect(Object.values(slots).every(record => record.reviewed === true)).toBe(true)
    // Nach JEDER nachgeholten Session geschrieben (nicht erst am Ende).
    expect(stepRow('values').revision).toBe(2 + VALUES.length)
  })

  it('der DOKUMENT-Aufruf ist der letzte und trägt die Aufgabe des Prüfblicks', async () => {
    aiQueue = Array.from({ length: 20 }, () => answer())
    await review()
    const last = aiPrompts.at(-1) ?? ''
    expect(last).toContain('reading the WHOLE brand foundation at once')
    expect(last).toContain('Only "findings" carries content in this mode')
    expect(last).toContain('every chapter, in the order it was built')
    expect(last).not.toContain('the confirmed values of chapter')
  })

  it('bucht 1 je Nachholung und 5 für den Dokument-Blick (§13)', async () => {
    aiQueue = Array.from({ length: VALUES.length + 1 }, () => answer())
    await review()
    const booked = hits.filter(key => key.startsWith('brand-ai-review-day:'))
    expect(booked).toHaveLength(VALUES.length + 5)
    expect(hits.some(key => key.startsWith('brand-ai-talk-day:'))).toBe(false)
    expect(hits.some(key => key.startsWith('brand-ai-slot-day:'))).toBe(false)
  })

  it('DECKEL: höchstens zehn Nachholungen, der Rest bleibt ungeprüft stehen', async () => {
    stepRow('context').slots = JSON.stringify(confirmedSlots('context'))
    stepRow('values').slots = JSON.stringify(confirmedSlots('values'))
    aiQueue = Array.from({ length: 30 }, () => answer())

    await review()
    expect(parseBrandRunDetail((await latestRun())?.detail).created).toBe(10)
    const page = await documentRoute(event) as unknown as DocumentResponse
    expect(page.review.unreviewed.length).toBeGreaterThan(0)
    // Die ERSTEN zehn in Registry-Reihenfolge: Kapitel A steht vor Kapitel C.
    expect(storedSlots('context')[confirmableRequiredSlotsForStep('context')[0]!.id]!.reviewed).toBe(true)
    expect(hits.filter(key => key.startsWith('brand-ai-review-day:'))).toHaveLength(15)
  })

  it('NICHTS ZU TUN: derselbe Stand antwortet sofort — kein Lauf, keine Lauf-Zeile, kein Aufruf', async () => {
    aiQueue = Array.from({ length: 20 }, () => answer())
    await review()
    const calls = aiPrompts.length
    const runs = store.rows.size

    const again = await review()
    expect(again.started).toBe(false)
    expect(status).toBe(200)
    expect(again.run.state).toBe('done')
    expect(aiPrompts).toHaveLength(calls)
    expect(store.rows.size).toBe(runs)
  })

  it('NICHTS ZU TUN: ohne einen bestätigten Wert gibt es keinen Lauf', async () => {
    for (const row of stepRows) row.slots = '{}'
    const result = await review()
    expect(result.started).toBe(false)
    expect(status).toBe(200)
    expect(store.rows.size).toBe(0)
    expect(aiPrompts).toHaveLength(0)
  })

  it('GEGENPROBE: bewegt sich eine Kapitel-Revision, läuft er wieder', async () => {
    aiQueue = Array.from({ length: 20 }, () => answer())
    await review()
    const calls = aiPrompts.length

    stepRow('archetype').revision = 7
    aiQueue = Array.from({ length: 20 }, () => answer())
    const again = await review()
    expect(again.started).toBe(true)
    expect(aiPrompts.length).toBeGreaterThan(calls)
  })

  it('ein gescheiterter Lauf hinterlässt keinen Merker — der nächste Klick versucht es wieder', async () => {
    aiEnabled = false
    await review()
    expect((await latestRun())?.outcome).toBe('review_unavailable')
    aiEnabled = true
    aiQueue = Array.from({ length: 20 }, () => answer())
    expect((await review()).started).toBe(true)
  })

  it('schreibt einen Dokument-Befund an das Kapitel SEINES Feldes', async () => {
    stepRow('values').slots = JSON.stringify(confirmedSlots('values', true))
    aiQueue = [answer({ findings: [CONFLICT] }), answer({ findings: [CONFLICT] })]

    await review()
    expect(findingRows).toHaveLength(1)
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
    await review()
    expect(findingRows).toHaveLength(1)
  })

  it('FAIL-SOFT: eine gescheiterte Nachholung bleibt ungeprüft, der Blick läuft trotzdem', async () => {
    aiQueue = [new Error('provider down'), ...Array.from({ length: 20 }, () => answer())]
    await review()
    expect(storedSlots('values')[VALUES[0]!]!.reviewed).toBeUndefined()
    expect(storedSlots('values')[VALUES[1]!]!.reviewed).toBe(true)
    expect((await latestRun())?.outcome).toBe('done')
  })

  it('FAIL-SOFT: ausgeschaltete KI ruft gar nicht erst an — Ausgang `review_unavailable`', async () => {
    aiEnabled = false
    await review()
    expect(aiPrompts).toHaveLength(0)
    expect(hits).toHaveLength(0)
    const run = await latestRun()
    expect(run?.outcome).toBe('review_unavailable')
    expect(parseBrandRunDetail(run?.detail).created).toBe(0)
  })
})

describe('POST …/review — der Lauf hinter der Antwort (LL1 d)', () => {
  it('antwortet 202 mit „läuft", BEVOR gerechnet ist', async () => {
    let release!: () => void
    aiGate = new Promise<void>((resolve) => {
      release = resolve
    })
    aiQueue = Array.from({ length: 20 }, () => answer())

    const result = await reviewRoute(event)
    expect(status).toBe(202)
    expect(result).toMatchObject({ ok: true, started: true, run: { state: 'running', created: 0 } })
    expect(aiPrompts).toHaveLength(0)
    expect(storedSlots('values')[VALUES[0]!]!.reviewed).toBeUndefined()
    // Die Leseroute meldet den laufenden Lauf.
    const page = await documentRoute(event) as unknown as DocumentResponse
    expect(page.reviewRun.state).toBe('running')

    release()
    await detached
    const after = await documentRoute(event) as unknown as DocumentResponse
    expect(after.reviewRun).toMatchObject({ state: 'done', created: VALUES.length })
    expect(after.review.unreviewed).toEqual([])
  })

  it('FÜNF GLEICHZEITIGE STARTS ⇒ ein Lauf, vier 409 `run_running`', async () => {
    let open!: () => void
    store.gate = new Promise<void>((resolve) => {
      open = resolve
    })
    aiQueue = Array.from({ length: 20 }, () => answer())
    const attempts = Array.from({ length: 5 }, () => reviewRoute(event).then(
      value => ({ ok: true as const, value }),
      (error: { status?: number, data?: { code?: string } }) => ({ ok: false as const, error }),
    ))
    open()
    const results = await Promise.all(attempts)
    store.gate = null
    await detached

    expect(results.filter(result => result.ok)).toHaveLength(1)
    const rejected = results.filter(result => !result.ok)
    expect(rejected).toHaveLength(4)
    for (const result of rejected) {
      expect(result.error.status).toBe(409)
      expect(result.error.data?.code).toBe('run_running')
    }
    expect(store.rows.size).toBe(1)
    // Genau EINE Nachholung je Session plus EIN Dokument-Blick.
    expect(aiPrompts).toHaveLength(VALUES.length + 1)
  })

  it('der Mensch speichert WÄHREND des Laufs ⇒ sein Text bleibt, der geänderte Slot gilt nicht als geprüft', async () => {
    aiQueue = Array.from({ length: 20 }, () => answer())
    onAiCall = (call) => {
      if (call !== 1) return
      // Autosave mitten in der ersten Nachholung: der geprüfte Slot bekommt
      // einen neuen Wert, ein anderer einen Entwurf.
      const slots = storedSlots('values')
      slots[VALUES[0]!] = { ...slots[VALUES[0]!], confirmed: 'neu vom Menschen' }
      slots[VALUES[1]!] = { ...slots[VALUES[1]!], latestDraft: 'Entwurf vom Menschen' }
      stepRow('values').slots = JSON.stringify(slots)
      stepRow('values').revision = Number(stepRow('values').revision) + 1
    }

    await review()
    const slots = storedSlots('values')
    expect(slots[VALUES[0]!]!.confirmed).toBe('neu vom Menschen')
    expect(slots[VALUES[0]!]!.reviewed).toBeUndefined()
    expect(slots[VALUES[1]!]!.latestDraft).toBe('Entwurf vom Menschen')
    expect(slots[VALUES[1]!]!.reviewed).toBe(true)
    expect(parseBrandRunDetail((await latestRun())?.detail).created).toBe(VALUES.length - 1)
  })

  it('ein Feld bewegt sich während des Dokument-Blicks ⇒ sein Befund fällt weg, kein Merker', async () => {
    stepRow('values').slots = JSON.stringify(confirmedSlots('values', true))
    aiQueue = [answer({ findings: [CONFLICT] }), answer({ findings: [CONFLICT] })]
    onAiCall = (call) => {
      if (call !== 1) return
      const slots = storedSlots('values')
      slots['c.final'] = { ...slots['c.final'], confirmed: 'neu vom Menschen' }
      stepRow('values').slots = JSON.stringify(slots)
      stepRow('values').revision = Number(stepRow('values').revision) + 1
    }
    await review()
    expect(findingRows).toHaveLength(0)
    expect(parseBrandRunDetail((await latestRun())?.detail).ref).toBe('')
  })

  it('der Anbieter fällt mitten in der Nachholung aus ⇒ fertige Urteile bleiben, der Ausgang nennt den Grund', async () => {
    aiQueue = [answer(), answer(), ...Array.from({ length: 30 }, () => new Error('provider down'))]
    await review()
    const slots = storedSlots('values')
    expect(slots[VALUES[0]!]!.reviewed).toBe(true)
    expect(slots[VALUES[1]!]!.reviewed).toBe(true)
    expect(slots[VALUES[2]!]!.reviewed).toBeUndefined()
    const run = await latestRun()
    expect(run?.outcome).toBe('review_unavailable')
    expect(parseBrandRunDetail(run?.detail).created).toBe(2)
    const page = await documentRoute(event) as unknown as DocumentResponse
    expect(page.reviewRun).toMatchObject({ state: 'failed', failure: 'review_unavailable', created: 2 })
  })

  it('verlorener Herzschlag ⇒ nichts mehr geschrieben, Ausgang `lease_lost`', async () => {
    aiQueue = Array.from({ length: 20 }, () => answer())
    onAiCall = () => {
      heartbeatLost = true
    }
    await review()
    expect(Object.values(storedSlots('values')).some(record => record.reviewed === true)).toBe(false)
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect((await latestRun())?.outcome).toBe('lease_lost')
  })

  it('Marke während des Laufs gelöscht ⇒ nichts geschrieben, `profile_gone`', async () => {
    aiQueue = Array.from({ length: 20 }, () => answer({ findings: [CONFLICT] }))
    onAiCall = () => {
      profileGone = true
    }
    await review()
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(findingRows).toHaveLength(0)
    expect((await latestRun())?.outcome).toBe('profile_gone')
  })
})

describe('POST …/review — Rollen (OPS-009)', () => {
  it('ohne Zugang (Gast, Konto ohne Freischaltung) ⇒ 404, keine Sperre, kein Aufruf', async () => {
    caller = null
    await expect(reviewRoute(event)).rejects.toMatchObject({ status: 404 })
    expect(store.calls.create).toBe(0)
    expect(aiPrompts).toHaveLength(0)
  })

  it('fremdes Konto ⇒ dieselbe 404 wie eine unbekannte Marke — keine Sperre', async () => {
    caller = 'u2'
    const foreign = await reviewRoute(event).catch((error: { status?: number }) => error)
    caller = 'u1'
    routeProfileId = 'p404'
    const unknown = await reviewRoute(event).catch((error: { status?: number }) => error)
    expect((foreign as { status?: number }).status).toBe(404)
    expect((unknown as { status?: number }).status).toBe(404)
    expect(store.calls.create).toBe(0)
  })

  it('GEGENPROBE: der Besitzer startet den Lauf', async () => {
    aiQueue = Array.from({ length: 20 }, () => answer())
    const result = await review()
    expect(result.started).toBe(true)
    expect(store.calls.create).toBe(1)
  })
})
