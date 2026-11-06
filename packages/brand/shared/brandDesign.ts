/**
 * DIE PURE REGEL VON BRAND DESIGN — aus den bestätigten Slot-Werten der sechs
 * Kapitel wird EIN `BrandDesignPreset` (Konzept docs/archiv/BRAND-DESIGN.md
 * §2.8, Paket D0).
 *
 * ── DIESELBE WAHRHEIT WIE `buildBrandFoundation`, KEIN SPIEGEL ────────────
 * Das Preset wird nirgends gespeichert und nirgends nachgeführt: es entsteht
 * bei jedem Aufruf neu aus den Werten. Die einzige eingefrorene Fassung ist
 * die im Snapshot (§2.8) — und die ist ein ABBILD, kein zweiter Stand.
 * Deshalb gibt es hier auch keine Migration und kein `updatedAt`: was sich
 * ändert, sind die Werte, und die haben ihre eigene Zustandsmaschine.
 *
 * ── DER A14-VERTRAG ZUR THEMES-ENGINE (§2.3) ──────────────────────────────
 * Diese Datei ist die EINZIGE Stelle im brand-Layer, die relativ nach
 * `packages/themes` greift, und sie greift dort nur auf `shared/ramp.ts` — die
 * pure Bibliothek (kein `app/`, kein Server, kein Zustand). Nichts anderes aus
 * themes, nirgendwo sonst. Die Engine bleibt unverändert; Brand Design erzeugt
 * nur WERTE in ihrer Form, damit Produkt 03 daraus Tokens und die Platform
 * daraus ein Community-Theme machen KÖNNEN.
 *
 * Der Prototyp (`.playground/app/utils/demoDesign.ts`) hat denselben Import
 * mit derselben Zeilen-Ausnahme geführt — die Zahlen auf dem Bildschirm des
 * Klickdummys sind damit die Zahlen des Produkts.
 *
 * ── UNVOLLSTÄNDIG HEISST `null`, NICHT „halbes Preset" ────────────────────
 * Solange die Schicht läuft, fehlt fast immer etwas. Ein Preset mit leeren
 * Rampen wäre für jeden Leser (Kapitel 10, Vorschau-Szene, Produkt 03) eine
 * Farbwelt, die es nicht gibt; `null` ist die ehrliche Antwort „noch nicht
 * fertig", und jeder Leser hat für sie schon einen Zweig (die Schranke).
 *
 * DIESE DATEI IST PUR: kein i18n, kein H3, kein Appwrite.
 */

/* Der EINZIGE Cross-Layer-Import des brand-Layers (§2.3, CONCEPT.md A14):
 * `themes/shared/ramp.ts` ist die pure Ramp- und Kontrast-Mathematik. Die
 * Ausnahme steht als ZEILEN-Ausnahme, damit der Wächter für alles andere
 * scharf bleibt. */
// eslint-disable-next-line pukalani/no-cross-layer-relative -- Brand Design §2.3: pure Ramp-/Kontrast-Mathematik aus themes/shared, kein anderer themes-Zugriff.
import { contrastRatio, generateNeutralRamp, generateRamp, hexToRgb, wcagLevel } from '../../themes/shared/ramp'
import { brandFontPairForDnaTypography } from './brandDesignDna'
import {
  BRAND_DNA_DIMENSION_IDS,
  BRAND_MOTION_STAGGER_MS,
  BRAND_MOTION_TOKENS,
  BRAND_TEMPO_OPTIONS,
  isBrandDnaValue,
} from './brandDesignVocab'
import { brandFontPair } from './brandFontPairs'
import {
  BRAND_RAMP_SHADES,
  type BrandContrastPair,
  type BrandDesignPreset,
  type BrandDesignValues,
  type BrandRamp,
} from './types/brand'

/**
 * Die Fassung des PRESET-FORMATS. Sie steigt, wenn sich die FORM ändert —
 * nicht, wenn ein Vokabular einen Wert dazubekommt.
 */
export const BRAND_DESIGN_PRESET_VERSION = 1

/** Dieselbe Eingabe-Prüfung wie in der Themes-Engine. */
export const BRAND_HEX_RE = /^#[0-9a-f]{6}$/i

export function isBrandHex(value: string | undefined): value is string {
  return typeof value === 'string' && BRAND_HEX_RE.test(value)
}

/**
 * DIE DUNKEL-RAMPE — dieselbe Mathematik mit anderen Enden (Prototyp
 * `dsRampDark`).
 *
 * Die Engine kennt keine zweite Rampe (§2.3: Brand Design erzeugt nur Werte in
 * ihrer Form). Auf dunklem Grund braucht die Marke oben mehr Luft und unten
 * weniger Tiefe, sonst kippt die 900er-Stufe ins Schwarz des Grundes — die drei
 * Parameter sind wörtlich die des abgenommenen Prototyps.
 */
export function brandRampDark(hex: string): BrandRamp | null {
  return generateRamp(hex, { mode: 'perceived', lightnessMax: 92, lightnessMin: 11, saturation: 0.92 })
}

/** Die Hell-Rampe: die Vorgabe der Engine (wahrgenommene OKLCH-Stufen). */
export function brandRampLight(hex: string): BrandRamp | null {
  return generateRamp(hex, { mode: 'perceived' })
}

/** Die getönte Neutral-Rampe — nur der Farbton kommt aus der Quellfarbe. */
export function brandNeutralRamp(hex: string): BrandRamp | null {
  return generateNeutralRamp(hex)
}

/**
 * DIE ZERLEGUNG EINES HEX — durchgereicht aus der Engine (A14: der Import oben
 * ist der EINE). Wer eine Farbe VERGLEICHEN will (`brandDesignColor.ts`),
 * braucht ihre Kanäle; ein zweiter Parser daneben wäre eine zweite Auslegung
 * derselben sechs Zeichen.
 */
export function brandHexToRgb(hex: string): [number, number, number] | null {
  return hexToRgb(hex)
}

export interface BrandContrastVerdict {
  ratio: number
  level: 'AAA' | 'AA' | 'AA18' | 'fail'
}

/** Kontrast zweier Farben mit WCAG-Urteil; `null` bei ungültigem Hex. */
export function brandContrast(foreground: string, background: string): BrandContrastVerdict | null {
  const ratio = contrastRatio(foreground, background)
  if (ratio === null) return null
  return { ratio, level: wcagLevel(ratio) }
}

/**
 * WELCHE FARBE TÖNT DIE NEUTRAL-RAMPE (§2.3 `h.neutral`).
 *
 * `tinted` nimmt die Basisfarbe; `warm` und `cool` verschieben den Ton, ohne
 * eine zweite Marken-Farbe einzuführen. Die zwei Konstanten stehen hier und
 * nicht im Vokabular: sie sind Rechen-Eingaben, keine Auswahl-Beschriftung.
 */
const NEUTRAL_WARM = '#8a7a68'
const NEUTRAL_COOL = '#68767a'

/**
 * Aus WELCHEM Hex die Neutral-Rampe getönt wird. EXPORTIERT, weil die Bühne
 * dieselbe Antwort braucht: rechnete die Vorschau ihre Rampe anders als das
 * Preset, sähe der Mensch eine Farbwelt und bekäme eine andere.
 */
export function brandNeutralSource(option: string | undefined, base: string): string {
  if (option === 'warm') return NEUTRAL_WARM
  if (option === 'cool') return NEUTRAL_COOL
  return base
}

/**
 * DIE PAARE DER KONTRAST-MATRIX (§2.3 `h.contrast`).
 *
 * ZWEI QUELLEN, DAMIT DIE PAARE STIMMEN (wörtlich aus dem Prototyp): eine
 * Stufe im VORDERGRUND kommt aus der MARKEN-Rampe (Text trägt die Marke), eine
 * Stufe im HINTERGRUND aus der NEUTRAL-Rampe (Flächen tragen sie nicht). Wer
 * das vertauscht, misst Paare, die auf keiner Seite vorkommen.
 */
export interface BrandContrastPairSpec {
  readonly id: string
  readonly scheme: 'light' | 'dark'
  readonly fg: number | 'accent' | 'paper' | 'accentInk'
  readonly bg: number | 'paper' | 'ground' | 'accent'
}

/**
 * DIE SECHS PAARE — EINE Liste, zwei Leser (Preset und Kapitel `color`).
 * Ihre BESCHRIFTUNGEN stehen im Vokabular (`BRAND_CONTRAST_PAIR_TERMS`), weil
 * sie in der Inhaltssprache der Marke in den Slot-Wert wandern.
 */
export const BRAND_CONTRAST_PAIR_SPECS: readonly BrandContrastPairSpec[] = [
  { id: 'body-light', scheme: 'light', fg: 900, bg: 'paper' },
  { id: 'heading-light', scheme: 'light', fg: 800, bg: 'paper' },
  { id: 'button-light', scheme: 'light', fg: 'accentInk', bg: 'accent' },
  { id: 'muted-light', scheme: 'light', fg: 700, bg: 100 },
  { id: 'body-dark', scheme: 'dark', fg: 100, bg: 'ground' },
  { id: 'accent-dark', scheme: 'dark', fg: 400, bg: 'ground' },
]

interface ResolvedColors {
  rampLight: BrandRamp
  rampDark: BrandRamp
  neutral: BrandRamp
  accent: string
}

function shadeOf(ramp: BrandRamp, shade: number): string | null {
  const known = (BRAND_RAMP_SHADES as readonly number[]).includes(shade)
  return known ? ramp[shade as keyof BrandRamp] : null
}

/**
 * DIE SCHRIFTFARBE AUF DEM AKZENT — Papier ODER die tiefste Stufe der
 * Marken-Rampe, je nachdem, was den HÖHEREN Kontrast trägt (Brand Design D9,
 * offener Punkt aus D3).
 *
 * Sie ist die EINE Regel für zwei Leser: die Vorschau-Szene (`BwDesignScene`,
 * `--ds-accent-ink`) rechnete sie schon so, die Kontrast-Matrix mass dagegen
 * fest Papier auf Akzent. Bei einem HELLEN Akzent standen damit zwei Aussagen
 * über dieselbe Fläche nebeneinander: die Tabelle sagte „fällt durch", während
 * die Szene daneben einen tadellos lesbaren dunklen Knopf-Text zeigte. Wer
 * das sieht, glaubt danach keiner von beiden mehr.
 *
 * Sie macht die Prüfung NICHT weich: ein Akzent im Mittelfeld trägt weder
 * helle noch dunkle Schrift und fällt weiter durch. Sie misst nur, was das
 * Produkt tatsächlich setzt.
 */
export function brandAccentInk(
  accent: string,
  paper: string,
  deepestBrandShade: string,
): string {
  const onPaper = contrastRatio(paper, accent) ?? 0
  const onInk = contrastRatio(deepestBrandShade, accent) ?? 0
  return onPaper >= onInk ? paper : deepestBrandShade
}

function resolveEnd(
  end: BrandContrastPairSpec['fg'] | BrandContrastPairSpec['bg'],
  scheme: 'light' | 'dark',
  colors: ResolvedColors,
): string | null {
  if (end === 'accent') return colors.accent
  // „Papier" ist die hellste Stufe der NEUTRAL-Rampe, „Grund" ihre tiefste —
  // beides sind Flächen, und Flächen kommen nie aus der Marken-Rampe.
  if (end === 'paper') return colors.neutral[50]
  if (end === 'ground') return colors.neutral[950]
  if (end === 'accentInk') {
    return brandAccentInk(
      colors.accent,
      colors.neutral[50],
      (scheme === 'dark' ? colors.rampDark : colors.rampLight)[950],
    )
  }
  const ramp = scheme === 'dark' ? colors.rampDark : colors.rampLight
  return shadeOf(ramp, end)
}

function buildContrastPairs(colors: ResolvedColors): BrandContrastPair[] {
  const pairs: BrandContrastPair[] = []
  for (const spec of BRAND_CONTRAST_PAIR_SPECS) {
    const foreground = resolveEnd(spec.fg, spec.scheme, colors)
    const background = resolveEnd(spec.bg, spec.scheme, colors)
    if (!foreground || !background) continue
    const verdict = brandContrast(foreground, background)
    if (!verdict) continue
    pairs.push({
      id: spec.id,
      scheme: spec.scheme,
      foreground,
      background,
      ratio: verdict.ratio,
      level: verdict.level,
    })
  }
  return pairs
}

/**
 * DIE SECHS GEPRÜFTEN PAARE ZU EINER FARBWELT — dieselbe Rechnung wie im
 * Preset, nur aus den drei Entscheidungen statt aus einem `BrandDesignValues`.
 *
 * Das Kapitel `color` zeigt die Matrix, LANGE bevor ein Preset entstehen kann
 * (Schrift, Zeichen und Bewegung fehlen dann noch). Es rechnet sie trotzdem
 * NICHT selbst: zwei Rechenwege für dieselbe Tabelle wären zwei Wahrheiten,
 * und die Zahl auf dem Bildschirm ist genau die, die später im Preset steht.
 *
 * `null`, sobald eine der drei Farben kein gültiger Hex ist — beim Tippen ist
 * das der Normalfall, und eine Matrix aus Notfarben wäre eine Auskunft über
 * nichts.
 */
export function brandColorContrastPairs(
  base: string,
  accent: string,
  neutralOption: string | undefined,
): BrandContrastPair[] | null {
  if (!isBrandHex(base) || !isBrandHex(accent)) return null
  const rampLight = brandRampLight(base)
  const rampDark = brandRampDark(base)
  const neutral = brandNeutralRamp(brandNeutralSource(neutralOption, base))
  if (!rampLight || !rampDark || !neutral) return null
  return buildContrastPairs({ rampLight, rampDark, neutral, accent })
}

/**
 * IST DIE DNA VOLLSTÄNDIG UND GÜLTIG? Alle zehn Dimensionen, jede mit einem
 * Wert aus ihrem Vokabular (§2.2: „was hier steht, muss ein Preset belegen
 * können"). Eine erfundene Wert-Id ist kein „unbekanntes Extra", sondern eine
 * Zeile, die keine Vorschau und kein Token kennt.
 */
function dnaIsComplete(dna: Readonly<Record<string, string>> | undefined): dna is Readonly<Record<string, string>> {
  if (!dna) return false
  return BRAND_DNA_DIMENSION_IDS.every(dimensionId => isBrandDnaValue(dimensionId, dna[dimensionId] ?? ''))
}

/**
 * DIE ÜBERGANGS-TOKENS aus dem Tempo (§2.7 `l.transitions`) — drei Dauern plus
 * der Versatz, gerundet auf ganze Millisekunden.
 */
export function brandMotionTransitions(
  tempoId: string,
): { id: string, durationMs: number, easing: string }[] {
  const tempo = BRAND_TEMPO_OPTIONS.find(option => option.id === tempoId)
  if (!tempo) return []
  const tokens = BRAND_MOTION_TOKENS.map(token => ({
    id: token.id,
    durationMs: Math.round(tempo.base * token.factor),
    easing: tempo.easing,
  }))
  return [...tokens, { id: 'stagger', durationMs: BRAND_MOTION_STAGGER_MS, easing: tempo.easing }]
}

/**
 * DIE VORBELEGUNG ALLER FOLGENDEN KAPITEL AUS DER BESTÄTIGTEN DNA (Brand
 * Design D2c, §2.17 „Zeit (H5)").
 *
 * ── WARUM ES SIE GIBT ─────────────────────────────────────────────────────
 * H5 sagt: „das Moodboard belegt alle Kapitel vor — jede Session muss als
 * BESTÄTIGUNG durchlaufbar sein". Ohne diese Regel wäre Schicht 2 fünfzehn
 * weitere Entscheidungen von vorn; mit ihr ist sie ein Durchgang, in dem der
 * Mensch nur widerspricht, wo er will. Sie ist die Einlösung des Versprechens
 * „~35 Minuten" aus dem Phase-1-Plan.
 *
 * ── SIE IST EIN VORSCHLAG, KEIN WERT ─────────────────────────────────────
 * Sie schreibt nichts. D3 bis D7 legen ihr Ergebnis in ihre eigenen Slots —
 * diese Tabelle sagt nur, was in einem leeren Feld VORGESCHLAGEN wird. Deshalb
 * fehlen hier `base` und `accent`: eine Farbe ist eine Entscheidung mit einem
 * Hex, und die trifft `h.base` aus der Richtung und dem Farb-Charakter, nicht
 * eine Zuordnungstabelle.
 *
 * ── UNBEKANNTES BLEIBT LEER ──────────────────────────────────────────────
 * Eine Dimension ohne Eintrag ergibt kein Feld statt eines geratenen — ein
 * vorbelegtes Feld, das niemand herleiten kann, ist schlechter als ein leeres.
 */
const NEUTRAL_BY_COLOR: Readonly<Record<string, string>> = {
  earthy: 'warm',
  airy: 'cool',
  deep: 'tinted',
  monochrome: 'tinted',
  vivid: 'cool',
}
const SCALE_BY_COMPOSITION: Readonly<Record<string, string>> = {
  calm: 'calm',
  centered: 'calm',
  grid: 'dense',
  dense: 'dense',
  asymmetric: 'loud',
}
const MARK_KIND_BY_STYLE: Readonly<Record<string, string>> = {
  minimal: 'word',
  editorial: 'word',
  technical: 'monogram',
  organic: 'combination',
  playful: 'pictorial',
}
const ILLUSTRATION_BY_IMAGERY: Readonly<Record<string, string>> = {
  documentary: 'none',
  still: 'none',
  craftClose: 'line',
  people: 'line',
  abstract: 'organic',
}
const ICONS_BY_FORM: Readonly<Record<string, string>> = {
  soft: 'regular',
  geometric: 'regular',
  irregular: 'regular',
  sharp: 'bold',
  mixed: 'fill',
}
const TEMPO_BY_MOTION: Readonly<Record<string, string>> = {
  none: 'calm',
  calmMotion: 'calm',
  precise: 'snappy',
  springy: 'lively',
  playfulMotion: 'lively',
}
const LOGO_MOTION_BY_MOTION: Readonly<Record<string, string>> = {
  none: 'no',
  calmMotion: 'no',
  precise: 'no',
  springy: 'yes',
  playfulMotion: 'yes',
}

export function brandDesignDefaultsFromDna(
  dna: Readonly<Record<string, string>> | undefined,
): Partial<BrandDesignValues> {
  if (!dna) return {}
  const pick = (
    table: Readonly<Record<string, string>>,
    dimensionId: string,
  ): string | undefined => table[dna[dimensionId] ?? '']

  const pair = brandFontPairForDnaTypography(dna.typography ?? '')
  return {
    ...(pick(NEUTRAL_BY_COLOR, 'color') ? { neutral: pick(NEUTRAL_BY_COLOR, 'color') } : {}),
    ...(brandFontPair(pair) ? { pair } : {}),
    ...(pick(SCALE_BY_COMPOSITION, 'composition') ? { scale: pick(SCALE_BY_COMPOSITION, 'composition') } : {}),
    ...(pick(MARK_KIND_BY_STYLE, 'style') ? { markKind: pick(MARK_KIND_BY_STYLE, 'style') } : {}),
    ...(pick(ILLUSTRATION_BY_IMAGERY, 'imagery') ? { illustration: pick(ILLUSTRATION_BY_IMAGERY, 'imagery') } : {}),
    ...(pick(ICONS_BY_FORM, 'form') ? { icons: pick(ICONS_BY_FORM, 'form') } : {}),
    ...(pick(TEMPO_BY_MOTION, 'motion') ? { tempo: pick(TEMPO_BY_MOTION, 'motion') } : {}),
    ...(pick(LOGO_MOTION_BY_MOTION, 'motion') ? { logoMotion: pick(LOGO_MOTION_BY_MOTION, 'motion') } : {}),
  }
}

/**
 * DAS PRESET AUS DEN BESTÄTIGTEN WERTEN — `null`, solange etwas Tragendes
 * fehlt (s. Kopf).
 *
 * TRAGEND ist, was ein Leser braucht, um überhaupt etwas zu zeigen: die
 * vollständige DNA, eine gültige Basisfarbe, ein gültiger Akzent, ein Paar aus
 * dem Katalog, eine Hierarchie, eine Zeichen-Richtung und ein Tempo. Alles
 * andere (Regeln, Do-und-Don't, Setzungen, Entwürfe) darf leer sein — eine
 * Marke ohne aufgeschriebene Bewegungs-Regel hat trotzdem eine Farbwelt.
 */
export function buildBrandDesign(values: BrandDesignValues): BrandDesignPreset | null {
  if (!dnaIsComplete(values.dna)) return null
  if (!isBrandHex(values.base) || !isBrandHex(values.accent)) return null

  const rampLight = brandRampLight(values.base)
  const rampDark = brandRampDark(values.base)
  const neutral = brandNeutralRamp(brandNeutralSource(values.neutral, values.base))
  if (!rampLight || !rampDark || !neutral) return null

  const pair = values.pair ? brandFontPair(values.pair) : undefined
  if (!pair || !values.scale || !values.markKind || !values.tempo) return null
  if (!BRAND_TEMPO_OPTIONS.some(option => option.id === values.tempo)) return null

  const colors: ResolvedColors = { rampLight, rampDark, neutral, accent: values.accent }

  return {
    version: BRAND_DESIGN_PRESET_VERSION,
    // Nur die zehn bekannten Dimensionen, in Katalog-Reihenfolge: ein
    // durchgereichtes Fremd-Feld wäre im Preset ein Wert ohne Vokabular.
    dna: Object.fromEntries(
      BRAND_DNA_DIMENSION_IDS.map(dimensionId => [dimensionId, values.dna![dimensionId]!]),
    ),
    color: {
      base: values.base,
      rampLight,
      rampDark,
      neutral,
      accent: values.accent,
      // Eine Rolle ohne aufgelösten Hex ist eine Beschriftung, kein Token —
      // sie fällt heraus, statt mit '' im Preset zu stehen.
      roles: (values.roles ?? [])
        .filter(role => isBrandHex(role.hex))
        .map(role => ({ id: role.id, source: role.source, hex: role.hex! })),
      contrastPairs: buildContrastPairs(colors),
    },
    type: {
      pair: pair.id,
      scale: values.scale,
      rules: [...(values.typeRules ?? [])],
    },
    mark: {
      kind: values.markKind,
      brief: [...(values.markBrief ?? [])],
      examples: [...(values.markExamples ?? [])],
      keptDrafts: [...(values.keptDrafts ?? [])],
    },
    imagery: {
      principles: [...(values.imageryPrinciples ?? [])],
      illustration: values.illustration ?? '',
      icons: values.icons ?? '',
      dodont: (values.dodont ?? []).map(entry => ({ doText: entry.doText, dontText: entry.dontText })),
    },
    motion: {
      tempo: values.tempo,
      transitions: brandMotionTransitions(values.tempo),
      logo: values.logoMotion ?? '',
      rules: [...(values.motionRules ?? [])],
    },
  }
}
