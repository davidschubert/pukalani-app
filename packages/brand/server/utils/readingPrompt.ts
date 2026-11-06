import {
  BRAND_READING_ANCHOR_MAX,
  BRAND_READING_OBSERVATIONS_MAX,
  BRAND_READING_REASON_MAX,
  BRAND_READING_SUGGESTION_MAX,
  BRAND_READING_SUMMARY_LINE_MAX,
  BRAND_READING_SUMMARY_MAX,
  brandReadingVocabLines,
} from '../../shared/brandReading'

/**
 * DER AUFTRAG DER LESUNG (Brand Design D2b, docs/archiv/BRAND-DESIGN.md §2.2
 * Schritt 3).
 *
 * PUR: keine Fetches, kein H3Event, kein Appwrite, kein i18n. Dieselbe
 * Begründung wie bei `reviewPrompt.ts` — an diesen Sätzen hängt, ob die
 * Lesung eine DNA-Belegung oder ein Geschmacksurteil wird, und ein Prompt, den
 * man nur mit einem Anbieter-Schlüssel ansehen kann, liest niemand gegen.
 *
 * ── DIE FOUNDATION IST DER MASSSTAB, NICHT DAS BILD ───────────────────────
 * Der Prompt stellt die Foundation VOR die Bilder und verlangt zu JEDEM Urteil
 * die Stelle, an der gemessen wurde (`anchor`). Das ist Leitplanke (b) aus
 * §2.2, und es ist die einzige Vorkehrung gegen den Normalfall eines
 * Bildmodells: „sieht gut aus" zu sagen. Ein Urteil ohne Anker wirft die
 * Klemmung weg (`clampBrandReadings`) — der Prompt sagt das ausdrücklich, weil
 * eine stillschweigend verworfene Antwort teurer ist als eine erklärte.
 *
 * ── LESEN, NIE NACHBAUEN ──────────────────────────────────────────────────
 * Leitplanke (a): die Bilder sind FREMDWERKE. Der Auftrag verbietet deshalb
 * ausdrücklich, Marken, Schriftnamen oder Farbwerte aus den Bildern zu
 * benennen oder ihre Gestaltung zu rekonstruieren — beschrieben wird
 * ausschliesslich in den Ids des Vokabulars.
 *
 * ── ENGLISCH IM KERN, INHALTSSPRACHE IM ERGEBNIS ──────────────────────────
 * Der Auftrag ist englisch (sprachneutraler Kern wie überall in diesem Layer),
 * die ANTWORT-TEXTE stehen in der Inhaltssprache der Marke: der Kunde liest
 * sie, und das Brand-Dokument ist einsprachig.
 */

export const BRAND_READING_SYSTEM_PROMPT
  = 'You are a brand designer reading reference images for a client. '
    + 'You describe what you see strictly in the terms of a controlled visual vocabulary, '
    + 'and you judge every image against the client\'s written brand foundation — never against taste. '
    + 'You answer with JSON only. No prose, no markdown fences.'

export interface BrandReadingPromptImage {
  /** Die Datei-Id — sie MUSS in der Antwort als `id` zurückkommen. */
  readonly id: string
  /** Die Nummer, unter der der Kunde das Bild kennt („Vorbild 3"). */
  readonly number: number
  /** Der Bereich, für den das Bild steht (Vokabular-Id + Lesefassung). */
  readonly area: string
  /** Der Satz des Kunden, warum es ihm gefällt — oder leer. */
  readonly note: string
}

export interface BrandReadingPromptInput {
  /** Die Inhaltssprache der Marke — in ihr stehen `anchor`, `reason`, `summary`. */
  readonly contentLocale: string
  /** Die Foundation-Blöcke: Beschriftung und bestätigter Wert. */
  readonly foundation: readonly { readonly label: string, readonly value: string }[]
  readonly images: readonly BrandReadingPromptImage[]
}

/** Die Beschriftung, die im Zug VOR dem Bild steht (`aiVision`-Label). */
export function brandReadingImageLabel(image: BrandReadingPromptImage): string {
  const note = image.note ? ` — note: ${image.note}` : ''
  return `IMAGE id="${image.id}" (reference ${image.number}, area: ${image.area})${note}`
}

export function brandReadingPrompt(input: BrandReadingPromptInput): string {
  const language = input.contentLocale.toLowerCase().startsWith('de') ? 'German' : 'English'
  const foundation = input.foundation.length
    ? input.foundation.map(block => `### ${block.label}\n${block.value}`).join('\n\n')
    : '(no confirmed foundation values available)'
  const vocabulary = brandReadingVocabLines(input.contentLocale)
    .map(line => `- ${line}`).join('\n')
  const images = input.images
    .map(image => `- id="${image.id}" · reference ${image.number} · area: ${image.area}`)
    .join('\n')

  return [
    'TASK',
    `Read ${input.images.length} reference image(s) the client uploaded and measure each one against `
    + 'their brand foundation. The foundation is the yardstick — the images are evidence, not a target. '
    + 'Never copy: do not name brands, fonts, colour values or products you recognise, and do not '
    + 'describe how to rebuild the design. Describe only in vocabulary ids.'
    // Siehe dnaPrompt.ts: das Listen-Etikett „reference N" ist Prompt-Sprache,
    // der Satz an den Kunden nennt sein Bild in seiner Sprache.
    + (language === 'German' ? ' In the German text, call an image „Vorbild N", never "reference".' : ''),
    '',
    'BRAND FOUNDATION (the yardstick)',
    foundation,
    '',
    'VISUAL DNA VOCABULARY (dimension id: allowed value ids)',
    vocabulary,
    '',
    'IMAGES (in the order they appear after this prompt)',
    images,
    '',
    'FOR EVERY IMAGE',
    `- observed: 2 to ${BRAND_READING_OBSERVATIONS_MAX} entries, each { "dimension": <dimension id>, `
    + '"value": <value id> }. Use ONLY ids from the vocabulary above, at most one entry per dimension. '
    + 'Entries with invented ids are discarded.',
    '- verdict: "fits" (it already carries the foundation), "tension" (partly — something works, '
    + 'something pulls against it) or "off" (it contradicts the foundation).',
    `- anchor: the PLACE in the foundation you measured against (archetype, a value, a tone word, `
    + `the direction) — max ${BRAND_READING_ANCHOR_MAX} characters. A verdict without an anchor is `
    + 'taste, not a reading, and is discarded.',
    `- reason: two or three sentences, max ${BRAND_READING_REASON_MAX} characters. Praise is as `
    + 'concrete as criticism: name what works, do not applaud.',
    `- suggestion: only for "tension" and "off" — what to take and what to leave, max `
    + `${BRAND_READING_SUGGESTION_MAX} characters.`,
    '',
    'SUMMARY',
    `- keeps: up to ${BRAND_READING_SUMMARY_MAX} short lines — what already carries and should be `
    + 'taken forward.',
    `- improves: up to ${BRAND_READING_SUMMARY_MAX} short lines — what should be changed, softened `
    + `or dropped. Max ${BRAND_READING_SUMMARY_LINE_MAX} characters per line, no "·" character.`,
    '',
    `LANGUAGE: write anchor, reason, suggestion and summary in ${language}. Ids stay as they are.`,
    '',
    'ANSWER FORMAT (JSON only)',
    '{"readings":[{"id":"<image id>","observed":[{"dimension":"<id>","value":"<id>"}],'
    + '"verdict":"fits|tension|off","anchor":"<text>","reason":"<text>","suggestion":"<text>"}],'
    + '"summary":{"keeps":["<line>"],"improves":["<line>"]}}',
    'Return one entry per image, with exactly the ids listed above. Do not invent image ids.',
  ].join('\n')
}
