import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeRoute, resetCommunityWorld, type Who } from '../../core/tests/support/participationHarness'
import { OWN_DOMAIN, PUKALANI_ADDRESS, customDomainContext } from '../../core/tests/support/customDomainScope'
import { communitySettingsRowIdFor } from '../../core/server/utils/communitySettingsRow'
import { configureSiteCard } from '../../core/server/utils/siteCard'
import pagesManifest from '../product.manifest'

/**
 * SEITEN AUF DER EIGENEN DOMAIN (OPS-009, PK1 E1b-2).
 *
 * `/api/pages/**` liegt unter dem Produkt-Präfix von `pages` und ist darum auf
 * der eigenen Domain erreichbar. Davids Entscheidung: dort „lesen, schreiben,
 * moderieren wie bisher; nur Verwalten nicht" — im Modus `write` zählen dort
 * nur die Rechte von Redakteur UND Moderator (`CUSTOM_DOMAIN_CAPABILITIES`).
 * Erwartungen Person für Person ausgeschrieben:
 *  - Seite speichern (`pages.manage`, Redakteurs-Recht): Owner, Admin,
 *    Redakteur durch — auch auf der eigenen Domain; Moderator 403.
 *  - Sucheintrag ändern (`branding.manage`, Verwaltung): auf der eigenen
 *    Domain 403 auch für Owner und Admin; auf der Pukalani-Adresse und mit
 *    `read`/`off` wie bisher durch.
 * Der Kontext kommt aus der ECHTEN Middleware `01.custom-domain-scope.ts`.
 */

vi.mock('../../core/server/utils/logEvent', () => ({ logEvent: () => {} }))

const loadSave = () => import('../server/api/pages/index.put')
const loadSeo = () => import('../server/api/pages/seo.patch')
const SAVE_BODY = { slug: 'imprint', locale: 'en', title: 'Imprint', body: 'Legal notice.', status: 'draft' }
const SEO_BODY = { metaDescription: 'Eine Community für alle.', noindex: false }

afterEach(() => {
  configureSiteCard(undefined)
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

type Mode = 'off' | 'read' | 'write'

async function save(who: Who, mode: Mode, host: string) {
  const context = await customDomainContext(mode, host, '/api/pages', [pagesManifest])
  return probeRoute(loadSave, { who, body: SAVE_BODY, context, globals: { forgetPublicPages: () => {} } })
}

async function seo(who: Who, mode: Mode, host: string) {
  const context = await customDomainContext(mode, host, '/api/pages/seo', [pagesManifest])
  const writeCommunitySeo = vi.fn(async () => {})
  const run = await probeRoute(loadSeo, {
    who,
    body: SEO_BODY,
    context,
    globals: { communitySettingsRowIdFor, writeCommunitySeo, tenantCacheScope: () => 't-a' },
  })
  return { run, written: writeCommunitySeo.mock.calls.length }
}

describe('eigene Domain, Modus write', () => {
  it('Seite speichern (Redakteurs-Recht): Owner, Admin, Redakteur durch; Moderator 403', async () => {
    for (const who of ['owner', 'admin', 'editor'] as const) {
      const run = await save(who, 'write', OWN_DOMAIN)
      expect(run.status, who).toBe(200)
      expect(run.guardPassed, who).toBe(true)
    }
    expect((await save('moderator', 'write', OWN_DOMAIN)).status).toBe(403)
  })

  it('Sucheintrag ändern (Verwaltung): 403 für Owner und Admin, nichts geschrieben', async () => {
    for (const who of ['owner', 'admin', 'moderator', 'editor'] as const) {
      const { run, written } = await seo(who, 'write', OWN_DOMAIN)
      expect(run.status, who).toBe(403)
      expect(written, who).toBe(0)
    }
  })
})

describe('Betreiber-Label auf der eigenen Domain (write): keine Rechte', () => {
  it('Sucheintrag und Seite speichern ⇒ 403 für den Betreiber ohne Community-Rolle', async () => {
    const { run, written } = await seo('operator', 'write', OWN_DOMAIN)
    expect(run.status).toBe(403)
    expect(written).toBe(0)
    expect((await save('operator', 'write', OWN_DOMAIN)).status).toBe(403)
  })

  it('Gegenprobe: auf der Pukalani-Adresse und mit read kommt der Betreiber durch (Not-Zugang)', async () => {
    for (const [mode, host] of [['write', PUKALANI_ADDRESS], ['read', OWN_DOMAIN]] as const) {
      const { run, written } = await seo('operator', mode, host)
      expect(run.status, `${mode}/${host}`).toBe(200)
      expect(written, `${mode}/${host}`).toBe(1)
    }
  })
})

describe('Gegenproben: wie bisher', () => {
  it('Pukalani-Adresse im Modus write: Owner und Admin ändern den Sucheintrag', async () => {
    for (const who of ['owner', 'admin'] as const) {
      const { run, written } = await seo(who, 'write', PUKALANI_ADDRESS)
      expect(run.status, who).toBe(200)
      expect(written, who).toBe(1)
    }
  })

  it('eigene Domain im Modus read und off: Owner und Admin ändern den Sucheintrag, Moderator 403', async () => {
    for (const mode of ['read', 'off'] as const) {
      for (const who of ['owner', 'admin'] as const) {
        const { run, written } = await seo(who, mode, OWN_DOMAIN)
        expect(run.status, `${mode}/${who}`).toBe(200)
        expect(written, `${mode}/${who}`).toBe(1)
      }
      expect((await seo('moderator', mode, OWN_DOMAIN)).run.status, mode).toBe(403)
      expect((await save('moderator', mode, OWN_DOMAIN)).status, mode).toBe(403)
    }
  })
})
