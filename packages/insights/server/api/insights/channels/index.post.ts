import type { InsightsChannelCreatedResponse } from '../../../../shared/types/insightsApi'
import {
  INSIGHTS_CHANNELS_MAX,
  INSIGHTS_CHANNEL_CODES,
  insightsChannelCreateSchema,
} from '../../../../shared/insightsChannel'

/**
 * EINEN KANAL IN DIE LISTE AUFNEHMEN (`insights.manage`, BI2 K3).
 *
 * ── DIE ID KOMMT AUS DER VORSCHAU ───────────────────────────────────────
 * Diese Route löst NICHTS mehr auf. Was gespeichert wird, hat der Mensch in
 * der Vorschau gesehen und bestätigt; eine zweite Auflösung hier könnte einen
 * anderen Kanal treffen als den, der auf dem Schirm stand (Handle umgezogen,
 * Eingabe inzwischen geändert) — und genau das soll die Vorschau ausschliessen.
 * Titel, Handle und Abonnenten bleiben deshalb hier leer und kommen mit dem
 * ersten Lauf (oder der nächsten Vorschau) nach: ein von der Oberfläche
 * durchgereichter Name wäre eine Angabe, der niemand mehr ansieht, woher sie
 * stammt.
 *
 * ── DER DECKEL IST QUOTA, NICHT MISSBRAUCH ──────────────────────────────
 * `INSIGHTS_CHANNELS_MAX` (50) ist die Zahl, die §9.6 Leitplanke (c) als mit
 * grossem Abstand tragbar nennt — und die Grenze, ab der eine Redaktionsliste
 * ohnehin niemand mehr durchsieht.
 */
export default defineEventHandler(async (event): Promise<InsightsChannelCreatedResponse> => {
  requirePermission(event, 'insights.manage')

  const body = await readValidatedBody(event, insightsChannelCreateSchema.parse)

  const existing = await listInsightsChannels(event)
  if (existing.length >= INSIGHTS_CHANNELS_MAX) {
    throw createError({
      status: 409,
      statusText: 'Channel list full',
      data: { code: INSIGHTS_CHANNEL_CODES.tooMany },
    })
  }

  // JEDE Spalte explizit (CLAUDE.md).
  const channel = await createInsightsChannel(event, {
    channelId: body.channelId,
    topic: body.topic,
    title: '',
    handle: '',
    subscribers: 0,
    active: true,
    note: body.note,
    lastUploadAt: '',
    checkedAt: '',
  })

  return { channel }
})
