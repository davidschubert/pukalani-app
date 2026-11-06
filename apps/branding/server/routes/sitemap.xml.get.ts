import type { H3Event } from 'h3'
import {
  BRANDING_DISCOVER_PRIORITY,
  BRANDING_INSIGHTS_ENTRY_PRIORITY,
  BRANDING_RANKINGS_PRIORITY,
  BRANDING_ROUTES,
  type BrandingSitemapEntry,
  brandingBaseUrl,
  brandingSitemapXml,
} from '../utils/brandingSitemap'

/**
 * sitemap.xml — bewusst als schlanke Server-Route statt per Extra-Modul
 * (Muster `apps/marketing`, `apps/portfolio`): eine geführte Liste plus zwanzig
 * Zeilen XML ist ehrlicher als ein Generator, der bei einer neuen Seite still
 * das Falsche ausliefert. Die Liste und das XML wohnen in
 * `server/utils/brandingSitemap.ts` — hier stehen nur Daten, Origin und Header.
 *
 * ── DIE ANATOMIEN KOMMEN AUTOMATISCH DAZU (Discover D4) ──────────────────
 * Jede öffentliche Marke ist eine Seite mit echtem Inhalt — das IST die Ebene
 * „Discover" (Plan §1). Gelesen wird über `listPublishedBrandPublications()`,
 * also über dieselbe Regel wie die Galerie selbst (`status`-Filter UND
 * `brandPublicationIsVisible`): eine zurückgezogene oder ausgeblendete Marke
 * antwortet 404, und eine Sitemap darf nur Adressen anbieten, die es gibt.
 *
 * `lastmod` steht NUR an den Anatomien, und es ist ein ECHTES Datum aus der
 * Zeile (`updatedAt`, sonst `publishedAt`). Die festen Seiten tragen keins:
 * ein erfundenes ist schlechter als keins.
 *
 * ── UND SEIT BI1 I3 DIE INSIGHTS-ADRESSEN ────────────────────────────────
 * Journal-Beiträge, Themencluster, Markenprofile und die Ranking-Übersicht.
 * WELCHE es gibt, weiss nur der insights-Layer (Riegel `publicFormats`,
 * Zustände, redigierte Fassungen, Adress-Regel je Format) — er liefert die
 * Liste über `listInsightsSitemapEntries()`. Eine eigene Rechnung hier wäre
 * eine zweite Antwort auf „ist das öffentlich?", und die erste (die Route)
 * würde 404 sagen, während die zweite den Crawler einlädt.
 *
 * `locales` je Eintrag ist die zweite Hälfte von §9.5: ein Beitrag ohne
 * redigierte Übersetzung meldet nur seine Grundsprache — im Seitenkopf UND
 * hier.
 *
 * ── FAIL-SOFT: DIE FESTEN SEITEN KOMMEN IMMER ────────────────────────────
 * Fällt der Read aus (Instanz weg, Tabelle fehlt vor brand-020), bleibt die
 * Sitemap bei den festen Routen. Eine kürzere Sitemap ist besser als ein 500
 * auf einer Crawler-URL — dieselbe Entscheidung wie in `apps/platform` und
 * `apps/portfolio`. Gemeldet wird es trotzdem, sonst verschwindet die halbe
 * Site still aus dem Index.
 */
export default defineEventHandler(async (event) => {
  const base = brandingBaseUrl(event)

  const entries: BrandingSitemapEntry[] = [
    ...BRANDING_ROUTES,
    ...(await discoverEntries(event)),
    ...(await insightsEntries(event)),
  ]

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  // Öffentlich + user-agnostisch → darf ruhig am Edge/Proxy liegen.
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return brandingSitemapXml(base, entries)
})

/**
 * Die sichtbaren Anatomien als Sitemap-Einträge, alphabetisch nach Slug.
 *
 * Sortiert wird bewusst nach dem SLUG und nicht nach dem Datum: die Sitemap
 * ist ein Verzeichnis, keine Zeitleiste, und eine stabile Reihenfolge macht
 * ein Diff zweier Abrufe lesbar. Die Zeilen selbst kommen aus dem Fenster der
 * Galerie (500) — mehr Anatomien gibt es dort auch nicht zu sehen.
 */
async function discoverEntries(event: H3Event): Promise<BrandingSitemapEntry[]> {
  try {
    const rows = await listPublishedBrandPublications(event)
    return rows
      .filter(row => typeof row.slug === 'string' && row.slug.length > 0)
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map(row => ({
        path: `/discover/${row.slug}`,
        priority: BRANDING_DISCOVER_PRIORITY,
        // Das jüngere der beiden echten Daten. `$updatedAt` bleibt draußen: es
        // wandert auch, wenn nur ein Meldungs-Zähler hochgezählt wurde, und
        // das ist keine Änderung am INHALT der Seite.
        lastmod: row.updatedAt || row.publishedAt || '',
      }))
  }
  catch (error) {
    logEvent('warn', 'branding.sitemap_discover_unavailable', {
      message: error instanceof Error ? error.message : 'unknown',
    })
    return []
  }
}

/**
 * Die Insights-Adressen als Sitemap-Einträge (BI1 I3).
 *
 * Die PRIORITÄT vergibt die App, nicht der Layer: sie ist eine Aussage über
 * das VERHÄLTNIS der Seiten DIESER Site zueinander, und die kennt nur, wer
 * alle kennt. Der Layer liefert Pfad, Datum und Sprachen.
 *
 * FAIL-SOFT wie bei den Anatomien: fällt der Read aus (Instanz weg, Tabellen
 * fehlen vor insights-001), bleibt die Sitemap bei allem anderen. Eine kürzere
 * Sitemap ist besser als ein 500 auf einer Crawler-Adresse — gemeldet wird es
 * trotzdem, sonst verschwindet der halbe Bereich still aus dem Index.
 */
async function insightsEntries(event: H3Event): Promise<BrandingSitemapEntry[]> {
  try {
    return (await listInsightsSitemapEntries(event)).map(entry => ({
      path: entry.path,
      priority: entry.path === '/rankings' ? BRANDING_RANKINGS_PRIORITY : BRANDING_INSIGHTS_ENTRY_PRIORITY,
      lastmod: entry.lastmod,
      locales: entry.locales,
    }))
  }
  catch (error) {
    logEvent('warn', 'branding.sitemap_insights_unavailable', {
      message: error instanceof Error ? error.message : 'unknown',
    })
    return []
  }
}
