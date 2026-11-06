import { turnstileMode } from '../../shared/turnstile'

/**
 * STARTWARNUNG: NUR EIN TURNSTILE-SCHLÜSSEL GESETZT (Vorfall 2026-10-27).
 *
 * `requireTurnstile` meldet die Fehlkonfiguration erst beim ersten Gast, der
 * sich registrieren will — bis dahin kann ein halber Eintrag tagelang
 * unbemerkt liegen. Hier fällt er beim Deploy auf, im selben Log, in dem der
 * Betreiber nach dem Neustart ohnehin nachsieht. Bewusst nur eine Warnung:
 * WAS der Server dann tut (Secret allein ⇒ prüft trotzdem, Site-Key allein ⇒
 * prüft nicht), steht in server/utils/turnstile.ts.
 */
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  const siteKey = config.public.turnstileSiteKey ?? ''
  const secret = config.turnstileSecret ?? ''
  if (turnstileMode(siteKey, secret) !== 'misconfigured') return
  logEvent('warn', 'auth.turnstile_misconfigured_at_boot', {
    missing: secret ? 'NUXT_PUBLIC_TURNSTILE_SITE_KEY' : 'NUXT_TURNSTILE_SECRET',
    effect: secret ? 'every guest signup/otp/recovery is rejected (no widget, no token)' : 'widget is shown but tokens are never verified',
  })
})
