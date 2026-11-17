import { describe, expect, it } from 'vitest'
import {
  AVATAR_ORPHAN_GRACE_DAYS,
  AVATAR_ORPHAN_SWEEP_JOB,
  avatarOrphanCandidate,
  avatarOrphanReason,
} from '../shared/avatarOrphan'
import { avatarFileIdFromUrl, avatarFileOwnerIds } from '../shared/avatarOwnership'
import { avatarFileId } from '../server/utils/avatarFile'

/**
 * KE3: die REGEL „Profilbild ohne Profil", pur und mit gestellter Uhr.
 * Der Lauf drumherum: `avatarOrphanSweep.test.ts`.
 */

const NOW = new Date('2026-11-17T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const BUCKET = 'avatars'

function owned(userId: string): string[] {
  return ['read("any")', `update("user:${userId}")`, `delete("user:${userId}")`]
}

function file(id: string, ageMs: number, permissions: string[]) {
  return { $id: id, $createdAt: new Date(NOW.getTime() - ageMs).toISOString(), $permissions: permissions }
}

describe('Konstanten', () => {
  it('Schonfrist 7 Tage, Kennung avatar-orphan-sweep', () => {
    expect(AVATAR_ORPHAN_GRACE_DAYS).toBe(7)
    expect(AVATAR_ORPHAN_SWEEP_JOB).toBe('avatar-orphan-sweep')
  })
})

describe('avatarOrphanCandidate — Schonfrist und Besitzer', () => {
  it('genau 7 Tage alt ⇒ noch in der Schonfrist', () => {
    expect(avatarOrphanCandidate(file('f', 7 * DAY, owned('u1')), NOW)).toEqual({ kind: 'young' })
  })

  it('7 Tage und 1 ms ⇒ Kandidat mit seinem Besitzer', () => {
    expect(avatarOrphanCandidate(file('f', 7 * DAY + 1, owned('u1')), NOW)).toEqual({ kind: 'candidate', ownerId: 'u1' })
  })

  it('frisch hochgeladen (das Rennen mit dem offenen Formular) ⇒ jung', () => {
    expect(avatarOrphanCandidate(file('f', 60 * 1000, owned('u1')), NOW)).toEqual({ kind: 'young' })
  })

  it('unlesbares oder leeres Datum ⇒ bleibt (jung)', () => {
    expect(avatarOrphanCandidate({ $id: 'f', $createdAt: 'kaputt', $permissions: owned('u1') }, NOW)).toEqual({ kind: 'young' })
    expect(avatarOrphanCandidate({ $id: 'f', $createdAt: '', $permissions: owned('u1') }, NOW)).toEqual({ kind: 'young' })
  })

  it('kein Konto in den Rechten (Altbestand) ⇒ unowned', () => {
    expect(avatarOrphanCandidate(file('f', 30 * DAY, ['read("any")']), NOW)).toEqual({ kind: 'unowned' })
    expect(avatarOrphanCandidate(file('f', 30 * DAY, []), NOW)).toEqual({ kind: 'unowned' })
  })

  it('zwei Konten in den Rechten ⇒ unowned', () => {
    const permissions = ['read("any")', 'update("user:u1")', 'delete("user:u2")']
    expect(avatarOrphanCandidate(file('f', 30 * DAY, permissions), NOW)).toEqual({ kind: 'unowned' })
  })

  it('ein Lese-Recht macht niemanden zum Besitzer', () => {
    const permissions = ['read("user:fremd")', ...owned('u1')]
    expect(avatarOrphanCandidate(file('f', 30 * DAY, permissions), NOW)).toEqual({ kind: 'candidate', ownerId: 'u1' })
  })
})

describe('avatarOrphanReason — der Verweis im Profil', () => {
  it('das Konto verweist auf genau diese Datei ⇒ bleibt', () => {
    expect(avatarOrphanReason('f1', BUCKET, { gone: false, avatarUrl: '/api/storage/avatars/f1?v=3' })).toBeNull()
  })

  it('das Konto zeigt auf eine andere Datei ⇒ unreferenced', () => {
    expect(avatarOrphanReason('f1', BUCKET, { gone: false, avatarUrl: '/api/storage/avatars/f2' })).toBe('unreferenced')
  })

  it('das Konto hat kein Bild oder eine fremde Adresse ⇒ unreferenced', () => {
    expect(avatarOrphanReason('f1', BUCKET, { gone: false, avatarUrl: undefined })).toBe('unreferenced')
    expect(avatarOrphanReason('f1', BUCKET, { gone: false, avatarUrl: 'https://example.com/f1.png' })).toBe('unreferenced')
    expect(avatarOrphanReason('f1', BUCKET, { gone: false, avatarUrl: '/api/storage/anderer/f1' })).toBe('unreferenced')
  })

  it('das Konto gibt es nicht mehr ⇒ owner_gone', () => {
    expect(avatarOrphanReason('f1', BUCKET, { gone: true })).toBe('owner_gone')
  })
})

describe('avatarOwnership — Besitzer und URL', () => {
  it('Besitzer aus update/delete, ohne Doppel, mit Status-Suffix', () => {
    expect(avatarFileOwnerIds(owned('u1'))).toEqual(['u1'])
    expect(avatarFileOwnerIds(['update("user:u1/verified")', 'delete("user:u1")'])).toEqual(['u1'])
    expect(avatarFileOwnerIds(['read("any")', 'update("users")', 'delete("label:admin")'])).toEqual([])
    expect(avatarFileOwnerIds(undefined)).toEqual([])
  })

  it('die Server-Hülle avatarFileId liest wie die pure Fassung', () => {
    for (const url of ['/api/storage/avatars/abc?v=1', '/api/storage/x/abc', 'nix', undefined]) {
      expect(avatarFileId(url, BUCKET)).toBe(avatarFileIdFromUrl(url, BUCKET))
    }
    expect(avatarFileId('/api/storage/avatars/abc?v=1', BUCKET)).toBe('abc')
  })
})
