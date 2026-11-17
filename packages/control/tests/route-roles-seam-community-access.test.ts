import { afterEach, describe, expect, it, vi } from 'vitest'
import { hashInviteToken } from '../server/utils/communityTeam'
import { COMMUNITY_INVITES_TABLE } from '../shared/types/communityInvite'
import { COMMUNITY_MEMBERS_TABLE } from '../shared/types/communityMember'
import { COMMUNITIES_TABLE } from '../shared/types/tenantRecord'
import {
  COMMUNITY_ID,
  FOREIGN_PROJECT,
  NEIGHBOUR_COMMUNITY_ID,
  POOL_PROJECT,
  describeSeamSecret,
  jwtOf,
  probeControlRoute,
  resetControlWorld,
  runtimeUserIdOf,
  type ControlRun,
} from './support/controlRouteHarness'

/**
 * NAHT-ROUTEN RUND UM DEN ZUGANG ZU EINER COMMUNITY (OPS-009, BT1 b).
 *
 * Beitreten, die eigenen Communities, eine Einladung ansehen, das öffentliche
 * Team, Auskunft und Löschung (DSGVO). Keine dieser Routen fragt nach einer
 * Team-Rolle — jede trifft eine andere Entscheidung, und genau die steht hier:
 *  - Beitritt und „meine Communities": WER, sagt das JWT (vom Control Plane
 *    selbst gegen das Pool-Projekt geprüft), nie der Körper.
 *  - Einladung ansehen: ohne Konto — der Beweis ist das Token, und es gilt nur
 *    für SEINE Community, nur offen und nur vor Ablauf.
 *  - Team, Auskunft, Löschung: ohne JWT — das Projekt im Körper muss das
 *    Pool-Projekt der Naht sein (F33), sonst 403.
 *
 * Echte Handler, echte Wachen, nachgebaute Ablage (Prüfstand
 * `support/controlRouteHarness.ts`).
 */

vi.mock('node-appwrite', async importOriginal =>
  (await import('./support/runtimeAccounts')).withFakeAccount(await importOriginal<typeof import('node-appwrite')>()))

afterEach(resetControlWorld)

const join = () => import('../server/api/control/community/members/join.post')
const mine = () => import('../server/api/control/community/mine.post')
const preview = () => import('../server/api/control/community/invites/preview.post')
const team = () => import('../server/api/control/community/team.post')
const userData = () => import('../server/api/control/community/members/user-data.post')
const userErase = () => import('../server/api/control/community/members/user-erase.post')

/** Eine Community, die zu einem ANDEREN Projekt gehört. */
const SILO_COMMUNITY = 'c-silo'
const seedSiloCommunity = (run: { seed: (table: string, row: Record<string, unknown> & { $id: string }) => unknown }) => {
  run.seed(COMMUNITIES_TABLE, { $id: SILO_COMMUNITY, projectId: FOREIGN_PROJECT, name: 'Silo', host: 'silo.example.test', status: 'active', openRegistration: true })
}

const memberRowsOf = (run: ControlRun, userId: string) =>
  [...run.db.table(COMMUNITY_MEMBERS_TABLE).values()].filter(row => row.runtimeUserId === userId)

// ── Beitreten ───────────────────────────────────────────────────────────────

describeSeamSecret('POST /api/control/community/members/join', join, {
  body: { jwt: jwtOf('viewer'), communityId: COMMUNITY_ID, trigger: 'registration' },
}, { passStatus: 200 })

describe('POST /api/control/community/members/join — wer beitritt, sagt das JWT', () => {
  const probe = (jwt: string, communityId: string, trigger: string, seed?: Parameters<typeof probeControlRoute>[1]['seed']) =>
    probeControlRoute(join, { secret: 'right', body: { jwt, communityId, trigger }, seed })

  it('JWT aus einem fremden Projekt: 401, Datenbank zu', async () => {
    const run = await probe(jwtOf('foreign'), COMMUNITY_ID, 'registration')
    expect(run.status).toBe(401)
    expect(run.doorOpened).toBe(false)
  })

  it('unbekanntes JWT: 401, Datenbank zu', async () => {
    const run = await probe('jwt-unbekannt', COMMUNITY_ID, 'registration')
    expect(run.status).toBe(401)
    expect(run.doorOpened).toBe(false)
  })

  it('Community eines anderen Projekts: 404, nichts geschrieben', async () => {
    const run = await probe(jwtOf('viewer'), SILO_COMMUNITY, 'registration', db => seedSiloCommunity(db))
    expect(run.status).toBe(404)
    expect(run.writes).toEqual([])
  })

  it('geschlossene Community, fremdes Konto: „closed", nichts geschrieben', async () => {
    const run = await probe(jwtOf('stranger'), COMMUNITY_ID, 'registration')
    expect(run.status).toBe(200)
    expect(run.result).toEqual({ outcome: 'closed', role: null })
    expect(run.writes).toEqual([])
  })

  it('entzogener Zugang schlägt jeden Auslöser: „removed", nichts geschrieben', async () => {
    const run = await probe(jwtOf('removed'), COMMUNITY_ID, 'legacy')
    expect(run.result).toEqual({ outcome: 'removed', role: null })
    expect(run.writes).toEqual([])
  })

  it('schon Mitglied: „member" mit der bestehenden Rolle, nichts geschrieben', async () => {
    const run = await probe(jwtOf('editor'), COMMUNITY_ID, 'contribution')
    expect(run.result).toEqual({ outcome: 'member', role: 'editor' })
    expect(run.writes).toEqual([])
  })

  it('offene Community: Beitritt als viewer, die Zeile trägt Konto und Projekt aus dem JWT', async () => {
    const run = await probe(jwtOf('viewer'), NEIGHBOUR_COMMUNITY_ID, 'registration')
    expect(run.result).toEqual({ outcome: 'joined', role: 'viewer' })
    const rows = memberRowsOf(run, runtimeUserIdOf('viewer')).filter(row => row.communityId === NEIGHBOUR_COMMUNITY_ID)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ runtimeProjectId: POOL_PROJECT, role: 'viewer', status: 'active' })
  })

  it('geschlossene Community, Auslöser „legacy": Beitritt (die Naht glaubt der Runtime das Label — dokumentierte Grenze)', async () => {
    const run = await probe(jwtOf('stranger'), COMMUNITY_ID, 'legacy')
    expect(run.result).toEqual({ outcome: 'joined', role: 'viewer' })
  })
})

// ── Meine Communities ───────────────────────────────────────────────────────

describeSeamSecret('POST /api/control/community/mine', mine, {
  body: { jwt: jwtOf('owner') },
}, { passStatus: 200 })

describe('POST /api/control/community/mine — nur die eigenen, aus dem JWT', () => {
  const ids = (run: ControlRun) =>
    ((run.result as { communities: { communityId: string }[] }).communities).map(entry => entry.communityId)

  it('JWT aus einem fremden Projekt: 401, Datenbank zu', async () => {
    const run = await probeControlRoute(mine, { secret: 'right', body: { jwt: jwtOf('foreign') } })
    expect(run.status).toBe(401)
    expect(run.doorOpened).toBe(false)
  })

  it('Owner der Probe-Community: nur sie', async () => {
    const run = await probeControlRoute(mine, { secret: 'right', body: { jwt: jwtOf('owner') } })
    expect(ids(run)).toEqual([COMMUNITY_ID])
  })

  it('Owner der Nachbar-Community: nur die Nachbar-Community', async () => {
    const run = await probeControlRoute(mine, { secret: 'right', body: { jwt: jwtOf('stranger') } })
    expect(ids(run)).toEqual([NEIGHBOUR_COMMUNITY_ID])
  })

  it('entzogener Zugang: keine', async () => {
    const run = await probeControlRoute(mine, { secret: 'right', body: { jwt: jwtOf('removed') } })
    expect(ids(run)).toEqual([])
  })
})

// ── Einladung ansehen ───────────────────────────────────────────────────────

const TOKEN = 'a'.repeat(64)
const inviteRow = (extra: Record<string, unknown> = {}) => ({
  $id: 'inv-1',
  communityId: COMMUNITY_ID,
  email: 'Gast@Example.test',
  role: 'editor',
  tokenHash: hashInviteToken(TOKEN),
  status: 'pending',
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  invitedBy: runtimeUserIdOf('owner'),
  acceptedBy: '',
  ...extra,
})

describeSeamSecret('POST /api/control/community/invites/preview', preview, {
  body: { token: TOKEN, communityId: COMMUNITY_ID },
  seed: db => db.seed(COMMUNITY_INVITES_TABLE, inviteRow()),
}, { passStatus: 200 })

describe('POST /api/control/community/invites/preview — das Token ist der Beweis', () => {
  const probe = (communityId: string, extra: Record<string, unknown> = {}) => probeControlRoute(preview, {
    secret: 'right',
    body: { token: TOKEN, communityId },
    seed: db => db.seed(COMMUNITY_INVITES_TABLE, inviteRow(extra)),
  })

  it('offene Einladung, richtige Community: Adresse und Rolle', async () => {
    const run = await probe(COMMUNITY_ID)
    expect(run.result).toEqual({ ok: true, email: 'gast@example.test', role: 'editor' })
  })

  it('Token einer anderen Community: 404', async () => {
    expect((await probe(NEIGHBOUR_COMMUNITY_ID)).status).toBe(404)
  })

  it('abgelaufen: 404', async () => {
    expect((await probe(COMMUNITY_ID, { expiresAt: '2026-01-01T00:00:00.000Z' })).status).toBe(404)
  })

  it('zurückgezogen: 404', async () => {
    expect((await probe(COMMUNITY_ID, { status: 'revoked' })).status).toBe(404)
  })

  it('unbekanntes Token: 404', async () => {
    const run = await probeControlRoute(preview, { secret: 'right', body: { token: 'b'.repeat(64), communityId: COMMUNITY_ID } })
    expect(run.status).toBe(404)
  })
})

// ── Öffentliches Team ───────────────────────────────────────────────────────

describeSeamSecret('POST /api/control/community/team', team, {
  body: { communityId: COMMUNITY_ID, runtimeProjectId: POOL_PROJECT },
}, { passStatus: 200 })

describe('POST /api/control/community/team — das Projekt muss das der Naht sein', () => {
  it('fremdes Projekt im Körper: 403, Datenbank zu', async () => {
    const run = await probeControlRoute(team, { secret: 'right', body: { communityId: COMMUNITY_ID, runtimeProjectId: FOREIGN_PROJECT } })
    expect(run.status).toBe(403)
    expect(run.doorOpened).toBe(false)
  })

  it('Community eines anderen Projekts: 404', async () => {
    const run = await probeControlRoute(team, {
      secret: 'right',
      body: { communityId: SILO_COMMUNITY, runtimeProjectId: POOL_PROJECT },
      seed: db => seedSiloCommunity(db),
    })
    expect(run.status).toBe(404)
  })

  it('Pool-Projekt: Owner, Admin, Moderator — kein Editor, kein viewer, kein Entfernter', async () => {
    const run = await probeControlRoute(team, { secret: 'right', body: { communityId: COMMUNITY_ID, runtimeProjectId: POOL_PROJECT } })
    const members = (run.result as { members: { runtimeUserId: string }[] }).members.map(member => member.runtimeUserId)
    expect(members.sort()).toEqual([runtimeUserIdOf('admin'), runtimeUserIdOf('moderator'), runtimeUserIdOf('owner')].sort())
  })
})

// ── Auskunft und Löschung (DSGVO) ───────────────────────────────────────────

for (const [name, load] of [
  ['POST /api/control/community/members/user-data', userData],
  ['POST /api/control/community/members/user-erase', userErase],
] as const) {
  describeSeamSecret(name, load, {
    body: { runtimeProjectId: POOL_PROJECT, runtimeUserId: runtimeUserIdOf('viewer') },
  }, { passStatus: 200 })

  describe(`${name} — das Projekt muss das der Naht sein (F33)`, () => {
    it('fremdes Projekt im Körper: 403, Datenbank zu', async () => {
      const run = await probeControlRoute(load, {
        secret: 'right',
        body: { runtimeProjectId: FOREIGN_PROJECT, runtimeUserId: runtimeUserIdOf('viewer') },
      })
      expect(run.status).toBe(403)
      expect(run.doorOpened).toBe(false)
    })
  })
}

describe('POST /api/control/community/members/user-erase — trifft nur das genannte Konto', () => {
  it('die Zeile des viewers ist weg, die des Owners bleibt', async () => {
    const run = await probeControlRoute(userErase, {
      secret: 'right',
      body: { runtimeProjectId: POOL_PROJECT, runtimeUserId: runtimeUserIdOf('viewer') },
    })
    expect(run.status, run.error?.statusText).toBe(200)
    expect(memberRowsOf(run, runtimeUserIdOf('viewer'))).toEqual([])
    expect(memberRowsOf(run, runtimeUserIdOf('owner'))).toHaveLength(1)
  })
})
