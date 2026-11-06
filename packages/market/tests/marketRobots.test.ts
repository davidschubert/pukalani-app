import { describe, expect, it } from 'vitest'
import { MARKET_ROBOTS_ABSENT, marketRobotsAllows, parseMarketRobots } from '../shared/marketRobots'

/**
 * DER ROBOTS-PARSER (Plan §2.9 Nr. 1) — mit GEGENPROBE zu jeder Zusage.
 *
 * Die Gegenprobe ist hier nicht Kür: ein Parser, der IMMER `true` sagt,
 * bestünde jeden Test, der nur Erlaubnisse prüft — und wäre die teuerste Art,
 * einen Nutzungsvorbehalt zu übersehen.
 */

const AGENT = 'pukalanimarketbot'

describe('parseMarketRobots + marketRobotsAllows', () => {
  it('ohne robots.txt ist alles erlaubt', () => {
    expect(marketRobotsAllows(MARKET_ROBOTS_ABSENT, AGENT, '/about')).toBe(true)
  })

  it('`Disallow: /` in der *-Gruppe sperrt alles — GEGENPROBE zur Zeile darüber', () => {
    const robots = parseMarketRobots('User-agent: *\nDisallow: /')
    expect(marketRobotsAllows(robots, AGENT, '/about')).toBe(false)
    expect(marketRobotsAllows(robots, AGENT, '/')).toBe(false)
  })

  it('leeres `Disallow:` erlaubt alles', () => {
    const robots = parseMarketRobots('User-agent: *\nDisallow:')
    expect(marketRobotsAllows(robots, AGENT, '/about')).toBe(true)
  })

  it('die längste passende Regel gewinnt — `Allow` schlägt `Disallow: /`', () => {
    const robots = parseMarketRobots('User-agent: *\nDisallow: /\nAllow: /about')
    expect(marketRobotsAllows(robots, AGENT, '/about')).toBe(true)
    // GEGENPROBE: derselbe Regelsatz, ein anderer Pfad — bleibt gesperrt.
    expect(marketRobotsAllows(robots, AGENT, '/preise')).toBe(false)
  })

  it('bei gleicher Länge gewinnt `Allow` (RFC 9309 §2.2.2)', () => {
    const robots = parseMarketRobots('User-agent: *\nDisallow: /shop\nAllow: /shop')
    expect(marketRobotsAllows(robots, AGENT, '/shop')).toBe(true)
  })

  it('die eigene Gruppe schlägt die *-Gruppe VOLLSTÄNDIG', () => {
    const robots = parseMarketRobots([
      'User-agent: *',
      'Disallow:',
      '',
      'User-agent: PukalaniMarketBot',
      'Disallow: /',
    ].join('\n'))
    expect(marketRobotsAllows(robots, AGENT, '/about')).toBe(false)
    // GEGENPROBE: ein FREMDER Absender fällt weiter in die *-Gruppe und darf.
    expect(marketRobotsAllows(robots, 'googlebot', '/about')).toBe(true)
  })

  it('mehrere User-agent-Zeilen hintereinander bilden EINE Gruppe', () => {
    const robots = parseMarketRobots([
      'User-agent: PukalaniMarketBot',
      'User-agent: SomeOtherBot',
      'Disallow: /intern',
    ].join('\n'))
    expect(marketRobotsAllows(robots, AGENT, '/intern/x')).toBe(false)
    expect(marketRobotsAllows(robots, AGENT, '/offen')).toBe(true)
  })

  it('Platzhalter `*` und Anker `$` werden verstanden', () => {
    const robots = parseMarketRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /a*/geheim')
    expect(marketRobotsAllows(robots, AGENT, '/handbuch.pdf')).toBe(false)
    expect(marketRobotsAllows(robots, AGENT, '/abteilung/geheim')).toBe(false)
    // GEGENPROBE: `$` verankert wirklich — mit Query dahinter passt es nicht.
    expect(marketRobotsAllows(robots, AGENT, '/handbuch.pdf.html')).toBe(true)
  })

  it('Kommentare und unbekannte Felder ändern nichts', () => {
    const robots = parseMarketRobots([
      '# nur ein Kommentar',
      'Sitemap: https://example.test/sitemap.xml',
      'Crawl-delay: 10',
      'User-agent: *',
      'Disallow: /login # auch hier',
    ].join('\n'))
    expect(marketRobotsAllows(robots, AGENT, '/login')).toBe(false)
    expect(marketRobotsAllows(robots, AGENT, '/')).toBe(true)
  })

  it('eine Regel VOR jeder Gruppe hat keinen Adressaten und gilt für niemanden', () => {
    const robots = parseMarketRobots('Disallow: /\nUser-agent: *\nAllow: /')
    expect(marketRobotsAllows(robots, AGENT, '/irgendwas')).toBe(true)
  })
})
