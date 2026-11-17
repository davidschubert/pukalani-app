import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import * as join from '../../server/utils/communityJoin'
import * as permission from '../../server/utils/communityPermission'
import * as participation from '../../server/utils/communityParticipation'
import * as instancePermission from '../../server/utils/requirePermission'
import type { CommunityRole } from '../../shared/communityAuthz'

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
 *
 * Dazu das Team (P27/OPS-009) — je eine Community-Rolle und das Label:
 *  - `owner`, `admin`, `moderator`, `editor`.
 *  - `operator` — der Betreiber: trägt das globale Instanz-Label `admin`
 *                 (`shared/authz.ts`: alle Capabilities). Im Pool ist das der
 *                 protokollierte Not-Zugang von `requireCommunityPermission`.
 *                 KEINE Community-Rolle, KEIN Community-Label — für die
 *                 Mitgliedschafts-Wachen ist er also kein Mitglied.
 *
 * `member` bleibt die Rolle `viewer` mit Label.
 */

export type TeamRole = 'owner' | 'admin' | 'moderator' | 'editor'

/** Die Personen, die ein Rollen-Tor kennen (für `describeRoleGatedRoute`). */
export type RoleWho = TeamRole | 'member' | 'operator'

export type Who = 'guest' | 'member' | 'stranger' | 'removed' | 'legacy' | TeamRole | 'operator'

export interface CommunityWorld {
  who: Who
  /**
   * Pool (Standard), Silo (kein Mandant: das Projekt ist die Grenze) oder
   * Kontroll-Host (`control`: kein Mandant, dazu `event.context.controlCenter`
   * — dort leben Trichter und Konto-Bereich des onboarding-Layers).
   */
  mode?: 'pool' | 'silo' | 'control'
  /** Registrierung der Community. Standard: geschlossen (nur per Einladung). */
  registration?: 'open' | 'closed'
  /** Zahlungssperre M13: Inhalte sind zu. */
  suspended?: boolean
  /**
   * Zustand der Naht zum Control Plane: `up` (Standard), `down` (der Handler
   * wirft ⇒ `unavailable`) oder `none` (kein Handler registriert).
   */
  seam?: 'up' | 'down' | 'none'
  /**
   * Weitere Felder im Mandanten-Kontext des Pools (z. B. `audience`,
   * `trialEndsAt`, `name`). Ohne Pool-Mandanten wirkungslos.
   */
  tenantFields?: Record<string, unknown>
  /** Weitere Felder am Konto (z. B. `prefs`, `email`). Beim Gast wirkungslos. */
  userFields?: Record<string, unknown>
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
  owner: 'u-owner',
  admin: 'u-admin',
  moderator: 'u-moderator',
  editor: 'u-editor',
  operator: 'u-operator',
}

/** Konto-Id einer Person der Welt (z. B. für `authorId` in einer Proben-Zeile). */
export function userIdOf(who: Exclude<Who, 'guest'>): string {
  return USER_IDS[who]
}

/**
 * Was der Rollen-Resolver (Control Plane, 30-s-Cache) je Person sagt. Der
 * Entfernte steht dort noch als `viewer` — genau das Loch, das die Notiz
 * `rememberCommunityAccessRevoked` schließen soll.
 */
const ROLE_OF: Record<Exclude<Who, 'guest'>, CommunityRole | null> = {
  member: 'viewer',
  removed: 'viewer',
  owner: 'owner',
  admin: 'admin',
  moderator: 'moderator',
  editor: 'editor',
  stranger: null,
  legacy: null,
  operator: null,
}

/** Globales Instanz-Label des Betreibers (`shared/authz.ts`, Rolle `admin`). */
export const OPERATOR_LABEL = 'admin'

function labelsOf(who: Exclude<Who, 'guest'>): string[] {
  if (who === 'operator') return [OPERATOR_LABEL]
  if (who === 'stranger' || who === 'removed') return []
  return [COMMUNITY_ID]
}

/** Hat die Person eine Zeile mit Zugang (für den Beitritts-Handler)? */
function isRowMember(who: Who): boolean {
  return who === 'member' || who === 'owner' || who === 'admin' || who === 'moderator' || who === 'editor'
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
    ? { mode: 'pool', tenantId: TENANT_SCOPE, communityId: COMMUNITY_ID, projectId: 'pool', suspension: world.suspended ? 'billing' : '', ...world.tenantFields }
    : null
  const user = world.who === 'guest'
    ? undefined
    : {
        $id: USER_IDS[world.who],
        name: 'Testperson',
        labels: labelsOf(world.who),
        ...world.userFields,
      }
  const context: Record<string, unknown> = { user, tenant }
  if (mode === 'control') context.controlCenter = true
  const event = { context, path: '/api/test', method: 'POST' } as unknown as H3Event

  // Rollen-Resolver (Control Plane, 30-s-Cache): die Rolle je Person (ROLE_OF).
  permission.registerCommunityRoleResolver(({ runtimeUserId }) => {
    const who = (Object.keys(USER_IDS) as Array<Exclude<Who, 'guest'>>).find(key => USER_IDS[key] === runtimeUserId)
    return who ? ROLE_OF[who] : null
  })

  let handlerCalls = 0
  const seam = world.seam ?? 'up'
  if (seam !== 'none') {
    join.registerCommunityJoinHandler(() => {
      handlerCalls += 1
      if (seam === 'down') throw new Error('control plane unreachable')
      if (isRowMember(world.who)) return 'member'
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
  /**
   * Eine nachgebaute Datentür (z. B. `fakeDoor(…).tenantDb` aus `doorFake.ts`)
   * für Routen, die ERST lesen und DANN fragen. Ohne Angabe endet die Probe
   * beim ersten `tenantDb()`. Gezählt wird das Öffnen in beiden Fällen.
   */
  door?: (event: H3Event, options?: { as?: 'member' | 'operator', actor?: string }) => unknown
}

export interface ProbeRun {
  status: number
  error?: ThrownLike
  /**
   * Hat eine Wache „durch" gesagt? Gezählt werden die Mitgliedschafts-Wachen
   * (`requireCommunityMembership`, `requireCommunityParticipant`) und die
   * Rollen-Tore (`requireCommunityPermission`, `requirePermission`) — jeweils
   * die ECHTE Funktion, nur umwickelt. `requireCommunityTeamGate` liegt im
   * onboarding-Layer: sie ruft `requireCommunityPermission` und zählt darüber.
   */
  guardPassed: boolean
  /**
   * Wurde die Datentür geöffnet (egal mit welcher Klinke)? Dazu zählen auch
   * die rohen Clients `createSessionClient` und `createAdminClient`.
   */
  doorOpened: boolean
  joinHandlerCalls: number
  /** Was der Handler zurückgab (nur bei Status 200 ohne Datentür-Ende). */
  result?: unknown
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
  // `requirePermission` ist SYNCHRON (und wird ohne await gerufen) — die Hülle
  // muss es auch sein, sonst wäre jede Prüfung ein wahrheitswertiges Promise.
  const passingSync = <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      const result = fn(...args)
      guardPassed = true
      return result
    }
  vi.stubGlobal('requireCommunityMembership', passing(permission.requireCommunityMembership))
  vi.stubGlobal('requireCommunityParticipant', passing(participation.requireCommunityParticipant))
  vi.stubGlobal('requireCommunityPermission', passing(permission.requireCommunityPermission))
  vi.stubGlobal('requirePermission', passingSync(instancePermission.requirePermission))

  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('getRouterParam', (_e: unknown, name: string) => probe.params?.[name])
  vi.stubGlobal('getQuery', () => probe.query ?? {})
  vi.stubGlobal('getValidatedQuery', async (_e: unknown, parse: (q: unknown) => unknown) => parse(probe.query ?? {}))
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
  vi.stubGlobal('tenantDb', (event: H3Event, options?: { as?: 'member' | 'operator', actor?: string }) => {
    doorOpened = true
    if (probe.door) return probe.door(event, options)
    throw new DoorReached('door')
  })
  const rawClient = () => {
    doorOpened = true
    throw new DoorReached('door')
  }
  vi.stubGlobal('createSessionClient', rawClient)
  vi.stubGlobal('createAdminClient', rawClient)
  for (const [name, value] of Object.entries(probe.globals ?? {})) vi.stubGlobal(name, value)

  const mod = await load()
  const handler = mod.default as (e: H3Event) => Promise<unknown>
  try {
    const result = await handler(wired.event)
    return { status: 200, guardPassed, doorOpened, joinHandlerCalls: wired.joinHandlerCalls(), result }
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

// ── Rollen-Tore und Konto-Routen (P27, OPS-009) ─────────────────────────────

/** Alle Personen, über die ein Rollen-Tor entscheidet. */
export const ROLE_PEOPLE: readonly RoleWho[] = ['owner', 'admin', 'moderator', 'editor', 'member', 'operator']

export interface RoleExpectation {
  /** Wer durch das Tor kommt — AUSGESCHRIEBEN im Test, nie berechnet. */
  allow: readonly RoleWho[]
  /** Wer abgewiesen wird (403, Datentür zu). */
  deny: readonly RoleWho[]
}

/**
 * Proben für eine Route hinter einem ROLLEN-TOR (`requireCommunityPermission`,
 * `requirePermission`, `requireCommunityTeamGate`).
 *
 * Die Erwartung steht im Test, Person für Person. Sie darf NICHT aus der
 * Rechte-Matrix (`communityAuthz.ts`, `authz.ts`) abgeleitet werden: das wäre
 * dieselbe Antwort, die geprüft wird, und damit immer grün (Beweis-Regel 1,
 * `.claude/rules/tests.md`). Jede Person aus `ROLE_PEOPLE` steht in GENAU
 * einer der beiden Listen — eine vergessene Person ist ein roter Fall.
 *
 * Immer dabei: Gast ⇒ 401, fremdes Konto ⇒ 403, entferntes Konto ⇒ 403 —
 * jeweils mit geschlossener Datentür.
 */
export function describeRoleGatedRoute(
  name: string,
  load: () => Promise<{ default: unknown }>,
  expectation: RoleExpectation,
  base: Omit<RouteProbe, 'who'> = {},
): void {
  describe(`${name} (Rollen-Tor)`, () => {
    afterEach(() => {
      resetCommunityWorld()
      vi.unstubAllGlobals()
    })

    const denied = (run: ProbeRun) => {
      expect(run.status).toBe(403)
      expect(run.guardPassed, 'die Wache lässt nicht durch').toBe(false)
      expect(run.doorOpened, 'die Datentür bleibt zu').toBe(false)
    }

    it('die Erwartung nennt jede Person genau einmal', () => {
      const named = [...expectation.allow, ...expectation.deny]
      expect([...named].sort()).toEqual([...ROLE_PEOPLE].sort())
    })

    it('ohne Konto: 401, Datentür zu', async () => {
      const run = await probeRoute(load, { ...base, who: 'guest' })
      expect(run.status).toBe(401)
      expect(run.doorOpened).toBe(false)
    })

    it('fremdes Konto: 403, Datentür zu', async () => {
      denied(await probeRoute(load, { ...base, who: 'stranger' }))
    })

    it('entferntes Konto (Rollen-Cache sagt noch „viewer"): 403, Datentür zu', async () => {
      denied(await probeRoute(load, { ...base, who: 'removed' }))
    })

    for (const who of expectation.deny) {
      it(`${who}: 403, Datentür zu`, async () => {
        denied(await probeRoute(load, { ...base, who }))
      })
    }

    for (const who of expectation.allow) {
      it(`${who}: die Wache lässt durch`, async () => {
        const run = await probeRoute(load, { ...base, who })
        expect(run.guardPassed).toBe(true)
        expect([401, 403]).not.toContain(run.status)
      })
    }
  })
}

/**
 * Wie `describeRoleGatedRoute`, dazu je durchgelassener Person: Status 200 und
 * die Datentür wird wirklich erreicht. Ohne diesen Zusatz sähe ein Absturz
 * hinter der Wache („weder 401 noch 403") wie ein Durchlass aus.
 */
export function describeRoleGateToDoor(
  name: string,
  load: () => Promise<{ default: unknown }>,
  expectation: RoleExpectation,
  base: Omit<RouteProbe, 'who'> = {},
): void {
  describeRoleGatedRoute(name, load, expectation, base)
  describe(`${name} — Durchgelassene erreichen die Datentür`, () => {
    afterEach(() => {
      resetCommunityWorld()
      vi.unstubAllGlobals()
    })
    for (const who of expectation.allow) {
      it(`${who}: Datentür erreicht`, async () => {
        const run = await probeRoute(load, { ...base, who })
        expect(run.status).toBe(200)
        expect(run.doorOpened).toBe(true)
      })
    }
  })
}

/**
 * Proben für eine Route, die nur „angemeldet" verlangt und ausschließlich über
 * das EIGENE Konto antwortet (Einstellungen, eigene Liste, Abmelden …). Ein
 * Rollen- oder Mitgliedschafts-Tor wäre hier falsch: das Konto gehört der
 * Person, nicht der Community.
 */
export function describeAccountRoute(
  name: string,
  load: () => Promise<{ default: unknown }>,
  base: Omit<RouteProbe, 'who'> = {},
): void {
  describe(`${name} (eigenes Konto)`, () => {
    afterEach(() => {
      resetCommunityWorld()
      vi.unstubAllGlobals()
    })

    it('ohne Konto: 401, Datentür zu', async () => {
      const run = await probeRoute(load, { ...base, who: 'guest' })
      expect(run.status).toBe(401)
      expect(run.doorOpened).toBe(false)
    })

    for (const who of ['member', 'stranger'] as const) {
      it(`${who}: angemeldet genügt (kein 401/403)`, async () => {
        const run = await probeRoute(load, { ...base, who })
        expect([401, 403]).not.toContain(run.status)
      })
    }
  })
}
