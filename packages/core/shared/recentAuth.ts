/**
 * „Frisch angemeldet?" — die Regel hinter `requireRecentAuth` (RA1, 2026-11-06).
 *
 * Anlass: Appwrite Cloud kann seit dem 2026-10-29 Firewall-Regeln auf das
 * SESSION-ALTER legen. Self-hosted gibt es die Firewall nicht, die Idee
 * schon: eine Aktion, die sich nicht zurückholen lässt, verlangt eine
 * FRISCHE Anmeldung statt „irgendwann eingeloggt". Ein gestohlenes oder
 * liegengebliebenes Session-Cookie darf damit weiter lesen und schreiben,
 * aber kein Konto mehr löschen.
 *
 * WARUM DAS SESSION-ALTER und nicht „Passwort eintippen": auf platform,
 * control und branding gibt es Konten OHNE Passwort (Google, E-Mail-Code).
 * Eine neue Anmeldung kann jede Konto-Art — und prüft MFA gleich mit.
 * Der Host-Wechsel (site-session, embed-session) reicht dasselbe Secret
 * weiter, legt also KEINE neue Session an und macht nichts „frisch"; nur ein
 * echter Login tut das.
 *
 * PURE (unit-getestet in tests/recentAuth.test.ts).
 */

/** Wie frisch ist „frisch"? Zehn Minuten — lang genug für Login + Klick. */
export const RECENT_AUTH_MAX_AGE_MS = 10 * 60 * 1000

/** Fachlicher Ablehnungsgrund im Envelope (`error.data.reason`). */
export const REAUTH_REQUIRED_REASON = 'reauth_required'

/**
 * Ist die Session jünger als `maxAgeMs`? FAIL-CLOSED: ein fehlendes oder
 * unlesbares Datum ist NICHT frisch. Eine Session „aus der Zukunft" (Uhren
 * von Appwrite und Nuxt laufen ein paar Sekunden auseinander) gilt als frisch.
 */
export function isRecentAuth(
  sessionCreatedAt: string | null | undefined,
  nowMs: number,
  maxAgeMs: number = RECENT_AUTH_MAX_AGE_MS,
): boolean {
  if (!sessionCreatedAt) return false
  const createdMs = Date.parse(sessionCreatedAt)
  if (!Number.isFinite(createdMs)) return false
  return nowMs - createdMs <= maxAgeMs
}
