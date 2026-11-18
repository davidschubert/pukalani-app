import { vi } from 'vitest'
import { AppwriteException, ID } from 'node-appwrite'
import { assertBrandOwnerAccess } from '../../../brand/server/utils/brandOwnership'
import { listAllRows, listAllRowsIfTableExists } from '../../../core/server/utils/listAllRows'
import * as runLease from '../../../core/server/utils/runLease'
import { requireOwnedMarketProfile } from '../../server/utils/marketStore'

/**
 * GEMEINSAMES WERKZEUG DER ROLLEN-TESTS DES market-LAYERS (OPS-009, BT1 b).
 *
 * Jede `/api/market/profiles/<id>/…`-Route geht durch DIESELBE Kette
 * (`requireMarketProfile`): Produkt-Schalter, Beta-Zugang des Kontos
 * (`requireBrandAccess`, brand), Besitz des Brandings (`loadOwnedProfile` +
 * `assertBrandOwnerAccess`, brand) und — für das, was kostet —
 * die Freischaltung (`requireMarketUnlocked`). Diese Kette läuft hier ECHT:
 * nachgebaut ist nur die Datenbank (`fakeMarketDb`), eine kleine Ablage, die
 * JEDEN Zugriff mit Tabelle und Art mitschreibt.
 *
 * Damit lässt sich fragen, was die Rollen-Regel verlangt: wird ein fremdes
 * Konto abgewiesen, BEVOR es eine Zeile einer market-Tabelle oder fremde
 * brand-Daten berührt (`dataCallsBeyondGuard`)? Und antworten fremde und
 * unbekannte Branding-Ids gleich (beide 404 — ein 403 bestätigte die
 * Existenz)?
 *
 * DIE PERSONEN:
 *  - `guest`     — ohne Anmeldung;
 *  - `noAccess`  — angemeldet, bestätigt, aber ohne Beta-Zugang (die Instanz
 *                  steht auf `closed`); BESITZT `p-noaccess` — so weist die
 *                  Beta-Wache ab, nicht erst der Besitz;
 *  - `stranger`  — angemeldet, mit Beta-Zugang, aber NICHT Besitzer des
 *                  gefragten Brandings (fremdes Konto);
 *  - `owner`     — Besitzer des Brandings `p-own`.
 * Wer durch darf, schreibt jede Test-Datei AUSGESCHRIEBEN hin.
 */

export const OWNER_ID = 'u-owner'
export const STRANGER_ID = 'u-stranger'
export const NO_ACCESS_ID = 'u-noaccess'
/** Das Branding des Besitzers. */
export const OWN_PROFILE = 'p-own'
/** Ein Branding, das einem Dritten gehört (kein Konto aus der Liste oben). */
export const FOREIGN_PROFILE = 'p-foreign'
/** Eine Id, zu der es kein Branding gibt. */
export const UNKNOWN_PROFILE = 'p-unknown'
/**
 * Das EIGENE Branding des Kontos ohne Beta-Zugang (Zugang entzogen). An ihm
 * zeigt sich, dass die Beta-Wache selbst abweist — und nicht erst der Besitz.
 */
export const NO_ACCESS_PROFILE = 'p-noaccess'

/**
 * Welches Branding eine Person fragt, wenn es um IHR Recht geht: der
 * Besitzer und das Konto ohne Zugang ihr eigenes, alle anderen das des
 * Besitzers.
 */
export function targetProfileOf(who: MarketWho): string {
  return who === 'noAccess' ? NO_ACCESS_PROFILE : OWN_PROFILE
}

export type MarketWho = 'guest' | 'noAccess' | 'stranger' | 'owner'

const USER_OF: Record<Exclude<MarketWho, 'guest'>, string> = {
  owner: OWNER_ID,
  stranger: STRANGER_ID,
  noAccess: NO_ACCESS_ID,
}

// ── Die Ablage ──────────────────────────────────────────────────────────────

export type FakeRow = Record<string, unknown> & { $id: string }

export interface FakeCall {
  op: 'get' | 'list' | 'create' | 'update' | 'delete'
  table: string
  rowId?: string
  /** Bei `list`: die Werte der `equal`-Filter (Spalte ⇒ Werte). */
  equal?: Record<string, unknown[]>
}

export interface FakeMarketDb {
  tables: Map<string, Map<string, FakeRow>>
  calls: FakeCall[]
  tablesDB: Record<string, (args: Record<string, unknown>) => Promise<unknown>>
  rows(table: string): FakeRow[]
}

interface ParsedQuery {
  method: string
  attribute?: string
  values?: unknown[]
}

function parseQuery(raw: unknown): ParsedQuery | null {
  if (typeof raw !== 'string') return null
  try {
    return JSON.parse(raw) as ParsedQuery
  }
  catch {
    return null
  }
}

function notFound(type = 'document_not_found'): AppwriteException {
  return new AppwriteException('Not found', 404, type, '')
}

/**
 * Eine Ablage, die sich an den Stellen wie Appwrite verhält, auf die es hier
 * ankommt: 404 für eine fehlende Zeile, 409 für eine doppelte Id, `equal`-,
 * Sortier- und Mengen-Filter beim Auflisten. Eine Tabelle, die nicht im
 * Anfangsstand steht, gibt es trotzdem (leer) — die Rollen-Fragen hängen
 * nicht am Schema.
 */
export function fakeMarketDb(seed: Record<string, readonly FakeRow[]>): FakeMarketDb {
  const tables = new Map<string, Map<string, FakeRow>>()
  const calls: FakeCall[] = []
  let clock = Date.parse('2026-11-01T00:00:00.000Z')

  const table = (id: string): Map<string, FakeRow> => {
    let found = tables.get(id)
    if (!found) {
      found = new Map()
      tables.set(id, found)
    }
    return found
  }
  const stamp = (): string => new Date(clock += 1000).toISOString()

  for (const [id, rows] of Object.entries(seed)) {
    for (const row of rows) table(id).set(row.$id, { $createdAt: stamp(), $updatedAt: '', ...row })
  }

  const tablesDB = {
    async getRow(args: Record<string, unknown>) {
      const tableId = String(args.tableId)
      const rowId = String(args.rowId)
      calls.push({ op: 'get', table: tableId, rowId })
      const row = table(tableId).get(rowId)
      if (!row) throw notFound()
      return { ...row }
    },
    async listRows(args: Record<string, unknown>) {
      const tableId = String(args.tableId)
      const queries = (Array.isArray(args.queries) ? args.queries : []).map(parseQuery).filter(Boolean) as ParsedQuery[]
      const equal: Record<string, unknown[]> = {}
      let rows = [...table(tableId).values()]
      let limit = 25
      let cursorAfter: string | null = null
      for (const query of queries) {
        if (query.method === 'equal' && query.attribute) {
          equal[query.attribute] = query.values ?? []
          rows = rows.filter(row => (query.values ?? []).includes(row[query.attribute!]))
        }
        else if ((query.method === 'orderDesc' || query.method === 'orderAsc') && query.attribute) {
          const attribute = query.attribute
          const sign = query.method === 'orderDesc' ? -1 : 1
          rows = [...rows].sort((a, b) => (String(a[attribute] ?? '').localeCompare(String(b[attribute] ?? ''), 'en', { numeric: true })) * sign)
        }
        else if (query.method === 'limit') {
          limit = Number(query.values?.[0] ?? 25)
        }
        else if (query.method === 'cursorAfter') {
          cursorAfter = String(query.values?.[0] ?? '')
        }
      }
      calls.push({ op: 'list', table: tableId, equal })
      if (cursorAfter) {
        const index = rows.findIndex(row => row.$id === cursorAfter)
        rows = index >= 0 ? rows.slice(index + 1) : []
      }
      const page = rows.slice(0, limit).map(row => ({ ...row }))
      return { total: rows.length, rows: page }
    },
    async createRow(args: Record<string, unknown>) {
      const tableId = String(args.tableId)
      const rowId = String(args.rowId) === 'unique()' ? ID.unique() : String(args.rowId)
      calls.push({ op: 'create', table: tableId, rowId })
      if (table(tableId).has(rowId)) throw new AppwriteException('Row exists', 409, 'row_already_exists', '')
      const row: FakeRow = { ...(args.data as Record<string, unknown>), $id: rowId, $createdAt: stamp(), $updatedAt: '' }
      table(tableId).set(rowId, row)
      return { ...row }
    },
    async updateRow(args: Record<string, unknown>) {
      const tableId = String(args.tableId)
      const rowId = String(args.rowId)
      calls.push({ op: 'update', table: tableId, rowId })
      const row = table(tableId).get(rowId)
      if (!row) throw notFound()
      Object.assign(row, args.data as Record<string, unknown>, { $updatedAt: stamp() })
      return { ...row }
    },
    async upsertRow(args: Record<string, unknown>) {
      const tableId = String(args.tableId)
      const rowId = String(args.rowId)
      calls.push({ op: table(tableId).has(rowId) ? 'update' : 'create', table: tableId, rowId })
      const row = table(tableId).get(rowId)
      if (row) {
        Object.assign(row, args.data as Record<string, unknown>, { $updatedAt: stamp() })
        return { ...row }
      }
      const created: FakeRow = { ...(args.data as Record<string, unknown>), $id: rowId, $createdAt: stamp(), $updatedAt: '' }
      table(tableId).set(rowId, created)
      return { ...created }
    },
    async deleteRow(args: Record<string, unknown>) {
      const tableId = String(args.tableId)
      const rowId = String(args.rowId)
      calls.push({ op: 'delete', table: tableId, rowId })
      if (!table(tableId).delete(rowId)) throw notFound()
      return {}
    },
  }

  return {
    tables,
    calls,
    tablesDB,
    rows: (id: string) => [...table(id).values()],
  }
}

/**
 * DIE WELT DER ROLLEN-TESTS: zwei Brandings (eins des Besitzers, eins eines
 * Dritten), beide mit abgenommenem Kapitel B (sonst prüfte die Freischaltung
 * statt des Besitzes), Beta-Zugang für Besitzer und fremdes Konto, die
 * Instanz auf `closed`.
 */
export function marketWorld(extra: Record<string, readonly FakeRow[]> = {}): FakeMarketDb {
  const base: Record<string, FakeRow[]> = {
    app_config: [{ $id: 'global', brandAdmissionMode: 'closed', brandAiEnabled: true }],
    brand_access: [
      { $id: 'acc-owner', userId: OWNER_ID, revokedAt: null },
      { $id: 'acc-stranger', userId: STRANGER_ID, revokedAt: null },
    ],
    brand_profiles: [
      { $id: OWN_PROFILE, ownerType: 'user', ownerId: OWNER_ID, title: 'Eigene Marke', contentLocale: 'de' },
      { $id: FOREIGN_PROFILE, ownerType: 'user', ownerId: 'u-third', title: 'Fremde Marke', contentLocale: 'de' },
      { $id: NO_ACCESS_PROFILE, ownerType: 'user', ownerId: NO_ACCESS_ID, title: 'Marke ohne Zugang', contentLocale: 'de' },
    ],
    brand_steps: [
      { $id: `${OWN_PROFILE}_pvm`, profileId: OWN_PROFILE, stepKey: 'pvm', state: 'done' },
      { $id: `${FOREIGN_PROFILE}_pvm`, profileId: FOREIGN_PROFILE, stepKey: 'pvm', state: 'done' },
      { $id: `${NO_ACCESS_PROFILE}_pvm`, profileId: NO_ACCESS_PROFILE, stepKey: 'pvm', state: 'done' },
    ],
  }
  const merged: Record<string, readonly FakeRow[]> = { ...base }
  for (const [table, rows] of Object.entries(extra)) merged[table] = [...(base[table] ?? []), ...rows]
  return fakeMarketDb(merged)
}

/**
 * DIE ZUGRIFFE DER WACHE SELBST: der Aufnahme-Modus, die Beta-Zeile des
 * Kontos, die gefragte Branding-Zeile (gelesen, um den Besitz zu prüfen) und
 * die Freischaltung. Alles andere ist ein Zugriff auf Daten HINTER der Wache.
 */
export function dataCallsBeyondGuard(calls: readonly FakeCall[]): FakeCall[] {
  return calls.filter((call) => {
    if (call.op === 'get' && call.table === 'app_config') return false
    if (call.op === 'list' && call.table === 'brand_access') return false
    if (call.op === 'get' && call.table === 'brand_profiles') return false
    if ((call.op === 'get' || call.op === 'list') && call.table === 'brand_steps') return false
    return true
  })
}

/** Jeder schreibende Zugriff. */
export function writeCalls(calls: readonly FakeCall[]): FakeCall[] {
  return calls.filter(call => call.op === 'create' || call.op === 'update' || call.op === 'delete')
}

// ── Die Globals ─────────────────────────────────────────────────────────────

export interface KitHttpError extends Error {
  statusCode: number
  statusMessage: string
  data?: Record<string, unknown>
}

function kitCreateError(init: { status?: number, statusCode?: number, statusText?: string, statusMessage?: string, data?: Record<string, unknown> }): KitHttpError {
  const statusCode = init.status ?? init.statusCode ?? 500
  const statusMessage = init.statusText ?? init.statusMessage ?? ''
  return Object.assign(new Error(statusMessage), { statusCode, statusMessage, data: init.data })
}

export interface KitEvent {
  method: string
  path: string
  context: { user?: { $id: string, emailVerification: boolean, labels: string[] }, params: Record<string, string> }
  query: Record<string, string>
  body: unknown
  status?: number
  headers: Record<string, unknown>
}

/** Die Laufzeit, die eine Test-Datei für ihre Routen stellt. */
export interface KitRuntime {
  db: FakeMarketDb
  /** `pukalani.market` in der App-Config (Vorgabe: an). */
  marketConfig: Record<string, unknown>
}

/**
 * Nitros Auto-Imports, die die market-Routen und die Kette dahinter rufen —
 * die ECHTEN Hilfen, wo es sie als Modul gibt (Besitz-Prüfung, Listen,
 * Lauf-Sperre), sonst eine dünne h3-Fassung.
 */
export function installMarketGlobals(runtime: KitRuntime): void {
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('createError', kitCreateError)
  vi.stubGlobal('toH3Error', (error: unknown, message: string) => {
    if (error && typeof error === 'object' && 'statusCode' in error) return error
    if (error instanceof AppwriteException && error.code >= 400 && error.code < 500) {
      return kitCreateError({ status: error.code, statusText: message })
    }
    return kitCreateError({ status: 500, statusText: message })
  })
  vi.stubGlobal('logEvent', () => {})
  vi.stubGlobal('getRouterParam', (event: KitEvent, name: string) => event.context.params[name])
  vi.stubGlobal('getQuery', (event: KitEvent) => event.query)
  vi.stubGlobal('readBody', async (event: KitEvent) => event.body)
  vi.stubGlobal('setResponseStatus', (event: KitEvent, status: number) => {
    event.status = status
  })
  vi.stubGlobal('setResponseHeader', (event: KitEvent, name: string, value: unknown) => {
    event.headers[name] = value
  })
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
  vi.stubGlobal('useAppConfig', () => ({ pukalani: { market: runtime.marketConfig } }))
  vi.stubGlobal('createAdminClient', () => ({ tablesDB: runtime.db.tablesDB }))
  vi.stubGlobal('assertBrandOwnerAccess', assertBrandOwnerAccess)
  vi.stubGlobal('requireOwnedMarketProfile', requireOwnedMarketProfile)
  vi.stubGlobal('listAllRows', listAllRows)
  vi.stubGlobal('listAllRowsIfTableExists', listAllRowsIfTableExists)
  vi.stubGlobal('appwriteRunLeaseStore', runLease.appwriteRunLeaseStore)
  vi.stubGlobal('acquireRunLease', runLease.acquireRunLease)
  vi.stubGlobal('touchRunLease', runLease.touchRunLease)
  vi.stubGlobal('finishRunLease', runLease.finishRunLease)
  vi.stubGlobal('dropRunLease', runLease.dropRunLease)
  vi.stubGlobal('keepRunLeaseAlive', runLease.keepRunLeaseAlive)
  vi.stubGlobal('runDetached', runLease.runDetached)
}

// ── Ein Aufruf ──────────────────────────────────────────────────────────────

export interface MarketProbe {
  who: MarketWho
  method?: string
  profileId?: string
  cid?: string
  body?: unknown
  query?: Record<string, string>
}

export interface MarketRun {
  /** HTTP-Status: der geworfene, sonst der gesetzte, sonst 200. */
  status: number
  /** `data.code` einer Ablehnung, wenn es einen gibt. */
  code: string
  result: unknown
  calls: FakeCall[]
}

export function kitEvent(probe: MarketProbe): KitEvent {
  const params: Record<string, string> = { id: probe.profileId ?? OWN_PROFILE }
  if (probe.cid !== undefined) params.cid = probe.cid
  return {
    method: probe.method ?? 'GET',
    path: '/api/market',
    context: {
      ...(probe.who === 'guest'
        ? {}
        : { user: { $id: USER_OF[probe.who], emailVerification: true, labels: [] } }),
      params,
    },
    query: probe.query ?? {},
    body: probe.body,
    headers: {},
  }
}

/** Den ECHTEN Handler laden und als diese Person ausführen. */
export async function runMarketRoute(
  db: FakeMarketDb,
  load: () => Promise<{ default: unknown }>,
  probe: MarketProbe,
): Promise<MarketRun> {
  const handler = (await load()).default as (event: KitEvent) => Promise<unknown>
  const event = kitEvent(probe)
  const before = db.calls.length
  try {
    const result = await handler(event)
    return { status: event.status ?? 200, code: '', result, calls: db.calls.slice(before) }
  }
  catch (error) {
    const statusCode = (error as { statusCode?: unknown }).statusCode
    if (typeof statusCode !== 'number') throw error
    const code = (error as { data?: { code?: unknown } }).data?.code
    return { status: statusCode, code: typeof code === 'string' ? code : '', result: null, calls: db.calls.slice(before) }
  }
}
