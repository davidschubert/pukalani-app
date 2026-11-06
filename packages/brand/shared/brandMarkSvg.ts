import {
  BRAND_MARK_CLEAR_SPACE_CAP_FACTOR,
  type BrandMarkSpec,
  type BrandMarkVariantColors,
} from './brandDesignMark'

/**
 * DER SATZ DES ZEICHENS — Wortmarke und Monogramm als SVG, pur (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.5 Stufe 2, Paket D5b).
 *
 * ── ES IST SATZ, KEINE ERFINDUNG ──────────────────────────────────────────
 * Hier entsteht kein Logo. Hier wird der NAME der Marke in ihrer eigenen
 * Überschriften-Schrift und ihren eigenen Farben GESETZT — dasselbe, was ein
 * Mensch in fünf Minuten in einem Grafikprogramm täte, nur eben nachvollziehbar
 * und in vier Varianten. Genau deshalb darf es hier auch keinen Zufall geben:
 * dieselben Eingaben ergeben denselben String, und der Test hält ihn fest.
 *
 * ── WARUM DER RENDERER EINE ZEICHENKETTE ZURÜCKGIBT ───────────────────────
 * Weil das Preset (§2.8) `mark.examples: string[]` trägt und Produkt 03 sie
 * ohne Vue lesen können muss. Die Bühne zeigt DIESELBE Zeichenkette — wäre
 * das Markup dort von Hand nachgebaut, hätte die Marke zwei Setzungen: eine
 * zum Ansehen und eine zum Mitnehmen.
 *
 * ── DIE EINZIGE FREMDE EINGABE IST DER NAME ───────────────────────────────
 * Farben sind geprüfte Hex-Werte, der Schrift-Stack kommt aus dem Katalog,
 * alle Zahlen sind gerechnet. Der NAME kommt vom Menschen und geht deshalb
 * durch `escapeXml()` — er landet ausschliesslich im TEXT-Inhalt, nie in
 * einem Attribut. Die Gegenprobe steht im Test (`<script>` im Markennamen).
 *
 * ── DER SCHUTZRAUM WIRD GEZEICHNET, NICHT BESCHRIEBEN ─────────────────────
 * Qualitätsmerkmal der Session `j.examples`: „the clear space is drawn, not
 * described". Der Rahmen ist die Fläche, die frei bleiben MUSS — Kante =
 * Versalhöhe (`BRAND_MARK_CLEAR_SPACE_CAP_FACTOR` · Schriftgrad) beim Wort,
 * ein Viertel der Kachel beim Monogramm. Er ist eine HILFSLINIE und deshalb
 * abschaltbar: das Preset trägt die Setzung ohne ihn.
 *
 * PUR: kein Vue, kein i18n, kein H3, kein Appwrite, keine Layer-Importe.
 */

// ── Die Geometrie ──────────────────────────────────────────────────────────

/** Die Bühne der Wortmarke — 10:3, das übliche Seitenverhältnis einer Zeile. */
export const BRAND_MARK_WORD_WIDTH = 400
export const BRAND_MARK_WORD_HEIGHT = 120
/** Der Schriftgrad der gesetzten Wortmarke auf dieser Bühne. */
export const BRAND_MARK_WORD_FONT_SIZE = 34

/** Die Bühne des Monogramms und die Kante seiner Kachel. */
export const BRAND_MARK_MONOGRAM_WIDTH = 160
export const BRAND_MARK_MONOGRAM_HEIGHT = 120
export const BRAND_MARK_MONOGRAM_TILE = 64
/** Der Schriftgrad im Monogramm — gut die Hälfte der Kachel. */
export const BRAND_MARK_MONOGRAM_FONT_SIZE = 34

/**
 * DIE VERSALHÖHE ZU EINEM SCHRIFTGRAD, auf ganze Einheiten gerundet.
 *
 * Eine echte Versalhöhe steht in der Schriftdatei und ist je Familie anders;
 * hier wird sie GESCHÄTZT, und das ist Absicht: der Schutzraum ist eine
 * Faustregel für Menschen, keine Messung. Wer sie exakt haben will, braucht
 * Schrift-Metriken zur Laufzeit — und hätte dafür eine Vorschau, die je nach
 * geladener Schrift springt.
 */
export function brandMarkCapHeight(fontSize: number): number {
  return Math.round(fontSize * BRAND_MARK_CLEAR_SPACE_CAP_FACTOR)
}

export interface BrandMarkSvgOptions {
  /** Die gestrichelte Hilfslinie zeichnen (Bühne: ja, Preset: nein). */
  readonly clearSpace?: boolean
  /** Die Beschriftung für Screenreader — sie steht als `<title>` im SVG. */
  readonly title?: string
}

/**
 * IST DAS EINE SETZUNG AUS DIESER DATEI? (Brand Design D8)
 *
 * Die Setzungen stehen als fertige Zeichenketten im PRESET und werden von der
 * Oberfläche mit `v-html` gesetzt — im Kapitel 10, im Ergebnis-Board und, das
 * ist der Punkt, aus einem EINGEFRORENEN Snapshot. Was aus einer Ablage kommt,
 * wird geprüft, bevor es als Markup gilt: eine Zeichenkette, die nicht mit
 * `<svg` beginnt oder ein `<script` enthält, ist keine Setzung dieser Datei
 * und wird nicht gerendert.
 *
 * Sie ersetzt die Escapes NICHT (der Markenname bleibt escaped, s. u.): sie ist
 * die zweite Masche für den Fall, dass jemals etwas anderes als diese Datei in
 * das Feld schreibt.
 */
export function isBrandMarkSvg(value: string): boolean {
  const text = value.trim()
  return text.startsWith('<svg') && text.endsWith('</svg>') && !/<\s*script/i.test(text)
}

/** Text für den XML-Inhalt entschärfen (s. Kopf: die einzige fremde Eingabe). */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Eine Zahl fürs Attribut: höchstens zwei Nachkommastellen, kein `-0`, keine
 * Exponentialschreibweise. Ohne das stünde in einem Attribut je nach
 * Rechnung `24.000000000000004` — und der Golden-Test wäre eine Lotterie.
 */
function num(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return String(rounded === 0 ? 0 : rounded)
}

function variantOf(spec: BrandMarkSpec, variantId: string): BrandMarkVariantColors {
  return spec.variants.find(variant => variant.id === variantId) ?? spec.variants[0]!
}

/**
 * Der Text der Wortmarke, wie er gesetzt wird — die Versalien-Regel aus
 * `i.rules` gilt für Überschriften UND die Wortmarke (D4), also auch hier.
 */
function wordmarkText(spec: BrandMarkSpec): string {
  return spec.headingUppercase ? spec.wordmark.toUpperCase() : spec.wordmark
}

/**
 * DER KOPF — mit Beschriftung `role="img"`, ohne sie GAR KEINE Rolle.
 *
 * Ein `role="img"` mit leerem `aria-label` ist für einen Screenreader ein
 * Bild ohne Namen, also genau die Ansage, die niemandem hilft. Die Setzungen
 * im Preset tragen deshalb keine Rolle (ihr Leser beschriftet sie selbst),
 * die auf der Bühne bekommen eine echte.
 */
function open(width: number, height: number, title: string | undefined): string[] {
  const label = title?.trim() ?? ''
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"`
  if (!label) return [`${head}>`]
  return [`${head} role="img" aria-label="${escapeXml(label)}">`, `  <title>${escapeXml(label)}</title>`]
}

function clearSpaceRect(x: number, y: number, width: number, height: number, color: string): string {
  return `  <rect x="${num(x)}" y="${num(y)}" width="${num(width)}" height="${num(height)}"`
    + ` fill="none" stroke="${color}" stroke-width="1" stroke-dasharray="4 4" />`
}

/**
 * DIE WORTMARKE — der Name, mittig, in der Überschriften-Schrift der Marke.
 *
 * `dominant-baseline` steht bewusst NICHT im Markup: Browser und
 * Rasterer legen es unterschiedlich aus, und ein Zeichen, dessen Grundlinie
 * vom Betrachter abhängt, ist keine Setzung. Stattdessen wird die Grundlinie
 * GERECHNET — Mitte plus ein Drittel der Versalhöhe.
 */
export function brandMarkWordmarkSvg(
  spec: BrandMarkSpec,
  variantId: string,
  options: BrandMarkSvgOptions = {},
): string {
  const colors = variantOf(spec, variantId)
  const cap = brandMarkCapHeight(BRAND_MARK_WORD_FONT_SIZE)
  const baseline = BRAND_MARK_WORD_HEIGHT / 2 + cap / 3
  const lines = open(BRAND_MARK_WORD_WIDTH, BRAND_MARK_WORD_HEIGHT, options.title)

  lines.push(
    `  <rect x="0" y="0" width="${BRAND_MARK_WORD_WIDTH}" height="${BRAND_MARK_WORD_HEIGHT}"`
    + ` fill="${colors.ground}" />`,
  )
  if (options.clearSpace) {
    lines.push(clearSpaceRect(
      cap, cap,
      BRAND_MARK_WORD_WIDTH - 2 * cap, BRAND_MARK_WORD_HEIGHT - 2 * cap,
      colors.frame,
    ))
  }
  lines.push(
    `  <text x="${num(BRAND_MARK_WORD_WIDTH / 2)}" y="${num(baseline)}" text-anchor="middle"`
    + ` fill="${colors.ink}" font-family="${escapeXml(spec.headingStack)}"`
    + ` font-size="${BRAND_MARK_WORD_FONT_SIZE}" font-weight="${spec.headingWeight}"`
    + ` letter-spacing="${num(spec.headingTracking)}">${escapeXml(wordmarkText(spec))}</text>`,
  )
  lines.push('</svg>')
  return lines.join('\n')
}

/**
 * DAS MONOGRAMM — der Anfangsbuchstabe in einer Kachel, deren Ecken die
 * Formsprache der DNA tragen (`radiusPercent`).
 *
 * Die Kachel trägt die TINTE und der Buchstabe den GRUND: ein Monogramm ist
 * eine Fläche, kein Wort. In der Variante `icon` ist der Grund schon die
 * Marken-Fläche — dann steht die Kachel in der Tinte darauf, und der
 * Buchstabe bleibt hell. Das ist dieselbe Rechnung, kein Sonderfall.
 */
export function brandMarkMonogramSvg(
  spec: BrandMarkSpec,
  variantId: string,
  options: BrandMarkSvgOptions = {},
): string {
  const colors = variantOf(spec, variantId)
  const tile = BRAND_MARK_MONOGRAM_TILE
  const tileX = (BRAND_MARK_MONOGRAM_WIDTH - tile) / 2
  const tileY = (BRAND_MARK_MONOGRAM_HEIGHT - tile) / 2
  const radius = (tile * spec.radiusPercent) / 100
  const cap = brandMarkCapHeight(BRAND_MARK_MONOGRAM_FONT_SIZE)
  const baseline = BRAND_MARK_MONOGRAM_HEIGHT / 2 + cap / 3
  /* Der Schutzraum des Monogramms ist ein Viertel seiner Kante — dieselbe
   * Faustregel wie „Höhe des Versalbuchstabens", nur auf eine Fläche statt
   * auf eine Zeile angewandt. */
  const guard = tile / 4
  const lines = open(BRAND_MARK_MONOGRAM_WIDTH, BRAND_MARK_MONOGRAM_HEIGHT, options.title)

  lines.push(
    `  <rect x="0" y="0" width="${BRAND_MARK_MONOGRAM_WIDTH}"`
    + ` height="${BRAND_MARK_MONOGRAM_HEIGHT}" fill="${colors.ground}" />`,
  )
  lines.push(
    `  <rect x="${num(tileX)}" y="${num(tileY)}" width="${tile}" height="${tile}"`
    + ` rx="${num(radius)}" fill="${colors.ink}" />`,
  )
  lines.push(
    `  <text x="${num(BRAND_MARK_MONOGRAM_WIDTH / 2)}" y="${num(baseline)}" text-anchor="middle"`
    + ` fill="${colors.ground}" font-family="${escapeXml(spec.headingStack)}"`
    + ` font-size="${BRAND_MARK_MONOGRAM_FONT_SIZE}" font-weight="${spec.headingWeight}"`
    + `>${escapeXml(spec.initial)}</text>`,
  )
  if (options.clearSpace) {
    lines.push(clearSpaceRect(
      tileX - guard, tileY - guard, tile + 2 * guard, tile + 2 * guard, colors.frame,
    ))
  }
  lines.push('</svg>')
  return lines.join('\n')
}

/** Die zwei Setzungen einer Variante — dieselbe Reihenfolge wie im Kapitel. */
export function brandMarkSettingSvg(
  spec: BrandMarkSpec,
  settingId: string,
  variantId: string,
  options: BrandMarkSvgOptions = {},
): string {
  return settingId === 'monogram'
    ? brandMarkMonogramSvg(spec, variantId, options)
    : brandMarkWordmarkSvg(spec, variantId, options)
}

/**
 * ALLE ACHT SETZUNGEN FÜRS PRESET — je Variante die Wortmarke und das
 * Monogramm, in Katalog-Reihenfolge der Varianten.
 *
 * OHNE Schutzraum-Linie und ohne `<title>`: das Preset trägt die SETZUNG, und
 * eine Hilfslinie im ausgelieferten SVG wäre eine Linie, die irgendwann auf
 * einer Tüte steht.
 */
export function brandMarkExampleSvgs(spec: BrandMarkSpec): string[] {
  const svgs: string[] = []
  for (const variant of spec.variants) {
    svgs.push(brandMarkWordmarkSvg(spec, variant.id))
    svgs.push(brandMarkMonogramSvg(spec, variant.id))
  }
  return svgs
}
