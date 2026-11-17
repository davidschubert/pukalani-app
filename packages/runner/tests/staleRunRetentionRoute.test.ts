import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetRetentionJobsForTests } from '../../core/server/utils/rowRetention'
import { describeRoleGateToDoor } from '../../core/tests/support/participationHarness'

/**
 * ROLLEN-PROBE UND VERHALTEN DER HAND-ROUTE `POST /api/runner/retention/stale`
 * (RU1 c, OPS-009).
 *
 * Die Route fragt ein INSTANZ-Recht (`requirePermission(event,
 * 'runner.manage')`): entschieden wird über das globale Label, nicht über
 * Community-Rollen — durch kommt nur der Betreiber. Das steht unten
 * ausgeschrieben. Die „Datentür" ist hier der Admin-Client des Laufs.
 *
 * Danach das Verhalten: ohne Angabe nur zählen (auch bei `off`), `apply` nur
 * bei Schalter `apply` (sonst 409 mit eigenem Code), ein laufender Lauf ⇒ 409.
 */

const loadRoute = () => import('../server/api/runner/retention/stale.post')

describeRoleGateToDoor('POST /api/runner/retention/stale', loadRoute, {
  allow: ['operator'],
  deny: ['owner', 'admin', 'moderator', 'editor', 'member'],
}, {
  globals: { useRuntimeConfig: () => ({ public: { appwriteDatabaseId: 'main' } }) },
})

describe('POST /api/runner/retention/stale — Verhalten', () => {
  type Handler = (event: unknown) => Promise<{ mode: string, expired: number, deleted: number }>
  let body: unknown
  let mode: unknown
  let listRows: (args: unknown) => Promise<{ total: number, rows: unknown[] }>
  let writes: number

  async function handler(): Promise<Handler> {
    return (await loadRoute()).default as unknown as Handler
  }

  beforeEach(() => {
    __resetRetentionJobsForTests()
    body = undefined
    mode = 'count'
    writes = 0
    listRows = async () => ({ total: 0, rows: [] })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
    vi.stubGlobal('requirePermission', () => ({ $id: 'u-operator', labels: ['admin'] }))
    vi.stubGlobal('readValidatedBody', async (_event: unknown, parse: (input: unknown) => unknown) => parse(body))
    vi.stubGlobal('createError', (init: Record<string, unknown>) => Object.assign(new Error(String(init.statusText)), init))
    vi.stubGlobal('useAppConfig', () => ({ pukalani: { runner: { staleRunRetention: mode } } }))
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
    vi.stubGlobal('createAdminClient', () => ({
      tablesDB: {
        listRows: (args: unknown) => listRows(args),
        getRow: async () => { throw new Error('nicht erwartet') },
        updateRow: async () => { writes++ },
      },
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('ohne Angabe: zählt nur — auch wenn der Schalter aus ist', async () => {
    mode = 'off'
    const result = await (await handler())({})
    expect(result).toMatchObject({ mode: 'count', deleted: 0 })
    expect(writes).toBe(0)
  })

  it('apply bei Schalter count ⇒ 409 stale_run_retention_not_apply, nichts gelesen', async () => {
    body = { apply: true }
    let listed = 0
    listRows = async () => { listed++; return { total: 0, rows: [] } }
    await expect((await handler())({})).rejects.toMatchObject({ status: 409, data: { code: 'stale_run_retention_not_apply' } })
    expect(listed).toBe(0)
  })

  it('apply bei Schalter apply ⇒ läuft als apply', async () => {
    body = { apply: true }
    mode = 'apply'
    const result = await (await handler())({})
    expect(result.mode).toBe('apply')
  })

  it('läuft schon einer ⇒ 409 stale_run_retention_busy', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    listRows = async () => {
      await gate
      return { total: 0, rows: [] }
    }
    const route = await handler()
    const first = route({})
    await expect(route({})).rejects.toMatchObject({ status: 409, data: { code: 'stale_run_retention_busy' } })
    release()
    await expect(first).resolves.toMatchObject({ mode: 'count' })
  })

  it('ein unbekannter Body-Wert wird abgelehnt statt geraten', async () => {
    body = { apply: 'ja' }
    await expect((await handler())({})).rejects.toBeTruthy()
  })
})
