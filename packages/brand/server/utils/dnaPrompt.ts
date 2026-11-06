import { BRAND_DNA_DIMENSION_IDS } from '../../shared/brandDesignVocab'
import {
  BRAND_DNA_INSPIRATION_REASON_MAX,
  BRAND_DNA_REASON_MAX,
} from '../../shared/brandDesignDna'
import { brandReadingVocabLines } from '../../shared/brandReading'

/**
 * DER AUFTRAG DES DNA-VORSCHLAGS (Brand Design D2c, docs/archiv/BRAND-DESIGN.md
 * §2.2 Schritt 4).
 *
 * PUR: keine Fetches, kein H3Event, kein Appwrite, kein i18n. Dieselbe
 * Begründung wie bei `readingPrompt.ts` und `reviewPrompt.ts` — an diesen
 * Sätzen hängt, ob aus der Foundation eine ABLEITUNG wird oder eine
 * Geschmacksliste, und ein Prompt, den man nur mit einem Anbieter-Schlüssel
 * ansehen kann, liest niemand gegen.
 *
 * ── DIE FOUNDATION IST DER MASSSTAB, DIE LESUNGEN SIND BELEGE ─────────────
 * Leitplanke (b) aus §2.2, hier ein zweites Mal: die Foundation steht VOR den
 * Lesungen und wird ausdrücklich als Massstab benannt. Der Unterschied zur
 * Lesung (D2b) ist die Richtung — dort wurde ein fremdes Bild an der
 * Foundation gemessen, hier wird aus der Foundation ein Vorschlag ABGELEITET.
 * Die Lesungen sind dabei Belege, nie ein Ziel: eine Zeile, die nur sagt
 * „so wie in Vorbild 2", hat die Foundation gar nicht angefasst.
 *
 * ── DIE BEGRÜNDUNG IST DAS PRODUKT, NICHT DER WERT ────────────────────────
 * Zehn Werte kann man würfeln. Was der Kunde kauft, ist der Satz daneben —
 * deshalb ist `reason` PFLICHT, muss eine STELLE der Foundation nennen
 * (Archetyp, ein Wert, ein Ton-Wort, die Positionierung) und darf den Wert
 * nicht bloss in anderen Worten wiederholen. Eine Zeile ohne Begründung wirft
 * die Klemmung weg (`clampBrandDnaProposal`); der Prompt sagt das
 * ausdrücklich, weil eine stillschweigend verworfene Antwort teurer ist als
 * eine erklärte.
 *
 * ── `inspiration` ALS HERKUNFT GIBT ES NICHT ──────────────────────────────
 * Erlaubt sind `foundation` und `both`, und `both` NUR mit einem Satz, der die
 * Vorbild-NUMMER nennt. Die Id `inspiration` steht zwar im Vokabular (ein
 * späterer Leser muss sie kennen, s. Kopf von `brandDesignDna.ts`), aber sie
 * wäre eine Zeile ohne Foundation-Bezug — und die gibt es hier nicht.
 *
 * ── OHNE VORBILDER FÄLLT DER ABSCHNITT WEG ────────────────────────────────
 * Auf dem Weg „Frida schlägt vor" gibt es keine Lesungen. Der Prompt sagt dann
 * ausdrücklich, dass es keine gibt und dass jede Zeile `foundation` ist —
 * sonst erfindet ein Modell die Vorbilder, auf die es sich beziehen soll. Die
 * Klemmung fängt es ein zweites Mal ab; hier steht die billigere Sicherung.
 *
 * ── ENGLISCH IM KERN, INHALTSSPRACHE IM ERGEBNIS ──────────────────────────
 * Der Auftrag ist englisch (sprachneutraler Kern wie überall in diesem Layer),
 * `reason` und `inspirationReason` stehen in der Inhaltssprache der Marke: der
 * Kunde liest sie, und das Brand-Dokument ist einsprachig.
 */

export const BRAND_DNA_SYSTEM_PROMPT
  = 'You are a brand designer deriving a visual DNA from a client\'s written brand foundation. '
    + 'You do not invent a look you like — you derive one, and for every single line you name the '
    + 'place in the foundation it follows from. You describe strictly in the ids of a controlled '
    + 'visual vocabulary. '
    + 'You answer with JSON only. No prose, no markdown fences.'

/** Eine Lesung als Beleg: was darin gesehen wurde und wie sie beurteilt war. */
export interface BrandDnaPromptReading {
  /** Die Nummer, unter der der Kunde das Vorbild kennt („Vorbild 3"). */
  readonly number: number
  /** Der Bereich, für den es steht (Vokabular-Id + Lesefassung). */
  readonly area: string
  /** `fits` / `tension` / `off` — die Lesefassung steht daneben. */
  readonly verdict: string
  /** Die Foundation-Stelle, an der D2b gemessen hat. */
  readonly anchor: string
  readonly reason: string
  readonly suggestion?: string
  /** Die belegten Dimensionen dieses Vorbilds — Ids aus dem Vokabular. */
  readonly observed: readonly { readonly dimension: string, readonly value: string }[]
}

export interface BrandDnaPromptInput {
  /** Die Inhaltssprache der Marke — in ihr stehen `reason` und `inspirationReason`. */
  readonly contentLocale: string
  /** Die Foundation-Blöcke: Beschriftung und bestätigter Wert. */
  readonly foundation: readonly { readonly label: string, readonly value: string }[]
  /** Leer heisst „ohne Vorbilder" — dann entfällt der ganze Abschnitt. */
  readonly readings: readonly BrandDnaPromptReading[]
}

function readingLine(reading: BrandDnaPromptReading): string {
  const observed = reading.observed.length
    ? reading.observed.map(entry => `${entry.dimension}=${entry.value}`).join(', ')
    : '(nothing recorded)'
  const suggestion = reading.suggestion ? ` · suggestion: ${reading.suggestion}` : ''
  return `- reference ${reading.number} · area: ${reading.area} · verdict: ${reading.verdict}`
    + ` · measured against: ${reading.anchor} · observed: ${observed}`
    + ` · reading: ${reading.reason}${suggestion}`
}

export function brandDnaPrompt(input: BrandDnaPromptInput): string {
  const language = input.contentLocale.toLowerCase().startsWith('de') ? 'German' : 'English'
  const hasInspiration = input.readings.length > 0
  const foundation = input.foundation.length
    ? input.foundation.map(block => `### ${block.label}\n${block.value}`).join('\n\n')
    : '(no confirmed foundation values available)'
  const vocabulary = brandReadingVocabLines(input.contentLocale)
    .map(line => `- ${line}`).join('\n')

  /**
   * DER VORBILD-ABSCHNITT ODER SEIN AUSDRÜCKLICHES FEHLEN — nie beides und nie
   * keines von beidem: „nichts gesagt" liest ein Modell als „such dir etwas".
   */
  const inspirationBlock = hasInspiration
    ? [
        'REFERENCE READINGS (evidence, not a target)',
        'These are readings of images the client uploaded, already measured against the foundation '
        + 'above. Use them as corroboration or as a corrective — never as the source of a line.',
        input.readings.map(readingLine).join('\n'),
        '',
      ]
    : [
        'REFERENCE READINGS',
        'There are none. The client did not upload any references, so every line has '
        + 'origin "foundation" and no inspirationReason. Do not invent references and do not '
        + 'mention any.',
        '',
      ]

  const originRule = hasInspiration
    ? [
        '- origin: "foundation" (the line follows from the foundation alone) or "both" (the '
        + 'foundation plus one of the readings above). "inspiration" is NOT allowed: the '
        + 'foundation is always the basis, and a line without a foundation reason is discarded.',
        `- inspirationReason: ONLY with origin "both", and it names the reference NUMBER `
        + `(for example "as in reference 3, but warmer") — max `
        + `${BRAND_DNA_INSPIRATION_REASON_MAX} characters. "both" without it is downgraded to `
        + '"foundation".'
        // DER KUNDE KENNT SEIN BILD ALS „VORBILD 3" (echter Lauf 2026-09-08: das
        // Modell schrieb auf Deutsch „wie in reference 1") — das Etikett der
        // Liste ist die interne Sprache des Prompts, der Satz gehört in die
        // Sprache des Kunden.
        + (language === 'German'
          ? ' In the German text, call a reference „Vorbild N" (for example „wie in Vorbild 3, aber wärmer"), never "reference".'
          : ''),
      ]
    : [
        '- origin: always "foundation". "both" and "inspiration" are not allowed here — there are '
        + 'no references.',
        '- inspirationReason: leave it out entirely.',
      ]

  return [
    'TASK',
    'Derive a visual brand DNA for this client: exactly one line for each of the ten dimensions '
    + 'below. The foundation is the yardstick — the readings are evidence, not a target. '
    + 'Never copy: do not name brands, fonts, colour values or products, and do not reproduce a '
    + 'design you recognise from the references. Describe only in vocabulary ids.',
    '',
    'BRAND FOUNDATION (the yardstick)',
    foundation,
    '',
    ...inspirationBlock,
    'VISUAL DNA VOCABULARY (dimension id: allowed value ids)',
    vocabulary,
    '',
    'FOR EVERY DIMENSION',
    '- dimension: the dimension id, exactly as listed above.',
    '- value: one value id from THAT dimension. Entries with invented ids are discarded.',
    `- reason: MANDATORY. Name the PLACE in the foundation the line follows from (the archetype, `
    + `one of the values, a tone word, the positioning) and say what it means for this dimension `
    + `— max ${BRAND_DNA_REASON_MAX} characters. A reason that only restates the value in other `
    + 'words is not a reason. A line without a reason is discarded.',
    ...originRule,
    '',
    `LANGUAGE: write reason and inspirationReason in ${language}. Ids stay as they are.`,
    '',
    'DIMENSIONS (in this order)',
    BRAND_DNA_DIMENSION_IDS.join(', '),
    '',
    'ANSWER FORMAT (JSON only)',
    '{"dna":[{"dimension":"<dimension id>","value":"<value id>",'
    + '"origin":"foundation|both","reason":"<text>","inspirationReason":"<text>"}]}',
    `Return exactly ten entries, one per dimension, in the order listed above.`,
  ].join('\n')
}
