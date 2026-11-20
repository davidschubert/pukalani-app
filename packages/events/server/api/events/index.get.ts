import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { EVENT_RSVPS_TABLE, EVENT_VOTES_TABLE, EVENTS_TABLE, type EventListResponse, type EventRow, type EventRsvpRow, type EventVote, type EventWithRsvp } from '../../../shared/types/event'
import { softFail } from '../../../../core/server/utils/softFail'

const PAGE_SIZE = 25

/** Kalender-/Zeitfenster- und Meine-Filter: begrenzt statt Cursor */
const RANGE_LIMIT = 100
const MAX_RANGE_MS = 62 * 24 * 3600_000
/** Meine-Filter: die JÜNGSTEN 100 RSVPs/Likes werden aufgelöst (Kappung dokumentiert) */
const MINE_IDS_LIMIT = 100

/**
 * Zusagen IM ZEITFENSTER: so viele Seiten (je `RANGE_LIMIT` Termine) des
 * Fensters werden höchstens durchgesehen. Ein Wochenende hat selten mehr als
 * eine; die Kappung hält nur einen Ausreißer in Grenzen.
 */
const WINDOW_SCAN_PAGES = 5

const MINE_FILTERS = ['going', 'liked', 'attended'] as const
type MineFilter = (typeof MINE_FILTERS)[number]

/**
 * Event-Liste: nur published. Drei Modi:
 * - Default = kommende (aufsteigend), ?past=true = Archiv (absteigend),
 *   Cursor-paginiert.
 * - ?from&to (ISO) = Zeitfenster (Kalender-Monatsansicht + Heute/Morgen/
 *   Wochenende-Chips; max. ~2 Monate, Limit 100, ohne Cursor).
 * - ?mine=going|liked|attended (nur eingeloggt): Events mit eigener
 *   going-RSVP (kommend), eigenem Upvote bzw. besuchte (going + vorbei —
 *   der Unterschied zum Archiv: nur MEINE).
 * - ?mine=going MIT ?from&to (Issue 417, „Wochenende" + „Zugesagt"): eigene
 *   Zusagen im Zeitfenster, nur noch Bevorstehendes. Zusage und Fenster
 *   werden GEMEINSAM geprüft, bevor gekappt wird — siehe `goingInWindow`.
 *   (`liked`/`attended` kennen kein Zeitfenster; dort zählt wie bisher `mine`.)
 * ?q (Fulltext auf title) kombiniert mit allen Modi.
 * Öffentlich lesbar (Gäste sehen die Liste — RSVP erst nach Login).
 */
export default defineEventHandler(async (event): Promise<EventListResponse> => {
  // Produkt-Gate (P4): Events sind ab Plan pro enthalten.
  requirePlanProduct(event, 'events')
  // Serien-Fenster nachziehen (§7e) — best-effort, wirft nie
  await topUpSeries(event)

  const query = getQuery(event)
  const past = query.past === 'true'
  const cursor = query.cursor
  // Suche (?q): Fulltext-Index auf title (Migration 003)
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : ''
  const from = typeof query.from === 'string' ? Date.parse(query.from) : Number.NaN
  const to = typeof query.to === 'string' ? Date.parse(query.to) : Number.NaN
  const range = Number.isFinite(from) && Number.isFinite(to)
  if (range && (to <= from || to - from > MAX_RANGE_MS)) {
    throw createError({ status: 400, statusText: 'Invalid range' })
  }
  const mine = typeof query.mine === 'string' && (MINE_FILTERS as readonly string[]).includes(query.mine)
    ? query.mine as MineFilter
    : null
  const now = new Date().toISOString()

  // Meine-Filter: erst die eigenen RSVP-/Vote-Ziel-Ids sammeln — Datentür als
  // Operator (die Tabellen haben bewusst keine breite Read-Permission; die
  // Tür scopet im Pool zusätzlich auf den Mandanten)
  let mineIds: string[] | null = null
  let windowRows: EventRow[] | null = null
  const user = mine ? event.context.user : null
  if (mine && !user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  if (user && mine === 'going' && range) {
    windowRows = await goingInWindow(event, user.$id, { from, to, now, q })
  }
  else if (user) {
    const ops = tenantDb(event, { as: 'operator' })
    if (mine === 'liked') {
      const res = await ops.list<EventVote>(EVENT_VOTES_TABLE, [
        Query.equal('userId', user.$id), Query.equal('value', 1), Query.orderDesc('$createdAt'), Query.limit(MINE_IDS_LIMIT),
      ]).catch(softFail('events:api/events/index.get:list', { rows: [] as EventVote[] }))
      mineIds = res.rows.map(r => r.eventId)
    }
    else {
      const res = await ops.list<EventRsvpRow>(EVENT_RSVPS_TABLE, [
        Query.equal('userId', user.$id), Query.equal('status', 'going'), Query.orderDesc('$createdAt'), Query.limit(MINE_IDS_LIMIT),
      ]).catch(softFail('events:api/events/index.get:list#2', { rows: [] as EventRsvpRow[] }))
      mineIds = res.rows.map(r => r.eventId)
    }
    if (mineIds.length === 0) {
      return { rows: [], nextCursor: null }
    }
  }

  // Datentür (member): Session-Client wie bisher — Gäste sehen nur
  // read(any)-Rows — plus Mandanten-Filter im Pool.
  const res = windowRows ? { rows: windowRows } : await tenantDb(event).list<EventRow>(EVENTS_TABLE, [
    Query.equal('status', 'published'),
    ...(q.length > 0 ? [Query.search('title', q)] : []),
    ...(mineIds
      ? [
          Query.equal('$id', mineIds),
          // going = kommende Zusagen · attended = besuchte (vorbei) ·
          // liked = zeitlos, neueste zuerst
          ...(mine === 'going' ? [Query.greaterThanEqual('startAt', now), Query.orderAsc('startAt')] : []),
          ...(mine === 'attended' ? [Query.lessThan('startAt', now), Query.orderDesc('startAt')] : []),
          ...(mine === 'liked' ? [Query.orderDesc('startAt')] : []),
          Query.limit(RANGE_LIMIT),
        ]
      : range
        ? [
            Query.greaterThanEqual('startAt', new Date(from).toISOString()),
            Query.lessThan('startAt', new Date(to).toISOString()),
            Query.orderAsc('startAt'),
            Query.limit(RANGE_LIMIT),
          ]
        : [
            ...(past
              ? [Query.lessThan('startAt', now), Query.orderDesc('startAt')]
              : [Query.greaterThanEqual('startAt', now), Query.orderAsc('startAt')]),
            Query.limit(PAGE_SIZE),
            ...(typeof cursor === 'string' && cursor.length > 0 ? [Query.cursorAfter(cursor)] : []),
          ]),
  ]).catch((error) => {
    // Ungültiger Cursor / abgelaufene Session als 4xx durchreichen, nicht als 500
    throw toH3Error(error, 'Could not load events')
  })

  const userId = event.context.user?.$id ?? null
  const ids = res.rows.map(row => row.$id)
  const [rsvps, votes, avatars] = await Promise.all([
    myRsvpsFor(event, ids, userId),
    myVotesFor(event, ids, userId),
    attendeeAvatarsFor(event, ids, userId),
  ])

  const rows: EventWithRsvp[] = res.rows.map(row => ({
    ...row,
    myRsvp: rsvps.get(row.$id) ?? null,
    myVote: votes.get(row.$id) ?? null,
    attendeeAvatars: avatars.get(row.$id) ?? [],
  }))

  return {
    rows,
    nextCursor: !range && !mine && res.rows.length === PAGE_SIZE ? res.rows.at(-1)!.$id : null,
  }
})

/**
 * Eigene Zusagen in einem Zeitfenster (Issue 417).
 *
 * WARUM NICHT WIE `?mine=going` OHNE FENSTER: dort werden erst die jüngsten
 * 100 Zusagen geholt und dann die Termine dazu. Wer mehr Zusagen hat, verlöre
 * so einen Termin am Wochenende, bevor das Fenster überhaupt geprüft ist.
 * Hier läuft es umgekehrt: erst die Termine des Fensters (klein, sortiert,
 * über die Mitglieder-Klinke — die Sichtbarkeit entscheidet also wie in jeder
 * anderen Ansicht das Leserecht der Zeile), dann je Seite EINE Abfrage nach
 * den eigenen Zusagen genau zu diesen Terminen. Gekappt wird erst das
 * Ergebnis. Ein neuer Index ist nicht nötig: die Termine laufen über
 * `status + startAt`, die Zusagen über `eventId + userId`.
 *
 * „Noch bevorstehend": der Anfang des Fensters wird auf JETZT gezogen. Am
 * Sonntag beginnt das Fenster des Browsers um Mitternacht — ohne das kämen
 * Termine vom Vormittag mit.
 *
 * Die Zusagen liest die Operator-Klinke (die Tabelle trägt bewusst kein
 * breites Leserecht), gefiltert auf das EIGENE Konto und nur zu Terminen, die
 * dieses Konto gerade selbst lesen durfte.
 */
async function goingInWindow(
  event: H3Event,
  userId: string,
  window: { from: number, to: number, now: string, q: string },
): Promise<EventRow[]> {
  const fromIso = new Date(window.from).toISOString()
  const lower = fromIso > window.now ? fromIso : window.now
  const upper = new Date(window.to).toISOString()
  if (lower >= upper) return []

  const found: EventRow[] = []
  let cursor: string | null = null
  for (let page = 0; page < WINDOW_SCAN_PAGES && found.length < RANGE_LIMIT; page++) {
    const candidates: { rows: EventRow[] } = await tenantDb(event).list<EventRow>(EVENTS_TABLE, [
      Query.equal('status', 'published'),
      ...(window.q.length > 0 ? [Query.search('title', window.q)] : []),
      Query.greaterThanEqual('startAt', lower),
      Query.lessThan('startAt', upper),
      Query.orderAsc('startAt'),
      Query.limit(RANGE_LIMIT),
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
    ]).catch((error) => {
      throw toH3Error(error, 'Could not load events')
    })
    if (candidates.rows.length === 0) break

    // Ein Lesefehler ist hier KEIN „keine Zusagen": die Liste wäre sonst still leer.
    const rsvps = await tenantDb(event, { as: 'operator' }).list<EventRsvpRow>(EVENT_RSVPS_TABLE, [
      Query.equal('userId', userId),
      Query.equal('status', 'going'),
      Query.equal('eventId', candidates.rows.map(row => row.$id)),
      Query.limit(candidates.rows.length),
    ]).catch((error) => {
      throw toH3Error(error, 'Could not load events')
    })
    const going = new Set(rsvps.rows.map(row => row.eventId))
    found.push(...candidates.rows.filter(row => going.has(row.$id)))

    if (candidates.rows.length < RANGE_LIMIT) break
    cursor = candidates.rows.at(-1)!.$id
  }
  return found.slice(0, RANGE_LIMIT)
}
