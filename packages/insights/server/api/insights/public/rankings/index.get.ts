import { insightsPostIsVisible } from '../../../../../shared/insightsPublic'
import { toInsightsPost } from '../../../../../shared/insightsRows'
import type { InsightsPublicRankingsResponse } from '../../../../../shared/types/insightsApi'

/**
 * DIE RANKING-ÜBERSICHT — `/rankings` (§9.2).
 *
 * Eine eigene Route und nicht ein Filter auf dem Journal: `/rankings` ist eine
 * eigene Adresse mit eigener Sitemap-Zeile und eigenem Nav-Ziel, und ihr
 * Microcache-Eintrag soll nicht davon abhängen, ob jemand vorher das Journal
 * geöffnet hat. Sie liest DIESELBEN Zeilen (`listPublicInsightsPostRows`) — es
 * ist ein zweiter Blick auf ein Fenster, kein zweiter Datenweg.
 *
 * Steht `ranking` nicht im Riegel, ist die Liste LEER (nicht 404): die Seite
 * zeigt dann ihren leeren Zustand. Anders als bei einer Einzelseite verrät das
 * nichts über eine bestimmte fremde Marke — und eine 404 auf einer Adresse,
 * die in der Navigation steht, wäre die kaputte Navigation aus dem 404-Audit.
 * In die SITEMAP kommt `/rankings` deshalb auch nur mit Riegel.
 *
 * EINGEFROREN HEISST: die jüngste Ausgabe steht oben, die alten bleiben
 * stehen (§11 Frage 7). Sortiert wird deshalb wie im Journal nach
 * `publishedAt` — die Ausgabe-NUMMER steht in den Daten und wäre eine zweite
 * Reihenfolge, sobald jemand eine Ausgabe nachträgt.
 */
const LIST_TTL_MS = 60_000
const listCache = createMicrocache<InsightsPublicRankingsResponse>(LIST_TTL_MS)
const LIST_CACHE_KEY = 'insights-public-rankings'

export default defineEventHandler(async (event): Promise<InsightsPublicRankingsResponse> => {
  // DER RIEGEL SCHLIESST VOR DEM CACHE UND VOR DER ABLAGE (Gate der
  // Anwaltsantworten BI1-3/BI1-4, §6): ein gesperrtes Format antwortet 404 wie
  // die Datentür, nicht mit einer leeren Liste. Eine leere Liste wäre die
  // Auskunft „diesen Bereich gibt es, er ist nur leer" — und die Seite
  // darüber hätte damit eine erreichbare, indexierbare Adresse für ein
  // Format, das noch nicht live sein darf.
  const allowed = insightsPublicFormats()
  if (!allowed.includes('ranking')) throw insightsPublicMissing()

  const hit = listCache.get(LIST_CACHE_KEY)
  if (hit) return hit

  const rows = await listPublicInsightsPostRows(event)
  const visible = rows.filter((row) => {
    const post = toInsightsPost(row)
    return post.format === 'ranking' && insightsPostIsVisible(post, allowed)
  })
  const brands = await loadInsightsBrandRowsByIds(event, insightsListBrandIds(visible))

  const response: InsightsPublicRankingsResponse = {
    posts: visible
      .map(row => toInsightsPublicListItem(row, brands))
      .filter(item => Boolean(item.href)),
  }

  listCache.set(LIST_CACHE_KEY, response)
  logEvent('info', 'insights.public_rankings', { posts: response.posts.length })
  return response
})
