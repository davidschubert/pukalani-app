import { insightsChangeDigest, insightsChangeDigestIsEmpty } from '../../../../../shared/insightsChangeNote'
import { insightsPostEditSchema } from '../../../../../shared/insightsPost'
import { toInsightsPost } from '../../../../../shared/insightsRows'
import {
  INSIGHTS_CHANGE_NOTE_PROMPT_VERSION,
  buildInsightsChangeNotePrompt,
  insightsChangeNoteSuggestionSchema,
} from '../../../../../shared/insightsPrompts'
import type { InsightsChangeNoteSuggestionResponse } from '../../../../../shared/types/insightsApi'

/**
 * VORSCHLAG FÜR DEN ÄNDERUNGSHINWEIS (`insights.manage`, 2026-11-16).
 *
 * Der Körper ist der UNGESPEICHERTE Formularstand, geprüft mit demselben
 * Schema wie das Speichern. Verglichen wird er mit dem Stand der Ablage — an
 * einem öffentlichen Beitrag ist das die Fassung, die online steht.
 *
 * ── DIESE ROUTE SCHREIBT NICHTS ──────────────────────────────────────────
 * Ein Vorschlag ist ein Vorschlag: er landet im Formular, ein Mensch
 * bestätigt, ändert oder verwirft ihn, und erst „Speichern" macht ihn zum
 * Hinweis — dort läuft er durch das Gate (Prüfregel 4 sieht die Hinweise).
 * Deshalb ruft sie `saveInsightsPostRow` nicht und braucht kein
 * Freigabe-Zeichen.
 *
 * ── STRENG IST VOR DEM BEZAHLTEN AUFRUF ──────────────────────────────────
 * Alles, was einen Lauf sinnlos macht, wird VORHER abgelehnt, ohne dass der
 * Anbieter gerufen oder ein Eimer verbraucht wird: ein Beitrag, der nie
 * veröffentlicht war, hat keine Leser, denen sich etwas geändert haben könnte
 * (409 `not_published`); ein Formular ohne sichtbare Änderung hat nichts zu
 * beschreiben (409 `no_change`). Danach die Kette aus Kill-Switch und
 * Drossel (`insightsBeginAiRun`, eigener Eimer `changeNote`).
 *
 * ── NACH DEM AUFRUF WIRD GEKLEMMT, NICHT ABGELEHNT ───────────────────────
 * Ein zu langer Satz wird gekürzt, eine fehlende Sprache bleibt leer
 * (`insightsChangeNoteSuggestionSchema`). Gescheitert ist der Lauf nur, wenn
 * BEIDE Sprachen leer sind — dann gibt es nichts, was ein Mensch prüfen
 * könnte (502 `ai_empty`).
 *
 * Das Protokoll trägt nur Kennungen und Zahlen: weder der Vorschlag noch ein
 * Satz des Artikels steht darin.
 */
export default defineEventHandler(async (event): Promise<InsightsChangeNoteSuggestionResponse> => {
  const user = requirePermission(event, 'insights.manage')

  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw insightsPostMissing()

  const body = await readValidatedBody(event, insightsPostEditSchema.parse)
  const current = toInsightsPost(await loadInsightsPostRow(event, id))

  if (!current.publishedAt) {
    throw createError({ status: 409, statusText: 'Not published', data: { code: 'not_published' } })
  }

  const digest = insightsChangeDigest(current, body)
  if (insightsChangeDigestIsEmpty(digest)) {
    throw createError({ status: 409, statusText: 'No change', data: { code: 'no_change' } })
  }

  const run = await insightsBeginAiRun(event, user.$id, 'changeNote')
  const startedAt = Date.now()
  insightsLogAi('requested', 'changeNote', {
    postId: id,
    format: current.format,
    model: run.model,
    promptVersion: INSIGHTS_CHANGE_NOTE_PROMPT_VERSION,
  })

  // AUSSERHALB des try, wie in `draft.post.ts`: auch ein leerer Lauf ist
  // bezahlt und kennt seine Zahlen schon.
  let completion
  try {
    completion = await aiCompleteJsonDetailed<unknown>(event, buildInsightsChangeNotePrompt(digest), {
      model: run.model,
      providerRouting: run.providerRouting,
      label: 'insights',
      // Grosszügig: zwei Sätze brauchen keine 200 Token, aber eine gerissene
      // Decke zerstört den Lauf, statt Geld zu sparen.
      maxTokens: 800,
      temperature: 0.2,
      timeoutMs: 60_000,
    })
    const suggestion = insightsChangeNoteSuggestionSchema.parse(completion.value)
    if (!suggestion.de && !suggestion.en) {
      throw createError({ status: 502, statusText: 'AI returned no note', data: { code: 'ai_empty' } })
    }
    insightsLogAi('completed', 'changeNote', {
      postId: id,
      format: current.format,
      model: run.model,
      promptVersion: INSIGHTS_CHANGE_NOTE_PROMPT_VERSION,
      durationMs: Date.now() - startedAt,
      promptTokens: completion.promptTokens,
      completionTokens: completion.completionTokens,
      finishReason: completion.finishReason,
    })
    return { de: suggestion.de, en: suggestion.en }
  }
  catch (error) {
    insightsLogAi('failed', 'changeNote', {
      postId: id,
      format: current.format,
      model: run.model,
      promptVersion: INSIGHTS_CHANGE_NOTE_PROMPT_VERSION,
      durationMs: Date.now() - startedAt,
      errorCode: insightsAiErrorCode(error),
      promptTokens: completion?.promptTokens,
      completionTokens: completion?.completionTokens,
      finishReason: completion?.finishReason,
    })
    throw error
  }
})
