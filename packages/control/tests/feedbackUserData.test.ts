import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { listAllRows } from '../../core/server/utils/listAllRows'
import {
  CUSTOMER_FEEDBACK_COMMENTS_TABLE,
  CUSTOMER_FEEDBACK_TABLE,
  CUSTOMER_FEEDBACK_VOTES_TABLE,
  voterKeyFor,
} from '../shared/customerFeedback'

/**
 * DSGVO-AUSKUNFT UND -LÖSCHUNG DES FEEDBACKS, durchgespielt (SEC-026,
 * 2026-11-15) — gefälschte Ablage, echte Funktionen.
 *
 * Drei Aussagen, die vorher alle falsch waren:
 *  1. Ein LESEFEHLER lässt die Löschung scheitern. Vorher wurde daraus
 *     `{ deleted: 0, anonymized: 0 }`, der Orchestrator sah einen Erfolg und
 *     löschte das Konto, während Name, Adresse und Stimmen stehen blieben.
 *  2. Mehr als 500 Zeilen werden ALLE bearbeitet (vorher eine Seite von 500).
 *  3. Die Auskunft enthält die STIMMEN der Person und Name/Adresse ihrer
 *     eigenen Einträge.
 */

interface FakeRow { $id: string, $createdAt: string, [key: string]: unknown }
interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

let tables: Record<string, FakeRow[]>
let brokenTable: string | null
let calls: { op: string, tableId: string, rowId?: string }[]

function matches(row: FakeRow, filters: ParsedQuery[]): boolean {
  return filters.every(filter => filter.method !== 'equal' || (filter.values ?? []).includes(row[filter.attribute!]))
}

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    if (brokenTable === tableId) throw new Error('Appwrite down')
    const parsed = queries.map(query => JSON.parse(query) as ParsedQuery)
    const limit = Number(parsed.find(query => query.method === 'limit')?.values?.[0] ?? 25)
    const cursor = parsed.find(query => query.method === 'cursorAfter')?.values?.[0]
    const all = (tables[tableId] ?? []).filter(row => matches(row, parsed))
    const start = cursor ? all.findIndex(row => row.$id === cursor) + 1 : 0
    return { rows: all.slice(start, start + limit), total: all.length }
  }),
  updateRow: vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    calls.push({ op: 'update', tableId, rowId })
    const row = (tables[tableId] ?? []).find(entry => entry.$id === rowId)
    if (!row) throw new Error('Row not found')
    Object.assign(row, data)
    return row
  }),
  deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    calls.push({ op: 'delete', tableId, rowId })
    tables[tableId] = (tables[tableId] ?? []).filter(entry => entry.$id !== rowId)
    return {}
  }),
}

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('listAllRows', listAllRows)
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('createError', (init: Record<string, unknown>) => Object.assign(new Error(String(init.statusText)), init))

const { eraseFeedbackUserData, exportFeedbackUserData } = await import('../server/utils/customerFeedback')

const event = {} as H3Event
const PROJECT = 'account'
const USER = 'u1'

function entry(id: string, overrides: Record<string, unknown> = {}): FakeRow {
  return {
    $id: id, $createdAt: '2026-11-01T00:00:00.000Z', runtimeProjectId: PROJECT, authorUserId: USER,
    authorName: 'Ada', authorEmail: 'ada@example.com', area: 'general', productKey: '', title: 't',
    message: 'm', state: 'open', page: '/', voteCount: 1, ...overrides,
  }
}

beforeEach(() => {
  brokenTable = null
  calls = []
  tables = {
    [CUSTOMER_FEEDBACK_TABLE]: [entry('f1'), entry('f2', { authorUserId: 'other', authorName: 'Bob' })],
    [CUSTOMER_FEEDBACK_COMMENTS_TABLE]: [
      { $id: 'c1', $createdAt: '2026-11-02T00:00:00.000Z', runtimeProjectId: PROJECT, authorUserId: USER, authorName: 'Ada', feedbackId: 'f2', body: 'hi' },
    ],
    [CUSTOMER_FEEDBACK_VOTES_TABLE]: [
      { $id: 'v1', $createdAt: '2026-11-03T00:00:00.000Z', feedbackId: 'f2', voterKey: voterKeyFor(PROJECT, USER), communityId: 'c' },
      { $id: 'v2', $createdAt: '2026-11-03T00:00:00.000Z', feedbackId: 'f2', voterKey: voterKeyFor(PROJECT, 'other'), communityId: 'c' },
    ],
  }
})

describe('eraseFeedbackUserData', () => {
  it.each([CUSTOMER_FEEDBACK_TABLE, CUSTOMER_FEEDBACK_COMMENTS_TABLE, CUSTOMER_FEEDBACK_VOTES_TABLE])(
    'ein Lesefehler in %s lässt die Löschung scheitern (kein Schein-Erfolg)', async (tableId) => {
      brokenTable = tableId
      await expect(eraseFeedbackUserData(event, PROJECT, USER)).rejects.toThrow()
    })

  it('ein Schreibfehler lässt die Löschung scheitern', async () => {
    tablesDB.updateRow.mockRejectedValueOnce(new Error('write failed'))
    await expect(eraseFeedbackUserData(event, PROJECT, USER)).rejects.toThrow('write failed')
  })

  it('bearbeitet mehr als 500 Zeilen vollständig', async () => {
    tables[CUSTOMER_FEEDBACK_TABLE] = Array.from({ length: 620 }, (_, i) => entry(`f${String(i).padStart(4, '0')}`))
    tables[CUSTOMER_FEEDBACK_VOTES_TABLE] = Array.from({ length: 530 }, (_, i) => ({
      $id: `v${String(i).padStart(4, '0')}`, $createdAt: '', feedbackId: 'f0000', voterKey: voterKeyFor(PROJECT, USER), communityId: 'c',
    }))
    const result = await eraseFeedbackUserData(event, PROJECT, USER)
    expect(result.anonymized).toBe(620 + 1)
    expect(result.deleted).toBe(530)
    expect(tables[CUSTOMER_FEEDBACK_TABLE]!.every(row => row.authorUserId === '' && row.authorEmail === '')).toBe(true)
    expect(tables[CUSTOMER_FEEDBACK_VOTES_TABLE]).toHaveLength(0)
  })

  it('fasst nur die Zeilen der Person an und zieht den Zähler nach', async () => {
    const result = await eraseFeedbackUserData(event, PROJECT, USER)
    expect(result).toEqual({ deleted: 1, anonymized: 2 })
    expect(tables[CUSTOMER_FEEDBACK_TABLE]!.find(row => row.$id === 'f2')!.authorName).toBe('Bob')
    expect(tables[CUSTOMER_FEEDBACK_VOTES_TABLE]!.map(row => row.$id)).toEqual(['v2'])
    expect(tables[CUSTOMER_FEEDBACK_TABLE]!.find(row => row.$id === 'f2')!.voteCount).toBe(1)
  })
})

describe('exportFeedbackUserData', () => {
  it('enthält die Stimmen der Person und Name/Adresse ihrer Einträge', async () => {
    const result = await exportFeedbackUserData(event, PROJECT, USER)
    expect(result.customerFeedbackVotes).toEqual([{ feedbackId: 'f2', createdAt: '2026-11-03T00:00:00.000Z' }])
    expect(result.customerFeedback).toEqual([expect.objectContaining({ authorName: 'Ada', authorEmail: 'ada@example.com' })])
    expect(result.customerFeedbackComments).toHaveLength(1)
  })

  it('ein Lesefehler wirft, statt eine leere Liste zu liefern', async () => {
    brokenTable = CUSTOMER_FEEDBACK_VOTES_TABLE
    await expect(exportFeedbackUserData(event, PROJECT, USER)).rejects.toThrow()
  })

  it('liest mehr als 500 Einträge vollständig', async () => {
    tables[CUSTOMER_FEEDBACK_TABLE] = Array.from({ length: 777 }, (_, i) => entry(`f${String(i).padStart(4, '0')}`))
    const result = await exportFeedbackUserData(event, PROJECT, USER)
    expect(result.customerFeedback).toHaveLength(777)
  })
})
