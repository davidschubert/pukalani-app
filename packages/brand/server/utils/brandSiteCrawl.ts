import {
  BRAND_SITE_ANALYSIS_MAX_BYTES,
  BRAND_SITE_ANALYSIS_MAX_TEXT,
  BRAND_SITE_DESCRIPTION_MAX,
  BRAND_SITE_TITLE_MAX,
  extractSiteContent,
} from '../../shared/brandSiteAnalysis'
import type {
  BrandJsonLdOrganization,
  BrandMetaDirectives,
  BrandSitemapResult,
} from '../../shared/brandSiteCrawlParse'
import {
  extractInternalLinks,
  extractJsonLdOrganization,
  extractMetaDirectives,
  parseSitemap,
} from '../../shared/brandSiteCrawlParse'
import {
  BrandSiteFetchError,
  fetchBrandDocument,
} from './brandSiteFetch'

/**
 * DER GETEILTE MEHRSEITEN-ABRUF (Plan docs/archiv/BRAND-MARKTVERGLEICH.md §7.4,
 * gebaut in MV1 M2).
 *
 * ── WARUM ER IN `brand` LIEGT UND NICHT IN `market` ───────────────────────
 * §7.4 sagt es wörtlich: „Die Mehrseiten-/Sitemap-/llms.txt-Erweiterung ist
 * eine Verbesserung des GETEILTEN Abrufs im brand-Layer und nützt beiden — sie
 * wird EINMAL gebaut (M2), mit der Brand-Check-Sitzung abgestimmt, und der
 * Check darf sie danach nutzen." Der Brand-Check liest heute EINE Seite
 * (`fetchBrandSite`); wer ihn später auf mehrere hebt, ruft von hier und
 * bekommt denselben SSRF-Schutz. Zwei Abrufe mit zwei Schutzwällen wären die
 * Sorte Doppelung, die irgendwann auseinanderläuft — und dann ist einer der
 * beiden der schwächere.
 *
 * ── ER IST TRANSPORT, KEINE POLITIK ───────────────────────────────────────
 * Diese Datei holt, was man ihr sagt, und wertet aus, was zurückkommt. Sie
 * entscheidet NICHT, welche Pfade gelesen werden dürfen (Sperrliste
 * `packages/market/shared/marketCrawlRules.ts`), ob ein Absender lesen darf
 * (`../../shared/brandRobots.ts`), was ein Nutzungsvorbehalt bedeutet
 * (`../../shared/brandTdm.ts`) oder was ein Modell sehen darf (PII-Filter im
 * market-Layer). Der Schnitt hält diese Datei für BEIDE Abrufe brauchbar —
 * seit BS1 R2b liest der Brand-Check über `brandCheckFetch.ts` mit demselben
 * Transport, aber mit eigenem Absender und eigenem Umfang.
 *
 * ── DAS ROHE HTML BLEIBT HIER ─────────────────────────────────────────────
 * `fetchBrandDocument` gibt den Quelltext heraus (er muss, sonst gäbe es keine
 * Links und kein JSON-LD). Über die Layer-Grenze reist er NICHT: heraus geht
 * `BrandCrawledPage` mit Titel, Beschreibung, Fliesstext, internen Adressen,
 * Meta-Anweisungen und JSON-LD. Der market-Vertrag re-exportiert genau diese
 * Funktionen und nicht `fetchBrandDocument`.
 */

/** Wie viele Zeichen eine TEXT-Ressource (robots/llms/sitemap) tragen darf. */
export const BRAND_CRAWL_TEXT_MAX = 20_000

/** Der Byte-Deckel einer Textressource — kleiner als der einer Seite. */
export const BRAND_CRAWL_TEXT_MAX_BYTES = 512_000

/** Zeitgrenze je EINZELNEM Abruf (die Kette darüber deckelt der Aufrufer). */
export const BRAND_CRAWL_TIMEOUT_MS = 10_000

/**
 * WER WIR SIND, WENN WIR FÜR DEN MARKTVERGLEICH LESEN (Plan §2.9 Nr. 1).
 *
 * Ein EIGENER Absender neben dem des Wizards, und das ist keine Kosmetik: ein
 * Website-Betreiber, der uns in `robots.txt` etwas erlauben oder verbieten
 * will, muss uns benennen können — und „der Wizard liest EINE Seite, die ich
 * selbst eingereicht habe" ist etwas anderes als „ein Marktvergleich liest
 * acht Seiten, ohne dass ich gefragt wurde". Zwei Vorgänge, zwei Namen, zwei
 * Entscheidungen.
 */
export const BRAND_MARKET_USER_AGENT = 'PukalaniMarketBot/1.0 (+https://branding.supply/market-bot)'

/** Das Token, das eine `robots.txt`-Gruppe für uns adressiert (klein). */
export const BRAND_MARKET_BOT_TOKEN = 'pukalanimarketbot'

// ── Eine Seite ──────────────────────────────────────────────────────────────

export interface BrandCrawledPage {
  /** Die ANGEFRAGTE Adresse. */
  readonly url: string
  /** Die Adresse nach allen Sprüngen — Belege zeigen auf sie. */
  readonly finalUrl: string
  readonly title: string
  readonly description: string
  /** Fliesstext, Tags entfernt, gedeckelt wie im Einseiten-Abruf. */
  readonly text: string
  /** Interne Adressen dieser Seite, absolut und ohne Fragment. */
  readonly links: readonly string[]
  readonly meta: BrandMetaDirectives
  readonly jsonLd: BrandJsonLdOrganization | null
  /** Die Kopfzeilen der Antwort, kleingeschrieben (für den TDM-Vorbehalt). */
  readonly headers: Readonly<Record<string, string>>
}

/**
 * EINE SEITE HOLEN UND AUSWERTEN. Wirft `BrandSiteFetchError` wie
 * `fetchBrandSite` — der Aufrufer entscheidet, ob eine einzelne unlesbare
 * Seite den ganzen Lauf beendet (sie sollte es nicht).
 */
export async function crawlBrandPage(url: string): Promise<BrandCrawledPage> {
  const document = await fetchBrandDocument(url, {
    userAgent: BRAND_MARKET_USER_AGENT,
    maxBytes: BRAND_SITE_ANALYSIS_MAX_BYTES,
    timeoutMs: BRAND_CRAWL_TIMEOUT_MS,
  })

  const content = extractSiteContent(document.body)
  return {
    url,
    finalUrl: document.finalUrl,
    title: content.title.slice(0, BRAND_SITE_TITLE_MAX),
    description: content.description.slice(0, BRAND_SITE_DESCRIPTION_MAX),
    text: content.text.slice(0, BRAND_SITE_ANALYSIS_MAX_TEXT),
    // Aufgelöst gegen die ADRESSE NACH DEN SPRÜNGEN: eine Seite, die von
    // `/x` nach `/x/` weiterleitet, hätte sonst jeden relativen Link um eine
    // Ebene daneben.
    links: extractInternalLinks(document.body, document.finalUrl),
    meta: extractMetaDirectives(document.body),
    jsonLd: extractJsonLdOrganization(document.body),
    headers: document.headers,
  }
}

// ── Eine Textressource (robots.txt, llms.txt, sitemap.xml, tdmrep.json) ─────

export interface BrandCrawledText {
  readonly url: string
  readonly finalUrl: string
  readonly text: string
  readonly headers: Readonly<Record<string, string>>
}

/**
 * Content-Types, die als KLARTEXT durchgehen. Bewusst grosszügig: `robots.txt`
 * kommt in freier Wildbahn als `text/plain`, `application/octet-stream` und
 * gelegentlich ganz ohne Angabe. Der Deckel dahinter (512 KB, 20 000 Zeichen)
 * macht einen falschen Typ ungefährlich, und ein Vorbehalt, den wir wegen
 * eines schlampigen Kopfes nicht lesen, wäre ein übersehener Vorbehalt.
 *
 * Nur HTML fällt heraus: eine Fehlerseite mit Status 200 ist die häufigste
 * Antwort auf eine fehlende `robots.txt`, und ihr Inhalt als Regelwerk zu
 * lesen wäre schlimmer als gar keine Antwort.
 */
function textResourceAccepted(value: string | undefined): boolean {
  if (!value) return true
  const type = value.split(';')[0]?.trim().toLowerCase() ?? ''
  if (!type) return true
  return type !== 'text/html' && type !== 'application/xhtml+xml'
}

/**
 * EINE TEXTRESSOURCE HOLEN — `null`, wenn es sie nicht gibt oder sie nicht
 * lesbar ist.
 *
 * KEIN WURF: „diese Website hat keine llms.txt" ist eine gewöhnliche,
 * erwartbare Auskunft und kein Fehler. Ein Wurf zwänge jeden Aufrufer zu einem
 * `try`, dessen einziger Zweck das Weiterlaufen wäre.
 */
export async function crawlBrandTextResource(
  url: string,
  /**
   * WER FRAGT. Default ist der Marktvergleich — sein Absender war bis BS1 R2b
   * der einzige, der Textressourcen las. Seither holt auch der Brand-Check
   * seine `robots.txt` und `tdmrep.json` hierüber und reicht dafür
   * `BRAND_CHECK_USER_AGENT` durch: wer eine `robots.txt` gegen einen ANDEREN
   * Namen prüft als den, mit dem er sie holt, prüft nichts.
   */
  userAgent: string = BRAND_MARKET_USER_AGENT,
): Promise<BrandCrawledText | null> {
  try {
    const document = await fetchBrandDocument(url, {
      accept: 'text/plain,application/xml,text/xml,application/json;q=0.9,*/*;q=0.8',
      acceptsContentType: textResourceAccepted,
      maxBytes: BRAND_CRAWL_TEXT_MAX_BYTES,
      timeoutMs: BRAND_CRAWL_TIMEOUT_MS,
      userAgent,
    })
    return {
      url,
      finalUrl: document.finalUrl,
      text: document.body.slice(0, BRAND_CRAWL_TEXT_MAX),
      headers: document.headers,
    }
  }
  catch (error) {
    // Nur die BEKANNTE Fehlerklasse wird verschluckt. Ein Programmierfehler
    // (etwa ein kaputtes Options-Objekt) soll weiterhin auffallen.
    if (error instanceof BrandSiteFetchError) return null
    throw error
  }
}

/**
 * EINE SITEMAP LESEN — samt EINER Ebene Index. Mehr nicht: ein Index von
 * Indizes ist theoretisch erlaubt und praktisch ein Weg, aus einem Abruf
 * hundert zu machen.
 *
 * Die Reihenfolge bleibt die der Datei; die AUSWAHL trifft der Aufrufer
 * (Marktvergleich: Pfad-Heuristik + Sperrliste).
 */
export async function crawlBrandSitemap(url: string): Promise<string[]> {
  const root = await crawlBrandTextResource(url)
  if (!root) return []
  const parsed: BrandSitemapResult = parseSitemap(root.text)
  const urls = [...parsed.urls]

  for (const child of parsed.children) {
    const childDocument = await crawlBrandTextResource(child)
    if (!childDocument) continue
    // Bewusst NUR `urls` der Kind-Datei: ein Index im Index bleibt liegen.
    for (const entry of parseSitemap(childDocument.text).urls) {
      if (!urls.includes(entry)) urls.push(entry)
    }
  }

  return urls
}
