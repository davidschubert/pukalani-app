import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  COMMUNITY_ID,
  describeRoleGateToDoor,
  probeRoute,
  resetCommunityWorld,
} from '../../core/tests/support/participationHarness'
import { FEEDBACK_SERVICE_PATHS } from '../../control/shared/customerFeedback'
import { registerFeedbackBackend } from '../server/utils/feedbackGateway'

/**
 * ROLLEN-PROBEN FÜR DAS KUNDEN-FEEDBACK (P27, OPS-009).
 *
 * Dieser Layer besitzt keine Tabelle: jede Route reicht an das Control Plane
 * weiter. Die „Datentür" ist hier also die Naht `callFeedbackService`. Damit
 * der Prüfstand sie zählt, steht dahinter ein lokales Backend (dieselbe
 * Registrierung, die das Control Plane in-process benutzt), das die Datentür
 * des Prüfstands öffnet — erreicht eine Probe die Naht, ist `doorOpened`
 * wahr und die Probe endet dort.
 *
 * Die Routen fragen INSTANZ-Rechte (`requirePermission`, `shared/authz.ts`):
 * entschieden wird über globale Labels, nicht über Community-Rollen. Im Pool
 * trägt ein Community-Team nur das Community-Label — durch kommt also nur
 * der Betreiber (globales Label `admin`). Das steht unten ausgeschrieben.
 */

interface BackendCall {
  path: string
  body: Record<string, unknown>
}

const backendCalls: BackendCall[] = []

registerFeedbackBackend(async (event, path, body) => {
  backendCalls.push({ path, body })
  // Die Naht ist erreicht: die Datentür des Prüfstands öffnen (sie beendet die Probe).
  return (globalThis as unknown as { tenantDb: (e: H3Event) => unknown }).tenantDb(event)
})

beforeEach(() => {
  backendCalls.length = 0
})

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

/** Instanz-Recht: im Pool kommt nur der Betreiber durch. */
const INSTANCE_ONLY = {
  allow: ['operator'],
  deny: ['owner', 'admin', 'moderator', 'editor', 'member'],
} as const

// ── Lesen und Mitreden (`dashboard.access`) ─────────────────────────────────

describeRoleGateToDoor(
  'GET /api/feedback',
  () => import('../server/api/feedback/index.get'),
  INSTANCE_ONLY,
)

describeRoleGateToDoor(
  'GET /api/feedback/:id/comments',
  () => import('../server/api/feedback/[id]/comments.get'),
  INSTANCE_ONLY,
  { params: { id: 'f-1' } },
)

describeRoleGateToDoor(
  'POST /api/feedback/:id/comments',
  () => import('../server/api/feedback/[id]/comments.post'),
  INSTANCE_ONLY,
  { params: { id: 'f-1' }, body: { body: 'Gute Idee' } },
)

describeRoleGateToDoor(
  'POST /api/feedback/:id/vote',
  () => import('../server/api/feedback/[id]/vote.post'),
  INSTANCE_ONLY,
  { params: { id: 'f-1' } },
)

// ── Betreiber-Aktionen (`feedback.manage`) ──────────────────────────────────

describeRoleGateToDoor(
  'PATCH /api/feedback/:id',
  () => import('../server/api/feedback/[id].patch'),
  INSTANCE_ONLY,
  { params: { id: 'f-1' }, body: { state: 'planned' } },
)

describeRoleGateToDoor(
  'POST /api/feedback/mute',
  () => import('../server/api/feedback/mute.post'),
  INSTANCE_ONLY,
  { body: { communityId: 'c-b', muted: true } },
)

describe('Rollen-Tore halten die Naht zu', () => {
  for (const [name, load, params, body] of [
    ['GET /api/feedback', () => import('../server/api/feedback/index.get'), {}, undefined],
    ['POST /api/feedback/:id/vote', () => import('../server/api/feedback/[id]/vote.post'), { id: 'f-1' }, undefined],
    ['PATCH /api/feedback/:id', () => import('../server/api/feedback/[id].patch'), { id: 'f-1' }, { state: 'planned' }],
    ['POST /api/feedback/mute', () => import('../server/api/feedback/mute.post'), {}, { communityId: 'c-b', muted: true }],
  ] as const) {
    it(`${name}: Owner der Community erreicht das Control Plane nicht`, async () => {
      const run = await probeRoute(load, { who: 'owner', params, body })
      expect(run.status).toBe(403)
      expect(backendCalls).toHaveLength(0)
    })
  }
})

// ── POST /api/feedback (bewusst auch für Gäste) ─────────────────────────────

/**
 * Feedback an den Betreiber: keine Mitgliedschaft zu prüfen (Gäste dürfen
 * senden). Die EIGENEN Schranken der Route liegen vor der Naht: die Eingabe
 * wird hier geprüft, und die Herkunft (`communityId`) kommt aus dem
 * Mandanten der Anfrage, nie aus dem Rumpf. Drossel und Stummschaltung
 * liegen davor (Middleware) bzw. dahinter (Control Plane).
 */
describe('POST /api/feedback (Feedback an den Betreiber)', () => {
  const load = () => import('../server/api/feedback/index.post')
  const valid = { area: 'core', message: 'Die Suche findet zu wenig.' }

  it('Gast mit gültiger Eingabe: erreicht die Naht, Herkunft aus dem Mandanten', async () => {
    const run = await probeRoute(load, { who: 'guest', body: valid })
    expect(run.status).toBe(200)
    expect(backendCalls).toHaveLength(1)
    expect(backendCalls[0]?.path).toBe(FEEDBACK_SERVICE_PATHS.submit)
    expect(backendCalls[0]?.body.communityId).toBe(COMMUNITY_ID)
  })

  it('eine Community im Rumpf ändert die Herkunft nicht', async () => {
    const run = await probeRoute(load, { who: 'member', body: { ...valid, communityId: 'c-b' } })
    expect(run.status).toBe(200)
    expect(backendCalls[0]?.body.communityId).toBe(COMMUNITY_ID)
    expect(backendCalls[0]?.body.input).not.toHaveProperty('communityId')
  })

  it('zu kurze Nachricht: abgelehnt, bevor die Naht gefragt wird', async () => {
    const run = await probeRoute(load, { who: 'guest', body: { area: 'core', message: 'x' } })
    expect(run.status).not.toBe(200)
    expect(backendCalls).toHaveLength(0)
  })

  it('Bereich „Produkt" ohne Produkt: abgelehnt, bevor die Naht gefragt wird', async () => {
    const run = await probeRoute(load, { who: 'guest', body: { area: 'product', message: 'Fehlt mir etwas.' } })
    expect(run.status).not.toBe(200)
    expect(backendCalls).toHaveLength(0)
  })
})
