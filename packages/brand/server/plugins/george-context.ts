import { createAdvisorSlotGenerator } from '../utils/advisorGenerator'
import type { BrandSlotGenerator } from '../utils/brandGenerators'
import { registerBrandSlotGenerator } from '../utils/brandGenerators'
import { GEORGE_PROMPT_VERSION } from '../utils/georgePrompt'
import { sessionInstructionForSlot } from '../utils/sessionPrompt'

/**
 * DER ECHTE GEORGE FÜR BAUSTEIN A (P2.2) — die Registrierung an der Naht aus
 * P1c, ohne eine Zeile in der Route.
 *
 * ── SEIT P3.1 IST DAS HIER NUR NOCH DIE ANMELDUNG ─────────────────────────
 * Der Zusammenbau (Prompt holen, Transport rufen, Ergebnis übersetzen) liegt in
 * `createAdvisorSlotGenerator` und ist damit für George, Vera und Milo
 * WÖRTLICH derselbe. Das ist kein Aufräumen um seiner selbst willen: in diesem
 * Ablauf stecken die Datenschutz-Bedingungen des Anbieters, der Strom-Putzer
 * und die Regel, dass ein Anbieter-Fehler ungefangen durchfliegt — drei Kopien
 * davon wären drei Chancen, dass eine Sicherung fehlt, ohne dass man es dem
 * Ergebnis ansieht. Was hier bleibt, ist, was WIRKLICH George ist: seine
 * Aufträge und seine Prompt-Fassung.
 *
 * Georges Aufträge kennen keine Nachprüfung des Feldwerts (`verify`) — Baustein
 * A hat keinen Auswahl-Slot, den George entwirft. Das Verhalten ist damit
 * unverändert.
 */

/** Georges Generator für Baustein A · Kontext. */
export const georgeContextGenerator: BrandSlotGenerator = createAdvisorSlotGenerator({
  promptVersion: GEORGE_PROMPT_VERSION,
  instruction: sessionInstructionForSlot,
})

export { georgeMaxTokens } from '../utils/advisorGenerator'

export default defineNitroPlugin(() => {
  registerBrandSlotGenerator('context', georgeContextGenerator)
})
