import { isBotCheckReason, type BotCheckReason } from '../../shared/turnstile'

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
