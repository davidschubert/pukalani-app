import { SHADES, type Shade, generateRamp, contrastRatio, HEX_COLOR_RE } from './ramp'
import { oklchToHex } from './oklch'
import {
  TEXT_MIN_RATIO,
  auditNeutralTextTokens,
  auditStatusTokens,
  neutralTextCssBlocks,
  neutralTextTokens,
  statusTokens,
  type NeutralRamp,
} from './textContrast'

/**
 * Pure Generator-Logik für den Theme-Katalog (Vollausbau-Plan Schritt 3):
 * ThemeSpec → CSS im Format der Bestands-Themes (public/themes/*.css) +
 * Registry-Einträge. Ohne Nuxt-/Node-Deps → unit-testbar; der CLI-Wrapper
 * (scripts/generate-themes.ts) macht nur I/O. Deterministisch: gleicher
 * Input ⇒ byte-gleicher Output.
 */

export interface ThemeSpecVariant {
  id: string
  base: string
}

export interface ThemeSpec {
  id: string
  name: string
  /** Basisfarbe: '#rrggbb' oder 'oklch(58.5% 0.233 277.117)' */
  base: string
  /** Varianten (Katalog-Ziel: exakt 10 — bis E1–E7 entschieden sind, frei) */
  variants: ThemeSpecVariant[]
  /** Default '0.375rem' (wie Bestands-Themes) */
  radius?: string
}

export interface GeneratedTheme {
  id: string
  css: string
  /** primary-500 der Basis-Ramp (Registry-Chip) */
  color: string
  variants: { id: string, color: string }[]
  /** Kontrast-Gate-Verschiebungen (z. B. 'ocean: light 600→700') — fürs Log */
  adjustments: string[]
}

// Kontrast-Gate (Plan Schritt 4, Basisstufe): --ui-primary muss als UI-
// Komponenten-Farbe WCAG 1.4.11 (≥ 3:1) gegen den jeweiligen Seitengrund
// bestehen. Näherungen der Nuxt-UI-Defaults: light bg weiß, dark bg neutral-900.
const LIGHT_BG = '#ffffff'
const DARK_BG = '#171717'
const MIN_RATIO = 3
const LIGHT_CANDIDATES: Shade[] = [600, 700, 800]
const DARK_CANDIDATES: Shade[] = [400, 300, 200]

// Anker fest auf 500: die Katalog-Basisfarbe IST die 500er-Stufe — wie in den
// handkuratierten Bestands-CSS (und im Tailwind-Denkmodell „Brand = 500").
// Der Auto-Anker (nächstliegende Helligkeit) würde helle Basen (sunset,
// citrus) auf 300/400 legen und die halbe Ramp sichtbar verdunkeln — bewusst
// abgelehnt bei der Abnahme (2026-07-24): visuelle Kontinuität der Live-Sites
// + „Katalogfarbe = Swatch = 500" schlagen die perfekte Kurventreue. Zu helle
// --ui-primary-Stufen fängt das Kontrast-Gate (Stufen-Shift).
const RAMP_CONFIG = { anchor: 500 as Shade }

/** 'oklch(58.5% 0.233 277.117)' | '#rrggbb' → '#rrggbb' (klein); null = ungültig */
export function specColorToHex(value: string): string | null {
  if (HEX_COLOR_RE.test(value)) return value.toLowerCase()
  const match = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/i.exec(value.trim())
  if (!match) return null
  return oklchToHex({ l: Number(match[1]) / 100, c: Number(match[2]), h: Number(match[3]) })
}

function pickPrimaryShade(
  ramp: Record<Shade, string>,
  candidates: Shade[],
  background: string,
): Shade | null {
  for (const shade of candidates) {
    const ratio = contrastRatio(ramp[shade], background)
    if (ratio !== null && ratio >= MIN_RATIO) return shade
  }
  return null
}

function rampBlock(ramp: Record<Shade, string>, indent = '  '): string {
  return SHADES.map(shade => `${indent}--ui-color-primary-${shade}: ${ramp[shade]};`).join('\n')
}

/** Ein Theme (Basis + Varianten) → CSS-Datei-Inhalt + Registry-Daten. */
export function generateTheme(spec: ThemeSpec): GeneratedTheme {
  const baseHex = specColorToHex(spec.base)
  if (!baseHex) throw new Error(`Theme '${spec.id}': ungültige Basisfarbe '${spec.base}'`)
  const baseRamp = generateRamp(baseHex, RAMP_CONFIG)
  if (!baseRamp) throw new Error(`Theme '${spec.id}': Ramp-Generierung fehlgeschlagen`)

  const adjustments: string[] = []
  const lightShade = pickPrimaryShade(baseRamp, LIGHT_CANDIDATES, LIGHT_BG)
  const darkShade = pickPrimaryShade(baseRamp, DARK_CANDIDATES, DARK_BG)
  if (!lightShade || !darkShade) {
    throw new Error(`Theme '${spec.id}': Kontrast-Gate nicht erfüllbar (light=${lightShade}, dark=${darkShade}) — Basisfarbe anpassen`)
  }
  if (lightShade !== 600) adjustments.push(`${spec.id}: light 600→${lightShade}`)
  if (darkShade !== 400) adjustments.push(`${spec.id}: dark 400→${darkShade}`)

  const parts: string[] = [
    `/* Pukalani Theme: ${spec.id} — GENERIERT von scripts/generate-themes.ts, nicht von Hand editieren */`,
    '',
    `:root[data-theme='${spec.id}'] {`,
    rampBlock(baseRamp),
    `  --ui-primary: var(--ui-color-primary-${lightShade});`,
    `  --ui-radius: ${spec.radius ?? '0.375rem'};`,
    `}`,
    '',
    `.dark[data-theme='${spec.id}'] {`,
    `  --ui-primary: var(--ui-color-primary-${darkShade});`,
    `}`,
  ]

  const variants: GeneratedTheme['variants'] = []
  for (const variant of spec.variants) {
    const variantHex = specColorToHex(variant.base)
    if (!variantHex) throw new Error(`Theme '${spec.id}', Variante '${variant.id}': ungültige Farbe '${variant.base}'`)
    const variantRamp = generateRamp(variantHex, RAMP_CONFIG)
    if (!variantRamp) throw new Error(`Theme '${spec.id}', Variante '${variant.id}': Ramp fehlgeschlagen`)

    const vLight = pickPrimaryShade(variantRamp, LIGHT_CANDIDATES, LIGHT_BG)
    const vDark = pickPrimaryShade(variantRamp, DARK_CANDIDATES, DARK_BG)
    if (!vLight || !vDark) {
      throw new Error(`Theme '${spec.id}', Variante '${variant.id}': Kontrast-Gate nicht erfüllbar`)
    }

    parts.push(
      '',
      `/* Farbvariation via CSS-Variablen: data-variant überschreibt die Primary-Ramp */`,
      '',
      `:root[data-theme='${spec.id}'][data-variant='${variant.id}'] {`,
      rampBlock(variantRamp),
      // Nur abweichende Stufen überschreiben — Basis-Block liefert den Default
      ...(vLight !== lightShade ? [`  --ui-primary: var(--ui-color-primary-${vLight});`] : []),
      `}`,
      ...(vDark !== darkShade
        ? ['', `.dark[data-theme='${spec.id}'][data-variant='${variant.id}'] {`, `  --ui-primary: var(--ui-color-primary-${vDark});`, `}`]
        : []),
    )
    if (vLight !== 600) adjustments.push(`${spec.id}/${variant.id}: light 600→${vLight}`)
    if (vDark !== 400) adjustments.push(`${spec.id}/${variant.id}: dark 400→${vDark}`)

    variants.push({ id: variant.id, color: variantRamp[500] })
  }

  return {
    id: spec.id,
    css: `${parts.join('\n')}\n`,
    color: baseRamp[500],
    variants,
    adjustments,
  }
}

/** Registry-Modul (themeRegistry.gen.ts) aus den generierten Themes. */
export function buildRegistryModule(themes: GeneratedTheme[], specs: ThemeSpec[]): string {
  const nameById = new Map(specs.map(spec => [spec.id, spec.name]))
  const entries = themes.map((theme) => {
    const variants = theme.variants.map(v => `    { id: '${v.id}', color: '${v.color}' },`).join('\n')
    return [
      `  { id: '${theme.id}', name: '${nameById.get(theme.id)}', file: '/themes/${theme.id}.css', color: '${theme.color}', variants: [`,
      ...(variants ? [variants] : []),
      `  ] },`,
    ].join('\n')
  }).join('\n')
  return [
    `// GENERIERT von scripts/generate-themes.ts aus theme.catalog.ts — nicht von Hand editieren.`,
    `// Handgepflegt bleiben: default-Eintrag, NEUTRAL_REGISTRY, Typen (themeRegistry.ts).`,
    `import type { PukalaniTheme } from './themeRegistry'`,
    ``,
    `export const GENERATED_THEMES: PukalaniTheme[] = [`,
    entries,
    `]`,
    ``,
  ].join('\n')
}

// ── Schrift-Kontrast der Text- und Statusfarben (Q07) ─────────────────────

/**
 * Ausgangswerte der zwei Statusfarben: Tailwind v4 `red` und `green`, Stufe
 * 500 (hell) und 400 (dunkel) — genau die Stufen, auf die Nuxt UI
 * `--ui-error` und `--ui-success` legt. Hier als Werte statt als
 * `var(--ui-color-error-500)`, weil das Gate die fertige Farbe nachrechnen
 * muss (dieselbe Lage wie bei den Paletten in neutral.css).
 */
export const STATUS_BASES = {
  error: { light: 'oklch(63.7% 0.237 25.331)', dark: 'oklch(70.4% 0.191 22.216)' },
  success: { light: 'oklch(72.3% 0.219 149.579)', dark: 'oklch(79.2% 0.209 151.711)' },
} as const

/** neutral.css → { mist: { 50: '#…', … }, … }; wirft bei einer unvollständigen Palette. */
export function parseNeutralPalettes(css: string): Record<string, NeutralRamp> {
  const palettes: Record<string, NeutralRamp> = {}
  for (const block of css.matchAll(/:root\[data-neutral='([a-z0-9-]+)'\]\s*\{([^}]+)\}/g)) {
    const name = block[1]!
    const ramp = {} as NeutralRamp
    for (const line of block[2]!.matchAll(/--ui-color-neutral-(\d+):\s*([^;]+);/g)) {
      const hex = specColorToHex(line[2]!.trim())
      if (!hex) throw new Error(`neutral.css, Palette '${name}': ungültige Farbe '${line[2]}'`)
      ramp[Number(line[1]) as Shade] = hex
    }
    const missing = SHADES.filter(shade => !ramp[shade])
    if (missing.length) throw new Error(`neutral.css, Palette '${name}': Stufen fehlen (${missing.join(', ')})`)
    palettes[name] = ramp
  }
  if (!Object.keys(palettes).length) throw new Error('neutral.css: keine Palette gefunden')
  return palettes
}

export interface GeneratedContrast {
  css: string
  /** Für das Log: was sich gegenüber der Nuxt-UI-Vorgabe bewegt hat */
  notes: string[]
}

/**
 * public/themes/contrast.css: die zwei blassen Textfarben je neutraler
 * Palette und die zwei Statusfarben, jeweils hell und dunkel. Immer geladen,
 * NACH neutral.css. Die Datei ist unlayered und schlägt damit die Vorgaben
 * von Nuxt UI (`@layer theme`) — deshalb nennt JEDER helle Block sein dunkles
 * Gegenstück: ein unlayered `:root` gewänne sonst auch gegen `.dark`.
 *
 * KONTRAST-GATE: jede Paarung wird nach dem Erzeugen nachgerechnet; liegt
 * eine unter 4,5 zu 1, bricht der Generator ab.
 */
export function generateContrastCss(palettes: Record<string, NeutralRamp>): GeneratedContrast {
  const ramps = Object.values(palettes)
  const failures: string[] = []
  const notes: string[] = []
  const parts: string[] = [
    `/* Pukalani Schrift-Kontrast — GENERIERT von scripts/generate-themes.ts, nicht von Hand editieren.`,
    `   Die zwei blassen Textfarben je neutraler Palette und die zwei Statusfarben: Farbton wie`,
    `   in neutral.css bzw. Tailwind, Helligkeit so weit verschoben, dass sie als Schrift`,
    `   ${String(TEXT_MIN_RATIO).replace('.', ',')} zu 1 erreichen (Logik + Gate: shared/textContrast.ts). Immer geladen. */`,
  ]

  const status = {} as Record<keyof typeof STATUS_BASES, { light: string, dark: string }>
  for (const name of Object.keys(STATUS_BASES) as (keyof typeof STATUS_BASES)[]) {
    const base = { light: specColorToHex(STATUS_BASES[name].light)!, dark: specColorToHex(STATUS_BASES[name].dark)! }
    const tokens = statusTokens(base, ramps)
    if (!tokens) throw new Error(`Kontrast-Gate: für '${name}' gibt es keine Helligkeit, die ${TEXT_MIN_RATIO}:1 erreicht`)
    failures.push(...auditStatusTokens(name, tokens, palettes).map(f => `${f.where}: ${f.ratio.toFixed(2)}:1`))
    status[name] = tokens
    notes.push(`${name}: hell ${base.light}→${tokens.light}, dunkel ${base.dark}→${tokens.dark}`)
  }
  parts.push(
    '',
    `:root {`,
    `  --ui-error: ${status.error.light};`,
    `  --ui-success: ${status.success.light};`,
    `}`,
    '',
    `.dark {`,
    `  --ui-error: ${status.error.dark};`,
    `  --ui-success: ${status.success.dark};`,
    `}`,
  )

  for (const [name, ramp] of Object.entries(palettes)) {
    const tokens = neutralTextTokens(ramp)
    if (!tokens) throw new Error(`Kontrast-Gate: Palette '${name}' erreicht ${TEXT_MIN_RATIO}:1 mit keiner Helligkeit`)
    failures.push(...auditNeutralTextTokens(name, ramp, tokens).map(f => `${f.where}: ${f.ratio.toFixed(2)}:1`))
    parts.push('', ...neutralTextCssBlocks(name, tokens).flatMap((block, i) => (i ? ['', block] : [block])))
    notes.push(`${name}: dimmed hell ${ramp[400]}→${tokens.light.dimmed}, muted hell ${ramp[500]}→${tokens.light.muted}, dimmed dunkel ${ramp[500]}→${tokens.dark.dimmed}`)
  }

  if (failures.length) {
    throw new Error(`Kontrast-Gate (Schrift, mindestens ${TEXT_MIN_RATIO}:1) nicht bestanden:\n  ${failures.join('\n  ')}`)
  }
  return { css: `${parts.join('\n')}\n`, notes }
}
