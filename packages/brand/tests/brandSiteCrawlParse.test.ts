import { describe, expect, it } from 'vitest'
import {
  extractInternalLinks,
  extractJsonLdOrganization,
  extractMetaDirectives,
  parseSitemap,
  sitemapUrlsFromRobots,
} from '../shared/brandSiteCrawlParse'

/**
 * DIE PUREN LESE-REGELN DES GETEILTEN MEHRSEITEN-ABRUFS (MV1 M2, Plan
 * docs/archiv/BRAND-MARKTVERGLEICH.md §7.4) — je mit GEGENPROBE.
 *
 * Sie liegen im brand-Layer, weil der Abruf geteilt ist (der Brand-Check darf
 * sie später nutzen); geprüft werden sie deshalb auch hier.
 */

describe('extractInternalLinks', () => {
  const html = `
    <a href="/about">Über uns</a>
    <a href="preise">Preise</a>
    <a href="https://example.test/faq#unten">FAQ</a>
    <a href="https://fremd.test/about">Fremd</a>
    <a href="mailto:hallo@example.test">Mail</a>
    <a href="tel:+4930123">Telefon</a>
    <a href="javascript:void(0)">Skript</a>
    <a href="#oben">Anker</a>
    <a href="/about">Noch mal dieselbe</a>
  `

  it('löst relativ auf, bleibt beim Ursprung und wirft das Fragment weg', () => {
    const links = extractInternalLinks(html, 'https://example.test/start/')
    expect(links).toContain('https://example.test/about')
    expect(links).toContain('https://example.test/start/preise')
    expect(links).toContain('https://example.test/faq')
  })

  it('GEGENPROBE: fremder Ursprung, Nicht-Seiten und Dubletten fehlen', () => {
    const links = extractInternalLinks(html, 'https://example.test/start/')
    expect(links.filter(url => url === 'https://example.test/about')).toHaveLength(1)
    expect(links.some(url => url.includes('fremd.test'))).toBe(false)
    expect(links.some(url => url.startsWith('mailto:'))).toBe(false)
    expect(links.some(url => url.startsWith('tel:'))).toBe(false)
    expect(links.some(url => url.startsWith('javascript:'))).toBe(false)
  })
})

describe('extractMetaDirectives', () => {
  it('sammelt robots- und tdm-reservation-Werte, zerlegt an Kommas', () => {
    const directives = extractMetaDirectives(`
      <meta name="robots" content="index, follow, noai">
      <meta name="googlebot" content="noimageai">
      <meta name="tdm-reservation" content="1">
      <meta name="description" content="Kein Robots-Tag">
    `)
    expect(directives.robots).toContain('noai')
    expect(directives.robots).toContain('noimageai')
    expect(directives.robots).toContain('index')
    expect(directives.tdmReservation).toEqual(['1'])
  })

  it('GEGENPROBE: eine Seite ohne Anweisungen liefert leere Listen', () => {
    const directives = extractMetaDirectives('<meta name="description" content="nur Text">')
    expect(directives.robots).toHaveLength(0)
    expect(directives.tdmReservation).toHaveLength(0)
  })

  it('GEGENPROBE: ein AUSKOMMENTIERTES Tag zählt nicht', () => {
    expect(extractMetaDirectives('<!-- <meta name="robots" content="noai"> -->').robots).toHaveLength(0)
  })
})

describe('extractJsonLdOrganization', () => {
  it('findet die Organisation auch im @graph', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', 'name': 'Website-Eintrag' },
        { '@type': ['Organization', 'LocalBusiness'], 'name': 'Upcountry Roast', 'slogan': 'Coffee with a story.', 'description': 'Kleine Röstungen.' },
      ],
    })}</script>`
    expect(extractJsonLdOrganization(html)).toEqual({
      name: 'Upcountry Roast',
      slogan: 'Coffee with a story.',
      description: 'Kleine Röstungen.',
    })
  })

  it('überspringt einen kaputten Block und liest den nächsten', () => {
    const html = [
      '<script type="application/ld+json">{ kaputt </script>',
      `<script type="application/ld+json">${JSON.stringify({ '@type': 'Organization', 'name': 'Zweiter Block' })}</script>`,
    ].join('')
    expect(extractJsonLdOrganization(html)?.name).toBe('Zweiter Block')
  })

  it('GEGENPROBE: ohne Organisation gibt es nichts', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'BreadcrumbList', 'name': 'Pfad' })}</script>`
    expect(extractJsonLdOrganization(html)).toBeNull()
    expect(extractJsonLdOrganization('<p>gar kein JSON-LD</p>')).toBeNull()
  })
})

describe('parseSitemap + sitemapUrlsFromRobots', () => {
  it('trennt Seiten von Kind-Sitemaps', () => {
    const index = `<?xml version="1.0"?><sitemapindex>
      <sitemap><loc>https://example.test/sitemap-1.xml</loc></sitemap>
      <sitemap><loc>https://example.test/sitemap-2.xml</loc></sitemap>
    </sitemapindex>`
    const parsed = parseSitemap(index)
    expect(parsed.children).toEqual(['https://example.test/sitemap-1.xml', 'https://example.test/sitemap-2.xml'])
    // GEGENPROBE: die Kind-Adressen dürfen NICHT als Seiten auftauchen — sonst
    // versuchte der Abruf, eine XML-Datei als Seite zu lesen.
    expect(parsed.urls).toHaveLength(0)
  })

  it('liest ein gewöhnliches urlset', () => {
    const urlset = `<urlset><url><loc>https://example.test/</loc></url><url><loc>https://example.test/about</loc></url></urlset>`
    expect(parseSitemap(urlset).urls).toEqual(['https://example.test/', 'https://example.test/about'])
  })

  it('findet die Sitemap-Zeile in einer robots.txt', () => {
    const robots = 'User-agent: *\nDisallow:\nSitemap: https://example.test/sitemap.xml\n'
    expect(sitemapUrlsFromRobots(robots)).toEqual(['https://example.test/sitemap.xml'])
    // GEGENPROBE: ohne die Zeile ist die Liste leer.
    expect(sitemapUrlsFromRobots('User-agent: *\nDisallow:')).toHaveLength(0)
  })
})
