import type { InsightsWatchlistResponse } from '../../../../shared/types/insightsApi'

/**
 * DIE EIGENE VIDEO-LISTE (`insights.manage`, BI2 K4).
 *
 * Ungefiltert und zuletzt hinzugefügtes zuerst — gefiltert wird im Browser,
 * auf genau dieser Menge. Dieselbe Begründung wie bei den Korrekturen und dem
 * Radar: die Zähler („x von y") stammen dann garantiert aus demselben Stand
 * wie die Zeilen, und eine Liste, die sich beim Filtern nachlädt, ändert sich
 * unter dem Finger.
 */
export default defineEventHandler(async (event): Promise<InsightsWatchlistResponse> => {
  requirePermission(event, 'insights.manage')

  const items = await listInsightsWatchItems(event).catch((error: unknown) => {
    // FAIL-SOFT ohne insights-007: die Seite zeigt ihren Zustand statt eines
    // 500 (wie die Radar-Seite ohne insights-004).
    if (isInsightsRowMissing(error)) return []
    throw error
  })

  return {
    items,
    configured: !!useRuntimeConfig(event).insightsYoutubeKey,
    today: new Date().toISOString().slice(0, 10),
  }
})
