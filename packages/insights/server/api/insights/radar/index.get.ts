import { Query } from 'node-appwrite'
import { readInsightsRadarConfig } from '../../../../shared/insightsRadar'
import { insightsRadarQuotaEstimate } from '../../../../shared/insightsYoutube'
import type { InsightsTopicRow } from '../../../../shared/insightsRows'
import { toInsightsRadarVideo } from '../../../../shared/insightsRows'
import type { InsightsRadarResponse, InsightsRadarVideoItem } from '../../../../shared/types/insightsApi'

/**
 * DER THEMENRADAR, WIE DIE REDAKTION IHN SIEHT (BI1 I4, §9.6).
 *
 * `insights.manage` wie jede Route dieses Layers — der Radar ist
 * Betreiber-Sache, und es gibt keine öffentliche Fassung davon (Leitplanke a
 * verbietet ohnehin, aus diesen Zahlen etwas Verdichtetes zu veröffentlichen).
 *
 * ── SORTIERT WIRD IM SERVER, NICHT IN DER DATENBANK ─────────────────────
 * Appwrite verlangt für eine `orderDesc`-Spalte einen Index, und `opportunity`
 * hat bewusst keinen (Begründung im Kopf der Migration insights-004: die
 * Spalte wird bei JEDEM Upsert neu geschrieben, ein Index kostete dort und
 * spart hier nichts). Geholt wird deshalb nach `fetchedAt` — der ist indiziert
 * und beantwortet ausserdem die richtige Frage, wenn der Deckel greift: bei
 * mehr als {INSIGHTS_TOPICS_LIMIT} Zeilen sollen die FRISCHEN drin sein, nicht
 * die mit der schönsten Zahl. Sortiert wird danach über höchstens 500 Zeilen
 * im Speicher.
 *
 * ── OHNE ZAHL ANS ENDE ──────────────────────────────────────────────────
 * `opportunity: null` heisst „kein Signal", nicht „schlechtes Video". Ein
 * `null`, das als 0 sortiert, machte daraus stillschweigend eine Bewertung.
 *
 * ── `lastRunAt` KOMMT AUS DEN ZEILEN ────────────────────────────────────
 * Der jüngste `fetchedAt`, und weil die Abfrage danach absteigend sortiert,
 * ist das die erste Zeile. Kein zweiter Zustand, kein „letzter Lauf"-Stempel
 * irgendwo daneben: der könnte von den Zeilen abweichen, und dann glaubte
 * niemand mehr einem von beiden.
 */
export default defineEventHandler(async (event): Promise<InsightsRadarResponse> => {
  requirePermission(event, 'insights.manage')

  const { maxVideos, maxVideoAgeDays } = readInsightsRadarConfig(useAppConfig())
  const configured = !!useRuntimeConfig(event).insightsYoutubeKey

  const { tablesDB, databaseId } = insightsDb(event)

  // Die Kanäle kommen seit BI2 K3 aus der TABELLE, nicht mehr aus der
  // App-Config — dieselbe Quelle, die auch der nächtliche Lauf liest.
  // FAIL-SOFT aus demselben Grund wie die Radar-Zeilen darunter: ohne
  // insights-005 gibt es die Tabelle nicht, und die Seite soll dann „kein
  // Kanal" zeigen statt eines 500.
  const channels = await readActiveRadarChannels(tablesDB, databaseId)
    .catch((error: unknown) => {
      if (isInsightsRowMissing(error)) return []
      throw error
    })

  const listed = await tablesDB.listRows<InsightsTopicRow>({
    databaseId,
    tableId: INSIGHTS_TOPICS_TABLE,
    queries: [Query.orderDesc('fetchedAt'), Query.limit(INSIGHTS_TOPICS_LIMIT)],
  }).catch((error: unknown) => {
    // FAIL-SOFT: ohne insights-004 gibt es die Tabelle nicht, und die Seite
    // soll dann ihren Zustand zeigen („kein Lauf") statt eines 500. Jeder
    // ANDERE Fehler bleibt einer.
    if (isInsightsRowMissing(error)) return null
    throw error
  })

  const videos: InsightsRadarVideoItem[] = (listed?.rows ?? [])
    .map(toInsightsRadarVideo)
    .sort((a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1))

  // Das Urteil wohnt in den FUNDSTÜCKEN und nicht an der Radar-Zeile (BI2 K4):
  // die hier wird täglich überschrieben und nach dreissig Tagen gelöscht, ein
  // Urteil daran verschwände mit ihr. Es wird deshalb dazugelesen, über die
  // Video-Ids dieser Antwort — eine Karte, weil die Ansicht je Zeile fragt.
  const verdicts = await readInsightsVerdicts(event, videos.map(video => video.videoId))

  return {
    configured,
    verdicts,
    channels: channels.length,
    quotaEstimate: insightsRadarQuotaEstimate(channels.length, maxVideos),
    lastRunAt: listed?.rows[0]?.fetchedAt ?? null,
    today: new Date().toISOString().slice(0, 10),
    maxVideoAgeDays,
    videos,
  }
})
