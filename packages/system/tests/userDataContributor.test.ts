import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { listAllRows, listAllRowsIfTableExists } from '../../core/server/utils/listAllRows'

/**
 * EIN LESEFEHLER IST EIN FEHLER, KEIN „NICHTS GEFUNDEN" (SEC-026, Teil 2).
 *
 * Hier stand an vier Lesevorgängen `.catch(() => [])`: ein 500 auf
 * `activities` oder die beiden Handle-Tabellen wurde zu „keine Zeilen", der
 * Contributor meldete Erfolg und `deleteUserCompletely` löschte das Konto —
 * der Name blieb stehen, ohne dass ihn ein zweiter Lauf noch finden konnte.
 * Geduldet ist nur die FEHLENDE Tabelle (Migration auf der Instanz offen).
 */

type Row = { $id: string, $createdAt: string, [key: string]: unknown }

let tables: Record<string, Row[]>
/** Fehler je Tabelle — oder je `tabelle:spalte` für eine einzelne Abfrage. */
let errors: Record<string, unknown>
let deleted: string[]

function equalFilters(queries: string[]): { attribute: string, values: unknown[] }[] {
  return queries
    .map(q => JSON.parse(q) as { method: string, attribute: string, values: unknown[] })
    .filter(q => q.method === 'equal')
}

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    const filters = equalFilters(queries)
    const error = errors[tableId] ?? filters.map(f => errors[`${tableId}:${f.attribute}`]).find(Boolean)
    if (error) throw error
    const rows = (tables[tableId] ?? []).filter(row => filters.every(f => f.values.includes(row[f.attribute])))
    return { total: rows.length, rows }
  }),
  deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    deleted.push(`${tableId}/${rowId}`)
  }),
  updateRow: vi.fn(async () => ({})),
}

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('listAllRows', listAllRows)
vi.stubGlobal('listAllRowsIfTableExists', listAllRowsIfTableExists)
vi.stubGlobal('logEvent', () => {})

const { systemDeleteUserData, systemExportUserData } = await import('../server/utils/userDataContributor')

const event = { context: {} } as unknown as H3Event
const row = (id: string, extra: Record<string, unknown>): Row => ({ $id: id, $createdAt: '2026-11-01T00:00:00.000Z', ...extra })
const serverError = () => new AppwriteException('Server Error', 500, 'general_unknown')
const tableMissing = () => new AppwriteException('Table not found', 404, 'table_not_found')

beforeEach(() => {
  tables = {
    notifications: [row('n1', { recipientId: 'u1' }), row('n2', { senderId: 'u1', recipientId: 'u2' })],
    activities: [row('a1', { actorId: 'u1' })],
    community_handles: [row('h1', { userId: 'u1' })],
    account_handles: [row('ah1', { userId: 'u1' })],
    audit_logs: [],
  }
  errors = {}
  deleted = []
})

describe('systemDeleteUserData', () => {
  it('räumt im Normalfall alle vier Arten ab', async () => {
    const result = await systemDeleteUserData(event, 'u1')
    expect(result.deleted).toBe(5)
    expect(deleted).toContain('account_handles/ah1')
  })

  it('ein 500 auf activities ⇒ die Löschung bricht ab', async () => {
    errors.activities = serverError()
    await expect(systemDeleteUserData(event, 'u1')).rejects.toThrow('Server Error')
  })

  it('ein 500 auf community_handles ⇒ Abbruch', async () => {
    errors.community_handles = serverError()
    await expect(systemDeleteUserData(event, 'u1')).rejects.toThrow('Server Error')
  })

  it('ein 500 auf account_handles ⇒ Abbruch', async () => {
    errors.account_handles = serverError()
    await expect(systemDeleteUserData(event, 'u1')).rejects.toThrow('Server Error')
  })

  it('ein Fehler auf der senderId-Abfrage ⇒ Abbruch (kein „leere Menge" mehr)', async () => {
    errors['notifications:senderId'] = serverError()
    await expect(systemDeleteUserData(event, 'u1')).rejects.toThrow('Server Error')
  })

  it('fehlende Handle-Tabellen (Migration offen) ⇒ Erfolg', async () => {
    errors.community_handles = tableMissing()
    errors.account_handles = tableMissing()
    errors.activities = tableMissing()
    await expect(systemDeleteUserData(event, 'u1')).resolves.toMatchObject({ deleted: 2 })
  })
})

describe('systemExportUserData', () => {
  it('ein 500 auf activities ⇒ der Export bricht ab', async () => {
    errors.activities = serverError()
    await expect(systemExportUserData(event, 'u1')).rejects.toThrow('Server Error')
  })

  it('ein 500 auf account_handles ⇒ der Export bricht ab', async () => {
    errors.account_handles = serverError()
    await expect(systemExportUserData(event, 'u1')).rejects.toThrow('Server Error')
  })

  it('fehlende Tabelle ⇒ leerer Abschnitt', async () => {
    errors.account_handles = tableMissing()
    const result = await systemExportUserData(event, 'u1')
    expect(result.accountHandles).toEqual([])
    expect(result.handles).toHaveLength(1)
  })
})
