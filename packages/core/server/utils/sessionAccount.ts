import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { createSessionAccountMemo } from '../../shared/sessionAccountMemo'
import { sessionCookieName } from '../lib/appwrite'

/**
 * Server-Anbindung des Anmelde-Merkers (Q12, B3) — die Regeln stehen in
 * `core/shared/sessionAccountMemo.ts`.
 *
 * EIN Merker je Prozess. 5 s ist Davids Grenze für das Nachwirken einer
 * widerrufenen Sitzung (B3); WER RÄUMT:
 *  - jede schreibende Anfrage eines Kontos räumt dessen Einträge, bevor die
 *    Antwort rausgeht (Plugin `session-account-memo.ts`) — Abmelden,
 *    Sitzungen beenden, Passwort, Profil, Konto löschen;
 *  - `clearSessionCookie()` räumt genau die Sitzung dieser Anfrage;
 *  - wer ein FREMDES Konto ändert, ruft `forgetAccountSessions(userId)`:
 *    der Label-Schreiber `mutateUserLabels`, die Betreiber-Routen für Sperre,
 *    Sitzungen und Sammel-Aktionen.
 * Was ein ANDERER Prozess (Betreiber-Konsole) oder Appwrite direkt widerruft,
 * wirkt hier nach höchstens 5 s.
 */
export const SESSION_ACCOUNT_TTL_MS = 5_000
const SESSION_ACCOUNT_MAX_ENTRIES = 2_000

const memo = createSessionAccountMemo<Models.User<Models.Preferences>>({
  ttlMs: SESSION_ACCOUNT_TTL_MS,
  maxEntries: SESSION_ACCOUNT_MAX_ENTRIES,
})

/**
 * Schlüssel einer Sitzung: Hash aus Projekt, Mandant und Sitzungs-Geheimnis.
 * Der Wert selbst liegt nie im Speicher; ein Mandant ohne Kennung (Einzel-
 * Instanz, Kontroll-Host) heißt `-`.
 */
export function sessionMemoKey(event: H3Event, secret: string): string {
  const tenant = event.context.tenant
  const tenantKey = tenant && 'tenantId' in tenant && typeof tenant.tenantId === 'string' ? tenant.tenantId : '-'
  return createHash('sha256')
    .update(sessionCookieName(event))
    .update('\u0000')
    .update(tenantKey)
    .update('\u0000')
    .update(secret)
    .digest('hex')
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Liest nur (GET/HEAD/OPTIONS) — alles andere fragt frisch und räumt danach. */
export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase())
}

/**
 * Pfade, die IMMER frisch fragen: `/api/auth/me` ist die Frage des Browsers
 * „lebt meine Sitzung noch?" — nach einem Widerruf über die Live-Verbindung
 * (`realtime-account.client.ts`) muss sie sofort „nein" sagen, nicht erst
 * nach 5 s aus dem Merker.
 */
const FRESH_PATHS = new Set(['/api/auth/me'])

/** Muss diese Anfrage an Appwrite vorbei am Merker fragen? */
export function needsFreshAccount(event: H3Event): boolean {
  if (!isSafeMethod(event.method)) return true
  return FRESH_PATHS.has(event.path.split('?')[0] ?? '')
}

/** Das Konto dieser Sitzung — aus dem Merker oder frisch von Appwrite. */
export function lookupSessionAccount(
  event: H3Event,
  secret: string,
  fetcher: () => Promise<Models.User<Models.Preferences>>,
  options: { fresh?: boolean } = {},
): Promise<Models.User<Models.Preferences>> {
  return memo.lookup(sessionMemoKey(event, secret), fetcher, options)
}

/** Genau die Sitzung dieser Anfrage vergessen (Cookie wird gelöscht). */
export function forgetRequestSession(event: H3Event): void {
  const secret = getCookie(event, sessionCookieName(event))
  if (secret) memo.forgetKey(sessionMemoKey(event, secret))
}

/** Alle gemerkten Sitzungen eines Kontos vergessen. */
export function forgetAccountSessions(userId: string): void {
  if (userId) memo.forgetUser(userId)
}
