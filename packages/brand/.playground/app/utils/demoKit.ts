/**
 * KLICKDUMMY „BRAND BOOK & KIT" (Produkt 03, Phase 3 zum Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.15) — statische Demo-Daten und PURE
 * Rechnungen für die drei Werkstatt-Kapitel (Nomenklatur · AI-Guidelines ·
 * Pressekit), die Lieferseite `/brand/demo/kit` und die Anwendungs-Kapitel
 * der Leseansicht.
 *
 * DREI DINGE, DIE HIER ECHT SIND — und deshalb nicht „vereinfacht" werden
 * dürfen:
 *  1. **Die Dateien sind GERECHNET, nicht abgeschrieben.** `demoTokensJson()`,
 *     `demoTokensCss()`, `demoBrandMd()` und `demoBrandJson()` lesen dieselbe
 *     Farb-Mathematik wie der Design-Dummy (`demoDesign.ts` → `themes/shared/
 *     ramp.ts`) und dieselben Foundation-Werte wie die Leseansicht
 *     (`demoFoundation.ts`). §2.6: „Alles wird bei jedem Abruf aus den
 *     bestätigten Werten + Preset gerechnet — keine Spalte, kein Cache."
 *     Ein Hex in `tokens.css` stammt damit BEWEISBAR aus `tokens.json`.
 *  2. **`brand.md` und die gerenderte Vorschau sind EINE Quelle**
 *     (`DK_BRAND_MD_SECTIONS`): die Seite zeigt die Abschnitte als Text, die
 *     Datei setzt daraus Markdown. Zwei Fassungen desselben Dokuments wären
 *     die erste Stelle, an der etwas altert.
 *  3. **Die Fakten-Freigabe ist Opt-in** (§2.4 `p.facts`): fünf Fakten aus dem
 *     Kontext, drei davon freigegeben — die zwei vertraulichen bleiben stehen
 *     UND sichtbar gesperrt, damit der Prototyp die Regel zeigt und nicht nur
 *     ihr Ergebnis.
 *
 * KEINE KI, KEIN NETZ, KEINE DATEI: alles hier ist eine reine Rechnung über
 * Konstanten. Die „Laden"-Knöpfe der Seiten sind Attrappen (§2.15).
 */

import type { FdBlock, FdChapterData } from './demoFoundation'
import { demoFoundation } from './demoFoundation'
import {
  type DsRamp,
  DS_BRAND,
  DS_MONO_STACK,
  DS_MOTION_STAGGER,
  DS_MOTION_TOKENS,
  DS_SHADES,
  DS_TEMPO_OPTIONS,
  dsContrast,
  dsFontPair,
  dsRatioText,
  dsSceneColors,
} from './demoDesign'

// ── Stand, Marke, Preset ───────────────────────────────────────────────────

/** Der Stand des Kits — jüngstes Datum der beteiligten Kapitel (§2.6). */
export const DK_STAND = '9. September 2026'

/** Dateinamens-Stamm (§2.12 Nr. 4: Allowlist `[a-z0-9-]`, hier von Hand). */
export const DK_SLUG = 'kailua-coffee'

/** Das Schriftpaar der Marke — dieselbe Wahl wie im Design-Dummy (`i.pair`). */
export const DK_PAIR = dsFontPair('editorial')

/** Die Farbwelt der Marke — dieselbe Rechnung wie im Design-Dummy (`h.*`). */
export const DK_COLORS = dsSceneColors(DS_BRAND.palette.roast, DS_BRAND.palette.palm, DS_BRAND.palette.roast)

/** Das Tempo der Marke (`l.tempo`) — Grundlage der Motion-Tokens. */
export const DK_TEMPO = DS_TEMPO_OPTIONS[0]!

// ── Rollen je Modus (§2.6 `color.light.*` / `color.dark.*`) ────────────────

export type DkRoleId = 'primary' | 'surface' | 'text' | 'accent'

export interface DkRole {
  id: DkRoleId
  label: string
  note: string
  /** Alias-Pfad in `tokens.json` — hell. */
  aliasLight: string
  /** Alias-Pfad in `tokens.json` — dunkel. */
  aliasDark: string
}

/**
 * VIER ROLLEN, ZWEI MODI, DIESELBEN NAMEN (§1.1 „der größte
 * Wettbewerbsvorsprung"): `color.light.primary` und `color.dark.primary`
 * heißen gleich und zeigen auf verschiedene Stufen — Figma bildet das auf
 * zwei Modi ab, Style Dictionary auf zwei Sets.
 */
export const DK_ROLES: readonly DkRole[] = [
  { id: 'primary', label: 'primary', note: 'Knöpfe, Links, aktive Zustände.', aliasLight: '{color.brand.600}', aliasDark: '{color.brand-dark.400}' },
  { id: 'surface', label: 'surface', note: 'Der Grund, auf dem alles liegt.', aliasLight: '{color.neutral.50}', aliasDark: '{color.neutral.900}' },
  { id: 'text', label: 'text', note: 'Alles Gelesene — nie die 500er-Stufe.', aliasLight: '{color.brand.900}', aliasDark: '{color.neutral.50}' },
  { id: 'accent', label: 'accent', note: 'Ein Signal je Fläche, kein Zweitgrund.', aliasLight: '{color.accent}', aliasDark: '{color.accent}' },
]

/** Der Hex einer Rolle in einem Modus — die EINE Auflösung der Aliasse. */
export function dkRoleHex(id: DkRoleId, scheme: 'light' | 'dark'): string {
  if (id === 'accent') return DK_COLORS.accent
  if (scheme === 'light') {
    if (id === 'primary') return DK_COLORS.rampLight[600]
    if (id === 'surface') return DK_COLORS.neutral[50]
    return DK_COLORS.rampLight[900]
  }
  if (id === 'primary') return DK_COLORS.rampDark[400]
  if (id === 'surface') return DK_COLORS.neutral[900]
  return DK_COLORS.neutral[50]
}

export interface DkRoleRow {
  role: DkRole
  hex: string
  alias: string
  /** Kontrast gegen den Grund desselben Modus — Beleg, kein Token (§2.6). */
  ratio: number | null
  level: string | null
}

/** Die Swatch-Tabelle eines Modus: Hex, Alias und Kontrast-Urteil je Rolle. */
export function demoRoleRows(scheme: 'light' | 'dark'): DkRoleRow[] {
  const ground = dkRoleHex('surface', scheme)
  return DK_ROLES.map((role) => {
    const hex = dkRoleHex(role.id, scheme)
    /* Der Grund misst sich am TEXT, alles andere am Grund — sonst stünde in
     * der Zeile „surface" das Verhältnis einer Farbe zu sich selbst (1,0:1). */
    const verdict = role.id === 'surface'
      ? dsContrast(dkRoleHex('text', scheme), hex)
      : dsContrast(hex, ground)
    return {
      role,
      hex,
      alias: scheme === 'light' ? role.aliasLight : role.aliasDark,
      ratio: verdict?.ratio ?? null,
      level: verdict?.level ?? null,
    }
  })
}

/** Menschliches Urteil zu einem WCAG-Grad (dieselbe Sprache wie im Design). */
export function dkLevelText(level: string): string {
  if (level === 'fail') return 'unter AA'
  // Kurz, weil es in einem Chip neben Name und Hex steht (Sichtbefund 2026-09-09:
  // „nur große Schrift" überlagerte in der Zweier-Reihe den Rollen-Namen).
  if (level === 'AA18') return 'AA groß'
  return level
}

// ── Typografie-Skala (§2.6 `type.scale.*`) ─────────────────────────────────

export interface DkTypeStep {
  id: string
  label: string
  /** Größe in px — die Skala „Ruhig" (1 : 2,6) über 16 px Fließtext. */
  px: number
  rem: string
  lineHeight: number
  weight: number
  /** Welche Schrift die Stufe trägt. */
  face: 'heading' | 'body'
  usage: string
}

export const DK_TYPE_SCALE: readonly DkTypeStep[] = [
  { id: 'h1', label: 'h1', px: 42, rem: '2.625rem', lineHeight: 1.1, weight: 600, face: 'heading', usage: 'Seitentitel — einmal je Seite.' },
  { id: 'h2', label: 'h2', px: 32, rem: '2rem', lineHeight: 1.15, weight: 600, face: 'heading', usage: 'Kapitel und Abschnitte.' },
  { id: 'h3', label: 'h3', px: 24, rem: '1.5rem', lineHeight: 1.25, weight: 600, face: 'heading', usage: 'Unterabschnitte, Karten-Titel.' },
  { id: 'h4', label: 'h4', px: 20, rem: '1.25rem', lineHeight: 1.35, weight: 500, face: 'body', usage: 'Listen-Köpfe, Tabellen-Gruppen.' },
  { id: 'body', label: 'body', px: 16, rem: '1rem', lineHeight: 1.6, weight: 400, face: 'body', usage: 'Fließtext — die Bezugsgröße der Skala.' },
  { id: 'small', label: 'small', px: 13, rem: '0.8125rem', lineHeight: 1.5, weight: 400, face: 'body', usage: 'Herkunft, Preise, Fußnoten (Mono erlaubt).' },
]

// ── Schrift-Lizenzen (§2.6 `LICENSES.md`) ──────────────────────────────────

export interface DkLicense {
  family: string
  weights: string
  source: string
  sourceUrl: string
  spdx: string
  role: string
}

export const DK_LICENSES: readonly DkLicense[] = [
  { family: 'Source Serif 4', weights: '400, 600', source: 'Google Fonts', sourceUrl: 'https://fonts.google.com/specimen/Source+Serif+4', spdx: 'OFL-1.1', role: 'Überschriften' },
  { family: 'Source Sans 3', weights: '400, 500, 600', source: 'Google Fonts', sourceUrl: 'https://fonts.google.com/specimen/Source+Sans+3', spdx: 'OFL-1.1', role: 'Fließtext' },
  { family: 'Geist Mono', weights: '400', source: 'Vercel', sourceUrl: 'https://vercel.com/font', spdx: 'OFL-1.1', role: 'Herkunft und Preise' },
]

export const DK_LICENSE_NOTE = 'Dateien bei der Quelle laden — im Bündel liegen keine Schriftdateien. Wir dürfen sie weitergeben, aber jede Weitergabe wäre eine zweite Fassung, die irgendwann von der Quelle abweicht.'

// ── Die Zeichen-Dateien (§2.6 `marks/`) ────────────────────────────────────

export type DkMarkKind = 'wordmark' | 'monogram'
export type DkMarkVariant = 'light' | 'dark' | 'mono'

export interface DkMarkFile {
  kind: DkMarkKind
  variant: DkMarkVariant
  label: string
  /** Grund und Tinte der Setzung — dieselbe Farbwelt, drei Anwendungen. */
  bg: string
  ink: string
  file: string
  /** Das primäre Zeichen (`j.pick`) — es steht in der README zuerst. */
  primary?: boolean
}

function markFile(kind: DkMarkKind, variant: DkMarkVariant): string {
  return `${DK_SLUG}-${kind}-${variant}.svg`
}

export const DK_MARK_FILES: readonly DkMarkFile[] = [
  { kind: 'wordmark', variant: 'light', label: 'Wortmarke · hell', bg: DS_BRAND.palette.paper, ink: DK_COLORS.rampLight[900], file: markFile('wordmark', 'light'), primary: true },
  { kind: 'wordmark', variant: 'dark', label: 'Wortmarke · dunkel', bg: DK_COLORS.rampLight[900], ink: DS_BRAND.palette.paper, file: markFile('wordmark', 'dark') },
  { kind: 'wordmark', variant: 'mono', label: 'Wortmarke · einfarbig', bg: '#ffffff', ink: '#1b1b1a', file: markFile('wordmark', 'mono') },
  { kind: 'monogram', variant: 'light', label: 'Monogramm · hell', bg: DS_BRAND.palette.paper, ink: DK_COLORS.rampLight[900], file: markFile('monogram', 'light') },
  { kind: 'monogram', variant: 'dark', label: 'Monogramm · dunkel', bg: DK_COLORS.rampLight[900], ink: DS_BRAND.palette.paper, file: markFile('monogram', 'dark') },
  { kind: 'monogram', variant: 'mono', label: 'Monogramm · einfarbig', bg: '#ffffff', ink: '#1b1b1a', file: markFile('monogram', 'mono') },
]

// ── Farb-Umrechnung für DTCG (§2.17: 0–1, vier Stellen, `hex` als Rückfall) ─

/**
 * Hex → DTCG-Farbobjekt. Die Komponenten sind Fließkommazahlen 0–1 auf VIER
 * Stellen gerundet (Style-Dictionary-5.4-Weg); `hex` bleibt als Rückfall für
 * Werkzeuge, die das Objekt noch nicht lesen.
 */
export interface DkDtcgColor {
  colorSpace: 'srgb'
  components: [number, number, number]
  hex: string
}

export function dkColorValue(hex: string): DkDtcgColor {
  const clean = hex.replace('#', '')
  const channel = (start: number): number => {
    const raw = Number.parseInt(clean.slice(start, start + 2), 16)
    return Math.round((raw / 255) * 10000) / 10000
  }
  return { colorSpace: 'srgb', components: [channel(0), channel(2), channel(4)], hex: hex.toLowerCase() }
}

/* Eine JSON-Struktur ohne `any` — rekursiv, weil DTCG-Gruppen beliebig tief
 * schachteln. Sie ist der Rückgabetyp der Token-Rechnung, damit `demoTokensJson`
 * nicht auf `unknown` ausweichen muss. */
export type DkJson = string | number | boolean | null | DkJson[] | { [key: string]: DkJson }

function rampGroup(ramp: DsRamp, description: string): DkJson {
  const group: { [key: string]: DkJson } = { $description: description }
  for (const shade of DS_SHADES) {
    group[String(shade)] = { $type: 'color', $value: { ...dkColorValue(ramp[shade]) } }
  }
  return group
}

function roleGroup(scheme: 'light' | 'dark'): DkJson {
  const group: { [key: string]: DkJson } = {
    $description: scheme === 'light' ? 'Rollen im hellen Modus — Aliasse in die Rampen.' : 'Rollen im dunklen Modus — dieselben Namen, andere Stufen.',
  }
  for (const row of demoRoleRows(scheme)) {
    group[row.role.id] = {
      $type: 'color',
      $value: row.alias,
      $description: row.role.note,
      $extensions: {
        'supply.branding/contrast': {
          pair: row.role.id === 'surface' ? `text-auf-${row.role.id}` : `${row.role.id}-auf-surface`,
          ratio: row.ratio === null ? null : Math.round(row.ratio * 100) / 100,
          level: row.level,
        },
      },
    }
  }
  return group
}

/**
 * `tokens.json` — DTCG 2025.10 (§2.6, Entscheidung §2.20 Nr. 1: EINE Datei mit
 * Geschwister-Gruppen `color.light.*` / `color.dark.*`).
 *
 * Die Typografie-Skala steht ZWEIMAL da: als Einzeltokens (`type.scale.h1`)
 * und als `typography`-Composite — Figma importiert Composites noch nicht
 * (§1.7), Style Dictionary schon.
 */
export function demoTokensObject(): DkJson {
  const scale: { [key: string]: DkJson } = {}
  for (const step of DK_TYPE_SCALE) {
    scale[step.id] = {
      $type: 'typography',
      $value: {
        fontFamily: step.face === 'heading' ? '{font.heading}' : '{font.body}',
        fontSize: { value: step.px, unit: 'px' },
        fontWeight: step.weight,
        lineHeight: step.lineHeight,
      },
      $description: step.usage,
    }
    scale[`${step.id}-size`] = { $type: 'dimension', $value: { value: step.px, unit: 'px' } }
  }

  const durations: { [key: string]: DkJson } = {}
  for (const token of DS_MOTION_TOKENS) {
    durations[token.id] = {
      $type: 'duration',
      $value: { value: Math.round(DK_TEMPO.base * token.factor), unit: 'ms' },
      $description: token.usage,
    }
  }
  durations.stagger = { $type: 'duration', $value: { value: DS_MOTION_STAGGER, unit: 'ms' }, $description: 'Versatz zwischen Geschwistern in Listen.' }

  return {
    $description: `Design-Tokens ${DS_BRAND.title} · Stand ${DK_STAND} · DTCG 2025.10 · gerechnet, nicht gespeichert.`,
    color: {
      brand: rampGroup(DK_COLORS.rampLight, `Marken-Rampe hell, gerechnet aus der Basisfarbe ${DK_COLORS.base}.`),
      'brand-dark': rampGroup(DK_COLORS.rampDark, 'Marken-Rampe dunkel — dieselbe Mathematik, andere Enden.'),
      neutral: rampGroup(DK_COLORS.neutral, 'Getönte Neutral-Rampe: Grund, Flächen, Linien.'),
      accent: { $type: 'color', $value: { ...dkColorValue(DK_COLORS.accent) }, $description: 'Akzent — ein Signal je Fläche.' },
      paper: { $type: 'color', $value: { ...dkColorValue(DK_COLORS.paper) }, $description: 'Der Papierton der Marke, im Druck wie am Bildschirm.' },
      light: roleGroup('light'),
      dark: roleGroup('dark'),
    },
    font: {
      heading: { $type: 'fontFamily', $value: [DK_PAIR.headingFamily, 'Georgia', 'Times New Roman', 'serif'] },
      body: { $type: 'fontFamily', $value: [DK_PAIR.bodyFamily, 'Helvetica Neue', 'Arial', 'sans-serif'] },
      mono: { $type: 'fontFamily', $value: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'] },
      weight: {
        heading: { $type: 'fontWeight', $value: 600 },
        body: { $type: 'fontWeight', $value: 400 },
      },
    },
    type: { scale },
    radius: {
      mark: { $type: 'dimension', $value: { value: 0.8125, unit: 'rem' }, $description: 'Eckenradius der Icon-Fläche — 30 % der Kantenlänge.' },
    },
    motion: {
      duration: durations,
      easing: {
        brand: { $type: 'cubicBezier', $value: [0.22, 0.61, 0.36, 1], $description: 'Langsam anlaufen, sanft ausklingen, nie federn.' },
      },
    },
  }
}

/** `tokens.json` als Text — genau das, was der Download liefert. */
export function demoTokensJson(): string {
  return JSON.stringify(demoTokensObject(), null, 2)
}

/**
 * `tokens.css` — ZWEI Blöcke in einer Datei (§2.6).
 *
 * Block 1 trägt das Namensschema der Themes-Engine (`customThemeCss` ist das
 * Vorbild — die NAMEN werden übernommen, nicht der Code, §2.17), Block 2 ist
 * der `@theme`-Block für Tailwind v4. JEDER Hex hier stammt aus derselben
 * Rechnung wie `tokens.json`; es gibt keine zweite Farbliste.
 */
export function demoTokensCss(): string {
  const lines: string[] = []
  lines.push(`/* Design-Tokens ${DS_BRAND.title}`)
  lines.push(` * Stand ${DK_STAND} · abgeleitet aus tokens.json (DTCG 2025.10)`)
  lines.push(' * Gerechnet aus der Basisfarbe ' + DK_COLORS.base + ' — nicht von Hand gepflegt. */')
  lines.push('')
  lines.push(':root {')
  for (const shade of DS_SHADES) lines.push(`  --ui-color-primary-${shade}: ${DK_COLORS.rampLight[shade]};`)
  for (const shade of DS_SHADES) lines.push(`  --ui-color-neutral-${shade}: ${DK_COLORS.neutral[shade]};`)
  for (const row of demoRoleRows('light')) lines.push(`  --ui-${row.role.id}: ${row.hex};`)
  lines.push(`  --brand-paper: ${DK_COLORS.paper};`)
  lines.push(`  --brand-font-heading: ${DK_PAIR.headingStack};`)
  lines.push(`  --brand-font-body: ${DK_PAIR.bodyStack};`)
  lines.push(`  --brand-font-mono: ${DS_MONO_STACK};`)
  for (const token of DS_MOTION_TOKENS) lines.push(`  --brand-motion-${token.id}: ${Math.round(DK_TEMPO.base * token.factor)}ms;`)
  lines.push(`  --brand-motion-stagger: ${DS_MOTION_STAGGER}ms;`)
  lines.push(`  --brand-ease: ${DK_TEMPO.easing};`)
  lines.push('}')
  lines.push('')
  lines.push('.dark {')
  for (const shade of DS_SHADES) lines.push(`  --ui-color-primary-${shade}: ${DK_COLORS.rampDark[shade]};`)
  for (const row of demoRoleRows('dark')) lines.push(`  --ui-${row.role.id}: ${row.hex};`)
  lines.push('}')
  lines.push('')
  lines.push('/* Tailwind v4: dieselben Werte als Theme-Variablen. */')
  lines.push('@theme {')
  for (const shade of DS_SHADES) lines.push(`  --color-brand-${shade}: ${DK_COLORS.rampLight[shade]};`)
  lines.push(`  --color-brand-accent: ${DK_COLORS.accent};`)
  lines.push(`  --color-brand-paper: ${DK_COLORS.paper};`)
  lines.push(`  --font-heading: ${DK_PAIR.headingStack};`)
  lines.push(`  --font-body: ${DK_PAIR.bodyStack};`)
  for (const step of DK_TYPE_SCALE) lines.push(`  --text-${step.id}: ${step.rem};`)
  lines.push('  --radius-mark: 0.8125rem;')
  lines.push(`  --ease-brand: ${DK_TEMPO.easing};`)
  lines.push('}')
  return lines.join('\n')
}

// ── Nomenklatur (§2.2, Kapitel `nomenclature`, Otto) ───────────────────────

export interface DkNameType {
  id: string
  label: string
  note: string
  /** Vorgewählt — der Vorschlag aus Kontext und Angebot. */
  preset?: boolean
}

export const DK_NAME_TYPES: readonly DkNameType[] = [
  { id: 'product', label: 'Produkt', note: 'Die Röstungen selbst — das, was in der Tüte ist.', preset: true },
  { id: 'service', label: 'Dienstleistung', note: 'Verkostung, Schulung, Abo — Leistungen mit Termin.', preset: true },
  { id: 'program', label: 'Programm / Format', note: 'Wiederkehrendes mit eigenem Namen: Kurse, Reihen, Feste.' },
  { id: 'place', label: 'Ort / Filiale', note: 'Der Ausschank heute, ein zweiter Ort später.', preset: true },
  { id: 'digital', label: 'Digital', note: 'Shop, App, Newsletter — alles mit einer Adresse.' },
]

export interface DkNamePattern {
  typeId: string
  pattern: string
  example: string
  /** Woraus das Muster hergeleitet ist (`b2.model`, `b2.rule`, `d.toneWords`). */
  origin: string
}

/**
 * DIE MUSTER SIND HERGELEITET, NICHT ERFUNDEN: Dachmarke vorn (Architektur-
 * Modell „eine Marke"), Herkunft statt Fantasie (Wert „Klartext"), keine
 * Superlative (Ton-Wort „gerade heraus").
 */
export const DK_NAME_PATTERNS: readonly DkNamePattern[] = [
  { typeId: 'product', pattern: 'Ort + Erntemonat — kein Fantasiename', example: 'Kona Februar 2026', origin: 'Wert „Klartext" + Mission „Ort, Monat und Namen"' },
  { typeId: 'service', pattern: 'Dachmarke + Tätigkeit in einem Wort', example: 'Kailua Verkostung', origin: 'Architektur-Modell „eine Marke" + Ton-Wort „ruhig"' },
  { typeId: 'program', pattern: 'Dachmarke + Substantiv ohne Anglizismus', example: 'Kailua Tafelrunde', origin: 'Tabu-Liste (kein „Experience", kein „Club")' },
  { typeId: 'place', pattern: 'Dachmarke + Stadtteil, nie eine Nummer', example: 'Kailua Coffee Co. Kaimukī', origin: 'Wert „Nähe" — ein Ort hat einen Namen, keine Filialnummer' },
  { typeId: 'digital', pattern: 'Dachmarke + Funktion, klein geschrieben in der Adresse', example: 'kailuacoffee.co/tafel', origin: 'Ton-Wort „gerade heraus" + Wiedererkennungs-Anker „Herkunftstafel"' },
]

export const DK_NAME_RULES: readonly string[] = [
  'Die Dachmarke steht vorn: „Kailua Coffee Co. Kaimukī", nie „Kaimukī by Kailua".',
  'Ein Name sagt, was die Sache IST — kein Erlebnis-Wort, kein Superlativ, kein Anglizismus, den niemand am Telefon buchstabieren kann.',
  'Groß-/Kleinschreibung wie im Deutschen; in Adressen und Dateinamen alles klein und mit Bindestrich.',
  'Röstungen tragen Ort und Erntemonat, keine Tiernamen und keine Jahrgangs-Buchstaben.',
  'Nie zwei Namen für dieselbe Sache: der Ausschank heißt an der Tür so wie auf der Rechnung.',
]

export const DK_NAME_NOTE = 'Nur auf dem Weg mit Markenarchitektur. Kailua ist hier auf diesem Weg gezeigt: ein zweiter Ausschank und ein Abo-Programm sind angemeldet — ohne Untermarken bliebe das Kapitel aus dem Weg (§2.2), und die Schreibweisen stünden stattdessen in den Leitplanken der AI-Guidelines.'

// ── AI-Guidelines (§2.3, Kapitel `aiguide`, Nika) ──────────────────────────

export interface DkCard {
  id: string
  label: string
  note: string
  recommended?: boolean
}

export const DK_AI_SCOPE: readonly DkCard[] = [
  { id: 'drafts', label: 'Entwürfe für alles', note: 'KI darf jeden Text vorschlagen — Website, Social, Mail, Verpackung. Veröffentlicht wird nichts ohne Mensch.', recommended: true },
  { id: 'text-only', label: 'Nur Text', note: 'Texte ja, Bilder und Zeichen nie. Passt zu Marken, deren Bildsprache an Fotografie hängt.' },
  { id: 'internal', label: 'Nur intern', note: 'Notizen, Zusammenfassungen, Übersetzungen — nichts, was ein Kunde je sieht.' },
  { id: 'none', label: 'Nichts Kundenseitiges', note: 'Die strengste Fassung: KI bleibt aus der Marke heraus. Ehrlich, aber teuer im Alltag.' },
]

export const DK_AI_REVIEW: readonly DkCard[] = [
  { id: 'every', label: 'Jede Veröffentlichung durch einen Menschen', note: 'Eine Person liest, bevor es rausgeht — und trägt es dann auch.', recommended: true },
  { id: 'sample', label: 'Stichprobe', note: 'Jeder fünfte Text wird geprüft. Schneller, aber der Fehler steht dann schon draußen.' },
  { id: 'channel', label: 'Kanal-abhängig', note: 'Website und Verpackung immer, Social nur stichprobenartig.' },
]

export interface DkGuardrailGroup {
  id: string
  title: string
  /** Woher die Einträge kommen — die Herkunfts-Zeile der Bühne. */
  origin: string
  items: string[]
}

/**
 * DIE LEITPLANKEN SIND EINE ABLEITUNG (`n.guardrails`): jede Zeile kommt aus
 * einem bestätigten Wert weiter oben — Ton-Wörter, Tabu-Wörter, Werte,
 * Namens-Regeln. Nika ENTWIRFT, der Mensch korrigiert; erfunden wird nichts.
 */
export const DK_GUARDRAILS: readonly DkGuardrailGroup[] = [
  {
    id: 'tone',
    title: 'Ton-Parameter',
    origin: 'aus d.toneWords + d.voiceSamples (Kapitel „Persönlichkeit & Stimme")',
    items: [
      'ruhig — kurze Hauptsätze, keine Ausrufezeichen, kein Countdown.',
      'fundiert — jede Behauptung mit Ort, Zahl oder Datum, sonst gestrichen.',
      'gerade heraus — schlechte Nachrichten stehen im ersten Satz, nicht im letzten.',
      'warm, aber nie anbiedernd — „du" ja, Emoji-Reihen und Kosenamen nein.',
    ],
  },
  {
    id: 'taboo',
    title: 'Tabus',
    origin: 'aus d.vocabulary (meiden) + ep.vocabulary',
    items: [
      'Genuss-Erlebnis, Auszeit, Deluxe, Premium-Arabica-Selektion.',
      'Superlative ohne Beleg: „bester", „einzigartig", „revolutionär".',
      'Floskeln aus der Lieferkette: „aufgrund von Herausforderungen", „wir bitten um Verständnis".',
      'Erfundene Zahlen, Herkünfte oder Preise — sie stammen aus der Herkunftstafel oder gar nicht.',
    ],
  },
  {
    id: 'spelling',
    title: 'Markenzeichen-Schreibweisen',
    origin: 'aus m.rules (Nomenklatur) + dem Namens-Kapitel',
    items: [
      'Kailua Coffee Co. — mit Punkt, nie „Kailua Coffee Company", nie „KCC".',
      'Tagline immer englisch und ohne Anführungszeichen: One honest, quiet moment a day.',
      'Röstungen als „Ort Monat Jahr", zum Beispiel Kona Februar 2026.',
      'Oʻahu mit ʻOkina — nicht mit Apostroph, nicht ohne.',
    ],
  },
  {
    id: 'nogo',
    title: 'No-go-Themen',
    origin: 'aus den Anti-Werten (Kapitel „Werte")',
    items: [
      'Gesundheitsversprechen zu Kaffee — auch nicht als Scherz.',
      'Vergleiche mit namentlich genannten Wettbewerbern.',
      'Politik und Religion; Hawaii-Kultur nur, wo wir sie wirklich kennen.',
      'Preisrhetorik ohne Grund: kein „Aktion", kein „nur heute".',
    ],
  },
]

export interface DkPrompt {
  id: string
  title: string
  purpose: string
  text: string
}

/**
 * DREI VORLAGEN, PUR GERECHNET (§2.3 `n.prompts`): kein KI-Aufruf, keine
 * Kosten, kein Cache — sie entstehen aus Werten, Ton-Wörtern und den
 * Leitplanken darüber. Deshalb steht an ihnen „ohne KI gerechnet".
 */
export const DK_PROMPTS: readonly DkPrompt[] = [
  {
    id: 'system',
    title: 'System-Prompt',
    purpose: 'Der Kurzrahmen für jedes KI-Werkzeug — die Kurzform von brand.md.',
    text: [
      'Du schreibst als Kailua Coffee Co., eine Rösterei mit Ausschank auf Oʻahu.',
      'Ton: ruhig, fundiert, gerade heraus, warm ohne Anbiederung. Kurze Hauptsätze.',
      'Steht für: Klartext, Handwerk, Nähe.',
      'Vermeide: Genuss-Erlebnis, Auszeit, Deluxe, Premium-Arabica-Selektion, Superlative ohne Beleg.',
      'Erfinde nie Zahlen, Herkünfte oder Preise. Fehlt eine Angabe, frage danach.',
      'Schreibe den Markennamen als „Kailua Coffee Co."; Oʻahu mit ʻOkina.',
    ].join('\n'),
  },
  {
    id: 'social',
    title: 'Social-Post',
    purpose: 'Ein Post zur laufenden Röstung — Herkunft vor Gefühl.',
    text: [
      'Schreibe einen Social-Post (maximal 60 Wörter) im Ton von Kailua Coffee Co.',
      'Thema: die aktuelle Röstung. Nenne Ort, Höhenlage, Erntemonat und die Person, die geröstet hat.',
      'Beginne mit der Tatsache, nicht mit dem Gefühl. Keine Hashtag-Reihen, höchstens zwei.',
      'Kein Aufruf zum Kauf am Ende — ein Satz, was heute in der Kanne ist, reicht.',
    ].join('\n'),
  },
  {
    id: 'mail',
    title: 'E-Mail an Kunden',
    purpose: 'Die unangenehme Mail — Preis, Ausfall, Änderung.',
    text: [
      'Schreibe eine E-Mail von Kailua Coffee Co. an Stammkundinnen und Stammkunden.',
      'Anlass: {Preisänderung / kleinere Ernte / Sorte fällt aus}.',
      'Erster Satz: die Nachricht. Zweiter Absatz: der Grund mit Zahl oder Datum. Dritter: was wir tun.',
      'Keine Entschuldigungs-Floskel, kein „wir bitten um Verständnis", keine Kompensation erfinden.',
      'Schluss: ein Satz, wo man nachfragen kann — mit Namen einer Person.',
    ].join('\n'),
  },
]

// ── Pressekit (§2.4, Kapitel `presskit`, George) ───────────────────────────

export interface DkFact {
  id: string
  text: string
  /** Ins Pressekit freigegeben (Opt-in, Default: keiner). */
  released: boolean
  /** Warum ein Fakt bewusst drin bleibt — nur bei den gesperrten. */
  reason?: string
}

/**
 * FÜNF FAKTEN AUS DEM KONTEXT (`a.facts`, `internal`), DREI FREIGEGEBEN.
 *
 * `a.facts` reist NIE roh (§2.12 Nr. 2) — was reist, ist diese bewusste
 * Auswahl. Die zwei gesperrten stehen sichtbar daneben, weil der Prototyp die
 * REGEL zeigen soll und nicht nur ihr Ergebnis.
 */
export const DK_FACTS: readonly DkFact[] = [
  { id: 'founded', text: 'Gegründet 2026 in Kailua auf Oʻahu, Hawaii.', released: true },
  { id: 'roast', text: 'Eine Röstung pro Saison, rund 1 200 kg im Jahr.', released: true },
  { id: 'people', text: 'Drei Festangestellte, zwei Aushilfen — Anbau, Röstung und Ausschank aus einer Hand.', released: true },
  { id: 'revenue', text: 'Jahresumsatz 2026: 310 000 US-Dollar.', released: false, reason: 'Zahl aus dem Steckbrief — vertraulich, solange sie niemand von außen braucht.' },
  { id: 'wholesale', text: 'Zwei Großabnehmer decken 40 % des Absatzes.', released: false, reason: 'Verhandlungsposition — reist nicht, auch nicht im Pressekit.' },
]

export interface DkContactSource {
  id: 'owner' | 'intro' | 'custom'
  label: string
  note: string
  name: string
  role: string
  email: string
  phone?: string
}

/**
 * DREI VORLAGEN FÜR DEN PRESSE-KONTAKT (§2.20 Nr. 3, Davids Zuschnitt).
 *
 * Die Karte FÜLLT die Felder vor — gespeichert wird immer der bestätigte
 * TEXT, nie ein Verweis auf die Konto-Daten. Sonst änderte eine spätere
 * Änderung am Konto still das Pressekit.
 */
export const DK_CONTACT_SOURCES: readonly DkContactSource[] = [
  {
    id: 'owner',
    label: 'Konto-Inhaber',
    note: 'Aus eurem Konto übernommen — ihr könnt jedes Feld ändern.',
    name: 'David Schubert',
    role: 'Konto-Inhaber',
    email: 'mail@davidschubert.com',
  },
  {
    id: 'intro',
    label: 'Kontakt aus dem Erstgespräch',
    note: 'Aus eurer Anfrage vom 2. September 2026.',
    name: 'Leilani Kahale',
    role: 'Inhaberin',
    email: 'leilani@kailuacoffee.co',
    phone: '+1 808 555 0142',
  },
  {
    id: 'custom',
    label: 'Anders eingeben',
    note: 'Jemand anders ist für Presse zuständig.',
    name: '',
    role: '',
    email: '',
  },
]

export const DK_CONTACT_PUBLIC_NOTE = 'Diese Angabe reist öffentlich im Pressekit — sie steht in jeder Datei, die ihr weitergebt, und im geteilten Link.'

/** Die Boilerplates — dieselben Karten wie im Kapitel „Tagline & Messaging". */
export function demoBoilerplates(): { title: string, text: string }[] {
  const messaging = demoFoundation.chapters.find(chapter => chapter.id === 'messaging')
  const block = messaging?.blocks.find((entry): entry is Extract<FdBlock, { kind: 'cards' }> =>
    entry.kind === 'cards' && entry.label?.startsWith('Boilerplates') === true)
  return block ? block.items.map(item => ({ title: item.title, text: item.text })) : []
}

// ── Das Bündel (§2.6 README) ───────────────────────────────────────────────

export interface DkBundleEntry {
  file: string
  what: string
  /** Braucht das Design-Preset — ohne Preset fehlt der Eintrag. */
  needsDesign?: boolean
}

export const DK_BUNDLE: readonly DkBundleEntry[] = [
  { file: 'brand.md', what: 'Der Brand Context als Markdown — direkt als System-Prompt einsetzbar.' },
  { file: 'brand.json', what: 'Dieselben Werte maschinenlesbar, schemaVersion 1.' },
  { file: 'tokens.json', what: 'Design-Tokens nach DTCG 2025.10, hell und dunkel in einer Datei.', needsDesign: true },
  { file: 'tokens.css', what: 'Dieselben Werte als CSS-Variablen plus Tailwind-@theme-Block.', needsDesign: true },
  { file: 'marks/', what: 'Wortmarke und Monogramm als SVG, je hell, dunkel und einfarbig.', needsDesign: true },
  { file: 'LICENSES.md', what: 'Schriftfamilien mit Gewichten, Quelle und Lizenz — ohne Schriftdateien.', needsDesign: true },
  { file: 'README.md', what: 'Was drin ist, welcher Stand — und was fehlt.' },
]

export const DK_BUNDLE_FILE = `${DK_SLUG}-brand-kit-2026-09-09.zip`

// ── `brand.md` (§2.6 Aufbau 1–8) ───────────────────────────────────────────

export interface DkMdSection {
  /** H2 der Datei und Überschrift der gerenderten Vorschau. */
  title: string
  paragraphs?: string[]
  bullets?: string[]
  /** Nur mit Design-Preset (Abschnitt 8 „Visuell in einem Absatz"). */
  needsDesign?: boolean
}

/**
 * DIE ABSCHNITTE VON `brand.md` — EINE Quelle für Vorschau UND Datei.
 *
 * Die Reihenfolge ist die aus §2.6 (Wer wir sind · Werte · Stimme ·
 * Botschaften · Nomenklatur · Regeln für KI · Visuell). Es steht NUR darin,
 * was `sessionTravels` bejaht: keine Wettbewerber, keine Rohantworten, keine
 * gesperrten Fakten (§2.12 Nr. 1).
 */
export const DK_BRAND_MD_SECTIONS: readonly DkMdSection[] = [
  {
    title: 'Wer wir sind',
    paragraphs: [
      'Kailua Coffee Co. ist eine Rösterei mit eigenem Ausschank in Kailua auf Oʻahu, gegründet 2026. Anbau, Röstung und Ausschank liegen in einer Hand.',
      'Es gibt uns, damit vielbeschäftigte Menschen auf Oʻahu einen ehrlichen, ruhigen Moment am Tag bekommen — eine Tasse, deren Anbau, Röstung und Ausschank Menschen mit Namen verantworten.',
      'Kategorie: Spezialitätenkaffee, lokal geröstet — Premium ohne Hochglanz. Erste Wahl für Menschen auf Oʻahu, die wissen wollen, wer ihren Kaffee gemacht hat.',
    ],
  },
  {
    title: 'Werte',
    bullets: [
      'Klartext — Wir sagen Preise, Herkunft und Grenzen, bevor jemand fragt. Gelebt: Als die Ernte 2026 kleiner ausfiel, stand der neue Preis eine Woche vorher an der Tafel.',
      'Handwerk — Lieber eine Röstung perfekt als fünf Sorten mittelmäßig. Gelebt: Die zweite Maschine wurde abbestellt, Keanu stattdessen drei Monate in Kona ausgebildet.',
      'Nähe — Unsere Gäste kennen den Namen der Person, die ihre Bohnen geröstet hat. Gelebt: Jede Tüte trägt das Kürzel des Rösters.',
      'Konflikt-Regel: Klartext schlägt Nähe. Auch der Stammgast erfährt am selben Tag, dass seine Lieblingsröstung diese Saison nicht kommt.',
    ],
  },
  {
    title: 'Stimme',
    paragraphs: [
      'Archetyp: Der Weise mit einem Rest Schöpfer — erklärt gern, ohne zu dozieren. Ziel-Gefühl: jemand weiß danach etwas, das er vorher nicht wusste, und fühlt sich dabei nicht klein.',
    ],
    bullets: [
      'ruhig — „Die Maschine läuft seit sechs. Wir haben Zeit."',
      'fundiert — „Diese Bohne kommt aus Kona, 600 Meter, Ernte im Februar. Deshalb schmeckt sie nach Mandel."',
      'gerade heraus — „Der Preis ist gestiegen. Die Ernte war kleiner, wir zahlen mehr — ihr auch."',
      'warm, aber nie anbiedernd — „Schön, dass du da bist. Willst du wissen, was heute in der Kanne ist?"',
      'Benutzen: unsere Bohnen · langsam geröstet, 14 Minuten · eine Pause · von Hand.',
      'Meiden: Genuss-Erlebnis · Auszeit · Deluxe · Premium-Arabica-Selektion · Superlative ohne Beleg.',
    ],
  },
  {
    title: 'Botschaften',
    paragraphs: [
      'Tagline: One honest, quiet moment a day.',
      'Boilerplate kurz: Kailua Coffee Co. ist eine Rösterei mit Ausschank auf Oʻahu. Eine Röstung pro Saison, Herkunft mit Namen, Preise ohne Sternchen.',
    ],
    bullets: [
      'Pendler mit Ritual — Dieselbe Tasse, jeden Morgen, in derselben Qualität.',
      'Nachbarschaft am Wochenende — Eine Stunde bleiben, die Tafel lesen, fragen.',
      'Reisende, die Herkunft suchen — Eine Röstung, die es nur diese Saison und nur hier gibt.',
      'Unverwechselbares Merkmal: die handgeschriebene Herkunftstafel neben der Theke, jede Saison neu.',
    ],
  },
  {
    title: 'Nomenklatur',
    bullets: [
      'Produkt: Ort + Erntemonat — Beispiel „Kona Februar 2026".',
      'Dienstleistung: Dachmarke + Tätigkeit — Beispiel „Kailua Verkostung".',
      'Ort: Dachmarke + Stadtteil, nie eine Nummer — Beispiel „Kailua Coffee Co. Kaimukī".',
      'Die Dachmarke steht vorn; ein Name sagt, was die Sache ist — kein Erlebnis-Wort, kein Superlativ.',
    ],
  },
  {
    title: 'Regeln für KI',
    paragraphs: [
      'Umfang: KI darf Entwürfe für alles erzeugen — Website, Social, Mail, Verpackung. Veröffentlicht wird nichts ohne Mensch.',
      'Freigabe: jede Veröffentlichung liest ein Mensch, bevor sie rausgeht — und trägt sie dann auch.',
    ],
    bullets: [
      'Ton: kurze Hauptsätze, keine Ausrufezeichen; jede Behauptung mit Ort, Zahl oder Datum; schlechte Nachrichten im ersten Satz.',
      'Tabu: Genuss-Erlebnis, Auszeit, Deluxe, Premium-Arabica-Selektion, Superlative ohne Beleg, Lieferketten-Floskeln.',
      'Schreibweisen: Kailua Coffee Co. mit Punkt; Oʻahu mit ʻOkina; Röstungen als „Ort Monat Jahr".',
      'No-go: Gesundheitsversprechen, namentliche Wettbewerber-Vergleiche, Politik und Religion, Preisrhetorik ohne Grund.',
      'Erfinde nie Zahlen, Herkünfte oder Preise — sie stammen aus der Herkunftstafel oder gar nicht.',
    ],
  },
  {
    title: 'Visuell',
    needsDesign: true,
    paragraphs: [
      `Basisfarbe ${DK_COLORS.base} (Roast). Rollen hell: primary ${dkRoleHex('primary', 'light')}, surface ${dkRoleHex('surface', 'light')}, text ${dkRoleHex('text', 'light')}, accent ${dkRoleHex('accent', 'light')}. Rollen dunkel: primary ${dkRoleHex('primary', 'dark')}, surface ${dkRoleHex('surface', 'dark')}, text ${dkRoleHex('text', 'dark')}.`,
      `Schriftpaar ${DK_PAIR.headingFamily} für Überschriften, ${DK_PAIR.bodyFamily} für Text, Geist Mono für Herkunft und Preise. Bildsprache: nah am Handwerk, diffuses Licht, Textur statt Szene, Hände im Bild. Bewegung: ruhig — ${Math.round(DK_TEMPO.base)} ms Grunddauer, langsam anlaufend, sanft ausklingend.`,
      'Alle Werte maschinenlesbar in tokens.json (DTCG 2025.10) und tokens.css.',
    ],
  },
]

/** `brand.md` als Text — der Kopf nach §2.6 Nr. 1, dann die Abschnitte. */
export function demoBrandMd(withDesign = true): string {
  const lines: string[] = []
  lines.push(`# ${DS_BRAND.title}`)
  lines.push('')
  lines.push(`> Brand Context aus branding.supply · Stand ${DK_STAND} · Inhaltssprache ${demoFoundation.brand.locale}`)
  lines.push('>')
  lines.push('> Diese Datei ist als System-Prompt einsetzbar: gib sie einem KI-Werkzeug, bevor du es für diese Marke schreiben lässt.')
  lines.push('')
  for (const section of DK_BRAND_MD_SECTIONS) {
    if (section.needsDesign && !withDesign) continue
    lines.push(`## ${section.title}`)
    lines.push('')
    for (const paragraph of section.paragraphs ?? []) {
      lines.push(paragraph)
      lines.push('')
    }
    for (const bullet of section.bullets ?? []) lines.push(`- ${bullet}`)
    if (section.bullets?.length) lines.push('')
  }
  if (!withDesign) {
    lines.push('## Visuell')
    lines.push('')
    lines.push('Noch nicht entschieden — Farbwelt, Typografie und Zeichen entstehen im Brand Design.')
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}

// ── `brand.json` (§2.6) ────────────────────────────────────────────────────

/**
 * `brand.json` — dieselben Quellen wie `brand.md`, nur maschinenlesbar.
 *
 * Die `chapters` sind die Snapshot-Kapitel (dieselbe Auswahl und dieselbe
 * Reise-Regel wie `share.post.ts`); `design` ist das Snapshot-Preset ohne
 * `keptDrafts` — die behaltenen KI-Entwürfe bleiben privat (§1.11 b).
 */
export function demoBrandJsonObject(withDesign = true): DkJson {
  const chapters: DkJson[] = demoFoundation.chapters
    .filter(chapter => chapter.state !== 'locked')
    .map(chapter => ({
      id: chapter.id,
      title: chapter.title,
      anchor: chapter.anchor,
      slots: chapter.blocks.length,
    }))

  const design: DkJson = withDesign
    ? {
        color: {
          base: DK_COLORS.base,
          accent: DK_COLORS.accent,
          roles: {
            light: Object.fromEntries(DK_ROLES.map(role => [role.id, dkRoleHex(role.id, 'light')])),
            dark: Object.fromEntries(DK_ROLES.map(role => [role.id, dkRoleHex(role.id, 'dark')])),
          },
        },
        type: { pair: DK_PAIR.id, heading: DK_PAIR.headingFamily, body: DK_PAIR.bodyFamily, scale: 'calm' },
        mark: { kind: 'word', primary: `${DK_SLUG}-wordmark-light.svg` },
        motion: { tempo: DK_TEMPO.id, base: DK_TEMPO.base, easing: DK_TEMPO.easing },
      }
    : null

  return {
    schemaVersion: 1,
    brand: {
      title: DS_BRAND.title,
      locale: demoFoundation.brand.locale,
      stand: DK_STAND,
      tagline: demoFoundation.brand.tagline,
      archetype: demoFoundation.brand.archetype,
    },
    foundation: {
      story: 'Kailua Coffee Co. ist eine Rösterei mit Ausschank auf Oʻahu. Anbau, Röstung und Ausschank liegen in einer Hand.',
      chapters,
    },
    nomenclature: {
      types: DK_NAME_TYPES.filter(type => type.preset).map(type => type.id),
      patterns: DK_NAME_PATTERNS.filter(pattern => DK_NAME_TYPES.some(type => type.preset && type.id === pattern.typeId))
        .map(pattern => ({ type: pattern.typeId, pattern: pattern.pattern, example: pattern.example })),
      rules: [...DK_NAME_RULES],
    },
    aiGuidelines: {
      scope: 'drafts',
      review: 'every',
      guardrails: Object.fromEntries(DK_GUARDRAILS.map(group => [group.id, [...group.items]])),
      prompts: DK_PROMPTS.map(prompt => ({ id: prompt.id, title: prompt.title })),
    },
    presskit: {
      tagline: demoFoundation.brand.tagline,
      boilerplates: demoBoilerplates().map(entry => ({ length: entry.title, text: entry.text })),
      facts: DK_FACTS.filter(fact => fact.released).map(fact => fact.text),
      contact: { name: 'Leilani Kahale', role: 'Inhaberin', email: 'leilani@kailuacoffee.co' },
    },
    design,
  }
}

export function demoBrandJson(withDesign = true): string {
  return JSON.stringify(demoBrandJsonObject(withDesign), null, 2)
}

// ── Kapitel-Register der Schicht 3 (§2.1) ──────────────────────────────────

export type DkChapterKey = 'nomenclature' | 'aiguide' | 'presskit'

export interface DkChapter {
  key: DkChapterKey
  label: string
  note: string
  minutes: string
  /** Wer das Kapitel führt — Otto, Nika oder George (§2.10). */
  advisor: DkAdvisorKey
  sessions: { id: string, label: string, effort: string }[]
}

export const DK_CHAPTERS: readonly DkChapter[] = [
  {
    key: 'nomenclature',
    label: 'Nomenklatur',
    note: 'Namensmuster je Produkttyp',
    minutes: '~5 Min',
    advisor: 'otto',
    sessions: [
      { id: 'm.types', label: 'Produkttypen', effort: '~1 Min' },
      { id: 'm.patterns', label: 'Namensmuster', effort: '~2 Min' },
      { id: 'm.rules', label: 'Regeln bestätigen', effort: '~2 Min' },
    ],
  },
  {
    key: 'aiguide',
    label: 'AI-Guidelines',
    note: 'Was KI darf, wer freigibt, welche Leitplanken gelten',
    minutes: '~6 Min',
    advisor: 'nika',
    sessions: [
      { id: 'n.scope', label: 'Was KI erzeugen darf', effort: '~1 Min' },
      { id: 'n.review', label: 'Freigabe-Regel', effort: '~1 Min' },
      { id: 'n.guardrails', label: 'Leitplanken', effort: '~3 Min' },
      { id: 'n.prompts', label: 'Prompt-Vorlagen', effort: '~1 Min' },
    ],
  },
  {
    key: 'presskit',
    label: 'Pressekit',
    note: 'Fakten-Freigabe, Presse-Kontakt, Vorschau',
    minutes: '~4 Min',
    advisor: 'george',
    sessions: [
      { id: 'p.facts', label: 'Fakten freigeben', effort: '~2 Min' },
      { id: 'p.contact', label: 'Presse-Kontakt', effort: '~1 Min' },
      { id: 'p.summary', label: 'Vorschau', effort: '~1 Min' },
    ],
  },
]

export function dkChapter(key: DkChapterKey): DkChapter {
  /* Nicht-null erzwungen statt optional gemacht: die drei Schlüssel SIND der
   * Typ — ein Fehlgriff wäre ein Tippfehler, kein Laufzeitfall. */
  return DK_CHAPTERS.find(chapter => chapter.key === key) ?? DK_CHAPTERS[0]!
}

/** Die Route eines Kapitels — an EINER Stelle, Rail und Seiten lesen sie. */
export function dkChapterPath(key: DkChapterKey): string {
  return `/brand/demo/kit/${key}`
}

// ── Die Berater der Schicht 3 (§2.10) ──────────────────────────────────────

export type DkAdvisorKey = 'otto' | 'nika' | 'george'

export interface DkAdvisor {
  key: DkAdvisorKey
  name: string
  role: string
  initial: string
  desc: string
  personal: string
}

/**
 * DIE STECKBRIEFE STEHEN WÖRTLICH IN `packages/brand/shared/brandAdvisors.ts`
 * — hier sind sie abgeschrieben statt importiert, weil der Klickdummy den
 * Layer nicht anfassen und nicht an seine Registry gebunden werden soll. Das
 * echte Produkt liest sie dort (§2.10: „kein neuer Steckbrief").
 */
export const DK_ADVISORS: Record<DkAdvisorKey, DkAdvisor> = {
  otto: {
    key: 'otto',
    name: 'Otto Kessler',
    role: 'Namens-Berater · Nomenklatur',
    initial: 'O',
    desc: 'Prüft Aussprache, Schreibweise und Verfügbarkeit, bevor ein Name gefallen darf.',
    personal: 'Nüchtern und pragmatisch: erst überleben, dann gefallen. Nimmt einem Lieblingsnamen den Glanz, bevor er Geld kostet.',
  },
  nika: {
    key: 'nika',
    name: 'Nika Sommer',
    role: 'Sprach-Beraterin · AI-Guidelines',
    initial: 'N',
    desc: 'Liest jeden Satz laut, bevor er stehen bleibt, und streicht, was nach Werbung klingt.',
    personal: 'Sprach-Beraterin — hört, wie ein Satz landet. Kürzt Füllwörter und leere Superlative, ohne die Bedeutung zu ändern.',
  },
  george: {
    key: 'george',
    name: 'George Winter',
    role: 'Gastgeber · Pressekit',
    initial: 'G',
    desc: 'Der Gastgeber des ganzen Wizards — im Pressekit liefert er nur aus, was längst entschieden ist.',
    personal: 'Führt durch die Foundation und übergibt an die Fachleute. Im Pressekit entsteht nichts Neues: er stellt zusammen und fragt zweimal nach.',
  },
}

export interface DkAdvisorMove {
  id: string
  text: string
  /** Leise Mono-Zeile darunter (Herkunft, Hinweis) — nie eine zweite Frage. */
  help?: string
}

/** Zwei bis drei Züge je Kapitel — sie BEGRÜNDEN den Vorschlag, mehr nicht. */
export const DK_ADVISOR_MOVES: Record<DkChapterKey, readonly DkAdvisorMove[]> = {
  nomenclature: [
    { id: 'nom-1', text: 'Namen sind billig, bis sie auf einem Schild stehen. Sagt mir zuerst, welche Sorten von Dingen ihr überhaupt benennt — dann schlage ich je Sorte EIN Muster vor, kein Sortiment.', help: 'Nur auf dem Weg mit Markenarchitektur — ohne Untermarken gäbe es nichts zu bestätigen.' },
    { id: 'nom-2', text: 'Die Muster unten sind hergeleitet, nicht erfunden: die Dachmarke steht vorn, weil ihr EINE Marke seid; Röstungen tragen Ort und Erntemonat, weil eure Mission das so sagt. Wenn euch eines nicht gefällt, korrigiert es — aber sagt mir, welche Regel dann stattdessen gilt.' },
    { id: 'nom-3', text: 'Und der Prüfstein für jeden künftigen Namen: Kann man ihn am Telefon buchstabieren? Wenn nicht, kostet er euch jeden Tag ein bisschen Geld.' },
  ],
  aiguide: [
    { id: 'ai-1', text: 'Zwei Fragen entscheiden das ganze Kapitel: Was darf eine Maschine in eurem Namen schreiben — und wer liest, bevor es rausgeht. Alles danach sind Leitplanken, keine neuen Entscheidungen.' },
    { id: 'ai-2', text: 'Die Leitplanken unten sind ein Entwurf aus dem, was oben schon steht: eure Ton-Wörter, eure Tabu-Wörter, eure Werte, eure Namens-Regeln. Ich habe nichts erfunden — ich habe sortiert. Streicht, was nicht stimmt.', help: 'Ton-Parameter aus d.toneWords · Tabus aus d.vocabulary · Schreibweisen aus m.rules.' },
    { id: 'ai-3', text: 'Die drei Vorlagen darunter sind pur gerechnet: kein Modell hat sie geschrieben, keine läuft irgendwo. Kopiert sie in ChatGPT, Claude oder euer Redaktionssystem — und wenn eine Leitplanke sich ändert, ändern sie sich mit.' },
  ],
  presskit: [
    { id: 'press-1', text: 'Hier entsteht nichts Neues — ich stelle zusammen, was ihr längst entschieden habt. Zwei Dinge muss trotzdem ein Mensch sagen: welche Fakten reisen dürfen und wer für Presse ansprechbar ist.' },
    { id: 'press-2', text: 'Eure harten Zahlen aus dem Kontext bleiben intern. Ins Pressekit kommt nur, was ihr hier einzeln anhakt — Voreinstellung ist: keiner.', help: 'Die Auswahl wird als eigener Wert gespeichert; die Rohliste reist nie.' },
  ],
}

// ── Betreiber: Freischaltungen (§2.7, §2.8) ────────────────────────────────

export type DkGrant = 'operator' | 'beta' | 'purchase'

export interface DkUnlockRow {
  id: string
  title: string
  path: string
  foundation: string
  foundationDone: boolean
  design: { unlocked: boolean, since?: string, via?: DkGrant }
  derivation: { unlocked: boolean, since?: string, via?: DkGrant }
}

/**
 * EINE TABELLE, ZWEI SPALTEN (§2.20 Nr. 5): „Brand Design" und „Ableitung
 * (Book & Kit + Marktvergleich)". Beide Spalten schreiben DASSELBE Muster —
 * Knopf, Bestätigung, Chip mit Datum und Herkunft — nur andere Felder.
 */
export const DK_UNLOCK_ROWS: readonly DkUnlockRow[] = [
  {
    id: 'kailua',
    title: 'Kailua Coffee Co.',
    path: 'Neue Marke',
    foundation: 'Foundation abgeschlossen · 7. September 2026',
    foundationDone: true,
    design: { unlocked: true, since: '7. September 2026', via: 'operator' },
    derivation: { unlocked: false },
  },
  {
    id: 'hafenkontor',
    title: 'Hafenkontor',
    path: 'Neue Marke',
    foundation: 'Foundation abgeschlossen · 4. September 2026',
    foundationDone: true,
    design: { unlocked: true, since: '4. September 2026', via: 'operator' },
    derivation: { unlocked: true, since: '5. September 2026', via: 'beta' },
  },
  {
    id: 'schubert',
    title: 'Schubert UX Studio',
    path: 'Marken-Relaunch',
    foundation: 'Foundation offen — 6 von 7 Kapiteln',
    foundationDone: false,
    design: { unlocked: false },
    derivation: { unlocked: false },
  },
]

export const DK_GRANT_LABEL: Record<DkGrant, string> = {
  operator: 'via operator',
  beta: 'via beta',
  purchase: 'via purchase',
}

// ── Die Anwendungs-Kapitel der Leseansicht (§2.5) ──────────────────────────

const KIT_LOCKED_NOTE = 'Book & Kit ist Teil der Ableitung.'

function lockedUsageChapter(id: string, anchor: string, title: string, lines: { title: string, text: string }[]): FdChapterData {
  return {
    id,
    anchor,
    title,
    state: 'locked',
    note: KIT_LOCKED_NOTE,
    blocks: lines.map(line => ({ kind: 'locked', title: line.title, text: line.text, product: 'Brand Book & Kit' })),
  }
}

/** Die Rollen-Tabelle eines Modus als Kapitel-Block (Hex + Kontrast-Urteil). */
function roleTableBlock(scheme: 'light' | 'dark'): FdBlock {
  return {
    kind: 'table',
    label: scheme === 'light' ? 'Rollen im hellen Modus' : 'Rollen im dunklen Modus',
    columns: ['Rolle', 'Hex', 'Kontrast', 'Wofür'],
    rows: demoRoleRows(scheme).map(row => [
      row.role.label,
      row.hex,
      row.ratio === null || row.level === null ? '—' : `${dsRatioText(row.ratio)} · ${dkLevelText(row.level)}`,
      row.role.note,
    ]),
  }
}

/**
 * DIE FÜNF NEUEN KAPITEL DER LESEANSICHT (§2.5) plus das umbenannte Kapitel 11.
 *
 * WARUM SIE HIER STEHEN UND NICHT IN `demoFoundation.ts`: sie lesen die
 * Kit-Daten dieser Datei (Leitplanken, Prompts, Fakten, Namens-Regeln) UND die
 * Farb-/Schrift-Rechnung aus `demoDesign.ts`. Ein Umzug nach `demoFoundation`
 * hieße, dass `demoFoundation` diese Datei importiert — die sie selbst schon
 * importiert. Der Zirkel wäre das erste, was der Typecheck bemängelt.
 *
 * `kitDone: false` liefert die drei Anwendungs-Kapitel als SCHRANKE (§2.5,
 * Spalte „Zustand ohne Freischaltung"); Nomenklatur und Pressekit entfallen
 * dann ganz, weil ohne Kapitel kein Wert existiert.
 */
export function demoUsageChapters(kitDone: boolean): FdChapterData[] {
  if (!kitDone) {
    return [
      lockedUsageChapter('zeichen-anwendung', 'zeichen-anwendung', 'Zeichen-Anwendung', [
        { title: 'Schutzraum und Mindestgrößen', text: 'Wie viel Luft das Zeichen braucht und ab welcher Größe es nicht mehr gesetzt wird.' },
        { title: 'Varianten', text: 'Hell, dunkel, einfarbig — und wann welche gilt.' },
        { title: 'Don’ts', text: 'Was mit dem Zeichen nie passiert, mit Beispiel daneben.' },
      ]),
      lockedUsageChapter('farbe-anwendung', 'farbe-anwendung', 'Farb-Anwendung', [
        { title: 'Rollen-Tabelle', text: 'Jede Rolle mit Hex, hell und dunkel — dieselben Namen in beiden Modi.' },
        { title: 'Kontrast-Paare', text: 'Geprüfte Paare mit Urteil, und die Regel „nie Text auf …" aus den Durchfallern.' },
      ]),
      lockedUsageChapter('typografie-anwendung', 'typografie-anwendung', 'Typografie-Anwendung', [
        { title: 'Größen-Tabelle', text: 'h1 bis small mit Größe, Zeilenhöhe und Gewicht.' },
        { title: 'Regeln und Lizenz', text: 'Was welche Schrift trägt — und woher die Dateien kommen.' },
      ]),
    ]
  }

  const contrastRows = [
    { label: 'Fließtext auf Papier', fg: dkRoleHex('text', 'light'), bg: DK_COLORS.paper },
    { label: 'Knopf-Text auf primary', fg: DK_COLORS.paper, bg: dkRoleHex('primary', 'light') },
    { label: 'Akzent auf Papier', fg: DK_COLORS.accent, bg: DK_COLORS.paper },
    { label: 'Fließtext auf dunklem Grund', fg: dkRoleHex('text', 'dark'), bg: dkRoleHex('surface', 'dark') },
    { label: 'Crema als Textfarbe auf Papier', fg: DS_BRAND.palette.crema, bg: DK_COLORS.paper },
  ]

  return [
    {
      id: 'zeichen-anwendung',
      anchor: 'zeichen-anwendung',
      title: 'Zeichen-Anwendung',
      state: 'done',
      note: 'Das Regelwerk zum Zeichen — dieselbe Setzung wie in Kapitel 10, eine Zoomstufe näher.',
      blocks: [
        {
          kind: 'rules',
          label: 'Schutzraum und Mindestgrößen',
          items: [
            { text: 'Schutzraum ringsum = Höhe des Versal-K. In diesem Bereich steht nichts — kein Text, keine Linie, keine Bildkante.' },
            { text: 'Wortmarke: nie unter 96 px am Bildschirm, nie unter 24 mm im Druck.' },
            { text: 'Monogramm: nie unter 24 px. Darunter wird es zum Fleck und trägt die Marke nicht mehr.' },
          ],
        },
        {
          kind: 'table',
          label: 'Varianten und ihre Dateien',
          columns: ['Variante', 'Wofür', 'Datei'],
          rows: DK_MARK_FILES.map(file => [
            file.label,
            file.variant === 'light' ? 'Der Normalfall — helle Flächen, Papier.' : file.variant === 'dark' ? 'Dunkle Flächen, Tüte, Tasse.' : 'Prägung, Stempel, einfarbiger Druck.',
            file.file,
          ]),
        },
        {
          kind: 'rules',
          label: 'Drei Don’ts',
          items: [
            { text: 'Das Zeichen wird nie neu gesetzt.', dont: 'Den Namen im Textfeld tippen statt die Datei zu benutzen.' },
            { text: 'Das Zeichen wird nie verzerrt oder schräg gestellt.', dont: 'Auf Breite ziehen, bis es in die Kachel passt.' },
            { text: 'Das Zeichen liegt nie auf einem unruhigen Foto.', dont: 'Wortmarke über die Kaffeebohnen legen und mit Schatten lesbar machen.' },
          ],
        },
      ],
    },
    {
      id: 'farbe-anwendung',
      anchor: 'farbe-anwendung',
      title: 'Farb-Anwendung',
      state: 'done',
      note: `Gerechnet aus der Basisfarbe ${DK_COLORS.base} — dieselben Zahlen wie in tokens.json.`,
      blocks: [
        roleTableBlock('light'),
        roleTableBlock('dark'),
        {
          kind: 'table',
          label: 'Kontrast-Paare mit Urteil (WCAG 2.1)',
          columns: ['Paar', 'Verhältnis', 'Urteil'],
          rows: contrastRows.map((pair) => {
            const verdict = dsContrast(pair.fg, pair.bg)
            return [pair.label, verdict ? dsRatioText(verdict.ratio) : '—', verdict ? dkLevelText(verdict.level) : '—']
          }),
        },
        {
          kind: 'rules',
          label: 'Regeln',
          items: [
            { text: 'Nie Text auf Crema — das Paar fällt unter AA. Crema ist Fläche, nicht Schrift.' },
            { text: 'Nie die 500er-Stufe als Textfarbe; sie ist die Fläche in der Mitte der Rampe.' },
            { text: 'Ein Akzent je Fläche. Wer ihn überall sieht, sieht kein Signal mehr.' },
            { text: 'Beide Modi tragen dieselben Rollen-Namen — wer „primary" setzt, muss nie wissen, ob es hell oder dunkel ist.' },
          ],
        },
      ],
    },
    {
      id: 'typografie-anwendung',
      anchor: 'typografie-anwendung',
      title: 'Typografie-Anwendung',
      state: 'done',
      note: `Paar „${DK_PAIR.name}": ${DK_PAIR.headingFamily} über ${DK_PAIR.bodyFamily}, Skala „Ruhig" über 16 px Fließtext.`,
      blocks: [
        {
          kind: 'table',
          label: 'Größen-Skala',
          columns: ['Stufe', 'Größe', 'Zeilenhöhe', 'Gewicht', 'Schrift', 'Wofür'],
          rows: DK_TYPE_SCALE.map(step => [
            step.label,
            `${step.px} px · ${step.rem}`,
            String(step.lineHeight).replace('.', ','),
            String(step.weight),
            step.face === 'heading' ? DK_PAIR.headingFamily : DK_PAIR.bodyFamily,
            step.usage,
          ]),
        },
        {
          kind: 'rules',
          label: 'Regeln',
          items: [
            { text: 'Maximal drei Schriften auf einer Seite: Überschrift, Text, Mono.' },
            { text: 'Mono gehört den Herkunftsangaben und Preisen — sie ist eine Rolle, keine dritte Marke.' },
            { text: 'Überschriften werden nicht gesperrt und nicht in Versalien gesetzt.', dont: 'KAILUA COFFEE CO. als Überschrift.' },
            { text: 'Fließtext bleibt bei 16 px; kleiner wird nur, was ohnehin niemand liest.' },
          ],
        },
        {
          kind: 'text',
          label: 'Lizenz',
          text: `${DK_LICENSES.map(license => `${license.family} (${license.spdx}, ${license.source})`).join(' · ')}. ${DK_LICENSE_NOTE}`,
        },
      ],
    },
  ]
}

/** Kapitel „Nomenklatur" (§2.5, nach `architektur`) — nur mit Book & Kit. */
export function demoNomenclatureChapter(): FdChapterData {
  return {
    id: 'nomenklatur',
    anchor: 'nomenklatur',
    title: 'Nomenklatur',
    state: 'done',
    note: 'Wie neue Produkte, Orte und Formate heißen — hergeleitet aus Markenarchitektur, Werten und Ton.',
    blocks: [
      {
        kind: 'table',
        label: 'Muster je Produkttyp',
        columns: ['Typ', 'Muster', 'Beispiel'],
        rows: DK_NAME_PATTERNS
          .filter(pattern => DK_NAME_TYPES.some(type => type.preset && type.id === pattern.typeId))
          .map((pattern) => {
            const type = DK_NAME_TYPES.find(entry => entry.id === pattern.typeId)
            return [type?.label ?? pattern.typeId, pattern.pattern, pattern.example]
          }),
      },
      {
        kind: 'rules',
        label: 'Regeln',
        items: DK_NAME_RULES.map(text => ({ text })),
      },
    ],
  }
}

/** Kapitel „Pressekit" (§2.5, vor `ki-texte`). */
export function demoPresskitChapter(): FdChapterData {
  return {
    id: 'pressekit',
    anchor: 'pressekit',
    title: 'Pressekit',
    state: 'done',
    note: 'Nichts Neues — zusammengestellt aus Botschaften, Fakten-Freigabe und Kontakt.',
    blocks: [
      { kind: 'lead', label: 'Tagline', text: demoFoundation.brand.tagline },
      { kind: 'cards', label: 'Boilerplates', items: demoBoilerplates().map(entry => ({ title: entry.title, text: entry.text })) },
      { kind: 'list', label: 'Freigegebene Fakten', items: DK_FACTS.filter(fact => fact.released).map(fact => fact.text) },
      {
        kind: 'text',
        label: 'Nicht freigegeben',
        text: `${DK_FACTS.filter(fact => !fact.released).length} von ${DK_FACTS.length} Fakten bleiben intern — sie reisen weder ins Pressekit noch in den geteilten Link.`,
      },
      { kind: 'contact', label: 'Presse-Kontakt', name: 'Leilani Kahale', role: 'Inhaberin', email: 'leilani@kailuacoffee.co', note: DK_CONTACT_PUBLIC_NOTE },
    ],
  }
}

/**
 * Kapitel 11 nach der Abnahme von `aiguide` (§2.5): der Titel wird
 * „AI-Guidelines", der ANKER bleibt `ki-texte` — verschickte Tieflinks dürfen
 * nicht ins Leere zeigen (§2.17).
 */
export function demoAiGuidelinesChapter(): FdChapterData {
  const scope = DK_AI_SCOPE.find(card => card.recommended)!
  const review = DK_AI_REVIEW.find(card => card.recommended)!
  return {
    id: 'ki-texte',
    anchor: 'ki-texte',
    title: 'AI-Guidelines',
    state: 'done',
    note: 'Der feste Rahmen bleibt — darunter stehen jetzt Umfang, Freigabe, Leitplanken und drei Vorlagen.',
    blocks: [
      {
        kind: 'aiRules',
        tone: ['ruhig', 'fundiert', 'gerade heraus', 'warm, aber nie anbiedernd'],
        avoid: ['Genuss-Erlebnis', 'Auszeit', 'Deluxe', 'Premium-Arabica-Selektion', 'Superlative ohne Beleg'],
        stands: ['Klartext', 'Handwerk', 'Nähe'],
        note: 'Zum Kopieren in ChatGPT, Claude oder das Redaktionssystem.',
      },
      { kind: 'text', label: 'Was KI erzeugen darf', text: `${scope.label} — ${scope.note}` },
      { kind: 'text', label: 'Freigabe-Regel', text: `${review.label} — ${review.note}` },
      ...DK_GUARDRAILS.map((group): FdBlock => ({
        kind: 'rules',
        label: `Leitplanken · ${group.title}`,
        items: group.items.map(text => ({ text })),
      })),
      ...DK_PROMPTS.map((prompt): FdBlock => ({
        kind: 'prompt',
        label: prompt.title,
        title: prompt.purpose,
        text: prompt.text,
        note: 'Ohne KI gerechnet — aus Werten, Ton-Wörtern und den Leitplanken darüber.',
      })),
    ],
  }
}
