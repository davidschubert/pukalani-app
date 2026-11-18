import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FOREIGN_PROFILE,
  OWN_PROFILE,
  USER_IDS,
  brandWorld,
  callBrandRoute,
  describeWorkshopRoute,
  leaks,
  shareRow,
  type BrandWho,
} from './support/brandRouteKit'

/**
 * ROLLEN-TESTS: DIE MARKEN SELBST (OPS-009, BT1 b).
 *
 * Liste, Anlage, Punktzahlen, eine Marke lesen und ändern, die
 * Website-Analyse. Jede Route läuft ECHT, mit `requireBrandAccess` und dem
 * Besitz-Beleg aus `loadOwnedProfile`; nachgebaut ist nur Appwrite.
 *
 * Wer durch darf, steht ausgeschrieben: an einer Marke nur ihr Besitzer —
 * weder ein anderes Konto mit Zugang noch der Betreiber.
 */

// Kein Netz: der Abruf der Website ist nachgebaut, die Route bleibt echt.
let fetchCalls = 0
vi.mock('../server/utils/brandSiteFetch', async (importOriginal) => {
  const original = await importOriginal<typeof import('../server/utils/brandSiteFetch')>()
  return {
    ...original,
    fetchBrandSite: async () => {
      fetchCalls += 1
      return {
        content: { title: 'Titel', description: 'Beschreibung', text: 'Text' },
        signals: {},
        finalUrl: 'https://p-eigen.example.test/',
        finalHost: 'p-eigen.example.test',
        httpsUpgraded: false,
      }
    },
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchCalls = 0
})

const listRoute = () => import('../server/api/brand/profiles/index.get')
const createRoute = () => import('../server/api/brand/profiles/index.post')
const scoresRoute = () => import('../server/api/brand/profiles/scores.get')

const DENIED: readonly BrandWho[] = ['guest', 'noAccess', 'revoked']

// ── Listen: nur die EIGENEN Marken ──────────────────────────────────────────

describe('GET /api/brand/profiles (Liste)', () => {
  for (const who of DENIED) {
    it(`${who}: 404, nichts gelesen außer den Fragen der Wache`, async () => {
      const db = brandWorld()
      const run = await callBrandRoute(listRoute, { who, db })
      expect(run.status).toBe(404)
      expect(db.contentTouches()).toEqual([])
    })
  }

  it('Besitzer: nur die eigene Marke — die fremde liegt daneben und fehlt', async () => {
    const db = brandWorld([shareRow('s-fremd', FOREIGN_PROFILE)])
    // GEGENPROBE: die Probe-Daten enthalten die fremde Marke wirklich.
    expect(db.rows.some(row => row.$id === FOREIGN_PROFILE && row.$tableId === 'brand_profiles')).toBe(true)
    const run = await callBrandRoute(listRoute, { who: 'owner', db })
    expect(run.status).toBe(200)
    const ids = (run.result as { profiles: { id: string }[] }).profiles.map(entry => entry.id)
    expect(ids).toEqual([OWN_PROFILE])
    expect(leaks(run.result, FOREIGN_PROFILE)).toBe(false)
  })

  it('der Fremde sieht nur SEINE Marke', async () => {
    const run = await callBrandRoute(listRoute, { who: 'stranger', db: brandWorld() })
    const ids = (run.result as { profiles: { id: string }[] }).profiles.map(entry => entry.id)
    expect(ids).toEqual([FOREIGN_PROFILE])
  })

  it('der Betreiber (mit Zugang, ohne eigene Marke): leere Liste, keine fremde', async () => {
    const run = await callBrandRoute(listRoute, { who: 'operator', db: brandWorld() })
    expect(run.status).toBe(200)
    expect((run.result as { profiles: unknown[] }).profiles).toEqual([])
  })
})

describe('GET /api/brand/profiles/scores (Punktzahlen)', () => {
  const checkRow = (id: string, profileId: string, urlKey: string, score: number) => ({
    $id: id,
    $tableId: 'brand_checks',
    $createdAt: '2026-09-02T10:00:00.000Z',
    $updatedAt: '2026-09-02T10:00:00.000Z',
    profileId,
    urlKey,
    score,
    band: 'mid',
    source: 'website',
    hidden: false,
    erasedAt: null,
  })

  for (const who of DENIED) {
    it(`${who}: 404, nichts gelesen außer den Fragen der Wache`, async () => {
      const db = brandWorld()
      const run = await callBrandRoute(scoresRoute, { who, db })
      expect(run.status).toBe(404)
      expect(db.contentTouches()).toEqual([])
    })
  }

  it('Besitzer: nur die eigene Marke — die fremde Marke und ihr Check fehlen', async () => {
    const db = brandWorld([
      checkRow('c-eigen', OWN_PROFILE, 'own.example.test', 61),
      checkRow('c-fremd', FOREIGN_PROFILE, 'fremd.example.test', 99),
    ])
    expect(db.rows.some(row => row.$id === 'c-fremd')).toBe(true)
    const run = await callBrandRoute(scoresRoute, { who: 'owner', db })
    expect(run.status).toBe(200)
    const items = (run.result as { items: { profileId: string, website: unknown }[] }).items
    expect(items.map(item => item.profileId)).toEqual([OWN_PROFILE])
    expect(items[0]?.website).toMatchObject({ checkId: 'c-eigen', score: 61 })
    expect(leaks(run.result, FOREIGN_PROFILE)).toBe(false)
    expect(leaks(run.result, 'c-fremd')).toBe(false)
  })

  it('der Betreiber ohne eigene Marke: leere Liste', async () => {
    const run = await callBrandRoute(scoresRoute, { who: 'operator', db: brandWorld() })
    expect(run.status).toBe(200)
    expect(run.result).toEqual({ items: [] })
  })
})

// ── Anlage ──────────────────────────────────────────────────────────────────

describe('POST /api/brand/profiles (Anlage)', () => {
  const body = {
    title: 'Neue Marke',
    contentLocale: 'de',
    pathKind: 'new',
    hasName: true,
    team: 'solo',
    industry: 'Kaffee',
    about: 'Wir rösten.',
    audience: 'Cafés',
  }

  for (const who of DENIED) {
    it(`${who}: 404, nichts geschrieben`, async () => {
      const db = brandWorld()
      const run = await callBrandRoute(createRoute, { who, db, body })
      expect(run.status).toBe(404)
      expect(db.writes()).toEqual([])
    })
  }

  for (const who of ['owner', 'stranger'] as const) {
    it(`${who} (mit Zugang): legt eine Marke an, die IHM gehört`, async () => {
      const db = brandWorld()
      const run = await callBrandRoute(createRoute, { who, db, body })
      expect(run.status).toBe(200)
      const created = db.rows.filter(row => row.$tableId === 'brand_profiles' && row.title === 'Neue Marke')
      expect(created).toHaveLength(1)
      expect(created[0]).toMatchObject({ ownerType: 'user', ownerId: USER_IDS[who], createdByUserId: USER_IDS[who] })
    })
  }

  it('ein Besitzer im Rumpf wird abgelehnt (400) — nichts geschrieben', async () => {
    const db = brandWorld()
    const run = await callBrandRoute(createRoute, { who: 'stranger', db, body: { ...body, ownerId: USER_IDS.owner } })
    expect(run.status).toBe(400)
    expect(db.writes()).toEqual([])
  })
})

// ── Eine Marke ──────────────────────────────────────────────────────────────

describeWorkshopRoute('GET /api/brand/profiles/[id]', () => import('../server/api/brand/profiles/[id]/index.get'), {
  owner: (run) => {
    expect((run.result as { profile: { id: string } }).profile.id).toBe(OWN_PROFILE)
  },
})

describeWorkshopRoute('PATCH /api/brand/profiles/[id]', () => import('../server/api/brand/profiles/[id]/index.patch'), {
  body: { title: 'Umbenannt' },
  owner: (_run, db) => {
    expect(db.rows.find(row => row.$id === OWN_PROFILE)?.title).toBe('Umbenannt')
  },
})

describe('PATCH /api/brand/profiles/[id] — die fremde Marke bleibt unverändert', () => {
  it('stranger: 404, Titel der Marke unverändert', async () => {
    const db = brandWorld()
    const before = { ...db.rows.find(row => row.$id === OWN_PROFILE) }
    const run = await callBrandRoute(() => import('../server/api/brand/profiles/[id]/index.patch'), {
      who: 'stranger',
      db,
      params: { id: OWN_PROFILE },
      body: { title: 'Übernommen' },
    })
    expect(run.status).toBe(404)
    expect(db.rows.find(row => row.$id === OWN_PROFILE)).toEqual(before)
  })
})

describeWorkshopRoute('POST /api/brand/profiles/[id]/analyze', () => import('../server/api/brand/profiles/[id]/analyze.post'), {
  body: {},
  owner: (run, db) => {
    expect(run.result).toMatchObject({ analyzed: true })
    expect(fetchCalls).toBe(1)
    expect(db.rows.find(row => row.$id === OWN_PROFILE)?.siteAnalysisUrl).toBe('https://p-eigen.example.test')
  },
})

describe('POST /api/brand/profiles/[id]/analyze — kein Abruf für Fremde', () => {
  it('stranger an fremder Marke: kein Abruf der Website, nichts geschrieben', async () => {
    const db = brandWorld()
    const run = await callBrandRoute(() => import('../server/api/brand/profiles/[id]/analyze.post'), {
      who: 'stranger',
      db,
      params: { id: OWN_PROFILE },
      body: { url: 'https://example.test' },
    })
    expect(run.status).toBe(404)
    expect(fetchCalls).toBe(0)
    expect(db.writes()).toEqual([])
  })
})
