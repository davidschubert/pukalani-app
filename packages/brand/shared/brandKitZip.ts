import { strToU8, zipSync } from 'fflate'

/**
 * DAS BÜNDEL — IN-MEMORY GEPACKT, PUR (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.6/§2.11/§2.17, Paket K6).
 *
 * ── ES GIBT KEINE GESPEICHERTE FASSUNG ───────────────────────────────────
 * Wie jede Kit-Datei entsteht das Zip bei JEDEM Abruf neu aus den bestätigten
 * Werten. Kein Bucket, keine Spalte, kein Zwischenspeicher — ein abgelegtes
 * Bündel wäre die einzige Stelle im Produkt, an der eine Marke altern könnte,
 * ohne dass es jemand merkt. Der Preis ist Rechenzeit, und genau dagegen steht
 * der Eimer (`brandKitLimits.ts`, Gewicht 5).
 *
 * ── DASSELBE KIT IST BYTE-GLEICH ─────────────────────────────────────────
 * Zwei Abrufe derselben Marke am selben Stand liefern dieselben Bytes. Das ist
 * keine Spielerei: nur so kann jemand zwei Bündel vergleichen und sehen, ob
 * sich seine Marke geändert hat — und nur so ist der Test eine Zusage und kein
 * Zufall. Dafür müssen ZWEI Quellen von Nichtdeterminismus weg:
 *   · die ZEITSTEMPEL der Einträge — ein Zip trägt je Datei ein Datum, und
 *     „jetzt" wäre bei jedem Abruf ein anderes. Sie stehen deshalb auf dem
 *     STAND der Marke (das ist auch die ehrlichere Angabe: die Datei ist so
 *     alt wie die Entscheidung, nicht wie der Klick).
 *   · die REIHENFOLGE — sie ist die der übergebenen Liste, und die kommt aus
 *     der Registry, nicht aus einem Objekt-Schlüsselsatz.
 * Die Deflate-Stufe ist fest (6): eine andere Stufe ergäbe andere Bytes.
 *
 * ── DER DECKEL WOHNT NICHT HIER ──────────────────────────────────────────
 * `decideBrandKitZipSize` steht in `brandKitLimits.ts`, bei den anderen
 * Deckeln. Diese Datei PACKT nur; ob das Ergebnis ausgeliefert werden darf,
 * ist eine Entscheidung, keine Rechnung.
 *
 * DIESE DATEI IST PUR: kein H3, kein Appwrite, kein i18n.
 */

/** Eine Datei im Bündel — `path` ist der Name IM ZIP (`marks/x.svg`). */
export interface BrandKitZipEntry {
  path: string
  content: string
}

/**
 * DER RÜCKFALL-ZEITSTEMPEL OHNE STAND: Mittag des 2. Januar 1980 (UTC).
 *
 * Das Zip-Format kennt nur die Jahre 1980–2099, und es rechnet in ORTSZEIT —
 * `fflate` liest `getFullYear()` und wirft ausserhalb. Der 1. Januar 1980 um
 * 00:00 UTC ist in jeder westlichen Zeitzone der 31. Dezember 1979, und damit
 * stürbe die Route auf einem Server in New York und liefe in Berlin (live in
 * diesem Paket erwischt). Mittag am ZWEITEN Januar liegt in jeder Zone
 * (UTC−12 bis UTC+14) sicher im Jahr 1980.
 *
 * Er ist offensichtlich KEIN echtes Datum — besser als ein „heute", das eine
 * Aktualität behauptet, die niemand entschieden hat.
 */
export const BRAND_KIT_ZIP_EPOCH = Date.UTC(1980, 0, 2, 12)

/** Die Grenzen, die das Zip-Format kennt — ausserhalb wirft `fflate`. */
const ZIP_MIN = Date.UTC(1980, 0, 2, 12)
const ZIP_MAX = Date.UTC(2099, 11, 30, 12)

/**
 * Der Stand als Zeitstempel — `NaN`-sicher und auf die Zip-Grenzen geklemmt,
 * damit weder ein leerer noch ein absurder Stand die Route umbringt.
 */
export function brandKitZipMtime(stand: string): number {
  const parsed = Date.parse(stand.trim())
  if (!Number.isFinite(parsed) || parsed < ZIP_MIN || parsed > ZIP_MAX) return BRAND_KIT_ZIP_EPOCH
  return parsed
}

/**
 * DIE UNKOMPRIMIERTE SUMME — der ERSTE Deckel-Blick (§2.6).
 *
 * Sie wird VOR dem Packen gefragt: wer erst packt und dann misst, hat die
 * teure Rechnung schon bezahlt. Gemessen werden UTF-8-Bytes, nicht Zeichen.
 */
export function brandKitZipRawBytes(entries: readonly BrandKitZipEntry[]): number {
  let total = 0
  for (const entry of entries) total += new TextEncoder().encode(entry.content).length
  return total
}

/**
 * DAS FERTIGE ZIP. `stand` setzt die Zeitstempel aller Einträge (s. Kopf).
 */
export function buildBrandKitZip(
  entries: readonly BrandKitZipEntry[],
  stand = '',
): Uint8Array {
  const mtime = brandKitZipMtime(stand)
  const files: Record<string, [Uint8Array, { level: 6, mtime: number }]> = {}
  for (const entry of entries) {
    files[entry.path] = [strToU8(entry.content), { level: 6, mtime }]
  }
  return zipSync(files, { level: 6, mtime })
}
