import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppwriteException } from 'node-appwrite'

/**
 * KE3: DER AUFRÄUM-LAUF FÜR PROFILBILDER OHNE PROFIL — mit gestellter Uhr,
 * einem Bucket im Speicher und Konten im Speicher. Die Regel selbst prüft
 * `avatarOrphan.test.ts`; hier geht es um das Zusammenspiel mit dem Gerüst
 * der Fristen-Läufe: Blättern, Nachschlagen, `count` gegen `apply`, Fehler
 * beim Nachschlagen und den Verweis, der zwischen Entscheiden und Löschen
 * entsteht.
 */

const BUCKET = 'avatars'
const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-17T12:00:00.000Z')

interface FakeFile { $id: string, $createdAt: string, $permissions: string[] }
type FakeAccount = { avatarUrl?: string } | 'missing' | 'proxy404' | 'boom'

let files: FakeFile[] = []
let accounts: Record<string, FakeAccount> = {}
let onGet: ((userId: string, call: number) => void) | null = null
const calls = { get: [] as string[], delete: [] as string[], queries: [] as string[][] }
const logs: Array<{ level: string, name: string, fields: Record<string, unknown> }> = []

function parseQueries(queries: string[] = []) {
  let limit = 25
  let cursorAfter: string | undefined
  let orderAsc: string | undefined
  for (const raw of queries) {
    const q = JSON.parse(raw) as { method: string, attribute?: string, values?: unknown[] }
    if (q.method === 'limit') limit = Number(q.values?.[0])
    if (q.method === 'cursorAfter') cursorAfter = String(q.values?.[0])
    if (q.method === 'orderAsc') orderAsc = q.attribute
  }
  return { limit, cursorAfter, orderAsc }
}

const storage = {
  async listFiles({ bucketId, queries }: { bucketId: string, queries?: string[] }) {
    calls.queries.push(queries ?? [])
    if (bucketId !== BUCKET) throw new AppwriteException('no bucket', 404, 'storage_bucket_not_found')
    const { limit, cursorAfter, orderAsc } = parseQueries(queries)
    const ordered = orderAsc === '$createdAt'
      ? [...files].sort((a, b) => Date.parse(a.$createdAt) - Date.parse(b.$createdAt) || a.$id.localeCompare(b.$id))
      : [...files]
    if (cursorAfter && !ordered.some(f => f.$id === cursorAfter)) {
      throw new AppwriteException('cursor gone', 400, 'general_cursor_not_found')
    }
    const start = cursorAfter ? ordered.findIndex(f => f.$id === cursorAfter) + 1 : 0
    return { total: files.length, files: ordered.slice(start, start + limit).map(f => ({ ...f })) }
  },
  async deleteFile({ fileId }: { bucketId: string, fileId: string }) {
    calls.delete.push(fileId)
    const index = files.findIndex(f => f.$id === fileId)
    if (index === -1) throw new AppwriteException('gone', 404, 'storage_file_not_found')
    files.splice(index, 1)
    return {}
  },
}

const users = {
  async get({ userId }: { userId: string }) {
    calls.get.push(userId)
    onGet?.(userId, calls.get.filter(id => id === userId).length)
    const account = accounts[userId] ?? 'missing'
    if (account === 'missing') throw new AppwriteException('User not found', 404, 'user_not_found')
    if (account === 'proxy404') throw new AppwriteException('Not Found', 404, '')
    if (account === 'boom') throw new AppwriteException('boom', 500, 'general_unknown')
    return { $id: userId, prefs: account.avatarUrl ? { avatarUrl: account.avatarUrl } : {} }
  },
}

let appConfigMode: unknown = 'count'
let runtimeBucket = BUCKET

vi.mock('../server/lib/appwrite', () => ({ createSessionClient: () => ({}) }))
vi.mock('../server/utils/logEvent', () => ({
  logEvent: (level: string, name: string, fields: Record<string, unknown> = {}) => {
    logs.push({ level, name, fields })
  },
}))
vi.stubGlobal('createAdminClient', () => ({ storage, users }))
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteAvatarsBucket: runtimeBucket } }))
vi.stubGlobal('useAppConfig', () => ({ pukalani: { storage: { avatarOrphanSweep: appConfigMode } } }))

const { runAvatarOrphanSweep, avatarOrphanSweepMode, isAvatarFileGone } = await import('../server/utils/avatarOrphanSweep')
const { __resetRetentionJobsForTests } = await import('../server/utils/rowRetention')

function owned(userId: string): string[] {
  return ['read("any")', `update("user:${userId}")`, `delete("user:${userId}")`]
}

function aged(id: string, ageMs: number, owner: string | string[] | null): FakeFile {
  const permissions = owner === null
    ? ['read("any")']
    : Array.isArray(owner) ? ['read("any")', ...owner.map(o => `update("user:${o}")`)] : owned(owner)
  return { $id: id, $createdAt: new Date(NOW.getTime() - ageMs).toISOString(), $permissions: permissions }
}

function url(fileId: string): string {
  return `/api/storage/${BUCKET}/${fileId}?v=1`
}

beforeEach(() => {
  files = []
  accounts = {}
  onGet = null
  calls.get.length = 0
  calls.delete.length = 0
  calls.queries.length = 0
  logs.length = 0
  appConfigMode = 'count'
  runtimeBucket = BUCKET
  __resetRetentionJobsForTests()
})

describe('runAvatarOrphanSweep — die Regel im Lauf', () => {
  it('Datei mit Verweis bleibt, Datei ohne Verweis nach 7 Tagen ist fällig', async () => {
    files = [aged('current', 30 * DAY, 'u1'), aged('stale', 30 * DAY, 'u1')]
    accounts = { u1: { avatarUrl: url('current') } }
    const result = await runAvatarOrphanSweep('apply', { now: NOW })
    expect(result).toMatchObject({ considered: 2, expired: 1, deleted: 1, failed: 0, byReason: { unreferenced: 1 } })
    expect(files.map(f => f.$id)).toEqual(['current'])
  })

  it('Schonfrist an der Grenze: genau 7 Tage bleibt, 7 Tage + 1 ms ist fällig', async () => {
    files = [aged('edge', 7 * DAY, 'u1'), aged('over', 7 * DAY + 1, 'u1')]
    accounts = { u1: {} }
    const result = await runAvatarOrphanSweep('apply', { now: NOW })
    expect(result).toMatchObject({ considered: 1, expired: 1, deleted: 1 })
    expect(files.map(f => f.$id)).toEqual(['edge'])
  })

  it('frische Datei ohne Verweis bleibt (das Rennen mit dem offenen Formular) — und wird nicht nachgeschlagen', async () => {
    files = [aged('fresh', 5 * 60 * 1000, 'u1')]
    accounts = { u1: {} }
    const result = await runAvatarOrphanSweep('apply', { now: NOW })
    expect(result).toMatchObject({ considered: 0, expired: 0, deleted: 0 })
    expect(files).toHaveLength(1)
    expect(calls.get).toEqual([])
  })

  it('Konto weg (nur user_not_found) ⇒ fällig als owner_gone', async () => {
    files = [aged('f', 10 * DAY, 'ghost')]
    accounts = { ghost: 'missing' }
    const result = await runAvatarOrphanSweep('apply', { now: NOW })
    expect(result).toMatchObject({ expired: 1, deleted: 1, failed: 0, byReason: { owner_gone: 1 } })
    expect(files).toEqual([])
  })

  it('anderer Fehler beim Nachschlagen (Proxy-404 ohne Art, 500) ⇒ failed, die Datei bleibt', async () => {
    files = [aged('a', 10 * DAY, 'proxy'), aged('b', 11 * DAY, 'down')]
    accounts = { proxy: 'proxy404', down: 'boom' }
    const result = await runAvatarOrphanSweep('apply', { now: NOW })
    expect(result).toMatchObject({ considered: 2, expired: 0, deleted: 0, failed: 2 })
    expect(files).toHaveLength(2)
    expect(calls.delete).toEqual([])
    expect(logs.some(l => l.name === 'retention.incomplete' && l.fields.job === 'avatar-orphan-sweep')).toBe(true)
  })

  it('Altbestand ohne oder mit mehreren Besitzern bleibt — eigener Zustand, weder fällig noch Fehler', async () => {
    files = [aged('none', 40 * DAY, null), aged('two', 40 * DAY, ['u1', 'u2'])]
    const result = await runAvatarOrphanSweep('apply', { now: NOW })
    expect(result).toMatchObject({ considered: 2, expired: 0, deleted: 0, failed: 0, unowned: 2 })
    expect(files).toHaveLength(2)
    expect(calls.get).toEqual([])
  })

  it('count löscht nichts und nennt dieselbe Zahl wie apply', async () => {
    const seed = () => {
      files = [
        aged('keep', 20 * DAY, 'u1'),
        aged('stale', 20 * DAY, 'u1'),
        aged('ghost', 15 * DAY, 'gone'),
        aged('legacy', 15 * DAY, null),
        aged('young', 2 * DAY, 'u1'),
      ]
      accounts = { u1: { avatarUrl: url('keep') }, gone: 'missing' }
    }
    seed()
    const counted = await runAvatarOrphanSweep('count', { now: NOW })
    expect(calls.delete).toEqual([])
    expect(files).toHaveLength(5)
    seed()
    const applied = await runAvatarOrphanSweep('apply', { now: NOW })
    expect(counted).toMatchObject({ mode: 'count', expired: 2, deleted: 0, unowned: 1, byReason: { unreferenced: 1, owner_gone: 1 } })
    expect(applied).toMatchObject({ mode: 'apply', expired: 2, deleted: 2, unowned: 1, byReason: { unreferenced: 1, owner_gone: 1 } })
    expect(files.map(f => f.$id).sort()).toEqual(['keep', 'legacy', 'young'])
    // count schreibt seine Zahl immer ins Log — die liest der Betreiber vor `apply`.
    expect(logs.find(l => l.name === 'retention.run' && l.fields.mode === 'count')?.fields).toMatchObject({ job: 'avatar-orphan-sweep', expired: 2 })
  })

  it('Verweis entsteht zwischen Entscheiden und Löschen ⇒ Datei bleibt, kein Fehler im Ergebnis', async () => {
    files = [aged('racing', 10 * DAY, 'u1'), aged('stale', 11 * DAY, 'u2')]
    accounts = { u1: {}, u2: {} }
    // Das zweite Nachschlagen von u1 (in `remove`) sieht die Datei eingetragen.
    onGet = (userId, call) => {
      if (userId === 'u1' && call === 2) accounts.u1 = { avatarUrl: url('racing') }
    }
    const result = await runAvatarOrphanSweep('apply', { now: NOW })
    expect(files.map(f => f.$id)).toEqual(['racing'])
    expect(calls.delete).toEqual(['stale'])
    expect(result).toMatchObject({ expired: 1, deleted: 1, failed: 0, keptAtDelete: 1, byReason: { unreferenced: 1 } })
    expect(logs.find(l => l.name === 'avatar_orphan.sweep')?.fields).toMatchObject({ keptAtDelete: 1 })
  })

  it('blättert ohne Lücke über mehrere Seiten und hört an der Schonfrist auf', async () => {
    files = []
    for (let i = 0; i < 7; i++) files.push(aged(`old${i}`, (30 + i) * DAY, 'u1'))
    files.push(aged('young', DAY, 'u1'))
    accounts = { u1: { avatarUrl: url('old3') } }
    const result = await runAvatarOrphanSweep('apply', { now: NOW, limits: { pageSize: 2 } })
    expect(result).toMatchObject({ considered: 7, expired: 6, deleted: 6, failed: 0 })
    expect(files.map(f => f.$id).sort()).toEqual(['old3', 'young'])
  })

  it('liest mit denselben Abfragen wie der Lauf der Lösch-Kopien (älteste zuerst, ausdrückliche Seitengröße)', async () => {
    files = [aged('a', 10 * DAY, 'u1')]
    accounts = { u1: {} }
    await runAvatarOrphanSweep('count', { now: NOW })
    const methods = calls.queries[0]!.map(q => (JSON.parse(q) as { method: string }).method)
    expect(methods).toEqual(['orderAsc', 'limit'])
  })

  it('ohne Bucket: nur Nullen, nichts gelesen', async () => {
    runtimeBucket = ''
    files = [aged('a', 10 * DAY, 'u1')]
    const result = await runAvatarOrphanSweep('apply', { now: NOW })
    expect(result).toMatchObject({ considered: 0, expired: 0, deleted: 0 })
    expect(calls.queries).toEqual([])
  })

  it('ein zweiter Start während eines Laufs ⇒ null (Sperre des Gerüsts)', async () => {
    files = [aged('a', 10 * DAY, 'u1')]
    accounts = { u1: {} }
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const originalGet = users.get
    users.get = async (args) => {
      await gate
      return originalGet(args)
    }
    try {
      const first = runAvatarOrphanSweep('count', { now: NOW })
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(await runAvatarOrphanSweep('count', { now: NOW })).toBeNull()
      release()
      expect(await first).not.toBeNull()
    }
    finally {
      users.get = originalGet
    }
  })
})

describe('Schalter und Hilfen', () => {
  it('avatarOrphanSweepMode liest pukalani.storage.avatarOrphanSweep; Unbekanntes heißt off', () => {
    appConfigMode = 'apply'
    expect(avatarOrphanSweepMode()).toBe('apply')
    appConfigMode = undefined
    expect(avatarOrphanSweepMode()).toBe('off')
    appConfigMode = 'loeschen'
    expect(avatarOrphanSweepMode()).toBe('off')
    expect(logs.some(l => l.name === 'retention.invalid_mode')).toBe(true)
  })

  it('isAvatarFileGone: nur Appwrites storage_file_not_found, kein Proxy-404', () => {
    expect(isAvatarFileGone(new AppwriteException('gone', 404, 'storage_file_not_found'))).toBe(true)
    expect(isAvatarFileGone(new AppwriteException('Not Found', 404, ''))).toBe(false)
    expect(isAvatarFileGone(new AppwriteException('boom', 500, 'general_unknown'))).toBe(false)
  })
})

describe('Verdrahtung (Quelltext)', () => {
  const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

  it('das Plugin meldet nur mit Bucket und Schalter ≠ off an, alle 6 Stunden', () => {
    const source = read('../server/plugins/avatar-orphan-sweep.ts')
    const bucketGate = source.indexOf('appwriteAvatarsBucket) return')
    const offGate = source.indexOf(`mode === 'off') return`)
    const register = source.indexOf('defineTimedJob(')
    expect(bucketGate).toBeGreaterThan(-1)
    expect(offGate).toBeGreaterThan(bucketGate)
    expect(register).toBeGreaterThan(offGate)
    expect(source).toContain(`name: 'avatar-orphan-sweep'`)
    expect(source).toContain('6 * 60 * 60 * 1000')
    expect(source).toContain('retentionTick(() => runAvatarOrphanSweep(mode))')
  })

  it('der Core-Schalter steht auf off', () => {
    expect(read('../app/app.config.ts')).toMatch(/avatarOrphanSweep: 'off' as RowRetentionMode/)
  })
})
