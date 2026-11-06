import type { BrandTeamKind } from '../../shared/slotRegistry'
import {
  type AdvisorSlotVerdict,
  type AdvisorSlotVerifyInput,
  advisorDependencyValue,
  createAdvisorSlotGenerator,
} from '../utils/advisorGenerator'
import type { BrandSlotGenerator } from '../utils/brandGenerators'
import { registerBrandSlotGenerator } from '../utils/brandGenerators'
import { brandListEntries } from '../../shared/brandSessions'
import { checkBrandNamePatterns } from '../../shared/brandKitSlots'
import { BRAND_NAME_TYPES } from '../../shared/brandKitVocab'
import { OTTO_PROMPT_VERSION, ottoSlotInstruction } from '../utils/ottoPrompt'

/**
 * OTTOS TECHNIK (K5) — das Kapitel `nomenclature` (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.2). GESPROCHEN von George (Eine Stimme,
 * 2026-09-02).
 *
 * ── DIE ANMELDUNG, MEHR NICHT ─────────────────────────────────────────────
 * Der Zusammenbau liegt in `createAdvisorSlotGenerator` und ist für George,
 * Vera, Milo und jetzt Otto WÖRTLICH derselbe — mit denselben
 * Datenschutz-Bedingungen, demselben Strom-Putzer und derselben Regel, dass
 * ein Anbieter-Fehler ungefangen durchfliegt. Was hier steht, ist, was
 * WIRKLICH dieses Kapitel ist: sein Auftrag (`ottoPrompt.ts`), seine
 * Prompt-Fassung und seine Nachprüfung.
 *
 * ── EIN AUFRUF, KEIN WILDCARD ─────────────────────────────────────────────
 * `'*'` finge auch jeden künftigen Baustein ein und scheiterte dort mit
 * „Unbekannte Session"; der Dev-Stub und `no_generator` sind die richtigen
 * Antworten für ein Kapitel ohne Auftrag. Dieselbe Entscheidung wie im
 * Vera-Plugin.
 *
 * ── DIE NACHPRÜFUNG MISST GEGEN EIN ANDERES FELD ──────────────────────────
 * `m.patterns` ist der erste Entwurf im Layer, dessen Gültigkeit nicht aus
 * sich selbst folgt: er stimmt oder stimmt nicht IM VERHÄLTNIS zu den
 * gewählten Typen (`m.types`). Deshalb reicht die Fabrik seit K5 die
 * Quell-Slots durch — dieselbe Liste, die eine Sekunde vorher in den Prompt
 * ging, und nicht ein zweiter Datenbank-Blick mit der Chance auf einen
 * anderen Stand.
 *
 * ── VERSTOSS HEISST RÜCKFRAGE, NIE „STILL VERWERFEN" ──────────────────────
 * Dieselbe Entscheidung wie bei der Auswahl-Nachprüfung (`verifyBrandChoiceSlot`):
 * ein Feldwert, der seinen Vertrag verfehlt, ist im Brand-Dokument nicht mehr
 * von einem gültigen zu unterscheiden. Und ein Modell, das die Typen verfehlt,
 * hatte in aller Regel zu wenig Material — genau dafür gibt es
 * `outcome: 'question'`. Der Satz ist RUHIG und nennt den Grund beim Namen
 * (wie `brandChoiceFallbackQuestion`), er beschuldigt niemanden.
 */

function isDe(locale: string): boolean {
  return locale.toLowerCase().startsWith('de')
}

/**
 * DIE TYP-ID WIRD ZUR LESEFASSUNG — die Rückfrage ist CHAT.
 *
 * Ohne diese Zeile stünde in der Sprechblase „Für ‚place' habe ich noch kein
 * Muster": derselbe Live-Fund wie am 2026-09-04 bei der rohen Archetyp-Id
 * (`swapBrandChoiceValueLine`). Unbekanntes bleibt, wie es kam.
 */
function typeLabel(value: string, uiLocale: string): string {
  const needle = value.trim().toLowerCase()
  const term = BRAND_NAME_TYPES.find(entry => entry.id.toLowerCase() === needle
    || entry.de.toLowerCase() === needle
    || entry.en.toLowerCase() === needle)
  if (!term) return value.trim()
  return isDe(uiLocale) ? term.de : term.en
}

/** Die Rückfrage je Verstoss — Sprache der OBERFLÄCHE (Chat, Regel 9). */
export function ottoPatternQuestion(
  violation: string,
  detail: string,
  uiLocale: string,
  /** Anrede der Marke (BW1-Inhaltsrunde 2026-09-09) — Vorgabe ist die Team-Fassung. */
  team: BrandTeamKind = 'team',
): string {
  const de = isDe(uiLocale)
  const label = typeLabel(detail, uiLocale)
  if (violation === 'pattern_missing') {
    return de
      ? `Für „${label}" habe ich noch kein Muster, das ich verantworten kann. `
        + (team === 'solo'
          ? 'Nenn mir einen Namen, den du in dieser Sorte schon vergeben hast oder vergeben würdest — '
          : 'Nennt mir einen Namen, den ihr in dieser Sorte schon vergeben habt oder vergeben würdet — ')
        + 'daraus wird die Regel.'
      : `I have no pattern for "${label}" that I would stand behind yet. `
        + 'Give me one name you have already used in that kind — or would use — and the rule follows from it.'
  }
  if (violation === 'pattern_duplicate_type') {
    return de
      ? `Ich habe für „${label}" zwei Muster geschrieben, und damit weiss niemand, welches gilt. `
        + 'Welches der beiden soll es sein?'
      : `I wrote two patterns for "${label}", so nobody could tell which one applies. `
        + 'Which of the two should it be?'
  }
  if (violation === 'pattern_stray_type') {
    return de
      ? `Ich hatte ein Muster für „${label}" dabei — das steht aber nicht in der Auswahl. `
        + 'Gehört die Sorte doch dazu, oder lasse ich sie weg?'
      : `I had a pattern for "${label}", but that kind is not in your selection. `
        + 'Does it belong after all, or shall I leave it out?'
  }
  return de
    ? `Zum Muster für „${label}" fehlt mir ein Beispielname — ohne ihn zeigt sich erst beim ersten `
      + 'echten Namen, ob die Regel trägt. Wie würde so ein Name heissen?'
    : `The pattern for "${label}" has no example name — without one, the rule only proves itself on `
      + 'the first real name. What would such a name be?'
}

export function verifyOttoDraft(input: AdvisorSlotVerifyInput): AdvisorSlotVerdict {
  if (input.slot.id !== 'm.patterns') return { draft: input.draft }

  // Die gewählten Typen stehen als Listen-Wert (`formatBrandSlotList`); die
  // tolerante Lesart des Layers ist hier richtig, weil ein Mensch sie im
  // Chips-Feld auch in eine Zeile tippen darf.
  const types = brandListEntries(advisorDependencyValue(input.dependencies, 'm.types'))
  // OHNE TYPEN WIRD NICHT GEPRÜFT: das Bereitschafts-Gate hat diesen Lauf gar
  // nicht erst zugelassen (`name_types`), und eine Prüfung gegen eine leere
  // Menge verwürfe jedes Muster — für einen Zustand, der hier nicht vorkommen
  // kann und den ein Verstoss falsch beschriebe.
  if (types.length === 0) return { draft: input.draft }

  const check = checkBrandNamePatterns(types, input.draft)
  return check.ok
    ? { draft: input.draft }
    : { question: ottoPatternQuestion(check.violation, check.detail, input.uiLocale, input.team) }
}

/** Ottos Generator für das Kapitel `nomenclature`. */
export const ottoNomenclatureGenerator: BrandSlotGenerator = createAdvisorSlotGenerator({
  promptVersion: OTTO_PROMPT_VERSION,
  instruction: ottoSlotInstruction,
  verify: verifyOttoDraft,
})

export default defineNitroPlugin(() => {
  registerBrandSlotGenerator('nomenclature', ottoNomenclatureGenerator)
})
