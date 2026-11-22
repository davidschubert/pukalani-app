import { INSIGHTS_AI_REVIEW_RUN_SCOPE, toInsightsAiReviewView } from '../../../../../shared/insightsAiReview'
import type { InsightsAiReviewResponse } from '../../../../../shared/types/insightsApi'
import { insightsAiReviewStore, recallInsightsAiReview } from '../../../../utils/insightsAiReviewRun'

/**
 * STAND DER KI-PRÜFUNG (`insights.manage`, IN1 a) — die Seite fragt hier ab,
 * solange ein Lauf offen ist (`useRunPolling`).
 *
 * Der Zustand ist gegen die SERVER-Uhr gerechnet (`runLeaseState`): ein Lauf
 * ohne Herzschlag gilt nach der Frist als abgebrochen, ohne dass jemand
 * aufräumt. Ist der jüngste Lauf fertig, kommen die Funde aus dem Speicher
 * des Prozesses; fehlen sie dort (Neustart, abgelaufen), sagt `gone: true`
 * das ehrlich (Kopf von `server/utils/insightsAiReviewRun.ts`).
 *
 * Fehlt die Lauf-Tabelle (Instanz ohne insights-012), gibt es keinen Lauf —
 * „kein Lauf" statt eines Fehlers, wie die Radar-Abfrage.
 */
export default defineEventHandler(async (event): Promise<InsightsAiReviewResponse> => {
  requirePermission(event, 'insights.manage')

  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw insightsPostMissing()

  // Den Beitrag gibt es — sonst 404 wie an jeder Route des Beitrags.
  await loadInsightsPostRow(event, id)

  const lease = await insightsAiReviewStore(event)
    .latest(INSIGHTS_AI_REVIEW_RUN_SCOPE, id)
    .catch((error: unknown) => {
      if (isInsightsRowMissing(error)) return null
      throw error
    })

  const nowMs = Date.now()
  return {
    run: toInsightsAiReviewView(lease, nowMs, lease ? recallInsightsAiReview(lease.$id, nowMs) : null),
  }
})
