import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { TenantContext } from '../../core/shared/types/tenant'
import { tenantCacheScope, useTenant } from '../../core/server/utils/tenant'
import { createMicrocache } from '../../core/server/utils/microcache'

/**
 * BE-023 — `/api/stats` DER TEST-APP ZÄHLT NUR OHNE MANDANT.
 *
 * Die Route zählt mit dem Admin-Client das GANZE Appwrite-Projekt (aktive
 * Kommentare, Konten). Auf einem Mandanten-Host wären das die Zahlen aller
 * Communities des Pools. Echter Handler, nachgebildete Umgebung:
 *  1. Mandant aufgelöst (Pool wie Silo) ⇒ 404, und Appwrite wird NICHT gefragt.
 *  2. Ohne Mandant ⇒ die Zahlen wie bisher, zweiter Aufruf aus dem
 *     Zwischenspeicher.
 *  3. Eine zuvor ohne Mandant gecachte Antwort erreicht keinen Mandanten-Host.
 *
 * WARUM DER TEST HIER LIEGT: `apps/comments` hat keinen eigenen Test-Lauf
 * (kein vitest im Paket), und sie ist die Test-App DIESES Layers — hier läuft
 * der Test in `pnpm -r test` mit. Den Handler lädt er über den relativen Pfad.
 */

const listRows = vi.fn(async () => ({ total: 7, rows: [] }))
const usersList = vi.fn(async () => ({ total: 3, users: [] }))

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('createMicrocache', createMicrocache)
vi.stubGlobal('useTenant', useTenant)
vi.stubGlobal('tenantCacheScope', tenantCacheScope)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB: { listRows }, users: { list: usersList } }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))

type Handler = (event: H3Event) => Promise<{ comments: number, members: number }>
const { default: handler } = await import('../../../apps/comments/server/api/stats.get') as unknown as { default: Handler }

function eventFor(tenant: TenantContext | null): H3Event {
  return { context: tenant ? { tenant } : {} } as unknown as H3Event
}

const POOL = { mode: 'pool', tenantId: 't-a', projectId: 'account', communityId: 'c-a' } as unknown as TenantContext
const SILO = { mode: 'silo', tenantId: 't-s', projectId: 'silo-s' } as unknown as TenantContext

describe('apps/comments /api/stats (BE-023)', () => {
  beforeEach(() => {
    listRows.mockClear()
    usersList.mockClear()
  })

  it('Pool-Mandant ⇒ 404, Appwrite wird nicht gefragt', async () => {
    await expect(handler(eventFor(POOL))).rejects.toMatchObject({ status: 404 })
    expect(listRows).not.toHaveBeenCalled()
    expect(usersList).not.toHaveBeenCalled()
  })

  it('Silo-Mandant ⇒ ebenfalls 404 (wie der Changelog: jeder aufgelöste Mandant)', async () => {
    await expect(handler(eventFor(SILO))).rejects.toMatchObject({ status: 404 })
    expect(listRows).not.toHaveBeenCalled()
  })

  it('ohne Mandant ⇒ die Zahlen, zweiter Aufruf aus dem Zwischenspeicher', async () => {
    expect(await handler(eventFor(null))).toEqual({ comments: 7, members: 3 })
    expect(await handler(eventFor(null))).toEqual({ comments: 7, members: 3 })
    expect(listRows).toHaveBeenCalledTimes(1)
    expect(usersList).toHaveBeenCalledTimes(1)
  })

  it('eine gecachte Antwort ohne Mandant erreicht keinen Mandanten-Host', async () => {
    // Der Speicher ist aus dem Fall davor gefüllt (Modul-Zustand).
    expect(await handler(eventFor(null))).toEqual({ comments: 7, members: 3 })
    await expect(handler(eventFor(POOL))).rejects.toMatchObject({ status: 404 })
  })
})
