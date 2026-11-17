import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeDoor, firstOperatorCall, type FakeDoor, type FakeRow } from '../../core/tests/support/doorFake'
import { probeRoute, resetCommunityWorld, userIdOf } from '../../core/tests/support/participationHarness'
import { serializeUgcTranslations } from '../../core/shared/ugcTranslations'
import { buildEventIcs } from '../server/utils/ics'
import { getPubliclyVisibleEvent } from '../server/utils/visibleEvent'
import { attendeeAvatarsFor, attendeesFor, myRsvpsFor, myVotesFor } from '../server/utils/eventsShared'
import { EVENT_RSVPS_TABLE, EVENT_VOTES_TABLE, EVENTS_TABLE } from '../shared/types/event'

/**
 * ROLLEN-PROBEN FÜR TERMINE — LESEN, ERINNERUNGS-LAUF, ÜBERSETZEN (P27, OPS-009).
 *
 * Echte Handler, echte Core-Wachen (Prüfstand
 * `core/tests/support/participationHarness.ts`), dahinter eine nachgebaute
 * Datentür (`doorFake.ts`) mit Leserecht je Zeile.
 *
 * Die Zusagen der lesenden Routen:
 *  - Gäste werden bedient (kein 401), die SICHTBARKEIT entscheidet das
 *    Leserecht der Zeile: der Termin wird über die MITGLIEDER-Klinke gelesen.
 *  - Persönliche Zusätze (eigene Zusage, eigene Stimme, Teilnehmende) gibt es
 *    nur angemeldet. Sie liest die Route — begründet im Quelltext
 *    (`server/utils/eventsShared.ts`) — über die Operator-Klinke, weil
 *    `event_rsvps`/`event_votes` keine breite Leseberechtigung tragen; die
 *    Zusage dort ist: gefiltert auf das EIGENE Konto, und erst NACH dem Termin.
 *
 * Die eigenen Zusätze laufen hier über die ECHTEN Hilfen aus `eventsShared.ts`
 * (als Globals eingehängt). Nachgebildet wird nur Technik: Avatare, Wartung im
 * Hintergrund (Erinnerungen, Serien), Zähler, KI-Aufruf.
 */

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

function eventRow(id: string, status: string, extra: Partial<FakeRow> = {}): FakeRow {
  return {
    $id: id,
    $updatedAt: '2026-11-01T00:00:00.000Z',
    title: 'Treffen',
    description: 'Wir treffen uns.',
    startAt: '2026-12-01T18:00:00.000Z',
    endAt: null,
    location: null,
    url: null,
    status,
    organizerId: 'u-organizer',
    redactedAt: null,
    translations: '',
    ...extra,
  }
}

/** Entwürfe tragen kein Leserecht — für die Mitglieder-Klinke unsichtbar. */
const onlyPublished = (table: string, row: FakeRow) => table !== EVENTS_TABLE || row.status === 'published'

/** Ein veröffentlichter Termin `e-1`, ein Entwurf `e-2`, Zusagen und Stimmen zweier Konten. */
function eventsDoor(): FakeDoor {
  return fakeDoor({
    rows: {
      [EVENTS_TABLE]: [eventRow('e-1', 'published'), eventRow('e-2', 'draft')],
      [EVENT_RSVPS_TABLE]: [
        { $id: 'r-own', eventId: 'e-1', userId: userIdOf('member'), status: 'maybe' },
        { $id: 'r-other', eventId: 'e-1', userId: 'u-other', status: 'declined' },
      ],
      [EVENT_VOTES_TABLE]: [
        { $id: 'v-own', eventId: 'e-1', userId: userIdOf('member'), value: 1 },
        { $id: 'v-other', eventId: 'e-1', userId: 'u-other', value: -1 },
      ],
    },
    readable: onlyPublished,
  })
}

/** Die echten Hilfen für eigene Zusätze — plus Technik, die nichts entscheidet. */
const READ_GLOBALS = {
  getPubliclyVisibleEvent,
  myRsvpsFor,
  myVotesFor,
  attendeesFor,
  attendeeAvatarsFor,
  resolveAvatars: async () => new Map<string, string | null>(),
  // Wartung im Hintergrund (best-effort, eigene Tests in event-recurrence) —
  // nicht Gegenstand dieser Probe.
  topUpSeries: async () => {},
}

/**
 * Lädt den Handler erst INNERHALB der Probe (dann stehen die Globals schon)
 * und hält seine Antwort fest.
 */
function capturing<T>(load: () => Promise<{ default: unknown }>) {
  const seen: { body?: T } = {}
  const wrapped = async () => ({
    default: async (e: unknown) => {
      const handler = (await load()).default as (event: unknown) => Promise<T>
      seen.body = await handler(e)
      return seen.body
    },
  })
  return { load: wrapped, seen }
}

interface DetailBody {
  $id: string
  myRsvp: string | null
  myVote: number | null
  attendees: unknown[]
}

// ── GET /api/events/:id ─────────────────────────────────────────────────────

describe('GET /api/events/:id (lesen)', () => {
  const load = () => import('../server/api/events/[id].get')

  it('Gast: kein 401, gelesen wird nur über die Mitglieder-Klinke, keine persönlichen Zusätze', async () => {
    const door = eventsDoor()
    const run = await probeRoute(load, { who: 'guest', params: { id: 'e-1' }, door: door.tenantDb, globals: READ_GLOBALS })
    expect(run.status).toBe(200)
    expect(door.calls.length).toBeGreaterThan(0)
    expect(door.calls.every(call => call.handle === 'member')).toBe(true)
  })

  it('Gast, Entwurf ohne Leserecht: 404, keine Operator-Klinke', async () => {
    const door = eventsDoor()
    const run = await probeRoute(load, { who: 'guest', params: { id: 'e-2' }, door: door.tenantDb, globals: READ_GLOBALS })
    expect(run.status).toBe(404)
    expect(firstOperatorCall(door.calls)).toBe(-1)
  })

  it('Mitglied, Entwurf ohne Leserecht: 404, keine Operator-Klinke', async () => {
    const door = eventsDoor()
    const run = await probeRoute(load, { who: 'member', params: { id: 'e-2' }, door: door.tenantDb, globals: READ_GLOBALS })
    expect(run.status).toBe(404)
    expect(firstOperatorCall(door.calls)).toBe(-1)
  })

  it('Mitglied: erst der Termin über die Mitglieder-Klinke, danach nur eigene Zusätze', async () => {
    const door = eventsDoor()
    const probe = capturing<DetailBody>(load)
    const run = await probeRoute(probe.load, { who: 'member', params: { id: 'e-1' }, door: door.tenantDb, globals: READ_GLOBALS })
    const body = probe.seen.body
    expect(run.status).toBe(200)
    expect(door.calls[0]).toMatchObject({ handle: 'member', method: 'get', table: EVENTS_TABLE })
    const operatorTables = door.calls.filter(call => call.handle === 'operator').map(call => call.table)
    expect(operatorTables.every(table => table === EVENT_RSVPS_TABLE || table === EVENT_VOTES_TABLE)).toBe(true)
    expect(body?.myRsvp).toBe('maybe')
    expect(body?.myVote).toBe(1)
  })
})

// ── GET /api/events ─────────────────────────────────────────────────────────

describe('GET /api/events (Liste)', () => {
  const load = () => import('../server/api/events/index.get')

  async function listAs(who: 'guest' | 'member', query: Record<string, string> = {}) {
    const door = eventsDoor()
    const probe = capturing<{ rows: Array<{ $id: string, myRsvp: string | null }> }>(load)
    const run = await probeRoute(probe.load, { who, query, door: door.tenantDb, globals: READ_GLOBALS })
    return { run, door, body: probe.seen.body }
  }

  it('Gast: kein 401, nur veröffentlichte Termine, nur Mitglieder-Klinke, keine eigene Zusage', async () => {
    const { run, door, body } = await listAs('guest')
    expect(run.status).toBe(200)
    expect(door.calls.every(call => call.handle === 'member')).toBe(true)
    expect(body?.rows.map(row => row.$id)).toEqual(['e-1'])
    expect(body?.rows[0]?.myRsvp).toBeNull()
  })

  it('Mitglied: die Liste über die Mitglieder-Klinke, die eigene Zusage dazu', async () => {
    const { run, door, body } = await listAs('member')
    expect(run.status).toBe(200)
    expect(door.calls[0]).toMatchObject({ handle: 'member', method: 'list', table: EVENTS_TABLE })
    expect(body?.rows.map(row => row.$id)).toEqual(['e-1'])
    expect(body?.rows[0]?.myRsvp).toBe('maybe')
  })

  it('„Meine Termine" ohne Konto: 401, Datentür zu', async () => {
    const { run, door } = await listAs('guest', { mine: 'liked' })
    expect(run.status).toBe(401)
    expect(door.calls).toEqual([])
  })

  it('„Meine Termine": nur Termine mit EIGENER Stimme, die Termine selbst über die Mitglieder-Klinke', async () => {
    const { run, door, body } = await listAs('member', { mine: 'liked' })
    expect(run.status).toBe(200)
    expect(body?.rows.map(row => row.$id)).toEqual(['e-1'])
    const eventReads = door.calls.filter(call => call.table === EVENTS_TABLE)
    expect(eventReads.every(call => call.handle === 'member')).toBe(true)
  })
})

// ── GET /api/events/:id/ics ─────────────────────────────────────────────────

describe('GET /api/events/:id/ics (Kalender-Datei)', () => {
  const load = () => import('../server/api/events/[id]/ics.get')

  it('Gast: kein 401, gelesen wird nur über die Mitglieder-Klinke', async () => {
    const door = eventsDoor()
    const run = await probeRoute(load, { who: 'guest', params: { id: 'e-1' }, door: door.tenantDb, globals: { buildEventIcs, getPubliclyVisibleEvent } })
    expect(run.status).toBe(200)
    expect(door.calls).toEqual([{ handle: 'member', method: 'get', table: EVENTS_TABLE, id: 'e-1' }])
  })

  for (const who of ['guest', 'member'] as const) {
    it(`${who}, Entwurf ohne Leserecht: 404`, async () => {
      const door = eventsDoor()
      const run = await probeRoute(load, { who, params: { id: 'e-2' }, door: door.tenantDb, globals: { buildEventIcs, getPubliclyVisibleEvent } })
      expect(run.status).toBe(404)
      expect(firstOperatorCall(door.calls)).toBe(-1)
    })
  }
})

// ── POST /api/events/:id/translate ──────────────────────────────────────────

describe('POST /api/events/:id/translate (nur Mitglieder, MM1)', () => {
  const load = () => import('../server/api/events/[id]/translate.post')

  function translateGlobals() {
    const ai = { count: 0 }
    const globals = {
      getPubliclyVisibleEvent,
      getEffectiveAiConfig: async () => ({ model: 'probe-model' }),
      aiCompleteJson: async () => {
        ai.count += 1
        return { title: 'Meeting', body: 'We meet.' }
      },
    }
    return { ai, globals }
  }

  function translateDoor(row: FakeRow): FakeDoor {
    return fakeDoor({ rows: { [EVENTS_TABLE]: [row] }, readable: onlyPublished })
  }

  it('ohne Konto: 401, Datentür zu', async () => {
    const { globals } = translateGlobals()
    const run = await probeRoute(load, { who: 'guest', params: { id: 'e-1' }, body: { locale: 'en' }, globals })
    expect(run.status).toBe(401)
    expect(run.doorOpened).toBe(false)
  })

  it('Mitglied, Entwurf ohne Leserecht: 404, kein KI-Aufruf, kein Schreiben', async () => {
    const { ai, globals } = translateGlobals()
    const door = translateDoor(eventRow('e-1', 'draft'))
    const run = await probeRoute(load, { who: 'member', params: { id: 'e-1' }, body: { locale: 'en' }, door: door.tenantDb, globals })
    expect(run.status).toBe(404)
    expect(ai.count).toBe(0)
    expect(firstOperatorCall(door.calls)).toBe(-1)
  })

  for (const who of ['stranger', 'removed'] as const) {
    it(`${who}, veröffentlichter Termin: 403 not_a_member, Datentür zu, kein KI-Aufruf`, async () => {
      const { ai, globals } = translateGlobals()
      const door = translateDoor(eventRow('e-1', 'published'))
      const run = await probeRoute(load, { who, params: { id: 'e-1' }, body: { locale: 'en' }, door: door.tenantDb, globals })
      expect(run.status).toBe(403)
      expect(run.error?.data?.code).toBe('not_a_member')
      expect(door.calls).toEqual([])
      expect(ai.count).toBe(0)
    })
  }

  it('Mitglied: gelesen wird zuerst über die Mitglieder-Klinke, geschrieben nur der Cache', async () => {
    const { ai, globals } = translateGlobals()
    const door = translateDoor(eventRow('e-1', 'published'))
    const run = await probeRoute(load, { who: 'member', params: { id: 'e-1' }, body: { locale: 'en' }, door: door.tenantDb, globals })
    expect(run.status).toBe(200)
    expect(ai.count).toBe(1)
    expect(door.calls[0]).toMatchObject({ handle: 'member', method: 'get', table: EVENTS_TABLE })
    const operatorCalls = door.calls.filter(call => call.handle === 'operator')
    expect(operatorCalls).toEqual([{ handle: 'operator', method: 'update', table: EVENTS_TABLE, id: 'e-1' }])
    expect(door.rows[EVENTS_TABLE]?.[0]?.title).toBe('Treffen')
  })

  it('Mitglied, schon übersetzt: Cache-Treffer ohne KI-Aufruf und ohne Operator-Klinke', async () => {
    const { ai, globals } = translateGlobals()
    const cached = serializeUgcTranslations({ en: { title: 'Meeting', body: 'We meet.' } })
    const door = translateDoor(eventRow('e-1', 'published', { translations: cached }))
    const run = await probeRoute(load, { who: 'member', params: { id: 'e-1' }, body: { locale: 'en' }, door: door.tenantDb, globals })
    expect(run.status).toBe(200)
    expect(ai.count).toBe(0)
    expect(firstOperatorCall(door.calls)).toBe(-1)
  })

  it('fremdes Konto, offene Registrierung: 403 — Übersetzen macht niemanden zum Mitglied', async () => {
    const { ai, globals } = translateGlobals()
    const door = translateDoor(eventRow('e-1', 'published'))
    const run = await probeRoute(load, {
      who: 'stranger', registration: 'open', params: { id: 'e-1' }, body: { locale: 'en' }, door: door.tenantDb, globals,
    })
    expect(run.status).toBe(403)
    expect(run.joinHandlerCalls).toBe(0)
    expect(ai.count).toBe(0)
  })
})
