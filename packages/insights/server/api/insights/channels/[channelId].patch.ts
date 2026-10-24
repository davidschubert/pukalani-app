import type { InsightsChannelUpdatedResponse } from '../../../../shared/types/insightsApi'
import { insightsChannelPatchSchema } from '../../../../shared/insightsChannel'

/**
 * EINEN KANAL ÄNDERN (`insights.manage`, BI2 K3) — Cluster, Zustand, Notiz.
 *
 * Mehr geht bewusst nicht: Titel, Handle, Abonnenten und der jüngste Upload
 * gehören der API (s. Kopf von `insightsRows.ts`). Die Kanal-Id fehlt
 * ebenfalls — sie ist die Identität der Zeile, ein anderer Kanal ist eine
 * andere Zeile.
 *
 * AUSSCHALTEN IST DER NORMALFALL, nicht löschen: ein Kanal, der nichts mehr
 * liefert, bleibt mit seiner Notiz stehen, damit derselbe Irrtum in einem
 * halben Jahr nicht ein zweites Mal passiert.
 */
export default defineEventHandler(async (event): Promise<InsightsChannelUpdatedResponse> => {
  requirePermission(event, 'insights.manage')

  const channelId = getRouterParam(event, 'channelId') ?? ''
  if (!channelId) throw insightsChannelMissing()

  const body = await readValidatedBody(event, insightsChannelPatchSchema.parse)

  // Die Zeile MUSS es geben, bevor wir schreiben — und die Adresse nennt die
  // KANAL-Id, nicht die Row-Id (Begründung in `findInsightsChannelRow`).
  const row = await findInsightsChannelRow(event, channelId)

  const channel = await updateInsightsChannelRow(event, row.$id, {
    ...(body.topic !== undefined ? { topic: body.topic } : {}),
    ...(body.active !== undefined ? { active: body.active } : {}),
    ...(body.note !== undefined ? { note: body.note } : {}),
  })

  return { channel }
})
