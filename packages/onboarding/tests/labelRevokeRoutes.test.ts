import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * „ZUGANG ENTZIEHEN" PRÜFT NACH (SEC-024, 2026-11-13).
 *
 * Zwei Routen ziehen nach dem Control Plane das Lese-Publikum ein: das
 * Entfernen eines Mitglieds und das Stilllegen einer Community. Bis SEC-024
 * antworteten beide `ok`, egal ob das Label wirklich weg war. Jetzt:
 *  - Entfernen: Label nach der Wiederholung noch da ⇒ Fehler mit
 *    `label_revoke_failed`, NICHT `ok`.
 *  - Stilllegen: die Community IST stillgelegt, die Antwort nennt aber, wie
 *    viele Entzüge gescheitert sind.
 *
 * Nachgebildet ist, was hinter einer Naht liegt: das Control Plane, das
 * Rollen-Gate und der Label-Entzug (dessen eigenes Verhalten belegt
 * `core/tests/communityLabel.test.ts`).
 */

const order: string[] = []
const controlPlane = vi.fn(async (_event: unknown, path: string) => {
  order.push(`control:${path}`)
  if (path.endsWith('/members/remove')) {
    return { ok: true, memberId: 'm1', status: 'removed', runtimeUserId: 'u-gone' }
  }
  return {
    ok: true,
    communityId: 'cA',
    status: 'disabled',
    runtimeUserIds: ['u1', 'u2', 'u3'],
    members: { total: 3, removed: 3, failed: 0, complete: true },
  }
})
vi.mock('../server/utils/controlPlane', () => ({ callControlPlane: controlPlane }))
vi.mock('../server/utils/communityTeamGate', () => ({
  requireCommunityTeamGate: async () => ({ communityId: 'cA', jwt: 'jwt' }),
}))

/** Wessen Entzug scheitert (nach der Wiederholung im Schreiber). */
let failing = new Set<string>()
const revokeCommunityLabel = vi.fn(async (_event: unknown, _communityId: string, userId: string) => {
  order.push(`revoke:${userId}`)
  return failing.has(userId) ? { revoked: false, reason: 'verify_failed' } : { revoked: true }
})
const rememberCommunityAccessRevoked = vi.fn((_communityId: string, userId: string) => {
  order.push(`remember:${userId}`)
})

function makeError(init: Record<string, unknown>): Error {
  return Object.assign(new Error(String(init.statusText ?? 'Error')), init, { statusCode: init.status })
}

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('createError', makeError)
vi.stubGlobal('getRouterParam', () => 'm1')
vi.stubGlobal('requireRecentAuth', async () => {})
vi.stubGlobal('revokeCommunityLabel', revokeCommunityLabel)
vi.stubGlobal('rememberCommunityAccessRevoked', rememberCommunityAccessRevoked)
vi.stubGlobal('logEvent', () => {})

type Handler = (event: H3Event) => Promise<unknown>
const { default: removeMember } = await import('../server/api/community/members/[id].delete') as unknown as { default: Handler }
const { default: deleteCommunity } = await import('../server/api/community/delete.post') as unknown as { default: Handler }

const event = { context: {} } as unknown as H3Event

describe('DELETE /api/community/members/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    order.length = 0
    failing = new Set()
  })

  it('antwortet ok, wenn das Label nachweislich weg ist — Notiz VOR dem Entzug', async () => {
    await expect(removeMember(event)).resolves.toEqual({ ok: true, memberId: 'm1', status: 'removed' })
    expect(order).toEqual(['control:/api/control/community/members/remove', 'remember:u-gone', 'revoke:u-gone'])
  })

  it('scheitert der Entzug endgültig, ist die Antwort ein Fehler mit `label_revoke_failed`, nicht ok', async () => {
    failing = new Set(['u-gone'])
    const thrown = await removeMember(event).then(() => null, (error: unknown) => error) as {
      status?: number
      data?: { code?: string }
    } | null
    expect(thrown).not.toBeNull()
    expect(thrown?.status).toBe(502)
    expect(thrown?.data?.code).toBe('label_revoke_failed')
    // Die Mitgliedschaft ist trotzdem entfernt und die Notiz steht.
    expect(rememberCommunityAccessRevoked).toHaveBeenCalledWith('cA', 'u-gone')
  })
})

describe('POST /api/community/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    order.length = 0
    failing = new Set()
  })

  it('zählt die Entzüge: alle gelungen', async () => {
    const result = await deleteCommunity(event) as { labels: unknown }
    expect(result.labels).toEqual({ total: 3, revoked: 3, failed: 0 })
  })

  it('nennt gescheiterte Entzüge als Anzahl — die Community bleibt stillgelegt', async () => {
    failing = new Set(['u2'])
    const result = await deleteCommunity(event) as { ok: boolean, status: string, labels: unknown }
    expect(result.status).toBe('disabled')
    expect(result.labels).toEqual({ total: 3, revoked: 2, failed: 1 })
    // Jeder bekommt seinen Versuch — ein Fehlschlag bricht die Schleife nicht ab.
    expect(revokeCommunityLabel).toHaveBeenCalledTimes(3)
  })
})
