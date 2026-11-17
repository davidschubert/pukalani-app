import type { H3Event } from 'h3'
import { ANALYTICS_RANGE } from '../../shared/analyticsStats'
import type { AnalyticsStatsRange } from '../../shared/analyticsStats'
import type { AnalyticsConfigResponse, AnalyticsStatsResponse } from '../../shared/types/analytics'

/**
 * Microcache der öffentlichen Config-Antwort (60 s).
 *
 * Sie ist user-agnostisch (eine Script-Id, keine Session-Daten) und wird bei
 * JEDEM Seitenaufbau gelesen — das Head-Plugin fragt sie im SSR. Ohne Cache
 * wäre das eine Appwrite-Abfrage pro Seitenaufruf für einen Wert, der sich
 * einmal im Jahr ändert.
 *
 * DER SCHLÜSSEL TRÄGT DEN MANDANTEN (Cross-Tenant-Cache-Regel, H3): sonst
 * bekäme Kunde B die Script-Id von Kunde A in seine Seiten gestempelt — und
 * das ist nicht nur falsch gemessen, es verrät auch fremde Konfiguration.
 *
 * Liegt in server/utils, weil ZWEI Routen ihn brauchen: die Leseroute füllt
 * ihn, die Schreibroute setzt ihn nach dem Speichern direkt neu (statt bis zu
 * 60 s zu warten oder den Cache für alle Mandanten zu leeren).
 */
const analyticsConfigCache = createMicrocache<AnalyticsConfigResponse>(60_000)

export function analyticsConfigCacheKey(event: H3Event): string {
  return `analytics:${tenantCacheScope(event)}`
}

export function readAnalyticsConfigCache(event: H3Event): AnalyticsConfigResponse | undefined {
  return analyticsConfigCache.get(analyticsConfigCacheKey(event))
}

export function writeAnalyticsConfigCache(event: H3Event, value: AnalyticsConfigResponse): void {
  analyticsConfigCache.set(analyticsConfigCacheKey(event), value)
}

/**
 * ZWEITER Cache für die ZAHLEN (120 s) — bewusst neben dem oberen und nicht in
 * ihm.
 *
 * Es sind zwei verschiedene Dinge mit zwei verschiedenen Kosten: die Config ist
 * ein Feld aus Appwrite und wird bei JEDEM Seitenaufbau gelesen; die Statistik
 * sind EIN DUTZEND Abfragen gegen eine fremde Instanz und wird nur beim Öffnen
 * einer Dashboard-Seite gebraucht. Ein gemeinsamer Eintrag hieße, dass jeder Gast
 * einer Community die Zahlen ihres Owners mit im Speicher hätte.
 *
 * DER SCHLÜSSEL TRÄGT MANDANT UND ZWECK: derselbe Grund wie oben, plus der
 * eigene Namensraum — sonst überschriebe eines der beiden das andere, sobald
 * ein dritter Cache dazukommt.
 *
 * BENUTZERUNABHÄNGIG, wie es der Microcache verlangt: in der Antwort stehen
 * Besuchszahlen einer Community, keine Sitzungsdaten. Wer sie SEHEN darf,
 * entscheidet vorher `requireCommunityPermission` in der Route — der Cache
 * liegt hinter dieser Prüfung, nicht vor ihr.
 *
 * 120 s, weil Plausible selbst in Minuten denkt: eine Ansicht, die 2 Minuten
 * alt ist, sieht niemand — ein Dutzend Abfragen bei jedem F5 dagegen schon.
 * Die Kachel „letzte 30 Minuten" lebt mit denselben 120 s: sie ist eine
 * grobe Anwesenheits-Anzeige, keine Uhr — und sie heißt deshalb auch nicht
 * „live".
 */
const STATS_TTL_MS = 120_000

/**
 * DER EINTRAG TRÄGT AUCH HOST UND ZEITRAUM (BE-022): je Mandant EIN Eintrag,
 * darin eine Tabelle aus „Host + Zeitraum" ⇒ Antwort, jede Zeile mit eigener
 * Ablaufzeit.
 *
 *  - DER HOST, weil das ZIEL der Abfrage an ihm hängt (`resolveStatsTarget`:
 *    bei eigener Plausible-Site ist er der Site-Schlüssel, bei der Sammel-Site
 *    der Filter). Ohne ihn zeigte eine Community, die über ihre eigene Domain
 *    UND über die Pukalani-Adresse erreichbar ist, auf der zweiten zwei Minuten
 *    lang die Zahlen der ersten. Hineingereicht wird DIESELBE normalisierte
 *    Zeichenkette, die auch ans Ziel geht (`analyticsRequestHost`).
 *  - DER ZEITRAUM (Statistik-Seite): 7, 30 und 90 Tage sind drei verschiedene
 *    Antworten. Ohne ihn bekäme der Owner beim Umschalten zwei Minuten lang die
 *    Zahlen des vorigen Zeitraums mit der neuen Beschriftung — falsch, und zwar
 *    unsichtbar falsch.
 *
 * WARUM EINE TABELLE JE MANDANT statt eines Schlüssels je Host: das Leeren
 * nach dem Speichern muss ALLE Hosts treffen, ohne sie zu kennen — der Mandant
 * hat mehrere, und die Schreibroute läuft nur unter einem davon.
 *
 * HÖCHSTENS ACHT HOSTS je Mandant: ein erfundener Host-Header soll keinen
 * Speicher fressen (im Pool sind unbekannte Hosts ohnehin 404). Läuft die
 * Tabelle über, wird sie geleert — dieselbe schlichte Art wie im Microcache.
 */
const MAX_HOSTS_PER_TENANT = 8

interface StatsSlot {
  host: string
  value: AnalyticsStatsResponse
  expires: number
}

const analyticsStatsCache = createMicrocache<Map<string, StatsSlot>>(STATS_TTL_MS)

export function analyticsStatsCacheKey(event: H3Event): string {
  return `analytics:stats:${tenantCacheScope(event)}`
}

function slotKey(host: string, range: AnalyticsStatsRange): string {
  return `${range} ${host}`
}

export function readAnalyticsStatsCache(
  event: H3Event,
  host: string,
  range: AnalyticsStatsRange = ANALYTICS_RANGE,
): AnalyticsStatsResponse | undefined {
  const slots = analyticsStatsCache.get(analyticsStatsCacheKey(event))
  const key = slotKey(host, range)
  const slot = slots?.get(key)
  if (!slot) return undefined
  if (slot.expires > Date.now()) return slot.value
  slots!.delete(key)
  return undefined
}

export function writeAnalyticsStatsCache(
  event: H3Event,
  value: AnalyticsStatsResponse,
  host: string,
  range: AnalyticsStatsRange = ANALYTICS_RANGE,
): void {
  const cacheKey = analyticsStatsCacheKey(event)
  const slots = analyticsStatsCache.get(cacheKey) ?? new Map<string, StatsSlot>()
  const now = Date.now()
  for (const [key, slot] of slots) {
    if (slot.expires <= now) slots.delete(key)
  }
  const hosts = new Set([...slots.values()].map(slot => slot.host))
  if (!hosts.has(host) && hosts.size >= MAX_HOSTS_PER_TENANT) slots.clear()
  slots.set(slotKey(host, range), { host, value, expires: now + STATS_TTL_MS })
  // Neu setzen, auch wenn die Tabelle schon drinsteht: das verlängert den
  // äußeren Eintrag, die Zeilen darin laufen trotzdem je für sich ab.
  analyticsStatsCache.set(cacheKey, slots)
}

/**
 * Nach dem Umschalten: die Einträge GENAU dieses Mandanten wegwerfen — alle
 * Hosts und alle Zeiträume, denn die Messung hat sich für jeden von ihnen
 * geändert. Neu setzen geht hier nicht: die neuen Zahlen kommen aus einer
 * anderen Plausible-Site und müssen erst geholt werden; ein `clear()` wiederum
 * träfe alle anderen Communities ohne Not. Weil Hosts und Zeiträume in EINEM
 * Eintrag je Mandant liegen, reicht ein `delete` — eine Liste, in der ein
 * Host oder Zeitraum vergessen werden könnte, gibt es nicht mehr.
 */
export function clearAnalyticsStatsCache(event: H3Event): void {
  analyticsStatsCache.delete(analyticsStatsCacheKey(event))
}
