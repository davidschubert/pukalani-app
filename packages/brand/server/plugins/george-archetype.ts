import { ARCHETYPE_PROMPT_VERSION } from '../utils/archetypePrompt'
import { createAdvisorSlotGenerator, verifyBrandChoiceSlot } from '../utils/advisorGenerator'
import type { BrandSlotGenerator } from '../utils/brandGenerators'
import { registerBrandSlotGenerator } from '../utils/brandGenerators'
import { sessionInstructionForSlot } from '../utils/sessionPrompt'

/**
 * DER GENERATOR DES BAUSTEINS D — Archetyp & Stimme (Content-Spec §7 + §12).
 * GESPROCHEN von George (Eine Stimme, 2026-09-02), mit MILOS Technik: die
 * Registry (`brandAdvisors.ts`) gibt ihm `values` UND `archetype`, und die
 * Fabrik fragt genau sie. Diese Datei muss deshalb nichts über Personen sagen,
 * nur über Zuständigkeit — der Dateiname nennt den Sprecher, nicht die Technik.
 *
 * ── ER SCHLIESST DIE LETZTE LÜCKE DER REGISTRY ────────────────────────────
 * Bis heute war `archetype` der einzige Baustein mit entwerfbaren Slots und
 * ohne Generator: `resolveBrandSlotGenerator('archetype')` gab `null`, und
 * „George, entwirf das" endete mit `no_generator`. Der Hinweis, den die
 * Werkstatt dann zeigt („schreib es selbst"), ist hier keine Alternative — die
 * sieben Slots dieses Bausteins stehen auf `editor: 'none'`, es gibt gar kein
 * Feld dafür.
 *
 * ── DIE NACHPRÜFUNG IST DIE ALLGEMEINE ────────────────────────────────────
 * `d.primary` und `d.secondary` sind `choice`-Slots mit geschlossenem Vertrag
 * (die zwölf Archetypen, Spec §12.1). Ein dreizehnter, erfundener Archetyp
 * erzeugt keinen sichtbaren Fehler — er erzeugt einen Wert, den im
 * Brand-Dokument niemand mehr von einem echten unterscheidet, und auf dem
 * hinterher Manifest, Taglines und die Themes-Richtung aufbauen. Deshalb
 * dieselbe Prüfung wie in B2: gegen den geteilten Vertrag, normalisiert auf die
 * stabile Id, und aus einem Verstoss wird eine RÜCKFRAGE statt eines kaputten
 * Entwurfs. Sie liegt seit dem 2026-09-04 in der Fabrik und nicht mehr im
 * Vera-Plugin — zwei Kopien wären zwei Chancen, dass eine Sicherung fehlt.
 *
 * Die fünf anderen Slots haben keinen Vertrag und gehen unangetastet durch;
 * ihre Form trägt `brandSlotFormat.ts` in den Prompt.
 *
 * ── INTERIM (Davids Entscheidung 2026-09-04) ──────────────────────────────
 * `d.primary`/`d.secondary` werden laut Spec §12.2 aus dem
 * Paarvergleich-Instrument BERECHNET. Das Instrument kommt später; bis dahin
 * leitet George sie im GESPRÄCH her (Vorschlag + Antwort-Chips + Bestätigung
 * durch den Menschen). Das ändert die AUFTRÄGE (`archetypePrompt.ts`), nicht
 * diese Naht: kommt das Instrument, wechselt dort der Weg zum Wert, und die
 * gespeicherten Ids bleiben kompatibel.
 */

/** Der Generator für Baustein D · Archetyp & Stimme. */
export const georgeArchetypeGenerator: BrandSlotGenerator = createAdvisorSlotGenerator({
  promptVersion: ARCHETYPE_PROMPT_VERSION,
  instruction: sessionInstructionForSlot,
  verify: verifyBrandChoiceSlot,
})

export default defineNitroPlugin(() => {
  registerBrandSlotGenerator('archetype', georgeArchetypeGenerator)
})
