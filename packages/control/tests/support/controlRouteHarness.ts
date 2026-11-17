import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { listAllRows } from '../../../core/server/utils/listAllRows'
import { requirePermission } from '../../../core/server/utils/requirePermission'
import {
  assertOnboardingRuntimeProject,
  requireOnboardingCaller,
} from '../../server/utils/onboardingService'
import { COMMUNITY_MEMBERS_TABLE } from '../../shared/types/communityMember'
import { COMMUNITIES_TABLE } from '../../shared/types/tenantRecord'
import { WEBSITES_TABLE } from '../../shared/types/website'
import { clearRuntimeAccounts, issueRuntimeJwt } from './runtimeAccounts'
import { createRaceTablesDB } from './raceTablesDB'
import { setSessionCreatedAt } from './sessionClient'

/**
 * PRÜFSTAND FÜR DIE ROUTEN DES CONTROL PLANE (OPS-009, BT1 b).
 *
 * Dieselbe Machart wie `core/tests/support/participationHarness.ts`: der
 * ECHTE Handler läuft mit den ECHTEN Wachen, nachgebildet wird nur, was hinter
 * einer Naht liegt — die Datenbank (`raceTablesDB`, wertet Abfragen wirklich
 * aus), das Konto hinter einem JWT (`runtimeAccounts.ts`) und Fremddienste
 * (Mail, ploi), die eine Testdatei bei Bedarf über `globals` stellt.
 *
 * Das Control Plane kennt ZWEI Sorten Aufrufer, und jede hat ihre Wache:
 *
 *  1. BETREIBER (Dashboard): eine Sitzung im Control-Projekt, deren Konto das
 *     Instanz-Label `admin` trägt — `requirePermission(event, 'sites.manage')`
 *     (echt aus dem Core). Die Personen:
 *       - `gast`      — keine Sitzung.
 *       - `konto`     — angemeldet, kein Label.
 *       - `community` — trägt ein Community-Label (so sieht der Owner einer
 *                       Community aus): das ist KEIN Betreiber.
 *       - `moderator` — Instanz-Rolle `moderator` (Karten-Mitglied).
 *       - `operator`  — Instanz-Rolle `admin`: der Betreiber.
 *
 *  2. DIE NAHT (Platform-App, Silo-Apps): ein Geheimnis in der Kopfzeile
 *     `x-pukalani-onboarding-secret` (`requireOnboardingCaller`, echt) und —
 *     je nach Route — das JWT eines Runtime-Kontos, das das Control Plane
 *     SELBST gegen das Projekt prüft (`verifyRuntimeIdentity`, echt; nur der
 *     Ruf zu Appwrite ist nachgebildet). Die Personen im Pool-Projekt:
 *       - `owner`, `admin`, `moderator`, `editor`, `viewer` — aktive Zeilen in
 *         der Probe-Community `c-a`.
 *       - `removed`  — Zeile in `c-a`, Zugang entzogen.
 *       - `stranger` — Pool-Konto ohne Zeile in `c-a`, aber OWNER der
 *                      Nachbar-Community `c-b` (Rolle woanders ≠ Rolle hier).
 *       - `foreign`  — Konto eines ANDEREN Projekts: sein JWT gilt im Pool
 *                      nicht.
 *
 * Geheimnisse und JWTs sind sprechende Platzhalter, keine echten Werte.
 */

// ── Die Welt ────────────────────────────────────────────────────────────────

export const PROBE_SECRET = 'probe-geheimnis'
export const WRONG_SECRET = 'falsches-geheimnis'
export const SECRET_HEADER = 'x-pukalani-onboarding-secret'
export const POOL_PROJECT = 'pool-probe'
export const FOREIGN_PROJECT = 'fremd-probe'
export const COMMUNITY_ID = 'c-a'
export const NEIGHBOUR_COMMUNITY_ID = 'c-b'
/** Ein Silo mit eigenem Appwrite-Projekt und eine zweite Silo-Website. */
export const SILO_PROJECT = 'silo-probe'
export const OTHER_SILO_PROJECT = 'silo-andere'
export const SILO_WEBSITE_ID = 'w-silo'

export type RuntimeWho = 'owner' | 'admin' | 'moderator' | 'editor' | 'viewer' | 'removed' | 'stranger' | 'foreign'

/** Die Team-Rollen der Probe-Community, über die ein Rollen-Tor entscheidet. */
export type TeamWho = 'owner' | 'admin' | 'moderator' | 'editor' | 'viewer'
export const TEAM_PEOPLE: readonly TeamWho[] = ['owner', 'admin', 'moderator', 'editor', 'viewer']

const TEAM_ROLE: Record<TeamWho, string> = {
  owner: 'owner',
  admin: 'admin',
  moderator: 'moderator',
  editor: 'editor',
  viewer: 'viewer',
}

/** Das JWT einer Person (ein Platzhalter, den nur die Nachbildung kennt). */
export function jwtOf(who: RuntimeWho | 'silo' | 'other-silo'): string {
  return `jwt-${who}`
}

export function runtimeUserIdOf(who: RuntimeWho): string {
  return `ru-${who}`
}

function seedRuntimeAccounts(): void {
  clearRuntimeAccounts()
  const people: RuntimeWho[] = ['owner', 'admin', 'moderator', 'editor', 'viewer', 'removed', 'stranger']
  for (const who of people) {
    issueRuntimeJwt(POOL_PROJECT, jwtOf(who), {
      $id: runtimeUserIdOf(who),
      email: `${who}@example.test`,
      name: `Probe ${who}`,
      emailVerification: true,
    })
  }
  issueRuntimeJwt(FOREIGN_PROJECT, jwtOf('foreign'), {
    $id: runtimeUserIdOf('foreign'), email: 'foreign@example.test', name: 'Probe foreign', emailVerification: true,
  })
  issueRuntimeJwt(SILO_PROJECT, jwtOf('silo'), {
    $id: 'su-silo', email: 'silo@example.test', name: 'Probe Silo', emailVerification: true,
  })
  issueRuntimeJwt(OTHER_SILO_PROJECT, jwtOf('other-silo'), {
    $id: 'su-andere', email: 'andere@example.test', name: 'Probe andere', emailVerification: true,
  })
}

type Db = ReturnType<typeof createRaceTablesDB>

function seedWorld(db: Db): void {
  const community = (id: string, projectId: string, extra: Record<string, unknown> = {}) => db.seed(COMMUNITIES_TABLE, {
    $id: id,
    projectId,
    name: `Probe ${id}`,
    host: `${id}.probe.example.test`,
    status: 'active',
    plan: 'personal',
    openRegistration: false,
    suspension: '',
    profile: '',
    ...extra,
  })
  community(COMMUNITY_ID, POOL_PROJECT)
  community(NEIGHBOUR_COMMUNITY_ID, POOL_PROJECT, { openRegistration: true })

  const member = (who: RuntimeWho, communityId: string, role: string, status = 'active') => db.seed(COMMUNITY_MEMBERS_TABLE, {
    $id: `m-${who}-${communityId}`,
    communityId,
    runtimeProjectId: POOL_PROJECT,
    runtimeUserId: runtimeUserIdOf(who),
    role,
    status,
    email: `${who}@example.test`,
    removedAt: status === 'removed' ? '2026-11-01T00:00:00.000Z' : null,
  })
  for (const who of TEAM_PEOPLE) member(who, COMMUNITY_ID, TEAM_ROLE[who])
  member('removed', COMMUNITY_ID, 'editor', 'removed')
  member('stranger', NEIGHBOUR_COMMUNITY_ID, 'owner')

  const website = (id: string, projectId: string, extra: Record<string, unknown> = {}) => db.seed(WEBSITES_TABLE, {
    $id: id,
    slug: id,
    name: `Probe ${id}`,
    url: `https://${id}.example.test`,
    projectId,
    endpoint: 'https://silo.example.test/v1',
    customDomain: '',
    customDomainStatus: 'none',
    customDomainToken: '',
    customDomainError: '',
    ...extra,
  })
  website(SILO_WEBSITE_ID, SILO_PROJECT)
  website('w-andere', OTHER_SILO_PROJECT)
}

// ── Eine Probe ─────────────────────────────────────────────────────────────

export type OperatorWho = 'gast' | 'konto' | 'community' | 'moderator' | 'operator'

const OPERATOR_LABELS: Record<Exclude<OperatorWho, 'gast'>, string[]> = {
  konto: [],
  community: [COMMUNITY_ID],
  moderator: ['moderator'],
  operator: ['admin'],
}

export interface ControlProbe {
  /** Sitzung im Control-Projekt (Betreiber-Dashboard). Standard: keine. */
  session?: OperatorWho
  /** Wie alt ist die Sitzung? Für Routen mit frischer Anmeldung. Standard: frisch. */
  sessionAge?: 'fresh' | 'stale'
  /** Kopfzeile der Naht. Standard: keine. */
  secret?: 'none' | 'wrong' | 'right'
  /** Ist die Naht auf dieser Instanz eingerichtet? Standard: ja. */
  seamConfigured?: boolean
  /**
   * Die Datentür: `stop` bricht beim ersten `createAdminClient` ab (geprüft
   * wird nur die Wache davor — wie im Core-Prüfstand), `world` öffnet die
   * nachgebaute Ablage mit der Probe-Welt (für Routen, die erst lesen und
   * dann entscheiden). Standard: `world`.
   */
  door?: 'stop' | 'world'
  params?: Record<string, string>
  query?: Record<string, string>
  body?: unknown
  /** Zusätzliche Globals (Mail, ploi …), die eine bestimmte Route braucht. */
  globals?: Record<string, unknown>
  /** Zeilen über die Probe-Welt hinaus. */
  seed?: (db: Db) => void
}

export interface ThrownLike {
  status?: number
  statusText?: string
  data?: { code?: string }
}

export interface DbCall { method: string, table: string }

export interface ControlRun {
  status: number
  error?: ThrownLike
  result?: unknown
  /** Hat `requirePermission` „durch" gesagt? */
  permissionPassed: boolean
  /** Wurde die Datenbank geöffnet (`createAdminClient`)? */
  doorOpened: boolean
  /** Jeder Zugriff auf die Ablage, in Reihenfolge. */
  calls: DbCall[]
  /** Nur die schreibenden Zugriffe. */
  writes: DbCall[]
  db: Db
}

const WRITE_METHODS = new Set(['createRow', 'updateRow', 'upsertRow', 'deleteRow', 'incrementRowColumn', 'decrementRowColumn'])

class DoorReached extends Error {}

function makeError(init: Record<string, unknown>): Error {
  return Object.assign(new Error(String(init.statusText ?? 'Error')), init, { statusCode: init.status })
}

/**
 * Wie `toH3Error` (Core, `server/utils/appwriteError.ts`): ein fertiger
 * Fehler bleibt, ein Appwrite-4xx behält seinen Status, alles andere ist 500.
 * Nachgebaut, weil das Original `h3` lädt, das hier nicht auflösbar ist.
 */
function toH3ErrorLike(error: unknown, message: string): Error {
  if (error instanceof Error && 'status' in error && 'statusText' in error) return error
  const code = (error as { code?: unknown })?.code
  if (typeof code === 'number' && code >= 400 && code < 500) return makeError({ status: code, statusText: message })
  return makeError({ status: 500, statusText: message })
}

/** Führt einen ECHTEN Routen-Handler des Control Plane gegen die Probe-Welt aus. */
export async function probeControlRoute(
  load: () => Promise<{ default: unknown }>,
  probe: ControlProbe,
): Promise<ControlRun> {
  const db = createRaceTablesDB()
  seedWorld(db)
  probe.seed?.(db)
  seedRuntimeAccounts()

  const calls: DbCall[] = []
  let permissionPassed = false
  let doorOpened = false

  const recorded = new Proxy(db.tablesDB, {
    get(target, property: string) {
      const method = (target as Record<string, unknown>)[property]
      if (typeof method !== 'function') return method
      return (args: { tableId?: string }) => {
        calls.push({ method: property, table: args?.tableId ?? '' })
        return (method as (a: unknown) => unknown).call(target, args)
      }
    },
  })

  setSessionCreatedAt(probe.sessionAge === 'stale'
    ? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    : new Date().toISOString())

  const session = probe.session ?? 'gast'
  const user = session === 'gast'
    ? undefined
    : { $id: `cu-${session}`, name: `Probe ${session}`, email: `${session}@example.test`, labels: [...OPERATOR_LABELS[session]] }
  const secret = probe.secret ?? 'none'
  const header = secret === 'right' ? PROBE_SECRET : secret === 'wrong' ? WRONG_SECRET : undefined
  const event = { context: { user }, path: '/api/control/probe', method: 'POST' } as unknown as H3Event

  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('createError', makeError)
  vi.stubGlobal('logEvent', () => {})
  vi.stubGlobal('toH3Error', toH3ErrorLike)
  vi.stubGlobal('listAllRows', listAllRows)
  vi.stubGlobal('useAppConfig', () => ({}))
  // Die Instanz-Einstellungen (Zeile `app_config/global`): Einladungspflicht an.
  vi.stubGlobal('getAppConfig', async () => ({ onboardingInviteOnly: true, maintenanceMode: false }))
  vi.stubGlobal('useRuntimeConfig', () => ({
    controlOnboardingSecret: probe.seamConfigured === false ? '' : PROBE_SECRET,
    public: {
      appwriteDatabaseId: 'main',
      appwriteEndpoint: 'https://control.example.test/v1',
      appwriteProjectId: 'control-probe',
      controlPoolProject: POOL_PROJECT,
    },
  }))
  vi.stubGlobal('getHeader', (_e: unknown, name: string) => (name.toLowerCase() === SECRET_HEADER ? header : undefined))
  vi.stubGlobal('getRequestHeader', (_e: unknown, name: string) => (name.toLowerCase() === SECRET_HEADER ? header : undefined))
  vi.stubGlobal('getRouterParam', (_e: unknown, name: string) => probe.params?.[name])
  vi.stubGlobal('getQuery', () => probe.query ?? {})
  vi.stubGlobal('readBody', async () => probe.body ?? {})
  vi.stubGlobal('readValidatedBody', async (_e: unknown, parse: (b: unknown) => unknown) => parse(probe.body ?? {}))
  let responseStatus = 200
  vi.stubGlobal('setResponseStatus', (_e: unknown, status: number) => { responseStatus = status })
  vi.stubGlobal('setHeader', () => {})
  vi.stubGlobal('requireOnboardingCaller', requireOnboardingCaller)
  vi.stubGlobal('assertOnboardingRuntimeProject', assertOnboardingRuntimeProject)
  // `requirePermission` ist SYNCHRON — die Hülle auch (wie im Core-Prüfstand).
  vi.stubGlobal('requirePermission', (...args: Parameters<typeof requirePermission>) => {
    const result = requirePermission(...args)
    permissionPassed = true
    return result
  })
  vi.stubGlobal('createAdminClient', () => {
    doorOpened = true
    if (probe.door === 'stop') throw new DoorReached('door')
    return { tablesDB: recorded }
  })
  for (const [name, value] of Object.entries(probe.globals ?? {})) vi.stubGlobal(name, value)

  const mod = await load()
  const handler = mod.default as (e: H3Event) => Promise<unknown>
  const writes = () => calls.filter(call => WRITE_METHODS.has(call.method))
  try {
    const result = await handler(event)
    return { status: responseStatus, result, permissionPassed, doorOpened, calls, writes: writes(), db }
  }
  catch (thrown) {
    if (thrown instanceof DoorReached) {
      return { status: 200, permissionPassed, doorOpened, calls, writes: writes(), db }
    }
    const error = thrown as ThrownLike
    return { status: error.status ?? 500, error, permissionPassed, doorOpened, calls, writes: writes(), db }
  }
}

function cleanup(): void {
  clearRuntimeAccounts()
  vi.unstubAllGlobals()
}

// ── Fragen für Betreiber-Routen ─────────────────────────────────────────────

export const OPERATOR_PEOPLE: readonly Exclude<OperatorWho, 'gast'>[] = ['konto', 'community', 'moderator', 'operator']

export interface OperatorExpectation {
  /** Wer durch die Wache kommt — AUSGESCHRIEBEN im Test, nie berechnet. */
  allow: readonly Exclude<OperatorWho, 'gast'>[]
  /** Wer abgewiesen wird (403, Datenbank zu). */
  deny: readonly Exclude<OperatorWho, 'gast'>[]
}

export interface OperatorRouteOptions {
  /** Die Route verlangt zusätzlich eine frische Anmeldung (`requireRecentAuth`). */
  recentAuth?: boolean
}

/**
 * Proben für eine Route des Betreiber-Dashboards. Die Datentür endet beim
 * ersten `createAdminClient` (`door: 'stop'`): geprüft wird die Wache davor.
 * Jede Person aus `OPERATOR_PEOPLE` steht in GENAU einer Liste.
 *
 * Immer dabei: ohne Sitzung 401, und das Naht-Geheimnis ersetzt KEINE
 * Sitzung — wer die Kopfzeile der Platform-App mitschickt, ist damit noch
 * kein Betreiber.
 */
export function describeOperatorRoute(
  name: string,
  load: () => Promise<{ default: unknown }>,
  expectation: OperatorExpectation,
  base: Omit<ControlProbe, 'session' | 'door'> = {},
  options: OperatorRouteOptions = {},
): void {
  describe(`${name} (Betreiber)`, () => {
    afterEach(cleanup)

    it('die Erwartung nennt jede Person genau einmal', () => {
      expect([...expectation.allow, ...expectation.deny].sort()).toEqual([...OPERATOR_PEOPLE].sort())
    })

    it('ohne Sitzung: 401, Datenbank zu', async () => {
      const run = await probeControlRoute(load, { ...base, session: 'gast', door: 'stop' })
      expect(run.status).toBe(401)
      expect(run.doorOpened).toBe(false)
    })

    it('ohne Sitzung, mit dem Naht-Geheimnis: trotzdem 401', async () => {
      const run = await probeControlRoute(load, { ...base, session: 'gast', secret: 'right', door: 'stop' })
      expect(run.status).toBe(401)
      expect(run.doorOpened).toBe(false)
    })

    for (const who of expectation.deny) {
      it(`${who}: 403, Datenbank zu`, async () => {
        const run = await probeControlRoute(load, { ...base, session: who, door: 'stop' })
        expect(run.status).toBe(403)
        expect(run.permissionPassed).toBe(false)
        expect(run.doorOpened).toBe(false)
      })
    }

    for (const who of expectation.allow) {
      it(`${who}: durch die Wache, Datenbank erreicht`, async () => {
        const run = await probeControlRoute(load, { ...base, session: who, door: 'stop' })
        expect(run.permissionPassed).toBe(true)
        expect(run.status, run.error?.statusText).toBe(200)
        expect(run.doorOpened).toBe(true)
      })
    }

    if (options.recentAuth) {
      for (const who of expectation.allow) {
        it(`${who}, Anmeldung zu alt: 403 reauth_required, Datenbank zu`, async () => {
          const run = await probeControlRoute(load, { ...base, session: who, sessionAge: 'stale', door: 'stop' })
          expect(run.status).toBe(403)
          expect(run.error?.data?.code).toBe('reauth_required')
          expect(run.doorOpened).toBe(false)
        })
      }
    }
  })
}

// ── Fragen für Naht-Routen ──────────────────────────────────────────────────

export interface SeamSecretOptions {
  /**
   * Status, den der Aufruf mit dem richtigen Geheimnis bekommt — AUSGESCHRIEBEN
   * im Test. Meist 200/201; eine Route, die danach selbst ablehnt (z. B. weil
   * die Naht niemanden zum Betreiber macht), nennt hier ihre eigene Antwort.
   */
  passStatus: number
}

/**
 * Die Fragen an das GEHEIMNIS einer Naht-Route. `base` ist ein Aufruf, der mit
 * dem richtigen Geheimnis durchgeht (Körper, JWT, Zeilen).
 *  - Naht nicht eingerichtet ⇒ 404 (die Route gibt es dann nicht).
 *  - ohne / falsches Geheimnis ⇒ 401.
 *  - Betreiber-Sitzung ohne Geheimnis ⇒ 401: die Naht kennt keine Sitzungen.
 * In allen Ablehnungen bleibt die Datenbank zu.
 */
export function describeSeamSecret(
  name: string,
  load: () => Promise<{ default: unknown }>,
  base: Omit<ControlProbe, 'secret'>,
  options: SeamSecretOptions,
): void {
  describe(`${name} (Naht-Geheimnis)`, () => {
    afterEach(cleanup)

    const rejected = (run: ControlRun, status: number) => {
      expect(run.status).toBe(status)
      expect(run.doorOpened, 'die Datenbank bleibt zu').toBe(false)
    }

    it('Naht nicht eingerichtet: 404, Datenbank zu', async () => {
      rejected(await probeControlRoute(load, { ...base, secret: 'right', seamConfigured: false }), 404)
    })

    it('ohne Geheimnis: 401, Datenbank zu', async () => {
      rejected(await probeControlRoute(load, { ...base, secret: 'none' }), 401)
    })

    it('falsches Geheimnis: 401, Datenbank zu', async () => {
      rejected(await probeControlRoute(load, { ...base, secret: 'wrong' }), 401)
    })

    it('Betreiber-Sitzung ohne Geheimnis: 401, Datenbank zu', async () => {
      rejected(await probeControlRoute(load, { ...base, secret: 'none', session: 'operator' }), 401)
    })

    it(`richtiges Geheimnis: an der Naht vorbei, Antwort ${options.passStatus}`, async () => {
      const run = await probeControlRoute(load, { ...base, secret: 'right' })
      expect(run.status, run.error?.statusText).toBe(options.passStatus)
    })
  })
}

export interface TeamExpectation {
  /** Wer in der Probe-Community durchkommt — AUSGESCHRIEBEN im Test. */
  allow: readonly TeamWho[]
  /** Wer 403 bekommt, ohne dass geschrieben wird. */
  deny: readonly TeamWho[]
}

/**
 * Die Fragen an eine Naht-Route, die zusätzlich die ROLLE des Runtime-Kontos
 * in der Community prüft (JWT + Zeile in `community_members`). `bodyFor`
 * baut den Körper für ein JWT und eine Community.
 *
 * Immer dabei: entzogener Zugang ⇒ 403, Owner einer ANDEREN Community ⇒ 403,
 * JWT aus einem fremden Projekt ⇒ 401, unbekanntes JWT ⇒ 401 — jeweils ohne
 * Schreibzugriff. Durchgelassene bekommen 200.
 */
export function describeSeamTeamRoute(
  name: string,
  load: () => Promise<{ default: unknown }>,
  expectation: TeamExpectation,
  bodyFor: (jwt: string, communityId: string) => Record<string, unknown>,
  base: Omit<ControlProbe, 'secret' | 'body'> = {},
): void {
  const probe = (jwt: string, communityId = COMMUNITY_ID) =>
    probeControlRoute(load, { ...base, secret: 'right', body: bodyFor(jwt, communityId) })

  describeSeamSecret(name, load, { ...base, body: bodyFor(jwtOf(expectation.allow[0] ?? 'owner'), COMMUNITY_ID) }, { passStatus: 200 })

  describe(`${name} (Rolle in der Community)`, () => {
    afterEach(cleanup)

    const denied = (run: ControlRun, status: number) => {
      expect(run.status).toBe(status)
      expect(run.writes, 'nichts geschrieben').toEqual([])
    }

    it('die Erwartung nennt jede Rolle genau einmal', () => {
      expect([...expectation.allow, ...expectation.deny].sort()).toEqual([...TEAM_PEOPLE].sort())
    })

    for (const who of expectation.deny) {
      it(`${who}: 403, nichts geschrieben`, async () => {
        denied(await probe(jwtOf(who)), 403)
      })
    }

    for (const who of expectation.allow) {
      it(`${who}: 200`, async () => {
        const run = await probe(jwtOf(who))
        expect(run.status, run.error?.statusText).toBe(200)
      })
    }

    it('entzogener Zugang: 403, nichts geschrieben', async () => {
      denied(await probe(jwtOf('removed')), 403)
    })

    it('Owner einer anderen Community: 403, nichts geschrieben', async () => {
      denied(await probe(jwtOf('stranger')), 403)
    })

    it('JWT aus einem fremden Projekt: 401, Datenbank zu', async () => {
      const run = await probe(jwtOf('foreign'))
      denied(run, 401)
      expect(run.doorOpened).toBe(false)
    })

    it('unbekanntes JWT: 401, Datenbank zu', async () => {
      const run = await probe('jwt-unbekannt')
      denied(run, 401)
      expect(run.doorOpened).toBe(false)
    })
  })
}

export { cleanup as resetControlWorld }
