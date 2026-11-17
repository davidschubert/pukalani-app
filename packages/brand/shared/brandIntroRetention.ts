import { olderThanDays } from '../../core/shared/rowRetention'

/**
 * DIE FRIST DER GESPRÄCHSANFRAGEN VON branding.supply (`brand_intro_requests`,
 * EL1 c — Davids Entscheidung 2026-11-15, docs/DECISION-LOG.md „Löschen und
 * Fristen"): 12 Monate.
 *
 * PUR: die Regel je Zeile, ohne Appwrite und ohne Nitro — der Test prüft sie
 * mit gestellter Uhr. Der Lauf, der sie anwendet, steht in
 * `server/utils/brandIntroRetentionRun.ts`.
 *
 * ── WELCHER ZEITPUNKT ZÄHLT ────────────────────────────────────────────────
 * `$createdAt`, UNABHÄNGIG VOM STATUS (`new`, `contacted`, `closed`). Der
 * Betreiber ändert Status und Notiz (`admin/intro-calls/[id]/index.patch.ts`)
 * — das setzt `$updatedAt` neu, darf die Frist aber nicht verlängern: die
 * Zusage lautet „12 Monate nach der Anfrage", nicht „nach der letzten
 * Bearbeitung".
 *
 * AUCH ZEILEN MIT KONTO (`userId` gesetzt, Anfrage aus der Werkstatt) fallen
 * nach 12 Monaten: die Entscheidung nennt keine Ausnahme, und das Konto
 * verliert damit nur die Anfrage — Marke, Kapitel und Konto bleiben. Der
 * einzige Leser darüber hinaus, die Vorlage „Presse-Kontakt" der Werkstatt
 * (`brandKitWorkshop.ts`), fällt dann still weg (dort fail-soft gebaut).
 *
 * Ein leerer oder unlesbarer Zeitpunkt heisst „bleibt" (`olderThanDays`).
 */

export const BRAND_INTRO_RETENTION_JOB = 'brand-intro-retention'

/** So viele Tage nach dem Eingang einer Anfrage. */
export const BRAND_INTRO_RETENTION_DAYS = 365

export type BrandIntroRetentionReason = 'expired'

export interface BrandIntroRetentionRow {
  $createdAt?: string | null
}

/** Der Grund, wenn die Zeile fällig ist, sonst `null` (= bleibt). */
export function decideBrandIntroRetention(
  row: BrandIntroRetentionRow,
  now: Date,
): BrandIntroRetentionReason | null {
  return olderThanDays(row.$createdAt, BRAND_INTRO_RETENTION_DAYS, now) ? 'expired' : null
}
