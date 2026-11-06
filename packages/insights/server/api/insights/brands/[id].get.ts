import { toInsightsBrand } from '../../../../shared/insightsRows'
import type { InsightsBrandDetailResponse } from '../../../../shared/types/insightsApi'

/**
 * EINE MARKEN-ZEILE ZUM BEARBEITEN (`insights.manage`, BI1 I2-Rest).
 *
 * ── WARUM DIE LISTE DAS NICHT MITLIEFERT ─────────────────────────────────
 * Weil der ganze Vertrag daran hängt: Zeichen, Historie, Beziehungen und bis
 * zu vierzig Belege je Zeile. Zweihundert davon in einer Tabellen-Antwort
 * wären ein Megabyte für sechs sichtbare Spalten — dasselbe Argument, mit dem
 * `InsightsPostListItem` keinen Fliesstext trägt.
 *
 * Die Zeile kommt UNGEPRÜFT herein (`toInsightsBrand` ist fail-soft): eine
 * kaputte JSON-Spalte soll das Formular ÖFFNEN können, denn genau dort will
 * jemand sie reparieren. Geprüft wird beim Speichern, wo eine Ablehnung einem
 * Menschen gezeigt werden kann.
 */
export default defineEventHandler(async (event): Promise<InsightsBrandDetailResponse> => {
  requirePermission(event, 'insights.manage')

  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw insightsBrandMissing()

  const row = await loadInsightsBrandRow(event, id)
  return { brand: toInsightsBrand(row), id: row.$id }
})
