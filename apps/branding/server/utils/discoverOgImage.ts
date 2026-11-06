import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BRAND_PALETTES, type BrandGradient } from '../../../../packages/brand/shared/brandPalette'
import {
  BRAND_CARD_HEIGHT,
  BRAND_CARD_LAYOUT,
  BRAND_CARD_WIDTH,
  type BrandCardFont,
  brandMarkKey,
  layoutBrandCardTitle,
  sanitizeBrandCardText,
} from '../../../../packages/themes/shared/brandCard'
import { BRAND_CARD_FONT } from '../../../../packages/themes/shared/brandCardFont.gen'
import { brandInkColor } from '../../../../packages/themes/shared/brandMark'
import { encodePngRgb } from '../../../../packages/themes/shared/pngEncode'
import {
  createSurface,
  drawText,
  fillRect,
  fontPixels,
  GlyphCache,
  type Rgb,
  toRgb,
} from '../../../../packages/themes/shared/brandRaster'

/**
 * DAS VORSCHAUBILD EINER ANATOMIE — `/og/discover/<slug>.png`, 1200×630
 * (Discover-Paket D4, Plan docs/plans/DISCOVER-BRANDS.md §4.2).
 *
 * ── WARUM DIESE DATEI IN DER APP LIEGT (CONCEPT.md A14) ──────────────────
 * Der Rasterizer wohnt in `packages/themes` (rein visuell), die Farbwelt und
 * die Veröffentlichung in `packages/brand` (Produkt). Ein Produkt-Layer darf
 * `themes` nicht importieren — die APP darf beide kennen und genau das ist ihre
 * Aufgabe: komponieren. Vorbild ist
 * `apps/platform/server/utils/brandImageStore.ts`, das dasselbe für die
 * Community-Karte tut.
 *
 * ── PNG, NICHT SVG ──────────────────────────────────────────────────────
 * Facebook, WhatsApp und LinkedIn zeigen ein SVG als og:image gar nicht
 * (CLAUDE.md). Gerastert wird OHNE Renderer im Betrieb: Chrome hat die Zeichen
 * EINMAL gebacken (`packages/themes/scripts/generate-brand-card-font.mjs` →
 * `brandCardFont.gen.ts`), hier werden sie nur zusammengesetzt. Keine neue
 * Abhängigkeit, kein natives Binary im Deploy.
 *
 * ── WAS DRAUF IST, UND WAS BEWUSST NICHT ────────────────────────────────
 * Die FARBWELT der Marke als Verlauf (das ist ihr Erkennungszeichen in der
 * Galerie — dieselben zwölf Dreiklänge, die auch die Kachel trägt), ihre
 * Wortmarke gross, darunter die Herkunftszeile. NICHT drauf: der Brand Score
 * (Zahlen veralten im Cache der Vorschau-Dienste — Wochen), der Purpose-Satz
 * (er ist Kundentext und würde auf 1200 px entweder gekappt oder winzig) und
 * jede Form von Pukalani-Bildsprache ausser der kleinen Zeile: das Bild soll
 * nach der MARKE aussehen, nicht nach uns.
 */

/**
 * Gestaltungs-Stand. Er fliesst in den Ablage-Schlüssel ein, NICHT in die URL:
 * die Adresse `/og/discover/<slug>.png` ist stabil (sie steht im Kopf einer
 * indexierbaren Seite und soll dort nicht wandern), also holen Vorschau-Dienste
 * bei einer Umgestaltung kein neues Bild von selbst. Die Zahl sorgt dafür, dass
 * WIR nach einer Umgestaltung nicht die alten Dateien von der Platte servieren.
 */
const DISCOVER_OG_VERSION = 1

export const DISCOVER_OG_WIDTH = BRAND_CARD_WIDTH
export const DISCOVER_OG_HEIGHT = BRAND_CARD_HEIGHT

/**
 * Die Farbwelt für eine unbekannte oder fehlende Id — ein warmes Neutralgrau
 * im Geist des Katalogs (hell → mittel → tief, ähnliche Helligkeitsbänder).
 *
 * Kein Rückfall auf „die erste Welt der Liste": das gäbe einer Bestandszeile
 * ohne `paletteId` still das Aussehen von „Brotbraun" und damit eine Farbe, die
 * ihr niemand zugewiesen hat.
 */
export const DISCOVER_OG_FALLBACK_GRADIENT: BrandGradient = ['#e7e5e1', '#8e8a84', '#2b2926']

/** Die Herkunftszeile unter dem Strich. NUR Zeichen, die der Atlas kennt. */
export const DISCOVER_OG_WORDMARK = 'Discover Brands · branding.supply'

/** Der Dreiklang zu einer Farbwelt-Id — unbekannt ⇒ neutraler Rückfall. */
export function discoverOgGradient(paletteId: string | null | undefined): BrandGradient {
  const id = String(paletteId ?? '').trim().toLowerCase()
  const entry = id ? BRAND_PALETTES.find(palette => palette.id === id) : undefined
  return entry ? [...entry.gradient] : [...DISCOVER_OG_FALLBACK_GRADIENT]
}

/**
 * DIE STOPPS DES VERLAUFS — hell oben, tief unten, und die Tiefe ist FRÜH da.
 *
 * `deep` sitzt bewusst schon bei 80 % und nicht erst am unteren Rand: Titel
 * (Grundlinie 424, also 67 %) und Herkunftszeile (552, 88 %) stehen beide im
 * unteren Drittel, und je dunkler es dort ist, desto klarer steht die helle
 * Schrift darauf. Nachgerechnet mit der hellsten Welt des Katalogs (Messing):
 * an der Titel-Grundlinie ergibt das ein Kontrastverhältnis von ~6:1 gegen
 * Weiss, an der Herkunftszeile ~11:1 — beides über der AA-Schwelle, die grosse
 * Schrift nur bei 3:1 verlangt. Mit einem geraden Verlauf über die volle Höhe
 * wären es an derselben Stelle ~4:1 gewesen.
 */
const GRADIENT_MID_STOP = 0.45
const GRADIENT_DEEP_STOP = 0.80

/** Wie stark die rechte Kante nachdunkelt — nur so viel, dass es nicht flach wirkt. */
const HORIZONTAL_DEPTH = 0.10

function mix(from: Rgb, to: Rgb, ratio: number): Rgb {
  const t = ratio <= 0 ? 0 : ratio >= 1 ? 1 : ratio
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ]
}

/**
 * Die Farbe des Verlaufs an der relativen Höhe `t` (0 = oben, 1 = unten) —
 * PURE Rechnung, damit der Kontrast-Beweis sie nachrechnen kann.
 */
export function discoverOgColorAt(gradient: BrandGradient, t: number): Rgb {
  const [light, mid, deep] = gradient.map(toRgb) as [Rgb, Rgb, Rgb]
  const y = t <= 0 ? 0 : t >= 1 ? 1 : t
  if (y <= GRADIENT_MID_STOP) return mix(light, mid, y / GRADIENT_MID_STOP)
  if (y >= GRADIENT_DEEP_STOP) return deep
  return mix(mid, deep, (y - GRADIENT_MID_STOP) / (GRADIENT_DEEP_STOP - GRADIENT_MID_STOP))
}

function rgbToHex(color: Rgb): string {
  const channel = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')
  return `#${channel(color[0])}${channel(color[1])}${channel(color[2])}`
}

/**
 * Den Verlauf in die Fläche schreiben.
 *
 * Bewusst skalar und ohne Hilfsfunktion je Pixel: 756.000 Pixel × ein Array
 * kosteten in der Karte messbar Zuteilung und GC (Kopf von `brandCardPng.ts`).
 * Die Zeilenfarbe steht je Zeile einmal fest, die innere Schleife rechnet nur
 * noch die waagerechte Tiefe.
 */
function paintGradient(
  data: Uint8Array,
  width: number,
  height: number,
  gradient: BrandGradient,
): void {
  for (let y = 0; y < height; y++) {
    const [r, g, b] = discoverOgColorAt(gradient, (y + 0.5) / height)
    for (let x = 0; x < width; x++) {
      const keep = 1 - (x / width) * HORIZONTAL_DEPTH
      const i = (y * width + x) * 3
      data[i] = (r * keep + 0.5) | 0
      data[i + 1] = (g * keep + 0.5) | 0
      data[i + 2] = (b * keep + 0.5) | 0
    }
  }
}

export interface DiscoverOgInput {
  /** Titel der Marke (`brand_publications.title`) — Kundendaten. */
  title: string
  /** Farbwelt-Id der Veröffentlichung; unbekannt ⇒ neutraler Rückfall. */
  paletteId: string
  /** Die kleine Zeile unter dem Strich. Leer ⇒ Strich und Zeile fallen weg. */
  wordmark?: string
}

/**
 * Das Bild als PNG.
 *
 * ── EIN FREMDER TITEL DARF DIE ANTWORT NIE KOSTEN ───────────────────────
 * `sanitizeBrandCardText`/`layoutBrandCardTitle` (themes) werfen Zeichen ohne
 * gebackene Glyphe WEG statt sie durch Kästchen zu ersetzen — ein rein
 * kyrillischer oder japanischer Markenname ergibt damit ein Bild in der
 * Farbwelt ohne Wortmarke. Das ist immer noch eine Vorschau; ein Absturz auf
 * einer öffentlichen, gecachten Route wäre keine.
 *
 * ── DIE TINTE WIRD GERECHNET, NICHT GESETZT ─────────────────────────────
 * Weiss oder Fast-Schwarz entscheidet `brandInkColor()` aus der Helligkeit der
 * Fläche AN DER TITEL-GRUNDLINIE — dieselbe Rechnung wie beim Favicon. Eine
 * fest verdrahtete weisse Schrift wäre auf einer künftigen hellen Farbwelt
 * unlesbar, und niemand merkte es, weil das Bild nur in fremden Chats erscheint.
 */
export async function renderDiscoverOgPng(
  input: DiscoverOgInput,
  font: BrandCardFont = BRAND_CARD_FONT,
): Promise<Buffer> {
  const gradient = discoverOgGradient(input.paletteId)
  const surface = createSurface(DISCOVER_OG_WIDTH, DISCOVER_OG_HEIGHT)
  const cache = new GlyphCache(font, fontPixels(font))
  const { pad, titleBaseline, ruleY, ruleWidth, ruleHeight, wordmarkSize, wordmarkBaseline, wordmarkTracking }
    = BRAND_CARD_LAYOUT

  paintGradient(surface.data, surface.width, surface.height, gradient)

  const ink = toRgb(brandInkColor(rgbToHex(discoverOgColorAt(gradient, titleBaseline / DISCOVER_OG_HEIGHT))))

  const title = layoutBrandCardTitle(input.title, font)
  for (const line of title.lines) {
    drawText(surface, cache, font, line.text, pad, line.baseline, { size: title.size, color: ink })
  }

  /**
   * Der Strich gehört zur Herkunftszeile, nicht zum Titel: ohne sie wäre er
   * eine Linie, die auf nichts zeigt. Deshalb beide zusammen — oder keins
   * (dieselbe Regel wie in `brandCardPng.ts`).
   */
  const wordmark = sanitizeBrandCardText(input.wordmark ?? '', font)
  if (wordmark) {
    fillRect(surface, pad, ruleY, ruleWidth, ruleHeight, ink, 0.55)
    drawText(surface, cache, font, wordmark, pad, wordmarkBaseline, {
      size: wordmarkSize,
      color: ink,
      alpha: 0.78,
      tracking: wordmarkTracking,
    })
  }

  return encodePngRgb(surface.width, surface.height, surface.data)
}

// ── Ablage ─────────────────────────────────────────────────────────────────

/**
 * Verzeichnis der Bilder. `tmpdir()` ist bewusst gewählt (Muster
 * `apps/platform/server/utils/brandImageStore.ts`): Release-Slots wechseln bei
 * jedem Deploy den Pfad von `.output`, ein Cache DARIN wäre nach jedem Deploy
 * leer, und in das Release-Verzeichnis schreiben sollte ein Server-Prozess
 * ohnehin nicht. `/tmp` überlebt Deploys; schlimmster Fall ist ein neu
 * gerechnetes Bild.
 */
const CACHE_DIR = process.env.NUXT_DISCOVER_OG_CACHE_DIR || join(tmpdir(), 'branding-discover-og')

/** Wenige Einträge genügen: Crawler kommen in Wellen pro Marke. */
const MEMORY_LIMIT = 24
const memory = new Map<string, Buffer>()

/**
 * DER ABLAGE-NAME — ein HASH aus Slug und Stand, NIE der Slug selbst.
 *
 * Der Slug ist zwar geprüft (`brandDiscoverOgPath`, dazu die Wache der Route),
 * aber ein Dateiname aus einem Wert, der über die Adresszeile kommt, ist eine
 * Regel, die beim nächsten Umbau kippen kann. Ein Hash kann das nicht: er ist
 * immer 7 Zeichen aus `[0-9a-z]`.
 *
 * Der STAND (`$updatedAt` der Zeile) steckt mit drin, damit ein neuer
 * freigegebener Snapshot ein neues Bild bekommt, ohne dass jemand aufräumen
 * muss.
 */
export function discoverOgCacheKey(slug: string, updatedAt: string): string {
  return brandMarkKey(DISCOVER_OG_VERSION, slug, updatedAt)
}

function remember(name: string, png: Buffer): void {
  if (memory.size >= MEMORY_LIMIT) {
    const oldest = memory.keys().next().value
    if (oldest !== undefined) memory.delete(oldest)
  }
  memory.set(name, png)
}

/**
 * Das Bild zu diesem Ablage-Namen — aus dem Speicher, von Platte, sonst
 * gerechnet. Dieselbe dreistufige Ordnung wie bei der Community-Karte:
 * ein Bild pro Marke und Stand entsteht in der Praxis genau EINMAL.
 */
export async function discoverOgPng(key: string, input: DiscoverOgInput): Promise<Buffer> {
  const hit = memory.get(key)
  if (hit) return hit

  const file = join(CACHE_DIR, `${key}.png`)
  const fromDisk = await readFile(file).catch(() => null)
  if (fromDisk) {
    remember(key, fromDisk)
    return fromDisk
  }

  const png = await renderDiscoverOgPng(input)
  remember(key, png)
  // Schreiben ist Beiwerk: schlägt es fehl (nur-lesbares /tmp, volle Platte),
  // bleibt das Bild im Speicher und die Antwort korrekt.
  await mkdir(CACHE_DIR, { recursive: true })
    .then(() => writeFile(file, png))
    .catch(() => undefined)
  return png
}
