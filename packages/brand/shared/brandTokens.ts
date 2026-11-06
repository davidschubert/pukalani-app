/**
 * `tokens.json` — DAS TOKEN-MODELL DER MARKE NACH DTCG 2025.10 (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.6, Entscheidung §2.20 Nr. 1, Paket K2).
 *
 * ── ES WIRD GERECHNET, NIE GESPEICHERT ───────────────────────────────────
 * Dieselbe Regel wie beim Preset selbst (§2.6: „keine Spalte, kein Cache,
 * keine gespeicherte Datei"): aus `BrandDesignPreset` plus Marke und Stand
 * entsteht bei jedem Abruf dieselbe Datei. Es gibt keinen zweiten Ort, an dem
 * eine ältere Fassung liegen könnte — und damit auch keine Migration für
 * Token-Dateien.
 *
 * ── EINE DATEI, ZWEI MODI ALS GESCHWISTER-GRUPPEN ────────────────────────
 * Die Norm kennt keine Modi (Anhang A). `color.light.*` und `color.dark.*`
 * tragen deshalb DIESELBEN Rollen-Namen und zeigen als ALIASSE auf
 * verschiedene Stufen derselben Rampen. Figma bildet die Gruppen beim Import
 * auf zwei Modi ab, Style Dictionary auf zwei Sets, und ein Mensch liest an
 * einer Stelle, was „primary" in beiden Welten bedeutet. Zwei Dateien wären
 * zwei Downloads und zwei Gelegenheiten, nur eine davon zu aktualisieren.
 *
 * ── DIE DUNKLE ROLLE IST DIE GESPIEGELTE STUFE, KEINE ZWEITE TABELLE ─────
 * `brandColorRoles()` (D3) kennt fünf Rollen, und sie beschreiben die HELLE
 * Welt („Die HELLE Rampe trägt die Marken-Rollen ... die dunkle ist ihre
 * Spiegelung"). Genau diese Spiegelung steht hier als EINE Regel:
 * `ramp.900 → brand-dark.100`, `neutral.50 → neutral.950`, der Akzent bleibt.
 * Eine zweite Rollen-Tabelle „für dunkel" wären zehn Zeilen für fünf
 * Entscheidungen — und die erste, die jemand vergisst nachzuziehen.
 *
 * Die Spiegelung ist nicht frei gewählt: sie trifft genau die Farben, die die
 * Kontrast-Matrix des Presets im dunklen Modus prüft (`body-dark` misst
 * `rampDark.100` auf `neutral.950`, also gespiegelte 900 auf gespiegelte 50).
 *
 * ── DIE GRÖSSEN-LEITER IST GERECHNET, NICHT GETIPPT ──────────────────────
 * D4 hält von der Typografie genau zwei Zahlen fest: die H1-Größe bei Faktor 1
 * (`BRAND_TYPE_H1_REM`) und den Faktor der gewählten Hierarchie. Die sechs
 * Stufen entstehen daraus GEOMETRISCH (`ratio ** rung`, s.
 * `BRAND_TOKEN_TYPE_STEPS`) — eine Marke mit „Plakativ" bekommt damit eine
 * andere Leiter und nicht dieselbe mit größerem H1. Der Prototyp hatte die
 * sechs Größen von Hand („42 px, 32 px, …"); das war für EINE Marke richtig
 * und für jede zweite falsch.
 *
 * ── UNSERE ZUSÄTZE STEHEN UNTER `$extensions` ────────────────────────────
 * Kontrast-Belege, die Prozent-Rundung des Zeichens, unsere Fassung: alles
 * unter `supply.branding/*`. Ein Fremdfeld neben `$value` würde jeden
 * Importeur stolpern lassen, und die Norm hat für genau diesen Fall ein Feld.
 *
 * DIESE DATEI IST PUR: kein i18n-Modul, kein H3, kein Appwrite, kein Vue. Die
 * `$description`-Texte stehen zweisprachig im Code (dieselbe Regel wie in
 * `brandDesignVocab.ts`); die Token-NAMEN sind sprachneutral (§2.17).
 */

import { brandMotionTokenUsage } from './brandDesignMotion'
import {
  BRAND_TYPE_BODY_REM,
  BRAND_TYPE_DEFAULT_RULES,
  brandTypeRulesFromLines,
  brandTypeScaleRatio,
} from './brandDesignType'
import { brandMarkRadiusPercent } from './brandDesignMark'
import { brandContrast, brandRampDark } from './brandDesign'
import { BRAND_MONO_STACK, brandFontPair } from './brandFontPairs'
import {
  BRAND_TOKEN_EXTENSION_ACCENT_LIFT,
  BRAND_TOKEN_EXTENSION_CONTRAST,
  BRAND_TOKEN_EXTENSION_MARK,
  BRAND_TOKEN_EXTENSION_META,
  BRAND_TOKEN_EXTENSION_TYPE,
  type BrandColorAliasToken,
  type BrandColorRoleTokenGroup,
  type BrandTokenAccentLift,
  type BrandColorToken,
  type BrandDurationTokenGroup,
  type BrandEasingTokenGroup,
  type BrandRampTokenGroup,
  type BrandTokenColorValue,
  type BrandTokenContrast,
  type BrandTokenCubicBezierValue,
  type BrandTokenMetaInput,
  type BrandTokenFile,
  type BrandTypeScaleTokenGroup,
} from './types/brandKit'
import {
  BRAND_RAMP_SHADES,
  type BrandDesignSnapshotPreset,
  type BrandRamp,
  type BrandRampShade,
} from './types/brand'

/**
 * DIE FASSUNG UNSERES AUFBAUS. Sie steigt, wenn sich die FORM ändert (eine
 * Gruppe kommt dazu, ein Name ändert sich) — nicht, wenn eine Marke andere
 * Werte hat. Sie steht im Kopf jeder Datei, damit ein Empfänger, der ein Kit
 * von vor einem Jahr wiederfindet, weiß, wonach er liest.
 */
export const BRAND_TOKEN_FORMAT_VERSION = 1

/** Wer die Datei gebaut hat — sie reist ohne uns weiter. */
export const BRAND_TOKEN_GENERATOR = 'branding.supply'

/** Die Fassung der Norm, der wir folgen (Anhang A). */
export const BRAND_TOKEN_DTCG_VERSION = '2025.10'

/**
 * DIE BEZUGS-KACHEL DES ZEICHEN-RADIUS in rem.
 *
 * `brandMarkRadiusPercent` liefert PROZENT der Kantenlänge — richtig, weil
 * dieselbe Zahl für ein Favicon und für ein Ladenschild gilt (D5). Ein
 * DTCG-`dimension` kennt aber nur px und rem. Deshalb: EIN Bezugsmaß (2,5 rem
 * = 40 px, die übliche Kachel für Icon, Avatar und App-Symbol), der Prozentwert
 * reist unverändert in `$extensions` mit. Wer eine andere Kachel braucht,
 * rechnet ihn dort ab — statt eine gerundete rem-Zahl hochzuskalieren.
 */
export const BRAND_TOKEN_MARK_TILE_REM = 2.5

/** Der Fließtext läuft im Normalschnitt — D4 lässt daran bewusst nichts stellen. */
export const BRAND_TOKEN_BODY_WEIGHT = 400

/** Eine Stufe der Größen-Leiter (s. Kopf: sie ist gerechnet, nicht getippt). */
export interface BrandTokenTypeStep {
  readonly id: string
  /**
   * Die Sprosse auf der geometrischen Leiter zwischen Fließtext (0) und H1 (1).
   * `small` steht bewusst UNTER dem Fließtext (−0,25) — dieselbe Leiter, ein
   * Schritt nach unten, statt einer zweiten Zahl von Hand.
   */
  readonly rung: number
  readonly lineHeight: number
  /** Welche Schrift die Stufe trägt — und damit, welches Gewicht sie hat. */
  readonly face: 'heading' | 'body'
  /** Gewicht der Stufen, die NICHT die Überschriften-Schrift tragen. */
  readonly bodyWeight?: number
  readonly usageDe: string
  readonly usageEn: string
}

/**
 * SECHS STUFEN — die des freigegebenen Prototyps, aber als VERHÄLTNISSE.
 *
 * Die Zeilenhöhen sind Setzungen (große Größen brauchen weniger Durchschuss)
 * und wörtlich die des Prototyps; die GRÖSSEN kommen aus D4.
 */
export const BRAND_TOKEN_TYPE_STEPS: readonly BrandTokenTypeStep[] = [
  { id: 'h1', rung: 1, lineHeight: 1.1, face: 'heading', usageDe: 'Seitentitel — einmal je Seite.', usageEn: 'Page title — once per page.' },
  { id: 'h2', rung: 0.75, lineHeight: 1.15, face: 'heading', usageDe: 'Kapitel und Abschnitte.', usageEn: 'Chapters and sections.' },
  { id: 'h3', rung: 0.5, lineHeight: 1.25, face: 'heading', usageDe: 'Unterabschnitte, Karten-Titel.', usageEn: 'Subsections, card titles.' },
  { id: 'h4', rung: 0.25, lineHeight: 1.35, face: 'body', bodyWeight: 500, usageDe: 'Listen-Köpfe, Tabellen-Gruppen.', usageEn: 'List heads, table groups.' },
  { id: 'body', rung: 0, lineHeight: 1.6, face: 'body', usageDe: 'Fließtext — die Bezugsgröße der Leiter.', usageEn: 'Body text — the reference size of the ladder.' },
  { id: 'small', rung: -0.25, lineHeight: 1.5, face: 'body', usageDe: 'Herkunft, Preise, Fußnoten (Mono erlaubt).', usageEn: 'Origin details, prices, footnotes (mono allowed).' },
]

function isDe(locale: string): boolean {
  return locale.toLowerCase().startsWith('de')
}

function text(locale: string, de: string, en: string): string {
  return isDe(locale) ? de : en
}

/**
 * HEX → DTCG-FARBE. Die Kanäle sind 0–1 auf vier Nachkommastellen (§2.17:
 * genau die Rundung, die Style Dictionary 5.4 erwartet), der Hex bleibt als
 * Rückfall stehen.
 *
 * Ein unlesbarer Hex ergibt Schwarz statt eines Fehlers: die Rampen kommen
 * aus der Engine und können gar nicht kaputt sein, und ein Wurf hier machte
 * aus einem einzelnen faulen Wert eine Datei, die es nicht gibt.
 */
export function brandTokenColorValue(hex: string): BrandTokenColorValue {
  const clean = hex.trim().replace('#', '')
  const channel = (start: number): number => {
    const raw = Number.parseInt(clean.slice(start, start + 2), 16)
    return Number.isFinite(raw) ? Math.round((raw / 255) * 10000) / 10000 : 0
  }
  return {
    colorSpace: 'srgb',
    components: [channel(0), channel(2), channel(4)],
    hex: `#${clean.toLowerCase()}`,
  }
}

/**
 * DIE GESPIEGELTE STUFE (s. Kopf) — 50↔950, 100↔900, …, 500 bleibt 500.
 * Eine unbekannte Stufe kommt unverändert zurück; die Liste ist geschlossen,
 * der Fall existiert nur, wenn jemand sie erweitert.
 */
export function brandTokenMirrorShade(shade: number): number {
  const index = (BRAND_RAMP_SHADES as readonly number[]).indexOf(shade)
  if (index < 0) return shade
  return BRAND_RAMP_SHADES[BRAND_RAMP_SHADES.length - 1 - index] ?? shade
}

/**
 * DIE QUELLE EINER ROLLE ALS ALIAS-PFAD — `null`, wenn die Quelle kein Token
 * benennt (dann fällt die Rolle heraus, statt auf ein Token zu zeigen, das es
 * nicht gibt).
 *
 * Im dunklen Modus wird die STUFE gespiegelt, nicht der Name: `primary` heißt
 * in beiden Gruppen `primary`.
 */
export function brandTokenRoleAlias(source: string, scheme: 'light' | 'dark'): string | null {
  if (source === 'accent') return '{color.accent}'
  const [family, raw] = source.split('.')
  const shade = Number(raw)
  if (!(BRAND_RAMP_SHADES as readonly number[]).includes(shade)) return null
  const effective = scheme === 'dark' ? brandTokenMirrorShade(shade) : shade
  if (family === 'ramp') return `{color.${scheme === 'dark' ? 'brand-dark' : 'brand'}.${effective}}`
  if (family === 'neutral') return `{color.neutral.${effective}}`
  return null
}

/** Der aufgelöste Hex einer Rollen-Quelle in einem Modus — `null` wie oben. */
export function brandTokenRoleHex(
  source: string,
  scheme: 'light' | 'dark',
  colors: { rampLight: BrandRamp, rampDark: BrandRamp, neutral: BrandRamp, accent: string },
): string | null {
  if (source === 'accent') return colors.accent
  const [family, raw] = source.split('.')
  const shade = Number(raw)
  if (!(BRAND_RAMP_SHADES as readonly number[]).includes(shade)) return null
  const key = (scheme === 'dark' ? brandTokenMirrorShade(shade) : shade) as BrandRampShade
  if (family === 'ramp') return (scheme === 'dark' ? colors.rampDark : colors.rampLight)[key]
  if (family === 'neutral') return colors.neutral[key]
  return null
}

/**
 * `cubic-bezier(0.22, 0.61, 0.36, 1)` → vier Zahlen. `null`, wenn der String
 * keine ist — dann fehlt das Easing-Token, statt eine Kurve zu behaupten.
 */
export function brandTokenCubicBezier(easing: string): BrandTokenCubicBezierValue | null {
  const match = /^cubic-bezier\(([^)]+)\)$/i.exec(easing.trim())
  if (!match) return null
  const parts = (match[1] ?? '').split(',').map(part => Number.parseFloat(part.trim()))
  if (parts.length !== 4 || parts.some(part => !Number.isFinite(part))) return null
  return [parts[0]!, parts[1]!, parts[2]!, parts[3]!]
}

/**
 * DER KONTRAST-BELEG EINER ROLLE — das ERSTE der sechs geprüften Paare, in dem
 * diese Farbe in diesem Modus vorkommt; `undefined`, wenn keines sie berührt.
 *
 * Gemessen wird hier NICHTS: die Zahlen stehen im Preset, sie sind dieselben,
 * die die Kontrast-Matrix des Kapitels zeigt, und eine zweite Rechnung wäre
 * die zweite Meinung über dieselbe Fläche (D3-Lehre). Rollen ohne Paar
 * bekommen deshalb keinen Beleg — ein erfundener wäre schlimmer als keiner.
 */
export function brandTokenContrastFor(
  preset: BrandDesignSnapshotPreset,
  scheme: 'light' | 'dark',
  hex: string,
): BrandTokenContrast | undefined {
  const needle = hex.toLowerCase()
  const pair = preset.color.contrastPairs.find(entry => entry.scheme === scheme
    && (entry.foreground.toLowerCase() === needle || entry.background.toLowerCase() === needle))
  if (!pair) return undefined
  return { pair: pair.id, ratio: Math.round(pair.ratio * 100) / 100, level: pair.level }
}

/** Die AA-Schwelle für normalen Text (WCAG 1.4.3) — die Latte der Hebung. */
export const BRAND_TOKEN_ACCENT_AA_RATIO = 4.5

/**
 * DIE HEBUNG DES DUNKELMODUS-AKZENTS (Davids Entscheidung §2.20 Nr. 7).
 *
 * ── WARUM GEHOBEN UND NICHT NUR BESCHRIFTET ──────────────────────────────
 * Ein Akzent, der auf dunkler Fläche 1,8:1 erreicht, ist dort kein Signal,
 * sondern ein Fleck. Die Markenfarbe wörtlich zu lassen und „unter AA"
 * danebenzuschreiben hätte die Entscheidung in jede Marke verschoben; eine
 * neue Frage im Farbwelt-Kapitel hätte das Kit an eine Antwort gebunden und
 * damit „gerechnet, nie gespeichert" gebrochen. Also rechnet das Token-Modell
 * selbst — und legt den Beleg daneben (`BrandTokenAccentLift`).
 *
 * ── WELCHE STUFE ─────────────────────────────────────────────────────────
 * Die Rampe des Akzents wird von DUNKEL nach HELL abgelaufen (950 → 50), und
 * die ERSTE Stufe, die AA erreicht, gewinnt: sie liegt dem Original am
 * nächsten. Von hell nach dunkel zu suchen fände immer die 50 — ein Weiß, das
 * mit dem Akzent nichts mehr zu tun hat. Erreicht das Original selbst schon
 * AA, gibt es nichts zu heben (`null`); erreicht keine Stufe AA (bei einer
 * Rampe bis Stufe 50 praktisch unmöglich), ebenfalls `null` — dann bleibt
 * der Alias auf dem Original und der Leser sieht das Urteil im Kontrast-Beleg.
 */
export function brandTokenAccentLift(
  accent: string,
  ground: string,
  accentRamp: BrandRamp,
): BrandTokenAccentLift | null {
  const measured = brandContrast(accent, ground)
  if (!measured) return null
  if (measured.ratio >= BRAND_TOKEN_ACCENT_AA_RATIO) return null
  for (const shade of [...BRAND_RAMP_SHADES].reverse()) {
    const candidate = accentRamp[shade]
    const verdict = brandContrast(candidate, ground)
    if (!verdict || verdict.ratio < BRAND_TOKEN_ACCENT_AA_RATIO) continue
    return {
      from: '{color.accent}',
      ground,
      measured: { ratio: Math.round(measured.ratio * 100) / 100, level: measured.level },
      lifted: { shade, ratio: Math.round(verdict.ratio * 100) / 100, level: verdict.level },
    }
  }
  return null
}

/**
 * DIE DUNKLE FLÄCHE, GEGEN DIE DER AKZENT GEMESSEN WIRD: das `paper` der
 * Marke im dunklen Modus (Neutral 950 nach Spiegelung) — der Grund, auf dem
 * im Dunkeln alles steht. Führt die Marke kein `paper`, gilt Neutral 950
 * direkt; die Rechnung bleibt so für jede Marke dieselbe.
 */
export function brandTokenDarkGround(preset: BrandDesignSnapshotPreset): string {
  const paper = preset.color.roles.find(role => role.id === 'paper')
  const colors = {
    rampLight: preset.color.rampLight,
    rampDark: preset.color.rampDark,
    neutral: preset.color.neutral,
    accent: preset.color.accent,
  }
  return (paper ? brandTokenRoleHex(paper.source, 'dark', colors) : null) ?? preset.color.neutral[950]
}

/**
 * DIE HEBUNG FÜR EIN GANZES PRESET — Rampe, Grund und Urteil in EINEM Aufruf
 * (Paket K4).
 *
 * Sie steht hier und nicht beim Aufrufer, weil das Book seit K4 DENSELBEN
 * Beleg zeigt, den `tokens.json` als `$extensions` trägt (§2.20 Nr. 7). Zwei
 * Stellen, die Akzent-Rampe und dunkle Fläche selbst zusammensuchen, wären
 * zwei Gelegenheiten, eine andere Fläche zu messen als die, gegen die das
 * Token gehoben wurde — und der Leser sähe im Handbuch ein Verhältnis, das in
 * der Datei nicht steht.
 *
 * `null` heisst: nichts zu heben (der Akzent erreicht AA) oder nichts zu
 * rechnen (unlesbarer Akzent).
 */
export function brandTokenAccentLiftFor(preset: BrandDesignSnapshotPreset): BrandTokenAccentLift | null {
  const accentRamp = brandRampDark(preset.color.accent)
  if (!accentRamp) return null
  return brandTokenAccentLift(preset.color.accent, brandTokenDarkGround(preset), accentRamp)
}

function rampGroup(ramp: BrandRamp, description: string): BrandRampTokenGroup {
  const group: BrandRampTokenGroup = { $description: description }
  for (const shade of BRAND_RAMP_SHADES) {
    group[String(shade)] = { $type: 'color', $value: brandTokenColorValue(ramp[shade]) }
  }
  return group
}

function roleGroup(
  preset: BrandDesignSnapshotPreset,
  scheme: 'light' | 'dark',
  locale: string,
  /** Die Akzent-Rampe (dunkel) — nur der dunkle Modus hebt (§2.20 Nr. 7). */
  accentRamp: BrandRamp | null = null,
): BrandColorRoleTokenGroup {
  const colors = {
    rampLight: preset.color.rampLight,
    rampDark: preset.color.rampDark,
    neutral: preset.color.neutral,
    accent: preset.color.accent,
  }
  const group: BrandColorRoleTokenGroup = {
    $description: scheme === 'light'
      ? text(locale, 'Rollen im hellen Modus — Aliasse in die Rampen.', 'Roles in light mode — aliases into the ramps.')
      : text(locale, 'Rollen im dunklen Modus — dieselben Namen, gespiegelte Stufen.', 'Roles in dark mode — the same names, mirrored steps.'),
  }
  for (const role of preset.color.roles) {
    const alias = brandTokenRoleAlias(role.source, scheme)
    const hex = brandTokenRoleHex(role.source, scheme, colors)
    // Eine Rolle ohne auflösbare Quelle ist eine Beschriftung, kein Token —
    // dieselbe Regel wie in `buildBrandDesign` (dort fällt sie schon heraus).
    if (!alias || !hex) continue
    const contrast = brandTokenContrastFor(preset, scheme, hex)
    /* Der Akzent im dunklen Modus: erreicht das Original auf der dunklen
     * Fläche kein AA, zeigt der Alias auf die erste AA-fähige Stufe der
     * Akzent-Rampe — das gemessene Urteil reist als Beleg mit. Der helle
     * Modus und jede andere Rolle bleiben unberührt. */
    const lift = scheme === 'dark' && role.source === 'accent' && accentRamp
      ? brandTokenAccentLiftFor(preset)
      : null
    const token: BrandColorAliasToken = {
      $type: 'color',
      $value: lift ? `{color.accent-dark.${lift.lifted.shade}}` : alias,
      ...(contrast || lift
        ? {
            $extensions: {
              ...(contrast ? { [BRAND_TOKEN_EXTENSION_CONTRAST]: contrast } : {}),
              ...(lift ? { [BRAND_TOKEN_EXTENSION_ACCENT_LIFT]: lift } : {}),
            },
          }
        : {}),
    }
    group[role.id] = token
  }
  return group
}

function typeScaleGroup(
  preset: BrandDesignSnapshotPreset,
  headingWeight: number,
  headingTracking: number,
  headingUppercase: boolean,
  locale: string,
): BrandTypeScaleTokenGroup {
  const ratio = brandTypeScaleRatio(preset.type.scale)
  const group: BrandTypeScaleTokenGroup = {
    $description: text(
      locale,
      `Größen-Leiter „${preset.type.scale}" — geometrisch zwischen Fließtext und H1 (1 : ${ratio.toFixed(1)}).`,
      `Size ladder "${preset.type.scale}" — geometric between body text and H1 (1 : ${ratio.toFixed(1)}).`,
    ),
  }
  for (const step of BRAND_TOKEN_TYPE_STEPS) {
    // Drei Nachkommastellen: 0,001 rem sind 0,016 px — unsichtbar, aber die
    // Datei bleibt lesbar. Vier Stellen wären Rauschen in jedem Diff.
    const rem = Math.round(BRAND_TYPE_BODY_REM * ratio ** step.rung * 1000) / 1000
    const weight = step.face === 'heading' ? headingWeight : (step.bodyWeight ?? BRAND_TOKEN_BODY_WEIGHT)
    group[step.id] = {
      $type: 'typography',
      $value: {
        fontFamily: step.face === 'heading' ? '{font.heading}' : '{font.body}',
        fontSize: { value: rem, unit: 'rem' },
        fontWeight: weight,
        lineHeight: step.lineHeight,
        ...(step.face === 'heading' ? { letterSpacing: { value: headingTracking, unit: 'px' as const } } : {}),
      },
      $description: text(locale, step.usageDe, step.usageEn),
      // Versalien kennt der Verbund der Norm nicht (Anhang A) — sie sind
      // trotzdem eine Entscheidung dieser Marke und stehen deshalb dort, wo
      // Eigenes hingehört. Nur an den Überschriften-Stufen: der Fließtext
      // wird nie versal gesetzt (D4).
      ...(step.face === 'heading'
        ? { $extensions: { [BRAND_TOKEN_EXTENSION_TYPE]: { uppercase: headingUppercase } } }
        : {}),
    }
    /* Figma importiert Verbünde noch nicht (§1.7) — die reine GRÖSSE steht
     * deshalb ein zweites Mal als Einzel-Token daneben. Das ist die einzige
     * bewusste Doppelung in dieser Datei, und sie hat ein Ablaufdatum. */
    group[`${step.id}-size`] = { $type: 'dimension', $value: { value: rem, unit: 'rem' } }
  }
  return group
}

function motionGroups(
  preset: BrandDesignSnapshotPreset,
  locale: string,
): { duration: BrandDurationTokenGroup, easing: BrandEasingTokenGroup } {
  const duration: BrandDurationTokenGroup = {
    $description: text(locale, 'Dauern aus dem gewählten Tempo.', 'Durations from the chosen tempo.'),
  }
  const easing: BrandEasingTokenGroup = {
    $description: text(locale, 'Die eine Kurve der Marke.', 'The single curve of the brand.'),
  }
  for (const token of preset.motion.transitions) {
    duration[token.id] = {
      $type: 'duration',
      $value: { value: token.durationMs, unit: 'ms' },
      ...(brandMotionTokenUsage(token.id, locale)
        ? { $description: brandMotionTokenUsage(token.id, locale) }
        : {}),
    }
  }
  /* EINE Kurve für alle Dauern: das Preset führt sie je Token, aber sie ist je
   * Tempo dieselbe (`brandMotionTransitions`). Vier gleiche Easing-Tokens wären
   * vier Gelegenheiten, drei davon zu ändern. */
  const curve = brandTokenCubicBezier(preset.motion.transitions[0]?.easing ?? '')
  if (curve) {
    easing.brand = {
      $type: 'cubicBezier',
      $value: curve,
      $description: text(locale, 'Anlaufen und ausklingen — die Kurve jeder Bewegung.', 'Ease in and out — the curve of every movement.'),
    }
  }
  return { duration, easing }
}

/**
 * DIE TOKEN-DATEI EINER MARKE.
 *
 * `meta.stand` ist der ISO-Stempel des jüngsten beteiligten Kapitels
 * (`brandDesignStand`) — ein leerer Stand ist erlaubt (eine Marke ohne
 * Kapitel-Zeilen) und steht dann auch leer in der Datei, statt „heute" zu
 * behaupten.
 */
export function buildBrandTokens(
  preset: BrandDesignSnapshotPreset,
  meta: BrandTokenMetaInput,
): BrandTokenFile {
  const pair = brandFontPair(preset.type.pair)
  /* Die Regeln kommen als ZEILEN aus dem Preset (§2.6). Lässt sich daraus
   * nichts lesen, gilt der Vorschlag von D4 — sichtbar an EINER Stelle. */
  const rules = brandTypeRulesFromLines(preset.type.rules) ?? BRAND_TYPE_DEFAULT_RULES
  const radiusPercent = brandMarkRadiusPercent(preset.dna)
  const { duration, easing } = motionGroups(preset, meta.locale)

  const accent: BrandColorToken = {
    $type: 'color',
    $value: brandTokenColorValue(preset.color.accent),
    $description: text(meta.locale, 'Akzent — ein Signal je Fläche.', 'Accent — one signal per surface.'),
  }
  /* Die Akzent-Rampe für den dunklen Modus (§2.20 Nr. 7): Ziel der Hebung.
   * Ein unlesbarer Akzent ergäbe keine Rampe — dann gibt es keine Gruppe
   * und keine Hebung, der Alias bleibt auf dem Original. Damit die Datei
   * ihre Form behält, steht die Gruppe trotzdem (leer bis auf den Text). */
  const accentRamp = brandRampDark(preset.color.accent)
  const accentDarkDescription = text(
    meta.locale,
    'Akzent-Rampe dunkel — Ziel der Hebung, wenn der Akzent auf dunkler Fläche kein AA erreicht.',
    'Accent ramp (dark) — the lift target when the accent misses AA on dark ground.',
  )

  return {
    $description: text(
      meta.locale,
      `Design-Tokens ${meta.title} · Stand ${meta.stand} · DTCG ${BRAND_TOKEN_DTCG_VERSION} · gerechnet, nicht gespeichert.`,
      `Design tokens ${meta.title} · as of ${meta.stand} · DTCG ${BRAND_TOKEN_DTCG_VERSION} · computed, never stored.`,
    ),
    $extensions: {
      [BRAND_TOKEN_EXTENSION_META]: {
        formatVersion: BRAND_TOKEN_FORMAT_VERSION,
        stand: meta.stand,
        generator: BRAND_TOKEN_GENERATOR,
        presetVersion: preset.version,
      },
    },
    color: {
      brand: rampGroup(preset.color.rampLight, text(
        meta.locale,
        `Marken-Rampe hell, gerechnet aus der Basisfarbe ${preset.color.base}.`,
        `Brand ramp (light), computed from the base colour ${preset.color.base}.`,
      )),
      'brand-dark': rampGroup(preset.color.rampDark, text(
        meta.locale,
        'Marken-Rampe dunkel — dieselbe Mathematik, andere Enden.',
        'Brand ramp (dark) — the same maths, different ends.',
      )),
      neutral: rampGroup(preset.color.neutral, text(
        meta.locale,
        'Getönte Neutral-Rampe: Grund, Flächen, Linien.',
        'Tinted neutral ramp: ground, surfaces, lines.',
      )),
      accent,
      'accent-dark': accentRamp
        ? rampGroup(accentRamp, accentDarkDescription)
        : { $description: accentDarkDescription },
      light: roleGroup(preset, 'light', meta.locale),
      dark: roleGroup(preset, 'dark', meta.locale, accentRamp),
    },
    font: {
      heading: {
        $type: 'fontFamily',
        $value: brandTokenFontStack(pair?.headingStack ?? ''),
        $description: text(meta.locale, 'Überschriften und Wortmarke.', 'Headings and the wordmark.'),
      },
      body: {
        $type: 'fontFamily',
        $value: brandTokenFontStack(pair?.bodyStack ?? ''),
        $description: text(meta.locale, 'Fließtext — die Fläche, auf der gelesen wird.', 'Body text — the surface that gets read.'),
      },
      mono: {
        $type: 'fontFamily',
        $value: brandTokenFontStack(BRAND_MONO_STACK),
        $description: text(meta.locale, 'Herkunft, Preise, Zahlen und Code — sonst nirgends.', 'Origin details, prices, figures and code — nowhere else.'),
      },
      weight: {
        heading: { $type: 'fontWeight', $value: rules.headingWeight },
        body: { $type: 'fontWeight', $value: BRAND_TOKEN_BODY_WEIGHT },
      },
    },
    type: {
      scale: typeScaleGroup(preset, rules.headingWeight, rules.headingTracking, rules.headingUppercase, meta.locale),
    },
    radius: {
      mark: {
        $type: 'dimension',
        $value: {
          value: Math.round(BRAND_TOKEN_MARK_TILE_REM * (radiusPercent / 100) * 1000) / 1000,
          unit: 'rem',
        },
        $description: text(
          meta.locale,
          `Eckenradius der Zeichen-Kachel — ${radiusPercent} % der Kantenlänge, hier auf ${BRAND_TOKEN_MARK_TILE_REM} rem bezogen.`,
          `Corner radius of the mark tile — ${radiusPercent}% of the edge, here relative to ${BRAND_TOKEN_MARK_TILE_REM} rem.`,
        ),
        $extensions: {
          [BRAND_TOKEN_EXTENSION_MARK]: { radiusPercent, referenceTileRem: BRAND_TOKEN_MARK_TILE_REM },
        },
      },
    },
    motion: { duration, easing },
  }
}

/**
 * EIN CSS-STACK ALS LISTE — `'Source Serif 4', Georgia, serif` wird zu drei
 * Einträgen. Die Norm erlaubt beides (String oder Liste); die Liste ist die
 * ehrlichere, weil ein Importeur sonst selbst am Komma trennen müsste — und
 * dabei über das Komma in einem Familiennamen stolpern würde.
 */
export function brandTokenFontStack(stack: string): string[] {
  return stack
    .split(',')
    .map(part => part.trim().replace(/^['"]|['"]$/g, ''))
    .filter(part => part.length > 0)
}

/** `tokens.json` als Text — genau das, was der Download liefert. */
export function renderBrandTokensJson(tokens: BrandTokenFile): string {
  return `${JSON.stringify(tokens, null, 2)}\n`
}
