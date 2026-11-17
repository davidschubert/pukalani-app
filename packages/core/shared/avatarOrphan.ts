import { avatarFileIdFromUrl, avatarFileOwnerIds } from './avatarOwnership'
import { olderThanDays } from './rowRetention'

/**
 * PROFILBILDER OHNE PROFIL (KE3, seit 2026-11-17) — die Regel, pur.
 *
 * Jeder Upload über `POST /api/storage/<bucket>` legt eine NEUE Datei im
 * Avatars-Bucket an; erst das Speichern des Profils (`profile.put.ts`) trägt
 * sie in `prefs.avatarUrl` ein und löscht die Vorgängerin. Scheitert das
 * Speichern oder bricht jemand ab, bleibt die Datei ohne Verweis liegen. Die
 * Kontolöschung räumt alle Dateien eines Kontos (`deleteAvatarFilesOf`); für
 * LEBENDE Konten räumt der Lauf `server/utils/avatarOrphanSweep.ts` nach
 * dieser Regel.
 *
 * EINE DATEI IST VERWAIST, WENN ALLES GILT:
 *  1. Sie ist älter als die SCHONFRIST (`AVATAR_ORPHAN_GRACE_DAYS` seit
 *     `$createdAt`). Grund: das Rennen „gerade hochgeladen, Profil noch nicht
 *     gespeichert" — ein Formular kann lange offen stehen; sieben Tage kosten
 *     nur etwas Ablage. Unlesbares Datum ⇒ bleibt.
 *  2. Sie gehört laut ihren Rechten GENAU EINEM Konto
 *     (`avatarFileOwnerIds`). Keines oder mehrere (Altbestand) ⇒ bleibt, als
 *     eigener Zustand `unowned` gezählt — weder fällig noch Fehler.
 *  3. Dieses Konto verweist nicht auf sie (`unreferenced`: es zeigt woanders
 *     hin oder nirgends) ODER es gibt das Konto nicht mehr (`owner_gone`).
 *     „Gibt es nicht mehr" sagt NUR Appwrites `user_not_found` — das
 *     entscheidet der Aufrufer beim Nachschlagen (`isAppwriteUserMissing`);
 *     jeder andere Fehler dort wirft, und die Datei bleibt (`failed`).
 */

/** Kennung des Laufs — in `defineTimedJob`, `retention.run` und `ops/timed-jobs.conf`. */
export const AVATAR_ORPHAN_SWEEP_JOB = 'avatar-orphan-sweep'

/** Schonfrist in Tagen seit dem Upload. */
export const AVATAR_ORPHAN_GRACE_DAYS = 7

/** Grund-Worte der Zählung (`byReason`). */
export type AvatarOrphanReason = 'unreferenced' | 'owner_gone'

/** Der Ausschnitt einer Datei, den die Regel liest. */
export interface AvatarOrphanFile {
  $id: string
  $createdAt: string
  $permissions: readonly string[]
}

/**
 * Regeln 1 und 2 — ohne Nachschlagen. `young`: innerhalb der Schonfrist
 * (oder Alter nicht belegbar); `unowned`: kein eindeutiger Besitzer;
 * `candidate`: der Besitzer muss nachgeschlagen werden (Regel 3).
 */
export type AvatarOrphanCandidate =
  | { kind: 'young' }
  | { kind: 'unowned' }
  | { kind: 'candidate', ownerId: string }

export function avatarOrphanCandidate(file: AvatarOrphanFile, now: Date): AvatarOrphanCandidate {
  if (!olderThanDays(file.$createdAt, AVATAR_ORPHAN_GRACE_DAYS, now)) return { kind: 'young' }
  const owners = avatarFileOwnerIds(file.$permissions)
  if (owners.length !== 1) return { kind: 'unowned' }
  return { kind: 'candidate', ownerId: owners[0]! }
}

/** Was das Nachschlagen des Besitzers ergab. */
export type AvatarOwnerState =
  | { gone: true }
  | { gone: false, avatarUrl: unknown }

/** Regel 3: der Grund, wenn die Datei fällig ist, sonst `null` (bleibt). */
export function avatarOrphanReason(
  fileId: string,
  bucketId: string,
  owner: AvatarOwnerState,
): AvatarOrphanReason | null {
  if (owner.gone) return 'owner_gone'
  return avatarFileIdFromUrl(owner.avatarUrl, bucketId) === fileId ? null : 'unreferenced'
}
