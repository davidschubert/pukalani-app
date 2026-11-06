import { BRAND_MARK_BRIEF_FIELD_MAX } from '../../shared/brandDesignMark'

/**
 * DER AUFTRAG DES ZEICHEN-BRIEFINGS (Brand Design D5a,
 * docs/archiv/BRAND-DESIGN.md §2.5 Stufe 1).
 *
 * PUR: keine Fetches, kein H3Event, kein Appwrite, kein i18n — dieselbe
 * Begründung wie bei `dnaPrompt.ts` und `readingPrompt.ts`: an diesen Sätzen
 * hängt, ob aus der Foundation ein BRIEFING wird oder eine Stimmungsliste,
 * und ein Prompt, den man nur mit einem Anbieter-Schlüssel ansehen kann, liest
 * niemand gegen.
 *
 * ── VIER FELDER, NICHT SECHS ──────────────────────────────────────────────
 * Das Briefing hat sechs Blöcke; das Modell schreibt VIER davon. Schutzraum
 * und Varianten sind MASSE bzw. eine Liste aus dem Vokabular und werden
 * gerechnet (`brandMarkDerivedBriefFields`) — der Prompt nennt sie trotzdem,
 * als BEDINGUNG: die vier geschriebenen Felder sollen zu ihnen passen, und
 * ein Modell, das den Schutzraum nicht kennt, schreibt No-Gos, die ihn
 * verletzen. Die Antwort dazu wird verworfen, nicht geprüft — genau deshalb
 * steht hier ausdrücklich, dass die zwei Felder NICHT gefragt sind.
 *
 * ── ES IST EIN AUFTRAG, KEIN LOGO ─────────────────────────────────────────
 * §1.4 („kein fertiges Logo per KI"): der Prompt verbietet ausdrücklich,
 * ein Zeichen zu BESCHREIBEN, das dann als fertig gelesen würde („eine Tasse
 * mit Dampf"), und verlangt stattdessen die Eigenschaften, an denen ein
 * Entwurf geprüft wird. Der Unterschied zwischen Briefing und Bildbeschreibung
 * ist das ganze Produkt.
 *
 * ── DIE FOUNDATION IST DER MASSSTAB ───────────────────────────────────────
 * Wie beim DNA-Vorschlag: die Foundation steht vorn und wird als Massstab
 * benannt, die DNA ist ihre visuelle Übersetzung, Farbwelt und Schrift sind
 * BESCHLOSSEN — das Briefing darf sie nicht neu verhandeln.
 *
 * ── ENGLISCH IM KERN, INHALTSSPRACHE IM ERGEBNIS ──────────────────────────
 * Der Auftrag ist englisch (sprachneutraler Kern wie überall in diesem Layer),
 * die vier Felder stehen in der Inhaltssprache der Marke: der Kunde liest sie,
 * und das Brand-Dokument ist einsprachig.
 */

export const BRAND_MARK_BRIEF_SYSTEM_PROMPT
  = 'You are a brand designer writing the briefing another designer will work from. '
    + 'You do not describe a logo and you do not invent a symbol — you write down the properties '
    + 'any draft will be checked against, and every one of them follows from the brand foundation '
    + 'and the visual DNA you are given. '
    + 'You answer with JSON only. No prose, no markdown fences.'

export interface BrandMarkBriefPromptInput {
  /** Die Inhaltssprache der Marke — in ihr stehen die vier Felder. */
  readonly contentLocale: string
  /** Der Name der Marke, so wie er gesetzt wird. */
  readonly brandName: string
  /** Die Foundation-Blöcke: Beschriftung und bestätigter Wert. */
  readonly foundation: readonly { readonly label: string, readonly value: string }[]
  /** Die bestätigte DNA als Zeilen „dimension: value (Lesefassung)". */
  readonly dna: readonly string[]
  /** Die Richtung des Zeichens: Id plus Lesefassung. */
  readonly kind: string
  /** Was schon BESCHLOSSEN ist — Schriftpaar und Farbwelt, als Zeilen. */
  readonly settled: readonly string[]
  /** Der gerechnete Schutzraum-Satz — Bedingung, nicht Aufgabe. */
  readonly clearSpace: string
  /** Der gerechnete Varianten-Satz — Bedingung, nicht Aufgabe. */
  readonly variants: string
}

export function brandMarkBriefPrompt(input: BrandMarkBriefPromptInput): string {
  const language = input.contentLocale.toLowerCase().startsWith('de') ? 'German' : 'English'
  const foundation = input.foundation.length
    ? input.foundation.map(block => `### ${block.label}\n${block.value}`).join('\n\n')
    : '(no confirmed foundation values available)'
  const dna = input.dna.length ? input.dna.map(line => `- ${line}`).join('\n') : '- (none recorded)'
  const settled = input.settled.length
    ? input.settled.map(line => `- ${line}`).join('\n')
    : '- (nothing settled yet)'

  return [
    'TASK',
    `Write the mark briefing for "${input.brandName}". It is the text a designer gets — and the `
    + 'yardstick every later draft is measured against. Do not describe a finished mark, do not '
    + 'name motifs to draw ("a cup with steam"), do not name brands, fonts or colour values. '
    + 'Write the properties a draft can be CHECKED against.',
    '',
    'BRAND FOUNDATION (the yardstick)',
    foundation,
    '',
    'VISUAL DNA (the visual translation of that foundation — already confirmed)',
    dna,
    '',
    'ALREADY SETTLED (do not renegotiate any of this)',
    settled,
    `- kind of mark: ${input.kind}`,
    '',
    'FIXED CONDITIONS (computed, NOT part of your answer — your four fields must fit them)',
    `- clear space and minimum sizes: ${input.clearSpace}`,
    `- variants: ${input.variants}`,
    '',
    'WRITE EXACTLY FOUR FIELDS',
    '- character: how the mark should FEEL and what it may not try to do. Follow from the '
    + 'archetype and the tone words, not from taste.',
    '- formLanguage: edges, curves, weight, how many ideas the mark carries. Follow from the DNA '
    + 'dimension "form language". Say what is NOT drawn.',
    '- noGos: what would be done wrong with THIS mark in THIS brand — things that will really '
    + 'happen (stretching, tilting, shadows, re-typing it in a text field, putting it on busy '
    + 'photos). No generic list.',
    '- places: the places this brand actually has, from the foundation. Do not invent an app icon '
    + 'for a brand without an app.',
    '',
    'RULES',
    `- Every field is one short paragraph, max ${BRAND_MARK_BRIEF_FIELD_MAX} characters, plain `
    + 'text, no bullet points, no line breaks.',
    '- Do NOT answer with clear space, minimum sizes or variants: they are computed above and any '
    + 'value you write for them is discarded.',
    '- A field that is empty or that only restates the task makes the whole briefing unusable.',
    '',
    `LANGUAGE: write all four fields in ${language}.`,
    '',
    'ANSWER FORMAT (JSON only)',
    '{"character":"<text>","formLanguage":"<text>","noGos":"<text>","places":"<text>"}',
  ].join('\n')
}

/**
 * DER AUFTRAG AN DAS BILDMODELL (Brand Design D5c,
 * docs/archiv/BRAND-DESIGN.md §2.5 Stufe 3, Davids Entscheidung §1.11 b).
 *
 * ── ER STEHT NEBEN DEM BRIEFING-PROMPT, NICHT DARIN ───────────────────────
 * Beide gehören zum Zeichen, aber sie sprechen mit verschiedenen Modellen über
 * verschiedene Dinge: der eine bittet um TEXT, den ein Mensch bearbeitet, der
 * andere um ein BILD, das niemand bearbeiten kann. Eine gemeinsame Fassung
 * hätte an jeder zweiten Zeile ein „ausser beim Bild".
 *
 * ── ER NENNT NIE EIN FREMDWERK ────────────────────────────────────────────
 * Kein Marken-, Studio- oder Künstlername, keine Aufforderung „im Stil von",
 * und ausdrücklich auch nicht die Vorbilder des Kunden (§2.13: sie reisen nie
 * in einen Prompt). Was das Modell bekommt, sind EIGENSCHAFTEN — Charakter,
 * Formsprache, Farbwerte, der Name der Schriftfamilie —, also genau das, was
 * im Briefing steht. Ein Entwurf, der einem fremden Zeichen ähnelt, weil wir
 * danach gefragt haben, wäre der teuerste Fehler dieser Fläche.
 *
 * ── DIE VIER ENTWÜRFE SIND VIER AUFRUFE ───────────────────────────────────
 * Der Chat-Completions-Weg liefert je Aufruf ein Bild (§2.12 / Kopf von
 * `core/server/utils/aiImage.ts`); die vier ANGLES unten sind der Unterschied
 * zwischen ihnen. Sie sind bewusst grob und beschreiben KEIN Motiv: sie sagen,
 * wie streng, wie geometrisch, wie viel Buchstabe — die Entscheidung, WAS zu
 * sehen ist, bleibt beim Modell und danach beim Menschen.
 */

/** Die vier Blickwinkel EINES Laufs — vier Aufrufe, ein Prompt-Gerüst. */
export const BRAND_MARK_DRAFT_ANGLES: readonly string[] = [
  'a strictly geometric construction, built from as few elements as possible',
  'a mark carried by the letterform of the initial, not by a picture',
  'a soft, hand-drawn feel with one uneven edge, still reduced to one idea',
  'an abstract sign that reads at 24 pixels and carries no illustration at all',
]

export interface BrandMarkDraftPromptInput {
  readonly brandName: string
  /** Der Anfangsbuchstabe, wie ihn die Setzungen benutzen. */
  readonly initial: string
  /** Die Richtung des Zeichens: Id plus Lesefassung. */
  readonly kind: string
  /** Charakter und Formsprache aus dem Briefing — wörtlich, geklemmt. */
  readonly character: string
  readonly formLanguage: string
  /** Die DNA-Zeile „form language" als Lesefassung, wenn es sie gibt. */
  readonly formDna: string
  /** Die bestätigten Hex-Werte: Tinte, Papier, Akzent. */
  readonly ink: string
  readonly paper: string
  readonly accent: string
  /** Der NAME der Überschriften-Familie — nie eine Datei, nie ein Zitat. */
  readonly headingFamily: string
  /** Welcher der vier Blickwinkel (s. `BRAND_MARK_DRAFT_ANGLES`). */
  readonly angle: string
}

export function brandMarkDraftPrompt(input: BrandMarkDraftPromptInput): string {
  return [
    `Design ONE logo draft for the brand "${input.brandName}".`,
    '',
    'THE BRIEFING (this is the yardstick)',
    `- kind of mark: ${input.kind}`,
    `- character: ${input.character}`,
    `- form language: ${input.formLanguage}`,
    ...(input.formDna ? [`- visual DNA, form: ${input.formDna}`] : []),
    `- initial of the brand: ${input.initial}`,
    '',
    'COLOURS — use these and no others',
    `- ink: ${input.ink}`,
    `- background: ${input.paper}`,
    `- accent (sparingly, or not at all): ${input.accent}`,
    '',
    'THIS DRAFT',
    `- ${input.angle}`,
    '',
    'RULES',
    '- One single mark, centred, on a plain background of the given colour. Nothing else in the '
    + 'image: no mockup, no business card, no shadow, no reflection, no gradient mesh, no frame.',
    '- Flat vector look, clean edges, as if it were drawn in a vector program.',
    '- It must still read as one shape at 24 pixels.',
    `- If you set the brand name or the initial, set it in a typeface close to ${input.headingFamily}.`,
    '- No tagline, no lorem ipsum, no caption, no watermark, no signature.',
    '- Do not imitate any existing brand, studio or designer, and do not use any existing logo, '
    + 'emblem, coat of arms or trademark as a starting point.',
    '- No photographic elements, no 3D rendering, no text other than the brand name or initial.',
    '',
    'Square image.',
  ].join('\n')
}
