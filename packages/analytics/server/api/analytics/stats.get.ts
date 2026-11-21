import {
  buildStatsQueries,
  mapCountryCounts,
  mapNamedCounts,
  mapSeries,
  mapTotals,
  mapVisitors,
  normalizeStatsRange,
  resolveStatsTarget,
} from '../../../shared/analyticsStats'
import type { PlausibleQuery, PlausibleQueryResponse } from '../../../shared/analyticsStats'
import { ANALYTICS_SETTINGS_TABLE, type AnalyticsSettingsRow, type AnalyticsStatsResponse } from '../../../shared/types/analytics'
import { analyticsRequestHost } from '../../utils/analyticsRequestHost'
import { resolveOwnScriptSite } from '../../utils/verifyAnalyticsScriptOwner'

/**
 * DIE ZAHLEN EINER COMMUNITY — Paket 2 der v2 (docs/archiv/ANALYTICS-V2.md).
 *
 * Die Lücke, die sie schließt: die Messung lief seit v1, ihre Ergebnisse sah
 * der Owner aber nur in Plausible — wo er kein Konto hat. Ein Produkt, dessen
 * Wert man nicht sehen kann, ist keines.
 *
 * WER DARF: `community.analytics` (Owner-Klasse, dieselbe Capability wie beim
 * Einstellen), DANN das Tarif-Gate `requirePlanProduct` — Reihenfolge mit
 * Absicht, wie in settings.patch.ts: wer gar nicht darf, soll nicht erfahren,
 * ob er es mit einem anderen Tarif dürfte.
 *
 * DER API-SCHLÜSSEL BLEIBT HIER. Er liest die Statistik JEDER Site unserer
 * Instanz; im Browser wäre er die Erlaubnis, die Zahlen aller Kunden
 * abzuholen. Der Client bekommt deshalb nur die fertigen Zahlen — und `site_id`
 * wie Filter baut ausschließlich der Server aus dem REQUEST-HOST. Käme der Host
 * aus der Anfrage, könnte sich jeder Owner die Zahlen einer fremden Community
 * ziehen, indem er einen anderen Hostnamen mitschickt.
 *
 * FAIL-SOFT (Antwort statt Fehler): fehlt der Schlüssel oder schweigt
 * Plausible, kommt `{ active: true, unavailable: true }` zurück. Die Messung
 * läuft ja — nur die Anzeige nicht. Ein 502 hätte die Dashboard-Seite mit einer
 * Fehlermeldung überzogen, obwohl an der Community nichts kaputt ist.
 */

/** Abbruch, bevor eine hängende fremde Instanz die Dashboard-Seite blockiert. */
const QUERY_TIMEOUT_MS = 10_000

const UNAVAILABLE: AnalyticsStatsResponse = { active: true, unavailable: true }

interface AnalyticsAppConfig {
  instance?: string
  shared?: { scriptId?: string, siteId?: string }
}

/**
 * EINE v2-Abfrage. Wirft bei allem, was nicht nach einer Antwort aussieht — der
 * Aufrufer fängt es und macht daraus „gerade nicht erreichbar".
 *
 * Fehlerform der API: non-2xx mit `{"error":"…"}`. Der Text landet im
 * Server-Log (dort hilft er beim Nachsehen) und NIE in der Antwort: er kann den
 * Site-Schlüssel oder eine Bemerkung zum Schlüssel enthalten.
 */
async function query(baseUrl: string, apiKey: string, body: PlausibleQuery): Promise<PlausibleQueryResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS)
  try {
    const response = await fetch(`${baseUrl}/api/v2/query`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      console.error(`[analytics] Stats-API ${response.status}: ${(await response.text()).slice(0, 300)}`)
      throw new Error(`stats_api_${response.status}`)
    }
    return await response.json() as PlausibleQueryResponse
  }
  finally {
    clearTimeout(timeout)
  }
}

export default defineEventHandler(async (event): Promise<AnalyticsStatsResponse> => {
  await requireCommunityPermission(event, 'community.analytics')
  requirePlanProduct(event, 'analytics')

  /**
   * Der Zeitraum ist EINGABE und wird deshalb nie roh weitergereicht: er landet
   * sonst unverändert in `date_range` einer Abfrage gegen eine fremde Instanz
   * UND im Cache-Schlüssel. `normalizeStatsRange` ist fail-closed — alles
   * Unbekannte wird zu 30 Tagen.
   */
  const range = normalizeStatsRange(getQuery(event).range)

  /**
   * Der Host der Anfrage (`analyticsRequestHost`, eine Rechnung für beide
   * Routen) bestimmt das ZIEL der Abfrage — und gehört deshalb mit in den
   * Zwischenspeicher (BE-022): DIESELBE Zeichenkette für beides, sonst zeigte
   * die eigene Domain zwei Minuten lang die Zahlen der Pukalani-Adresse.
   */
  const host = analyticsRequestHost(event)

  const cached = readAnalyticsStatsCache(event, host, range)
  if (cached) return cached

  const appConfig = useAppConfig() as { pukalani?: { analytics?: AnalyticsAppConfig } }
  const analytics = appConfig.pukalani?.analytics ?? {}

  /**
   * Die Einstellung durch die Datentür — dieselbe Klinke wie in der Leseroute:
   * die Zeile gehört der Community, nicht einer Person, und trägt deshalb keine
   * User-Rechte. `actor: 'operator'` ist auch hier keine Behauptung über einen
   * Handelnden, sondern die Wahrheit: es wird gelesen.
   */
  const db = tenantDb(event, { as: 'operator', actor: 'operator' })
  let row: AnalyticsSettingsRow | null
  try {
    row = await db.find<AnalyticsSettingsRow>(ANALYTICS_SETTINGS_TABLE)
  }
  catch {
    // Ohne die Zeile wissen wir nicht, ob gemessen wird — „aus" zu behaupten
    // wäre eine Falschaussage, also die ehrlichere: „gerade nicht erreichbar".
    return UNAVAILABLE
  }

  // Eigene Kennung ⇒ die Adresse, die ihre Zähl-Datei nennt, wenn sie eine
  // eigene ist (KK1) — dieselben eigenen Adressen wie beim Speichern.
  const ownScriptId = row?.plausibleScriptId ?? ''
  const ownSite = ownScriptId
    ? await resolveOwnScriptSite(analytics.instance, ownScriptId, [host, normalizeHost(useTenant(event)?.canonicalHost)])
    : null

  const target = resolveStatsTarget(row, analytics.shared ?? {}, host, ownSite)
  if (target.state === 'off') {
    const off: AnalyticsStatsResponse = { active: false }
    writeAnalyticsStatsCache(event, off, host, range)
    return off
  }
  // „Gerade nicht erreichbar" wird BEWUSST nicht gecacht: der Grund ist meist
  // vorübergehend (Instanz weg, Schlüssel gerade nachgetragen), und zwei
  // Minuten künstliche Wartezeit auf eine wieder funktionierende Anzeige wären
  // teurer als ein Dutzend Abfragen bei einem erneuten Öffnen der Seite.
  if (target.state === 'unavailable') return UNAVAILABLE

  const baseUrl = (analytics.instance ?? '').replace(/\/+$/, '')
  // Ablage vor Env (Muster wie beim KI-Schlüssel, F55): der Betreiber trägt
  // den Statistik-Schlüssel unter Instanz → Integrationen ein, die Env bleibt
  // der Weg für alles ohne Oberfläche. Stünde die Env vorn, hätte der
  // Eintrag auf einer Instanz mit gesetzter Env keine Wirkung.
  const apiKey = await readInstanceSecret(event, 'analytics') || useRuntimeConfig(event).analyticsStatsApiKey
  if (!baseUrl || !apiKey) return UNAVAILABLE

  /**
   * Die Uhr wird HIER gelesen und hineingereicht — `buildStatsQueries` bleibt
   * damit pur und das Fenster „letzte 30 Minuten" testbar.
   */
  const queries = buildStatsQueries(target.siteId, target.filters, range, new Date().toISOString())

  try {
    /**
     * Ein Dutzend Abfragen, weil `date_range` und `dimensions` je für die GANZE
     * Abfrage gelten — „heute", „letzte 30 Minuten" und jede Aufschlüsselung
     * brauchen eine eigene. Nebeneinander, damit die Seite nicht ein Dutzend
     * Umläufe lang wartet: die Dauer ist die der LANGSAMSTEN, nicht ihre Summe.
     * Eine einzige, die scheitert, macht die ganze Ansicht zu „gerade nicht
     * erreichbar" — halb gefüllte Kacheln wären schlimmer als eine ehrliche
     * Ansage.
     */
    const [today, totals, series, topPages, topSources, countries, regions, devices, browsers, os, entryPages, recent]
      = await Promise.all([
        query(baseUrl, apiKey, queries.today),
        query(baseUrl, apiKey, queries.totals),
        query(baseUrl, apiKey, queries.series),
        query(baseUrl, apiKey, queries.topPages),
        query(baseUrl, apiKey, queries.topSources),
        query(baseUrl, apiKey, queries.countries),
        query(baseUrl, apiKey, queries.regions),
        query(baseUrl, apiKey, queries.devices),
        query(baseUrl, apiKey, queries.browsers),
        query(baseUrl, apiKey, queries.os),
        query(baseUrl, apiKey, queries.entryPages),
        query(baseUrl, apiKey, queries.recent),
      ])

    const response: AnalyticsStatsResponse = {
      active: true,
      today: { visitors: mapVisitors(today) },
      totals: mapTotals(totals),
      series: mapSeries(series),
      topPages: mapNamedCounts(topPages),
      topSources: mapNamedCounts(topSources),
      countries: mapCountryCounts(countries),
      regions: mapNamedCounts(regions),
      devices: mapNamedCounts(devices),
      browsers: mapNamedCounts(browsers),
      os: mapNamedCounts(os),
      entryPages: mapNamedCounts(entryPages),
      recentVisitors: mapVisitors(recent),
    }
    writeAnalyticsStatsCache(event, response, host, range)
    return response
  }
  catch {
    // Der Grund steht schon im Log (s. `query`) — nach außen bleibt es bei
    // „gerade nicht erreichbar", damit nichts über die fremde Instanz durchsickert.
    return UNAVAILABLE
  }
})
