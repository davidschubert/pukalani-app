import { readFile } from 'node:fs/promises'
import type { H3Event } from 'h3'
import { collectCountryCodes, normalizeCityQuery, parseCityTable, rankCities, type GeoCityEntry } from '../../shared/geoCities'
import type { GeoCitySuggestion } from '../../shared/types/geo'

/**
 * ORTS-SUCHE aus einem LOKALEN Verzeichnis (GeoNames-Auszug), nicht aus einem
 * fremden Dienst — die unreine Hälfte: Datei laden, im Prozess halten,
 * fail-soft schweigen. Die Rangfolge selbst ist pur und liegt in
 * shared/geoCities.ts.
 *
 * WARUM ÜBERHAUPT: ein Mitglied gibt seinen Standort FREIWILLIG im Profil an
 * (Etappe 1 der Mitglieder-Karte). Ein Freitextfeld hätte „Köln", „koeln",
 * „Cologne" und „NRW" nebeneinander gestellt — und keine Koordinaten. Der
 * Picker legt deshalb Label UND Koordinaten in EINEM Zug fest.
 *
 * KEINE ANFRAGE VERLÄSST DEN SERVER. Wer tippt, verrät das keinem
 * Geodaten-Anbieter; das Verzeichnis liegt als Datei neben der App.
 *
 * DER PFAD IST DER SCHALTER (`runtimeConfig.geoCitiesPath`, Env
 * NUXT_GEO_CITIES_PATH) — dieselbe Regel wie bei geoCity.ts: eine Datei, die
 * es geben muss, ist die ehrlichere Bedingung als ein Flag daneben. Ohne Pfad
 * liefert die Suche eine LEERE Liste, und der Picker sagt „keine Treffer".
 *
 * ── UNTERSCHIED ZU geoCity.ts: HIER WIRD NICHT NACHGELADEN ────────────────
 * Der MMDB-Leser prüft alle 60 s die `mtime`, weil die IP-Datenbank monatlich
 * ersetzt wird und eine veraltete IP-Zuordnung falsch wäre. Städte dagegen
 * ziehen nicht um: Name, Region und Koordinaten von Pukalani sind in einem
 * Jahr dieselben. Ein neues Verzeichnis (mehr Orte, neue Einwohnerzahlen) ist
 * ein DEPLOY-Ereignis, und ein Deploy startet den Prozess ohnehin neu. Der
 * `stat`-Takt wäre hier also I/O für einen Fall, den es nicht gibt — deshalb
 * bewusst nur EIN Laden je Prozess.
 */

/** Voreinstellung der Trefferzahl — das Menü zeigt ohnehin nur eine Handvoll. */
const DEFAULT_LIMIT = 8

/**
 * Was einmal gelesen und dann gehalten wird: die Orte UND die Ländercodes,
 * die darin vorkommen.
 *
 * Die Länderliste steht HIER und nicht in der Route, weil sie eine Eigenschaft
 * der geladenen Datei ist: sie einmal beim Laden zu bauen kostet nichts, sie
 * je Anfrage aus 170.000 Einträgen zu sammeln wäre ein voller Durchlauf für
 * eine Antwort, die sich bis zum nächsten Deploy nicht ändert.
 */
interface GeoCityIndex {
  entries: GeoCityEntry[]
  countries: string[]
}

/**
 * Der Puffer ist das PROMISE, nicht das Array: sonst laden zwei gleichzeitige
 * Requests dieselben 10 MB zweimal. Gehalten wird erst ab dem ersten Aufruf —
 * den Arbeitsspeicher zahlt nur ein Deployment, das den Pfad wirklich setzt
 * UND jemanden hat, der tippt.
 */
let indexPromise: Promise<GeoCityIndex | null> | null = null
let loadedPath = ''
let warnedUnreadable = false

/**
 * Einmal pro Prozess laut, dann still — dasselbe Muster wie
 * `warnGeoCityUnreadableOnce` und `warnMailerMissingOnce` (F44): ein
 * konfigurierter, aber unlesbarer Pfad ist genau die Sorte Fehler, die sich
 * wie ein bewusst abgeschaltetes Produkt anfühlt (das Feld erscheint, es
 * findet nur nie etwas). Gewarnt wird DA, wo etwas verworfen wird.
 */
function warnGeoCitiesUnreadableOnce(path: string, error: unknown): void {
  if (warnedUnreadable) return
  warnedUnreadable = true
  const detail = error instanceof Error ? error.message : String(error)
  console.warn(`[core] NUXT_GEO_CITIES_PATH zeigt auf "${path}", die Datei ist aber nicht lesbar (${detail}) — der Orts-Picker im Profil findet nichts.`)
}

/** Datei einlesen — wirft NIE, ein Fehlschlag ist `null`. */
async function loadIndex(path: string): Promise<GeoCityIndex | null> {
  try {
    const entries = parseCityTable(await readFile(path, 'utf8'))
    return { entries, countries: collectCountryCodes(entries) }
  }
  catch (error) {
    warnGeoCitiesUnreadableOnce(path, error)
    return null
  }
}

/** Das gehaltene Verzeichnis; neu gelesen nur, wenn sich der PFAD ändert. */
function resolveIndex(event: H3Event): Promise<GeoCityIndex | null> {
  const path = useRuntimeConfig(event).geoCitiesPath
  if (!path) return Promise.resolve(null)

  if (!indexPromise || loadedPath !== path) {
    loadedPath = path
    indexPromise = loadIndex(path)
  }
  return indexPromise
}

/** Optionen der Suche. `country` = '' bzw. weggelassen heißt „alle Länder". */
export interface SearchCitiesOptions {
  limit?: number
  country?: string
}

/**
 * Vorschläge zu einem Suchbegriff — höchstens `limit`, beste zuerst,
 * optional auf ein Land eingegrenzt.
 *
 * Eine LEERE Liste heißt IMMER „nichts gefunden" und nie „Fehler": ohne Pfad,
 * ohne Datei, bei einem Lesefehler und bei einem leeren Begriff kommt
 * dasselbe heraus. Jeder Aufrufer darf das ungeprüft durchreichen.
 */
export async function searchCities(event: H3Event, query: string, options: SearchCitiesOptions = {}): Promise<GeoCitySuggestion[]> {
  if (!normalizeCityQuery(query)) return []

  const index = await resolveIndex(event)
  if (!index) return []

  return rankCities(index.entries, query, {
    limit: options.limit ?? DEFAULT_LIMIT,
    country: options.country,
  })
}

/**
 * Die Ländercodes des Verzeichnisses (klein, alphabetisch) — die Auswahl des
 * optionalen Filters.
 *
 * Ohne Pfad oder mit unlesbarer Datei kommt eine LEERE Liste: der Picker
 * blendet den Filter dann aus, statt ein Feld ohne Inhalt zu zeigen.
 */
export async function listCityCountries(event: H3Event): Promise<string[]> {
  const index = await resolveIndex(event)
  return index?.countries ?? []
}
