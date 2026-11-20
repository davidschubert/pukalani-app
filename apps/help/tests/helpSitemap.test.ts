import { describe, expect, it } from 'vitest'
import { helpRobotsTxt, helpSitemapPairs, helpSitemapXml } from '../server/utils/helpSitemap'

/**
 * SITEMAP UND robots.txt DER HILFE (SEO-006) — pur geprüft, ohne Server.
 */
describe('Hilfe: Sprach-Paare aus den Inhalten', () => {
  const pairs = helpSitemapPairs(
    ['/anleitung', '/anleitung/erste-schritte', '/entwickler/nur-englisch'],
    ['/de/anleitung', '/de/anleitung/erste-schritte', '/de/anleitung/nur-deutsch'],
  )

  it('die Startseiten kommen von selbst dazu: / und /de, nie /de/', () => {
    expect(pairs.find(pair => pair.en === '/')).toEqual({ en: '/', de: '/de', priority: 1.0 })
  })

  it('eine Seite in beiden Sprachen ist EIN Paar', () => {
    expect(pairs.find(pair => pair.en === '/anleitung/erste-schritte')).toEqual({
      en: '/anleitung/erste-schritte',
      de: '/de/anleitung/erste-schritte',
      priority: 0.6,
    })
  })

  it('eine Seite in nur einer Sprache nennt die andere nicht', () => {
    expect(pairs.find(pair => pair.en === '/entwickler/nur-englisch')?.de).toBeUndefined()
    expect(pairs.find(pair => pair.de === '/de/anleitung/nur-deutsch')?.en).toBeUndefined()
  })

  it('GEGENPROBE: Ordner-Einstellungen (`.navigation`) sind keine Seite', () => {
    const withSettings = helpSitemapPairs(['/anleitung', '/anleitung/.navigation'], ['/de/anleitung/produkte/.navigation'])
    expect(withSettings.map(pair => pair.en ?? pair.de)).toEqual(['/', '/anleitung'])
  })

  it('der Einstieg eines Bereichs wiegt mehr als eine Unterseite', () => {
    expect(pairs.find(pair => pair.en === '/anleitung')?.priority).toBe(0.8)
  })
})

describe('Hilfe: das XML', () => {
  const xml = helpSitemapXml('https://example.test/', helpSitemapPairs(
    ['/anleitung', '/entwickler/nur-englisch'],
    ['/de/anleitung', '/de/anleitung/nur-deutsch'],
  ))

  it('nennt jede vorhandene Adresse genau einmal', () => {
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
    expect(locs).toEqual([
      'https://example.test',
      'https://example.test/de',
      'https://example.test/anleitung',
      'https://example.test/de/anleitung',
      'https://example.test/de/anleitung/nur-deutsch',
      'https://example.test/entwickler/nur-englisch',
    ])
  })

  it('ein Paar trägt drei hreflang-Zeilen, eine einzelne Seite zwei', () => {
    expect(xml).toContain('hreflang="de" href="https://example.test/de/anleitung"')
    const single = xml.split('<url>').find(block => block.includes('<loc>https://example.test/de/anleitung/nur-deutsch</loc>')) ?? ''
    expect(single).toContain('hreflang="x-default" href="https://example.test/de/anleitung/nur-deutsch"')
    expect(single).not.toContain('hreflang="en"')
  })

  it('escaped den Origin und ist ein Dokument mit genau einem urlset', () => {
    expect(helpSitemapXml('https://a&b.test', [{ en: '/', priority: 1 }])).toContain('<loc>https://a&amp;b.test</loc>')
    expect(xml.match(/<urlset /g)).toHaveLength(1)
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
  })
})

describe('Hilfe: robots.txt', () => {
  it('lädt ein, sperrt /api/ und nennt die Sitemap mit absoluter Adresse', () => {
    const lines = helpRobotsTxt('https://example.test/').split('\n')
    expect(lines).toContain('User-agent: *')
    expect(lines).toContain('Disallow: /api/')
    expect(lines).toContain('Sitemap: https://example.test/sitemap.xml')
  })
})
