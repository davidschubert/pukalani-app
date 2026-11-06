import { createHash, randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import type { BrandWaitlistLocale } from '../../schemas/brandWaitlist'

/**
 * DAS DOUBLE-OPT-IN DER WARTELISTE — Token, Frist und die zwei Mails, an EINER
 * Stelle, weil beide Routen sie brauchen (Eintragen bildet den Hash,
 * Bestätigen vergleicht ihn).
 *
 * ── WARUM ÜBERHAUPT (Davids Entscheidung) ─────────────────────────────────
 * „Sonst spammen die mir das Fach voll." Die alte Route schrieb sofort und
 * meldete sofort — eine fremde Adresse einzutragen kostete einen Klick, und
 * die Betreiber-Mail ging trotzdem raus. Seit dem Opt-in zählt eine Zeile erst,
 * wenn jemand den Link in SEINEM Postfach geöffnet hat; erst dann meldet die
 * Warteliste weiter. Das schützt zwei Menschen zugleich: den Betreiber vor
 * erfundenen Anfragen und den Fremden davor, ohne sein Zutun auf einer Liste zu
 * stehen.
 *
 * ── DER ROHE TOKEN LEBT NUR IN DER MAIL ───────────────────────────────────
 * Gespeichert wird sein sha256 (`tokenHash`), genau wie beim Share-Token und
 * bei `community_invites`. KEIN SALZ, und das ist richtig: 32 Zufalls-Bytes
 * sind nichts, was ein Wörterbuch errät, und erst ein deterministischer Hash
 * macht die Spalte überhaupt abfragbar (`idx_token_hash`). Im LOG steht er
 * nie — auch nicht gekürzt, auch nicht im Fehlerfall.
 *
 * ── 24 STUNDEN, UND DER ALTE VERFÄLLT ─────────────────────────────────────
 * Jede neue Anfrage derselben Adresse ÜBERSCHREIBT den Hash. Damit ist immer
 * höchstens ein Link gültig — wer zweimal auf „eintragen" drückt und dann die
 * erste Mail öffnet, landet in einem 400 statt in einer Bestätigung. Das ist
 * der Preis dafür, dass ein weitergeleiteter alter Link nichts mehr kann, und
 * er ist es wert: der zweite Klick auf die NEUERE Mail funktioniert.
 */

/** 32 Zufalls-Bytes als hex — 64 Zeichen, dieselbe Stärke wie der Share-Token. */
export function createBrandWaitlistToken(): string {
  return randomBytes(32).toString('hex')
}

/** Die EINE Rechnung; zwei Kopien wären der Weg zu zwei toten Links. */
export function hashBrandWaitlistToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Die Frist eines frischen Links: 24 Stunden ab jetzt, als ISO-Zeichenkette. */
export const BRAND_WAITLIST_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

export function brandWaitlistTokenExpiry(now: number = Date.now()): string {
  return new Date(now + BRAND_WAITLIST_TOKEN_TTL_MS).toISOString()
}

/**
 * IST DIE FRIST ABGELAUFEN? Ein FEHLENDES oder kaputtes Datum gilt als
 * abgelaufen (fail-closed, dieselbe Regel wie im Share-GET): ein Link ohne
 * Frist wäre ein dauerhafter Zugang, den niemand beschlossen hat.
 */
export function brandWaitlistTokenExpired(value: string | undefined, now: number = Date.now()): boolean {
  const at = Date.parse(value ?? '')
  return !Number.isFinite(at) || at <= now
}

/** `x***@domain` — die Maskierung aus `mailer.ts`, hier für das Log. */
export function maskBrandWaitlistEmail(value: string): string {
  return value.replace(/(.).*(@.*)/, '$1***$2')
}

/**
 * DIE BASIS DES BESTÄTIGUNGS-LINKS.
 *
 * `public.appUrl` ist die Konvention aller Mail-Links dieses Repos (Missbrauchs-
 * Meldung, Anfragen-Zuweisung, `notificationLinks.ts`); auf `branding` steht
 * dort in Produktion `https://branding.supply` (Infra-Plan §4). Der Rückfall
 * darauf ist BEWUSST hart verdrahtet — dieselbe Form wie `sendInviteMail`, die
 * `https://account.pukalani.app` einsetzt: eine Mail mit einem RELATIVEN Link
 * wäre eine Mail ohne Link, und dieser Layer hat genau einen Host.
 */
function brandWaitlistBaseUrl(event: H3Event): string {
  const configured = useRuntimeConfig(event).public.appUrl || ''
  return (configured || 'https://branding.supply').replace(/\/+$/, '')
}

/**
 * Der Link in die Mail. Die Sprache entscheidet über das Präfix, weil die App
 * `prefix_except_default` fährt (en ohne, de unter `/de`) — ein deutscher
 * Empfänger soll nicht auf einer englischen Seite landen.
 */
export function brandWaitlistConfirmUrl(event: H3Event, token: string, locale: BrandWaitlistLocale): string {
  const prefix = locale === 'de' ? '/de' : ''
  return `${brandWaitlistBaseUrl(event)}${prefix}/waitlist/confirm?token=${encodeURIComponent(token)}`
}

export interface BrandWaitlistConfirmMailInput {
  to: string
  token: string
  locale: BrandWaitlistLocale
}

/**
 * DIE BESTÄTIGUNGS-MAIL AN DIE ADRESSE SELBST.
 *
 * Sie ist die EINZIGE Mail dieses Vorgangs, die NICHT fail-soft sein darf: ohne
 * sie gibt es keinen Link, und ohne Link kann niemand bestätigen. Ein „gespeichert!"
 * im Formular wäre dann eine Lüge. Deshalb sagt sie ehrlich `false` — die Route
 * macht daraus ein 503, die Zeile bleibt `pending` stehen, und der nächste
 * Versuch derselben Adresse legt einen frischen Link nach.
 *
 * `false` deckt BEIDE Ausfälle ab: den geworfenen SMTP-Fehler und den stillen
 * Fall „kein Mailer konfiguriert" (`sendMail` gibt dort `false` zurück, ohne zu
 * werfen — das ist die Falle, an der ein `.catch(() => false)` allein vorbeiliefe).
 */
export async function sendBrandWaitlistConfirmMail(
  event: H3Event,
  input: BrandWaitlistConfirmMailInput,
): Promise<boolean> {
  const link = brandWaitlistConfirmUrl(event, input.token, input.locale)
  const german = input.locale === 'de'

  const subject = german
    ? 'Bitte bestätigt eure Warteliste-Anfrage — Branding Supply'
    : 'Please confirm your waitlist request — Branding Supply'

  const text = german
    ? [
        'fast geschafft: ein Klick, dann steht ihr auf der Warteliste von Branding Supply.',
        '',
        `Anfrage bestätigen: ${link}`,
        '',
        'Der Link ist 24 Stunden gültig.',
        '',
        'Wenn ihr das nicht angefordert habt, ignoriert diese Mail einfach — ohne die Bestätigung passiert nichts.',
      ].join('\n')
    : [
        'almost done: one click and you are on the Branding Supply waitlist.',
        '',
        `Confirm your request: ${link}`,
        '',
        'The link is valid for 24 hours.',
        '',
        'If you did not request this, simply ignore this email — without the confirmation nothing happens.',
      ].join('\n')

  try {
    return await sendMail(event, { to: input.to, subject, text })
  }
  catch (error) {
    // Ohne Adresse und ohne Token: das Log sagt DASS, nicht AN WEN und womit.
    logEvent('warn', 'brand.waitlist_confirm_mail_failed', {
      message: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/** Die Angaben, die der Betreiber in seiner Meldung sehen will. */
export interface BrandWaitlistOperatorMailInput {
  email: string
  name: string
  company: string
  website: string
  locale: string
  source: string
}

/**
 * DIE MELDUNG AN DEN BETREIBER — seit dem Opt-in erst NACH der Bestätigung.
 *
 * Das ist der eigentliche Zweck der Umstellung: sonst müsste er die Tabelle
 * beobachten (eine Warteliste, die niemand liest, ist keine), aber eben auch
 * nicht jede erfundene Adresse im Postfach haben.
 *
 * Die Adresse kommt aus `pukalani.brand.waitlistNotify`; LEER heißt „keine
 * Mail" und ist der Default (ein erfundener Empfänger wäre eine Zustellung ins
 * Nichts). Ein Fehler ändert die Antwort NIE — die Zeile ist zu diesem
 * Zeitpunkt bereits bestätigt, und der Mensch davor kann für ein SMTP-Problem
 * nichts.
 */
export async function notifyBrandWaitlistOperator(
  event: H3Event,
  entry: BrandWaitlistOperatorMailInput,
): Promise<void> {
  const appConfig = useAppConfig() as { pukalani?: { brand?: { waitlistNotify?: string } } }
  const to = (appConfig.pukalani?.brand?.waitlistNotify ?? '').trim()
  if (!to) return

  const lines = [
    `E-Mail:  ${entry.email}`,
    `Name:    ${entry.name || '—'}`,
    `Firma:   ${entry.company || '—'}`,
    `Website: ${entry.website || '—'}`,
    `Sprache: ${entry.locale}`,
    `Seite:   ${entry.source || '—'}`,
  ]
  await sendMail(event, {
    to,
    subject: `Neue Warteliste-Anfrage: ${entry.company || entry.email}`,
    text: `Jemand möchte Frühzugang zu branding.supply — Adresse bestätigt.\n\n${lines.join('\n')}\n`,
  }).catch(() => false)
}
