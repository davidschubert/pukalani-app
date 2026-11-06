import { BRAND_KIT_PART_SEPARATOR } from '../../shared/brandKitSlots'
import { BRAND_NAME_TYPES } from '../../shared/brandKitVocab'
import type { BrandSlotInstructionOptions } from './georgePrompt'
import { sessionInstructionForSlot } from './sessionPrompt'

/**
 * OTTOS AUFTRAG — das Kapitel `nomenclature` (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.2, Paket K5). GESPROCHEN von George (Eine
 * Stimme, 2026-09-02); Otto ist die TECHNIK dieses Kapitels
 * (`brandAdvisors.ts`: „erst überleben, dann gefallen").
 *
 * PUR: keine Fetches, kein H3Event, kein Appwrite, kein i18n. Dieselbe
 * Begründung wie bei `dnaPrompt.ts` — an diesen Sätzen hängt, ob aus der
 * Foundation eine ABLEITUNG wird oder eine Namensliste, und einen Prompt, den
 * man nur mit einem Anbieter-Schlüssel ansehen kann, liest niemand gegen.
 *
 * ── ER ERSETZT DIE SESSION-ANWEISUNG NICHT, ER ERGÄNZT SIE ────────────────
 * Ziel, Qualitätsmerkmale, Anti-Muster, Beispiele und Leiter stehen in
 * `shared/sessionContent.ts` und werden von EINEM Bauer gesetzt
 * (`sessionInstructionForSlot`, BW2 Paket 1). Diese Datei hängt genau das an,
 * was der generische Bauer NICHT wissen kann: die INNERE Form des Wertes
 * (`brandKitSlots.ts`) und die Invarianten, an denen der Entwurf gleich
 * gemessen wird. Zwei Fassungen der Ziele wären zwei Meinungen über dasselbe
 * Kapitel; der Bauer bleibt die eine.
 *
 * ── DIE FORM STEHT IM PROMPT, WEIL SIE GEPRÜFT WIRD ───────────────────────
 * `verifyOttoDraft` misst den Entwurf gegen `checkBrandNamePatterns`. Eine
 * Prüfung ohne Ansage ist eine Falle: das Modell bekäme eine Rückfrage für
 * eine Regel, die es nie gelesen hat, und der Mensch bezahlte den Lauf.
 * Deshalb steht hier WÖRTLICH, was gleich gemessen wird — dieselbe
 * Arbeitsteilung wie bei `brandChoicePromptRule`.
 *
 * ── ENGLISCH IM KERN, INHALTSSPRACHE IM ERGEBNIS ──────────────────────────
 * Der Auftrag ist englisch (sprachneutraler Kern wie überall in diesem Layer);
 * Muster, Beispiel und Herkunft stehen in der Inhaltssprache der Marke — sie
 * landen unverändert im Handbuch und in `brand.md`. Die BLOCK-ÜBERSCHRIFT ist
 * die Typ-ID aus dem Katalog: sie ist der Schlüssel, an dem der Leser die
 * Zeile ihrem Typ zuordnet, und ein übersetzter Schlüssel wäre bei der
 * nächsten Sprachwahl ein anderer.
 */

/**
 * Fassung dieses Auftrags. Steigt, sobald sich der Formvertrag oder eine
 * Invariante inhaltlich ändert — oder der System-Prompt, mit dem er gesendet
 * wird.
 *
 * `otto-m-1` (2026-09-09, K5): erste Fassung. Sie bringt den Formvertrag für
 * `m.patterns` (ein Block je gewähltem Typ, drei Teile durch ` · `) und die
 * drei Invarianten, die `checkBrandNamePatterns` gleich danach misst.
 */
export const OTTO_PROMPT_VERSION = 'otto-m-1'

/**
 * DIE DREI SÄTZE, DIE DAS MODELL ÜBER DIE FORM BEKOMMT (Davids Inhalts-Gate,
 * §2.18 Zeile K5).
 *
 * Sie stehen als benannte Konstanten und nicht als Zeilen im Rumpf, weil genau
 * sie gegengelesen werden: was ein Mensch freigibt, muss man ohne den
 * Prompt-Bauer lesen können.
 */
export const OTTO_PATTERN_FORM_RULES: readonly string[] = [
  'One block per chosen name type, and nothing else: the heading line is the type ID exactly as it '
  + 'appears in the chosen types below — not its translation, not a sentence.',
  `The body of a block is ONE line with exactly three parts separated by "${BRAND_KIT_PART_SEPARATOR.trim()}": `
  + 'the PATTERN (a rule someone else could apply tomorrow), one EXAMPLE name that obeys it, and the '
  + 'SOURCE — the place in their foundation the pattern follows from.',
  'Write the source as a short phrase that NAMES the place it comes from — the architecture model, '
  + 'the naming rule, the decided brand name or one tone word. In the content language, never a '
  + 'field id, never the bare word "foundation".',
]

/**
 * DIE INVARIANTEN, WÖRTLICH — dieselben drei, die `checkBrandNamePatterns`
 * misst (die vierte, das fehlende Beispiel, steckt schon im Formvertrag).
 */
export const OTTO_PATTERN_INVARIANTS: readonly string[] = [
  'Exactly one pattern per chosen type — a type without a pattern makes the table lie about a '
  + 'decision the client has taken.',
  'No pattern for a type they did NOT choose — that would be an invented decision.',
  'Never two patterns for the same type: nobody could tell which one applies.',
]

function patternContract(): string[] {
  const types = BRAND_NAME_TYPES.map(term => `  ${term.id} = ${term.en} — ${term.noteEn}`)
  return [
    '',
    'THE SHAPE OF THE VALUE (this is checked before your draft is accepted):',
    ...OTTO_PATTERN_FORM_RULES.map(rule => `- ${rule}`),
    'The type IDs of the catalogue — the heading is one of these and nothing else:',
    ...types,
    'What is checked:',
    ...OTTO_PATTERN_INVARIANTS.map(rule => `- ${rule}`),
    'If you cannot honour all of this from the inputs, ask ONE question instead of guessing.',
  ]
}

/**
 * DIE ANWEISUNG FÜR EINE SESSION DES KAPITELS — die Form, in der die
 * Generator-Naht sie erwartet (`AdvisorSlotGeneratorOptions.instruction`).
 *
 * Nur `m.patterns` bekommt einen Zusatz; `m.types` und `m.rules` stehen auf
 * `generator: 'none'` und erreichen diesen Bauer gar nicht (die Route weist
 * sie mit `slot_not_generated` ab, `sessionInstruction` würde ausserdem
 * werfen). Der Zweig steht trotzdem als `switch`-loses `if`: er sagt, dass
 * die Ergänzung an EINEM Slot hängt und nicht am Kapitel.
 */
export function ottoSlotInstruction(slotId: string, options: BrandSlotInstructionOptions): string {
  const base = sessionInstructionForSlot(slotId, options)
  if (slotId !== 'm.patterns') return base
  return [base, ...patternContract()].join('\n')
}
