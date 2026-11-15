import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { listAllRows } from '../../core/server/utils/listAllRows'

/**
 * EINLADUNGEN: SEHEN, ZURÜCKZIEHEN, STILLLEGEN (SEC-028, 2026-11-15) — echte
 * Handler, gefälschte Ablage.
 *
 * Belegt werden vier Regeln:
 *  1. Die eigene Einladungsliste sieht nur, wer seine Adresse BESTÄTIGT hat —
 *     dieselbe Bedingung wie beim Annehmen. Sonst eine leere Liste in
 *     derselben Form, ohne dass Einladungen überhaupt gelesen werden.
 *  2. Widerruf und erneutes Einladen finden eine Einladung gezielt, nicht in
 *     einer gekappten Anzeige-Liste — eine Community mit vielen offenen
 *     Einladungen verhält sich wie eine mit wenigen.
 *  3. Stilllegen zieht die offenen Einladungen zurück, und eine Einladung in
 *     eine stillgelegte Community wird nicht mehr angenommen.
 *
 * Die Ablage wertet die Abfragen wirklich aus (equal, limit, cursorAfter,
 * Sortierung) — sonst bewiese ein Test über „mehr als 100" nichts.
 */

interface Row { $id: string, $createdAt: string, [key: string]: unknown }
type Table = Map<string, Row>

const tables = new Map<string, Table>()
const failingUpdates = new Set<string>()
let clock = 0

function table(id: string): Table {
  let found = tables.get(id)
  if (!found) {
    found = new Map()
    tables.set(id, found)
  }
  return found
}

function seed(tableId: string, data: Record<string, unknown> & { $id: string }): Row {
  clock++
  const row: Row = { $createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, clock)).toISOString(), ...data }
  table(tableId).set(row.$id, row)
  return row
}

function notFound(): Error {
  return Object.assign(new Error('Row not found'), { code: 404 })
}

interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries = [] }: { tableId: string, queries?: string[] }) => {
    const parsed = queries.map(query => JSON.parse(query) as ParsedQuery)
    let rows = [...table(tableId).values()]
    for (const query of parsed) {
      if (query.method === 'equal') {
        rows = rows.filter(row => (query.values ?? []).includes(row[query.attribute ?? '']))
      }
    }
    const order = parsed.find(query => query.method === 'orderDesc' || query.method === 'orderAsc')
    rows.sort((a, b) => a.$createdAt.localeCompare(b.$createdAt))
    if (order?.method === 'orderDesc') rows.reverse()
    const total = rows.length
    const cursor = parsed.find(query => query.method === 'cursorAfter')
    if (cursor) {
      const index = rows.findIndex(row => row.$id === cursor.values?.[0])
      rows = rows.slice(index + 1)
    }
    const limit = parsed.find(query => query.method === 'limit')
    rows = rows.slice(0, Number(limit?.values?.[0] ?? 25))
    return { rows: rows.map(row => ({ ...row })), total }
  }),
  getRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    const row = table(tableId).get(rowId)
    if (!row) throw notFound()
    return { ...row }
  }),
  updateRow: vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    if (failingUpdates.has(rowId)) throw new Error('write failed')
    const row = table(tableId).get(rowId)
    if (!row) throw notFound()
    Object.assign(row, data)
    return { ...row }
  }),
  createRow: vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) =>
    ({ ...seed(tableId, { ...data, $id: rowId }) })),
}

interface Identity {
  userId: string
  projectId: string
  email: string | null
  emailVerified: boolean
  name: string
}
let identity: Identity
let body: Record<string, unknown>

vi.mock('../server/utils/onboardingService', () => ({
  verifyRuntimeIdentity: async () => identity,
}))
vi.mock('../server/utils/communityInviteMail', () => ({
  sendCommunityInviteMail: async () => true,
}))
vi.mock('../server/utils/communityTeam', async (importOriginal) => {
  const original = await importOriginal<typeof import('../server/utils/communityTeam')>()
  return {
    ...original,
    requireCommunityTeamContext: async (_event: unknown, input: { communityId: string }) => ({
      databaseId: 'main',
      identity,
      actorRole: 'owner',
      tenant: table('communities').get(input.communityId),
      members: [...table('community_members').values()].filter(row => row.communityId === input.communityId),
    }),
  }
})

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('useAppConfig', () => ({}))
vi.stubGlobal('requireOnboardingCaller', async () => {})
vi.stubGlobal('readValidatedBody', async (_event: H3Event, parse: (input: unknown) => unknown) => parse(body))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('listAllRows', listAllRows)
vi.stubGlobal('toH3Error', (error: unknown) => error)
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))

type Handler = (event: H3Event) => Promise<unknown>
const load = async (path: string) => (await import(path)).default as unknown as Handler
const mine = await load('../server/api/control/community/invites/mine.post')
const revoke = await load('../server/api/control/community/invites/revoke.post')
const invite = await load('../server/api/control/community/members/invite.post')
const accept = await load('../server/api/control/community/members/accept.post')
const disable = await load('../server/api/control/community/delete.post')

const event = { context: {} } as unknown as H3Event
const FUTURE = '2099-01-01T00:00:00.000Z'
const OWNER: Identity = { userId: 'u-owner', projectId: 'account', email: 'owner@example.org', emailVerified: true, name: 'Owner' }

function seedCommunity(id: string, status: 'active' | 'disabled' = 'active'): void {
  seed('communities', {
    $id: id, projectId: 'account', name: `Community ${id}`, host: `${id}.example.org`, status,
    memberInvitesEnabled: true, billingStatus: '', stripeSubscriptionId: '',
  })
  seed('community_members', {
    $id: `m-owner-${id}`, communityId: id, runtimeProjectId: 'account', runtimeUserId: 'u-owner',
    role: 'owner', status: 'active', email: OWNER.email,
  })
}

function seedInvite(id: string, communityId: string, email: string, status = 'pending'): Row {
  return seed('community_invites', {
    $id: id, communityId, email, role: 'viewer', tokenHash: id.padEnd(64, '0'), status,
    expiresAt: FUTURE, invitedBy: 'u-owner', acceptedBy: '',
  })
}

function inviteRow(id: string): Row | undefined {
  return table('community_invites').get(id)
}

beforeEach(() => {
  tables.clear()
  failingUpdates.clear()
  clock = 0
  vi.clearAllMocks()
  identity = { ...OWNER }
  seedCommunity('cA')
  seedCommunity('cB')
})

describe('invites/mine — nur mit bestätigter Adresse', () => {
  beforeEach(() => {
    seedInvite('inv-1', 'cA', 'guest@example.org')
    identity = { userId: 'u-guest', projectId: 'account', email: 'guest@example.org', emailVerified: true, name: 'Guest' }
    body = { jwt: 'jwt', communityId: 'cA' }
  })

  it('eine bestätigte Adresse sieht ihre offenen Einladungen', async () => {
    const result = await mine(event) as { invites: { id: string }[], siteName: string }
    expect(result.invites.map(row => row.id)).toEqual(['inv-1'])
    expect(result.siteName).toBe('Community cA')
  })

  it('eine unbestätigte Adresse bekommt dieselbe Form mit leerer Liste — Einladungen werden nicht gelesen', async () => {
    identity.emailVerified = false
    const result = await mine(event)
    expect(result).toEqual({ invites: [], siteName: 'Community cA' })
    const inviteReads = tablesDB.listRows.mock.calls.filter(([args]) => args.tableId === 'community_invites')
    expect(inviteReads).toHaveLength(0)
  })
})

describe('invites/revoke — gezielt statt aus der Anzeige-Liste', () => {
  beforeEach(() => {
    seedInvite('inv-old', 'cA', 'old@example.org')
    for (let i = 0; i < 120; i++) seedInvite(`inv-${i}`, 'cA', `p${i}@example.org`)
    seedInvite('inv-foreign', 'cB', 'x@example.org')
  })

  it('eine Einladung jenseits der ersten 100 offenen lässt sich widerrufen', async () => {
    body = { jwt: 'jwt', communityId: 'cA', inviteId: 'inv-old' }
    await expect(revoke(event)).resolves.toMatchObject({ ok: true, inviteId: 'inv-old', status: 'revoked' })
    expect(inviteRow('inv-old')?.status).toBe('revoked')
  })

  it('die Einladung einer anderen Community antwortet 404 und bleibt unberührt', async () => {
    body = { jwt: 'jwt', communityId: 'cA', inviteId: 'inv-foreign' }
    await expect(revoke(event)).rejects.toMatchObject({ status: 404 })
    expect(inviteRow('inv-foreign')?.status).toBe('pending')
  })

  it('eine unbekannte oder nicht mehr offene Einladung antwortet ebenfalls 404', async () => {
    seedInvite('inv-done', 'cA', 'done@example.org', 'accepted')
    body = { jwt: 'jwt', communityId: 'cA', inviteId: 'inv-done' }
    await expect(revoke(event)).rejects.toMatchObject({ status: 404 })
    body = { jwt: 'jwt', communityId: 'cA', inviteId: 'inv-missing' }
    await expect(revoke(event)).rejects.toMatchObject({ status: 404 })
    expect(inviteRow('inv-done')?.status).toBe('accepted')
  })
})

describe('members/invite — genau EIN gültiger Link je Adresse', () => {
  it('zieht die ältere offene Einladung derselben Adresse zurück, auch bei mehr als 100 offenen', async () => {
    seedInvite('inv-again', 'cA', 'again@example.org')
    for (let i = 0; i < 150; i++) seedInvite(`inv-${i}`, 'cA', `p${i}@example.org`)
    seedInvite('inv-same-mail-other-community', 'cB', 'again@example.org')

    body = { jwt: 'jwt', communityId: 'cA', email: 'Again@Example.org', role: 'viewer' }
    const result = await invite(event) as { inviteId: string }

    expect(inviteRow('inv-again')?.status).toBe('revoked')
    expect(inviteRow(result.inviteId)?.status).toBe('pending')
    // Andere Adressen und andere Communities bleiben offen.
    expect(inviteRow('inv-0')?.status).toBe('pending')
    expect(inviteRow('inv-same-mail-other-community')?.status).toBe('pending')
  })
})

describe('Stilllegen und Annehmen', () => {
  it('Stilllegen zieht alle offenen Einladungen zurück und zählt gescheiterte, ohne abzubrechen', async () => {
    for (let i = 0; i < 120; i++) seedInvite(`inv-${i}`, 'cA', `p${i}@example.org`)
    seedInvite('inv-other', 'cB', 'x@example.org')
    failingUpdates.add('inv-7')

    body = { jwt: 'jwt', communityId: 'cA' }
    const result = await disable(event) as { status: string, invites: { total: number, revoked: number, failed: number } }

    expect(result.status).toBe('disabled')
    expect(result.invites).toEqual({ total: 120, revoked: 119, failed: 1 })
    expect(inviteRow('inv-0')?.status).toBe('revoked')
    expect(inviteRow('inv-119')?.status).toBe('revoked')
    expect(inviteRow('inv-7')?.status).toBe('pending')
    expect(inviteRow('inv-other')?.status).toBe('pending')
  })

  it('eine Einladung in eine stillgelegte Community wird abgewiesen wie eine ungültige', async () => {
    seedCommunity('cOff', 'disabled')
    seedInvite('inv-off', 'cOff', 'guest@example.org')
    identity = { userId: 'u-guest', projectId: 'account', email: 'guest@example.org', emailVerified: true, name: 'Guest' }
    body = { jwt: 'jwt', inviteId: 'inv-off' }

    await expect(accept(event)).rejects.toMatchObject({ status: 400, statusText: 'Invalid or expired invitation' })
    expect(inviteRow('inv-off')?.status).toBe('pending')
    const memberships = [...table('community_members').values()].filter(row => row.communityId === 'cOff' && row.runtimeUserId === 'u-guest')
    expect(memberships).toHaveLength(0)
  })

  it('in eine aktive Community wird dieselbe Einladung angenommen (Gegenprobe)', async () => {
    seedInvite('inv-on', 'cA', 'guest@example.org')
    identity = { userId: 'u-guest', projectId: 'account', email: 'guest@example.org', emailVerified: true, name: 'Guest' }
    body = { jwt: 'jwt', inviteId: 'inv-on' }

    await expect(accept(event)).resolves.toMatchObject({ ok: true, communityId: 'cA' })
    expect(inviteRow('inv-on')?.status).toBe('accepted')
  })
})
