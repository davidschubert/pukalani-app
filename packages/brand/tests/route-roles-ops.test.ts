import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeInstanceRoleGate } from '../../core/tests/support/instanceRoleGate'
import { brandWorld, callBrandRoute, type BrandWho, type FakeRow } from './support/brandRouteKit'

/**
 * ROLLEN-TESTS: DER AUFRÄUM-LAUF DER EREIGNISSE (OPS-009, BT1 b).
 *
 * `POST /api/brand/ops/events-sweep` ist der Hand-Anstoß des Laufs, der
 * Ereignis-Zeilen nach ihrer Frist löscht. Tor: Instanz-Recht
 * `system.manage`. AUSGESCHRIEBEN: nur der Betreiber; keine Community-Rolle,
 * nicht das Karten-Mitglied, nicht der Besitzer einer Marke.
 */

const load = () => import('../server/api/brand/ops/events-sweep.post')

describeInstanceRoleGate('POST /api/brand/ops/events-sweep', load, {
  allow: ['operator'],
  deny: ['owner', 'admin', 'moderator', 'editor', 'member', 'staff'],
}, { globals: { useRuntimeConfig: () => ({ public: { appwriteDatabaseId: 'db' } }) } })

afterEach(() => {
  vi.unstubAllGlobals()
})

const oldEvent: FakeRow = {
  $id: 'e-alt',
  $tableId: 'brand_events',
  $createdAt: '2020-01-01T00:00:00.000Z',
  $updatedAt: '2020-01-01T00:00:00.000Z',
  type: 'profile.created',
}

describe('POST /api/brand/ops/events-sweep mit der Ablage', () => {
  const refused: { who: BrandWho, status: number }[] = [
    { who: 'guest', status: 401 },
    { who: 'noAccess', status: 403 },
    { who: 'owner', status: 403 },
    { who: 'staff', status: 403 },
    { who: 'member', status: 403 },
  ]
  for (const { who, status } of refused) {
    it(`${who}: ${status}, nichts gelöscht, kein Zugriff`, async () => {
      const db = brandWorld([oldEvent])
      const run = await callBrandRoute(load, { who, db })
      expect(run.status).toBe(status)
      expect(db.calls).toEqual([])
      expect(db.rows.some(row => row.$id === 'e-alt')).toBe(true)
    })
  }

  it('Betreiber: der Lauf löscht die abgelaufene Zeile', async () => {
    const db = brandWorld([oldEvent])
    const run = await callBrandRoute(load, { who: 'operator', db })
    expect(run.status).toBe(200)
    expect(run.result).toEqual({ checked: 1, deleted: 1, errors: 0 })
    expect(db.rows.some(row => row.$id === 'e-alt')).toBe(false)
  })
})
