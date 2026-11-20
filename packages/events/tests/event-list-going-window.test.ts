import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { probeRoute, resetCommunityWorld, userIdOf } from '../../core/tests/support/participationHarness'
import { attendeeAvatarsFor, myRsvpsFor, myVotesFor } from '../server/utils/eventsShared'
import { EVENT_RSVPS_TABLE, EVENT_VOTES_TABLE, EVENTS_TABLE } from '../shared/types/event'

/**
 * GET /api/events — „WOCHENENDE" UND „ZUGESAGT" ZUSAMMEN (Issue 417).
 *
 * Echter Handler, echte Wachen (Prüfstand `participationHarness.ts`). Dahinter
 * eine kleine nachgebaute Datentür, die — anders als `doorFake.ts` — auch
 * Zeitgrenzen, Sortierung, Kappung und den Cursor rechnet: genau darum geht es
 * hier. Sie steht bewusst in dieser Datei: würde `doorFake.ts` plötzlich
 * `startAt` gegen die echte Uhr prüfen, kippten fremde Proben mit festen Daten.
 *
 * Die Uhr ist gestellt: Sonntag, 22. November 2026, 12:00 UTC. Das Fenster
 * schickt der Browser; hier ist es der ganze Sonntag in UTC.
 */

const NOW = '2026-11-22T12:00:00.000Z'
const SUNDAY = { from: '2026-11-22T00:00:00.000Z', to: '2026-11-23T00:00:00.000Z' }

type Row = Record<string, unknown> & { $id: string }
interface Call { handle: 'member' | 'operator', table: string, queries: ParsedQuery[] }
interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

function applyQueries(rows: Row[], queries: ParsedQuery[]): Row[] {
  let out = rows.filter(row => queries.every((query) => {
    const value = row[query.attribute ?? '']
    const first = query.values?.[0]
    switch (query.method) {
      case 'equal': return (query.values ?? []).includes(value)
      case 'greaterThanEqual': return String(value) >= String(first)
      case 'lessThan': return String(value) < String(first)
      case 'search': return String(value).toLowerCase().includes(String(first).toLowerCase())
      default: return true
    }
  }))
  const order = queries.find(query => query.method === 'orderAsc')
  if (order?.attribute) {
    const key = order.attribute
    out = [...out].sort((a, b) => String(a[key]).localeCompare(String(b[key])))
  }
  const cursor = queries.find(query => query.method === 'cursorAfter')?.values?.[0]
  if (cursor) out = out.slice(out.findIndex(row => row.$id === cursor) + 1)
  const limit = queries.find(query => query.method === 'limit')?.values?.[0]
  return typeof limit === 'number' ? out.slice(0, limit) : out
}

function windowDoor(tables: Record<string, Row[]>) {
  const calls: Call[] = []
  const tenantDb = (_event: unknown, options?: { as?: 'member' | 'operator' }) => {
    const handle = options?.as === 'operator' ? 'operator' : 'member'
    return {
      async list(table: string, raw: string[] = []) {
        const queries = raw.map(entry => JSON.parse(entry) as ParsedQuery)
        calls.push({ handle, table, queries })
        // Die Mitglieder-Klinke sieht nur, was ein Leserecht trägt (`readable`).
        const visible = (tables[table] ?? []).filter(row => handle === 'operator' || row.readable !== false)
        return { rows: applyQueries(visible, queries).map(row => ({ ...row })) }
      },
    }
  }
  return { calls, tenantDb }
}

const event = (id: string, startAt: string, extra: Partial<Row> = {}): Row =>
  ({ $id: id, title: 'Treffen', status: 'published', startAt, ...extra })
const going = (eventId: string, userId: string, status = 'going'): Row =>
  ({ $id: `r-${eventId}-${userId}`, eventId, userId, status })

const ME = userIdOf('member')

function world(): Record<string, Row[]> {
  return {
    [EVENTS_TABLE]: [
      event('sun-late', '2026-11-22T18:00:00.000Z'),
      event('sun-evening', '2026-11-22T15:00:00.000Z', { title: 'Brunch am Abend' }),
      event('sun-morning', '2026-11-22T09:00:00.000Z'),
      event('sun-not-mine', '2026-11-22T16:00:00.000Z'),
      event('sun-maybe', '2026-11-22T17:00:00.000Z'),
      event('sun-other', '2026-11-22T19:00:00.000Z'),
      event('sun-draft', '2026-11-22T20:00:00.000Z', { status: 'draft', readable: false }),
      event('sun-cancelled', '2026-11-22T20:30:00.000Z', { status: 'cancelled' }),
      event('sun-hidden', '2026-11-22T21:00:00.000Z', { readable: false }),
      event('next-week', '2026-11-28T10:00:00.000Z'),
    ],
    [EVENT_RSVPS_TABLE]: [
      going('sun-late', ME),
      going('sun-evening', ME),
      going('sun-morning', ME),
      going('sun-maybe', ME, 'maybe'),
      going('sun-other', 'u-other'),
      going('sun-draft', ME),
      going('sun-cancelled', ME),
      going('sun-hidden', ME),
      going('next-week', ME),
    ],
    [EVENT_VOTES_TABLE]: [],
  }
}

const GLOBALS = {
  myRsvpsFor,
  myVotesFor,
  attendeeAvatarsFor,
  resolveAvatars: async () => new Map<string, string | null>(),
  topUpSeries: async () => {},
}

interface ListBody { rows: Array<{ $id: string, myRsvp: string | null }>, nextCursor: string | null }

async function list(who: 'guest' | 'member', query: Record<string, string>, tables = world()) {
  const door = windowDoor(tables)
  const run = await probeRoute(() => import('../server/api/events/index.get'), {
    who, query, door: door.tenantDb, globals: GLOBALS,
  })
  return { run, door, body: run.result as ListBody | undefined }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW))
})

afterEach(() => {
  vi.useRealTimers()
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

describe('GET /api/events — Zusagen im Zeitfenster', () => {
  it('nur sichtbare, veröffentlichte, bevorstehende Termine mit EIGENER Zusage, nach Beginn sortiert', async () => {
    const { run, body } = await list('member', { ...SUNDAY, mine: 'going' })
    expect(run.status).toBe(200)
    // nicht dabei: Vormittag (vorbei), fremde Zusage, „vielleicht", Entwurf,
    // abgesagt, ausgeblendet, nächste Woche
    expect(body?.rows.map(row => row.$id)).toEqual(['sun-evening', 'sun-late'])
    expect(body?.rows.every(row => row.myRsvp === 'going')).toBe(true)
    expect(body?.nextCursor).toBeNull()
  })

  it('die Reihenfolge der Parameter ändert nichts', async () => {
    const a = await list('member', { from: SUNDAY.from, to: SUNDAY.to, mine: 'going' })
    const b = await list('member', { mine: 'going', to: SUNDAY.to, from: SUNDAY.from })
    expect(b.body).toEqual(a.body)
  })

  it('Gegenprobe ohne „Zugesagt": das ganze Fenster, auch ohne eigene Zusage', async () => {
    const { body } = await list('member', SUNDAY)
    expect(body?.rows.map(row => row.$id)).toEqual(['sun-morning', 'sun-evening', 'sun-not-mine', 'sun-maybe', 'sun-late', 'sun-other'])
  })

  it('Gegenprobe ohne Fenster: „Zugesagt" allein zeigt auch die nächste Woche', async () => {
    const { body } = await list('member', { mine: 'going' })
    expect(body?.rows.map(row => row.$id)).toEqual(['sun-evening', 'sun-late', 'next-week'])
  })

  it('Termine liest die Mitglieder-Klinke, Zusagen nur zum eigenen Konto und erst danach', async () => {
    const { door } = await list('member', { ...SUNDAY, mine: 'going' })
    expect(door.calls[0]).toMatchObject({ handle: 'member', table: EVENTS_TABLE })
    expect(door.calls.filter(call => call.table === EVENTS_TABLE).every(call => call.handle === 'member')).toBe(true)
    // Der Filter ist der ERSTE Zugriff auf die Zusagen (danach lesen die
    // bestehenden Hilfen eigene Zusage und Avatar-Vorschau zu den Treffern).
    const second = door.calls[1]!
    expect(second).toMatchObject({ handle: 'operator', table: EVENT_RSVPS_TABLE })
    expect(second.queries).toContainEqual(expect.objectContaining({ method: 'equal', attribute: 'userId', values: [ME] }))
    expect(second.queries).toContainEqual(expect.objectContaining({ method: 'equal', attribute: 'status', values: ['going'] }))
    // gefragt wird nur nach Terminen, die das Konto selbst lesen durfte
    const asked = second.queries.find(query => query.attribute === 'eventId')?.values ?? []
    expect(asked).toContain('sun-late')
    expect(asked).not.toContain('sun-hidden')
    expect(asked).not.toContain('sun-draft')
    // und kein Zugriff nennt je einen Termin ohne Leserecht
    const everAsked = door.calls.flatMap(call => call.queries.find(query => query.attribute === 'eventId')?.values ?? [])
    expect(everAsked).not.toContain('sun-hidden')
  })

  it('Gast: 401, die Datentür bleibt zu — das Fenster allein bleibt für Gäste offen', async () => {
    const closed = await list('guest', { ...SUNDAY, mine: 'going' })
    expect(closed.run.status).toBe(401)
    expect(closed.door.calls).toEqual([])

    const open = await list('guest', SUNDAY)
    expect(open.run.status).toBe(200)
    expect(open.door.calls.every(call => call.handle === 'member')).toBe(true)
    expect(open.body?.rows.every(row => row.myRsvp === null)).toBe(true)
  })

  it('die Titelsuche wirkt zusammen mit beiden Filtern', async () => {
    const { body } = await list('member', { ...SUNDAY, mine: 'going', q: 'brunch' })
    expect(body?.rows.map(row => row.$id)).toEqual(['sun-evening'])
  })

  it('keine Zusage im Fenster: leere Liste, kein Fehler', async () => {
    const tables = world()
    tables[EVENT_RSVPS_TABLE] = [going('next-week', ME)]
    const { run, body } = await list('member', { ...SUNDAY, mine: 'going' }, tables)
    expect(run.status).toBe(200)
    expect(body).toEqual({ rows: [], nextCursor: null })
  })

  it('Fenster schon vorbei: leer, ohne die Datenbank zu fragen', async () => {
    const { body, door } = await list('member', { from: '2026-11-21T00:00:00.000Z', to: '2026-11-22T00:00:00.000Z', mine: 'going' })
    expect(body).toEqual({ rows: [], nextCursor: null })
    expect(door.calls).toEqual([])
  })

  it('gekappt wird erst NACH beiden Prüfungen: die Zusage hinter 100 fremden Terminen im Fenster geht nicht verloren', async () => {
    const tables = world()
    // 150 Termine im Fenster vor dem eigenen, dazu 150 ältere eigene Zusagen
    // außerhalb des Fensters (die alte Kappung „jüngste 100 Zusagen" träfe sie).
    const crowd = Array.from({ length: 150 }, (_, i) =>
      event(`crowd-${String(i).padStart(3, '0')}`, `2026-11-22T13:${String(Math.floor(i / 3)).padStart(2, '0')}:${String((i % 3) * 20).padStart(2, '0')}.000Z`))
    tables[EVENTS_TABLE] = [...crowd, ...tables[EVENTS_TABLE]!]
    tables[EVENT_RSVPS_TABLE] = [
      ...tables[EVENT_RSVPS_TABLE]!,
      ...Array.from({ length: 150 }, (_, i) => going(`elsewhere-${i}`, ME)),
    ]
    const { body, door } = await list('member', { ...SUNDAY, mine: 'going' }, tables)
    expect(body?.rows.map(row => row.$id)).toEqual(['sun-evening', 'sun-late'])
    // zwei Seiten des Fensters, jede mit explizitem Limit
    const eventReads = door.calls.filter(call => call.table === EVENTS_TABLE)
    expect(eventReads.length).toBe(2)
    expect(eventReads.every(call => call.queries.some(query => query.method === 'limit'))).toBe(true)
  })

  it('ungültiges Fenster bleibt 400', async () => {
    const { run } = await list('member', { from: SUNDAY.to, to: SUNDAY.from, mine: 'going' })
    expect(run.status).toBe(400)
  })
})
