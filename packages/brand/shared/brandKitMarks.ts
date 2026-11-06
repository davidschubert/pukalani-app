import { BRAND_MARK_VARIANTS, BRAND_MARK_SETTINGS } from './brandDesignVocab'
import { escapeXml, isBrandMarkSvg } from './brandMarkSvg'
import type { BrandDesignSnapshotPreset } from './types/brand'
import type { BrandKitMarkFile } from './types/brandKit'

/**
 * DIE ZEICHEN-DATEIEN DES KITS — `marks/<slug>-<setzung>-<variante>.svg`
 * (Konzept docs/plans/BRAND-BOOK-KIT.md §2.6/§2.12, Paket K6).
 *
 * ── SIE WERDEN NICHT GESETZT, SIE WERDEN BENANNT ─────────────────────────
 * Die acht Setzungen stehen FERTIG im Preset (`mark.examples`, D5b): dieselbe
 * Zeichenkette, die die Bühne, das Ergebnis-Board und Kapitel 10 rendern. Hier
 * entsteht KEINE zweite Ableitung — es wäre die Sorte Zwilling, die beim ersten
 * Katalog-Wechsel auseinanderläuft (die Bühne zeigte dann ein anderes Zeichen
 * als das Bündel). Diese Datei tut genau zwei Dinge: sie gibt jeder Setzung
 * ihren DATEINAMEN und ihre BESCHRIFTUNG.
 *
 * ── DIE REIHENFOLGE IST DER VERTRAG ──────────────────────────────────────
 * `brandMarkExampleSvgs` läuft die Varianten in Katalog-Reihenfolge ab und
 * setzt je Variante ERST die Wortmarke, DANN das Monogramm. Index `i` heißt
 * deshalb: Variante `BRAND_MARK_VARIANTS[i / 2]`, Setzung `i % 2`. Steht dort
 * etwas anderes als acht Setzungen (ein alter Snapshot, ein halber Stand),
 * fällt der Rest weg — geraten wird nichts.
 *
 * ── DER DATEINAME KENNT NUR `[a-z0-9-]` (§2.12 Nr. 4) ────────────────────
 * Slug plus zwei Katalog-Ids. Der Markenname kommt darin NIE vor, und ein
 * Pfad-Trenner kann darin nicht entstehen: `marks/` steht als fester Präfix
 * VOR dem Namen, nicht darin. Die Route sucht den Namen in dieser Liste
 * (Allowlist), sie setzt ihn nie zu einem Pfad zusammen.
 *
 * ── DIE BESCHRIFTUNG IST SPRACHNEUTRAL, UND DAS IST ABSICHT ──────────────
 * `<title>` trägt Markenname plus die zwei Katalog-Ids — wie der Dateiname
 * (§2.17 „Dateinamen und Token-Namen sind sprachneutral"). Eine übersetzte
 * Beschriftung hieße, dass dieselbe Marke zwei verschiedene SVG-Dateien hat,
 * je nachdem, wer sie geladen hat. Der MARKENNAME ist die einzige fremde
 * Eingabe und geht durch `escapeXml` (§2.12 Nr. 5) — er landet nur im
 * Textinhalt von `<title>` und im `aria-label`, beides escaped.
 *
 * ── `j.pick` STEHT NICHT IM PRESET, ALSO STEHT ES HIER NICHT ─────────────
 * Welche der beiden Setzungen die Marke als PRIMÄRE führt, entscheidet der
 * Slot `j.pick`. Das Snapshot-Preset trägt `kind`, `brief` und `examples` —
 * `pick` nicht. `primary` bleibt deshalb im Typ optional und wird hier NICHT
 * gesetzt: ein geratenes „Primär" an einer Datei wäre eine Aussage über eine
 * Entscheidung, die diese Funktion nicht kennt. Wer den Slot in das Preset
 * aufnimmt, füllt das Feld hier — an genau einer Stelle.
 *
 * DIESE DATEI IST PUR: kein Vue, kein H3, kein i18n, kein Appwrite.
 */

/** Was ein Zeichen-Renderer ausser dem Preset braucht. */
export interface BrandKitMarkInput {
  /** Der Markenname, unverändert — er landet escaped in `<title>`. */
  title: string
  /** Der Dateinamens-Stamm (`brandKitSlug`). */
  slug: string
}

/** Der feste Ordner-Präfix im Bündel und in der Route. */
export const BRAND_KIT_MARKS_PREFIX = 'marks/'

/** Der MIME-Typ jeder Zeichen-Datei. */
export const BRAND_KIT_MARK_MIME = 'image/svg+xml; charset=utf-8'

/**
 * DER TITEL IN DAS FERTIGE SVG EINSETZEN — ohne die Setzung anzufassen.
 *
 * Das Preset trägt die Setzung OHNE `<title>` und ohne Rolle (so gebaut, mit
 * Begründung in `brandMarkSvg.ts`: eine Rolle ohne Namen hilft niemandem). Eine
 * Datei, die jemand herunterlädt, hat aber einen Namen verdient. Eingesetzt
 * wird deshalb hinter der öffnenden Marke — kein Neuaufbau, kein zweiter
 * Renderer.
 */
function withTitle(svg: string, label: string): string {
  const close = svg.indexOf('>')
  if (close < 0) return svg
  const safe = escapeXml(label)
  return `${svg.slice(0, close)} role="img" aria-label="${safe}">\n  <title>${safe}</title>${svg.slice(close + 1)}`
}

/**
 * ALLE ZEICHEN-DATEIEN DIESER MARKE — leer ohne Preset.
 *
 * Leer und nicht „ein Platzhalter": ohne abgenommene Schicht 2 gibt es keine
 * Farbwelt und kein Schriftpaar, und ein Zeichen aus Notfarben wäre eine
 * Marke, die niemand entschieden hat (dieselbe Regel wie in
 * `markExamplesOf`).
 */
export function renderBrandMarkFiles(
  preset: BrandDesignSnapshotPreset | null,
  input: BrandKitMarkInput,
): BrandKitMarkFile[] {
  if (!preset) return []
  const slug = input.slug
  const files: BrandKitMarkFile[] = []
  for (const [index, svg] of preset.mark.examples.entries()) {
    const variant = BRAND_MARK_VARIANTS[Math.floor(index / BRAND_MARK_SETTINGS.length)]
    const setting = BRAND_MARK_SETTINGS[index % BRAND_MARK_SETTINGS.length]
    // Mehr Beispiele als der Katalog Varianten kennt: der Rest fällt weg.
    if (!variant || !setting) break
    // Was nicht aus `brandMarkSvg.ts` stammt, wird nicht ausgeliefert (D8).
    if (typeof svg !== 'string' || !isBrandMarkSvg(svg)) continue
    const filename = `${slug}-${setting.id}-${variant.id}.svg`
    files.push({
      id: `${BRAND_KIT_MARKS_PREFIX}${filename}`,
      filename,
      setting: setting.id,
      variant: variant.id,
      svg: withTitle(svg.trim(), `${input.title.trim() || 'Brand'} — ${setting.id} ${variant.id}`),
    })
  }
  return files
}

/**
 * WIE VIELE ZEICHEN-DATEIEN HAT DIESE MARKE? — ohne sie zu bauen.
 *
 * Die README nennt den ORDNER mit einer Zahl, nicht acht Dateinamen; sie
 * braucht die SVGs also nicht. Die Zahl steht hier und nicht in der Registry,
 * damit es genau EINE Stelle gibt, die weiß, wie viele Setzungen eine Marke
 * hat (`brandKitFiles.ts` importiert sie — nie umgekehrt: diese Datei kennt
 * die Registry nicht, sonst stünden die beiden im Kreis).
 */
export function brandKitMarkCount(preset: BrandDesignSnapshotPreset | null): number {
  if (!preset) return 0
  const max = BRAND_MARK_VARIANTS.length * BRAND_MARK_SETTINGS.length
  return preset.mark.examples
    .slice(0, max)
    .filter(svg => typeof svg === 'string' && isBrandMarkSvg(svg))
    .length
}

/**
 * EINE ZEICHEN-DATEI ÜBER IHREN NAMEN — `undefined` heißt 404.
 *
 * Der Router-Parameter wird GESUCHT, nie zusammengesetzt (§2.12 Nr. 4): damit
 * gibt es keinen Weg über `..`, über einen zweiten Schrägstrich oder über
 * einen erfundenen Slug.
 */
export function brandKitMarkFile(
  files: readonly BrandKitMarkFile[],
  name: string,
): BrandKitMarkFile | undefined {
  return files.find(file => file.filename === name)
}

/**
 * DER LESBARE NAME — `Kailua Coffee Co. wordmark primary 2026-09-09.svg`.
 *
 * Dieselbe Form wie bei den Registry-Dateien (`brandKitReadableName`): der
 * volle Markenname reist prozentkodiert in `filename*`, der ASCII-Rückfall ist
 * der Slug-Name. Er steht hier und nicht dort, weil eine Zeichen-Datei kein
 * Registry-Eintrag ist — sie hat keinen festen Dateinamen, sondern einen je
 * Setzung gerechneten.
 */
export function brandKitMarkReadableName(
  file: BrandKitMarkFile,
  title: string,
  stamp: string,
): string {
  const clean = title.replace(/[\r\n"\\]/g, ' ').trim().slice(0, 60) || 'Brand'
  return `${clean} ${file.setting} ${file.variant}${stamp ? ` ${stamp}` : ''}.svg`
}
