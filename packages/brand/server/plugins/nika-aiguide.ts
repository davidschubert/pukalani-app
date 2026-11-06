import type { BrandTeamKind } from '../../shared/slotRegistry'
import {
  type AdvisorSlotVerdict,
  type AdvisorSlotVerifyInput,
  advisorDependencyValue,
  createAdvisorSlotGenerator,
} from '../utils/advisorGenerator'
import type { BrandSlotGenerator } from '../utils/brandGenerators'
import { registerBrandSlotGenerator } from '../utils/brandGenerators'
import { brandVocabularyAvoidWords } from '../../shared/brandFoundation'
import { checkBrandGuardrails } from '../../shared/brandKitSlots'
import { NIKA_PROMPT_VERSION, nikaSlotInstruction } from '../utils/nikaPrompt'

/**
 * NIKAS TECHNIK (K5) — das Kapitel `aiguide` (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.3). GESPROCHEN von George (Eine Stimme,
 * 2026-09-02).
 *
 * Aufbau, Begründung und Grenzen wie im Otto-Plugin daneben: die Fabrik macht
 * den Zusammenbau, hier stehen Auftrag, Prompt-Fassung und Nachprüfung.
 *
 * ── WARUM DIE PRÜFUNG HIER MEHR WIEGT ALS ANDERSWO ────────────────────────
 * Der Wert dieser Session ist die eine Stelle des ganzen Produkts, die eine
 * MASCHINE als Regelwerk liest (`brand.md`, `brand.json`, §2.6). Ein Mensch,
 * der zwei widersprechende Zeilen liest, fragt nach; ein Agent entscheidet
 * sich stillschweigend für eine — und niemand erfährt, für welche. Deshalb
 * misst `checkBrandGuardrails` genau zwei Dinge: dass die vier Gruppen da sind
 * und dass kein verbotenes Wort im Ton steht.
 */

function isDe(locale: string): boolean {
  return locale.toLowerCase().startsWith('de')
}

/** Die Rückfrage je Verstoss — Sprache der OBERFLÄCHE (Chat, Regel 9). */
export function nikaGuardrailQuestion(
  violation: string,
  detail: string,
  uiLocale: string,
  /** Anrede der Marke (BW1-Inhaltsrunde 2026-09-09) — Vorgabe ist die Team-Fassung. */
  team: BrandTeamKind = 'team',
): string {
  const de = isDe(uiLocale)
  if (violation === 'guardrail_taboo_in_tone') {
    return de
      ? `Mir ist etwas aufgefallen, bevor ich das festhalte: „${detail}" steht auf der Meiden-Liste `
        + 'und wäre in meinen Ton-Parametern gelandet. Beides zusammen kann kein Werkzeug befolgen — '
        + 'soll das Wort aus der Meiden-Liste raus, oder bleibt es tabu?'
      : `One thing before I write this down: "${detail}" is on your avoid list and would have ended up `
        + 'in my tone parameters. No tool can follow both — should the word leave the avoid list, or '
        + 'does it stay banned?'
  }
  return de
    ? 'Für die Leitplanken fehlt mir noch eine ganze Gruppe — ich hätte da sonst eine Überschrift ohne '
      + 'Inhalt stehen, und die liest ein Werkzeug als „gibt es nicht". '
      + (team === 'solo'
        ? 'Sag mir eine Sache, die deine Marke NIE behandelt, dann steht die Liste.'
        : 'Sagt mir eine Sache, die eure Marke NIE behandelt, dann steht die Liste.')
    : 'One whole group of the guardrails is still missing — I would be left with a heading and nothing '
      + 'under it, and a tool reads that as "there are none". '
      + 'Tell me one thing your brand never talks about and the list stands.'
}

export function verifyNikaDraft(input: AdvisorSlotVerifyInput): AdvisorSlotVerdict {
  if (input.slot.id !== 'n.guardrails') return { draft: input.draft }

  /*
   * BEIDE MEIDEN-LISTEN, weil beide Sessions beide Seiten tragen: `d.vocabulary`
   * ist der Wort-Leitfaden, `ep.vocabulary` seine Alltagsfassung (die Zuordnung
   * „ep = Do, d = Don't" beschreibt die WIRKUNG, nicht das Speicherformat — s.
   * `vocabularySides` in `brandFoundation.ts`). Ein Tabu, das nur in einer der
   * beiden steht, ist genauso ein Tabu.
   */
  const avoid = [
    ...brandVocabularyAvoidWords(advisorDependencyValue(input.dependencies, 'd.vocabulary')),
    ...brandVocabularyAvoidWords(advisorDependencyValue(input.dependencies, 'ep.vocabulary')),
  ]

  const check = checkBrandGuardrails(avoid, input.draft)
  return check.ok
    ? { draft: input.draft }
    : { question: nikaGuardrailQuestion(check.violation, check.detail, input.uiLocale, input.team) }
}

/** Nikas Generator für das Kapitel `aiguide`. */
export const nikaAiguideGenerator: BrandSlotGenerator = createAdvisorSlotGenerator({
  promptVersion: NIKA_PROMPT_VERSION,
  instruction: nikaSlotInstruction,
  verify: verifyNikaDraft,
})

export default defineNitroPlugin(() => {
  registerBrandSlotGenerator('aiguide', nikaAiguideGenerator)
})
