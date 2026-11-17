import { olderThanDays } from './rowRetention'

/**
 * DIE FRIST DES KONTO-PROTOKOLLS (`audit_logs`, EL1 c — Davids
 * Entscheidungen 2026-11-15, docs/DECISION-LOG.md „Löschen und Fristen":
 * 12 Monate; und 2026-11-17 „Ganz löschen"): jeder Eintrag, der älter als
 * 12 Monate ist, wird gelöscht — AUCH Einträge über Handlungen des
 * Betreibers. Das „Konto-Protokoll" der Datenschutztexte IST diese Tabelle
 * (geschrieben über `server/utils/auditLog.ts`).
 *
 * PUR: die Regel je Zeile, ohne Appwrite und ohne Nitro — der Test prüft sie
 * mit gestellter Uhr. Der Lauf, der sie anwendet, steht in
 * `server/utils/auditLogRetention.ts`.
 *
 * ── WELCHER ZEITPUNKT ZÄHLT ────────────────────────────────────────────────
 * `$createdAt`. Ein Eintrag wird nach dem Schreiben nur noch pseudonymisiert
 * (Kontolöschung, `system/server/utils/userDataContributor.ts`) — das setzt
 * `$updatedAt` neu, darf die Frist aber nicht verlängern: die Zusage lautet
 * „12 Monate nach dem Ereignis".
 *
 * KEINE AUSNAHME je Aktion oder Handelndem: die Entscheidung vom 2026-11-17
 * nennt keine, und eine Ausnahme wäre eine zweite Frist, die niemand
 * zugesagt hat.
 *
 * Ein leerer oder unlesbarer Zeitpunkt heisst „bleibt" (`olderThanDays`).
 */

export const AUDIT_LOG_RETENTION_JOB = 'audit-log-retention'

/** So viele Tage nach dem Schreiben eines Eintrags. */
export const AUDIT_LOG_RETENTION_DAYS = 365

export type AuditLogRetentionReason = 'expired'

export interface AuditLogRetentionRow {
  $createdAt?: string | null
}

/** Der Grund, wenn der Eintrag fällig ist, sonst `null` (= bleibt). */
export function decideAuditLogRetention(
  row: AuditLogRetentionRow,
  now: Date,
): AuditLogRetentionReason | null {
  return olderThanDays(row.$createdAt, AUDIT_LOG_RETENTION_DAYS, now) ? 'expired' : null
}
