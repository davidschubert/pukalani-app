import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeRow, fakeDoor, runDoorRoute } from '../../core/tests/support/doorFake'
import { rescheduleClearsReminder } from '../shared/eventReschedule'
import { EVENTS_TABLE } from '../shared/types/event'

/**
 * ZWEI REGELN AN DEN TERMIN-ROUTEN (KK1, 2026-11-17).
 *
 *  1. VERSCHOBEN NACH DER ERINNERUNG ⇒ der Merker fällt, der nächste Takt
 *     erinnert mit der neuen Uhrzeit (Davids Entscheidung 2026-11-17). Dass
 *     der Lauf einen Termin ohne Merker aufgreift und je Beginn genau einmal
 *     erinnert, belegt `event-reminders-sweep.test.ts`.
 *  2. „BEZAHLT" NUR, WO VERKAUFT WIRD — bisher entschied das allein das
 *     Formular; jetzt lehnt auch der Server ab (422 `event_paid_unavailable`).
 *
 * Gefahren werden die echten Handler gegen die nachgebaute Datentür.
 */

const START = '2030-01-01T10:00:00.000Z'
const SENT = '2029-12-31T10:00:00.000Z'

function eventRow(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    $id: 'e-1', $permissions: ['read("any")'], communityId: 'c-a', title: 'Treffen', description: 'Beschreibung',
    startAt: START, endAt: null, location: null, url: null, capacity: null, attendeeCount: 0, status: 'published',
    organizerId: 'u-org', access: 'free', priceAmount: null, priceLookupKey: null, seriesId: null, recurrence: null,
    replayUrl: null, redactedAt: null, remindersSentAt: null, ...overrides,
  }
}

const SELLING = () => ({ pukalani: { events: { ticketCheckoutPath: '/api/events/{id}/checkout' } } })
const NOT_SELLING = () => ({ pukalani: { events: { ticketCheckoutPath: '' } } })

function globals(useAppConfig: () => unknown = NOT_SELLING) {
  return {
    requireCommunityPermission: async () => ({ user: { $id: 'u-editor', name: 'Redaktion' }, actor: 'member' }),
    useAppConfig,
    recordActivity: vi.fn(async () => {}),
    setResponseStatus: () => {},
  }
}

const loadPatch = () => import('../server/api/events/[id].patch')
const loadCreate = () => import('../server/api/events/index.post')

async function patch(row: FakeRow, body: Record<string, unknown>, useAppConfig?: () => unknown) {
  const door = fakeDoor({ rows: { [EVENTS_TABLE]: [row] } })
  const run = await runDoorRoute(loadPatch, { door, params: { id: 'e-1' }, body, globals: globals(useAppConfig) })
  return { run, stored: door.rows[EVENTS_TABLE]![0]! }
}

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

describe('rescheduleClearsReminder — die pure Regel', () => {
  it('neuer Beginn nach einer Erinnerung ⇒ ja', () => {
    expect(rescheduleClearsReminder({ previousStartAt: START, nextStartAt: '2030-01-01T12:00:00.000Z', remindersSentAt: SENT })).toBe(true)
  })

  it('derselbe Zeitpunkt in anderer Schreibweise ist keine Verschiebung', () => {
    expect(rescheduleClearsReminder({ previousStartAt: START, nextStartAt: '2030-01-01T11:00:00.000+01:00', remindersSentAt: SENT })).toBe(false)
  })

  it('noch nicht erinnert, Beginn nicht in der Änderung, unlesbarer Wert ⇒ nein', () => {
    expect(rescheduleClearsReminder({ previousStartAt: START, nextStartAt: '2030-01-01T12:00:00.000Z', remindersSentAt: null })).toBe(false)
    expect(rescheduleClearsReminder({ previousStartAt: START, nextStartAt: undefined, remindersSentAt: SENT })).toBe(false)
    expect(rescheduleClearsReminder({ previousStartAt: START, nextStartAt: 'morgen', remindersSentAt: SENT })).toBe(false)
  })
})

describe('PATCH /api/events/:id — verschieben nach der Erinnerung', () => {
  it('neuer Beginn: der Merker fällt, der Lauf erinnert neu', async () => {
    const { run, stored } = await patch(eventRow({ remindersSentAt: SENT }), { startAt: '2030-01-02T10:00:00.000Z' })
    expect(run.status).toBe(200)
    expect(stored.startAt).toBe('2030-01-02T10:00:00.000Z')
    expect(stored.remindersSentAt).toBeNull()
  })

  it('Gegenprobe: das Formular schickt den alten Beginn mit — der Merker bleibt', async () => {
    const { run, stored } = await patch(eventRow({ remindersSentAt: SENT }), { startAt: START, location: 'Neuer Raum' })
    expect(run.status).toBe(200)
    expect(stored.location).toBe('Neuer Raum')
    expect(stored.remindersSentAt).toBe(SENT)
  })

  it('Gegenprobe: nur der Titel ändert sich — der Merker bleibt', async () => {
    const { stored } = await patch(eventRow({ remindersSentAt: SENT }), { title: 'Neuer Titel' })
    expect(stored.remindersSentAt).toBe(SENT)
  })
})

describe('„Bezahlt" prüft auch der Server', () => {
  const paid = { access: 'paid', priceLookupKey: 'ticket_x', priceAmount: 500 }

  it('PATCH auf bezahlt, Instanz verkauft nicht: 422 event_paid_unavailable, nichts geschrieben', async () => {
    const { run, stored } = await patch(eventRow(), paid, NOT_SELLING)
    expect(run.status).toBe(422)
    expect(run.error?.data?.code).toBe('event_paid_unavailable')
    expect(stored.access).toBe('free')
  })

  it('Gegenprobe: dieselbe Änderung auf einer Instanz mit Checkout geht durch', async () => {
    const { run, stored } = await patch(eventRow(), paid, SELLING)
    expect(run.status).toBe(200)
    expect(stored.access).toBe('paid')
  })

  it('Bestand schlägt die Sperre: ein schon bezahlter Termin bleibt speicherbar', async () => {
    const { run, stored } = await patch(eventRow(paid), { title: 'Korrigierter Titel' }, NOT_SELLING)
    expect(run.status).toBe(200)
    expect(stored).toMatchObject({ title: 'Korrigierter Titel', access: 'paid' })
  })

  it('Anlegen als bezahlt, Instanz verkauft nicht: 422, es entsteht kein Termin', async () => {
    const door = fakeDoor({ rows: { [EVENTS_TABLE]: [] } })
    const body = { title: 'Workshop', description: 'Text', startAt: START, ...paid }
    const run = await runDoorRoute(loadCreate, { door, body, globals: globals(NOT_SELLING) })
    expect(run.status).toBe(422)
    expect(run.error?.data?.code).toBe('event_paid_unavailable')
    expect(door.rows[EVENTS_TABLE]).toEqual([])
  })

  it('Gegenprobe: ein kostenloser Termin entsteht auch dort', async () => {
    const door = fakeDoor({ rows: { [EVENTS_TABLE]: [] } })
    const body = { title: 'Treffen', description: 'Text', startAt: START, access: 'free' }
    const run = await runDoorRoute(loadCreate, { door, body, globals: globals(NOT_SELLING) })
    expect(run.status).toBeLessThan(300)
    expect(door.rows[EVENTS_TABLE]).toHaveLength(1)
  })
})
