import { Buffer } from 'node:buffer'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import type { InsightsNewsletterIntros, InsightsNewsletterLocale } from '../../shared/insightsNewsletter'
import { insightsNewsletterConfirmMailCopy, insightsNewsletterIdempotencyKey, insightsNewsletterIssueCopy } from '../../shared/insightsNewsletter'
import type { InsightsPostHead } from '../../shared/insightsPost'
import { insightsPublicKopf } from '../../shared/insightsPost'
// AUSDRÜCKLICH importiert, nicht per Auto-Import wie `sendMail`: der Absender
// entscheidet, von welcher Domain eine Massenmail ausgeht. Ein Auto-Import,
// den ein Testlauf nicht auflöst, wäre still ein leerer String gewesen — die
// Mail ginge raus, nur wieder von der Hauptdomain, und kein Test sähe es.
import { insightsNewsletterAuth, insightsNewsletterSender } from './insightsPublic'

/**
 * DIE ZWEI TOKEN DES NEWSLETTERS UND DIE ZWEI MAILS, DIE ER VERSCHICKT —
 * die Bestätigung (I5a) und eine Ausgabe (I5b).
 *
 * Hier liegt alles, was `node:crypto` braucht oder einen Request kennt; die
 * REGELN (Fristen, Drossel, Schemas, Wortlaut) stehen in
 * `shared/insightsNewsletter.ts` und haben dort ihre Gegenprobe. Der STAPEL-
 * Versand selbst (Empfänger zählen, Cursor, Sende-Zeile) liegt in
 * `insightsNewsletterSend.ts` — er braucht Appwrite, diese Datei nicht.
 *
 * ── ZWEI TOKEN, WEIL ES ZWEI VERSCHIEDENE FRAGEN SIND ───────────────────
 *
 * 1. DER BESTÄTIGUNGS-TOKEN ist ein ZUFALLSWERT (32 Bytes als hex), gespeichert
 *    als sha256 in `tokenHash`, gültig 24 Stunden, und er wird beim Bestätigen
 *    GELÖSCHT. Wörtlich das Verfahren der Warteliste (brand-015): der rohe
 *    Token lebt nur in der Mail, wer die Tabelle liest, kann damit keinen Link
 *    bauen, und ein weitergeleiteter alter Link ist tot. KEIN SALZ, und das ist
 *    richtig: 32 Zufalls-Bytes errät kein Wörterbuch, und erst ein
 *    deterministischer Hash macht die Spalte abfragbar.
 *
 * 2. DER ABMELDE-TOKEN ist ABGELEITET und wird NICHT gespeichert:
 *    `<rowId>.<hmac(secret, rowId)>`. Er muss ewig gelten und er muss sich
 *    SPÄTER NEU BILDEN lassen — jede Ausgabe (I5b) trägt den Abmelde-Link, und
 *    zu diesem Zeitpunkt existiert der Zufalls-Token aus (1) längst nicht mehr.
 *    Aus einem HASH lässt sich kein Link bauen; eine zweite Spalte mit dem
 *    ROHEN Geheimnis wäre ein dauerhaft lesbares Passwort in der Ablage. Die
 *    Ableitung löst beides: nichts liegt gespeichert, und der Link ist aus der
 *    Zeile allein wieder herstellbar.
 *
 *    DIE ZEILEN-ID ALLEIN WÄRE KEIN TOKEN: Appwrite-Ids sind keine Geheimnisse
 *    (Zeitstempel plus wenige Zufallszeichen), und wer sie errät, meldete
 *    Fremde ab. Erst die Signatur macht daraus einen Beweis.
 *
 *    EIN EIGENES GEHEIMNIS (SEC-020, 2026-11-15): signiert wurde bis dahin
 *    mit `NUXT_APPWRITE_KEY` — jeder Tausch des API-Schlüssels tötete still
 *    alle verschickten Abmelde-Links. Jetzt signiert
 *    `NUXT_INSIGHTS_NEWSLETTER_SECRET`, und ein Wechsel dieses Geheimnisses
 *    behält das alte als `…_PREVIOUS` zum Prüfen. Die Regel steht in
 *    `insightsNewsletterSecrets` (pur, mit Gegenprobe). Ein Link, den KEIN
 *    Schlüssel bestätigt, meldet nicht ab und sieht auch nicht so aus — die
 *    Seite sagt ehrlich „dieser Link hat dich nicht abgemeldet".
 *
 * ── DER TOKEN STEHT IN KEINER LOG-ZEILE ─────────────────────────────────
 * Auch nicht gekürzt, auch nicht im Fehlerfall — dieselbe Regel wie beim
 * Share- und beim Warteliste-Token. Geloggt werden Zeilen-Id und Ausgang.
 */

/** 32 Zufalls-Bytes als hex — 64 Zeichen, dieselbe Stärke wie der Share-Token. */
export function createInsightsNewsletterToken(): string {
  return randomBytes(32).toString('hex')
}

/** Die EINE Rechnung; zwei Kopien wären der Weg zu zwei toten Links. */
export function hashInsightsNewsletterToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export interface InsightsNewsletterSecretInput {
  /** `runtimeConfig.insightsNewsletterSecret` — das Geheimnis der Links. */
  current: string
  /** `runtimeConfig.insightsNewsletterSecretPrevious` — das vor dem letzten Wechsel. */
  previous: string
  /** `runtimeConfig.appwriteKey` — der bisherige Schlüssel (Übergang). */
  legacy: string
}

export interface InsightsNewsletterSecrets {
  /** Damit wird ein NEUER Link gebaut; `null` = es gibt keinen. */
  sign: string | null
  /** Damit wird ein ankommender Link geprüft — in dieser Reihenfolge. */
  verify: string[]
}

/**
 * DIE SCHLÜSSEL DES ABMELDE-LINKS (SEC-020) — pur, ohne Nitro.
 *
 * SIGNIEREN: das eigene Geheimnis, wenn gesetzt; sonst (Übergang, solange der
 * Wert auf dem Server fehlt) der bisherige API-Schlüssel — die Seite läuft
 * ohne den neuen Eintrag also genau wie vorher. Das VORHERIGE Geheimnis
 * signiert nie, es prüft nur.
 *
 * PRÜFEN: neu, vorher, bisheriger API-Schlüssel — ohne Leere, ohne Doppelte.
 * Der API-Schlüssel bleibt in der Prüfung OHNE FRIST (Davids Entscheidung
 * 2026-11-15): ein Link aus einer älteren Mail meldet weiter ab. Das kostet
 * nichts — geprüft wird nur, signiert wird damit nicht mehr, sobald das eigene
 * Geheimnis gesetzt ist. Wird der API-Schlüssel selbst getauscht, sterben nur
 * noch die Links aus der Zeit VOR dem eigenen Geheimnis.
 *
 * KEIN FESTER RÜCKFALL-TEXT mehr: bis SEC-020 stand hier
 * `'insights-newsletter'` — eine Signatur, die jeder nachrechnen kann. Ist gar
 * kein Schlüssel da, gibt es keinen Signier-Schlüssel; der Versand schickt
 * dann keine Mail, und die Abmelde-Route antwortet 503.
 */
export function insightsNewsletterSecrets(input: InsightsNewsletterSecretInput): InsightsNewsletterSecrets {
  const current = input.current.trim()
  const previous = input.previous.trim()
  const legacy = input.legacy.trim()
  const verify: string[] = []
  for (const key of [current, previous, legacy]) {
    if (key && !verify.includes(key)) verify.push(key)
  }
  return { sign: current || legacy || null, verify }
}

/** Dieselbe Regel, mit den Werten aus der Laufzeit-Konfiguration (server-only). */
function insightsNewsletterSecretsFor(event?: H3Event): InsightsNewsletterSecrets {
  const config = useRuntimeConfig(event)
  return insightsNewsletterSecrets({
    current: String(config.insightsNewsletterSecret ?? ''),
    previous: String(config.insightsNewsletterSecretPrevious ?? ''),
    legacy: String(config.appwriteKey ?? ''),
  })
}

/** Die Signatur über eine Zeilen-Id — 32 hex, eigener Namensraum im Text. */
function insightsNewsletterSignature(rowId: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`insights|newsletter|unsubscribe|${rowId}`, 'utf8')
    .digest('hex')
    .slice(0, 32)
}

/**
 * DER ABMELDE-TOKEN EINER ZEILE. `secret` ist ein ARGUMENT, damit ein Test ihn
 * ohne Nitro bilden und nachprüfen kann (dieselbe Wahl wie bei den `deps` des
 * Radar-Sweeps).
 */
export function insightsNewsletterUnsubToken(rowId: string, secret: string): string {
  return `${rowId}.${insightsNewsletterSignature(rowId, secret)}`
}

/**
 * WELCHE ZEILE MEINT DIESER ABMELDE-TOKEN? `null` heisst „keine" — und zwar
 * für jeden Grund gleich: falsche Form, falsche Signatur, leere Id.
 *
 * `secret` darf eine LISTE sein (SEC-020): der Token gilt, wenn EINE
 * Signatur passt. Leere Liste ⇒ nichts gilt.
 *
 * Verglichen wird mit `timingSafeEqual`. Nicht aus Angst vor einem echten
 * Timing-Angriff auf eine Abmelde-Route, sondern weil die Alternative (`===`)
 * an genau der Stelle steht, an der ein späterer Leser sie für ausreichend
 * hält und sie in die nächste Prüfung kopiert.
 */
export function readInsightsNewsletterUnsubToken(token: string, secret: string | readonly string[]): string | null {
  const at = token.lastIndexOf('.')
  if (at <= 0) return null
  const rowId = token.slice(0, at)
  const signature = Buffer.from(token.slice(at + 1))
  const secrets = typeof secret === 'string' ? [secret] : secret
  for (const key of secrets) {
    const expected = Buffer.from(insightsNewsletterSignature(rowId, key))
    if (signature.length === expected.length && timingSafeEqual(signature, expected)) return rowId
  }
  return null
}

/**
 * Der Token für eine Zeile, mit dem Signier-Schlüssel der Laufzeit.
 * `null` = es gibt keinen Schlüssel — dann darf KEINE Mail mit Abmelde-Link
 * gebaut werden (beide Aufrufer unten brechen ab).
 */
export function insightsNewsletterUnsubTokenFor(event: H3Event, rowId: string): string | null {
  const { sign } = insightsNewsletterSecretsFor(event)
  return sign ? insightsNewsletterUnsubToken(rowId, sign) : null
}

/**
 * Welche Zeile meint dieser Token — geprüft gegen ALLE gültigen Schlüssel.
 * Ohne jeden Schlüssel wirft sie 503 `newsletter_unconfigured`: dann lässt
 * sich ein Link weder als gültig noch als ungültig erkennen, und „ungültig"
 * wäre eine falsche Auskunft an jemanden mit einem echten Link.
 */
export function insightsNewsletterRowIdFromToken(event: H3Event, token: string): string | null {
  const { verify } = insightsNewsletterSecretsFor(event)
  if (!verify.length) {
    logEvent('error', 'insights.newsletter_unconfigured', { where: 'unsubscribe' })
    throw createError({
      status: 503,
      statusText: 'Newsletter not configured',
      data: { code: 'newsletter_unconfigured' },
    })
  }
  return readInsightsNewsletterUnsubToken(token, verify)
}

/**
 * DIE BASIS DER MAIL-LINKS.
 *
 * `public.appUrl` ist die Konvention aller Mail-Links dieses Repos; auf
 * `branding` steht dort in Produktion `https://branding.supply`. Der Rückfall
 * darauf ist BEWUSST hart verdrahtet — dieselbe Form wie
 * `brandWaitlistConfirmUrl`: eine Mail mit einem RELATIVEN Link wäre eine Mail
 * ohne Link, und dieser Layer hat genau einen Host.
 */
function insightsNewsletterBaseUrl(event: H3Event): string {
  const configured = useRuntimeConfig(event).public.appUrl || ''
  return (configured || 'https://branding.supply').replace(/\/+$/, '')
}

/**
 * Das Sprach-Präfix der App (`prefix_except_default`: en ohne, de unter
 * `/de`). Ein deutscher Empfänger soll nicht auf einer englischen Seite
 * landen — und `localePath()` gibt es im Server-Kontext nicht.
 */
function insightsNewsletterPath(locale: InsightsNewsletterLocale, path: string, token: string): string {
  const prefix = locale === 'de' ? '/de' : ''
  return `${prefix}${path}?token=${encodeURIComponent(token)}`
}

export function insightsNewsletterConfirmUrl(
  event: H3Event,
  token: string,
  locale: InsightsNewsletterLocale,
): string {
  return `${insightsNewsletterBaseUrl(event)}${insightsNewsletterPath(locale, '/newsletter/confirm', token)}`
}

export function insightsNewsletterUnsubscribeUrl(
  event: H3Event,
  token: string,
  locale: InsightsNewsletterLocale,
): string {
  return `${insightsNewsletterBaseUrl(event)}${insightsNewsletterPath(locale, '/newsletter/unsubscribe', token)}`
}

/**
 * DIE ÖFFENTLICHE ADRESSE EINES BEITRAGS, ABSOLUT UND IN DER SPRACHE DES
 * EMPFÄNGERS (I5b).
 *
 * `href` kommt aus `insightsPublicHref` und trägt BEWUSST keinen
 * Sprach-Präfix — den setzt auf der Seite `localePath()`, und im Server-Kontext
 * gibt es das nicht. Hier wird er deshalb genauso gesetzt wie bei den zwei
 * Token-Links darüber: `prefix_except_default`, en ohne, de unter `/de`. Ein
 * deutscher Leser soll nicht auf einer englischen Seite landen.
 *
 * Die SPRACHE ist die der FASSUNG, die in der Mail steht (der Rückfall aus
 * `insightsPublicKopf`), nicht die des Abonnenten — sonst zeigte der Link auf
 * `/de/...` und die Seite lieferte dort die englische Grundfassung.
 */
export function insightsNewsletterPostUrl(
  event: H3Event,
  href: string,
  locale: InsightsNewsletterLocale,
): string {
  const prefix = locale === 'de' ? '/de' : ''
  return `${insightsNewsletterBaseUrl(event)}${prefix}${href}`
}

/** `x***@domain` — die Maskierung aus `mailer.ts`, hier für das Log. */
export function maskInsightsNewsletterEmail(value: string): string {
  return value.replace(/(.).*(@.*)/, '$1***$2')
}

export interface InsightsNewsletterConfirmMailInput {
  to: string
  /** Der ROHE Bestätigungs-Token — er existiert genau hier und in der Mail. */
  token: string
  /** Die Zeilen-Id; aus ihr wird der Abmelde-Link abgeleitet. */
  rowId: string
  locale: InsightsNewsletterLocale
}

/**
 * DIE BESTÄTIGUNGS-MAIL — die EINZIGE Mail dieses Pakets, und die einzige, die
 * NICHT fail-soft sein darf.
 *
 * Ohne sie gibt es keinen Link, und ohne Link kann niemand bestätigen; ein
 * „schau in dein Postfach" im Formular wäre dann eine Lüge. Sie sagt deshalb
 * ehrlich `false` — die Route macht daraus ein 503, die Zeile bleibt
 * unbestätigt stehen, und der nächste Versuch derselben Adresse legt einen
 * frischen Link nach.
 *
 * `false` deckt BEIDE Ausfälle ab: den geworfenen SMTP-Fehler und den stillen
 * Fall „kein Mailer konfiguriert" (`sendMail` gibt dort `false` zurück, OHNE
 * zu werfen — das ist die Falle, an der ein `.catch(() => false)` allein
 * vorbeiliefe; wörtlich die Begründung aus `sendBrandWaitlistConfirmMail`).
 */
export async function sendInsightsNewsletterConfirmMail(
  event: H3Event,
  input: InsightsNewsletterConfirmMailInput,
): Promise<boolean> {
  // Ohne Signier-Schlüssel KEINE Mail (SEC-020): ein Abmelde-Link mit
  // erratbarer Signatur wäre ein Link, mit dem jeder Fremde abmeldet. `false`
  // nimmt den vorhandenen Weg der Route (503, Zeile bleibt unbestätigt).
  const unsubToken = insightsNewsletterUnsubTokenFor(event, input.rowId)
  if (!unsubToken) {
    logEvent('error', 'insights.newsletter_unconfigured', { where: 'confirm_mail' })
    return false
  }
  const copy = insightsNewsletterConfirmMailCopy(input.locale, {
    confirmUrl: insightsNewsletterConfirmUrl(event, input.token, input.locale),
    unsubscribeUrl: insightsNewsletterUnsubscribeUrl(event, unsubToken, input.locale),
  })

  try {
    return await sendMail(event, {
      to: input.to,
      subject: copy.subject,
      text: copy.text,
      // Der Newsletter-Absender gilt AUCH hier (RS1): die Bestätigung ist
      // zwar eine Einzelmail, gehört aber zum Newsletter-Strom — sie wird
      // durch die Eintragung ins Formular ausgelöst, also durch genau das,
      // was auch Beschwerden auslöst. Leer ⇒ unverändert `NUXT_SMTP_FROM`.
      from: insightsNewsletterSender(),
      // Und der eigene Zugang dazu: ein eigener Absender OHNE den passenden
      // Schlüssel ist genau der gemessene 403. Die beiden gehören zusammen.
      auth: insightsNewsletterAuth(event),
    })
  }
  catch (error) {
    // Ohne Adresse und ohne Token: das Log sagt DASS, nicht AN WEN und womit.
    logEvent('warn', 'insights.newsletter_mail_failed', {
      message: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

// ── Die Ausgabe-Mail (I5b) ─────────────────────────────────────────────────

export interface InsightsNewsletterIssueMailInput {
  to: string
  /** Die Zeilen-Id des ABONNENTEN — aus ihr wird sein Abmelde-Link abgeleitet. */
  subscriberId: string
  /** Die Zeilen-Id der SENDE-Zeile — Teil des Idempotenz-Schlüssels
   *  (`insightsNewsletterIdempotencyKey`). */
  sendId: string
  /** Der Beitrag (nur Kopf: Titel, Vorspann, Grundsprache, Redigier-Häkchen). */
  post: InsightsPostHead
  /** Die eigenen zwei, drei Sätze — '' ist der Normalfall. */
  intros: InsightsNewsletterIntros
  /** Der Pfad des Beitrags OHNE Sprach-Präfix (`insightsPublicHref`). */
  href: string
  /** Die Sprache DIESES Empfängers (`insights_subscribers.locale`). */
  locale: InsightsNewsletterLocale
}

/**
 * VIER AUSGÄNGE, UND DER UNTERSCHIED IST DER GANZE PUNKT.
 *
 *  · `'sent'` — draussen.
 *  · `'failed'` — DIESE Mail ging nicht (SMTP hat geworfen: Adresse abgelehnt,
 *    Postfach voll, Zeitüberschreitung). Das ist ein Problem EINER Adresse. Der
 *    Lauf zählt sie in `failed`, rückt den Cursor trotzdem vor und macht
 *    weiter — sonst hängt ein Versand an fünfhundert Empfänger für immer an
 *    einer kaputten Adresse, und zwar bei jedem Fortsetzen von vorn an
 *    derselben.
 *  · `'no_mailer'` — es gibt gar keinen Versandweg (`sendMail` gibt dort still
 *    `false` zurück, OHNE zu werfen; die Falle, an der ein `.catch` allein
 *    vorbeiliefe). Das ist ein Problem des SERVERS, nicht einer Adresse: der
 *    Lauf bricht ab und geht auf `failed`. Würde er das als „diese Adresse
 *    ging nicht" zählen, liefe er über die ganze Liste und meldete am Ende
 *    fünfhundert Fehlschläge — nach aussen nicht unterscheidbar von fünfhundert
 *    kaputten Adressen, und der `cursor` stünde am Ende. Niemand bekäme dann
 *    je eine Mail, und ein Fortsetzen wäre unmöglich.
 *  · `'unconfigured'` — es gibt keinen Schlüssel für den Abmelde-Link
 *    (SEC-020). Ebenfalls ein Problem des SERVERS: der Lauf bricht ab wie bei
 *    `'no_mailer'`, und es geht keine Mail mit erratbarem Link raus.
 *
 * `html` wird BEWUSST nicht gesetzt (Begründung am Wortlaut in `shared/`).
 * `List-Unsubscribe` trägt den Abmelde-Link DIESES Empfängers, in spitzen
 * Klammern (so verlangt es der Header) — ohne `List-Unsubscribe-Post`, weil
 * One-Click nach RFC 8058 einen Endpunkt ohne Token im Körper braucht
 * (Begründung am `headers`-Feld von `MailInput`).
 */
export async function sendInsightsNewsletterIssueMail(
  event: H3Event,
  input: InsightsNewsletterIssueMailInput,
): Promise<'sent' | 'failed' | 'no_mailer' | 'unconfigured'> {
  const unsubToken = insightsNewsletterUnsubTokenFor(event, input.subscriberId)
  if (!unsubToken) {
    logEvent('error', 'insights.newsletter_unconfigured', { where: 'issue_mail' })
    return 'unconfigured'
  }
  // Welche FASSUNG geht raus? Dieselbe reine Entscheidung, die auch die Seite
  // trifft — der Link muss auf die Sprache zeigen, die in der Mail steht, nicht
  // auf die des Abonnenten (sonst `/de/...` mit englischem Text dahinter).
  const fassung = insightsPublicKopf(input.post, input.locale)
  const unsubscribeUrl = insightsNewsletterUnsubscribeUrl(event, unsubToken, input.locale)
  const copy = insightsNewsletterIssueCopy(input.post, input.intros, input.locale, {
    postUrl: insightsNewsletterPostUrl(event, input.href, fassung.locale),
    unsubscribeUrl,
  })

  try {
    const ok = await sendMail(event, {
      to: input.to,
      subject: copy.subject,
      text: copy.text,
      // Die eigene Versand-Subdomain (RS1) — leer ⇒ `NUXT_SMTP_FROM`.
      from: insightsNewsletterSender(),
      auth: insightsNewsletterAuth(event),
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'Resend-Idempotency-Key': insightsNewsletterIdempotencyKey(input.sendId, input.subscriberId),
      },
    })
    return ok ? 'sent' : 'no_mailer'
  }
  catch (error) {
    // Ohne Adresse, ohne Token: das Log sagt DASS, nicht AN WEN.
    logEvent('warn', 'insights.newsletter_send_failed', {
      message: error instanceof Error ? error.message : String(error),
    })
    return 'failed'
  }
}
