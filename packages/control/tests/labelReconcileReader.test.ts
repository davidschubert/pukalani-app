import { describe, expect, it, vi } from 'vitest'
import type { TablesDB } from 'node-appwrite'
import { mapTenantRowToContext } from '../server/utils/tenantsResolver'
import { tenantRowPermissionsFor } from '../../core/server/utils/tenantRowPermissions'
import { createLabelReconcileReaderFor } from '../server/utils/labelReconcileReader'
import { communityLabelsFor } from '../shared/labelReconcile'
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
}

function fakeTablesDB(rows: FakeRow[]) {
  const calls: string[][] = []
  const listRows = vi.fn(async ({ queries }: { queries: string[] }) => {
    calls.push(queries)
    const parsed = queries.map(q => JSON.parse(q) as { method: string, attribute?: string, values?: unknown[] })
    let result = rows.filter(row => parsed.every((q) => {
      if (q.method !== 'equal' || !q.attribute) return true
      return (q.values ?? []).includes((row as unknown as Record<string, unknown>)[q.attribute])
    }))
    const cursor = parsed.find(q => q.method === 'cursorAfter')?.values?.[0]
    if (cursor) result = result.slice(result.findIndex(row => row.$id === cursor) + 1)
    const limit = Number(parsed.find(q => q.method === 'limit')?.values?.[0] ?? 25)
    return { rows: result.slice(0, limit), total: result.length }
  })
  return { tablesDB: { listRows } as unknown as TablesDB, listRows, calls }
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
    ])
    const reader = createLabelReconcileReaderFor(tablesDB, 'db')
    expect(await reader.hasAccess('pool', 'cA', 'u1')).toBe(true)
    expect(await reader.hasAccess('pool', 'cA', 'u2')).toBe(false)
    expect(await reader.hasAccess('silo', 'cA', 'u1')).toBe(false)
  })
})
