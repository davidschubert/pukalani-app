import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeRoute, resetCommunityWorld, userIdOf } from '../../core/tests/support/participationHarness'
import { configureSiteCard, deriveSiteCardKey, sealSiteCard } from '../../core/server/utils/siteCard'
import { deriveHandoffKey, openHandoff } from '../../core/server/utils/embedHandoff'
import { controlSeam, type SeamReply } from './support/controlSeam'

/**
 * SIEGEL FÜR DEN SPRUNG AUF EINEN ANDEREN HOST MIT EINTRITTSKARTE (PK1 E1b).
 *
 * Bei `write` trägt das Siegel neben dem Geheimnis Konto, Sitzung und
 * ursprüngliche Anmeldung — aus der Karte der Quelle; bei Klartext nur das
 * Konto. Bei `off` bleibt es das Siegel von vor E1b (nur das Geheimnis).
 * Echte Routen, echte Siegel; nachgebildet ist die Naht zum Control Plane.
 */

const CONTROL_HOST = 'account.example.test'
const SERVER_KEY = 'probe-schluessel'
const ORIGINAL_AUTH = Date.parse('2026-11-01T10:00:00.000Z')
const rawCardKey = randomBytes(32)

afterEach(() => {
  configureSiteCard(undefined)
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

function globals(cookie: string) {
  return {
    getCookie: () => cookie,
    getHeader: (_event: unknown, name: string) => (name.toLowerCase() === 'host' ? CONTROL_HOST : undefined),
    useRuntimeConfig: () => ({
      appwriteKey: SERVER_KEY,
      public: { appwriteProjectId: 'pool', tenancy: { controlHosts: CONTROL_HOST, wizardHosts: '' } },
    }),
  }
}

/** Karte des Kontroll-Hosts (kein Mandant ⇒ leere Community). */
function controlCard(): string {
  return sealSiteCard({
    secret: 'kontroll-sitzung',
    sessionId: 's-control',
    userId: userIdOf('member'),
    host: CONTROL_HOST,
    communityId: '',
    expiresAt: Date.now() + 60 * 60 * 1000,
    authAt: ORIGINAL_AUTH,
    own: true,
  }, { key: deriveSiteCardKey(rawCardKey), cookieName: 'a_session_pool' })
}

const mine = (communities: Array<{ communityId: string, host: string, role: string }>): SeamReply =>
  path => (path === '/api/control/community/mine' ? { communities } : {})

describe('POST /api/onboarding/handoff — Siegel trägt die Angaben der Karte', () => {
  const load = () => import('../server/api/onboarding/handoff.post')
  const list = mine([{ communityId: 'c-x', host: 'x.example.test', role: 'viewer' }])
  const open = (token: string) => openHandoff(token, deriveHandoffKey(SERVER_KEY), 'x.example.test')

  it('write mit Karte: Konto, Sitzung und ursprüngliche Anmeldung reisen mit', async () => {
    configureSiteCard({ mode: 'write', key: rawCardKey.toString('base64') })
    const run = await probeRoute(load, { who: 'member', mode: 'control', body: { communityId: 'c-x' }, globals: { ...controlSeam(list).globals, ...globals(controlCard()) } })
    expect(run.status).toBe(200)
    expect(open((run.result as { token: string }).token)).toEqual({
      secret: 'kontroll-sitzung',
      userId: userIdOf('member'),
      sessionId: 's-control',
      authAt: ORIGINAL_AUTH,
      nonce: expect.any(String),
    })
  })

  it('write mit Klartext auf dem Kontroll-Host: Geheimnis und Konto', async () => {
    configureSiteCard({ mode: 'write', key: rawCardKey.toString('base64') })
    const run = await probeRoute(load, { who: 'member', mode: 'control', body: { communityId: 'c-x' }, globals: { ...controlSeam(list).globals, ...globals('klartext-sitzung') } })
    expect(open((run.result as { token: string }).token)).toEqual({ secret: 'klartext-sitzung', userId: userIdOf('member'), nonce: expect.any(String) })
  })

  it('off: Siegel wie vor E1b, nur das Geheimnis', async () => {
    const run = await probeRoute(load, { who: 'member', mode: 'control', body: { communityId: 'c-x' }, globals: { ...controlSeam(list).globals, ...globals('klartext-sitzung') } })
    expect(open((run.result as { token: string }).token)).toEqual({ secret: 'klartext-sitzung' })
  })
})

describe('POST /api/community/control-handoff — Klartext-Quelle im Modus write', () => {
  const load = () => import('../server/api/community/control-handoff.post')

  it('Siegel für den Kontroll-Host trägt Geheimnis und Konto', async () => {
    configureSiteCard({ mode: 'write', key: rawCardKey.toString('base64') })
    const run = await probeRoute(load, {
      who: 'member',
      body: { target: 'manage' },
      tenantFields: { pukalaniHost: CONTROL_HOST },
      globals: { ...globals('klartext-sitzung'), getHeader: () => CONTROL_HOST },
    })
    expect(run.status).toBe(200)
    const { token } = run.result as { token: string }
    expect(openHandoff(token, deriveHandoffKey(SERVER_KEY), CONTROL_HOST)).toEqual({ secret: 'klartext-sitzung', userId: userIdOf('member'), nonce: expect.any(String) })
  })
})

// ── Kein Siegel auf einer eigenen Domain (Modus write) ──────────────────────

describe('Sprung-Siegel auf einer eigenen Domain einer Community: 404', () => {
  const POOL_HOST = 'c-a.pukalani.app'
  const CUSTOM_HOST = 'forum.kunde.example'
  const LIST = mine([{ communityId: 'c-team', host: 'team.example.test', role: 'admin' }])

  /** Anfrage auf `host`; die Community des Mandanten heißt `POOL_HOST`. */
  function onHost(host: string, cookie = 'klartext-sitzung') {
    return { ...globals(cookie), getHeader: (_event: unknown, name: string) => (name.toLowerCase() === 'host' ? host : undefined) }
  }

  const ROUTES = [
    ['POST /api/community/switch', () => import('../server/api/community/switch.post'), { communityId: 'c-team' }],
    ['POST /api/community/control-handoff', () => import('../server/api/community/control-handoff.post'), { target: 'manage' }],
    ['POST /api/onboarding/handoff', () => import('../server/api/onboarding/handoff.post'), { communityId: 'c-team' }],
  ] as const

  for (const [name, load, body] of ROUTES) {
    it(`${name}: write auf der eigenen Domain ⇒ 404, kein Ruf ins Control Plane`, async () => {
      configureSiteCard({ mode: 'write', key: rawCardKey.toString('base64') })
      const seam = controlSeam(LIST)
      const run = await probeRoute(load, { who: 'member', body, tenantFields: { pukalaniHost: POOL_HOST }, globals: { ...seam.globals, ...onHost(CUSTOM_HOST) } })
      expect(run.status).toBe(404)
      expect(seam.calls).toEqual([])
    })

    it(`${name}: write auf der Pukalani-Adresse ⇒ Siegel wie bisher (Gegenprobe)`, async () => {
      configureSiteCard({ mode: 'write', key: rawCardKey.toString('base64') })
      const run = await probeRoute(load, { who: 'member', body, tenantFields: { pukalaniHost: POOL_HOST }, globals: { ...controlSeam(LIST).globals, ...onHost(POOL_HOST) } })
      expect(run.status).toBe(200)
      expect(typeof (run.result as { token?: unknown }).token).toBe('string')
    })

    it(`${name}: read auf der eigenen Domain ⇒ wie heute (Siegel)`, async () => {
      configureSiteCard({ mode: 'read', key: rawCardKey.toString('base64') })
      const run = await probeRoute(load, { who: 'member', body, tenantFields: { pukalaniHost: POOL_HOST }, globals: { ...controlSeam(LIST).globals, ...onHost(CUSTOM_HOST) } })
      expect(run.status).toBe(200)
    })
  }
})
