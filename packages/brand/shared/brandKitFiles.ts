/**
 * DIE DATEI-REGISTRY DES KITS — EINE geschlossene Liste, EIN Erzeuger je
 * Datei (Konzept docs/plans/BRAND-BOOK-KIT.md §2.6/§2.9/§2.12, Paket K2).
 *
 * ── SIE IST DIE ALLOWLIST DER ROUTE ──────────────────────────────────────
 * §2.12 Nr. 4: „`:file` gegen eine feste Liste, kein Pfad." Der Router-Parameter
 * wird NIE zu einem Dateinamen zusammengesetzt und NIE zu einem Pfad — er wird
 * in dieser Liste GESUCHT. Was hier nicht steht, ist 404. Damit gibt es keinen
 * Weg, über `..` oder einen Bindestrich irgendwo hinzukommen.
 *
 * ── SIE IST DER ANDOCKPUNKT DER SPÄTEREN PAKETE ──────────────────────────
 * `brand.md`, `brand.json` und `README.md` standen seit K2 in dieser Liste —
 * mit `available: false` und Grund `not_built_yet`, damit das Manifest sagt,
 * was es geben WIRD, statt so zu tun, als bestünde das Kit aus drei Dateien.
 * K3 hat genau das eingelöst: DREI `null` sind zu Funktionen geworden, und
 * Route, Manifest und Bündel zogen ohne eine weitere Änderung nach. Wer eine
 * SIEBTE Datei mit festem Namen baut, hängt seinen Erzeuger in dieselbe Karte,
 * statt eine zweite Liste danebenzustellen. `marks/*.svg` ist die begründete
 * Ausnahme (s. u.) und wohnt in `brandKitMarks.ts`; das Bündel (K6) liest
 * beide und packt sie — es steht in keiner der beiden Listen, weil es keine
 * Datei ist, sondern ihre Summe.
 *
 * ── DER DATEINAME KOMMT AUS DEM SLUG, NIE AUS DER EINGABE ────────────────
 * Der Markenname ist Nutzertext. Für den Download wird daraus ein Slug aus
 * genau `[a-z0-9-]` gebaut (§2.12 Nr. 4) — der Rest fällt weg, nicht nur die
 * gefährlichen Zeichen. Der volle Name reist trotzdem mit, im `filename*`-Teil
 * nach RFC 5987, damit „Kailua Coffee Co." im Download-Ordner lesbar bleibt.
 *
 * DIESE DATEI IST PUR: kein H3, kein Appwrite, kein i18n-Modul.
 */

import { buildBrandContextJson, renderBrandContextJson, renderBrandContextMarkdown } from './brandContext'
import type { BrandFoundationView } from './brandFoundation'
import { renderBrandLicenses } from './brandKitLicenses'
import { brandKitMarkCount } from './brandKitMarks'
import { renderBrandKitReadme } from './brandKitReadme'
import { buildBrandTokens, renderBrandTokensJson } from './brandTokens'
import { renderBrandTokensCss } from './brandTokensCss'
import type {
  BrandKitFile,
  BrandKitFileErrorCode,
  BrandKitFileId,
  BrandKitFileReason,
  BrandKitReadmeFile,
  BrandKitReadmeManifest,
} from './types/brandKit'
import type { BrandDesignSnapshotPreset } from './types/brand'

/**
 * DIE SIEBEN DATEIEN DES KITS (§2.6). `marks/*.svg` fehlt hier bewusst: es ist
 * KEINE Datei, sondern eine je Setzung wechselnde Menge, und sie bekommt in K6
 * ihre eigene Route — eine Registry mit einem Platzhalter-Eintrag „mehrere
 * Dateien" wäre eine Liste, die für einen ihrer Einträge nicht gilt.
 */
export const BRAND_KIT_FILES: readonly BrandKitFile[] = [
  { id: 'tokens.json', filename: 'tokens.json', mime: 'application/json; charset=utf-8', needsDesign: true },
  { id: 'tokens.css', filename: 'tokens.css', mime: 'text/css; charset=utf-8', needsDesign: true },
  { id: 'licenses.md', filename: 'LICENSES.md', mime: 'text/markdown; charset=utf-8', needsDesign: true },
  { id: 'brand.md', filename: 'brand.md', mime: 'text/markdown; charset=utf-8', needsDesign: false },
  { id: 'brand.json', filename: 'brand.json', mime: 'application/json; charset=utf-8', needsDesign: false },
  { id: 'readme.md', filename: 'README.md', mime: 'text/markdown; charset=utf-8', needsDesign: false },
]

const BY_ID = new Map(BRAND_KIT_FILES.map(file => [file.id, file]))

/** `undefined` = kein Eintrag dieser Id. Die Route macht daraus 404. */
export function brandKitFile(id: string): BrandKitFile | undefined {
  return BY_ID.get(id as BrandKitFileId)
}

export function isBrandKitFileId(value: unknown): value is BrandKitFileId {
  return typeof value === 'string' && BY_ID.has(value as BrandKitFileId)
}

/**
 * Was ein Erzeuger braucht.
 *
 * `view` ist seit K3 dabei und PFLICHT: der Brand Context liest die FERTIGE
 * Leseansicht und nie rohe Slots — die Reise-Regel ist damit die Export-Regel
 * (§2.12 Nr. 1), und zwar für jeden künftigen Erzeuger, ohne dass er daran
 * denken muss. Eine Marke ohne einen einzigen bestätigten Wert hat eine
 * Ansicht ohne Kapitel (`{ chapters: [] }`), nicht `undefined`.
 */
export interface BrandKitBuildInput {
  /** `null`, solange Schicht 2 nicht steht. */
  preset: BrandDesignSnapshotPreset | null
  /** Die Leseansicht des Fundaments — dieselbe, die das Book rendert. */
  view: BrandFoundationView
  title: string
  /** ISO-Stempel des jüngsten beteiligten Kapitels; '' ist erlaubt. */
  stand: string
  /** Inhaltssprache der Marke. */
  locale: string
}

/** Der Inhalt einer Datei als Text — `null` heißt „diese Datei gibt es hier nicht". */
export type BrandKitBuilder = (input: BrandKitBuildInput) => string | null

/**
 * ERZEUGER JE DATEI — K2 füllte die drei aus dem Preset, K3 die drei aus der
 * Leseansicht. Seither ist keine Zeile mehr `null`.
 *
 * `null` bleibt trotzdem im Typ: es ist die EHRLICHE Auskunft „noch nicht
 * gebaut" und keine Lücke — das Manifest liest genau dieses `null` und
 * schreibt `reason: 'not_built_yet'`. Wer eine achte Datei anlegt, darf sie
 * eintragen, bevor er sie bauen kann.
 */
export const BRAND_KIT_BUILDERS: Readonly<Record<BrandKitFileId, BrandKitBuilder | null>> = {
  'tokens.json': ({ preset, title, stand, locale }) =>
    (preset ? renderBrandTokensJson(buildBrandTokens(preset, { title, stand, locale })) : null),
  'tokens.css': ({ preset, title, stand, locale }) =>
    (preset ? renderBrandTokensCss(buildBrandTokens(preset, { title, stand, locale })) : null),
  'licenses.md': ({ preset, locale }) => renderBrandLicenses(preset, locale),
  /*
   * K3 — DER BRAND CONTEXT. Beide Dateien fahren DENSELBEN Renderer wie das
   * Book (§2.6: „ein Renderer für Book und Kit"): sie bekommen die fertige
   * `view` und sehen keinen rohen Slot. `needsDesign: false` — ohne Preset
   * fehlt in `brand.md` der visuelle Abschnitt und in `brand.json` steht
   * `design: null`; alles andere steht.
   */
  'brand.md': ({ view, preset, title, stand, locale }) =>
    renderBrandContextMarkdown(view, { title, stand, locale }, preset),
  'brand.json': ({ view, preset, title, stand, locale }) =>
    renderBrandContextJson(buildBrandContextJson(view, { title, stand, locale }, preset)),
  'readme.md': input => renderBrandKitReadme(brandKitReadmeManifest(input), input.locale),
}

/**
 * DAS MANIFEST FÜR DIE README — dieselbe Verfügbarkeits-Rechnung wie die Route,
 * nur ohne die Dateien zu BAUEN.
 *
 * Genau das ist der Punkt: `brandKitManifestFiles` (server) rechnet die GRÖSSE
 * und baut dafür jede Datei — auch die README. Riefe die README dieselbe
 * Funktion, bauten sich die beiden gegenseitig. Hier steht deshalb die
 * Verfügbarkeit ohne Inhalt; die Dateinamen sind die im BÜNDEL (`tokens.json`),
 * nicht die des Downloads (`kailua-coffee-co-tokens-2026-09-09.json`) — im Zip
 * heisst eine Datei, wie sie heisst.
 */
export function brandKitReadmeManifest(input: BrandKitBuildInput): BrandKitReadmeManifest {
  const files: BrandKitReadmeFile[] = BRAND_KIT_FILES.map((file) => {
    const availability = brandKitAvailability(file, !!input.preset)
    return {
      id: file.id,
      filename: file.filename,
      available: availability.available,
      ...(availability.available ? {} : { reason: availability.reason }),
    }
  })
  return {
    title: input.title,
    stand: input.stand,
    files,
    // K6: der Ordner `marks/` steht als ZAHL daneben — er ist keine Datei der
    // Registry und trotzdem Teil dessen, was im Bündel liegt.
    marks: brandKitMarkCount(input.preset),
  }
}

/**
 * DER GRUND ALS CODE — sonst kommt er nie an (K6, live erwischt).
 *
 * Der zentrale Handler (core/server/error.ts) hebt aus `error.data` GENAU
 * EINEN Schlüssel ins Envelope: `code`. Ein zweites Feld `reason` daneben
 * bleibt draußen — die Routen setzten es seit K2, und der Client sah nie den
 * Unterschied zwischen „Schicht 2 fehlt" und „der Erzeuger schweigt"
 * (dieselbe tote Hälfte wie `last_admin` vor dem 2026-07-29, CLAUDE.md).
 * Deshalb wandert der Grund IN den Code; die Familie bleibt am Präfix
 * erkennbar.
 */
export function brandKitFileErrorCode(reason: BrandKitFileReason): BrandKitFileErrorCode {
  return reason === 'design_missing' ? 'kit_file_design_missing' : 'kit_file_not_built_yet'
}

/** Ist diese Datei heute abrufbar — und wenn nein, warum nicht? */
export function brandKitAvailability(
  file: BrandKitFile,
  hasPreset: boolean,
): { available: true } | { available: false, reason: 'design_missing' | 'not_built_yet' } {
  if (!BRAND_KIT_BUILDERS[file.id]) return { available: false, reason: 'not_built_yet' }
  if (file.needsDesign && !hasPreset) return { available: false, reason: 'design_missing' }
  return { available: true }
}

/** Der maximale Slug — lang genug für einen Markennamen, kurz genug für jedes Dateisystem. */
export const BRAND_KIT_SLUG_MAX = 40

/**
 * MARKENNAME → SLUG, Allowlist `[a-z0-9-]` (§2.12 Nr. 4).
 *
 * Umlaute werden UMSCHRIEBEN und nicht weggeworfen: „Grünberg" soll
 * `gruenberg` heißen und nicht `grnberg`. Alles andere fällt weg; bleibt
 * nichts übrig (eine rein chinesische Marke), heißt der Stamm `brand` —
 * ein leerer Dateiname wäre ein Download namens `-tokens.json`.
 */
export function brandKitSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, BRAND_KIT_SLUG_MAX)
    .replace(/-+$/g, '')
  return slug || 'brand'
}

/**
 * DER STAND ALS DATUM — `2026-09-09` aus dem ISO-Stempel, '' wenn keiner da
 * ist. Er steht im Dateinamen, damit zwei Downloads derselben Marke im
 * Ordner unterscheidbar bleiben; ohne Stand fällt der Teil weg, statt ein
 * „heute" zu behaupten.
 */
export function brandKitStandStamp(stand: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(stand.trim())
  return match?.[1] ?? ''
}

/**
 * DER DATEINAME DES DOWNLOADS — `kailua-coffee-tokens-2026-09-09.json`.
 *
 * Gebaut aus Slug, Datei-Stamm und Stand; die Endung kommt aus der REGISTRY
 * und nie aus der Eingabe.
 */
export function brandKitDownloadName(file: BrandKitFile, slug: string, stand: string): string {
  const dot = file.filename.lastIndexOf('.')
  const stem = (dot > 0 ? file.filename.slice(0, dot) : file.filename).toLowerCase()
  const ext = dot > 0 ? file.filename.slice(dot + 1).toLowerCase() : ''
  const stamp = brandKitStandStamp(stand)
  const parts = [slug, stem, ...(stamp ? [stamp] : [])]
  return ext ? `${parts.join('-')}.${ext}` : parts.join('-')
}

/**
 * DER LESBARE NAME — `Kailua Coffee Co. tokens 2026-09-09.json`.
 *
 * Er ist das, was ein Mensch im Download-Ordner sieht, wenn sein Browser
 * `filename*` liest. Der Markenname steht darin UNVERÄNDERT (er ist eine
 * Angabe über die Marke, keine Eingabe in einen Pfad) — sicher ist das, weil
 * er prozentkodiert reist und der ASCII-Rückfall daneben aus dem Slug kommt.
 */
export function brandKitReadableName(file: BrandKitFile, title: string, stand: string): string {
  const dot = file.filename.lastIndexOf('.')
  const stem = dot > 0 ? file.filename.slice(0, dot) : file.filename
  const ext = dot > 0 ? file.filename.slice(dot) : ''
  const stamp = brandKitStandStamp(stand)
  return `${brandKitReadableTitle(title)} ${stem}${stamp ? ` ${stamp}` : ''}${ext}`
}

/**
 * DER MARKENNAME, WIE ER IN EINEN KOPF DARF.
 *
 * Zeilenumbrüche und Anführungszeichen haben in einem Kopf nichts verloren —
 * die Kodierung erledigt das, der Schnitt hält den Namen zusätzlich kurz. Er
 * steht als eigene Funktion da, seit die Zeichen-Dateien (K6) ihren lesbaren
 * Namen selbst bauen: zwei Kopien dieser Zeile wären zwei Stellen, an denen
 * jemand später eine Escape-Regel vergisst.
 */
export function brandKitReadableTitle(title: string): string {
  return title.replace(/[\r\n"\\]/g, ' ').trim().slice(0, 60) || 'Brand'
}

/**
 * DER NAME DES BÜNDELS — `kailua-coffee-co-brand-kit-2026-09-09.zip` (§2.6).
 *
 * Er trägt den Stand wie jeder Download, damit zwei Bündel derselben Marke im
 * Ordner unterscheidbar bleiben. Ohne Stand fällt der Teil weg.
 */
export function brandKitBundleName(slug: string, stand: string): string {
  const stamp = brandKitStandStamp(stand)
  return `${[slug, 'brand-kit', ...(stamp ? [stamp] : [])].join('-')}.zip`
}

/** Der lesbare Name des Bündels — `Kailua Coffee Co. brand kit 2026-09-09.zip`. */
export function brandKitBundleReadableName(title: string, stand: string): string {
  const stamp = brandKitStandStamp(stand)
  return `${brandKitReadableTitle(title)} brand kit${stamp ? ` ${stamp}` : ''}.zip`
}

/**
 * `Content-Disposition` mit ASCII-Rückfall UND `filename*` nach RFC 5987
 * (§2.12 Nr. 4).
 *
 * Beide Namen stehen da, weil alte Werkzeuge nur den ersten lesen und neue
 * den zweiten bevorzugen. Der ASCII-Teil ist schon der Slug-Name (er kann
 * keine Anführungszeichen und keine Zeilenumbrüche enthalten); der zweite
 * trägt den vollen, lesbaren Namen prozentkodiert.
 */
export function brandKitContentDisposition(asciiName: string, readableName: string): string {
  const encoded = encodeURIComponent(readableName).replace(/['()*]/g, char =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`
}
