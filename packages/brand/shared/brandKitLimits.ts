/**
 * DER DOWNLOAD-EIMER DES KITS (Konzept docs/plans/BRAND-BOOK-KIT.md §2.11,
 * Paket K2).
 *
 * ── ER STEHT NEBEN `brandAiLimits.ts` UND NICHT DARIN ────────────────────
 * Jene Datei deckelt KI-AUFRUFE: sie kosten Geld beim Anbieter, sie haben
 * einen Instanz-Deckel, einen Konto-Deckel und einen Parallel-Deckel, und ihr
 * Ablehnungsgrund erklärt einem Menschen, welche seiner Handlungen er heute
 * schon zu oft gemacht hat. Ein Kit-Download ruft NICHTS an — er rechnet
 * (§2.11: „nicht KI, CPU"). Ihn in dieselbe Tabelle zu legen hieße, ihn im
 * `BRAND_AI_LIMITS`-Objekt, in `BrandAiQuotaCounts`, in `decideBrandAiQuota`
 * und in `brandAiRejectionMessageKey` mitzuführen — vier Stellen, an denen
 * jemand künftig überlegen müsste, ob „das mit der KI" auch für Downloads
 * gilt. Es ist EIN Zähler mit EINEM Grund; er passt in dreißig Zeilen.
 *
 * ── WOGEGEN ER STEHT ─────────────────────────────────────────────────────
 * Nicht gegen den Menschen, der sein Kit fünfmal am Tag lädt (das soll er),
 * sondern gegen ein Skript, das die Bündel-Bildung im Kreis anstößt — die
 * einzige wirklich teure Rechnung in diesem Produkt (K6). Deshalb 60 Abrufe
 * je MARKE und Tag, und deshalb zählt das ZIP fünffach.
 *
 * ── DAS MANIFEST ZÄHLT NICHT ─────────────────────────────────────────────
 * `GET …/kit` ist die Seite, nicht die Datei. Zählte sie mit, verbrauchte
 * schon das Öffnen der Lieferseite das Kontingent, und der Mensch stünde bei
 * jedem Neuladen näher an einer Schranke, die er nie erreichen soll.
 *
 * DIESE DATEI IST PUR: kein H3, kein Store, kein i18n.
 */

/** 24 Stunden, rollierend — dasselbe Fenster wie bei den KI-Eimern. */
export const BRAND_KIT_DAY_WINDOW_MS = 24 * 60 * 60_000

/** 60 Abrufe je Marke und Tag (§2.11). */
export const BRAND_KIT_DAILY_LIMIT = 60

/**
 * DAS BÜNDEL ZÄHLT FÜNFFACH (§2.11) — es baut alle Dateien und packt sie.
 * Die Zahl steht hier schon, obwohl die Zip-Route erst in K6 kommt: sie ist
 * Teil der Deckel-ENTSCHEIDUNG und nicht des Zip-Codes.
 */
export const BRAND_KIT_ZIP_WEIGHT = 5

/**
 * Der Ablehnungsgrund. Er reist als `data.code` in der 429 und wird vom
 * zentralen Fehler-Handler als `reason` ins Envelope gehoben (CLAUDE.md).
 */
export const BRAND_KIT_LIMIT_CODE = 'brand_kit_limit'
export type BrandKitRejectionCode = typeof BRAND_KIT_LIMIT_CODE

/**
 * DER DECKEL DES BÜNDELS: 5 MB (§2.6, K6).
 *
 * Er ist KEIN Schutz vor dem Menschen, der viele Werte bestätigt hat — ein
 * volles Kit wiegt heute rund 100 KB. Er ist die Zusage, dass diese Route
 * NIEMALS ein beliebig grosses Ergebnis in den Speicher legt, egal was
 * jemand künftig in die Registry hängt (ein Bild-Export, ein Raster, ein
 * eingebetteter Schriftschnitt). Dieselbe Sorte Grenze wie
 * `snapshot_too_large` — und derselbe Umgang: 413 mit einem Grund, nie eine
 * halbe Datei.
 */
export const BRAND_KIT_ZIP_MAX_BYTES = 5 * 1024 * 1024

/** Der Ablehnungsgrund des Deckels — `data.code` der 413. */
export const BRAND_KIT_TOO_LARGE_CODE = 'kit_too_large'
export type BrandKitZipRejectionCode = typeof BRAND_KIT_TOO_LARGE_CODE

/**
 * `null` = diese Grösse darf raus.
 *
 * Pur und mit übergebbarem Deckel — genau deshalb: der 413-Zweig der Route
 * ist im Test mit einem KLEINEN Deckel beweisbar, ohne dass irgendwo ein
 * Env-Schalter oder ein Prod-Knopf entsteht, den jemand versehentlich
 * umlegen könnte (dieselbe Form wie `decideBrandKitQuota`).
 */
export function decideBrandKitZipSize(
  bytes: number,
  max: number = BRAND_KIT_ZIP_MAX_BYTES,
): BrandKitZipRejectionCode | null {
  return bytes > max ? BRAND_KIT_TOO_LARGE_CODE : null
}

/**
 * EIN Eimer je MARKE — ohne Konto und ohne Datei im Schlüssel.
 *
 * Ohne Konto, weil zwei Marken zwei Kits sind (dieselbe Begründung wie beim
 * Gesprächs-Eimer). Ohne Datei, weil der Deckel die RECHNUNG begrenzt und
 * nicht das Interesse an einer bestimmten Datei — vier Eimer zu 60 wären in
 * Wahrheit ein Deckel von 240.
 */
export function brandKitDayKey(profileId: string): string {
  return `brand-kit-day:${profileId}`
}

/**
 * `null` = der Abruf darf laufen. Pur, damit die Entscheidung ohne Store
 * prüfbar ist (dasselbe Muster wie `decideBrandAiQuota`).
 */
export function decideBrandKitQuota(
  count: number,
  limit: number = BRAND_KIT_DAILY_LIMIT,
): BrandKitRejectionCode | null {
  return count > limit ? BRAND_KIT_LIMIT_CODE : null
}
