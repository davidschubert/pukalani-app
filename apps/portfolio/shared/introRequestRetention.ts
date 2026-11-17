import { olderThanDays } from '../../../packages/core/shared/rowRetention'

/**
 * DIE FRIST DER GESPRÄCHSANFRAGEN VON pukalani.studio (`intro_requests`,
 * EL1 c — Davids Entscheidung 2026-11-15, docs/DECISION-LOG.md „Löschen und
 * Fristen"): 12 Monate.
 *
 * PUR: die Regel je Zeile, ohne Appwrite und ohne Nitro — der Test prüft sie
 * mit gestellter Uhr. Der Lauf, der sie anwendet, steht in
 * `server/utils/introRequestRetentionRun.ts`. Importiert wird diese Datei
 * über `#shared/…` (Begründung in `vitest.config.ts`).
 *
 * ── WELCHER ZEITPUNKT ZÄHLT ────────────────────────────────────────────────
 * `$createdAt`. Die Zeilen haben keinen Status und werden nach dem Eingang
 * nicht mehr geschrieben (gelesen wird in der Appwrite-Konsole); die Zusage
 * lautet „12 Monate nach der Anfrage".
 *
 * Ein leerer oder unlesbarer Zeitpunkt heisst „bleibt" (`olderThanDays`).
 */

export const INTRO_REQUEST_RETENTION_JOB = 'intro-request-retention'

/** So viele Tage nach dem Eingang einer Anfrage. */
export const INTRO_REQUEST_RETENTION_DAYS = 365

export type IntroRequestRetentionReason = 'expired'

export interface IntroRequestRetentionRow {
  $createdAt?: string | null
}

/** Der Grund, wenn die Zeile fällig ist, sonst `null` (= bleibt). */
export function decideIntroRequestRetention(
  row: IntroRequestRetentionRow,
  now: Date,
): IntroRequestRetentionReason | null {
  return olderThanDays(row.$createdAt, INTRO_REQUEST_RETENTION_DAYS, now) ? 'expired' : null
}
