/**
 * `tokens.css` — DIE TOKENS ALS CSS, ABGELEITET AUS `tokens.json` (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.6, Paket K2).
 *
 * ── SIE RECHNET NICHT NOCH EINMAL ────────────────────────────────────────
 * Die EINZIGE Eingabe ist das Token-Objekt. Kein Preset, keine Rampe, keine
 * Farb-Mathematik — jeder Hex in dieser Datei ist wörtlich einer aus
 * `tokens.json`, und der Test der Deckungsgleichheit kann das deshalb ZÄHLEN
 * statt zu glauben (§2.6). Eine zweite Ableitung aus dem Preset wäre der
 * klassische Weg, auf dem CSS und JSON eines Tages verschiedene Farben zeigen,
 * ohne dass irgendwo etwas rot wird.
 *
 * ── ZWEI BLÖCKE, EINE DATEI ──────────────────────────────────────────────
 * (1) `:root` und `.dark` im NAMENSSCHEMA DER THEMES-ENGINE
 *     (`--ui-color-primary-<stufe>`, `--ui-primary`, `--ui-color-neutral-…`) —
 *     damit eine Community, die diese Marke einsetzt, die Datei einfach
 *     einhängen kann. ÜBERNOMMEN wird das SCHEMA, nicht der Code (§2.17,
 *     A14): `customThemeCss` in `packages/themes` bleibt unangetastet, es gibt
 *     hier keinen Import dorthin.
 * (2) `@theme` für Tailwind v4 — dieselben Werte unter den Namen, unter denen
 *     Tailwind sie zu Utilities macht (`--color-*`, `--font-*`, `--text-*`,
 *     `--radius-*`, `--ease-*`, `--duration-*`).
 *
 * ── DIE DUNKLE HÄLFTE STEHT VOLLSTÄNDIG DA ───────────────────────────────
 * `.dark` setzt die Marken-Rampe UND alle Rollen neu. Nur die Rollen zu
 * setzen sähe kürzer aus und wäre falsch: `--ui-color-primary-600` bliebe die
 * helle Stufe, und jede Komponente, die die Rampe direkt liest (Nuxt UI tut
 * das), zeigte im dunklen Modus die helle Marke.
 *
 * DIESE DATEI IST PUR: kein i18n, kein H3, kein Appwrite, kein Vue.
 */

import { BRAND_TOKEN_GENERATOR, BRAND_TOKEN_TYPE_STEPS } from './brandTokens'
import type {
  BrandColorRoleTokenGroup,
  BrandRampTokenGroup,
  BrandTokenFile,
} from './types/brandKit'
import { BRAND_RAMP_SHADES } from './types/brand'

/**
 * WELCHE STUFE IM DUNKLEN `--ui-primary` STELLT — dieselbe Zahl, die
 * `customThemeCss` als Vorgabe benutzt (`darkAlias`, Themes-Engine). Auf
 * dunklem Grund ist die 600er zu satt; die 400er ist die Stufe, die dort noch
 * als Marke gelesen wird.
 */
export const BRAND_CSS_DARK_PRIMARY_SHADE = 400
/** Und im Hellen — ebenfalls die Vorgabe der Engine. */
export const BRAND_CSS_LIGHT_PRIMARY_SHADE = 600

/**
 * EIN ALIAS AUFGELÖST — `{color.brand.600}` → der Hex dieses Tokens.
 *
 * `null`, wenn der Pfad ins Leere zeigt. Das ist der Grund, warum es diese
 * Funktion überhaupt gibt: sie ist zugleich der PRÜFER (der Test läuft jeden
 * Alias hier durch) und der einzige Weg, auf dem die CSS-Datei an einen
 * Rollen-Wert kommt. Ein Alias, der nirgends auflöst, fällt damit im Test auf
 * und nicht erst im Werkzeug des Kunden.
 */
export function resolveBrandTokenAlias(tokens: BrandTokenFile, alias: string): string | null {
  const match = /^\{([^}]+)\}$/.exec(alias.trim())
  if (!match) return null
  let node: unknown = tokens
  for (const segment of (match[1] ?? '').split('.')) {
    if (typeof node !== 'object' || node === null) return null
    node = (node as Record<string, unknown>)[segment]
  }
  if (typeof node !== 'object' || node === null) return null
  const value = (node as { $value?: unknown }).$value
  // Ein Alias auf einen Alias ist erlaubt, aber genau EINE Ebene tief — mehr
  // wäre eine Kette, in der niemand mehr sieht, welche Farbe herauskommt.
  if (typeof value === 'string') return resolveBrandTokenAlias(tokens, value)
  if (typeof value !== 'object' || value === null) return null
  const hex = (value as { hex?: unknown }).hex
  return typeof hex === 'string' ? hex : null
}

/** Die Stufen einer Rampen-Gruppe als Hex — in Katalog-Reihenfolge. */
function rampHexes(group: BrandRampTokenGroup): { shade: number, hex: string }[] {
  const out: { shade: number, hex: string }[] = []
  for (const shade of BRAND_RAMP_SHADES) {
    const node = group[String(shade)]
    if (typeof node === 'string' || !node) continue
    out.push({ shade, hex: node.$value.hex })
  }
  return out
}

/** Die Rollen einer Modus-Gruppe, aufgelöst — `$`-Schlüssel bleiben draußen. */
function roleHexes(
  tokens: BrandTokenFile,
  group: BrandColorRoleTokenGroup,
): { id: string, hex: string }[] {
  const out: { id: string, hex: string }[] = []
  for (const [id, node] of Object.entries(group)) {
    if (id.startsWith('$') || typeof node === 'string' || !node) continue
    const hex = resolveBrandTokenAlias(tokens, node.$value)
    if (hex) out.push({ id, hex })
  }
  return out
}

/**
 * EIN FAMILIENNAME FÜR CSS — mit Anführungszeichen, sobald er nicht aus einem
 * einzelnen Wort besteht. `Source Serif 4` ohne Anführungszeichen ist in CSS
 * gültig, aber `4` als eigenes Bezeichner-Stück ist es nicht — genau die Art
 * Fehler, die erst im Browser des Kunden auffällt.
 */
function cssFamily(name: string): string {
  return /^[a-z][a-z0-9-]*$/i.test(name) ? name : `'${name.replace(/'/g, '')}'`
}

function cssStack(families: readonly string[]): string {
  return families.map(cssFamily).join(', ')
}

function dimension(value: { value: number, unit: string }): string {
  return `${value.value}${value.unit}`
}

/**
 * DIE DATEI. Sie ist bewusst NICHT minifiziert und trägt einen Kopf: sie wird
 * gelesen, bevor sie eingehängt wird.
 */
export function renderBrandTokensCss(tokens: BrandTokenFile): string {
  const meta = tokens.$extensions['supply.branding/meta']
  const lines: string[] = []

  lines.push('/* tokens.css — abgeleitet aus tokens.json (DTCG)')
  lines.push(` * ${tokens.$description}`)
  lines.push(` * Stand ${meta.stand || '—'} · Fassung ${meta.formatVersion} · ${BRAND_TOKEN_GENERATOR}`)
  lines.push(' * Gerechnet, nicht von Hand gepflegt — jede Farbe steht so in tokens.json. */')
  lines.push('')

  const lightRamp = rampHexes(tokens.color.brand)
  const darkRamp = rampHexes(tokens.color['brand-dark'])
  const neutralRamp = rampHexes(tokens.color.neutral)
  const lightRoles = roleHexes(tokens, tokens.color.light)
  const darkRoles = roleHexes(tokens, tokens.color.dark)
  /* Der Akzent ist im Katalog eine ROLLE (`accent`) — dann steht er schon in
   * der Rollen-Schleife. Nur wenn diese Marke ihn nicht als Rolle führt,
   * bekommt er seine eigene Zeile: eine doppelt gesetzte CSS-Variable ist
   * kein Fehler, aber sie lässt zwei Werte für dieselbe Farbe zu. */
  const accentIsRole = lightRoles.some(role => role.id === 'accent')
  const accentLine = `--brand-color-accent: ${tokens.color.accent.$value.hex};`

  // ── Block 1a: :root (Themes-Namensschema) ────────────────────────────────
  lines.push(':root {')
  for (const entry of lightRamp) lines.push(`  --ui-color-primary-${entry.shade}: ${entry.hex};`)
  for (const entry of neutralRamp) lines.push(`  --ui-color-neutral-${entry.shade}: ${entry.hex};`)
  lines.push(`  --ui-primary: var(--ui-color-primary-${BRAND_CSS_LIGHT_PRIMARY_SHADE});`)
  for (const role of lightRoles) lines.push(`  --brand-color-${role.id}: ${role.hex};`)
  if (!accentIsRole) lines.push(`  ${accentLine}`)
  lines.push(`  --brand-font-heading: ${cssStack(tokens.font.heading.$value)};`)
  lines.push(`  --brand-font-body: ${cssStack(tokens.font.body.$value)};`)
  lines.push(`  --brand-font-mono: ${cssStack(tokens.font.mono.$value)};`)
  lines.push(`  --brand-font-weight-heading: ${tokens.font.weight.heading.$value};`)
  lines.push(`  --brand-radius-mark: ${dimension(tokens.radius.mark.$value)};`)
  for (const [id, node] of Object.entries(tokens.motion.duration)) {
    if (id.startsWith('$') || typeof node === 'string' || !node) continue
    lines.push(`  --brand-motion-${id}: ${dimension(node.$value)};`)
  }
  for (const [id, node] of Object.entries(tokens.motion.easing)) {
    if (id.startsWith('$') || typeof node === 'string' || !node) continue
    lines.push(`  --brand-easing-${id}: cubic-bezier(${node.$value.join(', ')});`)
  }
  lines.push('}')
  lines.push('')

  // ── Block 1b: .dark ──────────────────────────────────────────────────────
  lines.push('.dark {')
  for (const entry of darkRamp) lines.push(`  --ui-color-primary-${entry.shade}: ${entry.hex};`)
  lines.push(`  --ui-primary: var(--ui-color-primary-${BRAND_CSS_DARK_PRIMARY_SHADE});`)
  for (const role of darkRoles) lines.push(`  --brand-color-${role.id}: ${role.hex};`)
  if (!accentIsRole) lines.push(`  ${accentLine}`)
  lines.push('}')
  lines.push('')

  // ── Block 2: Tailwind v4 ─────────────────────────────────────────────────
  lines.push('/* Tailwind v4: dieselben Werte als Theme-Variablen. */')
  lines.push('@theme {')
  for (const entry of lightRamp) lines.push(`  --color-brand-${entry.shade}: ${entry.hex};`)
  for (const role of lightRoles) lines.push(`  --color-brand-${role.id}: ${role.hex};`)
  if (!accentIsRole) lines.push(`  --color-brand-accent: ${tokens.color.accent.$value.hex};`)
  lines.push(`  --font-heading: ${cssStack(tokens.font.heading.$value)};`)
  lines.push(`  --font-body: ${cssStack(tokens.font.body.$value)};`)
  lines.push(`  --font-mono: ${cssStack(tokens.font.mono.$value)};`)
  for (const step of BRAND_TOKEN_TYPE_STEPS) {
    const node = tokens.type.scale[`${step.id}-size`]
    if (typeof node === 'string' || !node || node.$type !== 'dimension') continue
    lines.push(`  --text-${step.id}: ${dimension(node.$value)};`)
  }
  lines.push(`  --radius-mark: ${dimension(tokens.radius.mark.$value)};`)
  for (const [id, node] of Object.entries(tokens.motion.duration)) {
    if (id.startsWith('$') || typeof node === 'string' || !node) continue
    lines.push(`  --duration-${id}: ${dimension(node.$value)};`)
  }
  for (const [id, node] of Object.entries(tokens.motion.easing)) {
    if (id.startsWith('$') || typeof node === 'string' || !node) continue
    lines.push(`  --ease-${id}: cubic-bezier(${node.$value.join(', ')});`)
  }
  lines.push('}')

  return `${lines.join('\n')}\n`
}
