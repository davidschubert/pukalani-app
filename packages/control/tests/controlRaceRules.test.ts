import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { listAllRows } from '../../core/server/utils/listAllRows'
import { hashInviteCode } from '../server/utils/inviteCodes'
import { createRaceTablesDB } from './support/raceTablesDB'

/**
 * BE-013 — FÜNF REGELN DES CONTROL PLANE HALTEN UNTER GLEICHZEITIGEN ANFRAGEN.
 *
 * Echte Routen, echte Sperre (`system_runs` in der Ablage), echte Regeln.
 * Die Ablage gibt in JEDEM Aufruf die Hand ab (`support/raceTablesDB.ts`):
 * zwei Anfragen in `Promise.all` lesen also beide, bevor eine schreibt — genau
 * das Rennen, durch das vor BE-013 beide durchkamen. Nachgebildet ist nur, was
 * hinter der Naht liegt: die Identität aus dem JWT, das Tor, die Mail.
 *
 *  (1) Einladungs-Code mit maxUses 1, zwei Konten gleichzeitig ⇒ eine Community.
 *  (2) Ein Konto, zwei gleichzeitige Anlagen ⇒ das Kontingent hält.
 *  (3) Wochen-Kontingent 5, 4 verbraucht, zwei gleichzeitige Einladungen ⇒ eine.
 *  (4) Zwei Owner stufen einander gleichzeitig zurück / entfernen einander ⇒
 *      genau einer gewinnt, ein Owner bleibt.
 *  (5) Übergabe, deren zweiter Schritt scheitert ⇒ der erste wird zurückgenommen.
 */

const race = createRaceTablesDB()
const { tablesDB, table, seed, failingUpdates } = race

interface Identity { userId: string, projectId: string, email: string, name: string, emailVerified: boolean }
const identities = new Map<string, Identity>()
const gate = { inviteRequired: true }
const logs: { level: string, name: string, detail: Record<string, unknown> }[] = []
const markCodeRedeemed = vi.fn(async () => {})
const sentMails: string[] = []

vi.mock('../server/utils/onboardingService', () => ({
  requireOnboardingCaller: async () => {},
  verifyRuntimeIdentity: async (_event: unknown, jwt: string) => {
    const found = identities.get(jwt)
    if (!found) throw Object.assign(new Error('Unauthorized'), { status: 401 })
    return found
  },
}))
vi.mock('../server/utils/onboardingGate', () => ({ readOnboardingGate: async () => ({ ...gate }) }))
vi.mock('../server/utils/reservedNames', () => ({ isNameReservedInDb: async () => false }))
vi.mock('../server/utils/inviteRequests', () => ({ markCodeRedeemed }))
vi.mock('../server/utils/communityInviteMail', () => ({
  sendCommunityInviteMail: async (_event: unknown, input: { to: string }) => {
    await new Promise<void>(resolve => setImmediate(resolve))
    sentMails.push(input.to)
    return true
  },
}))

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('useAppConfig', () => ({}))
vi.stubGlobal('requireOnboardingCaller', async () => {})
vi.stubGlobal('readValidatedBody', async (event: H3Event, parse: (input: unknown) => unknown) =>
  parse((event.context as { body: unknown }).body))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('listAllRows', listAllRows)
vi.stubGlobal('toH3Error', (error: unknown) => error)
vi.stubGlobal('logEvent', (level: string, name: string, detail: Record<string, unknown>) => { logs.push({ level, name, detail }) })
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))

type Handler = (event: H3Event) => Promise<unknown>
const load = async (path: string) => (await import(path)).default as unknown as Handler
const site = await load('../server/api/control/onboarding/site.post')
const invite = await load('../server/api/control/community/members/invite.post')
const role = await load('../server/api/control/community/members/role.post')
const remove = await load('../server/api/control/community/members/remove.post')
const transfer = await load('../server/api/control/community/members/transfer.post')

const call = (handler: Handler, body: Record<string, unknown>) =>
  handler({ context: { body } } as unknown as H3Event)

/** Beide Anfragen zugleich; Ergebnis oder Fehler je Anfrage. */
async function together(...runs: Promise<unknown>[]) {
  const settled = await Promise.allSettled(runs)
  return {
    ok: settled.filter(entry => entry.status === 'fulfilled').map(entry => (entry as PromiseFulfilledResult<unknown>).value),
    failed: settled.filter(entry => entry.status === 'rejected').map(entry => (entry as PromiseRejectedResult).reason as { status?: number, statusText?: string, data?: { code?: string } }),
  }
}

function identity(userId: string): Identity {
  const value = { userId, projectId: 'account', email: `${userId}@example.org`, name: userId, emailVerified: true }
  identities.set(`jwt-${userId}`, value)
  return value
}

const FUTURE = '2099-01-01T00:00:00.000Z'
const CODE = 'PUKA-ABCD-EFGH'

function seedCode(maxUses: number, uses = 0) {
  return seed('invite_codes', {
    $id: 'code-1', codeHash: hashInviteCode(CODE), status: 'active', expiresAt: null, maxUses, uses, boundEmail: '',
  })
}

function siteBody(userId: string, slug: string, withCode = true) {
  return {
    jwt: `jwt-${userId}`,
    site: { name: `Site ${slug}`, slug, category: 'club', vibe: 'calm', ...(withCode ? { inviteCode: CODE } : {}) },
  }
}

function communities() {
  return [...table('communities').values()]
}

function seedCommunity(id = 'c1') {
  seed('communities', {
    $id: id, projectId: 'account', name: `Community ${id}`, host: `${id}.example.org`, status: 'active',
    memberInvitesEnabled: true, trialEndsAt: FUTURE,
  })
}

function seedMember(id: string, userId: string, memberRole: string, communityId = 'c1') {
  identity(userId)
  return seed('community_members', {
    $id: id, communityId, runtimeProjectId: 'account', runtimeUserId: userId, role: memberRole, status: 'active',
    email: `${userId}@example.org`,
  })
}

function activeOwners(communityId = 'c1') {
  return [...table('community_members').values()]
    .filter(row => row.communityId === communityId && row.status === 'active' && row.role === 'owner')
}

beforeEach(() => {
  race.reset()
  identities.clear()
  logs.length = 0
  sentMails.length = 0
  gate.inviteRequired = true
  vi.clearAllMocks()
})

// ── (1) Einladungs-Code ─────────────────────────────────────────────────────

describe('(1) Einladungs-Code: atomar reserviert, VOR der Anlage', () => {
  it('maxUses 1, zwei Konten gleichzeitig ⇒ eine Community, ein stummes 403, uses endet bei 1', async () => {
    seedCode(1)
    identity('u1')
    identity('u2')
    const result = await together(call(site, siteBody('u1', 'alpha')), call(site, siteBody('u2', 'beta')))

    expect(result.ok).toHaveLength(1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]).toMatchObject({ status: 403, statusText: 'Invalid invite code' })
    expect(result.failed[0]?.data).toBeUndefined()
    expect(communities()).toHaveLength(1)
    expect(table('invite_codes').get('code-1')?.uses).toBe(1)
    expect(logs.some(line => line.name === 'onboarding.invite_rejected' && line.detail.reason === 'exhausted')).toBe(true)
    expect(markCodeRedeemed).toHaveBeenCalledTimes(1)
  })

  it('scheitert die Anlage, geht die Einlösung zurück', async () => {
    seedCode(1)
    identity('u1')
    // Die Adresse gehört schon jemand anderem ⇒ provisionCommunity wirft 409.
    seed('communities', { $id: 'foreign', host: 'alpha.pukalani.app', projectId: 'account', status: 'active' })

    await expect(call(site, siteBody('u1', 'alpha'))).rejects.toMatchObject({ status: 409 })
    expect(table('invite_codes').get('code-1')?.uses).toBe(0)
    expect(markCodeRedeemed).not.toHaveBeenCalled()
  })

  it('ein Retry, der die eigene Community wiederfindet (reused), kostet keine Einlösung', async () => {
    seedCode(5)
    identity('u1')
    const first = await call(site, siteBody('u1', 'alpha')) as { reused: boolean }
    expect(first.reused).toBe(false)
    expect(table('invite_codes').get('code-1')?.uses).toBe(1)

    const retry = await call(site, siteBody('u1', 'alpha')) as { reused: boolean }
    expect(retry.reused).toBe(true)
    expect(table('invite_codes').get('code-1')?.uses).toBe(1)
    expect(markCodeRedeemed).toHaveBeenCalledTimes(1)
  })

  it('ein anderer Fehler beim Reservieren ⇒ 503, keine Community', async () => {
    seedCode(1)
    identity('u1')
    const original = tablesDB.incrementRowColumn
    tablesDB.incrementRowColumn = async () => { throw Object.assign(new Error('Server Error'), { code: 500, type: 'general_unknown' }) }
    try {
      await expect(call(site, siteBody('u1', 'alpha'))).rejects.toMatchObject({ status: 503, data: { code: 'invite_unavailable' } })
    }
    finally {
      tablesDB.incrementRowColumn = original
    }
    expect(communities()).toHaveLength(0)
  })
})

// ── (2) Kontingent je Konto ─────────────────────────────────────────────────

describe('(2) Kontingent je Konto unter der Sperre', () => {
  it('ein Konto, zwei gleichzeitige Anlagen ⇒ eine Community, die zweite lehnt das Kontingent ab', async () => {
    gate.inviteRequired = false
    identity('u1')
    const result = await together(call(site, siteBody('u1', 'alpha', false)), call(site, siteBody('u1', 'beta', false)))

    expect(result.ok).toHaveLength(1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]).toMatchObject({ status: 403, statusText: 'One community per account during the trial' })
    expect(communities()).toHaveLength(1)
  })

  it('dieselbe Adresse zweimal gleichzeitig ⇒ eine Community, die zweite Antwort ist reused', async () => {
    gate.inviteRequired = false
    identity('u1')
    const result = await together(call(site, siteBody('u1', 'alpha', false)), call(site, siteBody('u1', 'alpha', false)))

    expect(result.failed).toHaveLength(0)
    expect((result.ok as { reused: boolean }[]).map(entry => entry.reused).sort()).toEqual([false, true])
    expect(communities()).toHaveLength(1)
  })
})

// ── (3) Wochen-Kontingent der Einladungen ───────────────────────────────────

describe('(3) Wochen-Kontingent der Mitglieder-Einladungen', () => {
  it('Kontingent 5, 4 verbraucht, zwei gleichzeitige Einladungen ⇒ eine geht raus, eine 429', async () => {
    seedCommunity()
    seedMember('m-owner', 'u-owner', 'owner')
    seedMember('m-member', 'u-member', 'viewer')
    for (let i = 0; i < 4; i++) {
      seed('community_invites', {
        $id: `inv-${i}`, communityId: 'c1', email: `old${i}@example.org`, role: 'viewer', tokenHash: `h${i}`,
        status: 'pending', expiresAt: FUTURE, invitedBy: 'u-member', acceptedBy: '',
      })
    }
    const body = (email: string) => ({ jwt: 'jwt-u-member', communityId: 'c1', email, role: 'viewer', locale: 'de' })
    const result = await together(call(invite, body('a@example.org')), call(invite, body('b@example.org')))

    expect(result.ok).toHaveLength(1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]).toMatchObject({ status: 429, data: { code: 'invite_quota_exhausted' } })
    expect(sentMails).toHaveLength(1)
    expect([...table('community_invites').values()].filter(row => row.invitedBy === 'u-member')).toHaveLength(5)
  })
})

// ── (4) Rolle und Entfernen ─────────────────────────────────────────────────

describe('(4) „nie der letzte Owner" unter gleichzeitigen Anfragen', () => {
  beforeEach(() => {
    seedCommunity()
    seedMember('m-a', 'u-a', 'owner')
    seedMember('m-b', 'u-b', 'owner')
  })

  it('zwei Owner stufen einander gleichzeitig zurück ⇒ genau einer gewinnt, ein Owner bleibt', async () => {
    const result = await together(
      call(role, { jwt: 'jwt-u-a', communityId: 'c1', memberId: 'm-b', role: 'admin' }),
      call(role, { jwt: 'jwt-u-b', communityId: 'c1', memberId: 'm-a', role: 'admin' }),
    )

    expect(result.ok).toHaveLength(1)
    expect(result.failed).toHaveLength(1)
    // Der Zweite liest unter der Sperre: er ist jetzt Admin und darf einen
    // Owner nicht antasten (die Regel `owner_protected` vor `last_owner`).
    expect(result.failed[0]).toMatchObject({ status: 409, data: { code: 'owner_protected' } })
    expect(activeOwners()).toHaveLength(1)
  })

  it('zwei Owner entfernen einander gleichzeitig ⇒ genau einer gewinnt, ein Owner bleibt', async () => {
    const result = await together(
      call(remove, { jwt: 'jwt-u-a', communityId: 'c1', memberId: 'm-b' }),
      call(remove, { jwt: 'jwt-u-b', communityId: 'c1', memberId: 'm-a' }),
    )

    expect(result.ok).toHaveLength(1)
    expect(result.failed).toHaveLength(1)
    // Der Zweite ist unter der Sperre schon entfernt ⇒ kein Recht mehr.
    expect(result.failed[0]).toMatchObject({ status: 403 })
    expect(activeOwners()).toHaveLength(1)
  })

  it('ein dritter Owner stuft beide anderen gleichzeitig zurück ⇒ beide gelingen, er bleibt Owner', async () => {
    seedMember('m-c', 'u-c', 'owner')
    const result = await together(
      call(role, { jwt: 'jwt-u-c', communityId: 'c1', memberId: 'm-a', role: 'admin' }),
      call(role, { jwt: 'jwt-u-c', communityId: 'c1', memberId: 'm-b', role: 'admin' }),
    )
    expect(result.failed).toHaveLength(0)
    expect(activeOwners().map(row => row.$id)).toEqual(['m-c'])
  })
})

// ── (5) Übergabe ────────────────────────────────────────────────────────────

describe('(5) Besitz-Übergabe: der zweite Schritt scheitert', () => {
  beforeEach(() => {
    seedCommunity()
    seedMember('m-owner', 'u-owner', 'owner')
    seedMember('m-target', 'u-target', 'editor')
    // Das Zurückstufen des bisherigen Owners scheitert.
    failingUpdates.set('m-owner', data => data.role === 'admin')
  })

  it('der erste Schritt wird zurückgenommen, die Antwort ist 502 transfer_incomplete', async () => {
    await expect(call(transfer, { jwt: 'jwt-u-owner', communityId: 'c1', memberId: 'm-target' }))
      .rejects.toMatchObject({ status: 502, data: { code: 'transfer_incomplete' } })

    expect(table('community_members').get('m-target')?.role).toBe('editor')
    expect(table('community_members').get('m-owner')?.role).toBe('owner')
    expect(logs.some(line => line.name === 'site.ownership_transfer_incomplete')).toBe(false)
  })

  it('scheitert auch das Zurücknehmen ⇒ dieselbe Antwort und eine zählbare Fehler-Zeile', async () => {
    failingUpdates.set('m-target', data => data.role === 'editor')
    await expect(call(transfer, { jwt: 'jwt-u-owner', communityId: 'c1', memberId: 'm-target' }))
      .rejects.toMatchObject({ status: 502, data: { code: 'transfer_incomplete' } })

    const line = logs.find(entry => entry.name === 'site.ownership_transfer_incomplete')
    expect(line?.level).toBe('error')
    expect(line?.detail.communityId).toBe('c1')
  })

  it('gelingt der zweite Schritt, ist die Übergabe vollständig', async () => {
    failingUpdates.clear()
    await expect(call(transfer, { jwt: 'jwt-u-owner', communityId: 'c1', memberId: 'm-target' }))
      .resolves.toMatchObject({ ok: true, ownerMemberId: 'm-target', previousOwnerRole: 'admin' })
    expect(activeOwners().map(row => row.$id)).toEqual(['m-target'])
  })
})
