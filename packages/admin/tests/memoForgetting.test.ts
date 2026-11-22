import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { auditIdList } from '../server/utils/auditMetadata'

/**
 * WER SCHREIBT, RÄUMT DEN MERKER (Q12; Review-Befunde B3 und B4, 2026-11-22).
 *
 * Anmelde-Merker (`core/server/utils/sessionAccount.ts`) und Instanz-Merker
 * (`core/server/utils/instanceReadCache.ts`) sind selbst getestet. Nicht
 * getestet war, dass die Stellen, die ein FREMDES Konto bzw. `app_config`
 * ändern, den Merker auch räumen: entfernte man den Aufruf, blieben alle
 * Tests grün — und ein gesperrtes Konto gälte im selben Prozess bis zu 5 s
 * weiter, ein Not-Aus bis zu 15 s später.
 *
 * Gegenprobe (2026-11-22): `forgetAccountSessions(...)` in jeder der drei
 * Routen bzw. `forgetInstanceRead('app_config')` in `mutateAppConfig`
 * auskommentiert ⇒ der jeweilige Fall unten ist rot.
 */

const { forgetAccountSessions } = vi.hoisted(() => ({ forgetAccountSessions: vi.fn() }))
vi.mock('../../core/server/utils/sessionAccount', () => ({ forgetAccountSessions }))

const OPERATOR = { $id: 'betreiber-1', name: 'Betreiber', labels: ['admin'] }

function stubRouteGlobals(users: Record<string, unknown>, body: unknown = undefined) {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('requirePermission', () => OPERATOR)
  vi.stubGlobal('getRouterParam', (event: { params: Record<string, string> }, name: string) => event.params[name])
  vi.stubGlobal('readValidatedBody', async (_event: unknown, parse: (value: unknown) => unknown) => parse(body))
  vi.stubGlobal('createError', (init: Record<string, unknown>) => Object.assign(new Error(String(init.statusText)), init))
  vi.stubGlobal('toH3Error', (error: unknown) => error)
  vi.stubGlobal('assertNotLastAdmin', async () => {})
  vi.stubGlobal('createAdminClient', () => ({ users }))
  vi.stubGlobal('recordAudit', async () => {})
  vi.stubGlobal('auditIdList', auditIdList)
  vi.stubGlobal('clearSessionCookie', () => {})
}

async function route(path: string) {
  const module = await import(path) as { default: (event: unknown) => Promise<unknown> }
  return module.default
}

const event = (params: Record<string, string> = {}) => ({ context: { user: OPERATOR }, params })

beforeEach(() => {
  vi.resetModules()
  forgetAccountSessions.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('B3: Betreiber-Routen räumen den Anmelde-Merker des Ziel-Kontos', () => {
  it('Sperren (`PATCH /api/admin/users/:id/status`)', async () => {
    stubRouteGlobals({ updateStatus: async () => ({ $id: 'u-ziel', name: 'Ziel', status: false }) }, { blocked: true })
    await (await route('../server/api/admin/users/[id]/status.patch'))(event({ id: 'u-ziel' }))
    expect(forgetAccountSessions).toHaveBeenCalledWith('u-ziel')
  })

  it('Sitzungen beenden (`DELETE /api/admin/users/:id/sessions`)', async () => {
    stubRouteGlobals({ deleteSessions: async () => ({}) })
    await (await route('../server/api/admin/users/[id]/sessions.delete'))(event({ id: 'u-ziel' }))
    expect(forgetAccountSessions).toHaveBeenCalledWith('u-ziel')
  })

  it('Sammel-Sperre (`POST /api/admin/users/bulk`): jedes gesperrte Konto', async () => {
    stubRouteGlobals({ updateStatus: async () => ({}) }, { action: 'block', ids: ['u1', 'u2'] })
    await (await route('../server/api/admin/users/bulk.post'))(event())
    expect(forgetAccountSessions.mock.calls.map(call => call[0])).toEqual(['u1', 'u2'])
  })
})

describe('B4: `mutateAppConfig` räumt den Instanz-Merker von `app_config`', () => {
  it('nach dem Schreiben liest der Merker frisch', async () => {
    let row: Record<string, unknown> = { maintenance: false }
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main', appwriteProjectId: 'probe' } }))
    vi.stubGlobal('toH3Error', (error: unknown) => error)
    vi.stubGlobal('createAdminClient', () => ({
      tablesDB: {
        getRow: async () => ({ $id: 'global', ...row }),
        updateRow: async ({ data }: { data: Record<string, unknown> }) => { row = { ...row, ...data } },
      },
    }))
    const { cachedInstanceRead } = await import('../../core/server/utils/instanceReadCache')
    const { mutateAppConfig } = await import('../server/utils/appConfigWrite')
    const read = () => cachedInstanceRead(undefined, 'app_config', async () => ({ ...row }))

    expect(await read()).toEqual({ maintenance: false })
    await mutateAppConfig({} as never, () => ({ data: { maintenance: true }, result: true }), 'App config update failed')
    expect(await read()).toEqual({ maintenance: true })
  })
})
