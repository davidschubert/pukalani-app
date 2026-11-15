import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { listAllRows, listAllRowsIfTableExists } from '../../core/server/utils/listAllRows'

/**
 * EIN LESEFEHLER IST EIN FEHLER, KEIN „NICHTS GEFUNDEN" (SEC-026, Teil 2).
 *
 * Stimmen und Tickets wurden mit `.catch(() => [])` gelesen — ein 500 hiess
 * „nichts da", die Löschung meldete Erfolg. Geduldet ist nur die FEHLENDE
 * Tabelle. Der Zähler `attendeeCount` bleibt best effort, aber nicht mehr
 * still: er ist keine Aussage über diesen Menschen, ein Fehlschlag dort darf
 * die Löschung nicht anhalten — er gehört aber ins Log.
 */

type Row = { $id: string, $createdAt: string, [key: string]: unknown }

let tables: Record<string, Row[]>
let errors: Record<string, unknown>
let deleted: string[]
let decrementError: unknown
const logged: { level: string, name: string, fields: Record<string, unknown> }[] = []

function equalFilters(queries: string[]): { attribute: string, values: unknown[] }[] {
  return queries
    .map(q => JSON.parse(q) as { method: string, attribute: string, values: unknown[] })
    .filter(q => q.method === 'equal')
}

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    if (errors[tableId]) throw errors[tableId]
    const filters = equalFilters(queries)
    const rows = (tables[tableId] ?? []).filter(row => filters.every(f => f.values.includes(row[f.attribute])))
    return { total: rows.length, rows }
  }),
  deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    deleted.push(`${tableId}/${rowId}`)
  }),
  updateRow: vi.fn(async () => ({})),
  decrementRowColumn: vi.fn(async () => {
    if (decrementError) throw decrementError
    return {}
  }),
}

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('listAllRows', listAllRows)
vi.stubGlobal('listAllRowsIfTableExists', listAllRowsIfTableExists)
vi.stubGlobal('logEvent', (level: string, name: string, fields: Record<string, unknown>) => {
  logged.push({ level, name, fields })
})

const { eventsDeleteUserData, eventsExportUserData } = await import('../server/utils/eventsUserData')

const event = { context: {} } as unknown as H3Event
const row = (id: string, extra: Record<string, unknown> = {}): Row =>
  ({ $id: id, $createdAt: '2026-11-01T00:00:00.000Z', userId: 'u1', ...extra })
const serverError = () => new AppwriteException('Server Error', 500, 'general_unknown')
const tableMissing = () => new AppwriteException('Table not found', 404, 'table_not_found')

beforeEach(() => {
  tables = {
    event_rsvps: [row('rs1', { eventId: 'e1', status: 'going' })],
    event_votes: [row('v1')],
    event_tickets: [row('t1')],
    events: [],
  }
  errors = {}
  deleted = []
  decrementError = undefined
  logged.length = 0
})

describe('eventsDeleteUserData', () => {
  it('räumt im Normalfall alles ab', async () => {
    expect(await eventsDeleteUserData(event, 'u1')).toEqual({ deleted: 3, anonymized: 0 })
  })

  it('ein 500 auf event_votes ⇒ die Löschung bricht ab', async () => {
    errors.event_votes = serverError()
    await expect(eventsDeleteUserData(event, 'u1')).rejects.toThrow('Server Error')
  })

  it('ein 500 auf event_tickets ⇒ die Löschung bricht ab', async () => {
    errors.event_tickets = serverError()
    await expect(eventsDeleteUserData(event, 'u1')).rejects.toThrow('Server Error')
  })

  it('fehlende Tabellen (Migration offen) ⇒ Erfolg', async () => {
    errors.event_votes = tableMissing()
    errors.event_tickets = tableMissing()
    expect(await eventsDeleteUserData(event, 'u1')).toEqual({ deleted: 1, anonymized: 0 })
  })

  it('ein gescheiterter Zähler hält die Löschung NICHT an — aber er steht im Log', async () => {
    decrementError = serverError()
    expect(await eventsDeleteUserData(event, 'u1')).toEqual({ deleted: 3, anonymized: 0 })
    expect(logged).toEqual([
      { level: 'warn', name: 'events.gdpr_attendee_count_failed', fields: { eventId: 'e1' } },
    ])
  })

  it('ein 404 auf den Zähler (Termin schon weg) ist kein Log-Eintrag', async () => {
    decrementError = new AppwriteException('Row not found', 404, 'row_not_found')
    await eventsDeleteUserData(event, 'u1')
    expect(logged).toEqual([])
  })
})

describe('eventsExportUserData', () => {
  it('ein 500 auf event_votes ⇒ der Export bricht ab', async () => {
    errors.event_votes = serverError()
    await expect(eventsExportUserData(event, 'u1')).rejects.toThrow('Server Error')
  })

  it('ein 500 auf event_tickets ⇒ der Export bricht ab', async () => {
    errors.event_tickets = serverError()
    await expect(eventsExportUserData(event, 'u1')).rejects.toThrow('Server Error')
  })

  it('fehlende Tabelle ⇒ leerer Abschnitt', async () => {
    errors.event_tickets = tableMissing()
    const result = await eventsExportUserData(event, 'u1')
    expect(result.tickets).toEqual([])
    expect(result.votes).toHaveLength(1)
  })
})
