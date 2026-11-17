import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type ProbeRun,
  probeRoute,
  resetCommunityWorld,
  type RouteProbe,
  type Who,
} from '../../../core/tests/support/participationHarness'
import { setSessionCreatedAt } from './sessionClient'

/**
 * PRÜFSTAND FÜR DIE ROUTEN DES DASHBOARDS (admin-Layer, OPS-009).
 *
 * Gebaut auf dem Core-Prüfstand `participationHarness.ts`: der ECHTE Handler
 * läuft mit den ECHTEN Wachen (`requirePermission`, `requireCommunityPermission`),
 * die Datentür endet beim ersten `createAdminClient`/`tenantDb`. Dazu kommt,
 * was der admin-Layer braucht:
 *
 *  - eine Person, die der Core-Prüfstand nicht kennt: `instanzModerator` —
 *    ein Konto mit dem Instanz-Label `moderator` (Karten-Mitglied des
 *    Betreiber-Teams), ohne Community-Rolle;
 *  - `konto` ist ein angemeldetes Konto ohne Label und ohne Rolle (im
 *    Core-Prüfstand `stranger`);
 *  - die Laufzeit-Konfiguration (`useRuntimeConfig`) mit Datenbank und
 *    Export-Ablage;
 *  - die frische Anmeldung (`requireRecentAuth`, echt — die Testdatei reicht
 *    sie per `globals` herein und ersetzt `core/server/lib/appwrite` durch
 *    `./sessionClient`).
 *
 * Das Dashboard läuft im Pool (Community-Rollen Owner/Admin/Moderator/Editor/
 * Mitglied, dazu der Betreiber mit dem globalen Label `admin`) UND auf
 * Einzel-Instanzen (nur Instanz-Labels). Deshalb steht je Route die Erwartung
 * für BEIDE Orte im Test — ausgeschrieben, nie aus der Rechte-Matrix berechnet.
 */

export type PoolWho = 'konto' | 'instanzModerator' | 'owner' | 'admin' | 'moderator' | 'editor' | 'member' | 'operator'
export type SiloWho = 'konto' | 'instanzModerator' | 'operator'

export const POOL_PEOPLE: readonly PoolWho[] = ['konto', 'instanzModerator', 'owner', 'admin', 'moderator', 'editor', 'member', 'operator']
export const SILO_PEOPLE: readonly SiloWho[] = ['konto', 'instanzModerator', 'operator']

export interface AdminExpectation {
  /** Pool: wer durchkommt und wer 403 bekommt — jede Person genau einmal. */
  pool: { allow: readonly PoolWho[], deny: readonly PoolWho[] }
  /** Einzel-Instanz: dasselbe für die Personen ohne Community. */
  silo: { allow: readonly SiloWho[], deny: readonly SiloWho[] }
}

export type AdminProbe = Omit<RouteProbe, 'who' | 'userFields' | 'mode'> & {
  /** Wie alt ist die Sitzung? Für Routen mit frischer Anmeldung. Standard: frisch. */
  sessionAge?: 'fresh' | 'stale'
}

export interface AdminRouteOptions {
  /** Die Route verlangt zusätzlich eine frische Anmeldung (`requireRecentAuth`). */
  recentAuth?: boolean
  /**
   * Was für eine durchgelassene Person gilt. Standard: Status 200 und die
   * Datentür wird erreicht. Eine Route, die hinter der Wache selbst ablehnt
   * (z. B. nur in der Entwicklung), nennt hier ihre Antwort.
   */
  onPass?: (run: ProbeRun) => void
}

function coreWho(who: PoolWho | 'gast'): Who {
  if (who === 'gast') return 'guest'
  if (who === 'konto' || who === 'instanzModerator') return 'stranger'
  return who
}

/**
 * Öffnet die Datentür über einen Lese-/Schreib-Helfer (z. B.
 * `listAllChangelogRows`, `readInstanceSecret`): er ruft den nachgebildeten
 * `createAdminClient` des Core-Prüfstands — der zählt das Öffnen und beendet
 * die Probe dort.
 */
export function throughDoor(...args: unknown[]): never {
  const open = (globalThis as unknown as { createAdminClient: (...a: unknown[]) => never }).createAdminClient
  return open(...args)
}

const RUNTIME_CONFIG = {
  adminSystemManifest: '',
  smtpPass: '',
  public: {
    appwriteDatabaseId: 'main',
    appwriteEndpoint: 'https://appwrite.example.test/v1',
    appwriteProjectId: 'probe-projekt',
    appwriteGdprBucket: 'gdpr-exports',
    appwriteAvatarsBucket: 'avatars',
  },
}

/** Führt einen ECHTEN Handler des Dashboards für eine Person aus. */
export async function probeAdminRoute(
  load: () => Promise<{ default: unknown }>,
  who: PoolWho | 'gast',
  probe: AdminProbe & { mode?: 'pool' | 'silo' } = {},
): Promise<ProbeRun> {
  setSessionCreatedAt(probe.sessionAge === 'stale'
    ? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    : new Date().toISOString())
  const userFields = who === 'konto'
    ? { labels: [] }
    : who === 'instanzModerator' ? { labels: ['moderator'] } : undefined
  return probeRoute(load, {
    ...probe,
    who: coreWho(who),
    mode: probe.mode ?? 'pool',
    userFields,
    globals: {
      useRuntimeConfig: () => RUNTIME_CONFIG,
      recordAudit: async () => {},
      recordActivity: async () => {},
      ...probe.globals,
    },
  })
}

export function resetAdminWorld(): void {
  resetCommunityWorld()
  vi.unstubAllGlobals()
}

const defaultPass = (run: ProbeRun) => {
  expect(run.guardPassed, 'die Wache lässt durch').toBe(true)
  expect(run.status, run.error?.statusText).toBe(200)
  expect(run.doorOpened, 'die Datentür wird erreicht').toBe(true)
}

const denied = (run: ProbeRun) => {
  expect(run.status).toBe(403)
  expect(run.guardPassed, 'die Wache lässt nicht durch').toBe(false)
  expect(run.doorOpened, 'die Datentür bleibt zu').toBe(false)
}

/**
 * Die Fragen an eine Route des Dashboards, im Pool und auf einer
 * Einzel-Instanz. Immer dabei: ohne Anmeldung 401 (an beiden Orten), dazu je
 * Person die ausgeschriebene Erwartung; mit `recentAuth` zusätzlich: eine zu
 * alte Anmeldung wird mit `reauth_required` abgewiesen, bevor die Datentür
 * aufgeht.
 */
export function describeAdminRoute(
  name: string,
  load: () => Promise<{ default: unknown }>,
  expectation: AdminExpectation,
  base: AdminProbe = {},
  options: AdminRouteOptions = {},
): void {
  const pass = options.onPass ?? defaultPass

  describe(`${name} (Dashboard)`, () => {
    afterEach(resetAdminWorld)

    it('die Erwartung nennt jede Person genau einmal', () => {
      expect([...expectation.pool.allow, ...expectation.pool.deny].sort()).toEqual([...POOL_PEOPLE].sort())
      expect([...expectation.silo.allow, ...expectation.silo.deny].sort()).toEqual([...SILO_PEOPLE].sort())
    })

    for (const mode of ['pool', 'silo'] as const) {
      it(`${mode}: ohne Anmeldung 401, Datentür zu`, async () => {
        const run = await probeAdminRoute(load, 'gast', { ...base, mode })
        expect(run.status).toBe(401)
        expect(run.doorOpened).toBe(false)
      })
    }

    for (const who of expectation.pool.deny) {
      it(`pool, ${who}: 403, Datentür zu`, async () => {
        denied(await probeAdminRoute(load, who, { ...base, mode: 'pool' }))
      })
    }
    for (const who of expectation.pool.allow) {
      it(`pool, ${who}: durch die Wache`, async () => {
        pass(await probeAdminRoute(load, who, { ...base, mode: 'pool' }))
      })
    }
    for (const who of expectation.silo.deny) {
      it(`silo, ${who}: 403, Datentür zu`, async () => {
        denied(await probeAdminRoute(load, who, { ...base, mode: 'silo' }))
      })
    }
    for (const who of expectation.silo.allow) {
      it(`silo, ${who}: durch die Wache`, async () => {
        pass(await probeAdminRoute(load, who, { ...base, mode: 'silo' }))
      })
    }

    if (options.recentAuth) {
      const allowed = [
        ...expectation.pool.allow.map(who => ['pool', who] as const),
        ...expectation.silo.allow.map(who => ['silo', who] as const),
      ]
      for (const [mode, who] of allowed) {
        it(`${mode}, ${who}, Anmeldung zu alt: 403 reauth_required, Datentür zu`, async () => {
          const run = await probeAdminRoute(load, who, { ...base, mode, sessionAge: 'stale' })
          expect(run.status).toBe(403)
          expect(run.error?.data?.code).toBe('reauth_required')
          expect(run.doorOpened).toBe(false)
        })
      }
    }
  })
}
