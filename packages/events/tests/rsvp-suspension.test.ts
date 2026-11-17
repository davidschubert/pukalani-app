import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeDoor, type FakeRow, fakeDoor, runDoorRoute } from '../../core/tests/support/doorFake'
import { EVENT_RSVPS_TABLE, EVENTS_TABLE } from '../shared/types/event'

/**
 * F26 — IN EINER GESPERRTEN COMMUNITY: ZUSAGEN ZU, ZURÜCKZIEHEN OFFEN.
 *
 * Beides ist derselbe Aufruf mit demselben Body; nur der Bestand entscheidet.
 * Die SEC-030-Wache (2026-11-13) stand vor dieser Unterscheidung und wies in
 * einer gesperrten Community JEDEN Aufruf ab — auch die Rücknahme (lokal
 * gemessen mit verify-community-suspension: 403 `community_suspended`).
 *
 * Die nachgebaute Tür hält die Sperre wie die echte (`tenantDb.ts`,
 * `assertWritable`): wer als `actor` nicht der Betreiber ist, schreibt nicht.
 * `actor` fällt dort auf `as` zurück.
 */

const loadRsvp = () => import('../server/api/events/[id]/rsvp.post')
const WRITES = new Set(['create', 'update', 'remove', 'increment', 'decrement'])

function suspendedDoor(base: FakeDoor): FakeDoor {
  const tenantDb = (event: H3Event, options?: { as?: 'member' | 'operator', actor?: string }) => {
    const handle = base.tenantDb(event, options) as Record<string, (...args: unknown[]) => Promise<unknown>>
    const actor = options?.actor ?? options?.as ?? 'member'
    if (actor === 'operator') return handle
    return Object.fromEntries(Object.entries(handle).map(([name, fn]) => [name, WRITES.has(name)
      ? async () => {
        throw Object.assign(new Error('Community is read-only'), {
          status: 403, statusCode: 403, statusText: 'Community is read-only', data: { code: 'community_suspended' },
        })
      }
      : fn]))
  }
  return { ...base, tenantDb } as FakeDoor
}

const eventRow = (): FakeRow => ({
  $id: 'e-1', communityId: 'c-a', title: 'Treffen', status: 'published',
  capacity: null, attendeeCount: 1, organizerId: 'u-org', access: 'free',
})

function setup(rsvps: FakeRow[]) {
  const base = fakeDoor({ rows: { [EVENTS_TABLE]: [eventRow()], [EVENT_RSVPS_TABLE]: rsvps } })
  return { base, door: suspendedDoor(base) }
}

const globals = { assertCanRsvpGoing: async () => {} }

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

describe('POST /api/events/:id/rsvp — gesperrte Community', () => {
  it('ein Mitglied zieht seine Zusage zurück: 200, Zusage weg, Zähler zurück', async () => {
    // Das Mitglied des Prüfstands heißt `u-member` (participationHarness).
    const { base, door } = setup([{ $id: 'r-1', eventId: 'e-1', userId: 'u-member', status: 'going', communityId: 'c-a' }])

    const run = await runDoorRoute(loadRsvp, { door, suspended: true, params: { id: 'e-1' }, body: { status: 'going' }, globals })

    expect(run.status).toBe(200)
    expect(run.body).toMatchObject({ myRsvp: null, event: { attendeeCount: 0 } })
    expect(base.rows[EVENT_RSVPS_TABLE]).toHaveLength(0)
  })

  it('ein Mitglied sagt neu zu: 403 community_suspended, nichts geschrieben', async () => {
    const { base, door } = setup([])

    const run = await runDoorRoute(loadRsvp, { door, suspended: true, params: { id: 'e-1' }, body: { status: 'going' }, globals })

    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('community_suspended')
    expect(base.rows[EVENT_RSVPS_TABLE]).toHaveLength(0)
    expect(base.rows[EVENTS_TABLE]![0]!.attendeeCount).toBe(1)
  })

  it('ein Wechsel going → declined ist eine neue Aussage: 403, die Zusage bleibt', async () => {
    const { base, door } = setup([{ $id: 'r-1', eventId: 'e-1', userId: 'u-member', status: 'going', communityId: 'c-a' }])

    const run = await runDoorRoute(loadRsvp, { door, suspended: true, params: { id: 'e-1' }, body: { status: 'declined' }, globals })

    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('community_suspended')
    expect(base.rows[EVENT_RSVPS_TABLE]![0]!.status).toBe('going')
  })
})
