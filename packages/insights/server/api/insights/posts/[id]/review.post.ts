import type { RunLeaseRow } from '../../../../../../core/server/utils/runLease'
import { RUN_LEASE_BUSY_CODE } from '../../../../../../core/shared/runLease'
import {
  INSIGHTS_AI_REVIEW_NOTHING_CODE,
  INSIGHTS_AI_REVIEW_RUN_SCOPE,
  INSIGHTS_AI_REVIEW_RUNNING_CODE,
  insightsAiReviewHasText,
  insightsAiReviewRequestSchema,
} from '../../../../../shared/insightsAiReview'
import { INSIGHTS_AI_REVIEW_PROMPT_VERSION } from '../../../../../shared/insightsPrompts'
import type { InsightsAiReviewResponse } from '../../../../../shared/types/insightsApi'
import { insightsAiReviewStore, runInsightsAiReview } from '../../../../utils/insightsAiReviewRun'

/**
 * KI-PRÜFUNG EINES ARTIKELS STARTEN (`insights.manage`, IN1 a, 2026-11-22).
 *
 * Der Körper ist der UNGESPEICHERTE Formularstand (dasselbe Schema wie das
 * Speichern) und die Sprache der Rückmeldung. Die Prüfung BERÄT: sie schreibt
 * nichts in den Artikel, sperrt nichts und darf falsch warnen — die Sperre
 * bleiben die festen Prüfregeln (`insightsPublicationGate`). Deshalb ruft
 * diese Route weder `saveInsightsPostRow` noch das Gate.
 *
 * ── DIE REIHENFOLGE (`lange-laeufe.md`) ─────────────────────────────────
 *  1. `insights.manage`, Schema des Körpers.
 *  2. Alles Kostenlose: gibt es den Beitrag (404)? Hat die Grundfassung
 *     überhaupt Fliesstext (409 `nothing_to_review`)?
 *  3. Die LAUF-SPERRE in `insights_runs` (Art `review`, Gegenstand =
 *     Beitrags-Id). Belegt ⇒ 409 `review_running` — die Seite zeigt einen
 *     ruhigen Hinweis. „Nicht prüfbar" (503) bleibt 503.
 *  4. ERST JETZT Kill-Switch und Kontingent (`insightsBeginAiRun`, eigener
 *     Eimer `review`) — sonst bucht ein Doppelklick zweimal. Lehnt das ab,
 *     fällt die Sperre (`dropRunLease`).
 *  5. `202` mit dem Lauf-Stand; gerechnet wird hinter der Antwort
 *     (`runInsightsAiReview`, `runDetached`). Den `paid`-Vermerk setzt der
 *     Lauf vor dem Aufruf; das Ergebnis holt die Seite über
 *     `GET /api/insights/posts/:id/review` ab. Wo es liegt und warum: Kopf
 *     von `server/utils/insightsAiReviewRun.ts`.
 *
 * Das Protokoll trägt nur Kennungen und Zahlen — kein Satz des Artikels.
 */
export default defineEventHandler(async (event): Promise<InsightsAiReviewResponse> => {
  const user = requirePermission(event, 'insights.manage')

  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw insightsPostMissing()

  const body = await readValidatedBody(event, insightsAiReviewRequestSchema.parse)

  // (2) Den Beitrag gibt es — sonst 404, bevor etwas gesperrt oder gebucht ist.
  await loadInsightsPostRow(event, id)

  if (!insightsAiReviewHasText(body.post)) {
    throw createError({
      status: 409,
      statusText: 'Nothing to review',
      data: { code: INSIGHTS_AI_REVIEW_NOTHING_CODE },
    })
  }

  // (3) Die Sperre.
  const store = insightsAiReviewStore(event)
  let lease: RunLeaseRow
  try {
    ({ lease } = await acquireRunLease(store, {
      scope: INSIGHTS_AI_REVIEW_RUN_SCOPE,
      subject: id,
      detail: { paid: false, findings: 0 },
    }))
  }
  catch (error) {
    if ((error as { data?: { code?: unknown } } | null)?.data?.code === RUN_LEASE_BUSY_CODE) {
      throw createError({
        status: 409,
        statusText: 'Review run in flight',
        data: { code: INSIGHTS_AI_REVIEW_RUNNING_CODE },
      })
    }
    throw error
  }

  // (4) Kill-Switch und Kontingent — NACH der Sperre.
  let model: string
  try {
    ({ model } = await insightsBeginAiRun(event, user.$id, 'review'))
  }
  catch (error) {
    // Nichts lief: die Sperre fällt, als hätte es den Versuch nie gegeben.
    await dropRunLease(store, lease)
    throw error
  }

  insightsLogAi('requested', 'review', {
    postId: id,
    format: body.post.format,
    model,
    promptVersion: INSIGHTS_AI_REVIEW_PROMPT_VERSION,
  })

  // (5) Der bezahlte Teil hinter der Antwort.
  runDetached('insights-review', () => runInsightsAiReview(event, {
    store,
    lease,
    postId: id,
    post: body.post,
    locale: body.locale,
    model,
  }))

  setResponseStatus(event, 202)
  return {
    run: {
      state: 'running',
      startedAt: lease.startedAt,
      finishedAt: '',
      failure: '',
      locale: '',
      findings: null,
      gone: false,
    },
  }
})
