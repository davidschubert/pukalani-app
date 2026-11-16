/**
 * Betreiber-Protokoll (`audit_logs`) — was Server UND Oberfläche teilen.
 *
 * Der Schreiber steht in `server/utils/auditLog.ts`. Scheitert dort ein
 * STRIKTER Eintrag (Herausgabe von Personendaten: erst der Eintrag, dann die
 * Daten), antwortet die Route 503 mit genau diesem Grund — der zentrale
 * Handler hebt ihn als `reason` ins Envelope, die Oberfläche erkennt ihn über
 * `isAuditUnavailable` (app/utils/fetchError.ts) und sagt, dass NICHTS
 * herausgegeben wurde.
 */
export const AUDIT_UNAVAILABLE_REASON = 'audit_unavailable'
