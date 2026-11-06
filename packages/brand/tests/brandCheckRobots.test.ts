import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BRAND_ROBOTS_ABSENT, brandRobotsAllows, parseBrandRobots } from '../shared/brandRobots'
import { brandTdmReserved } from '../shared/brandTdm'
import { BRAND_CHECK_BOT_TOKEN, BRAND_CHECK_USER_AGENT, BRAND_SITE_USER_AGENT } from '../server/utils/brandSiteFetch'
import { BRAND_MARKET_BOT_TOKEN } from '../server/utils/brandSiteCrawl'

/**
 * DIE ERLAUBNIS-REGELN DES BRAND-CHECKS (BS1 R2b, Davids Entscheidung
 * 2026-09-08).
 *
 * ── WAS HIER GEPRÜFT WIRD UND WAS NICHT ───────────────────────────────────
 * Die REGELN selbst (robots-Gruppen, Längenvergleich, die vier Formen des
 * Vorbehalts) sind seit R2b aus dem market-Layer hierher gezogen und werden
 * dort UNVERÄNDERT weiter gefahren — `packages/market/tests/marketRobots.test.ts`
 * und `marketCrawlRules.test.ts` laufen über die dünnen Hüllen und wären rot,
 * wenn der Umzug etwas verändert hätte. Diese Datei prüft deshalb genau das,
 * was am Brand-Check NEU ist: dass er einen EIGENEN Absender hat, dass sein
 * robots-Token wirklich zu diesem Absender passt, und dass die vier Formen
 * des Vorbehalts unter den brand-Namen dieselben Antworten geben.
 *
 * Die REIHENFOLGE (erst fragen, dann lesen) und die Fehlercodes hängen an
 * Route und Netz und werden im Beweis-Skript gemessen:
 * `packages/brand/scripts/verify-brand-check-robots.mjs`.
 */

describe('Der Brand-Check hat einen eigenen Absender', () => {
  it('ist NICHT der des Wizards — zwei Vorgänge, zwei Namen', () => {
    expect(BRAND_CHECK_USER_AGENT).not.toBe(BRAND_SITE_USER_AGENT)
    expect(BRAND_CHECK_USER_AGENT).toContain('PukalaniBrandCheck')
  })

  it('ist NICHT der des Marktvergleichs — der liest mehr Seiten und darf anders behandelt werden', () => {
    expect(BRAND_CHECK_BOT_TOKEN).not.toBe(BRAND_MARKET_BOT_TOKEN)
  })

  it('das robots-Token ist der kleingeschriebene Präfix des Absenders', () => {
    // Sonst prüfte der Server eine Gruppe, die kein Betreiber je schreiben
    // würde — und `User-agent: PukalaniBrandCheck` bliebe wirkungslos.
    expect(BRAND_CHECK_USER_AGENT.toLowerCase().startsWith(BRAND_CHECK_BOT_TOKEN)).toBe(true)
  })

  it('nennt eine Erklärseite in der +-Adresse', () => {
    expect(BRAND_CHECK_USER_AGENT).toContain('(+https://branding.supply/brand-check/methodik)')
  })
})

describe('robots.txt gegen den Absender des Brand-Checks', () => {
  it('keine Datei heisst erlaubt', () => {
    expect(brandRobotsAllows(BRAND_ROBOTS_ABSENT, BRAND_CHECK_BOT_TOKEN, '/')).toBe(true)
  })

  it('ein allgemeines Verbot gilt auch für uns', () => {
    const robots = parseBrandRobots('User-agent: *\nDisallow: /')
    expect(brandRobotsAllows(robots, BRAND_CHECK_BOT_TOKEN, '/')).toBe(false)
  })

  it('eine Gruppe auf UNSEREN Namen schlägt die Sternchen-Gruppe — in beide Richtungen', () => {
    const closed = parseBrandRobots([
      'User-agent: *',
      'Allow: /',
      '',
      'User-agent: PukalaniBrandCheck',
      'Disallow: /',
    ].join('\n'))
    expect(brandRobotsAllows(closed, BRAND_CHECK_BOT_TOKEN, '/')).toBe(false)

    // GEGENPROBE: derselbe Betreiber darf den Marktvergleich aussperren und
    // den Check zulassen. Genau dafür gibt es zwei Namen.
    const onlyMarketBlocked = parseBrandRobots([
      'User-agent: PukalaniMarketBot',
      'Disallow: /',
    ].join('\n'))
    expect(brandRobotsAllows(onlyMarketBlocked, BRAND_CHECK_BOT_TOKEN, '/')).toBe(true)
    expect(brandRobotsAllows(onlyMarketBlocked, BRAND_MARKET_BOT_TOKEN, '/')).toBe(false)
  })

  it('ein Verbot des WIZARD-Namens trifft den Check nicht — und umgekehrt', () => {
    const robots = parseBrandRobots('User-agent: PukalaniBrandWizard\nDisallow: /')
    expect(brandRobotsAllows(robots, BRAND_CHECK_BOT_TOKEN, '/')).toBe(true)
  })

  it('die Vorbehalts-Datei ist selbst ein Pfad — ein Verbot darauf ist wirksam', () => {
    const robots = parseBrandRobots('User-agent: *\nDisallow: /.well-known/')
    expect(brandRobotsAllows(robots, BRAND_CHECK_BOT_TOKEN, '/.well-known/tdmrep.json')).toBe(false)
    expect(brandRobotsAllows(robots, BRAND_CHECK_BOT_TOKEN, '/')).toBe(true)
  })
})

describe('Nutzungsvorbehalt unter den brand-Namen', () => {
  it('erkennt alle vier Formen', () => {
    expect(brandTdmReserved({ headers: { 'tdm-reservation': '1' } })).toBe(true)
    expect(brandTdmReserved({ metaTdm: ['1'] })).toBe(true)
    expect(brandTdmReserved({ metaRobots: ['index', 'noai'] })).toBe(true)
    expect(brandTdmReserved({ metaRobots: ['noimageai'] })).toBe(true)
    expect(brandTdmReserved({
      tdmrepJson: '[{ "location": "/", "tdm-reservation": 1 }]',
      path: '/',
    })).toBe(true)
  })

  it('ist pfadgenau — ein Vorbehalt für /premium sperrt nicht /about', () => {
    const json = '[{ "location": "/premium", "tdm-reservation": 1 }]'
    expect(brandTdmReserved({ tdmrepJson: json, path: '/premium/x' })).toBe(true)
    expect(brandTdmReserved({ tdmrepJson: json, path: '/about' })).toBe(false)
  })

  it('fail-closed: eine vorhandene, aber unlesbare tdmrep.json gilt als Vorbehalt', () => {
    expect(brandTdmReserved({ tdmrepJson: '{ das ist kein json' })).toBe(true)
  })

  it('GEGENPROBE: eine gewöhnliche Seite ist kein Vorbehalt', () => {
    expect(brandTdmReserved({})).toBe(false)
    expect(brandTdmReserved({
      headers: { 'content-type': 'text/html' },
      metaRobots: ['index', 'follow'],
      metaTdm: ['0'],
    })).toBe(false)
  })
})

describe('Der ehrliche Satz für den Menschen davor', () => {
  const here = dirname(fileURLToPath(import.meta.url))

  function catalog(locale: 'de' | 'en'): Record<string, unknown> {
    return JSON.parse(readFileSync(join(here, '..', 'i18n', 'locales', `${locale}.json`), 'utf8'))
  }

  function textAt(locale: 'de' | 'en', path: string): string {
    let node: unknown = catalog(locale)
    for (const segment of path.split('.')) {
      node = (node as Record<string, unknown> | null)?.[segment]
    }
    return typeof node === 'string' ? node : ''
  }

  /**
   * `site_blocked` ist ein neuer Ablehnungsgrund, und vue-i18n gibt bei einem
   * Loch den SCHLÜSSEL aus — auf einer öffentlichen Seite stünde dann
   * `brand.check.form.errors.siteBlocked` als „Fehlermeldung".
   */
  it('beide Sprachen tragen den Satz — im Formular UND in „Meine Brands"', () => {
    for (const locale of ['de', 'en'] as const) {
      expect(textAt(locale, 'brand.check.form.errors.siteBlocked').length, locale).toBeGreaterThan(20)
      expect(textAt(locale, 'brand.myScores.errors.siteBlocked').length, locale).toBeGreaterThan(20)
    }
  })

  it('GEGENPROBE: ein erfundener Schlüssel steht nicht da', () => {
    expect(textAt('de', 'brand.check.form.errors.siteReserved')).toBe('')
  })

  it('die Formular-Komponente bildet `site_blocked` auf diesen Satz ab', () => {
    const source = readFileSync(join(here, '..', 'app', 'components', 'BwBrandCheckForm.vue'), 'utf8')
    expect(source).toContain("reason === 'site_blocked'")
    expect(source).toContain("'siteBlocked'")
  })
})
