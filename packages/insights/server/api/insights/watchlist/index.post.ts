import type { InsightsWatchAddedResponse } from '../../../../shared/types/insightsApi'
import {
  INSIGHTS_WATCH_CODES,
  insightsWatchAddSchema,
  insightsWatchVideoId,
} from '../../../../shared/insightsWatchlist'
import { INSIGHTS_RADAR_TOPIC_FALLBACK } from '../../../../shared/insightsRadar'

/**
 * DER LINK-WURF (`insights.manage`, BI2 K4) — eine Adresse wird eine Zeile.
 *
 * ── WARUM HIER KEINE VORSCHAU STEHT (anders als bei den Kanälen) ────────
 * Bei einem KANAL entscheidet die Identität über Monate täglicher Läufe, und
 * ein Irrtum fällt erst auf, wenn jemand die Zahlen liest — deshalb dort die
 * Bestätigungsstufe. Ein VIDEO entscheidet über eine Zeile, die man in zwei
 * Sekunden wieder wegnimmt, und die Zeile zeigt Titel und Kanal sofort an.
 * Eine Zwischenstufe wäre hier Reibung ohne Gegenwert.
 *
 * ── DIE ZAHLEN KOMMEN SOFORT MIT ────────────────────────────────────────
 * Zwei Einheiten (`videos.list` + `channels.list`). Ohne sie stünde die neue
 * Zeile bis zum nächsten nächtlichen Lauf als leeres Gerüst in der Liste —
 * ohne Titel, ohne Opportunity, also genau ohne das, wofür man sie anlegt.
 */
export default defineEventHandler(async (event): Promise<InsightsWatchAddedResponse> => {
  requirePermission(event, 'insights.manage')

  const body = await readValidatedBody(event, insightsWatchAddSchema.parse)

  const videoId = insightsWatchVideoId(body.input)
  if (!videoId) {
    throw createError({
      status: 400,
      statusText: 'Unreadable video',
      data: { code: INSIGHTS_WATCH_CODES.unreadable },
    })
  }

  // Der freundliche Riegel VOR dem API-Aufruf: steht es schon drin, ist das
  // kein Fehler des Menschen, sondern eine Auskunft — und sie kostet dann
  // keine Quota.
  const existing = await findInsightsWatchRow(event, videoId)
  if (existing) {
    throw createError({
      status: 409,
      statusText: 'Video already on the list',
      data: { code: INSIGHTS_WATCH_CODES.duplicate },
    })
  }
  await assertInsightsWatchlistRoom(event)

  const runtime = useRuntimeConfig(event)
  const fetched = await fetchInsightsWatchVideo(videoId, INSIGHTS_RADAR_TOPIC_FALLBACK, {
    apiKey: runtime.insightsYoutubeKey,
    baseUrl: runtime.insightsYoutubeBaseUrl,
  })

  // JEDE Spalte explizit (CLAUDE.md). `topic` aus dem Körper schlägt den
  // Vorschlag der Schlagwortliste: wer beim Einwerfen schon weiss, wohin es
  // gehört, soll nicht hinterher korrigieren müssen.
  const item = await createInsightsWatchItem(event, {
    ...fetched,
    topic: body.topic ?? fetched.topic,
    verdict: body.verdict,
    note: body.note,
    addedAt: new Date().toISOString(),
  })

  return { item }
})
