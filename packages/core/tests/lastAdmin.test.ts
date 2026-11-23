import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'

/**
 * „NIE DER LETZTE AKTIVE ADMIN" (Vorfall 2026-11-22).
 *
 * Die Attrappe ist ein Konto-Speicher (Labels + Status) und eine Lauf-Tabelle
 * mit ECHTEM Konflikt beim Anlegen einer vorhandenen Id — dieselbe Eigenschaft,
 * auf der die Projekt-Sperre bei Appwrite beruht. Jeder Zugriff gibt die
 * Kontrolle ab, damit gleichzeitige Anfragen sich wirklich verschränken: ohne
 * Sperre sähen zwei Löschungen von zwei Admins beide „es gibt noch einen".
 */

const tick = () => new Promise<void>(resolve => setImmediate(resolve))

interface FakeUser { $id: string, labels: string[], status: boolean, prefs: Record<string, unknown> }

const accounts = new Map<string, FakeUser>()
const calls: string[] = []
const removedFiles: string[] = []

function seed(...list: Array<[string, string[], boolean?]>) {
  accounts.clear()
  for (const [id, labels, status] of list) accounts.set(id, { $id: id, labels, status: status ?? true, prefs: {} })
}

function notFound() {
  return new AppwriteException('User not found', 404, 'user_not_found')
}

const users = {
  get: vi.fn(async ({ userId }: { userId: string }) => {
    await tick()
    const user = accounts.get(userId)
    if (!user) throw notFound()
    return { ...user, labels: [...user.labels] }
  }),
  list: vi.fn(async ({ queries }: { queries: string[] }) => {
    await tick()
    const parsed = queries.map(q => JSON.parse(q) as { method: string, attribute?: string, values?: unknown[] })
    const limit = Number(parsed.find(q => q.method === 'limit')?.values?.[0] ?? 25)
    const matching = [...accounts.values()].filter(user => user.labels.includes('admin') && user.status)
    return { total: matching.length, users: matching.slice(0, limit).map(user => ({ $id: user.$id })) }
  }),
  updateStatus: vi.fn(async ({ userId, status }: { userId: string, status: boolean }) => {
    await tick()
    const user = accounts.get(userId)
    if (!user) throw notFound()
    user.status = status
    calls.push(`status:${userId}:${status}`)
    return { ...user }
  }),
  updateLabels: vi.fn(async ({ userId, labels }: { userId: string, labels: string[] }) => {
    await tick()
    const user = accounts.get(userId)
    if (!user) throw notFound()
    user.labels = [...labels]
    calls.push(`labels:${userId}:${labels.join(',')}`)
    return { ...user }
  }),
  listSessions: vi.fn(async () => ({ sessions: [] })),
  deleteSessions: vi.fn(async () => {}),
  delete: vi.fn(async ({ userId }: { userId: string }) => {
    await tick()
    accounts.delete(userId)
    calls.push(`delete:${userId}`)
  }),
}

/** `system_runs` mit echtem 409 beim Anlegen einer vorhandenen Id. */
const runRows = new Map<string, Record<string, unknown>>()
const tablesDB = {
  async listRows({ queries }: { queries: string[] }) {
    await tick()
    const parsed = queries.map(q => JSON.parse(q) as { method: string, attribute?: string, values?: unknown[] })
    const want = (attr: string) => parsed.find(q => q.method === 'equal' && q.attribute === attr)?.values?.[0]
    const rows = [...runRows.values()]
      .filter(row => row.scope === want('scope') && row.subject === want('subject'))
      .sort((a, b) => Number(b.seq) - Number(a.seq))
    return { total: rows.length, rows: rows.slice(0, 1) }
  },
  async createRow({ rowId, data }: { rowId: string, data: Record<string, unknown> }) {
    await tick()
    if (runRows.has(rowId)) throw new AppwriteException('Row already exists', 409, 'row_already_exists')
    const row = { $id: rowId, finishedAt: '', outcome: '', ...data }
    runRows.set(rowId, row)
    return { ...row }
  },
  async updateRow({ rowId, data }: { rowId: string, data: Record<string, unknown> }) {
    await tick()
    const row = runRows.get(rowId)
    if (!row) throw new AppwriteException('Row not found', 404)
    Object.assign(row, data)
    return { ...row }
  },
  async deleteRow({ rowId }: { rowId: string }) {
    await tick()
    runRows.delete(rowId)
  },
}

vi.mock('../server/lib/appwrite', () => ({
  createSessionClient: () => ({ account: { listSessions: async () => ({ sessions: [] }) } }),
}))

vi.stubGlobal('createAdminClient', () => ({
  users,
  tablesDB,
  storage: {
    createFile: async () => ({ $id: 'snapshot-1' }),
    listFiles: async () => ({ files: [] }),
    deleteFile: async ({ fileId }: { fileId: string }) => { removedFiles.push(fileId) },
  },
  presences: { delete: async () => {} },
}))
vi.stubGlobal('useRuntimeConfig', () => ({
  public: { appwriteProjectId: 'account', appwriteDatabaseId: 'main', appwriteGdprBucket: 'gdpr-exports', appwriteAvatarsBucket: '' },
}))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('logAuthEvent', async () => {})
vi.stubGlobal('listUserDataContributors', () => [])
vi.stubGlobal('mapExportAccount', (user: { $id: string }) => ({ id: user.$id }))
vi.stubGlobal('mapExportSessions', (sessions: unknown[]) => sessions)
vi.stubGlobal('avatarFileId', () => null)
vi.stubGlobal('deleteAvatarFilesOf', async () => ({ deleted: 0, failed: 0 }))

const { withLastAdminGuard, assertNotLastAdmin } = await import('../server/utils/lastAdmin')
const { mutateUserLabels } = await import('../server/utils/userLabels')
const { deleteUserCompletely } = await import('../server/utils/userDataOrchestration')

const event = { context: {} } as unknown as H3Event

const block = (userId: string) => () => users.updateStatus({ userId, status: false })
const activeAdmins = () => [...accounts.values()].filter(user => user.status && user.labels.includes('admin')).map(user => user.$id).sort()

beforeEach(() => {
  calls.length = 0
  removedFiles.length = 0
  runRows.clear()
})

describe('withLastAdminGuard — der eine Schritt, der einen aktiven Admin wegnimmt', () => {
  it('der letzte aktive Admin: 409 last_admin, nichts geschrieben', async () => {
    seed(['a1', ['admin']], ['m1', []])
    await expect(withLastAdminGuard(event, 'a1', block('a1'))).rejects.toMatchObject({ status: 409, data: { code: 'last_admin' } })
    expect(calls).toEqual([])
    expect(activeAdmins()).toEqual(['a1'])
  })

  it('Gegenprobe: mit zwei aktiven Admins geht es — beim zweiten dann nicht mehr', async () => {
    seed(['a1', ['admin']], ['a2', ['admin']])
    await withLastAdminGuard(event, 'a1', block('a1'))
    expect(activeAdmins()).toEqual(['a2'])
    await expect(withLastAdminGuard(event, 'a2', block('a2'))).rejects.toMatchObject({ data: { code: 'last_admin' } })
    expect(activeAdmins()).toEqual(['a2'])
  })

  it('ein gesperrter Admin zählt nicht als „anderer"', async () => {
    seed(['a1', ['admin']], ['a2', ['admin'], false])
    await expect(withLastAdminGuard(event, 'a1', block('a1'))).rejects.toMatchObject({ data: { code: 'last_admin' } })
  })

  it('kein Admin: keine Sperre, keine Zählung', async () => {
    seed(['a1', ['admin']], ['m1', []])
    users.list.mockClear()
    await withLastAdminGuard(event, 'm1', block('m1'))
    expect(users.list).not.toHaveBeenCalled()
    expect(runRows.size).toBe(0)
  })

  it('gleichzeitig: zwei Admins sperren einander ⇒ genau einer gelingt, einer bleibt aktiv', async () => {
    seed(['a1', ['admin']], ['a2', ['admin']])
    const results = await Promise.allSettled([
      withLastAdminGuard(event, 'a1', block('a1')),
      withLastAdminGuard(event, 'a2', block('a2')),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const refused = results.find(r => r.status === 'rejected') as PromiseRejectedResult
    expect(refused.reason).toMatchObject({ status: 409, data: { code: 'last_admin' } })
    expect(activeAdmins()).toHaveLength(1)
    expect(runRows.size, 'die Sperre fällt nach jeder Anfrage').toBe(0)
  })

  it('Gegenprobe ohne Sperre: dieselbe Zählung ohne Sperre lässt beide durch (das Fenster gibt es)', async () => {
    seed(['a1', ['admin']], ['a2', ['admin']])
    const unlocked = { users, lock: <T>(work: () => Promise<T>) => work() }
    await Promise.allSettled([
      withLastAdminGuard(event, 'a1', block('a1'), unlocked),
      withLastAdminGuard(event, 'a2', block('a2'), unlocked),
    ])
    expect(activeAdmins()).toEqual([])
  })

  it('Vorab-Prüfung ohne Sperre lehnt den letzten ab und lässt den vorletzten durch', async () => {
    seed(['a1', ['admin']], ['a2', ['admin']])
    await expect(assertNotLastAdmin(event, 'a1')).resolves.toBeUndefined()
    seed(['a1', ['admin']])
    await expect(assertNotLastAdmin(event, 'a1')).rejects.toMatchObject({ data: { code: 'last_admin' } })
  })
})

describe('mutateUserLabels — Entzug von `admin`', () => {
  it('beim letzten aktiven Admin: last_admin, Label bleibt', async () => {
    seed(['a1', ['admin', 'c1']])
    const result = await mutateUserLabels(event, 'a1', { remove: ['admin'] })
    expect(result).toEqual({ ok: false, reason: 'last_admin' })
    expect(accounts.get('a1')!.labels).toEqual(['admin', 'c1'])
  })

  it('Gegenprobe: mit zwei Admins wird entzogen, andere Labels bleiben wörtlich', async () => {
    seed(['a1', ['c1', 'admin', 'moderator']], ['a2', ['admin']])
    const result = await mutateUserLabels(event, 'a1', { remove: ['admin'] })
    expect(result).toMatchObject({ ok: true, changed: true, labels: ['c1', 'moderator'] })
  })

  it('ein Konto ohne `admin`: der Entzug ist „nichts zu tun", ohne Sperre', async () => {
    seed(['a1', ['admin']], ['m1', ['c1']])
    const result = await mutateUserLabels(event, 'm1', { remove: ['admin', 'moderator'] })
    expect(result).toMatchObject({ ok: true, changed: false })
    expect(runRows.size).toBe(0)
  })

  it('gleichzeitig: Label-Entzug beim einen, Sperren des anderen ⇒ einer bleibt aktiver Admin', async () => {
    seed(['a1', ['admin']], ['a2', ['admin']])
    const [labelResult, blockResult] = await Promise.allSettled([
      mutateUserLabels(event, 'a1', { remove: ['admin'] }),
      withLastAdminGuard(event, 'a2', block('a2')),
    ])
    expect(activeAdmins()).toHaveLength(1)
    const labelOk = labelResult.status === 'fulfilled' && labelResult.value.ok
    expect(labelOk !== (blockResult.status === 'fulfilled'), 'genau eine Seite gewinnt').toBe(true)
  })

  it('eine Users-Attrappe ohne Prüfung darf `admin` nicht entziehen', async () => {
    seed(['a1', ['admin']], ['a2', ['admin']])
    const result = await mutateUserLabels(users, 'a1', { remove: ['admin'] })
    expect(result).toMatchObject({ ok: false, reason: 'unavailable' })
    expect(accounts.get('a1')!.labels).toEqual(['admin'])
  })
})

describe('deleteUserCompletely — Selbst- und Betreiber-Löschung', () => {
  for (const actor of ['self', 'admin'] as const) {
    it(`${actor}: der letzte aktive Admin ⇒ 409, nicht gesperrt, nicht gelöscht`, async () => {
      seed(['a1', ['admin']], ['m1', []])
      await expect(deleteUserCompletely(event, 'a1', { actor })).rejects.toMatchObject({ status: 409, data: { code: 'last_admin' } })
      expect(accounts.get('a1')).toMatchObject({ status: true, labels: ['admin'] })
      expect(calls).toEqual([])
    })
  }

  it('Gegenprobe: mit zwei Admins wird gesperrt und gelöscht', async () => {
    seed(['a1', ['admin']], ['a2', ['admin']])
    const result = await deleteUserCompletely(event, 'a1', { actor: 'self' })
    expect(result.ok).toBe(true)
    expect(calls).toEqual(['status:a1:false', 'delete:a1'])
    expect(activeAdmins()).toEqual(['a2'])
  })

  it('gleichzeitig: zwei Admins löschen sich selbst ⇒ genau einer ist weg, der Snapshot des anderen wird geräumt', async () => {
    seed(['a1', ['admin']], ['a2', ['admin']])
    const results = await Promise.allSettled([
      deleteUserCompletely(event, 'a1', { actor: 'self' }),
      deleteUserCompletely(event, 'a2', { actor: 'self' }),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { data: { code: 'last_admin' } } })
    expect(activeAdmins()).toHaveLength(1)
    expect(accounts.size).toBe(1)
    expect(removedFiles).toEqual(['snapshot-1'])
  })

  it('ein gewöhnliches Konto: keine Sperre in system_runs', async () => {
    seed(['a1', ['admin']], ['m1', []])
    const result = await deleteUserCompletely(event, 'm1', { actor: 'self' })
    expect(result.ok).toBe(true)
    expect(accounts.has('m1')).toBe(false)
    expect(runRows.size).toBe(0)
  })
})
