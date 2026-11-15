import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import type { BrandCheckRankingResponse, BrandCheckResult } from '../shared/types/brand'

/**
 * GELÖSCHT HEISST: FÜR NIEMANDEN MEHR SICHTBAR (SEC-015, Davids Entscheidung
 * 2026-11-15).
 *
 * Nach dem Löschen eines Kontos oder einer Marke tragen ihre Checks `erasedAt`.
 * Ab diesem Moment antwortet jeder Leser so, als gäbe es sie nicht — auch für
 * die frühere Besitzerin, denn sie hat ihre Marke selbst gelöscht. Geprüft an
 * den vier Wegen, auf denen ein Check nach aussen geht: die Ergebnisseite, das
 * Ranking, die Adress-Nachschlage des Marktvergleichs und die Galerie.
 *
 * Die Attrappe versteht `isNull`: das Ranking schliesst gelöschte Zeilen in
 * der ABFRAGE aus, damit sie das Lesefenster nicht verbrauchen.
 */

interface FakeRow { $id: string, $createdAt: string, [key: string]: unknown }
interface FakeQuery { method: string, attribute?: string, values?: unknown[] }

let checks: FakeRow[]
let profiles: FakeRow[]
let routerId: string

function applyQueries(rows: FakeRow[], queries: string[]): FakeRow[] {
  let result = [...rows]
  let limit = rows.length
  for (const query of queries.map(q => JSON.parse(q) as FakeQuery)) {
    const field = query.attribute ?? ''
    const value = query.values?.[0]
    if (query.method === 'equal') result = result.filter(row => (query.values ?? []).includes(row[field]))
    else if (query.method === 'isNull') result = result.filter(row => row[field] === null || row[field] === undefined)
    else if (query.method === 'lessThan') result = result.filter(row => String(row[field] ?? '') < String(value))
    else if (query.method === 'greaterThan') result = result.filter(row => Number(row[field] ?? 0) > Number(value))
    else if (query.method === 'orderDesc') result.sort((a, b) => String(b[field] ?? '').localeCompare(String(a[field] ?? '')))
    else if (query.method === 'limit') limit = Number(value ?? rows.length)
  }
  return result.slice(0, limit)
}

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    const rows = applyQueries(tableId === 'brand_profiles' ? profiles : checks, queries)
    return { rows, total: rows.length }
  }),
  getRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    const row = (tableId === 'brand_profiles' ? profiles : checks).find(entry => entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404)
    return row
  }),
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('useAppConfig', () => ({ pukalani: { brand: {} } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('getRouterParam', () => routerId)
vi.stubGlobal('getValidatedQuery', async (_event: H3Event, run: (input: unknown) => unknown) => run({}))
vi.stubGlobal('createMicrocache', <T>(_ttl: number) => {
  // Kein Zwischenspeicher: jeder Test soll die Abfrage sehen.
  return { get: (_key: string): T | undefined => undefined, set: () => {} }
})
vi.stubGlobal('assertBrandOwnerAccess', (await import('../server/utils/brandOwnership')).assertBrandOwnerAccess)

const getHandler = (await import('../server/api/brand/check/[id].get'))
  .default as unknown as (event: H3Event) => Promise<BrandCheckResult>
const rankingHandler = (await import('../server/api/brand/check/ranking.get'))
  .default as unknown as (event: H3Event) => Promise<BrandCheckRankingResponse>
const { findBrandCheckForUrl } = await import('../server/utils/brandCheckLookup')
const { loadDiscoverCheck, loadDiscoverCheckFacts } = await import('../server/utils/brandDiscover')

const event = { context: {} } as unknown as H3Event
const NOT_FOUND = { status: 404, statusText: 'Check not found', data: { code: 'check_not_found' } }

function login(userId: string | null) {
  ;(event as unknown as { context: Record<string, unknown> }).context = userId ? { user: { $id: userId } } : {}
}

function checkRow(id: string, overrides: Record<string, unknown> = {}): FakeRow {
  return {
    $id: id,
    $createdAt: new Date(Date.now() - 60_000).toISOString(),
    urlKey: 'kailua.coffee',
    url: 'https://kailua.coffee/',
    host: 'kailua.coffee',
    locale: 'de',
    score: 70,
    band: 'strong',
    scoreVersion: 'score-1',
    source: 'website',
    hidden: false,
    rankingOptIn: true,
    userId: 'u-owner',
    profileId: 'p1',
    categories: '[]',
    criteria: '[]',
    findings: '[]',
    ...overrides,
  }
}

const ERASED = '2026-11-15T00:00:00.000Z'

beforeEach(() => {
  profiles = [{ $id: 'p1', $createdAt: new Date().toISOString(), ownerType: 'user', ownerId: 'u-owner' }]
  checks = []
  routerId = ''
  login(null)
  tablesDB.listRows.mockClear()
})

describe('GET /api/brand/check/<id> · gelöscht', () => {
  for (const [label, user] of [['Gast', null], ['Fremde', 'u-stranger'], ['frühere Besitzerin', 'u-owner']] as const) {
    it(`Website-Check ⇒ 404 für ${label}`, async () => {
      checks = [checkRow('w1', { erasedAt: ERASED })]
      routerId = 'w1'
      login(user)
      await expect(getHandler(event)).rejects.toMatchObject(NOT_FOUND)
    })

    it(`Dokument-Check ⇒ 404 für ${label}`, async () => {
      checks = [checkRow('d1', { erasedAt: ERASED, source: 'document', urlKey: 'doc:p1', url: '', rankingOptIn: false })]
      routerId = 'd1'
      login(user)
      await expect(getHandler(event)).rejects.toMatchObject(NOT_FOUND)
    })
  }

  it('GEGENPROBE: ohne `erasedAt` ist derselbe Website-Check lesbar', async () => {
    checks = [checkRow('w1', { erasedAt: null })]
    routerId = 'w1'
    await expect(getHandler(event)).resolves.toMatchObject({ id: 'w1' })
  })

  it('ein gelöschter Vorgänger ergibt null — es wird nicht weiter zurückgegriffen', async () => {
    checks = [
      checkRow('ganz-alt', { $createdAt: '2026-07-01T00:00:00.000Z', score: 40 }),
      checkRow('alt', { $createdAt: '2026-08-12T00:00:00.000Z', score: 63, erasedAt: ERASED }),
      checkRow('neu', { $createdAt: '2026-09-01T00:00:00.000Z' }),
    ]
    routerId = 'neu'
    const result = await getHandler(event)
    expect(result.previous).toBeNull()
  })

  it('der Platz zählt gelöschte Checks nicht mit', async () => {
    checks = [
      checkRow('a', { urlKey: 'a.example', score: 90, erasedAt: ERASED }),
      checkRow('b', { urlKey: 'b.example', score: 70 }),
    ]
    routerId = 'b'
    const result = await getHandler(event)
    expect(result.rank).toEqual({ position: 1, total: 1 })
  })
})

describe('GET /api/brand/check/ranking · gelöscht', () => {
  it('ein gelöschter Check steht nicht im Ranking — und die Abfrage schliesst ihn aus', async () => {
    checks = [
      checkRow('a', { urlKey: 'a.example', score: 90, erasedAt: ERASED }),
      checkRow('b', { urlKey: 'b.example', score: 70 }),
    ]
    const result = await rankingHandler(event)
    expect(result.items.map(item => item.id)).toEqual(['b'])

    const queries = (tablesDB.listRows.mock.calls[0]?.[0] as { queries: string[] }).queries
    expect(queries.map(q => JSON.parse(q) as FakeQuery)).toContainEqual(
      expect.objectContaining({ method: 'isNull', attribute: 'erasedAt' }),
    )
  })
})

describe('findBrandCheckForUrl · gelöscht', () => {
  it('der jüngste Check ist gelöscht ⇒ null (ein neuer Check entsteht)', async () => {
    checks = [checkRow('w1', { erasedAt: ERASED })]
    expect(await findBrandCheckForUrl(event, 'https://kailua.coffee/')).toBeNull()
  })

  it('GEGENPROBE: ungelöscht ⇒ der Check', async () => {
    checks = [checkRow('w1')]
    expect(await findBrandCheckForUrl(event, 'https://kailua.coffee/')).toMatchObject({ checkId: 'w1' })
  })
})

describe('Galerie · gelöscht', () => {
  it('loadDiscoverCheck ⇒ null', async () => {
    checks = [checkRow('w1', { erasedAt: ERASED })]
    expect(await loadDiscoverCheck(event, 'w1')).toBeNull()
  })

  it('loadDiscoverCheckFacts ⇒ keine Zahl aus einem gelöschten Check', async () => {
    checks = [
      checkRow('w-new', { erasedAt: ERASED }),
      checkRow('w-old', { $createdAt: '2026-01-01T00:00:00.000Z', score: 55 }),
    ]
    const facts = await loadDiscoverCheckFacts(event, ['p1'])
    expect(facts.get('p1')).toEqual([{ kind: 'website', value: 55, band: 'strong' }])
  })
})
