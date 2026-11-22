import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { logEvent } from './logEvent'
import { liveRelayReady } from './siteCard'
import {
  LIVE_RELAY_LIMITS,
  LIVE_RELAY_PATH,
  connectedFrame,
  filterPresenceUpsert,
  filterSubscribe,
  filterUnsubscribe,
  liveOriginAllowed,
  sanitizeLiveEvent,
  type AcceptedSubscription,
  type LiveRelayScope,
} from '../../shared/liveRelay'

/**
 * DER DIENST DER LIVE-VERBINDUNG UNTER EIGENEN DOMAINS (PK1 E1d, Plan
 * `docs/plans/PUKALANI-KONTO-E1.md` § 13.3 Weg 3). Was durchgeht, sagen die
 * puren Regeln in `core/shared/liveRelay.ts`; hier stehen Aufbau, Takt und
 * Aufräumen.
 *
 * AUFBAU (`upgrade`): Schalter (`liveRelayReady`), Herkunft = Host, Grenze je
 * Prozess. Dann fragt der Dienst SICH SELBST nach einer Fahrkarte
 * (`nitroApp.localFetch` auf `/api/live/realtime` mit den Kopfzeilen der
 * Anfrage und einem Prozess-Geheimnis): so läuft die GANZE Kette der
 * Middleware (Host, Mandant, eigene Domain, Karte, Anmeldung, entfernt) wie
 * bei jeder anderen Anfrage — der Dienst baut sie nicht nach. Die Fahrkarte
 * trägt die Seite (Konto, Community) und ein JWT, das an die Sitzung DER KARTE
 * gebunden ist; sie verlässt den Prozess nie.
 *
 * OBEN: eine Appwrite-Verbindung je Browser-Verbindung, mit dem JWT in der
 * Adresse (ohne Origin-Kopfzeile, ohne Cookie). Ping alle 20 s (Appwrite
 * trennt nach 120 s Stille). Der Browser pingt uns selbst alle 20 s (das SDK)
 * — unter den 60 s von nginx; wir antworten ohne Umweg.
 *
 * WIDERRUF: endet die Sitzung, schließt Appwrite oben (erst Fehler 401, dann
 * zu) — wir reichen den Fehler durch und schließen unten. Das JWT lebt
 * höchstens `LIVE_JWT_DURATION_S`; kurz vorher schließen wir unten mit
 * `4000`, das SDK verbindet neu und holt sich damit eine frische, vollständig
 * geprüfte Fahrkarte (Karte, Host, Community — eine abgeschaltete Domain
 * fällt spätestens dann heraus).
 */

/** Lebensdauer des JWT oben und damit einer Verbindung (s). */
export const LIVE_JWT_DURATION_S = 600
/** So lange vor dem Ablauf schließen wir unten zum Neuverbinden (ms). */
export const LIVE_RENEW_BEFORE_MS = 30_000
/** Takt des Pings nach oben (ms) — Appwrite trennt nach 120 s Stille. */
export const LIVE_UPSTREAM_PING_MS = 20_000
/** Wie lange oben höchstens bis `connected` vergehen darf (ms). */
export const LIVE_UPSTREAM_CONNECT_MS = 15_000
/** Verbindungen je Prozess / je Konto. */
export const LIVE_PROCESS_LIMIT = 2000
export const LIVE_USER_LIMIT = 12
/** Nachrichten nach oben, die vor `connected` warten dürfen. */
const PENDING_LIMIT = 32

/** Schließ-Codes nach unten (das SDK verbindet bei allen außer 1008 neu). */
export const LIVE_CLOSE_RENEW = 4000
export const LIVE_CLOSE_UPSTREAM = 1011

// ── Fahrkarte ────────────────────────────────────────────────────────────

const TICKET_HEADER = 'x-pukalani-live-ticket'
const ticketSecret = randomBytes(32).toString('hex')

/** Kommt diese Anfrage vom Dienst selbst (Fahrkarte)? Zeit-konstanter Vergleich. */
export function isLiveTicketRequest(event: H3Event): boolean {
  const given = getHeader(event, TICKET_HEADER)
  if (typeof given !== 'string' || given.length !== ticketSecret.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(ticketSecret))
}

/** Nur für Tests: Name und Wert der Kopfzeile, mit der der Dienst sich selbst fragt. */
export function liveTicketHeaderForTests(): { name: string, value: string } {
  return { name: TICKET_HEADER, value: ticketSecret }
}

/** Was die Fahrkarte trägt. */
export interface LiveTicket {
  scope: LiveRelayScope
  projectId: string
  jwt: string
  /** Ablauf des JWT (ms seit 1970). */
  expiresAt: number
}

function isLiveTicket(value: unknown): value is LiveTicket {
  if (!value || typeof value !== 'object') return false
  const t = value as Partial<LiveTicket>
  const s = t.scope as Partial<LiveRelayScope> | undefined
  return typeof t.jwt === 'string' && t.jwt !== '' && typeof t.projectId === 'string' && t.projectId !== ''
    && typeof t.expiresAt === 'number' && Number.isFinite(t.expiresAt)
    && !!s && typeof s.userId === 'string' && s.userId !== '' && typeof s.communityId === 'string' && s.communityId !== ''
    && typeof s.tenantId === 'string' && s.tenantId !== ''
}

/**
 * Kopfzeilen, die für die Prüfung zählen. Bewusst NICHT: `upgrade`,
 * `connection`, `sec-websocket-*` (die Fahrkarte ist eine gewöhnliche
 * GET-Anfrage).
 */
const FORWARDED_HEADERS = ['cookie', 'host', 'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host', 'x-real-ip', 'user-agent', 'accept-language'] as const

/** Ergebnis der Fahrkarten-Frage: die Karte oder der Status der Ablehnung. */
export type LiveTicketResult = { ticket: LiveTicket } | { status: number }

export async function requestLiveTicket(headers: Headers): Promise<LiveTicketResult> {
  const forwarded = new Headers()
  for (const name of FORWARDED_HEADERS) {
    const value = headers.get(name)
    if (value !== null) forwarded.set(name, value)
  }
  forwarded.set(TICKET_HEADER, ticketSecret)
  forwarded.set('accept', 'application/json')
  let response: Response
  try {
    response = await useNitroApp().localFetch(LIVE_RELAY_PATH, { method: 'GET', headers: forwarded })
  }
  catch (error) {
    logEvent('error', 'live_relay.ticket_failed', { message: error instanceof Error ? error.message : String(error) })
    return { status: 503 }
  }
  if (!response.ok) return { status: response.status }
  const body: unknown = await response.json().catch((error: unknown) => {
    logEvent('error', 'live_relay.ticket_unreadable', { message: error instanceof Error ? error.message : String(error) })
    return null
  })
  return isLiveTicket(body) ? { ticket: body } : { status: 503 }
}

// ── Verbindungen ─────────────────────────────────────────────────────────

const connections = new Map<string, LiveRelayConnection>()
const perUser = new Map<string, number>()

/** Wie viele Verbindungen dieser Prozess gerade hält (für Tests und Grenzen). */
export function liveRelayConnectionCount(): number {
  return connections.size
}

function userCount(userId: string): number {
  return perUser.get(userId) ?? 0
}

/** Realtime-Adresse von Appwrite (`https://…/v1` ⇒ `wss://…/v1/realtime`). */
export function upstreamRealtimeUrl(endpoint: string, projectId: string, jwt: string): string {
  const base = endpoint.replace(/\/+$/, '').replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
  return `${base}/realtime?project=${encodeURIComponent(projectId)}&jwt=${encodeURIComponent(jwt)}`
}

/** Was eine Verbindung von ihrer Umgebung braucht — in Tests gestellt. */
export interface LiveRelayEnvironment {
  /** Öffnet die Verbindung nach oben. */
  openUpstream: (url: string) => WebSocket
  endpoint: string
  now: () => number
}

function defaultEnvironment(): LiveRelayEnvironment {
  return {
    openUpstream: url => new WebSocket(url),
    endpoint: useRuntimeConfig().public.appwriteEndpoint,
    now: () => Date.now(),
  }
}

/**
 * Was der Dienst von einer Browser-Verbindung braucht — die Teilmenge eines
 * crossws-`Peer` (crossws kommt mit Nitro; der Core importiert es nicht
 * selbst, damit kein Paket dazukommt).
 */
export interface LivePeer {
  readonly id: string
  send: (data: string) => unknown
  close: (code?: number, reason?: string) => void
  readonly context?: unknown
}

type Downstream = LivePeer

/** Eine Browser-Verbindung und ihre eine Verbindung nach oben. */
export class LiveRelayConnection {
  readonly subscriptions = new Map<string, AcceptedSubscription>()
  private upstream: WebSocket | null = null
  private upstreamReady = false
  private pending: string[] = []
  private timers: ReturnType<typeof setTimeout>[] = []
  private pingTimer: ReturnType<typeof setInterval> | undefined
  private closed = false

  constructor(
    private readonly peer: Downstream,
    private readonly ticket: LiveTicket,
    private readonly env: LiveRelayEnvironment,
  ) {}

  get scope(): LiveRelayScope {
    return this.ticket.scope
  }

  start(): void {
    connections.set(this.peer.id, this)
    perUser.set(this.scope.userId, userCount(this.scope.userId) + 1)
    const lifetime = this.ticket.expiresAt - this.env.now() - LIVE_RENEW_BEFORE_MS
    if (lifetime <= 0) {
      this.shutdown(LIVE_CLOSE_RENEW, 'renew')
      return
    }
    this.timers.push(setTimeout(() => this.shutdown(LIVE_CLOSE_RENEW, 'renew'), lifetime))
    this.timers.push(setTimeout(() => {
      if (!this.upstreamReady) this.fail('connect_timeout')
    }, LIVE_UPSTREAM_CONNECT_MS))
    let socket: WebSocket
    try {
      socket = this.env.openUpstream(upstreamRealtimeUrl(this.env.endpoint, this.ticket.projectId, this.ticket.jwt))
    }
    catch (error) {
      this.fail('open_failed', error)
      return
    }
    this.upstream = socket
    socket.addEventListener('message', (event) => {
      if (typeof event.data === 'string') this.fromUpstream(event.data)
    })
    socket.addEventListener('close', () => this.shutdown(LIVE_CLOSE_UPSTREAM, 'upstream_closed'))
    socket.addEventListener('error', () => this.fail('upstream_error'))
    this.pingTimer = setInterval(() => {
      if (this.upstream?.readyState === WebSocket.OPEN) this.upstream.send('{"type":"ping"}')
    }, LIVE_UPSTREAM_PING_MS)
  }

  /** Eine Nachricht von oben. */
  fromUpstream(text: string): void {
    if (this.closed) return
    const message = parse(text)
    if (!message) return
    switch (message.type) {
      case 'connected': {
        if (this.upstreamReady) return
        this.upstreamReady = true
        this.toDownstream(connectedFrame(this.scope.userId))
        const waiting = this.pending
        this.pending = []
        for (const item of waiting) this.upstream?.send(item)
        return
      }
      case 'event':
        for (const data of sanitizeLiveEvent(message.data, this.subscriptions, this.scope)) {
          this.toDownstream({ type: 'event', data })
        }
        return
      case 'error': {
        // Durchreichen, damit der Browser den Widerruf erkennt (401 ⇒
        // Abmelde-Prüfung, `onRealtimeAccessEnded`). Nur Code und kurzer Text.
        const data = message.data && typeof message.data === 'object' ? message.data as Record<string, unknown> : {}
        const code = typeof data.code === 'number' ? data.code : 500
        const text = typeof data.message === 'string' ? data.message.slice(0, 200) : 'Error'
        this.toDownstream({ type: 'error', data: { code, message: text } })
        return
      }
      default:
        // `pong` (unser Ping) und `response` (Bestätigungen von Abo und
        // Anwesenheit) braucht das SDK nicht — sie bleiben oben.
        return
    }
  }

  /** Eine Nachricht des Browsers. */
  fromDownstream(text: string): void {
    if (this.closed) return
    if (Buffer.byteLength(text) > LIVE_RELAY_LIMITS.inboundBytes) return
    const message = parse(text)
    if (!message) return
    switch (message.type) {
      case 'ping':
        this.toDownstream({ type: 'pong' })
        return
      case 'subscribe': {
        const { forward, accepted } = filterSubscribe(message.data, this.subscriptions.size)
        for (const [id, sub] of accepted) this.subscriptions.set(id, sub)
        if (forward.length) this.toUpstream({ type: 'subscribe', data: forward })
        return
      }
      case 'unsubscribe': {
        const ids = filterUnsubscribe(message.data, this.subscriptions)
        for (const id of ids) this.subscriptions.delete(id)
        if (ids.length) this.toUpstream({ type: 'unsubscribe', data: ids.map(subscriptionId => ({ subscriptionId })) })
        return
      }
      case 'presence': {
        const data = filterPresenceUpsert(message.data, this.scope)
        if (data) this.toUpstream({ type: 'presence', data })
        return
      }
      default:
        // `authentication` und alles Unbekannte: der Browser hat hier kein
        // Geheimnis zu melden — verworfen.
        return
    }
  }

  private toUpstream(message: unknown): void {
    const text = JSON.stringify(message)
    if (!this.upstreamReady || this.upstream?.readyState !== WebSocket.OPEN) {
      if (this.pending.length < PENDING_LIMIT) this.pending.push(text)
      return
    }
    this.upstream.send(text)
  }

  private toDownstream(message: unknown): void {
    if (this.closed) return
    try {
      this.peer.send(JSON.stringify(message))
    }
    catch (error) {
      this.fail('downstream_send_failed', error)
    }
  }

  private fail(reason: string, error?: unknown): void {
    if (this.closed) return
    logEvent('warn', 'live_relay.upstream_failed', {
      reason,
      ...(error ? { message: error instanceof Error ? error.message : String(error) } : {}),
    })
    this.shutdown(LIVE_CLOSE_UPSTREAM, reason)
  }

  /** Alles freigeben: Takt, oben, unten, Zähler. Mehrfach-Aufruf ist harmlos. */
  shutdown(code: number, reason: string): void {
    if (this.closed) return
    this.closed = true
    for (const timer of this.timers) clearTimeout(timer)
    this.timers = []
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = undefined
    const upstream = this.upstream
    this.upstream = null
    if (upstream && upstream.readyState < WebSocket.CLOSING) {
      try {
        upstream.close(1000)
      }
      catch (error) {
        logEvent('warn', 'live_relay.upstream_close_failed', { message: error instanceof Error ? error.message : String(error) })
      }
    }
    try {
      this.peer.close(code, reason)
    }
    catch (error) {
      logEvent('warn', 'live_relay.downstream_close_failed', { message: error instanceof Error ? error.message : String(error) })
    }
    if (connections.get(this.peer.id) === this) connections.delete(this.peer.id)
    const left = userCount(this.scope.userId) - 1
    if (left > 0) perUser.set(this.scope.userId, left)
    else perUser.delete(this.scope.userId)
  }
}

function parse(text: string): { type?: unknown, data?: unknown } | null {
  try {
    const value: unknown = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? value as { type?: unknown, data?: unknown } : null
  }
  catch {
    return null
  }
}

/** Beim Herunterfahren: alle Verbindungen sauber schließen. */
export function closeAllLiveRelays(): void {
  for (const connection of [...connections.values()]) connection.shutdown(1001, 'shutdown')
}

// ── Hooks für crossws ────────────────────────────────────────────────────

function reject(status: number): Response {
  return new Response(null, { status })
}

/**
 * Die Prüfungen beim Aufbau. `404` heißt „hier gibt es nichts" (Schalter aus,
 * keine eigene Domain, keine Fahrkarte) — dieselbe Antwort wie eine unbekannte
 * Route. Bei Erfolg liegt die Fahrkarte im Kontext der Verbindung.
 */
export async function liveRelayUpgrade(request: { url: string, headers: Headers, context?: Record<string, unknown> }): Promise<Response | undefined> {
  if (!liveRelayReady()) return reject(404)
  if (!liveOriginAllowed(request.headers.get('origin'), request.headers.get('host'))) return reject(403)
  if (connections.size >= LIVE_PROCESS_LIMIT) {
    logEvent('warn', 'live_relay.limit', { scope: 'process', limit: LIVE_PROCESS_LIMIT })
    return reject(503)
  }
  const result = await requestLiveTicket(request.headers)
  if ('status' in result) return reject(result.status === 401 || result.status === 403 || result.status === 429 || result.status === 503 ? result.status : 404)
  if (userCount(result.ticket.scope.userId) >= LIVE_USER_LIMIT) {
    logEvent('warn', 'live_relay.limit', { scope: 'user', limit: LIVE_USER_LIMIT })
    return reject(429)
  }
  if (request.context) request.context.liveTicket = result.ticket
  return undefined
}

/** Die Hooks der Route `/api/live/realtime`. */
export const liveRelayHooks = {
  upgrade: liveRelayUpgrade,
  open(peer: LivePeer) {
    const ticket = (peer.context as { liveTicket?: LiveTicket } | undefined)?.liveTicket
    if (!ticket) {
      peer.close(1011, 'no_ticket')
      return
    }
    new LiveRelayConnection(peer, ticket, defaultEnvironment()).start()
  },
  async message(peer: LivePeer, message: { text: () => string }) {
    connections.get(peer.id)?.fromDownstream(message.text())
  },
  close(peer: LivePeer) {
    connections.get(peer.id)?.shutdown(1000, 'closed')
  },
  error(peer: LivePeer) {
    connections.get(peer.id)?.shutdown(LIVE_CLOSE_UPSTREAM, 'downstream_error')
  },
}
