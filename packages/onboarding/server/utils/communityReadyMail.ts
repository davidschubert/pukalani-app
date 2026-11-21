import type { H3Event } from 'h3'
import { buildCommunityReadyMail } from '../../shared/communityReadyMail'
import { softFail } from '../../../core/server/utils/softFail'
import { resolveMailLocale } from '../../../core/shared/mailFrame'
import { resolveMailBrand } from '../../../core/server/utils/mailBrand'

/**
 * Versand der „Deine Community steht"-Mail (G6). Text + Regeln stehen pur in
 * `shared/communityReadyMail.ts`; hier wird nur zugestellt.
 *
 * ZWEI ENTSCHEIDUNGEN, die man an der Stelle nachlesen können soll:
 *
 * (1) SPRACHE (die eine Regel, Q06 `resolveMailLocale`): `prefs.emailLocale`,
 *     wenn die Person sie je gesetzt hat — sonst die Sprache, in der sie
 *     gerade den Wizard bedient hat, sonst Englisch. Bis Q06 fiel eine
 *     fehlende Wizard-Sprache auf Deutsch.
 *
 * (2) FAIL-SOFT wie die Seiten-Saat: die Community EXISTIERT bereits, wenn
 *     diese Mail losgeht. An einem SMTP-Aussetzer darf die Anlage nicht
 *     scheitern — der Fehler steht im Log, nicht im Gesicht des Kunden.
 *     `sendMail` gibt bei fehlender SMTP-Konfiguration `false` zurück (und
 *     warnt einmal), wirft aber bei einem Zustellfehler; deshalb der
 *     `.catch()`.
 */
export interface CommunityReadyMailArgs {
  to: string
  siteName: string
  host: string
  accountHost: string
  trialEndsAt: string | null
  /** Sprache des Wizards — Rückfall, wenn das Konto keine Mail-Sprache hat. */
  wizardLocale: string | null | undefined
  /** Anzeigename des Empfängers (Anrede). */
  name?: string | null
  /** Rohe Konto-prefs des Empfängers. */
  prefs: Record<string, unknown> | undefined
}

export async function sendCommunityReadyMail(event: H3Event, args: CommunityReadyMailArgs): Promise<boolean> {
  const locale = resolveMailLocale({ account: args.prefs?.emailLocale, request: args.wizardLocale })
  const { subject, text } = buildCommunityReadyMail({
    siteName: args.siteName,
    host: args.host,
    accountHost: args.accountHost,
    trialEndsAt: args.trialEndsAt,
    locale,
    brand: resolveMailBrand(event),
    name: args.name,
  })
  return await sendMail(event, { to: args.to, subject, text }).catch(softFail('onboarding:utils/communityReadyMail:sendMail', false))
}
