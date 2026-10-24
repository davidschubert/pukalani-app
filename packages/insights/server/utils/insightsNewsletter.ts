import { Buffer } from 'node:buffer'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import type { InsightsNewsletterLocale } from '../../shared/insightsNewsletter'
import { insightsNewsletterConfirmMailCopy } from '../../shared/insightsNewsletter'

/**
 * DIE ZWEI TOKEN DES NEWSLETTERS UND DIE EINE MAIL, DIE I5a VERSCHICKT.
 *
 * Hier liegt alles, was `node:crypto` braucht oder einen Request kennt; die
 * REGELN (Fristen, Drossel, Schemas, Wortlaut) stehen in
 * `shared/insightsNewsletter.ts` und haben dort ihre Gegenprobe.
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
 *    DER PREIS, UND ER IST BENANNT: wird `NUXT_APPWRITE_KEY` getauscht
 *    (Runbook „Key-Swap"), sind alle bis dahin verschickten Abmelde-Links tot.
 *    Deshalb antwortet die Seite auf einen ungültigen Token NICHT mit einem
 *    Fehler, sondern mit dem Satz „dann trag dich einfach nicht wieder ein"
 *    plus der Adresse der Redaktion — ein Mensch, der sich abmelden will, darf
 *    nie in einer Sackgasse stehen. Dieselbe Abhängigkeit hat `insightsIpHash`
 *    (er salzt mit demselben Geheimnis); ein EIGENER Env-Eintrag wäre ein
 *    weiterer Schlüssel, den eine Instanz vergessen kann — und ein vergessener
 *    Schlüssel wäre dasselbe Problem, nur sofort statt selten.
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

/**
 * DAS GEHEIMNIS DER ABLEITUNG — server-only, nie im Bündel des Browsers.
 *
 * Der Rückfall ist eine Zeichenkette und NICHT leer: ein `hmac` mit leerem
 * Schlüssel wäre eine Signatur, die jeder nachrechnen kann. Ohne gesetzten
 * Schlüssel (lokaler Lauf ohne `.env`) sind die Links damit zwar
 * vorhersagbar — dort gibt es aber auch keine Empfänger.
 */
function insightsNewsletterSecret(event?: H3Event): string {
  return useRuntimeConfig(event).appwriteKey || 'insights-newsletter'
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
 * Verglichen wird mit `timingSafeEqual`. Nicht aus Angst vor einem echten
 * Timing-Angriff auf eine Abmelde-Route, sondern weil die Alternative (`===`)
 * an genau der Stelle steht, an der ein späterer Leser sie für ausreichend
 * hält und sie in die nächste Prüfung kopiert.
 */
export function readInsightsNewsletterUnsubToken(token: string, secret: string): string | null {
  const at = token.lastIndexOf('.')
  if (at <= 0) return null
  const rowId = token.slice(0, at)
  const signature = token.slice(at + 1)
  const expected = insightsNewsletterSignature(rowId, secret)
  if (signature.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
  return rowId
}

/** Dasselbe, aber mit dem Geheimnis aus der Laufzeit-Konfiguration. */
export function insightsNewsletterUnsubTokenFor(event: H3Event, rowId: string): string {
  return insightsNewsletterUnsubToken(rowId, insightsNewsletterSecret(event))
}

export function insightsNewsletterRowIdFromToken(event: H3Event, token: string): string | null {
  return readInsightsNewsletterUnsubToken(token, insightsNewsletterSecret(event))
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
  const copy = insightsNewsletterConfirmMailCopy(input.locale, {
    confirmUrl: insightsNewsletterConfirmUrl(event, input.token, input.locale),
    unsubscribeUrl: insightsNewsletterUnsubscribeUrl(
      event,
      insightsNewsletterUnsubTokenFor(event, input.rowId),
      input.locale,
    ),
  })

  try {
    return await sendMail(event, { to: input.to, subject: copy.subject, text: copy.text })
  }
  catch (error) {
    // Ohne Adresse und ohne Token: das Log sagt DASS, nicht AN WEN und womit.
    logEvent('warn', 'insights.newsletter_mail_failed', {
      message: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
