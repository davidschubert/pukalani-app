import { z } from 'zod'
import { isBrandWebsiteUrl } from '../shared/brandStartCard'

/**
 * DIE WARTELISTE — der EINE Rumpf von `POST /api/brand/waitlist`.
 *
 * ── WOFÜR SIE DA IST ──────────────────────────────────────────────────────
 * branding.supply läuft in geschlossener Beta: ohne Einladungscode gibt es
 * heute keinen Weg, etwas zu hinterlassen — die Seite sagt „wir melden uns"
 * und meint niemanden. Dieses Schema beschreibt das kleinste ehrliche
 * Gegenteil davon: eine Adresse, ein paar freiwillige Angaben, und die
 * Herkunftsseite, damit später nachvollziehbar ist, WO jemand gefragt hat.
 *
 * ── NUR DIE ADRESSE IST PFLICHT ───────────────────────────────────────────
 * Jedes zusätzliche Pflichtfeld kostet Anfragen. Name, Firma und Website sind
 * deshalb optional und haben `''` als Vorgabewert — dasselbe `''` wie in der
 * Startkarte (`brandStartCard.ts`): ein leeres Feld ist ein GEANTWORTETES
 * Feld ohne Inhalt, kein fehlender Wert.
 *
 * ── DIE ADRESSE WIRD NORMALISIERT, NICHT NUR GEPRÜFT ──────────────────────
 * `trim` → `toLowerCase` → `email`, in dieser Reihenfolge. Der Kern-Helfer
 * (`packages/core/schemas/auth.ts`) prüft ZUERST und trimmt danach; hier ist
 * es umgekehrt, weil eine aus einer Mail kopierte Adresse regelmäßig mit einem
 * Leerzeichen ankommt und ein 400 an dieser Stelle einen Lead kostet. Der
 * gespeicherte Wert ist damit zugleich der Vergleichswert des UNIQUE-Index
 * (`emailLower`) — die Route muss nichts mehr daran tun.
 *
 * ── DIE WEB-ADRESSE DARF OHNE SCHEMA KOMMEN ───────────────────────────────
 * `isBrandWebsiteUrl` (Startkarte) verlangt `http://` oder `https://` — im
 * Wizard richtig, hier zu streng: wer in ein Lead-Formular „kailua.coffee"
 * tippt, hat die Frage beantwortet. Deshalb wird ein fehlendes Schema ERGÄNZT
 * (`https://`) statt abgelehnt, und erst das Ergebnis geprüft. Ein Punkt im
 * Hostnamen bleibt Pflicht: ohne ihn wäre jedes Wort („test") eine gültige
 * Adresse, und das Feld sagte nichts mehr aus.
 *
 * ── `hp` IST DIE FALLE, KEIN DATENFELD ────────────────────────────────────
 * Ein verstecktes Feld, das ein Mensch nie sieht und ein einfacher Bot immer
 * ausfüllt. Es ist hier ERLAUBT (sonst wiese `.strict()` den Bot mit einem
 * 400 ab und verriete ihm die Falle) und wird in der Route ausgewertet: gefüllt
 * ⇒ dieselbe 200-Antwort wie sonst, nur ohne Zeile. Gespeichert wird es nie.
 */

export const BRAND_WAITLIST_EMAIL_MAX = 256
export const BRAND_WAITLIST_NAME_MAX = 120
export const BRAND_WAITLIST_COMPANY_MAX = 160
export const BRAND_WAITLIST_WEBSITE_MAX = 256
export const BRAND_WAITLIST_SOURCE_MAX = 64
/** Der Honigtopf hat keinen Zweck außer „ist er leer?" — Deckel gegen Unfug. */
export const BRAND_WAITLIST_HONEYPOT_MAX = 256

/** Die Sprache, in der jemand gefragt hat — Grundlage der Antwort-Mail. */
export type BrandWaitlistLocale = 'de' | 'en'

/**
 * Ergänzt ein fehlendes Schema (s. Kopf). Ein bereits vorhandenes bleibt
 * unangetastet — auch ein falsches (`ftp://`), damit die Prüfung darunter es
 * ABLEHNEN kann, statt dass wir es still zu `https://ftp://…` verbiegen.
 */
export function normalizeBrandWaitlistWebsite(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

/** http(s), parsebar UND mit einem Punkt im Hostnamen (s. Kopf). */
export function isBrandWaitlistWebsite(value: string): boolean {
  if (!value) return true
  if (!isBrandWebsiteUrl(value)) return false
  try {
    return new URL(value).hostname.includes('.')
  }
  catch {
    return false
  }
}

export function createBrandWaitlistSchema() {
  return z.object({
    email: z.string().trim().toLowerCase().max(BRAND_WAITLIST_EMAIL_MAX).pipe(z.email()),
    name: z.string().trim().max(BRAND_WAITLIST_NAME_MAX).default(''),
    company: z.string().trim().max(BRAND_WAITLIST_COMPANY_MAX).default(''),
    website: z.string().trim().max(BRAND_WAITLIST_WEBSITE_MAX)
      .transform(normalizeBrandWaitlistWebsite)
      // Nach dem Ergänzen des Schemas kann der Wert acht Zeichen länger sein
      // als die Eingabe — die Spalte fasst 256, also wird HIER erneut gemessen.
      .refine(value => value.length <= BRAND_WAITLIST_WEBSITE_MAX, {
        message: 'brand.validation.websiteUrl',
      })
      .refine(isBrandWaitlistWebsite, { message: 'brand.validation.websiteUrl' })
      .default(''),
    // Die Oberflächen-Sprache der fragenden Seite. Kein freier String: sie
    // entscheidet später, in welcher Sprache geantwortet wird.
    locale: z.enum(['de', 'en']).default('en'),
    // WELCHE Seite gefragt hat ('about', 'team', 'invite', 'home', …). Bewusst
    // ein freier String mit Deckel und keine Aufzählung: eine neue Landeseite
    // soll eine Zeile im Formular sein, keine Migration und kein 400.
    source: z.string().trim().max(BRAND_WAITLIST_SOURCE_MAX).default(''),
    hp: z.string().max(BRAND_WAITLIST_HONEYPOT_MAX).optional(),
  }).strict()
}

export type BrandWaitlistInput = z.output<ReturnType<typeof createBrandWaitlistSchema>>

/**
 * DER RUMPF DER BESTÄTIGUNG (`POST /api/brand/waitlist/confirm`).
 *
 * Der Token ist das GANZE Geheimnis dieser Route — es gibt keine Session, die
 * daneben stünde. Deshalb misst das Schema ihn, BEVOR die Route ihn hasht:
 *  · `min` 32 — kürzer war nie einer von uns (`randomBytes(32)` ⇒ 64 Zeichen
 *    hex). Ein zweistelliger „Token" ist kein Tippfehler, sondern ein Versuch.
 *  · `max` 128 — der Deckel gegen den 10-MB-„Token": ohne ihn liefe eine
 *    beliebig lange Zeichenkette erst durch sha256 und dann in eine Abfrage.
 *    Dieselbe Vorsicht wie im Share-GET, nur als Schema statt als if.
 *
 * `.strict()`, weil das Formular genau ein Feld schickt — ein zweites käme aus
 * keiner unserer Seiten.
 */
export const BRAND_WAITLIST_TOKEN_MIN = 32
export const BRAND_WAITLIST_TOKEN_MAX = 128

export function createBrandWaitlistConfirmSchema() {
  return z.object({
    token: z.string().trim().min(BRAND_WAITLIST_TOKEN_MIN).max(BRAND_WAITLIST_TOKEN_MAX),
  }).strict()
}

export type BrandWaitlistConfirmInput = z.output<ReturnType<typeof createBrandWaitlistConfirmSchema>>

/**
 * ── DIE BETREIBER-SEITE DERSELBEN TABELLE ─────────────────────────────────
 *
 * Ab hier beschreibt diese Datei nicht mehr den Menschen vor dem Formular,
 * sondern den Betreiber vor `/dashboard/waitlist`. Die Schemas stehen trotzdem
 * hier und nicht in einer zweiten Datei: es ist DIESELBE Tabelle, und die
 * Längen-Deckel (`note` 500) müssen zu denselben Spalten passen. Zwei Dateien
 * hießen zwei Orte, an denen jemand eine Spaltengröße nachpflegen müsste.
 */

/** Der Deckel der Betreiber-Notiz = die Spaltengröße aus brand-012. */
export const BRAND_WAITLIST_NOTE_MAX = 500

/**
 * Die Seitengröße der Liste. 50 ist der Default (die Warteliste einer
 * geschlossenen Beta passt fast immer auf eine Seite), 100 der Deckel — ein
 * `Query.limit()` ist in diesem Repo PFLICHT, und ein vom Aufrufer frei
 * wählbares Limit wäre ein Deckel, der keiner ist.
 */
export const BRAND_WAITLIST_PAGE_DEFAULT = 50
export const BRAND_WAITLIST_PAGE_MAX = 100

/**
 * DIE ABFRAGE DER LISTE.
 *
 * `.strict()` ist hier BEWUSST NICHT gesetzt: eine Query trägt regelmäßig
 * Fremdes mit sich (Cache-Brecher der Fetch-Schicht, `?_=…` aus einem
 * Proxy), und ein 400 darauf wäre eine Fehlfunktion ohne Angreifer. Die
 * bekannten Felder werden trotzdem streng gemessen.
 *
 * Der `cursor` ist eine Appwrite-Zeilen-Id und kommt aus UNSERER eigenen
 * vorherigen Antwort — geprüft wird er trotzdem: er reist über die Adresszeile,
 * und eine ungeprüfte Zeichenkette in einer Abfrage ist eine Zeichenkette, die
 * jemand ausprobiert. `''` heißt „von vorn".
 */
export function createBrandWaitlistListQuerySchema() {
  return z.object({
    status: z.enum(['pending', 'confirmed', 'invited', 'declined', 'all']).default('confirmed'),
    cursor: z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/).default(''),
    limit: z.coerce.number().int().min(1).max(BRAND_WAITLIST_PAGE_MAX).default(BRAND_WAITLIST_PAGE_DEFAULT),
  })
}

export type BrandWaitlistListQuery = z.output<ReturnType<typeof createBrandWaitlistListQuerySchema>>

/**
 * DIE NOTIZ DES BETREIBERS.
 *
 * Ein leerer String ist ein gültiger Wert — „Notiz löschen" ist eine Handlung
 * und braucht keinen eigenen Endpunkt. `.strict()`, weil dieses Formular genau
 * ein Feld schickt: käme ein `status` mit, wäre das ein Versuch, die
 * Zustands-Regeln (`brandWaitlistAdmin.ts`) über die Notiz-Route zu umgehen.
 */
export function createBrandWaitlistNoteSchema() {
  return z.object({
    note: z.string().trim().max(BRAND_WAITLIST_NOTE_MAX).default(''),
  }).strict()
}

export type BrandWaitlistNoteInput = z.output<ReturnType<typeof createBrandWaitlistNoteSchema>>
