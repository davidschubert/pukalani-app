import { readFile, stat } from 'node:fs/promises'
import type { H3Event } from 'h3'
import { Reader } from 'mmdb-lib'
import type { CityResponse } from 'mmdb-lib'
import { requestLocale } from '../lib/appwrite'

/**
 * Stadt + Region zu einer Session-IP — aus einer LOKALEN MMDB-Datei
 * (DB-IP City Lite), nicht aus einem fremden Dienst.
 *
 * WARUM ÜBERHAUPT: Appwrite kennt zu einer Session nur `countryCode`/
 * `countryName`. „Deutschland" ist auf einer Sitzungsliste keine Hilfe — die
 * Frage dort lautet „war ich das?", und die beantwortet erst „Hamburg,
 * Hamburg · Deutschland". Die IP steht ohnehin schon in der Antwort; die
 * Auflösung fügt also keine neue Datenkategorie hinzu, sie macht die
 * vorhandene lesbar. Sie passiert SERVERSEITIG und OFFLINE: keine IP verlässt
 * den Server, kein Anbieter erfährt, wer sich wo anmeldet.
 *
 * FAIL-SOFT IST DAS LEITPRINZIP. Ohne konfigurierten Pfad, ohne Datei, bei
 * einem Lesefehler, bei einer privaten oder unsinnigen IP und bei einem
 * Treffer ganz ohne verwertbare Angabe (weder Name noch Koordinaten) kommt
 * `null` zurück — die Anzeige fällt dann exakt auf den Stand von vorher (nur
 * Land). Diese Funktion darf die Sessions-Route
 * NIE umwerfen; eine Standortangabe ist Komfort, die Liste selbst ist es
 * nicht.
 *
 * DER PFAD IST DER SCHALTER (`runtimeConfig.geoCityDbPath`, Env
 * NUXT_GEO_CITY_DB_PATH) — bewusst kein zusätzliches app.config-Gate: ein
 * zweiter Schalter neben einem Pfad, der ohnehin gesetzt sein muss, wäre nur
 * eine weitere Stelle, an der man „aus" vergisst zu erklären.
 */

/**
 * Aufgelöster Ort — jedes Feld kann fehlen ('' bzw. `null` = nicht bekannt).
 *
 * Die Koordinaten sind bewusst `number | null` und nicht '' : eine Zahl ist
 * eine Zahl, und ein leerer String zwänge jede Anzeige zu einer Umwandlung,
 * bei der `0` (ein gültiger Breiten-/Längengrad) und „unbekannt" ununter-
 * scheidbar würden.
 */
export interface SessionGeoCity {
  city: string
  region: string
  latitude: number | null
  longitude: number | null
}

/**
 * Namens-Objekt der MMDB als nachschlagbare Karte. `Names` aus mmdb-lib ist
 * eine feste Schnittstelle (de/en/es/fr/ja/pt-BR/ru/zh-CN) und lässt sich
 * nicht mit einer Laufzeit-Sprache indizieren — diese Sicht ist die Umdeutung
 * an EINER Stelle, statt `any` an jeder Aufrufstelle.
 */
type LocalizedNames = Readonly<Record<string, string | undefined>>

/**
 * Die Datei ist ~124 MB. Deshalb wird sie ERST beim ersten Aufruf gelesen und
 * danach im Prozess gehalten: den Arbeitsspeicher zahlt nur ein Deployment,
 * das den Pfad wirklich konfiguriert UND eine Sessions-Seite bedient. Der
 * Puffer ist das PROMISE, nicht der Leser — sonst laden zwei gleichzeitige
 * Requests dieselbe Datei zweimal.
 */
let readerPromise: Promise<Reader<CityResponse> | null> | null = null
let loadedPath = ''
let loadedMtimeMs = 0
let lastStatAt = 0

/**
 * Wie oft höchstens ein `stat` in den Request-Pfad darf. Die Datei wird
 * monatlich ersetzt (Cron, atomar per `mv`) — eine Minute Verzögerung merkt
 * niemand, ein `stat` je Session-Zeile dagegen wäre I/O für nichts.
 * Zwischen zwei Prüfungen kostet die Auflösung KEIN I/O: `reader.get` rechnet
 * synchron im gehaltenen Puffer.
 */
const STAT_TTL_MS = 60_000

let warnedUnreadable = false

/**
 * Einmal pro Prozess laut, dann still — dasselbe Muster wie
 * `warnMailerMissingOnce` (F44): ein konfigurierter, aber unlesbarer Pfad ist
 * genau die Sorte Fehler, die sich wie ein bewusst abgeschaltetes Produkt
 * anfühlt (die Liste erscheint, nur ohne Städte). Gewarnt wird DA, wo etwas
 * verworfen wird, nicht beim Start jeder App: Apps ohne Pfad sollen schweigen.
 */
function warnGeoCityUnreadableOnce(path: string, error: unknown): void {
  if (warnedUnreadable) return
  warnedUnreadable = true
  const detail = error instanceof Error ? error.message : String(error)
  console.warn(`[core] NUXT_GEO_CITY_DB_PATH zeigt auf "${path}", die Datei ist aber nicht lesbar (${detail}) — Sitzungen zeigen weiterhin nur das Land.`)
}

/** Datei einlesen — wirft NIE, ein Fehlschlag ist `null`. */
async function loadReader(path: string): Promise<Reader<CityResponse> | null> {
  try {
    const [buffer, stats] = await Promise.all([readFile(path), stat(path)])
    loadedMtimeMs = stats.mtimeMs
    return new Reader<CityResponse>(buffer)
  }
  catch (error) {
    warnGeoCityUnreadableOnce(path, error)
    return null
  }
}

/**
 * Der gehaltene Leser — inklusive Aktualitäts-Prüfung.
 *
 * Beim Datei-Tausch (monatliches Update) ändert sich `mtimeMs`; erst dann wird
 * neu gelesen. Schlägt das Neu-Lesen fehl, BLEIBT der alte Leser stehen: eine
 * halb geschriebene Datei darf eine funktionierende Anzeige nicht abschalten.
 */
async function resolveReader(path: string): Promise<Reader<CityResponse> | null> {
  if (!readerPromise || loadedPath !== path) {
    loadedPath = path
    lastStatAt = Date.now()
    readerPromise = loadReader(path)
    return readerPromise
  }

  const now = Date.now()
  if (now - lastStatAt >= STAT_TTL_MS) {
    lastStatAt = now
    try {
      const stats = await stat(path)
      if (stats.mtimeMs !== loadedMtimeMs) {
        const previous = readerPromise
        readerPromise = loadReader(path).then(async next => next ?? await previous)
      }
    }
    catch {
      // Datei gerade nicht da (Tausch läuft) — mit dem alten Leser weiter.
    }
  }
  return readerPromise
}

/**
 * Sprach-Vorzug der MMDB-Namen: erst die Request-Sprache, dann deren
 * Basis-Sprache ('de-DE' → 'de'), dann Englisch. Englisch ist in der MMDB das
 * einzige Pflichtfeld — ohne diesen Rückfall verlöre man bei jeder Sprache,
 * die DB-IP nicht führt, den ganzen Ort statt nur seiner Übersetzung.
 */
function pickName(names: LocalizedNames | undefined, locale: string): string {
  if (!names) return ''
  const base = locale.split('-')[0] ?? locale
  return names[locale] ?? names[base] ?? names.en ?? ''
}

/**
 * Stadt + Region zu einer IP, oder `null`.
 *
 * `null` heißt IMMER „wir wissen es nicht" und nie „Fehler" — jeder Aufrufer
 * darf das Ergebnis ungeprüft durchreichen.
 */
export async function lookupCityForIp(event: H3Event, ip: string): Promise<SessionGeoCity | null> {
  if (!ip) return null

  const path = useRuntimeConfig(event).geoCityDbPath
  if (!path) return null

  const reader = await resolveReader(path)
  if (!reader) return null

  let hit: CityResponse | null
  try {
    // Synchron im gehaltenen Puffer. Wirft bei einer syntaktisch ungültigen
    // Adresse; private/unbekannte Adressen liefern schlicht null.
    hit = reader.get(ip)
  }
  catch {
    return null
  }
  if (!hit) return null

  const locale = requestLocale(event) ?? 'en'
  const city = pickName(hit.city?.names as LocalizedNames | undefined, locale)
  const region = pickName(hit.subdivisions?.[0]?.names as LocalizedNames | undefined, locale)
  // Koordinaten sind eigenständig wertvoll (die Karte im Sitzungs-Dialog
  // braucht keinen Namen), deshalb reicht EINE der beiden Sorten für einen
  // Treffer. Ein `hit` ganz ohne Namen und ohne Koordinaten bleibt `null` —
  // das ist dann wirklich nichts, was man zeigen könnte.
  const latitude = typeof hit.location?.latitude === 'number' ? hit.location.latitude : null
  const longitude = typeof hit.location?.longitude === 'number' ? hit.location.longitude : null
  if (!city && !region && latitude === null && longitude === null) return null

  return { city, region, latitude, longitude }
}
