import { beforeEach, describe, expect, it } from 'vitest'
import type { TablesDB } from 'node-appwrite'
import { createCustomDomainNoticeReader } from '../server/utils/customDomainNoticeReader'
import { createRaceTablesDB } from './support/raceTablesDB'

/**
 * BE-014 — der LESER des Hinweis-Laufs liefert NUR Communities dieses
 * Pool-Projekts mit AKTIVER Domain UND Frist-Stempel, samt der Runtime-Ids
 * ihrer aktiven Owner. Abgeschaltet, leer, ungestempelt, stillgelegt oder
 * fremd ⇒ nicht dabei (dorthin ginge sonst ein Hinweis, der nicht stimmt).
 */

const race = createRaceTablesDB()
const read = createCustomDomainNoticeReader({
  endpoint: 'http://unused', projectId: 'admin', apiKey: 'unused', databaseId: 'main',
  tablesDB: race.tablesDB as unknown as TablesDB,
})

const GRACE = '2026-11-30T12:00:00.000Z'

function community(id: string, overrides: Record<string, unknown> = {}) {
  race.seed('communities', {
    $id: id, name: `Name ${id}`, host: `${id}.pukalani.app`, mode: 'pool', projectId: 'account', tenantId: `t-${id}`,
    status: 'active', customDomain: `${id}.de`, customDomainStatus: 'active', customDomainGraceEndsAt: GRACE,
    ...overrides,
  })
}

function member(communityId: string, userId: string, extra: Record<string, unknown> = {}) {
  race.seed('community_members', {
    $id: `m-${communityId}-${userId}`, communityId, runtimeProjectId: 'account', runtimeUserId: userId,
    role: 'owner', status: 'active', ...extra,
  })
}

beforeEach(() => {
  race.reset()
  community('c-grace')
  member('c-grace', 'u1')
  member('c-grace', 'u2')
  member('c-grace', 'u3', { status: 'removed' })
  member('c-grace', 'u4', { role: 'admin' })
  community('c-paused', { customDomainStatus: 'paused', customDomainGraceEndsAt: null })
  community('c-paused-stamp', { customDomainStatus: 'paused' })
  community('c-none', { customDomain: '', customDomainStatus: 'none' })
  community('c-nostamp', { customDomainGraceEndsAt: null })
  community('c-badstamp', { customDomainGraceEndsAt: 'bald' })
  community('c-disabled', { status: 'disabled' })
  community('c-other', { projectId: 'anderes-projekt' })
  community('c-silo', { mode: 'silo' })
})

describe('createCustomDomainNoticeReader', () => {
  it('liefert nur die aktive, gestempelte Domain dieses Projekts mit ihren aktiven Ownern', async () => {
    expect(await read('account')).toEqual([{
      communityId: 'c-grace',
      tenantId: 't-c-grace',
      host: 'c-grace.pukalani.app',
      name: 'Name c-grace',
      domain: 'c-grace.de',
      graceEndsAt: GRACE,
      ownerUserIds: ['u1', 'u2'],
    }])
  })

  it('ohne Runtime-Projekt liefert er nichts', async () => {
    expect(await read('')).toEqual([])
  })
})
