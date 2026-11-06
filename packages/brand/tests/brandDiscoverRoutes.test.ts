import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  BrandDiscoverEntryResponse,
  BrandDiscoverListResponse,
} from '../shared/types/brand'

/**
 * DIE ÖFFENTLICHE DISCOVER-FLÄCHE, DURCHGESPIELT — gefälschte Ablage, ECHTE
 * Handler (docs/plans/DISCOVER-BRANDS.md §4.1/§4.2/§6, Paket D2).
 *
 * Sechs Aussagen hängen NICHT an einer puren Funktion, sondern an der
 * Reihenfolge in den Routen — und genau die verrutscht beim Umbauen still:
 *
 *  1. Öffentlich ist GENAU EIN Zustand. Die Grenze steht in der ABFRAGE, nicht
 *     in der Anzeige: die Antwort ist JSON, wer sie abruft, sieht alles.
 *  2. Die Facetten filtern wirklich — und eine unbekannte Facette zeigt die
 *     Galerie statt einer leeren Wand.
 *  3. Brand of the Day ist genau EINE, und sie hängt NICHT am Filter.
 *  4. Die Zahlen kommen GEBÜNDELT: eine Abfrage über `brand_checks`, nie eine
 *     je Kachel.
 *  5. Alles, was nicht `published` ist — und ein unlesbarer Stand —, ist auf
 *     der Anatomie dasselbe 404.
 *  6. Die Anatomie rechnet das Fundament SERVER-seitig und schickt den rohen
 *     Snapshot nie hinaus.
 */

interface FakeRow { $id: string, $createdAt: string, [key: string]: unknown }

/** `brand_publications` */
let publications: FakeRow[]
/** `brand_checks` */
let checks: FakeRow[]
let storeBroken: boolean
let logs: { level: string, event: string, data: Record<string, unknown> }[]
let routeSlug: string
let query: Record<string, unknown>
let entryQuery: Record<string, unknown>
let operator: boolean
/** Wie oft `brand_checks` gelesen wurde — der Beweis gegen N+1. */
let checkReads: number

interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

function parse(queries: string[]): ParsedQuery[] {
  return queries.map(entry => JSON.parse(entry) as ParsedQuery)
}

function tableOf(tableId: string): FakeRow[] {
  return tableId === 'brand_publications' ? publications : checks
}

/**
 * Der Fake filtert SELBST nach den Abfragen — sonst hinge „nur freigegebene
 * Zeilen" am Test-Aufbau statt am Code (die Tautologie-Falle aus dem
 * Presence-Beweis).
 */
const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    if (tableId === 'brand_checks') checkReads += 1
    const parsed = parse(queries)
    let rows = [...tableOf(tableId)]

    for (const entry of parsed) {
      if (entry.method === 'equal' && entry.attribute) {
        const attribute = entry.attribute
        rows = rows.filter(row => (entry.values ?? []).includes(row[attribute] as never))
      }
    }
    const order = parsed.find(entry => entry.method === 'orderDesc')
    if (order) {
      const attribute = order.attribute ?? '$createdAt'
      rows.sort((a, b) => String(b[attribute] ?? '').localeCompare(String(a[attribute] ?? '')))
    }
    const limit = parsed.find(entry => entry.method === 'limit')?.values?.[0] as number | undefined
    if (typeof limit === 'number') rows = rows.slice(0, limit)
    return { rows, total: rows.length }
  }),
  getRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    const row = tableOf(tableId).find(entry => entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404)
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
vi.stubGlobal('getRouterParam', () => routeSlug)
// Die Betreiber-Vorschau (`?preview=1`): `getQuery` liefert die Anatomie-Query,
// `requirePermission` wirft wie im Core — 401 ohne Nutzer, 403 ohne Recht.
vi.stubGlobal('getQuery', () => entryQuery)
vi.stubGlobal('requirePermission', (_event: H3Event, capability: string) => {
  if (!operator) throw Object.assign(new Error('Unauthorized'), { status: 401 })
  if (capability !== 'users.manage') throw Object.assign(new Error('Forbidden'), { status: 403 })
})
vi.stubGlobal('getValidatedQuery', async (_event: H3Event, run: (input: unknown) => unknown) => run(query))

/**
 * Der Microcache beider Routen lebt auf MODUL-Ebene und überlebt jeden
 * einzelnen Test. Der Fake merkt sich jede Instanz, `beforeEach` leert sie —
 * sonst prüfte der zweite Test die Antwort des ersten.
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

const listHandler = (await import('../server/api/discover/index.get'))
  .default as unknown as (event: H3Event) => Promise<BrandDiscoverListResponse>
const entryHandler = (await import('../server/api/discover/[slug].get'))
  .default as unknown as (event: H3Event) => Promise<BrandDiscoverEntryResponse>

const event = { context: {} } as unknown as H3Event

/** Ein Snapshot in der Form, die `buildBrandFoundation` wörtlich erwartet. */
function snapshot(title = 'Kailua Coffee Co.'): string {
  return JSON.stringify({
    schemaVersion: 1,
    title,
    contentLocale: 'en',
    story: 'Zwei Menschen, eine Rösterei.',
    chapters: [
      { stepKey: 'pvm', slots: [{ slotId: 'b.purpose', value: 'Ein ehrlicher, ruhiger Moment am Tag.' }] },
    ],
    presetId: '',
    presetVersion: '',
  })
}

function publication(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    $id: 'p1',
    $createdAt: '2026-09-05T10:00:00.000Z',
    slug: 'kailua-coffee',
    title: 'Kailua Coffee Co.',
    snapshot: snapshot(),
    status: 'published',
    publishedAt: '2026-09-05T10:00:00.000Z',
    pathKind: 'new',
    industry: 'food',
    archetype: 'sage',
    archetypeSecondary: 'creator',
    paletteId: 'bread',
    locale: 'en',
    checkId: '',
    example: false,
    ...overrides,
  }
}

function check(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    $id: 'c1',
    $createdAt: '2026-09-04T10:00:00.000Z',
    profileId: 'p1',
    urlKey: 'kailua.coffee',
    host: 'kailua.coffee',
    score: 87,
    band: 'strong',
    source: 'website',
    hidden: false,
    rankingOptIn: true,
    categories: JSON.stringify([
      { key: 'consistency', weight: 15, raw: 10, assessable: 5, points: 0, locked: false },
    ]),
    criteria: '[]',
    findings: '[]',
    ...overrides,
  }
}

beforeEach(() => {
  publications = []
  checks = []
  storeBroken = false
  logs = []
  routeSlug = ''
  query = {}
  entryQuery = {}
  operator = false
  checkReads = 0
  for (const cache of microcaches) cache.clear()
  tablesDB.listRows.mockClear()
  tablesDB.getRow.mockClear()
})

describe('GET /api/discover · wer überhaupt vorkommt', () => {
  it('zeigt AUSSCHLIESSLICH freigegebene Veröffentlichungen', async () => {
    publications = [
      publication({ $id: 'ja', slug: 'ja' }),
      // Erstes Einreichen: kein alter Stand ⇒ unsichtbar. (Ein wartender NEUER
      // Stand mit altem `snapshot` bleibt sichtbar — eigener Test unten.)
      publication({ $id: 'wartet', slug: 'wartet', status: 'pending', snapshot: '' }),
      publication({ $id: 'weg', slug: 'weg', status: 'withdrawn' }),
      publication({ $id: 'aus', slug: 'aus', status: 'hidden' }),
      publication({ $id: 'nein', slug: 'nein', status: 'declined' }),
    ]

    const result = await listHandler(event)

    expect(result.items.map(entry => entry.slug)).toEqual(['ja'])
    expect(result.total).toBe(1)
    expect(result.page).toBe(1)
  })

  it('eine fehlende Tabelle ist eine LEERE Galerie, kein Fehler', async () => {
    storeBroken = true
    const result = await listHandler(event)
    expect(result.items).toEqual([])
    expect(result.featured).toBeNull()
    expect(result.spotlight).toEqual([])
  })
})

describe('GET /api/discover · Facetten und Sortierung', () => {
  beforeEach(() => {
    publications = [
      publication({
        $id: 'a', slug: 'a', pathKind: 'new', archetype: 'sage', paletteId: 'bread',
        industry: 'food', publishedAt: '2026-09-01T00:00:00.000Z',
      }),
      publication({
        $id: 'b', slug: 'b', pathKind: 'relaunch', archetype: 'creator', paletteId: 'moss',
        industry: 'agency', publishedAt: '2026-09-06T00:00:00.000Z',
      }),
    ]
  })

  it('filtert je Achse', async () => {
    query = { path: 'relaunch' }
    expect((await listHandler(event)).items.map(entry => entry.slug)).toEqual(['b'])

    for (const cache of microcaches) cache.clear()
    query = { palette: 'bread' }
    expect((await listHandler(event)).items.map(entry => entry.slug)).toEqual(['a'])
  })

  it('eine UNBEKANNTE Facette zeigt die Galerie, keine leere Wand', async () => {
    query = { palette: 'lila', archetype: 'der-weise', sort: 'beliebteste' }
    const result = await listHandler(event)
    expect(result.items.map(entry => entry.slug)).toEqual(['b', 'a'])
  })

  it('sortiert nach dem Brand Score, wenn danach gefragt wird', async () => {
    checks = [
      check({ $id: 'ca', profileId: 'a', score: 91 }),
      check({ $id: 'cb', profileId: 'b', score: 60 }),
    ]
    query = { sort: 'score' }
    expect((await listHandler(event)).items.map(entry => entry.slug)).toEqual(['a', 'b'])
  })
})

describe('GET /api/discover · Zahlen und Aufmacher', () => {
  it('holt die Zahlen GEBÜNDELT — eine Abfrage für alle Kacheln', async () => {
    publications = Array.from({ length: 5 }, (_, index) =>
      publication({ $id: `p${index}`, slug: `s${index}` }))
    checks = publications.map((row, index) =>
      check({ $id: `c${index}`, profileId: row.$id, score: 70 + index }))

    const result = await listHandler(event)

    expect(result.items).toHaveLength(5)
    // EINE Lesung von `brand_checks`, nicht fünf.
    expect(checkReads).toBe(1)
    expect(result.items.every(entry => entry.score?.kind === 'website')).toBe(true)
  })

  it('zeigt zwei Zahlen, wo es zwei gibt — Website im Ring, Reife daneben', async () => {
    publications = [publication()]
    checks = [
      check({ $id: 'web', source: 'website', score: 87, band: 'strong' }),
      check({ $id: 'doc', source: 'document', score: 78, band: 'solid' }),
    ]

    const result = await listHandler(event)

    expect(result.items[0]!.score).toEqual({ kind: 'website', value: 87, band: 'strong' })
    expect(result.items[0]!.secondary).toEqual({ kind: 'document', value: 78 })
  })

  it('ein AUSGEBLENDETER Check zählt nicht mehr', async () => {
    publications = [publication()]
    checks = [check({ hidden: true })]
    expect((await listHandler(event)).items[0]!.score).toBeNull()
  })

  it('Brand of the Day ist GENAU EINE — die letzte gewinnt', async () => {
    publications = [
      publication({ $id: 'alt', slug: 'alt', featuredAt: '2026-09-01T00:00:00.000Z' }),
      publication({ $id: 'neu', slug: 'neu', featuredAt: '2026-09-06T00:00:00.000Z' }),
      publication({ $id: 'ohne', slug: 'ohne' }),
    ]

    const result = await listHandler(event)

    expect(result.featured?.slug).toBe('neu')
    expect(result.items.filter(entry => entry.featured).map(entry => entry.slug)).toEqual(['neu'])
  })

  it('der Aufmacher hängt NICHT am Filter', async () => {
    publications = [
      publication({ $id: 'neu', slug: 'neu', pathKind: 'new', featuredAt: '2026-09-06T00:00:00.000Z' }),
      publication({ $id: 'rel', slug: 'rel', pathKind: 'relaunch' }),
    ]
    query = { path: 'relaunch' }

    const result = await listHandler(event)

    expect(result.items.map(entry => entry.slug)).toEqual(['rel'])
    // Die Empfehlung des Hauses, nicht das erste Suchergebnis.
    expect(result.featured?.slug).toBe('neu')
  })

  it('ohne Kuration blättert der Aufmacher die drei NEUESTEN', async () => {
    publications = Array.from({ length: 5 }, (_, index) => publication({
      $id: `p${index}`,
      slug: `s${index}`,
      publishedAt: `2026-09-0${index + 1}T00:00:00.000Z`,
    }))

    const result = await listHandler(event)

    expect(result.featured).toBeNull()
    expect(result.spotlight.map(entry => entry.slug)).toEqual(['s4', 's3', 's2'])
  })
})

describe('GET /api/discover/:slug · die Anatomie', () => {
  it('liefert Steckbrief, Fundament und Ähnliche — aber nie den rohen Stand', async () => {
    publications = [
      publication(),
      publication({ $id: 'p2', slug: 'nordlicht', title: 'Nordlicht', archetype: 'sage', paletteId: 'moss' }),
    ]
    checks = [check()]
    routeSlug = 'kailua-coffee'

    const result = await entryHandler(event)

    expect(result.publication.slug).toBe('kailua-coffee')
    expect(result.publication.score).toEqual({ kind: 'website', value: 87, band: 'strong' })
    expect(result.foundation.chapters.length).toBeGreaterThan(0)
    expect(result.similar).toEqual([
      { slug: 'nordlicht', title: 'Nordlicht', paletteId: 'moss', reason: 'archetype' },
    ])
    // Der Snapshot bleibt auf dem Server — die Antwort kennt ihn nicht.
    expect(JSON.stringify(result)).not.toContain('schemaVersion')
  })

  it('ein NEUER Stand in Prüfung lässt den alten öffentlich — Anatomie zeigt den alten, Galerie führt die Marke', async () => {
    // 2026-09-08 live erwischt: nach „Stand aktualisieren" stand die Zeile auf
    // `pending`, und Galerie wie Anatomie hielten sie für unsichtbar.
    publications = [publication({
      status: 'pending',
      snapshot: snapshot('Kailua — alter Stand'),
      pendingSnapshot: snapshot('Kailua — neuer Stand'),
    })]
    routeSlug = 'kailua-coffee'

    const entry = await entryHandler(event)
    expect(entry.preview).toBeUndefined()
    expect(entry.foundation.chapters.length).toBeGreaterThan(0)

    for (const cache of microcaches) cache.clear()
    const list = await listHandler(event)
    expect(list.total).toBe(1)
  })

  it('Betreiber-Vorschau: der EINGEREICHTE Stand einer wartenden Marke, noindex-markiert, nie im Cache', async () => {
    publications = [publication({ status: 'pending', snapshot: '', pendingSnapshot: snapshot('Kailua — neuer Stand') })]
    routeSlug = 'kailua-coffee'
    entryQuery = { preview: '1' }

    // Ohne Recht: dasselbe Tor wie die Betreiber-Seite, kein 404-Verstecken.
    await expect(entryHandler(event)).rejects.toMatchObject({ status: 401 })

    operator = true
    const first = await entryHandler(event)
    expect(first.preview).toBe(true)
    // `snapshot` ist leer — dass hier Kapitel stehen, beweist den Griff zum
    // eingereichten Stand (`pendingSnapshot`).
    expect(first.foundation.chapters.length).toBeGreaterThan(0)

    // Ein zweiter Aufruf liest die Ablage erneut — der Microcache bleibt leer.
    const reads = tablesDB.listRows.mock.calls.length
    await entryHandler(event)
    expect(tablesDB.listRows.mock.calls.length).toBeGreaterThan(reads)

    // Und ohne `preview` bleibt die wartende Marke, was sie ist: unsichtbar.
    entryQuery = {}
    await expect(entryHandler(event)).rejects.toMatchObject({ status: 404 })
  })

  it('holt den Markenabdruck NUR über die eingefrorene Adresse', async () => {
    publications = [publication({ checkId: 'c1' })]
    checks = [check({ $id: 'c1' })]
    routeSlug = 'kailua-coffee'

    const result = await entryHandler(event)

    expect(result.check?.id).toBe('c1')
    expect(result.check?.categories).toContainEqual({ id: 'consistency', score: 100 })
  })

  it('ohne `checkId` gibt es keinen Abdruck — und keinen erfundenen', async () => {
    publications = [publication({ checkId: '' })]
    checks = [check()]
    routeSlug = 'kailua-coffee'
    expect((await entryHandler(event)).check).toBeNull()
  })

  it('alles, was nicht freigegeben ist, ist DASSELBE 404', async () => {
    // Ein ERSTES Einreichen hat noch keinen öffentlichen Stand (`snapshot` leer).
    for (const status of ['pending', 'declined', 'hidden', 'withdrawn']) {
      publications = [publication({ status, snapshot: status === 'pending' ? '' : snapshot() })]
      routeSlug = 'kailua-coffee'
      for (const cache of microcaches) cache.clear()
      await expect(entryHandler(event)).rejects.toMatchObject({ status: 404 })
    }

    publications = []
    routeSlug = 'gibt-es-nicht'
    for (const cache of microcaches) cache.clear()
    await expect(entryHandler(event)).rejects.toMatchObject({ status: 404 })
  })

  it('ein unlesbarer Stand ist ein 404 und kein 500', async () => {
    publications = [publication({ snapshot: '{kaputt' })]
    routeSlug = 'kailua-coffee'

    await expect(entryHandler(event)).rejects.toMatchObject({ status: 404 })
    expect(logs.some(entry => entry.event === 'brand.discover_snapshot_corrupt')).toBe(true)
  })

  it('eine unmögliche Adresse geht gar nicht erst in die Ablage', async () => {
    routeSlug = '../../etc/passwd'
    await expect(entryHandler(event)).rejects.toMatchObject({ status: 404 })
    expect(tablesDB.listRows).not.toHaveBeenCalled()
  })
})
