import { describe, expect, it } from 'vitest'
import type { MarketFetcher } from '../server/utils/marketFetch'
import { fetchMarketCompetitor } from '../server/utils/marketFetch'
import { splitMarketRawText } from '../shared/marketCrawlRules'

/**
 * DIE REIHENFOLGE DER ABRUF-PIPELINE (Plan §2.3 Schritt 2, §7.4) — gegen einen
 * EINGESETZTEN Abruf, ohne Netz.
 *
 * ── WARUM DAS EIN UNIT-TEST SEIN KANN UND SEIN SOLLTE ─────────────────────
 * Die Fälle, auf die es ankommt, sind gerade die, die man draussen im Netz
 * nicht findet: eine Seite mit `noai`, eine gesperrte `robots.txt`, ein
 * erschöpftes Zeichen-Budget. Der Beweis gegen echte Seiten
 * (`scripts/verify-market-fetch.mjs`) misst die andere Hälfte — dass Route,
 * Ablage und SSRF-Schutz zusammenpassen.
 *
 * `fetchMarketCompetitor` ruft KEIN `useRuntimeConfig` und kein Appwrite; sie
 * ist deshalb ohne Nuxt-Umgebung testbar.
 */

interface FakeSite {
  pages: Record<string, { html?: string, text?: string, headers?: Record<string, string> }>
  texts?: Record<string, string>
  sitemap?: Record<string, string[]>
}

/** Ein Abruf, der eine Landkarte statt eines Netzes befragt. */
function fakeFetcher(site: FakeSite): MarketFetcher & { asked: string[] } {
  const asked: string[] = []
  return {
    asked,
    page: async (url: string) => {
      asked.push(url)
      const page = site.pages[url]
      if (!page) throw new Error('not found')
      return {
        url,
        finalUrl: url,
        title: `Titel ${url}`,
        description: '',
        text: page.text ?? '',
        links: Object.keys(site.pages).filter(other => other !== url),
        meta: {
          robots: page.headers?.['x-meta-robots']?.split(',').map(v => v.trim()) ?? [],
          tdmReservation: [],
        },
        jsonLd: null,
        headers: page.headers ?? {},
      }
    },
    text: async (url: string) => {
      asked.push(url)
      const text = site.texts?.[url]
      return text === undefined ? null : { url, finalUrl: url, text, headers: {} }
    },
    sitemap: async (url: string) => {
      asked.push(url)
      return site.sitemap?.[url] ?? []
    },
  }
}

const START = 'https://roesterei.test/'

describe('fetchMarketCompetitor', () => {
  it('liest Startseite und Unterseiten und legt sie mit Marker ab', async () => {
    const fetcher = fakeFetcher({
      pages: {
        [START]: { text: 'Wir rösten in kleinen Mengen, direkt von der Farm.' },
        'https://roesterei.test/about': { text: 'Seit 2011 auf Maui, immer in kleinen Mengen.' },
      },
      texts: { 'https://roesterei.test/llms.txt': '# Rösterei\n> Kleine Mengen, grosse Sorgfalt.' },
      sitemap: { 'https://roesterei.test/sitemap.xml': [START, 'https://roesterei.test/about'] },
    })

    const outcome = await fetchMarketCompetitor(START, { fetcher })

    expect(outcome.status).toBe('fetched')
    expect(outcome.llmsTxt).toBe('found')
    expect(outcome.sitemapUrls).toBe(2)
    // Startseite, Unterseite und llms.txt sind drei Quellen mit eigenem Marker.
    expect(outcome.pages).toHaveLength(3)
    const pages = splitMarketRawText(outcome.rawText)
    expect(pages.has(START)).toBe(true)
    expect(pages.has('https://roesterei.test/about')).toBe(true)
    expect(pages.get(START)).toContain('Wir rösten in kleinen Mengen')
  })

  it('robots.txt sperrt die Startseite ⇒ excluded/robots, OHNE eine Seite zu holen', async () => {
    const fetcher = fakeFetcher({
      pages: { [START]: { text: 'Sollte nie gelesen werden.' } },
      texts: { 'https://roesterei.test/robots.txt': 'User-agent: *\nDisallow: /' },
    })

    const outcome = await fetchMarketCompetitor(START, { fetcher })

    expect(outcome).toMatchObject({ status: 'excluded', reason: 'robots' })
    expect(outcome.rawText).toBe('')
    // DIE ZUSAGE, auf die es ankommt: der fremde Server wurde für SEITEN nie
    // angefasst — nur seine robots.txt wurde gelesen.
    expect(fetcher.asked).not.toContain(START)
  })

  it('GEGENPROBE zur Zeile darüber: dieselbe robots.txt mit `Allow` liest normal', async () => {
    const fetcher = fakeFetcher({
      pages: { [START]: { text: 'Diese Seite darf gelesen werden.' } },
      texts: { 'https://roesterei.test/robots.txt': 'User-agent: *\nDisallow: /\nAllow: /' },
    })
    expect((await fetchMarketCompetitor(START, { fetcher })).status).toBe('fetched')
  })

  it('ein `noai` auf der STARTSEITE schliesst aus (tdm)', async () => {
    const fetcher = fakeFetcher({
      pages: { [START]: { text: 'Text', headers: { 'x-meta-robots': 'index, noai' } } },
    })
    expect(await fetchMarketCompetitor(START, { fetcher })).toMatchObject({ status: 'excluded', reason: 'tdm' })
  })

  it('ein `TDM-Reservation`-Kopf auf einer UNTERSEITE schliesst den ganzen Kandidaten aus', async () => {
    const fetcher = fakeFetcher({
      pages: {
        [START]: { text: 'Startseite ohne Vorbehalt.' },
        'https://roesterei.test/about': { text: 'Hier steht der Vorbehalt.', headers: { 'tdm-reservation': '1' } },
      },
    })
    expect(await fetchMarketCompetitor(START, { fetcher })).toMatchObject({ status: 'excluded', reason: 'tdm' })
  })

  it('eine unerreichbare Startseite ist `failed/unreachable`, keine Ausnahme', async () => {
    const fetcher = fakeFetcher({ pages: {} })
    expect(await fetchMarketCompetitor(START, { fetcher })).toMatchObject({ status: 'failed', reason: 'unreachable' })
  })

  it('eine unerreichbare UNTERSEITE ist fail-soft — der Rest bleibt', async () => {
    const site: FakeSite = {
      pages: { [START]: { text: 'Startseite steht.' } },
      sitemap: { 'https://roesterei.test/sitemap.xml': [START, 'https://roesterei.test/weg'] },
    }
    const outcome = await fetchMarketCompetitor(START, { fetcher: fakeFetcher(site) })
    expect(outcome.status).toBe('fetched')
    expect(outcome.pages).toHaveLength(1)
  })

  it('gesperrte Pfade werden nicht geholt — auch wenn die Sitemap sie nennt', async () => {
    const fetcher = fakeFetcher({
      pages: {
        [START]: { text: 'Startseite.' },
        'https://roesterei.test/impressum': { text: 'Geschäftsführerin Anna Keanu, Tel: +49 30 1234567' },
        'https://roesterei.test/about': { text: 'Über uns.' },
      },
      sitemap: {
        'https://roesterei.test/sitemap.xml': [
          START, 'https://roesterei.test/impressum', 'https://roesterei.test/about',
        ],
      },
    })

    const outcome = await fetchMarketCompetitor(START, { fetcher })
    expect(fetcher.asked).not.toContain('https://roesterei.test/impressum')
    expect(outcome.rawText).not.toContain('Anna Keanu')
  })

  it('der PII-Filter greift über den ganzen Rohtext', async () => {
    const fetcher = fakeFetcher({
      pages: { [START]: { text: 'Fragen an hallo@roesterei.test. Geschäftsführerin Anna Keanu.' } },
    })
    const outcome = await fetchMarketCompetitor(START, { fetcher })
    expect(outcome.rawText).not.toContain('hallo@roesterei.test')
    expect(outcome.rawText).not.toContain('Anna Keanu')
    expect(outcome.rawText).toContain('Geschäftsführerin')
  })

  it('das Zeichen-Budget deckelt — ein erschöpftes Budget liefert `noText`', async () => {
    const fetcher = fakeFetcher({ pages: { [START]: { text: 'x'.repeat(500) } } })
    const tight = await fetchMarketCompetitor(START, { fetcher, budgetChars: 60 })
    expect(tight.pages[0]?.chars).toBeLessThan(60)
    const none = await fetchMarketCompetitor(START, { fetcher, budgetChars: 0 })
    expect(none).toMatchObject({ status: 'excluded', reason: 'noText' })
  })

  it('hält den Seiten-Deckel ein', async () => {
    const pages: FakeSite['pages'] = { [START]: { text: 'Start.' } }
    for (let index = 0; index < 20; index++) {
      pages[`https://roesterei.test/seite-${index}`] = { text: `Seite ${index}.` }
    }
    const outcome = await fetchMarketCompetitor(START, { fetcher: fakeFetcher({ pages }) })
    expect(outcome.pages.length).toBeLessThanOrEqual(8)
  })
})
