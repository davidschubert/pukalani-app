import { isPlausibleScriptId } from '../../core/shared/analyticsScript'
import type { AnalyticsSettingsLike } from '../../core/shared/analyticsScript'
import type { AnalyticsCountryCount, AnalyticsNamedCount, AnalyticsSeriesPoint, AnalyticsTotals } from './types/analytics'

/**
 * DER VERTRAG ZUR PLAUSIBLE-STATS-API — pur, ohne h3, ohne fetch.
 *
 * Warum das hier liegt und nicht in der Route: die Route darf nur noch
 * „schicken und einsammeln". Alles, was man falsch machen kann — welche Site
 * gefragt wird, ob der Hostname-Filter dranhängt, in welcher Reihenfolge die
 * Metriken zurückkommen — ist hier eine Funktion mit Test. Ein vergessener
 * Filter wäre kein Schönheitsfehler, sondern die Besucherzahlen ALLER
 * Communities in der Ansicht einer einzigen.
 *
 * Alle Formen sind am 2026-08-04 live gegen plausible.hawaii.studio gemessen
 * (`POST /api/v2/query`, Bearer-Key):
 *   Antwort  {"results":[{"metrics":[…],"dimensions":[…]}]}
 *   Fehler   {"error":"…"} mit non-2xx
 */

/** Ein Filter der v2-API. Wir brauchen genau eine Form: `is` auf eine Liste. */
export type PlausibleFilter = ['is', string, string[]]

/**
 * Der Zeitraum einer Abfrage — ENTWEDER ein Kürzel („30d", „day") ODER ein
 * Paar aus zwei ISO-Zeitpunkten. Beide Formen sind am 2026-08-11 live gegen
 * plausible.hawaii.studio gemessen; das Paar wird als ZEITPUNKT geparst
 * (Suffix „Z" nötig, die Antwort echot in der Zeitzone der Site zurück —
 * derselbe Augenblick, andere Schreibweise).
 */
export type PlausibleDateRange = string | [string, string]

export interface PlausibleQuery {
  site_id: string
  metrics: string[]
  date_range: PlausibleDateRange
  filters?: PlausibleFilter[]
  dimensions?: string[]
  pagination?: { limit: number }
}

/** Nur, was wir lesen — das SDK-lose Gegenstück zur Antwort der v2-API. */
export interface PlausibleQueryResponse {
  results?: { metrics?: unknown[], dimensions?: unknown[] }[]
}

/**
 * WOHIN die Frage geht — und ob sie überhaupt gestellt werden kann.
 *
 *  - `off`         → es wird nichts gemessen, es gibt nichts zu zeigen.
 *  - `unavailable` → es wird gemessen, aber wir können die Zahlen nicht holen
 *    (die App hat eine Sammel-Id ohne Site-Schlüssel, oder der Request hat
 *    keinen Host). Das ist NICHT dasselbe wie `off`: die Seite muss „gerade
 *    nicht erreichbar" sagen und darf nicht behaupten, die Messung sei aus.
 *  - `ready`       → Site-Schlüssel und Filter stehen.
 */
export type AnalyticsStatsTarget =
  | { state: 'off' }
  | { state: 'unavailable' }
  | { state: 'ready', siteId: string, filters: PlausibleFilter[] }

/** Die Sammel-Site des Deployments, wie sie in der App-Config steht. */
export interface AnalyticsSharedSiteConfig {
  scriptId?: string
  siteId?: string
}

/**
 * PURE (unit-getestet): Welche Plausible-Site beantwortet die Frage dieser
 * Community — und mit welchem Filter?
 *
 * ZWEI MODI, dieselbe Rangfolge wie beim Script (`effectiveScriptId`):
 *
 *  1. EIGENE SITE: der Owner hat eine eigene Plausible-Site hinterlegt. Dann
 *     ist der Site-Schlüssel der HOST der Community und es braucht keinen
 *     Filter — in dieser Site steht ohnehin nur sie selbst.
 *     ANNAHME, die dabei bewusst getroffen wird: die Domain der eigenen Site
 *     ist der Host, unter dem die Community läuft. Die CE hat keine Sites-API,
 *     über die wir sie erfragen könnten. Die Script-Id selbst verrät die
 *     Domain nicht — wohl aber ihre öffentliche Zähl-Datei
 *     (`<instanz>/js/<id>.js`, Feld `domain`). Seit BE-022 (2026-11-17) liest
 *     das Speichern sie dort nach und nimmt nur eine Id an, deren Seite einer
 *     eigenen Adresse der Community entspricht (`analyticsScriptOwner.ts`) —
 *     der Vergleich ignoriert aber ein führendes `www.`. Diese Funktion
 *     fragt weiter den HOST der Anfrage und nicht die dort gelesene
 *     Adresse. Stimmt die Annahme nicht (die Site heißt in
 *     Plausible anders), antwortet die API mit einem Fehler und die Seite sagt
 *     „gerade nicht erreichbar" — sie zeigt NIE fremde Zahlen, denn ein
 *     falscher Site-Schlüssel trifft keine andere Community, sondern nichts.
 *  2. SAMMEL-SITE: der Schalter steht an. Site-Schlüssel ist die eine
 *     Sammel-Site, und der `event:hostname`-Filter ist die GANZE Trennung
 *     zwischen den Communities — deshalb steht er hier und nicht in der Route.
 *
 * Der Host kommt IMMER vom Server (Request-Host), NIE aus der Anfrage des
 * Clients: sonst könnte sich jeder Owner die Zahlen einer fremden Community
 * ziehen, indem er einen anderen Hostnamen mitschickt.
 */
export function resolveStatsTarget(
  row: AnalyticsSettingsLike | null | undefined,
  shared: AnalyticsSharedSiteConfig,
  host: string,
): AnalyticsStatsTarget {
  const own = row?.plausibleScriptId ?? ''
  if (own && isPlausibleScriptId(own)) {
    // Ohne Host kein Site-Schlüssel — gemessen wird trotzdem (das Script hängt
    // im Head), also „gerade nicht erreichbar" statt „aus".
    if (!host) return { state: 'unavailable' }
    return { state: 'ready', siteId: host, filters: [] }
  }

  const sharedScriptId = shared.scriptId ?? ''
  if (row?.enabled !== true || !sharedScriptId || !isPlausibleScriptId(sharedScriptId)) {
    return { state: 'off' }
  }

  const sharedSiteId = shared.siteId ?? ''
  if (!sharedSiteId || !host) return { state: 'unavailable' }
  return { state: 'ready', siteId: sharedSiteId, filters: [['is', 'event:hostname', [host]]] }
}

/**
 * Die Metriken der Übersicht — die REIHENFOLGE ist der Vertrag: die v2-API
 * antwortet mit einem Zahlen-Array in genau dieser Ordnung, ohne Namen.
 *
 * `views_per_visit` darf hier stehen, weil das eine REINE Metrik-Abfrage ist:
 * mit `dimensions` zusammen lehnt die API sie ab (live gemessen 2026-08-11,
 * `{"error":"…"}`). Wer diese Liste je in eine Listen-Abfrage kopiert, bekommt
 * darum keinen halben Wert, sondern einen Fehlschlag — und die Seite sagt
 * „gerade nicht erreichbar".
 */
export const ANALYTICS_TOTAL_METRICS = [
  'visitors',
  'visits',
  'pageviews',
  'views_per_visit',
  'visit_duration',
  'bounce_rate',
] as const

/** Wie viele Zeilen eine Liste zeigt. */
export const ANALYTICS_LIST_LIMIT = 8

/** Zeitraum aller Auswertungen außer „heute" (Vorgabe, s. `AnalyticsStatsRange`). */
export const ANALYTICS_RANGE = '30d'

/**
 * DIE WÄHLBAREN ZEITRÄUME — eine WEISSE LISTE, kein freies Feld.
 *
 * Der Wert kommt als Query-Parameter, ist also EINGABE. Er wandert unverändert
 * in `date_range` einer Abfrage gegen eine fremde Instanz und in den
 * Cache-Schlüssel; beides sind Gründe, ihn nicht zu glauben. Alle drei sind am
 * 2026-08-11 live gegen plausible.hawaii.studio gemessen.
 */
export const ANALYTICS_STATS_RANGES = ['7d', '30d', '90d'] as const

export type AnalyticsStatsRange = typeof ANALYTICS_STATS_RANGES[number]

/**
 * PURE (unit-getestet): Eingabe → gültiger Zeitraum. FAIL-CLOSED — alles, was
 * nicht in der Liste steht (fehlend, Array, Unfug, ein Zeitraum, den Plausible
 * zwar kennt, wir aber nicht anbieten), wird zur Vorgabe.
 *
 * Bewusst KEIN Fehler: ein kaputter Link soll die Statistik zeigen, nicht eine
 * Fehlerseite. Falsch messen kann er dabei nicht — 30 Tage sind genau das, was
 * die Seite ohne Auswahl ohnehin zeigt.
 */
export function normalizeStatsRange(input: unknown): AnalyticsStatsRange {
  return (ANALYTICS_STATS_RANGES as readonly string[]).includes(input as string)
    ? input as AnalyticsStatsRange
    : ANALYTICS_RANGE
}

/** Die Breite des „letzte Minuten"-Fensters. */
const RECENT_WINDOW_MS = 30 * 60 * 1000

/**
 * Ein Zeitpunkt in der Schreibweise, die die v2-API als Instant liest:
 * ISO mit „Z", auf Sekunden gekürzt. Millisekunden wegzulassen ist kein
 * Geschmack, sondern Lesbarkeit im Server-Log — die Grenze eines
 * 30-Minuten-Fensters interessiert auf die Sekunde genau niemanden.
 */
function instant(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 19)}Z`
}

export interface AnalyticsQuerySet {
  today: PlausibleQuery
  totals: PlausibleQuery
  series: PlausibleQuery
  topPages: PlausibleQuery
  topSources: PlausibleQuery
  countries: PlausibleQuery
  regions: PlausibleQuery
  devices: PlausibleQuery
  browsers: PlausibleQuery
  os: PlausibleQuery
  entryPages: PlausibleQuery
  recent: PlausibleQuery
}

/**
 * PURE (unit-getestet): alle Abfragen einer Dashboard-Ansicht.
 *
 * „Heute", „letzte 30 Minuten" und der gewählte Zeitraum lassen sich NICHT
 * zusammenlegen — `date_range` gilt für die ganze Abfrage, drei Zeiträume
 * brauchen also drei Anfragen. Die Route schickt alle nebeneinander los.
 *
 * `nowIso` ist ein PARAMETER und keine Uhr im Rumpf: sonst wäre die Funktion
 * nicht mehr testbar, und ausgerechnet das Fenster „letzte 30 Minuten" wäre
 * dann der einzige Teil des Vertrags ohne Beweis. Die Route reicht
 * `new Date().toISOString()` herein; ohne Angabe nimmt sie die Uhr des
 * Aufrufers, damit ein vergessenes Argument nicht in einer kaputten Abfrage
 * endet.
 *
 * DAS 30-MINUTEN-FENSTER IST EIN CUSTOM-RANGE, kein Kürzel. Plausible CE hat
 * kein „realtime" in der v2-Abfrage, wohl aber ein Paar aus zwei
 * ISO-Zeitpunkten MIT „Z" — am 2026-08-11 live gemessen, inklusive
 * `event:hostname`-Filter, also auch für die Sammel-Site tragfähig. Die
 * Antwort kommt in der Zeitzone der Site zurück; derselbe Augenblick, andere
 * Schreibweise — für eine Zahl ohne Datumsanzeige ist das ohne Belang.
 */
export function buildStatsQueries(
  siteId: string,
  filters: PlausibleFilter[],
  range: AnalyticsStatsRange = ANALYTICS_RANGE,
  nowIso: string = new Date().toISOString(),
): AnalyticsQuerySet {
  const base = { site_id: siteId, ...(filters.length ? { filters } : {}) }
  const now = new Date(nowIso).getTime()

  /** Eine Rang-Liste: eine Dimension, eine Zahl, acht Zeilen. */
  const list = (dimensions: string[]): PlausibleQuery => ({
    ...base,
    metrics: ['visitors'],
    date_range: range,
    dimensions,
    pagination: { limit: ANALYTICS_LIST_LIMIT },
  })

  return {
    today: { ...base, metrics: ['visitors'], date_range: 'day' },
    totals: { ...base, metrics: [...ANALYTICS_TOTAL_METRICS], date_range: range },
    series: { ...base, metrics: ['visitors'], date_range: range, dimensions: ['time:day'] },
    topPages: list(['event:page']),
    topSources: list(['visit:source']),
    /**
     * ZWEI Dimensionen in EINER Abfrage: der ISO-Code (für die Flagge) und der
     * Name (zum Lesen). Getrennt zu fragen hieße, zwei Listen anhand ihrer
     * Reihenfolge wieder zusammenzustecken — und die Reihenfolge ist bei
     * Gleichstand nichts, worauf man bauen sollte.
     */
    countries: list(['visit:country', 'visit:country_name']),
    regions: list(['visit:region_name']),
    devices: list(['visit:device']),
    browsers: list(['visit:browser']),
    os: list(['visit:os']),
    entryPages: list(['visit:entry_page']),
    recent: {
      ...base,
      metrics: ['visitors'],
      date_range: [instant(now - RECENT_WINDOW_MS), instant(now)],
    },
  }
}

/**
 * Eine Zahl aus der Antwort holen — fehlt sie oder ist sie keine, wird daraus
 * 0 und nicht NaN. Eine Kachel mit „NaN" wäre schlimmer als eine mit „0": sie
 * sieht nach einem Fehler in unserem Dashboard aus, nicht nach fehlenden Daten.
 */
function numberAt(metrics: unknown[] | undefined, index: number): number {
  const value = metrics?.[index]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function textAt(dimensions: unknown[] | undefined, index: number): string {
  const value = dimensions?.[index]
  return typeof value === 'string' ? value : ''
}

/** PURE: die eine Besucherzahl einer Totals-Abfrage (Zeitraum „heute"). */
export function mapVisitors(response: PlausibleQueryResponse): number {
  return numberAt(response.results?.[0]?.metrics, 0)
}

/**
 * PURE: die Übersichtszahlen — die Indizes SIND die Reihenfolge von
 * ANALYTICS_TOTAL_METRICS. Wer dort eine Metrik einschiebt, muss hier
 * mitzählen; der Test daneben ist genau dafür da.
 */
export function mapTotals(response: PlausibleQueryResponse): AnalyticsTotals {
  const metrics = response.results?.[0]?.metrics
  return {
    visitors: numberAt(metrics, 0),
    visits: numberAt(metrics, 1),
    pageviews: numberAt(metrics, 2),
    viewsPerVisit: numberAt(metrics, 3),
    visitDurationSeconds: Math.round(numberAt(metrics, 4)),
    bounceRate: numberAt(metrics, 5),
  }
}

/**
 * PURE: die Tagesreihe. Einträge ohne Datum fallen raus — ein Balken ohne
 * Beschriftung ist für einen Screenreader nichts als Rauschen.
 */
export function mapSeries(response: PlausibleQueryResponse): AnalyticsSeriesPoint[] {
  return (response.results ?? [])
    .map(entry => ({ date: textAt(entry.dimensions, 0), visitors: numberAt(entry.metrics, 0) }))
    .filter(point => point.date !== '')
}

/**
 * PURE: eine Dimensions-Liste (Seiten, Quellen). Einträge ohne Namen fallen
 * raus — bei `visit:source` ist der Direktzugriff eine leere Zeichenkette, und
 * eine namenlose Zeile in einer Top-Liste erklärt niemandem etwas.
 */
export function mapNamedCounts(response: PlausibleQueryResponse): AnalyticsNamedCount[] {
  return (response.results ?? [])
    .map(entry => ({ name: textAt(entry.dimensions, 0), visitors: numberAt(entry.metrics, 0) }))
    .filter(entry => entry.name !== '')
}

/**
 * PURE: die Länderliste — Code und Name aus DERSELBEN Zeile (dimensions[0] =
 * ISO-Code, [1] = Name).
 *
 * Gefiltert wird über den NAMEN, nicht über den Code: Plausible liefert für
 * Besuche ohne Geo-Zuordnung eine leere Zeile, und eine Flagge ohne Land wäre
 * ein Rätsel statt einer Angabe. Umgekehrt bleibt ein Land OHNE brauchbaren
 * Code drin — es verliert dann nur seine Flagge (s. `countryFlagEmoji`).
 */
export function mapCountryCounts(response: PlausibleQueryResponse): AnalyticsCountryCount[] {
  return (response.results ?? [])
    .map(entry => ({
      code: textAt(entry.dimensions, 0),
      name: textAt(entry.dimensions, 1),
      visitors: numberAt(entry.metrics, 0),
    }))
    .filter(entry => entry.name !== '')
}

/**
 * PURE: ISO-Ländercode → Flaggen-Emoji, per Codepoint-Rechnung.
 *
 * Zwei Buchstaben werden zu zwei „Regional Indicator Symbols" (U+1F1E6 ist
 * „A"), die jedes System als Flagge zusammensetzt. Bewusst KEIN Paket: das
 * wären ein paar Dutzend Kilobyte Tabelle im Bundle jeder Kunden-Community für
 * eine Zeile Arithmetik.
 *
 * Alles, was nicht aus genau zwei Buchstaben besteht, ergibt '' — die Liste
 * zeigt dann den Namen ohne Flagge. Ein Sondercode wie „XX" ergibt zwei
 * Indikator-Zeichen ohne Flaggen-Bild; das ist harmlos und billiger als eine
 * gepflegte Liste aller gültigen Codes, die bei jeder Staatsgründung veraltet.
 */
export function countryFlagEmoji(code: string): string {
  const upper = code.toUpperCase()
  if (!/^[A-Z]{2}$/.test(upper)) return ''
  return String.fromCodePoint(...[...upper].map(letter => 0x1F1E6 + letter.charCodeAt(0) - 65))
}
