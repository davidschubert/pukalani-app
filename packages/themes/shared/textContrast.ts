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

// ── Die Hauptfarbe einer Farbwelt (Bahn 7, Rest von UX-002) ─────────────────

/**
 * Nicht-Text (Bedienelement ohne Schrift, große Fläche): WCAG 1.4.11 verlangt
 * 3 zu 1 gegen die Fläche daneben.
 */
export const NON_TEXT_MIN_RATIO = 3

/** Suchziel für Nicht-Text, mit demselben Abstand wie `SEARCH_TARGET`. */
const NON_TEXT_SEARCH_TARGET = 3.04

/**
 * Die Klassen, mit denen Nuxt UI die Hauptfarbe als VOLLE FLÄCHE malt (Knopf,
 * Etikett, Häkchen, Schalter, gewählter Kalendertag, Schritt, Reiter-Pille).
 * Genau diese Elemente bekommen in einer Farbwelt mit „Fläche bleibt" die
 * Flächenfarbe und die passende Schrift darauf. `~=` trifft nur das ganze
 * Wort: `bg-primary/10` (weiche Fläche, Schrift in der Hauptfarbe) bleibt
 * draußen. Quelle: die Komponenten-Themen von Nuxt UI 4.12
 * (`.nuxt/ui/*.ts`, Suche nach `bg-primary` und `text-inverted`). Neue
 * Nuxt-UI-Fassung ⇒ diese Liste gegen die Themen halten.
 */
export const PRIMARY_FILL_SELECTOR = [
  ...[
    'bg-primary',
    'data-selected:bg-primary',
    'data-[state=checked]:bg-primary',
    'group-hover:bg-primary',
    'group-data-[state=completed]:bg-primary',
    'group-data-[state=active]:bg-primary',
    'after:bg-primary',
  ].map(token => `[class~='${token}']`),
  // Reiter als Pille: die Fläche ist ein Geschwister, die Schrift sitzt im Reiter
  `[class~='data-[state=active]:text-inverted'][class~='outline-primary/25']`,
].join(', ')

/** Wo die Hauptfarbe steht: als Schrift (und Fläche) oder als Fläche mit eigener Schrift darauf. */
export interface PrimaryModeTokens {
  /** `--ui-primary`: Schrift, Rahmen, weiche Fläche — und Fläche, solange `fill` fehlt */
  text: string
  /** Nur wenn die Fläche bleibt und die Schrift sich ändert: die Flächenfarbe */
  fill?: string
  /** Schrift auf der Fläche (`--ui-text-inverted`), nur zusammen mit `fill` */
  onFill?: string
}

export interface PrimaryTokens {
  light: PrimaryModeTokens
  dark: PrimaryModeTokens
}

/** Schrift auf einer dunklen Fläche im Dunkeln: die 900er der Palette, wie Nuxt UI es setzt. */
export const DARK_ON_FILL_NEUTRAL = 'var(--ui-color-neutral-900)'

function lightTextPasses(c: string, ramps: NeutralRamp[]): boolean {
  return ramps.every(ramp => neutralSurfaces(ramp).light.every(bg =>
    ratio(c, bg) >= SEARCH_TARGET && ratio(c, compositeOver(c, bg, SOFT_ALPHA)) >= SEARCH_TARGET))
}

function darkTextPasses(c: string, ramps: NeutralRamp[]): boolean {
  return ramps.every(ramp => neutralSurfaces(ramp).dark.every(bg =>
    ratio(c, bg) >= SEARCH_TARGET && ratio(c, compositeOver(c, bg, SOFT_ALPHA)) >= SEARCH_TARGET))
}

/** Die Schrift auf einer Fläche: der erste Kandidat, der 4,5 zu 1 erreicht (Schwarz erreicht es immer, wenn Weiß es nicht tut). */
function pickOnFill(fill: string, candidates: string[], ramps: NeutralRamp[]): string {
  const passes = (c: string) => c === DARK_ON_FILL_NEUTRAL
    ? ramps.every(ramp => ratio(ramp[900], fill) >= SEARCH_TARGET)
    : ratio(c, fill) >= SEARCH_TARGET
  const hit = candidates.find(passes)
  if (hit) return hit
  return ratio('#000000', fill) >= ratio('#ffffff', fill) ? '#000000' : '#ffffff'
}

/**
 * Die Hauptfarbe einer Farbwelt für beide Schemata.
 *
 * DIE REGEL (wie bei Text- und Statusfarben): Farbton und Sättigung bleiben,
 * die Helligkeit rückt von der bisherigen Stufe aus nur so weit, bis die
 * Farbe als SCHRIFT auf jeder Fläche jeder neutralen Palette besteht (Seite,
 * gedämpfte und erhöhte Fläche, die eigene 10-Prozent-Fläche).
 *
 * Zwei Wege für die Fläche (z. B. Knopf):
 * - `keepFill: false` — die Fläche IST die Schriftfarbe. Im Hellen trägt
 *   sie weiße Schrift (Weiß ist eine der geprüften Flächen, besteht also
 *   von selbst), im Dunkeln die 900er der Palette (eigens geprüft).
 * - `keepFill: true` — die Fläche behält die bisherige Stufe, nur die
 *   Schrift DARAUF wird passend gewählt (Weiß, sonst die 950er der
 *   Farbwelt, sonst Schwarz); `--ui-primary` als Schrift rückt trotzdem.
 *   Für Farbwelten, deren Fläche beim Abdunkeln ihren Charakter verlöre
 *   (Gelb wird Braun), und für Custom Themes: die Farbe des Owners bleibt.
 */
export function primaryTokens(
  ramp: Record<Shade, string>,
  opts: {
    lightShade: Shade
    darkShade: Shade
    keepFill: boolean
    ramps: NeutralRamp[]
    /** false = die Fläche bleibt EXAKT (Custom Theme: die Farbe des Owners); true = sie rückt höchstens bis 3 zu 1 */
    fillNonText?: boolean
  },
): PrimaryTokens | null {
  const { lightShade, darkShade, keepFill, ramps, fillNonText = true } = opts
  const lightText = shiftLightnessUntil(ramp[lightShade], -1, c => lightTextPasses(c, ramps))
  const darkText = shiftLightnessUntil(ramp[darkShade], 1, c => darkTextPasses(c, ramps)
    && (keepFill || ramps.every(r => ratio(r[900], c) >= SEARCH_TARGET)))
  // Eine bleibende Fläche muss als Bedienelement 3 zu 1 neben JEDER Fläche
  // halten (auch der erhöhten) — sonst rückt auch sie, aber nur bis dahin.
  const lightFill = fillNonText
    ? shiftLightnessUntil(ramp[lightShade], -1, c => ramps.every(r =>
      neutralSurfaces(r).light.every(bg => ratio(c, bg) >= NON_TEXT_SEARCH_TARGET)))
    : ramp[lightShade]
  const darkFill = fillNonText
    ? shiftLightnessUntil(ramp[darkShade], 1, c => ramps.every(r =>
      neutralSurfaces(r).dark.every(bg => ratio(c, bg) >= NON_TEXT_SEARCH_TARGET)))
    : ramp[darkShade]
  if (!lightText || !darkText || !lightFill || !darkFill) return null

  const light: PrimaryModeTokens = { text: lightText }
  if (keepFill && lightText !== lightFill) {
    light.fill = lightFill
    light.onFill = pickOnFill(lightFill, ['#ffffff', ramp[950], '#000000'], ramps)
  }
  const dark: PrimaryModeTokens = { text: darkText }
  if (keepFill && darkText !== darkFill) {
    dark.fill = darkFill
    dark.onFill = pickOnFill(darkFill, [DARK_ON_FILL_NEUTRAL, '#ffffff', '#000000'], ramps)
  }
  return { light, dark }
}

/**
 * DAS GATE für die Hauptfarbe: alle Paarungen der fertigen Werte, über jede
 * Palette. Schrift 4,5 zu 1; eine eigene Fläche zusätzlich 3 zu 1 gegen die
 * Seite (Bedienelement ohne Schrift, etwa Schalter oder Häkchen-Kasten).
 */
export function auditPrimaryTokens(name: string, tokens: PrimaryTokens, ramps: Record<string, NeutralRamp>): ContrastFinding[] {
  const findings: ContrastFinding[] = []
  const check = (where: string, a: string, b: string, min = TEXT_MIN_RATIO) => {
    const value = ratio(a, b)
    if (value < min) findings.push({ where: `${where} (${a} auf ${b})`, ratio: value })
  }
  const { light, dark } = tokens
  if (!light.fill) check(`${name} hell: Weiß auf der Fläche`, '#ffffff', light.text)
  else check(`${name} hell: Schrift auf der Fläche`, light.onFill!, light.fill)
  for (const [palette, ramp] of Object.entries(ramps)) {
    const surfaces = neutralSurfaces(ramp)
    for (const bg of surfaces.light) {
      check(`${name} hell, ${palette}: als Schrift`, light.text, bg)
      check(`${name} hell, ${palette}: auf der 10-Prozent-Fläche`, light.text, compositeOver(light.text, bg, SOFT_ALPHA))
      if (light.fill) check(`${name} hell, ${palette}: Fläche neben der Seite`, light.fill, bg, NON_TEXT_MIN_RATIO)
    }
    for (const bg of surfaces.dark) {
      check(`${name} dunkel, ${palette}: als Schrift`, dark.text, bg)
      check(`${name} dunkel, ${palette}: auf der 10-Prozent-Fläche`, dark.text, compositeOver(dark.text, bg, SOFT_ALPHA))
      if (dark.fill) check(`${name} dunkel, ${palette}: Fläche neben der Seite`, dark.fill, bg, NON_TEXT_MIN_RATIO)
    }
    if (!dark.fill) check(`${name} dunkel, ${palette}: dunkle Schrift auf der Fläche`, ramp[900], dark.text)
    else if (dark.onFill === DARK_ON_FILL_NEUTRAL) check(`${name} dunkel, ${palette}: Schrift auf der Fläche`, ramp[900], dark.fill)
  }
  if (dark.fill && dark.onFill !== DARK_ON_FILL_NEUTRAL) check(`${name} dunkel: Schrift auf der Fläche`, dark.onFill!, dark.fill)
  return findings
}

/** Wert für `--ui-primary`: die Stufe, solange sie unverändert besteht, sonst die gerechnete Farbe. */
export function primaryValue(text: string, ramp: Record<Shade, string>, shade: Shade): string {
  return text === ramp[shade] ? `var(--ui-color-primary-${shade})` : text
}

/**
 * Die Flächen-Blöcke einer Farbwelt mit „Fläche bleibt". `attrs` ist der
 * Attribut-Teil des Selektors (`[data-theme='honey']`, mit Variante
 * `[data-theme='honey'][data-variant='soft']`). Hell über `:not(.dark)`,
 * damit der helle Block im Dunkeln nicht mitgilt. `cancel` = diese Stellung
 * braucht KEINEN Flächen-Block, ihre Grundfarbwelt aber schon: die Werte
 * fallen auf die der Seite zurück.
 */
export function primaryFillCssBlocks(
  attrs: string,
  mode: 'light' | 'dark',
  tokens: PrimaryModeTokens | 'cancel',
  fillShade: Shade,
  fillRamp?: Record<Shade, string>,
): string {
  const scope = mode === 'light' ? `:root${attrs}:not(.dark)` : `.dark${attrs}`
  const body = tokens === 'cancel'
    ? ['  --ui-primary: inherit;', '  --ui-text-inverted: inherit;', '  --ui-primary-focus: inherit;']
    : [
        `  --ui-primary: ${tokens.fill === fillRamp?.[fillShade] ? `var(--ui-color-primary-${fillShade})` : tokens.fill};`,
        `  --ui-text-inverted: ${tokens.onFill};`,
        `  --ui-primary-focus: ${tokens.text};`,
      ]
  return `${scope} :is(${PRIMARY_FILL_SELECTOR}) {\n${body.join('\n')}\n}`
}

/**
 * FOKUS-RAHMEN: Nuxt UI malt ihn mit 25 Prozent Deckkraft der Farbe
 * (`outline-primary/25`) — auf heller Seite unter 3 zu 1. Hier volle
 * Deckkraft; jede dieser Farben besteht als Schrift 4,5 zu 1, also als
 * Rahmen erst recht 3 zu 1. Die Hauptfarbe nimmt in einem Flächen-Element
 * die Schriftfarbe (`--ui-primary-focus`), nicht die hellere Fläche.
 */
export function focusRingCss(): string {
  const colors = ['secondary', 'success', 'info', 'warning', 'error']
  return [
    `.outline-primary\\/25:focus-visible {\n  outline-color: var(--ui-primary-focus, var(--ui-primary));\n}`,
    ...colors.map(c => `.outline-${c}\\/25:focus-visible {\n  outline-color: var(--ui-${c});\n}`),
    `.outline-inverted\\/25:focus-visible {\n  outline-color: var(--ui-text-highlighted);\n}`,
  ].join('\n\n')
}
