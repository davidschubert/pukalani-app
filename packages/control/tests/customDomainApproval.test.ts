import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { createRaceTablesDB } from './support/raceTablesDB'

/**
 * SEC-022 / BE-014 (control-040) — EIGENE DOMAIN NUR MIT FREIGABE, NICHT IN
 * DER TESTPHASE, ABSCHALTEN STATT LÖSCHEN, UND EIN BLOSSER EINTRAG BLOCKIERT
 * NIEMANDEN.
 *
 * Echte Routen und echte Regeln gegen die Renn-Ablage
 * (`support/raceTablesDB.ts`). Nachgebildet ist nur, was hinter einer Naht
 * liegt: die Identität aus dem JWT, DNS (`checkDomainDns` — „steht das Token
 * dieser Community in der Zone?") und ploi. Der Resolver und der
 * Mail-Host-Leser bauen ihren eigenen `TablesDB` — der Konstruktor gibt hier
 * dieselbe Ablage zurück.
 */

const race = createRaceTablesDB()
const { tablesDB, table, seed } = race

vi.mock('node-appwrite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node-appwrite')>()
  return {
    ...actual,
    // Mit `new` gerufen: eine Funktion, die ein Objekt zurückgibt, liefert
    // genau dieses Objekt.
    TablesDB: vi.fn(function () {
      return race.tablesDB
    }),
  }
})

interface Identity { userId: string, projectId: string }
const identities = new Map<string, Identity>()
vi.mock('../server/utils/onboardingService', () => ({
  requireOnboardingCaller: async () => {},
  verifyRuntimeIdentity: async (_event: unknown, jwt: string) => {
    const found = identities.get(jwt)
    if (!found) throw Object.assign(new Error('Unauthorized'), { status: 401 })
    return found
  },
}))

/** Die Tokens, die gerade als TXT-Record in der Zone stehen. */
const zoneTokens = new Set<string>()
vi.mock('../server/utils/customDomainDns', () => ({
  checkDomainDns: async (forms: string[], token: string) => ({
    owned: zoneTokens.has(token),
    pointing: true,
    canonicalPointing: true,
    pointingForms: forms,
    txtRecordName: `_pukalani-verify.${forms[0]}`,
    caa: 'ok',
    caaZone: '',
    error: '',
  }),
  domainAnswersOverHttps: async () => ({ ok: true, error: '' }),
}))

vi.mock('../server/utils/reservedNames', async (importOriginal) => ({
  ...await importOriginal<typeof import('../server/utils/reservedNames')>(),
  isNameReservedInDb: async () => false,
}))

const ploiCalls: string[] = []
vi.mock('../server/utils/ploi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/utils/ploi')>()
  return {
    ...actual,
    ploiConfig: () => ({}),
    ensurePloiTenants: async (_config: unknown, hosts: string[]) => { ploiCalls.push(`tenants:${hosts.join(',')}`); return { ok: true, skipped: false, message: '' } },
    requestPloiTenantCertificate: async (_config: unknown, host: string) => { ploiCalls.push(`cert:${host}`); return { ok: true, skipped: false, message: '' } },
    removePloiTenant: async () => ({ ok: true, skipped: false, message: '' }),
  }
})

const logs: { level: string, name: string, detail: Record<string, unknown> }[] = []
const audits: Record<string, unknown>[] = []

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useAppConfig', () => ({ pukalani: { control: { defaultPoolProject: 'account' } } }))
vi.stubGlobal('useRuntimeConfig', () => ({
  public: { appwriteDatabaseId: 'main' },
  customDomainServerIps: '203.0.113.10',
  customDomainCnameTarget: 'platform.pukalani.app',
  customDomainDryRun: '1',
}))
vi.stubGlobal('readValidatedBody', async (event: H3Event, parse: (input: unknown) => unknown) =>
  parse((event.context as { body: unknown }).body))
vi.stubGlobal('getRouterParam', (event: H3Event, name: string) =>
  ((event.context as { params?: Record<string, string> }).params ?? {})[name])
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('toH3Error', (error: unknown) => error)
vi.stubGlobal('logEvent', (level: string, name: string, detail: Record<string, unknown>) => { logs.push({ level, name, detail }) })
vi.stubGlobal('recordAudit', async (_event: unknown, input: Record<string, unknown>) => { audits.push(input) })
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('requirePermission', (event: H3Event, capability: string) => {
  const granted = (event.context as { permissions?: string[] }).permissions ?? []
  if (!granted.includes(capability)) {
    throw Object.assign(new Error('Forbidden'), { status: 403, statusCode: 403 })
  }
})

type Handler = (event: H3Event) => Promise<unknown>
const load = async (path: string) => (await import(path)).default as unknown as Handler
const setRoute = await load('../server/api/control/community/domain/set.post')
const verifyRoute = await load('../server/api/control/community/domain/verify.post')
const activateRoute = await load('../server/api/control/community/domain/activate.post')
const stateRoute = await load('../server/api/control/community/domain/state.post')
const removeRoute = await load('../server/api/control/community/domain/remove.post')
const approvalRoute = await load('../server/api/control/tenants/[id]/custom-domain.post')
const createTenantRoute = await load('../server/api/control/tenants/index.post')
const listTenantsRoute = await load('../server/api/control/tenants/index.get')
const { createTenantsTableResolver } = await import('../server/utils/tenantsResolver')
const { createCommunityHostResolver } = await import('../server/utils/communityHostResolver')

interface Thrown { status?: number, data?: { code?: string } }
interface DomainState {
  domain: string
  status: string
  error: string
  entitlement: { allowed: boolean, reason?: string }
  approved: boolean
  graceEndsAt: string | null
  pausedAt: string | null
  claimExpiresAt: string | null
  needsPlatformRegistration?: boolean
}

const DAY = 24 * 60 * 60 * 1000
const FUTURE = () => new Date(Date.now() + 7 * DAY).toISOString()

/** Eine Pool-Community mit Owner. Standard: bezahltes Pro, freigegeben. */
function community(id: string, overrides: Record<string, unknown> = {}) {
  identities.set(`jwt-${id}`, { userId: `owner-${id}`, projectId: 'account' })
  seed('community_members', {
    $id: `m-${id}`, communityId: id, runtimeProjectId: 'account', runtimeUserId: `owner-${id}`, status: 'active', role: 'owner',
  })
  return seed('communities', {
    $id: id,
    host: `${id}.pukalani.app`,
    mode: 'pool',
    projectId: 'account',
    tenantId: `t-${id}`,
    status: 'active',
    plan: 'pro',
    trialEndsAt: null,
    billingStatus: 'active',
    suspension: '',
    customDomain: '',
    customDomainStatus: 'none',
    customDomainToken: '',
    customDomainError: '',
    customDomainVerifiedAt: null,
    customDomainActivatedAt: null,
    customDomainApproved: true,
    customDomainApprovedAt: new Date().toISOString(),
    customDomainClaimedAt: null,
    customDomainGraceEndsAt: null,
    customDomainPausedAt: null,
    ...overrides,
  })
}

const row = (id: string) => table('communities').get(id)!

async function call(handler: Handler, communityId: string, extra: Record<string, unknown> = {}): Promise<{ result?: DomainState, error?: Thrown }> {
  try {
    const result = await handler({ context: { body: { jwt: `jwt-${communityId}`, communityId, ...extra } } } as unknown as H3Event) as DomainState
    return { result }
  }
  catch (error) {
    return { error: error as Thrown }
  }
}

async function operator(id: string, approved: boolean, permissions = ['sites.manage']) {
  try {
    const result = await approvalRoute({ context: { params: { id }, body: { approved }, permissions } } as unknown as H3Event) as Record<string, unknown>
    return { result }
  }
  catch (error) {
    return { error: error as Thrown }
  }
}

/** Eintragen und den TXT-Record dieser Community in die Zone legen. */
async function claim(communityId: string, domain = 'www.kunde.de') {
  const { result, error } = await call(setRoute, communityId, { domain })
  expect(error, JSON.stringify(error)).toBeUndefined()
  zoneTokens.add(String(row(communityId).customDomainToken))
  return result!
}

beforeEach(() => {
  race.reset()
  identities.clear()
  zoneTokens.clear()
  ploiCalls.length = 0
  logs.length = 0
  audits.length = 0
})

describe('die Tür: Plan, Testphase, Freigabe (SEC-022)', () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ['Plan nicht Pro', { plan: 'personal' }, 'plan_required'],
    ['Testphase mit Plan pro', { trialEndsAt: FUTURE(), billingStatus: '' }, 'trial_not_included'],
    ['bezahltes Pro ohne Freigabe', { customDomainApproved: false }, 'approval_required'],
  ]

  for (const [label, overrides, code] of cases) {
    it(`${label}: set, verify und activate antworten 403 ${code}`, async () => {
      community('c1', { ...overrides, customDomain: 'www.kunde.de', customDomainStatus: 'pending_platform', customDomainToken: 'a'.repeat(32) })
      for (const handler of [setRoute, verifyRoute, activateRoute]) {
        const { error } = await call(handler, 'c1', handler === setRoute ? { domain: 'www.kunde.de' } : {})
        expect(error?.status).toBe(403)
        expect(error?.data?.code).toBe(code)
      }
      // Nichts geschrieben.
      expect(row('c1').customDomainStatus).toBe('pending_platform')
      expect(logs.some(entry => entry.name === 'community.custom_domain_plan_denied')).toBe(true)
    })
  }

  it('state und remove gehen ohne Berechtigung — und state nennt den Grund', async () => {
    community('c1', { trialEndsAt: FUTURE(), billingStatus: '', customDomain: 'www.kunde.de', customDomainStatus: 'pending_dns', customDomainToken: 'a'.repeat(32) })
    const state = await call(stateRoute, 'c1')
    expect(state.error).toBeUndefined()
    expect(state.result?.entitlement).toEqual({ allowed: false, reason: 'trial' })
    expect(state.result?.approved).toBe(true)

    const removed = await call(removeRoute, 'c1')
    expect(removed.error).toBeUndefined()
    expect(row('c1')).toMatchObject({ customDomain: '', customDomainStatus: 'none', customDomainClaimedAt: null, customDomainGraceEndsAt: null, customDomainPausedAt: null })
    // Die Freigabe gehört der Community, nicht der Domain.
    expect(row('c1').customDomainApproved).toBe(true)
  })

  it('bezahlt + freigegeben: eintragen schreibt das Eintragsdatum, state zeigt bis wann der Eintrag gehalten wird', async () => {
    community('c1', { customDomainGraceEndsAt: FUTURE(), customDomainPausedAt: new Date().toISOString() })
    const before = Date.now()
    const state = await claim('c1')
    expect(state.status).toBe('pending_dns')
    expect(state.entitlement).toEqual({ allowed: true })
    const claimedAt = Date.parse(String(row('c1').customDomainClaimedAt))
    expect(claimedAt).toBeGreaterThanOrEqual(before)
    expect(row('c1').customDomainGraceEndsAt).toBeNull()
    expect(row('c1').customDomainPausedAt).toBeNull()
    expect(Date.parse(String(state.claimExpiresAt))).toBe(claimedAt + 14 * DAY)
  })
})

describe('Eigentum: ein bloßer Eintrag blockiert niemanden (SEC-022)', () => {
  it('der unbewiesene Eintrag einer anderen Community blockiert set nicht', async () => {
    community('other', { customDomain: 'www.kunde.de', customDomainStatus: 'pending_dns', customDomainToken: 'b'.repeat(32) })
    community('c1')
    const { error, result } = await call(setRoute, 'c1', { domain: 'kunde.de' })
    expect(error).toBeUndefined()
    expect(result?.status).toBe('pending_dns')
  })

  for (const status of ['pending_cert', 'pending_platform', 'active', 'paused']) {
    it(`ein Nachweis einer anderen Community (${status}) blockiert set mit 409 domain_taken`, async () => {
      community('other', { customDomain: 'www.kunde.de', customDomainStatus: status, customDomainToken: 'b'.repeat(32) })
      community('c1')
      // Beide Formen: eingetragen ist www, versucht wird der Apex.
      const { error } = await call(setRoute, 'c1', { domain: 'kunde.de' })
      expect(error?.status).toBe(409)
      expect(error?.data?.code).toBe('domain_taken')
      expect(row('c1').customDomain).toBe('')
    })
  }

  it('zwei unbewiesene Einträge: der erste Nachweis gewinnt, der zweite bekommt 409 und bleibt pending_dns', async () => {
    community('a')
    community('b')
    await claim('a')
    await claim('b')
    expect(row('a').customDomainStatus).toBe('pending_dns')
    expect(row('b').customDomainStatus).toBe('pending_dns')

    const first = await call(verifyRoute, 'a')
    expect(first.error).toBeUndefined()
    expect(first.result?.status).toBe('pending_platform')

    ploiCalls.length = 0
    const second = await call(verifyRoute, 'b')
    expect(second.error?.status).toBe(409)
    expect(second.error?.data?.code).toBe('domain_taken')
    expect(row('b').customDomainStatus).toBe('pending_dns')
    expect(String(row('b').customDomainError)).toContain('andere Community')
    // Vor jeder Bestellung bei ploi entschieden.
    expect(ploiCalls).toEqual([])
  })

  it('ein Silo-Eintrag (websites) blockiert weiterhin in jedem Zustand', async () => {
    seed('websites', { $id: 'w1', customDomain: 'www.kunde.de', customDomainStatus: 'pending_dns' })
    community('c1')
    const { error } = await call(setRoute, 'c1', { domain: 'www.kunde.de' })
    expect(error?.data?.code).toBe('domain_taken')
  })
})

describe('Resolver: abgeschaltete Domain leitet vorübergehend auf die Pukalani-Adresse (BE-014)', () => {
  const resolverFor = () => createTenantsTableResolver({ endpoint: 'http://localhost', projectId: 'admin', apiKey: 'k', databaseId: 'main', cacheTtlMs: 0 })

  it('aktive Domain: die Domain löst auf und ist kanonisch, dauerhaft', async () => {
    community('c1', { customDomain: 'www.kunde.de', customDomainStatus: 'active' })
    const context = await resolverFor()('kunde.de')
    expect(context).toMatchObject({ communityId: 'c1', canonicalHost: 'www.kunde.de' })
    expect(context?.canonicalRedirect).toBeUndefined()
  })

  it('abgeschaltete Domain: beide Formen lösen auf, kanonisch ist die Pukalani-Adresse, vorübergehend', async () => {
    community('c1', { customDomain: 'www.kunde.de', customDomainStatus: 'paused' })
    for (const host of ['www.kunde.de', 'kunde.de']) {
      const context = await resolverFor()(host)
      expect(context, host).toMatchObject({ communityId: 'c1', canonicalHost: 'c1.pukalani.app', canonicalRedirect: 'temporary' })
    }
  })

  it('pending_* und error lösen weiterhin NICHT auf (404)', async () => {
    for (const status of ['pending_dns', 'pending_cert', 'pending_platform', 'error']) {
      race.reset()
      community('c1', { customDomain: 'www.kunde.de', customDomainStatus: status })
      expect(await resolverFor()('www.kunde.de'), status).toBeNull()
    }
  })

  it('der Mail-Link einer Community mit abgeschalteter Domain zeigt auf die Pukalani-Adresse', async () => {
    community('c1', { customDomain: 'www.kunde.de', customDomainStatus: 'paused' })
    community('c2', { customDomain: 'www.zwei.de', customDomainStatus: 'active' })
    const resolve = createCommunityHostResolver({ endpoint: 'http://localhost', projectId: 'admin', apiKey: 'k', databaseId: 'main', cacheTtlMs: 0 })
    expect(await resolve(['t-c1', 't-c2'])).toEqual({ 't-c1': 'c1.pukalani.app', 't-c2': 'www.zwei.de' })
  })
})

describe('Betreiber: Freigabe geben und entziehen (SEC-022)', () => {
  it('freigeben setzt Freigabe und Zeitpunkt und schreibt das Protokoll', async () => {
    community('c1', { customDomainApproved: null, customDomainApprovedAt: null })
    const { result, error } = await operator('c1', true)
    expect(error).toBeUndefined()
    expect(result).toMatchObject({ customDomainApproved: true })
    expect(row('c1').customDomainApproved).toBe(true)
    expect(row('c1').customDomainApprovedAt).toBeTruthy()
    expect(audits).toEqual([expect.objectContaining({
      action: 'community.custom_domain_approved', targetType: 'community', targetId: 'c1',
      metadata: { domain: '', previousStatus: 'none', status: 'none' },
    })])
  })

  it('entziehen bei aktiver Domain schaltet sie SOFORT ab (ohne Frist) und protokolliert', async () => {
    community('c1', { customDomain: 'www.kunde.de', customDomainStatus: 'active', customDomainGraceEndsAt: FUTURE() })
    const { result } = await operator('c1', false)
    expect(result).toMatchObject({ customDomainApproved: false, customDomainStatus: 'paused', customDomainGraceEndsAt: null })
    expect(row('c1')).toMatchObject({ customDomainApproved: false, customDomainApprovedAt: null, customDomainStatus: 'paused', customDomainGraceEndsAt: null })
    expect(row('c1').customDomainPausedAt).toBeTruthy()
    // Nichts gelöscht.
    expect(row('c1').customDomain).toBe('www.kunde.de')
    expect(audits).toEqual([expect.objectContaining({
      action: 'community.custom_domain_approval_revoked',
      metadata: { domain: 'www.kunde.de', previousStatus: 'active', status: 'paused' },
    })])
    expect(logs.some(entry => entry.name === 'community.custom_domain_approval_revoked')).toBe(true)
  })

  it('entziehen ohne Domain kippt nur den Schalter', async () => {
    community('c1')
    await operator('c1', false)
    expect(row('c1')).toMatchObject({ customDomainApproved: false, customDomainStatus: 'none', customDomainPausedAt: null })
  })

  it('ohne sites.manage: 403, nichts geschrieben', async () => {
    community('c1', { customDomainApproved: null })
    const { error } = await operator('c1', true, [])
    expect(error?.status).toBe(403)
    expect(row('c1').customDomainApproved).toBeNull()
    expect(audits).toEqual([])
  })

  it('der Rumpf ist strikt', async () => {
    community('c1')
    await expect(approvalRoute({ context: { params: { id: 'c1' }, body: { approved: true, status: 'active' }, permissions: ['sites.manage'] } } as unknown as H3Event)).rejects.toThrow()
  })
})

describe('wieder einschalten: Prüfen auf einer abgeschalteten Domain (BE-014)', () => {
  const pausedAt = new Date(Date.now() - DAY).toISOString()

  it('berechtigt: paused → verify → pending_platform → activate → active, Stempel geräumt', async () => {
    community('c1', { customDomain: 'www.kunde.de', customDomainStatus: 'paused', customDomainToken: 'c'.repeat(32), customDomainPausedAt: pausedAt, customDomainGraceEndsAt: pausedAt })
    zoneTokens.add('c'.repeat(32))
    const checked = await call(verifyRoute, 'c1')
    expect(checked.error).toBeUndefined()
    expect(checked.result).toMatchObject({ status: 'pending_platform', needsPlatformRegistration: true })

    const activated = await call(activateRoute, 'c1')
    expect(activated.result?.status).toBe('active')
    expect(row('c1')).toMatchObject({ customDomainStatus: 'active', customDomainPausedAt: null, customDomainGraceEndsAt: null })
  })

  it('DNS-Problem beim Wiedereinschalten: bleibt paused (Umleitung bleibt), mit dem Grund', async () => {
    community('c1', { customDomain: 'www.kunde.de', customDomainStatus: 'paused', customDomainToken: 'c'.repeat(32), customDomainPausedAt: pausedAt })
    // Token steht NICHT mehr in der Zone.
    const checked = await call(verifyRoute, 'c1')
    expect(checked.error).toBeUndefined()
    expect(checked.result?.status).toBe('paused')
    expect(checked.result?.error).toContain('TXT-Eintrag')
    expect(row('c1').customDomainStatus).toBe('paused')
  })

  it('nicht berechtigt (Freigabe entzogen): 403, bleibt paused', async () => {
    community('c1', { customDomain: 'www.kunde.de', customDomainStatus: 'paused', customDomainToken: 'c'.repeat(32), customDomainApproved: false })
    zoneTokens.add('c'.repeat(32))
    const checked = await call(verifyRoute, 'c1')
    expect(checked.error?.status).toBe(403)
    expect(checked.error?.data?.code).toBe('approval_required')
    expect(row('c1').customDomainStatus).toBe('paused')
  })
})

describe('Anlegen und Liste des Betreibers (control-040)', () => {
  it('eine vom Betreiber angelegte Community ist NICHT freigegeben und trägt alle fünf Spalten', async () => {
    const created = await createTenantRoute({ context: { body: { name: 'Kunde X', host: 'kunde-x.pukalani.app', mode: 'pool', plan: 'pro' }, permissions: ['sites.manage'] } } as unknown as H3Event) as { id: string }
    expect(row(created.id)).toMatchObject({
      customDomainApproved: false,
      customDomainApprovedAt: null,
      customDomainClaimedAt: null,
      customDomainGraceEndsAt: null,
      customDomainPausedAt: null,
    })
  })

  it('die Liste zeigt Domain, aufgelösten Status, Freigabe, Frist und Abschaltung', async () => {
    const grace = FUTURE()
    community('c1', { customDomain: 'www.kunde.de', customDomainStatus: 'active', customDomainGraceEndsAt: grace })
    community('c2', { customDomainApproved: null, customDomainStatus: null })
    const list = await listTenantsRoute({ context: { permissions: ['sites.manage'] } } as unknown as H3Event) as { tenants: Record<string, unknown>[] }
    const byId = Object.fromEntries(list.tenants.map(tenant => [tenant.id, tenant]))
    expect(byId.c1).toMatchObject({ customDomain: 'www.kunde.de', customDomainStatus: 'active', customDomainApproved: true, customDomainGraceEndsAt: grace, customDomainPausedAt: null })
    expect(byId.c2).toMatchObject({ customDomain: '', customDomainStatus: 'none', customDomainApproved: false })
  })
})
