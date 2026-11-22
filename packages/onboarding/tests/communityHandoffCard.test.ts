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
    })
  })

  it('write mit Klartext auf dem Kontroll-Host: Geheimnis und Konto', async () => {
    configureSiteCard({ mode: 'write', key: rawCardKey.toString('base64') })
    const run = await probeRoute(load, { who: 'member', mode: 'control', body: { communityId: 'c-x' }, globals: { ...controlSeam(list).globals, ...globals('klartext-sitzung') } })
    expect(open((run.result as { token: string }).token)).toEqual({ secret: 'klartext-sitzung', userId: userIdOf('member') })
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
    expect(openHandoff(token, deriveHandoffKey(SERVER_KEY), CONTROL_HOST)).toEqual({ secret: 'klartext-sitzung', userId: userIdOf('member') })
  })
})
