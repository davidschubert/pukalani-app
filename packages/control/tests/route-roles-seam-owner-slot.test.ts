import { afterEach, describe, expect, it, vi } from 'vitest'
import { decideOwnerReassign } from '../shared/communityOwnerSlot'
import { COMMUNITY_MEMBERS_TABLE } from '../shared/types/communityMember'
import { COMMUNITIES_TABLE } from '../shared/types/tenantRecord'
import {
  COMMUNITY_ID,
  FOREIGN_PROJECT,
  POOL_PROJECT,
  describeSeamSecret,
  probeControlRoute,
  resetControlWorld,
  runtimeUserIdOf,
  type ControlRun,
} from './support/controlRouteHarness'

/**
 * VERWAISTER INHABER-PLATZ (LA2, 2026-11-24) — die zwei Naht-Routen.
 *
 *  - `owner-status` liest: Name, Status, die aktiven Owner ohne Adresse.
 *  - `owner-reassign` vergibt unter der Team-Sperre: die Menge der aktiven
 *    Owner muss GENAU die genannte sein, erst das neue Konto zum Owner, dann
 *    die verwaisten Zeilen löschen, und bricht das Löschen ab, wird der erste
 *    Schritt zurückgenommen (502).
 *
 * Echte Handler, echte Wachen, nachgebaute Ablage
 * (`support/controlRouteHarness.ts`).
 */

vi.mock('node-appwrite', async importOriginal =>
  (await import('./support/runtimeAccounts')).withFakeAccount(await importOriginal<typeof import('node-appwrite')>()))

afterEach(resetControlWorld)

const ownerStatus = () => import('../server/api/control/community/members/owner-status.post')
const ownerReassign = () => import('../server/api/control/community/members/owner-reassign.post')

/** Eine Community, deren einziger Owner sein Konto gelöscht hat. */
const ORPHAN_COMMUNITY = 'c-verwaist'
const GONE = 'ru-geloescht'
const ORPHAN_ROW = 'm-geloescht'

type Seed = NonNullable<Parameters<typeof probeControlRoute>[1]['seed']>
const seedOrphan = (status = 'active'): Seed => (db) => {
  db.seed(COMMUNITIES_TABLE, {
    $id: ORPHAN_COMMUNITY, projectId: POOL_PROJECT, name: 'Verwaist', host: 'verwaist.probe.example.test',
    status, plan: 'personal', openRegistration: false, suspension: '', profile: '',
  })
  db.seed(COMMUNITY_MEMBERS_TABLE, {
    $id: ORPHAN_ROW, communityId: ORPHAN_COMMUNITY, runtimeProjectId: POOL_PROJECT,
    runtimeUserId: GONE, role: 'owner', status: 'active', email: '', removedAt: null,
  })
}

const rowsOf = (run: ControlRun, communityId: string) =>
  [...run.db.table(COMMUNITY_MEMBERS_TABLE).values()].filter(row => row.communityId === communityId)

const reassignBody = (extra: Record<string, unknown> = {}) => ({
  runtimeProjectId: POOL_PROJECT,
  communityId: ORPHAN_COMMUNITY,
  orphanedOwnerIds: [GONE],
  newRuntimeUserId: runtimeUserIdOf('stranger'),
  newEmail: 'Neu@Example.test',
  ...extra,
})

// ── Die Regel, pur ──────────────────────────────────────────────────────────

describe('decideOwnerReassign', () => {
  const owner = (id: string, status: 'active' | 'removed' = 'active') => ({ id: `m-${id}`, runtimeUserId: id, role: 'owner' as const, status })
  const base = { communityStatus: 'active' as const, newRuntimeUserId: 'neu' }

  it('genau die genannten Owner: erlaubt', () => {
    expect(decideOwnerReassign({ ...base, members: [owner('a'), owner('b')], orphanedOwnerIds: ['b', 'a'] })).toEqual({ ok: true })
  })

  it('ein weiterer lebender Owner: owner_changed', () => {
    expect(decideOwnerReassign({ ...base, members: [owner('a'), owner('b')], orphanedOwnerIds: ['a'] }))
      .toEqual({ ok: false, reason: 'owner_changed' })
  })

  it('kein aktiver Owner: owner_changed (nichts zu vergeben)', () => {
    expect(decideOwnerReassign({ ...base, members: [owner('a', 'removed')], orphanedOwnerIds: ['a'] }))
      .toEqual({ ok: false, reason: 'owner_changed' })
  })

  it('das neue Konto ist einer der Verwaisten: abgelehnt', () => {
    expect(decideOwnerReassign({ ...base, newRuntimeUserId: 'a', members: [owner('a')], orphanedOwnerIds: ['a'] }))
      .toEqual({ ok: false, reason: 'new_owner_is_orphan' })
  })

  it('stillgelegt: community_disabled vor allem anderen', () => {
    expect(decideOwnerReassign({ ...base, communityStatus: 'disabled', members: [owner('a')], orphanedOwnerIds: ['a'] }))
      .toEqual({ ok: false, reason: 'community_disabled' })
  })
})

// ── Das Gate: Service-Secret und Projekt (F33) ──────────────────────────────

for (const [name, load, body, passStatus] of [
  ['POST /api/control/community/members/owner-status', ownerStatus, { runtimeProjectId: POOL_PROJECT, communityId: COMMUNITY_ID }, 200],
  // Mit dem richtigen Geheimnis lehnt die Route selbst ab: in der Probe-Welt
  // lebt der Owner von c-a (die Menge stimmt nicht) ⇒ 409.
  ['POST /api/control/community/members/owner-reassign', ownerReassign, reassignBody({ communityId: COMMUNITY_ID }), 409],
] as const) {
  describeSeamSecret(name, load, { body }, { passStatus })

  describe(`${name} — das Projekt muss das der Naht sein (F33)`, () => {
    it('fremdes Projekt im Körper: 403, Datenbank zu', async () => {
      const run = await probeControlRoute(load, { secret: 'right', body: { ...body, runtimeProjectId: FOREIGN_PROJECT } })
      expect(run.status).toBe(403)
      expect(run.doorOpened).toBe(false)
    })
  })
}

// ── Lesen ───────────────────────────────────────────────────────────────────

describe('POST /api/control/community/members/owner-status', () => {
  it('nennt die aktiven Owner ohne Adresse', async () => {
    const run = await probeControlRoute(ownerStatus, {
      secret: 'right', seed: seedOrphan(), body: { runtimeProjectId: POOL_PROJECT, communityId: ORPHAN_COMMUNITY },
    })
    expect(run.status, run.error?.statusText).toBe(200)
    expect(run.result).toEqual({
      communityName: 'Verwaist',
      communityStatus: 'active',
      owners: [{ memberId: ORPHAN_ROW, runtimeUserId: GONE, hasEmail: false }],
    })
    expect(run.writes).toEqual([])
  })

  it('lebender Owner: hasEmail true, nur Owner (kein Admin, kein Entfernter)', async () => {
    const run = await probeControlRoute(ownerStatus, { secret: 'right', body: { runtimeProjectId: POOL_PROJECT, communityId: COMMUNITY_ID } })
    expect((run.result as { owners: unknown[] }).owners).toEqual([{ memberId: `m-owner-${COMMUNITY_ID}`, runtimeUserId: runtimeUserIdOf('owner'), hasEmail: true }])
  })

  it('unbekannte Community: 404', async () => {
    const run = await probeControlRoute(ownerStatus, { secret: 'right', body: { runtimeProjectId: POOL_PROJECT, communityId: 'c-gibtsnicht' } })
    expect(run.status).toBe(404)
  })

  it('Community eines anderen Projekts: 404', async () => {
    const run = await probeControlRoute(ownerStatus, {
      secret: 'right',
      body: { runtimeProjectId: POOL_PROJECT, communityId: 'c-silo' },
      seed: db => db.seed(COMMUNITIES_TABLE, { $id: 'c-silo', projectId: FOREIGN_PROJECT, name: 'Silo', host: 'silo.example.test', status: 'active' }),
    })
    expect(run.status).toBe(404)
  })

  it('Lesefehler der Community ist KEIN 404', async () => {
    const run = await probeControlRoute(ownerStatus, {
      secret: 'right',
      body: { runtimeProjectId: POOL_PROJECT, communityId: COMMUNITY_ID },
      seed: db => db.failingReads.set(COMMUNITIES_TABLE, () => Object.assign(new Error('down'), { code: 500 })),
    })
    expect(run.status).toBe(500)
  })
})

// ── Vergeben ────────────────────────────────────────────────────────────────

describe('POST /api/control/community/members/owner-reassign', () => {
  const reassign = (body: Record<string, unknown>, seed: Seed = seedOrphan()) =>
    probeControlRoute(ownerReassign, { secret: 'right', seed, body })

  it('neues Konto ohne Zeile: wird Owner, die verwaiste Zeile ist weg', async () => {
    const run = await reassign(reassignBody())
    expect(run.status, run.error?.statusText).toBe(200)
    expect(run.result).toMatchObject({ ok: true, communityName: 'Verwaist', removedOrphans: 1 })
    const rows = rowsOf(run, ORPHAN_COMMUNITY)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      runtimeProjectId: POOL_PROJECT, runtimeUserId: runtimeUserIdOf('stranger'), role: 'owner', status: 'active', email: 'neu@example.test',
    })
  })

  it('neues Konto mit vorhandener (entfernter) Zeile: dieselbe Zeile wird Owner', async () => {
    const run = await reassign(reassignBody(), (db) => {
      seedOrphan()(db)
      db.seed(COMMUNITY_MEMBERS_TABLE, {
        $id: 'm-alt', communityId: ORPHAN_COMMUNITY, runtimeProjectId: POOL_PROJECT,
        runtimeUserId: runtimeUserIdOf('stranger'), role: 'viewer', status: 'removed', email: 'alt@example.test', removedAt: '2026-11-01T00:00:00.000Z',
      })
    })
    expect(run.status, run.error?.statusText).toBe(200)
    expect(run.result).toMatchObject({ ownerMemberId: 'm-alt' })
    const rows = rowsOf(run, ORPHAN_COMMUNITY)
    expect(rows.map(row => row.$id)).toEqual(['m-alt'])
    expect(rows[0]).toMatchObject({ role: 'owner', status: 'active', email: 'neu@example.test', removedAt: null })
  })

  it('lebender Owner dazu (Menge stimmt nicht): 409 owner_changed, nichts geschrieben', async () => {
    const run = await reassign(reassignBody(), (db) => {
      seedOrphan()(db)
      db.seed(COMMUNITY_MEMBERS_TABLE, {
        $id: 'm-lebt', communityId: ORPHAN_COMMUNITY, runtimeProjectId: POOL_PROJECT,
        runtimeUserId: runtimeUserIdOf('owner'), role: 'owner', status: 'active', email: 'owner@example.test',
      })
    })
    expect(run.status).toBe(409)
    expect(run.error?.data?.code).toBe('owner_changed')
    expect(run.writes.filter(call => call.table === COMMUNITY_MEMBERS_TABLE)).toEqual([])
  })

  it('genannter Owner ist keiner (mehr): 409 owner_changed', async () => {
    const run = await reassign(reassignBody({ orphanedOwnerIds: ['ru-jemand'] }))
    expect(run.status).toBe(409)
    expect(run.error?.data?.code).toBe('owner_changed')
    expect(rowsOf(run, ORPHAN_COMMUNITY).map(row => row.$id)).toEqual([ORPHAN_ROW])
  })

  it('das neue Konto ist der Verwaiste selbst: 409', async () => {
    const run = await reassign(reassignBody({ newRuntimeUserId: GONE }))
    expect(run.status).toBe(409)
    expect(run.error?.data?.code).toBe('new_owner_is_orphan')
  })

  it('stillgelegte Community: 409 community_disabled, nichts geschrieben', async () => {
    const run = await reassign(reassignBody(), seedOrphan('disabled'))
    expect(run.status).toBe(409)
    expect(run.error?.data?.code).toBe('community_disabled')
    expect(run.writes.filter(call => call.table === COMMUNITY_MEMBERS_TABLE)).toEqual([])
  })

  it('Löschen scheitert nach dem Anlegen: 502, die neue Zeile ist wieder weg, die alte steht', async () => {
    const run = await reassign(reassignBody(), (db) => {
      seedOrphan()(db)
      db.failingDeletes.add(ORPHAN_ROW)
    })
    expect(run.status).toBe(502)
    expect(run.error?.data?.code).toBe('owner_reassign_incomplete')
    expect(rowsOf(run, ORPHAN_COMMUNITY)).toEqual([expect.objectContaining({ $id: ORPHAN_ROW, role: 'owner', status: 'active' })])
  })

  it('Löschen scheitert nach dem Umstellen: 502, die vorhandene Zeile hat ihren alten Stand', async () => {
    const run = await reassign(reassignBody(), (db) => {
      seedOrphan()(db)
      db.seed(COMMUNITY_MEMBERS_TABLE, {
        $id: 'm-alt', communityId: ORPHAN_COMMUNITY, runtimeProjectId: POOL_PROJECT,
        runtimeUserId: runtimeUserIdOf('stranger'), role: 'viewer', status: 'removed', email: 'alt@example.test', removedAt: '2026-11-01T00:00:00.000Z',
      })
      db.failingDeletes.add(ORPHAN_ROW)
    })
    expect(run.status).toBe(502)
    const restored = rowsOf(run, ORPHAN_COMMUNITY).find(row => row.$id === 'm-alt')
    expect(restored).toMatchObject({ role: 'viewer', status: 'removed', email: 'alt@example.test', removedAt: '2026-11-01T00:00:00.000Z' })
  })
})
