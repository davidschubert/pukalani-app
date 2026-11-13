import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import * as join from '../../server/utils/communityJoin'
import * as permission from '../../server/utils/communityPermission'
import * as participation from '../../server/utils/communityParticipation'

/**
 * PRÜFSTAND „GEHÖRT DIESE PERSON ZU DIESER COMMUNITY?" (SEC-030).
 *
 * Eine kleine, aber ECHTE Welt: die Core-Wachen (`requireCommunityParticipant`,
 * `requireCommunityMembership`), der Beitritt (`joinCommunity` samt
 * Kurzzeit-Gedächtnis) und die Rollen-Auflösung laufen unverändert mit.
 * Nachgebildet wird nur, was hinter einer Naht liegt: der Rollen-Resolver
 * (Control Plane, 30-s-Cache) und der Beitritts-Handler (Service-Naht des
 * onboarding-Layers). Nitros Auto-Imports sind zur Testzeit Globals — dieselbe
 * Bauart wie `packages/courses/tests/support/courseRouteHarness.ts`.
 *
 * Die Personen:
 *  - `member`   — hat eine Rolle und das Label.
 *  - `stranger` — Konto aus einer ANDEREN Community: keine Rolle, kein Label.
 *  - `removed`  — gerade entfernt. Der Rollen-Cache sagt noch 30 s lang
 *                 „viewer" (so ist er gebaut), die Notiz
 *                 `rememberCommunityAccessRevoked` steht aber schon.
 *  - `legacy`   — trägt das Label, hat aber (noch) keine Zeile: Bestand aus
 *                 der A4-Zeit, für die Mitgliedschaft ein Mitglied.
 *  - `guest`    — kein Konto.
 */

export type Who = 'guest' | 'member' | 'stranger' | 'removed' | 'legacy'

export interface CommunityWorld {
  who: Who
  /** Pool (Standard) oder Silo (kein Mandant: das Projekt ist die Grenze). */
  mode?: 'pool' | 'silo'
  /** Registrierung der Community. Standard: geschlossen (nur per Einladung). */
  registration?: 'open' | 'closed'
  /** Zahlungssperre M13: Inhalte sind zu. */
  suspended?: boolean
  /**
   * Zustand der Naht zum Control Plane: `up` (Standard), `down` (der Handler
   * wirft ⇒ `unavailable`) oder `none` (kein Handler registriert).
   */
  seam?: 'up' | 'down' | 'none'
}

export const COMMUNITY_ID = 'c-a'
export const TENANT_SCOPE = 't-a'

export interface WiredWorld {
  event: H3Event
  /** Wie oft der Beitritts-Handler (also das Control Plane) gefragt wurde. */
  joinHandlerCalls: () => number
}

export interface ThrownLike {
  status?: number
  statusText?: string
  data?: { code?: string }
}

const USER_IDS: Record<Exclude<Who, 'guest'>, string> = {
  member: 'u-member',
  stranger: 'u-stranger',
  removed: 'u-removed',
  legacy: 'u-legacy',
}

function makeError(init: Record<string, unknown>): Error {
  return Object.assign(new Error(String(init.statusText ?? 'Error')), init, { statusCode: init.status })
}

/** Baut die Welt und hängt die echten Core-Funktionen als Globals ein. */
export function wireCommunityWorld(world: CommunityWorld): WiredWorld {
  join.__resetCommunityJoinHandler()
  join.__resetCommunityJoinMemory()
  permission.__resetCommunityRoleResolver()

  const mode = world.mode ?? 'pool'
  const tenant = mode === 'pool'
    ? { mode: 'pool', tenantId: TENANT_SCOPE, communityId: COMMUNITY_ID, projectId: 'pool', suspension: world.suspended ? 'billing' : '' }
    : null
  const user = world.who === 'guest'
    ? undefined
    : {
        $id: USER_IDS[world.who],
        name: 'Testperson',
        labels: world.who === 'member' || world.who === 'legacy' ? [COMMUNITY_ID] : [] as string[],
      }
  const event = { context: { user, tenant }, path: '/api/test', method: 'POST' } as unknown as H3Event

  // Rollen-Resolver (Control Plane, 30-s-Cache). Der Entfernte steht dort noch
  // als `viewer` — genau das Loch, das die Notiz schließen soll.
  permission.registerCommunityRoleResolver(({ runtimeUserId }) =>
    runtimeUserId === USER_IDS.member || runtimeUserId === USER_IDS.removed ? 'viewer' : null)

  let handlerCalls = 0
  const seam = world.seam ?? 'up'
  if (seam !== 'none') {
    join.registerCommunityJoinHandler(() => {
      handlerCalls += 1
      if (seam === 'down') throw new Error('control plane unreachable')
      if (world.who === 'member') return 'member'
      if (world.who === 'removed') return 'removed'
      return world.registration === 'open' ? 'joined' : 'closed'
    })
  }
  if (world.who === 'removed') join.rememberCommunityAccessRevoked(COMMUNITY_ID, USER_IDS.removed)

  vi.stubGlobal('createError', makeError)
  vi.stubGlobal('logEvent', () => {})
  vi.stubGlobal('useTenant', (e: H3Event) => e.context.tenant ?? null)
  vi.stubGlobal('resolveTrustLevel', async () => 0)
  vi.stubGlobal('grantCommunityLabel', async (e: H3Event, communityId: string) => {
    const labels = e.context.user?.labels
    if (labels && !labels.includes(communityId)) labels.push(communityId)
  })
  vi.stubGlobal('revokeCommunityLabel', async (e: H3Event, communityId: string) => {
    const current = e.context.user
    if (current?.labels) current.labels = current.labels.filter(label => label !== communityId)
    // Vertrag seit SEC-024: der Entzug meldet sein Ergebnis.
    return { revoked: true }
  })
  vi.stubGlobal('resolveCommunityRole', permission.resolveCommunityRole)
  vi.stubGlobal('resolveCommunityMembership', permission.resolveCommunityMembership)
  vi.stubGlobal('requireCommunityMembership', permission.requireCommunityMembership)
  vi.stubGlobal('communityAccessRecentlyDenied', join.communityAccessRecentlyDenied)
  vi.stubGlobal('joinCommunity', join.joinCommunity)
  vi.stubGlobal('requireCommunityParticipant', participation.requireCommunityParticipant)

  return { event, joinHandlerCalls: () => handlerCalls }
}

/** Nach jedem Test: Registries leeren (die Globals räumt `vi.unstubAllGlobals`). */
export function resetCommunityWorld(): void {
  join.__resetCommunityJoinHandler()
  join.__resetCommunityJoinMemory()
  permission.__resetCommunityRoleResolver()
}

// ── Routen-Proben ───────────────────────────────────────────────────────────

export interface RouteProbe extends CommunityWorld {
  params?: Record<string, string>
  query?: Record<string, string>
  body?: unknown
  /** Zusätzliche Globals, die eine bestimmte Route vor der Datentür braucht. */
  globals?: Record<string, unknown>
}

export interface ProbeRun {
  status: number
  error?: ThrownLike
  /** Hat eine der Mitgliedschafts-Wachen „durch" gesagt? */
  guardPassed: boolean
  /** Wurde die Datentür geöffnet (egal mit welcher Klinke)? */
  doorOpened: boolean
  joinHandlerCalls: number
}

/** Die Datentür endet in den Proben hier: geprüft wird die Wache DAVOR. */
class DoorReached extends Error {}

/**
 * Führt einen ECHTEN Routen-Handler gegen die Welt aus. Ergebnis: ob die Wache
 * durchließ und ob die Datentür überhaupt geöffnet wurde. Alles hinter der Tür
 * (Tabellen, Zähler, Benachrichtigungen) ist nicht Gegenstand dieser Probe —
 * dafür haben die Layer ihre eigenen Tests.
 */
export async function probeRoute(
  load: () => Promise<{ default: unknown }>,
  probe: RouteProbe,
): Promise<ProbeRun> {
  const wired = wireCommunityWorld(probe)
  let guardPassed = false
  let doorOpened = false

  const passing = <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      const result = await fn(...args)
      guardPassed = true
      return result
    }
  vi.stubGlobal('requireCommunityMembership', passing(permission.requireCommunityMembership))
  vi.stubGlobal('requireCommunityParticipant', passing(participation.requireCommunityParticipant))

  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('getRouterParam', (_e: unknown, name: string) => probe.params?.[name])
  vi.stubGlobal('getQuery', () => probe.query ?? {})
  vi.stubGlobal('readBody', async () => probe.body ?? {})
  vi.stubGlobal('readValidatedBody', async (_e: unknown, parse: (b: unknown) => unknown) => parse(probe.body ?? {}))
  vi.stubGlobal('setResponseStatus', () => {})
  vi.stubGlobal('setHeader', () => {})
  vi.stubGlobal('toH3Error', (e: unknown) => e)
  vi.stubGlobal('requirePlanProduct', () => {})
  vi.stubGlobal('useAppConfig', () => ({}))
  vi.stubGlobal('getAppConfig', async () => ({ maintenanceMode: false }))
  vi.stubGlobal('isAiConfigured', async () => true)
  vi.stubGlobal('assertNotMaintenance', async () => {})
  vi.stubGlobal('assertCommentsWritable', async () => {})
  vi.stubGlobal('assertEventsWritable', async () => {})
  vi.stubGlobal('assertPoolWriteQuota', async () => {})
  vi.stubGlobal('assertContentWritable', async () => {})
  vi.stubGlobal('useRateLimitStore', () => ({ store: { hit: async () => ({ count: 1, resetInMs: 1000 }) }, prefix: '' }))
  vi.stubGlobal('tenantDb', () => {
    doorOpened = true
    throw new DoorReached('door')
  })
  for (const [name, value] of Object.entries(probe.globals ?? {})) vi.stubGlobal(name, value)

  const mod = await load()
  const handler = mod.default as (e: H3Event) => Promise<unknown>
  try {
    await handler(wired.event)
    return { status: 200, guardPassed, doorOpened, joinHandlerCalls: wired.joinHandlerCalls() }
  }
  catch (thrown) {
    if (thrown instanceof DoorReached) {
      return { status: 200, guardPassed, doorOpened, joinHandlerCalls: wired.joinHandlerCalls() }
    }
    const error = thrown as ThrownLike
    return { status: error.status ?? 500, error, guardPassed, doorOpened, joinHandlerCalls: wired.joinHandlerCalls() }
  }
}

/**
 * Die Standard-Proben je Route, damit jedes Produkt dieselben Fragen stellt:
 *  - `participant` — Mitmachen (erster eigener Schreibvorgang): bei offener
 *    Registrierung tritt ein fremdes Konto bei, sonst 403.
 *  - `membership`  — eigenes Ändern/Zurückziehen/Übersetzen: verlangt die
 *    Mitgliedschaft, macht aber NIEMANDEN zum Mitglied.
 *  - `report`      — Melden: wie `participant`, bleibt aber in einer
 *    gesperrten Community für Mitglieder offen (Moderation ist kein Inhalt).
 */
export function describeGuardedRoute(
  name: string,
  load: () => Promise<{ default: unknown }>,
  kind: 'participant' | 'membership' | 'report',
  base: Omit<RouteProbe, 'who'> = {},
): void {
  describe(`${name} (${kind})`, () => {
    afterEach(() => {
      resetCommunityWorld()
      vi.unstubAllGlobals()
    })

    const notMember = (run: ProbeRun) => {
      expect(run.status).toBe(403)
      expect(run.error?.data?.code).toBe('not_a_member')
      expect(run.guardPassed).toBe(false)
      expect(run.doorOpened, 'die Datentür bleibt zu').toBe(false)
    }

    it('ohne Konto: 401, Datentür zu', async () => {
      const run = await probeRoute(load, { ...base, who: 'guest' })
      expect(run.status).toBe(401)
      expect(run.doorOpened).toBe(false)
    })

    it('Mitglied: die Wache lässt durch', async () => {
      const run = await probeRoute(load, { ...base, who: 'member' })
      expect(run.guardPassed).toBe(true)
      expect([401, 403]).not.toContain(run.status)
    })

    it('fremdes Konto, geschlossene Registrierung: 403 not_a_member', async () => {
      notMember(await probeRoute(load, { ...base, who: 'stranger', registration: 'closed' }))
    })

    it('entfernt (Rollen-Cache sagt noch „viewer"): 403 not_a_member', async () => {
      notMember(await probeRoute(load, { ...base, who: 'removed' }))
    })

    if (kind === 'membership') {
      it('fremdes Konto, offene Registrierung: 403 — Ändern ist kein Beitritt', async () => {
        const run = await probeRoute(load, { ...base, who: 'stranger', registration: 'open' })
        notMember(run)
        expect(run.joinHandlerCalls).toBe(0)
      })
    }
    else {
      it('fremdes Konto, offene Registrierung: der Schreibvorgang ist der Beitritt', async () => {
        const run = await probeRoute(load, { ...base, who: 'stranger', registration: 'open' })
        expect(run.guardPassed).toBe(true)
        expect(run.joinHandlerCalls).toBe(1)
      })
    }

    it('Silo: angemeldet genügt', async () => {
      const run = await probeRoute(load, { ...base, who: 'stranger', mode: 'silo' })
      expect(run.guardPassed).toBe(true)
    })

    if (kind === 'participant') {
      it('gesperrte Community: 403 community_suspended, kein Beitrittsversuch', async () => {
        const run = await probeRoute(load, { ...base, who: 'stranger', registration: 'open', suspended: true })
        expect(run.status).toBe(403)
        expect(run.error?.data?.code).toBe('community_suspended')
        expect(run.joinHandlerCalls).toBe(0)
        expect(run.doorOpened).toBe(false)
      })
    }

    if (kind === 'report') {
      it('gesperrte Community: ein Mitglied darf melden', async () => {
        const run = await probeRoute(load, { ...base, who: 'member', suspended: true })
        expect(run.guardPassed).toBe(true)
      })

      it('gesperrte Community: ein fremdes Konto nicht, und es tritt nicht bei', async () => {
        const run = await probeRoute(load, { ...base, who: 'stranger', registration: 'open', suspended: true })
        notMember(run)
        expect(run.joinHandlerCalls).toBe(0)
      })
    }
  })
}
