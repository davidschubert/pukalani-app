import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeRoute, resetCommunityWorld, type Who } from '../../core/tests/support/participationHarness'
import { OWN_DOMAIN, customDomainContext } from '../../core/tests/support/customDomainScope'
import { configureSiteCard } from '../../core/server/utils/siteCard'

/**
 * MODERIEREN AUF DER EIGENEN DOMAIN (OPS-009, PK1 E1b-2).
 *
 * Im Modus `write` gelten owner/admin auf der eigenen Domain als moderator —
 * moderieren bleibt also: `reports.moderate` haben Owner, Admin und Moderator
 * dort wie bisher, Redakteur und Mitglied nicht. Ausgeschrieben, nicht
 * berechnet. Der Kontext kommt aus der ECHTEN Middleware.
 */

vi.mock('../../core/server/utils/logEvent', () => ({ logEvent: () => {} }))

const loadResolve = () => import('../server/api/reports/resolve.post')
const BODY = { targetType: 'comment', targetId: 'cm-1', resolution: 'hidden' }
const RUNTIME = { useRuntimeConfig: () => ({ public: { appwriteDatabaseId: 'db' } }) }

afterEach(() => {
  configureSiteCard(undefined)
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

async function resolve(who: Who) {
  const context = await customDomainContext('write', OWN_DOMAIN, '/api/reports/resolve')
  expect(context.customDomainScope).toBe(true)
  return probeRoute(loadResolve, { who, body: BODY, context, globals: RUNTIME })
}

describe('POST /api/reports/resolve auf der eigenen Domain (Modus write)', () => {
  it('Owner, Admin, Moderator: durch wie bisher', async () => {
    for (const who of ['owner', 'admin', 'moderator'] as const) {
      const run = await resolve(who)
      expect(run.status, who).toBe(200)
      expect(run.guardPassed, who).toBe(true)
    }
  })

  it('Redakteur und Mitglied: 403 wie bisher', async () => {
    for (const who of ['editor', 'member'] as const) {
      expect((await resolve(who)).status, who).toBe(403)
    }
  })
})
