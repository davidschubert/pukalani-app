import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APP_URL_MISSING_LOG_LINE,
  appUrlOrigin,
  decideTrustedOrigin,
  shouldReportAppUrlMissing,
} from '../shared/trustedOrigin'

/**
 * SEC-010: Reset-Mail und OAuth-Rückweg nehmen die eingestellte Adresse,
 * nicht den Namen aus der Anfrage — außer dort, wo die Mandanten-Auflösung
 * ihn geprüft hat.
 *
 * Drei Teile: die pure Regel je App-Art, die Einmal-Fehlerzeile des
 * Server-Helfers, und die zwei ECHTEN Routen mit `Host: evil.example` — dort
 * zählt nur, was an Appwrite übergeben wird.
 */

const REQUEST = 'https://evil.example'

describe('decideTrustedOrigin — je App-Art', () => {
  it('Pool mit geprüftem Host (Mandant oder Kontroll-Host) ⇒ der Host der Anfrage', () => {
    expect(decideTrustedOrigin({
      tenancyEnabled: true, hostVerified: true, requestOrigin: 'https://kunde.pukalani.app',
      siteOrigin: null, appUrl: 'https://platform.pukalani.app', dev: false,
    })).toEqual({ origin: 'https://kunde.pukalani.app', source: 'tenant-host' })
  })

  it('Pool OHNE geprüften Host ⇒ appUrl (kein Durchreichen auf Verdacht)', () => {
    expect(decideTrustedOrigin({
      tenancyEnabled: true, hostVerified: false, requestOrigin: REQUEST,
      siteOrigin: null, appUrl: 'https://platform.pukalani.app', dev: false,
    })).toEqual({ origin: 'https://platform.pukalani.app', source: 'app-url' })
  })

  it('Einzel-Site mit appUrl und FREMDEM Host in der Anfrage ⇒ appUrl', () => {
    expect(decideTrustedOrigin({
      tenancyEnabled: false, hostVerified: false, requestOrigin: REQUEST,
      siteOrigin: null, appUrl: 'https://branding.supply/', dev: false,
    })).toEqual({ origin: 'https://branding.supply', source: 'app-url' })
  })

  it('…auch wenn ein Silo einen Kontext-Stempel trüge: ohne tenancy zählt er nicht', () => {
    expect(decideTrustedOrigin({
      tenancyEnabled: false, hostVerified: true, requestOrigin: REQUEST,
      siteOrigin: null, appUrl: 'https://branding.supply', dev: false,
    }).source).toBe('app-url')
  })

  it('Einzel-Site ohne appUrl ⇒ Rückfall auf die Anfrage, gemeldet', () => {
    const result = decideTrustedOrigin({
      tenancyEnabled: false, hostVerified: false, requestOrigin: REQUEST, siteOrigin: null, appUrl: '', dev: false,
    })
    expect(result).toEqual({ origin: REQUEST, source: 'request-fallback' })
    expect(shouldReportAppUrlMissing(result, false)).toBe(true)
  })

  it('Dev ohne appUrl ⇒ Anfrage, ohne Meldung', () => {
    const result = decideTrustedOrigin({
      tenancyEnabled: false, hostVerified: false, requestOrigin: 'http://localhost:3010', siteOrigin: null, appUrl: undefined, dev: true,
    })
    expect(result.source).toBe('request-fallback')
    expect(shouldReportAppUrlMissing(result, true)).toBe(false)
  })

  it('GEGENPROBE: mit appUrl wird nie gemeldet', () => {
    const result = decideTrustedOrigin({
      tenancyEnabled: false, hostVerified: false, requestOrigin: REQUEST, siteOrigin: null, appUrl: 'https://x.example', dev: false,
    })
    expect(shouldReportAppUrlMissing(result, false)).toBe(false)
  })
})

describe('decideTrustedOrigin — Einzel-Site mit eigener Domain', () => {
  const SITE = 'https://pukalani.studio'

  it('aktive eigene Domain ⇒ die eigene Domain, auch bei FREMDEM Host in der Anfrage', () => {
    expect(decideTrustedOrigin({
      tenancyEnabled: false, hostVerified: false, requestOrigin: REQUEST,
      siteOrigin: SITE, appUrl: 'https://portfolio.pukalani.app', dev: false,
    })).toEqual({ origin: SITE, source: 'site-domain' })
  })

  it('keine eigene Domain (nicht aktiv, Control Plane nicht erreichbar) ⇒ appUrl', () => {
    for (const siteOrigin of [null, undefined, '']) {
      expect(decideTrustedOrigin({
        tenancyEnabled: false, hostVerified: false, requestOrigin: REQUEST,
        siteOrigin, appUrl: 'https://portfolio.pukalani.app', dev: false,
      })).toEqual({ origin: 'https://portfolio.pukalani.app', source: 'app-url' })
    }
  })

  it('ohne beides ⇒ Rückfall auf die Anfrage, gemeldet', () => {
    const result = decideTrustedOrigin({
      tenancyEnabled: false, hostVerified: false, requestOrigin: REQUEST, siteOrigin: null, appUrl: '', dev: false,
    })
    expect(result).toEqual({ origin: REQUEST, source: 'request-fallback' })
    expect(shouldReportAppUrlMissing(result, false)).toBe(true)
  })

  it('Pool mit geprüftem Host bleibt beim Host der Anfrage — die Site-Domain schlägt ihn nicht', () => {
    expect(decideTrustedOrigin({
      tenancyEnabled: true, hostVerified: true, requestOrigin: 'https://kunde.pukalani.app',
      siteOrigin: SITE, appUrl: 'https://platform.pukalani.app', dev: false,
    })).toEqual({ origin: 'https://kunde.pukalani.app', source: 'tenant-host' })
  })

  it('nur http(s): ein verbogener Resolver-Wert fällt auf appUrl', () => {
    for (const siteOrigin of ['javascript:alert(1)', 'pukalani.studio', 'ftp://pukalani.studio']) {
      expect(decideTrustedOrigin({
        tenancyEnabled: false, hostVerified: false, requestOrigin: REQUEST,
        siteOrigin, appUrl: 'https://portfolio.pukalani.app', dev: false,
      }).source, siteOrigin).toBe('app-url')
    }
  })
})

describe('appUrlOrigin', () => {
  it('nur http(s), ohne Pfad und Schluss-Slash', () => {
    expect(appUrlOrigin('https://branding.supply/')).toBe('https://branding.supply')
    expect(appUrlOrigin(' http://localhost:3010 ')).toBe('http://localhost:3010')
    expect(appUrlOrigin('https://x.example/basis/')).toBe('https://x.example')
  })

  it('alles andere ist „fehlt"', () => {
    for (const value of ['', '   ', null, undefined, 'branding.supply', 'javascript:alert(1)', 'ftp://x.example']) {
      expect(appUrlOrigin(value), String(value)).toBeNull()
    }
  })
})

// ── Server-Helfer und Routen ────────────────────────────────────────────

interface FakeEvent {
  host: string
  body?: unknown
  query?: Record<string, string>
  context: Record<string, unknown>
}

let tenancyEnabled = false
let appUrl = 'https://branding.supply'
const createRecovery = vi.fn(async (_input: { email: string, url: string }) => ({}))
const createOAuth2Token = vi.fn(async (_input: { provider: string, success: string, failure: string }) =>
  'https://appwrite.example/oauth')
const redirects: string[] = []

vi.mock('../server/lib/appwrite', () => ({
  createSessionClient: () => ({ account: { createRecovery } }),
  createAdminClient: () => ({
    account: { createOAuth2Token },
    users: { list: async () => ({ users: [] }) },
  }),
}))

type Handler = (event: FakeEvent) => Promise<unknown>
let recovery: Handler
let oauthStart: Handler
let helper: typeof import('../server/utils/trustedOrigin')
let siteOrigin: typeof import('../server/utils/siteOrigin')

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('useAppConfig', () => ({ pukalani: { tenancy: { enabled: tenancyEnabled }, auth: { providers: ['google'] } } }))
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appUrl, authOauthProviders: 'google' } }))
  vi.stubGlobal('getRequestURL', (event: FakeEvent) => new URL(`https://${event.host}/api/auth/x`))
  vi.stubGlobal('readValidatedBody', async (event: FakeEvent, parse: (body: unknown) => unknown) => parse(event.body))
  vi.stubGlobal('requireTurnstile', async () => {})
  vi.stubGlobal('logAuthEvent', async () => {})
  vi.stubGlobal('logEvent', () => {})
  vi.stubGlobal('getQuery', (event: FakeEvent) => event.query ?? {})
  vi.stubGlobal('getCookie', () => undefined)
  vi.stubGlobal('setCookie', () => {})
  vi.stubGlobal('deleteCookie', () => {})
  vi.stubGlobal('sendRedirect', async (_event: FakeEvent, url: string) => {
    redirects.push(url)
  })
  vi.stubGlobal('createError', (input: { status: number, statusText: string }) =>
    Object.assign(new Error(input.statusText), { status: input.status }))
  helper = await import('../server/utils/trustedOrigin')
  siteOrigin = await import('../server/utils/siteOrigin')
  recovery = (await import('../server/api/auth/recovery.post')).default as unknown as Handler
  oauthStart = (await import('../server/api/auth/oauth/index.get')).default as unknown as Handler
})

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  tenancyEnabled = false
  appUrl = 'https://branding.supply'
  createRecovery.mockClear()
  createOAuth2Token.mockClear()
  redirects.length = 0
  helper.__resetTrustedOriginReport()
  siteOrigin.__resetSiteOriginResolver()
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
})

describe('resolveTrustedOrigin — die Fehlerzeile', () => {
  it('ohne appUrl: Rückfall und GENAU EINE Zeile je Prozess, ohne Host der Anfrage', async () => {
    appUrl = ''
    const event = { host: 'evil.example', context: {} }
    for (let i = 0; i < 3; i++) {
      expect(await helper.resolveTrustedOrigin(event as never)).toEqual({ origin: REQUEST, source: 'request-fallback' })
    }
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(APP_URL_MISSING_LOG_LINE)
    expect(APP_URL_MISSING_LOG_LINE).toContain('auth.app_url_missing')
    expect(APP_URL_MISSING_LOG_LINE).not.toContain('evil.example')
  })

  it('Pool: Mandant oder Kontroll-Host gesetzt ⇒ Anfrage; beides fehlt ⇒ appUrl', async () => {
    tenancyEnabled = true
    appUrl = 'https://platform.pukalani.app'
    const tenant = { host: 'kunde.pukalani.app', context: { tenant: { tenantId: 't-1' } } }
    const control = { host: 'account.pukalani.app', context: { controlCenter: true } }
    const none = { host: 'evil.example', context: {} }
    expect((await helper.resolveTrustedOrigin(tenant as never)).origin).toBe('https://kunde.pukalani.app')
    expect((await helper.resolveTrustedOrigin(control as never)).origin).toBe('https://account.pukalani.app')
    expect((await helper.resolveTrustedOrigin(none as never)).origin).toBe('https://platform.pukalani.app')
    expect(consoleError).not.toHaveBeenCalled()
  })
})

describe('Routen mit `Host: evil.example`', () => {
  it('recovery: der Reset-Link an Appwrite beginnt mit appUrl — Antwort bleibt ok', async () => {
    const result = await recovery({ host: 'evil.example', body: { email: 'person@example.org' }, context: {} })
    expect(result).toEqual({ ok: true })
    expect(createRecovery).toHaveBeenCalledTimes(1)
    expect(createRecovery.mock.calls[0]![0].url).toBe('https://branding.supply/reset-password')
  })

  it('GEGENPROBE recovery im Pool mit geprüftem Host: der Community-Host bleibt', async () => {
    tenancyEnabled = true
    await recovery({ host: 'kunde.pukalani.app', body: { email: 'person@example.org' }, context: { tenant: { tenantId: 't-1' } } })
    expect(createRecovery.mock.calls[0]![0].url).toBe('https://kunde.pukalani.app/reset-password')
  })

  it('OAuth-Start: success und failure beginnen mit appUrl', async () => {
    await oauthStart({ host: 'evil.example', query: { provider: 'google' }, context: {} })
    expect(createOAuth2Token).toHaveBeenCalledTimes(1)
    const input = createOAuth2Token.mock.calls[0]![0]
    expect(input.success).toBe('https://branding.supply/api/auth/oauth/callback')
    expect(input.failure.startsWith('https://branding.supply/')).toBe(true)
    expect(redirects).toEqual(['https://appwrite.example/oauth'])
  })

  it('OAuth-Start ohne appUrl (Prod): Rückfall auf die Anfrage plus Fehlerzeile', async () => {
    appUrl = ''
    await oauthStart({ host: 'evil.example', query: { provider: 'google' }, context: {} })
    expect(createOAuth2Token.mock.calls[0]![0].success).toBe('https://evil.example/api/auth/oauth/callback')
    expect(consoleError).toHaveBeenCalledWith(APP_URL_MISSING_LOG_LINE)
  })
})

describe('Einzel-Site mit aktiver eigener Domain (Resolver angemeldet)', () => {
  const SITE = 'https://pukalani.studio'
  let seenHosts: string[]

  beforeEach(() => {
    appUrl = 'https://portfolio.pukalani.app'
    seenHosts = []
    // Der Resolver bekommt das Event; dass er den Host NICHT liest, ist die
    // Aussage des Vertrags — hier wird mitgeschrieben, was er sähe.
    siteOrigin.registerSiteOriginResolver((event) => {
      if (event) seenHosts.push((event as unknown as FakeEvent).host)
      return SITE
    })
  })

  it('recovery mit `Host: evil.example` ⇒ der Reset-Link beginnt mit der eigenen Domain', async () => {
    await recovery({ host: 'evil.example', body: { email: 'person@example.org' }, context: {} })
    expect(createRecovery.mock.calls[0]![0].url).toBe('https://pukalani.studio/reset-password')
  })

  it('OAuth-Start mit `Host: evil.example` ⇒ success und failure auf der eigenen Domain', async () => {
    await oauthStart({ host: 'evil.example', query: { provider: 'google' }, context: {} })
    const input = createOAuth2Token.mock.calls[0]![0]
    expect(input.success).toBe('https://pukalani.studio/api/auth/oauth/callback')
    expect(input.failure.startsWith('https://pukalani.studio/')).toBe(true)
  })

  it('der Host der Anfrage ändert das Ergebnis nicht', async () => {
    const a = await helper.resolveTrustedOrigin({ host: 'evil.example', context: {} } as never)
    const b = await helper.resolveTrustedOrigin({ host: 'portfolio.pukalani.app', context: {} } as never)
    expect(a).toEqual({ origin: SITE, source: 'site-domain' })
    expect(b).toEqual(a)
  })

  it('Resolver ohne Antwort (nicht aktiv / Control Plane weg) ⇒ appUrl', async () => {
    siteOrigin.__resetSiteOriginResolver()
    siteOrigin.registerSiteOriginResolver(() => null)
    await recovery({ host: 'evil.example', body: { email: 'person@example.org' }, context: {} })
    expect(createRecovery.mock.calls[0]![0].url).toBe('https://portfolio.pukalani.app/reset-password')
  })

  it('Resolver wirft ⇒ appUrl, die Route antwortet trotzdem', async () => {
    siteOrigin.__resetSiteOriginResolver()
    siteOrigin.registerSiteOriginResolver(() => { throw new Error('control plane down') })
    await oauthStart({ host: 'evil.example', query: { provider: 'google' }, context: {} })
    expect(createOAuth2Token.mock.calls[0]![0].success).toBe('https://portfolio.pukalani.app/api/auth/oauth/callback')
  })

  it('Pool mit geprüftem Host fragt den Resolver gar nicht', async () => {
    tenancyEnabled = true
    await recovery({ host: 'kunde.pukalani.app', body: { email: 'person@example.org' }, context: { tenant: { tenantId: 't-1' } } })
    expect(createRecovery.mock.calls[0]![0].url).toBe('https://kunde.pukalani.app/reset-password')
    expect(seenHosts).toEqual([])
  })
})
