import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeRoleGateToDoor, probeRoute, resetCommunityWorld } from '../../core/tests/support/participationHarness'
import type { Who } from '../../core/tests/support/participationHarness'
import { INSIGHTS_POST_INTERNAL_FIELDS } from '../shared/insightsPublic'
import {
  INSIGHTS_MANAGE_ONLY,
  brandRow,
  deepKeys,
  fakeInsightsTables,
  insightsRouteGlobals,
  leaks,
  postRow,
} from './support/insightsRouteKit'
import type { FakeRow, FakeTables } from './support/insightsRouteKit'

/**
 * DIE VIER ÖFFENTLICHEN LESEROUTEN (OPS-009, BT1 b).
 *
 * Ohne `?preview=1` sind sie offen für alle — der Beweis ist hier deshalb
 * nicht „welche Rolle", sondern „was kommt heraus": nur Veröffentlichtes, nur
 * erlaubte Formate, keine internen Felder (Notiz, Prüfer, Modelle, Auftrag)
 * und keine unveröffentlichte Marke, die ein Beitrag erwähnt. Mit
 * `?preview=1` zeigen sie auch Entwürfe — dann hängen sie an
 * `insights.manage` (nur der Betreiber), und die Ablehnung kommt vor dem
 * ersten Lesen.
 *
 * Die Routen halten einen 60-s-Zwischenspeicher je Slug (Modul-Zustand). Jeder
 * Fall nimmt deshalb seinen EIGENEN Slug — sonst antwortete der Speicher des
 * Vorgängers.
 */

function cleanup() {
  afterEach(() => {
    resetCommunityWorld()
    vi.unstubAllGlobals()
  })
}

const read = (
  load: () => Promise<{ default: unknown }>,
  tables: FakeTables,
  slug: string,
  extra: { who?: Who, publicFormats?: readonly string[], preview?: boolean } = {},
) => probeRoute(load, {
  who: extra.who ?? 'guest',
  params: { slug },
  query: extra.preview ? { preview: '1' } : {},
  globals: insightsRouteGlobals({ tablesDB: tables.tablesDB, publicFormats: extra.publicFormats }),
})

/** Kein internes Feld und kein interner Wert in der Antwort. */
function expectNothingInternal(result: unknown) {
  const keys = deepKeys(result)
  for (const field of INSIGHTS_POST_INTERNAL_FIELDS) expect(keys.has(field), `Feld ${field}`).toBe(false)
  expect(keys.has('claimedBy'), 'Feld claimedBy').toBe(false)
  expect(leaks(result, 'INTERN'), 'interner Wert').toBe(false)
  expect(leaks(result, 'u-redaktion'), 'Prüfer').toBe(false)
  expect(leaks(result, 'u-intern'), 'Anspruch').toBe(false)
}

describe('Gegenprobe der Leck-Prüfung', () => {
  it('die Proben-Zeilen TRAGEN die internen Werte — sonst wäre „nichts verraten" immer grün', () => {
    const rows = [postRow('g1'), brandRow('g2')]
    expect(leaks(rows, 'INTERN')).toBe(true)
    expect(leaks(rows, 'u-redaktion')).toBe(true)
    expect(leaks(rows, 'u-intern')).toBe(true)
    expect(deepKeys(rows).has('noteInternal')).toBe(true)
    expect(deepKeys(rows).has('claimedBy')).toBe(true)
  })
})

const ranking = (entries: Array<{ rank: number, brandId: string }>) => ({
  issue: 1,
  asOf: '2026-09-01',
  entries: entries.map(entry => ({ ...entry, score: 50, reasonDe: 'Grund', reasonEn: 'Reason' })),
})

// ── Vorschau: das Tor ───────────────────────────────────────────────────────

describeRoleGateToDoor('GET /api/insights/public/posts/[slug]?preview=1', () => import('../server/api/insights/public/posts/[slug].get'), INSIGHTS_MANAGE_ONLY, {
  params: { slug: 'entwurf' },
  query: { preview: '1' },
  globals: insightsRouteGlobals(),
})

describeRoleGateToDoor('GET /api/insights/public/rankings/[slug]?preview=1', () => import('../server/api/insights/public/rankings/[slug].get'), INSIGHTS_MANAGE_ONLY, {
  params: { slug: 'entwurf' },
  query: { preview: '1' },
  globals: insightsRouteGlobals(),
})

describeRoleGateToDoor('GET /api/insights/public/duels/[slug]?preview=1', () => import('../server/api/insights/public/duels/[slug].get'), INSIGHTS_MANAGE_ONLY, {
  params: { slug: 'a-vs-b' },
  query: { preview: '1' },
  globals: insightsRouteGlobals(),
})

describeRoleGateToDoor('GET /api/insights/public/brands/[slug]?preview=1', () => import('../server/api/insights/public/brands/[slug].get'), INSIGHTS_MANAGE_ONLY, {
  params: { slug: 'entwurf' },
  query: { preview: '1' },
  globals: insightsRouteGlobals(),
})

// ── Beitrag ─────────────────────────────────────────────────────────────────

describe('GET /api/insights/public/posts/[slug] — nur Veröffentlichtes', () => {
  cleanup()
  const load = () => import('../server/api/insights/public/posts/[slug].get')
  const seed = (...extra: FakeRow[]) => fakeInsightsTables([
    brandRow('b1', { state: 'published', name: 'Sichtbare Marke' }),
    brandRow('b2', { state: 'draft', name: 'Geheime Marke' }),
    ...extra,
  ])

  it('veröffentlicht: ohne interne Felder, nur die veröffentlichte Marke', async () => {
    const tables = seed(postRow('pa', { slug: 'artikel-a', brandRefs: [{ brandId: 'b1', checkId: '', libraryKey: '', publicationId: '' }, { brandId: 'b2', checkId: '', libraryKey: '', publicationId: '' }] }))
    const run = await read(load, tables, 'artikel-a')
    expect(run.status).toBe(200)
    const result = run.result as { kind: string, brands: Array<{ id: string }> }
    expect(result.kind).toBe('post')
    expect(result.brands.map(brand => brand.id)).toEqual(['b1'])
    expect(leaks(result, 'Geheime Marke')).toBe(false)
    expectNothingInternal(result)
    expect(tables.writes()).toBe(0)
  })

  for (const state of ['draft', 'review'] as const) {
    it(`${state}: 404 post_not_found, auch für den angemeldeten Betreiber ohne Vorschau`, async () => {
      const tables = seed(postRow('pb', { slug: `artikel-${state}`, state }))
      for (const who of ['guest', 'operator'] as const) {
        const run = await read(load, tables, `artikel-${state}`, { who })
        expect(run.status).toBe(404)
        expect(run.error?.data?.code).toBe('post_not_found')
      }
    })
  }

  it('Format zu: auch ein veröffentlichter Beitrag ist 404', async () => {
    const tables = seed(postRow('pc', { slug: 'artikel-zu' }))
    const run = await read(load, tables, 'artikel-zu', { publicFormats: ['ranking'] })
    expect(run.status).toBe(404)
  })

  it('Vorschau als Betreiber: der Entwurf kommt — als Vorschau gekennzeichnet und ebenfalls ohne interne Felder', async () => {
    const tables = seed(postRow('pd', { slug: 'artikel-vorschau', state: 'draft' }))
    const run = await read(load, tables, 'artikel-vorschau', { who: 'operator', preview: true })
    expect(run.status).toBe(200)
    expect((run.result as { preview?: boolean }).preview).toBe(true)
    expectNothingInternal(run.result)
  })

  it('Vorschau als Redakteur der Community: 403 vor dem ersten Lesen', async () => {
    const tables = seed(postRow('pe', { slug: 'artikel-vorschau-2', state: 'draft' }))
    const run = await read(load, tables, 'artikel-vorschau-2', { who: 'editor', preview: true })
    expect(run.status).toBe(403)
    expect(tables.reads()).toBe(0)
  })
})

// ── Ranking ─────────────────────────────────────────────────────────────────

describe('GET /api/insights/public/rankings/[slug] — nur Veröffentlichtes', () => {
  cleanup()
  const load = () => import('../server/api/insights/public/rankings/[slug].get')
  const seed = (...extra: FakeRow[]) => fakeInsightsTables([
    brandRow('b1', { state: 'published', name: 'Sichtbare Marke' }),
    brandRow('b2', { state: 'draft', name: 'Geheime Marke' }),
    ...extra,
  ])

  it('veröffentlicht: Namen nur für veröffentlichte Marken, keine internen Felder', async () => {
    const tables = seed(postRow('ra', { slug: 'ranking-a', format: 'ranking', ranking: ranking([{ rank: 1, brandId: 'b1' }, { rank: 2, brandId: 'b2' }]) }))
    const run = await read(load, tables, 'ranking-a')
    expect(run.status).toBe(200)
    const result = run.result as { brands: Record<string, unknown> }
    expect(Object.keys(result.brands)).toEqual(['b1'])
    expect(leaks(result, 'Geheime Marke')).toBe(false)
    expectNothingInternal(result)
  })

  it('Entwurf: 404', async () => {
    const tables = seed(postRow('rb', { slug: 'ranking-b', format: 'ranking', state: 'draft', ranking: ranking([{ rank: 1, brandId: 'b1' }]) }))
    const run = await read(load, tables, 'ranking-b')
    expect(run.status).toBe(404)
  })

  it('ein ARTIKEL unter derselben Adresse ist kein Ranking: 404', async () => {
    const tables = seed(postRow('rc', { slug: 'ranking-c', format: 'article' }))
    const run = await read(load, tables, 'ranking-c')
    expect(run.status).toBe(404)
  })
})

// ── Duell ───────────────────────────────────────────────────────────────────

describe('GET /api/insights/public/duels/[slug] — nur Veröffentlichtes', () => {
  cleanup()
  const load = () => import('../server/api/insights/public/duels/[slug].get')
  const refs = (...ids: string[]) => ({
    brandRefs: ids.map(brandId => ({ brandId, checkId: '', libraryKey: '', publicationId: '' })),
    sources: [{ url: 'https://example.test/quelle', kind: 'own-data' as const, publisher: '', date: '', quote: '', license: '' }],
    facts: [{ key: 'alter', labelDe: 'Alter', labelEn: 'Age', left: '10', right: '20', winner: 'right' as const, sourceIndex: 0 }],
  })
  const seed = (...extra: FakeRow[]) => fakeInsightsTables([
    brandRow('d1', { state: 'published', slug: 'links' }),
    brandRow('d2', { state: 'published', slug: 'rechts' }),
    brandRow('d3', { state: 'draft', slug: 'geheim', name: 'Geheime Marke' }),
    ...extra,
  ])

  it('veröffentlicht mit zwei veröffentlichten Marken: beide Seiten, keine internen Felder', async () => {
    const tables = seed(postRow('da', { slug: 'links-vs-rechts', format: 'duel', ...refs('d1', 'd2') }))
    const run = await read(load, tables, 'links-vs-rechts')
    expect(run.status).toBe(200)
    const result = run.result as { left: { id: string }, right: { id: string } }
    expect([result.left.id, result.right.id].sort()).toEqual(['d1', 'd2'])
    expectNothingInternal(result)
  })

  it('eine Seite unveröffentlicht: 404 — die Marke wird nicht verraten', async () => {
    const tables = seed(postRow('db', { slug: 'links-vs-geheim', format: 'duel', ...refs('d1', 'd3') }))
    const run = await read(load, tables, 'links-vs-geheim')
    expect(run.status).toBe(404)
    expect(leaks(run.error?.data, 'Geheime Marke')).toBe(false)
  })

  it('Entwurf: 404', async () => {
    const tables = seed(postRow('dc', { slug: 'rechts-vs-links', format: 'duel', state: 'draft', ...refs('d1', 'd2') }))
    const run = await read(load, tables, 'rechts-vs-links')
    expect(run.status).toBe(404)
  })
})

// ── Markenprofil ────────────────────────────────────────────────────────────

describe('GET /api/insights/public/brands/[slug] — nur Veröffentlichtes', () => {
  cleanup()
  const load = () => import('../server/api/insights/public/brands/[slug].get')
  const ref = (brandId: string) => [{ brandId, checkId: '', libraryKey: '', publicationId: '' }]

  it('veröffentlicht: ohne interne Felder; Entwurfs-Beiträge und Entwurfs-Verwandte fehlen', async () => {
    const tables = fakeInsightsTables([
      brandRow('m1', { slug: 'marke-eins', relations: ['m2', 'm3'] }),
      brandRow('m2', { slug: 'marke-zwei', name: 'Sichtbare Verwandte' }),
      brandRow('m3', { slug: 'marke-drei', name: 'Geheime Verwandte', state: 'draft' }),
      postRow('q1', { slug: 'sichtbarer-artikel', brandRefs: ref('m1') }),
      postRow('q2', { slug: 'geheimer-artikel', state: 'draft', titleDe: 'Geheimer Titel', titleEn: 'Secret title', brandRefs: ref('m1') }),
    ])
    const run = await read(load, tables, 'marke-eins')
    expect(run.status).toBe(200)
    const result = run.result as { brand: Record<string, unknown>, posts: Array<{ id: string }>, relations: Array<{ id: string }> }
    expect(result.posts.map(post => post.id)).toEqual(['q1'])
    expect(result.relations.map(relation => relation.id)).toEqual(['m2'])
    expect(leaks(result, 'Geheime')).toBe(false)
    expect(leaks(result, 'Secret title')).toBe(false)
    expect(Object.keys(result.brand)).not.toContain('checkId')
    expectNothingInternal(result)
  })

  it('Entwurf: 404', async () => {
    const tables = fakeInsightsTables([brandRow('m4', { slug: 'marke-entwurf', state: 'draft' })])
    const run = await read(load, tables, 'marke-entwurf')
    expect(run.status).toBe(404)
  })

  it('entfernt: nur der Grabstein — Zeichen, Geschichte, Quellen und Beiträge leer', async () => {
    const tables = fakeInsightsTables([
      brandRow('m5', {
        slug: 'marke-entfernt',
        state: 'removed',
        removedAt: '2026-10-01',
        removalReason: 'Auf Wunsch entfernt',
        history: [{ year: 1990, text: 'Gegründet', sourceIndex: 0 }],
        sources: [{ url: 'https://example.test/quelle', kind: 'own-data' }],
      }),
      postRow('q3', { slug: 'artikel-ueber-entfernte', brandRefs: ref('m5') }),
    ])
    const run = await read(load, tables, 'marke-entfernt')
    expect(run.status).toBe(200)
    const result = run.result as { brand: { marks: unknown[], history: unknown[], sources: unknown[], relations: unknown[] }, posts: unknown[], score: unknown }
    expect(result.brand.marks).toEqual([])
    expect(result.brand.history).toEqual([])
    expect(result.brand.sources).toEqual([])
    expect(result.posts).toEqual([])
    expect(result.score).toBeNull()
    expectNothingInternal(result)
  })

  it('Profile zu: auch eine veröffentlichte Marke ist 404', async () => {
    const tables = fakeInsightsTables([brandRow('m6', { slug: 'marke-zu' })])
    const run = await read(load, tables, 'marke-zu', { publicFormats: ['article'] })
    expect(run.status).toBe(404)
  })
})
