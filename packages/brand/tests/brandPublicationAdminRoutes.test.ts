import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import type {
  BrandPublicationAdminDecisionResponse,
  BrandPublicationAdminListResponse,
  BrandPublicationFlagResponse,
  BrandPublicationReportListResponse,
  BrandPublicationReportResolveResponse,
  BrandPublicationReportResponse,
} from '../shared/types/brand'

/**
 * DIE MODERATION, DURCHGESPIELT — gefälschte Ablage, echte Handler
 * (docs/plans/DISCOVER-BRANDS.md §4.4, Paket D3).
 *
 * Acht Aussagen hängen NICHT an einer puren Funktion, sondern an der
 * Reihenfolge und den geschriebenen Spalten — und genau die verrutscht beim
 * Umbauen still:
 *
 *  1. Die Freigabe ist ein KOPIERVORGANG: `pendingSnapshot` → `snapshot`, und
 *     der eingereichte Stand ist danach leer.
 *  2. Sie LEERT die Begründung — sonst läse die Leseansicht des Kunden
 *     „Aktualisierung abgelehnt" ausgerechnet nach der Freigabe.
 *  3. Ablehnen OHNE alten Stand ⇒ `declined`; MIT altem Stand bleibt die Zeile
 *     `published` und `snapshot` wird nicht angefasst.
 *  4. Ausblenden verlangt eine Begründung und nimmt das `featuredAt` mit.
 *  5. Featured löst die vorige ab — und fasst die neue Zeile dabei nie an.
 *  6. Die Liste zeigt NIE einen Snapshot und NIE eine Mailadresse.
 *  7. Die öffentliche Meldung: 404 auf alles, was nicht öffentlich steht;
 *     429 über der Stunde; 409 auf die eigene offene Dublette.
 *  8. Jede Betreiber-Route ist ein Tor: ohne `users.manage` 403 — und zwar
 *     BEVOR irgendetwas gelesen wird.
 */

interface FakeRow { $id: string, $createdAt: string, [key: string]: unknown }

/** `brand_publications` */
let publications: FakeRow[]
/** `brand_publication_reports` */
let reports: FakeRow[]
/** `brand_profiles` */
let profiles: FakeRow[]
/** `brand_checks` */
let checks: FakeRow[]
let updated: { tableId: string, rowId: string, data: Record<string, unknown> }[]
let created: { tableId: string, data: Record<string, unknown> }[]
let storeBroken: boolean
/** Die Labels der Session — `null` = gar keine Session. */
let labels: string[] | null
let routeId: string
let routeSlug: string
let query: Record<string, unknown>
let body: Record<string, unknown>
let quotaCount: number
let headers: Record<string, string>
let logs: { event: string, data: Record<string, unknown> }[]

interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

function parse(queries: string[]): ParsedQuery[] {
  return queries.map(entry => JSON.parse(entry) as ParsedQuery)
}

function tableRows(tableId: string): FakeRow[] {
  if (tableId === 'brand_publications') return [...publications]
  if (tableId === 'brand_publication_reports') return [...reports]
  if (tableId === 'brand_profiles') return [...profiles]
  return [...checks]
}

/**
 * Der Fake filtert SELBST nach den Abfragen — sonst hinge „der Filter wirkt"
 * am Test-Aufbau statt am Code (die Tautologie-Falle aus dem Presence-Beweis).
 */
const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    const parsed = parse(queries)
    let rows = tableRows(tableId)

    for (const entry of parsed) {
      if (entry.method === 'equal' && entry.attribute) {
        const attribute = entry.attribute
        rows = rows.filter(row => (entry.values ?? []).includes(
          (attribute === '$id' ? row.$id : row[attribute]) as never,
        ))
      }
      if (entry.method === 'isNotNull' && entry.attribute) {
        const attribute = entry.attribute
        rows = rows.filter(row => row[attribute] !== null && row[attribute] !== undefined)
      }
    }
    if (parsed.some(entry => entry.method === 'orderDesc')) {
      rows.sort((a, b) => b.$createdAt.localeCompare(a.$createdAt))
    }
    const limit = parsed.find(entry => entry.method === 'limit')?.values?.[0] as number | undefined
    const total = rows.length
    return { rows: typeof limit === 'number' ? rows.slice(0, limit) : rows, total }
  }),
  getRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    const row = tableRows(tableId).find(entry => entry.$id === rowId)
    if (!row) throw new AppwriteException('not found', 404)
    return row
  }),
  updateRow: vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    updated.push({ tableId, rowId, data })
    const list = tableId === 'brand_publications' ? publications : reports
    const row = list.find(entry => entry.$id === rowId)
    if (row) Object.assign(row, data)
    return row ?? { $id: rowId, ...data }
  }),
  createRow: vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    created.push({ tableId, data })
    const row = { $id: rowId, $createdAt: '2026-09-07T00:00:00.000Z', ...data } as FakeRow
    if (tableId === 'brand_publication_reports') reports.push(row)
    return row
  }),
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({ appwriteKey: 'salt', public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('useAppConfig', () => ({ pukalani: { brand: {} } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('toH3Error', (error: unknown) => error)
vi.stubGlobal('logEvent', (_level: string, event: string, data: Record<string, unknown>) => {
  logs.push({ event, data })
})
vi.stubGlobal('getRouterParam', (_event: H3Event, name: string) =>
  (name === 'slug' ? routeSlug : routeId))
vi.stubGlobal('getValidatedQuery', async (_event: H3Event, parseFn: (value: unknown) => unknown) => parseFn(query))
vi.stubGlobal('readValidatedBody', async (_event: H3Event, parseFn: (value: unknown) => unknown) => parseFn(body))
vi.stubGlobal('setHeader', (_event: H3Event, name: string, value: unknown) => {
  headers[name] = String(value)
})
vi.stubGlobal('trustedClientIp', () => '203.0.113.9')
vi.stubGlobal('useRateLimitStore', () => ({
  prefix: 'rl:',
  store: { hit: async () => ({ count: quotaCount, resetInMs: 60_000 }) },
}))
/**
 * `requirePermission` als ECHTE Regel im Kleinen — ein Stub, der nie wirft,
 * könnte die Torwächter-Zusage (Punkt 8) gar nicht prüfen.
 */
vi.stubGlobal('requirePermission', (_event: H3Event, capability: string) => {
  if (labels === null) throw Object.assign(new Error('Unauthorized'), { status: 401, statusCode: 401 })
  if (!labels.includes(capability)) {
    throw Object.assign(new Error('Forbidden'), { status: 403, statusCode: 403 })
  }
})

const listRoute = (await import('../server/api/brand/admin/publications/index.get'))
  .default as unknown as (event: H3Event) => Promise<BrandPublicationAdminListResponse>
const approveRoute = (await import('../server/api/brand/admin/publications/[id]/approve.post'))
  .default as unknown as (event: H3Event) => Promise<BrandPublicationAdminDecisionResponse>
const declineRoute = (await import('../server/api/brand/admin/publications/[id]/decline.post'))
  .default as unknown as (event: H3Event) => Promise<BrandPublicationAdminDecisionResponse>
const hideRoute = (await import('../server/api/brand/admin/publications/[id]/hide.post'))
  .default as unknown as (event: H3Event) => Promise<BrandPublicationAdminDecisionResponse>
const unhideRoute = (await import('../server/api/brand/admin/publications/[id]/unhide.post'))
  .default as unknown as (event: H3Event) => Promise<BrandPublicationAdminDecisionResponse>
const featureRoute = (await import('../server/api/brand/admin/publications/[id]/feature.post'))
  .default as unknown as (event: H3Event) => Promise<BrandPublicationFlagResponse>
const exampleRoute = (await import('../server/api/brand/admin/publications/[id]/example.post'))
  .default as unknown as (event: H3Event) => Promise<BrandPublicationFlagResponse>
const reportListRoute = (await import('../server/api/brand/admin/publication-reports/index.get'))
  .default as unknown as (event: H3Event) => Promise<BrandPublicationReportListResponse>
const resolveRoute = (await import('../server/api/brand/admin/publication-reports/[id]/resolve.post'))
  .default as unknown as (event: H3Event) => Promise<BrandPublicationReportResolveResponse>
const reportRoute = (await import('../server/api/discover/[slug]/report.post'))
  .default as unknown as (event: H3Event) => Promise<BrandPublicationReportResponse>

const event = { context: {} } as unknown as H3Event

function publication(extra: Record<string, unknown> = {}): FakeRow {
  return {
    $id: 'p1',
    $createdAt: '2026-09-01T10:00:00.000Z',
    slug: 'kailua-coffee-co',
    title: 'Kailua Coffee Co.',
    status: 'pending',
    snapshot: '',
    pendingSnapshot: '{"schemaVersion":1}',
    submittedAt: '2026-09-01T10:00:00.000Z',
    publishedAt: null,
    decidedAt: null,
    decisionNote: '',
    featuredAt: null,
    reportCount: 0,
    example: false,
    checkId: 'c1',
    industry: 'gastronomy',
    archetype: 'creator',
    locale: 'de',
    ...extra,
  }
}

beforeEach(() => {
  publications = [publication()]
  reports = []
  profiles = [{ $id: 'p1', $createdAt: '2026-08-01T00:00:00.000Z', ownerId: 'u1', ownerType: 'user' }]
  checks = [{ $id: 'c1', $createdAt: '2026-08-30T00:00:00.000Z', score: 87, source: 'website', host: 'kailua.test' }]
  updated = []
  created = []
  storeBroken = false
  labels = ['users.manage']
  routeId = 'p1'
  routeSlug = 'kailua-coffee-co'
  query = {}
  body = {}
  quotaCount = 1
  headers = {}
  logs = []
})

// ── Die Liste ───────────────────────────────────────────────────────────────

describe('GET /api/brand/admin/publications', () => {
  it('zeigt Titel, Adresse, Zahl und Eigentümer — aber NIE einen Snapshot', async () => {
    const result = await listRoute(event)
    const item = result.items[0]!
    expect(item.title).toBe('Kailua Coffee Co.')
    expect(item.path).toBe('/discover/kailua-coffee-co')
    expect(item.score).toBe(87)
    expect(item.scoreSource).toBe('website')
    expect(item.ownerId).toBe('u1')
    // Der halbe Zweck von `toBrandPublicationAdminItem`: was NICHT drinsteht.
    expect(JSON.stringify(item)).not.toContain('schemaVersion')
    expect(JSON.stringify(item)).not.toContain('@')
  })

  it('der Reiter „Veröffentlicht" trägt `published` UND `hidden`', async () => {
    publications = [
      publication({ $id: 'a', status: 'published', slug: 'a' }),
      publication({ $id: 'b', status: 'hidden', slug: 'b' }),
      publication({ $id: 'c', status: 'pending', slug: 'c' }),
    ]
    query = { status: 'live' }
    const result = await listRoute(event)
    expect(result.items.map(item => item.id).sort()).toEqual(['a', 'b'])
  })

  it('der Vorgabe-Reiter ist die Warteschlange', async () => {
    publications = [
      publication({ $id: 'a', status: 'published', slug: 'a' }),
      publication({ $id: 'c', status: 'pending', slug: 'c' }),
    ]
    const result = await listRoute(event)
    expect(result.items.map(item => item.id)).toEqual(['c'])
  })

  it('die Zähler sind UNABHÄNGIG vom Filter', async () => {
    publications = [
      publication({ $id: 'a', status: 'published', slug: 'a' }),
      publication({ $id: 'c', status: 'pending', slug: 'c' }),
    ]
    query = { status: 'pending' }
    const result = await listRoute(event)
    expect(result.counts.published).toBe(1)
    expect(result.counts.pending).toBe(1)
  })

  it('OHNE `users.manage`: 403 — und zwar BEVOR etwas gelesen wird', async () => {
    labels = []
    tablesDB.listRows.mockClear()
    await expect(listRoute(event)).rejects.toMatchObject({ status: 403 })
    expect(tablesDB.listRows).not.toHaveBeenCalled()
  })

  it('OHNE Session: 401', async () => {
    labels = null
    await expect(listRoute(event)).rejects.toMatchObject({ status: 401 })
  })
})

// ── Freigeben ───────────────────────────────────────────────────────────────

describe('POST …/publications/:id/approve', () => {
  it('KOPIERT den eingereichten Stand in den öffentlichen', async () => {
    const result = await approveRoute(event)
    expect(result.status).toBe('published')
    const write = updated.find(entry => entry.tableId === 'brand_publications')!.data
    expect(write.snapshot).toBe('{"schemaVersion":1}')
    expect(write.pendingSnapshot).toBe('')
    expect(write.publishedAt).toBeTruthy()
  })

  it('LEERT die Begründung der vorigen Ablehnung', async () => {
    // Sonst läse die Leseansicht `published` + Notiz als „Aktualisierung
    // abgelehnt" — ausgerechnet nach der Freigabe.
    publications = [publication({ decisionNote: 'Fremdes Logo.' })]
    await approveRoute(event)
    expect(updated[0]!.data.decisionNote).toBe('')
  })

  it('NUR aus `pending`: 409, und es wird nichts geschrieben', async () => {
    publications = [publication({ status: 'published' })]
    await expect(approveRoute(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'already_decided' },
    })
    expect(updated).toEqual([])
  })

  it('unbekannte Zeile: 404', async () => {
    routeId = 'gibtsnicht'
    await expect(approveRoute(event)).rejects.toMatchObject({ status: 404 })
  })

  it('OHNE `users.manage`: 403 vor jedem Lesen', async () => {
    labels = []
    tablesDB.getRow.mockClear()
    await expect(approveRoute(event)).rejects.toMatchObject({ status: 403 })
    expect(tablesDB.getRow).not.toHaveBeenCalled()
  })
})

// ── Ablehnen ────────────────────────────────────────────────────────────────

describe('POST …/publications/:id/decline', () => {
  it('OHNE alten Stand: `declined`, mit Begründung', async () => {
    body = { decisionNote: 'Fremdes Logo im Bild.' }
    const result = await declineRoute(event)
    expect(result).toEqual({ ok: true, status: 'declined', keepsPublicStand: false })
    expect(updated[0]!.data).toMatchObject({
      status: 'declined',
      pendingSnapshot: '',
      decisionNote: 'Fremdes Logo im Bild.',
    })
  })

  it('MIT altem Stand: die Zeile BLEIBT `published`, `snapshot` unangetastet', async () => {
    publications = [publication({
      status: 'pending',
      snapshot: '{"alt":true}',
      publishedAt: '2026-09-02T10:00:00.000Z',
    })]
    body = { decisionNote: 'Der neue Purpose nennt einen Wettbewerber.' }
    const result = await declineRoute(event)
    expect(result).toEqual({ ok: true, status: 'published', keepsPublicStand: true })
    const write = updated[0]!.data
    expect(write.status).toBe('published')
    expect(write.pendingSnapshot).toBe('')
    // Der öffentliche Stand darf hier NICHT vorkommen — er bleibt, wie er ist.
    expect(write.snapshot).toBeUndefined()
  })

  it('OHNE Begründung: 400 aus dem Schema, nichts wird geschrieben', async () => {
    body = { decisionNote: '   ' }
    await expect(declineRoute(event)).rejects.toBeTruthy()
    expect(updated).toEqual([])
  })

  it('NUR aus `pending`: 409', async () => {
    publications = [publication({ status: 'declined' })]
    body = { decisionNote: 'Noch einmal.' }
    await expect(declineRoute(event)).rejects.toMatchObject({ status: 409 })
  })
})

// ── Ausblenden und wieder einblenden ────────────────────────────────────────

describe('POST …/publications/:id/hide + /unhide', () => {
  it('Ausblenden verlangt eine Begründung und nimmt das `featuredAt` mit', async () => {
    publications = [publication({ status: 'published', featuredAt: '2026-09-03T00:00:00.000Z' })]
    body = { decisionNote: 'Echte Kundennamen im Kapitel Werte.' }
    const result = await hideRoute(event)
    expect(result.status).toBe('hidden')
    expect(updated[0]!.data).toMatchObject({
      status: 'hidden',
      decisionNote: 'Echte Kundennamen im Kapitel Werte.',
      featuredAt: null,
    })
  })

  it('ohne Begründung geht es nicht', async () => {
    publications = [publication({ status: 'published' })]
    body = { decisionNote: '' }
    await expect(hideRoute(event)).rejects.toBeTruthy()
    expect(updated).toEqual([])
  })

  it('nur aus `published`: 409', async () => {
    body = { decisionNote: 'Egal.' }
    await expect(hideRoute(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'publication_state' },
    })
  })

  it('Einblenden bringt `published` zurück und LEERT die Begründung', async () => {
    publications = [publication({ status: 'hidden', decisionNote: 'War ein Fehlgriff.' })]
    const result = await unhideRoute(event)
    expect(result.status).toBe('published')
    expect(updated[0]!.data.decisionNote).toBe('')
    // `featuredAt` kommt bewusst NICHT zurück.
    expect(updated[0]!.data.featuredAt).toBeUndefined()
  })

  it('Einblenden nur aus `hidden`: 409', async () => {
    publications = [publication({ status: 'published' })]
    await expect(unhideRoute(event)).rejects.toMatchObject({ status: 409 })
  })
})

// ── Brand of the Day und Beispiel ───────────────────────────────────────────

describe('POST …/publications/:id/feature', () => {
  beforeEach(() => {
    body = { featured: true }
  })

  it('setzt den Stempel UND löst die vorige ab', async () => {
    publications = [
      publication({ $id: 'p1', status: 'published', featuredAt: null }),
      publication({ $id: 'alt', slug: 'alt', status: 'published', featuredAt: '2026-09-01T00:00:00.000Z' }),
    ]
    const result = await featureRoute(event)
    expect(result.featured).toBe(true)
    expect(result.replacedId).toBe('alt')
    expect(updated.find(entry => entry.rowId === 'p1')!.data.featuredAt).toBeTruthy()
    expect(updated.find(entry => entry.rowId === 'alt')!.data).toEqual({ featuredAt: null })
  })

  it('räumt die EIGENE Zeile nie ab (sonst bliebe gar keine übrig)', async () => {
    publications = [publication({ status: 'published', featuredAt: '2026-09-01T00:00:00.000Z' })]
    const result = await featureRoute(event)
    expect(result.replacedId).toBe('')
    expect(updated.filter(entry => entry.data.featuredAt === null)).toEqual([])
  })

  it('ENTFERNEN räumt nur die eigene Zeile', async () => {
    publications = [
      publication({ $id: 'p1', status: 'published', featuredAt: '2026-09-05T00:00:00.000Z' }),
      publication({ $id: 'alt', slug: 'alt', status: 'published', featuredAt: '2026-09-01T00:00:00.000Z' }),
    ]
    body = { featured: false }
    const result = await featureRoute(event)
    expect(result.featured).toBe(false)
    expect(result.replacedId).toBe('')
    expect(updated.map(entry => entry.rowId)).toEqual(['p1'])
  })

  it('was nicht öffentlich steht, kann keine Brand of the Day sein: 409', async () => {
    await expect(featureRoute(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'not_published' },
    })
    expect(updated).toEqual([])
  })

  it('das Beispiel-Badge hängt an keinem Zustand', async () => {
    body = { example: true }
    const result = await exampleRoute(event)
    expect(result.example).toBe(true)
    expect(updated[0]!.data).toEqual({ example: true })
  })
})

// ── Die Meldungen ───────────────────────────────────────────────────────────

describe('POST /api/discover/:slug/report', () => {
  beforeEach(() => {
    publications = [publication({ status: 'published', publishedAt: '2026-09-02T00:00:00.000Z', snapshot: '{}' })]
    body = { reason: 'Das Logo im Kopf gehört einer anderen Firma.', email: '', hp: '' }
  })

  it('legt eine offene Meldung an und zieht den Zähler hoch', async () => {
    expect(await reportRoute(event)).toEqual({ ok: true })
    const row = created.find(entry => entry.tableId === 'brand_publication_reports')!.data
    expect(row.publicationId).toBe('p1')
    expect(row.status).toBe('open')
    expect(String(row.ipHash).length).toBeGreaterThan(0)
    expect(updated.find(entry => entry.tableId === 'brand_publications')!.data)
      .toEqual({ reportCount: 1 })
  })

  it('der HONIGTOPF ist ununterscheidbar vom Erfolg — und schreibt nichts', async () => {
    body = { ...body, hp: 'ich bin ein bot' }
    expect(await reportRoute(event)).toEqual({ ok: true })
    expect(created).toEqual([])
  })

  it('was nicht ÖFFENTLICH steht, ist ein 404 — auch `hidden` und `pending`', async () => {
    for (const status of ['pending', 'hidden', 'declined', 'withdrawn']) {
      publications = [publication({ status })]
      created = []
      await expect(reportRoute(event)).rejects.toMatchObject({ status: 404 })
      expect(created).toEqual([])
    }
  })

  it('eine unbekannte Adresse ebenso', async () => {
    routeSlug = 'gibtsnicht'
    await expect(reportRoute(event)).rejects.toMatchObject({ status: 404 })
  })

  it('über der Stunden-Drossel: 429 mit `Retry-After`, VOR jedem Lesen', async () => {
    quotaCount = 4
    tablesDB.listRows.mockClear()
    await expect(reportRoute(event)).rejects.toMatchObject({
      status: 429,
      data: { code: 'report_limit' },
    })
    expect(headers['Retry-After']).toBeTruthy()
    expect(tablesDB.listRows).not.toHaveBeenCalled()
  })

  it('eine eigene OFFENE Meldung zur selben Marke: 409, keine Dublette', async () => {
    await reportRoute(event)
    created = []
    await expect(reportRoute(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'report_open' },
    })
    expect(created).toEqual([])
  })

  it('eine ERLEDIGTE Meldung sperrt nicht auf ewig', async () => {
    await reportRoute(event)
    reports[0]!.status = 'done'
    created = []
    expect(await reportRoute(event)).toEqual({ ok: true })
    expect(created.length).toBe(1)
  })

  it('das Log trägt den Slug, nie die Begründung', async () => {
    await reportRoute(event)
    const entry = logs.find(log => log.event === 'brand.publication_report_received')!
    expect(entry.data).toEqual({ slug: 'kailua-coffee-co' })
  })
})

describe('Die Betreiber-Melde-Liste', () => {
  beforeEach(() => {
    reports = [{
      $id: 'r1',
      $createdAt: '2026-09-06T00:00:00.000Z',
      publicationId: 'p1',
      reason: 'Fremdes Logo.',
      reporterEmail: 'k.reuter@example.test',
      status: 'open',
      ipHash: 'geheim-und-gehoert-nicht-nach-draussen',
      decidedAt: null,
    }]
  })

  it('nennt die gemeldete Marke beim Namen — und lässt den `ipHash` draussen', async () => {
    const result = await reportListRoute(event)
    const item = result.items[0]!
    expect(item.title).toBe('Kailua Coffee Co.')
    expect(item.path).toBe('/discover/kailua-coffee-co')
    expect(item.reporterEmail).toBe('k.reuter@example.test')
    expect(JSON.stringify(item)).not.toContain('geheim')
  })

  it('zeigt in der Vorgabe nur die OFFENEN', async () => {
    reports.push({ ...reports[0]!, $id: 'r2', status: 'done' })
    expect((await reportListRoute(event)).items.map(item => item.id)).toEqual(['r1'])
  })

  it('erledigen stempelt `done` und einen Zeitpunkt', async () => {
    routeId = 'r1'
    expect(await resolveRoute(event)).toEqual({ ok: true, status: 'done', changed: true })
    expect(updated[0]!.data.status).toBe('done')
    expect(updated[0]!.data.decidedAt).toBeTruthy()
  })

  it('zweimal erledigen ist kein Fehler — und schreibt nicht noch einmal', async () => {
    routeId = 'r1'
    reports[0]!.status = 'done'
    expect(await resolveRoute(event)).toEqual({ ok: true, status: 'done', changed: false })
    expect(updated).toEqual([])
  })

  it('OHNE `users.manage`: 403 vor jedem Lesen', async () => {
    labels = []
    tablesDB.listRows.mockClear()
    await expect(reportListRoute(event)).rejects.toMatchObject({ status: 403 })
    expect(tablesDB.listRows).not.toHaveBeenCalled()
  })
})
