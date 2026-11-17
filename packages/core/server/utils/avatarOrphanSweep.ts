import { Query } from 'node-appwrite'
import {
  AVATAR_ORPHAN_GRACE_DAYS,
  AVATAR_ORPHAN_SWEEP_JOB,
  avatarOrphanCandidate,
  avatarOrphanReason,
  type AvatarOrphanFile,
  type AvatarOwnerState,
} from '../../shared/avatarOrphan'
import {
  RETENTION_DAY_MS,
  type ActiveRowRetentionMode,
  type RowRetentionDeps,
  type RowRetentionLimits,
  type RowRetentionMode,
  type RowRetentionResult,
} from '../../shared/rowRetention'
import { logEvent } from './logEvent'
import { retentionModeOf, runRetentionJob } from './rowRetention'
import { isAppwriteUserMissing } from './userDataOrchestration'

/**
 * AUFRÄUM-LAUF FÜR PROFILBILDER OHNE PROFIL (KE3, seit 2026-11-17).
 *
 * WAS ER TUT: er blättert den EINEN Avatars-Bucket der App
 * (`public.appwriteAvatarsBucket`) ältestes zuerst durch, bis zur ersten Datei
 * innerhalb der Schonfrist (7 Tage), schlägt je Datei den Besitzer aus ihren
 * Rechten nach und entfernt sie, wenn das Konto nicht auf sie verweist oder
 * es das Konto nicht mehr gibt (Regel: `shared/avatarOrphan.ts`). Schalter
 * `pukalani.storage.avatarOrphanSweep` (off / count / apply); Schleife,
 * Sperre und Log-Zeilen kommen aus dem Gerüst der Fristen-Läufe
 * (`server/utils/rowRetention.ts`, Log `retention.run` mit
 * `job: avatar-orphan-sweep`).
 *
 * WAS ER NIE TUT: einen anderen Bucket anfassen; eine Datei innerhalb der
 * Schonfrist löschen; eine Datei ohne eindeutigen Besitzer löschen; aus einem
 * Fehler beim Nachschlagen „Konto weg" schließen (nur `user_not_found`); ein
 * Konto, ein Profil oder eine Zeile ändern; in `count` irgendetwas löschen.
 *
 * KEIN NACHSCHLAGE-CACHE, mit Absicht. Das Gerüst ruft `decide(datei)` und
 * gleich danach `remove(datei)` — `decide` liest das Konto deshalb je Datei
 * FRISCH, und eine Entscheidung ist nie älter als die eine Datei. Ein Cache je
 * Lauf hätte in `apply` eine Entscheidung von vor Minuten getragen (das Konto
 * kann in der Zeit genau diese Datei eingetragen haben), in `count` hätte er
 * nur Aufrufe gespart — die Zahl wäre dieselbe. Einfach und richtig schlägt
 * hier sparsam: Konten mit Dateien jenseits der Schonfrist sind wenige.
 *
 * UND DOCH NOCH EINMAL VOR DEM LÖSCHEN: `remove` liest das Konto ein zweites
 * Mal und prüft Regel 3 erneut. Hat es die Datei inzwischen eingetragen, wird
 * NICHT gelöscht: `remove` antwortet dem Gerüst `'kept'`, die Datei zählt dann
 * weder als fällig noch als Fehler. Der Lauf meldet diese Fälle als
 * `keptAtDelete` (eigene Zeile `avatar_orphan.sweep`).
 */

/** Ein Profilbild im Bucket — der Ausschnitt, den der Lauf liest. */
export type AvatarSweepFile = AvatarOrphanFile

/** Der schmale Ausschnitt des Storage-Dienstes; der echte `Storage` passt. */
export interface AvatarSweepStorage {
  listFiles(params: { bucketId: string, queries?: string[] }): Promise<{ files: AvatarSweepFile[] }>
  deleteFile(params: { bucketId: string, fileId: string }): Promise<unknown>
}

/** Der schmale Ausschnitt des Users-Dienstes; der echte `Users` passt. */
export interface AvatarSweepUsers {
  get(params: { userId: string }): Promise<{ prefs?: unknown }>
}

/** Das Ergebnis eines Laufs: die Zahlen des Gerüsts plus zwei eigene. */
export interface AvatarOrphanSweepResult extends RowRetentionResult {
  /** Jenseits der Schonfrist, aber ohne eindeutigen Besitzer — bleiben (Altbestand). */
  unowned: number
  /** Fällig entschieden, aber vor dem Löschen doch eingetragen — bleiben. */
  keptAtDelete: number
}

/** „Diese Datei gibt es nicht mehr" — NUR, wenn Appwrite das sagt (kein Proxy-404). */
export function isAvatarFileGone(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, type } = error as { code?: unknown, type?: unknown }
  return code === 404 && type === 'storage_file_not_found'
}

/** Den Besitzer nachschlagen. Nur `user_not_found` heißt „weg"; alles andere wirft. */
async function lookupOwner(users: AvatarSweepUsers, userId: string): Promise<AvatarOwnerState> {
  try {
    const user = await users.get({ userId })
    const prefs = (user.prefs ?? {}) as { avatarUrl?: unknown }
    return { gone: false, avatarUrl: prefs.avatarUrl }
  }
  catch (error) {
    if (isAppwriteUserMissing(error)) return { gone: true }
    throw error
  }
}

interface SweepCounters {
  unowned: number
  keptAtDelete: number
}

/**
 * Die Abhängigkeiten für das Gerüst. Kandidaten: die Dateien des Buckets,
 * aufsteigend nach `$createdAt` — dieselben Abfragen wie der Lauf der
 * Lösch-Kopien (`pruneExpiredGdprExports`), die auf Production erprobt sind.
 * Eine Vorauswahl `lessThan('$createdAt', …)` an der Datei-Liste ist dort
 * nicht erprobt; stattdessen schneidet `listPage` die Seite an der ersten
 * Datei innerhalb der Schonfrist ab — dahinter ist jede weitere jünger, die
 * kürzere Seite beendet den Lauf.
 */
export function avatarOrphanSweepDeps(
  storage: AvatarSweepStorage,
  users: AvatarSweepUsers,
  bucketId: string,
  now: Date,
  counters: SweepCounters = { unowned: 0, keptAtDelete: 0 },
): RowRetentionDeps<AvatarSweepFile> {
  const cutoffMs = now.getTime() - AVATAR_ORPHAN_GRACE_DAYS * RETENTION_DAY_MS
  const decided = new Map<string, string>()

  return {
    listPage: async ({ after, limit }) => {
      const queries = [Query.orderAsc('$createdAt'), Query.limit(limit)]
      if (after) queries.push(Query.cursorAfter(after))
      const { files } = await storage.listFiles({ bucketId, queries })
      const young = files.findIndex((file) => {
        const at = Date.parse(file.$createdAt)
        return Number.isFinite(at) && at >= cutoffMs
      })
      return young === -1 ? files : files.slice(0, young)
    },
    decide: async (file, at) => {
      const candidate = avatarOrphanCandidate(file, at)
      if (candidate.kind === 'young') return null
      if (candidate.kind === 'unowned') {
        counters.unowned++
        return null
      }
      const reason = avatarOrphanReason(file.$id, bucketId, await lookupOwner(users, candidate.ownerId))
      if (reason) decided.set(file.$id, candidate.ownerId)
      return reason
    },
    remove: async (file) => {
      const ownerId = decided.get(file.$id)
      decided.delete(file.$id)
      if (!ownerId) throw new Error('avatar orphan sweep: remove without decision')
      // Zweites Nachschlagen direkt vor dem Löschen (s. Kopf).
      const reason = avatarOrphanReason(file.$id, bucketId, await lookupOwner(users, ownerId))
      if (reason === null) {
        counters.keptAtDelete++
        return 'kept'
      }
      await storage.deleteFile({ bucketId, fileId: file.$id })
      return undefined
    },
    isGone: isAvatarFileGone,
  }
}

/** Der wirksame Schalter dieser App (`pukalani.storage.avatarOrphanSweep`). */
export function avatarOrphanSweepMode(): RowRetentionMode {
  const appConfig = useAppConfig() as { pukalani?: { storage?: { avatarOrphanSweep?: unknown } } }
  return retentionModeOf(AVATAR_ORPHAN_SWEEP_JOB, appConfig.pukalani?.storage?.avatarOrphanSweep)
}

export interface AvatarOrphanSweepOptions {
  /** Bezugszeitpunkt — nur für Tests. */
  now?: Date
  limits?: Partial<RowRetentionLimits>
  /** Eingereicht nur in Tests; sonst Admin-Client ohne Event und die Runtime-Config. */
  storage?: AvatarSweepStorage
  users?: AvatarSweepUsers
  bucketId?: string
}

function emptyResult(mode: ActiveRowRetentionMode): AvatarOrphanSweepResult {
  return {
    mode, considered: 0, expired: 0, deleted: 0, failed: 0, truncated: false, byReason: {},
    unowned: 0, keptAtDelete: 0,
  }
}

/**
 * EIN LAUF (Takt und Hand-Route). `null`, wenn gerade einer läuft (Sperre des
 * Gerüsts). Ohne Bucket: nur Nullen, nichts gelesen. Ein Lesefehler der
 * Datei-Liste wirft (`retention.failed`).
 */
export async function runAvatarOrphanSweep(
  mode: ActiveRowRetentionMode,
  opts: AvatarOrphanSweepOptions = {},
): Promise<AvatarOrphanSweepResult | null> {
  const bucketId = opts.bucketId ?? useRuntimeConfig().public.appwriteAvatarsBucket
  if (!bucketId) return emptyResult(mode)

  const now = opts.now ?? new Date()
  let storage = opts.storage
  let users = opts.users
  if (!storage || !users) {
    const admin = createAdminClient()
    storage ??= admin.storage as unknown as AvatarSweepStorage
    users ??= admin.users as unknown as AvatarSweepUsers
  }

  const counters: SweepCounters = { unowned: 0, keptAtDelete: 0 }
  const deps = avatarOrphanSweepDeps(storage, users, bucketId, now, counters)
  const raw = await runRetentionJob(AVATAR_ORPHAN_SWEEP_JOB, mode, deps, { now, limits: opts.limits })
  if (!raw) return null

  const result: AvatarOrphanSweepResult = {
    ...raw,
    unowned: counters.unowned,
    keptAtDelete: counters.keptAtDelete,
  }
  if (mode === 'count' || result.unowned > 0 || result.keptAtDelete > 0) {
    logEvent('info', 'avatar_orphan.sweep', {
      job: AVATAR_ORPHAN_SWEEP_JOB,
      mode,
      unowned: result.unowned,
      keptAtDelete: result.keptAtDelete,
    })
  }
  return result
}
