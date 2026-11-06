import type { InsightsBrandsListResponse } from '../../../../shared/types/insightsApi'

/**
 * DIE MARKEN-ZEILEN (`insights.manage`).
 *
 * Sie sind in I2 KEINE eigene Seite (§9.4 sieht `/dashboard/insights/brands`
 * vor — das kommt später): hier liefern sie genau zwei Dinge, die der Editor
 * braucht — die Auswahl für das Marken-Panel und die Antwort auf Prüfregel 6
 * („jede genannte Marke hat eine Zeile").
 *
 * `removed`-Zeilen reisen MIT und werden erst in `insightsKnownBrandIds`
 * ausgesiebt: der Editor muss sie zeigen können, sonst sähe ein Beitrag, der
 * eine entfernte Marke verweist, dort eine leere Zeile statt des Grundes.
 */
export default defineEventHandler(async (event): Promise<InsightsBrandsListResponse> => {
  requirePermission(event, 'insights.manage')

  const rows = await listInsightsBrandRows(event, INSIGHTS_BRANDS_LIMIT)
  return { brands: rows.map(toInsightsBrandListItem) }
})
