import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import type {
  BrandCheckCorrectionDecisionResponse,
  BrandCheckCorrectionListResponse,
  BrandCheckCorrectionResponse,
  BrandCheckHiddenResponse,
  BrandCheckRankingResponse,
} from '../shared/types/brand'

/**
 * DIE RANKING-FLÄCHE, DURCHGESPIELT — gefälschte Ablage, ECHTE Handler.
 *
 * Sieben Aussagen hängen NICHT an einer puren Funktion, sondern an der
 * Reihenfolge der Routen — und genau die verrutscht beim Umbauen still:
 *
 *  1. Das Ranking zeigt AUSSCHLIESSLICH freigegebene, sichtbare Checks mit
 *     einer Zahl. Die Grenze steht in der ABFRAGE, nicht in der Anzeige — die
 *     Antwort ist JSON, wer sie abruft, sieht alles, was drin ist.
 *  2. Je Adresse gilt der jüngste Check; der Vorgänger ist Verlauf.
 *  3. Ein ausgeblendeter Check ist überall ein 404 — auch für den, der seine
 *     Adresse kennt, und auch für einen Korrekturvorschlag.
 *  4. Der Korrekturvorschlag drosselt und prüft, BEVOR er schreibt; eine
 *     Dublette wird zum 409 statt zu einer zweiten Zeile in der Arbeitsliste.
 *  5. Der Honigtopf antwortet wie der Erfolg und rührt die Ablage nicht an.
 *  6. Annehmen schreibt in `brand_checks` UND stempelt — in dieser Reihenfolge.
 *  7. Jede Betreiber-Route ist ein Tor: ohne Session 401, ohne `users.manage`
 *     403 — und zwar BEVOR irgendetwas gelesen wird.
 */

interface FakeRow { $id: string, $createdAt: string, [key: string]: unknown }

/** `brand_checks` */
let checks: FakeRow[]
/** `brand_check_corrections` */
let corrections: FakeRow[]
let storeBroken: boolean
let logs: { level: string, event: string, data: Record<string, unknown> }[]
let headers: Record<string, string>
/** Die Labels der Session — `null` = gar keine Session. */
let labels: string[] | null
let routeId: string
let query: Record<string, unknown>
let body: Record<string, unknown>
let buckets: Map<string, number>

interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

function parse(queries: string[]): ParsedQuery[] {
  return queries.map(entry => JSON.parse(entry) as ParsedQuery)
}

function tableOf(tableId: string): FakeRow[] {
  return tableId === 'brand_checks' ? checks : corrections
}

/**
 * Der Fake filtert SELBST nach den Abfragen — sonst hinge „nur freigegebene
 * Zeilen" am Test-Aufbau statt am Code (die Tautologie-Falle aus dem
 * Presence-Beweis).
 */
const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    const parsed = parse(queries)
    let rows = [...tableOf(tableId)]

    for (const entry of parsed) {
      if (entry.method === 'equal' && entry.attribute) {
        const attribute = entry.attribute
        rows = rows.filter(row => (entry.values ?? []).includes(row[attribute] as never))
      }
      if (entry.method === 'greaterThan' && entry.attribute) {
        const attribute = entry.attribute
        const bound = Number(entry.values?.[0] ?? 0)
        rows = rows.filter(row => Number(row[attribute] ?? 0) > bound)
      }
    }
    if (parsed.some(entry => entry.method === 'orderDesc')) {
      rows.sort((a, b) => b.$createdAt.localeCompare(a.$createdAt))
    }
    const total = rows.length

    const cursor = parsed.find(entry => entry.method === 'cursorAfter')?.values?.[0] as string | undefined
    if (cursor) {
      const at = rows.findIndex(row => row.$id === cursor)
      rows = at >= 0 ? rows.slice(at + 1) : rows
    }
    const limit = parsed.find(entry => entry.method === 'limit')?.values?.[0] as number | undefined
    if (typeof limit === 'number') rows = rows.slice(0, limit)

    return { rows, total }
  }),
  getRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    const row = tableOf(tableId).find(entry => entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404)
    return row
  }),
  createRow: vi.fn(async ({ tableId, data }: { tableId: string, data: Record<string, unknown> }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    const row: FakeRow = {
      $id: `r${tableOf(tableId).length + 1}`,
      $createdAt: new Date().toISOString(),
      ...data,
    }
    tableOf(tableId).push(row)
    return row
  }),
  updateRow: vi.fn(async ({ tableId, rowId, data }: {
    tableId: string
    rowId: string
    data: Record<string, unknown>
  }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    const row = tableOf(tableId).find(entry => entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404)
    Object.assign(row, data)
    return row
  }),
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({
  public: { appwriteDatabaseId: 'main' },
  appwriteKey: 'test-server-secret',
}))
vi.stubGlobal('useAppConfig', () => ({ pukalani: { brand: {} } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('logEvent', (level: string, event: string, data: Record<string, unknown> = {}) => {
  logs.push({ level, event, data })
})
/** Dieselbe Rechnung wie core/server/utils/requirePermission.ts. */
vi.stubGlobal('requirePermission', (_event: H3Event, capability: string) => {
  if (labels === null) throw createError({ status: 401, statusText: 'Unauthorized' })
  if (!labels.includes('admin') && capability !== 'dashboard.access') {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }
  return { $id: 'u-operator', labels }
})
vi.stubGlobal('getRouterParam', () => routeId)
vi.stubGlobal('getValidatedQuery', async (_event: H3Event, run: (input: unknown) => unknown) => run(query))
vi.stubGlobal('readValidatedBody', async (_event: H3Event, run: (input: unknown) => unknown) => run(body))
vi.stubGlobal('setHeader', (_event: H3Event, key: string, value: string) => {
  headers[key] = value
})
vi.stubGlobal('trustedClientIp', () => '203.0.113.9')
vi.stubGlobal('useRateLimitStore', () => ({
  prefix: 'rl:',
  store: {
    hit: async (key: string) => {
      const count = (buckets.get(key) ?? 0) + 1
      buckets.set(key, count)
      return { count, resetInMs: 3_600_000 }
    },
  },
}))
/**
 * Der Microcache der Ranking-Route lebt auf MODUL-Ebene und überlebt damit
 * jeden einzelnen Test. Der Fake merkt sich deshalb jede angelegte Instanz,
 * und `beforeEach` leert sie — sonst prüfte der zweite Test die Antwort des
 * ersten (live erwischt: fünf Fehlschläge, alle mit Zeilen aus dem Vortest).
 */
const microcaches: { clear: () => void }[] = []
vi.stubGlobal('createMicrocache', <T>(_ttl: number) => {
  const map = new Map<string, T>()
  const cache = {
    get: (key: string) => map.get(key),
    set: (key: string, value: T) => void map.set(key, value),
    delete: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  }
  microcaches.push(cache)
  return cache
})

const rankingHandler = (await import('../server/api/brand/check/ranking.get'))
  .default as unknown as (event: H3Event) => Promise<BrandCheckRankingResponse>
const correctionHandler = (await import('../server/api/brand/check/[id]/correction.post'))
  .default as unknown as (event: H3Event) => Promise<BrandCheckCorrectionResponse>
const listHandler = (await import('../server/api/brand/admin/check-corrections/index.get'))
  .default as unknown as (event: H3Event) => Promise<BrandCheckCorrectionListResponse>
const acceptHandler = (await import('../server/api/brand/admin/check-corrections/[id]/accept.post'))
  .default as unknown as (event: H3Event) => Promise<BrandCheckCorrectionDecisionResponse>
const declineHandler = (await import('../server/api/brand/admin/check-corrections/[id]/decline.post'))
  .default as unknown as (event: H3Event) => Promise<BrandCheckCorrectionDecisionResponse>
const hiddenHandler = (await import('../server/api/brand/admin/checks/[id].patch'))
  .default as unknown as (event: H3Event) => Promise<BrandCheckHiddenResponse>

const event = { context: {} } as unknown as H3Event

/** Acht Kategorien mit vollen Werten — die Sicht rechnet daraus 0–100. */
function categories(consistencyRaw: number, assessable = 5): string {
  return JSON.stringify([
    { key: 'consistency', weight: 15, raw: consistencyRaw, assessable, points: 0, locked: assessable === 0 },
    { key: 'craft', weight: 10, raw: 10, assessable: 5, points: 10, locked: false },
  ])
}

function check(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    $id: 'c1',
    $createdAt: '2026-09-01T10:00:00.000Z',
    urlKey: 'kailua.coffee',
    host: 'kailua.coffee',
    score: 71,
    band: 'strong',
    industry: 'food',
    rankingOptIn: true,
    hidden: false,
    source: 'website',
    categories: categories(10),
    ...overrides,
  }
}

beforeEach(() => {
  checks = []
  corrections = []
  storeBroken = false
  logs = []
  headers = {}
  labels = ['admin']
  routeId = ''
  query = {}
  body = {}
  buckets = new Map()
  for (const cache of microcaches) cache.clear()
  tablesDB.listRows.mockClear()
  tablesDB.getRow.mockClear()
  tablesDB.createRow.mockClear()
  tablesDB.updateRow.mockClear()
})

describe('GET /api/brand/check/ranking · wer überhaupt vorkommt', () => {
  it('zeigt nur freigegebene, sichtbare Checks mit einer Zahl', async () => {
    checks = [
      check({ $id: 'ja', urlKey: 'a.de', host: 'a.de' }),
      check({ $id: 'kein-haekchen', urlKey: 'b.de', host: 'b.de', rankingOptIn: false }),
      check({ $id: 'ausgeblendet', urlKey: 'c.de', host: 'c.de', hidden: true }),
      check({ $id: 'fehllauf', urlKey: 'd.de', host: 'd.de', score: 0 }),
    ]

    const result = await rankingHandler(event)

    expect(result.items.map(entry => entry.id)).toEqual(['ja'])
    expect(result.total).toBe(1)
    expect(result.page).toBe(1)
  })

  it('je Adresse den JÜNGSTEN Check — der Vorgänger ist Verlauf', async () => {
    checks = [
      check({ $id: 'alt', $createdAt: '2026-08-01T00:00:00.000Z', score: 95 }),
      check({ $id: 'neu', $createdAt: '2026-09-01T00:00:00.000Z', score: 40 }),
    ]

    const result = await rankingHandler(event)

    // Der ALTE ist der bessere und trotzdem raus: ein veralteter Wert über eine
    // fremde Marke wäre der eigentliche Schaden.
    expect(result.items.map(entry => entry.id)).toEqual(['neu'])
  })

  it('gibt Kategorie-Werte auf 0–100 normiert zurück, `null` bei gesperrt', async () => {
    checks = [check({ $id: 'c1', categories: categories(5) })]
    const result = await rankingHandler(event)
    expect(result.items[0]!.categories).toContainEqual({ id: 'consistency', score: 50 })

    checks = [check({ $id: 'c2', urlKey: 'z.de', categories: categories(0, 0) })]
    // Zweite Messung in DEMSELBEN Test: der Microcache hält sonst die Antwort
    // der ersten fest (derselbe Filter, derselbe Schlüssel).
    for (const cache of microcaches) cache.clear()
    const locked = await rankingHandler(event)
    expect(locked.items[0]!.categories).toContainEqual({ id: 'consistency', score: null })
  })

  it('zeigt weder `urlKey` noch `ipHash` — eine Rangliste braucht Host und Zahl', async () => {
    checks = [check({ ipHash: 'geheim', textHash: 'geheim2', url: 'https://kailua.coffee/impressum' })]
    const result = await rankingHandler(event)
    expect(JSON.stringify(result)).not.toContain('geheim')
    expect(JSON.stringify(result)).not.toContain('/impressum')
  })

  it('filtert nach Branche und sortiert nach einer Kategorie', async () => {
    checks = [
      check({ $id: 'food', urlKey: 'a.de', industry: 'food', categories: categories(2) }),
      check({ $id: 'agency-gut', urlKey: 'b.de', industry: 'agency', categories: categories(10) }),
      check({ $id: 'agency-schwach', urlKey: 'c.de', industry: 'agency', categories: categories(4) }),
    ]

    query = { industry: 'agency', sort: 'consistency' }
    const result = await rankingHandler(event)

    expect(result.items.map(entry => entry.id)).toEqual(['agency-gut', 'agency-schwach'])
    expect(result.total).toBe(2)
  })

  it('eine fehlende Tabelle ist eine LEERE Liste, kein 503', async () => {
    storeBroken = true
    await expect(rankingHandler(event)).resolves.toMatchObject({ items: [], total: 0 })
  })

  it('cacht je Filterkombination — ein anderer Filter fragt neu', async () => {
    checks = [check()]

    query = { sort: 'score' }
    await rankingHandler(event)
    await rankingHandler(event)
    expect(tablesDB.listRows).toHaveBeenCalledTimes(1)

    query = { sort: 'date' }
    await rankingHandler(event)
    expect(tablesDB.listRows).toHaveBeenCalledTimes(2)
  })
})

describe('POST /api/brand/check/<id>/correction', () => {
  beforeEach(() => {
    checks = [check()]
    routeId = 'c1'
    body = { field: 'industry', proposed: 'agency', reason: 'Das ist eine Agentur.' }
  })

  it('legt einen offenen Vorschlag an — ohne Konto, ohne Beweis', async () => {
    const result = await correctionHandler(event)

    expect(result).toEqual({ ok: true })
    expect(corrections).toHaveLength(1)
    expect(corrections[0]).toMatchObject({
      checkId: 'c1',
      field: 'industry',
      proposed: 'agency',
      status: 'open',
      decisionNote: '',
      decidedAt: null,
    })
  })

  it('speichert die rohe IP nirgends — nur ihren Tages-Stempel', async () => {
    await correctionHandler(event)
    expect(JSON.stringify(corrections)).not.toContain('203.0.113.9')
    expect(String(corrections[0]!.ipHash)).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(logs)).not.toContain('203.0.113.9')
  })

  it('der Honigtopf antwortet wie der Erfolg und schreibt NICHTS', async () => {
    body = { ...body, hp: 'ausgefüllt' }
    await expect(correctionHandler(event)).resolves.toEqual({ ok: true })
    expect(corrections).toHaveLength(0)
    expect(tablesDB.getRow).not.toHaveBeenCalled()
    // Auch kein Kontingent: ein Bot soll den Eimer eines Menschen nicht leeren.
    expect(buckets.size).toBe(0)
  })

  it('ein unbekannter Check ist ein 404 — und die Drossel hat schon gezählt', async () => {
    routeId = 'gibtsnicht'
    await expect(correctionHandler(event)).rejects.toMatchObject({ status: 404 })
    expect(corrections).toHaveLength(0)
  })

  it('ein AUSGEBLENDETER Check ist ebenfalls ein 404', async () => {
    checks = [check({ hidden: true })]
    await expect(correctionHandler(event)).rejects.toMatchObject({ status: 404 })
    expect(corrections).toHaveLength(0)
  })

  it('eine Dublette zum selben Feld ist ein 409, keine zweite Zeile', async () => {
    await correctionHandler(event)
    await expect(correctionHandler(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'correction_open' },
    })
    expect(corrections).toHaveLength(1)
  })

  it('ein ENTSCHIEDENER Vorschlag sperrt einen neuen nicht auf ewig', async () => {
    await correctionHandler(event)
    corrections[0]!.status = 'declined'
    await expect(correctionHandler(event)).resolves.toEqual({ ok: true })
    expect(corrections).toHaveLength(2)
  })

  it('drosselt je Anschluss und Stunde — der vierte bekommt 429 mit Retry-After', async () => {
    for (let i = 0; i < 3; i++) {
      corrections = []
      await correctionHandler(event)
    }
    corrections = []
    await expect(correctionHandler(event)).rejects.toMatchObject({
      status: 429,
      data: { code: 'brand_correction_limit' },
    })
    expect(headers['Retry-After']).toBeDefined()
    expect(corrections).toHaveLength(0)
  })
})

describe('Betreiber: Korrekturen lesen und entscheiden', () => {
  beforeEach(() => {
    checks = [check()]
    corrections = [{
      $id: 'k1',
      $createdAt: '2026-09-02T00:00:00.000Z',
      checkId: 'c1',
      field: 'industry',
      proposed: 'agency',
      reason: 'Agentur',
      reporterEmail: 'melder@example.com',
      status: 'open',
      decisionNote: '',
      ipHash: 'abc',
    }]
  })

  it('die Liste zeigt den IST-Wert mit — sonst ist ein Vorschlag nicht entscheidbar', async () => {
    const result = await listHandler(event)

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      id: 'k1',
      host: 'kailua.coffee',
      current: 'food',
      proposed: 'agency',
      status: 'open',
      reporterEmail: 'melder@example.com',
    })
    expect(result.counts.open).toBe(1)
  })

  it('die Liste zeigt NIE den `ipHash`', async () => {
    const result = await listHandler(event)
    expect(JSON.stringify(result)).not.toContain('abc')
  })

  it('ohne Session 401, ohne `users.manage` 403 — vor jedem Lesen', async () => {
    labels = null
    await expect(listHandler(event)).rejects.toMatchObject({ status: 401 })
    labels = ['moderator']
    await expect(listHandler(event)).rejects.toMatchObject({ status: 403 })
    await expect(acceptHandler(event)).rejects.toMatchObject({ status: 403 })
    await expect(declineHandler(event)).rejects.toMatchObject({ status: 403 })
    await expect(hiddenHandler(event)).rejects.toMatchObject({ status: 403 })
    expect(tablesDB.listRows).not.toHaveBeenCalled()
    expect(tablesDB.getRow).not.toHaveBeenCalled()
  })

  it('annehmen schreibt den Wert in den Check UND stempelt den Vorschlag', async () => {
    routeId = 'k1'
    const result = await acceptHandler(event)

    expect(result).toEqual({ ok: true, status: 'accepted', changed: true })
    expect(checks[0]!.industry).toBe('agency')
    expect(corrections[0]!.status).toBe('accepted')
    expect(String(corrections[0]!.decidedAt)).toMatch(/^\d{4}-/)
  })

  it('zweimal annehmen ist kein Fehler und schreibt nicht noch einmal', async () => {
    routeId = 'k1'
    await acceptHandler(event)
    tablesDB.updateRow.mockClear()

    await expect(acceptHandler(event)).resolves.toEqual({
      ok: true, status: 'accepted', changed: false,
    })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('eine angenommene Zeile nachträglich abzulehnen ist ein 409', async () => {
    routeId = 'k1'
    await acceptHandler(event)
    await expect(declineHandler(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'already_decided' },
    })
    expect(checks[0]!.industry).toBe('agency')
  })

  it('ein Vorschlag mit einem Wert AUSSERHALB des Katalogs wird nicht angenommen', async () => {
    // Er kann so nur entstehen, wenn der Katalog sich zwischen Vorschlag und
    // Entscheidung geändert hat — genau dafür wird beim Annehmen erneut geprüft.
    corrections[0]!.proposed = 'agentur'
    routeId = 'k1'
    await expect(acceptHandler(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'invalid_value' },
    })
    expect(checks[0]!.industry).toBe('food')
    expect(corrections[0]!.status).toBe('open')
  })

  it('ablehnen behält die Zeile und die Begründung', async () => {
    routeId = 'k1'
    body = { decisionNote: 'Das ist eine Rösterei, keine Agentur.' }

    const result = await declineHandler(event)

    expect(result).toEqual({ ok: true, status: 'declined', changed: true })
    expect(corrections).toHaveLength(1)
    expect(corrections[0]).toMatchObject({
      status: 'declined',
      decisionNote: 'Das ist eine Rösterei, keine Agentur.',
    })
    expect(checks[0]!.industry).toBe('food')
  })

  it('ein unbekannter Vorschlag ist ein 404', async () => {
    routeId = 'gibtsnicht'
    await expect(acceptHandler(event)).rejects.toMatchObject({ status: 404 })
  })
})

describe('PATCH /api/brand/admin/checks/<id> · der Entfernen-Weg', () => {
  beforeEach(() => {
    checks = [check()]
    routeId = 'c1'
  })

  it('blendet aus — und LÖSCHT die Zeile nicht', async () => {
    body = { hidden: true }
    await expect(hiddenHandler(event)).resolves.toEqual({ ok: true, hidden: true })
    expect(checks).toHaveLength(1)
    expect(checks[0]!.hidden).toBe(true)
  })

  it('blendet wieder ein — ein Schalter in eine Richtung wäre eine Falle', async () => {
    checks = [check({ hidden: true })]
    body = { hidden: false }
    await expect(hiddenHandler(event)).resolves.toEqual({ ok: true, hidden: false })
    expect(checks[0]!.hidden).toBe(false)
  })

  it('schon so ⇒ dieselbe Antwort ohne Schreibvorgang', async () => {
    body = { hidden: false }
    await expect(hiddenHandler(event)).resolves.toEqual({ ok: true, hidden: false })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('nimmt die Zahl aus dem Ranking — die Grenze steht in der Abfrage', async () => {
    body = { hidden: true }
    await hiddenHandler(event)
    await expect(rankingHandler(event)).resolves.toMatchObject({ items: [], total: 0 })
  })
})
