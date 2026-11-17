import { afterEach, describe, expect, it, vi } from 'vitest'
import { mintServiceJwt } from '../../core/server/utils/controlService'
import { describeRoleGateToDoor, resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { probeAs } from '../../core/tests/support/instanceRoleGate'

/**
 * ROLLEN-PROBEN FÜR DIE EIGENE DOMAIN (`/api/site/domain`, OPS-009).
 *
 * Alle vier Routen fragen `requireCommunityPermission(event,
 * 'community.domain')`. Die Domain verschiebt die ADRESSE der Seite — eine
 * Entscheidung nach außen, deshalb:
 *  - im Pool: nur der Owner; der Betreiber kommt über den protokollierten
 *    Not-Zugang durch; Admin, Moderator, Editor und Mitglied nicht.
 *  - im Silo (kein Mandant, das Projekt ist die Grenze): nur der Betreiber
 *    (globales Label `admin`); das Karten-Mitglied (`moderator`) und ein
 *    Konto ohne Label nicht.
 *
 * Die „Datentür" ist hier der erste Schritt hinter dem Tor: das Dienst-JWT
 * für das Control Plane (`mintServiceJwt`, echt — es öffnet den Admin-Client).
 * Der Ruf ans Control Plane selbst ist nicht Gegenstand dieser Probe
 * (`packages/control/tests/route-roles-seam-site-domain.test.ts`).
 */

const POOL = {
  allow: ['owner', 'operator'],
  deny: ['admin', 'moderator', 'editor', 'member'],
} as const

const base = {
  globals: {
    useRuntimeConfig: () => ({ public: { appwriteProjectId: 'site-probe', appwriteDatabaseId: 'main' } }),
    mintServiceJwt,
  },
}

const ROUTES = [
  { name: 'GET /api/site/domain', load: () => import('../server/api/site/domain/index.get'), body: undefined },
  { name: 'PUT /api/site/domain', load: () => import('../server/api/site/domain/index.put'), body: { domain: 'probe.example.test' } },
  { name: 'DELETE /api/site/domain', load: () => import('../server/api/site/domain/index.delete'), body: undefined },
  { name: 'POST /api/site/domain/verify', load: () => import('../server/api/site/domain/verify.post'), body: undefined },
] as const

for (const route of ROUTES) {
  const probe = { ...base, body: route.body }

  describeRoleGateToDoor(`${route.name} (Pool)`, route.load, POOL, probe)

  describe(`${route.name} (Silo)`, () => {
    afterEach(() => {
      resetCommunityWorld()
      vi.unstubAllGlobals()
    })

    it('ohne Konto: 401, Datentür zu', async () => {
      const run = await probeAs(route.load, 'guest', { ...probe, mode: 'silo' })
      expect(run.status).toBe(401)
      expect(run.doorOpened).toBe(false)
    })

    for (const who of ['stranger', 'staff'] as const) {
      it(`${who === 'stranger' ? 'Konto ohne Label' : 'Karten-Mitglied'}: 403, Datentür zu`, async () => {
        const run = await probeAs(route.load, who, { ...probe, mode: 'silo' })
        expect(run.status).toBe(403)
        expect(run.guardPassed).toBe(false)
        expect(run.doorOpened).toBe(false)
      })
    }

    it('Betreiber: durch, Datentür erreicht', async () => {
      const run = await probeAs(route.load, 'operator', { ...probe, mode: 'silo' })
      expect(run.guardPassed).toBe(true)
      expect(run.status, run.error?.statusText).toBe(200)
      expect(run.doorOpened).toBe(true)
    })
  })
}
