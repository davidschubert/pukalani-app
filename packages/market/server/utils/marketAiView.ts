import type { H3Event } from 'h3'
import { z } from 'zod'
import { BRAND_PROVIDER_ROUTING } from '../contracts/brandContract'
import type { MarketAiStatement } from '../../shared/marketProfile'
import { MARKET_FIELD_IDS } from '../../shared/marketProfile'
import type { MarketAiAnswer } from '../../shared/marketExtractRules'
import { MARKET_AI_VIEW_FIELDS, consensusStatements } from '../../shared/marketExtractRules'
import {
  MARKET_AI_VIEW_MAX_TOKENS,
  MARKET_AI_VIEW_PROMPT_VERSION,
  MARKET_AI_VIEW_TIMEOUT_MS,
  marketAiViewPrompt,
  marketAiViewSystemPrompt,
} from '../prompts/marketAiViewPrompt'
import { marketDevStubEnabled, marketOutsideViewModels } from './marketAi'

/**
 * DIE KI-AUSSENSICHT (Plan §7.5 — Davids Entscheidung GEGEN die Empfehlung,
 * „weil das Halluzinationsrisiko hier am höchsten ist" mit den schärfsten
 * Leitplanken im ganzen Produkt).
 *
 * ── DIE FÜNF LEITPLANKEN UND WO SIE STEHEN ────────────────────────────────
 * (a) EIGENE HERKUNFT: sie landet in `market_profiles.aiOutsideView`, einer
 *     EIGENEN Spalte — nie in `fields`. Das ist keine Konvention, sondern
 *     Ablage: die zwei Sichten können sich nicht vermischen, weil sie nicht
 *     im selben Feld stehen.
 * (b) KONSENS: `consensusStatements` übernimmt nur, was ≥ 2 VERSCHIEDENE
 *     Modelle übereinstimmend sagen — deterministisch, hier im Code, mit
 *     Gegenprobe im Test. Das Ablage-Schema verlangt zusätzlich `agree ≥ 2`.
 * (c) KEIN EINFLUSS AUF EINEN SCORE: diese Datei schreibt nichts ausser der
 *     Aussensicht. Der Brand-Score bleibt belegbasiert.
 * (d) EIGENE SICHT IM VERGLEICH: das ist M3/M4 („Website sagt" gegen
 *     „KI-Antworten sagen").
 * (e) EIGENER KOSTENANTEIL: zwei Aufrufe je Marke, gebucht im Lauf-Eimer.
 *
 * ── OHNE ZWEITES MODELL GIBT ES NICHTS ────────────────────────────────────
 * Kein Rückfall auf „dann eben eines". Eine einzelne Modellantwort über eine
 * fremde Marke ist genau die Sorte Aussage, gegen die (b) steht — sie sähe
 * neben den belegten Feldern aus wie eine Auskunft und wäre eine Vermutung.
 */

const answerSchema = z.object({
  fields: z.array(z.object({
    fieldId: z.enum(MARKET_FIELD_IDS),
    value: z.string().max(2000).optional().default(''),
  })).max(20),
})

export interface MarketAiViewInput {
  brandName: string
  host: string
  /** Die Inhaltssprache des Brandings (`brand_profiles.contentLocale`). */
  locale: string
}

export interface MarketAiViewResult {
  statements: MarketAiStatement[]
  /** Welche Modelle gefragt wurden — für das Log und für `asked`. */
  models: string[]
  promptVersion: string
}

const AI_VIEW_FIELDS = new Set<string>(MARKET_AI_VIEW_FIELDS)

/**
 * DER ERSATZ (`MARKET_DEV_STUB=1`): zwei erfundene „Modelle", die dieselbe
 * Antwort geben — damit der Konsens-Filter im Beweis GREIFT und nicht
 * umgangen wird.
 *
 * Die Werte leiten sich aus dem Markennamen ab und sind als Ersatz erkennbar:
 * ein Text, der wie ein Ergebnis aussieht, landet irgendwann in einem
 * Screenshot.
 */
function stubAnswers(input: MarketAiViewInput): MarketAiAnswer[] {
  const answers: MarketAiAnswer[] = []
  for (const model of ['dev-stub-a', 'dev-stub-b']) {
    for (const fieldId of MARKET_AI_VIEW_FIELDS) {
      answers.push({
        model,
        fieldId,
        value: `Ersatzantwort für ${input.brandName} (${fieldId})`,
      })
    }
  }
  // Ein Feld, in dem sich die beiden UNEINIG sind — der Beweis braucht auch
  // den Fall, in dem der Filter etwas WEGLÄSST. Ohne ihn wäre „alle fünf Felder
  // sind da" kein Beleg dafür, dass gefiltert wird.
  const dissent = answers.find(answer => answer.model === 'dev-stub-b' && answer.fieldId === 'firstChoice')
  if (dissent) {
    answers[answers.indexOf(dissent)] = {
      model: 'dev-stub-b',
      fieldId: 'firstChoice',
      value: 'völlig anderes Thema ohne gemeinsame Wörter',
    }
  }
  return answers
}

/** EIN Modell fragen — fail-soft: ein Ausfall nimmt nur seine Antworten mit. */
async function askModel(
  event: H3Event,
  model: string,
  input: MarketAiViewInput,
): Promise<MarketAiAnswer[]> {
  let raw: unknown
  try {
    raw = await aiCompleteJson<unknown>(event, marketAiViewPrompt(input), {
      model,
      system: marketAiViewSystemPrompt(),
      label: 'market-ai-view',
      maxTokens: MARKET_AI_VIEW_MAX_TOKENS,
      timeoutMs: MARKET_AI_VIEW_TIMEOUT_MS,
      temperature: 0,
      providerRouting: { ...BRAND_PROVIDER_ROUTING },
    })
  }
  catch (error) {
    logEvent('warn', 'market.ai_view_provider_error', {
      model,
      message: error instanceof Error ? error.message : String(error),
    })
    return []
  }

  const parsed = answerSchema.safeParse(raw)
  if (!parsed.success) {
    logEvent('warn', 'market.ai_view_schema_error', { model, issues: parsed.error.issues.length })
    return []
  }

  const answers: MarketAiAnswer[] = []
  for (const field of parsed.data.fields) {
    // Ein Feld ausserhalb der fünf ist keine Aussensicht, sondern ein Modell,
    // das die Aufgabe erweitert hat.
    if (!AI_VIEW_FIELDS.has(field.fieldId)) continue
    const value = field.value.trim()
    if (!value) continue
    answers.push({ model, fieldId: field.fieldId, value })
  }
  return answers
}

/**
 * DIE AUSSENSICHT EINER MARKE. Leere `statements` sind das normale Ergebnis,
 * wenn die Modelle die Marke nicht kennen oder sich uneinig sind — und genau
 * so ist es gemeint (§7.5: „Ohne zweites Modell oder ohne Konsens ⇒ leer, nie
 * geraten").
 */
export async function collectMarketAiView(
  event: H3Event,
  input: MarketAiViewInput,
): Promise<MarketAiViewResult> {
  if (marketDevStubEnabled()) {
    const models = ['dev-stub-a', 'dev-stub-b']
    return {
      statements: consensusStatements(stubAnswers(input), models.length),
      models,
      promptVersion: MARKET_AI_VIEW_PROMPT_VERSION,
    }
  }

  const models = marketOutsideViewModels()
  // Weniger als zwei VERSCHIEDENE Modelle ⇒ gar keine Aussensicht (s. Kopf).
  if (models.length < 2) return { statements: [], models, promptVersion: MARKET_AI_VIEW_PROMPT_VERSION }

  const answers: MarketAiAnswer[] = []
  for (const model of models) {
    answers.push(...await askModel(event, model, input))
  }

  const statements = consensusStatements(answers, models.length)
  logEvent('info', 'market.ai_view', {
    models: models.length,
    // ZAHLEN, kein Inhalt: wie viele Felder haben den Konsens überstanden.
    answered: answers.length,
    adopted: statements.length,
  })

  return { statements, models, promptVersion: MARKET_AI_VIEW_PROMPT_VERSION }
}
