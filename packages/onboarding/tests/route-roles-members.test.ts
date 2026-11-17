import { afterEach, describe, expect, it, vi } from 'vitest'
import { removedApiAllowed } from '../../core/shared/communityRemoval'
import {
  COMMUNITY_ID,
  describeAccountRoute,
  probeRoute,
  resetCommunityWorld,
  type RoleWho,
} from '../../core/tests/support/participationHarness'
import { controlSeam, describeControlGate, describeRoleGateToEffect, PROBE_JWT, type SeamReply } from './support/controlSeam'

/**
 * MITGLIEDER, EINLADUNGEN, TEAM — ROLLEN-TESTS AN DER ECHTEN ROUTE (OPS-009, BT1 b).
 *
 * Echter Handler, echte Core-Wachen; nachgebildet sind die Naht zum Control
 * Plane (`support/controlSeam.ts`), der Admin-Client und der Abgleich-Lauf.
 *
 * Ausgeschrieben aus der Rechte-Matrix (`core/shared/communityAuthz.ts`):
 *  - `team.manage`: Owner und Admin (dazu der Betreiber im Not-Zugang).
 *  - `community.transfer`: NUR der Owner (dazu der Betreiber).
 *  - `members.invite`: JEDE Rolle bis hinunter zum Mitglied — das Wachstum
 *    einer Community soll nicht am Owner hängen (F57). Wer KEINE Rolle hat
 *    (fremdes Konto), bleibt draußen.
 *  - `system.manage` (Instanz-Recht): NUR der Betreiber.
 */

const reconcile = vi.hoisted(() => ({ runs: 0 }))
vi.mock('../server/utils/labelReconcile', () => ({
  labelReconcileAvailable: () => true,
  labelReconcileMode: () => 'dry-run',
  runLabelReconcile: async () => {
    reconcile.runs += 1
    return { mode: 'dry-run', candidates: 0 }
  },
}))

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

const TEAM_MANAGE = {
  allow: ['owner', 'admin', 'operator'],
  deny: ['moderator', 'editor', 'member'],
} as const

const OWNER_ONLY = {
  allow: ['owner', 'operator'],
  deny: ['admin', 'moderator', 'editor', 'member'],
} as const

const OPERATOR_ONLY = {
  allow: ['operator'],
  deny: ['owner', 'admin', 'moderator', 'editor', 'member'],
} as const

/** Der Admin-Client ist hier eine leere Nutzerliste. */
const NO_USERS = {
  createAdminClient: () => ({ users: { list: async () => ({ users: [] }), get: async () => ({ prefs: {} }) } }),
  accountHandlesForUsers: async () => new Map<string, string>(),
}

const roster: SeamReply = () => ({
  members: [{ runtimeUserId: 'u-target', role: 'viewer', joinedAt: '2026-11-01T00:00:00.000Z' }],
})

// ── Team verwalten (team.manage) ────────────────────────────────────────────

describeControlGate(
  'GET /api/community/members',
  () => import('../server/api/community/members/index.get'),
  TEAM_MANAGE,
  '/api/control/community/members/list',
  { reply: () => ({ members: [] }), globals: NO_USERS },
)

describeControlGate(
  'PATCH /api/community/members/:id',
  () => import('../server/api/community/members/[id].patch'),
  TEAM_MANAGE,
  '/api/control/community/members/role',
  { params: { id: 'm-1' }, body: { role: 'editor' } },
)

describeControlGate(
  'DELETE /api/community/invites/:id',
  () => import('../server/api/community/invites/[id].delete'),
  TEAM_MANAGE,
  '/api/control/community/invites/revoke',
  { params: { id: 'inv-1' } },
)

// ── Besitz übertragen (community.transfer + frische Anmeldung) ──────────────

describeControlGate(
  'POST /api/community/members/:id/transfer',
  () => import('../server/api/community/members/[id]/transfer.post'),
  OWNER_ONLY,
  '/api/control/community/members/transfer',
  { params: { id: 'm-1' }, globals: { requireRecentAuth: async () => {} } },
)

describe('POST /api/community/members/:id/transfer — frische Anmeldung', () => {
  it('Owner ohne frische Anmeldung: abgelehnt, kein Ruf ins Control Plane', async () => {
    const seam = controlSeam()
    const run = await probeRoute(() => import('../server/api/community/members/[id]/transfer.post'), {
      who: 'owner',
      params: { id: 'm-1' },
      globals: {
        ...seam.globals,
        requireRecentAuth: async () => {
          throw Object.assign(new Error('recent'), { status: 403, data: { code: 'recent_auth_required' } })
        },
      },
    })
    expect(run.status).toBe(403)
    expect(seam.calls).toEqual([])
  })

  it('Admin: 403 vor der Frage nach der Anmeldung', async () => {
    let asked = 0
    const run = await probeRoute(() => import('../server/api/community/members/[id]/transfer.post'), {
      who: 'admin',
      params: { id: 'm-1' },
      globals: { ...controlSeam().globals, requireRecentAuth: async () => { asked += 1 } },
    })
    expect(run.status).toBe(403)
    expect(asked).toBe(0)
  })
})

// ── Einladen (members.invite): jede Rolle, aber kein fremdes Konto ──────────

const INVITE_ROUTES = [
  {
    name: 'GET /api/community/invites/quota',
    load: () => import('../server/api/community/invites/quota.get'),
    path: '/api/control/community/invites/quota',
    apiPath: '/api/community/invites/quota',
    params: {},
    reply: (() => ({ limit: 5, used: 0 })) as SeamReply,
  },
  {
    name: 'GET /api/community/members/map',
    load: () => import('../server/api/community/members/map.get'),
    path: '/api/control/community/members/roster',
    apiPath: '/api/community/members/map',
    params: {},
    reply: roster,
  },
  {
    name: 'GET /api/community/members/:id/profile',
    load: () => import('../server/api/community/members/[id]/profile.get'),
    path: '/api/control/community/members/roster',
    apiPath: '/api/community/members/u-target/profile',
    params: { id: 'u-target' },
    reply: roster,
  },
]

const INVITE_ALLOW: readonly RoleWho[] = ['owner', 'admin', 'moderator', 'editor', 'member', 'operator']

for (const route of INVITE_ROUTES) {
  describe(`${route.name} (members.invite)`, () => {
    const run = async (who: Parameters<typeof probeRoute>[1]['who'], registration?: 'open' | 'closed') => {
      const seam = controlSeam(route.reply)
      const result = await probeRoute(route.load, {
        who,
        registration,
        params: route.params,
        globals: { ...seam.globals, ...NO_USERS },
      })
      return { ...result, calls: seam.calls }
    }

    it('ohne Konto: 401, kein Ruf', async () => {
      const result = await run('guest')
      expect(result.status).toBe(401)
      expect(result.calls).toEqual([])
    })

    it('fremdes Konto: 403, kein Ruf — auch bei offener Registrierung (Lesen ist kein Beitritt)', async () => {
      for (const registration of ['closed', 'open'] as const) {
        const result = await run('stranger', registration)
        expect(result.status).toBe(403)
        expect(result.guardPassed).toBe(false)
        expect(result.calls).toEqual([])
        expect(result.joinHandlerCalls).toBe(0)
      }
    })

    for (const who of INVITE_ALLOW) {
      it(`${who}: 200, Ruf mit JWT und der Community des Hosts`, async () => {
        const result = await run(who)
        expect(result.error).toBeUndefined()
        expect(result.status).toBe(200)
        expect(result.calls[0]?.path).toBe(route.path)
        expect(result.calls[0]?.body).toMatchObject({ jwt: PROBE_JWT, communityId: COMMUNITY_ID })
      })
    }

    it('entferntes Konto: die Sperre davor (Middleware 06) lässt diesen Pfad nicht durch', async () => {
      vi.stubGlobal('defineAppConfig', (config: unknown) => config)
      const appConfig = (await import('../app/app.config')).default as {
        pukalani: { community: { removedAllowedApi: string[] } }
      }
      expect(removedApiAllowed(route.apiPath, appConfig.pukalani.community.removedAllowedApi)).toBe(false)
    })

    it('Silo: 404, kein Ruf', async () => {
      const seam = controlSeam(route.reply)
      const result = await probeRoute(route.load, { who: 'operator', mode: 'silo', params: route.params, globals: seam.globals })
      expect(result.status).toBe(404)
      expect(seam.calls).toEqual([])
    })
  })
}

describe('GET /api/community/members/:id/profile — nur Personen aus der Liste dieser Community', () => {
  it('Ziel nicht in der Liste: 404, kein Admin-Client', async () => {
    let adminOpened = 0
    const run = await probeRoute(() => import('../server/api/community/members/[id]/profile.get'), {
      who: 'member',
      params: { id: 'u-elsewhere' },
      globals: {
        ...controlSeam(roster).globals,
        ...NO_USERS,
        createAdminClient: () => {
          adminOpened += 1
          return NO_USERS.createAdminClient()
        },
      },
    })
    expect(run.status).toBe(404)
    expect(adminOpened).toBe(0)
  })
})

// ── Eigene Einladungen und Annahme (eigenes Konto, Rückweg für Entfernte) ───

describeAccountRoute(
  'GET /api/community/invites/mine',
  () => import('../server/api/community/invites/mine.get'),
  { globals: controlSeam(() => ({ invites: [], siteName: '' })).globals },
)

const acceptReply = (communityId: string): SeamReply => () => ({
  ok: true,
  communityId,
  host: 'kunde-a.example.test',
  role: 'viewer',
  invitedBy: '',
})

const ACCEPT_GLOBALS = {
  forgetCommunityAccessDecision: () => {},
  rememberCommunityAccessRestored: () => {},
  recordUserCounterEvents: async () => {},
  recordCommunityInviter: async () => {},
}

describeAccountRoute(
  'POST /api/community/members/accept',
  () => import('../server/api/community/members/accept.post'),
  { body: { inviteId: 'inv-1' }, globals: { ...controlSeam(acceptReply(COMMUNITY_ID)).globals, ...ACCEPT_GLOBALS } },
)

describe('Rückweg per Einladung: wer handelt, sagt allein das JWT', () => {
  it('invites/mine: Ruf mit JWT und der Community des Hosts, keine Konto-Id aus der Anfrage', async () => {
    const seam = controlSeam(() => ({ invites: [], siteName: '' }))
    const run = await probeRoute(() => import('../server/api/community/invites/mine.get'), { who: 'stranger', globals: seam.globals })
    expect(run.status).toBe(200)
    expect(seam.calls).toEqual([{ path: '/api/control/community/invites/mine', body: { jwt: PROBE_JWT, communityId: COMMUNITY_ID } }])
  })

  it('invites/mine: entferntes Konto kommt durch (Erlaubnisliste) — der Rückweg', async () => {
    const seam = controlSeam(() => ({ invites: [], siteName: '' }))
    const run = await probeRoute(() => import('../server/api/community/invites/mine.get'), { who: 'removed', globals: seam.globals })
    expect(run.status).toBe(200)
    expect(seam.calls).toHaveLength(1)
  })

  it('accept: entferntes Konto nimmt an, das Label kommt zurück', async () => {
    const seam = controlSeam(acceptReply(COMMUNITY_ID))
    let granted = 0
    const run = await probeRoute(() => import('../server/api/community/members/accept.post'), {
      who: 'removed',
      body: { inviteId: 'inv-1' },
      globals: { ...seam.globals, ...ACCEPT_GLOBALS, grantCommunityLabel: async () => { granted += 1 } },
    })
    expect(run.status).toBe(200)
    expect(seam.calls[0]).toEqual({ path: '/api/control/community/members/accept', body: { jwt: PROBE_JWT, inviteId: 'inv-1' } })
    expect(granted).toBe(1)
  })

  it('accept: sagt das Control Plane eine ANDERE Community, gibt es hier kein Label', async () => {
    let granted = 0
    const run = await probeRoute(() => import('../server/api/community/members/accept.post'), {
      who: 'stranger',
      body: { inviteId: 'inv-1' },
      globals: { ...controlSeam(acceptReply('c-andere')).globals, ...ACCEPT_GLOBALS, grantCommunityLabel: async () => { granted += 1 } },
    })
    expect(run.status).toBe(200)
    expect(granted).toBe(0)
  })

  it('accept: weder Token noch Einladung ⇒ abgelehnt, kein Ruf', async () => {
    const seam = controlSeam(acceptReply(COMMUNITY_ID))
    const run = await probeRoute(() => import('../server/api/community/members/accept.post'), {
      who: 'stranger',
      body: {},
      globals: { ...seam.globals, ...ACCEPT_GLOBALS },
    })
    expect(run.status).not.toBe(200)
    expect(seam.calls).toEqual([])
  })

  it('beide Routen ohne Pool-Mandanten: 404, kein Ruf', async () => {
    for (const load of [
      () => import('../server/api/community/invites/mine.get'),
      () => import('../server/api/community/members/accept.post'),
    ]) {
      const seam = controlSeam()
      const run = await probeRoute(load, { who: 'member', mode: 'silo', body: { inviteId: 'inv-1' }, globals: { ...seam.globals, ...ACCEPT_GLOBALS } })
      expect(run.status).toBe(404)
      expect(seam.calls).toEqual([])
    }
  })
})

// ── Einladungs-Vorschau: der Token ist der Ausweis, nicht das Konto ─────────

describe('POST /api/community/invites/preview (Token statt Konto)', () => {
  const load = () => import('../server/api/community/invites/preview.post')
  const TOKEN = 'a'.repeat(64)

  it('Gast mit Token: Ruf mit Token und der Community des Hosts', async () => {
    const seam = controlSeam(() => ({ ok: true, email: 'p@example.test', role: 'viewer' }))
    const run = await probeRoute(load, { who: 'guest', body: { token: TOKEN }, globals: seam.globals })
    expect(run.status).toBe(200)
    expect(seam.calls).toEqual([{ path: '/api/control/community/invites/preview', body: { token: TOKEN, communityId: COMMUNITY_ID } }])
    expect(seam.jwtsMinted()).toBe(0)
  })

  it('Token, den das Control Plane nicht kennt: 404', async () => {
    const seam = controlSeam(() => {
      throw Object.assign(new Error('nf'), { status: 404 })
    })
    const run = await probeRoute(load, { who: 'guest', body: { token: TOKEN }, globals: seam.globals })
    expect(run.status).toBe(404)
  })

  it('Token in falscher Form: abgelehnt, kein Ruf', async () => {
    const seam = controlSeam()
    const run = await probeRoute(load, { who: 'guest', body: { token: 'kurz' }, globals: seam.globals })
    expect(run.status).not.toBe(200)
    expect(seam.calls).toEqual([])
  })

  it('ohne Mandanten (Silo): 404, kein Ruf', async () => {
    const seam = controlSeam()
    const run = await probeRoute(load, { who: 'guest', mode: 'silo', body: { token: TOKEN }, globals: seam.globals })
    expect(run.status).toBe(404)
    expect(seam.calls).toEqual([])
  })
})

// ── Öffentliches Team („wer ist hier ansprechbar?") ─────────────────────────

describe('GET /api/community/team (Publikum entscheidet)', () => {
  const load = () => import('../server/api/community/team.get')
  const probe = async (who: Parameters<typeof probeRoute>[1]['who'], audience: 'public' | 'members', mode?: 'silo') => {
    const seam = controlSeam(() => ({ members: [] }))
    const run = await probeRoute(load, { who, mode, tenantFields: { audience }, globals: { ...seam.globals, ...NO_USERS } })
    return { ...run, calls: seam.calls }
  }

  it('öffentliche Community, Gast: 200 — Ruf ohne JWT, mit Community und Projekt des Hosts', async () => {
    const run = await probe('guest', 'public')
    expect(run.status).toBe(200)
    expect(run.calls).toEqual([{ path: '/api/control/community/team', body: { communityId: COMMUNITY_ID, runtimeProjectId: 'pool' } }])
  })

  it('geschlossene Community, Gast: 404, kein Ruf', async () => {
    const run = await probe('guest', 'members')
    expect(run.status).toBe(404)
    expect(run.calls).toEqual([])
  })

  for (const who of ['member', 'owner', 'stranger'] as const) {
    it(`geschlossene Community, angemeldet (${who}): 200 — bewusst ohne Mitgliedschaftsprüfung`, async () => {
      const run = await probe(who, 'members')
      expect(run.status).toBe(200)
      expect(run.calls).toHaveLength(1)
    })
  }

  it('ohne Mandanten (Silo): 404, kein Ruf', async () => {
    const run = await probe('member', 'public', 'silo')
    expect(run.status).toBe(404)
    expect(run.calls).toEqual([])
  })
})

// ── Label-Abgleich von Hand (Betreiber) ─────────────────────────────────────

describeRoleGateToEffect(
  'POST /api/community/members/run-label-reconcile',
  () => import('../server/api/community/members/run-label-reconcile.post'),
  OPERATOR_ONLY,
  () => {
    const before = reconcile.runs
    return { globals: {}, reached: () => reconcile.runs > before }
  },
)
