import { BRAND_INSPIRATION_AREAS } from './brandDesignVocab'
import type { BrandReadingEntry } from './brandReading'
import { formatBrandSlotStructured } from './brandSlotFormat'

/**
 * DIE VORBILDER — die REGELN, pur (Konzept docs/archiv/BRAND-DESIGN.md §2.2
 * Schritt 2, Paket D2a).
 *
 * ── WARUM DIESE DATEI NEBEN `brandDesignVocab.ts` STEHT ───────────────────
 * Das Vokabular sagt, WELCHE Bereiche es gibt (`BRAND_INSPIRATION_AREAS`) —
 * eine Liste von Begriffen, die auch das Dokument und die Lesung (D2b) lesen.
 * Hier stehen die GRENZEN eines Uploads: wie viele, wie gross, welches Format,
 * wie lang die Notiz und wie aus alldem der Slot-Wert wird. Beides in eine
 * Datei zu legen hiesse, dass jede Anzeige des Bereichs-Namens die
 * Magic-Bytes-Tabelle mitlädt.
 *
 * ── DIESE DATEI IST DIE EINE WAHRHEIT ÜBER DIE GRENZEN ────────────────────
 * Sie wird an DREI Stellen gelesen: von der Upload-Route (die abweist), von
 * der Werkstatt (die den Zähler „n von 12" und die Hinweis-Zeile schreibt) und
 * vom Beweis-Skript (das die Ablehnungen provoziert). Drei Zahlen an drei
 * Stellen wären drei Zahlen, die auseinanderlaufen — und die erste, die es
 * merkt, wäre eine Ablehnung, die der Mensch nach dem Zähler nicht erwartet.
 *
 * ── DER INHALT ENTSCHEIDET, NICHT DER DATEINAME ───────────────────────────
 * `detectBrandInspirationImage` liest MAGIC BYTES, nicht den vom Browser
 * mitgeschickten MIME-Typ und nicht die Endung: beides ist Client-Eingabe.
 * Dasselbe Muster wie beim Community-Favicon (CLAUDE.md) und beim
 * Schrift-Upload — nur für drei Formate statt für eines, weil §2.2 PNG, JPG
 * und WebP zusagt.
 *
 * PURE: kein Vue, kein i18n, kein H3, kein Appwrite.
 */

/**
 * WIE VIELE VORBILDER EINE MARKE HAT (§2.2 Schritt 2: „3–12 Screenshots").
 *
 * Die ZWÖLF sind eine harte Grenze und werden mit 409 durchgesetzt: sie ist
 * zugleich die Drossel des Vision-Laufs in D2b („12 Bilder je Lauf"), und ein
 * Kunde, der dreissig Bilder ablegt, bekäme eine Lesung über zwölf davon und
 * wüsste nicht, über welche.
 *
 * Die DREI sind eine EMPFEHLUNG und werden nirgends erzwungen: `g.inspiration`
 * ist `required: false` (Registry), der Weg „Frida schlägt vor" kommt ganz
 * ohne Bilder aus, und ein Mensch mit genau einem guten Vorbild soll nicht
 * zwei erfundene dazulegen müssen, um weiterzukommen.
 */
export const BRAND_INSPIRATION_MAX = 12
export const BRAND_INSPIRATION_SUGGESTED_MIN = 3

/**
 * 5 MB je Bild (§2.2). Ein Screenshot ist selten grösser; ein Foto schon.
 *
 * DIE ZAHL IST DIESELBE WIE `maximumFileSize` DES BUCKETS (brand-024) und
 * deshalb dezimal, nicht 5 × 1024 × 1024: läge sie hier höher, käme eine Datei
 * durch die Route und würde vom Bucket abgewiesen — der Mensch bekäme statt
 * der klaren 413 eine 503 aus dem Speicher.
 */
export const BRAND_INSPIRATION_MAX_BYTES = 5_000_000

/**
 * Die Notiz: EIN Satz, warum es gefällt (§2.2). 240 Zeichen sind die Länge,
 * bei der ein Satz noch ein Satz ist — wer mehr schreibt, beschreibt das Bild,
 * und beschreiben tut es die Lesung (D2b).
 */
export const BRAND_INSPIRATION_NOTE_MAX = 240

/** Die Bereichs-Ids, wie sie in der Zeile stehen — aus dem Vokabular, nie daneben. */
export const BRAND_INSPIRATION_AREA_IDS: readonly string[]
  = BRAND_INSPIRATION_AREAS.map(area => area.id)

export function isBrandInspirationArea(value: string): boolean {
  return BRAND_INSPIRATION_AREA_IDS.includes(value)
}

/**
 * DIE DREI ERLAUBTEN FORMATE — Signatur, MIME-Typ und Endung in EINER Zeile.
 *
 * Die Endung geht in `allowedFileExtensions` des Buckets (Migration
 * brand-024), der MIME-Typ in den `Content-Type` der Ausliefer-Route. Beide
 * aus derselben Tabelle, weil ein Bucket, der `webp` verbietet, während die
 * Route es ausliefert, erst beim Kunden auffällt.
 */
export interface BrandInspirationImageKind {
  readonly mime: string
  readonly extension: 'png' | 'jpg' | 'webp'
}

const PNG_MAGIC = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
const JPEG_MAGIC = [0xFF, 0xD8, 0xFF]
const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46]
const WEBP_MAGIC = [0x57, 0x45, 0x42, 0x50]

function startsWith(bytes: Uint8Array, magic: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + magic.length) return false
  return magic.every((byte, index) => bytes[offset + index] === byte)
}

/**
 * WAS IST DAS WIRKLICH? — `null` heisst „kein erlaubtes Bild" und führt zu
 * 415. Fail-closed: ein Format, das hier nicht steht, kommt nicht durch, auch
 * wenn der Browser etwas anderes behauptet.
 *
 * WebP braucht ZWEI Prüfungen: `RIFF` allein ist ein Container (auch WAV und
 * AVI beginnen so), erst die vier Bytes ab Position 8 sagen, was drin ist.
 */
export function detectBrandInspirationImage(bytes: Uint8Array): BrandInspirationImageKind | null {
  if (startsWith(bytes, PNG_MAGIC)) return { mime: 'image/png', extension: 'png' }
  if (startsWith(bytes, JPEG_MAGIC)) return { mime: 'image/jpeg', extension: 'jpg' }
  if (startsWith(bytes, RIFF_MAGIC) && startsWith(bytes, WEBP_MAGIC, 8)) {
    return { mime: 'image/webp', extension: 'webp' }
  }
  return null
}

/** Der `accept`-Wert des Datei-Wählers — dieselbe Menge, andere Schreibweise. */
export const BRAND_INSPIRATION_ACCEPT = 'image/png,image/jpeg,image/webp'

/**
 * EIN VORBILD, wie es die Werkstatt sieht. KEIN Bild-Inhalt: das Bild holt die
 * Ausliefer-Route einzeln, und zwar nur für den Besitzer (§2.13).
 */
export interface BrandInspirationEntry {
  /** = `fileId` = Zeilen-Id. Eine Wahrheit, drei Namen wären zwei zu viel. */
  readonly id: string
  /** Laufende Nummer in der Anzeige („Vorbild 3") — die Lesung zeigt darauf. */
  readonly number: number
  readonly area: string
  readonly note: string
  /** Wie die Datei beim Hochladen hiess. Anzeige-Hilfe, nie ein Pfad. */
  readonly filename: string
  readonly createdAt: string
  /**
   * DIE LESUNG DIESES BILDES (D2b) — `null` heisst „noch nicht gelesen".
   *
   * Sie reist mit der LISTE und nicht über eine zweite Route: es ist dieselbe
   * Zeile, und eine eigene Abfrage je Bild wären zwölf Aufrufe für eine
   * Ansicht, die ohnehin alle zwölf Karten zeigt. Wie die Notiz und der
   * Bereich ist sie INTERN (`g.reading`, `sensitivity: 'internal'`) — sie
   * beschreibt ein Fremdwerk und verlässt das Kapitel nie.
   */
  readonly reading: BrandReadingEntry | null
}

/**
 * DER SLOT-WERT VON `g.inspiration` — die bestätigte AUSWAHL, nicht die Bilder.
 *
 * ── WARUM DER SLOT ÜBERHAUPT EINEN WERT TRÄGT ─────────────────────────────
 * Die WAHRHEIT über die Dateien steht in `brand_inspiration` und im Bucket;
 * der Slot-Wert ist das, was die Werkstatt, die Kapitel-Abnahme und der
 * Prüfblick lesen, ohne die Tabelle zu kennen — dieselbe Rolle, die jeder
 * andere Slot-Wert im Kapitel spielt. Ohne ihn stünde `g.inspiration` in der
 * Log-Spalte als leeres Feld da, obwohl fünf Bilder liegen.
 *
 * ── ER TRÄGT KEIN BILD UND KEINE ADRESSE ──────────────────────────────────
 * Nur Nummer, Bereich und die Notiz des Kunden (Leitplanke c: Bilder sind
 * Eingabe, nie Ausgabe). Selbst DAS reist nicht: `g.inspiration` ist
 * `sensitivity: 'internal'`, damit sagt `sessionTravels` nein, und
 * `brandShareableSlotValues` lässt den Slot aus Snapshot, Share und Beispiel
 * heraus. Der Wert hier ist die zweite Sicherung, nicht die erste.
 *
 * Die Form ist die des Katalogs (`kind: 'structured'` ⇒ `## Label` + Zeilen,
 * `brandSlotFormat.ts`) — geschrieben über deren Schreiber, damit die Regel
 * automatisch wahr bleibt.
 */
export function brandInspirationSlotValue(
  entries: readonly BrandInspirationEntry[],
  areaLabel: (areaId: string) => string,
  emptyNote: string,
): string {
  return formatBrandSlotStructured(entries.map(entry => ({
    label: `${entry.number} · ${areaLabel(entry.area)}`,
    body: entry.note.trim() || emptyNote,
  })))
}

/**
 * DIE NÄCHSTE FREIE NUMMER. Sie zählt vom HÖCHSTEN vergebenen Wert weiter, nie
 * von der Anzahl: wer Vorbild 2 von dreien entfernt, hat danach 1 und 3 — die
 * nächste ist 4 und nicht 3. Die Lesung (D2b) zeigt auf diese Nummer, und eine
 * Nummer, die nach einem Löschvorgang ein anderes Bild meint, macht aus jeder
 * Begründung eine Verwechslung.
 */
export function nextBrandInspirationNumber(entries: readonly BrandInspirationEntry[]): number {
  return entries.reduce((max, entry) => Math.max(max, entry.number), 0) + 1
}

/** Die Ablehnungsgründe, die als `data.code` reisen (createError-Regel). */
export type BrandInspirationRejection =
  | 'inspiration_missing_file'
  | 'inspiration_too_large'
  | 'inspiration_unsupported_type'
  | 'inspiration_area_invalid'
  | 'inspiration_note_too_long'
  | 'inspiration_limit_reached'
