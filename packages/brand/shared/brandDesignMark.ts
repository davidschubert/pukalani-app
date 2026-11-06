import { brandDesignDefaultsFromDna, isBrandHex } from './brandDesign'
import type { BrandSceneColors } from './brandDesignScene'
import {
  BRAND_MARK_KINDS,
  BRAND_MARK_SETTINGS,
  BRAND_MARK_VARIANTS,
  brandTermById,
} from './brandDesignVocab'
import { BRAND_FONT_PAIRS, brandFontPair } from './brandFontPairs'
import { brandSlotValueView, formatBrandSlotStructured } from './brandSlotFormat'

/**
 * DAS ZEICHEN — die REGELN von Kapitel 4, pur (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.5, Davids Entscheidung §1.11 b, Pakete
 * D5a + D5b).
 *
 * ── VIER SESSIONS, EINE DATEI, WEIL SIE EINE KETTE SIND ───────────────────
 * `j.kind` ist die Richtung, `j.brief` das Briefing darüber, `j.examples` die
 * daraus GESETZTEN Beispiele und `j.pick` die Wahl darunter. Alle vier lesen
 * dieselben Quellen (DNA, Farbwelt, Schriftpaar) und schreiben in dieselbe
 * Vorschau — getrennt lägen Schreiber und Leser desselben Formats in vier
 * Dateien (dieselbe Begründung wie `brandDesignColor.ts` in D3 und
 * `brandDesignType.ts` in D4).
 *
 * `j.drafts` (Stufe 3, die KI-Bildlogos) steht hier BEWUSST NICHT: es ist
 * D5c, hat eine eigene Tabelle, einen eigenen Bucket und einen eigenen
 * Transport — und es ist die einzige der fünf Sessions, die nichts rechnet.
 *
 * ── DIE REIHENFOLGE IST DAS PRODUKT ───────────────────────────────────────
 * Erst die Richtung, dann das Briefing, dann der Satz. Wer bei den Bildern
 * anfängt, bekommt ein Logo ohne Begründung — genau das, was der Markt schon
 * verkauft (§1.7). Deshalb hängt `j.examples` an `j.kind` und nicht umgekehrt.
 *
 * ── DIE MASSE SIND GERECHNET, DIE PROSA IST GESCHRIEBEN ───────────────────
 * Das Briefing hat sechs Felder, und ZWEI davon schreibt kein Modell:
 * „Schutzraum & Mindestgrössen" und „Varianten" sind MASSE bzw. eine Liste aus
 * dem Vokabular. Das Qualitätsmerkmal der Session sagt es wörtlich — „the
 * clear space is a measure, not an adjective" —, und ein Modell, das eine
 * Zahl erfindet, erfüllt es nur zufällig. Die vier übrigen Felder (Charakter,
 * Formsprache, No-Gos, Einsatzorte) sind genau das, was ein Mensch sagen muss;
 * sie kommen aus dem Lauf und sind danach von Hand änderbar.
 * Dieselbe Arbeitsteilung wie in D3 (Zahlen der Kontrast-Matrix gerechnet,
 * Rollen-Namen aus dem Katalog).
 *
 * ── DIESE DATEI IST PUR: kein Vue, kein i18n, kein H3, kein Appwrite. ─────
 */

// ── Die Richtung (`j.kind`) ────────────────────────────────────────────────

/** Gibt es diese Richtung im Vokabular? Alles andere ist keine Wahl. */
export function isBrandMarkKind(kindId: string): boolean {
  return BRAND_MARK_KINDS.some(kind => kind.id === kindId)
}

/**
 * DIE VORBELEGUNG DER RICHTUNG AUS DER DNA (H5: „jede Session muss als
 * BESTÄTIGUNG durchlaufbar sein").
 *
 * Sie kommt aus `brandDesignDefaultsFromDna()` (D0) und damit aus der
 * Dimension „Visueller Stil" — dieselbe Tabelle, die auch Produkt 03 lesen
 * wird. Eine zweite Zuordnung hier wäre eine zweite Meinung darüber, was
 * „minimal" für ein Zeichen heisst.
 *
 * Ohne DNA gilt die WORTMARKE. Das ist kein Rückfall auf „das erste im
 * Katalog", sondern die Antwort mit dem geringsten Schaden: sie braucht keine
 * Erklärung, altert am langsamsten und ist für jede Marke setzbar — eine
 * Bildmarke als Vorgabe wäre eine Behauptung über eine Marke, die man noch
 * nicht kennt.
 */
export const BRAND_MARK_KIND_FALLBACK = 'word'

export function brandMarkKindDefault(dna: Readonly<Record<string, string>> | undefined): string {
  const fromDna = brandDesignDefaultsFromDna(dna).markKind
  return fromDna && isBrandMarkKind(fromDna) ? fromDna : BRAND_MARK_KIND_FALLBACK
}

// ── Die Masse (`j.brief`, Block „Schutzraum & Mindestgrössen") ─────────────

/**
 * DIE VIER ZAHLEN DES SCHUTZRAUMS — Setzungen, und deshalb an EINER Stelle.
 *
 * `clearSpaceCapFactor` sagt, WIE der Schutzraum gemessen wird: als Höhe des
 * Versalbuchstabens. Das ist die Regel, die jeder Designer kennt, sie
 * skaliert mit der Grösse und braucht keine Tabelle. Die Faustzahl 0,72 ·
 * Schriftgrad ist die übliche Versalhöhe unserer Katalog-Familien; sie steht
 * hier, weil der SVG-Satz sie ZEICHNEN muss (`brandMarkSvg.ts`) und ein
 * gezeichneter Schutzraum, der die Regel nicht einhält, schlimmer ist als
 * keiner.
 *
 * Die Mindestgrössen sind aus dem freigegebenen Prototyp übernommen
 * (`DS_MARK_BRIEF.clearSpace`): 96 px digital, 24 mm im Druck, Monogramm nie
 * unter 24 px. Sie sind Davids Inhalts-Gate wie jeder andere Text.
 */
export const BRAND_MARK_CLEAR_SPACE_CAP_FACTOR = 0.72
export const BRAND_MARK_MIN_WIDTH_PX = 96
export const BRAND_MARK_MIN_WIDTH_MM = 24
export const BRAND_MARK_MONOGRAM_MIN_PX = 24

/**
 * DIE ECKENRUNDUNG DES MONOGRAMMS aus der DNA-Dimension „Formsprache", in
 * PROZENT der Kachel-Kante.
 *
 * Prozent und nicht Pixel: dieselbe Zahl gilt für ein Favicon von 24 px und
 * für ein Ladenschild. Kantig ist wirklich 0 — eine „fast kantige" Ecke ist
 * die eine Entscheidung, die man auf jeder Grösse sieht und nie gewollt hat.
 */
export const BRAND_MARK_RADIUS_BY_FORM: Readonly<Record<string, number>> = {
  soft: 34,
  geometric: 12,
  irregular: 24,
  sharp: 0,
  mixed: 18,
}
/** Ohne DNA: die mittlere Rundung — sie behauptet am wenigsten. */
export const BRAND_MARK_RADIUS_FALLBACK = 18

export function brandMarkRadiusPercent(dna: Readonly<Record<string, string>> | undefined): number {
  const form = dna?.form ?? ''
  return BRAND_MARK_RADIUS_BY_FORM[form] ?? BRAND_MARK_RADIUS_FALLBACK
}

// ── Das Briefing (`j.brief`) ───────────────────────────────────────────────

/**
 * DIE SECHS FELDER, IN DIESER REIHENFOLGE — sie ist der Lese-Schlüssel des
 * Slot-Wertes (dasselbe Muster wie `RULE_BLOCK_LABELS` in D4).
 *
 * `written: true` heisst: dieses Feld schreibt der Lauf (oder der Mensch).
 * `written: false` heisst: es wird GERECHNET und eine Modell-Antwort dafür
 * wird verworfen (s. Kopf).
 */
export interface BrandMarkBriefField {
  readonly id: keyof BrandMarkBrief
  readonly de: string
  readonly en: string
  readonly written: boolean
}

export const BRAND_MARK_BRIEF_FIELDS: readonly BrandMarkBriefField[] = [
  { id: 'character', de: 'Charakter', en: 'Character', written: true },
  { id: 'formLanguage', de: 'Formsprache', en: 'Form language', written: true },
  { id: 'clearSpace', de: 'Schutzraum & Mindestgrößen', en: 'Clear space & minimum sizes', written: false },
  { id: 'variants', de: 'Varianten', en: 'Variants', written: false },
  { id: 'noGos', de: 'No-Gos', en: 'No-gos', written: true },
  { id: 'places', de: 'Einsatzorte', en: 'Places', written: true },
]

/** Das Briefing, das ein Designer bekommt — sechs Felder, je ein Absatz. */
export interface BrandMarkBrief {
  readonly character: string
  readonly formLanguage: string
  readonly clearSpace: string
  readonly variants: string
  readonly noGos: string
  readonly places: string
}

/**
 * Ein Feld ist EINE Aussage, nicht ein Kapitel. 420 Zeichen sind dieselbe
 * Grenze wie bei einer DNA-Begründung (`BRAND_DNA_REASON_MAX`) — lang genug
 * für drei Sätze, kurz genug, dass niemand ein Handbuch hineinschreibt.
 */
export const BRAND_MARK_BRIEF_FIELD_MAX = 420

/** Die Felder, die ein Lauf (oder ein Mensch) wirklich schreibt. */
export const BRAND_MARK_BRIEF_WRITTEN_FIELDS: readonly (keyof BrandMarkBrief)[]
  = BRAND_MARK_BRIEF_FIELDS.filter(field => field.written).map(field => field.id)

function isGerman(locale: string): boolean {
  return locale.toLowerCase().startsWith('de')
}

/** Eine Zahl mit Dezimalstelle in der Sprache des Lesers (Komma im Deutschen). */
function localizedNumber(value: number, locale: string): string {
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1)
  return isGerman(locale) ? text.replace('.', ',') : text
}

/**
 * DER SCHUTZRAUM-SATZ — gerechnet, nicht geschrieben.
 *
 * Er nennt die REGEL (Höhe des Versalbuchstabens) und die drei Zahlen. Der
 * Buchstabe kommt aus dem Namen der Marke: „Höhe des Versal-K" ist prüfbar,
 * „genug Platz" ist es nicht.
 */
export function brandMarkClearSpaceText(initial: string, locale: string): string {
  const letter = initial.trim().slice(0, 1).toUpperCase() || 'A'
  return isGerman(locale)
    ? `Schutzraum ringsum = Höhe des Versal-${letter}. Mindestbreite der Wortmarke `
      + `${BRAND_MARK_MIN_WIDTH_PX} px digital, ${BRAND_MARK_MIN_WIDTH_MM} mm im Druck; `
      + `das Monogramm nie unter ${BRAND_MARK_MONOGRAM_MIN_PX} px.`
    : `Clear space all round = the height of the capital ${letter}. Minimum wordmark width `
      + `${BRAND_MARK_MIN_WIDTH_PX} px on screen, ${BRAND_MARK_MIN_WIDTH_MM} mm in print; `
      + `the monogram never below ${BRAND_MARK_MONOGRAM_MIN_PX} px.`
}

/**
 * DER VARIANTEN-SATZ — die vier Varianten aus dem Vokabular, mit dem Ort,
 * an dem sie gebraucht werden. Kein Modell-Text: welche Varianten es gibt,
 * entscheidet `BRAND_MARK_VARIANTS`, und eine fünfte erfundene stünde im
 * Briefing, ohne dass sie je gesetzt würde.
 */
const VARIANT_PLACES: Readonly<Record<string, { de: string, en: string }>> = {
  primary: { de: 'der Normalfall auf hellem Grund', en: 'the normal case on a light ground' },
  inverted: { de: 'dunkle Flächen, Verpackung, Fotos', en: 'dark surfaces, packaging, photos' },
  mono: { de: 'Prägung, Stempel, Fax und Gravur', en: 'embossing, stamps, fax and engraving' },
  icon: { de: 'Avatar, App-Icon, Favicon', en: 'avatar, app icon, favicon' },
}

export function brandMarkVariantsText(locale: string): string {
  const de = isGerman(locale)
  const parts = BRAND_MARK_VARIANTS.map((variant) => {
    const place = VARIANT_PLACES[variant.id]
    const label = de ? variant.de : variant.en
    const note = place ? (de ? place.de : place.en) : ''
    return note ? `${label} (${note})` : label
  })
  return `${parts.join(', ')}.`
}

/** Die zwei gerechneten Felder — sie sind in jedem Briefing gleich aufgebaut. */
export function brandMarkDerivedBriefFields(
  initial: string,
  locale: string,
): Pick<BrandMarkBrief, 'clearSpace' | 'variants'> {
  return {
    clearSpace: brandMarkClearSpaceText(initial, locale),
    variants: brandMarkVariantsText(locale),
  }
}

/**
 * ' · ' und Zeilenumbrüche haben im Slot-Wert eine BEDEUTUNG (s.
 * `brandMarkExamplesSlotValue`) — ein Feld, das sie enthält, wäre beim
 * Zurücklesen zwei Felder. Ersetzt statt abgelehnt, wie in `brandReading.ts`.
 */
function cleanField(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s*·\s*/g, ' — ')
    .trim()
    .slice(0, BRAND_MARK_BRIEF_FIELD_MAX)
}

/** Die rohe Antwort des Modells: jedes Feld `unknown`, weil nichts geprüft ist. */
export interface BrandMarkBriefRaw {
  character?: unknown
  formLanguage?: unknown
  noGos?: unknown
  places?: unknown
  /** Ein Modell, das die gerechneten Felder trotzdem füllt, wird ignoriert. */
  clearSpace?: unknown
  variants?: unknown
}

export interface BrandMarkBriefClampResult {
  /** `null`, sobald ein geschriebenes Feld fehlt — ein halbes Briefing gibt es nicht. */
  readonly brief: BrandMarkBrief | null
  /** Die leer gebliebenen geschriebenen Felder — die Route entscheidet daraus. */
  readonly missing: readonly (keyof BrandMarkBrief)[]
}

/**
 * DIE KLEMMUNG DES BRIEFINGS.
 *
 * ── DIE ZWEI GERECHNETEN FELDER WERDEN ÜBERSCHRIEBEN, NICHT GEPRÜFT ──────
 * Was das Modell zu Schutzraum und Varianten sagt, ist bestenfalls dieselbe
 * Aussage und schlimmstenfalls eine andere Zahl. Beides wäre eine zweite
 * Wahrheit über eine Setzung — sie fällt weg, ohne dass der Lauf deswegen
 * scheitert.
 *
 * ── VIER LEERE FELDER SIND KEIN BRIEFING ─────────────────────────────────
 * Fehlt eines der vier geschriebenen Felder, ist der Lauf ein Fehlschlag und
 * nichts wird geschrieben (dieselbe Regel wie „neun Zeilen sind kein
 * Vorschlag" beim DNA-Lauf): ein Briefing mit leerem Charakter-Absatz wäre
 * ein Prüfstein, an dem sich nichts prüfen lässt.
 */
export function clampBrandMarkBrief(
  raw: BrandMarkBriefRaw | null | undefined,
  initial: string,
  locale: string,
): BrandMarkBriefClampResult {
  const written = {
    character: cleanField(raw?.character),
    formLanguage: cleanField(raw?.formLanguage),
    noGos: cleanField(raw?.noGos),
    places: cleanField(raw?.places),
  }
  const missing = BRAND_MARK_BRIEF_WRITTEN_FIELDS
    .filter(id => !(written[id as keyof typeof written] ?? '').length)
  if (missing.length > 0) return { brief: null, missing }
  return {
    brief: { ...written, ...brandMarkDerivedBriefFields(initial, locale) },
    missing: [],
  }
}

/** Der Slot-Wert von `j.brief` — sechs beschriftete Blöcke in Katalog-Reihenfolge. */
export function brandMarkBriefSlotValue(brief: BrandMarkBrief, locale: string): string {
  const de = isGerman(locale)
  return formatBrandSlotStructured(BRAND_MARK_BRIEF_FIELDS.map(field => ({
    label: de ? field.de : field.en,
    body: brief[field.id],
  })))
}

/**
 * DER WEG ZURÜCK — `null`, sobald die Form nicht stimmt (fail-soft wie
 * überall).
 *
 * Gelesen wird nach POSITION, nicht nach Beschriftung: die Überschriften
 * stehen in der INHALTSSPRACHE der Marke, und ein Leser, der sie erkennen
 * müsste, wäre bei der dritten Sprache falsch (dieselbe Arbeitsteilung wie
 * in D3/D4).
 */
export function parseBrandMarkBriefSlotValue(value: string): BrandMarkBrief | null {
  const view = brandSlotValueView('structured', value)
  if (view.kind !== 'blocks' || view.blocks.length !== BRAND_MARK_BRIEF_FIELDS.length) return null
  const brief: Record<string, string> = {}
  for (const [index, field] of BRAND_MARK_BRIEF_FIELDS.entries()) {
    const body = view.blocks[index]?.body.trim() ?? ''
    if (!body) return null
    brief[field.id] = body
  }
  return brief as unknown as BrandMarkBrief
}

/**
 * DAS BRIEFING ALS ZEILEN FÜR DAS PRESET (`mark.brief`, §2.8) — gebaut aus
 * DEMSELBEN Katalog wie der Slot-Wert (dieselbe Zusage wie `brandTypeRuleLines`
 * in D4: was das Kapitel zeigt, steht wörtlich im Preset).
 */
export function brandMarkBriefLines(brief: BrandMarkBrief, locale: string): string[] {
  const de = isGerman(locale)
  return BRAND_MARK_BRIEF_FIELDS.map(field => `${de ? field.de : field.en}: ${brief[field.id]}`)
}

// ── Die Setzungen (`j.examples`) ───────────────────────────────────────────

/** Grund, Tinte und die Linie des Schutzraums EINER Variante. */
export interface BrandMarkVariantColors {
  /** Id aus `BRAND_MARK_VARIANTS`. */
  readonly id: string
  readonly ground: string
  readonly ink: string
  /** Die gestrichelte Schutzraum-Linie — sie ist Hilfslinie, nie Marke. */
  readonly frame: string
}

/**
 * DIE VIER VARIANTEN AUS DER BESTÄTIGTEN FARBWELT — jede Farbe ist eine
 * Stufe, keine Erfindung.
 *
 *  · `primary`  Tinte = Rampe 900 auf dem Papierton. Der Normalfall.
 *  · `inverted` dieselbe Tinte wird zum Grund, das Papier zur Schrift.
 *  · `mono`     EINE Tinte: die tiefste Neutral-Stufe auf Weiss. Prägung und
 *               Stempel kennen keine zweite Farbe — und keinen Marken-Ton,
 *               deshalb steht hier bewusst die neutrale und nicht die 900er.
 *  · `icon`     Monogramm-Fläche: Rampe 700 (eine Stufe heller als die Tinte,
 *               damit die Kachel neben der Wortmarke nicht als Loch wirkt).
 *
 * Der Prototyp hatte hier feste Kailua-Hex-Werte; die gibt es im Produkt
 * nicht (dieselbe Entscheidung wie bei `BRAND_SCENE_FALLBACK_BASE`).
 */
export function brandMarkVariantColors(colors: BrandSceneColors): BrandMarkVariantColors[] {
  const ink = colors.rampLight[900]
  return [
    { id: 'primary', ground: colors.paper, ink, frame: colors.rampLight[400] },
    { id: 'inverted', ground: ink, ink: colors.paper, frame: colors.rampLight[300] },
    { id: 'mono', ground: '#ffffff', ink: colors.neutral[950], frame: colors.neutral[400] },
    { id: 'icon', ground: colors.rampLight[700], ink: colors.paper, frame: colors.neutral[200] },
  ]
}

/**
 * DER ANFANGSBUCHSTABE FÜR DAS MONOGRAMM.
 *
 * Buchstaben und Ziffern zählen, alles andere nicht: ein Name wie „&Söhne"
 * hat als Monogramm ein „S", kein „&". Leer bleibt es nie — ohne brauchbares
 * Zeichen steht der Platzhalter, damit die Kachel nicht als leeres Quadrat
 * im Kapitel steht.
 */
export const BRAND_MARK_INITIAL_FALLBACK = 'A'

export function brandMarkInitial(title: string): string {
  const match = title.match(/[\p{L}\p{N}]/u)
  return (match?.[0] ?? BRAND_MARK_INITIAL_FALLBACK).toUpperCase()
}

/**
 * DIE VOLLSTÄNDIGE ANWEISUNG FÜR DEN SATZ — alles, was `brandMarkSvg.ts`
 * braucht, und nichts, was es selbst entscheiden dürfte.
 *
 * Der Renderer bekommt FERTIGE Werte (Hex, Stack, Zahlen) und trifft keine
 * einzige Entscheidung mehr. Deshalb ist er als reine Zeichenketten-Funktion
 * prüfbar, und deshalb zeigt die Bühne garantiert dasselbe wie das Preset.
 */
export interface BrandMarkSpec {
  /** Der Name, wie er gesetzt wird. */
  readonly wordmark: string
  readonly initial: string
  /** Id aus `BRAND_FONT_PAIRS` — sie steht im Slot-Wert. */
  readonly pairId: string
  readonly headingFamily: string
  readonly headingStack: string
  readonly headingWeight: number
  /** Laufweite in px, aus `i.rules`. */
  readonly headingTracking: number
  readonly headingUppercase: boolean
  /** Id aus `BRAND_MARK_KINDS`. */
  readonly kind: string
  /** Eckenrundung des Monogramms in Prozent der Kante. */
  readonly radiusPercent: number
  readonly variants: readonly BrandMarkVariantColors[]
}

export interface BrandMarkSpecInput {
  readonly title: string
  readonly pairId: string
  readonly kind: string
  readonly dna: Readonly<Record<string, string>> | undefined
  readonly colors: BrandSceneColors
  readonly headingWeight?: number
  readonly headingTracking?: number
  readonly headingUppercase?: boolean
}

/**
 * DIE ANWEISUNG AUS DEN BESTÄTIGTEN QUELLEN — Name, Paar, Regeln, Farbwelt,
 * DNA. Sie ist IMMER vollständig: eine unbekannte Paar-Id fällt auf das erste
 * des Katalogs zurück (wie in `brandSceneFonts`), ein leerer Name auf den
 * Platzhalter des Aufrufers.
 */
export function brandMarkSpec(input: BrandMarkSpecInput): BrandMarkSpec {
  const pair = brandFontPair(input.pairId) ?? BRAND_FONT_PAIRS[0]!
  const wordmark = input.title.trim()
  return {
    wordmark,
    initial: brandMarkInitial(wordmark),
    pairId: pair.id,
    headingFamily: pair.headingFamily,
    headingStack: pair.headingStack,
    headingWeight: input.headingWeight ?? 400,
    headingTracking: input.headingTracking ?? 0,
    headingUppercase: input.headingUppercase ?? false,
    kind: isBrandMarkKind(input.kind) ? input.kind : BRAND_MARK_KIND_FALLBACK,
    radiusPercent: brandMarkRadiusPercent(input.dna),
    variants: brandMarkVariantColors(input.colors),
  }
}

// ── Der Slot-Wert von `j.examples` ─────────────────────────────────────────
//
// SECHS BLÖCKE: ein Kopf (Name, Monogramm-Buchstabe, Schrift), vier Varianten
// mit ihren drei Farben, ein Fuss mit den Massen. Gelesen wird nach POSITION,
// wie bei `j.brief`.
//
// WARUM NICHT DAS SVG SELBST IM SLOT STEHT: der Wert reist ins Brand-Dokument
// und wird dort GELESEN. Ein Absatz aus 400 Zeichen `<path d="…">` ist für
// einen Menschen keine Auskunft, und für die Maschine ist er eine zweite
// Fassung der Wahrheit — das SVG entsteht deterministisch aus genau diesen
// Werten (`brandMarkSvg.ts`), es MUSS also nicht gespeichert werden.

const HEAD_LABELS: Readonly<Record<string, { de: string, en: string }>> = {
  wordmark: { de: 'Wortmarke', en: 'Wordmark' },
  monogram: { de: 'Monogramm', en: 'Monogram' },
  font: { de: 'Schrift', en: 'Typeface' },
}
const INK_LABELS = { de: 'Tinte', en: 'Ink' }
const GROUND_LABELS = { de: 'Grund', en: 'Ground' }
const FRAME_LABELS = { de: 'Schutzraum-Linie', en: 'Clear-space line' }
const SETTINGS_BLOCK = { de: 'Setzungen', en: 'Settings' }
const MEASURES_BLOCK = { de: 'Maße', en: 'Measures' }

function labelOf(term: { de: string, en: string }, locale: string): string {
  return isGerman(locale) ? term.de : term.en
}

function variantLabel(variantId: string, locale: string): string {
  const term = brandTermById(BRAND_MARK_VARIANTS, variantId)
  return term ? labelOf(term, locale) : variantId
}

/** Der Mass-Satz unter den Setzungen — dieselben Zahlen wie im Briefing. */
export function brandMarkMeasuresText(spec: BrandMarkSpec, locale: string): string {
  const de = isGerman(locale)
  return [
    de
      ? `Schutzraum = Höhe des Versal-${spec.initial}`
      : `Clear space = height of the capital ${spec.initial}`,
    de
      ? `Wortmarke mind. ${BRAND_MARK_MIN_WIDTH_PX} px / ${BRAND_MARK_MIN_WIDTH_MM} mm`
      : `Wordmark min. ${BRAND_MARK_MIN_WIDTH_PX} px / ${BRAND_MARK_MIN_WIDTH_MM} mm`,
    de
      ? `Monogramm mind. ${BRAND_MARK_MONOGRAM_MIN_PX} px`
      : `Monogram min. ${BRAND_MARK_MONOGRAM_MIN_PX} px`,
    de
      ? `Eckenradius ${localizedNumber(spec.radiusPercent, locale)} %`
      : `Corner radius ${localizedNumber(spec.radiusPercent, locale)}%`,
  ].join(' · ')
}

export function brandMarkExamplesSlotValue(spec: BrandMarkSpec, locale: string): string {
  const head = [
    `${labelOf(HEAD_LABELS.wordmark!, locale)}: ${spec.wordmark}`,
    `${labelOf(HEAD_LABELS.monogram!, locale)}: ${spec.initial}`,
    `${labelOf(HEAD_LABELS.font!, locale)}: ${spec.headingFamily}`,
  ].join(' · ')

  const blocks = [
    { label: labelOf(SETTINGS_BLOCK, locale), body: head },
    ...spec.variants.map(variant => ({
      label: variantLabel(variant.id, locale),
      body: [
        `${labelOf(INK_LABELS, locale)} ${variant.ink}`,
        `${labelOf(GROUND_LABELS, locale)} ${variant.ground}`,
        `${labelOf(FRAME_LABELS, locale)} ${variant.frame}`,
      ].join(' · '),
    })),
    { label: labelOf(MEASURES_BLOCK, locale), body: brandMarkMeasuresText(spec, locale) },
  ]
  return formatBrandSlotStructured(blocks)
}

/** Was aus einem gespeicherten `j.examples` zurückgewonnen werden kann. */
export interface BrandMarkExamplesValue {
  readonly wordmark: string
  readonly initial: string
  readonly headingFamily: string
  readonly variants: readonly BrandMarkVariantColors[]
}

const HEX_RE = /#[0-9a-f]{6}/i

function hexIn(part: string): string | null {
  const match = part.match(HEX_RE)
  return match && isBrandHex(match[0]) ? match[0].toLowerCase() : null
}

/**
 * DER WEG ZURÜCK — `null`, sobald die Form nicht stimmt.
 *
 * Die drei Farben werden nach POSITION gelesen (Tinte, Grund, Linie) und
 * müssen echte Hex sein; die Beschriftung davor ist Lesehilfe und wird
 * bewusst NICHT geprüft (sie steht in der Inhaltssprache der Marke).
 */
export function parseBrandMarkExamplesSlotValue(value: string): BrandMarkExamplesValue | null {
  const view = brandSlotValueView('structured', value)
  if (view.kind !== 'blocks' || view.blocks.length !== BRAND_MARK_VARIANTS.length + 2) return null

  const head = (view.blocks[0]?.body ?? '').split('·').map(part => part.trim())
  if (head.length !== 3) return null
  const afterColon = (part: string): string => part.slice(part.indexOf(':') + 1).trim()
  const wordmark = afterColon(head[0]!)
  const initial = afterColon(head[1]!)
  const headingFamily = afterColon(head[2]!)
  if (!wordmark || !initial || !headingFamily) return null

  const variants: BrandMarkVariantColors[] = []
  for (const [index, variant] of BRAND_MARK_VARIANTS.entries()) {
    const parts = (view.blocks[index + 1]?.body ?? '').split('·').map(part => part.trim())
    if (parts.length !== 3) return null
    const ink = hexIn(parts[0]!)
    const ground = hexIn(parts[1]!)
    const frame = hexIn(parts[2]!)
    if (!ink || !ground || !frame) return null
    variants.push({ id: variant.id, ink, ground, frame })
  }
  return { wordmark, initial, headingFamily, variants }
}

// ── Die Wahl (`j.pick`) ────────────────────────────────────────────────────

/** Gibt es diese Setzung? `wordmark` oder `monogram`, mehr nicht. */
export function isBrandMarkSetting(settingId: string): boolean {
  return BRAND_MARK_SETTINGS.some(setting => setting.id === settingId)
}

/**
 * WELCHE SETZUNG WIRD VORGESCHLAGEN — die, die zur Richtung passt.
 *
 * Bei `monogram` ist es das Monogramm, sonst die Wortmarke: eine Marke, die
 * sich für ein Monogramm entschieden hat, soll im Briefing nicht die
 * Wortmarke als Vorzugs-Beispiel tragen. Bild- und Kombinationsmarke bekommen
 * die Wortmarke — der Bild-TEIL ist genau das, was hier NICHT gesetzt wird
 * (§1.4: kein Logo-Versprechen), und die Wortmarke ist der Teil, den es gibt.
 */
export function brandMarkPickDefault(kindId: string): string {
  return kindId === 'monogram' ? 'monogram' : 'wordmark'
}

// ── Die Invarianten als prüfbare Funktion ──────────────────────────────────

/**
 * HÄLT DER KATALOG SEINE ZUSAGEN? Nimmt beliebige Listen, damit der Beweis
 * mutierte Fassungen vorlegen kann — eine Prüfung, die nur die richtigen
 * Listen kennt, ist immer grün (dieselbe Regel wie `validateBrandTypeRules`).
 */
export function validateBrandMarkRules(
  kinds: readonly { readonly id: string }[] = BRAND_MARK_KINDS,
  variants: readonly { readonly id: string }[] = BRAND_MARK_VARIANTS,
  radii: Readonly<Record<string, number>> = BRAND_MARK_RADIUS_BY_FORM,
): readonly string[] {
  const problems: string[] = []

  const kindIds = new Set<string>()
  for (const kind of kinds) {
    if (kindIds.has(kind.id)) problems.push(`doppelte Richtungs-Id: ${kind.id}`)
    kindIds.add(kind.id)
  }
  if (!kindIds.has(BRAND_MARK_KIND_FALLBACK)) {
    problems.push(`der Rückfall "${BRAND_MARK_KIND_FALLBACK}" steht nicht im Katalog`)
  }

  for (const variant of variants) {
    if (!VARIANT_PLACES[variant.id]) {
      problems.push(`Variante ohne Einsatzort im Briefing: ${variant.id}`)
    }
  }

  for (const [form, percent] of Object.entries(radii)) {
    if (percent < 0 || percent > 50) {
      problems.push(`Eckenradius ausserhalb 0…50 %: ${form} = ${percent}`)
    }
  }

  // Die vier geschriebenen Felder MÜSSEN vier bleiben: der Prompt zählt sie
  // auf, und ein fünftes ohne Prompt-Zeile bliebe für immer leer.
  const written = BRAND_MARK_BRIEF_FIELDS.filter(field => field.written)
  if (written.length !== 4) {
    problems.push(`geschriebene Briefing-Felder: ${written.length} statt 4`)
  }
  const fieldIds = new Set<string>()
  for (const field of BRAND_MARK_BRIEF_FIELDS) {
    if (fieldIds.has(field.id)) problems.push(`doppeltes Briefing-Feld: ${field.id}`)
    fieldIds.add(field.id)
    if (!field.de.trim() || !field.en.trim()) problems.push(`${field.id}: Beschriftung unvollständig`)
  }

  return problems
}
