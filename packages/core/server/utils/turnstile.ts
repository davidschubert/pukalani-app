import type { H3Event } from 'h3'
import { turnstileMode, type TurnstileAction } from '../../shared/turnstile'
import type { TurnstileVerifyResponse } from '../../shared/types/turnstile'

/**
 * BOT-BEWEIS AN DEN MAIL-AUSLÖSENDEN GAST-ROUTEN (Vorfall 2026-10-27).
 *
 * Die Regel, WANN geprüft wird, ist pur (shared/turnstile.ts); hier steht nur,
 * WIE: Token gegen Cloudflare `siteverify`, `action` gegenprüfen, Ergebnis als
 * 403/503 mit fachlichem Grund (`data.code` ⇒ `reason` im Envelope,
 * core/server/error.ts). Die Formulare machen aus den drei Gründen je einen
 * eigenen Satz (useAuthErrorMessage.ts).
 *
 * Aufrufer sind genau die drei Routen signup/otp/recovery — und dort NACH den
 * billigen Schaltern (Registrierung zu ⇒ 403 ohne Netzaufruf) und VOR jedem
 * Appwrite-Aufruf, der eine Mail auslöst.
 */
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const SITEVERIFY_TIMEOUT_MS = 5000

let warnedMisconfigured = false

/** Nur für Tests: Merker leeren. */
export function __resetTurnstileWarnings(): void {
  warnedMisconfigured = false
}

export async function requireTurnstile(event: H3Event, action: TurnstileAction, token: string | undefined): Promise<void> {
  const config = useRuntimeConfig(event)
  const secret = config.turnstileSecret ?? ''
  const mode = turnstileMode(config.public.turnstileSiteKey ?? '', secret)
  if (mode === 'off') return

  if (mode === 'misconfigured') {
    /**
     * NUR EIN SCHLÜSSEL GESETZT. Laut — einmal je Prozess, sonst flutet jeder
     * Bot-Versuch das Log. Danach entscheidet, WELCHER fehlt:
     *   - Secret da, Site-Key fehlt ⇒ trotzdem PRÜFEN. Ohne Widget kommt kein
     *     Token, also sperrt das jeden Gast aus — das ist hässlich, aber laut
     *     und sofort sichtbar. Ein fehlender Site-Key darf die Hürde NICHT
     *     still abschalten: genau so fiele sie in der Stunde, in der jemand
     *     beim Eintragen eine Variable vergisst.
     *   - Site-Key da, Secret fehlt ⇒ nichts zu prüfen; das Widget im Formular
     *     ist nutzlos, die Route läuft wie ohne Turnstile.
     */
    if (!warnedMisconfigured) {
      warnedMisconfigured = true
      logEvent('error', 'auth.turnstile_misconfigured', {
        action,
        missing: secret ? 'NUXT_PUBLIC_TURNSTILE_SITE_KEY' : 'NUXT_TURNSTILE_SECRET',
      })
    }
    if (!secret) return
  }

  if (!token) {
    throw createError({ status: 403, statusText: 'Bot check required', data: { code: 'bot_check_required' } })
  }

  let result: TurnstileVerifyResponse
  try {
    result = await $fetch<TurnstileVerifyResponse>(SITEVERIFY_URL, {
      method: 'POST',
      body: { secret, response: token, remoteip: trustedClientIp(event) },
      timeout: SITEVERIFY_TIMEOUT_MS,
    })
  }
  catch (error) {
    /**
     * FAIL-CLOSED. Ist Cloudflare nicht erreichbar, geht KEINE Mail hinaus —
     * ein Ausfall dort darf nicht die Stunde sein, in der die Registrierung
     * ungeschützt offensteht (ein Angreifer, der das bemerkt, hätte freie
     * Bahn, und gerade die Mail-Routen kosten uns Geld und Absender-Ruf). Der
     * Preis ist ehrlich benannt: die Formulare sagen „gerade nicht möglich,
     * versuch es in ein paar Minuten", und dieses Log sagt dem Betreiber,
     * warum.
     */
    logEvent('error', 'auth.turnstile_unavailable', {
      action,
      message: error instanceof Error ? error.message : String(error),
    })
    throw createError({ status: 503, statusText: 'Bot check unavailable', data: { code: 'bot_check_unavailable' } })
  }

  // Die `action` steht im Token selbst (vom Widget gesetzt); ein Token aus
  // einem anderen Formular passt also nicht. Fehlt sie in der Antwort (ältere
  // Fassung, Test-Schlüssel), entscheidet allein `success`.
  const actionMismatch = typeof result.action === 'string' && result.action !== '' && result.action !== action
  if (result.success !== true || actionMismatch) {
    logEvent('warn', 'auth.turnstile_rejected', {
      action,
      codes: result['error-codes'] ?? [],
      ...(actionMismatch ? { gotAction: result.action } : {}),
    })
    throw createError({ status: 403, statusText: 'Bot check failed', data: { code: 'bot_check_failed' } })
  }
}
