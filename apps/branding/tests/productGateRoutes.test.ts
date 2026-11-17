import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * VORSCHAUBILDER UND SITEMAP FOLGEN DEM NOT-AUS (WL1 b, 2026-11-17).
 *
 * Die Routen unter `/api/discover` und `/api/insights` hält die zentrale
 * Produkt-Sperre an (sie liegen unter den `apiPrefixes`). Die Bild-Routen
 * `/og/…` und die Sitemap sind Seiten-Routen der App, lesen aber dieselben
 * Daten — und antworteten weiter, wenn das Produkt abgeschaltet war.
 *
 * Geprüft wird die Route selbst (geladen und ausgeführt), nicht ihr Quelltext:
 *  - Schalter AN ⇒ Bild und Einträge kommen (die Gegenprobe — ohne sie wäre
 *    „antwortet nicht" auch bei einer kaputten Route grün),
 *  - Schalter AUS ⇒ 404 und KEIN Datenzugriff; die Sitemap bleibt bei den
 *    festen Seiten.
 */

type Handler = (event: unknown) => Promise<unknown>

const enabled = new Set<string>()
const reads: string[] = []

function httpError(input: { status: number, statusText: string }): Error {
  return Object.assign(new Error(input.statusText), input)
}

beforeEach(() => {
  enabled.clear()
  reads.length = 0
  vi.resetModules()

  vi.stubGlobal('defineEventHandler', (handler: Handler) => handler)
  vi.stubGlobal('createError', httpError)
  vi.stubGlobal('getRouterParam', (event: { slug: string }) => event.slug)
  vi.stubGlobal('setHeader', () => {})
  vi.stubGlobal('logEvent', () => {})
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { i18n: { baseUrl: 'https://example.test' } } }))
  vi.stubGlobal('getRequestURL', () => new URL('https://example.test/'))

  vi.stubGlobal('isProductEnabled', async (_event: unknown, key: string) => enabled.has(key))
  vi.stubGlobal('requireProduct', async (_event: unknown, key: string) => {
    if (!enabled.has(key)) throw httpError({ status: 404, statusText: 'Not found' })
  })

  vi.stubGlobal('loadPublishedBrandPublication', async () => {
    reads.push('publication')
    return { slug: 'acme', title: 'Acme', paletteId: '', $updatedAt: '2026-11-01T00:00:00.000Z' }
  })
  vi.stubGlobal('listPublishedBrandPublications', async () => {
    reads.push('publications')
    return [{ slug: 'acme', updatedAt: '2026-11-01T00:00:00.000Z', publishedAt: '' }]
  })
  vi.stubGlobal('findPublicInsightsPost', async () => {
    reads.push('insights-post')
    return {
      kind: 'post',
      hit: {
        row: { slug: 'story', $updatedAt: '2026-11-01T00:00:00.000Z' },
        post: { brandRefs: [], baseLocale: 'en', titleDe: 'Geschichte', titleEn: 'Story' },
      },
    }
  })
  vi.stubGlobal('loadInsightsBrandRowsByIds', async () => new Map())
  vi.stubGlobal('listInsightsSitemapEntries', async () => {
    reads.push('insights-entries')
    return [{ path: '/insights/story', lastmod: '', locales: ['en'] }]
  })

  // Das Bild selbst zeichnet ein eigener Test (`discoverOgImage.test.ts`).
  vi.doMock('../server/utils/discoverOgImage', () => ({
    DISCOVER_OG_WORDMARK: 'test',
    discoverOgCacheKey: (slug: string) => slug,
    discoverOgPng: async () => Buffer.from('png'),
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.doUnmock('../server/utils/discoverOgImage')
})

async function load(path: string): Promise<Handler> {
  return (await import(path)).default as Handler
}

describe('Vorschaubild der Galerie (/og/discover)', () => {
  it('antwortet mit dem Bild, solange `brand` an ist', async () => {
    enabled.add('brand')
    const handler = await load('../server/routes/og/discover/[slug].get')
    expect(Buffer.isBuffer(await handler({ slug: 'acme.png' }))).toBe(true)
    expect(reads).toEqual(['publication'])
  })

  it('antwortet 404 und liest nichts, wenn `brand` abgeschaltet ist', async () => {
    const handler = await load('../server/routes/og/discover/[slug].get')
    await expect(handler({ slug: 'acme.png' })).rejects.toMatchObject({ status: 404 })
    expect(reads).toEqual([])
  })
})

describe('Vorschaubild eines Artikels (/og/insights)', () => {
  it('antwortet mit dem Bild, solange `brand` und `insights` an sind', async () => {
    enabled.add('brand')
    enabled.add('insights')
    const handler = await load('../server/routes/og/insights/[slug].get')
    expect(Buffer.isBuffer(await handler({ slug: 'story.png' }))).toBe(true)
    expect(reads).toEqual(['insights-post'])
  })

  it.each([
    ['insights', ['brand']],
    ['brand', ['insights']],
  ])('antwortet 404 und liest nichts, wenn `%s` abgeschaltet ist', async (_off, on) => {
    for (const key of on) enabled.add(key)
    const handler = await load('../server/routes/og/insights/[slug].get')
    await expect(handler({ slug: 'story.png' })).rejects.toMatchObject({ status: 404 })
    expect(reads).toEqual([])
  })
})

describe('Sitemap', () => {
  it('führt Anatomien und Artikel, solange beide Produkte an sind', async () => {
    enabled.add('brand')
    enabled.add('insights')
    const xml = String(await (await load('../server/routes/sitemap.xml.get'))({}))
    expect(xml).toContain('https://example.test/discover/acme')
    expect(xml).toContain('https://example.test/insights/story')
  })

  it('führt die zwei festen Übersichten, solange beide Produkte an sind (Gegenprobe zu WL1 d)', async () => {
    enabled.add('brand')
    enabled.add('insights')
    const xml = String(await (await load('../server/routes/sitemap.xml.get'))({}))
    expect(xml).toContain('<loc>https://example.test/discover</loc>')
    expect(xml).toContain('<loc>https://example.test/insights</loc>')
  })

  it('bleibt bei den festen Seiten und liest nichts, wenn `brand` abgeschaltet ist', async () => {
    enabled.add('insights')
    const xml = String(await (await load('../server/routes/sitemap.xml.get'))({}))
    expect(xml).toContain('<loc>https://example.test/brand-check</loc>')
    expect(xml).not.toContain('/discover/acme')
    expect(xml).not.toContain('/insights/story')
    // WL1 d: auch die zwei festen Übersichten fallen — sie wären leer.
    expect(xml).not.toContain('<loc>https://example.test/discover</loc>')
    expect(xml).not.toContain('<loc>https://example.test/insights</loc>')
    expect(xml).not.toContain('/de/discover')
    expect(xml).not.toContain('/de/insights')
    expect(reads).toEqual([])
  })

  it('lässt nur die Artikel und das Journal weg, wenn `insights` abgeschaltet ist', async () => {
    enabled.add('brand')
    const xml = String(await (await load('../server/routes/sitemap.xml.get'))({}))
    expect(xml).toContain('https://example.test/discover/acme')
    expect(xml).toContain('<loc>https://example.test/discover</loc>')
    expect(xml).not.toContain('/insights/story')
    expect(xml).not.toContain('<loc>https://example.test/insights</loc>')
    expect(reads).toEqual(['publications'])
  })

  it('lässt sich der Schalter nicht lesen, bleibt die Sitemap vollständig', async () => {
    vi.stubGlobal('isProductEnabled', async () => {
      throw new Error('config unavailable')
    })
    const xml = String(await (await load('../server/routes/sitemap.xml.get'))({}))
    expect(xml).toContain('<loc>https://example.test/discover</loc>')
    expect(xml).toContain('<loc>https://example.test/insights</loc>')
    expect(xml).toContain('https://example.test/discover/acme')
    expect(xml).toContain('https://example.test/insights/story')
  })
})
