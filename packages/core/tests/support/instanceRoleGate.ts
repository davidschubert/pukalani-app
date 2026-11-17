import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  probeRoute,
  resetCommunityWorld,
  ROLE_PEOPLE,
  type ProbeRun,
  type RoleWho,
  type RouteProbe,
  type Who,
} from './participationHarness'

/**
 * PROBEN FÜR ROUTEN HINTER EINEM INSTANZ-RECHT (`requirePermission`, OPS-009).
 *
 * `requirePermission(event, '<cap>')` entscheidet über die GLOBALEN Labels
 * des Kontos (`shared/authz.ts`): `admin` (der Betreiber) und `moderator`
 * (Karten-Mitglied, eine Teilmenge). Community-Rollen zählen dort nicht. Der
 * Core-Prüfstand kennt den Betreiber (`operator`) und die Community-Rollen;
 * hier kommt das Karten-Mitglied dazu:
 *
 *  - `staff` — trägt das globale Label `moderator`, keine Community-Rolle.
 *
 * Gebaut auf `probeRoute` aus `participationHarness.ts` (das Karten-Mitglied
 * ist dort das fremde Konto mit dem Label). Die Erwartung steht Person für
 * Person im Test — nie aus der Rechte-Matrix berechnet (Beweis-Regel 1).
 */

export type InstanceRoleWho = RoleWho | 'staff'

/** Alle Personen, über die ein Instanz-Recht entscheidet. */
export const INSTANCE_ROLE_PEOPLE: readonly InstanceRoleWho[] = [...ROLE_PEOPLE, 'staff']

/** Globales Label des Karten-Mitglieds (`shared/authz.ts`, Rolle `moderator`). */
export const STAFF_LABEL = 'moderator'

export interface InstanceRoleExpectation {
  /** Wer durchkommt — AUSGESCHRIEBEN im Test. */
  allow: readonly InstanceRoleWho[]
  /** Wer 403 bekommt (Datentür zu). */
  deny: readonly InstanceRoleWho[]
}

/** Führt die Route als eine Person aus (dazu Gast, Konto ohne Label, Entfernte). */
export function probeAs(
  load: () => Promise<{ default: unknown }>,
  who: InstanceRoleWho | Who,
  base: Omit<RouteProbe, 'who'> = {},
): Promise<ProbeRun> {
  if (who === 'staff') {
    return probeRoute(load, { ...base, who: 'stranger', userFields: { ...base.userFields, labels: [STAFF_LABEL] } })
  }
  return probeRoute(load, { ...base, who })
}

/**
 * Die Fragen an eine Route hinter einem Instanz-Recht:
 *  - ohne Konto ⇒ 401, Konto ohne Label ⇒ 403, entferntes Konto ⇒ 403,
 *  - jede Person aus `deny` ⇒ 403,
 *  - jede Person aus `allow` ⇒ durch die Wache, Status 200, Datentür erreicht.
 * In jeder Ablehnung bleibt die Datentür zu.
 *
 * „Datentür" heißt hier: `tenantDb`, `createAdminClient` oder
 * `createSessionClient` (s. `probeRoute`). Eine Route, die erst über einen
 * Helfer liest, stellt ihn über `globals` so, dass er die Tür öffnet.
 */
export function describeInstanceRoleGate(
  name: string,
  load: () => Promise<{ default: unknown }>,
  expectation: InstanceRoleExpectation,
  base: Omit<RouteProbe, 'who'> = {},
): void {
  describe(`${name} (Instanz-Recht)`, () => {
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
      expect([...expectation.allow, ...expectation.deny].sort()).toEqual([...INSTANCE_ROLE_PEOPLE].sort())
    })

    it('ohne Konto: 401, Datentür zu', async () => {
      const run = await probeAs(load, 'guest', base)
      expect(run.status).toBe(401)
      expect(run.doorOpened).toBe(false)
    })

    it('Konto ohne Label: 403, Datentür zu', async () => {
      denied(await probeAs(load, 'stranger', base))
    })

    it('entferntes Konto: 403, Datentür zu', async () => {
      denied(await probeAs(load, 'removed', base))
    })

    for (const who of expectation.deny) {
      it(`${who}: 403, Datentür zu`, async () => {
        denied(await probeAs(load, who, base))
      })
    }

    for (const who of expectation.allow) {
      it(`${who}: durch die Wache, Datentür erreicht`, async () => {
        const run = await probeAs(load, who, base)
        expect(run.guardPassed).toBe(true)
        expect(run.status, run.error?.statusText).toBe(200)
        expect(run.doorOpened).toBe(true)
      })
    }
  })
}
