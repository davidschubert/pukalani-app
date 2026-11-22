import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeRoute, resetCommunityWorld, type Who } from '../../core/tests/support/participationHarness'
import { OWN_DOMAIN, PUKALANI_ADDRESS, customDomainContext } from '../../core/tests/support/customDomainScope'
import { configureSiteCard } from '../../core/server/utils/siteCard'
import pagesManifest from '../product.manifest'

/**
 * SEITEN-VERWALTUNG AUF DER EIGENEN DOMAIN (OPS-009, PK1 E1b-2).
 *
 * `/api/pages` liegt unter dem Produkt-Präfix von `pages` und ist darum auf
 * der eigenen Domain erreichbar. Verwalten soll dort trotzdem nicht gehen:
 * im Modus `write` gelten owner/admin dort als moderator
 * (`capCommunityRoleOnCustomDomain` in `resolveCommunityRole`). Erwartungen
 * Person für Person ausgeschrieben:
 *  - eigene Domain, `write`: Owner und Admin 403 wie der Moderator; der
 *    Redakteur behält `pages.manage` (er steht NEBEN dem Moderator);
 *  - Pukalani-Adresse, `write`: Owner und Admin wie bisher durch;
 *  - eigene Domain, `read` und `off`: wie bisher.
 * Der Kontext kommt aus der ECHTEN Middleware `01.custom-domain-scope.ts`.
 */

vi.mock('../../core/server/utils/logEvent', () => ({ logEvent: () => {} }))

const loadSave = () => import('../server/api/pages/index.put')
const SAVE_BODY = { slug: 'imprint', locale: 'en', title: 'Imprint', body: 'Legal notice.', status: 'draft' }

afterEach(() => {
  configureSiteCard(undefined)
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

async function save(who: Who, mode: 'off' | 'read' | 'write', host: string) {
  const context = await customDomainContext(mode, host, '/api/pages', [pagesManifest])
  return probeRoute(loadSave, { who, body: SAVE_BODY, context, globals: { forgetPublicPages: () => {} } })
}

describe('PUT /api/pages auf der eigenen Domain (Modus write)', () => {
  it('Owner und Admin: 403 wie der Moderator', async () => {
    for (const who of ['owner', 'admin', 'moderator'] as const) {
      const run = await save(who, 'write', OWN_DOMAIN)
      expect(run.status, who).toBe(403)
      expect(run.doorOpened, who).toBe(false)
    }
  })

  it('Redakteur: weiter durch (die Begrenzung trifft nur owner/admin)', async () => {
    const run = await save('editor', 'write', OWN_DOMAIN)
    expect(run.status).toBe(200)
    expect(run.guardPassed).toBe(true)
  })
})

describe('Gegenproben: wie bisher', () => {
  it('Pukalani-Adresse im Modus write: Owner und Admin durch', async () => {
    for (const who of ['owner', 'admin'] as const) {
      const run = await save(who, 'write', PUKALANI_ADDRESS)
      expect(run.status, who).toBe(200)
      expect(run.guardPassed, who).toBe(true)
    }
  })

  it('eigene Domain im Modus read und off: Owner und Admin durch, Moderator 403', async () => {
    for (const mode of ['read', 'off'] as const) {
      for (const who of ['owner', 'admin'] as const) {
        const run = await save(who, mode, OWN_DOMAIN)
        expect(run.status, `${mode}/${who}`).toBe(200)
        expect(run.guardPassed, `${mode}/${who}`).toBe(true)
      }
      expect((await save('moderator', mode, OWN_DOMAIN)).status, mode).toBe(403)
    }
  })
})
