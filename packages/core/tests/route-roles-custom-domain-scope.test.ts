import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { probeRoute, resetCommunityWorld, type RouteProbe, type Who } from './support/participationHarness'
import { appwriteFake } from './support/appwriteFake'
import { coreKit } from './support/coreRouteKit'
import { OWN_DOMAIN as OWN, PUKALANI_ADDRESS, customDomainContext } from './support/customDomainScope'
import { configureSiteCard } from '../server/utils/siteCard'
import type { TenantContext } from '../shared/types/tenant'

/**
 * EIGENE DOMAIN — ROLLEN-TESTS AN DER ECHTEN ROUTE (OPS-009, PK1 E1b-2).
 *
 * Jede Probe fährt erst die ECHTE Middleware `01.custom-domain-scope.ts` mit
 * Host und Mandant, dann (wenn sie durchlässt) den ECHTEN Handler über den
 * Prüfstand. Verglichen wird mit einem zweiten Lauf desselben Handlers ohne
 * Middleware („wie bisher") — der Erwartungswert entsteht also nicht aus
 * derselben Antwort. Zusätzlich muss dieser Lauf selbst etwas anderes als
 * 404 liefern, sonst bewiese der Vergleich nichts.
 *
 *  - kontoweite Routen: eigene Domain im Modus `write` ⇒ 404 (der Handler
 *    läuft gar nicht), Pukalani-Adresse ⇒ wie bisher;
 *  - Mitmach-Routen: auf der eigenen Domain wie bisher;
 *  - Modus `read`: auf der eigenen Domain alles wie bisher.
 */

vi.mock('../server/lib/appwrite', async () => (await import('./support/appwriteFake')).appwriteLibMock)
vi.mock('../server/utils/logEvent', () => ({ logEvent: () => {} }))

const key = randomBytes(32).toString('base64')
const PUKALANI = PUKALANI_ADDRESS
const OWN_DOMAIN = OWN

const tenant: TenantContext = {
  mode: 'pool',
  projectId: 'account',
  tenantId: 't-a',
  communityId: 'c-a',
  canonicalHost: OWN_DOMAIN,
  pukalaniHost: PUKALANI,
} as TenantContext

type Load = () => Promise<{ default: unknown }>

beforeEach(() => {
  appwriteFake.reset()
})

afterEach(() => {
  configureSiteCard(undefined)
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

/** Status der Middleware allein: 404 oder `null` (lässt durch). */
async function scopeStatus(path: string, host: string): Promise<number | null> {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('getHeader', (event: { headers: Record<string, string> }, name: string) => event.headers[name.toLowerCase()])
  vi.stubGlobal('createError', (init: { status: number, statusText: string }) => Object.assign(new Error(init.statusText), init))
  const middleware = (await import('../server/middleware/01.custom-domain-scope')).default as unknown as (event: unknown) => void
  try {
    middleware({ path, method: 'GET', headers: { host }, context: { tenant } })
    return null
  }
  catch (error) {
    return (error as { status?: number }).status ?? 500
  }
}

/** Middleware + Handler: so antwortet die App unter diesem Host. */
async function through(path: string, host: string, load: Load, probe: RouteProbe): Promise<number> {
  const blocked = await scopeStatus(path, host)
  if (blocked !== null) return blocked
  return (await probeRoute(load, probe)).status
}

async function asBefore(load: Load, probe: RouteProbe): Promise<number> {
  return (await probeRoute(load, probe)).status
}

interface Case { name: string, path: string, load: Load, probe: (who: Who) => RouteProbe }

const ACCOUNT_WIDE: Case[] = [
  {
    name: 'PUT /api/auth/password',
    path: '/api/auth/password',
    load: () => import('../server/api/auth/password.put'),
    probe: who => ({ who, body: { currentPassword: 'alt-alt-alt-1', password: 'neu-neu-neu-neu-2' }, globals: coreKit().globals }),
  },
  {
    name: 'GET /api/auth/sessions',
    path: '/api/auth/sessions',
    load: () => import('../server/api/auth/sessions/index.get'),
    probe: who => ({ who, globals: { ...coreKit().globals, mapSafeSession: (s: { $id: string }) => s, lookupCityForIp: async () => '' } }),
  },
  {
    name: 'GET /api/auth/realtime-token',
    path: '/api/auth/realtime-token',
    load: () => import('../server/api/auth/realtime-token.get'),
    probe: who => ({ who, globals: coreKit().globals }),
  },
  {
    name: 'GET /api/auth/export',
    path: '/api/auth/export',
    load: () => import('../server/api/auth/export.get'),
    probe: who => ({ who, globals: coreKit().globals }),
  },
]

const PARTICIPATION: Case[] = [
  {
    name: 'POST /api/notifications/read',
    path: '/api/notifications/read',
    load: () => import('../server/api/notifications/read.post'),
    probe: who => ({ who, body: { ids: ['n-1'] }, globals: coreKit().globals }),
  },
  {
    name: 'GET /api/community/role',
    path: '/api/community/role',
    load: () => import('../server/api/community/role.get'),
    probe: who => ({ who, globals: coreKit().globals }),
  },
]

const PEOPLE: Who[] = ['guest', 'member', 'owner']

describe('kontoweite Routen', () => {
  for (const route of ACCOUNT_WIDE) {
    describe(route.name, () => {
      it('eigene Domain im Modus write ⇒ 404 für jede Person', async () => {
        configureSiteCard({ mode: 'write', key })
        for (const who of PEOPLE) {
          expect(await through(route.path, OWN_DOMAIN, route.load, route.probe(who)), who).toBe(404)
        }
      })

      it('Pukalani-Adresse im Modus write ⇒ wie bisher', async () => {
        configureSiteCard({ mode: 'write', key })
        for (const who of PEOPLE) {
          const before = await asBefore(route.load, route.probe(who))
          expect(before, `${who}: der Vergleich bewiese sonst nichts`).not.toBe(404)
          expect(await through(route.path, PUKALANI, route.load, route.probe(who)), who).toBe(before)
        }
      })

      it('Modus read auf der eigenen Domain ⇒ wie bisher', async () => {
        configureSiteCard({ mode: 'read', key })
        for (const who of PEOPLE) {
          const before = await asBefore(route.load, route.probe(who))
          expect(await through(route.path, OWN_DOMAIN, route.load, route.probe(who)), who).toBe(before)
        }
      })
    })
  }
})

describe('Mitmach-Routen', () => {
  for (const route of PARTICIPATION) {
    it(`${route.name}: auf der eigenen Domain im Modus write wie bisher`, async () => {
      configureSiteCard({ mode: 'write', key })
      for (const who of PEOPLE) {
        const before = await asBefore(route.load, route.probe(who))
        expect(before, who).not.toBe(404)
        expect(await through(route.path, OWN_DOMAIN, route.load, route.probe(who)), who).toBe(before)
      }
    })
  }
})

describe('Rolle auf der eigenen Domain bleibt, die Rechte werden begrenzt', () => {
  const loadRole = () => import('../server/api/community/role.get')

  async function roleOf(who: Who, context: Record<string, unknown>): Promise<unknown> {
    const run = await probeRoute(loadRole, { who, context, globals: coreKit().globals })
    return (run.result as { role?: unknown } | undefined)?.role
  }

  it('write + eigene Domain: die gemeldete Rolle bleibt owner/admin (Anzeige, Mitgliedschaft)', async () => {
    const context = await customDomainContext('write', OWN_DOMAIN, '/api/community/role')
    expect(context.customDomainScope).toBe(true)
    expect(await roleOf('owner', context)).toBe('owner')
    expect(await roleOf('admin', context)).toBe('admin')
    expect(await roleOf('member', context)).toBe('viewer')
  })

  it('Gegenprobe: Pukalani-Adresse und read setzen kein Merkmal', async () => {
    expect((await customDomainContext('write', PUKALANI_ADDRESS, '/api/community/role')).customDomainScope).toBeUndefined()
    expect((await customDomainContext('read', OWN_DOMAIN, '/api/community/role')).customDomainScope).toBeUndefined()
  })
})
