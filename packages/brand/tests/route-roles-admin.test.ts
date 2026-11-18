import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeInstanceRoleGate, type InstanceRoleExpectation } from '../../core/tests/support/instanceRoleGate'
import {
  OWN_PROFILE,
  STAMP,
  USER_IDS,
  brandWorld,
  callBrandRoute,
  type BrandWho,
  type FakeBrandAppwrite,
  type FakeRow,
} from './support/brandRouteKit'

/**
 * ROLLEN-TESTS: DIE BETREIBER-ROUTEN DES MARKENBERATERS (OPS-009, BT1 b).
 *
 * Freischalten und Sperren von Brand Design und Ableitung, die Listen dazu,
 * die Erstgesprächs-Anfragen. Das Tor ist das Instanz-Recht `users.manage`
 * (`requirePermission`, globale Labels). Zwei Proben je Route:
 *
 *  1. `describeInstanceRoleGate` (Core-Prüfstand): Gast 401, Konto ohne
 *     Label 403, entferntes Konto 403, jede Community-Rolle 403, das
 *     Karten-Mitglied 403 — jeweils mit geschlossener Datentür; der
 *     Betreiber erreicht sie.
 *  2. Mit der brand-Ablage: der Betreiber schreibt wirklich; der Besitzer
 *     der Marke (mit Werkstatt-Zugang!) und die anderen Abgewiesenen lösen
 *     KEINEN einzigen Zugriff aus — die Ablehnung kommt vor dem ersten Lesen
 *     und Schreiben.
 */

/** AUSGESCHRIEBEN: nur der Betreiber. Keine Community-Rolle, kein Karten-Mitglied. */
const OPERATOR_ONLY: InstanceRoleExpectation = {
  allow: ['operator'],
  deny: ['owner', 'admin', 'moderator', 'editor', 'member', 'staff'],
}

const runtimeConfig = () => ({ public: { appwriteDatabaseId: 'db' } })
const base = { globals: { useRuntimeConfig: runtimeConfig } }

const routes = {
  derivationUnlocks: () => import('../server/api/brand/admin/derivation-unlocks/index.get'),
  designUnlocks: () => import('../server/api/brand/admin/design-unlocks/index.get'),
  introList: () => import('../server/api/brand/admin/intro-calls/index.get'),
  introPatch: () => import('../server/api/brand/admin/intro-calls/[id]/index.patch'),
  derivationLock: () => import('../server/api/brand/admin/profiles/[id]/derivation-lock.post'),
  derivationUnlock: () => import('../server/api/brand/admin/profiles/[id]/derivation-unlock.post'),
  designLock: () => import('../server/api/brand/admin/profiles/[id]/design-lock.post'),
  designUnlock: () => import('../server/api/brand/admin/profiles/[id]/design-unlock.post'),
}

describeInstanceRoleGate('GET /api/brand/admin/derivation-unlocks', routes.derivationUnlocks, OPERATOR_ONLY, base)
describeInstanceRoleGate('GET /api/brand/admin/design-unlocks', routes.designUnlocks, OPERATOR_ONLY, base)
// `GET …/intro-calls` fängt jeden Fehler hinter dem Tor als 503 ab — auch das
// Ende der Probe an der Datentür. Ihre Personen prüft deshalb unten die
// brand-Ablage („Die Listen der Betreiber mit der Ablage").
describeInstanceRoleGate('PATCH /api/brand/admin/intro-calls/[id]', routes.introPatch, OPERATOR_ONLY, {
  ...base,
  params: { id: 'ic-1' },
  body: { status: 'contacted' },
})
for (const [name, load] of [
  ['derivation-lock', routes.derivationLock],
  ['derivation-unlock', routes.derivationUnlock],
  ['design-lock', routes.designLock],
  ['design-unlock', routes.designUnlock],
] as const) {
  describeInstanceRoleGate(`POST /api/brand/admin/profiles/[id]/${name}`, load, OPERATOR_ONLY, { ...base, params: { id: OWN_PROFILE } })
}

// ── Mit der Ablage: wer schreibt wirklich? ──────────────────────────────────

afterEach(() => {
  vi.unstubAllGlobals()
})

const introRow = (): FakeRow => ({
  $id: 'ic-1',
  $tableId: 'brand_intro_requests',
  $createdAt: STAMP,
  $updatedAt: STAMP,
  name: 'Anfrage',
  email: 'anfrage@example.test',
  emailLower: 'anfrage@example.test',
  company: '',
  message: 'GEHEIM-anliegen',
  phone: '',
  locale: 'de',
  source: '',
  profileId: '',
  status: 'new',
  note: '',
})

/** Die Marke des Besitzers im Ausgangszustand „gesperrt", Foundation fertig. */
function lockedWorld(): FakeBrandAppwrite {
  const db = brandWorld([introRow()])
  const profile = db.rows.find(row => row.$id === OWN_PROFILE)!
  Object.assign(profile, { designUnlockedAt: null, designUnlockedBy: null, derivationUnlockedAt: null, derivationUnlockedVia: null, derivationUnlockedBy: null })
  return db
}

/** Abgewiesen — AUSGESCHRIEBEN: auch der Besitzer selbst schaltet seine Marke nicht frei. */
const REFUSED: readonly { who: BrandWho, status: number }[] = [
  { who: 'guest', status: 401 },
  { who: 'noAccess', status: 403 },
  { who: 'owner', status: 403 },
  { who: 'stranger', status: 403 },
  { who: 'staff', status: 403 },
  { who: 'member', status: 403 },
]

const writing: { name: string, load: () => Promise<{ default: unknown }>, params: Record<string, string>, body?: unknown, prepare: (db: FakeBrandAppwrite) => void, effect: (db: FakeBrandAppwrite) => void }[] = [
  {
    name: 'POST …/design-unlock',
    load: routes.designUnlock,
    params: { id: OWN_PROFILE },
    prepare: () => {},
    effect: (db) => {
      expect(db.rows.find(row => row.$id === OWN_PROFILE)).toMatchObject({ designUnlockedBy: USER_IDS.operator })
    },
  },
  {
    name: 'POST …/derivation-unlock',
    load: routes.derivationUnlock,
    params: { id: OWN_PROFILE },
    prepare: () => {},
    effect: (db) => {
      expect(db.rows.find(row => row.$id === OWN_PROFILE)).toMatchObject({ derivationUnlockedBy: USER_IDS.operator, derivationUnlockedVia: 'operator' })
    },
  },
  {
    name: 'POST …/design-lock',
    load: routes.designLock,
    params: { id: OWN_PROFILE },
    prepare: (db) => {
      Object.assign(db.rows.find(row => row.$id === OWN_PROFILE)!, { designUnlockedAt: STAMP, designUnlockedBy: 'u-x' })
    },
    effect: (db) => {
      expect(db.rows.find(row => row.$id === OWN_PROFILE)?.designUnlockedAt).toBeNull()
    },
  },
  {
    name: 'POST …/derivation-lock',
    load: routes.derivationLock,
    params: { id: OWN_PROFILE },
    prepare: (db) => {
      Object.assign(db.rows.find(row => row.$id === OWN_PROFILE)!, { derivationUnlockedAt: STAMP, derivationUnlockedVia: 'operator', derivationUnlockedBy: 'u-x' })
    },
    effect: (db) => {
      expect(db.rows.find(row => row.$id === OWN_PROFILE)?.derivationUnlockedAt).toBeNull()
    },
  },
  {
    name: 'PATCH …/intro-calls/[id]',
    load: routes.introPatch,
    params: { id: 'ic-1' },
    body: { status: 'contacted' },
    prepare: () => {},
    effect: (db) => {
      expect(db.rows.find(row => row.$id === 'ic-1')?.status).toBe('contacted')
    },
  },
]

for (const route of writing) {
  describe(`${route.name} mit der Ablage`, () => {
    for (const { who, status } of REFUSED) {
      it(`${who}: ${status}, kein einziger Zugriff auf die Ablage`, async () => {
        const db = lockedWorld()
        route.prepare(db)
        const run = await callBrandRoute(route.load, { who, db, params: route.params, body: route.body })
        expect(run.status).toBe(status)
        expect(db.calls).toEqual([])
        expect(db.opened()).toBe(0)
      })
    }

    it('Betreiber: die Änderung steht in der Ablage', async () => {
      const db = lockedWorld()
      route.prepare(db)
      const run = await callBrandRoute(route.load, { who: 'operator', db, params: route.params, body: route.body })
      expect(run.status, run.error?.statusText).toBe(200)
      route.effect(db)
    })
  })
}

describe('Die Listen der Betreiber mit der Ablage', () => {
  for (const [name, load] of [
    ['derivation-unlocks', routes.derivationUnlocks],
    ['design-unlocks', routes.designUnlocks],
  ] as const) {
    it(`${name}: der Betreiber sieht ALLE Marken, der Besitzer bekommt 403 ohne Zugriff`, async () => {
      const db = lockedWorld()
      const run = await callBrandRoute(load, { who: 'operator', db })
      expect(run.status).toBe(200)
      expect((run.result as { items: { profileId?: string, id?: string }[] }).items).toHaveLength(2)

      const refusedDb = lockedWorld()
      const refused = await callBrandRoute(load, { who: 'owner', db: refusedDb })
      expect(refused.status).toBe(403)
      expect(refusedDb.calls).toEqual([])
    })
  }

  it('intro-calls: der Betreiber liest die Anliegen', async () => {
    const run = await callBrandRoute(routes.introList, { who: 'operator', db: lockedWorld() })
    expect(run.status).toBe(200)
    expect(JSON.stringify(run.result)).toContain('GEHEIM-anliegen')
  })

  for (const { who, status } of [...REFUSED, { who: 'revoked' as const, status: 403 }]) {
    it(`intro-calls: ${who} ⇒ ${status}, kein Anliegen, kein Zugriff`, async () => {
      const db = lockedWorld()
      const refused = await callBrandRoute(routes.introList, { who, db })
      expect(refused.status).toBe(status)
      expect(refused.result).toBeUndefined()
      expect(db.calls).toEqual([])
    })
  }
})
