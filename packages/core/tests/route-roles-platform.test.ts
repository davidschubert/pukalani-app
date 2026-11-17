import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Query } from 'node-appwrite'
import {
  describeAccountRoute,
  describeRoleGatedRoute,
  probeRoute,
  resetCommunityWorld,
  userIdOf,
  type RoleExpectation,
} from './support/participationHarness'
import { appwriteFake } from './support/appwriteFake'
import { coreKit } from './support/coreRouteKit'
import { requireAnalyticsProxy } from '../server/utils/analyticsProxy'

/**
 * BENACHRICHTIGUNGEN, BETREIBER-LÄUFE, ANWESENHEIT, STATISTIK-PROXY —
 * ROLLEN-TESTS AN DER ECHTEN ROUTE (OPS-009, BT1 b).
 *
 * Vier Arten von Entscheidung:
 *  - Benachrichtigungen und Anwesenheit: nur das EIGENE Konto (Empfänger-Filter
 *    bzw. Anwesenheits-Id = Konto-Id der Sitzung).
 *  - Digest-Lauf und Berechtigungs-Abgleich: Rollen-Tor `system.manage` — NUR
 *    der Betreiber (globales Label). Keine Community-Rolle reicht, auch nicht
 *    Owner oder Admin einer Community. Die Erwartung steht ausgeschrieben.
 *  - Zähler der Anwesenden: öffentlich, aber Namen nur für Angemeldete.
 *  - Statistik-Proxy: öffentlich, die eine Entscheidung ist der Schalter der
 *    App (aus ⇒ 404), und weitergereicht wird nie ein Cookie.
 */

vi.mock('../server/lib/appwrite', async () => (await import('./support/appwriteFake')).appwriteLibMock)

const runs = vi.hoisted(() => ({ digest: 0, entitlements: 0 }))

vi.mock('../server/utils/emailDigest', () => ({
  runEmailDigestSweep: async () => {
    runs.digest += 1
    return { sent: 0 }
  },
}))

vi.mock('../server/utils/entitlementsPull', () => ({
  runEntitlementsPull: async () => {
    runs.entitlements += 1
    return { ok: true }
  },
}))

beforeEach(() => {
  appwriteFake.reset()
  runs.digest = 0
  runs.entitlements = 0
})

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

// ── Benachrichtigungen ──────────────────────────────────────────────────────

describeAccountRoute('GET /api/notifications', () => import('../server/api/notifications/index.get'), {
  globals: coreKit().globals,
})

describe('GET /api/notifications — nur die an das eigene Konto gerichteten', () => {
  it('jede Abfrage filtert auf die Konto-Id der Sitzung, über den Session-Klienten', async () => {
    appwriteFake.reply('session.tablesDB.listRows', () => ({ rows: [], total: 0 }))
    const run = await probeRoute(() => import('../server/api/notifications/index.get'), {
      who: 'stranger',
      query: { recipientId: userIdOf('member') },
      globals: coreKit().globals,
    })
    expect(run.status).toBe(200)
    const reads = appwriteFake.argsOf('session.tablesDB.listRows')
    expect(reads.length).toBeGreaterThan(0)
    for (const read of reads) {
      expect(read.queries).toContain(Query.equal('recipientId', userIdOf('stranger')))
      expect(read.queries).not.toContain(Query.equal('recipientId', userIdOf('member')))
    }
    expect(appwriteFake.used('admin')).toBe(false)
  })
})

// ── Betreiber-Läufe (system.manage) ─────────────────────────────────────────

const OPERATOR_ONLY: RoleExpectation = {
  allow: ['operator'],
  deny: ['owner', 'admin', 'moderator', 'editor', 'member'],
}

describeRoleGatedRoute(
  'POST /api/notifications/run-digest',
  () => import('../server/api/notifications/run-digest.post'),
  OPERATOR_ONLY,
  { globals: { mailerConfigured: async () => true } },
)

describe('POST /api/notifications/run-digest — der Lauf startet nur für den Betreiber', () => {
  const load = () => import('../server/api/notifications/run-digest.post')

  for (const who of ['guest', 'stranger', 'owner', 'admin', 'member'] as const) {
    it(`${who}: kein Lauf`, async () => {
      await probeRoute(load, { who, globals: { mailerConfigured: async () => true } })
      expect(runs.digest).toBe(0)
    })
  }

  it('Betreiber: Lauf gestartet', async () => {
    const run = await probeRoute(load, { who: 'operator', globals: { mailerConfigured: async () => true } })
    expect(run.status).toBe(200)
    expect(runs.digest).toBe(1)
  })

  it('Betreiber, aber kein Mailversand eingerichtet: 503, kein Lauf', async () => {
    const run = await probeRoute(load, { who: 'operator', globals: { mailerConfigured: async () => false } })
    expect(run.status).toBe(503)
    expect(runs.digest).toBe(0)
  })
})

describeRoleGatedRoute(
  'POST /api/platform/entitlements/refresh',
  () => import('../server/api/platform/entitlements/refresh.post'),
  OPERATOR_ONLY,
)

describe('POST /api/platform/entitlements/refresh — der Abgleich startet nur für den Betreiber', () => {
  const load = () => import('../server/api/platform/entitlements/refresh.post')

  for (const who of ['guest', 'stranger', 'owner', 'admin', 'member'] as const) {
    it(`${who}: kein Abgleich`, async () => {
      await probeRoute(load, { who })
      expect(runs.entitlements).toBe(0)
    })
  }

  it('Betreiber: Abgleich gestartet', async () => {
    const run = await probeRoute(load, { who: 'operator' })
    expect(run.status).toBe(200)
    expect(runs.entitlements).toBe(1)
  })
})

// ── Anwesenheit ─────────────────────────────────────────────────────────────

const ONLINE = [{ userId: 'u-online', userName: 'Online', scope: 'global', typing: false }]

function countGlobals(avatarAsks: string[][]) {
  return {
    listOnlinePresences: async () => ONLINE,
    resolveAvatars: async (_event: unknown, ids: string[]) => {
      avatarAsks.push(ids)
      return new Map<string, string>()
    },
  }
}

describe('GET /api/presence/count — öffentlich, Namen nur für Angemeldete', () => {
  const load = () => import('../server/api/presence/count.get')

  it('ohne Konto: nur die Zahl, keine Namen, keine Profilbilder nachgeschlagen', async () => {
    const asks: string[][] = []
    const run = await probeRoute(load, { who: 'guest', globals: countGlobals(asks) })
    expect(run.status).toBe(200)
    expect(run.result).toMatchObject({ count: 1, users: [] })
    expect(asks).toEqual([])
  })

  it('angemeldet: Zahl und Namen', async () => {
    const asks: string[][] = []
    const run = await probeRoute(load, { who: 'member', globals: countGlobals(asks) })
    expect(run.status).toBe(200)
    expect(run.result).toMatchObject({ count: 1, users: [{ userId: 'u-online', userName: 'Online' }] })
  })
})

function heartbeatGlobals(owners: string[]) {
  return {
    ...coreKit().globals,
    tenantRowPermissionsFor: (_tenant: unknown, options: { ownerUserId: string }) => {
      owners.push(options.ownerUserId)
      return []
    },
    warnPresenceScopeMissingOnce: () => {},
  }
}

describeAccountRoute('POST /api/presence/heartbeat', () => import('../server/api/presence/heartbeat.post'), {
  body: { scope: 'global' },
  globals: heartbeatGlobals([]),
})

describe('POST /api/presence/heartbeat — schreibt nur die eigene Anwesenheit', () => {
  const load = () => import('../server/api/presence/heartbeat.post')

  it('Anwesenheits-Id, Konto und Zeilen-Besitz = Konto der Sitzung; eine Id im Body zählt nicht', async () => {
    const owners: string[] = []
    const run = await probeRoute(load, {
      who: 'member',
      body: { scope: 'global', userId: userIdOf('owner'), presenceId: userIdOf('owner') },
      globals: heartbeatGlobals(owners),
    })
    expect(run.status).toBe(200)
    const [upsert] = appwriteFake.argsOf('admin.presences.upsert')
    expect(upsert).toMatchObject({ presenceId: userIdOf('member'), userId: userIdOf('member') })
    expect(owners).toEqual([userIdOf('member')])
  })

  it('ohne Konto: nichts geschrieben', async () => {
    const run = await probeRoute(load, { who: 'guest', body: { scope: 'global' }, globals: heartbeatGlobals([]) })
    expect(run.status).toBe(401)
    expect(appwriteFake.calls).toEqual([])
  })
})

describe('POST /api/presence/leave — entfernt nur die eigene Anwesenheit', () => {
  const load = () => import('../server/api/presence/leave.post')
  const globals = () => ({ ...coreKit().globals, warnPresenceScopeMissingOnce: () => {} })

  it('ohne Konto: ok, aber nichts gelöscht', async () => {
    const run = await probeRoute(load, { who: 'guest', body: { presenceId: userIdOf('member') }, globals: globals() })
    expect(run.status).toBe(200)
    expect(appwriteFake.calls).toEqual([])
  })

  for (const who of ['member', 'stranger'] as const) {
    it(`${who}: löscht die Anwesenheit mit der eigenen Konto-Id`, async () => {
      appwriteFake.reply('admin.presences.get', () => {
        throw Object.assign(new Error('not found'), { code: 404 })
      })
      const run = await probeRoute(load, { who, body: { presenceId: userIdOf('owner') }, globals: globals() })
      expect(run.status).toBe(200)
      expect(appwriteFake.argsOf('admin.presences.delete')).toEqual([{ presenceId: userIdOf(who) }])
    })
  }
})

// ── Statistik-Proxy (öffentlich, Schalter der App) ──────────────────────────

const PLAUSIBLE = 'https://plausible.example.test'

function statsGlobals(enabled: boolean, fetched: Array<{ url: string, headers?: Record<string, string> }>) {
  return coreKit({
    headers: { 'content-type': 'text/plain', 'cookie': 'a_session_probe=probe-sitzung', 'host': 'kunde-a.example.test' },
    globals: {
      requireAnalyticsProxy,
      useAppConfig: () => ({ pukalani: { analytics: { enabled, instance: PLAUSIBLE } } }),
      ANALYTICS_PROXY_TIMEOUT_MS: 5_000,
      trustedClientIp: () => '',
      readRawBody: async () => '{"n":"pageview"}',
      getRequestProtocol: () => 'https',
      createMicrocache: () => ({ get: () => undefined, set: () => {} }),
      fetch: async (url: string, init?: { headers?: Record<string, string> }) => {
        fetched.push({ url, headers: init?.headers })
        return { ok: true, status: 202, text: async () => 'ok' }
      },
    },
  }).globals
}

describe('POST /api/stats-event — der Schalter der App entscheidet, ein Cookie reist nie mit', () => {
  const load = () => import('../server/api/stats-event.post')

  for (const who of ['guest', 'member', 'operator'] as const) {
    it(`${who}, Statistik aus: 404, nichts weitergereicht`, async () => {
      const fetched: Array<{ url: string }> = []
      const run = await probeRoute(load, { who, globals: statsGlobals(false, fetched) })
      expect(run.status).toBe(404)
      expect(fetched).toEqual([])
    })
  }

  for (const who of ['guest', 'member'] as const) {
    it(`${who}, Statistik an: weitergereicht an die Instanz, ohne Cookie`, async () => {
      const fetched: Array<{ url: string, headers?: Record<string, string> }> = []
      const run = await probeRoute(load, { who, globals: statsGlobals(true, fetched) })
      expect(run.status).toBe(200)
      expect(fetched.map(f => f.url)).toEqual([`${PLAUSIBLE}/api/event`])
      expect(Object.keys(fetched[0]?.headers ?? {})).not.toContain('cookie')
    })
  }
})

describe('GET /api/stats-script.js — der Schalter der App und die Form der Id entscheiden', () => {
  const load = () => import('../server/api/stats-script.js.get')
  const id = 'pa-probe12345'

  it('Statistik aus: 404, nichts geholt', async () => {
    const fetched: Array<{ url: string }> = []
    const run = await probeRoute(load, { who: 'guest', query: { id }, globals: statsGlobals(false, fetched) })
    expect(run.status).toBe(404)
    expect(fetched).toEqual([])
  })

  it('Statistik an, Id in falscher Form: 404, nichts geholt', async () => {
    const fetched: Array<{ url: string }> = []
    const run = await probeRoute(load, { who: 'guest', query: { id: '../../admin' }, globals: statsGlobals(true, fetched) })
    expect(run.status).toBe(404)
    expect(fetched).toEqual([])
  })

  for (const who of ['guest', 'member'] as const) {
    it(`${who}, Statistik an, gültige Id: Script von der Instanz`, async () => {
      const fetched: Array<{ url: string }> = []
      const run = await probeRoute(load, { who, query: { id }, globals: statsGlobals(true, fetched) })
      expect(run.status).toBe(200)
      expect(fetched.map(f => f.url)).toEqual([`${PLAUSIBLE}/js/${id}.js`])
    })
  }
})
