/**
 * DIE REINEN REGELN DES ABRUFS (Plan docs/archiv/BRAND-MARKTVERGLEICH.md §2.8,
 * §2.9 Nr. 1/2/8 und §7.4) — Adress-Normalisierung, Pfad-Sperrliste,
 * Seitenwahl, Nutzungsvorbehalt, Deckel.
 *
 * Alles hier ist PUR: eine Zeichenkette hinein, eine Entscheidung heraus. Nur
 * so lässt sich mit einer GEGENPROBE zeigen, dass eine Regel wirklich greift —
 * und die Regeln in dieser Datei sind die, bei denen ein stiller Ausfall
 * teuer wäre (ein übersehener Vorbehalt, eine gelesene Impressumsseite).
 */

// ── Deckel (Plan §2.8, verschärft durch §7.4) ──────────────────────────────

/**
 * WIE VIELE SEITEN JE WETTBEWERBER. §2.8 sagt 5, §7.4 hebt auf „5–8
 * Schlüsselseiten" und nennt als Deckel 8 — die spätere, ausführlichere Zahl
 * gilt (Anhang B des Plans nennt sie ebenfalls: „Deckel 8 Seiten").
 * Startseite + 7 weitere.
 */
export const MARKET_MAX_PAGES = 8

/** Zeichen je Seite, die in den Rohtext gehen (§2.8). */
export const MARKET_MAX_CHARS_PER_PAGE = 20_000

/**
 * ZEICHEN JE LAUF AN DIE MODELLE (§2.8: 60 000). §7.4 nennt 80 000 JE MARKE —
 * das ist die weitere Zahl, und sie steht im Widerspruch. Genommen wird die
 * ENGERE (60 000 über den ganzen Lauf), weil sie die Kostenaussage des Plans
 * trägt („0,10–0,30 € je Lauf") und weil ein Deckel, der im Zweifel zu klein
 * ist, eine Rechnung verhindert, während ein zu grosser sie erzeugt.
 */
export const MARKET_MAX_CHARS_PER_RUN = 60_000

/** Bytes je Seite — derselbe Deckel wie im brand-Abruf (§2.8: 2 MB). */
export const MARKET_MAX_BYTES_PER_PAGE = 2_000_000

// ── Adress-Normalisierung (§2.9 Nr. 8) ─────────────────────────────────────

/**
 * Query-Parameter, die nichts über die Seite sagen, sondern über die Kampagne,
 * die dorthin geführt hat. Sie fallen weg, damit `example.com/?utm_source=x`
 * und `example.com/` nicht zwei Kandidaten sind.
 */
const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid', 'twclid',
  'mc_cid', 'mc_eid', 'ref', 'ref_src', 'igshid', 'yclid', '_hsenc', '_hsmi',
]

export interface MarketNormalizedUrl {
  /** Die gespeicherte Fassung. */
  readonly url: string
  /**
   * DER DUBLETTEN-SCHLÜSSEL: Host kleingeschrieben, ohne `www.`, MIT einem
   * abweichenden Port.
   *
   * ── WARUM DER PORT MITZÄHLT ─────────────────────────────────────────────
   * Für echte Websites ändert das nichts: sie laufen auf 80/443, und der Port
   * fällt weg. Er zählt aber, sobald er GESETZT ist — denn dann sind
   * `example.com:8443` und `example.com:9000` zwei verschiedene Dienste, und
   * zwei verschiedene Dienste sind zwei Kandidaten.
   *
   * Bemerkt wurde das im Beweis-Skript: dort liegen fünf erfundene Websites
   * auf `127.0.0.1` mit je eigenem Port, und ohne den Port hielt die
   * Dubletten-Regel sie für EINE Marke — der zweite bis fünfte Kandidat wurde
   * mit 409 abgewiesen. Der Beweis hat damit keine Testumgebungs-Eigenheit
   * gefunden, sondern eine zu grobe Regel.
   */
  readonly hostKey: string
}

/**
 * DIE ADRESSE, WIE SIE GESPEICHERT WIRD.
 *
 * · Ohne Schema getippt ⇒ `https:` (nicht `http:` — wer eine Adresse ohne
 *   Schema tippt, meint das Web von heute; ein Server, der nur `http` kann,
 *   leitet uns ohnehin dorthin, und den Sprung macht der Abruf mit).
 * · Host klein (Hostnamen sind es de facto), führendes `www.` bleibt in der
 *   URL stehen (der Server könnte darauf bestehen), fällt aber aus dem
 *   DUBLETTEN-Schlüssel: `www.x.de` und `x.de` sind derselbe Wettbewerber.
 * · Fragment weg — `#preise` ist eine Stelle auf der Seite, keine Seite.
 * · Tracking-Query weg (s. o.), der Rest bleibt: `?lang=de` kann eine andere
 *   Seite sein.
 * · Nur `http`/`https`, keine Zugangsdaten in der Adresse.
 *
 * `null` heisst „das ist keine brauchbare Website-Adresse" — die Route macht
 * daraus einen 400 mit Grund, nie eine stille Korrektur.
 */
export function normalizeMarketUrl(raw: string): MarketNormalizedUrl | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > 512) return null

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  }
  catch {
    return null
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null

  const host = url.hostname.toLowerCase()
  // Ein Host ohne Punkt ist kein öffentlicher Name (`localhost`, `intranet`).
  // Der SSRF-Vertrag des Abrufs fängt das ohnehin — hier fällt es schon beim
  // Eintragen auf, und der Mensch bekommt einen Grund statt eines toten
  // Kandidaten.
  if (!host.includes('.') || host.endsWith('.')) return null

  url.hostname = host
  url.hash = ''
  url.username = ''
  url.password = ''
  for (const param of TRACKING_PARAMS) url.searchParams.delete(param)
  // Ein leerer Query-Rest soll kein `?` hinterlassen.
  if (![...url.searchParams.keys()].length) url.search = ''

  // Der Port zählt nur, wenn er ABWEICHT — `url.port` ist bei 80/443 leer,
  // sobald das Schema dazu passt (URL normalisiert das selbst).
  const bare = host.replace(/^www\./, '')
  return { url: url.toString(), hostKey: url.port ? `${bare}:${url.port}` : bare }
}

// ── Pfad-Sperrliste (§2.9 Nr. 2, §1.7 Nr. 3) ───────────────────────────────

/**
 * PFADE, DIE GAR NICHT ERST GEHOLT WERDEN.
 *
 * ── DREI GRÜNDE, IN DIESER REIHENFOLGE ────────────────────────────────────
 *  1. PERSONENBEZUG (§1.7 Nr. 3, der wichtigste): `team`, `impressum`,
 *     `kontakt`, `about-us/team`, `jobs`, `karriere`, `presse` tragen Namen,
 *     Adressen, Telefonnummern und Fotos von Menschen. Der PII-Filter danach
 *     ist ein NETZ, keine Erlaubnis — die billigste Art, keine
 *     personenbezogenen Daten zu verarbeiten, ist, sie nicht zu holen.
 *  2. RECHTSTEXTE (`datenschutz`, `privacy`, `agb`, `terms`, `widerruf`,
 *     `cookies`): sie sagen NICHTS über die Marke. Es sind Textbausteine, die
 *     überall gleich klingen — im Marktprofil erzeugten sie Scheinbefunde
 *     („alle im Feld betonen Datensicherheit").
 *  3. FUNKTIONSSEITEN (`login`, `account`, `cart`, `checkout`, `warenkorb`,
 *     `suche`, `search`): keine Marketing-Aussage, oft hinter einer Anmeldung,
 *     und §1.7 Nr. 1 erlaubt ausdrücklich nur öffentliche Marketing-Texte.
 *
 * ── WARUM `blog` UND `news` DRINSTEHEN ────────────────────────────────────
 * Der Auftrag verlangt eine Begründung. Ein Blog ist tagesaktueller Inhalt in
 * beliebiger Menge: er verbrennt das Seiten-Budget (8) mit Beiträgen, die je
 * eine Momentaufnahme sind, und die HÄUFIGKEITS-Rechnung (§7.4) wird davon
 * verzerrt — eine Marke mit 200 Blogartikeln „sagt" dann etwas anderes als
 * dieselbe Marke ohne Blog. Was eine Marke über SICH sagt, steht auf
 * `/ueber-uns`, nicht in einem Beitrag über die Messe im Mai. Eine Ausnahme
 * gibt es bewusst nicht: „Blog mit Über-uns-Bezug" wäre eine Einschätzung, und
 * die trifft hier kein Programm.
 *
 * Geprüft wird SEGMENTWEISE (nicht als Teilzeichenkette): `/teamwork-tools`
 * ist kein Team-Pfad, `/about/team` schon. Deutsch und Englisch, weil die
 * Zielgruppe beides schreibt.
 */
export const MARKET_BLOCKED_PATH_SEGMENTS: readonly string[] = [
  // 1 — Personenbezug
  'team', 'teams', 'ueber-das-team', 'mitarbeiter', 'people', 'staff',
  'impressum', 'imprint', 'legal-notice',
  'kontakt', 'contact', 'kontaktformular',
  'jobs', 'job', 'karriere', 'career', 'careers', 'stellenangebote',
  'presse', 'press', 'pressemitteilungen',
  // 2 — Rechtstexte
  'datenschutz', 'privacy', 'privacy-policy', 'datenschutzerklaerung',
  'agb', 'terms', 'terms-of-service', 'nutzungsbedingungen', 'widerruf',
  'cookies', 'cookie-policy', 'barrierefreiheit', 'accessibility',
  // 3 — Funktionsseiten
  'login', 'signin', 'anmelden', 'register', 'registrieren', 'signup',
  'account', 'konto', 'profil', 'profile', 'dashboard',
  'cart', 'warenkorb', 'checkout', 'kasse', 'zahlung',
  'search', 'suche', 'sitemap', 'feed', 'rss',
  // Tagesaktuelles (s. Kopf)
  'blog', 'news', 'neuigkeiten', 'aktuelles', 'magazin', 'journal', 'events',
]

const BLOCKED = new Set(MARKET_BLOCKED_PATH_SEGMENTS)

/** Die Segmente eines Pfads, klein, ohne Dateiendung und ohne Leerstücke. */
function pathSegments(pathname: string): string[] {
  return pathname
    .toLowerCase()
    .split('/')
    .map(segment => decodeURIComponentSafe(segment).replace(/\.(html?|php|aspx?)$/i, ''))
    .filter(Boolean)
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value)
  }
  catch {
    return value
  }
}

/** Steht dieser Pfad auf der Sperrliste? (`true` = NICHT holen.) */
export function marketPathBlocked(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  }
  catch {
    return true
  }
  // Eine Datei, die keine Seite ist, ist ebenfalls nichts für uns — und ein
  // 40-MB-PDF wäre die teuerste Art, das zu bemerken.
  if (/\.(pdf|zip|docx?|xlsx?|pptx?|jpe?g|png|gif|webp|svg|mp4|mp3|avi|dmg|exe)$/i.test(parsed.pathname)) {
    return true
  }
  return pathSegments(parsed.pathname).some(segment => BLOCKED.has(segment))
}

// ── Seitenwahl (§7.4) ───────────────────────────────────────────────────────

/**
 * DIE PFAD-HEURISTIK: welche Seite sagt am ehesten etwas über die MARKE?
 *
 * Kleinere Zahl = früher gelesen. Die Reihenfolge folgt §7.4 („Start, Über
 * uns, Leistungen/Produkte, Preise, Manifest/Werte, FAQ") und ist bewusst grob:
 * sie muss nur besser sein als die Reihenfolge, in der Links im Quelltext
 * stehen — und das ist sie, weil dort die Navigation zuerst kommt und in der
 * die Startseite doppelt steht.
 */
const PATH_PRIORITY: readonly (readonly [number, readonly string[]])[] = [
  [10, ['about', 'about-us', 'ueber-uns', 'uber-uns', 'ueber', 'wir', 'who-we-are', 'unternehmen', 'company', 'story', 'geschichte']],
  [20, ['philosophie', 'philosophy', 'werte', 'values', 'mission', 'vision', 'purpose', 'manifest', 'manifesto', 'haltung', 'prinzipien', 'principles']],
  [30, ['leistungen', 'services', 'service', 'angebot', 'angebote', 'was-wir-tun', 'what-we-do', 'loesungen', 'solutions', 'produkte', 'products', 'produkt', 'product']],
  [40, ['preise', 'pricing', 'preis', 'plans', 'tarife', 'kosten']],
  [50, ['faq', 'fragen', 'haeufige-fragen', 'hilfe', 'help']],
  [60, ['kunden', 'customers', 'referenzen', 'cases', 'case-studies', 'projekte', 'projects', 'portfolio']],
]

const PRIORITY_BY_SEGMENT = new Map<string, number>()
for (const [rank, segments] of PATH_PRIORITY) {
  for (const segment of segments) PRIORITY_BY_SEGMENT.set(segment, rank)
}

/**
 * Der Rang einer Adresse. Die STARTSEITE ist immer 0 — sie ist die dichteste
 * Selbstbeschreibung, die eine Marke hat. Unbekannte Pfade landen bei 100,
 * flache vor tiefen (`/angebot` vor `/angebot/2024/details`).
 */
export function marketPathRank(url: string, startUrl: string): number {
  let parsed: URL
  let start: URL
  try {
    parsed = new URL(url)
    start = new URL(startUrl)
  }
  catch {
    return 999
  }
  const segments = pathSegments(parsed.pathname)
  if (!segments.length) return 0
  if (parsed.pathname === start.pathname && parsed.search === start.search) return 0

  let best = 100
  for (const segment of segments) {
    const rank = PRIORITY_BY_SEGMENT.get(segment)
    if (rank !== undefined && rank < best) best = rank
  }
  // Tiefe als Feinsortierung, nie als eigener Rang: sie soll zwei gleich gute
  // Kandidaten trennen, nicht einen guten hinter einen schlechten schieben.
  return best + Math.min(segments.length - 1, 8)
}

/**
 * DIE SEITENLISTE EINES LAUFS — Startseite zuerst, dann nach Rang, ohne
 * Sperrliste, ohne Dubletten, ohne fremden Ursprung, gedeckelt auf `limit`.
 *
 * `candidates` kommen aus zwei Quellen (Sitemap und interne Links) und in
 * dieser Reihenfolge; die Sortierung ist STABIL, damit zwei gleich gerankte
 * Adressen ihre Herkunfts-Reihenfolge behalten und ein Lauf reproduzierbar
 * bleibt.
 */
export function selectMarketPages(
  startUrl: string,
  candidates: readonly string[],
  limit: number = MARKET_MAX_PAGES,
): string[] {
  let start: URL
  try {
    start = new URL(startUrl)
  }
  catch {
    return []
  }

  const selected: string[] = [start.toString()]
  const seen = new Set([start.toString()])

  const ranked = candidates
    .map((url, index) => ({ url, index, rank: marketPathRank(url, startUrl) }))
    .filter((entry) => {
      let parsed: URL
      try {
        parsed = new URL(entry.url)
      }
      catch {
        return false
      }
      if (parsed.host !== start.host || parsed.protocol !== start.protocol) return false
      if (marketPathBlocked(entry.url)) return false
      return true
    })
    .sort((a, b) => (a.rank - b.rank) || (a.index - b.index))

  for (const entry of ranked) {
    if (selected.length >= limit) break
    // Dubletten mit und ohne Schlussschrägstrich sind dieselbe Seite.
    const key = entry.url.replace(/\/$/, '')
    if (seen.has(entry.url) || seen.has(key) || seen.has(`${key}/`)) continue
    seen.add(entry.url)
    seen.add(key)
    selected.push(entry.url)
  }

  return selected
}

// ── Nutzungsvorbehalt (§2.9 Nr. 1) ─────────────────────────────────────────

/**
 * DIE VIER FORMEN DES NUTZUNGSVORBEHALTS — seit BS1 R2b eine HÜLLE.
 *
 * Die Regel steht in `packages/brand/shared/brandTdm.ts`, aus demselben Grund
 * wie der Robots-Parser nebenan (`marketRobots.ts`): seit R2b (Davids
 * Entscheidung 2026-09-08) prüft auch der Einseiten-Abruf des Brand-Checks den
 * Vorbehalt, und `brand` darf `market` nicht kennen (CONCEPT.md A14). Eine
 * Kopie wären zwei Wahrheiten darüber, wessen Inhalt wir auswerten dürfen.
 *
 * Der market-seitige NAME bleibt: `marketFetch.ts`, die Bot-Seite und die
 * Tests des Marktvergleichs nennen ihn unverändert.
 */
export type { BrandTdmSignals as MarketTdmSignals } from '../../brand/shared/brandTdm'
export { brandTdmReserved as marketTdmReserved } from '../../brand/shared/brandTdm'

// ── Rohtext-Ablage ──────────────────────────────────────────────────────────

/**
 * DER TRENN-MARKER ZWISCHEN ZWEI SEITEN im gespeicherten Rohtext.
 *
 * Er ist kein Schmuck: die HÄUFIGKEIT einer Aussage (§7.4) wird ÜBER SEITEN
 * gezählt, und das geht nur, wenn der Rohtext noch weiss, wo eine Seite endet.
 * Und der Beleg-Riegel prüft ein Zitat gegen die SEITE, die das Modell genannt
 * hat — ohne Marker gäbe es diese Seite im gespeicherten Text nicht mehr.
 */
export function marketPageMarker(url: string): string {
  return `\n\n=== ${url} ===\n`
}

/** Aus dem gespeicherten Rohtext die Seiten zurückgewinnen (URL → Text). */
export function splitMarketRawText(rawText: string): Map<string, string> {
  const out = new Map<string, string>()
  const pattern = /\n?\n?=== (\S+) ===\n/g
  let match = pattern.exec(rawText)
  while (match !== null) {
    const url = match[1] ?? ''
    const start = match.index + match[0].length
    const next = pattern.exec(rawText)
    const end = next ? next.index : rawText.length
    if (url) out.set(url, rawText.slice(start, end))
    match = next
  }
  return out
}
