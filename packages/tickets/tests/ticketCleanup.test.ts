import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { listAllRows } from '../../core/server/utils/listAllRows'
import {
  TICKETS_TABLE,
  TICKET_FILES_BUCKET,
  TICKET_FILES_TABLE,
  TICKET_LISTS_TABLE,
  TICKET_WATCHERS_TABLE,
} from '../shared/types/ticket'

/**
 * AUFRÄUMEN VOR DEM LÖSCHEN, durchgespielt (BE-024, 2026-11-15) — gefälschte
 * Ablage, echte Funktionen und Routen.
 *
 * Vorher las die Ticket-Löschung EINE Seite (200 Beobachtungen, 100 Anhänge),
 * schluckte jeden Fehler und löschte danach trotzdem das Ticket; die
 * Listen-Löschung räumte gar nichts auf. Zurück blieben Dateien im Bucket,
 * die keine Oberfläche mehr erreicht. Und die Auskunft machte aus einem
 * Lesefehler eine leere Liste.
 */

interface FakeRow { $id: string, $createdAt: string, [key: string]: unknown }
interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }
class FakeAppwriteError extends Error {
  constructor(message: string, public code: number) { super(message) }
}

let tables: Record<string, FakeRow[]>
let bucket: Set<string>
let brokenRead: string | null
/** fileIds, deren Löschen mit diesem Code scheitert (404 = schon weg). */
let storageFailures: Map<string, number>
let logs: { level: string, event: string, data: Record<string, unknown> }[]
let deletedRows: { tableId: string, rowId: string }[]

function matches(row: FakeRow, filters: ParsedQuery[]): boolean {
  return filters.every(filter => filter.method !== 'equal' || (filter.values ?? []).includes(row[filter.attribute!]))
}

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    if (brokenRead === tableId) throw new FakeAppwriteError('Appwrite down', 500)
    const parsed = queries.map(query => JSON.parse(query) as ParsedQuery)
    const limit = Number(parsed.find(query => query.method === 'limit')?.values?.[0] ?? 25)
    const cursor = parsed.find(query => query.method === 'cursorAfter')?.values?.[0]
    const all = (tables[tableId] ?? []).filter(row => matches(row, parsed))
    const start = cursor ? all.findIndex(row => row.$id === cursor) + 1 : 0
    return { rows: all.slice(start, start + limit), total: all.length }
  }),
  deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    const before = tables[tableId] ?? []
    if (!before.some(row => row.$id === rowId)) throw new FakeAppwriteError('Row not found', 404)
    tables[tableId] = before.filter(row => row.$id !== rowId)
    deletedRows.push({ tableId, rowId })
    return {}
  }),
}

const storage = {
  deleteFile: vi.fn(async ({ bucketId, fileId }: { bucketId: string, fileId: string }) => {
    expect(bucketId).toBe(TICKET_FILES_BUCKET)
    const failure = storageFailures.get(fileId)
    if (failure) throw new FakeAppwriteError('storage', failure)
    bucket.delete(fileId)
    return {}
  }),
}

let routeParam: string

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('requirePermission', () => {})
vi.stubGlobal('getRouterParam', () => routeParam)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB, storage }))
vi.stubGlobal('listAllRows', listAllRows)
vi.stubGlobal('logEvent', (level: string, event: string, data: Record<string, unknown> = {}) => {
  logs.push({ level, event, data })
})
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('toH3Error', (_error: unknown, statusText: string) => Object.assign(new Error(statusText), { status: 500, statusText }))

const { removeTicketDependents } = await import('../server/utils/ticketCleanup')
const { ticketsExportUserData } = await import('../server/utils/ticketsUserData')
type Handler = (event: H3Event) => Promise<Record<string, unknown>>
const deleteTicket = (await import('../server/api/tickets/[id].delete')).default as unknown as Handler
const deleteList = (await import('../server/api/tickets/lists/[id].delete')).default as unknown as Handler

const event = {} as H3Event
const admin = { tablesDB, storage } as unknown as Parameters<typeof removeTicketDependents>[0]

function pad(i: number): string {
  return String(i).padStart(4, '0')
}

/** Ein Ticket mit `files` Anhängen und `watchers` Beobachtungen anlegen. */
function seedTicket(ticketId: string, files: number, watchers: number, listId = 'l1'): void {
  tables[TICKETS_TABLE]!.push({ $id: ticketId, $createdAt: '', listId })
  for (let i = 0; i < files; i++) {
    const fileId = `${ticketId}-file-${pad(i)}`
    bucket.add(fileId)
    tables[TICKET_FILES_TABLE]!.push({ $id: `${ticketId}-frow-${pad(i)}`, $createdAt: '', ticketId, fileId, uploadedBy: 'u1', name: 'a.png', size: 1 })
  }
  for (let i = 0; i < watchers; i++) {
    tables[TICKET_WATCHERS_TABLE]!.push({ $id: `${ticketId}-w-${pad(i)}`, $createdAt: '', ticketId, userId: `u${i}` })
  }
}

beforeEach(() => {
  tables = { [TICKETS_TABLE]: [], [TICKET_FILES_TABLE]: [], [TICKET_WATCHERS_TABLE]: [], [TICKET_LISTS_TABLE]: [{ $id: 'l1', $createdAt: '' }] }
  bucket = new Set()
  brokenRead = null
  storageFailures = new Map()
  logs = []
  deletedRows = []
})

describe('removeTicketDependents', () => {
  it('räumt 120 Anhänge und 250 Beobachtungen vollständig ab (mehr als eine Seite)', async () => {
    seedTicket('t1', 120, 250)
    seedTicket('t2', 2, 2)
    const result = await removeTicketDependents(admin, 'main', 't1')
    expect(result).toEqual({ files: 120, watchers: 250, failed: 0 })
    expect([...bucket].filter(id => id.startsWith('t1-'))).toEqual([])
    expect(tables[TICKET_FILES_TABLE]!.map(row => row.ticketId)).toEqual(['t2', 't2'])
    expect(tables[TICKET_WATCHERS_TABLE]!.map(row => row.ticketId)).toEqual(['t2', 't2'])
  })

  it.each([TICKET_FILES_TABLE, TICKET_WATCHERS_TABLE])('ein Lesefehler in %s wirft', async (tableId) => {
    seedTicket('t1', 1, 1)
    brokenRead = tableId
    await expect(removeTicketDependents(admin, 'main', 't1')).rejects.toThrow('Appwrite down')
  })

  it('eine scheiternde Datei (500) wird gezählt, ihre Zeile bleibt für den zweiten Versuch', async () => {
    seedTicket('t1', 3, 1)
    storageFailures.set('t1-file-0001', 500)
    const result = await removeTicketDependents(admin, 'main', 't1')
    expect(result).toEqual({ files: 2, watchers: 1, failed: 1 })
    expect(tables[TICKET_FILES_TABLE]!.map(row => row.fileId)).toEqual(['t1-file-0001'])
  })

  it('ein 404 beim Löschen zählt als „schon weg"', async () => {
    seedTicket('t1', 2, 0)
    storageFailures.set('t1-file-0000', 404)
    const result = await removeTicketDependents(admin, 'main', 't1')
    expect(result).toEqual({ files: 2, watchers: 0, failed: 0 })
    expect(tables[TICKET_FILES_TABLE]).toHaveLength(0)
  })
})

describe('DELETE /api/tickets/:id', () => {
  it('räumt auf und löscht dann das Ticket', async () => {
    seedTicket('t1', 120, 250)
    routeParam = 't1'
    expect(await deleteTicket(event)).toEqual({ ok: true, files: 120, watchers: 250 })
    expect(tables[TICKETS_TABLE]).toHaveLength(0)
  })

  it('unvollständig ⇒ 502, das Ticket bleibt, eine Logzeile', async () => {
    seedTicket('t1', 2, 1)
    storageFailures.set('t1-file-0000', 500)
    routeParam = 't1'
    await expect(deleteTicket(event)).rejects.toMatchObject({
      status: 502, statusText: 'Ticket cleanup incomplete', data: { code: 'ticket_cleanup_incomplete' },
    })
    expect(tables[TICKETS_TABLE]!.map(row => row.$id)).toEqual(['t1'])
    expect(deletedRows.some(row => row.tableId === TICKETS_TABLE)).toBe(false)
    expect(logs).toEqual([{ level: 'error', event: 'tickets.cleanup_incomplete', data: { ticketId: 't1', files: 1, watchers: 1, failed: 1 } }])
  })

  it('Lesefehler ⇒ 502, das Ticket bleibt', async () => {
    seedTicket('t1', 1, 1)
    brokenRead = TICKET_WATCHERS_TABLE
    routeParam = 't1'
    await expect(deleteTicket(event)).rejects.toMatchObject({ status: 502 })
    expect(tables[TICKETS_TABLE]!.map(row => row.$id)).toEqual(['t1'])
  })
})

describe('DELETE /api/tickets/lists/:id', () => {
  it('räumt JEDE Karte auf, bevor sie fällt', async () => {
    seedTicket('t1', 2, 3)
    seedTicket('t2', 1, 1)
    seedTicket('t9', 1, 1, 'other-list')
    routeParam = 'l1'
    expect(await deleteList(event)).toEqual({ ok: true, deletedCards: 2, files: 3, watchers: 4 })
    expect([...bucket]).toEqual(['t9-file-0000'])
    expect(tables[TICKETS_TABLE]!.map(row => row.$id)).toEqual(['t9'])
    expect(tables[TICKET_LISTS_TABLE]).toHaveLength(0)
  })

  it('beim ersten Fehler Schluss: 502, die Liste und die übrigen Karten bleiben', async () => {
    seedTicket('t1', 1, 0)
    seedTicket('t2', 1, 0)
    seedTicket('t3', 1, 0)
    storageFailures.set('t2-file-0000', 500)
    routeParam = 'l1'
    await expect(deleteList(event)).rejects.toMatchObject({ status: 502, data: { code: 'ticket_cleanup_incomplete' } })
    // t1 war vollständig aufgeräumt und bleibt gelöscht; t2 und t3 stehen noch.
    expect(tables[TICKETS_TABLE]!.map(row => row.$id)).toEqual(['t2', 't3'])
    expect(tables[TICKET_LISTS_TABLE]).toHaveLength(1)
  })
})

describe('ticketsExportUserData', () => {
  it.each([TICKET_WATCHERS_TABLE, TICKET_FILES_TABLE])('ein Lesefehler in %s lässt den Export scheitern', async (tableId) => {
    brokenRead = tableId
    await expect(ticketsExportUserData(event, 'u1')).rejects.toThrow()
  })
})
