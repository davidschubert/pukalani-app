import { olderThanDays } from '../../core/shared/rowRetention'

/**
 * DIE FRISTEN DER WARTELISTE VON branding.supply (EL1 c — Davids
 * Entscheidung 2026-11-15, docs/DECISION-LOG.md): nie bestätigt ⇒ 30 Tage;
 * eingeladen oder abgelehnt ⇒ 90 Tage; noch wartend ⇒ spätestens 12 Monate.
 *
 * PUR: die Regel je Zeile, ohne Appwrite und ohne Nitro — der Test prüft sie
 * mit gestellter Uhr. Der Lauf, der sie anwendet, steht in
 * `server/utils/brandWaitlistRetentionRun.ts`.
 *
 * ── WELCHER ZEITPUNKT ZÄHLT ────────────────────────────────────────────────
 *  - `pending` (nie bestätigt): `$updatedAt`, nicht `$createdAt`. Meldet sich
 *    dieselbe Adresse erneut an, schreibt `server/api/brand/waitlist.post.ts`
 *    einen neuen Link in die BESTEHENDE Zeile (`updateRow` mit `tokenHash` und
 *    `tokenExpiresAt`) — Appwrite setzt damit `$updatedAt` neu. Die Frist
 *    zählt so ab der LETZTEN Anforderung: wer gestern erneut um einen Link
 *    gebeten hat, verliert die Zeile nicht, weil die erste Anfrage alt ist.
 *    Greift die Grenze je Empfänger-Adresse (SEC-018), wird nichts
 *    geschrieben — dann bleibt auch `$updatedAt` stehen; das ist richtig, weil
 *    dann auch kein neuer Link verschickt wurde.
 *  - `invited` / `declined`: `$updatedAt`. Eine eigene Spalte für den
 *    Zeitpunkt der Entscheidung gibt es nicht; das Stempeln des Status ist der
 *    letzte Schreibvorgang. Eine spätere Notiz des Betreibers
 *    (`admin/waitlist/[id]/index.patch.ts`) oder eine erneute Anmeldung
 *    derselben Adresse (s. o., die Route schreibt auch in diese Zeilen einen
 *    neuen Link) VERLÄNGERT die Frist — das ist die vorsichtige Richtung:
 *    eher länger als zugesagt behalten als vor der Zusage löschen.
 *  - alles andere (`confirmed`, Altbestand `new`, ein unbekannter Wert):
 *    `$createdAt` — „spätestens 12 Monate" gilt ab dem Eintragen, und keine
 *    Notiz verlängert die Wartezeit eines Menschen, der nie eingeladen wurde.
 *
 * Ein leerer oder unlesbarer Zeitpunkt heisst „bleibt" (`olderThanDays`).
 */

export const BRAND_WAITLIST_RETENTION_JOB = 'brand-waitlist-retention'

/** Nie bestätigt: so viele Tage nach der letzten Anforderung eines Links. */
export const BRAND_WAITLIST_UNCONFIRMED_DAYS = 30
/** Eingeladen oder abgelehnt: so viele Tage nach dem letzten Schreiben. */
export const BRAND_WAITLIST_DECIDED_DAYS = 90
/** Noch wartend (bestätigt, Altbestand, Unbekanntes): so viele Tage nach dem Eintragen. */
export const BRAND_WAITLIST_WAITING_DAYS = 365

/**
 * Die KÜRZESTE der drei Fristen — die Vorauswahl der Abfrage
 * (`$createdAt` älter als diese Frist). Jede fällige Zeile ist mindestens so
 * alt: `$updatedAt` liegt nie vor `$createdAt`.
 */
export const BRAND_WAITLIST_SHORTEST_DAYS = Math.min(
  BRAND_WAITLIST_UNCONFIRMED_DAYS,
  BRAND_WAITLIST_DECIDED_DAYS,
  BRAND_WAITLIST_WAITING_DAYS,
)

export type BrandWaitlistRetentionReason = 'unconfirmed' | 'invited' | 'declined' | 'waiting'

export interface BrandWaitlistRetentionRow {
  status?: string | null
  $createdAt?: string | null
  $updatedAt?: string | null
}

/** Der Grund, wenn die Zeile fällig ist, sonst `null` (= bleibt). */
export function decideBrandWaitlistRetention(
  row: BrandWaitlistRetentionRow,
  now: Date,
): BrandWaitlistRetentionReason | null {
  const status = (row.status ?? '').trim()
  if (status === 'pending') {
    return olderThanDays(row.$updatedAt, BRAND_WAITLIST_UNCONFIRMED_DAYS, now) ? 'unconfirmed' : null
  }
  if (status === 'invited' || status === 'declined') {
    return olderThanDays(row.$updatedAt, BRAND_WAITLIST_DECIDED_DAYS, now) ? status : null
  }
  return olderThanDays(row.$createdAt, BRAND_WAITLIST_WAITING_DAYS, now) ? 'waiting' : null
}
