import type { InsightsWatchVerdictResponse } from '../../../../shared/types/insightsApi'
import type { InsightsTopicRow } from '../../../../shared/insightsRows'
import { INSIGHTS_TOPICS_TABLE, toInsightsRadarVideo } from '../../../../shared/insightsRows'
import { insightsWatchFromRadar, insightsWatchVerdictSchema } from '../../../../shared/insightsWatchlist'
import { INSIGHTS_RADAR_TOPIC_FALLBACK } from '../../../../shared/insightsRadar'
import { Query } from 'node-appwrite'

/**
 * EIN URTEIL AUS DEM RADAR (`insights.manage`, BI2 K4, Plan §5).
 *
 * ── DIE EINE MECHANIK, FÜR DIE K4 GEBAUT WURDE ──────────────────────────
 * „Interessant" im Radar zu klicken, LEGT das Video in die Fundstücke. Der
 * Radar ist der Zulauf, die Fundstücke sind die Vorauswahl — und weil das
 * Urteil in den Fundstücken wohnt (die Radar-Zeile wird täglich überschrieben
 * und nach dreissig Tagen gelöscht), ist „Urteil setzen" und „Zeile anlegen"
 * hier derselbe Vorgang.
 *
 * ── OHNE EINEN EINZIGEN API-AUFRUF ──────────────────────────────────────
 * Die Zahlen stehen in der Radar-Zeile schon da. Sie noch einmal zu holen
 * wäre eine Quota-Einheit für etwas, das zwei Tabellen weiter liegt — und der
 * nächtliche Nachtrag schreibt sie ohnehin neu.
 *
 * ── „NICHT GEPRÜFT" KANN AUCH WEGNEHMEN ─────────────────────────────────
 * Wer im Radar auf „Nicht geprüft" zurückstellt, nimmt sein Urteil zurück.
 * Hat die Zeile keine Notiz und kein eigenes Cluster, bleibt dann nichts
 * übrig, was aufzuheben wäre — sie wird entfernt. Mit Notiz bleibt sie: dann
 * hat ein Mensch etwas hineingeschrieben, und das wirft kein Schalter weg.
 */
export default defineEventHandler(async (event): Promise<InsightsWatchVerdictResponse> => {
  requirePermission(event, 'insights.manage')

  const body = await readValidatedBody(event, insightsWatchVerdictSchema.parse)
  const existing = await findInsightsWatchRow(event, body.videoId)

  if (existing) {
    if (body.verdict === 'unrated' && !existing.note.trim()) {
      await deleteInsightsWatchRow(event, existing.$id)
      return { verdict: 'unrated', listed: false }
    }
    const item = await updateInsightsWatchRow(event, existing.$id, { verdict: body.verdict })
    return { verdict: item.verdict, listed: true }
  }

  // Noch nicht in der Liste. „Nicht geprüft" ist dann der Normalzustand und
  // kein Grund, eine Zeile anzulegen.
  if (body.verdict === 'unrated') return { verdict: 'unrated', listed: false }

  await assertInsightsWatchlistRoom(event)

  // Die Radar-Zeile als Vorlage. Fehlt sie (das Netz hat sie geräumt, während
  // die Seite offen stand), ist das kein Fehler des Menschen — die Zeile
  // entsteht dann ohne Zahlen, und der nächste Lauf trägt sie nach.
  const { tablesDB, databaseId } = insightsDb(event)
  const found = await tablesDB.listRows<InsightsTopicRow>({
    databaseId,
    tableId: INSIGHTS_TOPICS_TABLE,
    queries: [Query.equal('videoId', body.videoId), Query.limit(1)],
  }).catch((error: unknown) => {
    if (isInsightsRowMissing(error)) return null
    throw error
  })

  const row = found?.rows[0]
  const now = new Date().toISOString()
  const item = row
    ? insightsWatchFromRadar(toInsightsRadarVideo(row), body.verdict, now)
    : {
        videoId: body.videoId,
        verdict: body.verdict,
        note: '',
        topic: INSIGHTS_RADAR_TOPIC_FALLBACK,
        addedAt: now,
        available: true,
        refreshedAt: '',
        title: '',
        channelId: '',
        channelTitle: '',
        channelSubscribers: 0,
        views: 0,
        likes: 0,
        commentCount: 0,
        publishedAt: '',
      }

  await createInsightsWatchItem(event, item)
  return { verdict: body.verdict, listed: true }
})
