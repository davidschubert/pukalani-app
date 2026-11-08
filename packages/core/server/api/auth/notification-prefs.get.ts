import { undeliverableNoticeReason } from '../../../shared/mailUndeliverable'

/**
 * Aktuelle E-Mail-Benachrichtigungs-Präferenz + Versand-Verfügbarkeit
 * (Settings → Benachrichtigungen). mailerConfigured steuert nur den
 * UI-Hinweis — die Präferenz ist auch ohne SMTP speicherbar.
 *
 * `undeliverable` (RS1 b): hat Resend die AKTUELLE Adresse als unzustellbar
 * gemeldet, steht hier der Grund — die Seite zeigt dann einen Hinweis. Ein
 * Merker zu einer früheren Adresse zählt nicht (Hash-Vergleich).
 */
export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const prefs = resolveEmailPrefs(event.context.user.prefs as Record<string, unknown>)
  return {
    emailNotifications: prefs.emailNotifications,
    mailerConfigured: await mailerConfigured(event),
    undeliverable: undeliverableNoticeReason(
      event.context.user.prefs as Record<string, unknown>,
      event.context.user.email ? mailUndeliverableEmailHash(event.context.user.email) : '',
    ),
  }
})
