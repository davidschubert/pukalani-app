import { brandDesignDefaultsFromDna } from './brandDesign'
import { BRAND_TYPE_SCALES } from './brandDesignVocab'
import {
  BRAND_DECLARED_FONT_WEIGHTS,
  BRAND_FONT_PAIRS,
  BRAND_MONO_FAMILY,
  BRAND_MONO_STACK,
  type BrandFontPair,
  brandFontPair,
  brandFontPairFamilies,
} from './brandFontPairs'
import { brandSlotValueView, formatBrandSlotStructured } from './brandSlotFormat'

/**
 * DIE TYPOGRAFIE — die REGELN von Kapitel 3, pur (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.4, Paket D4).
 *
 * ── DREI SESSIONS, EINE DATEI, WEIL SIE EINE KETTE SIND ───────────────────
 * `i.pair` ist die Wahl, `i.scale` die Hierarchie darüber, `i.rules` die drei
 * Stellschrauben an der Überschrift. Alle drei schreiben in DIESELBE Vorschau
 * und lesen dieselbe Vorbelegung aus der DNA — getrennt lägen Schreiber und
 * Leser desselben Formats in drei Dateien (dieselbe Begründung wie
 * `brandDesignColor.ts`, D3).
 *
 * ── DIE SCHRIFTEN STEHEN HIER NICHT ───────────────────────────────────────
 * Der KATALOG (sechs Paare, Stacks, Mono-Rolle) gehört `brandFontPairs.ts`,
 * und die DEKLARATION der Familien gehört `app/assets/css/brand-fonts.css` —
 * `@nuxt/fonts` self-hostet nur, was der Build im CSS sieht (§2.17). Diese
 * Datei entscheidet nur, WELCHES Paar vorgeschlagen wird und WAS daran
 * eingestellt werden darf.
 *
 * ── „NIE MEHR ALS DREI SCHRIFTEN" IST EINE INVARIANTE, KEIN VORSATZ ───────
 * Ein Paar hat zwei Rollen (Überschrift, Fliesstext), die Mono-Rolle steht
 * FEST daneben (Herkunft, Preise, Code) — zusammen höchstens drei Familien.
 * `brandTypeFamilies()` rechnet sie aus, `validateBrandTypeRules()` prüft die
 * Obergrenze für JEDES Paar des Katalogs, und der Test legt eine mutierte
 * Fassung vor. Ohne diese Gegenprobe wäre die Regel eine Behauptung im
 * Kommentar.
 *
 * ── WAS EINGESTELLT WERDEN DARF, IST ENG UND HAT EINEN GRUND ──────────────
 * Gewicht 300…700, Laufweite −1…+1 px, Versalien ja/nein. Die Grenzen sind
 * Setzungen und gehören zu Davids Inhalts-Gate wie die Texte; die BEGRÜNDUNG
 * steht an ihrer Konstante. Eine vierte Stellschraube (Zeilenhöhe, Laufweite
 * des Fliesstexts) gibt es bewusst nicht: sie wäre eine Entscheidung, die
 * niemand ohne Fachwissen treffen kann, und das Kapitel verspricht das
 * Gegenteil.
 *
 * DIESE DATEI IST PUR: kein Vue, kein i18n, kein H3, kein Appwrite.
 */

// ── Die Hierarchie (`i.scale`) ─────────────────────────────────────────────

/**
 * DIE HIERARCHIE ALS EINE ZAHL — der Faktor, mit dem die Überschriften-Grösse
 * multipliziert wird (1 = der ruhige Vorschlag).
 *
 * Übernommen aus dem freigegebenen Prototyp (`.playground/app/pages/brand/
 * demo/design/type.vue`): ruhig 1, dicht 0,85, plakativ 1,25. Der Fliesstext
 * bleibt unangetastet — eine Hierarchie ändert die ABSTÄNDE zwischen den
 * Ebenen, nicht die Lesbarkeit des Absatzes.
 */
export const BRAND_TYPE_SCALE_FACTORS: Readonly<Record<string, number>> = {
  calm: 1,
  dense: 0.85,
  loud: 1.25,
}

/** Die Überschriften-Grösse des Specimen in rem, bei Faktor 1. */
export const BRAND_TYPE_H1_REM = 2.6
/** Die Fliesstext-Grösse des Specimen in rem — sie ist der Nenner der Ratio. */
export const BRAND_TYPE_BODY_REM = 1

/** Der Faktor einer Hierarchie — unbekannte Id ⇒ der ruhige Vorschlag. */
export function brandTypeScaleFactor(scaleId: string): number {
  return BRAND_TYPE_SCALE_FACTORS[scaleId] ?? BRAND_TYPE_SCALE_FACTORS.calm!
}

/**
 * DAS VERHÄLTNIS H1 : FLIESSTEXT — GERECHNET, nicht danebengeschrieben.
 *
 * Der Prototyp führte Faktor und Ratio als zwei Felder („dicht, 1 : 2,0"),
 * und die zweite Zahl passte nicht zur ersten (0,85 · 2,6 = 2,21). Zwei
 * Wahrheiten über dieselbe Hierarchie: die eine steht auf der Karte, die
 * andere im Specimen. Hier gibt es nur die eine.
 */
export function brandTypeScaleRatio(scaleId: string): number {
  return (BRAND_TYPE_H1_REM * brandTypeScaleFactor(scaleId)) / BRAND_TYPE_BODY_REM
}

/** „1 : 2,6" — im Deutschen mit Komma, sonst mit Punkt (wie `brandRatioText`). */
export function brandTypeRatioText(scaleId: string, locale: string): string {
  const text = brandTypeScaleRatio(scaleId).toFixed(1)
  return `1 : ${locale.toLowerCase().startsWith('de') ? text.replace('.', ',') : text}`
}

export function isBrandTypeScale(scaleId: string): boolean {
  return BRAND_TYPE_SCALES.some(scale => scale.id === scaleId)
}

// ── Die Schrift-Regeln (`i.rules`) ─────────────────────────────────────────

/**
 * DIE DREI STELLSCHRAUBEN AN DER ÜBERSCHRIFT.
 *
 * Der Fliesstext steht bewusst NICHT darin: er ist die Fläche, auf der
 * gelesen wird, und jede Einstellung daran kostet Lesbarkeit, ohne der Marke
 * etwas zu geben (Qualitätsmerkmal `i.pair`: „Body text stays readable at
 * small sizes").
 */
export interface BrandTypeRules {
  /** 300…700, in Hunderter-Schritten. */
  readonly headingWeight: number
  /** Laufweite in px, −1…+1 (negativ = enger). */
  readonly headingTracking: number
  readonly headingUppercase: boolean
}

/**
 * DIE ANGEBOTENEN GEWICHTE.
 *
 * 300 ist dabei, weil eine leichte Überschrift eine echte typografische
 * Haltung ist („ruhig und luftig"); 800/900 nicht, weil davon in den
 * kuratierten Familien nichts deklariert ist und der Browser den Schnitt
 * sonst FÄLSCHT — genau die stille Verfälschung, die das Kapitel beurteilen
 * lassen soll. Welche Familie welchen Schnitt WIRKLICH hat, sagt
 * `BRAND_DECLARED_FONT_WEIGHTS` (aus dem CSS gepflegt).
 */
export const BRAND_TYPE_WEIGHTS: readonly number[] = [300, 400, 500, 600, 700]
export const BRAND_TYPE_WEIGHT_MIN = 300
export const BRAND_TYPE_WEIGHT_MAX = 700

/**
 * DIE ANGEBOTENEN LAUFWEITEN, in px.
 *
 * Eng gehalten (−1…+1): Laufweite ist eine Feinkorrektur an der Überschrift,
 * keine Gestaltungsachse. Der Prototyp bot bis +4 px an — das ist die
 * Sperrschrift eines Ladenschilds und macht jede Überschrift darunter
 * unruhig. Wer Sperrschrift will, schaltet Versalien ein; dafür ist die
 * dritte Regel da.
 */
export const BRAND_TYPE_TRACKINGS: readonly number[] = [-1, -0.5, 0, 0.5, 1]
export const BRAND_TYPE_TRACKING_MIN = -1
export const BRAND_TYPE_TRACKING_MAX = 1

/** Die Vorgabe, solange nichts eingestellt ist — der ruhige, ehrliche Fall. */
export const BRAND_TYPE_DEFAULT_RULES: BrandTypeRules = {
  headingWeight: 400,
  headingTracking: 0,
  headingUppercase: false,
}

/**
 * EIN WERT INS ERLAUBTE ZURÜCK — geklemmt, nicht verworfen.
 *
 * Ein Gewicht von 900 aus einem alten Slot (oder aus einem Modell-Entwurf,
 * der hier nichts zu suchen hätte) wird zu 700 und nicht zu `null`: die
 * Vorschau soll stehen. Was NICHT ins Raster passt, rastet auf den nächsten
 * angebotenen Wert ein — sonst stünde in den Chips nichts ausgewählt und der
 * Mensch sähe eine Einstellung, die er nicht wiederfindet.
 */
export function brandTypeClampWeight(weight: number): number {
  if (!Number.isFinite(weight)) return BRAND_TYPE_DEFAULT_RULES.headingWeight
  const bounded = Math.min(BRAND_TYPE_WEIGHT_MAX, Math.max(BRAND_TYPE_WEIGHT_MIN, weight))
  return BRAND_TYPE_WEIGHTS.reduce((best, option) =>
    (Math.abs(option - bounded) < Math.abs(best - bounded) ? option : best), BRAND_TYPE_WEIGHTS[0]!)
}

export function brandTypeClampTracking(tracking: number): number {
  if (!Number.isFinite(tracking)) return BRAND_TYPE_DEFAULT_RULES.headingTracking
  const bounded = Math.min(BRAND_TYPE_TRACKING_MAX, Math.max(BRAND_TYPE_TRACKING_MIN, tracking))
  return BRAND_TYPE_TRACKINGS.reduce((best, option) =>
    (Math.abs(option - bounded) < Math.abs(best - bounded) ? option : best), BRAND_TYPE_TRACKINGS[0]!)
}

/** Beide Zahlen einer Regel-Menge ins Erlaubte. */
export function brandTypeNormalizeRules(rules: Partial<BrandTypeRules>): BrandTypeRules {
  return {
    headingWeight: brandTypeClampWeight(rules.headingWeight ?? BRAND_TYPE_DEFAULT_RULES.headingWeight),
    headingTracking: brandTypeClampTracking(
      rules.headingTracking ?? BRAND_TYPE_DEFAULT_RULES.headingTracking),
    headingUppercase: rules.headingUppercase ?? BRAND_TYPE_DEFAULT_RULES.headingUppercase,
  }
}

/**
 * HAT DIESE FAMILIE DIESEN SCHNITT WIRKLICH? — die Antwort kommt aus der
 * CSS-Deklaration, nicht aus dem Wunsch.
 *
 * PT Sans und PT Serif gibt es nur in 400 und 700. Ein Gewicht dazwischen
 * malt der Browser SELBST (synthetic bold/light): die Konturen werden
 * aufgeblasen oder ausgedünnt, und was das Kapitel dann zeigt, ist keine
 * Schrift, die es gibt. Deshalb steht am Regler ein Hinweis statt einer
 * stillen Näherung (Prototyp-Verhalten, hier auf den Katalog gehoben).
 */
export function brandTypeWeightAvailable(family: string, weight: number): boolean {
  const weights = BRAND_DECLARED_FONT_WEIGHTS[family]
  return weights ? weights.includes(weight) : false
}

/**
 * DIE FAMILIE, DEREN SCHNITT GEFÄLSCHT WÜRDE — `null`, wenn alles echt ist.
 *
 * Geprüft wird nur die ÜBERSCHRIFT: die drei Regeln fassen den Fliesstext
 * nicht an, und der läuft immer auf 400 (deklariert für jede Familie).
 */
export function brandTypeWeightWarning(pairId: string, weight: number): string | null {
  const pair = brandFontPair(pairId)
  if (!pair) return null
  return brandTypeWeightAvailable(pair.headingFamily, weight) ? null : pair.headingFamily
}

/**
 * DIE FAMILIEN EINER TYPOGRAFIE — Paar plus die feste Mono, ohne Doppelung.
 *
 * Das ist die Zahl, an der die Drei-Schriften-Regel hängt: `humanist` nutzt
 * eine Familie für beide Rollen und kommt auf zwei, jedes andere Paar auf
 * drei. Vier wäre ein Fehler im Katalog, kein Geschmack.
 */
export function brandTypeFamilies(pairId: string): readonly string[] {
  const pair = brandFontPair(pairId)
  if (!pair) return [BRAND_MONO_FAMILY]
  return [...new Set([...brandFontPairFamilies(pair), BRAND_MONO_FAMILY])]
}

export const BRAND_TYPE_MAX_FAMILIES = 3

// ── Die Vorbelegung (H5) ───────────────────────────────────────────────────

export interface BrandTypeDefaults {
  /** Id aus `BRAND_FONT_PAIRS`. */
  pair: string
  /** Id aus `BRAND_TYPE_SCALES`. */
  scale: string
  rules: BrandTypeRules
}

/**
 * DAS KAPITEL BELEGT SICH SELBST VOR (H5: „jede Session muss als BESTÄTIGUNG
 * durchlaufbar sein") — aus der bestätigten DNA, nicht aus dem Nichts.
 *
 * Paar und Hierarchie kommen aus `brandDesignDefaultsFromDna()` (D0): die
 * Dimension „Typografie" wählt das Paar, „Komposition" die Hierarchie. Beides
 * ist eine deterministische Zuordnung, kein Modell-Lauf — zweimal Aufschlagen
 * zeigt dasselbe Paar, und ohne DNA gilt das erste des Katalogs.
 *
 * DIE REGELN SIND BEWUSST NICHT AUS DER DNA GERECHNET. Es gäbe eine
 * naheliegende Zuordnung („mutig ⇒ 700, Versalien an"), aber sie wäre
 * geraten: Gewicht und Laufweite hängen an der GEWÄHLTEN Familie, nicht an
 * einer Stimmung, und ein vorgeschlagenes 700 auf PT Serif wäre sofort der
 * gefälschte Schnitt von oben. Vorgeschlagen wird deshalb der ruhige Fall,
 * den jede Familie wirklich hat.
 */
export function brandTypeDefaults(
  dna: Readonly<Record<string, string>> | undefined,
): BrandTypeDefaults {
  const fromDna = brandDesignDefaultsFromDna(dna)
  const pair = fromDna.pair && brandFontPair(fromDna.pair) ? fromDna.pair : BRAND_FONT_PAIRS[0]!.id
  const scale = fromDna.scale && isBrandTypeScale(fromDna.scale) ? fromDna.scale : BRAND_TYPE_SCALES[0]!.id
  return { pair, scale, rules: { ...BRAND_TYPE_DEFAULT_RULES } }
}

/** Das Paar zu einer Id — mit dem Rückfall des Katalogs (nie `undefined`). */
export function brandTypePairOrFirst(pairId: string): BrandFontPair {
  return brandFontPair(pairId) ?? BRAND_FONT_PAIRS[0]!
}

// ── Der Slot-Wert von `i.rules` ────────────────────────────────────────────
//
// DASSELBE MUSTER WIE IN D3 (`brandSlotFormat.ts`): beschriftete Blöcke,
// gelesen nach POSITION (der Katalog sagt, welcher Block welcher ist) und
// nach INHALT (die Zahl, das Ja/Nein). Die Überschriften stehen in der
// INHALTSSPRACHE der Marke — ein Leser, der sie erkennen müsste, wäre bei der
// dritten Sprache falsch.
//
// ' · ' trennt Wert und Erklärung; keiner der Werte kann es enthalten (eine
// Zahl, ein Ja/Nein, ein Schrift-Stack ohne Mittelpunkt).

interface BrandTypeRuleBlock {
  readonly de: string
  readonly en: string
}

/** Die vier Blöcke, in DIESER Reihenfolge — sie ist der Lese-Schlüssel. */
const RULE_BLOCK_LABELS: readonly BrandTypeRuleBlock[] = [
  { de: 'Überschrift-Gewicht', en: 'Heading weight' },
  { de: 'Laufweite', en: 'Tracking' },
  { de: 'Versalien', en: 'Capitals' },
  { de: 'Mono-Rolle', en: 'Mono role' },
]

/** Ja/Nein als Katalog — der Rückweg liest ihn, nicht die Oberfläche. */
const UPPERCASE_TERMS: readonly { readonly value: boolean, readonly de: string, readonly en: string }[] = [
  { value: true, de: 'Ja', en: 'Yes' },
  { value: false, de: 'Nein', en: 'No' },
]

/** Die Erklärungen — sie machen aus einer Zahl eine anwendbare Regel. */
const RULE_NOTES: readonly BrandTypeRuleBlock[] = [
  {
    de: 'Gilt für Überschriften und die Wortmarke; der Fliesstext bleibt im Normalschnitt.',
    en: 'Applies to headings and the wordmark; body text stays in the regular cut.',
  },
  {
    de: 'Feinkorrektur der Überschrift. Der Fliesstext wird nie gesperrt.',
    en: 'A fine correction on headings. Body text is never tracked out.',
  },
  {
    de: 'Versalien sind eine Ausnahme, kein Stil — sie kosten Lesbarkeit.',
    en: 'Capitals are an exception, not a style — they cost legibility.',
  },
  {
    de: 'Fest: Herkunftsangaben, Preise, Zahlen und Code — sonst nirgends.',
    en: 'Fixed: origin details, prices, figures and code — nowhere else.',
  },
]

/** „-0,5 px" / „+1 px" — im Deutschen mit Komma, das Vorzeichen immer sichtbar. */
export function brandTypeTrackingText(tracking: number, locale: string): string {
  const rounded = Math.round(tracking * 10) / 10
  const digits = Number.isInteger(rounded) ? 0 : 1
  const text = Math.abs(rounded).toFixed(digits)
  const localized = locale.toLowerCase().startsWith('de') ? text.replace('.', ',') : text
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : ''
  return `${sign}${localized} px`
}

function trackingFromText(text: string): number {
  return Number.parseFloat(text.replace('px', '').replace(',', '.').trim())
}

/** Der Slot-Wert von `i.rules` — vier Blöcke: Wert · Erklärung. */
export function brandTypeRulesSlotValue(rules: BrandTypeRules, locale: string): string {
  const de = locale.toLowerCase().startsWith('de')
  const uppercase = UPPERCASE_TERMS.find(term => term.value === rules.headingUppercase)!
  const values = [
    String(rules.headingWeight),
    brandTypeTrackingText(rules.headingTracking, locale),
    de ? uppercase.de : uppercase.en,
    BRAND_MONO_STACK,
  ]
  return formatBrandSlotStructured(RULE_BLOCK_LABELS.map((label, index) => ({
    label: de ? label.de : label.en,
    body: [values[index]!, de ? RULE_NOTES[index]!.de : RULE_NOTES[index]!.en].join(' · '),
  })))
}

/**
 * DER WEG ZURÜCK — `null`, sobald etwas nicht passt (fail-soft wie überall).
 *
 * Gelesen werden die drei EINSTELLBAREN Werte; die Mono-Rolle wird geprüft,
 * aber nicht zurückgegeben: sie ist eine Katalog-Tatsache und keine
 * Entscheidung (dieselbe Arbeitsteilung wie die Rollen-QUELLE in D3).
 * Ein Wert ausserhalb des Erlaubten wird GEKLEMMT statt verworfen — ein alter
 * Slot soll die Vorschau nicht leeren.
 */
export function parseBrandTypeRulesSlotValue(value: string): BrandTypeRules | null {
  const view = brandSlotValueView('structured', value)
  if (view.kind !== 'blocks' || view.blocks.length !== RULE_BLOCK_LABELS.length) return null

  const parts = view.blocks.map(block => block.body.split('·')[0]?.trim() ?? '')
  const weight = Number.parseInt(parts[0] ?? '', 10)
  const tracking = trackingFromText(parts[1] ?? '')
  const needle = (parts[2] ?? '').toLowerCase()
  const uppercase = UPPERCASE_TERMS
    .find(term => term.de.toLowerCase() === needle || term.en.toLowerCase() === needle)
  if (!Number.isFinite(weight) || !Number.isFinite(tracking) || !uppercase) return null
  // Der vierte Block MUSS die feste Mono-Rolle tragen: steht dort etwas
  // anderes, ist der Wert nicht aus dieser Regel entstanden.
  if (!(parts[3] ?? '').includes('monospace')) return null

  return brandTypeNormalizeRules({
    headingWeight: weight,
    headingTracking: tracking,
    headingUppercase: uppercase.value,
  })
}

/**
 * DIE REGELN ALS ZEILEN FÜR DAS PRESET (`type.rules`, §2.8).
 *
 * Das Preset trägt `string[]` — je Regel eine Zeile, so wie sie im Handbuch
 * steht. Gebaut aus DEMSELBEN Katalog wie der Slot-Wert: was das Kapitel
 * anzeigt, ist wörtlich das, was später im Preset steht (dieselbe Zusage wie
 * bei der Kontrast-Matrix in D3).
 */
export function brandTypeRuleLines(rules: BrandTypeRules, locale: string): string[] {
  const view = brandSlotValueView('structured', brandTypeRulesSlotValue(rules, locale))
  if (view.kind !== 'blocks') return []
  return view.blocks.map(block => `${block.label}: ${block.body}`)
}

/**
 * DER WEG ZURÜCK AUS DEM PRESET (Konzept docs/plans/BRAND-BOOK-KIT.md §2.6,
 * Paket K2) — `null`, sobald etwas nicht passt.
 *
 * ── WARUM ES IHN BRAUCHT ─────────────────────────────────────────────────
 * Das Preset trägt die Schrift-Regeln als ZEILEN (`type.rules: string[]`, s.
 * `brandTypeRuleLines`) — für ein Handbuch die richtige Form, für ein
 * Design-Token die falsche: `font.weight.heading` ist eine ZAHL, und
 * `letterSpacing` im Typografie-Verbund ist ein MASS. Ohne diesen Rückweg
 * müsste das Kit den Vorschlag-Wert (600) einsetzen — und eine Marke, die sich
 * für 300 entschieden hat, bekäme ein Token-Set, das ihre Entscheidung
 * stillschweigend zurücknimmt.
 *
 * ── ER LIEST DIE ZAHL, NICHT DEN SATZ ────────────────────────────────────
 * Aus jeder Zeile wird nur der WERT vor dem `·` gelesen; Beschriftung und
 * Erklärung sind in der Inhaltssprache der Marke geschrieben und interessieren
 * nicht. Nur die Versalien-Zeile ist ein Wort, und dafür gibt es den Katalog
 * `UPPERCASE_TERMS` in beiden Sprachen. Fehlt eine Zeile oder steht dort
 * Unlesbares, ist die Antwort `null` — der Aufrufer nimmt dann den Vorschlag,
 * und zwar sichtbar an EINER Stelle statt still an dreien.
 */
export function brandTypeRulesFromLines(lines: readonly string[]): BrandTypeRules | null {
  if (lines.length !== RULE_BLOCK_LABELS.length) return null
  // `label: wert · erklärung` — getrennt wird am ERSTEN Doppelpunkt, weil
  // keiner der vier Werte einen trägt (Zahl, px-Angabe, Ja/Nein, Mono-Stack).
  const parts = lines.map((line) => {
    const colon = line.indexOf(':')
    const body = colon >= 0 ? line.slice(colon + 1) : line
    return (body.split('·')[0] ?? '').trim()
  })
  const weight = Number.parseInt(parts[0] ?? '', 10)
  const tracking = trackingFromText(parts[1] ?? '')
  const needle = (parts[2] ?? '').toLowerCase()
  const uppercase = UPPERCASE_TERMS
    .find(term => term.de.toLowerCase() === needle || term.en.toLowerCase() === needle)
  if (!Number.isFinite(weight) || !Number.isFinite(tracking) || !uppercase) return null
  // Dieselbe Gegenprobe wie im Slot-Rückweg: der vierte Block MUSS die feste
  // Mono-Rolle tragen, sonst stammen die Zeilen nicht aus dieser Regel.
  if (!(parts[3] ?? '').includes('monospace')) return null
  return brandTypeNormalizeRules({
    headingWeight: weight,
    headingTracking: tracking,
    headingUppercase: uppercase.value,
  })
}

// ── Die Invarianten als prüfbare Funktion ──────────────────────────────────

/**
 * HÄLT DER KATALOG DIE DREI-SCHRIFTEN-REGEL, und sind die Stellschrauben
 * innerhalb ihrer Grenzen?
 *
 * Nimmt beliebige Listen und Werte, damit der Beweis mutierte Fassungen
 * vorlegen kann — eine Prüfung, die nur die richtigen Listen kennt, ist immer
 * grün (dieselbe Regel wie `validateBrandColorVocab`).
 */
export function validateBrandTypeRules(
  pairs: readonly BrandFontPair[] = BRAND_FONT_PAIRS,
  weights: readonly number[] = BRAND_TYPE_WEIGHTS,
  trackings: readonly number[] = BRAND_TYPE_TRACKINGS,
): readonly string[] {
  const problems: string[] = []

  for (const pair of pairs) {
    const families = [...new Set([...brandFontPairFamilies(pair), BRAND_MONO_FAMILY])]
    if (families.length > BRAND_TYPE_MAX_FAMILIES) {
      problems.push(`${pair.id}: ${families.length} Familien — mehr als drei (${families.join(', ')})`)
    }
    // Der Normalschnitt MUSS es geben: darauf läuft jeder Fliesstext.
    for (const family of brandFontPairFamilies(pair)) {
      if (!brandTypeWeightAvailable(family, 400)) {
        problems.push(`${pair.id}: "${family}" ist ohne Normalschnitt 400 deklariert`)
      }
    }
  }

  for (const weight of weights) {
    if (weight < BRAND_TYPE_WEIGHT_MIN || weight > BRAND_TYPE_WEIGHT_MAX) {
      problems.push(`Gewicht ausserhalb 300…700: ${weight}`)
    }
    // Ein angebotenes Gewicht, das KEINE Familie hat, wäre überall gefälscht.
    if (!Object.values(BRAND_DECLARED_FONT_WEIGHTS).some(list => list.includes(weight))) {
      problems.push(`Gewicht ${weight} ist in keiner Familie deklariert`)
    }
  }

  for (const tracking of trackings) {
    if (tracking < BRAND_TYPE_TRACKING_MIN || tracking > BRAND_TYPE_TRACKING_MAX) {
      problems.push(`Laufweite ausserhalb −1…+1 px: ${tracking}`)
    }
  }

  for (const scale of BRAND_TYPE_SCALES) {
    if (!(scale.id in BRAND_TYPE_SCALE_FACTORS)) {
      problems.push(`Hierarchie ohne Faktor: ${scale.id}`)
    }
  }

  return problems
}
