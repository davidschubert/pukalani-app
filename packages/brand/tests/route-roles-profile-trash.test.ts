import { afterEach, describe, expect, it, vi } from 'vitest'
import { listAllRows, listAllRowsIfTableExists } from '../../core/server/utils/listAllRows'
import {
  __resetRetentionJobsForTests,
  isRetentionRowGone,
  retentionModeOf,
  runRetentionJob,
} from '../../core/server/utils/rowRetention'
import {
  FOREIGN_PROFILE,
  OWN_PROFILE,
  UNKNOWN_PROFILE,
  answerOf,
  brandWorld,
  callBrandRoute,
  describeWorkshopRoute,
  leaks,
  type BrandWho,
  type FakeBrandAppwrite,
} from './support/brandRouteKit'

/**
 * ROLLEN-TESTS: DER PAPIERKORB DER MARKEN (WH1, OPS-009).
 *
 * Vier Routen, jede ECHT mit `requireBrandAccess` und der Besitz-Prüfung;
 * nachgebaut ist nur Appwrite. Wer durch darf, steht ausgeschrieben:
 *  - löschen, zurückholen, endgültig löschen, die Liste: nur der Besitzer —
 *    weder ein anderes Konto mit Zugang noch der Betreiber;
 *  - der Lauf von Hand: nur der Betreiber (`users.manage`).
 */

afterEach(() => {
  vi.unstubAllGlobals()
  __resetRetentionJobsForTests()
})

const ERASED_AT = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()

const GLOBALS = {
  listAllRows,
  listAllRowsIfTableExists,
  requireRecentAuth: async () => {},
  retentionModeOf,
  runRetentionJob,
  isRetentionRowGone,
}

function trashed(db: FakeBrandAppwrite, profileId: string, erasedAt = ERASED_AT): FakeBrandAppwrite {
  const row = db.rows.find(entry => entry.$id === profileId && entry.$tableId === 'brand_profiles')
  if (!row) throw new Error(`Probe-Marke ${profileId} fehlt`)
  row.erasedAt = erasedAt
  return db
}

const profileOf = (db: FakeBrandAppwrite, id: string) =>
  db.rows.find(row => row.$id === id && row.$tableId === 'brand_profiles')

const DENIED: readonly BrandWho[] = ['guest', 'noAccess', 'revoked']

// ── Löschen = in den Papierkorb ─────────────────────────────────────────────

describeWorkshopRoute('DELETE /api/brand/profiles/[id]', () => import('../server/api/brand/profiles/[id]/index.delete'), {
  globals: () => GLOBALS,
  owner: (run, db) => {
    expect(run.result).toMatchObject({ trashed: true })
    expect(profileOf(db, OWN_PROFILE)?.erasedAt).toEqual(expect.any(String))
    // Nichts am Inhalt gelöscht: die Bausteine stehen noch.
    expect(db.rows.some(row => row.$tableId === 'brand_steps' && row.profileId === OWN_PROFILE)).toBe(true)
  },
})

describe('eine Marke im Papierkorb ist für jeden Weg über loadOwnedProfile weg', () => {
  it('Besitzer: GET /api/brand/profiles/[id] ⇒ dieselbe 404 wie eine unbekannte Marke', async () => {
    const load = () => import('../server/api/brand/profiles/[id]/index.get')
    const gone = await callBrandRoute(load, { who: 'owner', db: trashed(brandWorld(), OWN_PROFILE), params: { id: OWN_PROFILE }, globals: GLOBALS })
    const unknown = await callBrandRoute(load, { who: 'owner', db: brandWorld(), params: { id: UNKNOWN_PROFILE }, globals: GLOBALS })
    expect(gone.status).toBe(404)
    expect(answerOf(gone)).toEqual(answerOf(unknown))
  })

  it('Besitzer: die Liste nennt sie nicht mehr', async () => {
    const run = await callBrandRoute(() => import('../server/api/brand/profiles/index.get'), {
      who: 'owner', db: trashed(brandWorld(), OWN_PROFILE), globals: GLOBALS,
    })
    expect(run.status).toBe(200)
    expect((run.result as { profiles: unknown[] }).profiles).toEqual([])
  })
})

// ── Die Liste „Gelöschte Marken" ────────────────────────────────────────────

describe('GET /api/brand/profiles/trash', () => {
  const load = () => import('../server/api/brand/profiles/trash.get')

  for (const who of DENIED) {
    it(`${who}: 404, nichts gelesen außer den Fragen der Wache`, async () => {
      const db = trashed(brandWorld(), OWN_PROFILE)
      const run = await callBrandRoute(load, { who, db, globals: GLOBALS })
      expect(run.status).toBe(404)
      expect(db.contentTouches()).toEqual([])
    })
  }

  it('Besitzer: nur die eigene gelöschte Marke — die fremde gelöschte fehlt', async () => {
    const db = trashed(trashed(brandWorld(), OWN_PROFILE), FOREIGN_PROFILE)
    const run = await callBrandRoute(load, { who: 'owner', db, globals: GLOBALS })
    expect(run.status).toBe(200)
    const items = (run.result as { items: { id: string, daysLeft: number }[] }).items
    expect(items.map(item => item.id)).toEqual([OWN_PROFILE])
    expect(items[0]!.daysLeft).toBe(85)
    expect(leaks(run.result, FOREIGN_PROFILE)).toBe(false)
  })

  it('der Betreiber sieht im Papierkorb nichts Fremdes', async () => {
    const db = trashed(brandWorld(), OWN_PROFILE)
    const run = await callBrandRoute(load, { who: 'operator', db, globals: GLOBALS })
    expect(leaks(run.result, OWN_PROFILE)).toBe(false)
  })

  it('eine fällige Marke (über 90 Tage) steht nicht mehr darin', async () => {
    const db = trashed(brandWorld(), OWN_PROFILE, '2020-01-01T00:00:00.000Z')
    const run = await callBrandRoute(load, { who: 'owner', db, globals: GLOBALS })
    expect((run.result as { items: unknown[] }).items).toEqual([])
  })
})

// ── Zurückholen und endgültig löschen ───────────────────────────────────────

for (const [name, load, method] of [
  ['POST /api/brand/profiles/[id]/restore', () => import('../server/api/brand/profiles/[id]/restore.post'), 'restore'],
  ['DELETE /api/brand/profiles/[id]/purge', () => import('../server/api/brand/profiles/[id]/purge.delete'), 'purge'],
] as const) {
  describe(name, () => {
    for (const who of DENIED) {
      it(`${who}: 404, keine Inhalte, nichts geschrieben`, async () => {
        const db = trashed(brandWorld(), OWN_PROFILE)
        const run = await callBrandRoute(load, { who, db, params: { id: OWN_PROFILE }, globals: GLOBALS })
        expect(run.status).toBe(404)
        expect(db.contentTouches()).toEqual([])
      })
    }

    for (const who of ['stranger', 'operator'] as const) {
      it(`${who} an fremder gelöschter Marke: dieselbe Antwort wie eine unbekannte, nichts geschrieben`, async () => {
        const db = trashed(brandWorld(), OWN_PROFILE)
        const foreign = await callBrandRoute(load, { who, db, params: { id: OWN_PROFILE }, globals: GLOBALS })
        const unknown = await callBrandRoute(load, { who, db: brandWorld(), params: { id: UNKNOWN_PROFILE }, globals: GLOBALS })
        expect(foreign.status).toBe(404)
        expect(answerOf(foreign)).toEqual(answerOf(unknown))
        expect(db.writes()).toEqual([])
        expect(profileOf(db, OWN_PROFILE)?.erasedAt).toBe(ERASED_AT)
      })
    }

    it('Besitzer an einer LEBENDEN Marke: 404, nichts geschrieben', async () => {
      const db = brandWorld()
      const run = await callBrandRoute(load, { who: 'owner', db, params: { id: OWN_PROFILE }, globals: GLOBALS })
      expect(run.status).toBe(404)
      expect(db.writes()).toEqual([])
    })

    it('Besitzer: kommt durch', async () => {
      const db = trashed(brandWorld(), OWN_PROFILE)
      const run = await callBrandRoute(load, { who: 'owner', db, params: { id: OWN_PROFILE }, globals: GLOBALS })
      expect(run.status, run.error?.statusText).toBe(200)
      if (method === 'restore') expect(profileOf(db, OWN_PROFILE)?.erasedAt).toBeNull()
      else expect(profileOf(db, OWN_PROFILE)).toBeUndefined()
    })
  })
}

describe('DELETE /api/brand/profiles/[id]/purge — nur nach frischer Anmeldung', () => {
  it('Besitzer mit alter Anmeldung: 403 reauth_required, nichts gelöscht', async () => {
    const db = trashed(brandWorld(), OWN_PROFILE)
    const run = await callBrandRoute(() => import('../server/api/brand/profiles/[id]/purge.delete'), {
      who: 'owner', db, params: { id: OWN_PROFILE },
      globals: {
        ...GLOBALS,
        requireRecentAuth: async () => {
          throw Object.assign(new Error('Recent sign-in required'), { status: 403, data: { code: 'reauth_required' } })
        },
      },
    })
    expect(run.status).toBe(403)
    expect(db.writes()).toEqual([])
  })
})

// ── Der Lauf von Hand ───────────────────────────────────────────────────────

describe('POST /api/brand/admin/profile-trash/run', () => {
  const load = () => import('../server/api/brand/admin/profile-trash/run.post')

  for (const who of ['guest', 'noAccess', 'stranger', 'owner', 'staff'] as const) {
    it(`${who}: abgelehnt, nichts gelesen, nichts gelöscht`, async () => {
      const db = trashed(brandWorld(), OWN_PROFILE, '2020-01-01T00:00:00.000Z')
      const run = await callBrandRoute(load, { who, db, globals: GLOBALS })
      expect([401, 403]).toContain(run.status)
      expect(db.contentTouches()).toEqual([])
    })
  }

  it('Betreiber: zählt die fällige Marke, löscht ohne apply nichts', async () => {
    const db = trashed(brandWorld(), OWN_PROFILE, '2020-01-01T00:00:00.000Z')
    const run = await callBrandRoute(load, { who: 'operator', db, globals: GLOBALS })
    expect(run.status, run.error?.statusText).toBe(200)
    expect(run.result).toMatchObject({ mode: 'count', expired: 1, deleted: 0 })
    expect(db.writes()).toEqual([])
  })

  it('Betreiber mit apply, Schalter nicht auf apply: 409, nichts gelöscht', async () => {
    const db = trashed(brandWorld(), OWN_PROFILE, '2020-01-01T00:00:00.000Z')
    const run = await callBrandRoute(load, { who: 'operator', db, body: { apply: true }, globals: GLOBALS })
    expect(run.status).toBe(409)
    expect(run.error?.data?.code).toBe('profile_trash_not_apply')
    expect(db.writes()).toEqual([])
  })
})
