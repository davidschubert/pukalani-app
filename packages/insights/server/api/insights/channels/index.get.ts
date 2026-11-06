import type { InsightsChannelsListResponse } from '../../../../shared/types/insightsApi'
import { INSIGHTS_CHANNEL_SEED } from '../../../../shared/insightsChannelSeed'

/**
 * DIE KANALLISTE (`insights.manage`, BI2 K3).
 *
 * Alle Zeilen, auch die ausgeschalteten — die Seite zeigt beide und sagt dazu,
 * welche mitlaufen. `seedAvailable` ist der Grund, warum die Antwort mehr als
 * ein Array ist: eine leere Tabelle heisst auf einer frisch migrierten Instanz
 * „die elf Kanäle sind noch nicht übernommen", und das ist eine andere
 * Auskunft als „hier sollen keine Kanäle laufen". Ohne sie stünde der Betreiber
 * vor einer leeren Seite und müsste elf Kanäle von Hand suchen.
 */
export default defineEventHandler(async (event): Promise<InsightsChannelsListResponse> => {
  requirePermission(event, 'insights.manage')

  const channels = await listInsightsChannels(event)
  return {
    channels,
    seedAvailable: channels.length === 0 ? INSIGHTS_CHANNEL_SEED.length : 0,
    configured: !!useRuntimeConfig(event).insightsYoutubeKey,
  }
})
