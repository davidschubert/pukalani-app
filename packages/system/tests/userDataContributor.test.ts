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
let updates: { tableId: string, rowId: string, data: Record<string, unknown> }[]
let queriesSeen: Record<string, string[][]>

function equalFilters(queries: string[]): { attribute: string, values: unknown[] }[] {
  return queries
    .map(q => JSON.parse(q) as { method: string, attribute: string, values: unknown[] })
    .filter(q => q.method === 'equal')
}

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    ;(queriesSeen[tableId] ??= []).push(queries)
    const filters = equalFilters(queries)
    const error = errors[tableId] ?? filters.map(f => errors[`${tableId}:${f.attribute}`]).find(Boolean)
    if (error) throw error
    const rows = (tables[tableId] ?? []).filter(row => filters.every(f => f.values.includes(row[f.attribute])))
    return { total: rows.length, rows }
  }),
  deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    deleted.push(`${tableId}/${rowId}`)
  }),
  updateRow: vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    updates.push({ tableId, rowId, data })
    const target = (tables[tableId] ?? []).find(entry => entry.$id === rowId)
    if (target) Object.assign(target, data)
    return {}
  }),
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
    audit_logs: [
      row('l1', { actorId: 'u1', actorName: 'Ada', action: 'post.deleted', targetId: 'p1', targetType: 'post', targetName: 'P', metadata: '', ip: '10.0.0.1' }),
      row('l2', { actorId: 'op9', actorName: 'Operator', action: 'user.role_changed', targetId: 'u1', targetType: 'user', targetName: 'Ada', metadata: '', ip: '10.9.9.9' }),
    ],
    instance_secrets: [
      row('openrouter', { updatedBy: 'u1', value: 'SECRET-VALUE-1' }),
      row('resend', { updatedBy: 'op9', value: 'SECRET-VALUE-2' }),
    ],
  }
  errors = {}
  deleted = []
  updates = []
  queriesSeen = {}
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

describe('systemDeleteUserData — instance_secrets.updatedBy (SEC-026)', () => {
  it('leert updatedBy der Person, die Zeile und fremde Einträge bleiben', async () => {
    await systemDeleteUserData(event, 'u1')
    expect(updates.filter(u => u.tableId === 'instance_secrets')).toEqual([
      { tableId: 'instance_secrets', rowId: 'openrouter', data: { updatedBy: '' } },
    ])
    expect(tables.instance_secrets!.map(r => r.updatedBy)).toEqual(['', 'op9'])
    expect(deleted.some(d => d.startsWith('instance_secrets/'))).toBe(false)
  })

  it('liest nur $id und updatedBy — nie den Wert', async () => {
    await systemDeleteUserData(event, 'u1')
    for (const queries of queriesSeen.instance_secrets ?? []) {
      const select = queries.map(q => JSON.parse(q) as { method: string, values?: unknown[] }).find(q => q.method === 'select')
      expect(select?.values).toEqual(['$id', 'updatedBy'])
    }
    expect(queriesSeen.instance_secrets?.length).toBeGreaterThan(0)
  })

  it('zweiter Lauf schreibt an instance_secrets nichts mehr', async () => {
    await systemDeleteUserData(event, 'u1')
    updates = []
    await systemDeleteUserData(event, 'u1')
    expect(updates.filter(u => u.tableId === 'instance_secrets')).toEqual([])
  })

  it('fehlende Tabelle ⇒ Erfolg; ein 500 ⇒ Abbruch', async () => {
    errors.instance_secrets = tableMissing()
    await expect(systemDeleteUserData(event, 'u1')).resolves.toBeDefined()
    errors.instance_secrets = serverError()
    await expect(systemDeleteUserData(event, 'u1')).rejects.toThrow('Server Error')
  })
})

describe('systemExportUserData', () => {
  it('enthält das Audit-Protokoll: als Handelnde mit IP, als Ziel ohne Daten des Betreibers', async () => {
    const result = await systemExportUserData(event, 'u1')
    expect(result.auditLog).toEqual({
      asActor: [{ action: 'post.deleted', targetType: 'post', ip: '10.0.0.1', createdAt: '2026-11-01T00:00:00.000Z' }],
      asTarget: [{ action: 'user.role_changed', createdAt: '2026-11-01T00:00:00.000Z' }],
    })
    expect(JSON.stringify(result)).not.toContain('10.9.9.9')
    expect(JSON.stringify(result)).not.toContain('Operator')
  })

  it('enthält actorName und metadata der eigenen Aktivitäten', async () => {
    tables.activities = [row('a1', { actorId: 'u1', actorName: 'Ada', type: 'post.created', objectType: 'post', objectId: 'p1', link: '/p/1', metadata: '{"snippet":"Hallo"}' })]
    const result = await systemExportUserData(event, 'u1')
    expect(result.activities[0]).toMatchObject({ actorName: 'Ada', metadata: '{"snippet":"Hallo"}' })
  })

  it('nennt gesetzte Instanz-Schlüssel nur als Zahl, nie den Wert', async () => {
    const result = await systemExportUserData(event, 'u1')
    expect(result.instanceSecretsUpdated).toBe(1)
    expect(JSON.stringify(result)).not.toContain('SECRET-VALUE')
  })

  it('ein 500 auf audit_logs ⇒ der Export bricht ab', async () => {
    errors.audit_logs = serverError()
    await expect(systemExportUserData(event, 'u1')).rejects.toThrow('Server Error')
  })

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
