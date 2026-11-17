import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeAuditLog, auditUnavailableError } from '../../core/server/utils/auditLog'
import { recordAudit } from '../server/utils/audit'
import { auditIdList, AUDIT_METADATA_MAX_CHARS } from '../server/utils/auditMetadata'
import { recordAuditView } from '../../core/server/utils/auditView'
import { isDeletableBucket } from '../server/utils/storageBuckets'

/**
 * BETREIBER-PROTOKOLL AN DEN ROUTEN (BE-021/SEC-034, 2026-11-16).
 *
 * Ausgeführt werden die ECHTEN Handler mit dem ECHTEN Schreiber
 * (`recordAudit` → `writeAuditLog`); gestubbt sind nur Appwrite und die
 * Nitro-Auto-Imports. Geprüft wird die Regel „abbrechen oder weiterlaufen":
 *   · Herausgabe von Personendaten ⇒ strikt: scheitert der Eintrag, 503
 *     `audit_unavailable`, und die Daten verlassen die Route NICHT.
 *   · alles andere läuft weiter, der Ausfall steht nur im Log.
 */

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

const ACTOR = { $id: 'betreiber-1', name: 'Max Betreiber', labels: ['admin'] }

let auditRows: Record<string, unknown>[]
let auditFails: boolean
let logs: Array<{ event: string, data: Record<string, unknown> }>
let calls: string[]
let headers: Record<string, string>
let adminClient: Record<string, unknown>

function stubCommon(extra: Record<string, unknown> = {}) {
  vi.resetModules()
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('requirePermission', (_event: unknown, permission: string) => { calls.push(`permission:${permission}`); return ACTOR })
  vi.stubGlobal('requireRecentAuth', async () => { calls.push('recentAuth') })
  vi.stubGlobal('createError', (init: Record<string, unknown>) =>
    Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
  vi.stubGlobal('toH3Error', (error: unknown) => error)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main', appwriteGdprBucket: 'gdpr-exports', appwriteAvatarsBucket: 'avatars' } }))
  vi.stubGlobal('trustedClientIp', () => '')
  vi.stubGlobal('logEvent', (_level: string, event: string, data: Record<string, unknown> = {}) => { logs.push({ event, data }) })
  vi.stubGlobal('setHeader', (_event: unknown, name: string, value: string) => { headers[name] = value })
  vi.stubGlobal('setResponseStatus', () => {})
  vi.stubGlobal('createAdminClient', () => ({
    tablesDB: {
      createRow: async ({ data }: { data: Record<string, unknown> }) => {
        if (auditFails) throw new Error('audit down')
        auditRows.push(data)
        return {}
      },
    },
    ...adminClient,
  }))
  vi.stubGlobal('writeAuditLog', writeAuditLog)
  vi.stubGlobal('auditUnavailableError', auditUnavailableError)
  vi.stubGlobal('recordAudit', recordAudit)
  vi.stubGlobal('recordAuditView', recordAuditView)
  vi.stubGlobal('auditIdList', auditIdList)
  for (const [name, value] of Object.entries(extra)) vi.stubGlobal(name, value)
}

async function handler(path: string) {
  const module = await import(path) as { default: (event: unknown) => Promise<unknown> }
  return module.default
}

function event(params: Record<string, string> = {}) {
  return { context: { user: ACTOR }, params }
}

beforeEach(() => {
  auditRows = []
  auditFails = false
  logs = []
  calls = []
  headers = {}
  adminClient = {}
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const routerParam = { getRouterParam: (ev: { params: Record<string, string> }, name: string) => ev.params[name] }

describe('Herausgabe ist strikt: erst der Eintrag, dann die Daten', () => {
  it('Export einer Person: Protokoll fällt aus ⇒ 503 audit_unavailable, nichts kommt zurück', async () => {
    stubCommon({
      ...routerParam,
      exportUserCompletely: async () => { calls.push('export'); return { account: { name: 'Erika' }, data: { messages: 'GEHEIM' } } },
    })
    const run = await handler('../server/api/admin/users/[id]/export.get.ts')
    auditFails = true
    await expect(run(event({ id: 'person-42' }))).rejects.toMatchObject({ status: 503, data: { code: 'audit_unavailable' } })
    expect(logs.filter(entry => entry.event === 'audit.write_failed')).toHaveLength(1)
    // Reihenfolge der Wachen: Rechte, frische Anmeldung, erst dann Daten.
    expect(calls).toEqual(['permission:users.manage', 'recentAuth', 'export'])
  })

  it('Export einer Person: mit Eintrag kommen die Daten', async () => {
    stubCommon({
      ...routerParam,
      exportUserCompletely: async () => ({ account: { name: 'Erika' }, data: {} }),
    })
    const run = await handler('../server/api/admin/users/[id]/export.get.ts')
    await expect(run(event({ id: 'person-42' }))).resolves.toMatchObject({ account: { name: 'Erika' } })
    expect(auditRows).toEqual([expect.objectContaining({ action: 'user.exported', targetId: 'person-42' })])
  })

  it('ohne frische Anmeldung wird gar nicht erst gelesen', async () => {
    stubCommon({
      ...routerParam,
      requireRecentAuth: async () => { throw Object.assign(new Error('Recent sign-in required'), { status: 403 }) },
      exportUserCompletely: async () => { calls.push('export'); return { account: { name: 'x' }, data: {} } },
    })
    const run = await handler('../server/api/admin/users/[id]/export.get.ts')
    await expect(run(event({ id: 'person-42' }))).rejects.toMatchObject({ status: 403 })
    expect(calls).not.toContain('export')
    expect(auditRows).toEqual([])
  })

  it('CSV: Protokoll fällt aus ⇒ 503, keine Datei (kein Header gesetzt)', async () => {
    adminClient = { users: { list: async () => ({ users: [{ $id: 'u1', name: 'Erika', email: 'erika@example.org', $createdAt: '', accessedAt: '', status: true, labels: [], emailVerification: true }] }) } }
    stubCommon()
    const run = await handler('../server/api/admin/users/export-csv.get.ts')
    auditFails = true
    await expect(run(event())).rejects.toMatchObject({ status: 503, data: { code: 'audit_unavailable' } })
    expect(headers).toEqual({})
    auditFails = false
    const csv = await run(event())
    expect(String(csv)).toContain('erika@example.org')
    expect(auditRows).toEqual([expect.objectContaining({ action: 'user.csv_exported', metadata: '{"count":1}' })])
  })

  it('Lösch-Kopie: Protokoll fällt aus ⇒ 503; mit Eintrag gdpr_export.downloaded OHNE Dateinamen', async () => {
    adminClient = {
      storage: {
        getFile: async () => ({ name: 'gdpr-export-person-42-2026.json' }),
        getFileDownload: async () => '{"a":1}',
      },
    }
    stubCommon(routerParam)
    const run = await handler('../server/api/admin/gdpr-exports/[fileId].get.ts')
    auditFails = true
    await expect(run(event({ fileId: 'f1' }))).rejects.toMatchObject({ status: 503, data: { code: 'audit_unavailable' } })
    expect(headers).toEqual({})
    auditFails = false
    await expect(run(event({ fileId: 'f1' }))).resolves.toBe('{"a":1}')
    expect(auditRows).toEqual([expect.objectContaining({ action: 'gdpr_export.downloaded', targetType: 'gdpr_export', targetId: 'f1', targetName: '' })])
    expect(JSON.stringify(auditRows)).not.toContain('person-42')
  })

  it('im Quelltext steht der strikte Eintrag VOR der Antwort', () => {
    for (const [path, answer] of [
      ['../server/api/admin/users/[id]/export.get.ts', 'return payload'],
      ['../server/api/admin/users/export-csv.get.ts', 'setHeader(event'],
      ['../server/api/admin/gdpr-exports/[fileId].get.ts', 'setHeader(event'],
    ] as const) {
      const source = read(path)
      const strict = source.indexOf('{ strict: true })')
      expect(strict, path).toBeGreaterThan(-1)
      expect(strict, path).toBeLessThan(source.indexOf(answer))
    }
  })
})

describe('Ansichten: festgehalten, entprellt, ohne Namen und ohne Suchbegriff', () => {
  const detailStubs = () => ({
    ...routerParam,
    createSessionClient: () => ({ account: { getSession: async () => ({ $id: 's' }) } }),
    tenantDb: () => ({ list: async () => ({ total: 0, rows: [] }) }),
    listOnlinePresences: async () => [],
    mapSafeSession: (session: unknown) => session,
    lookupCityForIp: async () => null,
    // Die Aktivitätsliste (AL1) hat ihren eigenen Test — hier nur still leer.
    listUserActivity: async () => ({ activity: [], truncated: false }),
  })

  it('Konto ansehen: ein Eintrag je (Betreiber, Konto) in 15 Minuten', async () => {
    adminClient = {
      users: {
        get: async ({ userId }: { userId: string }) => ({ $id: userId, name: 'Erika Beispiel', email: 'erika@example.org', prefs: {}, labels: [] }),
        listSessions: async () => ({ sessions: [] }),
        listTargets: async () => ({ targets: [] }),
      },
    }
    stubCommon(detailStubs())
    const run = await handler('../server/api/admin/users/[id]/index.get.ts')
    await run(event({ id: 'person-a1' }))
    await run(event({ id: 'person-a1' }))
    await run(event({ id: 'person-b1' }))
    expect(auditRows.map(row => [row.action, row.targetId])).toEqual([['user.viewed', 'person-a1'], ['user.viewed', 'person-b1']])
    expect(JSON.stringify(auditRows)).not.toContain('Erika')
    expect(JSON.stringify(auditRows)).not.toContain('example.org')
  })

  it('Konto ansehen: Protokoll fällt aus ⇒ die Seite kommt trotzdem, der Ausfall steht im Log', async () => {
    adminClient = {
      users: {
        get: async ({ userId }: { userId: string }) => ({ $id: userId, name: 'X', email: '', prefs: {}, labels: [] }),
        listSessions: async () => ({ sessions: [] }),
        listTargets: async () => ({ targets: [] }),
      },
    }
    stubCommon(detailStubs())
    const run = await handler('../server/api/admin/users/[id]/index.get.ts')
    auditFails = true
    await expect(run(event({ id: 'person-c1' }))).resolves.toMatchObject({ user: { $id: 'person-c1' } })
    expect(logs.map(entry => entry.event)).toEqual(['audit.write_failed'])
  })

  it('Liste ansehen: ein Eintrag je Betreiber, nur „searched", nie der Suchbegriff', async () => {
    adminClient = { users: { list: async () => ({ total: 0, users: [] }) } }
    let query: Record<string, string> = { search: 'erika@example.org' }
    stubCommon({
      getQuery: () => query,
      listOnlinePresences: async () => [],
      USERS_NEW_WINDOW_MS: 1,
      USERS_ACTIVE_WINDOW_MS: 1,
    })
    const run = await handler('../server/api/admin/users/index.get.ts')
    const listActor = { $id: 'betreiber-liste', name: 'L', labels: ['admin'] }
    await run({ context: { user: listActor } })
    query = { page: '2' }
    await run({ context: { user: listActor } })
    expect(auditRows).toHaveLength(1)
    expect(auditRows[0]).toMatchObject({ action: 'user.list_viewed', metadata: '{"searched":true}', targetName: '' })
    expect(JSON.stringify(auditRows)).not.toContain('erika')
  })
})

describe('Sammel-Sperre: Ziel-Ids im Protokoll, sicher unter der Spaltengröße', () => {
  it('auditIdList kürzt unter dem Budget und sagt es', () => {
    const ids = Array.from({ length: 25 }, (_, i) => `${'x'.repeat(250)}${i}`)
    const list = auditIdList(ids)
    expect(list.truncated).toBe(true)
    expect(list.total).toBe(25)
    expect(JSON.stringify({ count: 25, failed: 0, ...list }).length).toBeLessThan(AUDIT_METADATA_MAX_CHARS)
    expect(auditIdList(['a', 'b'])).toEqual({ ids: ['a', 'b'], total: 2, truncated: false })
  })

  it('die Route schreibt ids/total/truncated und sperrt weiter, wenn das Protokoll ausfällt', async () => {
    const updated: string[] = []
    adminClient = { users: { updateStatus: async ({ userId }: { userId: string }) => { updated.push(userId) } } }
    stubCommon({
      readValidatedBody: async (_event: unknown, parse: (body: unknown) => unknown) => parse({ action: 'block', ids: ['u1', 'u2', 'u1'] }),
      assertNotLastAdmin: async () => {},
    })
    const run = await handler('../server/api/admin/users/bulk.post.ts')
    await expect(run(event())).resolves.toMatchObject({ ok: true, done: ['u1', 'u2'] })
    expect(JSON.parse(String(auditRows[0]!.metadata))).toEqual({ count: 2, failed: 0, ids: ['u1', 'u2'], total: 2, truncated: false })
    auditFails = true
    await expect(run(event())).resolves.toMatchObject({ ok: true })
    expect(updated).toEqual(['u1', 'u2', 'u1', 'u2'])
  })
})

describe('Konto anlegen: scheitern die Rollen, steht die Anlage trotzdem im Protokoll', () => {
  it('Eintrag mit rolesFailed, danach der 502 wie bisher', async () => {
    adminClient = { users: { create: async () => ({ $id: 'neu-1', name: 'Neu', email: 'neu@example.org' }) } }
    stubCommon({
      isRole: (value: string) => value === 'moderator',
      capabilitiesFor: () => new Set(['x']),
      ROLE_CAPABILITIES: { moderator: ['x'] },
      readValidatedBody: async (_event: unknown, parse: (body: unknown) => unknown) =>
        parse({ name: 'Neu', email: 'neu@example.org', password: 'ein-langes-passwort', roles: ['moderator'] }),
      mutateUserLabels: async () => ({ ok: false, reason: 'failed' }),
    })
    const run = await handler('../server/api/admin/users/index.post.ts')
    await expect(run(event())).rejects.toMatchObject({ status: 502 })
    expect(auditRows).toEqual([expect.objectContaining({ action: 'user.created', targetId: 'neu-1' })])
    expect(JSON.parse(String(auditRows[0]!.metadata))).toEqual({ roles: ['moderator'], rolesFailed: true })
  })
})

describe('Speicher: Erlaubnisliste statt Sperrliste', () => {
  it('die Regel', () => {
    for (const id of ['avatars', 'fonts', 'favicons', 'media', 'event-covers', 'brand-drafts', 'brand-inspiration', 'runner-files', 'ticket-files']) {
      expect(isDeletableBucket(id), id).toBe(true)
    }
    expect(isDeletableBucket('gdpr-exports')).toBe(false)
    expect(isDeletableBucket('neuer-bucket')).toBe(false)
    // Ids aus der Config: eine umbenannte Avatar-Ablage bleibt löschbar,
    // eine umbenannte GDPR-Ablage nie.
    expect(isDeletableBucket('profilbilder', { avatarsBucket: 'profilbilder' })).toBe(true)
    expect(isDeletableBucket('media', { gdprBucket: 'media' })).toBe(false)
  })

  it('die Route lehnt alles außerhalb der Liste ab, bevor sie Appwrite fragt', async () => {
    const deleted: string[] = []
    adminClient = {
      storage: {
        getBucket: async () => ({}),
        deleteFile: async ({ bucketId }: { bucketId: string }) => { deleted.push(bucketId) },
      },
    }
    stubCommon({
      bucketDeletable: (_event: unknown, id: string) => isDeletableBucket(id, { avatarsBucket: 'avatars', gdprBucket: 'gdpr-exports' }),
      getRouterParam: (ev: { params: Record<string, string> }, name: string) => ev.params[name],
    })
    const run = await handler('../server/api/admin/storage/[bucket]/[fileId].delete.ts')
    await expect(run(event({ bucket: 'gdpr-exports', fileId: 'f' }))).rejects.toMatchObject({ status: 403 })
    await expect(run(event({ bucket: 'neuer-bucket', fileId: 'f' }))).rejects.toMatchObject({ status: 403 })
    await expect(run(event({ bucket: 'avatars', fileId: 'f' }))).resolves.toEqual({ ok: true })
    expect(deleted).toEqual(['avatars'])
  })
})

describe('Letzter Admin: es zählen nur aktive Konten', () => {
  it('fragt nach Label UND Status', async () => {
    const seen: string[][] = []
    adminClient = {
      users: {
        list: async ({ queries }: { queries: string[] }) => {
          seen.push(queries)
          return { total: 1, users: [{ $id: 'admin-1' }] }
        },
      },
    }
    stubCommon()
    const { assertNotLastAdmin } = await import('../server/utils/admins')
    await expect(assertNotLastAdmin({} as never, 'admin-1')).rejects.toMatchObject({ data: { code: 'last_admin' } })
    const parsed = seen[0]!.map(q => JSON.parse(q) as { method: string, attribute?: string, values?: unknown[] })
    expect(parsed).toContainEqual(expect.objectContaining({ method: 'equal', attribute: 'status', values: [true] }))
    expect(parsed).toContainEqual(expect.objectContaining({ method: 'contains', attribute: 'labels' }))
  })
})
