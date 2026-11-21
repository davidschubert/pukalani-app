import type { H3Event } from 'h3'
import { softFail } from '../../../core/server/utils/softFail'
import { frameMail, resolveMailLocale } from '../../../core/shared/mailFrame'
import { resolveMailBrand } from '../../../core/server/utils/mailBrand'

/**
 * Die Einladungs-Mail (control-017).
 *
 * Enthält BEIDES: den Direktlink (Feld vorbefüllt) und den Code zum Abtippen.
 * Tippen ist die häufigste Abbruchstelle bei Codes, und ein Link allein
 * scheitert, sobald jemand die Mail auf dem Telefon liest und am Rechner
 * weitermacht.
 *
 * Bei einer Erinnerung sagt die Mail ausdrücklich, dass dieser Code den
 * vorherigen ERSETZT — sonst probiert jemand den alten und hält uns für kaputt.
 */
export interface InviteMailInput {
  to: string
  code: string
  /** Sprache der Anfrage (Formular) — die eine Regel (Q06): sonst Englisch. */
  locale: string | null | undefined
  reminder: boolean
}

export async function sendInviteMail(event: H3Event, input: InviteMailInput): Promise<boolean> {
  const config = useRuntimeConfig(event) as { onboardingStartUrl?: string }
  // Der Trichter lebt auf dem Kundenbereich-Host, nicht im Control — die URL
  // kommt deshalb aus der Env und nicht aus public.appUrl.
  const startUrl = (config.onboardingStartUrl || 'https://account.pukalani.app').replace(/\/+$/, '')
  const link = `${startUrl}?code=${encodeURIComponent(input.code)}`
  const locale = resolveMailLocale({ request: input.locale })
  const german = locale === 'de'

  const subject = german
    ? (input.reminder ? 'Dein Pukalani-Einladungs-Code (neu)' : 'Deine Einladung zu Pukalani')
    : (input.reminder ? 'Your Pukalani invite code (new)' : 'Your invitation to Pukalani')

  // Rahmen (Q06): Anrede, Gruß und Marke aus `core/shared/mailFrame.ts`; die
  // Sätze beginnen groß, weil die Anrede jetzt davor steht.
  const lines = german
    ? [
        input.reminder
          ? 'Hier ist ein neuer Einladungs-Code für Pukalani. Er ERSETZT den vorherigen — der alte funktioniert nicht mehr.'
          : 'Du bist eingeladen, deine Community mit Pukalani zu starten.',
        `Direkt loslegen: ${link}`,
        `Oder den Code selbst eintragen: ${input.code}`,
        'Der Code gilt für diese E-Mail-Adresse und kann einmal eingelöst werden.',
        'Wenn du das nicht angefragt hast, ignoriere diese Mail einfach.',
      ]
    : [
        input.reminder
          ? 'Here is a new invite code for Pukalani. It REPLACES the previous one — the old code no longer works.'
          : 'You are invited to start your community with Pukalani.',
        `Get started: ${link}`,
        `Or enter the code yourself: ${input.code}`,
        'The code is tied to this email address and can be redeemed once.',
        'If you did not request this, simply ignore this email.',
      ]
  const { text } = frameMail({ brand: resolveMailBrand(event), locale, lines })

  return sendMail(event, { to: input.to, subject, text }).catch(softFail('control:utils/inviteMail:sendMail', false))
}
