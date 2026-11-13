import { vi } from 'vitest'
import * as conversations from '../../server/utils/conversations'
import * as messageBlocks from '../../server/utils/messageBlocks'
import * as messageGate from '../../server/utils/messageGate'

/**
 * PRÜFSTAND FÜR DIE NACHRICHTEN-ROUTEN (P05, SEC-030/SEC-036, 2026-11-13).
 *
 * Führt die ECHTEN Handler aus: `defineEventHandler` und die Nitro-Auto-Imports
 * sind zur Testzeit Globals (Muster `packages/courses/tests/support/
 * courseRouteHarness.ts`). Gestubbt wird nur Infrastruktur — Datentür,
 * Admin-Client, Core-Wachen, Handle-/Namens-Auflösung, Rate-Store. Die
 * Layer-Helfer aus `conversations.ts`, `messageGate.ts` und `messageBlocks.ts`
 * laufen echt mit.
 *
 * JEDER Datenbank-Zugriff zählt in `dbTouches` (Datentür, Admin-Client,
 * Owner-Schalter, Handle- und Namens-Auflösung). Eine Wache, die „vor dem
 * ersten Datenbankzugriff" steht, beweist man an `dbTouches === 0`.
 *
 * Die Core-Wachen sind nach ihrem dokumentierten Vertrag nachgebildet
 * (`core/server/utils/communityPermission.ts`): 401 ohne Konto, 403
 * `not_a_member` für Nicht-Mitglieder und Entfernte, im Silo gibt sie durch.
 */

export type Who = 'guest' | 'member' | 'removed'

export interface Scenario {
  who: Who
  mode?: 'pool' | 'silo'
  /** Owner-Schalter (Standard: an). */
  enabled?: boolean
  /** Ausgang von `requireCommunityPermission` (Standard: erlaubt über Rolle). */
  permission?: 'allow' | 'deny' | 'fail'
  params?: Record<string, string>
  body?: unknown
  query?: Record<string, unknown>
}

type Row = Record<string, unknown> & { $id: string, $permissions: string[] }

const TENANT_SCOPE = 't-a'
const OTHER_SCOPE = 't-b'

export const ME = 'u-me'
export const REMOVED = 'u-removed'

/**
 * Wer ist wer:
 *  - `u-partner`  Handle hier, gemeinsames Gespräch mit u-me (conv-1)
 *  - `u-handle`   Handle hier, kein Gespräch
 *  - `u-quiet`    KEIN Handle, aber gemeinsames Gespräch mit u-me (conv-3)
 *  - `u-stranger` Handle nur in einer ANDEREN Community, kein Gespräch hier
 *  - `u-far`      Gespräch mit u-me nur in einer ANDEREN Community
 *  - `u-gone`     nichts (weder Handle noch Gespräch)
 *  - `u-removed`  entfernt, war in conv-2 mit u-partner
 */
const ALL_HANDLES: Record<string, string> = {
  'u-me': 'me',
  'u-partner': 'partner',
  'u-handle': 'handle',
  'u-stranger': 'stranger',
  'u-far': 'far',
}
/** Was `resolveHandleOwners` in DIESER Community findet (Publikums-Filter). */
const COMMUNITY_HANDLE_OWNERS: Record<string, string> = {
  me: 'u-me',
  partner: 'u-partner',
  handle: 'u-handle',
}
const NAMES: Record<string, string> = {
  'u-me': 'Ich',
  'u-partner': 'Partnerin',
  'u-handle': 'Handle Person',
  'u-quiet': 'Stille Person',
  'u-stranger': 'Fremde Person',
  'u-far': 'Ferne Person',
  'u-gone': 'Verschwundene Person',
  'u-removed': 'Entfernte Person',
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join(':')
}

function seedTables(): Record<string, Row[]> {
  const base = { $databaseId: 'db', $sequence: 1, $createdAt: '2026-11-01T00:00:00.000Z', $updatedAt: '2026-11-02T00:00:00.000Z' }
  const conv = (id: string, a: string, b: string, scope = TENANT_SCOPE): Row => ({
    ...base, $id: id, $tableId: 'conversations', $permissions: [`read("user:${a}")`, `read("user:${b}")`],
    communityId: scope, participants: [a, b].sort(), pairKey: pairKey(a, b), starterId: a, answered: true,
    lastMessageAt: '2026-11-02T00:00:00.000Z', lastMessagePreview: 'Hallo',
  })
  const member = (id: string, conversationId: string, userId: string, scope = TENANT_SCOPE): Row => ({
    ...base, $id: id, $tableId: 'conversation_members', $permissions: [], communityId: scope,
    conversationId, userId, unread: 1, readRounds: 0, closed: false, lastMessageAt: '2026-11-02T00:00:00.000Z',
  })
  const block = (id: string, blockedId: string): Row => ({
    ...base, $id: id, $tableId: 'message_blocks', $permissions: [], communityId: TENANT_SCOPE,
    blockerId: ME, blockedId, scope: 'community',
  })
  return {
    conversations: [
      conv('conv-1', ME, 'u-partner'),
      conv('conv-2', REMOVED, 'u-partner'),
      conv('conv-3', ME, 'u-quiet'),
      conv('conv-far', ME, 'u-far', OTHER_SCOPE),
    ],
    conversation_members: [
      member('m-1a', 'conv-1', ME),
      member('m-1b', 'conv-1', 'u-partner'),
      member('m-2a', 'conv-2', REMOVED),
      member('m-2b', 'conv-2', 'u-partner'),
      member('m-3a', 'conv-3', ME),
      member('m-3b', 'conv-3', 'u-quiet'),
      member('m-fa', 'conv-far', ME, OTHER_SCOPE),
      member('m-fb', 'conv-far', 'u-far', OTHER_SCOPE),
    ],
    messages: [
      { ...base, $id: 'msg-1', $tableId: 'messages', $permissions: [], communityId: TENANT_SCOPE, conversationId: 'conv-1', authorId: 'u-partner', body: 'Hallo', readAt: '' },
      { ...base, $id: 'msg-2', $tableId: 'messages', $permissions: [], communityId: TENANT_SCOPE, conversationId: 'conv-2', authorId: 'u-partner', body: 'Hallo', readAt: '' },
    ],
    message_blocks: [
      block('b-handle', 'u-handle'),
      block('b-quiet', 'u-quiet'),
      block('b-gone', 'u-gone'),
    ],
  }
}

interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

/** Auswertung der Appwrite-Query-Strings, so weit die Nachrichten-Routen sie benutzen. */
function applyQueries(rows: Row[], queries: string[]): Row[] {
  let result = [...rows]
  let limit = Infinity
  let offset = 0
  for (const raw of queries) {
    const q = JSON.parse(raw) as ParsedQuery
    if (q.method === 'equal' && q.attribute) {
      const values = q.values ?? []
      const attribute = q.attribute
      result = result.filter(row => values.includes(row[attribute]))
    }
    else if (q.method === 'limit') {
      limit = Number(q.values?.[0] ?? Infinity)
    }
    else if (q.method === 'offset') {
      offset = Number(q.values?.[0] ?? 0)
    }
  }
  return result.slice(offset, offset + limit)
}

export interface Run<T> {
  status: number
  result?: T
  error?: { status?: number, statusText?: string, data?: { code?: string } }
  /** Jeder Datenbank-Zugriff (s. Kopf). */
  dbTouches: number
  /** Wie oft ein Handle in einen Menschen aufgelöst wurde. */
  handleLookups: number
  logs: Array<{ level: string, name: string, data: Record<string, unknown> }>
  tables: Record<string, Row[]>
}

export async function runRoute<T>(load: () => Promise<{ default: unknown }>, scenario: Scenario): Promise<Run<T>> {
  const tables = seedTables()
  const logs: Run<T>['logs'] = []
  let dbTouches = 0
  let handleLookups = 0
  const status = 200

  const mode = scenario.mode ?? 'pool'
  const tenant = mode === 'pool'
    ? { mode: 'pool', tenantId: TENANT_SCOPE, communityId: 'c-a', projectId: 'pool', suspension: '' }
    : null
  const user = scenario.who === 'guest'
    ? undefined
    : { $id: scenario.who === 'member' ? ME : REMOVED, name: 'Testperson', labels: scenario.who === 'member' ? ['c-a'] : [] }
  const isMember = Boolean(user) && (mode === 'silo' || scenario.who === 'member')
  const event = { context: { user, tenant }, path: '/api/test' }

  const error = (init: Record<string, unknown>) =>
    Object.assign(new Error(String(init.statusText ?? 'Error')), init, { statusCode: init.status })

  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('createError', error)
  vi.stubGlobal('requirePlanProduct', () => {})
  vi.stubGlobal('getRouterParam', (_e: unknown, name: string) => scenario.params?.[name])
  vi.stubGlobal('readValidatedBody', async (_e: unknown, parseBody: (b: unknown) => unknown) => parseBody(scenario.body ?? {}))
  vi.stubGlobal('getValidatedQuery', async (_e: unknown, parseQuery: (q: unknown) => unknown) => parseQuery(scenario.query ?? {}))
  vi.stubGlobal('setHeader', () => {})
  vi.stubGlobal('useTenant', () => tenant)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'db' } }))
  vi.stubGlobal('useRateLimitStore', () => ({ store: { hit: async () => ({ count: 1, resetInMs: 1000 }) }, prefix: '' }))
  vi.stubGlobal('logEvent', (level: string, name: string, data: Record<string, unknown> = {}) => {
    logs.push({ level, name, data })
  })
  vi.stubGlobal('notify', async () => ({ created: true }))
  vi.stubGlobal('resolveTrustLevel', async () => 1)

  // Owner-Schalter: eine Zeile im Layer, also ein Datenbank-Zugriff.
  vi.stubGlobal('messagesEnabled', async () => {
    dbTouches += 1
    return scenario.enabled ?? true
  })

  // Handle- und Namens-Auflösung (core/server/utils/handles.ts, userNames.ts,
  // userCards.ts): `resolveHandleOwners` filtert die Zugehörigkeit zu DIESER
  // Community, `resolveUserHandles` nicht (Vertrag dort).
  vi.stubGlobal('resolveHandleOwners', async (_e: unknown, handles: string[]) => {
    dbTouches += 1
    handleLookups += 1
    const map = new Map<string, string>()
    for (const handle of handles) {
      const owner = mode === 'silo'
        ? Object.entries(ALL_HANDLES).find(([, h]) => h === handle)?.[0]
        : COMMUNITY_HANDLE_OWNERS[handle]
      if (owner) map.set(handle, owner)
    }
    return map
  })
  vi.stubGlobal('resolveUserHandles', async (_e: unknown, ids: string[]) => {
    dbTouches += 1
    return new Map(ids.filter(id => ALL_HANDLES[id]).map(id => [id, ALL_HANDLES[id]!]))
  })
  vi.stubGlobal('resolveUserNames', async (_e: unknown, ids: string[]) => {
    dbTouches += 1
    return new Map(ids.filter(id => NAMES[id]).map(id => [id, NAMES[id]!]))
  })
  vi.stubGlobal('resolveUserCards', async (_e: unknown, ids: string[]) => {
    dbTouches += 1
    return new Map(ids.filter(id => NAMES[id]).map(id => [id, { name: NAMES[id]!, avatarUrl: '' }]))
  })

  // Core-Wachen.
  vi.stubGlobal('requireCommunityMembership', async () => {
    if (!user) throw error({ status: 401, statusText: 'Unauthorized' })
    if (!isMember) throw error({ status: 403, statusText: 'Not a member', data: { code: 'not_a_member' } })
    return user
  })
  vi.stubGlobal('requireCommunityPermission', async () => {
    if (!user) throw error({ status: 401, statusText: 'Unauthorized' })
    if (scenario.permission === 'fail') throw new Error('role resolver unreachable')
    if (scenario.permission === 'deny' || !isMember) throw error({ status: 403, statusText: 'Forbidden' })
    return { user, role: 'member', via: 'role', actor: 'member' }
  })

  // Die echten Layer-Helfer.
  for (const mod of [conversations, messageBlocks, messageGate]) {
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === 'function') vi.stubGlobal(name, value)
    }
  }

  const inScope = (row: Row) => mode === 'silo' || row.communityId === TENANT_SCOPE

  vi.stubGlobal('createAdminClient', () => {
    dbTouches += 1
    return {
      tablesDB: {
        async listRows({ tableId, queries }: { tableId: string, queries: string[] }) {
          const rows = applyQueries(tables[tableId] ?? [], queries)
          return { rows, total: rows.length }
        },
      },
    }
  })

  vi.stubGlobal('tenantDb', () => {
    dbTouches += 1
    const visible = (table: string) => (tables[table] ?? []).filter(inScope)
    const find = (table: string, rowId: string) => visible(table).find(r => r.$id === rowId)
    return {
      tenant,
      databaseId: 'db',
      async list(table: string, queries: string[] = []) {
        const rows = applyQueries(visible(table), queries)
        return { rows, total: rows.length }
      },
      async find(table: string, queries: string[] = []) {
        return applyQueries(visible(table), queries)[0] ?? null
      },
      async count(table: string, queries: string[] = []) {
        return applyQueries(visible(table), queries).length
      },
      async get(table: string, rowId: string, notFound = 'Not found') {
        const row = find(table, rowId)
        if (!row) throw error({ status: 404, statusText: notFound })
        return row
      },
      async create(table: string, data: Record<string, unknown>, options: { permissions?: string[] } = {}) {
        const list = (tables[table] ??= [])
        const row: Row = { ...data, $id: `new-${table}-${list.length}`, $permissions: options.permissions ?? [], communityId: TENANT_SCOPE, $createdAt: '2026-11-13T00:00:00.000Z' }
        list.push(row)
        return row
      },
      async update(table: string, rowId: string, data: Record<string, unknown>, notFound = 'Not found') {
        const row = find(table, rowId)
        if (!row) throw error({ status: 404, statusText: notFound })
        Object.assign(row, data)
        return row
      },
      async increment(table: string, rowId: string, column: string) {
        const row = find(table, rowId)
        if (row) row[column] = Number(row[column] ?? 0) + 1
        return row
      },
      async remove(table: string, rowId: string, notFound = 'Not found') {
        const list = tables[table] ?? []
        const index = list.findIndex(r => r.$id === rowId && inScope(r))
        if (index < 0) throw error({ status: 404, statusText: notFound })
        list.splice(index, 1)
      },
    }
  })

  const handler = (await load()).default as (e: unknown) => Promise<T>
  try {
    const result = await handler(event)
    return { status, result, dbTouches, handleLookups, logs, tables }
  }
  catch (caught) {
    const e = caught as { status?: number, statusCode?: number, statusText?: string, data?: { code?: string } }
    return {
      status: e.status ?? e.statusCode ?? 500,
      error: { status: e.status ?? e.statusCode, statusText: e.statusText, data: e.data },
      dbTouches,
      handleLookups,
      logs,
      tables,
    }
  }
}
