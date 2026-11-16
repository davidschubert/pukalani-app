import { AppwriteException } from 'node-appwrite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { listAllRows } from '../../core/server/utils/listAllRows'
import { hashInviteCode } from '../server/utils/inviteCodes'
import { createRaceTablesDB } from './support/raceTablesDB'

/**
 * BE-015 — DIE TESTPHASE GIBT ES EINMAL JE KONTO, UND ANLEGEN VERLANGT EINE
 * BESTÄTIGTE ADRESSE.
 *
 * Echte Routen, echte Sperre, echte Vergabe über `trial_claims` in der
 * Renn-Ablage (`support/raceTablesDB.ts`: jeder Aufruf gibt die Hand ab, eine
 * vorhandene Id antwortet 409, eine fehlende Tabelle 404 `table_not_found`).
 * Nachgebildet ist nur, was hinter der Naht liegt: die Identität aus dem JWT,
 * das Tor, die Gesperrte-Namen-Liste.
 */

const race = createRaceTablesDB()
const { tablesDB, table, seed, failingReads, missingTables } = race

interface Identity { userId: string, projectId: string, email: string, name: string, emailVerified: boolean }
const identities = new Map<string, Identity>()
const gate = { inviteRequired: false }
const logs: { level: string, name: string, detail: Record<string, unknown> }[] = []

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
vi.mock('../server/utils/inviteRequests', () => ({ markCodeRedeemed: async () => {} }))

const PLANS = {
  basic: { lookupKey: null, products: ['comments'] },
  personal: { lookupKey: 'workspace_personal_monthly', lookupKeyYearly: 'workspace_personal_yearly', products: ['comments', 'posts'] },
  pro: { lookupKey: 'workspace_pro_monthly', lookupKeyYearly: 'workspace_pro_yearly', products: ['comments', 'posts', 'events'] },
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('useAppConfig', () => ({ pukalani: { control: { plans: PLANS } } }))
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
const trialCheck = await load('../server/api/control/onboarding/trial.post')
const { provisionCommunity } = await import('../server/utils/onboardingProvision')
const { claimTrial, trialClaimRowId } = await import('../server/utils/trialClaims')
const { TRIAL_USED_SUSPENSION_REASON } = await import('../server/utils/trialSweep')
const { exportCommunityUserData, eraseCommunityUserData } = await import('../server/utils/communityErasure')
const { handleCommunitySubscriptionUpdate } = await import('../server/utils/communityBilling')

const EVENT = { context: {} } as unknown as H3Event
const call = (handler: Handler, body: Record<string, unknown>) =>
  handler({ context: { body } } as unknown as H3Event)

interface Created { communityId: string, plan: string, trialEndsAt: string | null, trial: boolean, reused: boolean }

function identity(userId: string, emailVerified = true): Identity {
  const value = { userId, projectId: 'account', email: `${userId}@example.org`, name: userId, emailVerified }
  identities.set(`jwt-${userId}`, value)
  return value
}

const CODE = 'PUKA-ABCD-EFGH'

function siteBody(userId: string, slug: string, withCode = false) {
  return {
    jwt: `jwt-${userId}`,
    site: { name: `Site ${slug}`, slug, category: 'club', vibe: 'calm', ...(withCode ? { inviteCode: CODE } : {}) },
  }
}

const create = (userId: string, slug: string) => call(site, siteBody(userId, slug)) as Promise<Created>
const community = (id: string) => table('communities').get(id)
const communities = () => [...table('communities').values()]
const claims = () => [...table('trial_claims').values()]
const provisionInput = (slug: string) => ({
  name: `Site ${slug}`, slug, vibe: 'calm', profile: { category: 'club' as const }, inviteCode: null,
})

/** Was der stündliche Lauf am Ende einer Testphase tut (trialSweep.ts). */
function endTrial(communityId: string) {
  Object.assign(community(communityId) ?? {}, {
    trialEndsAt: new Date(Date.now() - 86_400_000).toISOString(),
    plan: 'basic',
    suspension: 'billing',
  })
}

beforeEach(() => {
  race.reset()
  identities.clear()
  logs.length = 0
  gate.inviteRequired = false
})

describe('trialClaimRowId', () => {
  it('ist stabil, je Konto verschieden und eine gültige Zeilen-Id (≤ 36, [a-z0-9])', () => {
    const id = trialClaimRowId('account', 'u1')
    expect(id).toBe(trialClaimRowId('account', 'u1'))
    expect(id).toMatch(/^[a-z0-9]{1,36}$/)
    expect(id).toHaveLength(34)
    expect(trialClaimRowId('account', 'u2')).not.toBe(id)
    // Dieselbe Konto-Id in einem anderen Projekt ist ein anderer Mensch.
    expect(trialClaimRowId('portfolio', 'u1')).not.toBe(id)
  })
})

describe('Testphase einmal je Konto', () => {
  it('die erste Community eines Kontos bekommt die Testphase und die Vergabe-Zeile', async () => {
    identity('u1')
    const result = await create('u1', 'alpha')

    expect(result).toMatchObject({ plan: 'pro', trial: true, reused: false })
    expect(result.trialEndsAt).toBeTruthy()
    expect(community(result.communityId)).toMatchObject({ plan: 'pro', suspension: '' })
    const claim = table('trial_claims').get(trialClaimRowId('account', 'u1'))
    expect(claim).toMatchObject({ runtimeProjectId: 'account', runtimeUserId: 'u1', communityId: result.communityId, source: 'onboarding' })
  })

  it('die zweite Community nach dem Ende der ersten Testphase entsteht OHNE Testphase, nur-lesend', async () => {
    identity('u1')
    const first = await create('u1', 'alpha')
    endTrial(first.communityId)

    const second = await create('u1', 'beta')
    expect(second).toMatchObject({ plan: 'basic', trialEndsAt: null, trial: false, reused: false })
    expect(community(second.communityId)).toMatchObject({
      plan: 'basic', trialEndsAt: null, suspension: 'billing', suspensionReason: TRIAL_USED_SUSPENSION_REASON,
    })
    expect(community(second.communityId)?.suspendedAt).toBeTruthy()
    expect(claims()).toHaveLength(1)
  })

  it('auch nach dem Stilllegen der ersten Community gibt es keine zweite Testphase', async () => {
    identity('u1')
    const first = await create('u1', 'alpha')
    // Stilllegen mitten in der Testphase: das Kontingent zählt sie nicht mehr.
    Object.assign(community(first.communityId) ?? {}, { status: 'disabled' })

    const second = await create('u1', 'beta')
    expect(second).toMatchObject({ plan: 'basic', trialEndsAt: null, trial: false })
    expect(community(second.communityId)?.suspension).toBe('billing')
  })

  it('auch nach dem LÖSCHEN der ersten Community-Zeile nicht', async () => {
    identity('u1')
    const first = await create('u1', 'alpha')
    table('communities').delete(first.communityId)

    const second = await create('u1', 'beta')
    expect(second.trial).toBe(false)
  })

  it('zwei verschiedene Konten bekommen je eine Testphase', async () => {
    identity('u1')
    identity('u2')
    const [a, b] = await Promise.all([create('u1', 'alpha'), create('u2', 'beta')])
    expect(a.trial).toBe(true)
    expect(b.trial).toBe(true)
    expect(claims()).toHaveLength(2)
  })

  it('ein Retry derselben Adresse (reused) vergibt nichts und meldet die Testphase der Zeile', async () => {
    identity('u1')
    const first = await create('u1', 'alpha')
    const retry = await create('u1', 'alpha')
    expect(retry).toMatchObject({ communityId: first.communityId, reused: true, trial: true, plan: 'pro' })
    expect(claims()).toHaveLength(1)
  })
})

describe('gleichzeitige Anlagen desselben Kontos', () => {
  it('über die Route (mit Sperre): eine Community, eine Testphase', async () => {
    identity('u1')
    const settled = await Promise.allSettled([create('u1', 'alpha'), create('u1', 'beta')])
    const ok = settled.filter(entry => entry.status === 'fulfilled')
    expect(ok).toHaveLength(1)
    expect(communities().filter(row => row.trialEndsAt)).toHaveLength(1)
    expect(claims()).toHaveLength(1)
  })

  it('OHNE Sperre (provisionCommunity direkt, zweimal zugleich): genau eine Testphase', async () => {
    const who = identity('u1')
    const [a, b] = await Promise.all([
      provisionCommunity(EVENT, who, provisionInput('alpha')),
      provisionCommunity(EVENT, who, provisionInput('beta')),
    ])
    // Das Kontingent liest ohne Sperre beide Male „noch keine" — die
    // Testphase hält trotzdem, weil sie an der festen Zeile hängt.
    expect(communities()).toHaveLength(2)
    expect([a.trial, b.trial].sort()).toEqual([false, true])
    expect(communities().filter(row => row.trialEndsAt)).toHaveLength(1)
    expect(claims()).toHaveLength(1)
  })

  it('claimTrial zehnmal zugleich: genau ein `granted`', async () => {
    const who = identity('u1')
    const outcomes = await Promise.all(Array.from({ length: 10 }, (_, i) => claimTrial(EVENT, who, `c${i}`)))
    expect(outcomes.filter(entry => entry === 'granted')).toHaveLength(1)
    expect(outcomes.filter(entry => entry === 'used')).toHaveLength(9)
  })
})

describe('scheitert die Anlage, geht die Vergabe zurück', () => {
  function failCreateIn(tableId: string) {
    const original = tablesDB.createRow
    tablesDB.createRow = async (args) => {
      if (args.tableId === tableId) throw new AppwriteException('Server Error', 500, 'general_unknown')
      return await original(args)
    }
    return () => { tablesDB.createRow = original }
  }

  it('Community-Zeile scheitert ⇒ keine Vergabe-Zeile, der nächste Versuch bekommt die Testphase', async () => {
    identity('u1')
    const restore = failCreateIn('communities')
    try {
      await expect(create('u1', 'alpha')).rejects.toMatchObject({ code: 500 })
    }
    finally {
      restore()
    }
    expect(claims()).toHaveLength(0)
    expect((await create('u1', 'alpha')).trial).toBe(true)
  })

  it('Owner-Mitgliedschaft scheitert ⇒ Community zurückgerollt UND Vergabe zurückgenommen', async () => {
    identity('u1')
    const restore = failCreateIn('community_members')
    try {
      await expect(create('u1', 'alpha')).rejects.toMatchObject({ code: 500 })
    }
    finally {
      restore()
    }
    expect(communities()).toHaveLength(0)
    expect(claims()).toHaveLength(0)
    expect((await create('u1', 'alpha')).trial).toBe(true)
  })

  it('scheitert auch das Zurücknehmen, steht eine zählbare Fehler-Zeile da', async () => {
    identity('u1')
    const restoreCreate = failCreateIn('communities')
    const originalDelete = tablesDB.deleteRow
    tablesDB.deleteRow = async (args) => {
      if (args.tableId === 'trial_claims') throw new AppwriteException('Server Error', 500, 'general_unknown')
      return await originalDelete(args)
    }
    try {
      await expect(create('u1', 'alpha')).rejects.toMatchObject({ code: 500 })
    }
    finally {
      restoreCreate()
      tablesDB.deleteRow = originalDelete
    }
    expect(logs.find(line => line.name === 'onboarding.trial_claim_release_failed')?.level).toBe('error')
  })
})

describe('ohne Migration control-039 und bei Störungen', () => {
  it('Tabelle fehlt ⇒ Testphase wie bisher, plus Fehler-Zeile', async () => {
    missingTables.add('trial_claims')
    identity('u1')
    const result = await create('u1', 'alpha')
    expect(result).toMatchObject({ plan: 'pro', trial: true })
    expect(community(result.communityId)?.suspension).toBe('')
    expect(logs.find(line => line.name === 'onboarding.trial_claims_missing')?.level).toBe('error')
  })

  it('ein anderer Fehler der Vergabe ⇒ nichts entsteht', async () => {
    identity('u1')
    const original = tablesDB.createRow
    tablesDB.createRow = async (args) => {
      if (args.tableId === 'trial_claims') throw new AppwriteException('Server Error', 500, 'general_unknown')
      return await original(args)
    }
    try {
      await expect(create('u1', 'alpha')).rejects.toMatchObject({ code: 500 })
    }
    finally {
      tablesDB.createRow = original
    }
    expect(communities()).toHaveLength(0)
    expect(table('community_members').size).toBe(0)
  })
})

describe('bestätigte Adresse', () => {
  it('unbestätigt ⇒ 403 email_unverified, nichts entsteht, kein Code verbraucht', async () => {
    gate.inviteRequired = true
    seed('invite_codes', {
      $id: 'code-1', codeHash: hashInviteCode(CODE), status: 'active', expiresAt: null, maxUses: 1, uses: 0, boundEmail: '',
    })
    identity('u1', false)

    await expect(call(site, siteBody('u1', 'alpha', true)))
      .rejects.toMatchObject({ status: 403, data: { code: 'email_unverified' } })
    expect(communities()).toHaveLength(0)
    expect(claims()).toHaveLength(0)
    expect(table('invite_codes').get('code-1')?.uses).toBe(0)
    expect(logs.find(line => line.name === 'onboarding.unverified_rejected')?.detail).toEqual({ runtimeUserId: 'u1' })
  })

  it('auch bei offenem Tor ohne Code', async () => {
    identity('u1', false)
    await expect(create('u1', 'alpha')).rejects.toMatchObject({ status: 403, data: { code: 'email_unverified' } })
    expect(communities()).toHaveLength(0)
  })
})

describe('Vorab-Prüfung für den Wizard', () => {
  it('noch keine Testphase ⇒ verfügbar', async () => {
    identity('u1')
    await expect(call(trialCheck, { jwt: 'jwt-u1' })).resolves.toEqual({ trialAvailable: true })
  })

  it('schon genutzt ⇒ nicht verfügbar', async () => {
    identity('u1')
    await create('u1', 'alpha')
    await expect(call(trialCheck, { jwt: 'jwt-u1' })).resolves.toEqual({ trialAvailable: false })
  })

  it('Tabelle fehlt ⇒ verfügbar (die Anlage vergibt dann wie bisher)', async () => {
    missingTables.add('trial_claims')
    identity('u1')
    await expect(call(trialCheck, { jwt: 'jwt-u1' })).resolves.toEqual({ trialAvailable: true })
  })

  it('Lesefehler ⇒ wirft statt „verfügbar"', async () => {
    failingReads.set('trial_claims', () => new AppwriteException('Server Error', 500, 'general_unknown'))
    identity('u1')
    await expect(call(trialCheck, { jwt: 'jwt-u1' })).rejects.toMatchObject({ code: 500 })
  })

  it('nimmt keine fremden Felder an (.strict)', async () => {
    identity('u1')
    await expect(call(trialCheck, { jwt: 'jwt-u1', userId: 'u2' })).rejects.toThrow()
  })
})

describe('Kauf öffnet eine Community ohne Testphase', () => {
  it('apply-plan hebt die billing-Sperre auf und setzt den Plan', async () => {
    identity('u1')
    const first = await create('u1', 'alpha')
    endTrial(first.communityId)
    const second = await create('u1', 'beta')
    expect(community(second.communityId)?.suspension).toBe('billing')

    await handleCommunitySubscriptionUpdate(EVENT, {
      status: 'active',
      metadata: { communityId: second.communityId, plan: 'personal' },
      lookupKey: 'workspace_personal_monthly',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    })
    expect(community(second.communityId)).toMatchObject({
      plan: 'personal', billingStatus: 'active', suspension: '', suspensionReason: '', suspendedAt: null,
    })
  })
})

describe('DSGVO: Auskunft und Löschung', () => {
  it('die Auskunft nennt die Testphase, die Löschung entfernt sie', async () => {
    identity('u1')
    const first = await create('u1', 'alpha')

    const exported = await exportCommunityUserData(EVENT, 'account', 'u1', '')
    expect(exported.trialClaim).toMatchObject({ communityId: first.communityId, communityName: 'Site alpha', source: 'onboarding' })

    const erased = await eraseCommunityUserData(EVENT, 'account', 'u1', '')
    expect(erased.trialClaimsDeleted).toBe(1)
    expect(claims()).toHaveLength(0)

    // Zweiter Lauf (Re-Run nach Teilfehler): nichts mehr da, kein Fehler.
    expect((await eraseCommunityUserData(EVENT, 'account', 'u1', '')).trialClaimsDeleted).toBe(0)
  })

  it('ohne Testphase und ohne Tabelle: leere Auskunft, Löschung gelingt', async () => {
    missingTables.add('trial_claims')
    expect((await exportCommunityUserData(EVENT, 'account', 'u1', '')).trialClaim).toBeNull()
    expect((await eraseCommunityUserData(EVENT, 'account', 'u1', '')).trialClaimsDeleted).toBe(0)
  })

  it('ein Lesefehler bricht die Auskunft ab', async () => {
    failingReads.set('trial_claims', () => new AppwriteException('Server Error', 500, 'general_unknown'))
    await expect(exportCommunityUserData(EVENT, 'account', 'u1', '')).rejects.toMatchObject({ code: 500 })
  })

  it('ein Fehler an der Zeile bricht die Löschung ab', async () => {
    identity('u1')
    await create('u1', 'alpha')
    const original = tablesDB.deleteRow
    tablesDB.deleteRow = async (args) => {
      if (args.tableId === 'trial_claims') throw new AppwriteException('Server Error', 500, 'general_unknown')
      return await original(args)
    }
    try {
      await expect(eraseCommunityUserData(EVENT, 'account', 'u1', '')).rejects.toMatchObject({ code: 500 })
    }
    finally {
      tablesDB.deleteRow = original
    }
    expect(claims()).toHaveLength(1)
  })
})
