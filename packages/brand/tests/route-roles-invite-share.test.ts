import { afterEach, describe, expect, it, vi } from 'vitest'
import { hashBrandInviteCode } from '../server/utils/brandInvites'
import {
  FOREIGN_PROFILE,
  OWN_PROFILE,
  STAMP,
  UNKNOWN_PROFILE,
  USER_IDS,
  answerOf,
  brandWorld,
  callBrandRoute,
  shareRow,
  type BrandWho,
  type FakeBrandAppwrite,
  type FakeRow,
} from './support/brandRouteKit'

/**
 * ROLLEN-TESTS: EINLADUNG UND FREIGABE (OPS-009, BT1 b).
 *
 * Drei Routen, die NICHT hinter `requireBrandAccess` allein stehen:
 *
 *  - `POST /api/brand/invite/check` — öffentlich (die Einladungsseite fragt
 *    VOR der Anmeldung). Antwortet nur `{ valid }`. Ein unbekannter,
 *    widerrufener, eingelöster, abgelaufener Code und ein Code bei
 *    geschlossener Aufnahme bekommen DIESELBE Antwort. Sie schreibt nie.
 *  - `POST /api/brand/invite/redeem` — nur ein angemeldetes, VERIFIZIERTES
 *    Konto, und nur mit einem Code für SEINE Adresse. Ein Code für eine
 *    andere Adresse bekommt dieselbe Antwort wie ein unbekannter. Antwortet
 *    nur `{ redeemed }`.
 *  - `POST /api/brand/share/revoke` — Werkstatt-Zugang UND Besitz der Marke
 *    aus dem Rumpf; eine Freigabe einer anderen Marke bleibt unberührt.
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

const checkRoute = () => import('../server/api/brand/invite/check.post')
const redeemRoute = () => import('../server/api/brand/invite/redeem.post')
const revokeRoute = () => import('../server/api/brand/share/revoke.post')

const FUTURE = '2999-01-01T00:00:00.000Z'
const PAST = '2020-01-01T00:00:00.000Z'

/** Die Adresse, die `userOf('noAccess')` trägt (klein geschrieben). */
const INVITEE = 'noaccess@example.test'

function inviteRow(id: string, code: string, overrides: Record<string, unknown> = {}): FakeRow {
  return {
    $id: id,
    $tableId: 'brand_invites',
    $createdAt: STAMP,
    $updatedAt: STAMP,
    emailLower: INVITEE,
    codeHash: hashBrandInviteCode(code),
    createdByUserId: USER_IDS.operator,
    expiresAt: FUTURE,
    revokedAt: null,
    redeemedAt: null,
    redeemedByUserId: null,
    ...overrides,
  }
}

const CODES = {
  valid: 'code-gueltig',
  revoked: 'code-widerrufen',
  redeemed: 'code-eingeloest',
  expired: 'code-abgelaufen',
  otherEmail: 'code-andere-adresse',
  unknown: 'code-unbekannt',
}

/** Aufnahme-Modus `invite` und je ein Code in jedem Zustand. */
function inviteWorld(mode: 'invite' | 'closed' | 'open' = 'invite'): FakeBrandAppwrite {
  const db = brandWorld([
    inviteRow('inv-gueltig', CODES.valid),
    inviteRow('inv-widerrufen', CODES.revoked, { revokedAt: STAMP }),
    inviteRow('inv-eingeloest', CODES.redeemed, { redeemedAt: STAMP, redeemedByUserId: 'u-x' }),
    inviteRow('inv-abgelaufen', CODES.expired, { expiresAt: PAST }),
    inviteRow('inv-andere', CODES.otherEmail, { emailLower: 'jemand-anders@example.test' }),
  ])
  db.rows.find(row => row.$tableId === 'app_config')!.brandAdmissionMode = mode
  return db
}

// ── invite/check ────────────────────────────────────────────────────────────

describe('POST /api/brand/invite/check (öffentlich)', () => {
  const check = (who: BrandWho, code: string, db = inviteWorld()) => callBrandRoute(checkRoute, { who, db, body: { code } })

  for (const who of ['guest', 'noAccess'] as const) {
    it(`${who}: ein gültiger Code ⇒ genau { valid: true }, nichts geschrieben`, async () => {
      const db = inviteWorld()
      const run = await check(who, CODES.valid, db)
      expect(run.status).toBe(200)
      expect(run.result).toEqual({ valid: true })
      expect(db.writes()).toEqual([])
    })
  }

  for (const key of ['revoked', 'redeemed', 'expired', 'unknown'] as const) {
    it(`Code „${key}" ⇒ dieselbe Antwort wie ein unbekannter: { valid: false }`, async () => {
      const db = inviteWorld()
      const run = await check('guest', CODES[key], db)
      expect(answerOf(run)).toEqual(answerOf(await check('guest', CODES.unknown)))
      expect(run.result).toEqual({ valid: false })
      expect(db.writes()).toEqual([])
    })
  }

  it('die Antwort trägt nie die Adresse der Einladung', async () => {
    const run = await check('guest', CODES.valid)
    expect(JSON.stringify(run.result)).not.toContain(INVITEE)
    expect(Object.keys(run.result as object)).toEqual(['valid'])
  })

  for (const mode of ['closed', 'open'] as const) {
    it(`Aufnahme „${mode}": auch ein gültiger Code ⇒ { valid: false }`, async () => {
      const run = await check('guest', CODES.valid, inviteWorld(mode))
      expect(run.result).toEqual({ valid: false })
    })
  }

  it('ist die Ablage gestört, heißt es { valid: false } — kein Fehlertext', async () => {
    const db = inviteWorld()
    db.failOn.add('brand_invites')
    const run = await check('guest', CODES.valid, db)
    expect(run.status).toBe(200)
    expect(run.result).toEqual({ valid: false })
  })
})

// ── invite/redeem ───────────────────────────────────────────────────────────

describe('POST /api/brand/invite/redeem', () => {
  const redeem = (who: BrandWho, code: string, db: FakeBrandAppwrite, userFields: Record<string, unknown> = {}) =>
    callBrandRoute(redeemRoute, { who, db, body: { code }, userFields })

  it('Gast: 404, kein einziger Zugriff', async () => {
    const db = inviteWorld()
    const run = await redeem('guest', CODES.valid, db)
    expect(run.status).toBe(404)
    expect(db.calls).toEqual([])
  })

  it('Konto ohne bestätigte Adresse: 404, kein einziger Zugriff', async () => {
    const db = inviteWorld()
    const run = await redeem('noAccess', CODES.valid, db, { emailVerification: false })
    expect(run.status).toBe(404)
    expect(db.calls).toEqual([])
  })

  it('verifiziertes Konto mit dem Code SEINER Adresse: eingelöst, die Zugangs-Zeile gehört IHM', async () => {
    const db = inviteWorld()
    const run = await redeem('noAccess', CODES.valid, db)
    expect(run.result).toEqual({ redeemed: true })
    const granted = db.rows.filter(row => row.$tableId === 'brand_access' && row.inviteId === 'inv-gueltig')
    expect(granted).toEqual([expect.objectContaining({ userId: USER_IDS.noAccess, grantedVia: 'invite' })])
    expect(db.rows.find(row => row.$id === 'inv-gueltig')).toMatchObject({ redeemedByUserId: USER_IDS.noAccess })
  })

  it('ein ANDERES Konto mit diesem Code (fremde Adresse): dieselbe Antwort wie ein unbekannter Code, nichts geschrieben', async () => {
    const db = inviteWorld()
    const run = await redeem('stranger', CODES.valid, db)
    expect(run.result).toEqual({ redeemed: false })
    expect(answerOf(run)).toEqual(answerOf(await redeem('stranger', CODES.unknown, inviteWorld())))
    expect(db.writes()).toEqual([])
  })

  for (const key of ['revoked', 'redeemed', 'expired', 'otherEmail', 'unknown'] as const) {
    it(`Code „${key}": { redeemed: false }, nichts geschrieben`, async () => {
      const db = inviteWorld()
      const run = await redeem('noAccess', CODES[key], db)
      expect(run.status).toBe(200)
      expect(run.result).toEqual({ redeemed: false })
      expect(db.writes()).toEqual([])
    })
  }

  for (const mode of ['closed', 'open'] as const) {
    it(`Aufnahme „${mode}": der gültige Code schafft keinen Zugang`, async () => {
      const db = inviteWorld(mode)
      const run = await redeem('noAccess', CODES.valid, db)
      expect(run.result).toEqual({ redeemed: false })
      expect(db.writes()).toEqual([])
    })
  }

  it('die Antwort trägt nur `redeemed`', async () => {
    const run = await redeem('noAccess', CODES.valid, inviteWorld())
    expect(Object.keys(run.result as object)).toEqual(['redeemed'])
  })
})

// ── share/revoke ────────────────────────────────────────────────────────────

describe('POST /api/brand/share/revoke', () => {
  const shares = () => [shareRow('s-eigen', OWN_PROFILE), shareRow('s-fremd', FOREIGN_PROFILE)]
  const revoke = (who: BrandWho, body: Record<string, unknown>, db = brandWorld(shares())) =>
    callBrandRoute(revokeRoute, { who, db, body })
  const revokedAt = (db: FakeBrandAppwrite, id: string) => db.rows.find(row => row.$id === id)?.revokedAt

  for (const who of ['guest', 'noAccess', 'revoked'] as const) {
    it(`${who}: 404, keine Freigabe gelesen, nichts geschrieben`, async () => {
      const db = brandWorld(shares())
      const run = await revoke(who, { profileId: OWN_PROFILE }, db)
      expect(run.status).toBe(404)
      expect(db.contentTouches()).toEqual([])
    })
  }

  for (const who of ['stranger', 'operator'] as const) {
    it(`${who} mit einer fremden Marke: wie eine unbekannte Marke, Freigabe bleibt bestehen`, async () => {
      const db = brandWorld(shares())
      const run = await revoke(who, { profileId: OWN_PROFILE }, db)
      expect(run.status).toBe(404)
      expect(db.contentTouches()).toEqual([])
      expect(revokedAt(db, 's-eigen')).toBeNull()
      expect(answerOf(run)).toEqual(answerOf(await revoke(who, { profileId: UNKNOWN_PROFILE })))
    })
  }

  it('Besitzer: seine Freigabe ist widerrufen', async () => {
    const db = brandWorld(shares())
    const run = await revoke('owner', { profileId: OWN_PROFILE }, db)
    expect(run.result).toEqual({ revoked: 1 })
    expect(revokedAt(db, 's-eigen')).toEqual(expect.any(String))
    expect(revokedAt(db, 's-fremd')).toBeNull()
  })

  it('Besitzer nennt die Freigabe einer ANDEREN Marke: nichts widerrufen', async () => {
    const db = brandWorld(shares())
    const run = await revoke('owner', { profileId: OWN_PROFILE, shareId: 's-fremd' }, db)
    expect(run.result).toEqual({ revoked: 0 })
    expect(revokedAt(db, 's-fremd')).toBeNull()
    expect(db.writes()).toEqual([])
  })
})
