import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  COMMUNITY_ID,
  describeRoleGatedRoute,
  probeRoute,
  resetCommunityWorld,
  type RoleExpectation,
  type RouteProbe,
  type Who,
} from '../../../core/tests/support/participationHarness'

/**
 * DIE NAHT ZUM CONTROL PLANE, NACHGEBAUT (OPS-009, BT1 b).
 *
 * Fast jede Route des onboarding-Layers endet nicht an der Datentür, sondern
 * im Control Plane: `mintRuntimeJwt` prägt ein kurzlebiges JWT des
 * Handelnden, `callControlPlane` legt das Service-Geheimnis dazu. Beide
 * reichen nur an die Core-Globals `mintServiceJwt` und `callControlService`
 * durch — genau die werden hier ersetzt. Alles davor (die Wachen, der
 * Mandanten-Kontext, das Schema) läuft echt.
 *
 * Gezählt wird, OB und WOHIN die Route gerufen hat. Damit beantwortet eine
 * Probe die Frage „ist der Handler hinter der Wache wirklich angekommen?",
 * die bei einer Route ohne Datentür sonst offen bliebe.
 */

export interface SeamCall {
  path: string
  body: Record<string, unknown>
}

export interface ControlSeam {
  calls: SeamCall[]
  jwtsMinted: () => number
  globals: Record<string, unknown>
}

/** Das JWT, das die nachgebaute Naht prägt. */
export const PROBE_JWT = 'probe-jwt'

export type SeamReply = (path: string, body: Record<string, unknown>) => unknown

export function controlSeam(reply: SeamReply = () => ({})): ControlSeam {
  const calls: SeamCall[] = []
  let minted = 0
  return {
    calls,
    jwtsMinted: () => minted,
    globals: {
      mintServiceJwt: async () => {
        minted += 1
        return PROBE_JWT
      },
      callControlService: async (_event: unknown, path: string, body: Record<string, unknown>) => {
        calls.push({ path, body })
        return reply(path, body)
      },
    },
  }
}

/**
 * Eine Wirkung HINTER der Wache: Globals, die die Route danach ruft, und die
 * Frage, ob sie gerufen wurden. Wird je Probe frisch gebaut.
 */
export interface Effect {
  globals: Record<string, unknown>
  reached: () => boolean
}

export type ProbeBase = Omit<RouteProbe, 'who'>

/** Personen, die JEDES Rollen-Tor abweist (Prüfstand: Gast 401, beide 403). */
const ALWAYS_DENIED: readonly Who[] = ['guest', 'stranger', 'removed']

function withEffect(base: ProbeBase, effect: Effect): ProbeBase {
  return { ...base, globals: { ...base.globals, ...effect.globals } }
}

/**
 * Rollen-Tor wie `describeRoleGatedRoute`, dazu die Wirkung dahinter: wer
 * abgewiesen wird, erreicht sie NIE; wer durchkommt, erreicht sie und bekommt
 * 200 (`okStatus`). Die Erwartung steht ausgeschrieben im Test.
 */
export function describeRoleGateToEffect(
  name: string,
  load: () => Promise<{ default: unknown }>,
  expectation: RoleExpectation,
  makeEffect: () => Effect,
  base: ProbeBase = {},
): void {
  describeRoleGatedRoute(name, load, expectation, withEffect(base, makeEffect()))

  describe(`${name} — die Wirkung hinter der Wache`, () => {
    afterEach(() => {
      resetCommunityWorld()
      vi.unstubAllGlobals()
    })

    for (const who of [...ALWAYS_DENIED, ...expectation.deny]) {
      it(`${who}: erreicht sie nicht`, async () => {
        const effect = makeEffect()
        const run = await probeRoute(load, { ...withEffect(base, effect), who })
        expect([401, 403]).toContain(run.status)
        expect(effect.reached()).toBe(false)
      })
    }

    for (const who of expectation.allow) {
      it(`${who}: erreicht sie, 200`, async () => {
        const effect = makeEffect()
        const run = await probeRoute(load, { ...withEffect(base, effect), who })
        expect(run.error).toBeUndefined()
        expect(run.status).toBe(200)
        expect(effect.reached()).toBe(true)
      })
    }
  })
}

/**
 * Rollen-Tor vor einer Route, die nur aus dem Mandanten-Kontext antwortet
 * (kein weiterer Ruf): Durchgelassene bekommen 200 — ein Absturz hinter der
 * Wache sähe sonst wie ein Durchlass aus.
 */
export function describeRoleGateToAnswer(
  name: string,
  load: () => Promise<{ default: unknown }>,
  expectation: RoleExpectation,
  base: ProbeBase = {},
): void {
  describeRoleGatedRoute(name, load, expectation, base)

  describe(`${name} — Durchgelassene bekommen die Antwort`, () => {
    afterEach(() => {
      resetCommunityWorld()
      vi.unstubAllGlobals()
    })
    for (const who of expectation.allow) {
      it(`${who}: 200`, async () => {
        const run = await probeRoute(load, { ...base, who })
        expect(run.error).toBeUndefined()
        expect(run.status).toBe(200)
      })
    }
  })
}

/** Die Wirkung „das Control Plane wurde gerufen" für `describeRoleGateToEffect`. */
export function seamEffect(reply?: SeamReply): Effect & { seam: ControlSeam } {
  const seam = controlSeam(reply)
  return { seam, globals: seam.globals, reached: () => seam.calls.length > 0 }
}

/**
 * Rollen-Tor vor dem Control Plane. Zusätzlich je durchgelassener Person: der
 * ERSTE Ruf geht an `path`, trägt das geprägte JWT und die Community aus dem
 * SERVER-Kontext (Host-Auflösung) — nie eine aus dem Body.
 */
export function describeControlGate(
  name: string,
  load: () => Promise<{ default: unknown }>,
  expectation: RoleExpectation,
  path: string,
  options: ProbeBase & { reply?: SeamReply } = {},
): void {
  const { reply, ...base } = options
  describeRoleGateToEffect(name, load, expectation, () => seamEffect(reply), base)

  describe(`${name} — Ruf ins Control Plane`, () => {
    afterEach(() => {
      resetCommunityWorld()
      vi.unstubAllGlobals()
    })

    for (const who of expectation.allow) {
      it(`${who}: ${path} mit JWT und der Community des Hosts`, async () => {
        const seam = controlSeam(reply)
        await probeRoute(load, { ...base, globals: { ...base.globals, ...seam.globals }, who })
        expect(seam.calls[0]?.path).toBe(path)
        expect(seam.calls[0]?.body.jwt).toBe(PROBE_JWT)
        expect(seam.calls[0]?.body.communityId).toBe(COMMUNITY_ID)
      })
    }

    it('ohne Pool-Mandanten (Silo): kein Ruf', async () => {
      const seam = controlSeam(reply)
      const run = await probeRoute(load, { ...base, globals: { ...base.globals, ...seam.globals }, who: 'operator', mode: 'silo' })
      expect(run.status).toBe(404)
      expect(seam.calls).toEqual([])
    })
  })
}

/** Ein Global, das nur zählt, ob es gerufen wurde. */
export function countingEffect(name: string, result: unknown = undefined): Effect {
  let calls = 0
  return {
    globals: {
      [name]: async () => {
        calls += 1
        return result
      },
    },
    reached: () => calls > 0,
  }
}
