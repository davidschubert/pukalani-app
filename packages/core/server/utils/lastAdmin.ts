import type { H3Event } from 'h3'
import { Query } from 'node-appwrite'
import { ADMIN_LABEL, LAST_ADMIN_CODE } from '../../shared/lastAdmin'
import { withRuleLock } from './ruleLock'

/**
 * „NIE DER LETZTE AKTIVE ADMIN" (Vorfall 2026-11-22, Davids Auftrag
 * 2026-11-23): ein Projekt verliert sein letztes Konto mit dem Label `admin`
 * weder durch LÖSCHEN (selbst oder Betreiber), noch durch SPERREN, noch durch
 * ENTZUG des Labels. Alle vier Schreibstellen laufen hier durch:
 * `deleteUserCompletely` (Schritt „Sperren"), die Sperr-Routen des
 * admin-Layers und `mutateUserLabels` (Entzug von `admin`).
 *
 * GEZÄHLT WIRD FRISCH bei Appwrite, nie aus dem Anmelde-Merker, und nur
 * AKTIVE Konten: ein gesperrter Admin kann sich nicht anmelden und rettet
 * niemanden (BE-021).
 *
 * OHNE LÜCKE BEI GLEICHZEITIGEN ANFRAGEN: „zählen, dann handeln" hält nur
 * unter einer Sperre — zwei Anfragen (zwei Admins löschen sich gleichzeitig,
 * oder einer entzieht dem anderen das Label, während der sich löscht) sähen
 * sonst beide „es gibt noch einen anderen". Appwrite kennt kein bedingtes
 * Schreiben, also nimmt die Prüfung die Regel-Sperre des Projekts
 * (`ruleLock.ts`, Tabelle `system_runs`, EINE Zeile mit fester Id je Projekt,
 * über Prozessgrenzen hinweg). Unter der Sperre läuft NUR der eine Schritt,
 * der das Konto aus der Menge der aktiven Admins nimmt (Sperren oder
 * Label-Entzug, Millisekunden) — danach sieht jede weitere Zählung den neuen
 * Stand, die lange Löschung läuft ohne Sperre weiter.
 *
 * DIE SPERRE NUR, WENN ES UM EINEN ADMIN GEHT: wer kein aktiver Admin ist,
 * ändert die Zahl nicht — gewöhnliche Löschungen bleiben ohne Sperre und ohne
 * Abhängigkeit von `system_runs`. Ist die Sperre nicht prüfbar, gilt
 * „nicht prüfbar heißt nicht frei": 503, der Admin bleibt.
 */

/** Was die Prüfung von Appwrites Users-API braucht (Admin-Client oder Attrappe). */
export interface LastAdminUsersApi {
  get: (args: { userId: string }) => Promise<{ $id: string, labels?: string[], status?: boolean }>
  list: (args: { queries: string[] }) => Promise<{ total: number, users: Array<{ $id: string }> }>
}

export interface LastAdminDeps {
  users: LastAdminUsersApi
  /** Führt `work` unter der Projekt-Sperre aus. */
  lock: <T>(work: () => Promise<T>) => Promise<T>
}

/** Die Sperre heißt so — EIN Gegenstand je Projekt. */
export const LAST_ADMIN_LOCK_SCOPE = 'last-admin'

export function lastAdminError() {
  return createError({ status: 409, statusText: 'At least one admin must remain', data: { code: LAST_ADMIN_CODE } })
}

/** Aktiv und mit dem Label `admin`. */
export function isActiveAdmin(user: { labels?: string[], status?: boolean } | null | undefined): boolean {
  return !!user && user.status !== false && (user.labels ?? []).includes(ADMIN_LABEL)
}

/** Gibt es außer `targetUserId` noch einen aktiven Admin? Frisch gezählt. */
export async function otherActiveAdminExists(users: LastAdminUsersApi, targetUserId: string): Promise<boolean> {
  // Zwei genügen: unter zwei verschiedenen Konten ist mindestens eines nicht das Ziel.
  const res = await users.list({
    queries: [Query.contains('labels', ADMIN_LABEL), Query.equal('status', true), Query.limit(2)],
  })
  return res.users.some(user => user.$id !== targetUserId)
}

function isNotFound(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 404
}

/** Admin-Client und Projekt-Sperre dieses Requests (oder ohne Request). */
export function lastAdminDeps(event?: H3Event): LastAdminDeps {
  const users = createAdminClient(event).users as unknown as LastAdminUsersApi
  const projectId = useRuntimeConfig(event).public.appwriteProjectId
  return {
    users,
    lock: work => withRuleLock(event, { scope: LAST_ADMIN_LOCK_SCOPE, subject: `project:${projectId}` }, work),
  }
}

/**
 * VORAB-PRÜFUNG ohne Sperre: für eine frühe, freundliche Antwort (vor der
 * frischen Anmeldung, vor dem Snapshot). Ersetzt NIE `withLastAdminGuard` —
 * zwischen dieser Prüfung und dem Schreiben kann sich die Zahl ändern.
 */
export async function assertNotLastAdmin(
  event: H3Event | undefined,
  targetUserId: string,
  deps: Pick<LastAdminDeps, 'users'> = lastAdminDeps(event),
): Promise<void> {
  const res = await deps.users.list({
    queries: [Query.contains('labels', ADMIN_LABEL), Query.equal('status', true), Query.limit(2)],
  })
  if (res.total > 1) return
  if (res.users[0]?.$id === targetUserId) throw lastAdminError()
}

/**
 * `work` nimmt `targetUserId` aus der Menge der aktiven Admins (sperren,
 * Label entziehen). Ist das Ziel ein aktiver Admin, läuft `work` nur unter
 * der Projekt-Sperre und nur, wenn danach noch ein anderer aktiver Admin
 * bleibt — sonst 409 `last_admin`. Ein unbekanntes Ziel (404) geht ohne
 * Prüfung durch: `work` meldet es selbst.
 */
export async function withLastAdminGuard<T>(
  event: H3Event | undefined,
  targetUserId: string,
  work: () => Promise<T>,
  deps: LastAdminDeps = lastAdminDeps(event),
): Promise<T> {
  const target = await deps.users.get({ userId: targetUserId }).catch((error: unknown) => {
    if (isNotFound(error)) return null
    throw error
  })
  if (!isActiveAdmin(target)) return await work()

  return await deps.lock(async () => {
    if (!(await otherActiveAdminExists(deps.users, targetUserId))) {
      logEvent('warn', 'auth.last_admin_refused', { userId: targetUserId })
      throw lastAdminError()
    }
    return await work()
  })
}
