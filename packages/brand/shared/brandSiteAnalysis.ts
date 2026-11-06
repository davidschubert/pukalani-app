import { decodeHtmlEntities } from '../../core/shared/markdown'

/**
 * DER SSRF-VERTRAG DER URL-ANALYSE (Plan §9b „URL-Analyse — SSRF-Vertrag",
 * Referenz OWASP SSRF Cheat Sheet) — als PURE Regeln, ohne Netz, ohne h3, ohne
 * Appwrite.
 *
 * ── WARUM PUR UND WARUM HIER ──────────────────────────────────────────────
 * Ein Schutz, den man nur mit einem echten Server im Rücken prüfen kann, wird
 * einmal von Hand ausprobiert und danach nie wieder. Die gefährlichen Fälle
 * sind aber genau die, die man im Alltag NIE trifft: `169.254.169.254` (die
 * Metadaten-Adresse jeder Cloud), `::ffff:127.0.0.1` (dieselbe Loopback in
 * v6-Kleidung), ein DNS-Name, der beim ZWEITEN Auflösen auf 10.0.0.1 zeigt.
 * Deshalb liegt jede Entscheidung hier als Funktion, die ein Test mit einer
 * Zeichenkette füttern kann — der Transport (`server/utils/brandSiteFetch.ts`)
 * hat danach keine eigene Meinung mehr.
 *
 * ── WAS DER TRANSPORT DARAUS BAUEN MUSS ───────────────────────────────────
 *  1. `analyzableUrl()` — nur http/https, nur Standard-Ports.
 *  2. Alle DNS-Antworten durch `ipIsForbidden()`; EINE verbotene Adresse
 *     genügt zum Nein (ein Name mit zwei A-Records ist sonst ein Würfel).
 *  3. Verbunden wird NUR zu den geprüften Adressen (`lookup`-Option), und die
 *     TATSÄCHLICH verbundene Adresse (`socket.remoteAddress`) wird ERNEUT
 *     geprüft — das ist die Hälfte, die DNS-Rebinding schliesst.
 *  4. Weiterleitungen von Hand, je Sprung von vorn (1–3), höchstens
 *     `BRAND_SITE_ANALYSIS_MAX_REDIRECTS`.
 *  5. `contentTypeIsHtml()`, Byte-Deckel beim LESEN (nicht `Content-Length`
 *     glauben) und derselbe Deckel nach dem Entpacken.
 *
 * ── UMFANG PHASE 1: EINE SEITE ────────────────────────────────────────────
 * Nur die eingereichte Adresse. Der Plan sieht später eine Auswahl von bis zu
 * fünf Same-Origin-Seiten vor; die NAHT dafür ist `extractSiteContent()`, das
 * schon heute eine einzelne Seite in eine benannte Form bringt — mehrere
 * Seiten wären mehrere Aufrufe und ein Zusammenschreiben, keine neue Regel.
 * Gebaut wird das hier NICHT.
 */

// ── Die Zahlen ─────────────────────────────────────────────────────────────

/**
 * Was wir höchstens vom Draht lesen — roh UND entpackt. Der zweite Teil ist
 * der Punkt: eine 4-KB-gzip-Antwort kann sich zu 4 GB entfalten (Zip-Bomb),
 * und ein Deckel, der nur die komprimierten Bytes zählt, sieht davon nichts.
 */
export const BRAND_SITE_ANALYSIS_MAX_BYTES = 2_000_000

/** Deckel des EXTRAHIERTEN Textes (die Spalte ist MEDIUMTEXT, der Prompt nicht). */
export const BRAND_SITE_ANALYSIS_MAX_TEXT = 20_000

/**
 * Was davon in Georges Prompt wandert. Kleiner als der gespeicherte Text, und
 * zwar bewusst: gespeichert wird, was wir gelesen haben (später sollen daraus
 * mehrere Slots schöpfen), gesendet wird, was ein Auftrag verträgt.
 */
export const BRAND_SITE_ANALYSIS_PROMPT_MAX = 6_000

/** Höchstens drei Sprünge — jeder mit voller Prüfung. */
export const BRAND_SITE_ANALYSIS_MAX_REDIRECTS = 3

/** Hartes Zeitbudget über ALLE Sprünge, nicht je Sprung. */
export const BRAND_SITE_ANALYSIS_TIMEOUT_MS = 10_000

/** Titel und Beschreibung sind Beschriftungen, keine Texte. */
export const BRAND_SITE_TITLE_MAX = 200
export const BRAND_SITE_DESCRIPTION_MAX = 500

/**
 * DIE ABLEHNUNGSGRÜNDE — sie reisen als `data.code` und werden vom zentralen
 * Fehler-Handler als `reason` ins Envelope gehoben.
 *
 * Sie sind ABSICHTLICH grob: „welche IP war es" oder „welcher Header fehlte"
 * gehört ins Log, nicht in eine Antwort, die ein Fremder auslösen kann — sonst
 * ist die Analyse ein Portscanner mit Oberfläche. Unterschieden werden nur die
 * vier Dinge, auf die ein MENSCH verschieden reagiert: keine Adresse da ·
 * die Adresse dürfen wir nicht lesen · da war keine Website · das war zu gross
 * · wir kamen nicht dran.
 */
export type BrandSiteAnalysisErrorCode
  = 'no_url'
    | 'blocked_target'
    | 'not_html'
    | 'too_large'
    | 'fetch_failed'

// ── 1. Die Adresse ─────────────────────────────────────────────────────────

/**
 * NUR http/https AUF STANDARD-PORTS — sonst `null`.
 *
 * Der Port ist Teil des Vertrags und nicht Kosmetik: die interessanten Ziele
 * eines Angreifers hören auf 6379 (Redis), 9200 (Elasticsearch), 11211
 * (memcached) oder 8080; ein http-Request dorthin ist oft genug „gültig
 * genug", um etwas auszulösen. Erlaubt sind deshalb nur der leere Port (die
 * Vorgabe des Schemas) und der zum Schema passende.
 *
 * `javascript:`, `data:`, `file:`, `ftp:`, `gopher:` fallen mit demselben
 * Nein heraus — normalisiert wird NICHTS: eine Adresse, die still zu etwas
 * anderem wird, als der Mensch getippt hat, ist schwerer zu erklären als ein
 * ehrliches Nein (dieselbe Haltung wie `isBrandWebsiteUrl`).
 */
export function analyzableUrl(raw: string): URL | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  let url: URL
  try {
    url = new URL(trimmed)
  }
  catch {
    return null
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (!url.hostname) return null

  const standardPort = url.protocol === 'http:' ? '80' : '443'
  if (url.port !== '' && url.port !== standardPort) return null

  return url
}

// ── 2. Die Adressbereiche ──────────────────────────────────────────────────

/** Ein IPv4-Literal als vier Zahlen — `null`, wenn es keins ist. */
function parseIpv4(value: string): [number, number, number, number] | null {
  const parts = value.split('.')
  if (parts.length !== 4) return null
  const octets: number[] = []
  for (const part of parts) {
    // Führende Nullen sind hier VERBOTEN, nicht bloss hässlich: `0177.0.0.1`
    // ist für manche Auflöser oktal (= 127.0.0.1) und für uns eine ganz
    // gewöhnliche 177 — genau diese Uneinigkeit ist der Trick.
    if (!/^(?:0|[1-9]\d{0,2})$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    octets.push(octet)
  }
  return octets as [number, number, number, number]
}

/**
 * DIE VERBOTENEN v4-BEREICHE. Über Loopback und RFC1918 hinaus stehen hier
 * bewusst auch die Bereiche, die „nur" seltsam sind: 0.0.0.0/8 (auf Linux
 * dasselbe wie localhost), 100.64/10 (Carrier-NAT — im Rechenzentrum durchaus
 * erreichbar), 192.0.0/24 und die Test-/Doku-Netze, 198.18/15 (Benchmark),
 * Multicast und der reservierte Rest ab 240.
 *
 * 169.254/16 trägt die Cloud-Metadaten-Adresse 169.254.169.254 — das ist der
 * Klassiker, gegen den dieser ganze Vertrag geschrieben ist.
 */
function ipv4IsForbidden(octets: [number, number, number, number]): boolean {
  const [a, b] = octets
  if (a === 0) return true // „dieses Netz" — auf Linux erreichbar wie 127.0.0.1
  if (a === 10) return true // RFC1918
  if (a === 127) return true // Loopback
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 169 && b === 254) return true // Link-Local + Cloud-Metadaten
  if (a === 172 && b >= 16 && b <= 31) return true // RFC1918
  if (a === 192 && b === 0) return true // IETF-Protokollzuweisungen + TEST-NET-1
  if (a === 192 && b === 168) return true // RFC1918
  if (a === 198 && (b === 18 || b === 19)) return true // Benchmark
  if (a === 198 && b === 51) return true // TEST-NET-2
  if (a === 203 && b === 0) return true // TEST-NET-3
  if (a >= 224) return true // Multicast, reserviert, 255.255.255.255
  return false
}

/** Die acht Gruppen eines IPv6-Literals (mit `::`-Kurzform) — sonst `null`. */
function parseIpv6(value: string): number[] | null {
  let text = value.trim()
  if (!text) return null
  // Ein Zonen-Index (`fe80::1%eth0`) gehört nicht in eine Zieladresse — er ist
  // ein Hinweis auf genau die Link-Local-Adresse, die hier verboten ist.
  if (text.includes('%')) return null
  if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1)
  if (!text.includes(':')) return null

  // Eingebettetes v4 (`::ffff:127.0.0.1`, `64:ff9b::10.0.0.1`) wird zu zwei
  // Gruppen — danach ist es eine gewöhnliche v6-Adresse.
  const lastColon = text.lastIndexOf(':')
  const tail = text.slice(lastColon + 1)
  if (tail.includes('.')) {
    const v4 = parseIpv4(tail)
    if (!v4) return null
    const high = (v4[0] << 8) | v4[1]
    const low = (v4[2] << 8) | v4[3]
    text = `${text.slice(0, lastColon + 1)}${high.toString(16)}:${low.toString(16)}`
  }

  const halves = text.split('::')
  if (halves.length > 2) return null

  const toGroups = (part: string): number[] | null => {
    if (!part) return []
    const groups: number[] = []
    for (const piece of part.split(':')) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return null
      groups.push(Number.parseInt(piece, 16))
    }
    return groups
  }

  const head = toGroups(halves[0] ?? '')
  const rest = halves.length === 2 ? toGroups(halves[1] ?? '') : null
  if (!head) return null

  if (halves.length === 1) return head.length === 8 ? head : null
  if (!rest) return null
  const missing = 8 - head.length - rest.length
  if (missing < 1) return null
  return [...head, ...Array.from({ length: missing }, () => 0), ...rest]
}

/**
 * DIE VERBOTENEN v6-BEREICHE — und die zwei Fälle, die kein Mensch im Kopf
 * hat: eine v4-Adresse KANN als v6 auftreten (`::ffff:127.0.0.1`,
 * v4-mapped) und ein NAT64-Präfix (`64:ff9b::/96`) trägt ebenfalls eine v4 in
 * den letzten 32 Bit. Beide werden auf ihre v4 zurückgerechnet und mit den
 * v4-Regeln beantwortet — sonst wäre `::ffff:169.254.169.254` erlaubt, und
 * der ganze Vertrag oben wäre Zierde.
 */
function ipv6IsForbidden(groups: number[]): boolean {
  const isPrefix = (...prefix: number[]): boolean =>
    prefix.every((value, index) => groups[index] === value)

  // v4-mapped (::ffff:a.b.c.d) und NAT64 (64:ff9b::a.b.c.d) → als v4 beurteilen.
  const embedded = (): [number, number, number, number] | null => {
    const last = [
      (groups[6] ?? 0) >> 8, (groups[6] ?? 0) & 0xFF,
      (groups[7] ?? 0) >> 8, (groups[7] ?? 0) & 0xFF,
    ] as [number, number, number, number]
    if (isPrefix(0, 0, 0, 0, 0, 0xFFFF)) return last
    if (isPrefix(0, 0, 0, 0, 0xFFFF, 0)) return last // v4-translated
    if (isPrefix(0x64, 0xFF9B, 0, 0, 0, 0)) return last // NAT64
    return null
  }
  const v4 = embedded()
  if (v4) return ipv4IsForbidden(v4)

  if (groups.every(group => group === 0)) return true // ::
  if (isPrefix(0, 0, 0, 0, 0, 0, 0) && groups[7] === 1) return true // ::1
  if (((groups[0] ?? 0) & 0xFE00) === 0xFC00) return true // fc00::/7 (ULA)
  if (((groups[0] ?? 0) & 0xFFC0) === 0xFE80) return true // fe80::/10 (Link-Local)
  if (((groups[0] ?? 0) & 0xFF00) === 0xFF00) return true // ff00::/8 (Multicast)
  if (isPrefix(0x2001, 0x0DB8)) return true // Doku-Präfix
  if (isPrefix(0x2001, 0x0000)) return true // Teredo — tunnelt zu beliebigen Zielen
  return false
}

/**
 * DIE EINE FRAGE, DIE DER TRANSPORT ZWEIMAL STELLT: vor dem Verbinden für
 * JEDE aufgelöste Adresse, und nach dem Verbinden für die TATSÄCHLICHE.
 *
 * FAIL-CLOSED: was sich nicht als IP lesen lässt, ist verboten. Diese Funktion
 * bekommt nur Ausgaben von `dns.lookup` und `socket.remoteAddress` zu sehen —
 * ist eine davon unlesbar, ist das kein Grund, sie durchzulassen.
 */
export function ipIsForbidden(ip: string): boolean {
  const value = ip.trim()
  if (!value) return true
  const v4 = parseIpv4(value)
  if (v4) return ipv4IsForbidden(v4)
  const v6 = parseIpv6(value)
  if (v6) return ipv6IsForbidden(v6)
  return true
}

/** Eine einzige verbotene Adresse genügt (s. Kopf, Punkt 2). Leer ⇒ nein. */
export function allIpsAllowed(ips: readonly string[]): boolean {
  return ips.length > 0 && ips.every(ip => !ipIsForbidden(ip))
}

// ── 3. Weiterleitungen ─────────────────────────────────────────────────────

export function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

/** Ist dieser Sprung noch im Budget? (`hop` ist 0-basiert: der erste Sprung ist 0.) */
export function redirectBudgetLeft(hop: number): boolean {
  return hop < BRAND_SITE_ANALYSIS_MAX_REDIRECTS
}

/**
 * DAS ZIEL EINES SPRUNGS — relativ aufgelöst und durch dieselbe Prüfung wie
 * die erste Adresse. `null` heisst „nicht folgen".
 *
 * Ein `Location: http://169.254.169.254/` ist der bequemste Weg an einer
 * Prüfung vorbei, die nur die EINGEREICHTE Adresse ansieht — deshalb ist der
 * Sprung hier kein Sonderfall, sondern derselbe Fall von vorn.
 */
export function redirectTarget(location: string | undefined, base: URL): URL | null {
  if (!location || !location.trim()) return null
  let absolute: URL
  try {
    absolute = new URL(location.trim(), base)
  }
  catch {
    return null
  }
  return analyzableUrl(absolute.toString())
}

// ── 4. Content-Type und Grösse ─────────────────────────────────────────────

/**
 * NUR HTML. Ein PDF, ein Bild oder ein 300-MB-Video sind keine Website-Texte,
 * und ein `application/octet-stream` ist die höfliche Form von „ich sage dir
 * nicht, was das ist".
 *
 * FEHLENDER Header ⇒ NEIN. Das ist strenger als ein Browser und hier richtig:
 * wir lesen nicht, um anzuzeigen, sondern um einem Sprachmodell Material zu
 * geben — im Zweifel lieber „das war keine Website".
 */
export function contentTypeIsHtml(value: string | undefined): boolean {
  if (!value) return false
  const type = value.split(';')[0]?.trim().toLowerCase() ?? ''
  return type === 'text/html' || type === 'application/xhtml+xml'
}

/** Der Lese-Deckel — gilt für rohe UND entpackte Bytes (s. Kopf der Konstante). */
export function exceedsByteBudget(bytes: number, max: number = BRAND_SITE_ANALYSIS_MAX_BYTES): boolean {
  return bytes > max
}

// ── 5. Die Text-Extraktion ─────────────────────────────────────────────────

/** Was aus einer Seite herauskommt — benannt, damit der Prompt es benennen kann. */
export interface BrandSiteContent {
  title: string
  description: string
  /** Der Fliesstext, Tags entfernt, Entities aufgelöst, Weissraum zusammengezogen. */
  text: string
}

const BLOCK_ELEMENTS = /<\/?(?:p|div|section|article|header|footer|main|aside|nav|h[1-6]|li|tr|td|th|br|hr)\b[^>]*>/gi
const DROPPED_BLOCKS = /<(script|style|noscript|template|svg|iframe|object|canvas)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const SELF_CLOSED_DROPPED = /<(?:script|style|noscript|template|svg|iframe|object|canvas)\b[^>]*\/?>/gi
const HTML_COMMENT = /<!--[\s\S]*?-->/g
const ANY_TAG = /<[^>]*>/g

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** Ein Attribut aus einem Tag — Anführungszeichen beider Sorten, sonst unquoted. */
function attribute(tag: string, name: string): string {
  const quoted = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag)
  if (quoted) return quoted[2] ?? quoted[3] ?? ''
  const bare = new RegExp(`\\b${name}\\s*=\\s*([^\\s"'>]+)`, 'i').exec(tag)
  return bare?.[1] ?? ''
}

/**
 * TITEL, BESCHREIBUNG UND FLIESSTEXT — ohne neue Abhängigkeit.
 *
 * ── WARUM KEIN PARSER ─────────────────────────────────────────────────────
 * Ein echter HTML-Parser (`cheerio`, `linkedom`, `jsdom`) wäre genauer und
 * kostete eine Abhängigkeit im Server-Bündel, deren Angriffsfläche grösser ist
 * als das Problem: wir bauen keinen DOM, wir wollen Wörter. Was hier
 * schiefgehen kann, ist ein Stück Text zu viel oder zu wenig — nie eine
 * Ausführung, denn nichts davon wird je gerendert (der Text landet in einer
 * Spalte und in einem Prompt, und der Prompt sagt ausdrücklich, dass es DATEN
 * sind).
 *
 * ── DIE REIHENFOLGE IST DIE AUSSAGE ───────────────────────────────────────
 * Kommentare raus (sie tragen oft ganze alte Seitenversionen) → Titel und
 * Beschreibung LESEN (sie stehen im `head`, den wir gleich mit ausräumen) →
 * `script`/`style`/`noscript`/`template`/`svg`/`iframe` samt Inhalt weg →
 * Block-Tags zu Zeilenumbrüchen (sonst klebt „Impressum"+"Kontakt" zu einem
 * Wort) → alle übrigen Tags weg → Entities → Weissraum.
 *
 * ENTITIES DEKODIERT DER CORE (`decodeHtmlEntities` aus `core/shared/
 * markdown.ts`) — dieselbe Tabelle, die der Markdown-Leser benutzt. Eine
 * zweite Dekodier-Tabelle im Repo wäre eine, die irgendwann anders entscheidet.
 */
export function extractSiteContent(html: string): BrandSiteContent {
  const withoutComments = html.replace(HTML_COMMENT, ' ')

  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(withoutComments)
  const title = collapse(decodeHtmlEntities(collapse(titleMatch?.[1] ?? '').replace(ANY_TAG, ' ')))
    .slice(0, BRAND_SITE_TITLE_MAX)

  let description = ''
  let ogDescription = ''
  for (const tag of withoutComments.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = attribute(tag, 'name').toLowerCase()
    const property = attribute(tag, 'property').toLowerCase()
    const content = collapse(decodeHtmlEntities(attribute(tag, 'content')))
    if (!content) continue
    if (name === 'description' && !description) description = content
    if (property === 'og:description' && !ogDescription) ogDescription = content
  }

  const body = withoutComments
    .replace(DROPPED_BLOCKS, ' ')
    .replace(SELF_CLOSED_DROPPED, ' ')
    .replace(BLOCK_ELEMENTS, '\n')
    .replace(ANY_TAG, ' ')

  const text = collapse(decodeHtmlEntities(body).replace(/[\t ]+/g, ' ').replace(/\n{2,}/g, '\n'))
    .slice(0, BRAND_SITE_ANALYSIS_MAX_TEXT)

  return {
    title,
    description: (description || ogDescription).slice(0, BRAND_SITE_DESCRIPTION_MAX),
    text,
  }
}

/**
 * DIE GESPEICHERTE FORM — beschriftete Blöcke, genau wie die Startkarte im
 * Prompt. Was leer ist, steht nicht da: eine Zeile „description:" ohne Inhalt
 * ist für ein Sprachmodell eine Einladung, sie zu füllen.
 *
 * Gespeichert wird der ZUSAMMENGESETZTE Text und nicht drei Spalten: Titel und
 * Beschreibung sind Teil desselben Fundes, sie veralten gemeinsam mit ihm, und
 * eine Spalte, die man vergessen kann mitzuschreiben, ist eine halbe Wahrheit.
 * Das ROHE HTML wird nach diesem Schritt VERWORFEN (Plan §9b) — es verlässt
 * `fetchBrandSite()` nie.
 */
export function composeSiteAnalysis(content: BrandSiteContent): string {
  const blocks: string[] = []
  if (content.title) blocks.push(`[title]\n${content.title}`)
  if (content.description) blocks.push(`[description]\n${content.description}`)
  if (content.text) blocks.push(`[page text]\n${content.text}`)
  return blocks.join('\n\n').slice(0, BRAND_SITE_ANALYSIS_MAX_TEXT)
}

// ── 6. Die MESSBAREN Signale (Brand-Check) ─────────────────────────────────

/**
 * WAS EIN AUSSEN-CHECK OHNE MODELL SEHEN KANN — die Rohwerte der sechzehn
 * messbaren Kriterien aus docs/archiv/BRAND-CHECK.md §3.
 *
 * ── WARUM NEBEN `extractSiteContent()` UND NICHT DARIN ────────────────────
 * `BrandSiteContent` ist der Vertrag des WIZARDS: Titel, Beschreibung, Text —
 * das Material eines Prompts. Der Check fragt etwas anderes („steht ein
 * theme-color im Kopf?"), und diese Antwort in denselben Rückgabewert zu
 * legen hiesse, jedem Leser des Wizard-Vertrags zwanzig Felder aufzudrängen,
 * die ihn nichts angehen. Zwei Funktionen über demselben HTML sind hier
 * billiger als ein Vertrag, der zwei Dinge gleichzeitig ist.
 *
 * ── GEZÄHLT WIRD HIER, GEURTEILT WIRD DORT ────────────────────────────────
 * Diese Funktion liefert ZAHLEN und ZEICHENKETTEN, nie Punkte. Ob zwei
 * gefundene Tippfehler eine 1 oder eine 0 sind, entscheidet
 * `server/utils/brandCheckMeasure.ts` — nur so kann man die 0/1/2-Regel
 * ändern, ohne die Messung anzufassen (und umgekehrt).
 *
 * ── DREI ZÄHLER, DIE NUR HIER ENTSTEHEN KÖNNEN ────────────────────────────
 * `doubleSpaceCount`, `mojibakeCount` und `doubleEscapedCount` brauchen den
 * Text VOR dem Zusammenziehen der Leerzeichen und teils vor dem Auflösen der
 * Entities — beides tut `extractSiteContent()` bereits. Sie stehen deshalb
 * als fertige Zahlen im Signal und nicht als Aufgabe beim Messenden.
 */
export interface BrandSiteHeading {
  /** 1–6. */
  level: number
  text: string
}

export interface BrandSiteSignals {
  /** Der Inhalt des ERSTEN `<title>`. */
  title: string
  /** Wie viele `<title>` es gibt — mehr als einer ist Meta-Unhygiene (h5). */
  titleCount: number
  metaDescription: string
  /** Wie oft `<meta name="description">` vorkommt (h5). */
  metaDescriptionCount: number
  ogTitle: string
  ogDescription: string
  ogImage: string
  /** Irgendein `<link rel="…icon…">` — Existenz genügt (b1). */
  hasFavicon: boolean
  themeColor: string
  /** `<meta name="color-scheme">`. */
  colorScheme: string
  /** `prefers-color-scheme` irgendwo im Kopf (Style oder Media-Attribut). */
  hasPrefersColorScheme: boolean
  viewport: string
  /** Das `lang`-Attribut des `<html>`-Tags, kleingeschrieben. */
  htmlLang: string
  headings: BrandSiteHeading[]
  canonical: string
  /** Die `@type`-Werte aller JSON-LD-Blöcke, kleingeschrieben. */
  jsonLdTypes: string[]
  /** Beschriftungen von `a`/`button` im oberen Bereich der Seite (d1). */
  ctaTexts: string[]
  imageAlts: string[]
  /** Doppelte Leerzeichen MITTEN im Text (nie die Einrückung des Quelltexts). */
  doubleSpaceCount: number
  /** Falsch dekodierte Umlaute und Anführungszeichen. */
  mojibakeCount: number
  /** Entity-Reste NACH einem Dekodier-Durchgang (`&amp;amp;` & Co.). */
  doubleEscapedCount: number
}

/** Wie weit „obere Bildschirmhöhe" für die Handlungsaufforderung reicht (d1). */
export const BRAND_SITE_CTA_SCAN_CHARS = 2_000

/** Deckel der Listen — ein Signal ist eine Stichprobe, kein Abzug der Seite. */
export const BRAND_SITE_MAX_HEADINGS = 40
export const BRAND_SITE_MAX_ALTS = 30
export const BRAND_SITE_MAX_CTAS = 20
export const BRAND_SITE_MAX_JSONLD_TYPES = 20
/** Deckel EINER Beschriftung/Überschrift — sie werden verglichen, nicht gelesen. */
export const BRAND_SITE_LABEL_MAX = 200

/**
 * Falsch dekodierte UTF-8-Folgen, wie sie entstehen, wenn utf-8-Bytes als
 * latin1 gelesen werden (`Ã¤`, `â€™`) — plus das Ersatzzeichen. Als
 * Escape-Folgen geschrieben, damit die Datei selbst ASCII bleibt und niemand
 * sie beim Umkodieren versehentlich „repariert".
 */
const MOJIBAKE_RE = /\u00C3[\u0080-\u00BF]|\u00E2\u0080[\u0080-\u00BF]|\uFFFD/g

/** Entity-Reste nach EINEM Dekodier-Durchgang — also doppelt maskiert gewesen. */
const LEFTOVER_ENTITY_RE = /&(?:amp|lt|gt|quot|apos|nbsp|#\d{1,7}|#x[0-9a-fA-F]{1,6});/g

/** Ein Doppel-Leerzeichen ZWISCHEN zwei sichtbaren Zeichen — kein Zeilenumbruch. */
const DOUBLE_SPACE_RE = /\S {2,}\S/g

const HEAD_END = /<\/head\s*>/i
const JSON_LD_BLOCK = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]{0,20000}?)<\/script\s*>/gi
const TEXT_NODE = />([^<]{1,5000})</g

/**
 * `String.match` statt einer `exec`-Schleife: bei einem GLOBALEN Ausdruck setzt
 * es `lastIndex` selbst zurück. Eine Schleife über dasselbe Modul-Regex würde
 * beim zweiten Textknoten dort weiterlesen, wo sie beim ersten aufgehört hat —
 * ein Zähler, der je nach Aufrufreihenfolge etwas anderes sagt.
 */
function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0
}

function label(value: string): string {
  return collapse(decodeHtmlEntities(collapse(value).replace(ANY_TAG, ' '))).slice(0, BRAND_SITE_LABEL_MAX)
}

/** Alle `@type`-Werte eines JSON-LD-Blocks — verschachtelte eingeschlossen. */
function jsonLdTypes(source: string): string[] {
  const found: string[] = []
  // Bewusst per Regex und NICHT per JSON.parse: die Hälfte der JSON-LD-Blöcke
  // im Netz ist ungültiges JSON (Kommentare, abgeschnitten, doppelte Kommata),
  // und ein `catch` würde genau die Seiten aussortieren, die etwas erklären
  // wollten. Uns interessiert ohnehin nur, WELCHE Typen dort stehen.
  const re = /"@type"\s*:\s*(?:"([^"]{1,80})"|\[([^\]]{0,300})\])/g
  let match = re.exec(source)
  while (match !== null) {
    if (match[1]) found.push(match[1].trim().toLowerCase())
    for (const piece of (match[2] ?? '').split(',')) {
      const value = piece.trim().replace(/^"|"$/g, '').trim()
      if (value) found.push(value.toLowerCase())
    }
    match = re.exec(source)
  }
  return found
}

/**
 * DIE MESSBAREN SIGNALE EINER SEITE. Kein Parser, dieselbe Begründung wie bei
 * `extractSiteContent()` — was hier schiefgehen kann, ist ein Signal zu viel
 * oder zu wenig, nie eine Ausführung.
 *
 * REIHENFOLGE: Kommentare raus → JSON-LD LESEN (die Blöcke sind `<script>` und
 * fallen gleich mit weg) → Kopf-Bereich für `prefers-color-scheme` sichern →
 * `script`/`style`/`svg` & Co. entfernen → alles Übrige messen.
 */
export function extractSiteSignals(html: string): BrandSiteSignals {
  const withoutComments = html.replace(HTML_COMMENT, ' ')

  const ldTypes: string[] = []
  for (const block of withoutComments.match(JSON_LD_BLOCK) ?? []) {
    for (const type of jsonLdTypes(block)) {
      if (ldTypes.length < BRAND_SITE_MAX_JSONLD_TYPES && !ldTypes.includes(type)) ldTypes.push(type)
    }
  }

  // Der Kopf-Bereich — dort steht die Dunkelmodus-Bereitschaft, oft in einem
  // `<style>`, das gleich entfernt wird. Ohne `</head>` nehmen wir den Anfang:
  // eine Seite ohne Kopf-Ende ist kaputt, kein Sonderfall.
  const headEnd = HEAD_END.exec(withoutComments)?.index ?? -1
  const head = headEnd >= 0 ? withoutComments.slice(0, headEnd) : withoutComments.slice(0, 50_000)

  const clean = withoutComments
    .replace(DROPPED_BLOCKS, ' ')
    .replace(SELF_CLOSED_DROPPED, ' ')

  const titleTags = clean.match(/<title\b[^>]*>/gi) ?? []
  const firstTitle = /<title\b[^>]*>([\s\S]{0,2000}?)<\/title\s*>/i.exec(clean)?.[1] ?? ''

  let metaDescription = ''
  let metaDescriptionCount = 0
  let ogTitle = ''
  let ogDescription = ''
  let ogImage = ''
  let themeColor = ''
  let colorScheme = ''
  let viewport = ''
  for (const tag of clean.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = attribute(tag, 'name').trim().toLowerCase()
    const property = attribute(tag, 'property').trim().toLowerCase()
    const content = collapse(decodeHtmlEntities(attribute(tag, 'content')))
    if (name === 'description') {
      metaDescriptionCount += 1
      if (!metaDescription) metaDescription = content
    }
    if (!content) continue
    if (property === 'og:title' && !ogTitle) ogTitle = content
    if (property === 'og:description' && !ogDescription) ogDescription = content
    if (property === 'og:image' && !ogImage) ogImage = content
    if (name === 'theme-color' && !themeColor) themeColor = content
    if (name === 'color-scheme' && !colorScheme) colorScheme = content
    if (name === 'viewport' && !viewport) viewport = content
  }

  let hasFavicon = false
  let canonical = ''
  for (const tag of clean.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attribute(tag, 'rel').trim().toLowerCase()
    const href = attribute(tag, 'href').trim()
    if (!hasFavicon && rel.includes('icon') && href) hasFavicon = true
    if (!canonical && rel === 'canonical' && href) canonical = href.slice(0, BRAND_SITE_LABEL_MAX)
  }

  const htmlTag = /<html\b[^>]*>/i.exec(withoutComments)?.[0] ?? ''
  const htmlLang = attribute(htmlTag, 'lang').trim().toLowerCase()

  const headings: BrandSiteHeading[] = []
  const headingRe = /<h([1-6])\b[^>]*>([\s\S]{0,2000}?)<\/h\1\s*>/gi
  let headingMatch = headingRe.exec(clean)
  while (headingMatch !== null && headings.length < BRAND_SITE_MAX_HEADINGS) {
    const text = label(headingMatch[2] ?? '')
    if (text) headings.push({ level: Number(headingMatch[1]), text })
    headingMatch = headingRe.exec(clean)
  }

  const imageAlts: string[] = []
  for (const tag of clean.match(/<img\b[^>]*>/gi) ?? []) {
    if (imageAlts.length >= BRAND_SITE_MAX_ALTS) break
    imageAlts.push(collapse(decodeHtmlEntities(attribute(tag, 'alt'))).slice(0, BRAND_SITE_LABEL_MAX))
  }

  // Die obere Bildschirmhöhe, angenähert: der Anfang des BEREINIGTEN Rumpfes.
  // Bereinigt ist der Punkt — ein einziges Inline-SVG-Logo frisst sonst die
  // ganze Stichprobe, und die Handlungsaufforderung dahinter wäre unsichtbar.
  const bodyStart = /<body\b[^>]*>/i.exec(clean)
  const above = clean
    .slice(bodyStart ? bodyStart.index + bodyStart[0].length : 0, undefined)
    .slice(0, BRAND_SITE_CTA_SCAN_CHARS)
  const ctaTexts: string[] = []
  const ctaRe = /<(a|button)\b[^>]*>([\s\S]{0,500}?)<\/\1\s*>/gi
  let ctaMatch = ctaRe.exec(above)
  while (ctaMatch !== null && ctaTexts.length < BRAND_SITE_MAX_CTAS) {
    const text = label(ctaMatch[2] ?? '')
    if (text) ctaTexts.push(text)
    ctaMatch = ctaRe.exec(above)
  }

  // Handwerk: gemessen NUR in Textknoten (`>…<`). Über das ganze Dokument
  // gezählt wären Einrückung und Zeilenumbrüche des Quelltexts jedes Mal
  // hundert „doppelte Leerzeichen" — der Zähler sagte dann über jede Seite
  // dasselbe und damit nichts.
  let doubleSpaceCount = 0
  let mojibakeCount = 0
  let doubleEscapedCount = 0
  const nodeRe = new RegExp(TEXT_NODE.source, 'g')
  let node = nodeRe.exec(clean)
  while (node !== null) {
    const raw = node[1] ?? ''
    if (raw.trim()) {
      doubleSpaceCount += countMatches(raw, DOUBLE_SPACE_RE)
      const decoded = decodeHtmlEntities(raw)
      mojibakeCount += countMatches(decoded, MOJIBAKE_RE)
      doubleEscapedCount += countMatches(decoded, LEFTOVER_ENTITY_RE)
    }
    node = nodeRe.exec(clean)
  }

  return {
    title: label(firstTitle),
    titleCount: titleTags.length,
    metaDescription,
    metaDescriptionCount,
    ogTitle,
    ogDescription,
    ogImage,
    hasFavicon,
    themeColor,
    colorScheme,
    hasPrefersColorScheme: head.toLowerCase().includes('prefers-color-scheme'),
    viewport,
    htmlLang,
    headings,
    canonical,
    jsonLdTypes: ldTypes,
    ctaTexts,
    imageAlts,
    doubleSpaceCount,
    mojibakeCount,
    doubleEscapedCount,
  }
}

/**
 * IST DER ZWISCHENSPEICHER NOCH DER, DEN DIE STARTKARTE MEINT?
 *
 * Verglichen wird die Adresse, die der Cache BESCHREIBT, mit der, die heute im
 * Profil steht — nicht die Zeit. Wer seine Website wechselt, hat einen Cache
 * über eine fremde Seite; wer nur wartet, hat einen alten über die richtige.
 * Der zweite Fall ist harmlos, der erste ist eine Falschaussage.
 *
 * Ein LEERES `websiteUrl` macht keinen Cache veraltet: die Adresse zu löschen
 * heisst „ich will nichts mehr gelesen haben" — dann ist die Anzeige weg, und
 * eine „veraltet"-Warnung über etwas, das niemand mehr sieht, wäre Lärm.
 */
export function siteAnalysisIsStale(analyzedUrl: string, websiteUrl: string): boolean {
  if (!analyzedUrl || !websiteUrl) return false
  return analyzedUrl.trim() !== websiteUrl.trim()
}
