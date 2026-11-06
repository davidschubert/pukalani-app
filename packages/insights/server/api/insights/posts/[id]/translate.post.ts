import type { InsightsLocale, InsightsPost } from '../../../../../shared/insightsPost'
import { toInsightsPost } from '../../../../../shared/insightsRows'
import {
  INSIGHTS_TRANSLATE_PROMPT_VERSION,
  buildInsightsTranslatePrompt,
  insightsAiTextSchema,
} from '../../../../../shared/insightsPrompts'
import type { InsightsTranslateResponse } from '../../../../../shared/types/insightsApi'

/**
 * DER ÜBERSETZEN-ENDPUNKT DER REDAKTION (`insights.manage`, §11 Frage 4).
 *
 * ── WARUM NICHT DER UGC-WEG ──────────────────────────────────────────────
 * Der UGC-Weg (`core`, `translations`-Spalte) ist ein CACHE für LESER. Hier
 * übersetzt der BETREIBER, das Ergebnis wird REDIGIERT und GESPEICHERT — es
 * ist keine Zwischenablage, sondern eine Fassung. „Ein Cache, den jemand von
 * Hand nachbessert, ist keiner mehr": die nächste Cache-Änderung verwürfe die
 * Redaktion.
 *
 * ── DIE ZIELSPRACHE IST IMMER DIE ANDERE ─────────────────────────────────
 * Sie kommt nicht aus dem Körper: es gibt genau zwei Sprachen, eine davon ist
 * die Grundfassung (`baseLocale`), und in sich selbst übersetzt niemand. Der
 * Same-Language-Fall des UGC-Wegs entfällt damit ersatzlos.
 *
 * ── DAS ERGEBNIS IST UNREDIGIERT, UND DAS STEHT IN DEN DATEN ─────────────
 * `translationReviewed` wird auf `false` GESETZT, nicht bloss nicht angefasst:
 * ein zweiter Lauf über eine bereits freigegebene Fassung nimmt die Freigabe
 * zurück — sonst stünde das Häkchen über einem Text, den niemand in dieser
 * Form gelesen hat. Öffentlich wird sie erst wieder mit dem Häkchen (§3.2).
 *
 * ── DIE KETTE VOR DEM ANBIETER ───────────────────────────────────────────
 * Permission → Kill-Switch (`readBrandAiEnabled`, fail-closed) → Drossel
 * (10/Stunde, 50/Tag je Konto) → Modell. Reihenfolge und Begründung:
 * `server/utils/insightsAi.ts`.
 */
export default defineEventHandler(async (event): Promise<InsightsTranslateResponse> => {
  const user = requirePermission(event, 'insights.manage')

  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw insightsPostMissing()

  const current = toInsightsPost(await loadInsightsPostRow(event, id))
  const target: InsightsLocale = current.baseLocale === 'de' ? 'en' : 'de'

  const run = await insightsBeginAiRun(event, user.$id, 'translate')
  const startedAt = Date.now()
  insightsLogAi('requested', 'translate', {
    postId: id,
    format: current.format,
    model: run.model,
    promptVersion: INSIGHTS_TRANSLATE_PROMPT_VERSION,
  })

  let text
  try {
    const raw = await aiCompleteJson<unknown>(event, buildInsightsTranslatePrompt(current, target), {
      model: run.model,
      providerRouting: run.providerRouting,
      label: 'insights',
      // Ein Artikel ist lang; der Vorgabewert (700) schnitte die zweite
      // Fassung mitten im Satz ab, und das sähe wie ein Modellfehler aus.
      maxTokens: 8000,
      temperature: 0.2,
      timeoutMs: 120_000,
    })
    // Ein Modell-Ergebnis ist eine Behauptung, bis ein Schema daraus Daten
    // macht (Kopf von `insightsPost.ts`). Die Deckel sind die des Vertrags.
    text = insightsAiTextSchema.parse(raw)
  }
  catch (error) {
    insightsLogAi('failed', 'translate', {
      postId: id,
      format: current.format,
      model: run.model,
      promptVersion: INSIGHTS_TRANSLATE_PROMPT_VERSION,
      durationMs: Date.now() - startedAt,
      errorCode: insightsAiErrorCode(error),
    })
    throw error
  }

  const next: InsightsPost = {
    ...current,
    titleDe: target === 'de' ? text.title : current.titleDe,
    titleEn: target === 'en' ? text.title : current.titleEn,
    dekDe: target === 'de' ? text.dek : current.dekDe,
    dekEn: target === 'en' ? text.dek : current.dekEn,
    bodyDe: target === 'de' ? text.body : current.bodyDe,
    bodyEn: target === 'en' ? text.body : current.bodyEn,
    translatedAt: new Date().toISOString(),
    translationModel: run.model.slice(0, 120),
    translationPromptVersion: INSIGHTS_TRANSLATE_PROMPT_VERSION,
    translationReviewed: false,
  }

  const saved = await saveInsightsPostRow(event, id, next)
  insightsLogAi('completed', 'translate', {
    postId: id,
    format: current.format,
    model: run.model,
    promptVersion: INSIGHTS_TRANSLATE_PROMPT_VERSION,
    durationMs: Date.now() - startedAt,
  })

  return { post: toInsightsPost(saved) }
})
