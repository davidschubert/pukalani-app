import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteDomainAddress } from '../../core/shared/types/siteDomain'
import { siteOriginFromAddress } from '../shared/siteOrigin'

/**
 * Die eigene Domain als Link-Adresse (seit 2026-11-16): die pure Regel und das
 * Plugin, das sie beim Core anmeldet. Die Aussage ist vor allem, WANN es
 * `null` gibt — dann nimmt der Core die Standard-Adresse, und die leitet per
 * 301 weiter.
 */

const ACTIVE: SiteDomainAddress = {
  canonicalHost: 'pukalani.studio',
  fallbackHost: 'portfolio.pukalani.app',
  knownHosts: ['portfolio.pukalani.app', 'pukalani.studio', 'www.pukalani.studio'],
  domain: 'pukalani.studio',
  status: 'active',
  forms: ['pukalani.studio', 'www.pukalani.studio'],
}
const PROD = { dev: false, appUrl: 'https://portfolio.pukalani.app' }

describe('siteOriginFromAddress', () => {
  it('aktiv ⇒ https://<eingetragene Form>', () => {
    expect(siteOriginFromAddress(ACTIVE, PROD)).toBe('https://pukalani.studio')
  })

  it('jeder andere Status ⇒ null (die Plattform ist bei Appwrite evtl. noch nicht eingetragen)', () => {
    for (const status of ['none', 'pending_dns', 'pending_cert', 'pending_platform', 'error'] as const) {
      expect(siteOriginFromAddress({ ...ACTIVE, status }, PROD), status).toBeNull()
    }
  })

  it('keine Auskunft (Control Plane nicht erreichbar) ⇒ null', () => {
    expect(siteOriginFromAddress(null, PROD)).toBeNull()
  })

  it('kanonisch ist die Standard-Adresse ⇒ null (das kennt der Core über appUrl)', () => {
    expect(siteOriginFromAddress({ ...ACTIVE, canonicalHost: 'portfolio.pukalani.app' }, PROD)).toBeNull()
    expect(siteOriginFromAddress({ ...ACTIVE, canonicalHost: '' }, PROD)).toBeNull()
  })

  it('kein reiner Hostname ⇒ null', () => {
    for (const host of ['pukalani.studio:8443', 'pukalani.studio/pfad', 'x@pukalani.studio']) {
      expect(siteOriginFromAddress({ ...ACTIVE, canonicalHost: host, forms: [host] }, PROD), host).toBeNull()
    }
  })

  it('Schema: https in Produktion, auch wenn appUrl http wäre; im Dev das von appUrl', () => {
    expect(siteOriginFromAddress(ACTIVE, { dev: false, appUrl: 'http://localhost:3005' })).toBe('https://pukalani.studio')
    expect(siteOriginFromAddress(ACTIVE, { dev: true, appUrl: 'http://localhost:3005' })).toBe('http://pukalani.studio')
    expect(siteOriginFromAddress(ACTIVE, { dev: true, appUrl: '' })).toBe('https://pukalani.studio')
  })
})

// ── Das Plugin am Core-Vertrag ──────────────────────────────────────────

interface FakeEvent { host: string }

let answer: SiteDomainAddress | null = ACTIVE
let reachable = true
const controlCalls: { event: unknown, path: string, body: Record<string, unknown> }[] = []

let core: typeof import('../../core/server/utils/siteOrigin')
let siteDomain: typeof import('../server/utils/siteDomain')

beforeAll(async () => {
  vi.stubGlobal('defineNitroPlugin', (fn: () => void) => fn)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appUrl: 'https://portfolio.pukalani.app', appwriteProjectId: 'portfolio-p' } }))
  vi.stubGlobal('controlServiceAvailable', async () => true)
  vi.stubGlobal('callControlService', async (event: unknown, path: string, body: Record<string, unknown>) => {
    controlCalls.push({ event, path, body })
    if (!reachable) throw new Error('control plane down')
    return answer
  })
  core = await import('../../core/server/utils/siteOrigin')
  siteDomain = await import('../server/utils/siteDomain')
  const plugin = (await import('../server/plugins/site-origin')).default as unknown as () => void
  plugin()
})

beforeEach(() => {
  answer = ACTIVE
  reachable = true
  controlCalls.length = 0
  siteDomain.invalidateSiteDomainAddress()
})

describe('Plugin site-origin', () => {
  it('meldet die aktive eigene Domain an den Core', async () => {
    expect(await core.resolveSiteOrigin({ host: 'portfolio.pukalani.app' } as never)).toBe('https://pukalani.studio')
  })

  it('OHNE Anfrage (Digest) geht die Abfrage durch — kein gemerkter Stand nötig', async () => {
    expect(await core.resolveSiteOrigin()).toBe('https://pukalani.studio')
    expect(controlCalls).toHaveLength(1)
    expect(controlCalls[0]!.event).toBeUndefined()
    expect(await core.resolveSiteLinkBase()).toBe('https://pukalani.studio')
  })

  it('`Host: evil.example` ändert nichts: gefragt wird nach der Projekt-Id, nicht nach dem Host', async () => {
    const evil = await core.resolveSiteOrigin({ host: 'evil.example' } as FakeEvent as never)
    expect(evil).toBe('https://pukalani.studio')
    expect(controlCalls[0]!.path).toBe('/api/control/site/domain/host')
    expect(controlCalls[0]!.body).toEqual({ projectId: 'portfolio-p' })
    expect(JSON.stringify(controlCalls[0]!.body)).not.toContain('evil')
  })

  it('Status nicht aktiv ⇒ null, der Core nimmt appUrl', async () => {
    answer = { ...ACTIVE, status: 'pending_platform', canonicalHost: 'portfolio.pukalani.app' }
    expect(await core.resolveSiteOrigin()).toBeNull()
    expect(await core.resolveSiteLinkBase()).toBe('https://portfolio.pukalani.app')
  })

  it('Control Plane nicht erreichbar ⇒ null, der Core nimmt appUrl', async () => {
    reachable = false
    expect(await core.resolveSiteOrigin()).toBeNull()
    expect(await core.resolveSiteLinkBase()).toBe('https://portfolio.pukalani.app')
  })
})
