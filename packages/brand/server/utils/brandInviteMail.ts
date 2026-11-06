import type { H3Event } from 'h3'

/**
 * DIE EINLADUNGS-MAIL DER BETA — der einzige Weg, auf dem ein Beta-Code den
 * Server verlässt.
 *
 * Gebaut nach `packages/control/server/utils/inviteMail.ts` (control-017),
 * bewusst NICHT von dort importiert: das ist ein anderer Layer, ein anderes
 * Deployment und ein anderer Trichter (`/invite?code=` auf branding.supply
 * statt `?code=` auf dem Kundenbereich). Ein geteilter Helfer hätte beide
 * Wortlaute in einer Datei mit zwei Sonderfällen zusammengebunden.
 *
 * ── LINK UND CODE, BEIDES ─────────────────────────────────────────────────
 * Der Direktlink füllt das Feld vor; der abtippbare Code rettet den Fall, dass
 * jemand die Mail auf dem Telefon liest und am Rechner weitermacht. Tippen ist
 * die häufigste Abbruchstelle bei Codes, ein Link allein die zweithäufigste.
 *
 * ── DIE BASIS IST DIESELBE WIE BEI DER WARTELISTE ─────────────────────────
 * `public.appUrl` mit hartem Rückfall auf `https://branding.supply` — die
 * Begründung steht ausführlich in `brandWaitlist.ts`: eine Mail mit einem
 * RELATIVEN Link wäre eine Mail ohne Link, und dieser Layer hat genau einen
 * Host. Das Sprach-Präfix folgt `prefix_except_default` (en ohne, de unter
 * `/de`) — wer auf Deutsch gefragt hat, soll nicht auf einer englischen Seite
 * landen.
 *
 * ── DER CODE STEHT NIE IM LOG ─────────────────────────────────────────────
 * Auch nicht gekürzt, auch nicht im Fehlerfall. `false` deckt BEIDE Ausfälle
 * ab: den geworfenen SMTP-Fehler und den stillen Fall „kein Mailer
 * konfiguriert" (`sendMail` gibt dort `false` zurück, ohne zu werfen — die
 * Falle, an der ein `.catch(() => false)` allein vorbeiliefe). Der Aufrufer
 * macht daraus ein 503 UND nimmt den Code zurück: kein Code ohne Mail.
 */

export interface BrandInviteMailInput {
  to: string
  code: string
  /** Die Sprache der Warteliste-Zeile; alles außer 'de' ist Englisch. */
  locale: string
}

function brandInviteBaseUrl(event: H3Event): string {
  const configured = useRuntimeConfig(event).public.appUrl || ''
  return (configured || 'https://branding.supply').replace(/\/+$/, '')
}

export function brandInviteUrl(event: H3Event, code: string, locale: string): string {
  const prefix = locale === 'de' ? '/de' : ''
  return `${brandInviteBaseUrl(event)}${prefix}/invite?code=${encodeURIComponent(code)}`
}

export async function sendBrandInviteMail(
  event: H3Event,
  input: BrandInviteMailInput,
): Promise<boolean> {
  const german = input.locale === 'de'
  const link = brandInviteUrl(event, input.code, input.locale)

  const subject = german
    ? 'Euer Zugang zu Branding Supply'
    : 'Your access to Branding Supply'

  // Die „Wir"-Stimme des Studios (docs: Pukalani Studio spricht als wir, die
  // Gegenseite als ihr) — dieselbe Anrede wie in der Warteliste-Mail.
  const text = german
    ? [
        'ihr standet auf der Warteliste — jetzt ist euer Zugang bereit.',
        '',
        `Direkt loslegen: ${link}`,
        '',
        `Oder den Code selbst eintragen: ${input.code}`,
        '',
        'Der Code gilt für diese E-Mail-Adresse und kann einmal eingelöst werden.',
        '',
        'Wenn ihr das nicht wart, ignoriert diese Mail einfach — ohne den Code passiert nichts.',
      ].join('\n')
    : [
        'you were on the waitlist — your access is ready.',
        '',
        `Get started: ${link}`,
        '',
        `Or enter the code yourself: ${input.code}`,
        '',
        'The code is tied to this email address and can be redeemed once.',
        '',
        'If this was not you, simply ignore this email — nothing happens without the code.',
      ].join('\n')

  try {
    return await sendMail(event, { to: input.to, subject, text })
  }
  catch (error) {
    // Ohne Adresse und ohne Code: das Log sagt DASS, nicht AN WEN und womit.
    logEvent('warn', 'brand.invite_mail_failed', {
      message: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
