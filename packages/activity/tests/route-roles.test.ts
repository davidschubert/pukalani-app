import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeDoor } from '../../core/tests/support/doorFake'
import { describeRoleGatedRoute, probeRoute, resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { ACTIVITIES_TABLE } from '../shared/types/activity'

/**
 * ROLLEN-PROBEN FÜR DEN AKTIVITÄTS-FEED (P27, OPS-009).
 *
 * Echte Handler, echte Core-Wachen (Prüfstand
 * `core/tests/support/participationHarness.ts`).
 *
 * `activity.manage` (Feed-Einträge entfernen) — ausgeschrieben aus der
 * Rechte-Matrix (`core/shared/communityAuthz.ts`), nicht berechnet: Admin und
 * Owner; der Betreiber im protokollierten Not-Zugang. Weder Moderator noch
 * Editor noch ein Mitglied ohne Rolle.
 *
 * Lesen verlangt ein Konto; die Sichtbarkeit entscheidet das Leserecht der
 * Zeilen — gelesen wird ausschließlich über die Mitglieder-Klinke.
 */

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

describeRoleGatedRoute('DELETE /api/activity/:id', () => import('../server/api/activity/[id].delete'), {
  allow: ['owner', 'admin', 'operator'],
  deny: ['moderator', 'editor', 'member'],
}, { params: { id: 'a-1' } })

describe('GET /api/activity (Feed lesen)', () => {
  const load = () => import('../server/api/activity/index.get')
  const globals = { resolveAvatars: async () => new Map<string, string | null>() }

  function activityDoor() {
    return fakeDoor({
      rows: {
        [ACTIVITIES_TABLE]: [
          { $id: 'a-1', actorId: 'u-a', type: 'post.published' },
          { $id: 'a-2', actorId: 'u-b', type: 'post.published' },
        ],
      },
      // Nur der erste Eintrag trägt ein Leserecht für das Konto.
      readable: (_table, row) => row.$id === 'a-1',
    })
  }

  it('ohne Konto: 401, Datentür zu', async () => {
    const run = await probeRoute(load, { who: 'guest', door: activityDoor().tenantDb, globals })
    expect(run.status).toBe(401)
    expect(run.doorOpened).toBe(false)
  })

  for (const who of ['member', 'stranger'] as const) {
    it(`${who}: gelesen wird nur über die Mitglieder-Klinke (Leserecht der Zeilen entscheidet)`, async () => {
      const door = activityDoor()
      const seen: { body?: { rows: Array<{ $id: string }> } } = {}
      const run = await probeRoute(async () => ({
        default: async (e: unknown) => {
          const handler = (await load()).default as (event: unknown) => Promise<{ rows: Array<{ $id: string }> }>
          seen.body = await handler(e)
          return seen.body
        },
      }), { who, door: door.tenantDb, globals })
      expect(run.status).toBe(200)
      expect(door.calls.length).toBeGreaterThan(0)
      expect(door.calls.every(call => call.handle === 'member')).toBe(true)
      expect(seen.body?.rows.map(row => row.$id)).toEqual(['a-1'])
    })
  }
})
