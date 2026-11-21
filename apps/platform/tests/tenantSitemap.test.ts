import { describe, expect, it } from 'vitest'
import { aiCrawlerPolicy, aiCrawlerRobotsProblems } from '../../../packages/core/shared/aiCrawlers'
import {
  controlHostRobotsTxt,
  membersOnlyRobotsTxt,
  SITEMAP_TOPIC_LIMIT,
  tenantRobotsTxt,
  tenantSitemapEntries,
  tenantSitemapXml,
} from '../server/utils/tenantSitemap'

/**
 * DIE SITEMAP EINER COMMUNITY (Q10, SEO-003/SEO-004) — die pure Entscheidung.
 * Welche Zeilen öffentlich sind, entscheidet die Route in ihren Abfragen (auf
 * der Bühne bewiesen: scripts/verify-community-search-pages.mjs); hier steht,
 * was aus den gelieferten Zeilen wird, mit Gegenproben.
 */
const ORIGIN = 'https://c.example'
const base = { pageSlugs: ['home', 'imprint'], feed: true }
const discussions = {
  categories: [{ id: 'cat1', slug: 'praxis' }],
  topics: [
    { id: 'p1', categoryId: 'cat1', title: 'Zehn Minuten, die immer gehen', lastmod: '2026-11-20T10:00:00.000+00:00' },
  ],
}

function paths(input: Parameters<typeof tenantSitemapEntries>[0]): string[] {
  return tenantSitemapEntries(input).map(entry => entry.path)
}

describe('tenantSitemapEntries', () => {
  it('nennt Übersicht, Kategorie und Thema einer Diskussion', () => {
    expect(paths({ ...base, discussions })).toEqual([
      '/', '/feed', '/imprint',
      '/discussions', '/discussions/praxis',
      '/discussions/praxis/p1/zehn-minuten-die-immer-gehen',
    ])
  })

  it('nennt Kurse und Termine mit ihren Übersichten', () => {
    const list = paths({ ...base, courses: [{ slug: 'morgenroutine' }], events: [{ id: 'e1' }] })
    expect(list).toEqual(expect.arrayContaining(['/courses', '/courses/morgenroutine', '/events', '/events/e1']))
  })

  it('Gegenprobe: ohne das Produkt (Plan) fehlen Inhalt UND Übersicht', () => {
    const list = paths(base)
    expect(list).toEqual(['/', '/feed', '/imprint'])
  })

  it('Gegenprobe: Thema ohne bekannte (aktive) Kategorie, ohne Titel oder mit kaputter Kennung fällt raus', () => {
    const list = paths({
      ...base,
      discussions: {
        categories: [{ id: 'cat1', slug: 'praxis' }, { id: 'cat2', slug: 'Kaputt Slug' }],
        topics: [
          { id: 'p2', categoryId: 'weg', title: 'In stillgelegter Kategorie' },
          { id: 'p3', categoryId: 'cat1', title: '   ' },
          { id: 'p4', categoryId: 'cat1', title: null },
          { id: 'p5"><x', categoryId: 'cat1', title: 'Kaputte Kennung' },
          { id: 'p6', categoryId: 'cat2', title: 'Kategorie mit kaputtem Namen' },
        ],
      },
    })
    expect(list.filter(path => path.startsWith('/discussions/'))).toEqual(['/discussions/praxis'])
  })

  it('Gegenprobe: Kurs und Termin mit unsicherer Adresse fallen raus', () => {
    const list = paths({ ...base, courses: [{ slug: 'a b' }, { slug: '' }], events: [{ id: '../x' }, { id: '' }] })
    expect(list.filter(path => path.startsWith('/courses/') || path.startsWith('/events/'))).toEqual([])
  })

  it('hält die Obergrenze', () => {
    const topics = Array.from({ length: SITEMAP_TOPIC_LIMIT + 50 }, (_, i) => ({ id: `p${i}`, categoryId: 'cat1', title: `Thema ${i}` }))
    const entries = tenantSitemapEntries({ ...base, discussions: { categories: discussions.categories, topics } })
    expect(entries.filter(entry => entry.onlyLocale)).toHaveLength(SITEMAP_TOPIC_LIMIT)
  })

  it('ein Titel nur aus Zeichen ohne Adress-Form bleibt draußen (sein Adress-Name käme aus dem Text, die Adresse leitete um)', () => {
    const list = paths({ ...base, discussions: { categories: discussions.categories, topics: [
      { id: 'p9', categoryId: 'cat1', title: '🎉🎉' },
      { id: 'p10', categoryId: 'cat1', title: '🎉 Treffen' },
    ] } })
    expect(list.some(path => path.includes('/p9/'))).toBe(false)
    // Gegenprobe: ein Titel mit Buchstaben neben dem Zeichen steht drin
    expect(list).toContain('/discussions/praxis/p10/treffen')
  })
})

describe('tenantSitemapXml', () => {
  it('Nutzerinhalt steht EINMAL — unter der Adresse der Hauptsprache, ohne Sprachfassungen', () => {
    const xml = tenantSitemapXml(ORIGIN, tenantSitemapEntries({ ...base, primaryLocale: 'de', discussions }))
    const topic = '/discussions/praxis/p1/zehn-minuten-die-immer-gehen'
    expect(xml).toContain(`<loc>${ORIGIN}/de${topic}</loc>`)
    expect(xml).not.toContain(`<loc>${ORIGIN}${topic}</loc>`)
    expect(xml).not.toContain(`href="${ORIGIN}${topic}"`)
    expect(xml).toContain('<lastmod>2026-11-20T10:00:00.000Z</lastmod>')
  })

  it('ohne gewählte Hauptsprache gilt die Adresse ohne Vorsatz', () => {
    const xml = tenantSitemapXml(ORIGIN, tenantSitemapEntries({ ...base, discussions }))
    const topic = '/discussions/praxis/p1/zehn-minuten-die-immer-gehen'
    expect(xml).toContain(`<loc>${ORIGIN}${topic}</loc>`)
    expect(xml).not.toContain(`${ORIGIN}/de${topic}`)
  })

  it('Gegenprobe: Übersichten und eigene Seiten bleiben unter BEIDEN Adressen, verknüpft', () => {
    const xml = tenantSitemapXml(ORIGIN, tenantSitemapEntries({ ...base, primaryLocale: 'de', discussions }))
    expect(xml).toContain(`<loc>${ORIGIN}/discussions</loc>`)
    expect(xml).toContain(`<loc>${ORIGIN}/de/discussions</loc>`)
    expect(xml).toContain(`<xhtml:link rel="alternate" hreflang="de" href="${ORIGIN}/de/imprint"/>`)
  })

  it('ein kaputtes Datum bricht die Datei nicht', () => {
    const xml = tenantSitemapXml(ORIGIN, tenantSitemapEntries({ ...base, courses: [{ slug: 'kurs', lastmod: 'gestern' }] }))
    expect(xml).toContain(`<loc>${ORIGIN}/courses/kurs</loc>`)
    expect(xml).not.toContain('<lastmod>')
  })
})

describe('robots.txt der besonderen Hosts', () => {
  it('Kontroll-Host: nicht gesperrt — sonst läse niemand das noindex der Seiten', () => {
    const body = controlHostRobotsTxt()
    expect(body).toMatch(/^User-agent: \*$/m)
    expect(body).not.toMatch(/^Disallow: \/$/m)
    expect(body).toMatch(/^Disallow: \/api\/$/m)
    expect(body).not.toMatch(/sitemap/i)
  })

  it('Gegenprobe: eine geschlossene Community bleibt ganz gesperrt', () => {
    expect(membersOnlyRobotsTxt()).toMatch(/^Disallow: \/$/m)
  })
})

describe('KI-Crawler je Art von Host (Q11, B2)', () => {
  it('öffentliche Community: Suche und Antworten ja, Training nein', () => {
    const body = tenantRobotsTxt('https://kunde.pukalani.app')
    expect(aiCrawlerRobotsProblems(body, aiCrawlerPolicy('community'))).toEqual([])
    // GEGENPROBE: die Regel der eigenen Seiten (Training erlaubt) passt nicht.
    expect(aiCrawlerRobotsProblems(body, aiCrawlerPolicy('own'))).toContain('GPTBot: nicht dieselben Regeln wie *')
  })

  it('der spätere Owner-Schalter: ein Wert, und Training ist erlaubt', () => {
    const body = tenantRobotsTxt('https://kunde.pukalani.app', aiCrawlerPolicy('community', { training: true }))
    expect(aiCrawlerRobotsProblems(body, aiCrawlerPolicy('own'))).toEqual([])
  })

  it('geschlossene Community: auch die KI-Gruppen sagen Disallow: /', () => {
    expect(aiCrawlerRobotsProblems(membersOnlyRobotsTxt(), aiCrawlerPolicy('closed'))).toEqual([])
    expect(aiCrawlerRobotsProblems(membersOnlyRobotsTxt(), aiCrawlerPolicy('community'))).not.toEqual([])
  })

  it('Kontroll-Host (Kundenbereich): eigene Seite', () => {
    expect(aiCrawlerRobotsProblems(controlHostRobotsTxt(), aiCrawlerPolicy('own'))).toEqual([])
    expect(aiCrawlerRobotsProblems(controlHostRobotsTxt(), aiCrawlerPolicy('community'))).not.toEqual([])
  })
})
