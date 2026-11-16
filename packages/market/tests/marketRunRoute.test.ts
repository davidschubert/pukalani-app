import { createHash } from 'node:crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { BrandCrawledPage } from '../server/contracts/brandContract'
import type { MarketCompetitorRow } from '../shared/types/market'
import type { MarketOverviewResponse, MarketRunResponse } from '../shared/types/marketApi'
import { parseMarketRunDetail } from '../shared/marketRun'
import { RUN_LEASE_STALL_MS } from '../../core/shared/runLease'
import type { MemoryStore } from '../../core/tests/support/runLeaseMemoryStore'
import { memoryStore } from '../../core/tests/support/runLeaseMemoryStore'

/**
 * DER MARKTVERGLEICH IM HINTERGRUND (GA1 P18, BE-008 + BE-011) — die ECHTEN
 * Routen `POST /run` und `GET /profiles/<id>`, der echte Lauf
 * (`marketRun.ts`), die echte Abruf-Pipeline (`marketFetch.ts`) und die echte
 * Lauf-Sperre aus dem Core (`runLease.ts`) mit einem In-Memory-Store, der bei
 * gleicher Zeilen-Id einen Konflikt meldet wie Appwrite.
 *
 * Gestellt sind nur: Nitro-/h3-Globals, die Ablage der Kandidaten (mit der
 * echten 5000-Zeichen-Grenze von `pagesFetched`), der Abruf fremder Seiten
 * (ein Tor, das jede Seite aufhält), Modell, Brand-Checks und Bericht.
 *
 * Die Zusagen des Betreibers, die hier geprüft werden:
 *  - „antwortet sofort und rechnet im Hintergrund" ⇒ 202, während das Tor
 *    des Abrufs noch ZU ist;
 *  - „ein zweiter Klick startet keinen zweiten Lauf" ⇒ 409 `run_running`,
 *    auch bei zwei Anfragen im selben Augenblick, und genau EINE Buchung;
 *  - ein abgebrochener Lauf ohne bezahlten Schritt kostet keinen zweiten
 *    Tageslauf — mit bezahltem schon;
 *  - „überlange Adressen werden verworfen, statt den ganzen Lauf
 *    abzubrechen" (BE-011).
 */

// ── Zustand der Fälschungen ─────────────────────────────────────────────────

let store: MemoryStore
let competitors: MarketCompetitorRow[]
let sites: Record<string, { pages: Record<string, string>, sitemap?: string[] }>
/** Hält JEDEN Seitenabruf auf, solange es gesetzt ist. */
let pageGate: Promise<void> | null
let pagesRequested: string[]
let pagesDelivered: number
let bookings: number
let quotaRejects: boolean
let aiEnabled: boolean
let profileListCalls: number
let updates: { competitorId: string, data: Record<string, unknown> }[]
/** Kandidaten, deren Abrufstand sich nicht schreiben lässt (jeder Versuch). */
let unwritable: Set<string>
let extractCalls: number
let logs: { level: string, name: string, data: Record<string, unknown> }[]

// ── Die eingesetzten Nachbarn ───────────────────────────────────────────────

vi.mock('../server/contracts/brandContract', async () => {
  const parse = await import('../../brand/shared/brandSiteCrawlParse')
  return {
    BRAND_MARKET_BOT_TOKEN: 'PukalaniMarketBot',
    sitemapUrlsFromRobots: parse.sitemapUrlsFromRobots,
    readBrandAiEnabled: vi.fn(async () => aiEnabled),
    brandMarketVisibilityOf: () => 'private',
    resolveDerivationAccess: () => ({ unlocked: true }),
    crawlBrandTextResource: vi.fn(async () => null),
    crawlBrandSitemap: vi.fn(async (url: string) => {
      const origin = new URL(url).origin
      return sites[origin]?.sitemap ?? []
    }),
    crawlBrandPage: vi.fn(async (url: string): Promise<BrandCrawledPage> => {
      pagesRequested.push(url)
      if (pageGate) await pageGate
      const origin = new URL(url).origin
      const text = sites[origin]?.pages[url]
      if (text === undefined) throw new Error('not found')
      pagesDelivered++
      return {
        url,
        finalUrl: url,
        title: '',
        description: '',
        text,
        links: [],
        meta: { robots: [], tdmReservation: [] },
        jsonLd: null,
        headers: {},
      } as unknown as BrandCrawledPage
    }),
  }
})

vi.mock('../server/utils/marketAccess', () => ({
  MARKET_UNLOCK_STEP: 'b',
  requireMarketProfile: vi.fn(async () => ({
    userId: 'u-1',
    profileId: 'p1',
    betaAccount: true,
    profile: { contentLocale: 'de', derivationUnlockedAt: '', derivationUnlockedVia: '' },
  })),
  requireMarketUnlocked: vi.fn(async () => {}),
  marketUnlocked: vi.fn(async () => true),
}))

vi.mock('../server/utils/marketQuota', () => ({
  bookMarketRun: vi.fn(async () => {
    if (quotaRejects) return { code: 'market_run_limit', retryAfterSec: 3600 }
    bookings++
    return null
  }),
}))

vi.mock('../server/utils/marketStore', () => ({
  marketDb: () => ({ tablesDB: {}, databaseId: 'main' }),
  listMarketCompetitors: vi.fn(async () => competitors),
  listMarketProfiles: vi.fn(async () => {
    profileListCalls++
    return []
  }),
  createMarketProfile: vi.fn(async () => ({})),
  updateMarketCompetitor: vi.fn(async (_event: H3Event, _profileId: string, competitorId: string, data: Record<string, unknown>) => {
    if (unwritable.has(competitorId)) throw new Error('Invalid document structure')
    // DIE ECHTE GRENZE der Spalte (market-001): Appwrite lehnt das GANZE
    // Update ab, wenn ein Wert länger ist als seine Spalte.
    if (typeof data.pagesFetched === 'string' && data.pagesFetched.length > 5000) {
      throw new Error('Invalid document structure: pagesFetched too long')
    }
    updates.push({ competitorId, data })
    return {}
  }),
}))

vi.mock('../server/utils/marketExtract', () => ({
  marketInputHash: (raw: string) => createHash('sha256').update(raw).digest('hex'),
  extractMarketProfile: vi.fn(async () => {
    extractCalls++
    return { failure: '', fields: [], model: 'test-model', promptVersion: 'v1' }
  }),
}))

vi.mock('../server/utils/marketAiView', () => ({
  collectMarketAiView: vi.fn(async () => ({ statements: [] })),
}))

vi.mock('../server/utils/marketOwnProfile', () => ({
  loadMarketFoundationCandidate: vi.fn(async () => ({ fields: [] })),
  loadMarketSharedCandidate: vi.fn(async () => null),
}))

vi.mock('../server/utils/marketBrandCheck', () => ({
  triggerMarketBrandChecks: vi.fn(async () => {}),
  loadMarketBrandChecks: vi.fn(async () => new Map()),
}))

vi.mock('../server/utils/marketReportService', () => ({
  loadMarketReportState: vi.fn(async () => ({ withProfile: 1 })),
  produceMarketReport: vi.fn(async () => ({ view: null })),
}))

// ── Nitro-/h3-Globals ───────────────────────────────────────────────────────

interface TestEvent {
  context: { user?: { $id: string } }
  status?: number
  headers: Record<string, unknown>
  query: Record<string, string>
}

interface HttpError extends Error { statusCode?: number, data?: { code?: string } }

let run: (event: H3Event) => Promise<MarketRunResponse>
let overview: (event: H3Event) => Promise<MarketOverviewResponse>

beforeAll(async () => {
  const lease = await import('../../core/server/utils/runLease')
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('createError', (init: { status: number, statusText: string, data?: unknown }) =>
    Object.assign(new Error(init.statusText), { statusCode: init.status, data: init.data }))
  vi.stubGlobal('logEvent', (level: string, name: string, data: Record<string, unknown> = {}) => {
    logs.push({ level, name, data })
  })
  vi.stubGlobal('getQuery', (event: TestEvent) => event.query)
  vi.stubGlobal('readBody', async () => ({}))
  vi.stubGlobal('setResponseStatus', (event: TestEvent, status: number) => {
    event.status = status
  })
  vi.stubGlobal('setResponseHeader', (event: TestEvent, name: string, value: unknown) => {
    event.headers[name] = value
  })
  // Die ECHTE Sperr-Logik, als Auto-Import gestellt — nur der Store ist der
  // In-Memory-Store.
  vi.stubGlobal('appwriteRunLeaseStore', () => store)
  vi.stubGlobal('acquireRunLease', lease.acquireRunLease)
  vi.stubGlobal('touchRunLease', lease.touchRunLease)
  vi.stubGlobal('finishRunLease', lease.finishRunLease)
  vi.stubGlobal('dropRunLease', lease.dropRunLease)
  vi.stubGlobal('keepRunLeaseAlive', lease.keepRunLeaseAlive)
  vi.stubGlobal('runDetached', lease.runDetached)

  run = (await import('../server/api/market/profiles/[id]/run.post')).default as unknown as typeof run
  overview = (await import('../server/api/market/profiles/[id]/index.get')).default as unknown as typeof overview
})

beforeEach(() => {
  store = memoryStore()
  competitors = []
  sites = {}
  pageGate = null
  pagesRequested = []
  pagesDelivered = 0
  bookings = 0
  quotaRejects = false
  aiEnabled = false
  profileListCalls = 0
  updates = []
  unwritable = new Set()
  extractCalls = 0
  logs = []
})

afterEach(async () => {
  // Kein Lauf darf in den nächsten Test hineinlaufen.
  pageGate = null
  await settled()
})

// ── Helfer ──────────────────────────────────────────────────────────────────

function newEvent(): TestEvent {
  return { context: { user: { $id: 'u-1' } }, headers: {}, query: { report: '1' } }
}

function competitor(id: string, url: string, name = id): MarketCompetitorRow {
  return {
    $id: id,
    $createdAt: '',
    $updatedAt: '',
    $permissions: [],
    $sequence: 0,
    $tableId: 'market_competitors',
    $databaseId: 'main',
    profileId: 'p1',
    name,
    url,
    status: 'pending',
    sourceKind: 'website',
  } as unknown as MarketCompetitorRow
}

function site(origin: string, extra: Record<string, string> = {}, sitemap?: string[]): void {
  sites[origin] = { pages: { [`${origin}/`]: 'Wir rösten in kleinen Mengen.', ...extra }, sitemap }
}

/** Ein Tor, das erst der Test öffnet. */
function closeGate(): () => void {
  let open!: () => void
  pageGate = new Promise<void>((resolve) => {
    open = resolve
  })
  return () => {
    pageGate = null
    open()
  }
}

/** Die jüngste Lauf-Zeile. */
function latestRow() {
  return [...store.rows.values()].sort((a, b) => b.seq - a.seq)[0] ?? null
}

/** Wartet, bis kein Lauf mehr offen ist (alle Zeilen beendet). */
async function settled(): Promise<void> {
  await vi.waitFor(() => {
    for (const row of store.rows.values()) {
      if (!row.finishedAt && Date.parse(row.heartbeatAt) > Date.now() - RUN_LEASE_STALL_MS) {
        throw new Error('Lauf offen')
      }
    }
  }, { timeout: 2000, interval: 5 })
}

async function rejectionOf(promise: Promise<unknown>): Promise<HttpError> {
  try {
    await promise
  }
  catch (error) {
    return error as HttpError
  }
  throw new Error('kein Fehler')
}

// ── BE-008 ──────────────────────────────────────────────────────────────────

describe('POST /run — antwortet sofort, sperrt den zweiten Klick', () => {
  it('antwortet 202, BEVOR der Abruf fertig ist; ein zweiter Aufruf bekommt 409 run_running; gebucht ist EIN Lauf', async () => {
    site('https://a.example')
    competitors = [competitor('a', 'https://a.example/')]
    const open = closeGate()

    const event = newEvent()
    const startedAt = Date.now()
    const response = await run(event as unknown as H3Event)
    const tookMs = Date.now() - startedAt

    expect(event.status).toBe(202)
    expect(response.ran).toBe(true)
    expect(response.run?.state).toBe('running')
    expect(response.run?.total).toBe(1)
    expect(tookMs).toBeLessThan(2000)
    // Das Tor ist noch zu: keine Seite ist geliefert.
    expect(pagesDelivered).toBe(0)

    const second = await rejectionOf(run(newEvent() as unknown as H3Event))
    expect(second.statusCode).toBe(409)
    expect(second.data?.code).toBe('run_running')
    expect(bookings).toBe(1)

    open()
    await settled()
    expect(latestRow()?.outcome).toBe('done')
    expect(pagesDelivered).toBe(1)
    expect(bookings).toBe(1)
  })

  it('zwei GLEICHZEITIGE Starts: genau ein 202, ein 409, eine Buchung, die Schleife läuft einmal', async () => {
    site('https://a.example')
    competitors = [competitor('a', 'https://a.example/')]

    // Beide Starter lesen DENSELBEN Vorgänger (keinen), bevor einer anlegt.
    let release!: () => void
    store.gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const events = [newEvent(), newEvent()]
    const starts = events.map(event => run(event as unknown as H3Event))
    await new Promise(resolve => setTimeout(resolve, 5))
    store.gate = null
    release()
    const results = await Promise.allSettled(starts)

    const accepted = results.filter(result => result.status === 'fulfilled')
    const refused = results.filter(result => result.status === 'rejected')
    expect(accepted).toHaveLength(1)
    expect(refused).toHaveLength(1)
    expect(((refused[0] as PromiseRejectedResult).reason as HttpError).data?.code).toBe('run_running')
    expect(events.filter(event => event.status === 202)).toHaveLength(1)

    await settled()
    expect(bookings).toBe(1)
    expect(profileListCalls).toBe(1)
    expect(pagesRequested).toEqual(['https://a.example/'])
  })

  it('Kontingent abgelehnt ⇒ 429, und die Sperre ist wieder frei', async () => {
    site('https://a.example')
    competitors = [competitor('a', 'https://a.example/')]
    quotaRejects = true

    const event = newEvent()
    const refused = await rejectionOf(run(event as unknown as H3Event))
    expect(refused.statusCode).toBe(429)
    expect(refused.data?.code).toBe('market_run_limit')
    expect(event.headers['Retry-After']).toBe(3600)
    expect(store.rows.size).toBe(0)

    quotaRejects = false
    const next = newEvent()
    await run(next as unknown as H3Event)
    expect(next.status).toBe(202)
    await settled()
  })

  it('ohne Kandidaten: 200 ran:false, nichts gesperrt, nichts gebucht', async () => {
    const event = newEvent()
    const response = await run(event as unknown as H3Event)
    expect(response).toEqual({ ran: false, aiEnabled: false, run: null })
    expect(event.status).toBeUndefined()
    expect(store.rows.size).toBe(0)
    expect(bookings).toBe(0)
  })
})

describe('der abgebrochene Lauf', () => {
  function seedStalled(detail: Record<string, unknown>): void {
    const old = new Date(Date.now() - RUN_LEASE_STALL_MS - 60_000).toISOString()
    store.rows.set('r-old', {
      $id: 'r-old',
      scope: 'run',
      subject: 'p1',
      seq: 1,
      startedAt: old,
      heartbeatAt: old,
      finishedAt: '',
      outcome: '',
      detail: JSON.stringify(detail),
    })
  }

  it('die Übersicht meldet `stalled`; ein neuer Start gelingt und bucht NICHT neu, wenn nichts bezahlt war', async () => {
    site('https://a.example')
    competitors = [competitor('a', 'https://a.example/')]
    seedStalled({ total: 1, done: 0, phase: 'fetch', booked: true, paid: false })

    const view = await overview(newEvent() as unknown as H3Event)
    expect(view.run.state).toBe('stalled')

    const event = newEvent()
    await run(event as unknown as H3Event)
    expect(event.status).toBe(202)
    expect(bookings).toBe(0)
    expect(logs.some(line => line.name === 'market.run_booking_inherited')).toBe(true)
    await settled()
    // Der Erbe trägt die Buchung weiter — ein zweiter Absturz erbte sie wieder.
    expect(parseMarketRunDetail(latestRow()?.detail).booked).toBe(true)
  })

  it('… und bucht neu, wenn der abgebrochene Lauf schon bezahlt hatte', async () => {
    site('https://a.example')
    competitors = [competitor('a', 'https://a.example/')]
    seedStalled({ total: 1, done: 1, phase: 'report', booked: true, paid: true })

    const event = newEvent()
    await run(event as unknown as H3Event)
    expect(event.status).toBe(202)
    expect(bookings).toBe(1)
    await settled()
  })
})

describe('der Ausgang an der Lauf-Zeile', () => {
  it('endet `done`, das Detail trägt Zahlen und Kennungen, KEINEN Namen und KEINE Adresse', async () => {
    aiEnabled = true
    site('https://marker-adresse-qq.example', { 'https://marker-adresse-qq.example/ueber-uns': 'Seit 2011.' }, [
      'https://marker-adresse-qq.example/ueber-uns',
    ])
    competitors = [competitor('c1', 'https://marker-adresse-qq.example/', 'MARKER-NAME-ZX')]

    await run(newEvent() as unknown as H3Event)
    await settled()

    const row = latestRow()
    expect(row?.outcome).toBe('done')
    expect(row?.detail).not.toContain('MARKER-NAME-ZX')
    expect(row?.detail).not.toContain('marker-adresse-qq')
    const detail = parseMarketRunDetail(row?.detail)
    expect(detail).toMatchObject({ total: 1, done: 1, phase: 'end', paid: true, booked: true, extracted: 1 })
    expect(detail.steps).toEqual([expect.objectContaining({ competitorId: 'c1', status: 'fetched', pagesRead: 2 })])
    expect(extractCalls).toBe(1)

    // Die Übersicht setzt den Namen aus der Kandidaten-Zeile dazu.
    const view = await overview(newEvent() as unknown as H3Event)
    expect(view.run).toMatchObject({ state: 'done', failed: false, total: 1, done: 1 })
    expect(view.run.steps[0]?.name).toBe('MARKER-NAME-ZX')
  })

  it('eine unlesbare Lauf-Tabelle wirft die Übersicht nicht um', async () => {
    competitors = [competitor('a', 'https://a.example/')]
    store.failLatest = true
    const view = await overview(newEvent() as unknown as H3Event)
    expect(view.run.state).toBe('none')
    expect(view.competitors).toHaveLength(1)
    expect(logs.some(line => line.name === 'market.run_state_unreadable')).toBe(true)
  })
})

// ── BE-011 ──────────────────────────────────────────────────────────────────

describe('überlange Adressen (BE-011)', () => {
  it('acht Sitemap-Adressen mit je 700 Zeichen: Lauf endet `done`, Protokoll passt, `skippedUrls` > 0', async () => {
    const origin = 'https://lang.example'
    const long = Array.from({ length: 8 }, (_, index) => `${origin}/leistungen/${String(index).padStart(2, '0')}-${'x'.repeat(670)}`)
    expect(long.every(url => url.length >= 700)).toBe(true)
    const pages: Record<string, string> = {}
    for (const url of long) pages[url] = 'Unterseite mit Text.'
    site(origin, pages, long)
    competitors = [competitor('lang', `${origin}/`)]

    await run(newEvent() as unknown as H3Event)
    await settled()

    const row = latestRow()
    expect(row?.outcome).toBe('done')
    const written = updates.find(entry => entry.competitorId === 'lang' && typeof entry.data.pagesFetched === 'string')
    expect(written?.data.status).toBe('fetched')
    expect(String(written?.data.pagesFetched).length).toBeLessThan(5000)
    expect(parseMarketRunDetail(row?.detail).skippedUrls).toBeGreaterThan(0)
    expect(logs.find(line => line.name === 'market.run')?.data.skippedUrls).toBe(8)
  })

  it('scheitert das Schreiben bei EINEM Wettbewerber, wird der nächste trotzdem gelesen', async () => {
    site('https://a.example')
    site('https://b.example')
    competitors = [competitor('a', 'https://a.example/'), competitor('b', 'https://b.example/')]
    unwritable.add('a')

    await run(newEvent() as unknown as H3Event)
    await settled()

    expect(latestRow()?.outcome).toBe('done')
    expect(pagesRequested).toContain('https://b.example/')
    const detail = parseMarketRunDetail(latestRow()?.detail)
    expect(detail.steps.map(step => [step.competitorId, step.status])).toEqual([['a', 'failed'], ['b', 'fetched']])
  })
})
