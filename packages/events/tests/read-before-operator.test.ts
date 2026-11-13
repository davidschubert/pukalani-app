import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeRow, fakeDoor, firstOperatorCall, runDoorRoute } from '../../core/tests/support/doorFake'
import { toVoteCounts } from '../../core/shared/voteCounts'
import { toEventRsvpCounts } from '../shared/eventCounts'
import { EVENT_RSVPS_TABLE, EVENT_VOTES_TABLE, EVENTS_TABLE } from '../shared/types/event'

/**
 * SEC-031 — Zusage und Like auf einen Termin geben nichts heraus, was das
 * Konto nicht lesen darf. Beide Routen schreiben über die Operator-Klinke
 * (Zusagen, Zähler); vorher liest die Mitglieder-Klinke den Termin, und wer
 * ihn nicht lesen darf (Entwurf, ausgeblendet), bekommt dasselbe 404 wie für
 * eine erfundene Id. Die Antwort trägt nur Zähler und eigenen Zustand — nie
 * Beschreibung, Link, Ort oder Adresse. Damit zeigt sie auch nie MEHR als die
 * Leseroute demselben Konto.
 */

const loadRsvp = () => import('../server/api/events/[id]/rsvp.post')
const loadScore = () => import('../server/api/events/[id]/score.post')

function eventRow(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    $id: 'e-1',
    communityId: 'c-a',
    title: 'Treffen',
    description: 'Geheime Beschreibung',
    startAt: '2030-01-01T10:00:00.000Z',
    endAt: null,
    location: 'Geheimer Ort',
    address: 'Geheime Straße 1',
    locationHints: 'Klingel 3',
    url: 'https://meet.example/geheim',
    capacity: null,
    attendeeCount: 0,
    status: 'published',
    organizerId: 'u-org',
    access: 'free',
    upvotes: 0,
    downvotes: 0,
    score: 0,
    ...overrides,
  }
}

const draftsHidden = (table: string, row: FakeRow) => !(table === EVENTS_TABLE && row.status === 'draft')
const rsvpGlobals = { assertCanRsvpGoing: async () => {} }
const SECRETS = ['Geheime', 'Geheimer', 'Klingel', 'meet.example']

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

describe('POST /api/events/:id/rsvp — Lesen vor dem Operator', () => {
  it('nicht lesbarer Termin: 404 wie „nicht gefunden", kein Operator-Zugriff, keine Zusage', async () => {
    const door = fakeDoor({ rows: { [EVENTS_TABLE]: [eventRow({ status: 'draft' })] }, readable: draftsHidden })
    const run = await runDoorRoute(loadRsvp, { door, params: { id: 'e-1' }, body: { status: 'going' }, globals: rsvpGlobals })

    expect(run.status).toBe(404)
    expect(run.error?.statusText).toBe('Event not found')
    expect(firstOperatorCall(door.calls)).toBe(-1)
    expect(door.rows[EVENT_RSVPS_TABLE] ?? []).toHaveLength(0)
    expect(door.rows[EVENTS_TABLE]![0]!.attendeeCount).toBe(0)
  })

  it('lesbarer Termin: Mitglieder-Klinke zuerst, Antwort nur Zähler + eigene Zusage', async () => {
    const door = fakeDoor({ rows: { [EVENTS_TABLE]: [eventRow()] } })
    const run = await runDoorRoute(loadRsvp, { door, params: { id: 'e-1' }, body: { status: 'going' }, globals: rsvpGlobals })

    expect(run.status).toBe(200)
    expect(door.calls[0]).toEqual({ handle: 'member', method: 'get', table: EVENTS_TABLE, id: 'e-1' })
    expect(run.body).toEqual({ event: { $id: 'e-1', attendeeCount: 1 }, myRsvp: 'going' })
    for (const secret of SECRETS) expect(JSON.stringify(run.body)).not.toContain(secret)
  })
})

describe('POST /api/events/:id/score — Lesen vor dem Operator', () => {
  it('nicht lesbarer Termin: 404, kein Operator-Zugriff, keine Stimme', async () => {
    const door = fakeDoor({ rows: { [EVENTS_TABLE]: [eventRow({ status: 'draft' })] }, readable: draftsHidden })
    const run = await runDoorRoute(loadScore, { door, params: { id: 'e-1' }, body: { value: 1 } })

    expect(run.status).toBe(404)
    expect(run.error?.statusText).toBe('Event not found')
    expect(firstOperatorCall(door.calls)).toBe(-1)
    expect(door.rows[EVENT_VOTES_TABLE] ?? []).toHaveLength(0)
  })

  it('lesbarer Termin: Mitglieder-Klinke zuerst, Antwort nur Zähler + eigene Stimme', async () => {
    const door = fakeDoor({ rows: { [EVENTS_TABLE]: [eventRow()] } })
    const run = await runDoorRoute(loadScore, { door, params: { id: 'e-1' }, body: { value: 1 } })

    expect(run.status).toBe(200)
    expect(door.calls[0]).toEqual({ handle: 'member', method: 'get', table: EVENTS_TABLE, id: 'e-1' })
    expect(firstOperatorCall(door.calls)).toBeGreaterThan(0)
    expect(run.body).toEqual({ event: { $id: 'e-1', upvotes: 1, downvotes: 0, score: 1 }, myVote: 1 })
    for (const secret of SECRETS) expect(JSON.stringify(run.body)).not.toContain(secret)
  })
})

describe('Feldauswahl der Antworten', () => {
  it('Like: nur Id und Zähler', () => {
    expect(toVoteCounts(eventRow({ upvotes: 2, downvotes: 1, score: 1 }) as never))
      .toEqual({ $id: 'e-1', upvotes: 2, downvotes: 1, score: 1 })
  })

  it('Zusage: nur Id und Teilnehmerzahl', () => {
    expect(toEventRsvpCounts(eventRow({ attendeeCount: 4 }) as never)).toEqual({ $id: 'e-1', attendeeCount: 4 })
  })
})
