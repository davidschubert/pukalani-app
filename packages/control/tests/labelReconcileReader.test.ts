import { describe, expect, it, vi } from 'vitest'
import type { TablesDB } from 'node-appwrite'
import { mapTenantRowToContext } from '../server/utils/tenantsResolver'
import { tenantRowPermissionsFor } from '../../core/server/utils/tenantRowPermissions'
import { createLabelReconcileReaderFor } from '../server/utils/labelReconcileReader'
import { ROLES_WITHOUT_MODERATOR_LABEL, communityLabelsFor, roleCarriesModeratorLabel } from '../shared/labelReconcile'
import { COMMUNITY_ROLES, communityRoleHasCapability } from '../../core/shared/communityAuthz'
import type { TenantRow } from '../shared/types/tenantRecord'

/**
 * LESER DES LABEL-ABGLEICHS (SEC-024, 2026-11-13) — und die Frage, die man
 * hier am leichtesten falsch beantwortet: WELCHER Wert ist das Label?
 *
 * Eine Community hat zwei Kennungen: `communities.$id` und den Ablage-Stempel
 * `communities.tenantId` (`t-…`, seit E8-3 so benannt — Benachrichtigungen und
 * Mail-Links schlagen DEN nach). Das Lese-Publikum ist aber
 * `Role.label(tenant.communityId)`, und der Resolver setzt
 * `tenant.communityId = row.$id`. `community_members.communityId` ist laut
 * Typ ebenfalls `communities.$id`. Der Abgleich darf den Wert also direkt aus
 * der Mitglieder-Zeile nehmen — der erste Test nagelt genau das fest.
 */

describe('welcher Wert ist das Label?', () => {
  it('Role.label(communityId) ist communities.$id, NICHT communities.tenantId', () => {
    const tenant = mapTenantRowToContext({
      $id: 'abc123',
      tenantId: 't-xyz',
      mode: 'pool',
      projectId: 'pool',
      status: 'active',
      plan: 'personal',
    } as Pick<TenantRow, 'mode' | 'projectId' | 'tenantId' | 'status' | 'plan'> & { $id: string })
    expect(tenant?.communityId).toBe('abc123')
    const permissions = tenantRowPermissionsFor(tenant, { read: 'members' })
    expect(permissions).toContain('read("label:abc123")')
    expect(permissions.join(' ')).not.toContain('t-xyz')
    // Der Abgleich bildet aus `community_members.communityId` (= communities.$id)
    // genau diese zwei Labels: Zugehörigkeit und Moderations-Team.
    expect(communityLabelsFor('abc123')).toEqual(['abc123', 'modabc123'])
  })

  it('ein Wert, der kein Label sein kann, liefert keine Labels (kein Entzug auf Verdacht)', () => {
    expect(communityLabelsFor('t-xyz')).toEqual([])
    expect(communityLabelsFor('')).toEqual([])
  })
})

interface FakeRow {
  $id: string
  communityId: string
  runtimeProjectId: string
  runtimeUserId: string
  status: string
  role?: string
  $updatedAt?: string
}

interface FakeCommunity {
  $id: string
  projectId: string
  status: string
}

interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

function fakeTablesDB(rows: FakeRow[], communities: FakeCommunity[] = []) {
  const calls: string[][] = []
  const tables: string[] = []
  const listRows = vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    calls.push(queries)
    tables.push(tableId)
    const source: Array<Record<string, unknown>> = (tableId === 'communities' ? communities : rows) as unknown as Array<Record<string, unknown>>
    const parsed = queries.map(q => JSON.parse(q) as ParsedQuery)
    let result = source.filter(row => parsed.every((q) => {
      if (!q.attribute) return true
      if (q.method === 'equal') return (q.values ?? []).includes(row[q.attribute])
      if (q.method === 'greaterThan') return String(row[q.attribute] ?? '') > String(q.values?.[0])
      return true
    }))
    const order = parsed.find(q => q.method === 'orderDesc')
    if (order?.attribute) {
      const key = order.attribute
      result = [...result].sort((a, b) => String(b[key]).localeCompare(String(a[key])))
    }
    const cursor = parsed.find(q => q.method === 'cursorAfter')?.values?.[0]
    if (cursor) result = result.slice(result.findIndex(row => row.$id === cursor) + 1)
    const limit = Number(parsed.find(q => q.method === 'limit')?.values?.[0] ?? 25)
    return { rows: result.slice(0, limit), total: result.length }
  })
  const getRow = vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    const found = tableId === 'communities' ? communities.find(c => c.$id === rowId) : undefined
    if (!found) throw Object.assign(new Error('Row not found'), { code: 404 })
    return found
  })
  return { tablesDB: { listRows, getRow } as unknown as TablesDB, listRows, getRow, calls, tables }
}

function removedRows(count: number): FakeRow[] {
  return Array.from({ length: count }, (_, i) => ({
    $id: `r${String(i).padStart(4, '0')}`,
    communityId: 'cA',
    runtimeProjectId: 'pool',
    runtimeUserId: `u${i}`,
    status: 'removed',
  }))
}

describe('createLabelReconcileReader', () => {
  it('liest seitenweise mit ausdrücklichem Limit und Cursor, nur `removed` des eigenen Projekts', async () => {
    const rows = [
      ...removedRows(150),
      { $id: 'x1', communityId: 'cA', runtimeProjectId: 'pool', runtimeUserId: 'ua', status: 'active' },
      { $id: 'x2', communityId: 'cA', runtimeProjectId: 'silo', runtimeUserId: 'ub', status: 'removed' },
    ]
    const { tablesDB, calls } = fakeTablesDB(rows)
    const reader = createLabelReconcileReaderFor(tablesDB, 'db')
    const page = await reader.listRemoved('pool', { limit: 500, after: null })
    expect(page.rows).toHaveLength(150)
    expect(page.nextCursor).toBeNull()
    expect(page.rows[0]).toEqual({ rowId: 'r0000', communityId: 'cA', userId: 'u0' })
    // Jede Abfrage trägt ein Limit; ab der zweiten Seite einen Cursor.
    expect(calls.every(q => q.some(s => s.includes('"limit"')))).toBe(true)
    expect(calls.slice(1).every(q => q.some(s => s.includes('"cursorAfter"')))).toBe(true)
  })

  it('kappt am Deckel nicht still: es gibt einen Cursor für den nächsten Lauf', async () => {
    const { tablesDB } = fakeTablesDB(removedRows(250))
    const reader = createLabelReconcileReaderFor(tablesDB, 'db')
    const first = await reader.listRemoved('pool', { limit: 200, after: null })
    expect(first.rows).toHaveLength(200)
    expect(first.nextCursor).toBe('r0199')
    const second = await reader.listRemoved('pool', { limit: 200, after: first.nextCursor })
    expect(second.rows).toHaveLength(50)
    expect(second.rows[0]?.rowId).toBe('r0200')
    expect(second.nextCursor).toBeNull()
  })

  it('hasAccess: nur eine `active`-Zeile für genau dieses Paar zählt', async () => {
    const { tablesDB } = fakeTablesDB([
      { $id: 'a', communityId: 'cA', runtimeProjectId: 'pool', runtimeUserId: 'u1', status: 'active' },
      { $id: 'b', communityId: 'cA', runtimeProjectId: 'pool', runtimeUserId: 'u2', status: 'removed' },
      { $id: 'c', communityId: 'cB', runtimeProjectId: 'pool', runtimeUserId: 'u2', status: 'active' },
    ], [{ $id: 'cA', projectId: 'pool', status: 'active' }, { $id: 'cB', projectId: 'pool', status: 'active' }])
    const reader = createLabelReconcileReaderFor(tablesDB, 'db')
    expect(await reader.hasAccess('pool', 'cA', 'u1')).toBe(true)
    expect(await reader.hasAccess('pool', 'cA', 'u2')).toBe(false)
    expect(await reader.hasAccess('silo', 'cA', 'u1')).toBe(false)
  })

  it('hasAccess (SI1 b): `active`-Zeile in stillgelegter oder gelöschter Community ist KEIN Zugang — frisch gelesen', async () => {
    const communities: FakeCommunity[] = [{ $id: 'cA', projectId: 'pool', status: 'disabled' }]
    const { tablesDB, getRow } = fakeTablesDB([
      { $id: 'a', communityId: 'cA', runtimeProjectId: 'pool', runtimeUserId: 'u1', status: 'active' },
      { $id: 'b', communityId: 'cGone', runtimeProjectId: 'pool', runtimeUserId: 'u1', status: 'active' },
    ], communities)
    const reader = createLabelReconcileReaderFor(tablesDB, 'db')
    expect(await reader.hasAccess('pool', 'cA', 'u1')).toBe(false)
    expect(await reader.hasAccess('pool', 'cGone', 'u1')).toBe(false)
    // Wieder eingeschaltet ⇒ beim nächsten Fragen Zugang (kein Cache).
    communities[0]!.status = 'active'
    expect(await reader.hasAccess('pool', 'cA', 'u1')).toBe(true)
    expect(getRow).toHaveBeenCalledTimes(3)
  })

  it('hasAccess: eine andere Störung beim Lesen der Community wirft (kein Entzug auf Verdacht)', async () => {
    const { tablesDB, getRow } = fakeTablesDB([
      { $id: 'a', communityId: 'cA', runtimeProjectId: 'pool', runtimeUserId: 'u1', status: 'active' },
    ])
    getRow.mockRejectedValueOnce(Object.assign(new Error('down'), { code: 503 }))
    const reader = createLabelReconcileReaderFor(tablesDB, 'db')
    await expect(reader.hasAccess('pool', 'cA', 'u1')).rejects.toThrow('down')
  })
})

describe('listActiveInDisabled (SI1 b, Lücke 2)', () => {
  it('liest stillgelegte Communities DIESES Projekts, dann nur deren `active`-Zeilen dieses Projekts', async () => {
    const { tablesDB, calls, tables } = fakeTablesDB([
      { $id: 'm1', communityId: 'cOff', runtimeProjectId: 'pool', runtimeUserId: 'u1', status: 'active' },
      { $id: 'm2', communityId: 'cOff', runtimeProjectId: 'pool', runtimeUserId: 'u2', status: 'removed' },
      { $id: 'm3', communityId: 'cOn', runtimeProjectId: 'pool', runtimeUserId: 'u3', status: 'active' },
      { $id: 'm4', communityId: 'cOffSilo', runtimeProjectId: 'silo', runtimeUserId: 'u4', status: 'active' },
    ], [
      { $id: 'cOff', projectId: 'pool', status: 'disabled' },
      { $id: 'cOn', projectId: 'pool', status: 'active' },
      { $id: 'cOffSilo', projectId: 'silo', status: 'disabled' },
    ])
    const reader = createLabelReconcileReaderFor(tablesDB, 'db')
    const list = await reader.listActiveInDisabled('pool', { limit: 100 })
    expect(list).toEqual({ rows: [{ rowId: 'm1', communityId: 'cOff', userId: 'u1' }], truncated: false })
    // Erst die Communities (Status + Projekt), dann die Mitglieder (Status + Projekt).
    expect(tables).toEqual(['communities', 'community_members'])
    expect(calls[0]).toEqual(expect.arrayContaining([
      expect.stringContaining('"status","values":["disabled"]'),
      expect.stringContaining('"projectId","values":["pool"]'),
    ]))
    expect(calls[1]).toEqual(expect.arrayContaining([
      expect.stringContaining('"communityId","values":["cOff"]'),
      expect.stringContaining('"status","values":["active"]'),
      expect.stringContaining('"runtimeProjectId","values":["pool"]'),
    ]))
    expect(calls.every(q => q.some(x => x.includes('"limit"')))).toBe(true)
  })

  it('keine stillgelegte Community ⇒ keine Mitglieder-Abfrage', async () => {
    const { tablesDB, tables } = fakeTablesDB([], [{ $id: 'cOn', projectId: 'pool', status: 'active' }])
    const reader = createLabelReconcileReaderFor(tablesDB, 'db')
    expect(await reader.listActiveInDisabled('pool', { limit: 10 })).toEqual({ rows: [], truncated: false })
    expect(tables).toEqual(['communities'])
  })

  it('Deckel: höchstens `limit` Zeilen, `truncated` statt still abschneiden', async () => {
    const rows: FakeRow[] = Array.from({ length: 30 }, (_, i) => ({
      $id: `m${String(i).padStart(3, '0')}`, communityId: 'cOff', runtimeProjectId: 'pool', runtimeUserId: `u${i}`, status: 'active',
    }))
    const { tablesDB } = fakeTablesDB(rows, [{ $id: 'cOff', projectId: 'pool', status: 'disabled' }])
    const reader = createLabelReconcileReaderFor(tablesDB, 'db')
    const exact = await reader.listActiveInDisabled('pool', { limit: 30 })
    expect(exact.rows).toHaveLength(30)
    expect(exact.truncated).toBe(false)
    const capped = await reader.listActiveInDisabled('pool', { limit: 20 })
    expect(capped.rows).toHaveLength(20)
    expect(capped.truncated).toBe(true)
  })
})

describe('listDemoted / moderatesNow (SI1 b, Lücke 1)', () => {
  it('die Rollen-Regel ist GENAU die der Label-Middleware: `reports.moderate`', () => {
    for (const role of COMMUNITY_ROLES) {
      expect(roleCarriesModeratorLabel(role)).toBe(communityRoleHasCapability(role, 'reports.moderate'))
    }
    expect(roleCarriesModeratorLabel('unbekannt')).toBe(false)
    expect([...ROLES_WITHOUT_MODERATOR_LABEL].sort()).toEqual(
      COMMUNITY_ROLES.filter(role => !communityRoleHasCapability(role, 'reports.moderate')).sort(),
    )
    // Ohne Rollen OHNE Moderation gäbe es nichts zu fragen — das wäre ein Umbau der Matrix.
    expect(ROLES_WITHOUT_MODERATOR_LABEL.length).toBeGreaterThan(0)
    expect(ROLES_WITHOUT_MODERATOR_LABEL).not.toContain('moderator')
  })

  it('fragt `active` + Projekt + Rollen ohne Moderation + Fenster, neueste zuerst', async () => {
    const { tablesDB, calls } = fakeTablesDB([
      { $id: 'm1', communityId: 'cA', runtimeProjectId: 'pool', runtimeUserId: 'u1', status: 'active', role: 'viewer', $updatedAt: '2026-11-17T10:00:00.000Z' },
      { $id: 'm2', communityId: 'cA', runtimeProjectId: 'pool', runtimeUserId: 'u2', status: 'active', role: 'viewer', $updatedAt: '2026-11-10T10:00:00.000Z' },
      { $id: 'm3', communityId: 'cA', runtimeProjectId: 'pool', runtimeUserId: 'u3', status: 'active', role: 'moderator', $updatedAt: '2026-11-17T10:00:00.000Z' },
      { $id: 'm4', communityId: 'cA', runtimeProjectId: 'pool', runtimeUserId: 'u4', status: 'removed', role: 'viewer', $updatedAt: '2026-11-17T10:00:00.000Z' },
      { $id: 'm5', communityId: 'cA', runtimeProjectId: 'silo', runtimeUserId: 'u5', status: 'active', role: 'editor', $updatedAt: '2026-11-17T10:00:00.000Z' },
      { $id: 'm6', communityId: 'cB', runtimeProjectId: 'pool', runtimeUserId: 'u6', status: 'active', role: 'editor', $updatedAt: '2026-11-17T11:00:00.000Z' },
    ])
    const reader = createLabelReconcileReaderFor(tablesDB, 'db')
    const list = await reader.listDemoted('pool', { limit: 100, since: '2026-11-16T10:00:00.000Z' })
    expect(list).toEqual({
      rows: [
        { rowId: 'm6', communityId: 'cB', userId: 'u6' },
        { rowId: 'm1', communityId: 'cA', userId: 'u1' },
      ],
      truncated: false,
    })
    const q = calls[0]!
    expect(q).toEqual(expect.arrayContaining([
      expect.stringContaining('"status","values":["active"]'),
      expect.stringContaining('"runtimeProjectId","values":["pool"]'),
      expect.stringContaining('"method":"greaterThan","attribute":"$updatedAt","values":["2026-11-16T10:00:00.000Z"]'),
      expect.stringContaining('"method":"orderDesc","attribute":"$updatedAt"'),
      expect.stringContaining('"limit"'),
    ]))
    const roleQuery = JSON.parse(q.find(x => x.includes('"attribute":"role"'))!) as { values: string[] }
    expect([...roleQuery.values].sort()).toEqual([...ROLES_WITHOUT_MODERATOR_LABEL].sort())
  })

  it('Deckel: `truncated` statt still abschneiden', async () => {
    const rows: FakeRow[] = Array.from({ length: 5 }, (_, i) => ({
      $id: `m${i}`, communityId: 'cA', runtimeProjectId: 'pool', runtimeUserId: `u${i}`, status: 'active', role: 'viewer', $updatedAt: `2026-11-17T0${i}:00:00.000Z`,
    }))
    const { tablesDB } = fakeTablesDB(rows)
    const reader = createLabelReconcileReaderFor(tablesDB, 'db')
    const list = await reader.listDemoted('pool', { limit: 3, since: '2026-11-16T00:00:00.000Z' })
    expect(list.rows.map(r => r.rowId)).toEqual(['m4', 'm3', 'm2'])
    expect(list.truncated).toBe(true)
  })

  it('moderatesNow: nur eine `active`-Zeile MIT Moderations-Rolle', async () => {
    const { tablesDB } = fakeTablesDB([
      { $id: 'a', communityId: 'cA', runtimeProjectId: 'pool', runtimeUserId: 'u1', status: 'active', role: 'moderator' },
      { $id: 'b', communityId: 'cA', runtimeProjectId: 'pool', runtimeUserId: 'u2', status: 'active', role: 'viewer' },
      { $id: 'c', communityId: 'cA', runtimeProjectId: 'pool', runtimeUserId: 'u3', status: 'removed', role: 'admin' },
    ])
    const reader = createLabelReconcileReaderFor(tablesDB, 'db')
    expect(await reader.moderatesNow('pool', 'cA', 'u1')).toBe(true)
    expect(await reader.moderatesNow('pool', 'cA', 'u2')).toBe(false)
    expect(await reader.moderatesNow('pool', 'cA', 'u3')).toBe(false)
    expect(await reader.moderatesNow('silo', 'cA', 'u1')).toBe(false)
  })
})
