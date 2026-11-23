import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { probeRoute, resetCommunityWorld, userIdOf } from './support/participationHarness'
import { appwriteFake } from './support/appwriteFake'
import { coreKit } from './support/coreRouteKit'
import { deriveHandoffKey, openHandoff } from '../server/utils/embedHandoff'
import { registerTenantResolver } from '../server/utils/tenantResolver'
import { centralLoginUrl, centralReturnUrl, parseCentralLoginMode, parseSiteHost, siteOrigin } from '../shared/centralLogin'
import type { TenantContext } from '../shared/types/tenant'

/**
 * ZENTRALE ANMELDUNG (PK1 E2, Prototyp der Variante A) — Regeln pur und an
 * der ECHTEN Route.
 *
 *  - `GET /api/auth/central/target`: welche Community? Nur mit Schalter `on`,
 *    nur im Kundenbereich, nur für einen Host, den die Mandanten-Auflösung
 *    kennt (und kein Kontroll-Host ist). Sonst 404.
 *  - `POST /api/auth/central/return`: Siegel für GENAU den Host der Community
 *    (der kanonische aus der Auflösung, nie ein Wert aus dem Aufruf), `to` nur
 *    als relativer Pfad. Gast ⇒ 401.
 *  - `POST /api/auth/login` mit `remember: false`: Cookie ohne Ablauf (endet
 *    mit dem Browser), aber NUR im Kundenbereich mit Schalter `on`.
 */

const { cookieWrites } = vi.hoisted(() => ({
  cookieWrites: [] as Array<{ secret: string, browserSession: boolean }>,
}))

vi.mock('../server/lib/appwrite', async () => {
  const fake = await import('./support/appwriteFake')
  return {
    ...fake.appwriteLibMock,
    setSessionCookie: (_event: unknown, secret: string, _expire: string, options?: { browserSession?: boolean }) => {
      cookieWrites.push({ secret, browserSession: options?.browserSession === true })
    },
  }
})

const ACCOUNT_HOST = 'account.pukalani.app'
const COMMUNITY_HOST = 'c-a.pukalani.app'
const CUSTOM_DOMAIN = 'forum.kunde-a.example'
const SERVER_KEY = 'probe-server-key'
const COOKIE = 'a_session_probe'

/** Was die Mandanten-Auflösung dieses Deployments kennt. */
const KNOWN: Record<string, TenantContext> = {
  [COMMUNITY_HOST]: { mode: 'pool', tenantId: 'c-a', communityId: 'c-a', projectId: 'account', name: 'Community A' } as TenantContext,
  // Eine Community mit eigener Domain: die Subdomain löst auf, kanonisch ist
  // die eigene Domain.
  'c-b.pukalani.app': { mode: 'pool', tenantId: 'c-b', communityId: 'c-b', projectId: 'account', name: 'Community B', canonicalHost: CUSTOM_DOMAIN } as TenantContext,
  // Falsch gepflegt: eine Community, deren kanonischer Host der Kundenbereich wäre.
  'kaputt.pukalani.app': { mode: 'pool', tenantId: 'k', communityId: 'k', projectId: 'account', name: 'Kaputt', canonicalHost: ACCOUNT_HOST } as TenantContext,
}

beforeAll(() => {
  registerTenantResolver(host => KNOWN[host] ?? null)
})

beforeEach(() => {
  appwriteFake.reset()
  cookieWrites.length = 0
})

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

function globals(options: { mode?: string, host?: string, cookie?: string } = {}) {
  return {
    ...coreKit({
      cookies: options.cookie ? { [COOKIE]: options.cookie } : {},
      headers: { host: options.host ?? ACCOUNT_HOST },
      config: { appwriteKey: SERVER_KEY },
      publicConfig: { centralLogin: options.mode ?? 'on' },
    }).globals,
    useAppConfig: () => ({ pukalani: { tenancy: { enabled: true, controlHosts: [ACCOUNT_HOST] } } }),
    logEvent: () => {},
    rememberKnownDevice: () => {},
  }
}

// ── Regeln (pur) ────────────────────────────────────────────────────────────

describe('shared/centralLogin — pure Regeln', () => {
  it('nur das genaue Wort `on` schaltet ein', () => {
    expect(parseCentralLoginMode('on')).toBe('on')
    expect(parseCentralLoginMode(' ON ')).toBe('on')
    for (const value of ['off', '', 'true', '1', 'write', undefined, null, true]) {
      expect(parseCentralLoginMode(value)).toBe('off')
    }
  })

  it('ein Host ist nur ein Host — kein Schema, Port, Pfad, Nutzer oder IPv6', () => {
    expect(parseSiteHost('C-A.Pukalani.App')).toBe('c-a.pukalani.app')
    expect(parseSiteHost('kunde-a.localhost')).toBe('kunde-a.localhost')
    for (const value of [
      'https://c-a.pukalani.app', 'c-a.pukalani.app:443', 'c-a.pukalani.app/x', 'evil@c-a.pukalani.app',
      '[::1]', 'c-a..pukalani.app', '.pukalani.app', 'pukalani.app.', '-x.pukalani.app', 'intranet',
      '', 'a'.repeat(254), 'c-a.pukalani.app\n', 42,
    ]) {
      expect(parseSiteHost(value), String(value)).toBeNull()
    }
  })

  it('lokal mit http und dem Port der Anfrage, sonst https', () => {
    expect(siteOrigin('c-a.pukalani.app', '3000')).toBe('https://c-a.pukalani.app')
    expect(siteOrigin('kunde-a.localhost', '3014')).toBe('http://kunde-a.localhost:3014')
  })

  it('Rücksprung nur auf einen relativen Pfad, sonst `/`', () => {
    expect(centralReturnUrl('c-a.pukalani.app', 't k', '/dashboard')).toBe('https://c-a.pukalani.app/api/auth/site-session?token=t%20k&to=%2Fdashboard')
    for (const evil of ['//evil.example', 'https://evil.example', '/\\evil.example', '/login']) {
      expect(centralReturnUrl('c-a.pukalani.app', 't', evil)).toBe('https://c-a.pukalani.app/api/auth/site-session?token=t&to=%2F')
    }
  })

  it('die Anmelde-Adresse trägt den Host und nur ein sicheres Ziel', () => {
    expect(centralLoginUrl('https://account.pukalani.app', '/de/login/continue', 'c-a.pukalani.app', '/de/posts'))
      .toBe('https://account.pukalani.app/de/login/continue?site=c-a.pukalani.app&to=%2Fde%2Fposts')
    expect(centralLoginUrl('https://account.pukalani.app', '/login/continue', 'c-a.pukalani.app', 'https://evil.example'))
      .toBe('https://account.pukalani.app/login/continue?site=c-a.pukalani.app')
  })
})

// ── GET /api/auth/central/target ────────────────────────────────────────────

describe('GET /api/auth/central/target — welche Community?', () => {
  const load = () => import('../server/api/auth/central/target.get')
  const run = (site: string, options: { mode?: string, host?: string, who?: 'guest' | 'member' } = {}) =>
    probeRoute(load, { who: options.who ?? 'guest', mode: 'control', query: { site }, globals: globals(options) })

  it('Schalter aus (Vorgabe): 404, auch für eine bekannte Community', async () => {
    expect((await run(COMMUNITY_HOST, { mode: 'off' })).status).toBe(404)
    expect((await run(COMMUNITY_HOST, { mode: '' })).status).toBe(404)
  })

  it('an: Gast und Konto bekommen Name und Host einer bekannten Community', async () => {
    for (const who of ['guest', 'member'] as const) {
      const result = await run(COMMUNITY_HOST, { who })
      expect(result.status).toBe(200)
      expect(result.result).toEqual({ host: COMMUNITY_HOST, name: 'Community A' })
    }
  })

  it('der Rücksprung geht auf den kanonischen Host aus der Auflösung', async () => {
    const result = await run('c-b.pukalani.app')
    expect(result.result).toEqual({ host: CUSTOM_DOMAIN, name: 'Community B' })
  })

  it('unbekannter Host, Kontroll-Host, fremde Form ⇒ 404', async () => {
    for (const site of ['evil.example', 'c-z.pukalani.app', ACCOUNT_HOST, 'kaputt.pukalani.app', 'https://c-a.pukalani.app', 'c-a.pukalani.app:3000', 'c-a.pukalani.app/x']) {
      expect((await run(site)).status, site).toBe(404)
    }
  })

  it('nur im Kundenbereich: auf einem Community-Host 404', async () => {
    expect((await run(COMMUNITY_HOST, { host: COMMUNITY_HOST })).status).toBe(404)
  })
})

// ── POST /api/auth/central/return ───────────────────────────────────────────

describe('POST /api/auth/central/return — Siegel für den Rücksprung', () => {
  const load = () => import('../server/api/auth/central/return.post')
  const run = (body: unknown, options: { mode?: string, host?: string, who?: 'guest' | 'member' | 'stranger', cookie?: string | null } = {}) =>
    probeRoute(load, {
      who: options.who ?? 'member',
      mode: 'control',
      body,
      globals: globals({ ...options, cookie: options.cookie === null ? undefined : (options.cookie ?? 'zentrales-geheimnis') }),
    })

  const open = (url: string, host: string) => {
    const token = new URL(url).searchParams.get('token') ?? ''
    return openHandoff(token, deriveHandoffKey(SERVER_KEY), host)
  }

  it('Schalter aus: 404, auch angemeldet', async () => {
    expect((await run({ site: COMMUNITY_HOST }, { mode: 'off' })).status).toBe(404)
  })

  it('Gast: 401, kein Siegel', async () => {
    expect((await run({ site: COMMUNITY_HOST }, { who: 'guest' })).status).toBe(401)
  })

  it('angemeldet ohne Cookie: 401 statt eines Siegels, das nichts öffnet', async () => {
    expect((await run({ site: COMMUNITY_HOST }, { cookie: null })).status).toBe(401)
  })

  it('angemeldet: Siegel nur für den Host der Community, `to` bleibt relativ', async () => {
    for (const who of ['member', 'stranger'] as const) {
      const result = await run({ site: COMMUNITY_HOST, to: '/dashboard' }, { who })
      expect(result.status).toBe(200)
      const { url } = result.result as { url: string }
      expect(url.startsWith(`https://${COMMUNITY_HOST}/api/auth/site-session?token=`)).toBe(true)
      expect(new URL(url).searchParams.get('to')).toBe('/dashboard')
      expect(open(url, COMMUNITY_HOST)?.secret).toBe('zentrales-geheimnis')
      // Auf einem anderen Host öffnet dasselbe Siegel nicht.
      expect(open(url, 'c-b.pukalani.app')).toBeNull()
      expect(open(url, 'evil.example')).toBeNull()
    }
  })

  it('eigene Domain: das Siegel gilt für den kanonischen Host, nicht für den Aufruf', async () => {
    const result = await run({ site: 'c-b.pukalani.app' })
    const { url } = result.result as { url: string }
    expect(new URL(url).host).toBe(CUSTOM_DOMAIN)
    expect(open(url, CUSTOM_DOMAIN)).not.toBeNull()
    expect(open(url, 'c-b.pukalani.app')).toBeNull()
  })

  it('fremdes Ziel nach der Anmeldung ⇒ zurück auf `/`', async () => {
    const result = await run({ site: COMMUNITY_HOST, to: '//evil.example/x' })
    expect(new URL((result.result as { url: string }).url).searchParams.get('to')).toBe('/')
  })

  it('unbekannter Host, Kontroll-Host, Zusatzfeld ⇒ 404, kein Siegel', async () => {
    for (const body of [{ site: 'evil.example' }, { site: ACCOUNT_HOST }, { site: 'kaputt.pukalani.app' }, { site: COMMUNITY_HOST, host: 'evil.example' }]) {
      expect((await run(body)).status, JSON.stringify(body)).toBe(404)
    }
  })

  it('nur im Kundenbereich: auf einem Community-Host 404', async () => {
    expect((await run({ site: COMMUNITY_HOST }, { host: COMMUNITY_HOST })).status).toBe(404)
  })
})

// ── POST /api/auth/login, Kästchen „angemeldet bleiben" ─────────────────────

describe('POST /api/auth/login — „Auf diesem Gerät angemeldet bleiben"', () => {
  const load = () => import('../server/api/auth/login.post')
  const run = (body: Record<string, unknown>, options: { mode?: string, host?: string } = {}) => {
    appwriteFake.reply('admin.account.createEmailPasswordSession', () => ({ $id: 's-1', userId: userIdOf('member'), secret: 'neu', expire: '2027-01-01T00:00:00.000Z', $createdAt: '2026-11-23T08:00:00.000Z' }))
    return probeRoute(load, { who: 'guest', mode: 'control', body: { email: 'person@example.com', password: 'geheim-genug', ...body }, globals: globals(options) })
  }

  it('ohne Haken im Kundenbereich mit Schalter an: Cookie endet mit dem Browser', async () => {
    expect((await run({ remember: false })).status).toBe(200)
    expect(cookieWrites).toEqual([{ secret: 'neu', browserSession: true }])
  })

  it('mit Haken oder ohne Angabe: Cookie mit Ablauf wie heute', async () => {
    await run({ remember: true })
    await run({})
    expect(cookieWrites.map(write => write.browserSession)).toEqual([false, false])
  })

  it('Schalter aus oder auf einer Community: `remember` wirkt nicht', async () => {
    await run({ remember: false }, { mode: 'off' })
    await run({ remember: false }, { host: COMMUNITY_HOST })
    expect(cookieWrites.map(write => write.browserSession)).toEqual([false, false])
  })
})
