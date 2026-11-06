import { createAdvisorSlotGenerator } from '../utils/advisorGenerator'
import type { BrandSlotGenerator } from '../utils/brandGenerators'
import { registerBrandSlotGenerator } from '../utils/brandGenerators'
import { MILO_PROMPT_VERSION } from '../utils/miloPrompt'
import { sessionInstructionForSlot } from '../utils/sessionPrompt'

/**
 * MILOS TECHNIK (P3.1) — Baustein C · Werte. GESPROCHEN von George
 * (Eine Stimme, 2026-09-02).
 *
 * ── NUR `values`, OBWOHL MILO ZWEI BAUSTEINE HAT ──────────────────────────
 * `brandAdvisors.ts` gibt Milo `values` UND `archetype`. Registriert wird hier
 * nur `values`. Der Grund ist seit dem 2026-09-04 ein anderer als beim Bau
 * dieser Datei: Baustein D hat seine eigenen Aufträge und seinen eigenen
 * Generator (`george-archetype.ts`), und ZWEI Registrierungen für `archetype`
 * wären eine, die die andere still überschreibt (`GENERATORS` ist eine Map).
 * Die Zuständigkeit steht deshalb je Baustein an genau einer Stelle. Das
 * Beraterteam bleibt davon unberührt: WESSEN Technik in Baustein D gilt, sagt
 * die Registry — es ist weiterhin Milos, und die Fabrik holt sie sich selbst.
 *
 * ── KEINE NACHPRÜFUNG ─────────────────────────────────────────────────────
 * Milos beide Slots (`c.candidates`, `c.definitions`) sind Listen, keine
 * Auswahlen — ihre Form trägt schon `brandSlotFormat.ts` in den Prompt, und ein
 * Beleg-Satz je Zeile lässt sich nicht mechanisch prüfen, ohne den Text zu
 * bewerten. Was hier zählt, entscheidet der Mensch beim Eingrenzen auf drei bis
 * fünf; eine Formprüfung, die ihm eine belegte Liste wegnähme, weil ein
 * Gedankenstrich fehlt, wäre teurer als der Fehler.
 *
 * ── `generator: 'candidates'` BRAUCHT KEINEN EIGENEN WEG ──────────────────
 * Die Registry unterscheidet `derive` · `draft` · `candidates`; Route und
 * Resolver fragen nur, ob überhaupt entworfen wird (`generator !== 'none'`).
 * Der Unterschied ist eine Aussage über den INHALT (eine Liste von Vorschlägen
 * statt eines Textes) und lebt deshalb im Auftrag, nicht im Protokoll — ein
 * dritter Zweig im Strom hätte nichts anderes zu übertragen.
 */

/** Milos Generator für Baustein C · Werte. */
export const miloValuesGenerator: BrandSlotGenerator = createAdvisorSlotGenerator({
  promptVersion: MILO_PROMPT_VERSION,
  instruction: sessionInstructionForSlot,
})

export default defineNitroPlugin(() => {
  registerBrandSlotGenerator('values', miloValuesGenerator)
})
