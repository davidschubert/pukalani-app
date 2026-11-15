import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { listAllRows } from '../../core/server/utils/listAllRows'

/**
 * DSGVO FÜR BETREIBER-KONTEN DER KONSOLE (SEC-026, 2026-11-15): vorher
 * registrierte der control-Layer keinen Contributor — die userId eines
 * gelöschten Betreiber-Kontos blieb an Aufträgen, bearbeiteten Meldungen und
 * Stummschaltungen stehen, und die Auskunft nannte sie nicht.
 */

interface FakeRow { $id: string, $createdAt: string, [key: string]: unknown }
interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

let tables: Record<string, FakeRow[]>
let brokenTable: string | null
let writes: string[]

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    if (brokenTable === tableId) throw new Error('Appwrite down')
    const parsed = queries.map(query => JSON.parse(query) as ParsedQuery)
    const limit = Number(parsed.find(query => query.method === 'limit')?.values?.[0] ?? 25)
    const all = (tables[tableId] ?? []).filter(row =>
      parsed.every(filter => filter.method !== 'equal' || (filter.values ?? []).includes(row[filter.attribute!])))
    return { rows: all.slice(0, limit), total: all.length }
  }),
  updateRow: vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    writes.push(`${tableId}/${rowId}`)
    const row = (tables[tableId] ?? []).find(entry => entry.$id === rowId)!
    Object.assign(row, data)
    return row
  }),
}

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('listAllRows', listAllRows)

const { controlOperatorDeleteUserData, controlOperatorExportUserData } = await import('../server/utils/controlOperatorUserData')

const event = {} as H3Event
const T = '2026-11-01T00:00:00.000Z'

beforeEach(() => {
  brokenTable = null
  writes = []
  tables = {
    provisioning_jobs: [
      { $id: 'j1', $createdAt: T, type: 'site.create', status: 'done', requestedBy: 'op1', payload: '{"name":"x"}', log: 'LOG' },
      { $id: 'j2', $createdAt: T, type: 'site.create', status: 'done', requestedBy: 'op2', payload: '', log: '' },
    ],
    abuse_reports: [
      { $id: 'a1', $createdAt: T, status: 'dismissed', handledBy: 'op1', handledAt: T, reporterEmail: 'melder@example.com', message: 'm' },
    ],
    customer_feedback_mutes: [
      { $id: 'c1', $createdAt: T, communityId: 'c1', communityName: 'Club', mutedBy: 'op1' },
    ],
    communities: [{ $id: 'c1', $createdAt: T, name: 'Club', stripeCustomerId: 'cus_1' }],
  }
})

describe('controlOperatorDeleteUserData', () => {
  it('leert requestedBy, handledBy und mutedBy der Person; die Zeilen bleiben', async () => {
    expect(await controlOperatorDeleteUserData(event, 'op1')).toEqual({ deleted: 0, anonymized: 3 })
    expect(tables.provisioning_jobs!.map(row => row.requestedBy)).toEqual(['', 'op2'])
    expect(tables.abuse_reports![0]!.handledBy).toBe('')
    expect(tables.customer_feedback_mutes![0]!.mutedBy).toBe('')
    expect(tables.provisioning_jobs).toHaveLength(2)
  })

  it('communities wird nicht angefasst (Aufbewahrungspflicht)', async () => {
    await controlOperatorDeleteUserData(event, 'op1')
    expect(writes.some(entry => entry.startsWith('communities/'))).toBe(false)
  })

  it('zweiter Lauf ändert nichts', async () => {
    await controlOperatorDeleteUserData(event, 'op1')
    writes = []
    expect(await controlOperatorDeleteUserData(event, 'op1')).toEqual({ deleted: 0, anonymized: 0 })
    expect(writes).toEqual([])
  })

  it.each(['provisioning_jobs', 'abuse_reports', 'customer_feedback_mutes'])(
    'ein Lesefehler in %s lässt die Löschung scheitern', async (tableId) => {
      brokenTable = tableId
      await expect(controlOperatorDeleteUserData(event, 'op1')).rejects.toThrow('Appwrite down')
    })
})

describe('controlOperatorExportUserData', () => {
  it('nennt die Handlungen der Person, ohne Melder-Daten und ohne Auftrags-Log', async () => {
    const result = await controlOperatorExportUserData(event, 'op1')
    expect(result).toEqual({
      provisioningJobs: [{ id: 'j1', type: 'site.create', status: 'done', createdAt: T }],
      handledAbuseReports: [{ id: 'a1', status: 'dismissed', createdAt: T, handledAt: T }],
      feedbackMutes: [{ id: 'c1', communityId: 'c1', createdAt: T }],
    })
    expect(JSON.stringify(result)).not.toContain('melder@example.com')
  })
})
