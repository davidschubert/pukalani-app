import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TenantContext } from '../shared/types/tenant'
import { normalizeHost } from '../server/utils/tenantResolver'
import {
  TENANT_RESOLVER_MISSING_CODE,
  TENANT_RESOLVER_MISSING_STATUS_TEXT,
  UNKNOWN_HOST_CODE,
  isTenantResolverMissingError,
  isUnknownHostError,
} from '../shared/unknownHost'

/**
 * SEC-025 (2026-11-13, Davids Entscheidung: „Eine Sicherung, die nicht prüfen
 * kann, lehnt ab."): `00.tenant.ts` mit eingeschalteter Mandanten-Trennung,
 * aber OHNE registrierten Resolver.
 *
 * Bis dahin kehrte die Middleware dann stumm zurück — kein Mandant, kein 404,
 * kein Kontroll-Host — und die Datentür scopte nichts. Jetzt: 503 mit
 * `tenant_resolver_missing` für alles außer Betriebsprüfung, i18n-Texten und
 * dem Fehlerseiten-Durchgang. Daneben die bisherigen Zweige als Gegenprobe.
 *
 * Nitro-Globals werden wie in den Nachbar-Tests per `vi.stubGlobal`
 * nachgebildet; die Middleware wird je Test frisch geladen, weil die
 * „einmal je Prozess"-Logzeile Modul-Zustand ist.
 */

type Resolver = (host: string) => Promise<TenantContext | null> | TenantContext | null
type Thrown = { statusCode?: number, statusMessage?: string, data?: { code?: string } }
interface FakeEvent {
  path: string
  method: string
  headers: Record<string, string>
  context: Record<string, unknown>
}

let tenancy: { enabled?: boolean } | undefined
let resolver: Resolver | null
let controlHostList: string[]
const logEvent = vi.fn()
const sendRedirect = vi.fn(async () => undefined)
const setResponseHeader = vi.fn()

let middleware: (event: FakeEvent) => Promise<unknown>

const POOL_TENANT: TenantContext = {
  mode: 'pool',
  tenantId: 't-kunde-a',
  canonicalHost: 'kunde-a.pukalani.app',
} as unknown as TenantContext

beforeEach(async () => {
  tenancy = { enabled: true }
  resolver = null
  controlHostList = ['account.pukalani.app']
  logEvent.mockReset()
  sendRedirect.mockClear()
  setResponseHeader.mockClear()
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('useAppConfig', () => ({ pukalani: { tenancy } }))
  vi.stubGlobal('getTenantResolver', () => resolver)
  vi.stubGlobal('normalizeHost', normalizeHost)
  vi.stubGlobal('getHeader', (event: FakeEvent, name: string) => event.headers[name])
  vi.stubGlobal('controlHosts', () => controlHostList)
  // Wie h3: `status`/`statusText` landen als `statusCode`/`statusMessage` am Fehler.
  vi.stubGlobal('createError', (init: { status: number, statusText: string, data?: unknown }) =>
    Object.assign(new Error(init.statusText), { statusCode: init.status, statusMessage: init.statusText, data: init.data }))
  vi.stubGlobal('logEvent', logEvent)
  vi.stubGlobal('sendRedirect', sendRedirect)
  vi.stubGlobal('setResponseHeader', setResponseHeader)
  vi.resetModules()
  middleware = (await import('../server/middleware/00.tenant')).default as unknown as typeof middleware
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function request(path: string, host = 'kunde-a.pukalani.app'): FakeEvent {
  return { path, method: 'GET', headers: { host }, context: {} }
}

async function run(event: FakeEvent): Promise<Thrown | null> {
  try {
    await middleware(event)
    return null
  }
  catch (error) {
    return error as Thrown
  }
}

describe('00.tenant — Trennung an, aber kein Resolver (SEC-025)', () => {
  it('Seite und API antworten 503 mit tenant_resolver_missing', async () => {
    for (const path of ['/', '/de/dashboard', '/api/comments?targetId=x', '/api/auth/me']) {
      const thrown = await run(request(path))
      expect(thrown?.statusCode, path).toBe(503)
      expect(thrown?.data?.code, path).toBe(TENANT_RESOLVER_MISSING_CODE)
      expect(thrown?.statusMessage, path).toBe(TENANT_RESOLVER_MISSING_STATUS_TEXT)
    }
  })

  it('auch auf einem Kontroll-Host — und der wird NICHT als Kontroll-Host markiert', async () => {
    const event = request('/api/control/communities', 'account.pukalani.app')
    const thrown = await run(event)
    expect(thrown?.statusCode).toBe(503)
    expect(event.context.controlCenter).toBeUndefined()
    expect(event.context.tenant).toBeUndefined()
  })

  it('/api/health, /_i18n/ und der Fehlerseiten-Durchgang kommen durch', async () => {
    for (const path of ['/api/health', '/_i18n/abc/de/messages.json', '/__nuxt_error?status=503']) {
      const event = request(path)
      expect(await run(event), path).toBeNull()
      expect(event.context.tenant, path).toBeUndefined()
    }
  })

  it('die Fehlerzeile steht EINMAL je Prozess im Log, nicht je Anfrage', async () => {
    await run(request('/'))
    await run(request('/api/posts'))
    await run(request('/de'))
    expect(logEvent).toHaveBeenCalledTimes(1)
    expect(logEvent).toHaveBeenCalledWith('error', 'tenancy.resolver_missing', expect.any(Object))
  })

  it('die Fehlerseite erkennt den Fall (eigener Satz, kein „Zur Startseite")', async () => {
    const thrown = await run(request('/'))
    expect(isTenantResolverMissingError(thrown)).toBe(true)
    expect(isUnknownHostError(thrown)).toBe(false)
    // …auch wenn `data.code` die Serialisierung nicht überlebt.
    expect(isTenantResolverMissingError({ statusCode: 503, statusMessage: TENANT_RESOLVER_MISSING_STATUS_TEXT })).toBe(true)
    // Ein gewöhnlicher 503 ist etwas anderes.
    expect(isTenantResolverMissingError({ statusCode: 503, statusMessage: 'Service Unavailable' })).toBe(false)
  })
})

describe('00.tenant — Gegenproben (unverändertes Verhalten)', () => {
  it('Trennung aus ⇒ No-Op, auch ohne Resolver und ohne Logzeile', async () => {
    tenancy = { enabled: false }
    const event = request('/api/comments')
    expect(await run(event)).toBeNull()
    expect(event.context).toEqual({})
    tenancy = undefined
    expect(await run(request('/'))).toBeNull()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it('bekannter Host ⇒ Mandant im Kontext', async () => {
    resolver = vi.fn(async (host: string) => (host === 'kunde-a.pukalani.app' ? POOL_TENANT : null))
    const event = request('/api/comments', 'Kunde-A.pukalani.app:443')
    expect(await run(event)).toBeNull()
    expect(event.context.tenant).toBe(POOL_TENANT)
    expect(sendRedirect).not.toHaveBeenCalled()
  })

  it('unbekannter Host ⇒ 404 unknown_host, der Fehlerseiten-Durchgang kommt durch', async () => {
    resolver = vi.fn(async () => null)
    const thrown = await run(request('/', 'tippfehler.pukalani.app'))
    expect(thrown?.statusCode).toBe(404)
    expect(thrown?.data?.code).toBe(UNKNOWN_HOST_CODE)
    expect(await run(request('/__nuxt_error', 'tippfehler.pukalani.app'))).toBeNull()
  })

  it('Kontroll-Host ⇒ markiert, kein Resolver-Aufruf', async () => {
    const spy = vi.fn(async () => POOL_TENANT)
    resolver = spy
    const event = request('/', 'account.pukalani.app')
    expect(await run(event)).toBeNull()
    expect(event.context.controlCenter).toBe(true)
    expect(spy).not.toHaveBeenCalled()
  })

  it('mit Resolver schreibt die Middleware keine Fehlerzeile', async () => {
    resolver = vi.fn(async () => POOL_TENANT)
    await run(request('/'))
    expect(logEvent).not.toHaveBeenCalled()
  })
})

describe('00.tenant — Umleitung auf die kanonische Adresse (control-035/040)', () => {
  const ACTIVE_DOMAIN: TenantContext = {
    mode: 'pool',
    tenantId: 't-kunde-a',
    canonicalHost: 'www.kunde.de',
  } as unknown as TenantContext
  const PAUSED_DOMAIN: TenantContext = {
    mode: 'pool',
    tenantId: 't-kunde-a',
    canonicalHost: 'kunde-a.pukalani.app',
    canonicalRedirect: 'temporary',
  } as unknown as TenantContext

  function withMethod(event: FakeEvent, method: string): FakeEvent {
    return { ...event, method }
  }

  it('aktive eigene Domain: die Pukalani-Adresse leitet DAUERHAFT um (301 GET, 308 POST) mit no-store', async () => {
    resolver = vi.fn(async () => ACTIVE_DOMAIN)
    expect(await run(request('/feed?x=1'))).toBeNull()
    expect(sendRedirect).toHaveBeenLastCalledWith(expect.anything(), 'https://www.kunde.de/feed?x=1', 301)
    expect(await run(withMethod(request('/api/comments'), 'POST'))).toBeNull()
    expect(sendRedirect).toHaveBeenLastCalledWith(expect.anything(), 'https://www.kunde.de/api/comments', 308)
    expect(setResponseHeader).toHaveBeenCalledWith(expect.anything(), 'Cache-Control', 'no-store')
  })

  it('abgeschaltete eigene Domain: der Besuch der Domain leitet VORÜBERGEHEND um (302 GET, 307 POST) mit no-store', async () => {
    resolver = vi.fn(async () => PAUSED_DOMAIN)
    expect(await run(request('/feed', 'www.kunde.de'))).toBeNull()
    expect(sendRedirect).toHaveBeenLastCalledWith(expect.anything(), 'https://kunde-a.pukalani.app/feed', 302)
    expect(setResponseHeader).toHaveBeenLastCalledWith(expect.anything(), 'Cache-Control', 'no-store')
    expect(await run(withMethod(request('/api/comments', 'www.kunde.de'), 'POST'))).toBeNull()
    expect(sendRedirect).toHaveBeenLastCalledWith(expect.anything(), 'https://kunde-a.pukalani.app/api/comments', 307)
  })

  it('auf der Pukalani-Adresse selbst leitet eine abgeschaltete Domain nichts um', async () => {
    resolver = vi.fn(async () => PAUSED_DOMAIN)
    const event = request('/feed')
    expect(await run(event)).toBeNull()
    expect(sendRedirect).not.toHaveBeenCalled()
    expect(event.context.tenant).toBe(PAUSED_DOMAIN)
  })
})
