import { describe, expect, it } from 'vitest'
import {
  MARKET_MAX_PAGES,
  marketPageMarker,
  marketPathBlocked,
  marketPathRank,
  marketTdmReserved,
  normalizeMarketUrl,
  selectMarketPages,
  splitMarketRawText,
} from '../shared/marketCrawlRules'

/**
 * DIE REINEN ABRUF-REGELN (Plan §2.9 Nr. 1/2/8, §7.4) — jede Zusage mit
 * GEGENPROBE.
 *
 * Die Gegenproben sind hier die eigentliche Arbeit: eine Sperrliste, die zu
 * viel sperrt, fällt nur auf, wenn jemand prüft, dass die richtigen Seiten
 * noch durchkommen — und ein Vorbehalts-Test, der nur `true`-Fälle kennt,
 * würde von einer Funktion bestanden, die immer „Vorbehalt" sagt und damit
 * jeden Wettbewerber ausschlösse.
 */

describe('normalizeMarketUrl', () => {
  it('ergänzt https, senkt den Host und wirft Fragment und Tracking weg', () => {
    const result = normalizeMarketUrl('  Example.COM/Preise?utm_source=news&lang=de#oben  ')
    expect(result?.url).toBe('https://example.com/Preise?lang=de')
    expect(result?.hostKey).toBe('example.com')
  })

  it('`www.` zählt beim Dubletten-Schlüssel nicht mit, bleibt aber in der Adresse', () => {
    const withWww = normalizeMarketUrl('https://www.example.com/')
    const without = normalizeMarketUrl('https://example.com/')
    expect(withWww?.hostKey).toBe(without?.hostKey)
    expect(withWww?.url).toContain('www.example.com')
  })

  it('lässt einen leeren Query nicht als `?` zurück', () => {
    expect(normalizeMarketUrl('https://example.com/x?utm_source=a')?.url).toBe('https://example.com/x')
  })

  it('ein ABWEICHENDER Port gehört zum Dubletten-Schlüssel, ein üblicher nicht', () => {
    expect(normalizeMarketUrl('https://example.com:443/')?.hostKey).toBe('example.com')
    expect(normalizeMarketUrl('http://example.com:8080/')?.hostKey).toBe('example.com:8080')
    // GEGENPROBE: zwei Dienste auf demselben Host sind zwei Kandidaten.
    expect(normalizeMarketUrl('http://example.com:8080/')?.hostKey)
      .not.toBe(normalizeMarketUrl('http://example.com:9090/')?.hostKey)
  })

  it('GEGENPROBE: was keine Website-Adresse ist, wird abgelehnt', () => {
    expect(normalizeMarketUrl('')).toBeNull()
    expect(normalizeMarketUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeMarketUrl('ftp://example.com')).toBeNull()
    expect(normalizeMarketUrl('https://user:pw@example.com')).toBeNull()
    // Ein Host ohne Punkt ist kein öffentlicher Name.
    expect(normalizeMarketUrl('http://localhost:3000')).toBeNull()
    expect(normalizeMarketUrl('intranet')).toBeNull()
  })
})

describe('marketPathBlocked', () => {
  it('sperrt Personenbezug, Rechtstexte, Funktionsseiten und Tagesaktuelles', () => {
    for (const path of [
      '/team', '/ueber-uns/team', '/impressum', '/kontakt', '/jobs', '/presse',
      '/datenschutz', '/agb', '/terms', '/cookies',
      '/login', '/warenkorb', '/checkout', '/account',
      '/blog', '/news/2026/mai', '/blog.html',
    ]) {
      expect(marketPathBlocked(`https://example.com${path}`), path).toBe(true)
    }
  })

  it('sperrt Dateien, die keine Seiten sind', () => {
    expect(marketPathBlocked('https://example.com/handbuch.pdf')).toBe(true)
    expect(marketPathBlocked('https://example.com/bild.jpg')).toBe(true)
  })

  it('GEGENPROBE: die Seiten, die etwas über die Marke sagen, kommen durch', () => {
    for (const path of [
      '/', '/about', '/ueber-uns', '/leistungen', '/angebot', '/preise',
      '/philosophie', '/faq', '/produkte/kaffee',
      // Segmentweise geprüft, nicht als Teilzeichenkette: das hier ist kein
      // Team-Pfad, auch wenn „team" darin vorkommt.
      '/teamwork-software',
    ]) {
      expect(marketPathBlocked(`https://example.com${path}`), path).toBe(false)
    }
  })
})

describe('marketPathRank + selectMarketPages', () => {
  const start = 'https://example.com/'

  it('die Startseite ist immer 0, `about` schlägt Unbekanntes', () => {
    expect(marketPathRank(start, start)).toBe(0)
    expect(marketPathRank('https://example.com/ueber-uns', start))
      .toBeLessThan(marketPathRank('https://example.com/irgendwas', start))
  })

  it('wählt Startseite zuerst, dann nach Rang, ohne Sperrliste und ohne Fremde', () => {
    const pages = selectMarketPages(start, [
      'https://example.com/impressum',
      'https://fremd.example/about',
      'https://example.com/faq',
      'https://example.com/leistungen',
      'https://example.com/ueber-uns',
      'https://example.com/ueber-uns/',
    ])
    expect(pages[0]).toBe(start)
    expect(pages).toContain('https://example.com/ueber-uns')
    // Reihenfolge: about (10) vor Leistungen (30) vor FAQ (50).
    expect(pages.indexOf('https://example.com/ueber-uns'))
      .toBeLessThan(pages.indexOf('https://example.com/leistungen'))
    expect(pages.indexOf('https://example.com/leistungen'))
      .toBeLessThan(pages.indexOf('https://example.com/faq'))
    // GEGENPROBE: gesperrt, fremd und doppelt (mit/ohne Schrägstrich) fehlen.
    expect(pages).not.toContain('https://example.com/impressum')
    expect(pages).not.toContain('https://fremd.example/about')
    expect(pages).not.toContain('https://example.com/ueber-uns/')
  })

  it('hält den Seiten-Deckel ein', () => {
    const many = Array.from({ length: 40 }, (_, index) => `https://example.com/seite-${index}`)
    expect(selectMarketPages(start, many)).toHaveLength(MARKET_MAX_PAGES)
  })
})

describe('marketTdmReserved', () => {
  it('erkennt den Kopf `TDM-Reservation: 1`', () => {
    expect(marketTdmReserved({ headers: { 'tdm-reservation': '1' } })).toBe(true)
  })

  it('erkennt `noai`/`noimageai` im robots-Meta und den tdm-reservation-Meta', () => {
    expect(marketTdmReserved({ metaRobots: ['index', 'noai'] })).toBe(true)
    expect(marketTdmReserved({ metaRobots: ['noimageai'] })).toBe(true)
    expect(marketTdmReserved({ metaTdm: ['1'] })).toBe(true)
  })

  it('erkennt tdmrep.json — mit und ohne Pfad-Einschränkung', () => {
    const json = JSON.stringify([{ location: '/premium', 'tdm-reservation': 1 }])
    expect(marketTdmReserved({ tdmrepJson: json, path: '/premium/x' })).toBe(true)
    // GEGENPROBE: derselbe Eintrag, ein anderer Pfad — kein Vorbehalt.
    expect(marketTdmReserved({ tdmrepJson: json, path: '/about' })).toBe(false)
  })

  it('FAIL-CLOSED: eine vorhandene, aber unlesbare tdmrep.json gilt als Vorbehalt', () => {
    expect(marketTdmReserved({ tdmrepJson: '{ das ist kein json' })).toBe(true)
  })

  it('GEGENPROBE: ohne jedes Signal gibt es keinen Vorbehalt', () => {
    expect(marketTdmReserved({})).toBe(false)
    expect(marketTdmReserved({
      headers: { 'tdm-reservation': '0', 'content-type': 'text/html' },
      metaRobots: ['index', 'follow'],
      metaTdm: ['0'],
      tdmrepJson: JSON.stringify([{ location: '/', 'tdm-reservation': 0 }]),
      path: '/',
    })).toBe(false)
  })
})

describe('marketPageMarker + splitMarketRawText', () => {
  it('gewinnt die Seiten aus dem gespeicherten Rohtext zurück', () => {
    const raw = `${marketPageMarker('https://a.example/')}Erste Seite.${marketPageMarker('https://a.example/about')}Zweite Seite.`
    const pages = splitMarketRawText(raw)
    expect([...pages.keys()]).toEqual(['https://a.example/', 'https://a.example/about'])
    expect(pages.get('https://a.example/')?.trim()).toBe('Erste Seite.')
    expect(pages.get('https://a.example/about')?.trim()).toBe('Zweite Seite.')
  })
})
