import type { InsightsChannelPreviewResponse } from '../../../../shared/types/insightsApi'
import {
  INSIGHTS_CHANNEL_CODES,
  INSIGHTS_CHANNEL_PREVIEW_LIMIT,
  INSIGHTS_CHANNEL_PREVIEW_WINDOW_MS,
  insightsChannelLookup,
  insightsChannelPreviewKey,
  insightsChannelResolveSchema,
} from '../../../../shared/insightsChannel'

/**
 * DIE PRÜF-VORSCHAU EINES KANALS (`insights.manage`, BI2 K3).
 *
 * ── DIE LEHRE AUS I4 ALS ROUTE ──────────────────────────────────────────
 * `@PentagramDesign` war eine echte Kanal-Id mit einem echten Kanal — einem
 * Privatkonto mit einem Video von 2012. Diese Route beantwortet deshalb
 * BEIDE Fragen auf einmal: wie heisst der Kanal, und wann hat er zuletzt
 * etwas hochgeladen. Erst dann bestätigt ein Mensch.
 *
 * ── GEDECKELT, WEIL SIE QUOTA KOSTET ────────────────────────────────────
 * Zwei Einheiten je Vorschau. Dreissig je Stunde und Konto sind nicht gegen
 * Missbrauch gedacht (dahinter sitzt der Betreiber), sondern gegen den
 * Unfall — dieselbe Begründung wie beim Radar-Knopf: ein verklemmtes Feld,
 * das bei jedem Tastendruck auflöst, nähme dem nächtlichen Lauf sein Budget.
 */
export default defineEventHandler(async (event): Promise<InsightsChannelPreviewResponse> => {
  const user = requirePermission(event, 'insights.manage')

  const body = await readValidatedBody(event, insightsChannelResolveSchema.parse)

  const lookup = insightsChannelLookup(body.input)
  if (!lookup) {
    throw createError({
      status: 400,
      statusText: 'Unreadable channel',
      data: { code: INSIGHTS_CHANNEL_CODES.unreadable },
    })
  }

  const { store, prefix } = useRateLimitStore(event)
  const hit = await store.hit(
    `${prefix}${insightsChannelPreviewKey(user.$id)}`,
    INSIGHTS_CHANNEL_PREVIEW_WINDOW_MS,
  )
  if (hit.count > INSIGHTS_CHANNEL_PREVIEW_LIMIT) {
    throw createError({
      status: 429,
      statusText: 'Too many requests',
      data: { code: INSIGHTS_CHANNEL_CODES.rateLimited },
    })
  }

  const runtime = useRuntimeConfig(event)
  const known = new Set((await listInsightsChannels(event)).map(channel => channel.channelId))

  const preview = await previewInsightsChannel(lookup, {
    apiKey: runtime.insightsYoutubeKey,
    baseUrl: runtime.insightsYoutubeBaseUrl,
    knownIds: known,
  })

  return { preview }
})
