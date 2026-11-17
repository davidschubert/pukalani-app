import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import {
  __resetCommunityJoinMemory,
  rememberCommunityAccessRestored,
  rememberCommunityAccessRevoked,
} from '../server/utils/communityJoin'
import {
  __resetFormerMembersByTenantResolver,
  registerFormerMembersByTenantResolver,
  resolveFormerMembersOfTenant,
} from '../server/utils/communityMembership'

/**
 * ENTFERNT ⇒ KEINE BENACHRICHTIGUNG MEHR AUS DIESER COMMUNITY (MM1 b, 2026-11-17).
 *
 * Gemessen am 2026-11-17 auf der lokalen Bühne: antwortet jemand auf den alten
 * Kommentar einer entfernten Person, entstand eine Glocken-Zeile und eine Mail
 * mit einem Auszug des neuen Textes. Jetzt fragt `notify()` vor dem Schreiben,
 * und die Sammel-Mail lässt aus, was vor dem Entzug liegen blieb.
 *
 * Hier läuft der ECHTE Vertrag (`communityMembership.ts`, Kurzzeit-Gedächtnis
 * aus `communityJoin.ts`); nachgebildet ist nur die Antwort des Control Plane:
 * `u-removed` ist aus der Community mit dem Stempel `t-a` entfernt, sonst
 * niemand. Der Weg über beide Server steht im Beweis-Skript
 * `packages/onboarding/scripts/verify-removed-notifications.mjs`.
 */

const TENANT_A = 't-a'
const TENANT_B = 't-b'
const COMMUNITY_A = 'c-a'

const lookups: Array<{ tenantId: string, runtimeUserIds: string[] }> = []
let resolverFails = false

function registerControlPlane() {
  registerFormerMembersByTenantResolver(async (lookup) => {
    lookups.push(lookup)
    if (resolverFails) throw new Error('control plane down')
    return lookup.tenantId === TENANT_A ? lookup.runtimeUserIds.filter(id => id === 'u-removed') : []
  })
}

const createRow = vi.fn(async () => ({}))
const instantMail = vi.fn(async () => {})
const sentMails: Array<{ to: string, text: string }> = []
const unreadRows: Record<string, unknown>[] = []
const accounts = new Map<string, { $id: string, email: string, emailVerification: boolean, prefs: Record<string, unknown> }>()

let notify: typeof import('../server/utils/notify').notify
let runEmailDigestSweep: typeof import('../server/utils/emailDigest').runEmailDigestSweep

beforeAll(async () => {
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appUrl: 'https://app.example', appwriteDatabaseId: 'db' } }))
  vi.stubGlobal('useAppConfig', () => ({}))
  vi.stubGlobal('mailerConfigured', async () => true)
  vi.stubGlobal('warnMailerMissingOnce', () => {})
  vi.stubGlobal('resolveNotificationText', (text: string) => text)
  vi.stubGlobal('maybeSendInstantEmail', instantMail)
  vi.stubGlobal('createAdminClient', () => ({
    users: {
      get: async ({ userId }: { userId: string }) => accounts.get(userId) ?? null,
      updatePrefs: async () => {},
    },
    tablesDB: {
      createRow,
      listRows: async () => ({ total: unreadRows.length, rows: unreadRows }),
    },
  }))
  vi.stubGlobal('sendMail', async (_event: unknown, input: { to: string, text: string }) => {
    sentMails.push(input)
  })
  const mail = await import('../server/utils/notificationEmail')
  vi.stubGlobal('resolveEmailPrefs', mail.resolveEmailPrefs)
  vi.stubGlobal('buildDigestEmail', mail.buildDigestEmail)
  notify = (await import('../server/utils/notify')).notify
  runEmailDigestSweep = (await import('../server/utils/emailDigest')).runEmailDigestSweep
})

beforeEach(() => {
  lookups.length = 0
  resolverFails = false
  createRow.mockClear()
  instantMail.mockClear()
  sentMails.length = 0
  unreadRows.length = 0
  accounts.clear()
  registerControlPlane()
})

afterEach(() => {
  __resetFormerMembersByTenantResolver()
  __resetCommunityJoinMemory()
})

const reply = (recipientId: string, communityId = TENANT_A) => ({
  recipientId,
  type: 'reply',
  title: 'Antwortende',
  body: 'Auszug der Antwort',
  link: '/discussions/x',
  scope: 'tenant' as const,
  communityId,
})

/** Ein Request auf dem Host der Community A (Pool). */
const requestOnA = () => ({
  context: { tenant: { mode: 'pool', tenantId: TENANT_A, communityId: COMMUNITY_A, projectId: 'account' } },
}) as unknown as H3Event

describe('notify() — ohne Request (Läufe)', () => {
  it('entferntes Konto: keine Zeile, keine Mail, als bewusst ausgelassen gemeldet', async () => {
    expect(await notify(undefined, reply('u-removed'))).toEqual({ created: false, skipped: 'former_member' })
    expect(createRow).not.toHaveBeenCalled()
    expect(instantMail).not.toHaveBeenCalled()
  })

  it('Gegenprobe: ein Mitglied derselben Community bekommt Zeile und Mail-Zweig', async () => {
    expect(await notify(undefined, reply('u-member'))).toEqual({ created: true })
    expect(createRow).toHaveBeenCalledTimes(1)
    expect(instantMail).toHaveBeenCalledTimes(1)
    expect(lookups).toEqual([{ tenantId: TENANT_A, runtimeUserIds: ['u-member'] }])
  })

  it('dasselbe Konto in einer ANDEREN Community bleibt erreichbar', async () => {
    expect(await notify(undefined, reply('u-removed', TENANT_B))).toEqual({ created: true })
    expect(createRow).toHaveBeenCalledTimes(1)
  })

  it("die neue Einladung kommt an: formerMember 'deliver' fragt gar nicht erst", async () => {
    expect(await notify(undefined, { ...reply('u-removed'), type: 'siteInvite', formerMember: 'deliver' })).toEqual({ created: true })
    expect(lookups).toEqual([])
  })

  it('Vertragssachen (scope account) und Zeilen ohne Stempel betrifft die Frage nicht', async () => {
    expect(await notify(undefined, { ...reply('u-removed'), scope: 'account' })).toEqual({ created: true })
    const { communityId: _none, ...withoutStamp } = reply('u-removed')
    expect(await notify(undefined, withoutStamp)).toEqual({ created: true })
    expect(lookups).toEqual([])
  })

  it('fail-soft: antwortet das Control Plane nicht, geht die Meldung raus wie bisher', async () => {
    resolverFails = true
    expect(await notify(undefined, reply('u-removed'))).toEqual({ created: true })
    expect(createRow).toHaveBeenCalledTimes(1)
  })

  it('ohne registrierten Resolver (Einzel-Instanz) ändert sich nichts', async () => {
    __resetFormerMembersByTenantResolver()
    expect(await notify(undefined, reply('u-removed'))).toEqual({ created: true })
    expect([...await resolveFormerMembersOfTenant(TENANT_A, ['u-removed'])]).toEqual([])
  })
})

describe('notify() — im Request der Community (die Minute nach dem Entzug)', () => {
  it('gerade entzogen: die frische Notiz schlägt den Resolver, der es noch nicht weiß', async () => {
    // `u-fresh` kennt das nachgebildete Control Plane NICHT als entfernt — wie
    // der 60-s-Cache des echten Resolvers direkt nach dem Entzug.
    rememberCommunityAccessRevoked(COMMUNITY_A, 'u-fresh')
    expect(await notify(requestOnA(), reply('u-fresh'))).toEqual({ created: false, skipped: 'former_member' })
    expect(createRow).not.toHaveBeenCalled()
    expect(lookups).toEqual([])
  })

  it('Gegenprobe: ohne Notiz bekommt dasselbe Konto die Meldung', async () => {
    expect(await notify(requestOnA(), reply('u-fresh'))).toEqual({ created: true })
  })

  it('gerade wieder aufgenommen: die Meldung kommt an, obwohl der Resolver noch „ehemalig" sagt', async () => {
    rememberCommunityAccessRestored(COMMUNITY_A, 'u-removed')
    expect(await notify(requestOnA(), reply('u-removed'))).toEqual({ created: true })
    expect(lookups).toEqual([])
  })

  it('die Notiz gilt nur für die Community des Requests, nicht für einen fremden Stempel', async () => {
    rememberCommunityAccessRevoked(COMMUNITY_A, 'u-fresh')
    expect(await notify(requestOnA(), reply('u-fresh', TENANT_B))).toEqual({ created: true })
    expect(lookups).toEqual([{ tenantId: TENANT_B, runtimeUserIds: ['u-fresh'] }])
  })

  it('ohne ausdrücklichen Stempel gilt der Mandant des Requests', async () => {
    const { communityId: _none, ...fromRequest } = reply('u-removed')
    expect(await notify(requestOnA(), fromRequest)).toEqual({ created: false, skipped: 'former_member' })
    expect(lookups).toEqual([{ tenantId: TENANT_A, runtimeUserIds: ['u-removed'] }])
  })
})

describe('Sammel-Mail — was vor dem Entzug liegen blieb', () => {
  const row = (id: string, recipientId: string, communityId: string, title: string) => ({
    $id: id, $createdAt: new Date().toISOString(), recipientId, type: 'reply', title, body: 'Auszug', link: '/x', read: false, communityId,
  })
  const digestAccount = (id: string) => {
    accounts.set(id, { $id: id, email: `${id}@example.test`, emailVerification: true, prefs: { emailNotifications: 'digest', emailLocale: 'de' } })
  }

  it('das entfernte Konto bekommt keine Sammel-Mail aus dieser Community, das Mitglied schon', async () => {
    digestAccount('u-removed')
    digestAccount('u-member')
    unreadRows.push(row('n1', 'u-removed', TENANT_A, 'Aus A an Entfernt'), row('n2', 'u-member', TENANT_A, 'Aus A an Mitglied'))

    const result = await runEmailDigestSweep()

    expect(result.sent).toBe(1)
    expect(sentMails.map(mail => mail.to)).toEqual(['u-member@example.test'])
    // EINE gebündelte Frage je Community, nicht eine je Zeile.
    expect(lookups).toEqual([{ tenantId: TENANT_A, runtimeUserIds: ['u-removed', 'u-member'] }])
  })

  it('was aus einer anderen Community oder ohne Mandant kommt, bleibt in der Mail', async () => {
    digestAccount('u-removed')
    unreadRows.push(
      row('n1', 'u-removed', TENANT_A, 'Aus-A-fehlt'),
      row('n2', 'u-removed', TENANT_B, 'Aus-B-bleibt'),
      row('n3', 'u-removed', '_account', 'Konto-bleibt'),
    )

    expect((await runEmailDigestSweep()).sent).toBe(1)
    expect(sentMails).toHaveLength(1)
    expect(sentMails[0]!.text).toContain('Aus-B-bleibt')
    expect(sentMails[0]!.text).toContain('Konto-bleibt')
    expect(sentMails[0]!.text).not.toContain('Aus-A-fehlt')
  })
})
