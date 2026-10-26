import type { InsightsWatchSavedResponse } from '../../../../shared/types/insightsApi'
import { insightsWatchPatchSchema } from '../../../../shared/insightsWatchlist'

/**
 * EIN FUNDSTÜCK ÄNDERN (`insights.manage`, BI2 K4) — Urteil, Notiz, Cluster.
 *
 * Genau die drei Felder, die einem MENSCHEN gehören. Titel, Kanal, Zahlen und
 * Veröffentlichungsdatum sind eine Abschrift der API und werden vom täglichen
 * Lauf überschrieben; sie hier änderbar zu machen hiesse, eine Angabe
 * anzubieten, die morgen wieder weg ist.
 *
 * Adressiert wird über die VIDEO-Id, nicht über die Row-Id — dieselbe
 * Begründung wie bei den Kanälen (`findInsightsChannelRow`): der Vertrag
 * beschreibt ein Video, keine Appwrite-Zeile.
 */
export default defineEventHandler(async (event): Promise<InsightsWatchSavedResponse> => {
  requirePermission(event, 'insights.manage')

  const videoId = getRouterParam(event, 'videoId') ?? ''
  if (!videoId) throw insightsWatchMissing()

  const body = await readValidatedBody(event, insightsWatchPatchSchema.parse)

  const row = await findInsightsWatchRow(event, videoId)
  if (!row) throw insightsWatchMissing()

  const item = await updateInsightsWatchRow(event, row.$id, {
    ...(body.verdict !== undefined ? { verdict: body.verdict } : {}),
    ...(body.note !== undefined ? { note: body.note } : {}),
    ...(body.topic !== undefined ? { topic: body.topic } : {}),
  })

  return { item }
})
