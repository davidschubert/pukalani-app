import type { H3Event } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeRoute, resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { OWN_DOMAIN, PUKALANI_ADDRESS, customDomainContext } from '../../core/tests/support/customDomainScope'
import { configureSiteCard } from '../../core/server/utils/siteCard'
import { registerFeedbackBackend } from '../server/utils/feedbackGateway'
import feedbackManifest from '../product.manifest'

/**
 * BETREIBER-LABEL AUF DER EIGENEN DOMAIN (OPS-009, PK1 E1b-2).
 *
 * `/api/feedback` liegt unter einem Produkt-Präfix (auf der eigenen Domain
 * erreichbar), fragt aber INSTANZ-Rechte über globale Labels
 * (`requirePermission`). Auf der eigenen Domain einer Community im Modus
 * `write` tragen Betreiber-Labels keine Rechte: der Betreiber bekommt dort
 * 403 und erreicht das Control Plane nicht. Auf der Pukalani-Adresse und mit
 * `read` wie bisher. Kontext aus der ECHTEN Middleware.
 */

vi.mock('../../core/server/utils/logEvent', () => ({ logEvent: () => {} }))

let backendCalls = 0
registerFeedbackBackend(async (event) => {
  backendCalls += 1
  return (globalThis as unknown as { tenantDb: (e: H3Event) => unknown }).tenantDb(event)
})

afterEach(() => {
  backendCalls = 0
  configureSiteCard(undefined)
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

async function patch(mode: 'read' | 'write', host: string) {
  const context = await customDomainContext(mode, host, '/api/feedback/f-1', [feedbackManifest])
  return probeRoute(() => import('../server/api/feedback/[id].patch'), {
    who: 'operator', params: { id: 'f-1' }, body: { state: 'planned' }, context,
  })
}

describe('PATCH /api/feedback/:id mit Betreiber-Label', () => {
  it('eigene Domain, write: 403, das Control Plane wird nicht gerufen', async () => {
    const run = await patch('write', OWN_DOMAIN)
    expect(run.status).toBe(403)
    expect(backendCalls).toBe(0)
  })

  it('Gegenprobe: Pukalani-Adresse (write) und eigene Domain (read) wie bisher durch', async () => {
    for (const [mode, host] of [['write', PUKALANI_ADDRESS], ['read', OWN_DOMAIN]] as const) {
      const run = await patch(mode, host)
      expect(run.status, `${mode}/${host}`).toBe(200)
      expect(run.doorOpened, `${mode}/${host}`).toBe(true)
    }
    expect(backendCalls).toBe(2)
  })
})
