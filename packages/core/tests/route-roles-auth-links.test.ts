import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { probeRoute, resetCommunityWorld, type Who } from './support/participationHarness'
import { appwriteFake } from './support/appwriteFake'
import { coreKit } from './support/coreRouteKit'
import { deriveHandoffKey, openHandoffToken, sealHandoffToken } from '../server/utils/embedHandoff'

/**
 * LINKS, RÜCKRUFE UND ÜBERGABEN — ROLLEN-TESTS AN DER ECHTEN ROUTE
 * (OPS-009, BT1 b).
 *
 * Diese Routen fragen NICHT nach einer Rolle. Ihr Ausweis ist etwas, das die
 * Anfrage mitbringt: das Geheimnis aus einem Mail-Link (Passwort neu setzen,
 * Adresse bestätigen), der Tausch-Code des OAuth-Anbieters, ein gesiegeltes
 * Übergabe-Token (Embed-Login). Die Fragen je Route:
 *  - ohne bzw. mit falschem Ausweis ⇒ abgelehnt, nichts geschrieben, kein
 *    Cookie;
 *  - angemeldet, aber ohne Ausweis ⇒ ebenso abgelehnt (die Sitzung ersetzt
 *    den Ausweis nicht);
 *  - richtiger Ausweis ⇒ durch.
 * Ob das Geheimnis gilt, entscheidet Appwrite — nachgebildet in
 * `support/appwriteFake.ts`. Das Siegel des Embed-Logins ist echt.
 */

vi.mock('../server/lib/appwrite', async () => (await import('./support/appwriteFake')).appwriteLibMock)

vi.mock('node-appwrite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node-appwrite')>()
  const fake = await import('./support/appwriteFake')
  return { ...actual, Client: fake.FakeClient, Account: fake.FakeAccount }
})

beforeEach(() => {
  appwriteFake.reset()
})

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

const REJECTED = () => {
  throw Object.assign(new Error('invalid token'), { code: 401, type: 'user_invalid_token' })
}

// ── Passwort neu setzen (Mail-Link) ─────────────────────────────────────────

describe('PUT /api/auth/recovery — das Geheimnis aus dem Mail-Link entscheidet', () => {
  const load = () => import('../server/api/auth/recovery.put')
  const body = { userId: 'u-link', secret: 'probe-link', password: 'Probe-Wort-1x' }

  function recoveryGlobals(cleared: string[]) {
    return coreKit({
      globals: {
        clearAccountAttempts: async (_event: unknown, _scope: string, email: string) => {
          cleared.push(email)
        },
      },
    }).globals
  }

  for (const who of ['guest', 'member'] as const) {
    it(`${who}, falsches oder abgelaufenes Geheimnis: 400, Konto-Bremse unberührt`, async () => {
      appwriteFake.reply('session.account.updateRecovery', REJECTED)
      const cleared: string[] = []
      const run = await probeRoute(load, { who, body, globals: recoveryGlobals(cleared) })
      expect(run.status).toBe(400)
      expect(appwriteFake.used('admin')).toBe(false)
      expect(cleared).toEqual([])
    })
  }

  it('ohne Geheimnis: abgelehnt, bevor Appwrite gefragt wird', async () => {
    const run = await probeRoute(load, { who: 'member', body: { userId: 'u-link', password: 'Probe-Wort-1x' }, globals: recoveryGlobals([]) })
    expect(run.status).not.toBe(200)
    expect(appwriteFake.calls).toEqual([])
  })

  it('gültiges Geheimnis: Passwort gesetzt, Bremse genau dieses Kontos gelöst', async () => {
    appwriteFake.reply('admin.users.get', args => ({ $id: args.userId, email: 'link@example.test' }))
    const cleared: string[] = []
    const run = await probeRoute(load, { who: 'guest', body, globals: recoveryGlobals(cleared) })
    expect(run.status).toBe(200)
    expect(appwriteFake.argsOf('session.account.updateRecovery')).toEqual([body])
    expect(appwriteFake.argsOf('admin.users.get')).toEqual([{ userId: 'u-link' }])
    expect(cleared).toEqual(['link@example.test'])
  })
})

// ── Adresse bestätigen (Mail-Link) ──────────────────────────────────────────

describe('PUT /api/auth/verification — das Geheimnis aus dem Mail-Link entscheidet', () => {
  const load = () => import('../server/api/auth/verification.put')
  const body = { userId: 'u-link', secret: 'probe-link' }

  for (const who of ['guest', 'member'] as const) {
    it(`${who}, falsches oder abgelaufenes Geheimnis: 400, nichts protokolliert`, async () => {
      appwriteFake.reply('direct.account.updateVerification', REJECTED)
      const kit = coreKit()
      const run = await probeRoute(load, { who, body, globals: kit.globals })
      expect(run.status).toBe(400)
      expect(kit.record.authEvents).toEqual([])
    })
  }

  it('ohne Geheimnis: abgelehnt, bevor Appwrite gefragt wird', async () => {
    const run = await probeRoute(load, { who: 'member', body: { userId: 'u-link' }, globals: coreKit().globals })
    expect(run.status).not.toBe(200)
    expect(appwriteFake.calls).toEqual([])
  })

  it('gültiges Geheimnis: bestätigt, ohne Sitzung (eigener Klient) und ohne Admin', async () => {
    const kit = coreKit()
    const run = await probeRoute(load, { who: 'guest', body, globals: kit.globals })
    expect(run.status).toBe(200)
    expect(appwriteFake.calls.map(call => [call.client, call.method, call.session])).toEqual([['direct', 'updateVerification', '']])
    expect(kit.record.authEvents.map(e => e.data.userId)).toEqual(['u-link'])
  })
})

// ── OAuth-Rückruf ───────────────────────────────────────────────────────────

describe('GET /api/auth/oauth/callback — der Tausch-Code entscheidet, dazu die Registrierungs-Schalter', () => {
  const load = () => import('../server/api/auth/oauth/callback.get')
  const query = { userId: 'u-oauth', secret: 'probe-tausch' }

  function oauthGlobals(options: { registration?: boolean, tenantOpen?: boolean, joined?: string[] } = {}) {
    return coreKit({
      globals: {
        getAppConfig: async () => ({ registrationEnabled: options.registration ?? true, maintenanceMode: false }),
        tenantRegistrationOpen: () => options.tenantOpen ?? true,
        joinCommunity: async (_event: unknown, _way: string, input: { userId: string }) => {
          options.joined?.push(input.userId)
        },
        recordTermsAcceptance: async () => {},
        recordBusinessConfirmation: async () => {},
        recordActivity: async () => {},
        maybeRecordMilestone: async () => {},
      },
    })
  }

  function exchange(createdAt: string) {
    appwriteFake.reply('admin.account.createSession', () => ({ $id: 's-neu', userId: 'u-oauth', secret: 'probe-sitzung', expire: '2026-12-01T00:00:00.000Z' }))
    appwriteFake.reply('admin.users.get', () => ({ $id: 'u-oauth', $createdAt: createdAt, name: 'Probe' }))
    appwriteFake.reply('admin.users.list', () => ({ total: 1 }))
  }

  for (const who of ['guest', 'member'] as const) {
    it(`${who}, ohne Tausch-Code: zurück zur Anmeldung, Appwrite nicht gefragt, kein Cookie`, async () => {
      const kit = oauthGlobals()
      const run = await probeRoute(load, { who, query: {}, globals: kit.globals })
      expect(run.status).toBe(200)
      expect(kit.record.redirects).toHaveLength(1)
      expect(appwriteFake.calls).toEqual([])
      expect(appwriteFake.cookiesSet).toEqual([])
    })
  }

  it('falscher Tausch-Code (Appwrite lehnt ab): kein Cookie, nichts protokolliert', async () => {
    appwriteFake.reply('admin.account.createSession', REJECTED)
    const kit = oauthGlobals()
    const run = await probeRoute(load, { who: 'guest', query, globals: kit.globals })
    expect(run.status).toBe(200)
    expect(appwriteFake.cookiesSet).toEqual([])
    expect(kit.record.authEvents).toEqual([])
  })

  it('gültiger Code, bestehendes Konto: Cookie mit der getauschten Sitzung, kein Beitritt', async () => {
    exchange('2020-01-01T00:00:00.000Z')
    const joined: string[] = []
    const kit = oauthGlobals({ registration: false, joined })
    const run = await probeRoute(load, { who: 'guest', query, globals: kit.globals })
    expect(run.status).toBe(200)
    expect(appwriteFake.cookiesSet.map(c => c.secret)).toEqual(['probe-sitzung'])
    expect(joined).toEqual([])
  })

  it('gültiger Code, neues Konto, Registrierung offen: Cookie und Beitritt mit der getauschten Konto-Id', async () => {
    exchange(new Date().toISOString())
    const joined: string[] = []
    const kit = oauthGlobals({ joined })
    const run = await probeRoute(load, { who: 'guest', query, globals: kit.globals })
    expect(run.status).toBe(200)
    expect(appwriteFake.cookiesSet.map(c => c.secret)).toEqual(['probe-sitzung'])
    expect(joined).toEqual(['u-oauth'])
  })

  const closed: Array<[string, { registration?: boolean, tenantOpen?: boolean }]> = [
    ['Instanz-Schalter zu', { registration: false }],
    ['Registrierung der Community zu', { tenantOpen: false }],
  ]
  for (const [label, options] of closed) {
    it(`gültiger Code, neues Konto, ${label}: Sitzung eingezogen, kein Cookie, kein Beitritt`, async () => {
      exchange(new Date().toISOString())
      const joined: string[] = []
      const kit = oauthGlobals({ ...options, joined })
      const run = await probeRoute(load, { who: 'guest', query, globals: kit.globals })
      expect(run.status).toBe(200)
      expect(appwriteFake.argsOf('admin.account.deleteSession')).toEqual([{ sessionId: 's-neu' }])
      expect(appwriteFake.cookiesSet).toEqual([])
      expect(joined).toEqual([])
      expect(kit.record.redirects[0]).toMatch(/\/register$/)
    })
  }
})

// ── Embed-Login: Übergabe siegeln (Popup) ───────────────────────────────────

const OWN_HOST = 'kunde-a.example.test'
const OTHER_HOST = 'kunde-b.example.test'
const SERVER_KEY = 'probe-schluessel'
const SESSION_SECRET = 'probe-sitzung'

function embedGlobals(options: { gate?: boolean, cookie?: boolean, host?: string } = {}) {
  return coreKit({
    cookies: options.cookie === false ? {} : { a_session_probe: SESSION_SECRET },
    headers: { host: options.host ?? OWN_HOST },
    config: { appwriteKey: SERVER_KEY },
    globals: { useAppConfig: () => ({ pukalani: { auth: { embedSession: options.gate ?? true } } }) },
  }).globals
}

describe('POST /api/auth/embed-handoff — siegelt nur die eigene Sitzung, nur für den eigenen Host', () => {
  const load = () => import('../server/api/auth/embed-handoff.post')

  it('Schalter aus: 404, auch angemeldet', async () => {
    const run = await probeRoute(load, { who: 'member', globals: embedGlobals({ gate: false }) })
    expect(run.status).toBe(404)
  })

  it('ohne Konto: 401', async () => {
    const run = await probeRoute(load, { who: 'guest', globals: embedGlobals() })
    expect(run.status).toBe(401)
  })

  it('angemeldet, aber ohne Session-Cookie: 401', async () => {
    const run = await probeRoute(load, { who: 'member', globals: embedGlobals({ cookie: false }) })
    expect(run.status).toBe(401)
  })

  for (const who of ['member', 'stranger'] as const satisfies readonly Who[]) {
    it(`${who}: das Token trägt die eigene Sitzung und öffnet sich nur auf dem eigenen Host`, async () => {
      const run = await probeRoute(load, { who, globals: embedGlobals() })
      expect(run.status).toBe(200)
      const { token } = run.result as { token: string }
      const key = deriveHandoffKey(SERVER_KEY)
      expect(openHandoffToken(token, key, OWN_HOST)).toBe(SESSION_SECRET)
      expect(openHandoffToken(token, key, OTHER_HOST)).toBeNull()
    })
  }
})

// ── Embed-Login: Übergabe einlösen (iframe) ─────────────────────────────────

describe('POST /api/auth/embed-session — nur ein gültiges Token für diesen Host setzt ein Cookie', () => {
  const load = () => import('../server/api/auth/embed-session.post')
  const sealFor = (host: string) => sealHandoffToken(SESSION_SECRET, deriveHandoffKey(SERVER_KEY), host)

  it('Schalter aus: 404, kein Cookie', async () => {
    const run = await probeRoute(load, { who: 'guest', body: { token: sealFor(OWN_HOST) }, globals: embedGlobals({ gate: false }) })
    expect(run.status).toBe(404)
    expect(appwriteFake.cookiesSet).toEqual([])
  })

  for (const who of ['guest', 'member'] as const) {
    it(`${who}, unbrauchbares Token: 401, Appwrite nicht gefragt, kein Cookie`, async () => {
      const run = await probeRoute(load, { who, body: { token: 'kein-token' }, globals: embedGlobals() })
      expect(run.status).toBe(401)
      expect(appwriteFake.calls).toEqual([])
      expect(appwriteFake.cookiesSet).toEqual([])
    })
  }

  it('Token für einen ANDEREN Host: 401, kein Cookie', async () => {
    const run = await probeRoute(load, { who: 'guest', body: { token: sealFor(OTHER_HOST) }, globals: embedGlobals() })
    expect(run.status).toBe(401)
    expect(appwriteFake.cookiesSet).toEqual([])
  })

  it('Token gültig, Sitzung bei Appwrite nicht mehr gültig: 401, kein Cookie', async () => {
    appwriteFake.reply('direct.account.getSession', REJECTED)
    const run = await probeRoute(load, { who: 'guest', body: { token: sealFor(OWN_HOST) }, globals: embedGlobals() })
    expect(run.status).toBe(401)
    expect(appwriteFake.cookiesSet).toEqual([])
  })

  it('gültiges Token für diesen Host: Sitzung geprüft, Cookie partitioniert gesetzt', async () => {
    appwriteFake.reply('direct.account.getSession', () => ({ $id: 's-1', expire: '2026-12-01T00:00:00.000Z' }))
    const run = await probeRoute(load, { who: 'guest', body: { token: sealFor(OWN_HOST) }, globals: embedGlobals() })
    expect(run.status).toBe(200)
    expect(appwriteFake.calls.map(call => [call.client, call.method, call.session])).toEqual([['direct', 'getSession', SESSION_SECRET]])
    expect(appwriteFake.cookiesSet).toEqual([{ secret: SESSION_SECRET, expire: '2026-12-01T00:00:00.000Z', partitioned: true }])
  })
})
