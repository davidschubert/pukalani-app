import { rgbToOklch, oklchToHex } from './oklch'
import { contrastRatio, hexToRgb, type Shade } from './ramp'

/**
 * SCHRIFT-KONTRAST DER TEXT- UND STATUSFARBEN (Q07, 2026-11).
 *
 * Nuxt UI legt die zwei blassen Textfarben auf feste Stufen der neutralen
 * Palette (hell: `dimmed` = 400, `muted` = 500; dunkel: `dimmed` = 500) und
 * die Statusfarben auf die 500er (hell) bzw. 400er Stufe (dunkel). Gemessen
 * reicht das als SCHRIFT nicht: `dimmed` 2,2–2,6 zu 1, `muted` auf getönten
 * Flächen 3,9–4,4 zu 1, Weiß auf Grün 2,3 zu 1, Weiß auf Rot 3,8 zu 1. WCAG
 * 2.2 AA verlangt für normalen Text 4,5 zu 1.
 *
 * DIE REGEL: Farbton und Sättigung bleiben, nur die Helligkeit rückt — und nur
 * so weit, bis die Farbe auf JEDER Fläche besteht, auf der sie als Schrift
 * steht. Deshalb wird gerechnet statt eine Stufe weiterzuspringen: der Sprung
 * von 500 auf 600 wäre je nach Palette doppelt so weit wie nötig.
 *
 * Pure Funktionen ohne Nuxt-/Node-Abhängigkeit. Zwei Aufrufer: der Generator
 * (scripts/generate-themes.ts → public/themes/contrast.css, mit Gate) und
 * `customThemeCss()` für die getönte Neutral-Palette eines Custom Themes, die
 * erst zur Laufzeit entsteht.
 */

/** WCAG 2.2 AA, normaler Text. Das Gate prüft GENAU diese Schwelle. */
export const TEXT_MIN_RATIO = 4.5

/**
 * Die Suche zielt eine Spur höher als das Gate prüft: der Browser mischt die
 * 10-Prozent-Flächen selbst und rundet dabei anders als diese Rechnung. Ohne
 * den Abstand läge ein Wert rechnerisch bei 4,50 und gemessen bei 4,49.
 */
const SEARCH_TARGET = 4.56

/** Schrittweite der Helligkeits-Suche (OKLCH-L, 0..1). */
const L_STEP = 0.002

/** Deckkraft der „soft"/„subtle"-Flächen von Nuxt UI (`bg-error/10`). */
const SOFT_ALPHA = 0.1

export type NeutralRamp = Record<Shade, string>

export interface NeutralTextTokens {
  light: { dimmed: string, muted: string }
  dark: { dimmed: string }
}

export interface StatusTokens {
  light: string
  dark: string
}

function ratio(a: string, b: string): number {
  return contrastRatio(a, b) ?? 0
}

function minRatio(color: string, backgrounds: string[]): number {
  return Math.min(...backgrounds.map(bg => ratio(color, bg)))
}

/**
 * Deckende Farbe von `color` mit `alpha` über `background` — so, wie der
 * Browser `color-mix(in oklab, <color> 10%, transparent)` über einer Fläche
 * zeigt (Mischung der sRGB-Kanäle über Alpha).
 */
export function compositeOver(color: string, background: string, alpha: number): string {
  const c = hexToRgb(color)
  const b = hexToRgb(background)
  if (!c || !b) return background
  const channel = (i: 0 | 1 | 2) => Math.round(c[i] * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')
  return `#${channel(0)}${channel(1)}${channel(2)}`
}

/**
 * Helligkeit von `start` schrittweise verschieben (Farbton und Sättigung
 * bleiben), bis `passes` gilt. `direction` -1 = dunkler, +1 = heller.
 * Besteht `start` schon, kommt `start` unverändert zurück. null, wenn die
 * Helligkeit ausgeht, bevor die Bedingung gilt.
 */
export function shiftLightnessUntil(
  start: string,
  direction: -1 | 1,
  passes: (candidate: string) => boolean,
): string | null {
  const rgb = hexToRgb(start)
  if (!rgb) return null
  if (passes(start)) return start.toLowerCase()
  const base = rgbToOklch(rgb)
  for (let l = base.l + direction * L_STEP; l > 0 && l < 1; l += direction * L_STEP) {
    const candidate = oklchToHex({ l, c: base.c, h: base.h })
    if (passes(candidate)) return candidate
  }
  return null
}

function lightness(hex: string): number {
  const rgb = hexToRgb(hex)
  return rgb ? rgbToOklch(rgb).l : 0
}

/** Die Flächen, auf denen Text steht: Seite, gedämpft, erhöht (Nuxt UI `--ui-bg*`). */
export function neutralSurfaces(ramp: NeutralRamp): { light: string[], dark: string[] } {
  return {
    light: ['#ffffff', ramp[50], ramp[100]],
    dark: [ramp[900], ramp[800]],
  }
}

/**
 * Die zwei blassen Textfarben einer neutralen Palette.
 *
 * HELL: `dimmed` startet bei der 400er Stufe und wird dunkler, bis sie auf
 * Weiß, der 50er und der 100er Fläche besteht. `muted` (500er) müsste für
 * dieselbe Schwelle fast auf denselben Wert — dann gäbe es im Hellen nur noch
 * EINE blasse Farbe. Damit die Abstufung dimmed → muted → toned (600er)
 * sichtbar bleibt, liegt `muted` in der Mitte zwischen dem neuen `dimmed` und
 * der 600er Stufe (und besteht die Schwelle damit von selbst).
 * DUNKEL: `dimmed` startet bei der 500er Stufe und wird heller, bis sie auf
 * der 900er und der 800er Fläche besteht. `muted` (400er) besteht schon und
 * bleibt, wie Nuxt UI es setzt.
 */
export function neutralTextTokens(ramp: NeutralRamp): NeutralTextTokens | null {
  const surfaces = neutralSurfaces(ramp)
  const dimmedLight = shiftLightnessUntil(ramp[400], -1, c => minRatio(c, surfaces.light) >= SEARCH_TARGET)
  const dimmedDark = shiftLightnessUntil(ramp[500], 1, c => minRatio(c, surfaces.dark) >= SEARCH_TARGET)
  if (!dimmedLight || !dimmedDark) return null

  const middle = (lightness(dimmedLight) + lightness(ramp[600])) / 2
  const mutedLight = shiftLightnessUntil(
    ramp[500],
    -1,
    c => lightness(c) <= middle && minRatio(c, surfaces.light) >= SEARCH_TARGET,
  )
  if (!mutedLight) return null

  return { light: { dimmed: dimmedLight, muted: mutedLight }, dark: { dimmed: dimmedDark } }
}

/**
 * Eine Statusfarbe (rot, grün) für beide Schemata.
 *
 * Sie steht auf drei Arten als Schrift da: als FLÄCHE mit Schrift darauf
 * (Knopf „Account löschen": hell Weiß, dunkel die 900er der Palette), als
 * SCHRIFT auf der Seite (Fehlertext unter einem Feld) und als Schrift auf
 * ihrer eigenen 10-Prozent-Fläche (Marken wie „Kostenlos", Hinweise). Alle
 * drei müssen bestehen, über jede mitgegebene neutrale Palette.
 */
export function statusTokens(base: { light: string, dark: string }, ramps: NeutralRamp[]): StatusTokens | null {
  const passesLight = (c: string) => ramps.every((ramp) => {
    const surfaces = neutralSurfaces(ramp).light
    return ratio('#ffffff', c) >= SEARCH_TARGET
      && minRatio(c, surfaces) >= SEARCH_TARGET
      && surfaces.every(bg => ratio(c, compositeOver(c, bg, SOFT_ALPHA)) >= SEARCH_TARGET)
  })
  const passesDark = (c: string) => ramps.every((ramp) => {
    const surfaces = neutralSurfaces(ramp).dark
    return ratio(ramp[900], c) >= SEARCH_TARGET
      && minRatio(c, surfaces) >= SEARCH_TARGET
      && surfaces.every(bg => ratio(c, compositeOver(c, bg, SOFT_ALPHA)) >= SEARCH_TARGET)
  })
  const light = shiftLightnessUntil(base.light, -1, passesLight)
  const dark = shiftLightnessUntil(base.dark, 1, passesDark)
  if (!light || !dark) return null
  return { light, dark }
}

export interface ContrastFinding {
  /** z. B. `mist hell: dimmed auf #f6f7f7` */
  where: string
  ratio: number
}

/**
 * DAS GATE: jede Paarung nachrechnen, wie sie auf der Seite steht. Leere
 * Liste = bestanden. Bewusst getrennt von der Suche oben — es prüft die
 * FERTIGEN Werte gegen die Schwelle und würde auch einen von Hand
 * eingetragenen, zu blassen Wert finden.
 */
export function auditNeutralTextTokens(name: string, ramp: NeutralRamp, tokens: NeutralTextTokens): ContrastFinding[] {
  const surfaces = neutralSurfaces(ramp)
  const pairs: [string, string, string[]][] = [
    [`${name} hell: dimmed`, tokens.light.dimmed, surfaces.light],
    [`${name} hell: muted`, tokens.light.muted, surfaces.light],
    [`${name} dunkel: dimmed`, tokens.dark.dimmed, surfaces.dark],
    [`${name} dunkel: muted`, ramp[400], surfaces.dark],
  ]
  const findings: ContrastFinding[] = []
  for (const [label, color, backgrounds] of pairs) {
    for (const bg of backgrounds) {
      const value = ratio(color, bg)
      if (value < TEXT_MIN_RATIO) findings.push({ where: `${label} (${color}) auf ${bg}`, ratio: value })
    }
  }
  return findings
}

export function auditStatusTokens(name: string, tokens: StatusTokens, ramps: Record<string, NeutralRamp>): ContrastFinding[] {
  const findings: ContrastFinding[] = []
  const check = (where: string, a: string, b: string) => {
    const value = ratio(a, b)
    if (value < TEXT_MIN_RATIO) findings.push({ where: `${where} (${a} auf ${b})`, ratio: value })
  }
  check(`${name} hell: Weiß auf der Fläche`, '#ffffff', tokens.light)
  for (const [palette, ramp] of Object.entries(ramps)) {
    const surfaces = neutralSurfaces(ramp)
    check(`${name} dunkel, ${palette}: dunkle Schrift auf der Fläche`, ramp[900], tokens.dark)
    for (const bg of surfaces.light) {
      check(`${name} hell, ${palette}: als Schrift`, tokens.light, bg)
      check(`${name} hell, ${palette}: auf der 10-Prozent-Fläche`, tokens.light, compositeOver(tokens.light, bg, SOFT_ALPHA))
    }
    for (const bg of surfaces.dark) {
      check(`${name} dunkel, ${palette}: als Schrift`, tokens.dark, bg)
      check(`${name} dunkel, ${palette}: auf der 10-Prozent-Fläche`, tokens.dark, compositeOver(tokens.dark, bg, SOFT_ALPHA))
    }
  }
  return findings
}

/** Die zwei Zeilen für den hellen und die eine für den dunklen Block. */
export function neutralTextCssBlocks(attr: string, tokens: NeutralTextTokens): string[] {
  return [
    `:root[data-neutral='${attr}'] {\n  --ui-text-dimmed: ${tokens.light.dimmed};\n  --ui-text-muted: ${tokens.light.muted};\n}`,
    `.dark[data-neutral='${attr}'] {\n  --ui-text-dimmed: ${tokens.dark.dimmed};\n  --ui-text-muted: var(--ui-color-neutral-400);\n}`,
  ]
}
