import { describe, expect, it } from 'vitest'
import type { MarketFetcher } from '../server/utils/marketFetch'
import { fetchMarketCompetitor } from '../server/utils/marketFetch'
import {
  MARKET_PAGES_FETCHED_MAX,
  MARKET_URL_MAX,
  selectMarketPages,
  serializeMarketPagesFetched,
  splitMarketRawText,
} from '../shared/marketCrawlRules'

/**
 * ÜBERLANGE ADRESSEN EINES WETTBEWERBERS (GA1 P18, BE-011): „werden
 * verworfen, statt den ganzen Lauf abzubrechen".
 *
 * Bis P18 nahm die Seitenwahl jede Adresse aus Sitemap und Links, und das
 * Protokoll (`pagesFetched`, 5000 Zeichen) wurde ungekürzt geschrieben —
 * acht Adressen mit je 700 Zeichen liessen das Update scheitern und mit ihm
 * den ganzen Lauf.
 */

const ORIGIN = 'https://lang.example'
const long = (index: number) => `${ORIGIN}/leistungen/${index}-${'x'.repeat(MARKET_URL_MAX)}`

describe('selectMarketPages', () => {
  it('verwirft Kandidaten über MARKET_URL_MAX — und nimmt gleich lange bis zur Grenze', () => {
    const atLimit = `${ORIGIN}/leistungen/${'y'.repeat(MARKET_URL_MAX - `${ORIGIN}/leistungen/`.length)}`
    expect(atLimit.length).toBe(MARKET_URL_MAX)
    const selected = selectMarketPages(`${ORIGIN}/`, [long(1), atLimit, long(2)])
    expect(selected).toEqual([`${ORIGIN}/`, atLimit])
  })
})

describe('serializeMarketPagesFetched', () => {
  const page = (index: number) => ({ url: `${ORIGIN}/${index}-${'z'.repeat(600)}`, chars: 100, hadJsonLd: false })

  it('passt in die Spalte, indem Einträge von HINTEN wegfallen', () => {
    const pages = Array.from({ length: 12 }, (_, index) => page(index))
    expect(JSON.stringify(pages).length).toBeGreaterThan(MARKET_PAGES_FETCHED_MAX)
    const json = serializeMarketPagesFetched(pages)
    expect(json.length).toBeLessThanOrEqual(MARKET_PAGES_FETCHED_MAX)
    const kept = JSON.parse(json) as { url: string }[]
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.map(entry => entry.url)).toEqual(pages.slice(0, kept.length).map(entry => entry.url))
  })

  it('lässt eine passende Liste unverändert und macht aus nichts `[]`', () => {
    const pages = [page(1)]
    expect(serializeMarketPagesFetched(pages)).toBe(JSON.stringify(pages))
    expect(serializeMarketPagesFetched([])).toBe('[]')
    expect(serializeMarketPagesFetched([page(1)], 10)).toBe('[]')
  })
})

function fetcher(pages: Record<string, { finalUrl?: string, text: string }>, sitemap: string[] = []): MarketFetcher {
  return {
    page: async (url: string) => {
      const entry = pages[url]
      if (!entry) throw new Error('not found')
      return {
        url,
        finalUrl: entry.finalUrl ?? url,
        title: '',
        description: '',
        text: entry.text,
        links: [],
        meta: { robots: [], tdmReservation: [] },
        jsonLd: null,
        headers: {},
      }
    },
    text: async () => null,
    sitemap: async () => sitemap,
  }
}

describe('fetchMarketCompetitor · überlange Adressen', () => {
  it('zählt verworfene Sitemap-Adressen und liest trotzdem die Startseite', async () => {
    const outcome = await fetchMarketCompetitor(`${ORIGIN}/`, {
      fetcher: fetcher({ [`${ORIGIN}/`]: { text: 'Startseite.' } }, [long(1), long(2), long(2)]),
    })
    expect(outcome.status).toBe('fetched')
    expect(outcome.skippedUrls).toBe(2)
    expect(outcome.pages.map(entry => entry.url)).toEqual([`${ORIGIN}/`])
  })

  it('eine Unterseite, die auf eine überlange Adresse weiterleitet, fehlt in Protokoll und Rohtext', async () => {
    const outcome = await fetchMarketCompetitor(`${ORIGIN}/`, {
      fetcher: fetcher({
        [`${ORIGIN}/`]: { text: 'Startseite.' },
        [`${ORIGIN}/ueber-uns`]: { finalUrl: long(3), text: 'Weitergeleitet.' },
      }, [`${ORIGIN}/ueber-uns`]),
    })
    expect(outcome.skippedUrls).toBe(1)
    expect(outcome.pages.map(entry => entry.url)).toEqual([`${ORIGIN}/`])
    expect(outcome.rawText).not.toContain('Weitergeleitet.')
  })

  it('eine überlange Start-`finalUrl` wird unter der EINGETRAGENEN Adresse abgelegt — Marker und Protokoll stimmen überein', async () => {
    const outcome = await fetchMarketCompetitor(`${ORIGIN}/`, {
      fetcher: fetcher({ [`${ORIGIN}/`]: { finalUrl: long(4), text: 'Wir rösten in kleinen Mengen.' } }),
    })
    expect(outcome.status).toBe('fetched')
    expect(outcome.pages.map(entry => entry.url)).toEqual([`${ORIGIN}/`])
    // Der Beleg-Riegel findet das Zitat über denselben Marker wieder.
    expect(splitMarketRawText(outcome.rawText).get(`${ORIGIN}/`)).toContain('kleinen Mengen')
    expect(outcome.skippedUrls).toBe(1)
  })
})
