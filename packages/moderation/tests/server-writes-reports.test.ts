import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Permission, Role } from 'node-appwrite'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeRow, fakeDoor, runDoorRoute } from '../../core/tests/support/doorFake'
import { grantsWrite, writerDoor, writesTo } from '../../core/tests/support/writerDoor'
import { REPORTS_TABLE } from '../shared/types/report'

/**
 * SEC-002 (GA1 P13, Etappe 3) — Meldungen schreibt nur der Server.
 *
 * Eine neue Meldung trägt Leserechte für das Moderations-Team und den Melder,
 * aber kein Schreibrecht für irgendein Konto. Zurückziehen läuft über
 * `DELETE /api/reports` und entfernt nur die Meldung, die die Route über
 * `reporterId` = Konto gefunden hat.
 */

const MEMBER = 'u-member'
const OTHER = 'u-other'

const report = (reporterId: string): FakeRow => ({
  $id: `rep-${reporterId}`, communityId: 'c-a', reporterId, targetType: 'comment', targetId: 'k-1',
  reason: 'spam', note: null, status: 'open', resolvedBy: null, resolution: null,
})

const loadCreate = () => import('../server/api/reports/index.post')
const loadDelete = () => import('../server/api/reports/index.delete')

beforeEach(async () => {
  const { __resetReportTargets, registerReportTarget } = await import('../server/utils/reportTargets')
  __resetReportTargets()
  registerReportTarget('comment', () => true)
})

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

describe('POST /api/reports — die Meldung trägt kein Schreibrecht', () => {
  it('Leserechte für Team und Melder, kein update/delete', async () => {
    const door = fakeDoor({ rows: { [REPORTS_TABLE]: [] } })
    const { tenantDb, writes } = writerDoor(door)
    const run = await runDoorRoute(loadCreate, {
      door,
      body: { targetType: 'comment', targetId: 'k-1', reason: 'spam' },
      globals: { tenantDb, runReportEscalation: async () => {} },
    })

    expect(run.status).toBe(200)
    const created = writesTo(writes, REPORTS_TABLE)
    expect(created.map(w => [w.method, w.handle])).toEqual([['create', 'operator']])
    expect(created[0]!.permissions).toContain(Permission.read(Role.user(MEMBER)))
    expect(created[0]!.permissions).not.toContain(Permission.update(Role.user(MEMBER)))
    expect(created[0]!.permissions).not.toContain(Permission.delete(Role.user(MEMBER)))
    expect(grantsWrite(created[0]!.permissions)).toBe(false)
    expect(door.rows[REPORTS_TABLE]![0]).toMatchObject({ reporterId: MEMBER, status: 'open' })
  })
})

describe('DELETE /api/reports — nur die eigene Meldung', () => {
  const globals = (tenantDb: unknown) => ({ tenantDb, getQuery: () => ({ targetType: 'comment', targetId: 'k-1' }) })

  it('entfernt die eigene Meldung, die eines anderen Kontos zum selben Ziel bleibt', async () => {
    const door = fakeDoor({ rows: { [REPORTS_TABLE]: [report(OTHER), report(MEMBER)] } })
    const { tenantDb, writes } = writerDoor(door)
    const run = await runDoorRoute(loadDelete, { door, globals: globals(tenantDb) })

    expect(run.status).toBe(200)
    expect(writesTo(writes, REPORTS_TABLE).map(w => [w.method, w.handle, w.id])).toEqual([['remove', 'operator', `rep-${MEMBER}`]])
    expect(door.rows[REPORTS_TABLE]).toEqual([report(OTHER)])
  })

  /**
   * BE-020: eine ERLEDIGTE Meldung samt Entscheidung gehört zum Verlauf der
   * Moderation — sie lässt sich nicht mehr zurückziehen (Davids Entscheidung).
   * Die Route antwortet 409 `report_resolved`, die Zeile bleibt unverändert.
   */
  it('BE-020: eine erledigte eigene Meldung übersteht die Rücknahme unverändert (409 report_resolved)', async () => {
    const resolved: FakeRow = { ...report(MEMBER), status: 'resolved', resolvedBy: 'u-mod', resolution: 'hidden' }
    const door = fakeDoor({ rows: { [REPORTS_TABLE]: [report(OTHER), { ...resolved }] } })
    const { tenantDb, writes } = writerDoor(door)
    const run = await runDoorRoute(loadDelete, { door, globals: globals(tenantDb) })

    expect(run.status).toBe(409)
    expect(run.error?.data?.code).toBe('report_resolved')
    expect(writes).toEqual([])
    expect(door.rows[REPORTS_TABLE]).toEqual([report(OTHER), resolved])
  })

  it('BE-020: die Suche fragt nur nach OFFENEN eigenen Meldungen', async () => {
    const door = fakeDoor({ rows: { [REPORTS_TABLE]: [report(MEMBER)] } })
    const { tenantDb } = writerDoor(door)
    const seen: string[][] = []
    const spyDoor = (event: never, options?: never) => {
      const handle = tenantDb(event, options) as { find: (t: string, q?: string[]) => Promise<unknown> }
      return { ...handle, find: (t: string, q: string[] = []) => { seen.push(q); return handle.find(t, q) } }
    }
    const run = await runDoorRoute(loadDelete, { door, globals: globals(spyDoor) })

    expect(run.status).toBe(200)
    const first = (seen[0] ?? []).map(q => JSON.parse(q) as { method: string, attribute: string, values: unknown[] })
    expect(first).toContainEqual({ method: 'equal', attribute: 'status', values: ['open'] })
    expect(first).toContainEqual({ method: 'equal', attribute: 'reporterId', values: [MEMBER] })
    expect(door.rows[REPORTS_TABLE]).toEqual([])
  })

  it('ohne eigene Meldung: nichts wird entfernt, auch keine fremde', async () => {
    const door = fakeDoor({ rows: { [REPORTS_TABLE]: [report(OTHER)] } })
    const { tenantDb, writes } = writerDoor(door)
    const run = await runDoorRoute(loadDelete, { door, globals: globals(tenantDb) })

    expect(run.status).toBe(200)
    expect(writes).toEqual([])
    expect(door.rows[REPORTS_TABLE]).toEqual([report(OTHER)])
  })
})
