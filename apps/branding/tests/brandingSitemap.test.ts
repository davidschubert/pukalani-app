import { describe, expect, it } from 'vitest'
import {
  BRANDING_ROUTES,
  brandingRobotsTxt,
  brandingSitemapXml,
  dePathFor,
  escapeXmlText,
  sitemapLastmod,
} from '../server/utils/brandingSitemap'

/**
 * DIE SITEMAP VON branding.supply (Discover D4) — pur geprüft, ohne Server.
 *
 * Fünf Aussagen, die man beim Umbauen still kaputt macht:
 *  1. Jede Adresse kommt ZWEIMAL vor (en ohne Prefix, de unter /de) und trägt
 *     ihre drei hreflang-Alternates.
 *  2. Die Startseite ist `<origin>` und `<origin>/de` — nie `<origin>/` oder
 *     `<origin>/de/`.
 *  3. `lastmod` steht NUR da, wo ein echtes Datum vorliegt.
 *  4. Was `noindex` trägt oder hinter der Anmeldung liegt, steht NICHT drin.
 *  5. Der Origin wird escaped, bevor er in `<loc>` und in ein href läuft.
 */

describe('branding: die feste Routen-Liste', () => {
  it('führt die öffentlichen Seiten und KEINE noindex-Seite', () => {
    const paths = BRANDING_ROUTES.map(route => route.path)
    expect(paths).toEqual([
      '/',
      '/brand-check',
      '/discover',
      '/insights',
      '/erstgespraech',
      '/brand-check/ranking',
      '/brand-check/methodik',
      '/about',
      '/team',
    ])

    // Die Ausschlüsse beim Namen — sonst ist ein Weglassen ein Versehen und
    // keine Entscheidung: Ergebnis- und Vergleichsseite tragen `noindex`,
    // Einladung und Wartelisten-Bestätigung brauchen einen Token, Wizard und
    // Dashboard liegen hinter der Anmeldung, die Rechtstexte sind bis BS1 R3
    // Entwürfe (`PAGE_DRAFT_ROBOTS`). `/beispiel/kailua-coffee` ist gelöscht
    // und antwortet 301 auf die Anatomie — eine Redirect-Quelle gehört in
    // keine Sitemap.
    for (const excluded of [
      // `/rankings` hängt am Riegel `publicFormats` und kommt deshalb
      // DYNAMISCH aus dem insights-Layer (BI1 I3) — eine feste Zeile hier
      // böte einem Crawler eine leere Seite an.
      '/rankings',
      '/topics/rebranding',
      '/beispiel/kailua-coffee',
      '/brand-check/vergleich',
      '/invite',
      '/waitlist/confirm',
      '/imprint',
      '/privacy',
      '/terms',
    ]) {
      expect(paths).not.toContain(excluded)
    }
    for (const prefix of ['/dashboard', '/brand/']) {
      expect(paths.some(path => path.startsWith(prefix))).toBe(false)
    }
  })

  it('vergibt jede Adresse nur einmal und bleibt in 0.0–1.0', () => {
    expect(new Set(BRANDING_ROUTES.map(route => route.path)).size).toBe(BRANDING_ROUTES.length)
    for (const route of BRANDING_ROUTES) {
      expect(route.priority).toBeGreaterThan(0)
      expect(route.priority).toBeLessThanOrEqual(1)
      // Die festen Seiten tragen bewusst kein Datum (s. Kopf der Liste).
      expect(route.lastmod).toBeUndefined()
    }
  })
})

describe('branding: EN-Pfad → DE-Pfad', () => {
  it('die Startseite ist /de, nicht /de/', () => {
    expect(dePathFor('/')).toBe('/de')
    expect(dePathFor('/about')).toBe('/de/about')
    expect(dePathFor('/discover/kailua-coffee-co')).toBe('/de/discover/kailua-coffee-co')
  })
})

describe('branding: lastmod nur mit echtem Datum', () => {
  it('leer, undefined und Unlesbares ergeben KEIN lastmod', () => {
    expect(sitemapLastmod(undefined)).toBe('')
    expect(sitemapLastmod(null)).toBe('')
    expect(sitemapLastmod('   ')).toBe('')
    expect(sitemapLastmod('irgendwann')).toBe('')
  })

  it('ein echtes Datum wird zu ISO 8601', () => {
    expect(sitemapLastmod('2026-09-05T10:00:00.000Z')).toBe('2026-09-05T10:00:00.000Z')
    expect(sitemapLastmod('2026-09-05')).toBe('2026-09-05T00:00:00.000Z')
  })
})

describe('branding: das XML', () => {
  const xml = brandingSitemapXml('https://branding.supply', [
    { path: '/', priority: 1.0 },
    { path: '/discover/kailua-coffee-co', priority: 0.6, lastmod: '2026-09-05T10:00:00.000Z' },
  ])

  it('nennt jede Adresse in beiden Sprachen', () => {
    expect(xml).toContain('<loc>https://branding.supply</loc>')
    expect(xml).toContain('<loc>https://branding.supply/de</loc>')
    expect(xml).toContain('<loc>https://branding.supply/discover/kailua-coffee-co</loc>')
    expect(xml).toContain('<loc>https://branding.supply/de/discover/kailua-coffee-co</loc>')
    expect(xml.match(/<url>/g)).toHaveLength(4)
  })

  it('trägt an jeder URL die drei hreflang-Alternates', () => {
    expect(xml.match(/hreflang="x-default"/g)).toHaveLength(4)
    expect(xml.match(/hreflang="en"/g)).toHaveLength(4)
    expect(xml.match(/hreflang="de"/g)).toHaveLength(4)
    // x-default zeigt auf die EN-Fassung (Default-Locale ohne Prefix).
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="x-default" href="https://branding.supply"/>')
  })

  it('setzt lastmod NUR an der Anatomie', () => {
    expect(xml.match(/<lastmod>/g)).toHaveLength(2)
    expect(xml).toContain('<lastmod>2026-09-05T10:00:00.000Z</lastmod>')
  })

  it('ist ein wohlgeformtes Dokument mit genau einem urlset', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset ')).toBe(true)
    expect(xml.endsWith('</urlset>\n')).toBe(true)
  })

  it('escaped den Origin — & ist ein gültiges Host-Zeichen und in XML ein Syntaxfehler', () => {
    const hostile = brandingSitemapXml('https://a&b"c', [{ path: '/', priority: 1 }])
    expect(hostile).toContain('<loc>https://a&amp;b&quot;c</loc>')
    expect(hostile).not.toContain('a&b')
  })

  it('schluckt einen Schrägstrich am Ende des Origins', () => {
    expect(brandingSitemapXml('https://branding.supply/', [{ path: '/', priority: 1 }]))
      .toContain('<loc>https://branding.supply</loc>')
  })
})

describe('branding: robots.txt', () => {
  const body = brandingRobotsTxt('https://branding.supply')

  it('lädt ein und sperrt genau drei Bereiche', () => {
    expect(body).toContain('User-agent: *')
    expect(body).toContain('Allow: /')
    expect(body).toContain('Disallow: /api/')
    expect(body).toContain('Disallow: /dashboard/')
    expect(body).toContain('Disallow: /brand/')
    expect(body.match(/^Disallow:/gm)).toHaveLength(3)
  })

  it('verweist mit ABSOLUTER Adresse auf die Sitemap', () => {
    expect(body).toContain('Sitemap: https://branding.supply/sitemap.xml')
    expect(brandingRobotsTxt('https://branding.supply/'))
      .toContain('Sitemap: https://branding.supply/sitemap.xml')
  })
})

describe('branding: XML-Escape', () => {
  it('deckt die vier Zeichen ab, die ein Dokument brechen', () => {
    expect(escapeXmlText('&<>"')).toBe('&amp;&lt;&gt;&quot;')
    // `&` zuerst — sonst würden die eigenen Entities noch einmal escaped.
    expect(escapeXmlText('a&amp;b')).toBe('a&amp;amp;b')
  })
})

/**
 * NUR DIE SPRACHEN, DIE ES GIBT (BI1 I3, Plan BRAND-INSIGHTS §9.5:
 * „hreflang nur auf vorhandene Fassungen").
 *
 * Die Gegenprobe ist hier die wichtigere Hälfte: ein Zuschnitt, der IMMER
 * greift, nähme jeder gewöhnlichen Seite ihre zweite Sprache — und das fiele
 * erst auf, wenn die halbe Site aus dem deutschen Index fällt.
 */
describe('branding: Sitemap-Einträge mit nur EINER Sprache', () => {
  it('ein Beitrag ohne redigierte Übersetzung steht nur EINMAL drin', () => {
    const xml = brandingSitemapXml('https://branding.supply', [
      { path: '/insights/only-english', priority: 0.5, locales: ['en'] },
    ])
    expect(xml).toContain('<loc>https://branding.supply/insights/only-english</loc>')
    expect(xml).not.toContain('<loc>https://branding.supply/de/insights/only-english</loc>')
    expect(xml.match(/<url>/g)).toHaveLength(1)
    expect(xml.match(/hreflang="de"/g)).toBeNull()
    expect(xml.match(/hreflang="en"/g)).toHaveLength(1)
  })

  it('x-default zeigt auf DE, wenn es EN gar nicht gibt', () => {
    const xml = brandingSitemapXml('https://branding.supply', [
      { path: '/insights/nur-deutsch', priority: 0.5, locales: ['de'] },
    ])
    expect(xml).toContain('<loc>https://branding.supply/de/insights/nur-deutsch</loc>')
    expect(xml).not.toContain('<loc>https://branding.supply/insights/nur-deutsch</loc>')
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="x-default" href="https://branding.supply/de/insights/nur-deutsch"/>')
    expect(xml.match(/hreflang="en"/g)).toBeNull()
  })

  it('GEGENPROBE: ohne `locales` bleibt alles zweisprachig', () => {
    const xml = brandingSitemapXml('https://branding.supply', [
      { path: '/about', priority: 0.5 },
    ])
    expect(xml.match(/<url>/g)).toHaveLength(2)
    expect(xml.match(/hreflang="en"/g)).toHaveLength(2)
    expect(xml.match(/hreflang="de"/g)).toHaveLength(2)
  })

  it('GEGENPROBE: `locales: [en, de]` ist dasselbe wie kein Eintrag', () => {
    const withBoth = brandingSitemapXml('https://x', [{ path: '/about', priority: 0.5, locales: ['en', 'de'] }])
    const without = brandingSitemapXml('https://x', [{ path: '/about', priority: 0.5 }])
    expect(withBoth).toBe(without)
  })
})
