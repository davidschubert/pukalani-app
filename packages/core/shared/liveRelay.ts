/**
 * LIVE-VERBINDUNG ÜBER UNSEREN SERVER — die puren Regeln (PK1 E1d, Plan
 * `docs/plans/PUKALANI-KONTO-E1.md` § 13.3 Weg 3).
 *
 * Auf der EIGENEN DOMAIN einer Community (Modus `write`) hält der Browser nur
 * seine Karte (HttpOnly). Er spricht das Realtime-Protokoll des Web-SDK
 * (`appwrite@29`) mit UNSEREM Host (`/api/live/realtime`); der Server hält das
 * JWT der Sitzung der Karte und spricht oben mit Appwrite. Was durchgeht,
 * entscheiden die Funktionen hier — der Dienst (`server/utils/liveRelay.ts`)
 * rechnet nichts selbst.
 *
 * MASSSTAB: was durch die Weiterleitung kommt, kann nicht mehr als die Karte —
 * nur lesen, nur diese Community, nur dieses Konto.
 *
 *  - Kanäle: Zeilen einer Tabelle (`tablesdb.<db>.tables.<t>.rows[.<id>]`),
 *    Anwesenheit (`presences[.<id>]`) und der Konto-Kanal (`account`). Alles
 *    andere (Dateien, Teams, Funktionen, globale `rows`/`documents`, die alten
 *    `databases.*`-Formen) kommt nicht durch.
 *  - Ereignisse: eine Zeile nur mit `communityId` DIESER Community — oder,
 *    ohne die Spalte, nur wenn sie für alle lesbar ist (`read("any")`, das
 *    sähe ein Gast direkt bei Appwrite auch). Eine Anwesenheit nur mit
 *    `metadata.tenantId` dieser Community. Vom Konto-Kanal nur die
 *    Ereignis-NAMEN (die Seite prüft daraufhin `/api/auth/me`), der Inhalt
 *    bleibt leer — Sitzungen und Einstellungen des Kontos verlassen den Server
 *    nicht.
 *  - Schreiben: nur die eigene Anwesenheit, mit genau den Rechten und der
 *    Community, die der Server für diese Seite rechnet, nur bekannten
 *    Feldern, Name und Bild vom Server.
 *  - Fail-closed: was sich nicht einordnen lässt, wird verworfen.
 */
import { presencePermissions } from './presencePermissions'

/** Pfad der Weiterleitung. Das SDK hängt `/realtime` an den Endpunkt. */
export const LIVE_RELAY_PATH = '/api/live/realtime'
/** Was der Browser als Realtime-Endpunkt setzt (ohne `/realtime`). */
export const LIVE_RELAY_ENDPOINT_PATH = '/api/live'

/** Die Seite, für die eine Verbindung gilt — vom Server aus der Karte. */
export interface LiveRelayScope {
  userId: string
  /** `communities.$id` — Lese-Publikum (`read("label:<communityId>")`). */
  communityId: string
  /** Wert der Spalte `communityId` und von `metadata.tenantId` (Pool: `tenant.tenantId`). */
  tenantId: string
}

export type LiveChannelKind = 'rows' | 'presences' | 'account'

/** Eine Appwrite-Kennung als Kanal-Teil (ohne Punkt — der trennt die Teile). */
const SEG = '[A-Za-z0-9][A-Za-z0-9_-]{0,35}'
const ROWS = new RegExp(`^tablesdb\\.${SEG}\\.tables\\.${SEG}\\.rows(?:\\.${SEG})?$`)
const PRESENCES = new RegExp(`^presences(?:\\.${SEG})?$`)

/** Welche Art Kanal ist das? `null` ⇒ nicht erlaubt. */
export function liveChannelKind(channel: unknown): LiveChannelKind | null {
  if (typeof channel !== 'string' || channel.length > 200) return null
  if (channel === 'account') return 'account'
  if (PRESENCES.test(channel)) return 'presences'
  if (ROWS.test(channel)) return 'rows'
  return null
}

/** Grenzen je Verbindung (Last und Speicher). */
export const LIVE_RELAY_LIMITS = {
  /** Abos je Verbindung. */
  subscriptions: 64,
  /** Kanäle je Abo. */
  channelsPerSubscription: 8,
  /** Filter je Abo. */
  queriesPerSubscription: 8,
  /** Länge eines Filters. */
  queryLength: 1024,
  /** Größte Nachricht vom Browser (Bytes). */
  inboundBytes: 16 * 1024,
} as const

export interface LiveSubscribeItem {
  subscriptionId: string
  channels: string[]
  queries: string[]
}

/** Ein angenommenes Abo: seine eine Kanal-Art und seine Kanäle. */
export interface AcceptedSubscription {
  kind: LiveChannelKind
  channels: string[]
}

/**
 * Ein `subscribe` des Browsers prüfen. Je Eintrag: alle Kanäle erlaubt und
 * von EINER Art (der Core abonniert je Abo genau einen Kanal), Id und Filter
 * in Grenzen. Ein Eintrag, der das nicht erfüllt, fällt ganz weg — nie halb.
 * `existing` zählt die schon bestehenden Abos (Grenze je Verbindung).
 */
export function filterSubscribe(data: unknown, existing: number): { forward: LiveSubscribeItem[], accepted: Map<string, AcceptedSubscription> } {
  const forward: LiveSubscribeItem[] = []
  const accepted = new Map<string, AcceptedSubscription>()
  if (!Array.isArray(data)) return { forward, accepted }
  for (const raw of data) {
    if (existing + accepted.size >= LIVE_RELAY_LIMITS.subscriptions) break
    if (!raw || typeof raw !== 'object') continue
    const item = raw as { subscriptionId?: unknown, channels?: unknown, queries?: unknown }
    if (typeof item.subscriptionId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(item.subscriptionId)) continue
    if (!Array.isArray(item.channels) || item.channels.length === 0 || item.channels.length > LIVE_RELAY_LIMITS.channelsPerSubscription) continue
    const kinds = new Set(item.channels.map(liveChannelKind))
    if (kinds.size !== 1 || kinds.has(null)) continue
    const queries = item.queries === undefined ? [] : item.queries
    if (!Array.isArray(queries) || queries.length > LIVE_RELAY_LIMITS.queriesPerSubscription) continue
    if (!queries.every(q => typeof q === 'string' && q.length <= LIVE_RELAY_LIMITS.queryLength)) continue
    const channels = item.channels as string[]
    forward.push({ subscriptionId: item.subscriptionId, channels, queries: queries as string[] })
    accepted.set(item.subscriptionId, { kind: [...kinds][0] as LiveChannelKind, channels })
  }
  return { forward, accepted }
}

/** Ein `unsubscribe` des Browsers: nur Ids, die diese Verbindung kennt. */
export function filterUnsubscribe(data: unknown, known: ReadonlyMap<string, unknown>): string[] {
  if (!Array.isArray(data)) return []
  const ids: string[] = []
  for (const raw of data) {
    const id = raw && typeof raw === 'object' ? (raw as { subscriptionId?: unknown }).subscriptionId : undefined
    if (typeof id === 'string' && known.has(id)) ids.push(id)
  }
  return ids
}

function hasReadAny(permissions: unknown): boolean {
  return Array.isArray(permissions) && permissions.some(p => p === 'read("any")')
}

/** Darf der Inhalt eines Ereignisses dieser Art an diese Seite? */
export function livePayloadAllowed(kind: LiveChannelKind, payload: unknown, scope: LiveRelayScope): boolean {
  if (kind === 'account') return true // Inhalt wird ohnehin geleert (s. `sanitizeLiveEvent`)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const record = payload as Record<string, unknown>
  if (kind === 'presences') {
    const meta = record.metadata
    if (!meta || typeof meta !== 'object') return false
    const tenantId = (meta as Record<string, unknown>).tenantId
    return typeof tenantId === 'string' && tenantId !== '' && tenantId === scope.tenantId
  }
  // rows
  if ('communityId' in record) {
    return typeof record.communityId === 'string' && record.communityId !== '' && record.communityId === scope.tenantId
  }
  return hasReadAny(record.$permissions)
}

/** Ein Ereignis, wie es oben ankommt (`type: 'event'`, `data`). */
export interface LiveEventData {
  channels: string[]
  events: string[]
  payload: unknown
  timestamp?: unknown
  subscriptions: string[]
}

/**
 * Ein Ereignis von oben für unten zuschneiden. Ergebnis: höchstens eine
 * Nachricht je Kanal-Art (die Abos einer Art teilen denselben Zuschnitt),
 * jede nur mit den eigenen, angenommenen Abo-Ids. Leer ⇒ nichts senden.
 */
export function sanitizeLiveEvent(
  data: unknown,
  subscriptions: ReadonlyMap<string, AcceptedSubscription>,
  scope: LiveRelayScope,
): LiveEventData[] {
  if (!data || typeof data !== 'object') return []
  const raw = data as Record<string, unknown>
  if (!Array.isArray(raw.channels) || !Array.isArray(raw.events) || !Array.isArray(raw.subscriptions)) return []
  const channels = raw.channels.filter((c): c is string => typeof c === 'string')
  const events = raw.events.filter((e): e is string => typeof e === 'string')
  const byKind = new Map<LiveChannelKind, string[]>()
  for (const id of raw.subscriptions) {
    if (typeof id !== 'string') continue
    const sub = subscriptions.get(id)
    if (!sub) continue
    // Das Ereignis muss auf einem Kanal dieses Abos liegen — sonst hätte
    // Appwrite es dem Abo nicht zugeordnet; wir glauben das nicht blind.
    if (!sub.channels.some(c => channels.includes(c))) continue
    const list = byKind.get(sub.kind) ?? []
    list.push(id)
    byKind.set(sub.kind, list)
  }
  const out: LiveEventData[] = []
  for (const [kind, ids] of byKind) {
    if (!livePayloadAllowed(kind, raw.payload, scope)) continue
    out.push({
      channels: channels.filter(c => liveChannelKind(c) === kind),
      events,
      payload: kind === 'account' ? {} : raw.payload,
      ...(raw.timestamp !== undefined ? { timestamp: raw.timestamp } : {}),
      subscriptions: ids,
    })
  }
  return out
}

/**
 * Felder, die die eigene Anwesenheit tragen darf (Regel
 * `.claude/rules/appwrite-presence.md`): Texte bis `PRESENCE_TEXT_MAX`,
 * Wahrheitswerte oder leer. `userName`/`avatarUrl` setzt der Server aus dem
 * Konto, `tenantId` aus der Seite — was der Browser dort schickt, zählt nicht.
 */
const PRESENCE_FIELDS = new Set(['scope', 'action', 'typing', 'page', 'replyingTo', 'near', 'away'])
const PRESENCE_TEXT_MAX = 512

/**
 * Die eigene Anwesenheit (`type: 'presence'`) prüfen: Id = Konto, Rechte
 * GENAU wie der Server sie für diese Seite rechnet (`presencePermissions`),
 * `metadata.tenantId` = diese Community, sonst nur bekannte Felder; Name und
 * Bild kommen vom Server (`profile`). Sonst `null` (verworfen).
 */
export function filterPresenceUpsert(
  data: unknown,
  scope: LiveRelayScope,
  profile: { userName: string, avatarUrl?: string },
): Record<string, unknown> | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const raw = data as Record<string, unknown>
  if (raw.presenceId !== scope.userId) return null
  if (typeof raw.status !== 'string' || raw.status.length > 64) return null
  const expected = presencePermissions(true, scope.communityId, scope.userId)
  const given = raw.permissions
  if (!Array.isArray(given) || given.length !== expected.length) return null
  if (!expected.every(p => given.includes(p))) return null
  const meta = raw.metadata
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  if ((meta as Record<string, unknown>).tenantId !== scope.tenantId) return null
  const metadata: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(meta as Record<string, unknown>)) {
    if (!PRESENCE_FIELDS.has(key)) continue
    if (value === null || typeof value === 'boolean') metadata[key] = value
    else if (typeof value === 'string' && value.length <= PRESENCE_TEXT_MAX) metadata[key] = value
  }
  metadata.userName = profile.userName
  if (profile.avatarUrl) metadata.avatarUrl = profile.avatarUrl
  metadata.tenantId = scope.tenantId
  return { presenceId: scope.userId, status: raw.status, permissions: expected, metadata }
}

/** Die `connected`-Nachricht für unten: keine Konto-Daten, nur „angemeldet". */
export function connectedFrame(userId: string): { type: 'connected', data: { channels: string[], subscriptions: Record<string, string>, user: { $id: string } } } {
  return { type: 'connected', data: { channels: [], subscriptions: {}, user: { $id: userId } } }
}

/**
 * Herkunft des Browsers: nur dieselbe Adresse wie die Anfrage (Schutz gegen
 * eine fremde Seite, die mit dem Cookie des Besuchers eine Verbindung
 * öffnet). Ohne `Origin` ⇒ nein (jeder Browser schickt ihn beim WebSocket).
 */
export function liveOriginAllowed(origin: string | null | undefined, host: string | null | undefined): boolean {
  if (!origin || !host) return false
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase()
  }
  catch {
    return false
  }
}
