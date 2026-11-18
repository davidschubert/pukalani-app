import { afterEach, describe, expect, it, vi } from 'vitest'
import { communitySettingsRowIdFor } from '../../core/server/utils/communitySettingsRow'
import {
  COMMUNITY_ID,
  describeRoleGatedRoute,
  probeRoute,
  resetCommunityWorld,
  type RouteProbe,
  type Who,
} from '../../core/tests/support/participationHarness'
import { type FakeRow, fakeDoor } from '../../core/tests/support/doorFake'
import { PAGES_TABLE } from '../shared/types/page'

/**
 * ROLLEN-PROBEN FÜR DEN AUFTRITT DER WEBSITE (OPS-009, N14): Menü,
 * Weiterleitungen, Sucheintrag.
 *
 * Echte Handler, echte Core-Wachen (Prüfstand
 * `core/tests/support/participationHarness.ts`), dazu die echte Row-Id-Regel
 * `communitySettingsRowIdFor`. Die Erwartung steht hier Person für Person
 * ausgeschrieben, abgelesen aus der Rechte-Matrix (`core/shared/communityAuthz.ts`)
 * — nie berechnet:
 *  - `branding.manage`: Admin, Owner; der Betreiber im protokollierten
 *    Not-Zugang. Der Editor NICHT (er schreibt Seiten, er stellt nicht die
 *    Struktur der Website um), der Moderator NICHT.
 *
 * Die drei Speicher (`writeCommunityNavOverride`, `writeCommunityRedirects`,
 * `writeCommunitySeo`) und der Leser `readCommunityRedirects` schreiben bzw.
 * lesen über den Admin-Client hinter der Route; hier sind sie Attrappen, die
 * mitschreiben, OB und WOFÜR sie gerufen wurden. Was sie in der Tabelle tun,
 * ist nicht Gegenstand dieser Probe.
 */

const BRANDING = {
  allow: ['owner', 'admin', 'operator'],
  deny: ['moderator', 'editor', 'member'],
} as const

/** Alle, die das Tor abweist — inklusive der drei Personen ohne Rolle. */
const REJECTED: readonly Who[] = ['guest', 'stranger', 'removed', 'moderator', 'editor', 'member']

const loadNavigation = () => import('../server/api/pages/navigation.patch')
const loadRedirectsGet = () => import('../server/api/pages/redirects.get')
const loadRedirectsPatch = () => import('../server/api/pages/redirects.patch')
const loadSeo = () => import('../server/api/pages/seo.patch')

const NAV_BODY = { entries: [{ id: 'link-imprint', label: 'Impressum', to: '/imprint' }] }
const REDIRECTS_BODY = { rules: [{ from: '/alt/', to: '/neu' }] }
const SEO_BODY = { metaDescription: 'Eine Community für alle.', noindex: false }
const SAVED_REDIRECTS = { rules: [{ from: '/alt', to: '/neu' }] }

function pageRow(id: string, slug: string, status: string): FakeRow {
  return { $id: id, communityId: COMMUNITY_ID, slug, locale: 'de', title: slug, body: 'Text', status, sortOrder: 10 }
}

/** Die Speicher-Attrappen einer Probe, frisch je Test. */
function stores() {
  const nav = vi.fn(async () => {})
  const redirects = vi.fn(async () => {})
  const seo = vi.fn(async () => {})
  const readRedirects = vi.fn(async () => SAVED_REDIRECTS)
  const door = fakeDoor({ rows: { [PAGES_TABLE]: [pageRow('pg-1', 'imprint', 'published'), pageRow('pg-2', 'draft-page', 'draft')] } })
  const opens: Array<{ as?: string, actor?: string }> = []
  return {
    nav,
    redirects,
    seo,
    readRedirects,
    door,
    opens,
    probe: {
      door: (...[event, options]: Parameters<NonNullable<RouteProbe['door']>>) => {
        opens.push({ as: options?.as, actor: options?.actor })
        return door.tenantDb(event, options)
      },
      globals: {
        communitySettingsRowIdFor,
        writeCommunityNavOverride: nav,
        writeCommunityRedirects: redirects,
        writeCommunitySeo: seo,
        readCommunityRedirects: readRedirects,
      },
    },
  }
}

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

// ── Rollen-Tore ─────────────────────────────────────────────────────────────

describeRoleGatedRoute('PATCH /api/pages/navigation', loadNavigation, BRANDING, { body: NAV_BODY, ...stores().probe })
describeRoleGatedRoute('GET /api/pages/redirects', loadRedirectsGet, BRANDING, stores().probe)
describeRoleGatedRoute('PATCH /api/pages/redirects', loadRedirectsPatch, BRANDING, { body: REDIRECTS_BODY, ...stores().probe })
describeRoleGatedRoute('PATCH /api/pages/seo', loadSeo, BRANDING, { body: SEO_BODY, ...stores().probe })

// ── Wer schreibt (und wer nicht) ────────────────────────────────────────────

describe('Auftritt der Website: abgewiesen wird VOR jedem Lesen und Schreiben', () => {
  it.each(REJECTED)('%s: kein Speicher, kein Leser, keine Datentür', async (who) => {
    for (const [load, body] of [
      [loadNavigation, NAV_BODY],
      [loadRedirectsGet, undefined],
      [loadRedirectsPatch, REDIRECTS_BODY],
      [loadSeo, SEO_BODY],
    ] as const) {
      const s = stores()
      const run = await probeRoute(load, { who, body, ...s.probe })
      expect([401, 403]).toContain(run.status)
      expect(s.nav).not.toHaveBeenCalled()
      expect(s.redirects).not.toHaveBeenCalled()
      expect(s.seo).not.toHaveBeenCalled()
      expect(s.readRedirects).not.toHaveBeenCalled()
      expect(s.opens).toEqual([])
      resetCommunityWorld()
      vi.unstubAllGlobals()
    }
  })
})

describe.each(BRANDING.allow)('Auftritt der Website: %s speichert für DIESE Community', (who) => {
  it('PATCH /api/pages/navigation: prüft das Ziel über die Operator-Klinke als Betreiber-Einstellung, dann schreibt es', async () => {
    const s = stores()
    const run = await probeRoute(loadNavigation, { who, body: NAV_BODY, ...s.probe })

    expect(run.status).toBe(200)
    expect(s.opens).toEqual([{ as: 'operator', actor: 'operator' }])
    expect(s.door.calls).toEqual([{ handle: 'operator', method: 'list', table: PAGES_TABLE, id: undefined }])
    expect(s.nav).toHaveBeenCalledTimes(1)
    expect(s.nav.mock.calls[0]!.slice(1)).toEqual([COMMUNITY_ID, NAV_BODY])
    expect(run.result).toEqual(NAV_BODY)
  })

  it('PATCH /api/pages/navigation: ein Link auf eine unveröffentlichte Seite ist 400 unknown_page, nichts geschrieben', async () => {
    const s = stores()
    const run = await probeRoute(loadNavigation, {
      who,
      body: { entries: [{ id: 'link-draft', label: 'Entwurf', to: '/draft-page' }] },
      ...s.probe,
    })

    expect(run.status).toBe(400)
    expect(run.error?.data?.code).toBe('unknown_page')
    expect(s.nav).not.toHaveBeenCalled()
  })

  it('GET /api/pages/redirects: liest die Zeile DIESER Community', async () => {
    const s = stores()
    const run = await probeRoute(loadRedirectsGet, { who, ...s.probe })

    expect(run.status).toBe(200)
    expect(s.readRedirects).toHaveBeenCalledTimes(1)
    expect(s.readRedirects.mock.calls[0]!.slice(1)).toEqual([COMMUNITY_ID])
    expect(run.result).toEqual(SAVED_REDIRECTS)
  })

  it('PATCH /api/pages/redirects: schreibt normalisiert für DIESE Community', async () => {
    const s = stores()
    const run = await probeRoute(loadRedirectsPatch, { who, body: REDIRECTS_BODY, ...s.probe })

    expect(run.status).toBe(200)
    expect(s.redirects).toHaveBeenCalledTimes(1)
    expect(s.redirects.mock.calls[0]!.slice(1)).toEqual([COMMUNITY_ID, SAVED_REDIRECTS])
    expect(s.opens).toEqual([])
  })

  it('PATCH /api/pages/seo: schreibt für DIESE Community', async () => {
    const s = stores()
    const run = await probeRoute(loadSeo, { who, body: SEO_BODY, ...s.probe })

    expect(run.status).toBe(200)
    expect(s.seo).toHaveBeenCalledTimes(1)
    expect(s.seo.mock.calls[0]!.slice(1)).toEqual([COMMUNITY_ID, SEO_BODY])
    expect(s.opens).toEqual([])
  })
})

// ── Kontroll-Host: keine Community, deren Auftritt man ändern könnte ────────

describe('Auftritt der Website auf dem Kontroll-Host (Betreiber)', () => {
  it.each([
    ['PATCH /api/pages/navigation', loadNavigation, NAV_BODY],
    ['PATCH /api/pages/redirects', loadRedirectsPatch, REDIRECTS_BODY],
    ['PATCH /api/pages/seo', loadSeo, SEO_BODY],
  ] as const)('%s: 404, nichts geschrieben', async (_name, load, body) => {
    const s = stores()
    const run = await probeRoute(load, { who: 'operator', mode: 'control', body, ...s.probe })

    expect(run.status).toBe(404)
    expect(s.nav).not.toHaveBeenCalled()
    expect(s.redirects).not.toHaveBeenCalled()
    expect(s.seo).not.toHaveBeenCalled()
  })

  it('GET /api/pages/redirects: leere Liste, kein Lesen', async () => {
    const s = stores()
    const run = await probeRoute(loadRedirectsGet, { who: 'operator', mode: 'control', ...s.probe })

    expect(run.status).toBe(200)
    expect(run.result).toEqual({ rules: [] })
    expect(s.readRedirects).not.toHaveBeenCalled()
  })
})
