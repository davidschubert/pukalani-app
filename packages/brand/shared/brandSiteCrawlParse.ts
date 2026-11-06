/**
 * DIE PUREN LESE-REGELN DES MEHRSEITEN-ABRUFS (Plan
 * docs/archiv/BRAND-MARKTVERGLEICH.md §7.4, Paket MV1 M2).
 *
 * ── WARUM SIE IN `brand` LIEGEN UND NICHT IN `market` ─────────────────────
 * §7.4 ist ausdrücklich: „Die Mehrseiten-/Sitemap-/llms.txt-Erweiterung ist
 * eine Verbesserung des GETEILTEN Abrufs im brand-Layer und nützt beiden — sie
 * wird EINMAL gebaut (M2) und der Check darf sie danach nutzen." Was hier
 * steht, ist deshalb reine TRANSPORT-Auswertung: was steht in diesem
 * Dokument? Die POLITIK — welche Pfade wir überhaupt lesen dürfen, was ein
 * Nutzungsvorbehalt bedeutet, was gefiltert wird — gehört dem Marktvergleich
 * und liegt in `packages/market/shared/*`. Der Schnitt ist absichtlich so:
 * eine Regel, die sagt „lies keine Impressumsseite", ist eine Produktregel des
 * Marktvergleichs, keine Eigenschaft des Abrufs.
 *
 * ── ALLES PUR, WEIL ALLES GEGENGEPROBT WIRD ───────────────────────────────
 * Kein h3, kein Appwrite, kein Netz — die Eingabe ist eine Zeichenkette, die
 * Ausgabe ist eine Struktur. Nur so lässt sich mit einer Gegenprobe zeigen,
 * dass eine Regel WIRKLICH greift (`tests/brandSiteCrawlParse.test.ts`).
 *
 * ── REGULÄRE AUSDRÜCKE STATT EINES PARSERS ────────────────────────────────
 * Dieselbe Entscheidung wie in `brandSiteAnalysis.ts` nebenan, und aus
 * demselben Grund: eine HTML-Parser-Abhängigkeit im Baum ist ein Kandidat für
 * `check:single-copy`, und wir lesen hier nicht, um zu RENDERN, sondern um
 * Text und Adressen einzusammeln. Was ein Ausdruck nicht sieht, fehlt — das
 * ist die richtige Fail-Richtung für Material, das ohnehin nur ein Vorschlag
 * für die Seitenauswahl ist.
 */

/** Wie viele interne Adressen wir aus EINER Seite höchstens mitnehmen. */
export const BRAND_CRAWL_MAX_LINKS = 200

/** Wie viele Adressen wir aus EINER sitemap.xml höchstens lesen. */
export const BRAND_CRAWL_MAX_SITEMAP_URLS = 500

/** Wie viele Kind-Sitemaps ein Index höchstens beisteuert (eine Ebene tief). */
export const BRAND_CRAWL_MAX_SITEMAP_CHILDREN = 5

const HTML_COMMENT = /<!--[\s\S]*?-->/g

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Ein Attribut aus einem Tag — dieselbe Form wie in `brandSiteAnalysis.ts`.
 * Sie steht hier ein zweites Mal, weil sie dort nicht exportiert ist und ein
 * Export nebenan eine Änderung an einer Datei wäre, die der Brand-Check
 * gerade benutzt (MV1 M2: „bestehende brand-Funktionen nicht umbauen").
 */
function attribute(tag: string, name: string): string {
  const quoted = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)
    ?? new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i').exec(tag)
  if (quoted) return quoted[1] ?? ''
  const bare = new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, 'i').exec(tag)
  return bare?.[1] ?? ''
}

function decodeEntities(value: string): string {
  return value
    .replace(/&(#\d{1,7}|#x[0-9a-fA-F]{1,6});/g, (whole, code: string) => {
      const point = code.startsWith('#x') || code.startsWith('#X')
        ? Number.parseInt(code.slice(2), 16)
        : Number.parseInt(code.slice(1), 10)
      return Number.isFinite(point) && point > 0 && point <= 0x10FFFF
        ? String.fromCodePoint(point)
        : whole
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, '\'')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

// ── Interne Adressen ────────────────────────────────────────────────────────

/**
 * DIE INTERNEN ADRESSEN EINER SEITE — absolut aufgelöst, auf denselben
 * URSPRUNG begrenzt, ohne Fragment, in Fundreihenfolge und ohne Dubletten.
 *
 * SAME-ORIGIN UND NICHT SAME-SITE: ein Link auf `blog.example.com` führt zu
 * einem anderen Server, für den `robots.txt` neu gelesen werden müsste — und
 * eine Erlaubnis, die für einen Host gilt, gilt nicht für den nächsten. Wer
 * das aufweicht, hat die Erlaubnisprüfung faktisch abgeschaltet.
 *
 * `mailto:`, `tel:`, `javascript:` und `#…` fallen heraus: das sind keine
 * Seiten. Eine E-Mail-Adresse ist zusätzlich genau das, was der PII-Filter
 * später entfernen soll — sie hier einzusammeln wäre der Widerspruch dazu.
 */
export function extractInternalLinks(html: string, baseUrl: string): string[] {
  let base: URL
  try {
    base = new URL(baseUrl)
  }
  catch {
    return []
  }

  const out: string[] = []
  const seen = new Set<string>()
  const withoutComments = html.replace(HTML_COMMENT, ' ')

  for (const tag of withoutComments.match(/<a\b[^>]*>/gi) ?? []) {
    if (out.length >= BRAND_CRAWL_MAX_LINKS) break
    const href = decodeEntities(attribute(tag, 'href')).trim()
    if (!href || href.startsWith('#')) continue

    let target: URL
    try {
      target = new URL(href, base)
    }
    catch {
      continue
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') continue
    if (target.host !== base.host || target.protocol !== base.protocol) continue

    target.hash = ''
    const normalized = target.toString()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }

  return out
}

// ── Meta-Anweisungen ────────────────────────────────────────────────────────

/**
 * DIE ANWEISUNGEN IM KOPF, die für einen Nutzungsvorbehalt in Frage kommen
 * (Plan §2.9 Nr. 1). Gesammelt wird ROH — was davon ein Vorbehalt IST,
 * entscheidet der Marktvergleich, nicht der Abruf.
 *
 * `robots` und `tdm-reservation` sind die zwei Namen, die heute vorkommen;
 * die Werte werden kleingeschrieben und an Kommas zerlegt, weil
 * `content="noai, noimageai"` die übliche Schreibweise ist.
 */
export interface BrandMetaDirectives {
  /** Werte aller `<meta name="robots">` (auch anbieter-spezifische Varianten). */
  readonly robots: readonly string[]
  /** Werte aller `<meta name="tdm-reservation">`. */
  readonly tdmReservation: readonly string[]
}

const META_DIRECTIVE_NAMES = new Set([
  'robots',
  // Suchmaschinen-eigene Varianten desselben Satzes. Sie stehen hier, weil ein
  // `noai` fast immer in genau einem dieser Tags steht und ein Vorbehalt, den
  // wir wegen des Tag-NAMENS übersehen, ein übersehener Vorbehalt bleibt.
  'googlebot',
  'bingbot',
])

export function extractMetaDirectives(html: string): BrandMetaDirectives {
  const robots: string[] = []
  const tdmReservation: string[] = []
  const withoutComments = html.replace(HTML_COMMENT, ' ')

  for (const tag of withoutComments.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = collapse(attribute(tag, 'name')).toLowerCase()
    if (!name) continue
    const content = collapse(decodeEntities(attribute(tag, 'content'))).toLowerCase()
    if (!content) continue
    const parts = content.split(',').map(part => part.trim()).filter(Boolean)
    if (META_DIRECTIVE_NAMES.has(name)) robots.push(...parts)
    else if (name === 'tdm-reservation') tdmReservation.push(...parts)
  }

  return { robots, tdmReservation }
}

// ── JSON-LD ─────────────────────────────────────────────────────────────────

/**
 * WAS SCHEMA.ORG ÜBER DIE ORGANISATION SAGT (§7.4).
 *
 * Nur drei Felder, und zwar die drei, die im Marktprofil überhaupt eine Rolle
 * spielen: `name`, `description`, `slogan`. Wer mehr mitnimmt, gibt einem
 * Modell mehr Material, ohne dass ein Feld darauf wartet.
 *
 * GESUCHT WIRD IN DER TIEFE, weil `@graph` die übliche Form ist: eine Seite
 * legt Organization, WebSite und BreadcrumbList in EIN Skript. Die erste
 * passende `@type`-Angabe gewinnt — mehrere Organisationen auf einer Seite
 * sind ein Sonderfall, für den es keine ehrliche Auflösung gibt.
 */
export interface BrandJsonLdOrganization {
  readonly name: string
  readonly description: string
  readonly slogan: string
}

const JSON_LD_BLOCK = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]{0,20000}?)<\/script\s*>/gi

/** Die Typen, die über eine MARKE etwas aussagen. */
const ORGANIZATION_TYPES = new Set([
  'organization',
  'localbusiness',
  'corporation',
  'ngo',
  'product',
  'brand',
])

function stringField(node: Record<string, unknown>, key: string): string {
  const value = node[key]
  if (typeof value === 'string') return collapse(value)
  // `description` als Objekt (`{ "@value": "…" }`) kommt in JSON-LD vor.
  if (value && typeof value === 'object' && '@value' in value) {
    const inner = (value as { '@value': unknown })['@value']
    if (typeof inner === 'string') return collapse(inner)
  }
  return ''
}

function nodeTypes(node: Record<string, unknown>): string[] {
  const raw = node['@type']
  if (typeof raw === 'string') return [raw.toLowerCase()]
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string').map(v => v.toLowerCase())
  return []
}

function findOrganization(value: unknown, depth = 0): BrandJsonLdOrganization | null {
  if (depth > 6 || !value || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findOrganization(entry, depth + 1)
      if (found) return found
    }
    return null
  }
  const node = value as Record<string, unknown>
  if (nodeTypes(node).some(type => ORGANIZATION_TYPES.has(type))) {
    const found: BrandJsonLdOrganization = {
      name: stringField(node, 'name'),
      description: stringField(node, 'description'),
      slogan: stringField(node, 'slogan'),
    }
    // Ein Treffer ohne jeden Inhalt ist keiner — weitersuchen statt eine leere
    // Hülle zurückgeben, sonst verdeckt der erste `@type` den echten Eintrag.
    if (found.name || found.description || found.slogan) return found
  }
  for (const key of Object.keys(node)) {
    if (key.startsWith('@') && key !== '@graph') continue
    const found = findOrganization(node[key], depth + 1)
    if (found) return found
  }
  return null
}

export function extractJsonLdOrganization(html: string): BrandJsonLdOrganization | null {
  const withoutComments = html.replace(HTML_COMMENT, ' ')
  JSON_LD_BLOCK.lastIndex = 0
  let match = JSON_LD_BLOCK.exec(withoutComments)
  while (match !== null) {
    const body = match[1] ?? ''
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    }
    catch {
      // Ein kaputter Block ist kein Grund, die Seite aufzugeben — der nächste
      // kann heil sein. (Und ein `@graph` ohne Komma ist in freier Wildbahn
      // häufiger als man denkt.)
      match = JSON_LD_BLOCK.exec(withoutComments)
      continue
    }
    const found = findOrganization(parsed)
    if (found) {
      JSON_LD_BLOCK.lastIndex = 0
      return found
    }
    match = JSON_LD_BLOCK.exec(withoutComments)
  }
  return null
}

// ── sitemap.xml ─────────────────────────────────────────────────────────────

export interface BrandSitemapResult {
  /** Die `<loc>` aus `<url>`-Einträgen — die Seiten selbst. */
  readonly urls: readonly string[]
  /** Die `<loc>` aus `<sitemap>`-Einträgen — ein Index, eine Ebene tief. */
  readonly children: readonly string[]
}

const LOC = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi
const SITEMAP_INDEX_BLOCK = /<sitemap\b[^>]*>([\s\S]*?)<\/sitemap\s*>/gi

/**
 * EINE SITEMAP LESEN — Seiten und Kind-Sitemaps getrennt.
 *
 * WARUM GETRENNT: ein `sitemapindex` trägt dieselben `<loc>`-Elemente wie ein
 * `urlset`, nur meinen sie etwas anderes (eine weitere Sitemap statt einer
 * Seite). Wer beides in einen Topf wirft, versucht später, eine XML-Datei als
 * HTML-Seite zu lesen — und bekommt dafür ein `not_html` und einen
 * verbrannten Platz im Seiten-Budget.
 *
 * Zerlegt wird über die `<sitemap>`-BLÖCKE und nicht über den Wurzel-Tag: eine
 * Datei, die beides mischt, ist kaputt, aber ihre Blöcke sind trotzdem
 * eindeutig.
 */
export function parseSitemap(xml: string): BrandSitemapResult {
  const children: string[] = []
  const childLocs = new Set<string>()

  SITEMAP_INDEX_BLOCK.lastIndex = 0
  let block = SITEMAP_INDEX_BLOCK.exec(xml)
  while (block !== null) {
    LOC.lastIndex = 0
    const loc = LOC.exec(block[1] ?? '')
    const value = collapse(decodeEntities(loc?.[1] ?? ''))
    if (value && !childLocs.has(value) && children.length < BRAND_CRAWL_MAX_SITEMAP_CHILDREN) {
      childLocs.add(value)
      children.push(value)
    }
    block = SITEMAP_INDEX_BLOCK.exec(xml)
  }

  const urls: string[] = []
  const seen = new Set<string>()
  LOC.lastIndex = 0
  let loc = LOC.exec(xml)
  while (loc !== null) {
    const value = collapse(decodeEntities(loc[1] ?? ''))
    // Die `<loc>` der Kind-Sitemaps stehen ebenfalls im Gesamttext — sie sind
    // oben schon eingesammelt und gehören nicht in die Seitenliste.
    if (value && !childLocs.has(value) && !seen.has(value) && urls.length < BRAND_CRAWL_MAX_SITEMAP_URLS) {
      seen.add(value)
      urls.push(value)
    }
    loc = LOC.exec(xml)
  }

  return { urls, children }
}

/** Die `Sitemap:`-Zeilen einer robots.txt (dort steht sie, wenn sie irgendwo steht). */
export function sitemapUrlsFromRobots(robotsTxt: string): string[] {
  const out: string[] = []
  for (const line of robotsTxt.split(/\r?\n/)) {
    const match = /^\s*sitemap\s*:\s*(\S+)\s*$/i.exec(line)
    const value = match?.[1]
    if (value && !out.includes(value) && out.length < BRAND_CRAWL_MAX_SITEMAP_CHILDREN) out.push(value)
  }
  return out
}
