import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { knownDeviceId } from './knownDevice'
import { tooManyRequests } from './rateLimited'

/**
 * FEHLVERSUCHE JE KONTO (SEC-003).
 *
 * Die Middleware `05.rate-limit.ts` zählt je IP. Das bremst EINE Maschine,
 * nicht viele: wer über viele Adressen verteilt auf dasselbe Konto rät, bleibt
 * unter jedem IP-Deckel. Dieser Zähler hängt deshalb am KONTO (E-Mail bzw.
 * userId) und gilt über alle Adressen.
 *
 * Regeln:
 *  - Gezählt wird VOR der Prüfung (atomar im Store, hält unter gleichzeitigen
 *    Anfragen), bei Erfolg wird der eigene Versuch zurückgebucht — eine
 *    gelungene Anmeldung kostet nichts.
 *  - KEINE Dauersperre: ein festes Fenster, das ein geblockter Versuch nicht
 *    verlängert. Danach ist das Konto wieder frei, auch wenn währenddessen
 *    weiter angefragt wurde.
 *  - Die 429 ist dieselbe wie die der IP-Drossel (`rate_limited`) und hängt
 *    nicht davon ab, ob es das Konto gibt.
 *  - Im Schlüssel steht nie eine E-Mail im Klartext (Redis ist geteilt).
 *  - Der Ausweg aus einer Pause ist „Passwort zurücksetzen": nach einem
 *    erfolgreichen Reset löscht `recovery.put.ts` den Login-Zähler.
 *
 * BEKANNTES GERÄT (P29): ein Browser, in dem sich GENAU dieses Konto schon
 * einmal vollständig angemeldet hat, trägt ein signiertes Merkzeichen
 * (`knownDevice.ts`) und zählt in einem EIGENEN Topf (`…:dev:<geräte-kennung>`)
 * — mit demselben Deckel und demselben Fenster. So füllen Fremde nur den
 * gemeinsamen Topf und pausieren den echten Besitzer nicht; das bekannte
 * Gerät ist selbst gedeckelt (auch ein entwendetes Merkzeichen gibt nicht mehr
 * als 10 Versuche je Fenster) und füllt den gemeinsamen Topf nicht. Ohne
 * gültiges Merkzeichen — oder mit einem für ein anderes Konto — bleibt alles
 * wie oben.
 */

/**
 * Fehlversuche je Konto und Fenster: 10 in 15 Minuten (Davids Entscheidung
 * 2026-11-13) — die Zahl steht NUR hier. Zehn lassen einem Menschen, der sein
 * Passwort sucht, reichlich Luft und machen verteiltes Raten aussichtslos.
 */
export const ACCOUNT_ATTEMPT_MAX = 10
/** Fenster des Konto-Zählers: 15 Minuten, fest (kein gleitendes Fenster). */
export const ACCOUNT_ATTEMPT_WINDOW_MS = 15 * 60_000

/** Welche Prüfung gezählt wird — je Scope ein eigener Zähler. */
export type AccountAttemptScope = 'login' | 'otp' | 'mfa'

/**
 * Schlüssel des Konto-Zählers (pur). Die Kennung wird normalisiert
 * (`trim().toLowerCase()`) und mit dem Scope gehasht — so landet keine Adresse
 * im Klartext im Store, und `A@b.de ` zählt wie `a@b.de`.
 */
export function accountAttemptKey(prefix: string, scope: AccountAttemptScope, account: string): string {
  const hash = createHash('sha256')
    .update(`${scope}:${account.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 32)
  return `${prefix}acct:${scope}:${hash}`
}

/**
 * Einen Versuch auf das Konto zählen; über dem Deckel 429. Muss NACH der
 * Body-Validierung und VOR dem Appwrite-Aufruf stehen, der das Geheimnis prüft.
 */
export async function limitAccountAttempts(event: H3Event, scope: AccountAttemptScope, account: string): Promise<void> {
  const { store, prefix } = useRateLimitStore(event)
  const device = knownDeviceId(event, scope, account)
  const shared = accountAttemptKey(prefix, scope, account)
  const key = device ? `${shared}:dev:${device}` : shared
  const state = await store.hit(key, ACCOUNT_ATTEMPT_WINDOW_MS)

  if (state.count > ACCOUNT_ATTEMPT_MAX) {
    // Genau EIN Request sieht den Übergang (atomarer Zähler) — eine Log-Zeile
    // je Fenster, ohne E-Mail und ohne userId.
    if (state.count === ACCOUNT_ATTEMPT_MAX + 1) logEvent('warn', 'auth.account_attempts_blocked', { scope })
    tooManyRequests(event, state.resetInMs)
  }

  event.node.res.once('finish', () => {
    if (event.node.res.statusCode < 400) void store.refund(key, ACCOUNT_ATTEMPT_WINDOW_MS)
  })
}

/**
 * Den GEMEINSAMEN Zähler eines Kontos sofort löschen (nach erfolgreichem
 * Passwort-Reset). Die Töpfe bekannter Geräte laufen ihr Fenster aus.
 */
export async function clearAccountAttempts(event: H3Event, scope: AccountAttemptScope, account: string): Promise<void> {
  const { store, prefix } = useRateLimitStore(event)
  await store.clear(accountAttemptKey(prefix, scope, account))
}
