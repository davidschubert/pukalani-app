import { z } from 'zod'
import { BRAND_GUARDRAIL_GROUPS, BRAND_PROMPT_TEMPLATES } from '../shared/brandKitSlots'
import { BRAND_NAME_TYPES } from '../shared/brandKitVocab'

/**
 * DIE FORMVERTRÄGE DER SCHICHT-3-WERTE (Konzept docs/plans/BRAND-BOOK-KIT.md
 * §2.2–§2.4, Paket K5) — als prüfbare Zusage, nicht als Tür.
 *
 * ── WARUM SIE HIER LIEGEN UND NICHT IN `shared/` ─────────────────────────
 * Dieselbe Arbeitsteilung wie im ganzen Layer: `shared/` BESCHREIBT eine Form
 * (Schreiber, Leser, Invarianten — `brandKitSlots.ts`), `schemas/`
 * VALIDIERT sie. Keine einzige Datei in `shared/` importiert heute Zod, und
 * das ist kein Zufall: `shared/brandKitSlots.ts` wird von
 * `shared/brandFoundation.ts` gelesen, also von jeder Leseansicht im Browser.
 *
 * ── SIE LAUFEN NICHT AN DER ROUTE ────────────────────────────────────────
 * Ein Slot-Wert ist TEXT (`brand_steps.slots`), und die Route klemmt ihn auf
 * `maxLength` — mehr nicht (dieselbe Entscheidung wie in
 * `brandSlotFormat.ts`: „ein formfremder Entwurf ist kein Grund, dem Menschen
 * seinen Text wegzunehmen"). Diese Schemas prüfen die ZERLEGUNG im Test und
 * im Wächter-Skript: sie beweisen, dass Schreiber und Leser dieselbe Form
 * meinen, und sie fangen einen Entwurf ab, dessen Zerlegung leer bleibt.
 *
 * ── SIE KLEMMEN, STATT ZU WERFEN ─────────────────────────────────────────
 * `clampBrandNamePatterns` / `clampBrandGuardrails` geben zurück, was gültig
 * IST — dieselbe Bauform wie `clampBrandDnaProposal` (D2c). Ein Modell, das
 * neun von zehn Zeilen richtig hat, soll neun Zeilen liefern und nicht null;
 * ob die verbleibende Menge reicht, entscheidet die Invariante
 * (`checkBrandNamePatterns`), nicht das Schema.
 */

const line = z.string().trim().min(1)

/** Eine Typ-Id aus dem Katalog — oder ihr Label (Altdaten, s. `parse…`). */
const nameType = z.string().trim().min(1).refine(
  value => BRAND_NAME_TYPES.some(term => [term.id, term.de, term.en]
    .some(candidate => candidate.toLowerCase() === value.toLowerCase())),
  { message: 'Kein Wert aus BRAND_NAME_TYPES' },
)

export const brandNamePatternSchema = z.object({
  type: nameType,
  pattern: line,
  /** Pflicht: ein Muster ohne Beispiel zeigt erst beim ersten Namen, ob es stimmt. */
  example: line,
  /** Herkunft ist Qualität, nicht Form — ein Bestandswert ohne sie bleibt gültig. */
  source: z.string().trim().default(''),
})

export type BrandNamePatternInput = z.infer<typeof brandNamePatternSchema>

export const brandNamePatternsSchema = z.array(brandNamePatternSchema).min(1)

const guardrailGroupId = z.enum(
  BRAND_GUARDRAIL_GROUPS.map(group => group.id) as [string, ...string[]],
)

export const brandGuardrailGroupSchema = z.object({
  id: guardrailGroupId,
  label: line,
  lines: z.array(line).min(1),
})

export const brandGuardrailsSchema = z.array(brandGuardrailGroupSchema).min(1)

const promptTemplateId = z.enum(
  BRAND_PROMPT_TEMPLATES.map(template => template.id) as [string, ...string[]],
)

export const brandPromptTemplateSchema = z.object({
  id: promptTemplateId,
  title: line,
  body: line,
})

export const brandPromptTemplatesSchema = z.array(brandPromptTemplateSchema).length(
  BRAND_PROMPT_TEMPLATES.length,
)

export const brandPressContactSchema = z.object({
  name: line,
  role: z.string().trim().default(''),
  email: z.string().trim().email(),
})

/** Was die Form hält — der Rest fällt weg (s. Kopf). */
export function clampBrandNamePatterns(entries: readonly unknown[]): BrandNamePatternInput[] {
  return entries
    .map(entry => brandNamePatternSchema.safeParse(entry))
    .flatMap(result => (result.success ? [result.data] : []))
}

export function clampBrandGuardrails(
  groups: readonly unknown[],
): z.infer<typeof brandGuardrailGroupSchema>[] {
  return groups
    .map(group => brandGuardrailGroupSchema.safeParse(group))
    .flatMap(result => (result.success ? [result.data] : []))
}
