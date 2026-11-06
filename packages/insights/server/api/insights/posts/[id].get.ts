import { toInsightsPost } from '../../../../shared/insightsRows'
import type { InsightsPostDetailResponse } from '../../../../shared/types/insightsApi'

/**
 * EIN BEITRAG SAMT EDITOR-KONTEXT (`insights.manage`).
 *
 * Drei Dinge in EINER Antwort, weil der Editor sie alle drei braucht, bevor er
 * etwas anzeigen kann: die Zeile, die Marken (Auswahl UND Prüfregel 6) und die
 * offenen Prüfpunkte.
 *
 * ── DIE ISSUES KOMMEN OHNE BELEG-ABRUF ───────────────────────────────────
 * Fünf der sechs Regeln kosten nichts; nur „steht das Zitat wörtlich in der
 * Quelle?" braucht fremde Server. Die beim ÖFFNEN mitzuprüfen hiesse, für
 * jeden Blick in einen Beitrag bis zu zwanzig fremde Websites anzufragen — für
 * eine Auskunft, die der Redakteur an der Ampel gezielt holt und die das
 * Zustands-Gate ohnehin verbindlich wiederholt.
 */
export default defineEventHandler(async (event): Promise<InsightsPostDetailResponse> => {
  requirePermission(event, 'insights.manage')

  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw insightsPostMissing()

  const row = await loadInsightsPostRow(event, id)
  const post = toInsightsPost(row)
  const brandRows = await listInsightsBrandRows(event, INSIGHTS_BRANDS_LIMIT)

  return {
    post,
    id: row.$id,
    knownBrandIds: insightsKnownBrandIds(brandRows),
    brands: brandRows.map(toInsightsBrandListItem),
    issues: insightsFormIssues(post, brandRows),
  }
})
