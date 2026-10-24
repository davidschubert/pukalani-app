import { z } from 'zod'

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
