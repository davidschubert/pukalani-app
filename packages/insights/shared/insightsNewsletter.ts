import { z } from 'zod'
import type { InsightsPostHead } from './insightsPost'
import { insightsPublicKopf } from './insightsPost'

/**
 * DER NEWSLETTER-VERTRAG VON BRAND INSIGHTS (Paket I5a „Sammeln", Plan
 * docs/plans/BRAND-INSIGHTS.md §9.3a; Muster: `brand_waitlist` mit seinem
 * Double-Opt-in aus den Migrationen brand-012 und brand-015).
 *
 * ── WAS HIER DRIN STEHT UND WAS NICHT ────────────────────────────────────
 * Alles, was eine REGEL ist: die Deckel der Spalten, die zwei Schemas, die
 * Drossel, die zwei Fristen, die Entscheidung des Abmelde-Weges und der
 * WORTLAUT der Bestätigungs-Mail. Nichts davon braucht Nitro, und genau
 * deshalb hat jede dieser Regeln eine Gegenprobe (`tests/
 * insightsNewsletter.test.ts`). Die Token-Rechnung (sha256, HMAC) liegt
 * nebenan in `server/utils/insightsNewsletter.ts` — sie braucht
 * `node:crypto` und hat im Browser-Bündel nichts zu suchen.
 *
 * ── DIE WARTELISTE WIRD NICHT WEITERBENUTZT ──────────────────────────────
 * Eine Zustimmung gilt nur für das, wofür sie gegeben wurde (§9.3a, dieselbe
 * Regel, die DB1 für `marketVisibility` gezogen hat). „Sag mir Bescheid, wenn
 * das Produkt öffnet" ist keine Einwilligung in einen redaktionellen
 * Newsletter. Es gibt deshalb KEINEN Import aus `brand_waitlist`, keinen
 * Abgleich und keine gemeinsame Tabelle: wer beides will, trägt sich zweimal
 * ein. Was übernommen wird, ist das MUSTER — nicht die Adressen.
 *
 * ── DAS VERSPRECHEN HAT KEINEN TAKT (Davids Entscheidung 2026-10-24) ─────
 * „Wir schreiben, wenn ein neues Stück erscheint." Nirgends steht
 * „wöchentlich", „jede Woche" oder „regelmäßig" — nicht im Formular, nicht in
 * der Mail, nicht im Betreff. Ein zugesagter Takt wäre eine Zusage, die die
 * Redaktion in einer vollen Woche bricht, und eine gebrochene Zusage ist
 * teurer als eine, die nie gemacht wurde. Ein Test hält das fest (die
 * Mail-Texte HIER und die Locale-Werte in `i18n/locales/*.json`).
 *
 * ── DIE ADRESSE WIRD NORMALISIERT, NICHT NUR GEPRÜFT ─────────────────────
 * `trim` → `toLowerCase` → `email`, in dieser Reihenfolge und im SCHEMA, nie
 * in der Route (wörtlich die Begründung aus `brandWaitlist.ts` und
 * `insightsCorrection.ts`): `emailLower` ist der UNIQUE-Index UND der
 * Lesepfad des GDPR-Contributors, und Appwrite vergleicht Zeichen für
 * Zeichen. Eine Zeile mit `Max@Example.COM` fände keine der beiden Abfragen.
 *
 * ── SEIT I5b STEHT HIER AUCH DER VERSAND (Abschnitte 8 und 9) ────────────
 * Dieselbe Arbeitsteilung wie oben: WAS eine Regel ist, steht hier und hat
 * eine Gegenprobe — wer Empfänger ist, wie gross ein Stapel ist, was beim
 * zweiten Druck auf den Knopf passiert, und der WORTLAUT der Ausgabe-Mail. Was
 * Nitro, `node:crypto` oder Appwrite braucht, liegt in
 * `server/utils/insightsNewsletter.ts` bzw. `insightsNewsletterSend.ts`.
 *
 * ── EIN BEITRAG = EINE MAIL (Davids Entscheidung 2026-10-27) ─────────────
 * Es gibt KEINEN zweiten Editor und KEINE freie Ausgabe. Betreff und Text
 * entstehen aus dem Beitrag selbst — Titel, Vorspann, Adresse — plus einem
 * optionalen Feld für zwei, drei eigene Sätze. Begründung: ein zweiter Text,
 * der dasselbe sagt wie der Beitrag, VERALTET GETRENNT vom ersten. Ändert die
 * Redaktion den Vorspann, stünde in der Ausgabe weiter der alte; und das
 * Versprechen an den Leser lautet wörtlich „wir schreiben, wenn ein neues
 * Stück erscheint" — nicht „wir schreiben etwas Eigenes".
 */

// ── 1. Die Deckel der Spalten (insights-006) ───────────────────────────────

/**
 * Die Spaltengrößen aus §9.3a — EINMAL, damit Schema und Migration dasselbe
 * meinen. 256 für beide Adress-Spalten (wie `brand_waitlist`): die Zod-Grenze
 * ist dieselbe Zahl, und eine Spalte, die mehr fasst als je ankommt,
 * verspricht zu viel.
 */
export const INSIGHTS_NEWSLETTER_EMAIL_MAX = 256
export const INSIGHTS_NEWSLETTER_SOURCE_MAX = 64
/** Der Honigtopf hat keinen Zweck außer „ist er leer?" — Deckel gegen Unfug. */
export const INSIGHTS_NEWSLETTER_HONEYPOT_MAX = 200

/** Die Sprache, in der jemand sich eingetragen hat — die Sprache der Mails. */
export const INSIGHTS_NEWSLETTER_LOCALES = ['de', 'en'] as const
export type InsightsNewsletterLocale = (typeof INSIGHTS_NEWSLETTER_LOCALES)[number]

// ── 2. Die zwei Schemas ────────────────────────────────────────────────────

/**
 * WAS EIN FREMDER MENSCH SCHICKEN DARF (`POST …/newsletter/subscribe`).
 *
 * `.strict()`, weil genau dieses Formular schickt — ein unbekannter Schlüssel
 * ist entweder ein Versuch oder ein Missverständnis, und beides soll
 * auffallen. `hp` ist DRIN und nicht verboten: ein `.strict()`, das den Bot
 * mit einem 400 abweist, verriete ihm die Falle.
 *
 * `source` bleibt ein freier String (`list`, `post:<slug>`, später
 * `profile:<slug>`): eine neue Stelle, an der das Formular steht, soll eine
 * Zeile im Markup sein und keine Migration. Er ist zugleich die Zahl aus
 * §9.7 — „welches Format bringt Leser?".
 *
 * Und er wird GEKÜRZT statt abgelehnt. Das ist kein Nachlassen, sondern
 * Rechnen: ein Slug darf 160 Zeichen lang sein (`insightsPost.ts`), die Spalte
 * fasst 64 — ein `max()` hier liesse den Eintrag auf einem Beitrag mit langem
 * Titel mit einem 400 scheitern, und zwar genau dort, wo jemand gerade seine
 * Adresse eingetippt hat. Ein abgeschnittenes Etikett kostet eine unscharfe
 * Statistik, ein 400 kostet einen Leser. Der Deckel davor (1000) ist nur die
 * Grenze gegen den 10-MB-„source".
 *
 * Die Fabrik nimmt `t`, damit dasselbe Schema das FORMULAR prüfen kann
 * (Muster `insightsForms.ts` / `createInsightsCorrectionSubmitSchema`); die
 * Route ruft sie ohne Argument, weil ein Server keine Anzeigesprache hat.
 */
export function createInsightsNewsletterSubscribeSchema(t: (key: string) => string = key => key) {
  return z.object({
    email: z.string().trim().toLowerCase().max(INSIGHTS_NEWSLETTER_EMAIL_MAX)
      .pipe(z.email({ message: t('insights.newsletter.emailInvalid') })),
    locale: z.enum(INSIGHTS_NEWSLETTER_LOCALES).default('en'),
    source: z.string().trim().max(1000)
      .transform(value => value.slice(0, INSIGHTS_NEWSLETTER_SOURCE_MAX))
      .default(''),
    hp: z.string().max(INSIGHTS_NEWSLETTER_HONEYPOT_MAX).optional(),
  }).strict()
}

export type InsightsNewsletterSubscribeInput
  = z.output<ReturnType<typeof createInsightsNewsletterSubscribeSchema>>

/**
 * DER RUMPF DER ZWEI TOKEN-WEGE (`confirm`, `unsubscribe`).
 *
 * Der Token ist das GANZE Geheimnis dieser Routen — es gibt keine Session
 * daneben. Deshalb misst das Schema ihn, BEVOR die Route ihn hasht bzw.
 * nachrechnet:
 *  · `min` 32 — kürzer war nie einer von uns (der Bestätigungs-Token ist
 *    `randomBytes(32)` als hex, also 64 Zeichen). Ein zweistelliger „Token"
 *    ist kein Tippfehler, sondern ein Versuch.
 *  · `max` 200 — der Deckel gegen den 10-MB-„Token". Er ist großzügiger als
 *    die 128 der Warteliste, weil der ABMELDE-Token aus zwei Teilen besteht
 *    (Zeilen-Id + HMAC, s. `server/utils/insightsNewsletter.ts`) und damit
 *    länger ist als ein reiner Zufallswert.
 *  · das MUSTER — beide Token bestehen aus genau diesen Zeichen. Was sie
 *    nicht erfüllt, gehört nicht in eine Abfrage (dieselbe Regel wie beim
 *    `targetId` des Korrekturweges).
 */
export const INSIGHTS_NEWSLETTER_TOKEN_MIN = 32
export const INSIGHTS_NEWSLETTER_TOKEN_MAX = 200
const INSIGHTS_NEWSLETTER_TOKEN_RE = /^[A-Za-z0-9._-]+$/

export function createInsightsNewsletterTokenSchema() {
  return z.object({
    token: z.string().trim()
      .min(INSIGHTS_NEWSLETTER_TOKEN_MIN)
      .max(INSIGHTS_NEWSLETTER_TOKEN_MAX)
      .regex(INSIGHTS_NEWSLETTER_TOKEN_RE),
  }).strict()
}

export type InsightsNewsletterTokenInput
  = z.output<ReturnType<typeof createInsightsNewsletterTokenSchema>>

// ── 3. Die Frist des Bestätigungs-Links ────────────────────────────────────

/**
 * 24 STUNDEN, UND DER ALTE VERFÄLLT — wörtlich wie bei der Warteliste.
 *
 * Jeder neue Eintrag derselben Adresse ÜBERSCHREIBT den Hash. Damit ist immer
 * höchstens ein Link gültig: wer zweimal drückt und dann die ERSTE Mail
 * öffnet, landet in einem „Link ungültig" statt in einer Bestätigung. Das ist
 * der Preis dafür, dass ein weitergeleiteter alter Link nichts mehr kann, und
 * er ist es wert — der Klick auf die NEUERE Mail funktioniert.
 */
export const INSIGHTS_NEWSLETTER_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

export function insightsNewsletterTokenExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + INSIGHTS_NEWSLETTER_TOKEN_TTL_MS).toISOString()
}

/**
 * IST DIE FRIST ABGELAUFEN? Ein FEHLENDES oder kaputtes Datum gilt als
 * abgelaufen (fail-closed, dieselbe Regel wie `brandWaitlistTokenExpired`):
 * ein Link ohne Frist wäre ein dauerhafter Zugang, den niemand beschlossen
 * hat.
 */
export function insightsNewsletterTokenExpired(value: string | undefined | null, now: Date = new Date()): boolean {
  const at = Date.parse(value ?? '')
  return !Number.isFinite(at) || at <= now.getTime()
}

// ── 4. Die Drossel ─────────────────────────────────────────────────────────

/**
 * ZWEI EIMER, ENG VOR WEIT — dieselben Zahlen und dieselbe Bauart wie der
 * Korrekturweg (`decideInsightsCorrectionQuota`), und das ist Absicht: zwei
 * öffentliche Schreibwege desselben Layers mit zwei verschiedenen Deckeln
 * wären zwei Mechaniken, die ein Betreiber einzeln lernen müsste.
 *
 * Die Stunde fängt den Menschen, der aus Unsicherheit dreimal drückt; der Tag
 * fängt das Skript, das die Stunde aussitzt. Beide zählen je ANSCHLUSS
 * (`ipHash`) und nicht je Konto — wer sich hier einträgt, hat keines. Hinter
 * ihnen steht der MINUTEN-Eimer der Middleware (`insights:newsletter`, 3/min),
 * davor der Honigtopf.
 *
 * Und sie zählen VOR jedem Appwrite-Ruf UND vor jeder Mail: jeder Versuch
 * kostet sonst eine Abfrage, einen Schreibvorgang und eine zugestellte Mail an
 * eine frei wählbare Adresse — das ist die Bauform eines Mail-Bombing-Werkzeugs
 * (dieselbe Lehre wie bei `POST /api/auth/signup`).
 */
export const INSIGHTS_NEWSLETTER_HOUR_LIMIT = 3
export const INSIGHTS_NEWSLETTER_DAY_LIMIT = 10
export const INSIGHTS_NEWSLETTER_HOUR_WINDOW_MS = 60 * 60_000
export const INSIGHTS_NEWSLETTER_DAY_WINDOW_MS = 24 * 60 * 60_000

export type InsightsNewsletterQuotaCode = 'rate_limited_hour' | 'rate_limited_day'

/** Die Schlüssel der zwei Eimer — eigener Namensraum, nie der des Korrekturweges. */
export function insightsNewsletterHourKey(ipHash: string): string {
  return `insights:newsletter:h:${ipHash}`
}

export function insightsNewsletterDayKey(ipHash: string): string {
  return `insights:newsletter:d:${ipHash}`
}

/**
 * `>` statt `>=` — `store.hit()` zählt diesen Versuch schon mit. Der DRITTE
 * Eintrag einer Stunde geht also durch, der vierte nicht.
 *
 * Die STUNDE gewinnt bei Gleichstand: sie ist der engere Deckel, und ihr
 * `Retry-After` ist die kürzere und damit ehrlichere Auskunft.
 */
export function decideInsightsNewsletterQuota(
  hourCount: number,
  dayCount: number,
): InsightsNewsletterQuotaCode | null {
  if (hourCount > INSIGHTS_NEWSLETTER_HOUR_LIMIT) return 'rate_limited_hour'
  if (dayCount > INSIGHTS_NEWSLETTER_DAY_LIMIT) return 'rate_limited_day'
  return null
}

// ── 5. Die zwei Fristen des Sweeps ─────────────────────────────────────────

/**
 * WIE LANGE EINE ABGEMELDETE ZEILE IHRE ADRESSE BEHÄLT — 12 Monate, gerechnet
 * in TAGEN, EINE Konstante wie `INSIGHTS_CORRECTION_PII_RETENTION_DAYS`.
 *
 * Der Migrationskopf zeigt auf sie, der Sweep rechnet mit ihr, die
 * Datenschutz-Abschnitte zitieren sie. Zwei Stellen mit derselben Zahl sind
 * beim ersten Ändern zwei verschiedene Fristen — und die eine davon wäre die,
 * die nach außen versprochen wurde.
 *
 * WARUM ÜBERHAUPT AUFBEWAHREN: die abgemeldete Zeile ist der NACHWEIS „hat
 * eingewilligt und sich abgemeldet". Sie zu löschen nähme den Beleg, dass wir
 * eine Einwilligung hatten UND dass die Abmeldung gewirkt hat.
 */
export const INSIGHTS_NEWSLETTER_PII_RETENTION_DAYS = 365

export function insightsNewsletterRetentionAt(from: Date): Date {
  return new Date(from.getTime() + INSIGHTS_NEWSLETTER_PII_RETENTION_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * WIE LANGE EINE UNBESTÄTIGTE ZEILE LIEGEN BLEIBT — 30 Tage NACH Ablauf
 * ihres Links.
 *
 * Nach Fristablauf ist der Link wertlos; die 30 Tage sind der Puffer für den
 * Menschen, der sich erst im Urlaub wieder meldet („ich hab mich doch
 * eingetragen?"). Danach wird die ZEILE GELÖSCHT und nicht geleert — für diese
 * Adresse gab es NIE eine Einwilligung, es gibt also nichts aufzubewahren.
 * Das ist der Unterschied zu `insights_corrections`, wo die Zeile selbst der
 * Nachweis eines Vorgangs ist.
 */
export const INSIGHTS_NEWSLETTER_PENDING_GRACE_DAYS = 30

/**
 * WAS AN DIE STELLE DER ADRESSE TRITT — `removed:<rowId>`.
 *
 * ── WARUM NICHT EINFACH `''` ────────────────────────────────────────────
 * `emailLower` trägt den UNIQUE-Index (insights-006). Zwei geleerte Zeilen
 * hätten beide den Wert `''`, und MariaDB lehnt den zweiten ab: der Sweep
 * stürbe ab der ZWEITEN abgemeldeten Zeile mit einem 409, und zwar still
 * (fail-soft, einmal am Tag, in einer Logzeile). Ein `null` ginge auch nicht —
 * die Spalte ist Pflicht, weil eine Zeile ohne Vergleichswert gar keinen
 * Eintrag beschreibt.
 *
 * Der Platzhalter löst beides: er ist je Zeile EINDEUTIG (die Zeilen-Id ist
 * es), er ist KEINE Adresse, und er ist als solcher erkennbar — ein Betreiber,
 * der die Tabelle liest, sieht „hier stand mal eine Adresse, sie ist weg"
 * statt eines leeren Feldes, das auch ein Fehler sein könnte.
 *
 * Er ist bewusst KEIN Hash der alten Adresse: ein Hash wäre wieder ein
 * Personenbezug (man kann eine vermutete Adresse dagegen prüfen), und genau
 * den soll die Frist beenden.
 */
export function insightsNewsletterAnonymizedEmail(rowId: string): string {
  return `removed:${rowId}`
}

/** Steht in diesem Feld schon der Platzhalter statt einer Adresse? */
export function insightsNewsletterIsAnonymized(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.startsWith('removed:')
}

/** Was die zwei Sweep-Regeln von einer Zeile brauchen — mehr geht sie nichts an. */
export interface InsightsSubscriberSweepRow {
  readonly email?: string
  readonly emailLower?: string
  readonly ipHash?: string
  readonly tokenExpiresAt?: string | null
  readonly confirmedAt?: string | null
  readonly unsubscribedAt?: string | null
  readonly retentionAt?: string | null
}

/**
 * REGEL 1 — IST DIESE UNBESTÄTIGTE ZEILE ZU LÖSCHEN?
 *
 * Vier Bedingungen, alle notwendig:
 *  1. NICHT bestätigt (`confirmedAt` leer). Eine bestätigte Zeile ist eine
 *     Einwilligung und wird nie gelöscht.
 *  2. NICHT abgemeldet (`unsubscribedAt` leer) — eine abgemeldete Zeile
 *     gehört Regel 2, und zwei Regeln auf derselben Zeile wären ein Rennen.
 *  3. Die Token-Frist ist LESBAR. Fail-Richtung wie bei
 *     `insightsCorrectionSweepDue`: ein unlesbares Datum heißt NICHT „unendlich
 *     alt". Hier wiegt es doppelt, weil diese Regel LÖSCHT — eine Zeile, die
 *     man nicht beurteilen kann, fällt dem Betreiber in der Liste auf, eine
 *     gelöschte nicht mehr.
 *  4. Sie liegt mehr als 30 Tage zurück.
 */
export function insightsNewsletterPendingPurgeDue(row: InsightsSubscriberSweepRow, now: Date): boolean {
  if (row.confirmedAt) return false
  if (row.unsubscribedAt) return false
  const expiry = Date.parse(row.tokenExpiresAt ?? '')
  if (!Number.isFinite(expiry)) return false
  return expiry + INSIGHTS_NEWSLETTER_PENDING_GRACE_DAYS * 24 * 60 * 60 * 1000 <= now.getTime()
}

/**
 * REGEL 2 — IST DIESE ABGEMELDETE ZEILE ZU LEEREN?
 *
 * Vier Fälle, und der letzte ist der wichtigste:
 *  1. Abgemeldet, `retentionAt` erreicht, es steht noch etwas Personenbezogenes
 *     drin ⇒ JA.
 *  2. `retentionAt` in der Zukunft ⇒ NEIN. Der Normalfall der ersten zwölf
 *     Monate und die Gegenprobe des ganzen Sweeps.
 *  3. Kein oder unlesbares `retentionAt` ⇒ NEIN (Fail-Richtung wie oben).
 *  4. Es steht nichts Personenbezogenes mehr drin ⇒ NEIN. Ein zweiter
 *     Schreibvorgang auf dieselbe Zeile änderte nichts und zählte trotzdem als
 *     „geleert" — der Sweep meldete dann jeden Tag dieselbe Arbeit. Der
 *     PLATZHALTER in `emailLower` zählt dabei nicht als Adresse (s.
 *     `insightsNewsletterAnonymizedEmail`), sonst wäre jede geleerte Zeile für
 *     diese Regel auf ewig „noch zu leeren".
 *
 * EXAKT AUF DEM STICHTAG heißt FÄLLIG, und die Abfrage des Sweeps
 * (`lessThanEqual`) zieht dieselbe Grenze: `retentionAt` ist der Zeitpunkt, AB
 * DEM geleert wird, und die Sekunde gehört der Löschung.
 */
export function insightsNewsletterPiiSweepDue(row: InsightsSubscriberSweepRow, now: Date): boolean {
  if (!row.unsubscribedAt) return false
  const stillPersonal = Boolean(row.email)
    || Boolean(row.ipHash)
    || (Boolean(row.emailLower) && !insightsNewsletterIsAnonymized(row.emailLower))
  if (!stillPersonal) return false
  if (!row.retentionAt) return false
  const due = Date.parse(row.retentionAt)
  if (!Number.isFinite(due)) return false
  return due <= now.getTime()
}

// ── 6. Der Abmelde-Weg ─────────────────────────────────────────────────────

export type InsightsNewsletterUnsubscribeAction = 'delete' | 'mark' | 'noop'

/**
 * WAS MIT DIESER ZEILE BEIM ABMELDEN PASSIERT — drei Ausgänge, EINE Antwort
 * nach außen (200, immer).
 *
 *  · `noop` — schon abgemeldet. Der Mensch klickt aus einer alten Mail; ein
 *    409 wäre eine Rüge für etwas, das längst erledigt ist.
 *  · `delete` — die Zeile war NIE bestätigt. Dann ist dieser Klick ein „ich
 *    war das nicht", und es gibt keine Einwilligung aufzubewahren (dieselbe
 *    Begründung wie Regel 1 des Sweeps). Eine stehen gelassene Zeile wäre eine
 *    Adresse ohne jeden Rechtsgrund.
 *  · `mark` — die Zeile war bestätigt. Sie bleibt als Nachweis „hat
 *    eingewilligt und sich abgemeldet", trägt ab jetzt `unsubscribedAt` und
 *    eine Frist, und verliert ihre Token-Felder.
 */
export function decideInsightsNewsletterUnsubscribe(
  row: Pick<InsightsSubscriberSweepRow, 'confirmedAt' | 'unsubscribedAt'>,
): InsightsNewsletterUnsubscribeAction {
  if (row.unsubscribedAt) return 'noop'
  return row.confirmedAt ? 'mark' : 'delete'
}

// ── 7. Der Wortlaut der Bestätigungs-Mail ──────────────────────────────────

export interface InsightsNewsletterMailLinks {
  confirmUrl: string
  unsubscribeUrl: string
}

export interface InsightsNewsletterMailCopy {
  subject: string
  text: string
}

/**
 * DIE EINE MAIL, DIE I5a VERSCHICKT — und sie steht hier und nicht in der
 * Route, damit ein Test sie LESEN kann.
 *
 * Drei Zusagen, die kein Typ hält und die deshalb eine Gegenprobe haben:
 *  1. KEIN TAKT (s. Kopf) — weder im Betreff noch im Text.
 *  2. DER ABMELDE-LINK IST DRIN. Auch in DIESER Mail, obwohl noch nichts
 *     zugestellt wurde: er ist hier das „ich war das nicht", das den offenen
 *     Link sofort tötet (`decideInsightsNewsletterUnsubscribe` ⇒ `delete`).
 *     Die Regel „jede Mail trägt den Abmelde-Link" kennt keine Ausnahme —
 *     sonst wäre die erste Mail die Ausnahme, die der Versand in I5b
 *     abschreibt.
 *  3. KEINE SPITZEN KLAMMERN, kein HTML. Die Mail geht als reiner Text raus
 *     (`sendMail` ohne `html`), und ein Link in Klammern wird von manchen
 *     Programmen mit eingefärbt.
 *
 * Die Texte sind hartverdrahtet zweisprachig und KEINE i18n-Schlüssel —
 * wörtlich die Bauart von `sendBrandWaitlistConfirmMail`: ein Server hat keine
 * Anzeigesprache, nur die Sprache, in der sich jemand eingetragen hat.
 */
export function insightsNewsletterConfirmMailCopy(
  locale: InsightsNewsletterLocale,
  links: InsightsNewsletterMailLinks,
): InsightsNewsletterMailCopy {
  if (locale === 'de') {
    return {
      subject: 'Bitte bestätige deinen Newsletter — Brand Insights',
      text: [
        'ein Klick fehlt noch, dann schicken wir dir Brand Insights.',
        '',
        `Eintrag bestätigen: ${links.confirmUrl}`,
        '',
        'Der Link ist 24 Stunden gültig.',
        '',
        'Wir schreiben, wenn ein neues Stück erscheint.',
        '',
        `Du warst das nicht? Dann trag dich hier wieder aus, und der Link oben ist sofort tot: ${links.unsubscribeUrl}`,
      ].join('\n'),
    }
  }
  return {
    subject: 'Please confirm your newsletter — Brand Insights',
    text: [
      'one click is missing, then we will send you Brand Insights.',
      '',
      `Confirm your sign-up: ${links.confirmUrl}`,
      '',
      'The link is valid for 24 hours.',
      '',
      'We write when a new piece is out.',
      '',
      `Not you? Unsubscribe here and the link above dies right away: ${links.unsubscribeUrl}`,
    ].join('\n'),
  }
}

/**
 * DIE WÖRTER, DIE IN KEINEM NEWSLETTER-TEXT STEHEN DÜRFEN (Davids
 * Entscheidung 2026-10-24, s. Kopf).
 *
 * Sie sind EXPORTIERT, damit der Test sie nicht abschreibt: eine Liste, die in
 * zwei Dateien steht, ist beim ersten Nachtrag nur noch an einer Stelle
 * vollständig. Geprüft wird gegen den kleingeschriebenen Text.
 */
export const INSIGHTS_NEWSLETTER_FORBIDDEN_CADENCE_WORDS = [
  'wöchentlich',
  'jede woche',
  'woche für woche',
  'regelmäßig',
  'weekly',
  'every week',
] as const

// ── 8. Der Versand: wer, wie viele, und was beim zweiten Druck ─────────────

/**
 * DIE SPRACHE EINES EMPFÄNGERS — aus einer FREIEN Spalte, fail-soft auf `en`.
 *
 * `insights_subscribers.locale` ist ein `varchar(8)` mit Default `'en'`; was
 * dort steht, hat ein Formular geschrieben, und eine Zeile aus einer früheren
 * Fassung könnte etwas anderes tragen. Ein `as InsightsNewsletterLocale`
 * darüber wäre eine Behauptung — hier ist es eine Prüfung, und ein unbekannter
 * Wert bekommt die Grundsprache der Seite statt eines Absturzes mitten in
 * einem Stapel.
 */
export function insightsNewsletterLocaleOf(raw: string | undefined | null): InsightsNewsletterLocale {
  return (INSIGHTS_NEWSLETTER_LOCALES as readonly string[]).includes(raw ?? '')
    ? raw as InsightsNewsletterLocale
    : 'en'
}

/** Was die Empfänger-Regel von einer Zeile braucht — mehr geht sie nichts an. */
export interface InsightsNewsletterRecipientRow {
  readonly email?: string
  readonly confirmedAt?: string | null
  readonly unsubscribedAt?: string | null
}

/**
 * WER EINE AUSGABE BEKOMMT — drei Bedingungen, alle notwendig.
 *
 *  1. `confirmedAt` ist gesetzt. Das Double-Opt-in ist die Einwilligung; eine
 *     wartende Zeile hat nie eine gegeben (I5a).
 *  2. `unsubscribedAt` ist LEER. Eine abgemeldete Zeile BLEIBT als Nachweis
 *     stehen (I5a, Regel 2 des Sweeps) — sie ist also sehr wohl in der
 *     Tabelle, und ohne diese Bedingung bekäme genau der Mensch wieder Post,
 *     der darum gebeten hat, keine mehr zu bekommen. Das ist der teuerste
 *     Fehler dieses Pakets.
 *  3. In `email` steht noch eine Adresse. Zwei Fälle, beide echt: der
 *     12-Monats-Sweep LEERT das Feld (`''`), und `emailLower` trägt dann den
 *     Platzhalter `removed:<rowId>` — eine Mail an `''` oder an `removed:…`
 *     wäre ein SMTP-Fehler je Zeile, der den Zähler `failed` füllt und
 *     niemandem hilft. Geprüft wird `email` (die Anschrift), nicht
 *     `emailLower` (der Vergleichswert); der Platzhalter wird dennoch
 *     mitgeprüft, weil eine künftige Fassung ihn auch hier eintragen könnte.
 *
 * Sie ist die ZWEITE Sicherung: die Abfrage des Versands filtert schon über
 * `confirmedAt`/`unsubscribedAt` (Index `idx_confirmed_at`). Beides, weil eine
 * Appwrite-Abfrage „ist nicht leer" nicht für jede Spalte ausdrücken kann und
 * weil ein Filter, der nur in einer Query-Liste steht, beim nächsten Umbau
 * still verschwindet.
 */
export function insightsNewsletterIsRecipient(row: InsightsNewsletterRecipientRow): boolean {
  if (!row.confirmedAt) return false
  if (row.unsubscribedAt) return false
  const email = row.email ?? ''
  if (!email) return false
  return !insightsNewsletterIsAnonymized(email)
}

/**
 * WIE VIELE MAILS EIN AUFRUF VERSCHICKT — fünfzig.
 *
 * Die Route arbeitet EINEN Stapel ab und antwortet; die Dashboard-Seite ruft
 * sie, bis `done`. Drei Gründe, und alle drei sind gemessen an der Alternative
 * „alles in einem Aufruf":
 *  1. Keine Route steht minutenlang offen. Fünfhundert Mails über SMTP sind
 *     Minuten, und ein Reverse-Proxy schliesst eine Antwort, die nicht kommt —
 *     der Versand liefe dann weiter, ohne dass jemand das Ergebnis sieht.
 *  2. Der Mensch sieht einen Balken statt eines hängenden Knopfes.
 *  3. Der Fortschritt ist nach JEDEM Stapel in der Ablage. Ein Abbruch kostet
 *     damit höchstens die fünfzig des laufenden Stapels — nicht fünfhundert.
 */
export const INSIGHTS_NEWSLETTER_BATCH = 50

/** Die drei Zustände einer Sende-Zeile (insights-008). */
export const INSIGHTS_SEND_STATES = ['running', 'done', 'failed'] as const
export type InsightsSendState = (typeof INSIGHTS_SEND_STATES)[number]

export type InsightsSendStartDecision = 'start' | 'resume' | 'already_sent'

/**
 * WAS PASSIERT, WENN JEMAND DEN KNOPF DRÜCKT — vier Fälle, drei Ausgänge.
 *
 *  · KEINE ZEILE ⇒ `start`. Der erste Druck.
 *  · `running` ⇒ `resume`. Entweder arbeitet die Seite ihre Stapel ab (der
 *    Normalfall) oder ein Lauf ist abgebrochen. BEIDES ist derselbe Handgriff:
 *    weiter hinter dem `cursor`. Niemand fängt von vorn an.
 *  · `done` ⇒ `already_sent` (409). DAS ist die Regel „ein Beitrag, eine
 *    Mail". Wer denselben Beitrag ein zweites Mal schicken will, muss das
 *    bewusst tun — und bis heute hat niemand entschieden, dass es diesen Weg
 *    geben soll. Ein stilles „ok, nochmal" wäre die Sorte Bequemlichkeit, die
 *    man an fünfhundert Postfächern bezahlt.
 *  · `failed` ⇒ `resume`. Ein `failed` heisst „am Server stimmte etwas nicht"
 *    (kein Mailer), nicht „die Liste ist durch": der `cursor` steht, und
 *    weitermachen ist genau richtig.
 *
 * Ein UNBEKANNTER Zustandswert zählt wie `running` und damit als `resume` —
 * fail-SAFE in Richtung „nicht von vorn": aus einer unlesbaren Zeile auf
 * `start` zu schliessen hiesse, den `cursor` wegzuwerfen und die halbe Liste
 * doppelt zu bedienen.
 */
export function decideInsightsSendStart(
  existing: { state?: string } | null | undefined,
): InsightsSendStartDecision {
  if (!existing) return 'start'
  return existing.state === 'done' ? 'already_sent' : 'resume'
}

// ── 9. Der Wortlaut einer Ausgabe ──────────────────────────────────────────

/** Der Deckel des einen freien Feldes — dieselbe Zahl wie die Spalte (008). */
export const INSIGHTS_NEWSLETTER_INTRO_MAX = 1000

/**
 * WAS DAS VERSAND-FORMULAR SCHICKEN DARF — die Einleitung, je Sprache eine.
 *
 * `.strict()` wie beim Eintragen: der Betreff, die Sprache und die Adresse
 * kommen aus dem BEITRAG, nicht aus dem Formular. Ein durchgereichter
 * `subject` wäre genau der zweite Text, den Davids Entscheidung ausschliesst
 * (s. Kopf) — und ein durchgereichter `postId` wäre eine Mail über einen
 * anderen Beitrag als den, vor dem der Mensch steht.
 *
 * ── ZWEI FELDER, WEIL DIE MAIL DER SPRACHE DES LESERS FOLGT ──────────────
 * (Davids Entscheidung 2026-10-27, nach dem Klick-Beweis.) Zuerst gab es EIN
 * Feld — und im Beweis stand der deutsche Einleitungssatz über einer sonst
 * englischen Mail, weil der Beitrag selbst zweisprachig ist und die
 * Einleitung nicht. Das ist dieselbe Wunde, die §3.2 auf der Seite vermeidet:
 * Dieses Produkt zeigt niemandem Text in einer Sprache, die er nicht gewählt
 * hat. Wer nur eine Fassung schreibt, erreicht damit nur die Leser dieser
 * Sprache — die anderen bekommen die Mail OHNE Einleitung, nie die fremde
 * (s. `insightsNewsletterIssueCopy`).
 *
 * Gekürzt wird NICHT (anders als `source` beim Eintragen): hier tippt ein
 * Redakteur, und ein stillschweigend abgeschnittener Satz ginge so in
 * fünfhundert Postfächer. Das Formular zeigt denselben Deckel.
 */
export function createInsightsNewsletterSendSchema(t: (key: string) => string = key => key) {
  const field = () => z.string().trim()
    .max(INSIGHTS_NEWSLETTER_INTRO_MAX, { message: t('insights.newsletter.send.introTooLong') })
    .default('')
  return z.object({ introDe: field(), introEn: field() }).strict()
}

/** Die zwei Einleitungen, wie Zeile, Route und Mail-Bau sie herumreichen. */
export interface InsightsNewsletterIntros {
  introDe: string
  introEn: string
}

/**
 * DIE EINLEITUNG FÜR EINEN LESER — oder nichts.
 *
 * Kein Rückfall auf die andere Sprache: lieber eine Mail ohne Einleitung als
 * eine mit einem Satz, den der Empfänger nicht lesen wollte.
 */
export function insightsNewsletterIntroFor(
  intros: InsightsNewsletterIntros,
  locale: InsightsNewsletterLocale,
): string {
  return (locale === 'de' ? intros.introDe : intros.introEn).trim()
}

export type InsightsNewsletterSendInput
  = z.output<ReturnType<typeof createInsightsNewsletterSendSchema>>

export interface InsightsNewsletterIssueLinks {
  /** Die ÖFFENTLICHE Adresse des Beitrags, absolut. */
  postUrl: string
  /** Der Abmelde-Link DIESES Empfängers — nie ein geteilter. */
  unsubscribeUrl: string
}

/**
 * DIE AUSGABE-MAIL — der Wortlaut steht hier und nicht in der Route, damit ein
 * Test sie LESEN kann (wörtlich dieselbe Wahl wie bei der Bestätigungs-Mail).
 *
 * ── BETREFF = TITEL DER FASSUNG. Nichts davor, nichts danach ────────────
 * Kein „Brand Insights:"-Präfix, keine Ausgabennummer. Der Titel ist das, was
 * den Menschen interessiert, und ein Präfix kostet in der Betreffzeile eines
 * Telefons genau die Zeichen, die der Titel braucht. Eine NUMMER wäre zudem
 * ein Takt-Versprechen durch die Hintertür („Ausgabe 7" lässt eine achte
 * erwarten).
 *
 * ── DIE SPRACHE IST DIE DES EMPFÄNGERS, MIT RÜCKFALL ────────────────────
 * Aufgelöst über `insightsPublicKopf` — die körperlose Hälfte von
 * `insightsPublicFassung` und damit DIESELBE Entscheidung, die auch die Seite
 * und `hreflang` treffen: die Nicht-Grundsprache erscheint nur mit
 * `translationReviewed === true`, sonst geht die GRUNDFASSUNG raus. „Eine
 * maschinell erzeugte, unredigierte Fassung ist NIE öffentlich" (§3.2) gilt in
 * der Mail genauso wie auf der Seite — eine Mail ist öffentlicher als eine
 * Seite, man kann sie nicht zurückziehen. Der KOPF reicht, weil die Mail den
 * Fliesstext nicht trägt (sie verlinkt ihn); zwei Artikel-Fassungen nur für
 * eine Betreffzeile wären ein Megabyte je Empfänger im Speicher.
 *
 * ── VIER TEILE, IN DIESER REIHENFOLGE ───────────────────────────────────
 *  1. Die eigene Einleitung, wenn es eine gibt. Sie steht OBEN, weil sie der
 *     persönliche Teil ist; darunter wird es sachlich.
 *  2. Der Vorspann des Beitrags.
 *  3. Die Adresse. Als nackte URL in eigener Zeile, nicht in Klammern: ein
 *     Link in spitzen Klammern wird von manchen Programmen mit eingefärbt, und
 *     spitze Klammern sind hier ohnehin verboten (reiner Text, kein HTML).
 *  4. Der Fuss: „Du bekommst das, weil du dich eingetragen hast" plus der
 *     Abmelde-Link DIESES Empfängers. Die Regel „jede Mail trägt den
 *     Abmelde-Link" kennt keine Ausnahme (I5a) — und der Grund steht dabei,
 *     weil eine unerwartete Mail ohne Grund wie Spam aussieht.
 *
 * ── KEIN HTML, UND DAS IST EINE ENTSCHEIDUNG (2026-10-27) ───────────────
 * Jede Mail dieses Repos ist heute reiner Text (`sendBrandWaitlistConfirmMail`,
 * die DOI-Mail aus I5a). Eine HTML-Vorlage wäre eine ZWEITE Darstellung
 * desselben Inhalts, dazu Bildpfade, Dark-Mode-Fragen und eine eigene
 * Prüfstrecke über ein Dutzend Mail-Programme — ein eigenes Vorhaben, kein
 * Nebenprodukt dieses Pakets. `sendMail` wird deshalb bewusst OHNE `html`
 * gerufen.
 *
 * ── UND KEIN TAKT ───────────────────────────────────────────────────────
 * Weder im Betreff noch im Text (Davids Entscheidung, s. Kopf). Der Test
 * prüft diese Funktion gegen `INSIGHTS_NEWSLETTER_FORBIDDEN_CADENCE_WORDS`.
 */
export function insightsNewsletterIssueCopy(
  post: InsightsPostHead,
  intros: InsightsNewsletterIntros,
  locale: InsightsNewsletterLocale,
  links: InsightsNewsletterIssueLinks,
): InsightsNewsletterMailCopy {
  const kopf = insightsPublicKopf(post, locale)
  // Die Einleitung folgt der Fassung, die der Leser wirklich bekommt — nicht
  // der angeforderten: fällt der Beitrag nach §3.2 auf seine Grundsprache
  // zurück, täte ein Satz in der anderen Sprache darüber genau das, was der
  // Rückfall gerade vermeidet.
  const trimmedIntro = insightsNewsletterIntroFor(intros, kopf.locale)
  const lines: string[] = []

  if (trimmedIntro) lines.push(trimmedIntro, '')
  if (kopf.dek) lines.push(kopf.dek, '')

  if (kopf.locale === 'de') {
    lines.push(
      'Lesen:',
      links.postUrl,
      '',
      `Du bekommst das, weil du dich eingetragen hast. Abmelden: ${links.unsubscribeUrl}`,
    )
  }
  else {
    lines.push(
      'Read it:',
      links.postUrl,
      '',
      `You are getting this because you signed up. Unsubscribe: ${links.unsubscribeUrl}`,
    )
  }

  return { subject: kopf.title, text: lines.join('\n') }
}
