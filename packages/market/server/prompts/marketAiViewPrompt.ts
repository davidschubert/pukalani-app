import { MARKET_AI_VIEW_FIELDS } from '../../shared/marketExtractRules'

/**
 * DER PROMPT DER KI-AUSSENSICHT (Plan §7.5) — Fassung `market-ai-1`.
 *
 * ── ER FRAGT NACH WISSEN, NICHT NACH TEXT ─────────────────────────────────
 * Der Extraktions-Prompt bekommt Material und soll es beschreiben. Dieser
 * bekommt NICHTS und soll sagen, was das Modell über eine Marke weiss. Das ist
 * der riskanteste Aufruf im ganzen Produkt (Davids Entscheidung GEGEN die
 * Empfehlung, §7.5) — die Leitplanken stehen deshalb nicht hier, sondern im
 * Code: mindestens zwei VERSCHIEDENE Modelle, Übernahme nur bei
 * Übereinstimmung (`consensusStatements`), eigene Spalte, kein Einfluss auf
 * irgendeinen Score.
 *
 * ── WAS DER PROMPT TROTZDEM TUN KANN ──────────────────────────────────────
 * Er kann das NICHTWISSEN erlauben. „Leave it empty if you are not sure" ist
 * die einzige Zeile, die ein Modell davon abhält, eine plausible Marke zu
 * erfinden — und weil der Konsens-Filter zwei Erfindungen nur dann übernimmt,
 * wenn sie ZUFÄLLIG übereinstimmen, wirkt beides zusammen.
 *
 * ── FÜNF FELDER, NICHT ZEHN ───────────────────────────────────────────────
 * `MARKET_AI_VIEW_FIELDS` (Begründung dort): nach einer Tagline zu fragen,
 * hiesse, ein wörtliches Zitat zu bestellen, für das es hier keinen Beleg gibt.
 */

export const MARKET_AI_VIEW_PROMPT_VERSION = 'market-ai-1'

export const MARKET_AI_VIEW_MAX_TOKENS = 700

export const MARKET_AI_VIEW_TIMEOUT_MS = 45_000

export function marketAiViewSystemPrompt(): string {
  return [
    'You answer what you already know about a brand — from your training data, not from any document.',
    'You never judge, rank, praise or disparage the brand.',
    'Not knowing is a valid and useful answer. An invented answer is worse than an empty one.',
    'You answer with a single JSON object and nothing else.',
  ].join('\n')
}

const AI_FIELD_TASKS: Record<string, string> = {
  categoryLanguage: 'What category is this brand in? At most five words.',
  pitch: 'What does it promise its customers? One or two sentences.',
  audience: 'Who is it for? One sentence.',
  firstChoice: 'Why do people choose it over others? One sentence.',
  values: 'Which values is it associated with? At most five single words, comma separated.',
}

export interface MarketAiViewPromptInput {
  /** Der Markenname, wie der Kunde ihn führt. */
  brandName: string
  /** Der Host — er trennt gleichnamige Marken (`ambient.de` ≠ `ambient.io`). */
  host: string
  /**
   * Die Sprache, in der geantwortet werden soll — die INHALTSSPRACHE des
   * Brandings. Anders als bei der Extraktion gibt es hier keine Website, deren
   * Sprache die Antwort bestimmen könnte; also entscheidet die Sprache, in der
   * der Kunde arbeitet. Ohne diese Angabe stünde neben einem deutschen
   * Website-Profil eine englische Aussensicht.
   */
  locale: string
}

export function marketAiViewPrompt(input: MarketAiViewPromptInput): string {
  const fields = MARKET_AI_VIEW_FIELDS
    .map(fieldId => `- "${fieldId}": ${AI_FIELD_TASKS[fieldId] ?? ''}`)
    .join('\n')

  return [
    `What do you know about the brand "${input.brandName}" (${input.host})?`,
    '',
    'Answer these fields:',
    fields,
    '',
    'RULES',
    `1. Answer in ${input.locale === 'de' ? 'German' : 'English'}.`,
    '2. If you are not sure that you know this specific brand, return every field with an empty value. Do not describe a similarly named company, and do not reason from the domain name alone.',
    '3. Describe. Never evaluate, never compare it to competitors.',
    '4. No people: no founder names, no e-mail addresses, no phone numbers.',
    '',
    'Return exactly this JSON and nothing else:',
    '{"fields":[{"fieldId":"pitch","value":"…"}]}',
  ].join('\n')
}
