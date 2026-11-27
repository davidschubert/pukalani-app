import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isSessionDeleteEvent } from '../shared/realtimeAuth'
import {
  maskAccountEvents,
  filterPresenceUpsert,
  filterSubscribe,
  liveChannelKind,
  liveOriginAllowed,
  sanitizeLiveEvent,
  type AcceptedSubscription,
  type LiveRelayScope,
} from '../shared/liveRelay'
import { presencePermissions } from '../shared/presencePermissions'
import { realtimeRelayWanted, realtimeTokenWanted } from '../shared/realtimeGate'
import { liveUpgradeGuard } from '../server/plugins/live-relay'
import { configureSiteCard, setWebsocketBuiltForTests } from '../server/utils/siteCard'

/**
 * Die Live-Verbindung unter eigenen Domains (PK1 E1d): Regeln (was
 * durchgeht), der Dienst (Aufbau, Widerruf, Takt, Grenzen) und die Weiche im
 * Browser. Die Fahrkarten-Route prüft `route-roles-live-relay.test.ts`.
 */

vi.hoisted(() => {
  // Das Plugin ruft `defineNitroPlugin` beim Laden (Nitro-Auto-Import).
  (globalThis as Record<string, unknown>).defineNitroPlugin = (plugin: unknown) => plugin
})

const SCOPE: LiveRelayScope = { userId: 'u-1', communityId: 'c-a', tenantId: 't-a' }
const ROWS = 'tablesdb.db.tables.comments.rows'

function subs(entries: Record<string, AcceptedSubscription>): Map<string, AcceptedSubscription> {
  return new Map(Object.entries(entries))
}

describe('Kanäle', () => {
  it.each([
    ['account', 'account'],
    ['presences', 'presences'],
    ['presences.u-2', 'presences'],
    [ROWS, 'rows'],
    [`${ROWS}.row1`, 'rows'],
    ['files', null],
    ['rows', null],
    ['documents', null],
    ['buckets.avatars.files', null],
    ['databases.db.collections.c.documents', null],
    ['teams', null],
    ['tablesdb.db.tables.t.rows.r.update', null],
    ['tablesdb..tables.t.rows', null],
    [42, null],
  ])('%s ⇒ %s', (channel, kind) => {
    expect(liveChannelKind(channel)).toBe(kind)
  })
})

describe('subscribe', () => {
  it('nimmt erlaubte Abos einer Art an, verwirft fremde, gemischte und kaputte ganz', () => {
    const { forward, accepted } = filterSubscribe([
      { subscriptionId: 'a', channels: [ROWS], queries: ['{"method":"equal"}'] },
      { subscriptionId: 'b', channels: ['files'] },
      { subscriptionId: 'c', channels: ['account', ROWS] },
      { subscriptionId: 'd bad', channels: ['account'] },
      { subscriptionId: 'e', channels: [] },
      { subscriptionId: 'f', channels: ['account'], queries: [42] },
      { subscriptionId: 'g', channels: ['presences'] },
    ], 0)
    expect(forward.map(item => item.subscriptionId)).toEqual(['a', 'g'])
    expect(forward[0]).toEqual({ subscriptionId: 'a', channels: [ROWS], queries: ['{"method":"equal"}'] })
    expect(accepted.get('a')?.kind).toBe('rows')
    expect(accepted.get('g')?.kind).toBe('presences')
  })

  it('Grenze je Verbindung', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ subscriptionId: `s${i}`, channels: ['account'] }))
    expect(filterSubscribe(many, 0).forward).toHaveLength(64)
    expect(filterSubscribe(many, 60).forward).toHaveLength(4)
  })
})

describe('Ereignisse — fremde Community kommt nicht durch', () => {
  const rowsSub = subs({ s1: { kind: 'rows', channels: [ROWS] } })

  it('Zeile dieser Community ⇒ durch, nur mit eigenen Abo-Ids', () => {
    const out = sanitizeLiveEvent({ channels: [ROWS], events: ['x.create'], payload: { $id: 'r', communityId: 't-a' }, subscriptions: ['s1', 'fremd'] }, rowsSub, SCOPE)
    expect(out).toEqual([{ channels: [ROWS], events: ['x.create'], payload: { $id: 'r', communityId: 't-a' }, subscriptions: ['s1'] }])
  })

  it('Zeile einer anderen Community ⇒ verworfen', () => {
    expect(sanitizeLiveEvent({ channels: [ROWS], events: ['x'], payload: { communityId: 't-b' }, subscriptions: ['s1'] }, rowsSub, SCOPE)).toEqual([])
  })

  it('Zeile mit leerer Community ⇒ verworfen', () => {
    expect(sanitizeLiveEvent({ channels: [ROWS], events: ['x'], payload: { communityId: '' }, subscriptions: ['s1'] }, rowsSub, SCOPE)).toEqual([])
  })

  it('Zeile ohne Community-Spalte: nur wenn für alle lesbar', () => {
    const open = { $permissions: ['read("any")'] }
    const closed = { $permissions: ['read("user:u-1")'] }
    expect(sanitizeLiveEvent({ channels: [ROWS], events: ['x'], payload: open, subscriptions: ['s1'] }, rowsSub, SCOPE)).toHaveLength(1)
    expect(sanitizeLiveEvent({ channels: [ROWS], events: ['x'], payload: closed, subscriptions: ['s1'] }, rowsSub, SCOPE)).toEqual([])
  })

  it('Ereignis auf einem Kanal, den das Abo nicht hat ⇒ verworfen', () => {
    expect(sanitizeLiveEvent({ channels: ['tablesdb.db.tables.other.rows'], events: ['x'], payload: { communityId: 't-a' }, subscriptions: ['s1'] }, rowsSub, SCOPE)).toEqual([])
  })

  it('Anwesenheit: nur mit tenantId dieser Community', () => {
    const presence = subs({ p: { kind: 'presences', channels: ['presences'] } })
    expect(sanitizeLiveEvent({ channels: ['presences'], events: ['x'], payload: { metadata: { tenantId: 't-a' } }, subscriptions: ['p'] }, presence, SCOPE)).toHaveLength(1)
    expect(sanitizeLiveEvent({ channels: ['presences'], events: ['x'], payload: { metadata: { tenantId: 't-b' } }, subscriptions: ['p'] }, presence, SCOPE)).toEqual([])
    expect(sanitizeLiveEvent({ channels: ['presences'], events: ['x'], payload: { metadata: {} }, subscriptions: ['p'] }, presence, SCOPE)).toEqual([])
  })

  it('Konto-Kanal: nur die Ereignis-Art ohne Kennungen, kein Inhalt (L3)', () => {
    const account = subs({ k: { kind: 'account', channels: ['account'] } })
    const out = sanitizeLiveEvent({ channels: ['account'], events: ['users.u-1.sessions.s-2.create', 'users.*.sessions.*.create', 'users.u-1.sessions.*.create'], payload: { secret: 'geheim', provider: 'email' }, subscriptions: ['k'] }, account, SCOPE)
    expect(out).toEqual([{ channels: ['account'], events: ['users.*.sessions.*.create'], payload: {}, subscriptions: ['k'] }])
    expect(JSON.stringify(out)).not.toContain('geheim')
    expect(JSON.stringify(out)).not.toContain('s-2')
  })

  it.each([
    ['users.u1.sessions.s2.delete', 'users.*.sessions.*.delete'],
    ['users.u1.update.prefs', 'users.*.update.prefs'],
    ['users.u1.update', 'users.*.update'],
  ])('Maske %s ⇒ %s, die Abmelde-Erkennung greift weiter', (event, masked) => {
    expect(maskAccountEvents([event])).toEqual([masked])
  })

  it('Abmelde-Erkennung des Browsers erkennt die maskierte Form', () => {
    expect(isSessionDeleteEvent(maskAccountEvents(['users.u1.sessions.s2.delete']))).toBe(true)
  })

  it('kaputte Nachricht ⇒ nichts', () => {
    expect(sanitizeLiveEvent(null, rowsSub, SCOPE)).toEqual([])
    expect(sanitizeLiveEvent({ channels: [ROWS] }, rowsSub, SCOPE)).toEqual([])
  })
})

describe('eigene Anwesenheit', () => {
  const PROFILE = { userName: 'Echter Name', avatarUrl: 'https://bild.test/a.png' }
  const ok = { presenceId: 'u-1', status: 'online', permissions: presencePermissions(true, 'c-a', 'u-1'), metadata: { tenantId: 't-a', userName: 'X', page: '/p', typing: true } }

  it('wie der Server sie rechnet ⇒ durch; Name und Bild vom Server', () => {
    expect(filterPresenceUpsert(ok, SCOPE, PROFILE)).toEqual({
      presenceId: 'u-1',
      status: 'online',
      permissions: ok.permissions,
      metadata: { page: '/p', typing: true, userName: 'Echter Name', avatarUrl: 'https://bild.test/a.png', tenantId: 't-a' },
    })
  })

  it('unbekannte und zu lange Felder fallen weg, fremder Name zählt nicht', () => {
    const out = filterPresenceUpsert({ ...ok, metadata: { tenantId: 't-a', userName: 'Fremd', avatarUrl: 'https://boese.test', extra: 'x', scope: 'y'.repeat(600), action: { a: 1 } } }, SCOPE, { userName: 'Echt' })
    expect(out?.metadata).toEqual({ userName: 'Echt', tenantId: 't-a' })
  })

  it.each([
    ['fremde Id', { ...ok, presenceId: 'u-2' }],
    ['fremde Community', { ...ok, metadata: { tenantId: 't-b' } }],
    ['ohne Community', { ...ok, metadata: {} }],
    ['für alle lesbar', { ...ok, permissions: ['read("any")', 'update("user:u-1")', 'delete("user:u-1")'] }],
    ['Leserecht einer anderen Community', { ...ok, permissions: presencePermissions(true, 'c-b', 'u-1') }],
    ['zusätzliches Recht', { ...ok, permissions: [...ok.permissions, 'read("users")'] }],
  ])('%s ⇒ verworfen', (_name, data) => {
    expect(filterPresenceUpsert(data, SCOPE, PROFILE)).toBeNull()
  })
})

describe('Herkunft', () => {
  it.each([
    ['https://forum.beispiel.test', 'forum.beispiel.test', true],
    ['http://kunde.localhost:3010', 'kunde.localhost:3010', true],
    ['https://andere.test', 'forum.beispiel.test', false],
    [undefined, 'forum.beispiel.test', false],
    ['kein url', 'forum.beispiel.test', false],
  ])('%s auf %s ⇒ %s', (origin, host, expected) => {
    expect(liveOriginAllowed(origin, host)).toBe(expected)
  })
})

describe('WebSocket nur für den einen Pfad', () => {
  it.each([
    ['http://h.test/api/live/realtime?project=p', false, undefined],
    ['http://h.test/', false, 404],
    ['http://h.test/api/auth/me', false, 404],
    ['http://h.test/_nuxt/hmr', false, 404],
    ['http://h.test/_nuxt/hmr', true, undefined],
  ])('%s (dev %s) ⇒ %s', (url, dev, status) => {
    expect(liveUpgradeGuard({ url }, dev)?.status).toBe(status)
  })
})

describe('Weiche im Browser', () => {
  it.each([
    [true, true, true, true],
    [true, true, false, false],
    [true, false, true, false],
    [false, true, true, false],
  ])('angemeldet %s, eigene Domain %s, Dienst %s ⇒ Weiterleitung %s', (loggedIn, scope, relay, expected) => {
    expect(realtimeRelayWanted(loggedIn, scope, relay)).toBe(expected)
    // Nie zugleich ein Token: unter der eigenen Domain gibt es keins.
    if (expected) expect(realtimeTokenWanted(loggedIn, scope)).toBe(false)
  })
})

// ── Der Dienst ──────────────────────────────────────────────────────────

class FakeUpstream extends EventTarget {
  readyState: number = WebSocket.CONNECTING
  sent: string[] = []
  closedWith: number | undefined
  constructor(readonly url: string) {
    super()
  }

  send(text: string) {
    this.sent.push(text)
  }

  close(code?: number) {
    this.closedWith = code
    this.readyState = WebSocket.CLOSED
    this.dispatchEvent(new Event('close'))
  }

  open() {
    this.readyState = WebSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  emit(message: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }))
  }

  /** Appwrite beendet die Verbindung (Widerruf: 401-Rahmen, dann zu). */
  revoke() {
    this.emit({ type: 'error', data: { code: 401, message: 'User session expired.' } })
    this.readyState = WebSocket.CLOSED
    this.dispatchEvent(new Event('close'))
  }
}

function fakePeer(id = 'peer-1') {
  const sent: Array<{ type: string, data?: unknown }> = []
  const peer = {
    id,
    closed: undefined as undefined | { code?: number, reason?: string },
    send: (text: string) => { sent.push(JSON.parse(text)) },
    close: (code?: number, reason?: string) => { peer.closed ??= { code, reason } },
    context: {} as Record<string, unknown>,
  }
  return { peer, sent }
}

describe('Dienst: eine Verbindung', () => {
  let relay: typeof import('../server/utils/liveRelay')
  let upstreams: FakeUpstream[]
  let now: number

  beforeEach(async () => {
    vi.useFakeTimers()
    relay = await import('../server/utils/liveRelay')
    upstreams = []
    jwts = []
    verdict = 'ok'
    now = Date.now()
  })

  afterEach(() => {
    relay.closeAllLiveRelays()
    vi.useRealTimers()
  })

  let verdict: 'ok' | 'revoked' | 'unknown'
  let jwts: string[]

  function connect(expiresIn = 600_000) {
    const { peer, sent } = fakePeer(`peer-${Math.random()}`)
    const ticket = { scope: SCOPE, projectId: 'pool', jwt: 'jwt-1', expiresAt: now + expiresIn, profile: { userName: 'P' } }
    const connection = new relay.LiveRelayConnection(peer, ticket, {
      openUpstream: (url, jwt) => {
        jwts.push(jwt)
        const up = new FakeUpstream(url)
        upstreams.push(up)
        return up as unknown as WebSocket
      },
      recheck: async () => verdict,
      endpoint: 'https://api.beispiel.test/v1',
      now: () => now,
    })
    connection.start()
    const up = upstreams.at(-1)!
    return { connection, peer, sent, up }
  }

  it('oben: Realtime-Adresse OHNE JWT (das reist als Kopfzeile), ohne Cookie; unten: „connected" ohne Konto-Daten', () => {
    const { sent, up } = connect()
    expect(up.url).toBe('wss://api.beispiel.test/v1/realtime?project=pool')
    expect(jwts).toEqual(['jwt-1'])
    up.open()
    up.emit({ type: 'connected', data: { channels: [], user: { $id: 'u-1', email: 'x@y.test', prefs: { a: 1 } } } })
    expect(sent).toEqual([{ type: 'connected', data: { channels: [], subscriptions: {}, user: { $id: 'u-1' } } }])
  })

  it('Abo und Ereignis: fremde Community kommt nicht durch, eigene schon', () => {
    const { connection, sent, up } = connect()
    up.open()
    up.emit({ type: 'connected', data: {} })
    connection.fromDownstream(JSON.stringify({ type: 'subscribe', data: [{ subscriptionId: 's1', channels: [ROWS], queries: [] }, { subscriptionId: 's2', channels: ['files'], queries: [] }] }))
    expect(up.sent.map(t => JSON.parse(t))).toEqual([{ type: 'subscribe', data: [{ subscriptionId: 's1', channels: [ROWS], queries: [] }] }])
    up.emit({ type: 'event', data: { channels: [ROWS], events: ['e'], payload: { communityId: 't-b', text: 'fremd' }, subscriptions: ['s1'] } })
    up.emit({ type: 'event', data: { channels: [ROWS], events: ['e'], payload: { communityId: 't-a', text: 'eigen' }, subscriptions: ['s1'] } })
    const events = sent.filter(m => m.type === 'event')
    expect(events).toHaveLength(1)
    expect(JSON.stringify(events)).toContain('eigen')
    expect(JSON.stringify(sent)).not.toContain('fremd')
  })

  it('Nachrichten vor „connected" warten und gehen danach hoch', () => {
    const { connection, up } = connect()
    connection.fromDownstream(JSON.stringify({ type: 'subscribe', data: [{ subscriptionId: 's1', channels: ['account'] }] }))
    expect(up.sent).toEqual([])
    up.open()
    up.emit({ type: 'connected', data: {} })
    expect(up.sent).toHaveLength(1)
  })

  it('Widerruf: Appwrite meldet 401 und schließt ⇒ der Browser bekommt den 401, zu mit 4403 (Widerruf, keine Störung)', () => {
    const { peer, sent, up } = connect()
    up.open()
    up.emit({ type: 'connected', data: {} })
    up.revoke()
    expect(sent.at(-1)).toEqual({ type: 'error', data: { code: 401, message: 'User session expired.' } })
    expect(peer.closed?.code).toBe(relay.LIVE_CLOSE_REVOKED)
    expect(relay.liveRelayConnectionCount()).toBe(0)
  })

  it('oben zu OHNE 401-Rahmen, Nachprüfung sagt „widerrufen" ⇒ zu mit 4403', async () => {
    const { peer, up } = connect()
    up.open()
    up.emit({ type: 'connected', data: {} })
    verdict = 'revoked'
    up.dispatchEvent(new Event('error'))
    up.dispatchEvent(new Event('close'))
    await vi.advanceTimersByTimeAsync(0)
    expect(peer.closed?.code).toBe(relay.LIVE_CLOSE_REVOKED)
    expect(relay.liveRelayConnectionCount()).toBe(0)
  })

  it('oben zu, Karte gilt weiter ⇒ Störung, zu mit 1011 (das SDK verbindet neu)', async () => {
    const { peer, up } = connect()
    up.open()
    up.emit({ type: 'connected', data: {} })
    up.dispatchEvent(new Event('error'))
    await vi.advanceTimersByTimeAsync(0)
    expect(peer.closed?.code).toBe(relay.LIVE_CLOSE_UPSTREAM)
    expect(relay.liveRelayConnectionCount()).toBe(0)
  })

  it('Browser schließt ⇒ oben wird geschlossen, Zähler frei', () => {
    const { connection, up } = connect()
    up.open()
    expect(relay.liveRelayConnectionCount()).toBe(1)
    connection.shutdown(1000, 'closed')
    expect(up.closedWith).toBe(1000)
    expect(relay.liveRelayConnectionCount()).toBe(0)
  })

  it('Takt: Ping nach oben alle 20 s; Ping von unten bekommt Pong ohne Umweg', () => {
    const { connection, sent, up } = connect()
    up.open()
    up.emit({ type: 'connected', data: {} })
    vi.advanceTimersByTime(relay.LIVE_UPSTREAM_PING_MS * 3)
    expect(up.sent.filter(t => t === '{"type":"ping"}')).toHaveLength(3)
    connection.fromDownstream('{"type":"ping"}')
    expect(sent.at(-1)).toEqual({ type: 'pong' })
    expect(up.sent.filter(t => t.includes('ping'))).toHaveLength(3)
  })

  it('JWT läuft ab ⇒ kurz vorher unten schließen (4000), das SDK verbindet neu', () => {
    const { peer, up } = connect(120_000)
    up.open()
    up.emit({ type: 'connected', data: {} })
    vi.advanceTimersByTime(120_000 - relay.LIVE_RENEW_BEFORE_MS - 1)
    expect(peer.closed).toBeUndefined()
    vi.advanceTimersByTime(2)
    expect(peer.closed?.code).toBe(relay.LIVE_CLOSE_RENEW)
    expect(up.closedWith).toBe(1000)
  })

  it('Nachprüfung: Karte gilt nicht mehr (Domain, Community, entfernt) ⇒ zu mit 4403', async () => {
    const { peer, up } = connect()
    up.open()
    up.emit({ type: 'connected', data: {} })
    await vi.advanceTimersByTimeAsync(relay.LIVE_RECHECK_MS)
    expect(peer.closed).toBeUndefined()
    verdict = 'revoked'
    await vi.advanceTimersByTimeAsync(relay.LIVE_RECHECK_MS)
    expect(peer.closed?.code).toBe(relay.LIVE_CLOSE_REVOKED)
    expect(up.closedWith).toBe(1000)
    expect(relay.liveRelayConnectionCount()).toBe(0)
  })

  it('Nachprüfung ohne Antwort (Störung) ⇒ bleibt offen, bis zum JWT-Ablauf', async () => {
    const { peer, up } = connect()
    up.open()
    up.emit({ type: 'connected', data: {} })
    verdict = 'unknown'
    await vi.advanceTimersByTimeAsync(relay.LIVE_RECHECK_MS * 2)
    expect(peer.closed).toBeUndefined()
  })

  it('oben kommt kein „connected" ⇒ nach der Frist zu', () => {
    const { peer } = connect()
    vi.advanceTimersByTime(relay.LIVE_UPSTREAM_CONNECT_MS + 1)
    expect(peer.closed?.code).toBe(relay.LIVE_CLOSE_UPSTREAM)
  })

  it('fremde Anwesenheit und `authentication` gehen nicht hoch, die eigene schon', () => {
    const { connection, up } = connect()
    up.open()
    up.emit({ type: 'connected', data: {} })
    connection.fromDownstream(JSON.stringify({ type: 'authentication', data: { session: 'x' } }))
    connection.fromDownstream(JSON.stringify({ type: 'presence', data: { presenceId: 'u-2', status: 'online', permissions: [], metadata: {} } }))
    expect(up.sent).toEqual([])
    connection.fromDownstream(JSON.stringify({ type: 'presence', data: { presenceId: 'u-1', status: 'online', permissions: presencePermissions(true, 'c-a', 'u-1'), metadata: { tenantId: 't-a', userName: 'Fremd' } } }))
    expect(up.sent).toHaveLength(1)
    expect(JSON.parse(up.sent[0]!).data.metadata.userName).toBe('P')
  })

  it('Browser liest nicht mit (Sende-Puffer voll) ⇒ zu mit 1013, kein weiteres Senden (L4)', () => {
    const { connection, peer, sent, up } = connect()
    up.open()
    up.emit({ type: 'connected', data: {} })
    connection.fromDownstream(JSON.stringify({ type: 'subscribe', data: [{ subscriptionId: 's1', channels: [ROWS] }] }))
    ;(peer as { websocket?: { bufferedAmount: number } }).websocket = { bufferedAmount: relay.LIVE_SEND_BUFFER_MAX + 1 }
    const before = sent.length
    up.emit({ type: 'event', data: { channels: [ROWS], events: ['e'], payload: { communityId: 't-a' }, subscriptions: ['s1'] } })
    expect(sent.length).toBe(before)
    expect(peer.closed?.code).toBe(relay.LIVE_CLOSE_SLOW)
  })

  it('zu große Nachricht von unten ⇒ verworfen', () => {
    const { connection, up } = connect()
    up.open()
    up.emit({ type: 'connected', data: {} })
    connection.fromDownstream(JSON.stringify({ type: 'subscribe', data: [{ subscriptionId: 's1', channels: ['account'], queries: ['x'.repeat(20_000)] }] }))
    expect(up.sent).toEqual([])
  })
})

describe('Dienst: Aufbau (upgrade)', () => {
  const KEY = randomBytes(32).toString('base64')
  let relay: typeof import('../server/utils/liveRelay')
  let ticketStatus: number
  let lastTicketHeaders: Headers | undefined
  let ticketDelay = 0

  beforeEach(async () => {
    relay = await import('../server/utils/liveRelay')
    ticketStatus = 200
    ticketDelay = 0
    lastTicketHeaders = undefined
    vi.stubGlobal('useNitroApp', () => ({
      localFetch: async (_path: string, init: { headers: Headers }) => {
        lastTicketHeaders = init.headers
        if (ticketStatus !== 200) return new Response(null, { status: ticketStatus })
        if (ticketDelay > 0) await new Promise(r => setTimeout(r, ticketDelay))
        return Response.json({ scope: SCOPE, projectId: 'pool', jwt: 'j', expiresAt: Date.now() + 600_000, profile: { userName: 'P' } })
      },
    }))
  })

  afterEach(() => {
    relay.closeAllLiveRelays()
    configureSiteCard({ mode: 'off' })
    setWebsocketBuiltForTests(null)
    vi.unstubAllGlobals()
  })

  function request(headers: Record<string, string> = {}) {
    return {
      url: 'https://forum.beispiel.test/api/live/realtime?project=pool',
      headers: new Headers({ host: 'forum.beispiel.test', origin: 'https://forum.beispiel.test', cookie: 'a_session_pool=c1.x', upgrade: 'websocket', ...headers }),
      context: {} as Record<string, unknown>,
    }
  }

  it('Schalter aus ⇒ 404 wie eine unbekannte Route, keine Fahrkarte', async () => {
    setWebsocketBuiltForTests(true)
    expect((await relay.liveRelayUpgrade(request()))?.status).toBe(404)
    expect(lastTicketHeaders).toBeUndefined()
  })

  it('fremde Herkunft ⇒ 403, keine Fahrkarte', async () => {
    configureSiteCard({ mode: 'write', key: KEY })
    setWebsocketBuiltForTests(true)
    expect((await relay.liveRelayUpgrade(request({ origin: 'https://angreifer.test' })))?.status).toBe(403)
    expect(lastTicketHeaders).toBeUndefined()
  })

  it.each([[401, 401], [403, 403], [404, 404], [500, 404]])('Fahrkarte %s ⇒ %s', async (status, expected) => {
    configureSiteCard({ mode: 'write', key: KEY })
    setWebsocketBuiltForTests(true)
    ticketStatus = status
    expect((await relay.liveRelayUpgrade(request()))?.status).toBe(expected)
  })

  it('angenommen: Fahrkarte im Kontext, nur die prüfenden Kopfzeilen gingen mit', async () => {
    configureSiteCard({ mode: 'write', key: KEY })
    setWebsocketBuiltForTests(true)
    const req = request()
    expect(await relay.liveRelayUpgrade(req)).toBeUndefined()
    ;(req.context.liveRelease as () => void)()
    expect((req.context.liveTicket as { scope: LiveRelayScope }).scope).toEqual(SCOPE)
    expect(lastTicketHeaders?.get('cookie')).toBe('a_session_pool=c1.x')
    expect(lastTicketHeaders?.get('upgrade')).toBeNull()
  })

  it('Grenze je Konto ⇒ 429', async () => {
    configureSiteCard({ mode: 'write', key: KEY })
    setWebsocketBuiltForTests(true)
    for (let i = 0; i < relay.LIVE_USER_LIMIT; i++) {
      const { peer } = fakePeer(`p${i}`)
      new relay.LiveRelayConnection(peer, { scope: SCOPE, projectId: 'pool', jwt: 'j', expiresAt: Date.now() + 600_000, profile: { userName: 'P' } }, {
        openUpstream: url => new FakeUpstream(url) as unknown as WebSocket,
        recheck: async () => 'ok',
        endpoint: 'https://api.beispiel.test/v1',
        now: () => Date.now(),
      }).start()
    }
    expect((await relay.liveRelayUpgrade(request()))?.status).toBe(429)
    relay.closeAllLiveRelays()
    const ok = request()
    expect(await relay.liveRelayUpgrade(ok)).toBeUndefined()
    ;(ok.context.liveRelease as () => void)()
  })

  it.each([
    [302, 'revoked'], [401, 'revoked'], [403, 'revoked'], [404, 'revoked'],
    [429, 'unknown'], [500, 'unknown'], [503, 'unknown'],
  ])('Nachprüfung: Antwort %s ⇒ %s (eine abgeschaltete Domain leitet um)', async (status, verdict) => {
    ticketStatus = status
    expect(await relay.recheckLiveTicket(new Headers(), SCOPE)).toBe(verdict)
  })

  it('Nachprüfung: 200, aber eine andere Seite ⇒ revoked; gleiche Seite ⇒ ok; mit Prüf-Kopfzeile', async () => {
    expect(await relay.recheckLiveTicket(new Headers(), SCOPE)).toBe('ok')
    expect(lastTicketHeaders?.get(relay.LIVE_CHECK_HEADER)).toBe('1')
    expect(await relay.recheckLiveTicket(new Headers(), { ...SCOPE, tenantId: 't-b' })).toBe('revoked')
  })

  it('gleichzeitige Aufbauten: die Grenze je Konto hält (Platz vor dem Warten reserviert)', async () => {
    configureSiteCard({ mode: 'write', key: KEY })
    setWebsocketBuiltForTests(true)
    ticketDelay = 20
    const requests = Array.from({ length: 30 }, () => request())
    const results = await Promise.all(requests.map(r => relay.liveRelayUpgrade(r)))
    expect(results.filter(r => r === undefined)).toHaveLength(relay.LIVE_USER_LIMIT)
    expect(results.filter(r => r?.status === 429)).toHaveLength(30 - relay.LIVE_USER_LIMIT)
    for (const r of requests) (r.context.liveRelease as (() => void) | undefined)?.()
  })

  it('reservierter Platz ohne `open` wird nach der Frist frei', async () => {
    configureSiteCard({ mode: 'write', key: KEY })
    setWebsocketBuiltForTests(true)
    vi.useFakeTimers()
    try {
      for (let i = 0; i < relay.LIVE_USER_LIMIT; i++) expect(await relay.liveRelayUpgrade(request())).toBeUndefined()
      expect((await relay.liveRelayUpgrade(request()))?.status).toBe(429)
      await vi.advanceTimersByTimeAsync(relay.LIVE_RESERVATION_MS + 1)
      const again = request()
      expect(await relay.liveRelayUpgrade(again)).toBeUndefined()
      ;(again.context.liveRelease as () => void)()
    }
    finally {
      vi.useRealTimers()
    }
  })
})
