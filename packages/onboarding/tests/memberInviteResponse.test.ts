import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * DIE ANTWORT DER EINLADEN-ROUTE SAGT NICHTS ÜBER DIE EINGELADENE ADRESSE
 * (SEC-028, 2026-11-15).
 *
 * Ob es zu einer Adresse im Pool schon ein Konto gibt, bleibt in der Route:
 * es entscheidet nur, ob zusätzlich eine Glocken-Meldung entsteht. Die
 * Antwort an den Browser ist für beide Fälle Feld für Feld gleich geformt.
 *
 * Nachgebildet ist, was hinter einer Naht liegt: das Control Plane, das
 * Rollen-Gate und die Nutzerliste des Pool-Projekts.
 */

const controlAnswer = {
  ok: true,
  delivered: true,
  inviteId: 'inv-1',
  email: 'guest@example.org',
  role: 'viewer',
  expiresAt: '2099-01-01T00:00:00.000Z',
  quota: { enabled: true, managesTeam: true, limit: 5, used: 1, remaining: 4, reason: null },
}

vi.mock('../server/utils/controlPlane', () => ({
  callControlPlane: async () => ({ ...controlAnswer }),
}))
vi.mock('../server/utils/communityTeamGate', () => ({
  requireCommunityTeamGate: async () => ({ communityId: 'cA', jwt: 'jwt' }),
}))

let accountExists = false
const notify = vi.fn(async () => ({ created: true }))

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('readValidatedBody', async (_event: H3Event, parse: (input: unknown) => unknown) =>
  parse({ email: 'guest@example.org', role: 'viewer' }))
vi.stubGlobal('getCookie', () => undefined)
vi.stubGlobal('createAdminClient', () => ({
  users: { list: async () => ({ users: accountExists ? [{ $id: 'u-guest' }] : [], total: accountExists ? 1 : 0 }) },
}))
vi.stubGlobal('useTenant', () => ({ name: 'Community A' }))
vi.stubGlobal('notify', notify)

type Handler = (event: H3Event) => Promise<Record<string, unknown>>
const { default: inviteMember } = await import('../server/api/community/members/index.post') as unknown as { default: Handler }

const event = { context: { user: { $id: 'u-owner' } } } as unknown as H3Event

describe('POST /api/community/members — Antwort', () => {
  beforeEach(() => {
    notify.mockClear()
    accountExists = false
  })

  it('verrät nicht, ob die Adresse ein Konto hat — gleiche Antwort für beide Fälle', async () => {
    accountExists = true
    const withAccount = await inviteMember(event)
    accountExists = false
    const withoutAccount = await inviteMember(event)

    expect(withAccount).not.toHaveProperty('existingAccount')
    expect(withoutAccount).not.toHaveProperty('existingAccount')
    expect(withAccount).not.toHaveProperty('delivered')
    expect(Object.keys(withAccount).sort()).toEqual(Object.keys(withoutAccount).sort())
    expect(withAccount).toEqual(withoutAccount)
  })

  it('eine Glocken-Meldung entsteht weiterhin nur für ein vorhandenes Konto', async () => {
    accountExists = true
    await inviteMember(event)
    expect(notify).toHaveBeenCalledTimes(1)

    notify.mockClear()
    accountExists = false
    await inviteMember(event)
    expect(notify).not.toHaveBeenCalled()
  })
})
