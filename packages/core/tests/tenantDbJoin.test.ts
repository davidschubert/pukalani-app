import { afterEach, describe, expect, it, vi } from 'vitest'
import { tenantDb, type TenantDbActor, type TenantDbHandle } from '../server/utils/tenantDb'
import { resetCommunityWorld, wireCommunityWorld, type CommunityWorld, type ThrownLike } from './support/participationHarness'

/**
 * SEC-030 — DIE DATENTÜR ALS NETZ HINTER DEN ROUTEN.
 *
 * Die Routen stellen die Wache `requireCommunityParticipant` vor ihre
 * Schreibvorgänge. Die Tür fragt beim Anlegen (Handelnder `member`) trotzdem
 * selbst: eine vergessene Route soll hier nicht zum Loch werden. Bis zum
 * 2026-11-13 fragte sie zwar, las die Antwort aber nicht („wirft nie und
 * blockiert nie") — ein Konto aus einer fremden Community schrieb damit in
 * jede geschlossene.
 */

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

function door(world: CommunityWorld, options: { as?: TenantDbHandle, actor?: TenantDbActor } = {}) {
  const { event, joinHandlerCalls } = wireCommunityWorld(world)
  const created: Array<Record<string, unknown>> = []
  const tablesDB = {
    createRow: vi.fn(async (args: { data: Record<string, unknown> }) => {
      created.push(args.data)
      return { $id: 'r1', ...args.data }
    }),
  }
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'db' } }))
  vi.stubGlobal('createSessionClient', () => ({ tablesDB }))
  vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
  const db = tenantDb(event, options)
  return {
    created,
    joinHandlerCalls,
    async create(): Promise<{ ok: boolean, error?: ThrownLike }> {
      try {
        await db.create('things', { title: 'Hallo' }, { permissions: [] })
        return { ok: true }
      }
      catch (error) {
        return { ok: false, error: error as ThrownLike }
      }
    },
  }
}

describe('tenantDb().create als Mitglied', () => {
  it('Mitglied: legt an', async () => {
    const d = door({ who: 'member' })
    expect((await d.create()).ok).toBe(true)
    expect(d.created).toHaveLength(1)
  })

  it('offene Registrierung: Beitritt, dann Anlegen', async () => {
    const d = door({ who: 'stranger', registration: 'open' })
    expect((await d.create()).ok).toBe(true)
    expect(d.created).toHaveLength(1)
  })

  it('geschlossene Registrierung: 403 not_a_member, KEINE Zeile', async () => {
    const d = door({ who: 'stranger', registration: 'closed' })
    const r = await d.create()
    expect(r.error).toMatchObject({ status: 403, data: { code: 'not_a_member' } })
    expect(d.created).toEqual([])
  })

  it('entzogener Zugang: 403 not_a_member, KEINE Zeile', async () => {
    const d = door({ who: 'removed' })
    const r = await d.create()
    expect(r.error).toMatchObject({ status: 403, data: { code: 'not_a_member' } })
    expect(d.created).toEqual([])
  })

  it('Naht gestört, Pool, ohne Label: 403 (fail-closed), keine Zeile', async () => {
    const d = door({ who: 'stranger', seam: 'down' })
    expect((await d.create()).error?.status).toBe(403)
    expect(d.created).toEqual([])
  })

  it('Naht gestört, Pool, mit Label: legt an', async () => {
    const d = door({ who: 'legacy', seam: 'down' })
    expect((await d.create()).ok).toBe(true)
  })

  it('Silo: legt an, ohne zu fragen', async () => {
    const d = door({ who: 'stranger', mode: 'silo' })
    expect((await d.create()).ok).toBe(true)
    expect(d.joinHandlerCalls()).toBe(0)
  })
})

describe('tenantDb().create — andere Handelnde unverändert', () => {
  it.each([
    ['operator', { as: 'operator' }],
    ['operator-Klinke mit actor operator', { as: 'operator', actor: 'operator' }],
    ['guest', { as: 'operator', actor: 'guest' }],
  ] as const)('%s: kein Beitritt, keine Mitgliedschafts-Frage, legt an', async (_label, options) => {
    const d = door({ who: 'stranger', registration: 'closed' }, options)
    expect((await d.create()).ok).toBe(true)
    expect(d.created).toHaveLength(1)
    expect(d.joinHandlerCalls()).toBe(0)
  })
})
