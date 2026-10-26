import type { InsightsWatchDeletedResponse } from '../../../../shared/types/insightsApi'

/**
 * EIN FUNDSTÜCK WEGNEHMEN (`insights.manage`, BI2 K4).
 *
 * Hier gibt es bewusst KEIN „ausschalten statt löschen" wie bei den Kanälen.
 * Der Unterschied: ein ausgeschalteter Kanal bewahrt die Begründung, warum er
 * draussen ist — sonst nimmt ihn jemand in einem halben Jahr erneut auf. Ein
 * Video, das man wegnimmt, nimmt man weg; und wer es trotzdem festhalten
 * will, hat dafür die Stellung „Uninteressant", die genau das tut (Zeile
 * bleibt, der Radar blendet es aus).
 */
export default defineEventHandler(async (event): Promise<InsightsWatchDeletedResponse> => {
  requirePermission(event, 'insights.manage')

  const videoId = getRouterParam(event, 'videoId') ?? ''
  if (!videoId) throw insightsWatchMissing()

  const row = await findInsightsWatchRow(event, videoId)
  if (!row) throw insightsWatchMissing()

  await deleteInsightsWatchRow(event, row.$id)
  return { ok: true }
})
