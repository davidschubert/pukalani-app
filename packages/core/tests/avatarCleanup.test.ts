import { describe, it, expect } from 'vitest'
import { fileBelongsToUser } from '../shared/avatarOwnership'
import { deleteAvatarFilesOf } from '../server/utils/avatarFile'
import type { AvatarBucketStorage } from '../server/utils/avatarFile'

/**
 * BE-001: die Kontolöschung räumt ALLE Avatar-Dateien eines Kontos ab, nicht
 * nur die, auf die `prefs.avatarUrl` zeigt.
 */

const BUCKET = 'avatars'

function uploadPermissions(userId: string): string[] {
  // So vergibt sie der Upload-Endpunkt je Datei.
  return ['read("any")', `update("user:${userId}")`, `delete("user:${userId}")`]
}

interface FakeFile {
  $id: string
  $permissions: string[]
}

class AppwriteLikeError extends Error {
  constructor(public code: number) {
    super(`appwrite ${code}`)
  }
}

/** Liest `limit`/`cursorAfter` aus den serialisierten Query-Strings von node-appwrite. */
function parseQueries(queries: string[] = []): { limit: number, cursorAfter?: string } {
  let limit = 25
  let cursorAfter: string | undefined
  for (const raw of queries) {
    const q = JSON.parse(raw) as { method: string, values?: unknown[] }
    if (q.method === 'limit') limit = Number(q.values?.[0])
    if (q.method === 'cursorAfter') cursorAfter = String(q.values?.[0])
  }
  return { limit, cursorAfter }
}

/** In-Memory-Bucket mit echtem Blättern (Cursor = $id, Reihenfolge = Einfügen). */
function fakeStorage(initial: FakeFile[], opts: {
  failDelete?: Record<string, number>
  failList?: boolean
} = {}) {
  const files = [...initial]
  const calls = { list: 0, delete: 0, limits: [] as number[] }
  const storage: AvatarBucketStorage = {
    async listFiles({ bucketId, queries }) {
      calls.list++
      if (opts.failList) throw new AppwriteLikeError(500)
      if (bucketId !== BUCKET) throw new AppwriteLikeError(404)
      const { limit, cursorAfter } = parseQueries(queries)
      calls.limits.push(limit)
      const start = cursorAfter ? files.findIndex(f => f.$id === cursorAfter) + 1 : 0
      return { files: files.slice(start, start + limit).map(f => ({ ...f })) }
    },
    async deleteFile({ bucketId, fileId }) {
      calls.delete++
      if (bucketId !== BUCKET) throw new AppwriteLikeError(404)
      const forced = opts.failDelete?.[fileId]
      if (forced) throw new AppwriteLikeError(forced)
      const index = files.findIndex(f => f.$id === fileId)
      if (index === -1) throw new AppwriteLikeError(404)
      files.splice(index, 1)
      return {}
    },
  }
  return { storage, files, calls, ids: () => files.map(f => f.$id) }
}

describe('fileBelongsToUser', () => {
  it('trifft update/delete/read mit user:<id>, auch mit Status-Suffix', () => {
    expect(fileBelongsToUser(['update("user:u1")'], 'u1')).toBe(true)
    expect(fileBelongsToUser(['delete("user:u1")'], 'u1')).toBe(true)
    expect(fileBelongsToUser(['read("user:u1")'], 'u1')).toBe(true)
    expect(fileBelongsToUser(['read("any")', 'update("user:u1/verified")'], 'u1')).toBe(true)
    expect(fileBelongsToUser(uploadPermissions('u1'), 'u1')).toBe(true)
  })

  it('vergleicht die Id exakt (keine Präfix-Kollision)', () => {
    expect(fileBelongsToUser(uploadPermissions('abc'), 'ab')).toBe(false)
    expect(fileBelongsToUser(uploadPermissions('ab'), 'abc')).toBe(false)
    expect(fileBelongsToUser(['update("user:abc/verified")'], 'ab')).toBe(false)
  })

  it('zählt any, users, label und team nicht', () => {
    expect(fileBelongsToUser(['read("any")'], 'u1')).toBe(false)
    expect(fileBelongsToUser(['read("users")', 'read("label:u1")', 'update("team:u1")'], 'u1')).toBe(false)
  })

  it('leere Id oder fehlende Rechte ⇒ false', () => {
    expect(fileBelongsToUser(uploadPermissions(''), '')).toBe(false)
    expect(fileBelongsToUser(['update("user:u1")'], '')).toBe(false)
    expect(fileBelongsToUser(undefined, 'u1')).toBe(false)
    expect(fileBelongsToUser([], 'u1')).toBe(false)
  })
})

describe('deleteAvatarFilesOf', () => {
  it('BE-001: zwei Uploads, nur einer im Profil ⇒ beide weg, fremde Datei bleibt', async () => {
    // Mit dem alten Verhalten (nur die Profil-Datei löschen) bliebe upload-1 liegen.
    const bucket = fakeStorage([
      { $id: 'upload-1', $permissions: uploadPermissions('u1') },
      { $id: 'other-1', $permissions: uploadPermissions('u2') },
      { $id: 'upload-2', $permissions: uploadPermissions('u1') },
    ])
    const result = await deleteAvatarFilesOf(bucket.storage, BUCKET, 'u1', ['upload-2'])
    expect(bucket.ids()).toEqual(['other-1'])
    expect(result).toEqual({ deleted: 2, failed: 0 })
  })

  it('blättert über mehr als 100 Dateien, löscht alle eigenen und keine fremde', async () => {
    const initial: FakeFile[] = []
    for (let i = 0; i < 250; i++) {
      const owner = i % 3 === 0 ? 'u1' : `other-${i}`
      initial.push({ $id: `f-${String(i).padStart(3, '0')}`, $permissions: uploadPermissions(owner) })
    }
    const ownCount = initial.filter(f => f.$permissions.includes('delete("user:u1")')).length
    const bucket = fakeStorage(initial)
    const result = await deleteAvatarFilesOf(bucket.storage, BUCKET, 'u1')
    expect(bucket.calls.list).toBe(3)
    expect(bucket.calls.limits).toEqual([100, 100, 100])
    expect(result).toEqual({ deleted: ownCount, failed: 0 })
    expect(bucket.files).toHaveLength(250 - ownCount)
    expect(bucket.files.some(f => fileBelongsToUser(f.$permissions, 'u1'))).toBe(false)
    // Die letzte eigene Datei liegt hinter der zweiten Seite — Gegenprobe zum Blättern.
    expect(bucket.ids()).not.toContain('f-249')
  })

  it('Bestandsdatei ohne Konto-Recht wird nur über extraFileIds gelöscht', async () => {
    const legacy = { $id: 'legacy', $permissions: ['read("any")'] }
    const without = fakeStorage([legacy])
    expect(await deleteAvatarFilesOf(without.storage, BUCKET, 'u1')).toEqual({ deleted: 0, failed: 0 })
    expect(without.ids()).toEqual(['legacy'])

    const withExtra = fakeStorage([legacy])
    expect(await deleteAvatarFilesOf(withExtra.storage, BUCKET, 'u1', ['legacy', null, undefined])).toEqual({ deleted: 1, failed: 0 })
    expect(withExtra.ids()).toEqual([])
  })

  it('404 beim Löschen zählt als Erfolg', async () => {
    const bucket = fakeStorage([{ $id: 'a', $permissions: uploadPermissions('u1') }])
    const result = await deleteAvatarFilesOf(bucket.storage, BUCKET, 'u1', ['schon-weg'])
    expect(result).toEqual({ deleted: 2, failed: 0 })
    expect(bucket.ids()).toEqual([])
  })

  it('500 bei einer Datei zählt als failed, die übrigen werden trotzdem gelöscht', async () => {
    const bucket = fakeStorage([
      { $id: 'a', $permissions: uploadPermissions('u1') },
      { $id: 'b', $permissions: uploadPermissions('u1') },
      { $id: 'c', $permissions: uploadPermissions('u1') },
    ], { failDelete: { a: 500 } })
    const result = await deleteAvatarFilesOf(bucket.storage, BUCKET, 'u1')
    expect(result).toEqual({ deleted: 2, failed: 1 })
    expect(bucket.ids()).toEqual(['a'])
  })

  it('Listen-Fehler ⇒ failed, die Extra-Datei wird trotzdem gelöscht', async () => {
    const bucket = fakeStorage([
      { $id: 'profil', $permissions: uploadPermissions('u1') },
      { $id: 'other', $permissions: uploadPermissions('u2') },
    ], { failList: true })
    const result = await deleteAvatarFilesOf(bucket.storage, BUCKET, 'u1', ['profil'])
    expect(result.failed).toBeGreaterThanOrEqual(1)
    expect(result.deleted).toBe(1)
    expect(bucket.ids()).toEqual(['other'])
  })

  it('ohne bucketId oder userId kein einziger Storage-Aufruf', async () => {
    const bucket = fakeStorage([{ $id: 'a', $permissions: uploadPermissions('u1') }])
    expect(await deleteAvatarFilesOf(bucket.storage, '', 'u1', ['a'])).toEqual({ deleted: 0, failed: 0 })
    expect(await deleteAvatarFilesOf(bucket.storage, BUCKET, '', ['a'])).toEqual({ deleted: 0, failed: 0 })
    expect(bucket.calls).toEqual({ list: 0, delete: 0, limits: [] })
    expect(bucket.ids()).toEqual(['a'])
  })
})
