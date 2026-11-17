import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeDoor, type FakeRow, fakeDoor, runDoorRoute } from '../../core/tests/support/doorFake'
import { recountAttendeeCount } from '../server/utils/attendeeRecount'
import { EVENT_RSVPS_TABLE, EVENTS_TABLE } from '../shared/types/event'

/**
 * BE-018 — scheitert das Zurückrollen des Zählers, zählt die Route nach.
 *
 * Die Zusage ist gescheitert, der Zähler war schon hochgezählt, und das
 * Zurückrollen scheitert auch: bis dahin verschluckte die Route den Fehler
 * (`.catch(() => {})`), und `attendeeCount` stand dauerhaft um eins zu hoch.
 * Jetzt: Fehler im Log, Zähler aus den `going`-Zusagen neu gesetzt, die Route
 * antwortet weiter mit dem ursprünglichen Fehler.
 */

const loadRsvp = () => import('../server/api/events/[id]/rsvp.post')

function eventRow(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    $id: 'e-1', communityId: 'c-a', title: 'Treffen', status: 'published',
    capacity: null, attendeeCount: 2, organizerId: 'u-org', access: 'free', ...overrides,
  }
}

const rsvp = (id: string, userId: string, status: string, eventId = 'e-1'): FakeRow =>
  ({ $id: id, eventId, userId, status, communityId: 'c-a' })

/** Tür, an der `create` (Zusagen) und `decrement` (Zähler) scheitern. */
function failingDoor(base: FakeDoor): FakeDoor {
  const tenantDb = (event: H3Event, options?: { as?: 'member' | 'operator', actor?: string }) => {
    const handle = base.tenantDb(event, options)
    return {
      ...handle,
      async create(table: string, data: Record<string, unknown>) {
        if (table === EVENT_RSVPS_TABLE) throw Object.assign(new Error('appwrite down'), { code: 500 })
        return (handle.create as (t: string, d: Record<string, unknown>) => Promise<unknown>)(table, data)
      },
      async decrement() {
        throw Object.assign(new Error('appwrite down'), { code: 500 })
      },
    }
  }
  return { ...base, tenantDb } as FakeDoor
}

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

describe('POST /api/events/:id/rsvp — Zurückrollen scheitert', () => {
  it('Zähler wird aus den going-Zusagen nachgezählt, Fehler im Log, Route bleibt beim Fehler', async () => {
    const base = fakeDoor({
      rows: {
        [EVENTS_TABLE]: [eventRow()],
        [EVENT_RSVPS_TABLE]: [
          rsvp('r-1', 'u-a', 'going'),
          rsvp('r-2', 'u-b', 'going'),
          rsvp('r-3', 'u-c', 'maybe'),
          rsvp('r-4', 'u-d', 'going', 'e-other'),
        ],
      },
    })
    const door = failingDoor(base)
    const logEvent = vi.fn()

    const run = await runDoorRoute(loadRsvp, {
      door, params: { id: 'e-1' }, body: { status: 'going' },
      globals: { assertCanRsvpGoing: async () => {}, logEvent, recountAttendeeCount },
    })

    expect(run.status).toBe(500)
    expect(run.error).toMatchObject({ message: 'appwrite down' })
    // increment hat 2 → 3 gezählt, decrement scheiterte; nachgezählt: 2
    expect(base.rows[EVENTS_TABLE]![0]!.attendeeCount).toBe(2)
    expect(logEvent).toHaveBeenCalledWith('error', 'events.rsvp_rollback_failed', { eventId: 'e-1' })
  })
})

describe('recountAttendeeCount', () => {
  it('setzt attendeeCount auf die Zahl der going-Zusagen dieses Termins', async () => {
    const base = fakeDoor({
      rows: {
        [EVENTS_TABLE]: [eventRow({ attendeeCount: 7 })],
        [EVENT_RSVPS_TABLE]: [rsvp('r-1', 'u-a', 'going'), rsvp('r-2', 'u-b', 'declined'), rsvp('r-3', 'u-c', 'going', 'e-x')],
      },
    })
    vi.stubGlobal('tenantDb', base.tenantDb)
    vi.stubGlobal('logEvent', vi.fn())

    await recountAttendeeCount({} as H3Event, 'e-1')

    expect(base.rows[EVENTS_TABLE]![0]!.attendeeCount).toBe(1)
    expect(base.calls.every(c => c.handle === 'operator')).toBe(true)
  })

  it('ist best-effort: ein Fehler wird geloggt, nicht geworfen', async () => {
    const logEvent = vi.fn()
    vi.stubGlobal('tenantDb', () => ({
      count: async () => { throw new Error('down') },
      update: async () => ({}),
    }))
    vi.stubGlobal('logEvent', logEvent)

    await expect(recountAttendeeCount({} as H3Event, 'e-1')).resolves.toBeUndefined()
    expect(logEvent).toHaveBeenCalledWith('error', 'events.attendee_recount_failed', { eventId: 'e-1' })
  })
})
