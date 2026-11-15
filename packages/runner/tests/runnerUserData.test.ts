import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { listAllRows } from '../../core/server/utils/listAllRows'

/**
 * DSGVO FÜR DEN RUNNER (SEC-026, 2026-11-15): vorher kein Contributor — die
 * userId am Lauf (`runs.createdBy`) blieb nach der Kontolöschung stehen, und
 * die Auskunft verschwieg die Aufträge, die die Person eingegeben hat.
 */

interface FakeRow { $id: string, $createdAt: string, [key: string]: unknown }
interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

let runs: FakeRow[]
let broken: boolean
let writes: number

const tablesDB = {
  listRows: vi.fn(async ({ queries }: { tableId: string, queries: string[] }) => {
    if (broken) throw new Error('Appwrite down')
    const parsed = queries.map(query => JSON.parse(query) as ParsedQuery)
    const all = runs.filter(row =>
      parsed.every(filter => filter.method !== 'equal' || (filter.values ?? []).includes(row[filter.attribute!])))
    return { rows: all, total: all.length }
  }),
  updateRow: vi.fn(async ({ rowId, data }: { rowId: string, data: Record<string, unknown> }) => {
    writes++
    const row = runs.find(entry => entry.$id === rowId)!
    Object.assign(row, data)
    return row
  }),
}

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('listAllRows', listAllRows)

const { runnerDeleteUserData, runnerExportUserData } = await import('../server/utils/runnerUserData')

const event = {} as H3Event
const T = '2026-11-01T00:00:00.000Z'

beforeEach(() => {
  broken = false
  writes = 0
  runs = [
    { $id: 'r1', $createdAt: T, createdBy: 'op1', status: 'succeeded', subjectType: 'ticket', subjectId: 't1', repoKey: 'pukalani', model: 'opus', finishedAt: T, promptSource: 'Bitte X bauen', resultJson: '{"transcriptFileId":"f"}' },
    { $id: 'r2', $createdAt: T, createdBy: 'op2', status: 'queued', subjectType: 'ticket', subjectId: 't2', repoKey: 'pukalani', model: 'opus', finishedAt: null, promptSource: 'Fremd', resultJson: '' },
  ]
})

describe('runnerDeleteUserData', () => {
  it('leert createdBy der Person; Läufe bleiben, fremde unberührt', async () => {
    expect(await runnerDeleteUserData(event, 'op1')).toEqual({ deleted: 0, anonymized: 1 })
    expect(runs.map(row => row.createdBy)).toEqual(['', 'op2'])
    expect(runs).toHaveLength(2)
  })

  it('zweiter Lauf ändert nichts', async () => {
    await runnerDeleteUserData(event, 'op1')
    writes = 0
    expect(await runnerDeleteUserData(event, 'op1')).toEqual({ deleted: 0, anonymized: 0 })
    expect(writes).toBe(0)
  })

  it('ein Lesefehler lässt die Löschung scheitern', async () => {
    broken = true
    await expect(runnerDeleteUserData(event, 'op1')).rejects.toThrow('Appwrite down')
  })
})

describe('runnerExportUserData', () => {
  it('nennt die eigenen Läufe samt Auftragstext, ohne Bericht/Protokoll', async () => {
    const result = await runnerExportUserData(event, 'op1')
    expect(result.runs).toEqual([{
      id: 'r1', createdAt: T, status: 'succeeded', subjectType: 'ticket', subjectId: 't1',
      repoKey: 'pukalani', model: 'opus', finishedAt: T, promptSource: 'Bitte X bauen',
    }])
    expect(JSON.stringify(result)).not.toContain('transcriptFileId')
  })
})
