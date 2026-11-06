import type { BrandCrawledPage, BrandCrawledText } from '../contracts/brandContract'
import {
  BRAND_MARKET_BOT_TOKEN,
  crawlBrandPage,
  crawlBrandSitemap,
  crawlBrandTextResource,
  sitemapUrlsFromRobots,
} from '../contracts/brandContract'
import type { MarketExclusionReason } from '../../shared/marketProfile'
import {
  MARKET_MAX_CHARS_PER_PAGE,
  MARKET_MAX_CHARS_PER_RUN,
  MARKET_MAX_PAGES,
  marketPageMarker,
  marketPathBlocked,
  marketTdmReserved,
  selectMarketPages,
} from '../../shared/marketCrawlRules'
import { MARKET_ROBOTS_ABSENT, marketRobotsAllows, parseMarketRobots } from '../../shared/marketRobots'
import { filterMarketPii } from '../../shared/marketPii'

/**
 * DIE ABRUF-PIPELINE EINES WETTBEWERBERS (Plan §2.3 Schritt 2, §7.4, MV1 M2).
 *
 * ── SIE ENTSCHEIDET NICHTS SELBST ─────────────────────────────────────────
 * Jede Regel, die hier greift, steht pur nebenan: `marketRobots.ts`
 * (Erlaubnis), `marketCrawlRules.ts` (Sperrliste, Seitenwahl, Vorbehalt,
 * Deckel), `marketPii.ts` (Filter). Diese Datei ist die REIHENFOLGE, in der
 * gefragt wird — und die ist selbst eine Regel: erst Erlaubnis, dann
 * Vorbehalt, dann Text. Wer die Startseite holt, bevor er `robots.txt`
 * gelesen hat, hat sie geholt.
 *
 * ── DER ABRUF IST EINSETZBAR ──────────────────────────────────────────────
 * `MarketFetcher` ist ein kleines Interface mit drei Methoden. Der Normalfall
 * ist `defaultMarketFetcher` (der geteilte Abruf des brand-Layers); im Test
 * steht dort eine Landkarte aus Zeichenketten. Ohne diese Naht wäre jeder Test
 * dieser Reihenfolge ein Netzwerk-Test — und die Fälle, auf die es ankommt
 * (Vorbehalt, Sperrliste, Budget), sind gerade die, die man nicht draussen im
 * Netz sucht.
 *
 * ── WAS HERAUSKOMMT, IST EIN ZWISCHENSTAND ────────────────────────────────
 * `rawText` lebt 24 Stunden (§2.9 Nr. 6). Er ist gefiltert (PII), mit
 * Seiten-Markern versehen (damit die Häufigkeit über Seiten zählbar bleibt und
 * der Beleg-Riegel die richtige Seite findet) und gedeckelt. Er ist kein
 * Bestand — der Bestand ist das Marktprofil.
 */

// ── Die einsetzbare Naht ────────────────────────────────────────────────────

export interface MarketFetcher {
  page: (url: string) => Promise<BrandCrawledPage>
  text: (url: string) => Promise<BrandCrawledText | null>
  sitemap: (url: string) => Promise<string[]>
}

export const defaultMarketFetcher: MarketFetcher = {
  page: crawlBrandPage,
  text: crawlBrandTextResource,
  sitemap: crawlBrandSitemap,
}

// ── Das Ergebnis ────────────────────────────────────────────────────────────

/** Was von EINER gelesenen Seite in der Ablage steht (`pagesFetched`, JSON). */
export interface MarketFetchedPage {
  url: string
  chars: number
  hadJsonLd: boolean
}

export interface MarketFetchOutcome {
  /** `fetched` · `excluded` (Erlaubnis/Vorbehalt/kein Text) · `failed` (Netz). */
  status: 'fetched' | 'excluded' | 'failed'
  /**
   * DER GRUND ALS WORT, nie als Rohfehler (§2.6: EINE Spalte `excludedReason`
   * mit vier Werten). Ein Anbieter-Text im Feld wäre in der zweiten Sprache
   * nicht übersetzt — und im schlimmsten Fall ein Stück fremder Seiteninhalt.
   */
  reason?: MarketExclusionReason
  pages: MarketFetchedPage[]
  /** Die Seiten mit Trenn-Marker, PII-gefiltert, gedeckelt. */
  rawText: string
  /** Wie viele Adressen die sitemap.xml nannte (§7.4, für den Fortschritt). */
  sitemapUrls: number
  /** Gab es eine `llms.txt`? „nicht vorhanden" ist eine geprüfte Auskunft. */
  llmsTxt: 'found' | 'missing'
  /** Stand auf mindestens einer Seite ein Organization-JSON-LD? */
  jsonLd: boolean
}

export interface MarketFetchOptions {
  fetcher?: MarketFetcher
  /**
   * Wie viele Zeichen dieser Wettbewerber vom Lauf-Budget noch bekommt
   * (§2.8: 60 000 über den ganzen Lauf). Der Aufrufer rechnet herunter.
   */
  budgetChars?: number
  maxPages?: number
}

/** Der Ursprung einer Adresse — `robots.txt` und Co. hängen daran, nie am Pfad. */
function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  }
  catch {
    return null
  }
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}`
  }
  catch {
    return '/'
  }
}

/**
 * DIE SIGNALE EINER SEITE FÜR DEN VORBEHALTS-TEST. Getrennt gehalten, weil der
 * Test pur ist und diese Datei ihn nur füttert.
 */
function tdmSignalsOf(page: BrandCrawledPage, tdmrepJson: string | undefined) {
  return {
    headers: page.headers,
    metaRobots: page.meta.robots,
    metaTdm: page.meta.tdmReservation,
    tdmrepJson,
    path: pathOf(page.finalUrl),
  }
}

/**
 * DER TEXT EINER SEITE, wie er in den Rohtext geht: Titel, Beschreibung,
 * JSON-LD und Fliesstext, jeweils beschriftet.
 *
 * BESCHRIFTET UND NICHT VERSCHMOLZEN, aus demselben Grund wie in
 * `composeSiteAnalysis` des brand-Layers: ein Sprachmodell, das „title" liest,
 * behandelt die Zeile anders als einen Satz aus dem Fliesstext — und der
 * Beleg-Riegel prüft danach gegen genau diesen Text, also muss er stabil sein.
 */
function pageBlock(page: BrandCrawledPage): string {
  const blocks: string[] = []
  if (page.title) blocks.push(`[title] ${page.title}`)
  if (page.description) blocks.push(`[description] ${page.description}`)
  if (page.jsonLd) {
    const parts = [page.jsonLd.name, page.jsonLd.slogan, page.jsonLd.description].filter(Boolean)
    if (parts.length) blocks.push(`[schema.org] ${parts.join(' — ')}`)
  }
  if (page.text) blocks.push(page.text)
  return blocks.join('\n').slice(0, MARKET_MAX_CHARS_PER_PAGE)
}

/**
 * EINEN WETTBEWERBER LESEN — die ganze Kette aus §2.3 Schritt 2 und §7.4.
 *
 * REIHENFOLGE (jeder Schritt kann den Lauf beenden):
 *  1. `robots.txt` → gesperrte Startseite ⇒ `excluded/robots`.
 *  2. `/.well-known/tdmrep.json` (einmal je Ursprung, für alle Seiten).
 *  3. Startseite holen → nicht erreichbar ⇒ `failed/unreachable`.
 *  4. Vorbehalt der Startseite prüfen ⇒ `excluded/tdm`.
 *  5. Seitenwahl aus Sitemap + internen Links, Sperrliste und Erlaubnis
 *     angewandt, gedeckelt auf 8.
 *  6. Die übrigen Seiten holen (fail-soft je Seite), Vorbehalt jeder einzelnen
 *     prüfen — eine Unterseite mit `noai` sperrt den ganzen Wettbewerber.
 *  7. `llms.txt` als zusätzliche Quelle.
 *  8. PII-Filter über ALLES, dann Deckel, dann Ergebnis.
 */
export async function fetchMarketCompetitor(
  startUrl: string,
  options: MarketFetchOptions = {},
): Promise<MarketFetchOutcome> {
  const fetcher = options.fetcher ?? defaultMarketFetcher
  const budget = Math.max(0, options.budgetChars ?? MARKET_MAX_CHARS_PER_RUN)
  const maxPages = options.maxPages ?? MARKET_MAX_PAGES

  const empty = (status: MarketFetchOutcome['status'], reason: MarketExclusionReason): MarketFetchOutcome => ({
    status,
    reason,
    pages: [],
    rawText: '',
    sitemapUrls: 0,
    llmsTxt: 'missing',
    jsonLd: false,
  })

  const origin = originOf(startUrl)
  if (!origin) return empty('failed', 'unreachable')

  // ── 1 · Erlaubnis ────────────────────────────────────────────────────────
  const robotsDocument = await fetcher.text(`${origin}/robots.txt`)
  const robots = robotsDocument ? parseMarketRobots(robotsDocument.text) : MARKET_ROBOTS_ABSENT
  const allowed = (url: string): boolean =>
    marketRobotsAllows(robots, BRAND_MARKET_BOT_TOKEN, pathOf(url))
  if (!allowed(startUrl)) return empty('excluded', 'robots')

  // ── 2 · Der Vorbehalt, der für den ganzen Ursprung gilt ──────────────────
  const tdmrep = await fetcher.text(`${origin}/.well-known/tdmrep.json`)

  // ── 3 · Die Startseite ───────────────────────────────────────────────────
  let start: BrandCrawledPage
  try {
    start = await fetcher.page(startUrl)
  }
  catch {
    // Der ROHE Fehler wird bewusst nicht weitergereicht: er trägt im Zweifel
    // Adresse und Anbieter-Meldung, und beides gehört weder in eine Zeile noch
    // in eine Oberfläche.
    return empty('failed', 'unreachable')
  }

  // ── 4 · Vorbehalt der Startseite ─────────────────────────────────────────
  if (marketTdmReserved(tdmSignalsOf(start, tdmrep?.text))) return empty('excluded', 'tdm')

  // ── 5 · Die Seitenwahl ───────────────────────────────────────────────────
  const sitemapSources = sitemapUrlsFromRobots(robotsDocument?.text ?? '')
  const sitemapCandidates = sitemapSources.length
    ? (await Promise.all(sitemapSources.map(url => fetcher.sitemap(url)))).flat()
    : await fetcher.sitemap(`${origin}/sitemap.xml`)

  // Sitemap ZUERST, interne Links danach: bei gleichem Rang gewinnt damit die
  // Adresse, die die Website selbst als wichtig ausgewiesen hat (§7.4). Die
  // Sortierung in `selectMarketPages` ist stabil, also trägt die Reihenfolge
  // hier wirklich.
  const candidates = [...sitemapCandidates, ...start.links]
  const selected = selectMarketPages(start.finalUrl, candidates, maxPages)
    .filter(url => url === start.finalUrl || (!marketPathBlocked(url) && allowed(url)))

  // ── 6 · Die übrigen Seiten ───────────────────────────────────────────────
  const fetched: { page: BrandCrawledPage, block: string }[] = [{ page: start, block: pageBlock(start) }]
  for (const url of selected) {
    if (url === start.finalUrl) continue
    let page: BrandCrawledPage
    try {
      page = await fetcher.page(url)
    }
    catch {
      // FAIL-SOFT JE SEITE: eine 404 auf einer Unterseite ist kein Grund, den
      // Wettbewerber aufzugeben — die Startseite steht ja.
      continue
    }
    // FAIL-CLOSED JE VORBEHALT: sagt IRGENDEINE Seite „nein", gilt das für die
    // Marke. Ein Vorbehalt ist keine Eigenschaft der Unterseite, sondern eine
    // Willenserklärung des Betreibers.
    if (marketTdmReserved(tdmSignalsOf(page, tdmrep?.text))) return empty('excluded', 'tdm')
    fetched.push({ page, block: pageBlock(page) })
  }

  // ── 7 · llms.txt (§7.4: „wo vorhanden die dichteste Quelle") ─────────────
  const llms = await fetcher.text(`${origin}/llms.txt`)

  // ── 8 · Zusammensetzen, filtern, deckeln ─────────────────────────────────
  const pages: MarketFetchedPage[] = []
  let rawText = ''
  let used = 0

  const append = (url: string, block: string, hadJsonLd: boolean): void => {
    if (!block.trim()) return
    const marker = marketPageMarker(url)
    const room = budget - used - marker.length
    if (room <= 0) return
    const body = block.slice(0, room)
    rawText += marker + body
    used += marker.length + body.length
    pages.push({ url, chars: body.length, hadJsonLd })
  }

  for (const entry of fetched) {
    append(entry.page.finalUrl, entry.block, !!entry.page.jsonLd)
  }
  if (llms?.text.trim()) {
    // Die `llms.txt` bekommt einen EIGENEN Seiten-Eintrag und damit einen
    // eigenen Marker: ein Beleg darf auf sie zeigen, und der Riegel muss ihn
    // dort wiederfinden. Sie ist eine Quelle wie eine Seite — nur eine, die
    // die Marke ausdrücklich für Maschinen geschrieben hat.
    append(llms.finalUrl, llms.text.slice(0, MARKET_MAX_CHARS_PER_PAGE), false)
  }

  if (!pages.length) return empty('excluded', 'noText')

  // DER FILTER GANZ AM ENDE, ÜBER ALLES (§2.9 Nr. 3): so gibt es genau EINE
  // Stelle, an der personenbezogene Daten entfernt werden — und keinen Pfad,
  // auf dem ein Textstück daran vorbeiläuft.
  const filtered = filterMarketPii(rawText)

  return {
    status: 'fetched',
    pages,
    rawText: filtered.text,
    sitemapUrls: sitemapCandidates.length,
    llmsTxt: llms ? 'found' : 'missing',
    jsonLd: fetched.some(entry => !!entry.page.jsonLd),
  }
}
