import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { routePathOf } from '../../../scripts/lib/manifest-routes.mjs'
import {
  CUSTOM_DOMAIN_API_ALLOWED,
  CUSTOM_DOMAIN_API_DENIED_PREFIXES,
  accountAreaUrl,
  accountMenuLinks,
  customDomainAllowedEntry,
  isCustomDomainApiAllowed,
  isManagementPagePath,
  matchesApiPrefix,
  staysOnPukalaniAddress,
} from '../shared/customDomainScope'
import { realtimeTokenWanted } from '../shared/realtimeGate'
import { CUSTOM_DOMAIN_CAPABILITIES, communityCapabilitiesFor, communityRoleHasCapability } from '../shared/communityAuthz'
import { decideCommunityAccess } from '../shared/communityAccess'
import type { ProductManifest } from '../shared/types/manifest'
import type { TenantContext } from '../shared/types/tenant'

/**
 * EIGENE DOMAIN: MITMACHEN JA, VERWALTEN NEIN (PK1 E1b-2).
 *
 * Teil 1 ist der WÄCHTER über alle Routen des Repos: jede `/api`-Route ist auf
 * einer eigenen Domain entweder erlaubt (Produkt-Präfix oder Eintrag mit
 * Grund) oder fällt unter das 404. Teil 2–5 prüfen die Middleware, die
 * Umleitung, den Lesepunkt und die Weichen im Browser — jeweils mit `off`/
 * `read` als Gegenprobe.
 */

vi.mock('../server/utils/logEvent', () => ({ logEvent: () => {} }))
vi.mock('../server/lib/appwrite', () => ({ sessionCookieName: () => 'a_session_account' }))

const REPO = resolve(import.meta.dirname, '../../..')

// ─── Teil 1: Wächter über alle Routen ────────────────────────────────────────

interface RouteFile { file: string, route: string, layer: string }

function walk(dir: string, base = dir, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, base, out)
    else if (name.endsWith('.ts')) out.push(path.slice(base.length + 1).split('\\').join('/'))
  }
  return out
}

function allRoutes(): RouteFile[] {
  const out: RouteFile[] = []
  for (const group of ['packages', 'apps']) {
    for (const layer of readdirSync(join(REPO, group)).sort()) {
      const api = join(REPO, group, layer, 'server', 'api')
      for (const file of walk(api)) {
        out.push({ file: `${group}/${layer}/server/api/${file}`, route: routePathOf(file), layer: `${group}/${layer}` })
      }
    }
  }
  return out
}

async function manifests(): Promise<Map<string, ProductManifest>> {
  const byLayer = new Map<string, ProductManifest>()
  for (const layer of readdirSync(join(REPO, 'packages')).sort()) {
    const file = join(REPO, 'packages', layer, 'product.manifest.ts')
    if (!existsSync(file)) continue
    const mod = await import(file) as { default: ProductManifest }
    byLayer.set(`packages/${layer}`, mod.default)
  }
  return byLayer
}

/**
 * Kontoweit oder verwaltend — diese Routen MÜSSEN auf einer eigenen Domain
 * 404 antworten. Ausgeschrieben, nicht aus der Liste berechnet.
 */
const MUST_DENY = [
  '/api/auth/password',
  '/api/auth/recovery',
  '/api/auth/profile',
  '/api/auth/timezone',
  '/api/auth/notification-prefs',
  '/api/auth/dashboard-nav',
  '/api/auth/mfa/setup',
  '/api/auth/mfa/verify',
  '/api/auth/mfa/disable',
  '/api/auth/mfa/status',
  '/api/auth/sessions',
  '/api/auth/sessions/s-1',
  '/api/auth/export',
  '/api/auth/account',
  '/api/auth/realtime-token',
  '/api/account/handle',
  '/api/account/activity',
  '/api/admin/users',
  '/api/admin/comments',
  '/api/admin/embed-sites',
  '/api/community/switch',
  '/api/community/switcher',
  '/api/community/control-handoff',
  '/api/onboarding/handoff',
  '/api/community/members',
  '/api/community/branding',
  '/api/community/profile',
  '/api/community/billing/checkout',
  '/api/community/delete',
  '/api/community/export',
  '/api/community/domain',
  '/api/community/invites/quota',
  '/api/platform/products',
  '/api/notifications/run-digest',
  '/api/mail/resend-webhook',
] as const

/** Erlaubnis-Einträge ohne Routen-Datei im Repo (Modul-Routen). */
const MODULE_ROUTES = new Set(['/api/_nuxt_icon'])

describe('Wächter: jede /api-Route ist auf einer eigenen Domain erlaubt (mit Grund) oder 404', async () => {
  const routes = allRoutes()
  const byLayer = await manifests()
  const productPrefixes = [...byLayer.values()].filter(m => m.kind === 'product').flatMap(m => m.apiPrefixes ?? [])

  it('findet die Routen und die Produkt-Präfixe (sonst prüfte dieser Test nichts)', () => {
    expect(routes.length).toBeGreaterThan(300)
    expect(productPrefixes).toContain('/api/posts')
    expect(productPrefixes).toContain('/api/comments')
  })

  it('jeder Eintrag der Erlaubnisliste hat einen Grund und trifft eine echte Route', () => {
    for (const entry of CUSTOM_DOMAIN_API_ALLOWED) {
      expect(entry.reason.trim().length, entry.path).toBeGreaterThanOrEqual(20)
      if (MODULE_ROUTES.has(entry.path)) continue
      const hits = routes.filter(({ route }) => entry.match === 'exact' ? route === entry.path : matchesApiPrefix(route, entry.path))
      expect(hits.length, `${entry.path} trifft keine Route — Eintrag streichen oder korrigieren`).toBeGreaterThan(0)
    }
  })

  it('kein Eintrag liegt unter einem Produkt-Präfix oder unter /api/admin (dort entscheidet die Regel selbst)', () => {
    for (const entry of CUSTOM_DOMAIN_API_ALLOWED) {
      expect(productPrefixes.some(prefix => matchesApiPrefix(entry.path, prefix)), entry.path).toBe(false)
      expect(CUSTOM_DOMAIN_API_DENIED_PREFIXES.some(prefix => matchesApiPrefix(entry.path, prefix)), entry.path).toBe(false)
    }
  })

  it('jede Route: erlaubt über ein Produkt (nicht /api/admin) ODER über einen Eintrag ODER 404', () => {
    const unexplained: string[] = []
    for (const { file, route, layer } of routes) {
      const allowed = isCustomDomainApiAllowed(route, productPrefixes)
      const manifest = byLayer.get(layer)
      // Eine App-Route unter einem Produkt-Präfix gehört zu diesem Produkt
      // (Not-Aus und Erlaubnis gleich, z. B. der Ticket-Kauf der comments-App
      // unter `/api/events`). Für Layer gilt nur das EIGENE Präfix —
      // `check:manifests` hält, dass kein Präfix eine fremde Layer-Route deckt.
      const prefixesOfOwner = layer.startsWith('apps/') ? productPrefixes : manifest?.kind === 'product' ? (manifest.apiPrefixes ?? []) : []
      const viaProduct = prefixesOfOwner.some(prefix => matchesApiPrefix(route, prefix))
        && !route.startsWith('/api/admin/')
      const viaEntry = customDomainAllowedEntry(route) !== null
      if (allowed && !viaProduct && !viaEntry) unexplained.push(file)
    }
    expect(unexplained).toEqual([])
  })

  it('kontoweite und verwaltende Routen fallen unter das 404 (Liste ausgeschrieben)', () => {
    for (const path of MUST_DENY) {
      expect(isCustomDomainApiAllowed(path, productPrefixes), path).toBe(false)
    }
  })

  it('die ausgeschriebenen Routen gibt es wirklich (sonst prüfte die Liste nichts)', () => {
    for (const path of MUST_DENY) {
      const exists = routes.some(({ route }) => route === path || (route.includes('[') && new RegExp(`^${route.replace(/\[[^\]]+\]/g, '[^/]+')}$`).test(path)))
      expect(exists, path).toBe(true)
    }
  })

  it('Gegenprobe: eine NEUE Core-Route ist verboten, eine neue Produkt-Route erlaubt, /api/admin bleibt zu', () => {
    expect(isCustomDomainApiAllowed('/api/auth/neue-route', productPrefixes)).toBe(false)
    expect(isCustomDomainApiAllowed('/api/community/neu', productPrefixes)).toBe(false)
    expect(isCustomDomainApiAllowed('/api/posts/neu/x', productPrefixes)).toBe(true)
    expect(isCustomDomainApiAllowed('/api/admin/comments/x/status', productPrefixes)).toBe(false)
    // Segmentgrenze: ein Präfix öffnet keine Nachbar-Route.
    expect(isCustomDomainApiAllowed('/api/healthcheck-export', productPrefixes)).toBe(false)
    expect(isCustomDomainApiAllowed('/api/auth/mekonto', productPrefixes)).toBe(false)
    expect(isCustomDomainApiAllowed('/api/presence-export', productPrefixes)).toBe(false)
  })

  it('Mitmachen bleibt erlaubt (Anmelden, Einlösen, Glocke, Anwesenheit, Hochladen, Melden)', () => {
    for (const path of ['/api/auth/login', '/api/auth/otp/verify', '/api/auth/me', '/api/auth/consent', '/api/auth/site-session', '/api/auth/embed-session',
      '/api/notifications', '/api/notifications/read', '/api/presence/heartbeat', '/api/storage/b/f', '/api/reports/resolve', '/api/config',
      '/api/health', '/api/_nuxt_icon/ph.json?icons=x', '/api/community/members/accept', '/api/posts', '/api/comments?targetId=x']) {
      expect(isCustomDomainApiAllowed(path, productPrefixes), path).toBe(true)
    }
  })

  it('Seiten und interne Pfade prüft die Regel nicht', () => {
    expect(isCustomDomainApiAllowed('/', productPrefixes)).toBe(true)
    expect(isCustomDomainApiAllowed('/_nuxt/x.js', productPrefixes)).toBe(true)
  })
})

// ─── Pure Regeln: Verwaltungs-Seiten und Kundenbereich ───────────────────────

describe('Verwaltungs-Seiten und Ausnahmen der Umleitung', () => {
  it('Dashboard mit und ohne Sprach-Präfix ist Verwaltung, Nachbarn nicht', () => {
    for (const path of ['/dashboard', '/dashboard/', '/dashboard/members', '/de/dashboard', '/de/dashboard/community/plan?x=1', '/en/dashboard']) {
      expect(isManagementPagePath(path), path).toBe(true)
    }
    for (const path of ['/', '/de', '/dashboards', '/discussions/dashboard', '/api/dashboard', '/de/login']) {
      expect(isManagementPagePath(path), path).toBe(false)
    }
  })

  it('auf der Pukalani-Adresse bleiben Verwaltung, Anmelde-Seiten, API und Interna', () => {
    for (const path of ['/dashboard', '/de/dashboard/members', '/login', '/de/login/code', '/register', '/verify?x=1', '/forgot-password', '/reset-password', '/api/auth/me', '/_nuxt/a.js', '/__nuxt_error']) {
      expect(staysOnPukalaniAddress(path), path).toBe(true)
    }
    for (const path of ['/', '/de', '/discussions/x', '/events', '/loginx']) {
      expect(staysOnPukalaniAddress(path), path).toBe(false)
    }
  })

  it('Adresse des Kundenbereichs aus der Config, lokal mit Port', () => {
    expect(accountAreaUrl(['account.pukalani.app'])).toBe('https://account.pukalani.app')
    expect(accountAreaUrl([' ', 'Account.Pukalani.App'])).toBe('https://account.pukalani.app')
    expect(accountAreaUrl(['account.localhost'], '3006')).toBe('http://account.localhost:3006')
    expect(accountAreaUrl([])).toBe('')
  })

  it('Konto-Menü: ohne eigene Domain wie vorher, mit eigener Domain Kundenbereich', () => {
    expect(accountMenuLinks({ scope: false, canDashboard: true, accountUrl: 'https://account.pukalani.app' }))
      .toEqual({ manage: { kind: 'dashboard' }, accountHref: null })
    expect(accountMenuLinks({ scope: false, canDashboard: false, accountUrl: 'https://account.pukalani.app' }))
      .toEqual({ manage: null, accountHref: null })
    expect(accountMenuLinks({ scope: true, canDashboard: true, accountUrl: 'https://account.pukalani.app' }))
      .toEqual({ manage: { kind: 'external', href: 'https://account.pukalani.app/communities' }, accountHref: 'https://account.pukalani.app' })
    expect(accountMenuLinks({ scope: true, canDashboard: false, accountUrl: 'https://account.pukalani.app' }))
      .toEqual({ manage: null, accountHref: 'https://account.pukalani.app' })
    // Ohne Kundenbereich lieber kein Link als einer ins Leere.
    expect(accountMenuLinks({ scope: true, canDashboard: true, accountUrl: '' })).toEqual({ manage: null, accountHref: null })
  })

  it('Rechte auf der eigenen Domain: owner/admin nur Redakteur ∪ Moderator, die anderen unverändert', () => {
    const owner = communityCapabilitiesFor('owner', true)
    const admin = communityCapabilitiesFor('admin', true)
    // Schreiben (Redakteur) und Moderieren bleiben — ausgeschrieben.
    for (const capability of ['pages.manage', 'events.manage', 'courses.manage', 'posts.write', 'media.manage', 'comments.moderate', 'reports.moderate', 'posts.moderate'] as const) {
      expect(owner.has(capability), capability).toBe(true)
      expect(admin.has(capability), capability).toBe(true)
    }
    // Verwalten fällt weg — ausgeschrieben.
    for (const capability of ['team.manage', 'branding.manage', 'posts.manage', 'posts.revise', 'community.billing', 'community.domain', 'community.export', 'community.delete', 'messages.manage'] as const) {
      expect(owner.has(capability), capability).toBe(false)
      expect(communityRoleHasCapability('owner', capability, true), capability).toBe(false)
    }
    for (const role of ['editor', 'moderator', 'viewer'] as const) {
      expect([...communityCapabilitiesFor(role, true)].sort(), role).toEqual([...communityCapabilitiesFor(role)].sort())
    }
    // Gegenprobe: ohne Merkmal hat der Owner alles wie bisher.
    expect(communityRoleHasCapability('owner', 'team.manage')).toBe(true)
    expect(communityCapabilitiesFor('owner').has('branding.manage')).toBe(true)
    expect(CUSTOM_DOMAIN_CAPABILITIES.has('team.manage')).toBe(false)
  })

  it('Wache (decideCommunityAccess): dieselbe Begrenzung, Betreiber-Not-Zugang bleibt', () => {
    const base = { labels: [] as string[], tenantScoped: true, role: 'owner' as const }
    expect(decideCommunityAccess({ ...base, capability: 'branding.manage', customDomainScope: true }).allowed).toBe(false)
    expect(decideCommunityAccess({ ...base, capability: 'pages.manage', customDomainScope: true }).allowed).toBe(true)
    expect(decideCommunityAccess({ ...base, capability: 'branding.manage', customDomainScope: false }).allowed).toBe(true)
    expect(decideCommunityAccess({ ...base, capability: 'branding.manage' }).allowed).toBe(true)
    expect(decideCommunityAccess({ ...base, labels: ['admin'], capability: 'branding.manage', customDomainScope: true })).toEqual({ allowed: true, via: 'operator' })
  })

  it('Wächter: jede Rechte-Frage unter server/ gibt das Merkmal mit (oder steht mit Grund in der Liste)', () => {
    const exempt: Record<string, string> = {
      'packages/admin/server/api/admin/search.get.ts': 'Dashboard-Route unter /api/admin — auf einer eigenen Domain ohnehin 404.',
      'packages/admin/server/api/admin/stats.get.ts': 'Dashboard-Route unter /api/admin — auf einer eigenen Domain ohnehin 404.',
      'packages/comments/server/plugins/dashboard-stats.ts': 'Beitrag zu /api/admin/stats — auf einer eigenen Domain ohnehin 404.',
    }
    const offenders: string[] = []
    const used = new Set<string>()
    for (const group of ['packages', 'apps']) {
      for (const layer of readdirSync(join(REPO, group)).sort()) {
        if (`${group}/${layer}` === 'packages/control') continue // Control Plane: eigener Server ohne eigene Domains der Communities
        for (const file of walk(join(REPO, group, layer, 'server'))) {
          const rel = `${group}/${layer}/server/${file}`
          const text = readFileSync(join(REPO, rel), 'utf8')
          const calls = [...text.matchAll(/(decideCommunityAccess\(\{[\s\S]*?\}\)|communityRoleHasCapability\([^)]*\))/g)].map(m => m[0])
          if (!calls.length) continue
          if (exempt[rel]) {
            used.add(rel)
            continue
          }
          if (calls.some(call => !call.includes('customDomainScope'))) offenders.push(rel)
        }
      }
    }
    expect(offenders).toEqual([])
    expect([...used].sort()).toEqual(Object.keys(exempt).sort())
  })

  it('Live-Verbindung: Token nur mit Sitzung und nicht auf der eigenen Domain', () => {
    expect(realtimeTokenWanted(true, false)).toBe(true)
    expect(realtimeTokenWanted(true, true)).toBe(false)
    expect(realtimeTokenWanted(false, false)).toBe(false)
    expect(realtimeTokenWanted(false, true)).toBe(false)
  })
})

// ─── Teil 2: Middleware 01.custom-domain-scope ───────────────────────────────

type Thrown = { status?: number, statusText?: string }
interface FakeEvent { path: string, method: string, headers: Record<string, string>, context: Record<string, unknown> }

const poolTenant = (over: Partial<Extract<TenantContext, { mode: 'pool' }>> = {}): TenantContext => ({
  mode: 'pool',
  projectId: 'account',
  tenantId: 't-a',
  communityId: 'c-a',
  canonicalHost: 'www.kunde.de',
  pukalaniHost: 'kunde-a.pukalani.app',
  ...over,
})

const key = randomBytes(32).toString('base64')

describe('01.custom-domain-scope', async () => {
  const { configureSiteCard } = await import('../server/utils/siteCard')
  const { registerProductManifest } = await import('../server/utils/productRegistry')
  let middleware: (event: FakeEvent) => unknown

  beforeEach(async () => {
    vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
    vi.stubGlobal('getHeader', (event: FakeEvent, name: string) => event.headers[name.toLowerCase()])
    vi.stubGlobal('createError', (init: { status: number, statusText: string }) => Object.assign(new Error(init.statusText), init))
    registerProductManifest({ key: 'posts', kind: 'product', apiPrefixes: ['/api/posts'] } as unknown as ProductManifest)
    registerProductManifest({ key: 'moderation', kind: 'foundation', apiPrefixes: ['/api/reports'] } as unknown as ProductManifest)
    middleware = (await import('../server/middleware/01.custom-domain-scope')).default as unknown as typeof middleware
  })

  afterEach(() => {
    configureSiteCard(undefined)
    vi.unstubAllGlobals()
  })

  /** `tenant: null` = kein Mandant (Kontroll-Host, Einzel-Instanz). */
  function run(path: string, host: string, tenant: TenantContext | null = poolTenant(), context: Record<string, unknown> = {}): { thrown: Thrown | null, event: FakeEvent } {
    const event: FakeEvent = { path, method: 'GET', headers: { host }, context: { ...context, ...(tenant ? { tenant } : {}) } }
    try {
      middleware(event)
      return { thrown: null, event }
    }
    catch (error) {
      return { thrown: error as Thrown, event }
    }
  }

  it('write + eigene Domain: Konto-Route 404, Mitmachen und Produkt durch, Merkmal gesetzt', () => {
    configureSiteCard({ mode: 'write', key })
    expect(run('/api/auth/password', 'www.kunde.de').thrown?.status).toBe(404)
    expect(run('/api/auth/realtime-token', 'www.kunde.de').thrown?.status).toBe(404)
    expect(run('/api/admin/users', 'www.kunde.de').thrown?.status).toBe(404)
    const ok = run('/api/posts/x', 'www.kunde.de')
    expect(ok.thrown).toBeNull()
    expect(ok.event.context.customDomainScope).toBe(true)
    expect(run('/api/auth/me', 'www.kunde.de').thrown).toBeNull()
    expect(run('/api/reports', 'www.kunde.de').thrown).toBeNull()
    expect(run('/', 'www.kunde.de').thrown).toBeNull()
  })

  it('write + Pukalani-Adresse, Kontroll-Host, kein Mandant: nichts ändert sich', () => {
    configureSiteCard({ mode: 'write', key })
    const pukalani = run('/api/auth/password', 'kunde-a.pukalani.app')
    expect(pukalani.thrown).toBeNull()
    expect(pukalani.event.context.customDomainScope).toBeUndefined()
    expect(run('/api/auth/password', 'account.pukalani.app', null, { controlCenter: true }).thrown).toBeNull()
    expect(run('/api/auth/password', 'localhost', null).thrown).toBeNull()
  })

  it('off und read: auch auf der eigenen Domain wie bisher', () => {
    for (const mode of [undefined, 'read'] as const) {
      configureSiteCard(mode ? { mode, key } : undefined)
      const result = run('/api/auth/password', 'www.kunde.de')
      expect(result.thrown, String(mode)).toBeNull()
      expect(result.event.context.customDomainScope, String(mode)).toBeUndefined()
    }
  })
})

// ─── Teil 3: Umleitung in 00.tenant ──────────────────────────────────────────

describe('00.tenant — Verwaltung bleibt unter der Pukalani-Adresse', async () => {
  const { configureSiteCard } = await import('../server/utils/siteCard')
  const { normalizeHost } = await import('../server/utils/tenantResolver')
  let middleware: (event: FakeEvent) => Promise<unknown>
  let tenant: TenantContext
  const sendRedirect = vi.fn(async (_event: unknown, target: string, status: number) => ({ target, status }))
  const setResponseHeader = vi.fn()

  beforeEach(async () => {
    tenant = poolTenant()
    sendRedirect.mockClear()
    vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
    vi.stubGlobal('useAppConfig', () => ({ pukalani: { tenancy: { enabled: true } } }))
    vi.stubGlobal('getTenantResolver', () => async () => tenant)
    vi.stubGlobal('normalizeHost', normalizeHost)
    vi.stubGlobal('getHeader', (event: FakeEvent, name: string) => event.headers[name])
    vi.stubGlobal('controlHosts', () => ['account.pukalani.app'])
    vi.stubGlobal('createError', (init: { status: number, statusText: string }) => Object.assign(new Error(init.statusText), init))
    vi.stubGlobal('logEvent', () => {})
    vi.stubGlobal('sendRedirect', sendRedirect)
    vi.stubGlobal('setResponseHeader', setResponseHeader)
    vi.resetModules()
    middleware = (await import('../server/middleware/00.tenant')).default as unknown as typeof middleware
  })

  afterEach(() => {
    configureSiteCard(undefined)
    vi.unstubAllGlobals()
  })

  const request = (path: string, host: string, method = 'GET'): FakeEvent => ({ path, method, headers: { host }, context: {} })

  it('write: Dashboard auf der eigenen Domain ⇒ 302 auf die Pukalani-Adresse (Pfad und Query reisen mit)', async () => {
    const { configureSiteCard: configure } = await import('../server/utils/siteCard')
    configure({ mode: 'write', key })
    await middleware(request('/de/dashboard/members?x=1', 'www.kunde.de'))
    expect(sendRedirect).toHaveBeenCalledTimes(1)
    expect(sendRedirect.mock.calls[0]?.[1]).toBe('https://kunde-a.pukalani.app/de/dashboard/members?x=1')
    expect(sendRedirect.mock.calls[0]?.[2]).toBe(302)
  })

  it('write: Pukalani-Adresse — Dashboard, Anmeldung und API bleiben, die Startseite geht weiter auf die eigene Domain', async () => {
    const { configureSiteCard: configure } = await import('../server/utils/siteCard')
    configure({ mode: 'write', key })
    for (const path of ['/dashboard', '/de/dashboard/community', '/login?redirect=/dashboard', '/api/community/members', '/_nuxt/a.js']) {
      sendRedirect.mockClear()
      await middleware(request(path, 'kunde-a.pukalani.app'))
      expect(sendRedirect, path).not.toHaveBeenCalled()
    }
    await middleware(request('/discussions', 'kunde-a.pukalani.app'))
    expect(sendRedirect.mock.calls.at(-1)?.[1]).toBe('https://www.kunde.de/discussions')
  })

  it('write: Mitmach-Seiten auf der eigenen Domain bleiben dort', async () => {
    const { configureSiteCard: configure } = await import('../server/utils/siteCard')
    configure({ mode: 'write', key })
    for (const path of ['/', '/discussions', '/login']) {
      await middleware(request(path, 'www.kunde.de'))
    }
    expect(sendRedirect).not.toHaveBeenCalled()
  })

  it('off und read: wie bisher — Dashboard auf der eigenen Domain bleibt, die Pukalani-Adresse leitet alles um', async () => {
    const { configureSiteCard: configure } = await import('../server/utils/siteCard')
    for (const mode of [undefined, 'read'] as const) {
      configure(mode ? { mode, key } : undefined)
      sendRedirect.mockClear()
      await middleware(request('/dashboard', 'www.kunde.de'))
      expect(sendRedirect, String(mode)).not.toHaveBeenCalled()
      await middleware(request('/dashboard', 'kunde-a.pukalani.app'))
      expect(sendRedirect.mock.calls.at(-1)?.[1], String(mode)).toBe('https://www.kunde.de/dashboard')
      expect(sendRedirect.mock.calls.at(-1)?.[2], String(mode)).toBe(301)
    }
  })

  it('Pfade ohne Mandanten-Auflösung tragen das Merkmal „Host nicht belegt"', async () => {
    for (const path of ['/api/health', '/_i18n/x/de/messages.json', '/api/_nuxt_icon/ph.json']) {
      const event = request(path, 'www.kunde.de')
      await middleware(event)
      expect(event.context.hostUnproven, path).toBe(true)
      expect(event.context.tenant, path).toBeUndefined()
    }
    const page = request('/', 'kunde-a.pukalani.app')
    await middleware(page)
    expect(page.context.hostUnproven).toBeUndefined()
  })
})

// ─── Teil 4: der Lesepunkt auf mandantenlosen Pfaden ────────────────────────

describe('Lesepunkt: Klartext gilt im Modus write nur auf belegt eigenen Hosts', async () => {
  const { configureSiteCard } = await import('../server/utils/siteCard')
  const { readRequestSession } = await import('../server/utils/requestSession')

  beforeEach(() => {
    vi.stubGlobal('getCookie', (event: { cookies: Record<string, string> }, name: string) => event.cookies[name])
    vi.stubGlobal('getHeader', (event: { headers: Record<string, string> }, name: string) => event.headers[name.toLowerCase()])
  })

  afterEach(() => {
    configureSiteCard(undefined)
    vi.unstubAllGlobals()
  })

  const event = (host: string, context: Record<string, unknown>) =>
    ({ method: 'GET', path: '/api/health', cookies: { a_session_account: 'klartext' }, headers: { host }, context }) as unknown as H3Event

  it('write: auf /api/health einer eigenen Domain (ohne Mandant) gilt Klartext nicht', () => {
    configureSiteCard({ mode: 'write', key })
    expect(readRequestSession(event('www.kunde.de', { hostUnproven: true }))).toBeNull()
  })

  it('Gegenprobe: Kontroll-Host und Pukalani-Adresse lesen Klartext weiter, read/off ebenso auf mandantenlosen Pfaden', () => {
    configureSiteCard({ mode: 'write', key })
    expect(readRequestSession(event('account.pukalani.app', { controlCenter: true }))?.format).toBe('plain')
    expect(readRequestSession(event('kunde-a.pukalani.app', { tenant: poolTenant() }))?.format).toBe('plain')
    configureSiteCard({ mode: 'read', key })
    expect(readRequestSession(event('www.kunde.de', { hostUnproven: true }))?.format).toBe('plain')
    configureSiteCard(undefined)
    expect(readRequestSession(event('www.kunde.de', { hostUnproven: true }))?.secret).toBe('klartext')
  })
})
