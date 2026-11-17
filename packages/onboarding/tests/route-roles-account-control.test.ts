import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  describeAccountRoute,
  probeRoute,
  resetCommunityWorld,
  userIdOf,
  type Who,
} from '../../core/tests/support/participationHarness'
import { controlSeam, PROBE_JWT, type SeamReply } from './support/controlSeam'

/**
 * KONTO-BEREICH, TRICHTER, WECHSEL ZWISCHEN COMMUNITIES UND ÖFFENTLICHE
 * FORMULARE — ROLLEN-TESTS AN DER ECHTEN ROUTE (OPS-009, BT1 b).
 *
 * Diese Routen entscheiden nicht über eine Community-Rolle, sondern über das
 * EIGENE Konto: angemeldet genügt, und was die Route herausgibt oder
 * versiegelt, gehört dieser Person (die Liste „meine Communities" kommt vom
 * Control Plane, ausgewiesen allein durch das JWT). Zwei Routen sind bewusst
 * öffentlich (Missbrauch melden, Zugang anfragen) — dort ist die Frage, dass
 * ein Gast durchkommt und der Honeypot nichts weiterreicht.
 *
 * Echter Handler, echte Hilfen (`communityHandoff.ts`, Versiegeln), echte
 * Schemas; nachgebildet ist die Naht zum Control Plane und die Laufzeit-Config.
 */

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

/** Session-Cookie und Laufzeit-Config für das Versiegeln eines Übergabe-Tokens. */
function handoffGlobals(cookie: string | null = 'probe-sitzung') {
  return {
    getCookie: () => cookie ?? undefined,
    useRuntimeConfig: () => ({
      appwriteKey: 'probe-schluessel',
      public: { appwriteProjectId: 'pool', tenancy: { controlHosts: 'account.example.test', wizardHosts: '' } },
    }),
  }
}

const mine = (communities: Array<{ communityId: string, host: string, role: string }>): SeamReply =>
  path => (path === '/api/control/community/mine' ? { communities } : {})

// ── Konto-Bereich auf dem Kontroll-Host ─────────────────────────────────────

function activityGlobals(asked: string[]) {
  return {
    listAccountActivityContributors: () => [{
      id: 'probe',
      listAccountActivity: async (_event: unknown, userId: string) => {
        asked.push(userId)
        return []
      },
    }],
    listAccountEvents: async (_event: unknown, userId: string) => {
      asked.push(`events:${userId}`)
      return { events: [], truncated: false }
    },
    resolveCommunityHosts: async () => new Map<string, string>(),
  }
}

describeAccountRoute(
  'GET /api/account/activity',
  () => import('../server/api/account/activity.get'),
  { mode: 'control', globals: activityGlobals([]) },
)

describe('GET /api/account/activity — nur das eigene Konto, nur auf dem Kontroll-Host', () => {
  const load = () => import('../server/api/account/activity.get')

  it('fragt jede Quelle mit der EIGENEN Konto-Id', async () => {
    const asked: string[] = []
    const run = await probeRoute(load, { who: 'member', mode: 'control', globals: activityGlobals(asked) })
    expect(run.status).toBe(200)
    expect(asked.sort()).toEqual([`events:${userIdOf('member')}`, userIdOf('member')].sort())
  })

  it('auf einem Community-Host: 404, keine Quelle gefragt', async () => {
    const asked: string[] = []
    const run = await probeRoute(load, { who: 'member', globals: activityGlobals(asked) })
    expect(run.status).toBe(404)
    expect(asked).toEqual([])
  })
})

const CONTROL_HOST_SEAM_ROUTES = [
  {
    name: 'GET /api/onboarding/communities',
    load: () => import('../server/api/onboarding/communities.get'),
    path: '/api/control/community/mine',
    reply: (() => ({ communities: [] })) as SeamReply,
  },
  {
    name: 'GET /api/onboarding/trial',
    load: () => import('../server/api/onboarding/trial.get'),
    path: '/api/control/onboarding/trial',
    reply: (() => ({ available: true })) as SeamReply,
  },
]

for (const route of CONTROL_HOST_SEAM_ROUTES) {
  describeAccountRoute(route.name, route.load, { mode: 'control', globals: controlSeam(route.reply).globals })

  describe(`${route.name} — wer fragt, sagt allein das JWT`, () => {
    it('Ruf nur mit dem JWT, keine Konto-Id aus der Anfrage', async () => {
      const seam = controlSeam(route.reply)
      const run = await probeRoute(route.load, { who: 'stranger', mode: 'control', globals: seam.globals })
      expect(run.status).toBe(200)
      expect(seam.calls).toEqual([{ path: route.path, body: { jwt: PROBE_JWT } }])
    })

    it('ohne Konto: kein JWT, kein Ruf', async () => {
      const seam = controlSeam(route.reply)
      await probeRoute(route.load, { who: 'guest', mode: 'control', globals: seam.globals })
      expect(seam.jwtsMinted()).toBe(0)
      expect(seam.calls).toEqual([])
    })

    it('auf einem Community-Host: 404, kein Ruf', async () => {
      const seam = controlSeam(route.reply)
      const run = await probeRoute(route.load, { who: 'member', globals: seam.globals })
      expect(run.status).toBe(404)
      expect(seam.calls).toEqual([])
    })
  })
}

// ── Trichter: Vorprüfung ────────────────────────────────────────────────────

describeAccountRoute(
  'POST /api/onboarding/precheck',
  () => import('../server/api/onboarding/precheck.post'),
  { mode: 'control', body: { slug: 'probe-verein' }, globals: controlSeam(() => ({ slugAvailable: true })).globals },
)

describe('POST /api/onboarding/precheck — die Adresse kommt aus der Sitzung', () => {
  it('E-Mail und Bestätigung stammen vom angemeldeten Konto, nicht aus dem Body', async () => {
    const seam = controlSeam(() => ({ slugAvailable: true }))
    const run = await probeRoute(() => import('../server/api/onboarding/precheck.post'), {
      who: 'stranger',
      mode: 'control',
      body: { slug: 'probe-verein' },
      userFields: { email: 'sitzung@example.test', emailVerification: false },
      globals: seam.globals,
    })
    expect(run.status).toBe(200)
    expect(seam.calls).toEqual([{
      path: '/api/control/onboarding/precheck',
      body: { slug: 'probe-verein', email: 'sitzung@example.test', emailVerified: false },
    }])
  })

  it('eine Adresse im Body wird abgelehnt (strenges Schema), kein Ruf', async () => {
    const seam = controlSeam()
    const run = await probeRoute(() => import('../server/api/onboarding/precheck.post'), {
      who: 'stranger',
      mode: 'control',
      body: { slug: 'probe-verein', email: 'fremd@example.test' },
      globals: seam.globals,
    })
    expect(run.status).not.toBe(200)
    expect(seam.calls).toEqual([])
  })
})

// ── Übergabe in eine Community (versiegeltes Token) ─────────────────────────

describeAccountRoute(
  'POST /api/onboarding/handoff',
  () => import('../server/api/onboarding/handoff.post'),
  {
    mode: 'control',
    body: { communityId: 'c-x' },
    globals: { ...controlSeam(mine([{ communityId: 'c-x', host: 'x.example.test', role: 'viewer' }])).globals, ...handoffGlobals() },
  },
)

describe('POST /api/onboarding/handoff — nur in eigene Communities', () => {
  const load = () => import('../server/api/onboarding/handoff.post')
  const list = mine([{ communityId: 'c-x', host: 'x.example.test', role: 'viewer' }])

  it('eigene Community: Token für ihren Host', async () => {
    const run = await probeRoute(load, { who: 'member', mode: 'control', body: { communityId: 'c-x' }, globals: { ...controlSeam(list).globals, ...handoffGlobals() } })
    expect(run.status).toBe(200)
  })

  it('fremde Community: 403', async () => {
    const run = await probeRoute(load, { who: 'member', mode: 'control', body: { communityId: 'c-fremd' }, globals: { ...controlSeam(list).globals, ...handoffGlobals() } })
    expect(run.status).toBe(403)
  })

  it('ohne Session-Cookie: 401, kein Ruf', async () => {
    const seam = controlSeam(list)
    const run = await probeRoute(load, { who: 'member', mode: 'control', body: { communityId: 'c-x' }, globals: { ...seam.globals, ...handoffGlobals(null) } })
    expect(run.status).toBe(401)
    expect(seam.calls).toEqual([])
  })
})

// ── Wechsel zwischen Communities (auf dem Mandanten-Host) ───────────────────

const SWITCH_LIST = mine([
  { communityId: 'c-team', host: 'team.example.test', role: 'admin' },
  { communityId: 'c-leser', host: 'leser.example.test', role: 'viewer' },
])

describeAccountRoute(
  'POST /api/community/switch',
  () => import('../server/api/community/switch.post'),
  { body: { communityId: 'c-team' }, globals: { ...controlSeam(SWITCH_LIST).globals, ...handoffGlobals() } },
)

describe('POST /api/community/switch — nur in Communities mit Team-Rolle', () => {
  const load = () => import('../server/api/community/switch.post')
  const run = (who: Who, communityId: string, mode?: 'silo') =>
    probeRoute(load, { who, mode, body: { communityId }, globals: { ...controlSeam(SWITCH_LIST).globals, ...handoffGlobals() } })

  it('Team-Rolle (admin) dort: Token', async () => {
    expect((await run('member', 'c-team')).status).toBe(200)
  })

  it('nur Leser dort: 403', async () => {
    expect((await run('member', 'c-leser')).status).toBe(403)
  })

  it('nicht in der eigenen Liste: 403', async () => {
    expect((await run('owner', 'c-fremd')).status).toBe(403)
  })

  it('ohne Pool-Mandanten: 404', async () => {
    expect((await run('member', 'c-team', 'silo')).status).toBe(404)
  })
})

describeAccountRoute(
  'GET /api/community/switcher',
  () => import('../server/api/community/switcher.get'),
  { globals: controlSeam(SWITCH_LIST).globals },
)

describe('GET /api/community/switcher — die Liste kommt allein über das JWT', () => {
  it('Ruf nur mit dem JWT; ohne Pool-Mandanten 404', async () => {
    const seam = controlSeam(SWITCH_LIST)
    const run = await probeRoute(() => import('../server/api/community/switcher.get'), { who: 'member', globals: seam.globals })
    expect(run.status).toBe(200)
    expect(seam.calls).toEqual([{ path: '/api/control/community/mine', body: { jwt: PROBE_JWT } }])

    const silo = await probeRoute(() => import('../server/api/community/switcher.get'), { who: 'member', mode: 'silo', globals: controlSeam(SWITCH_LIST).globals })
    expect(silo.status).toBe(404)
  })
})

// ── Rückweg zum Kontroll-Host ───────────────────────────────────────────────

describeAccountRoute(
  'POST /api/community/control-handoff',
  () => import('../server/api/community/control-handoff.post'),
  { body: { target: 'manage' }, globals: handoffGlobals() },
)

describe('POST /api/community/control-handoff', () => {
  const load = () => import('../server/api/community/control-handoff.post')

  it('Ziel ist der konfigurierte Kontroll-Host, nie ein Wert aus der Anfrage', async () => {
    const run = await probeRoute(load, { who: 'member', body: { target: 'manage' }, globals: handoffGlobals() })
    expect(run.status).toBe(200)
    const foreign = await probeRoute(load, { who: 'member', body: { target: 'manage', host: 'boese.example.test' }, globals: handoffGlobals() })
    expect(foreign.status).not.toBe(200)
  })

  it('ohne Session-Cookie: 401', async () => {
    const run = await probeRoute(load, { who: 'member', body: { target: 'manage' }, globals: handoffGlobals(null) })
    expect(run.status).toBe(401)
  })

  it('ohne Pool-Mandanten: 404', async () => {
    const run = await probeRoute(load, { who: 'member', mode: 'silo', body: { target: 'manage' }, globals: handoffGlobals() })
    expect(run.status).toBe(404)
  })
})

// ── Öffentliche Formulare: ein Gast kommt durch, der Honeypot nicht ─────────

const PUBLIC_FORMS = [
  {
    name: 'POST /api/abuse/report',
    load: () => import('../server/api/abuse/report.post'),
    path: '/api/control/abuse-reports',
    body: { host: 'kunde-a.example.test', category: 'spam', message: 'Hier wird massenhaft geworben.' },
  },
  {
    name: 'POST /api/onboarding/request',
    load: () => import('../server/api/onboarding/request.post'),
    path: '/api/control/onboarding/request',
    body: { email: 'anfrage@example.test' },
  },
]

for (const form of PUBLIC_FORMS) {
  describe(`${form.name} (öffentlich, ohne Konto)`, () => {
    for (const who of ['guest', 'stranger', 'member'] as const) {
      it(`${who}: 200, ein Ruf ohne JWT`, async () => {
        const seam = controlSeam()
        const run = await probeRoute(form.load, { who, mode: 'control', body: form.body, globals: seam.globals })
        expect(run.status).toBe(200)
        expect(seam.calls.map(call => call.path)).toEqual([form.path])
        expect(seam.jwtsMinted()).toBe(0)
      })
    }

    it('Honeypot gefüllt: 200, aber kein Ruf', async () => {
      const seam = controlSeam()
      const run = await probeRoute(form.load, { who: 'guest', mode: 'control', body: { ...form.body, website: 'x' }, globals: seam.globals })
      expect(run.status).toBe(200)
      expect(seam.calls).toEqual([])
    })

    it('unbekanntes Feld: abgelehnt, kein Ruf', async () => {
      const seam = controlSeam()
      const run = await probeRoute(form.load, { who: 'guest', mode: 'control', body: { ...form.body, communityId: 'c-a' }, globals: seam.globals })
      expect(run.status).not.toBe(200)
      expect(seam.calls).toEqual([])
    })
  })
}
