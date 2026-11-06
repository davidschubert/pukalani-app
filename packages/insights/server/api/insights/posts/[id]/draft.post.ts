import { z } from 'zod'
import type { InsightsPost } from '../../../../../shared/insightsPost'
import { INSIGHTS_BRIEF_MAX, insightsReadingMinutes } from '../../../../../shared/insightsPost'
import { toInsightsBrand, toInsightsPost } from '../../../../../shared/insightsRows'
import {
  INSIGHTS_DRAFT_PROMPT_VERSION,
  INSIGHTS_DRAFT_WORDS_DEFAULT,
  INSIGHTS_DRAFT_WORDS_MAX,
  INSIGHTS_DRAFT_WORDS_MIN,
  buildInsightsDraftPrompt,
  insightsAiTextSchema,
} from '../../../../../shared/insightsPrompts'
import type { InsightsDraftResponse } from '../../../../../shared/types/insightsApi'

/**
 * DER KI-ENTWURF AUS EINEM BRIEF (`insights.manage`, §9.4).
 *
 * ── NUR IM ZUSTAND `draft` ───────────────────────────────────────────────
 * Ein Entwurf ÜBERSCHREIBT Titel, Vorspann und Fließtext der Grundfassung. In
 * `review` wäre das ein Text, der einem Menschen unter der Hand ausgetauscht
 * wird; in `published`/`updated` wäre es eine stille Änderung an einem
 * öffentlichen Beitrag. Wer neu entwerfen will, zieht zurück.
 *
 * ── DER ENTWURF BLEIBT `draft` ───────────────────────────────────────────
 * „Es gibt keinen Weg von der KI direkt nach `review`" (§9.4). Der Zustand
 * wird hier nicht angefasst — nicht einmal auf denselben Wert gesetzt, damit
 * niemand diese Zeile für einen Schalter hält.
 *
 * ── DIE ZWEITE FASSUNG WIRD NICHT MITGESCHRIEBEN ─────────────────────────
 * Sie gehört dem Übersetzen-Lauf. Ein Entwurf, der beide Sprachen füllte,
 * hätte eine zweite Fassung erzeugt, die nie aus der ersten entstanden ist —
 * und `translationReviewed` hinge über einem Text ohne Vorlage.
 *
 * ── WAS DAS MODELL NICHT BEKOMMT ─────────────────────────────────────────
 * Keine abgerufenen Seiten, keine Quellen, keine Zitate. Der Prompt sagt
 * ausdrücklich: keine erfundenen Zitate, keine Zahl ohne Quelle (Platzhalter
 * `[Quelle]`), keine Herabsetzung. Belege trägt die Redaktion ein, und der
 * Beleg-Riegel prüft sie deterministisch — ein Modell, das Quellen „findet",
 * findet auch welche, die es nicht gibt.
 */
const bodySchema = z.object({
  brief: z.string().trim().min(1).max(INSIGHTS_BRIEF_MAX),
  targetWords: z.number().int().min(INSIGHTS_DRAFT_WORDS_MIN).max(INSIGHTS_DRAFT_WORDS_MAX).default(INSIGHTS_DRAFT_WORDS_DEFAULT),
})

export default defineEventHandler(async (event): Promise<InsightsDraftResponse> => {
  const user = requirePermission(event, 'insights.manage')

  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw insightsPostMissing()

  const body = await readValidatedBody(event, bodySchema.parse)
  const current = toInsightsPost(await loadInsightsPostRow(event, id))
  if (current.state !== 'draft') {
    throw createError({ status: 409, statusText: 'Not a draft', data: { code: 'not_draft' } })
  }

  // Die Marken-NAMEN, nicht ihre Zeilen: der Prompt soll wissen, über wen
  // geschrieben wird, und sonst nichts über sie behaupten können.
  const referenced = new Set(current.brandRefs.map(ref => ref.brandId))
  const brandRows = await listInsightsBrandRows(event, INSIGHTS_BRANDS_LIMIT)
  const brandNames = brandRows
    .filter(row => referenced.has(row.$id) && row.state !== 'removed')
    .map(row => toInsightsBrand(row).name)

  const run = await insightsBeginAiRun(event, user.$id, 'draft')
  const startedAt = Date.now()
  insightsLogAi('requested', 'draft', {
    postId: id,
    format: current.format,
    model: run.model,
    promptVersion: INSIGHTS_DRAFT_PROMPT_VERSION,
  })

  let text
  try {
    const raw = await aiCompleteJson<unknown>(event, buildInsightsDraftPrompt({
      format: current.format,
      baseLocale: current.baseLocale,
      brief: body.brief,
      targetWords: body.targetWords,
      brandNames,
    }), {
      model: run.model,
      providerRouting: run.providerRouting,
      label: 'insights',
      maxTokens: 8000,
      temperature: 0.5,
      timeoutMs: 120_000,
    })
    text = insightsAiTextSchema.parse(raw)
  }
  catch (error) {
    insightsLogAi('failed', 'draft', {
      postId: id,
      format: current.format,
      model: run.model,
      promptVersion: INSIGHTS_DRAFT_PROMPT_VERSION,
      durationMs: Date.now() - startedAt,
      errorCode: insightsAiErrorCode(error),
    })
    throw error
  }

  const base = current.baseLocale
  const next: InsightsPost = {
    ...current,
    titleDe: base === 'de' ? (text.title || current.titleDe) : current.titleDe,
    titleEn: base === 'en' ? (text.title || current.titleEn) : current.titleEn,
    dekDe: base === 'de' ? text.dek : current.dekDe,
    dekEn: base === 'en' ? text.dek : current.dekEn,
    bodyDe: base === 'de' ? text.body : current.bodyDe,
    bodyEn: base === 'en' ? text.body : current.bodyEn,
    readingMinutes: insightsReadingMinutes(text.body),
    draftModel: run.model.slice(0, 120),
    draftPromptVersion: INSIGHTS_DRAFT_PROMPT_VERSION,
  }

  const saved = await saveInsightsPostRow(event, id, next)
  insightsLogAi('completed', 'draft', {
    postId: id,
    format: current.format,
    model: run.model,
    promptVersion: INSIGHTS_DRAFT_PROMPT_VERSION,
    durationMs: Date.now() - startedAt,
  })

  return { post: toInsightsPost(saved) }
})
