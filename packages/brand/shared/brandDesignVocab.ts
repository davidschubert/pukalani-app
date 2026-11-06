/**
 * DIE VOKABULARE VON BRAND DESIGN — die kontrollierten Mengen, aus denen
 * Schicht 2 ihre Werte nimmt (Konzept docs/archiv/BRAND-DESIGN.md §2.2–§2.7,
 * Paket D0).
 *
 * ── WARUM ES SIE GIBT ─────────────────────────────────────────────────────
 * „Ein Moodboard ist eine KOMBINATION dieser Eigenschaften, keine Kategorie"
 * (Davids Notiz 2026-08-30) — und: „was hier steht, muss ein Preset belegen
 * können" (Prototyp `demoDesign.ts`). Deshalb gibt es in den zehn Dimensionen
 * KEINEN Freitext: jede DNA-Zeile trägt eine Id aus einer geschlossenen
 * Menge, und `BrandDesignPreset` kann sie später wörtlich weiterreichen. Ein
 * frei getippter Farb-Charakter wäre im Preset ein Wort, das keine Rampe,
 * keine Szene und kein Token kennt.
 *
 * ── DIESE DATEI IST PUR ───────────────────────────────────────────────────
 * Kein i18n, kein H3, kein Appwrite, keine Layer-Importe. Die LABEL stehen
 * hier trotzdem zweisprachig und NICHT als i18n-Schlüssel — dieselbe
 * Auflösung wie bei `brandChoiceOptions.ts` und `brandAdvisors.ts`: die Namen
 * reisen in den Prompt (Server, ohne vue-i18n) UND in gespeicherte Werte, sie
 * werden also nicht aus einem Katalog gerendert. Die Ids sind die Wahrheit,
 * die Labels sind ihre Lesefassung.
 *
 * ── DIE IDS SIND UNVERÄNDERLICH ───────────────────────────────────────────
 * Wie eine Slot-Id: sie stehen in `brand_steps.slots` und später im Preset.
 * Ein Wert, der nicht mehr gebraucht wird, bleibt in der Liste stehen; ein
 * Rename wäre eine stille Datenlöschung.
 *
 * D1: Inhalte sind Davids Gate. Ids und Struktur sind aus dem freigegebenen
 * Prototyp übernommen (`DS_DNA_DIMENSIONS`, wörtlich); die englischen Labels
 * und die Hinweiszeilen sind eine erste Fassung.
 */

/** Ein kontrollierter Wert: stabile Id, Lesefassung je Oberflächen-Sprache. */
export interface BrandDesignTerm {
  readonly id: string
  readonly de: string
  readonly en: string
}

export interface BrandDnaDimension {
  readonly id: string
  readonly de: string
  readonly en: string
  /** Was die Dimension entscheidet — eine Zeile, kein Absatz. */
  readonly hintDe: string
  readonly hintEn: string
  /** Genau fünf kontrollierte Werte (s. `validateBrandDesignVocab`). */
  readonly values: readonly BrandDesignTerm[]
}

/**
 * DIE ZEHN ORTHOGONALEN DIMENSIONEN der Visual Brand DNA (Davids Notiz
 * 2026-08-30, im Prototyp als `DS_DNA_DIMENSIONS` abgenommen).
 *
 * Orthogonal heisst: eine Belegung besteht IMMER aus allen zehn, und keine
 * Dimension lässt sich aus einer anderen ableiten. Ein Moodboard ist genau
 * eine solche Belegung.
 */
export const BRAND_DNA_DIMENSIONS: readonly BrandDnaDimension[] = [
  {
    id: 'style',
    de: 'Visueller Stil',
    en: 'Visual style',
    hintDe: 'Die Grundhaltung der Gestaltung.',
    hintEn: 'The basic stance of the design.',
    values: [
      { id: 'minimal', de: 'Minimal', en: 'Minimal' },
      { id: 'editorial', de: 'Redaktionell', en: 'Editorial' },
      { id: 'organic', de: 'Organisch', en: 'Organic' },
      { id: 'technical', de: 'Technisch', en: 'Technical' },
      { id: 'playful', de: 'Verspielt', en: 'Playful' },
    ],
  },
  {
    id: 'era',
    de: 'Ästhetische Epoche',
    en: 'Aesthetic era',
    hintDe: 'Aus welcher Zeit die Formen sprechen.',
    hintEn: 'Which period the forms speak from.',
    values: [
      { id: 'timeless', de: 'Zeitlos', en: 'Timeless' },
      { id: 'midcentury', de: 'Mid-Century', en: 'Mid-century' },
      { id: 'print90', de: '90er-Print', en: 'Nineties print' },
      { id: 'digital', de: 'Gegenwärtig-digital', en: 'Contemporary digital' },
      { id: 'craft', de: 'Handwerklich-historisch', en: 'Craft and historic' },
    ],
  },
  {
    id: 'form',
    de: 'Formsprache',
    en: 'Form language',
    hintDe: 'Kanten, Rundungen, Rhythmus.',
    hintEn: 'Edges, curves, rhythm.',
    values: [
      { id: 'soft', de: 'Weich gerundet', en: 'Softly rounded' },
      { id: 'geometric', de: 'Geometrisch', en: 'Geometric' },
      { id: 'sharp', de: 'Kantig', en: 'Hard-edged' },
      { id: 'irregular', de: 'Unregelmäßig', en: 'Irregular' },
      { id: 'mixed', de: 'Gemischt', en: 'Mixed' },
    ],
  },
  {
    id: 'typography',
    de: 'Typografie-Charakter',
    en: 'Typographic character',
    hintDe: 'Wie die Schrift klingt, bevor man sie liest.',
    hintEn: 'How the type sounds before anyone reads it.',
    values: [
      { id: 'bookish', de: 'Buchhafte Serif', en: 'Bookish serif' },
      { id: 'humanist', de: 'Humanistische Grotesk', en: 'Humanist sans' },
      { id: 'geometricType', de: 'Geometrische Grotesk', en: 'Geometric sans' },
      { id: 'mono', de: 'Schreibmaschine', en: 'Typewriter' },
      { id: 'contrast', de: 'Kontrastreich gemischt', en: 'High-contrast mix' },
    ],
  },
  {
    id: 'color',
    de: 'Farb-Charakter',
    en: 'Colour character',
    hintDe: 'Temperatur, Sättigung, Tiefe.',
    hintEn: 'Temperature, saturation, depth.',
    values: [
      { id: 'earthy', de: 'Erdig gedämpft', en: 'Earthy and muted' },
      { id: 'airy', de: 'Hell und luftig', en: 'Light and airy' },
      { id: 'deep', de: 'Tief und kontrastreich', en: 'Deep and high-contrast' },
      { id: 'monochrome', de: 'Monochrom', en: 'Monochrome' },
      { id: 'vivid', de: 'Farbenfroh', en: 'Vivid' },
    ],
  },
  {
    id: 'imagery',
    de: 'Bildwelt',
    en: 'Imagery',
    hintDe: 'Was auf einem Bild passiert.',
    hintEn: 'What happens inside a picture.',
    values: [
      { id: 'documentary', de: 'Dokumentarisch', en: 'Documentary' },
      { id: 'still', de: 'Inszeniert-still', en: 'Staged and still' },
      { id: 'craftClose', de: 'Nah am Handwerk', en: 'Close to the craft' },
      { id: 'people', de: 'Menschenzentriert', en: 'People-centred' },
      { id: 'abstract', de: 'Abstrakt', en: 'Abstract' },
    ],
  },
  {
    id: 'composition',
    de: 'Komposition',
    en: 'Composition',
    hintDe: 'Wie viel Luft die Fläche bekommt.',
    hintEn: 'How much air the surface gets.',
    values: [
      { id: 'calm', de: 'Ruhig und luftig', en: 'Calm and airy' },
      { id: 'dense', de: 'Dicht redaktionell', en: 'Densely editorial' },
      { id: 'grid', de: 'Streng gerastert', en: 'Strictly gridded' },
      { id: 'asymmetric', de: 'Asymmetrisch', en: 'Asymmetric' },
      { id: 'centered', de: 'Zentriert', en: 'Centred' },
    ],
  },
  {
    id: 'materiality',
    de: 'Materialität',
    en: 'Materiality',
    hintDe: 'Woran sich die Oberfläche anfühlt.',
    hintEn: 'What the surface feels like.',
    values: [
      { id: 'paper', de: 'Papier, matt', en: 'Paper, matt' },
      { id: 'smooth', de: 'Glatt-digital', en: 'Smooth and digital' },
      { id: 'textile', de: 'Textil, rau', en: 'Textile, rough' },
      { id: 'wood', de: 'Holz, warm', en: 'Wood, warm' },
      { id: 'glass', de: 'Glas, klar', en: 'Glass, clear' },
    ],
  },
  {
    id: 'motion',
    de: 'Bewegungs-Charakter',
    en: 'Motion character',
    hintDe: 'Wie sich Übergänge anfühlen.',
    hintEn: 'What transitions feel like.',
    values: [
      { id: 'calmMotion', de: 'Ruhig', en: 'Calm' },
      { id: 'springy', de: 'Federnd', en: 'Springy' },
      { id: 'precise', de: 'Präzise', en: 'Precise' },
      { id: 'none', de: 'Fast keine', en: 'Almost none' },
      { id: 'playfulMotion', de: 'Verspielt', en: 'Playful' },
    ],
  },
  {
    id: 'mood',
    de: 'Grundstimmung',
    en: 'Overall mood',
    hintDe: 'Das Gefühl, das bleibt.',
    hintEn: 'The feeling that stays.',
    values: [
      { id: 'honest', de: 'Ehrlich-nüchtern', en: 'Honest and sober' },
      { id: 'warm', de: 'Warm einladend', en: 'Warm and inviting' },
      { id: 'focused', de: 'Konzentriert', en: 'Focused' },
      { id: 'confident', de: 'Souverän', en: 'Confident' },
      { id: 'light', de: 'Leicht', en: 'Light' },
    ],
  },
]

/** Die Ids der zehn Dimensionen, in Reihenfolge — der Schlüsselvorrat einer Belegung. */
export const BRAND_DNA_DIMENSION_IDS: readonly string[]
  = BRAND_DNA_DIMENSIONS.map(dimension => dimension.id)

/**
 * EINE BELEGUNG: Dimensions-Id → Wert-Id, IMMER alle zehn (nie eine Teilmenge).
 * `buildBrandDesign` weist eine unvollständige Belegung ab.
 */
export type BrandDnaValues = Readonly<Record<string, string>>

/**
 * WOHER EINE DNA-ZEILE KOMMT (§2.2 Leitplanke e). Eine Zeile kommt NIE allein
 * aus einem Vorbild: die Foundation ist der Massstab, nicht das Bild — deshalb
 * gibt es `inspiration` nur zusammen mit einem Foundation-Bezug in derselben
 * Begründung, und `both` ist der Normalfall des Weges MIT Vorbildern.
 */
export const BRAND_DNA_ORIGINS = ['foundation', 'inspiration', 'both'] as const
export type BrandDnaOrigin = (typeof BRAND_DNA_ORIGINS)[number]

/**
 * DIE LESEFASSUNG DER HERKUNFT (D2c) — sie steht im Slot-Wert von `g.dna` und
 * `g.mix`, also im Handbuch, und muss von dort auch wieder zurückgelesen
 * werden (`brandDesignDna.ts`). Deshalb hier zweisprachig wie jeder andere
 * Vokabular-Eintrag und nicht als i18n-Schlüssel (s. Kopf).
 *
 * `inspiration` steht in der Liste, obwohl die Klemmung sie nie durchlässt
 * (eine Zeile ohne Foundation-Bezug fällt vorher weg, §2.2 Leitplanke b): ein
 * späterer Leser muss die Id kennen, statt an ihr zu scheitern.
 */
export const BRAND_DNA_ORIGIN_TERMS: readonly BrandDesignTerm[] = [
  { id: 'foundation', de: 'Aus der Foundation', en: 'From your foundation' },
  { id: 'inspiration', de: 'Aus einem Vorbild', en: 'From a reference' },
  { id: 'both', de: 'Aus Foundation und Vorbild', en: 'From foundation and reference' },
]

/**
 * DIE DREI MOODBOARDS (§2.2 Schritt 5, D2c) — Ids unveränderlich, sie stehen
 * in `g.board` und in jedem Slot-Wert von `g.mix`.
 *
 * Namen und Notizen stehen HIER zweisprachig und nicht als i18n-Schlüssel:
 * sie reisen in GESPEICHERTE Werte („Typografie aus ‚Eine Stufe mutiger'") und
 * müssen von dort zurückgelesen werden — dieselbe Begründung wie beim
 * Vokabular überhaupt (s. Kopf).
 *
 * Sie stehen in DIESER Datei und nicht bei der Board-Regel
 * (`brandDesignDna.ts`), weil `brandChoiceOptions.ts` sie als geschlossene
 * Auswahl braucht: von dort nach `brandDesignDna.ts` zu greifen legte einen
 * Import-Ring über `brandDirections.ts`. Das Vokabular ist das Blatt ohne
 * eigene Importe — hier kann jeder schöpfen.
 */
export interface BrandDnaBoardKind extends BrandDesignTerm {
  readonly noteDe: string
  readonly noteEn: string
}

export const BRAND_DNA_BOARD_KINDS: readonly BrandDnaBoardKind[] = [
  {
    id: 'proposed',
    de: 'Wie vorgeschlagen',
    en: 'As proposed',
    noteDe: 'Die Ableitung aus der Foundation, Zeile für Zeile begründet.',
    noteEn: 'The derivation from your foundation, reasoned line by line.',
  },
  {
    id: 'calmer',
    de: 'Eine Stufe ruhiger',
    en: 'One step quieter',
    noteDe: 'Weniger Kontrast, ruhigere Flächen, zurückhaltendere Schrift.',
    noteEn: 'Less contrast, quieter surfaces, a more restrained typeface.',
  },
  {
    id: 'bolder',
    de: 'Eine Stufe mutiger',
    en: 'One step bolder',
    noteDe: 'Mehr Kontrast, dichtere Fläche, kontrastreiche Schriftmischung.',
    noteEn: 'More contrast, a denser surface, a high-contrast type mix.',
  },
]

/**
 * DIE BEREICHE, denen ein hochgeladenes Vorbild zugeordnet wird (§2.2 Schritt
 * 2). Je Bild GENAU EINER — ein Bild, das für alles steht, wird für nichts
 * gelesen.
 */
export const BRAND_INSPIRATION_AREAS: readonly BrandDesignTerm[] = [
  { id: 'color', de: 'Farbwelt', en: 'Colour world' },
  { id: 'type', de: 'Typografie', en: 'Typography' },
  { id: 'mark', de: 'Zeichen', en: 'Mark' },
  { id: 'imagery', de: 'Bildsprache', en: 'Imagery' },
  { id: 'composition', de: 'Komposition', en: 'Composition' },
]

/**
 * DAS URTEIL EINER LESUNG gegen die Foundation (§2.2 Schritt 3) — Davids
 * „Verbesserungsvorschläge ODER sagen, was bereits sehr gut ist".
 */
export const BRAND_READING_VERDICTS: readonly BrandDesignTerm[] = [
  { id: 'fits', de: 'Trägt schon', en: 'Already carries' },
  { id: 'tension', de: 'Spannung', en: 'Tension' },
  { id: 'off', de: 'Passt nicht', en: 'Does not fit' },
]

/** Die Richtungen des Zeichens (§2.5 Stufe 1, `j.kind`). */
export const BRAND_MARK_KINDS: readonly BrandDesignTerm[] = [
  { id: 'word', de: 'Wortmarke', en: 'Wordmark' },
  { id: 'pictorial', de: 'Bildmarke', en: 'Pictorial mark' },
  { id: 'combination', de: 'Kombination', en: 'Combination mark' },
  { id: 'monogram', de: 'Monogramm', en: 'Monogram' },
]

/** Die vier Varianten jeder gesetzten Marke (§2.5 Stufe 2, `j.examples`). */
export const BRAND_MARK_VARIANTS: readonly BrandDesignTerm[] = [
  { id: 'primary', de: 'Primär', en: 'Primary' },
  { id: 'inverted', de: 'Invertiert', en: 'Inverted' },
  { id: 'mono', de: 'Einfarbig', en: 'Single colour' },
  { id: 'icon', de: 'Icon-Fläche', en: 'Icon area' },
]

/**
 * DIE ZWEI GESETZTEN BEISPIELE (§2.5 Stufe 2, `j.pick`).
 *
 * Sie sind NICHT dieselbe Liste wie `BRAND_MARK_KINDS`, auch wenn zwei Ids
 * sich ähneln: dort steht, was für ein Zeichen die Marke bekommen soll (eine
 * Richtung für den Designer), hier steht, welche der beiden gerechneten
 * SETZUNGEN als Vorzugs-Beispiel im Briefing landet. Eine Marke mit der
 * Richtung „Kombination" hat trotzdem genau diese zwei Setzungen — eine
 * Bildmarke wird hier bewusst nicht gesetzt (§1.4: kein Logo-Versprechen).
 */
export const BRAND_MARK_SETTINGS: readonly BrandDesignTerm[] = [
  { id: 'wordmark', de: 'Wortmarke', en: 'Wordmark' },
  { id: 'monogram', de: 'Monogramm', en: 'Monogram' },
]

/** Die Tönung der Neutral-Rampe (§2.3, `h.neutral`). */
export const BRAND_NEUTRAL_OPTIONS: readonly BrandDesignTerm[] = [
  { id: 'tinted', de: 'Aus der Basisfarbe getönt', en: 'Tinted from the base colour' },
  { id: 'warm', de: 'Warm', en: 'Warm' },
  { id: 'cool', de: 'Kühl', en: 'Cool' },
]

/** Die Grössen-Hierarchie (§2.4, `i.scale`). */
export const BRAND_TYPE_SCALES: readonly BrandDesignTerm[] = [
  { id: 'calm', de: 'Ruhig', en: 'Calm' },
  { id: 'dense', de: 'Dicht', en: 'Dense' },
  { id: 'loud', de: 'Plakativ', en: 'Bold' },
]

/** Die Illustrations-Sprache (§2.6, `k.illustration`). */
export const BRAND_ILLUSTRATION_OPTIONS: readonly BrandDesignTerm[] = [
  { id: 'none', de: 'Keine Illustration', en: 'No illustration' },
  { id: 'line', de: 'Linie', en: 'Line' },
  { id: 'area', de: 'Fläche', en: 'Area' },
  { id: 'organic', de: 'Organisch', en: 'Organic' },
]

/** Der Icon-Satz (§2.6, `k.icons`). */
export const BRAND_ICON_OPTIONS: readonly BrandDesignTerm[] = [
  { id: 'regular', de: 'Linie', en: 'Line' },
  { id: 'fill', de: 'Fläche', en: 'Filled' },
  { id: 'bold', de: 'Kräftig', en: 'Bold' },
]

/**
 * DAS TEMPO DER BEWEGUNG (§2.7, `l.tempo`) — mit den Zahlen, aus denen
 * `l.transitions` seinen Token-Satz rechnet. Sie stehen HIER und nicht in der
 * Vorschau-Komponente: die Tokens gehören ins Preset (Produkt 03 liest sie),
 * eine Komponente wäre die falsche Wahrheit.
 */
export interface BrandTempoOption extends BrandDesignTerm {
  /** Grunddauer in ms — `motion.base`. */
  readonly base: number
  readonly easing: string
}

export const BRAND_TEMPO_OPTIONS: readonly BrandTempoOption[] = [
  { id: 'calm', de: 'Ruhig', en: 'Calm', base: 240, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
  { id: 'lively', de: 'Lebendig', en: 'Lively', base: 180, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)' },
  { id: 'snappy', de: 'Knapp', en: 'Snappy', base: 120, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
]

/**
 * DIE DREI ÜBERGANGS-TOKENS als Faktoren der Grunddauer — „mehr braucht
 * niemand, und weniger Tokens heisst weniger Streit im Team" (Prototyp).
 */
export const BRAND_MOTION_TOKENS: readonly { readonly id: string, readonly factor: number }[] = [
  { id: 'fast', factor: 0.5 },
  { id: 'base', factor: 1 },
  { id: 'slow', factor: 1.6 },
]

/** Versatz zwischen Geschwistern (Listen, Karten) in ms — bei jedem Tempo gleich. */
export const BRAND_MOTION_STAGGER_MS = 60

/**
 * DIE FÜNF FARB-ROLLEN (§2.3, `h.roles`) — „wofür welche Farbe steht".
 *
 * ── DIE QUELLE IST EIN TOKEN, KEIN SATZ ───────────────────────────────────
 * `source` steht später im Preset (`BrandColorRole.source`) und Produkt 03
 * macht daraus Tokens. Ein deutscher Satz („Rampe 900 auf Papier", so im
 * Prototyp) wäre dort eine Zeichenkette, die niemand auflösen kann — und in
 * einer englischen Marke wäre sie schlicht falsch. Deshalb: eine stabile
 * Kennung, die `brandColorRoleSource` in einen Hex und
 * `brandColorRoleSourceLabel` in einen Lesetext übersetzt.
 *
 * ── JEDE ROLLE HAT IHRE EIGENE QUELLE ─────────────────────────────────────
 * `sessionContent.ts` nennt „zwei Rollen mit derselben Quelle und
 * verschiedenen Namen" ausdrücklich ein Anti-Muster; `validateBrandColorRoles`
 * nagelt es fest. Der Prototyp hatte hier zwei Papiertöne (Neutral 50 und den
 * festen Kailua-Papierton) — den zweiten gibt es im Produkt nicht, also trägt
 * „Helle Flächen" jetzt die 100er-Stufe.
 */
export interface BrandColorRoleTerm extends BrandDesignTerm {
  /** Woraus die Rolle gefüllt wird — stabile Kennung, kein Anzeigetext. */
  readonly source: string
  readonly noteDe: string
  readonly noteEn: string
}

export const BRAND_COLOR_ROLES: readonly BrandColorRoleTerm[] = [
  {
    id: 'ground',
    de: 'Grund & Text',
    en: 'Ground and text',
    source: 'ramp.900',
    noteDe: 'Alles Gelesene. Nie die 500er-Stufe — die ist Fläche, nicht Schrift.',
    noteEn: 'Everything that gets read. Never step 500 — that one is surface, not type.',
  },
  {
    id: 'surface',
    de: 'Wärme & Flächen',
    en: 'Warmth and surfaces',
    source: 'ramp.100',
    noteDe: 'Karten, Einschübe, Tabellen-Zebra — die Marke als Fläche.',
    noteEn: 'Cards, call-outs, table stripes — the brand as a surface.',
  },
  {
    id: 'light',
    de: 'Helle Flächen',
    en: 'Light areas',
    source: 'neutral.100',
    noteDe: 'Ruhige Flächen ohne Marken-Ton: Kopfzeilen, Fußbereiche, Trennfelder.',
    noteEn: 'Quiet areas without the brand tint: headers, footers, dividers.',
  },
  {
    id: 'accent',
    de: 'Akzent & Signal',
    en: 'Accent and signal',
    source: 'accent',
    noteDe: 'Knöpfe, aktive Zustände, genau ein Pop je Fläche.',
    noteEn: 'Buttons, active states, exactly one pop per surface.',
  },
  {
    id: 'paper',
    de: 'Papier & Ruhe',
    en: 'Paper and calm',
    source: 'neutral.50',
    noteDe: 'Der Grund, auf dem alles liegt — im Druck wie am Bildschirm.',
    noteEn: 'The ground everything sits on — in print as on screen.',
  },
]

/**
 * DIE BESCHRIFTUNGEN DER KONTRAST-PAARE (§2.3, `h.contrast`).
 *
 * Die PAARE selbst (welche Stufe auf welcher Fläche) stehen in
 * `brandDesign.ts` — dort rechnet `buildBrandDesign` sie ins Preset, und eine
 * zweite Liste daneben wäre die zweite Meinung darüber, was überhaupt geprüft
 * wird. Hier stehen nur ihre Namen, in beiden Sprachen, weil ein Slot-Wert in
 * der Inhaltssprache der Marke geschrieben wird. `validateBrandColorRoles`
 * prüft, dass beide Listen dieselben Ids tragen.
 */
export const BRAND_CONTRAST_PAIR_TERMS: readonly BrandDesignTerm[] = [
  { id: 'body-light', de: 'Fließtext auf Papier', en: 'Body text on paper' },
  { id: 'heading-light', de: 'Überschrift auf Papier', en: 'Heading on paper' },
  { id: 'button-light', de: 'Knopf-Text auf Akzent', en: 'Button text on the accent' },
  { id: 'muted-light', de: 'Nebentext auf Fläche', en: 'Secondary text on a surface' },
  { id: 'body-dark', de: 'Fließtext auf dunklem Grund', en: 'Body text on a dark ground' },
  { id: 'accent-dark', de: 'Akzent auf dunklem Grund', en: 'The accent on a dark ground' },
]

/**
 * DIE VIER WCAG-URTEILE ALS LESEFASSUNG (§2.3, `h.contrast`).
 *
 * Die Ids sind die der Themes-Engine (`wcagLevel`) und bleiben es — sie stehen
 * im Preset. Im Slot-Wert steht die Lesefassung, weil ein Handbuch-Satz
 * „3,1:1 · fail" niemandem sagt, was zu tun ist.
 */
export const BRAND_CONTRAST_LEVEL_TERMS: readonly BrandDesignTerm[] = [
  { id: 'AAA', de: 'AAA', en: 'AAA' },
  { id: 'AA', de: 'AA', en: 'AA' },
  { id: 'AA18', de: 'AA nur für große Schrift', en: 'AA for large text only' },
  { id: 'fail', de: 'unter AA', en: 'below AA' },
]

/** Bewegt sich das Zeichen? (§2.7, `l.logo`) */
export const BRAND_LOGO_MOTION_OPTIONS: readonly BrandDesignTerm[] = [
  { id: 'no', de: 'Nein — das Zeichen steht still', en: 'No — the mark stands still' },
  { id: 'yes', de: 'Ja — kinetisches Zeichen', en: 'Yes — a kinetic mark' },
]

// ── Nachschlagen ────────────────────────────────────────────────────────────

const DIMENSIONS_BY_ID = new Map(BRAND_DNA_DIMENSIONS.map(entry => [entry.id, entry]))

export function brandDnaDimension(dimensionId: string): BrandDnaDimension | undefined {
  return DIMENSIONS_BY_ID.get(dimensionId)
}

/** Ist diese Belegung EINER Dimension überhaupt erlaubt? */
export function isBrandDnaValue(dimensionId: string, valueId: string): boolean {
  return DIMENSIONS_BY_ID.get(dimensionId)?.values.some(value => value.id === valueId) ?? false
}

/**
 * Die Lesefassung eines Werts. Alles, was nicht mit `de` beginnt, bekommt die
 * englische — dieselbe Konvention wie `advisorOpenersFor`.
 */
export function brandTermLabel(term: BrandDesignTerm, locale: string): string {
  return locale.toLowerCase().startsWith('de') ? term.de : term.en
}

/** Findet einen Wert in einer beliebigen Liste dieser Datei. */
export function brandTermById(
  terms: readonly BrandDesignTerm[],
  id: string,
): BrandDesignTerm | undefined {
  return terms.find(term => term.id === id)
}

/**
 * DIE INVARIANTEN DER VOKABULARE als prüfbare Funktion (statt als Prosa im
 * Test): zehn Dimensionen, je fünf Werte, keine doppelte Id, kein leeres
 * Label. Nimmt eine BELIEBIGE Liste, damit der Beweis mutierte Fassungen
 * vorlegen kann — eine Prüfung, die nur die richtige Liste kennt, ist immer
 * grün.
 */
export function validateBrandDesignVocab(
  dimensions: readonly BrandDnaDimension[] = BRAND_DNA_DIMENSIONS,
): readonly string[] {
  const problems: string[] = []
  const seen = new Set<string>()

  if (dimensions.length !== 10) {
    problems.push(`${dimensions.length} Dimensionen — verlangt sind zehn (Davids Notiz 2026-08-30)`)
  }
  for (const dimension of dimensions) {
    if (seen.has(dimension.id)) problems.push(`doppelte Dimensions-Id: ${dimension.id}`)
    seen.add(dimension.id)
    if (!dimension.de.trim() || !dimension.en.trim()) {
      problems.push(`${dimension.id}: Label unvollständig`)
    }
    if (!dimension.hintDe.trim() || !dimension.hintEn.trim()) {
      problems.push(`${dimension.id}: Hinweiszeile unvollständig`)
    }
    if (dimension.values.length !== 5) {
      problems.push(`${dimension.id}: ${dimension.values.length} Werte — verlangt sind fünf`)
    }
    const values = new Set<string>()
    for (const value of dimension.values) {
      if (values.has(value.id)) problems.push(`${dimension.id}: doppelter Wert ${value.id}`)
      values.add(value.id)
      if (!value.de.trim() || !value.en.trim()) {
        problems.push(`${dimension.id}.${value.id}: Label unvollständig`)
      }
    }
  }
  return problems
}
