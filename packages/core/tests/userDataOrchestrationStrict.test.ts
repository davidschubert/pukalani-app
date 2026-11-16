import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import type { UserDataContributor } from '../server/utils/userData'

/**
 * DIE ORCHESTRIERUNG UNTERSCHEIDET „KONTO WEG" VON „KONTO NICHT LESBAR"
 * (SEC-026, Nachtrag).
 *
 * Bis hierher stand am Anfang von `deleteUserCompletely`
 * `users.get(…).catch(() => null)`: JEDER Fehler — ein 500, ein Netz-Wackler —
 * schaltete in den Modus „Konto schon weg". Dort fallen Snapshot und Sperre
 * aus, die Contributors löschen aber trotzdem. Ein Wackler hiess also: Daten
 * weg, kein Snapshot, Konto UNgesperrt. Jetzt ist nur das 404 für den Nutzer
 * „weg"; jeder andere Fehler bricht ab, BEVOR etwas Zerstörerisches läuft.
 *
 * Und der Export im Admin-Pfad (Snapshot vor der Löschung, Betreiber-Export)
 * ist streng: eine nicht lesbare Sitzungsliste ist kein leerer Abschnitt.
 */

const calls: string[] = []
let getUser: () => Promise<unknown>
let listSessions: () => Promise<{ sessions: unknown[] }>
let sessionListSessions: () => Promise<{ sessions: unknown[] }>
let contributors: UserDataContributor[]

const users = {
  get: vi.fn(async () => getUser()),
  listSessions: vi.fn(async () => listSessions()),
  updateStatus: vi.fn(async () => { calls.push('block') }),
  deleteSessions: vi.fn(async () => {}),
  delete: vi.fn(async () => { calls.push('users.delete') }),
}

vi.mock('../server/lib/appwrite', () => ({
  createSessionClient: () => ({ account: { listSessions: () => sessionListSessions() } }),
}))

vi.stubGlobal('createAdminClient', () => ({
  users,
  storage: { createFile: async () => ({ $id: 'f' }), listFiles: async () => ({ files: [] }) },
  presences: { delete: async () => {} },
}))
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteGdprBucket: '', appwriteAvatarsBucket: '' } }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('logAuthEvent', async () => {})
vi.stubGlobal('listUserDataContributors', () => contributors)
vi.stubGlobal('mapExportAccount', (user: { $id: string }) => ({ id: user.$id }))
vi.stubGlobal('mapExportSessions', (sessions: unknown[]) => sessions)
vi.stubGlobal('avatarFileId', () => null)
vi.stubGlobal('deleteAvatarFilesOf', async () => ({ deleted: 0, failed: 0 }))

const { deleteUserCompletely, exportAudience, exportUserCompletely } = await import('../server/utils/userDataOrchestration')

const event = { context: { user: { $id: 'u1' } } } as unknown as H3Event

function contributor(id: string): UserDataContributor {
  return {
    id,
    exportUserData: async () => ({}),
    deleteUserData: async () => {
      calls.push(`delete:${id}`)
      return { deleted: 1, anonymized: 0 }
    },
  }
}

beforeEach(() => {
  calls.length = 0
  getUser = async () => ({ $id: 'u1', prefs: {} })
  listSessions = async () => ({ sessions: [] })
  sessionListSessions = async () => ({ sessions: [] })
  contributors = [contributor('a'), contributor('b')]
  users.delete.mockClear()
})

describe('deleteUserCompletely — wann ist ein Konto „schon weg"?', () => {
  it('users.get mit 500 ⇒ Abbruch, KEIN Contributor lief, nichts gesperrt', async () => {
    getUser = async () => { throw new AppwriteException('Server Error', 500) }
    await expect(deleteUserCompletely(event, 'u1', { actor: 'admin' })).rejects.toThrow()
    expect(calls).toEqual([])
  })

  it('users.get mit Netzfehler ⇒ Abbruch, KEIN Contributor lief', async () => {
    getUser = async () => { throw new Error('fetch failed') }
    await expect(deleteUserCompletely(event, 'u1', { actor: 'admin' })).rejects.toThrow()
    expect(calls).toEqual([])
  })

  it('users.get mit 404 OHNE Art (Proxy antwortet, Appwrite fehlt) ⇒ Abbruch, KEIN Contributor lief', async () => {
    getUser = async () => { throw new AppwriteException('Not found', 404) }
    await expect(deleteUserCompletely(event, 'u1', { actor: 'admin' })).rejects.toThrow()
    expect(calls).toEqual([])
  })

  it('users.get mit 404 user_not_found ⇒ Orphan-Modus: Contributors laufen, kein users.delete', async () => {
    getUser = async () => { throw new AppwriteException('User not found', 404, 'user_not_found') }
    const result = await deleteUserCompletely(event, 'u1', { actor: 'admin' })
    expect(result.ok).toBe(true)
    expect(calls).toEqual(['delete:a', 'delete:b'])
    expect(users.delete).not.toHaveBeenCalled()
  })

  it('Normalfall: sperren, Contributors, dann users.delete', async () => {
    const result = await deleteUserCompletely(event, 'u1', { actor: 'admin' })
    expect(result.ok).toBe(true)
    expect(calls).toEqual(['block', 'delete:a', 'delete:b', 'users.delete'])
  })

  it('Snapshot-Export mit nicht lesbaren Sitzungen ⇒ Abbruch vor dem Sperren', async () => {
    listSessions = async () => { throw new AppwriteException('Server Error', 500) }
    await expect(deleteUserCompletely(event, 'u1', { actor: 'admin' })).rejects.toThrow()
    expect(calls).toEqual([])
  })
})

describe('exportUserCompletely — die Sitzungsliste', () => {
  it('admin-Pfad: ein Lesefehler bricht den Export ab', async () => {
    listSessions = async () => { throw new AppwriteException('Server Error', 500) }
    await expect(exportUserCompletely(event, 'u1', { via: 'admin' })).rejects.toThrow()
  })

  it('session-Pfad: bleibt nachsichtig, sagt es aber (sessionsUnavailable)', async () => {
    sessionListSessions = async () => { throw new Error('blip') }
    const result = await exportUserCompletely(event, 'u1', { via: 'session' })
    expect(result.sessions).toEqual([])
    expect(result.sessionsUnavailable).toBe(true)
  })

  it('session-Pfad ohne Fehler trägt KEIN sessionsUnavailable', async () => {
    const result = await exportUserCompletely(event, 'u1', { via: 'session' })
    expect(result.sessionsUnavailable).toBeUndefined()
  })
})

describe('Empfänger des Exports (SEC-034): via ⇒ audience', () => {
  function recording(seen: string[]): UserDataContributor {
    return {
      id: 'rec',
      exportUserData: async (_event, _userId, context) => {
        seen.push(context.audience)
        return {}
      },
      deleteUserData: async () => ({ deleted: 0, anonymized: 0 }),
    }
  }

  it('die Regel: session ⇒ self, admin ⇒ operator', () => {
    expect(exportAudience('session')).toBe('self')
    expect(exportAudience('admin')).toBe('operator')
  })

  it('Selbst-Export reicht self durch, Betreiber-Export operator', async () => {
    const seen: string[] = []
    contributors = [recording(seen)]
    await exportUserCompletely(event, 'u1', { via: 'session' })
    await exportUserCompletely(event, 'u1', { via: 'admin' })
    expect(seen).toEqual(['self', 'operator'])
  })

  it('die Kopie vor der Löschung ist ein Betreiber-Export', async () => {
    const seen: string[] = []
    contributors = [recording(seen)]
    await deleteUserCompletely(event, 'u1', { actor: 'admin' })
    expect(seen).toEqual(['operator'])
  })
})
