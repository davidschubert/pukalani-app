import type { InsightsChannelDeletedResponse } from '../../../../shared/types/insightsApi'

/**
 * EINEN KANAL AUS DER LISTE ENTFERNEN (`insights.manage`, BI2 K3).
 *
 * ── WANN MAN DAS BENUTZT, UND WANN NICHT ────────────────────────────────
 * Gelöscht wird, was NIE hingehörte — ein Tippfehler, ein falsch
 * verstandener Kanal. Ein Kanal, der sein Thema verfehlt oder nichts mehr
 * liefert, wird AUSGESCHALTET (`active: false`): dann bleibt die Notiz
 * stehen, und niemand nimmt ihn in einem halben Jahr erneut auf.
 *
 * Die Radar-ZEILEN dieses Kanals bleiben unangetastet. Sie sind ohnehin
 * kurzlebig: der nächste Lauf erreicht sie nicht mehr, und das 30-Tage-Netz
 * räumt sie weg (Migration insights-004). Sie hier mitzulöschen hiesse, das
 * heutige Tagesbild der Redaktion zu verändern, weil jemand eine Liste
 * aufgeräumt hat.
 */
export default defineEventHandler(async (event): Promise<InsightsChannelDeletedResponse> => {
  requirePermission(event, 'insights.manage')

  const channelId = getRouterParam(event, 'channelId') ?? ''
  if (!channelId) throw insightsChannelMissing()

  const row = await findInsightsChannelRow(event, channelId)
  await deleteInsightsChannelRow(event, row.$id)
  return { ok: true }
})
