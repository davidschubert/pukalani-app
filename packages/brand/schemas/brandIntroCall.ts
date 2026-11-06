import { z } from 'zod'

/**
 * DAS ERSTGESPRÄCH — der EINE Rumpf von `POST /api/brand/intro-call`
 * (BS1 Paket Z0; Plan docs/plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md §4.1
 * (a) und §7 Zeile Z0, Davids Entscheidung 5 vom 2026-09-07).
 *
 * ── FÜNF FELDER, UND WARUM GENAU DIESE ────────────────────────────────────
 * Der Portfolio-Wizard (`apps/portfolio/server/api/intro-call.post.ts`) ist
 * die VORLAGE, nicht das Vorbild für den Umfang: er stellt neun Fragen zu
 * einem WEBSITE-Projekt und qualifiziert damit einen Auftrag über mehrere
 * tausend Euro. Hier steht am Ende einer Markenarbeit jemand, der gerade eine
 * halbe Stunde investiert hat — jede weitere Frage ist eine Hürde vor der
 * Hürde. Der Plan nennt deshalb fünf:
 *
 *  1. `name`      — Pflicht. Ohne Anrede ist die Antwort-Mail unpersönlich.
 *  2. `email`     — Pflicht. Der sichere Rückweg.
 *  3. `company`   — die Marke, um die es geht. Freiwillig, weil sie im Weg aus
 *                   der Werkstatt automatisch mitkommt (s. `profileId`) und
 *                   weil ein Gründer sie womöglich noch nicht hat.
 *  4. `message`   — Pflicht, ≤ 1000 Zeichen. Ein Erstgespräch ohne ein Wort
 *                   zum Anliegen ist kein Termin, sondern ein Rätsel. Der
 *                   Deckel ist eng gewählt: 1000 Zeichen sind ein Absatz, und
 *                   wer mehr zu sagen hat, sagt es im Gespräch.
 *  5. `phone`     — FREIWILLIG (so im Plan). Kein Pflichtfeld und keine
 *                   Kanal-Wahl daneben: der nächste Schritt ist eine Mail mit
 *                   Terminvorschlägen, und wer lieber angerufen wird, schreibt
 *                   seine Nummer hier hinein. Eine Telefonnummer zur PFLICHT
 *                   zu machen hiesse, für den ersten Kontakt ein
 *                   Kontakt-Datum mehr zu erheben, als der nächste Schritt
 *                   braucht.
 *
 * ── HERKUNFT KOMMT MIT, IST ABER NIE EIN BEWEIS ───────────────────────────
 * `source` sagt, WELCHE Seite den Kontakt gebracht hat (freier String mit
 * Deckel — dieselbe Entscheidung und derselbe Grund wie in
 * `brandWaitlist.ts`: eine neue Landeseite soll keine Migration kosten).
 * `profileId` ist der Zeiger auf ein Branding; er wird von der ROUTE gegen die
 * Datentür geprüft (`resolveBrandIntroProfileId`) und bei fremdem oder
 * unbekanntem Branding VERWORFEN, nicht abgelehnt — ein Formular, das an einer
 * Id aus der Adresszeile scheitert, verliert einen echten Kunden wegen eines
 * veralteten Links.
 *
 * ── DIE DRITTE BREMSE STEHT HIER: `elapsedMs` ─────────────────────────────
 * Die Seite meldet, wie viel Zeit zwischen Aufbau und Absenden vergangen ist.
 * Ein Mensch braucht für drei Pflichtfelder Sekunden, ein Skript
 * Millisekunden.
 *
 * SIE IST BEWUSST SCHWACH, UND DAS GEHÖRT HIERHIN GESCHRIEBEN: der Wert kommt
 * vom Client und ist damit fälschbar — wer ihn fälscht, kommt durch. Das ist
 * kein Versehen, sondern der Zuschnitt: diese Bremse kostet stumpfe
 * Formular-Skripte und keinen Menschen etwas. Die Bremse gegen jemanden, der
 * es ernst meint, ist die Drossel je IP (`brand:intro-call` in
 * `05.rate-limit.ts`) — sie zählt serverseitig und ist die einzige der drei,
 * die man nicht überreden kann. Wer hier später ein echtes Gegenmittel will,
 * braucht ein signiertes Formular-Token, keine grössere Zahl.
 */

export const BRAND_INTRO_NAME_MAX = 120
export const BRAND_INTRO_EMAIL_MAX = 256
export const BRAND_INTRO_COMPANY_MAX = 160
export const BRAND_INTRO_MESSAGE_MAX = 1000
export const BRAND_INTRO_PHONE_MAX = 40
export const BRAND_INTRO_SOURCE_MAX = 64
export const BRAND_INTRO_PROFILE_ID_MAX = 64
/** Der Deckel der Betreiber-Notiz = die Spaltengrösse aus brand-021. */
export const BRAND_INTRO_NOTE_MAX = 500
/** Der Honigtopf hat keinen Zweck ausser „ist er leer?" — Deckel gegen Unfug. */
export const BRAND_INTRO_HONEYPOT_MAX = 256

/** Die Sprache, in der jemand gefragt hat — Grundlage der Bestätigungs-Mail. */
export type BrandIntroLocale = 'de' | 'en'

/**
 * DIE MINDESTZEIT zwischen Aufbau und Absenden. Drei Sekunden, weil ein Mensch
 * für Name, Adresse und einen Satz zum Anliegen niemals weniger braucht — und
 * weil ein höherer Wert den kostet, der das Formular mit ausgefülltem
 * Browser-Autofill in einem Rutsch abschickt.
 */
export const BRAND_INTRO_MIN_ELAPSED_MS = 3000

/**
 * Ist zu schnell abgeschickt worden? PUR und exportiert, damit Route und Test
 * dieselbe Rechnung benutzen.
 *
 * EIN FEHLENDER WERT IST KEIN VERSTOSS (`undefined` ⇒ `false`): das Feld ist
 * optional, und ein Formular, dessen Uhr nichts taugt — ein gedrosselter
 * Hintergrund-Tab, ein Browser ohne `performance.now()` —, soll nicht
 * abgewiesen werden. Ein NEGATIVER Wert ebenso wenig: er sagt etwas über die
 * Uhr des Clients, nichts über einen Bot.
 */
export function brandIntroTooFast(elapsedMs: number | undefined): boolean {
  if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0) return false
  return elapsedMs < BRAND_INTRO_MIN_ELAPSED_MS
}

export function createBrandIntroCallSchema() {
  return z.object({
    name: z.string().trim().min(1).max(BRAND_INTRO_NAME_MAX),
    // trim → toLowerCase → email, in dieser Reihenfolge und aus demselben
    // Grund wie in `brandWaitlist.ts`: eine kopierte Adresse kommt regelmässig
    // mit einem Leerzeichen an, und ein 400 kostet an dieser Stelle einen Lead.
    email: z.string().trim().toLowerCase().max(BRAND_INTRO_EMAIL_MAX).pipe(z.email()),
    company: z.string().trim().max(BRAND_INTRO_COMPANY_MAX).default(''),
    message: z.string().trim().min(1).max(BRAND_INTRO_MESSAGE_MAX),
    // Nicht geprüft, nur gedeckelt: Telefonnummern schreibt jedes Land anders,
    // und eine Regex, die „+49 (0)40 / 123-45" ablehnt, lehnt einen Kunden ab.
    phone: z.string().trim().max(BRAND_INTRO_PHONE_MAX).default(''),
    locale: z.enum(['de', 'en']).default('en'),
    source: z.string().trim().max(BRAND_INTRO_SOURCE_MAX).default(''),
    /**
     * Der Zeiger auf ein Branding. Zeichensatz eingegrenzt, weil er aus der
     * Adresszeile kommt und in eine Appwrite-Abfrage geht — `''` heisst „ohne
     * Bezug" und ist der Normalfall (die Seite ist öffentlich).
     */
    profileId: z.string().trim().max(BRAND_INTRO_PROFILE_ID_MAX)
      .regex(/^[A-Za-z0-9_-]*$/).default(''),
    /** Millisekunden zwischen Seitenaufbau und Absenden (s. Kopf). */
    elapsedMs: z.number().int().min(0).max(86_400_000).optional(),
    /**
     * Der Honigtopf. ERLAUBT (sonst wiese `.strict()` den Bot mit einem 400 ab
     * und verriete ihm die Falle) und in der Route ausgewertet: gefüllt ⇒
     * dieselbe 200-Antwort wie sonst, nur ohne Zeile und ohne Mail.
     */
    hp: z.string().max(BRAND_INTRO_HONEYPOT_MAX).optional(),
  }).strict()
}

export type BrandIntroCallInput = z.output<ReturnType<typeof createBrandIntroCallSchema>>

/**
 * ── DIE BETREIBER-SEITE DERSELBEN TABELLE ─────────────────────────────────
 *
 * Ab hier beschreibt diese Datei nicht mehr den Menschen vor dem Formular,
 * sondern den Betreiber vor `/dashboard/intro-calls`. Die Schemas stehen
 * trotzdem hier und nicht in einer zweiten Datei — dieselbe Begründung wie in
 * `brandWaitlist.ts`: es ist DIESELBE Tabelle, und die Längen-Deckel müssen zu
 * denselben Spalten passen.
 */

export const BRAND_INTRO_PAGE_DEFAULT = 50
export const BRAND_INTRO_PAGE_MAX = 100

/**
 * DIE ABFRAGE DER LISTE.
 *
 * `.strict()` ist hier BEWUSST NICHT gesetzt (wie bei der Warteliste): eine
 * Query trägt regelmässig Fremdes mit sich (Cache-Brecher der Fetch-Schicht,
 * `?_=…` aus einem Proxy), und ein 400 darauf wäre eine Fehlfunktion ohne
 * Angreifer.
 *
 * Der Standard-Filter ist `new` und nicht `all`: das ist die ARBEITSLISTE.
 */
export function createBrandIntroListQuerySchema() {
  return z.object({
    status: z.enum(['new', 'contacted', 'closed', 'all']).default('new'),
    cursor: z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/).default(''),
    limit: z.coerce.number().int().min(1).max(BRAND_INTRO_PAGE_MAX).default(BRAND_INTRO_PAGE_DEFAULT),
  })
}

export type BrandIntroListQuery = z.output<ReturnType<typeof createBrandIntroListQuerySchema>>

/**
 * DIE ÄNDERUNG DES BETREIBERS — Zustand und/oder Notiz.
 *
 * BEIDE Felder sind optional, und das ist die eine Entscheidung hier: „nur die
 * Notiz ändern" und „nur abhaken" sind zwei getrennte Handlungen an derselben
 * Zeile. Ein Pflichtfeld `status` hiesse, dass das Speichern einer Notiz den
 * Zustand mitschickt — und ein veralteter Wert aus einem offenen Reiter setzte
 * ein bereits erledigtes „closed" zurück auf „new". Fehlt ein Feld, wird es
 * NICHT angefasst (dieselbe Regel wie bei `neutral` im Community-Branding).
 *
 * `.strict()`, weil dieses Formular genau diese zwei Felder kennt.
 */
export function createBrandIntroPatchSchema() {
  return z.object({
    status: z.enum(['new', 'contacted', 'closed']).optional(),
    note: z.string().trim().max(BRAND_INTRO_NOTE_MAX).optional(),
  }).strict().refine(
    value => value.status !== undefined || value.note !== undefined,
    { message: 'brand.validation.nothingToChange' },
  )
}

export type BrandIntroPatchInput = z.output<ReturnType<typeof createBrandIntroPatchSchema>>
