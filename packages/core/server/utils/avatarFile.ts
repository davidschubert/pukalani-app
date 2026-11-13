import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import { fileBelongsToUser } from '../../shared/avatarOwnership'

/**
 * fileId aus einer Storage-Avatar-URL (/api/storage/<bucket>/<id>?…), sonst
 * null. Eine Quelle für zwei Nutzer: profile.put (Alt-Avatar ersetzen) und
 * die GDPR-Löschung (Avatar-Datei entfernen).
 */
export function avatarFileId(url: unknown, bucketId: string): string | null {
  if (typeof url !== 'string' || !bucketId) return null
  const match = url.match(/^\/api\/storage\/([^/]+)\/([^/?]+)/)
  return match && match[1] === bucketId ? match[2]! : null
}

/**
 * Der schmale Ausschnitt des Storage-Dienstes, den das Aufräumen braucht —
 * der echte `Storage` aus node-appwrite passt, ein Test übergibt eine
 * In-Memory-Attrappe.
 */
export interface AvatarBucketStorage {
  listFiles(params: { bucketId: string, queries?: string[] }): Promise<{ files: Pick<Models.File, '$id' | '$permissions'>[] }>
  deleteFile(params: { bucketId: string, fileId: string }): Promise<unknown>
}

export interface AvatarCleanupResult {
  deleted: number
  failed: number
}

const PAGE_SIZE = 100

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 404
}

/**
 * Löscht ALLE Avatar-Dateien eines Kontos (BE-001) — nicht nur die, auf die
 * `prefs.avatarUrl` zeigt. Jeder Upload legt eine neue Datei an; wer hochlädt,
 * ohne das Profil zu speichern, hinterlässt Dateien ohne Verweis, die sonst die
 * Kontolöschung überleben.
 *
 * Zugehörigkeit = ein Datei-Recht zeigt auf genau dieses Konto
 * (`fileBelongsToUser`). Die Datei-Liste von Appwrite lässt sich nicht nach
 * Rechten filtern, deshalb blättert der Lauf den GANZEN Bucket durch — vertretbar,
 * weil eine Kontolöschung selten ist. ERST vollständig sammeln, DANN löschen:
 * Löschen während des Blätterns verschiebt den Cursor.
 *
 * `extraFileIds` (die Datei aus `prefs.avatarUrl`) werden immer mitgelöscht —
 * Bestandsdateien können abweichende Rechte tragen. Scheitert schon das
 * Auflisten, zählt das als `failed`, die bekannten Dateien werden trotzdem
 * gelöscht. 404 beim Löschen = schon weg = Erfolg; jeder andere Fehler zählt
 * als `failed`, ohne die Schleife abzubrechen.
 */
export async function deleteAvatarFilesOf(
  storage: AvatarBucketStorage,
  bucketId: string,
  userId: string,
  extraFileIds: readonly (string | null | undefined)[] = [],
): Promise<AvatarCleanupResult> {
  const result: AvatarCleanupResult = { deleted: 0, failed: 0 }
  if (!bucketId || !userId) return result

  const fileIds = new Set<string>()
  for (const id of extraFileIds) {
    if (id) fileIds.add(id)
  }

  try {
    let cursor: string | undefined
    for (;;) {
      const page = await storage.listFiles({
        bucketId,
        queries: [Query.limit(PAGE_SIZE), ...(cursor ? [Query.cursorAfter(cursor)] : [])],
      })
      for (const file of page.files) {
        if (fileBelongsToUser(file.$permissions, userId)) fileIds.add(file.$id)
      }
      if (page.files.length < PAGE_SIZE) break
      cursor = page.files[page.files.length - 1]!.$id
    }
  }
  catch {
    result.failed++
  }

  for (const fileId of fileIds) {
    try {
      await storage.deleteFile({ bucketId, fileId })
      result.deleted++
    }
    catch (error) {
      if (isNotFound(error)) result.deleted++
      else result.failed++
    }
  }
  return result
}
