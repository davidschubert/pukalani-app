import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import * as instancePermission from '../../../core/server/utils/requirePermission'
import * as brandAccess from '../../server/utils/brandAccess'
import * as brandOwnership from '../../server/utils/brandOwnership'
import { BRAND_STEP_KEYS } from '../../shared/slotRegistry'

/**
 * GEMEINSAMES WERKZEUG DER ROLLEN-TESTS DES brand-LAYERS (OPS-009, BT1 b).
 *
 * Die Routen des Markenberaters laufen hier mit ihren ECHTEN Wachen:
 * `requireBrandAccess` (Beta-Zugang), `assertBrandOwnerAccess` über
 * `loadOwnedProfile` (Besitz der Marke) und `requirePermission` (Betreiber).
 * Nachgebaut ist nur Appwrite — eine kleine Ablage mit Tabellen und Dateien,
 * die jeden Zugriff mitschreibt. Damit lässt sich zeigen, dass eine Ablehnung
 * kommt, BEVOR fremde Inhalte gelesen oder irgendetwas geschrieben wird.
 *
 * DIE PERSONEN (Konto-Ids fest, Erwartungen stehen in den Tests):
 *  - `guest`     — kein Konto.
 *  - `noAccess`  — verifiziertes Konto ohne `brand_access`-Zeile (Beta zu).
 *  - `revoked`   — hatte Zugang, die Zeile trägt `revokedAt`.
 *  - `stranger`  — MIT Zugang und eigener Marke `p-fremd`, aber nicht Besitzer
 *                  der Marke `p-eigen`.
 *  - `owner`     — mit Zugang, Besitzer von `p-eigen`.
 *  - `operator`  — Betreiber (globales Label `admin`), MIT Zugang zur
 *                  Werkstatt, aber Besitzer keiner Marke. Der Betreiber-Titel
 *                  öffnet fremde Marken in der Werkstatt NICHT.
 *  - `staff`     — Karten-Mitglied (globales Label `moderator`), ohne Zugang.
 *  - `member`    — Konto mit einer Community-Rolle (Label einer Community),
 *                  kein Betreiber, ohne Zugang.
 */

export type BrandWho = 'guest' | 'noAccess' | 'revoked' | 'stranger' | 'owner' | 'operator' | 'staff' | 'member'

export const USER_IDS: Record<Exclude<BrandWho, 'guest'>, string> = {
  noAccess: 'u-ohne-zugang',
  revoked: 'u-entzogen',
  stranger: 'u-fremd',
  owner: 'u-besitzer',
  operator: 'u-betreiber',
  staff: 'u-karte',
  member: 'u-community',
}

/** Die Marke des Besitzers, die fremde Marke und eine Id, die es nicht gibt. */
export const OWN_PROFILE = 'p-eigen'
export const FOREIGN_PROFILE = 'p-fremd'
export const UNKNOWN_PROFILE = 'p-unbekannt'

const LABELS: Record<Exclude<BrandWho, 'guest'>, string[]> = {
  noAccess: [],
  revoked: [],
  stranger: [],
  owner: [],
  operator: ['admin'],
  staff: ['moderator'],
  member: ['c-a'],
}

export const STAMP = '2026-09-01T10:00:00.000Z'

// ── Die Ablage ──────────────────────────────────────────────────────────────

export interface FakeRow {
  $id: string
  $tableId: string
  $createdAt: string
  $updatedAt: string
  [key: string]: unknown
}

export interface FakeCall {
  kind: 'read' | 'write'
  method: string
  /** Tabelle oder, bei Dateien, `bucket:<id>`. */
  target: string
  id?: string
}

interface ParsedQuery {
  method: string
  attribute?: string
  values?: unknown[]
}

function compare(a: unknown, b: unknown): number {
  return String(a ?? '').localeCompare(String(b ?? ''))
}

function matches(row: FakeRow, query: ParsedQuery): boolean {
  const attribute = String(query.attribute ?? '')
  const value = row[attribute]
  const values = query.values ?? []
  switch (query.method) {
    case 'equal': return values.includes(value)
    case 'notEqual': return !values.includes(value)
    case 'isNull': return value === null || value === undefined
    case 'isNotNull': return value !== null && value !== undefined
    case 'greaterThan': return compare(value, values[0]) > 0
    case 'greaterThanEqual': return compare(value, values[0]) >= 0
    case 'lessThan': return compare(value, values[0]) < 0
    case 'lessThanEqual': return compare(value, values[0]) <= 0
    case 'contains': return values.some(entry => String(value ?? '').includes(String(entry)))
    case 'startsWith': return String(value ?? '').startsWith(String(values[0] ?? ''))
    default: return true
  }
}

const SHAPING = new Set(['limit', 'offset', 'orderAsc', 'orderDesc', 'cursorAfter', 'cursorBefore', 'select'])

export interface FakeBrandAppwrite {
  tablesDB: Record<string, (args: Record<string, unknown>) => Promise<unknown>>
  storage: Record<string, (args: Record<string, unknown>) => Promise<unknown>>
  rows: FakeRow[]
  files: Map<string, Buffer>
  calls: FakeCall[]
  /** Wie oft der Admin-Client geholt wurde. */
  opened: () => number
  /** Vom nachgebauten `createAdminClient` gerufen. */
  open: () => void
  writes: () => FakeCall[]
  /**
   * Zugriffe auf INHALTE: alles außer den Fragen der Wachen — die
   * `brand_access`-Zeile, der Aufnahme-Modus (`app_config`) und das Lesen
   * der Marken-Zeile selbst (ohne sie lässt sich der Besitz nicht prüfen).
   */
  contentTouches: () => FakeCall[]
  /** Wirft beim nächsten Zugriff auf diese Tabelle (Lesefehler erzwingen). */
  failOn: Set<string>
}

const GUARD_READS = new Set(['brand_access', 'app_config', 'brand_profiles'])

export function fakeBrandAppwrite(seed: FakeRow[] = [], files: Record<string, Buffer> = {}): FakeBrandAppwrite {
  const rows = seed.map(row => ({ ...row }))
  const store = new Map(Object.entries(files))
  const calls: FakeCall[] = []
  const failOn = new Set<string>()
  let opened = 0

  const note = (call: FakeCall) => {
    calls.push(call)
    if (failOn.has(call.target)) throw new AppwriteException('Server error', 500)
  }
  const find = (tableId: string, rowId: string) => rows.find(row => row.$tableId === tableId && row.$id === rowId)

  const tablesDB = {
    listRows: async ({ tableId, queries }: Record<string, unknown>) => {
      note({ kind: 'read', method: 'listRows', target: String(tableId) })
      const parsed = ((queries as string[] | undefined) ?? []).map(query => JSON.parse(query) as ParsedQuery)
      let found = rows.filter(row => row.$tableId === tableId && parsed.every(query => SHAPING.has(query.method) || matches(row, query)))
      for (const order of parsed.filter(query => query.method === 'orderAsc' || query.method === 'orderDesc')) {
        const attribute = String(order.attribute ?? '')
        found = [...found].sort((a, b) => (order.method === 'orderAsc' ? 1 : -1) * compare(a[attribute], b[attribute]))
      }
      const total = found.length
      const cursor = parsed.find(query => query.method === 'cursorAfter')
      if (cursor) {
        const at = found.findIndex(row => row.$id === cursor.values?.[0])
        found = at < 0 ? [] : found.slice(at + 1)
      }
      const offset = parsed.find(query => query.method === 'offset')
      if (offset) found = found.slice(Number(offset.values?.[0] ?? 0))
      const limit = parsed.find(query => query.method === 'limit')
      if (limit) found = found.slice(0, Number(limit.values?.[0] ?? found.length))
      return { rows: found.map(row => ({ ...row })), total }
    },
    getRow: async ({ tableId, rowId }: Record<string, unknown>) => {
      note({ kind: 'read', method: 'getRow', target: String(tableId), id: String(rowId) })
      const row = find(String(tableId), String(rowId))
      if (!row) throw new AppwriteException('Row not found', 404)
      return { ...row }
    },
    createRow: async ({ tableId, rowId, data }: Record<string, unknown>) => {
      note({ kind: 'write', method: 'createRow', target: String(tableId), id: String(rowId) })
      if (find(String(tableId), String(rowId))) throw new AppwriteException('Row already exists', 409)
      const now = new Date().toISOString()
      const row: FakeRow = {
        $id: String(rowId),
        $tableId: String(tableId),
        $createdAt: now,
        $updatedAt: now,
        ...(data as Record<string, unknown>),
      }
      rows.push(row)
      return { ...row }
    },
    upsertRow: async ({ tableId, rowId, data }: Record<string, unknown>) => {
      note({ kind: 'write', method: 'upsertRow', target: String(tableId), id: String(rowId) })
      const row = find(String(tableId), String(rowId))
      if (row) {
        Object.assign(row, data)
        return { ...row }
      }
      const now = new Date().toISOString()
      const created: FakeRow = { $id: String(rowId), $tableId: String(tableId), $createdAt: now, $updatedAt: now, ...(data as Record<string, unknown>) }
      rows.push(created)
      return { ...created }
    },
    updateRow: async ({ tableId, rowId, data }: Record<string, unknown>) => {
      note({ kind: 'write', method: 'updateRow', target: String(tableId), id: String(rowId) })
      const row = find(String(tableId), String(rowId))
      if (!row) throw new AppwriteException('Row not found', 404)
      Object.assign(row, data, { $updatedAt: new Date().toISOString() })
      return { ...row }
    },
    deleteRow: async ({ tableId, rowId }: Record<string, unknown>) => {
      note({ kind: 'write', method: 'deleteRow', target: String(tableId), id: String(rowId) })
      const at = rows.findIndex(row => row.$tableId === tableId && row.$id === rowId)
      if (at < 0) throw new AppwriteException('Row not found', 404)
      rows.splice(at, 1)
      return {}
    },
  }

  const key = (bucketId: unknown, fileId: unknown) => `${String(bucketId)}/${String(fileId)}`
  const storage = {
    getFileView: async ({ bucketId, fileId }: Record<string, unknown>) => {
      note({ kind: 'read', method: 'getFileView', target: `bucket:${String(bucketId)}`, id: String(fileId) })
      const bytes = store.get(key(bucketId, fileId))
      if (!bytes) throw new AppwriteException('File not found', 404)
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    },
    getFile: async ({ bucketId, fileId }: Record<string, unknown>) => {
      note({ kind: 'read', method: 'getFile', target: `bucket:${String(bucketId)}`, id: String(fileId) })
      if (!store.has(key(bucketId, fileId))) throw new AppwriteException('File not found', 404)
      return { $id: String(fileId) }
    },
    createFile: async ({ bucketId, fileId }: Record<string, unknown>) => {
      note({ kind: 'write', method: 'createFile', target: `bucket:${String(bucketId)}`, id: String(fileId) })
      store.set(key(bucketId, fileId), Buffer.from([1]))
      return { $id: String(fileId) }
    },
    deleteFile: async ({ bucketId, fileId }: Record<string, unknown>) => {
      note({ kind: 'write', method: 'deleteFile', target: `bucket:${String(bucketId)}`, id: String(fileId) })
      if (!store.delete(key(bucketId, fileId))) throw new AppwriteException('File not found', 404)
      return {}
    },
  }

  return {
    tablesDB: tablesDB as unknown as FakeBrandAppwrite['tablesDB'],
    storage: storage as unknown as FakeBrandAppwrite['storage'],
    rows,
    files: store,
    calls,
    opened: () => opened,
    writes: () => calls.filter(call => call.kind === 'write'),
    contentTouches: () => calls.filter(call => !(call.kind === 'read' && GUARD_READS.has(call.target))),
    failOn,
    open: () => {
      opened += 1
    },
  }
}

// ── Probe-Zeilen ────────────────────────────────────────────────────────────

function row(tableId: string, id: string, data: Record<string, unknown>): FakeRow {
  return { $id: id, $tableId: tableId, $createdAt: STAMP, $updatedAt: STAMP, ...data }
}

/** Eine Marke, wie die Migration sie speichert — offen bis in Schicht 3. */
export function profileRow(id: string, ownerId: string, overrides: Record<string, unknown> = {}): FakeRow {
  return row('brand_profiles', id, {
    createdByUserId: ownerId,
    ownerType: 'user',
    ownerId,
    title: `Marke ${id}`,
    contentLocale: 'de',
    pathKind: 'new',
    relaunchScope: null,
    hasName: true,
    team: 'solo',
    subBrands: 'no',
    namingOpted: false,
    websiteUrl: `https://${id}.example.test`,
    industry: 'Kaffee',
    about: `GEHEIM-${id}-about`,
    audience: '',
    designUnlockedAt: STAMP,
    designUnlockedBy: 'u-betreiber',
    derivationUnlockedAt: STAMP,
    derivationUnlockedVia: 'operator',
    derivationUnlockedBy: 'u-betreiber',
    progressPct: 50,
    currentStepKey: 'result',
    lastActivityAt: STAMP,
    storyBody: null,
    storyMeta: null,
    ...overrides,
  })
}

/** Die Kapitel-Zeilen einer Marke — alle abgeschlossen, also alle betretbar. */
export function stepRows(profileId: string): FakeRow[] {
  return BRAND_STEP_KEYS.map(stepKey => row('brand_steps', `${profileId}_${stepKey}`, {
    profileId,
    stepKey,
    state: 'done',
    slots: '{}',
    generations: '{"items":[],"count":0}',
    inputHash: '',
    revision: 1,
    activeSeconds: 0,
    confidence: null,
    startedAt: STAMP,
    completedAt: STAMP,
    restartedAt: null,
  }))
}

export function accessRow(userId: string, overrides: Record<string, unknown> = {}): FakeRow {
  return row('brand_access', `a-${userId}`, { userId, grantedVia: 'operator', inviteId: null, revokedAt: null, ...overrides })
}

export function messageRow(id: string, profileId: string, body: string): FakeRow {
  return row('brand_messages', id, { profileId, stepKey: 'dna', sessionKey: '', role: 'user', body, parts: null, generationId: null })
}

export function inspirationRow(id: string, profileId: string): FakeRow {
  return row('brand_inspiration', id, { profileId, area: 'color', note: `GEHEIM-${id}`, number: 1, filename: `${id}.png`, reading: null })
}

export function draftRow(id: string, profileId: string): FakeRow {
  return row('brand_mark_drafts', id, { profileId, model: 'm', promptHash: 'h', kept: false, title: `Entwurf ${id}` })
}

export function shareRow(id: string, profileId: string): FakeRow {
  return row('brand_shares', id, {
    profileId,
    tokenHash: `hash-${id}`,
    expiresAt: '2999-01-01T00:00:00.000Z',
    revokedAt: null,
    createdByUserId: 'x',
  })
}

/** Ein PNG-Kopf — genug, damit die Bild-Erkennung „PNG" sagt. */
export const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])

/**
 * Die Grundwelt: Modus `closed`, Zugangs-Zeilen für den Fremden, den Besitzer,
 * den Betreiber (und eine entzogene), zwei Marken mit allen Kapiteln.
 */
export function brandWorld(extra: FakeRow[] = [], files: Record<string, Buffer> = {}): FakeBrandAppwrite {
  return fakeBrandAppwrite([
    row('app_config', 'global', { brandAdmissionMode: 'closed' }),
    accessRow(USER_IDS.stranger),
    accessRow(USER_IDS.owner),
    accessRow(USER_IDS.operator),
    accessRow(USER_IDS.revoked, { revokedAt: STAMP }),
    profileRow(OWN_PROFILE, USER_IDS.owner),
    profileRow(FOREIGN_PROFILE, USER_IDS.stranger),
    ...stepRows(OWN_PROFILE),
    ...stepRows(FOREIGN_PROFILE),
    ...extra,
  ], files)
}

// ── Eine Route ausführen ────────────────────────────────────────────────────

export interface BrandRouteCall {
  who: BrandWho
  db: FakeBrandAppwrite
  params?: Record<string, string>
  query?: Record<string, unknown>
  body?: unknown
  /** Teile eines `multipart/form-data`-Rumpfs (Upload). */
  multipart?: { name: string, filename?: string, type?: string, data: Buffer }[]
  /** Weitere Felder am Konto (z. B. `emailVerification: false`). */
  userFields?: Record<string, unknown>
  /** Zusätzliche Globals, die eine Route braucht. */
  globals?: Record<string, unknown>
}

export interface ThrownLike {
  status?: number
  statusText?: string
  data?: { code?: string }
}

export interface BrandRouteRun {
  status: number
  error?: ThrownLike
  result?: unknown
  headers: Record<string, unknown>
}

function makeError(init: Record<string, unknown>): Error {
  return Object.assign(new Error(String(init.statusText ?? 'Error')), init, { statusCode: init.status })
}

export function userOf(who: BrandWho, fields: Record<string, unknown> = {}): Record<string, unknown> | undefined {
  if (who === 'guest') return undefined
  return {
    $id: USER_IDS[who],
    name: 'Testperson',
    email: `${who}@example.test`,
    emailVerification: true,
    labels: [...LABELS[who]],
    ...fields,
  }
}

/**
 * Führt einen ECHTEN Routen-Handler aus. Nitros Auto-Imports werden als
 * Globals gestellt: die Wachen echt, Appwrite aus der Ablage.
 */
export async function callBrandRoute(
  load: () => Promise<{ default: unknown }>,
  call: BrandRouteCall,
): Promise<BrandRouteRun> {
  const headers: Record<string, unknown> = {}
  let status = 200
  const db = call.db

  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('createError', makeError)
  vi.stubGlobal('logEvent', () => {})
  vi.stubGlobal('toH3Error', (error: unknown) => error)
  vi.stubGlobal('getRouterParam', (_e: unknown, name: string) => call.params?.[name])
  vi.stubGlobal('getQuery', () => call.query ?? {})
  // Wie h3: ein Wurf des Schemas wird zu 400.
  const validated = (input: unknown, parse: (value: unknown) => unknown) => {
    try {
      return parse(input)
    }
    catch {
      throw makeError({ status: 400, statusText: 'Validation Error' })
    }
  }
  vi.stubGlobal('getValidatedQuery', async (_e: unknown, parse: (q: unknown) => unknown) => validated(call.query ?? {}, parse))
  vi.stubGlobal('readBody', async () => call.body ?? {})
  vi.stubGlobal('readValidatedBody', async (_e: unknown, parse: (b: unknown) => unknown) => validated(call.body ?? {}, parse))
  vi.stubGlobal('readMultipartFormData', async () => call.multipart)
  vi.stubGlobal('setHeader', (_e: unknown, name: string, value: unknown) => {
    headers[name] = value
  })
  vi.stubGlobal('setResponseStatus', (_e: unknown, code: number) => {
    status = code
  })
  vi.stubGlobal('useRuntimeConfig', () => ({ appwriteKey: 'test', public: { appwriteDatabaseId: 'db' } }))
  vi.stubGlobal('useAppConfig', () => ({ pukalani: { brand: { contentLocales: ['de', 'en'] } } }))
  vi.stubGlobal('useRateLimitStore', () => ({ prefix: 'rl:', store: { hit: async () => ({ count: 1, resetInMs: 1000 }), refund: async () => {} } }))
  vi.stubGlobal('createAdminClient', () => {
    db.open()
    return { tablesDB: db.tablesDB, storage: db.storage }
  })
  // Die Wachen — ECHT.
  vi.stubGlobal('requireBrandAccess', brandAccess.requireBrandAccess)
  vi.stubGlobal('readBrandAdmissionMode', brandAccess.readBrandAdmissionMode)
  vi.stubGlobal('loadBrandBetaAccounts', brandAccess.loadBrandBetaAccounts)
  vi.stubGlobal('assertBrandOwnerAccess', brandOwnership.assertBrandOwnerAccess)
  vi.stubGlobal('requirePermission', instancePermission.requirePermission)
  for (const [name, value] of Object.entries(call.globals ?? {})) vi.stubGlobal(name, value)

  const event = {
    context: { user: userOf(call.who, call.userFields), tenant: null },
    path: '/api/brand/test',
    method: 'GET',
    node: { req: { headers: {} }, res: {} },
  } as unknown as H3Event

  const mod = await load()
  const handler = mod.default as (e: H3Event) => Promise<unknown>
  try {
    const result = await handler(event)
    return { status, result, headers }
  }
  catch (thrown) {
    const error = thrown as ThrownLike
    return { status: error.status ?? 500, error, headers }
  }
}

/** Die Ablehnung, wie der Client sie sieht — zum Vergleich „fremd = unbekannt". */
export function answerOf(run: BrandRouteRun): { status: number, statusText?: string, code?: string, result?: unknown } {
  return { status: run.status, statusText: run.error?.statusText, code: run.error?.data?.code, result: run.result }
}

/** Wurde ein Wert irgendwo in der Antwort ausgeliefert? */
export function leaks(value: unknown, needle: string): boolean {
  if (Buffer.isBuffer(value)) return value.includes(needle)
  return JSON.stringify(value ?? null).includes(needle)
}

// ── Die Fragen an eine Werkstatt-Route an einer Marke ───────────────────────

export interface WorkshopRouteOptions {
  /** Weitere Pfad-Parameter (`id` ist immer dabei). */
  params?: (profileId: string) => Record<string, string>
  query?: Record<string, unknown>
  body?: unknown
  multipart?: BrandRouteCall['multipart']
  /** Weitere Zeilen in der Grundwelt (z. B. Inhalte BEIDER Marken). */
  seed?: () => FakeRow[]
  files?: () => Record<string, Buffer>
  globals?: () => Record<string, unknown>
  /** Status für den Besitzer (Standard 200). */
  ownerStatus?: number
  /** Was der Besitzer zusätzlich sehen muss. */
  owner?: (run: BrandRouteRun, db: FakeBrandAppwrite) => void
}

/**
 * Die Fragen an eine Route `profiles/[id]/…`:
 *  - Gast, Konto ohne Zugang, entzogener Zugang ⇒ 404, keine Inhalte gelesen,
 *    nichts geschrieben.
 *  - Konto MIT Zugang, aber fremde Marke ⇒ DIESELBE Antwort wie eine
 *    unbekannte Marke, keine Inhalte gelesen, nichts geschrieben.
 *  - der Betreiber (Label `admin`, mit Zugang) an einer fremden Marke ⇒
 *    ebenso: der Betreiber-Titel öffnet die Werkstatt nicht.
 *  - der Besitzer ⇒ kommt durch.
 * Wer durch darf, steht hier AUSGESCHRIEBEN — nicht aus der Wache berechnet.
 */
export function describeWorkshopRoute(
  name: string,
  load: () => Promise<{ default: unknown }>,
  options: WorkshopRouteOptions = {},
): void {
  describe(`${name} (Werkstatt an einer Marke)`, () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    const world = () => brandWorld(options.seed?.() ?? [], options.files?.() ?? {})
    const run = (who: BrandWho, profileId: string, db: FakeBrandAppwrite) => callBrandRoute(load, {
      who,
      db,
      params: { id: profileId, ...options.params?.(profileId) },
      query: options.query,
      body: options.body,
      multipart: options.multipart,
      globals: options.globals?.(),
    })

    const shut = (result: BrandRouteRun, db: FakeBrandAppwrite) => {
      expect(result.status).toBe(404)
      expect(db.contentTouches(), 'keine Inhalte gelesen, nichts geschrieben').toEqual([])
      expect(result.result).toBeUndefined()
    }

    for (const who of ['guest', 'noAccess', 'revoked'] as const) {
      it(`${who}: 404, keine Inhalte, nichts geschrieben`, async () => {
        const db = world()
        shut(await run(who, OWN_PROFILE, db), db)
      })
    }

    for (const who of ['stranger', 'operator'] as const) {
      it(`${who} an fremder Marke: dieselbe Antwort wie eine unbekannte Marke, vor jedem Inhalt`, async () => {
        const foreignDb = world()
        const foreign = await run(who, OWN_PROFILE, foreignDb)
        shut(foreign, foreignDb)
        const unknownDb = world()
        const unknown = await run(who, UNKNOWN_PROFILE, unknownDb)
        expect(answerOf(foreign)).toEqual(answerOf(unknown))
      })
    }

    it('Besitzer: kommt durch', async () => {
      const db = world()
      const result = await run('owner', OWN_PROFILE, db)
      expect(result.status, result.error?.statusText).toBe(options.ownerStatus ?? 200)
      options.owner?.(result, db)
    })
  })
}
