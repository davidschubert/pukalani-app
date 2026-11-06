import { BRAND_GUARDRAIL_GROUPS, BRAND_KIT_PART_SEPARATOR } from '../../shared/brandKitSlots'
import type { BrandSlotInstructionOptions } from './georgePrompt'
import { sessionInstructionForSlot } from './sessionPrompt'

/**
 * NIKAS AUFTRAG — das Kapitel `aiguide` (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.3, Paket K5). GESPROCHEN von George (Eine
 * Stimme, 2026-09-02); Nika ist die TECHNIK dieses Kapitels
 * (`brandAdvisors.ts`: „prüft Sätze am Ohr").
 *
 * PUR, und aus demselben Grund wie `ottoPrompt.ts` daneben: an diesen Sätzen
 * hängt, ob die Leitplanken eine ZUSAMMENFASSUNG bestätigter Werte werden oder
 * ein neues Regelwerk. Genau das ist das Anti-Muster der Session, wörtlich:
 * „A guardrail invented here because it sounds sensible — the list is a
 * summary, not a new decision."
 *
 * ── WARUM DIESES KAPITEL EINEN EIGENEN FORMVERTRAG BRAUCHT ────────────────
 * Sein Wert ist die EINE Stelle, die eine MASCHINE liest: `n.guardrails` geht
 * über `brand.md` und `brand.json` in fremde Werkzeuge (§2.6). Vier Gruppen in
 * fester Reihenfolge sind deshalb keine Kosmetik — ein Agent, der „Tabus"
 * sucht und „Sprachliches" findet, überliest sie.
 *
 * ── DIE TEUERSTE INVARIANTE IST DER WIDERSPRUCH IN SICH ───────────────────
 * Ein Tabu-Wort, das in den TON-Parametern auftaucht, macht aus der Datei ein
 * Regelwerk, das sich selbst widerspricht — und zwar für einen Leser, der
 * nicht nachfragen kann. Er entscheidet sich für eine der beiden Zeilen; für
 * welche, weiss niemand. `checkBrandGuardrails` misst genau das, und der
 * Prompt sagt es vorher (eine Prüfung ohne Ansage wäre eine Falle).
 *
 * ── ENGLISCH IM KERN, INHALTSSPRACHE IM ERGEBNIS ──────────────────────────
 * Wie überall im Layer. Die GRUPPEN-ÜBERSCHRIFTEN stehen hier anders als bei
 * Otto in der INHALTSSPRACHE und nicht als Id: sie sind Überschriften im
 * Handbuch und in `brand.md`, ein Mensch liest sie. Der Leser
 * (`brandGuardrailGroupId`) erkennt sie in beiden Sprachen und an der Id — er
 * ist tolerant, damit ein von Hand korrigierter Wert seine Gruppe behält.
 */

/**
 * Fassung dieses Auftrags. Steigt, sobald sich der Formvertrag oder eine
 * Invariante inhaltlich ändert — oder der System-Prompt, mit dem er gesendet
 * wird.
 *
 * `nika-n-1` (2026-09-09, K5): erste Fassung. Vier Gruppen in fester
 * Reihenfolge, Zeilen durch ` · ` getrennt, Herkunft je Zeile, und die zwei
 * Invarianten aus `checkBrandGuardrails`.
 */
export const NIKA_PROMPT_VERSION = 'nika-n-1'

/**
 * DIE DREI SÄTZE, DIE DAS MODELL ÜBER DIE FORM BEKOMMT (Davids Inhalts-Gate,
 * §2.18 Zeile K5) — benannt, damit man sie ohne den Prompt-Bauer lesen kann.
 */
export const NIKA_GUARDRAIL_FORM_RULES: readonly string[] = [
  'Exactly four blocks, in this order and with these headings, written in the content language: '
  + 'tone parameters, taboos, brand mark spellings, no-go topics. No fifth block, none left out.',
  `The body of a block is ONE line whose entries are separated by "${BRAND_KIT_PART_SEPARATOR.trim()}" — `
  + 'one entry per rule, never a paragraph.',
  'Every entry ends with its source, written as an em dash and a short phrase: '
  + 'the tone word, the avoid list, the value or the naming rule it comes from. '
  + 'An entry without a source is not a guardrail, it is an opinion.',
]

export const NIKA_GUARDRAIL_INVARIANTS: readonly string[] = [
  'All four groups must be present — a machine that looks for taboos and finds nothing assumes '
  + 'there are none.',
  'No word from the avoid lists may appear in the tone parameters. A file that bans a word and '
  + 'then asks for that tone contradicts itself, and its reader cannot ask which line wins.',
  'Nothing new is decided here. Every line restates something already confirmed above; if a group '
  + 'has no confirmed source at all, say so in your turn and ask ONE question.',
]

function guardrailContract(contentLocale: string | undefined): string[] {
  const de = (contentLocale ?? 'en').toLowerCase().startsWith('de')
  const headings = BRAND_GUARDRAIL_GROUPS
    .map(group => `  ${group.id} -> "${de ? group.de : group.en}"`)
  return [
    '',
    'THE SHAPE OF THE VALUE (this is checked before your draft is accepted):',
    ...NIKA_GUARDRAIL_FORM_RULES.map(rule => `- ${rule}`),
    'The four headings, in this order and exactly in these words:',
    ...headings,
    'What is checked:',
    ...NIKA_GUARDRAIL_INVARIANTS.map(rule => `- ${rule}`),
    'A brand without its own naming rules gets its spellings from the brand title and the tagline — '
    + 'that group is never empty for that reason alone.',
  ]
}

/**
 * DIE ANWEISUNG FÜR EINE SESSION DES KAPITELS.
 *
 * Nur `n.guardrails` bekommt einen Zusatz. `n.scope` und `n.review` sind
 * Katalog-Wahlen ohne Generator, `n.prompts` wird PUR gerechnet (§2.11: null
 * KI-Aufrufe) — alle drei erreichen diesen Bauer nicht.
 */
export function nikaSlotInstruction(slotId: string, options: BrandSlotInstructionOptions): string {
  const base = sessionInstructionForSlot(slotId, options)
  if (slotId !== 'n.guardrails') return base
  return [base, ...guardrailContract(options.contentLocale)].join('\n')
}
