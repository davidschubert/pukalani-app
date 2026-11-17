/**
 * ZWEI FEHLERWEGE DER ANMELDUNG TRENNEN (AB1 d) — pure, damit es prüfbar ist.
 *
 * Bis 2026-11-17 kannten Anmeldung, Code-Prüfung und Reset-Anforderung nur
 * „hat nicht geklappt": ein Ausfall von Appwrite sah aus wie ein falsches
 * Passwort (und zählte als Fehlversuch auf das Konto), und eine
 * Reset-Anforderung, die Appwrite aus einem Konfigurationsgrund ablehnte,
 * hinterließ keine Zeile. Diese Datei sagt, was was ist.
 *
 * Geprüft wird die FORM des Fehlers (`code`, `type` wie bei einer
 * AppwriteException), kein `instanceof` — so bleibt die Regel ohne SDK testbar
 * und gilt auch für Fehler, die gar nicht von Appwrite stammen (Netz, Zeit-
 * überschreitung): die haben keinen Status und sind damit ein Ausfall.
 */

/** Der Grund, der als `reason` im Fehler-Envelope reist (core/server/error.ts). */
export const AUTH_UNAVAILABLE_CODE = 'auth_unavailable'

interface FailureLike {
  type?: unknown
  code?: unknown
}

function failureOf(error: unknown): FailureLike {
  return typeof error === 'object' && error !== null ? error as FailureLike : {}
}

/**
 * Hat Appwrite die Anfrage GEPRÜFT UND ABGELEHNT (4xx) — oder ist die Prüfung
 * gar nicht zustande gekommen? Nur das Erste ist ein Fehlversuch. `true` heißt:
 * Ausfall (kein Status, 5xx, Netz) — nicht zählen, 503 antworten.
 */
export function isAuthBackendOutage(error: unknown): boolean {
  const { code } = failureOf(error)
  return !(typeof code === 'number' && code >= 400 && code < 500)
}

/**
 * Gründe, aus denen eine Reset-Anforderung ERWARTET scheitert: es gibt das
 * Konto nicht, oder es ist gesperrt. Dafür gibt es keine Zeile — sie stünde
 * bei jedem Tippfehler im Log.
 */
const EXPECTED_RECOVERY_FAILURES = new Set(['user_not_found', 'user_blocked'])

/**
 * Was gehört ins Log, wenn `createRecovery` scheitert? `null` bei einem
 * erwarteten Grund, sonst Typ und Status — nie die Meldung und nie die Adresse.
 */
export function unexpectedRecoveryFailure(error: unknown): { type: string, code: number | null } | null {
  const { type, code } = failureOf(error)
  if (typeof type === 'string' && EXPECTED_RECOVERY_FAILURES.has(type)) return null
  return {
    type: typeof type === 'string' && type ? type : 'unknown',
    code: typeof code === 'number' ? code : null,
  }
}
