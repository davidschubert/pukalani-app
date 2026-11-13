import { isBotCheckReason, type BotCheckReason } from '../../shared/turnstile'
import { REAUTH_REQUIRED_REASON } from '../../shared/recentAuth'
import { isPasswordPolicyReason, type PasswordPolicyReason } from '../../shared/passwordPolicy'

/**
 * Hat der Server eine FRISCHE Anmeldung verlangt (`requireRecentAuth`, RA1)?
 * Bewusst über den Grund, nicht über 403 — das heißt an anderen Stellen
 * „keine Berechtigung", und dort hilft Neu-Anmelden nicht.
 */
export function isReauthRequired(error: unknown): boolean {
  return (error as { data?: { reason?: unknown } } | null)?.data?.reason === REAUTH_REQUIRED_REASON
}

/**
 * Netzwerkfehler (Server nicht erreichbar) von echten API-Antworten
 * unterscheiden — ofetch setzt response nur, wenn der Server geantwortet hat.
 */
export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const response = (error as { response?: unknown }).response
  return response === undefined || response === null
}

/**
 * Ratenbegrenzung (429) erkennen — der Grund kommt als `reason` aus dem
 * Envelope (server/error.ts), der Status ist das Netz für 429er, die nicht aus
 * unserer Middleware stammen (vorgelagerter Proxy).
 */
export function isRateLimited(error: unknown): boolean {
  const shaped = error as { data?: { reason?: string }, statusCode?: number, status?: number } | null
  if (!shaped) return false
  if (shaped.data?.reason === 'rate_limited') return true
  return shaped.statusCode === 429 || shaped.status === 429
}

/**
 * Verbleibende Wartezeit in SEKUNDEN, falls die Antwort sie hergibt.
 *
 * Die Zahl steht ausschließlich im `Retry-After`-Header: durch das Envelope
 * kommt sie nicht (`domainReasonFrom` lässt nur einen kurzen Schlüssel durch,
 * nie einen Wert). Fehlt der Header — anderer Proxy, andere Fassung —, gibt es
 * bewusst KEINE geratene Zahl zurück, sondern `null`; die Oberfläche sagt dann
 * „warte kurz" statt einer erfundenen Minute.
 */
export function rateLimitRetrySeconds(error: unknown): number | null {
  const response = (error as { response?: { headers?: { get?: (name: string) => string | null } } })?.response
  const raw = response?.headers?.get?.('retry-after')
  if (!raw) return null
  const seconds = Number.parseInt(raw, 10)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return seconds
}

/** Ab hier nennt die Oberfläche Minuten statt Sekunden. */
const RATE_LIMIT_MINUTES_FROM_SECONDS = 90

/**
 * Sekunden oder Minuten? (SEC-003): die Konto-Bremse hat ein Fenster von
 * 15 Minuten, `Retry-After` kann also mehrere hundert Sekunden sein — „warte
 * noch 742 Sekunden" liest niemand. Über 90 s wird in Minuten gemeldet,
 * AUFGERUNDET: lieber eine Minute zu lang warten lassen als zu kurz und in
 * die nächste 429 laufen.
 */
export function rateLimitWait(seconds: number): { unit: 'seconds' | 'minutes', value: number } {
  return seconds > RATE_LIMIT_MINUTES_FROM_SECONDS
    ? { unit: 'minutes', value: Math.ceil(seconds / 60) }
    : { unit: 'seconds', value: seconds }
}

/**
 * Bot-Beweis abgelehnt (Turnstile, Vorfall 2026-10-27)? Liefert den Grund aus
 * dem Envelope (`reason`, gesetzt von server/utils/turnstile.ts), sonst
 * `null`. Bewusst NUR über den Grund, nie über den Status: 403 heißt an
 * denselben Routen auch „Registrierung zu", 503 auch „OTP fehlt der Instanz".
 */
export function botCheckReason(error: unknown): BotCheckReason | null {
  const reason = (error as { data?: { reason?: unknown } } | null)?.data?.reason
  return isBotCheckReason(reason) ? reason : null
}

/**
 * Passwort oder Adresse von den Anmelde-Regeln des Projekts abgelehnt (P29)?
 * Liefert den Grund aus dem Envelope (gesetzt über shared/passwordPolicy.ts),
 * sonst `null`. Wie beim Bot-Beweis NUR über den Grund: 422 und 503 heißen an
 * denselben Routen auch anderes.
 */
export function passwordPolicyReason(error: unknown): PasswordPolicyReason | null {
  const reason = (error as { data?: { reason?: unknown } } | null)?.data?.reason
  return isPasswordPolicyReason(reason) ? reason : null
}
