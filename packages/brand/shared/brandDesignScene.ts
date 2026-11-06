/**
 * DIE VERTRÄGE DER VORSCHAU-SZENE (Konzept docs/archiv/BRAND-DESIGN.md §2.9,
 * Paket D2c) — die Props von `BwDesignScene` und die zwei Bauhelfer daneben.
 *
 * ── WARUM DIE PROPS-TYPEN NEBEN DER KOMPONENTE WOHNEN ─────────────────────
 * Die Szene ist die Vorschau in JEDEM der sechs Kapitel; jede Seite baut ihre
 * Props selbst. Stünden die Typen in der `.vue`-Datei, müsste
 * `brandSceneColors()` daneben auf einen Typ aus einer Komponente zeigen —
 * ein Zirkel, den man nicht braucht (dieselbe Begründung, die der Prototyp in
 * `.playground/app/utils/demoDesign.ts` gibt). Hier stehen sie ohne Vue, also
 * auch für Server-Code, Tests und künftige Snapshot-Leser erreichbar.
 *
 * ── DIESE DATEI IST PUR ───────────────────────────────────────────────────
 * Kein Vue, kein i18n, kein H3, kein Appwrite. Die Farb-Mathematik kommt
 * ausschliesslich aus `./brandDesign` — das ist die EINZIGE Stelle des Layers
 * mit der A14-Zeilen-Ausnahme nach `packages/themes/shared/ramp.ts`; ein
 * zweiter Griff dorthin wäre ein ESLint-Fehler und ein Vertragsbruch.
 */

import { brandNeutralRamp, brandRampDark, brandRampLight } from './brandDesign'
import { BRAND_FONT_PAIRS, brandFontPair } from './brandFontPairs'
import type { BrandRamp } from './types/brand'

/**
 * DIE NOTFARBE, wenn selbst die Basisfarbe kein gültiger Hex ist.
 *
 * Der Prototyp fiel hier auf die Kailua-Palette zurück — die gibt es im
 * Produkt nicht, und eine erfundene Marken-Farbe wäre eine Aussage. Deshalb
 * ein bewusst unauffälliges Schiefergrau: es zeigt, DASS die Szene steht,
 * ohne zu behaupten, die Marke sei so.
 */
export const BRAND_SCENE_FALLBACK_BASE = '#5b6472'

/**
 * Die Farbwelt einer Szene — IMMER vollständig (s. `brandSceneColors`).
 */
export interface BrandSceneColors {
  /** Die Basisfarbe — aus ihr ist alles andere gerechnet. */
  base: string
  rampLight: BrandRamp
  rampDark: BrandRamp
  /** Getönte Neutral-Rampe: Grund, Flächen, Linien. */
  neutral: BrandRamp
  accent: string
  /** Der Papierton der Marke — der helle Grund der Szene. */
  paper: string
}

export interface BrandSceneFonts {
  headingStack: string
  bodyStack: string
  headingWeight?: number
  /** Laufweite der Überschrift in px (negativ = enger). */
  headingTracking?: number
  headingUppercase?: boolean
  /** Faktor der Größen-Hierarchie (1 = Vorschlag „ruhig"). */
  scale?: number
}

export interface BrandSceneMotion {
  /** Grunddauer in ms. */
  duration: number
  easing: string
  /** Versatz zwischen Geschwistern in ms. */
  stagger: number
}

/**
 * FARBWELT EINER SZENE AUS DREI EINGABEN — und sie ist immer vollständig.
 *
 * Die Farbwelt-Seite lässt einen Hex TIPPEN: auf dem Weg von `#4` zu
 * `#4a3123` steht dort sekundenlang Unsinn. Eine Szene, die dabei leer wird,
 * flackert bei jedem Tastendruck; deshalb fällt ein ungültiger Wert hier
 * STILL zurück — die Neutral-Quelle auf die Basisfarbe, die Basisfarbe auf
 * `BRAND_SCENE_FALLBACK_BASE`. Über die Eingabe-PRÜFUNG entscheidet die Seite
 * selbst (`isBrandHex`), nicht die Vorschau.
 *
 * Der Akzent wird bewusst durchgereicht wie er kommt (Prototyp-Verhalten):
 * die Szene rechnet die Schriftfarbe darauf, und eine unlesbare Zwischenstufe
 * beim Tippen ist harmloser als eine Szene, die den Akzent stillschweigend
 * durch einen fremden ersetzt.
 *
 * `paper` ist OPTIONAL: ohne Angabe gilt die hellste Stufe der Neutral-Rampe
 * (`neutral[50]`) — dieselbe Fläche, die `buildBrandDesign()` in der
 * Kontrast-Matrix „Papier" nennt. Der Prototyp nahm dort den festen
 * Kailua-Papierton; den gibt es im Produkt nicht, und eine gerechnete Fläche
 * ist ohnehin die ehrlichere Vorschau.
 */
export function brandSceneColors(
  base: string,
  accent: string,
  neutralSource: string,
  paper?: string,
): BrandSceneColors {
  const safeBase = brandRampLight(base) ? base : BRAND_SCENE_FALLBACK_BASE
  const safeNeutral = brandNeutralRamp(neutralSource) ? neutralSource : safeBase
  /* Die drei Rufe können nach den zwei Prüfungen oben nicht mehr `null`
   * liefern — dieselbe Basisfarbe, dieselbe Mathematik. */
  const neutral = brandNeutralRamp(safeNeutral)!
  return {
    base: safeBase,
    rampLight: brandRampLight(safeBase)!,
    rampDark: brandRampDark(safeBase)!,
    neutral,
    accent,
    paper: paper ?? neutral[50],
  }
}

/**
 * SCHRIFT-PROPS DER SZENE aus einer Paar-Id plus den Regeln des Kapitels
 * (`i.rules`: Gewicht, Laufweite, Versalien, Hierarchie-Faktor).
 *
 * Eine unbekannte Paar-Id fällt auf das ERSTE Paar des Katalogs zurück — die
 * Szene zeigt dann eine Schrift, die wirklich geladen ist, statt auf den
 * Systemstack zu kippen (§2.17: genau der stille Rückfall, den D2c
 * verhindert).
 */
export function brandSceneFonts(pairId: string, rules?: Partial<BrandSceneFonts>): BrandSceneFonts {
  const pair = brandFontPair(pairId) ?? BRAND_FONT_PAIRS[0]!
  return {
    headingStack: pair.headingStack,
    bodyStack: pair.bodyStack,
    ...(rules ?? {}),
  }
}
