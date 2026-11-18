import type { H3Event } from 'h3'
import { seamSecretMatches } from '../../../core/server/utils/sharedSeamSecret'

/**
 * DIE TÜR DER WÄCHTER-ROUTE (WA1 d, 2026-11-18).
 *
 * `GET /api/control/watch/hosts` antwortet nur einem Aufrufer, der das
 * Wächter-Geheimnis kennt (`NUXT_CONTROL_WATCH_HOSTS_SECRET`, Kopfzeile
 * `x-pukalani-watch-secret`).
 *
 * EIN EIGENES GEHEIMNIS, NICHT DAS DER NAHT: das Naht-Geheimnis
 * (`NUXT_CONTROL_ONBOARDING_SECRET`) öffnet schreibende Routen des Control
 * Plane. Der Wächter läuft bei GitHub; was dort liegt, soll nur lesen können,
 * und nur diese eine Liste. Geht dieses Geheimnis verloren, sind Host-Namen
 * lesbar — sonst nichts.
 *
 * LEER ODER ZU KURZ ⇒ DIE ROUTE GIBT ES NICHT (404). Default-aus wie bei den
 * Naht-Routen: ein vergessenes oder halb gesetztes Geheimnis darf nicht in
 * eine offene Liste münden. Zu kurz heißt unter `WATCH_SECRET_MIN_LENGTH`
 * Zeichen — ein Wert wie `test` wäre zu erraten.
 *
 * Falsches oder fehlendes Geheimnis ⇒ 401. Verglichen wird in konstanter
 * Zeit (`seamSecretMatches`). Eine angemeldete Sitzung zählt hier NICHT, auch
 * nicht die des Betreibers: die Route hat genau einen Aufrufer.
 */
export const WATCH_SECRET_HEADER = 'x-pukalani-watch-secret'
export const WATCH_SECRET_MIN_LENGTH = 32

export function requireWatchCaller(event: H3Event): void {
  const config = useRuntimeConfig(event) as { controlWatchHostsSecret?: string }
  const secret = (config.controlWatchHostsSecret ?? '').trim()
  if (secret.length < WATCH_SECRET_MIN_LENGTH) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
  const provided = getHeader(event, WATCH_SECRET_HEADER) || ''
  if (!seamSecretMatches(provided, [secret])) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
}
