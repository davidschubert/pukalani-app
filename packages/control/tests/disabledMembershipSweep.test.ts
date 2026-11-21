import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TablesDB } from 'node-appwrite'
import { resolveDisabledMembershipSweepMode } from '../shared/disabledMembershipSweep'
import { createRaceTablesDB } from './support/raceTablesDB'

/**
 * SI1 b — DER ZWEITE SICHERUNGS-LAUF gegen die Renn-Ablage.
 *
 * Bewiesen wird: `dry-run` schreibt GAR NICHTS und zählt nur `active`-Zeilen
 * stillgelegter Communities; `apply` stellt genau diese auf `removed`, liest
 * vor dem Schreiben frisch (wieder geöffnete Community und schon umgestellte
 * Zeile bleiben unberührt), ein Fehlschlag hält die anderen nicht auf; der
 * Schalter ist fail-closed.
 */

const race = createRaceTablesDB()
const { table, seed, failingUpdates } = race
const writes: string[] = []
const tablesDB = {
  ...race.tablesDB,
  async updateRow(args: Parameters<typeof race.tablesDB.updateRow>[0]) {
    writes.push(`${args.tableId}:${args.rowId}`)
    return await race.tablesDB.updateRow(args)
  },
  async createRow(args: Parameters<typeof race.tablesDB.createRow>[0]) {
    writes.push(`create:${args.tableId}`)
    return await race.tablesDB.createRow(args)
  },
  async deleteRow(args: Parameters<typeof race.tablesDB.deleteRow>[0]) {
    writes.push(`delete:${args.tableId}`)
    return await race.tablesDB.deleteRow(args)
  },
}
const logs: { level: string, name: string, detail: Record<string, unknown> }[] = []
vi.stubGlobal('logEvent', (level: string, name: string, detail: Record<string, unknown> = {}) => { logs.push({ level, name, detail }) })

const { runDisabledMembershipSweep } = await import('../server/utils/disabledMembershipSweep')
const NOW = new Date('2026-11-22T10:00:00.000Z')
const deps = () => ({ tablesDB: tablesDB as unknown as TablesDB, databaseId: 'main', now: () => NOW })

function community(id: string, status: string) {
  seed('communities', { $id: id, status, projectId: 'account' })
}
function member(id: string, communityId: string, status: string, role = 'viewer') {
  seed('community_members', { $id: id, communityId, status, role, runtimeProjectId: 'account', runtimeUserId: `u-${id}`, removedAt: null })
}

beforeEach(() => {
  race.reset()
  writes.length = 0
  logs.length = 0
  community('c-off', 'disabled')
  community('c-off2', 'disabled')
  community('c-live', 'active')
  member('m1', 'c-off', 'active', 'owner')
  member('m2', 'c-off', 'active')
  member('m3', 'c-off', 'removed')
  member('m4', 'c-off2', 'active')
  member('m5', 'c-live', 'active')
})

describe('Schalter', () => {
  it('nimmt nur die drei bekannten Werte, alles andere ist off', () => {
    expect(resolveDisabledMembershipSweepMode('dry-run')).toBe('dry-run')
    expect(resolveDisabledMembershipSweepMode('apply')).toBe('apply')
    for (const value of ['', 'Apply', 'count', undefined, null, 1, true]) {
      expect(resolveDisabledMembershipSweepMode(value)).toBe('off')
    }
  })
})

describe('dry-run', () => {
  it('zählt nur active-Zeilen stillgelegter Communities und schreibt nichts', async () => {
    const report = await runDisabledMembershipSweep({ mode: 'dry-run' }, deps())
    expect(report).toMatchObject({ disabledCommunities: 2, affectedCommunities: 2, activeRows: 3, removed: 0, failed: 0, truncated: false })
    expect(writes).toEqual([])
    expect(table('community_members').get('m1')!.status).toBe('active')
    expect(logs).toEqual([expect.objectContaining({ level: 'warn', name: 'community_members.disabled_sweep_dry_run' })])
  })

  it('meldet ruhig (info), wenn nichts zu tun ist', async () => {
    race.reset()
    community('c-live', 'active')
    member('m5', 'c-live', 'active')
    const report = await runDisabledMembershipSweep({ mode: 'dry-run' }, deps())
    expect(report.activeRows).toBe(0)
    expect(logs[0]!.level).toBe('info')
  })
})

describe('apply', () => {
  it('stellt genau die Zeilen stillgelegter Communities auf removed', async () => {
    const report = await runDisabledMembershipSweep({ mode: 'apply' }, deps())
    expect(report).toMatchObject({ activeRows: 3, removed: 3, skipped: 0, failed: 0 })
    for (const id of ['m1', 'm2', 'm4']) {
      expect(table('community_members').get(id)).toMatchObject({ status: 'removed', removedAt: NOW.toISOString() })
    }
    expect(table('community_members').get('m1')!.role).toBe('owner')
    expect(table('community_members').get('m5')!.status).toBe('active')
    expect(writes.sort()).toEqual(['community_members:m1', 'community_members:m2', 'community_members:m4'])
  })

  it('liest frisch: wieder geöffnete Community und schon umgestellte Zeile bleiben', async () => {
    const original = race.tablesDB.listRows
    let flipped = false
    const live = {
      ...tablesDB,
      async listRows(args: Parameters<typeof original>[0]) {
        const result = await original(args)
        if (args.tableId === 'community_members' && !flipped) {
          flipped = true
          table('communities').get('c-off2')!.status = 'active'
          table('community_members').get('m2')!.status = 'removed'
        }
        return result
      },
    }
    const report = await runDisabledMembershipSweep({ mode: 'apply' }, { ...deps(), tablesDB: live as unknown as TablesDB })
    expect(report).toMatchObject({ activeRows: 3, removed: 1, skipped: 2 })
    expect(table('community_members').get('m4')!.status).toBe('active')
    expect(writes).toEqual(['community_members:m1'])
  })

  it('ein Fehlschlag hält die anderen nicht auf und wird gezählt', async () => {
    failingUpdates.set('m2', () => true)
    const report = await runDisabledMembershipSweep({ mode: 'apply' }, deps())
    expect(report).toMatchObject({ removed: 2, failed: 1 })
    expect(table('community_members').get('m4')!.status).toBe('removed')
  })
})
