import { olderThanDays, RETENTION_DAY_MS } from '../../core/shared/rowRetention'

/**
 * DER PAPIERKORB DER MARKEN (WH1) — die Regel, pur und als Tabelle getestet
 * (`tests/brandProfileTrash.test.ts`).
 *
 * Davids Entscheidung (2026-11-15, `docs/plans/WIEDERHERSTELLUNG.md`): „Marke
 * löschen" versteckt die Marke sofort überall; 90 Tage lang steht sie unter
 * „Gelöschte Marken" und lässt sich zurückholen, danach löscht ein stündlicher
 * Lauf sie mit allem, was an ihr hängt.
 *
 * DREI ZUSTÄNDE, EIN FELD (`brand_profiles.erasedAt`, brand-028):
 *   active  — `erasedAt` leer: die Marke ist da.
 *   trashed — gelöscht, die Frist läuft: unsichtbar in jedem Weg, nur der
 *             Papierkorb zeigt sie, „Zurückholen" geht.
 *   due     — die Frist ist um: unsichtbar, nicht mehr zurückholbar, der Lauf
 *             löscht sie. Der Zustand gilt auch dann, wenn der Lauf noch nicht
 *             da war — die Zusage „nach 90 Tagen weg" hängt nicht an seinem Takt.
 *
 * EIN UNLESBARER ZEITPUNKT heisst `trashed`: versteckt (die Person wollte sie
 * weg), aber nie auf einen Verdacht hin gelöscht — dieselbe Vorsicht wie
 * `decideBrandCheckPurge`. Er bleibt zurückholbar, damit eine kaputte Zeile
 * nicht für immer unerreichbar im Speicher liegt.
 */

export const BRAND_PROFILE_TRASH_JOB = 'brand-profile-trash'

/**
 * Die Frist. DIESELBE Zahl wie `BRAND_CHECK_ERASURE_RETENTION_DAYS`
 * (Prüfergebnisse einer gelöschten Marke): solange die Marke zurückholbar
 * ist, gibt es auch ihre versteckten Prüfergebnisse noch. Ein Test hält beide
 * gleich.
 */
export const BRAND_PROFILE_TRASH_DAYS = 90

export type BrandProfileTrashState = 'active' | 'trashed' | 'due'

export interface BrandProfileTrashRow {
  erasedAt?: string | null
}

/** Gilt die Marke als gelöscht? Jeder Leser fragt DAS, nicht die Spalte. */
export function isBrandProfileErased(row: BrandProfileTrashRow): boolean {
  return typeof row.erasedAt === 'string' && row.erasedAt.length > 0
}

export function brandProfileTrashState(row: BrandProfileTrashRow, now: Date): BrandProfileTrashState {
  if (!isBrandProfileErased(row)) return 'active'
  return olderThanDays(row.erasedAt, BRAND_PROFILE_TRASH_DAYS, now) ? 'due' : 'trashed'
}

/** Die Regel des Laufs: `'expired'` = endgültig löschen, sonst bleibt sie. */
export function decideBrandProfileTrash(row: BrandProfileTrashRow, now: Date): 'expired' | null {
  return brandProfileTrashState(row, now) === 'due' ? 'expired' : null
}

/**
 * Der Zeitpunkt, ab dem die Marke endgültig gelöscht wird — `null` bei einem
 * leeren oder unlesbaren Wert.
 */
export function brandProfilePurgeAt(erasedAt: string | null | undefined): string | null {
  if (!erasedAt) return null
  const at = Date.parse(erasedAt)
  if (!Number.isFinite(at)) return null
  return new Date(at + BRAND_PROFILE_TRASH_DAYS * RETENTION_DAY_MS).toISOString()
}

/**
 * Die verbleibenden ganzen Tage für die Anzeige („noch 12 Tage"), aufgerundet
 * und nie unter 0. Unlesbar ⇒ die volle Frist (die Zeile wird nie gelöscht).
 */
export function brandProfileTrashDaysLeft(erasedAt: string | null | undefined, now: Date): number {
  const purgeAt = brandProfilePurgeAt(erasedAt)
  if (!purgeAt) return BRAND_PROFILE_TRASH_DAYS
  const left = Math.ceil((Date.parse(purgeAt) - now.getTime()) / RETENTION_DAY_MS)
  return Math.max(0, left)
}
