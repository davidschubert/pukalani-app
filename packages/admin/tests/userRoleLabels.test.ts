import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { capabilitiesFor, isRole, ROLE_CAPABILITIES, ROLES } from '../../core/shared/authz'
import { mutateUserLabels } from '../../core/server/utils/userLabels'

/**
 * ROLLEN SETZEN LÄSST COMMUNITY-LABELS STEHEN (SEC-024, 2026-11-13).
 *
 * Betreiber-Rollen (`admin`/`moderator`) und Community-Labels teilen sich EIN
 * Feld am Konto. Die Rollen-Route las es, prüfte ihre Schutzregeln und schrieb
 * dann die GANZE Liste aus dem gelesenen Stand zurück — eine Community-Label-
 * Änderung, die dazwischen lief (Entzug in Community A, Beitritt in B), wurde
 * dabei überschrieben. Jetzt sagt die Route nur noch „diese Rollen raus, jene
 * rein" und schreibt über den EINEN Schreiber (`mutateUserLabels`), der frisch
 * liest.
 *
 * Die Attrappe spielt das Rennen nach: direkt NACH dem ersten Lesen der Route
 * ändert ein „anderer Schreiber" die Community-Labels.
 */

let stored: string[] = []
let raceOnFirstGet: (() => void) | null = null
const get = vi.fn(async ({ userId }: { userId: string }) => {
  const snapshot = { $id: userId, name: 'Target', labels: [...stored] }
  if (raceOnFirstGet) {
    const race = raceOnFirstGet
    raceOnFirstGet = null
    race()
  }
  return snapshot
})
const updateLabels = vi.fn(async ({ userId, labels }: { userId: string, labels: string[] }) => {
  stored = [...labels]
  return { $id: userId, name: 'Target', labels: [...stored] }
})
const create = vi.fn(async ({ userId, name, email }: { userId: string, name: string, email: string }) => {
  stored = []
  return { $id: userId, name, email }
})
const recordAudit = vi.fn(async () => {})

function makeError(init: Record<string, unknown>): Error {
  return Object.assign(new Error(String(init.statusText ?? 'Error')), init, { statusCode: init.status })
}

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('createError', makeError)
vi.stubGlobal('requirePermission', () => ({ $id: 'op', labels: ['admin'] }))
vi.stubGlobal('getRouterParam', () => 'u1')
vi.stubGlobal('readValidatedBody', async (e: H3Event & { body?: unknown }, parse: (b: unknown) => unknown) => parse(e.body))
vi.stubGlobal('capabilitiesFor', capabilitiesFor)
vi.stubGlobal('isRole', isRole)
vi.stubGlobal('ROLE_CAPABILITIES', ROLE_CAPABILITIES)
vi.stubGlobal('ROLES', ROLES)
vi.stubGlobal('createAdminClient', () => ({ users: { get, updateLabels, create } }))
vi.stubGlobal('toH3Error', (_error: unknown, statusText: string) => makeError({ status: 500, statusText }))
vi.stubGlobal('assertNotLastAdmin', async () => {})
vi.stubGlobal('recordAudit', recordAudit)
vi.stubGlobal('setResponseStatus', () => {})
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('mutateUserLabels', mutateUserLabels)

type Handler = (event: H3Event) => Promise<{ $id: string, labels: string[] }>
const { default: setRoles } = await import('../server/api/admin/users/[id]/role.patch') as unknown as { default: Handler }
const { default: createUser } = await import('../server/api/admin/users/index.post') as unknown as { default: Handler }

function eventWith(body: unknown): H3Event {
  return { body, context: {} } as unknown as H3Event
}

describe('PATCH /api/admin/users/:id/role', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    raceOnFirstGet = null
  })

  it('tauscht nur die Rollen-Labels — ein gleichzeitig geändertes Community-Label bleibt erhalten', async () => {
    stored = ['moderator', 'cA']
    // Zwischen Schutzregel-Prüfung und Schreiben: Entzug in cA, Beitritt in cB.
    raceOnFirstGet = () => { stored = ['moderator', 'cB'] }
    const result = await setRoles(eventWith({ roles: ['admin'] }))
    expect([...stored].sort()).toEqual(['admin', 'cB'])
    expect([...result.labels].sort()).toEqual(['admin', 'cB'])
  })

  it('Schutzregeln bleiben: keine Rolle über die eigenen Rechte hinaus', async () => {
    vi.stubGlobal('requirePermission', () => ({ $id: 'op', labels: ['moderator'] }))
    stored = ['cA']
    await expect(setRoles(eventWith({ roles: ['admin'] }))).rejects.toMatchObject({ status: 403 })
    expect(updateLabels).not.toHaveBeenCalled()
    vi.stubGlobal('requirePermission', () => ({ $id: 'op', labels: ['admin'] }))
  })
})

describe('POST /api/admin/users', () => {
  beforeEach(() => vi.clearAllMocks())

  it('setzt die Rollen eines neuen Kontos über den einen Schreiber', async () => {
    const result = await createUser(eventWith({ name: 'Neu', email: 'neu@example.test', password: 'geheim-genug-123', roles: ['moderator'] }))
    expect(result.labels).toEqual(['moderator'])
    expect(stored).toEqual(['moderator'])
    expect(get).toHaveBeenCalled()
  })
})
