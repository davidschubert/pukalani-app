import { vi } from 'vitest'
import * as courseAccess from '../../server/utils/courseAccess'

/**
 * PRÜFSTAND FÜR DIE KURS-ROUTEN (SEC-029).
 *
 * Führt die ECHTEN Handler aus: `defineEventHandler` und die Nitro-Auto-Imports
 * sind zur Testzeit Globals (Muster `packages/admin/tests/dashboard-search-
 * authz.test.ts`). Gestubbt wird nur, was eine Infrastruktur braucht
 * (Datentür, Core-Wachen, KI) — die Layer-Helfer aus `courseAccess.ts` und
 * `courseMembership.ts` laufen echt mit.
 *
 * DIE DATENTÜR ALS MODELL DES ZIELZUSTANDS: Kurs- und Lektions-Zeilen tragen
 * kein Leserecht. Liest eine Route sie über die Mitglieder-Klinke
 * (Session-Client), sieht sie deshalb — wie Appwrite — nichts. Die
 * Operator-Klinke (Admin-Client) sieht alles des eigenen Mandanten.
 */

export type Who = 'guest' | 'stranger' | 'member'
export type JoinOutcome = 'joined' | 'member' | 'closed' | 'removed' | 'unavailable'

export interface Scenario {
  who: Who
  /** Pool (Standard) oder Silo (kein Mandant, angemeldet = Mitglied). */
  mode?: 'pool' | 'silo'
  /** Was der Beitritt bei einem Nicht-Mitglied ergibt (Standard: geschlossen). */
  joinOutcome?: JoinOutcome
  /** Zahlungssperre M13: Mitglieder-Schreiben ist zu. */
  suspended?: boolean
  params?: Record<string, string>
  body?: unknown
}

type Row = Record<string, unknown> & { $id: string, $permissions: string[] }

const TENANT_SCOPE = 't-a'

function seedTables(): Record<string, Row[]> {
  const base = { $databaseId: 'db', $sequence: 1, $createdAt: '2026-11-01T00:00:00.000Z', $updatedAt: '2026-11-02T00:00:00.000Z' }
  return {
    courses: [
      {
        ...base, $id: 'c-pub', $tableId: 'courses', $permissions: [], communityId: TENANT_SCOPE,
        title: 'Wolken lesen', slug: 'wolken', description: 'Ein Kurs über Wolken.', status: 'published',
        access: 'free', entitlementProduct: 'paidCourses', authorId: 'u-author', authorName: 'Autorin',
        lessonCount: 1, translations: '', internalNote: 'nie öffentlich',
      },
      {
        ...base, $id: 'c-draft', $tableId: 'courses', $permissions: [], communityId: TENANT_SCOPE,
        title: 'Entwurf', slug: 'entwurf', description: 'Noch nicht fertig.', status: 'draft',
        access: 'free', entitlementProduct: null, authorId: 'u-author', authorName: 'Autorin',
        lessonCount: 1, translations: '',
      },
    ],
    lessons: [
      {
        ...base, $id: 'l-pub', $tableId: 'lessons', $permissions: [], communityId: TENANT_SCOPE, courseId: 'c-pub',
        title: 'Cumulus', order: 0, content: 'Lektionsinhalt Cumulus', videoUrl: 'https://video.example.test/1',
        status: 'published', translations: '',
      },
      {
        ...base, $id: 'l-hidden', $tableId: 'lessons', $permissions: [], communityId: TENANT_SCOPE, courseId: 'c-pub',
        title: 'Noch Entwurf', order: 1, content: 'Entwurfsinhalt', videoUrl: null, status: 'draft', translations: '',
      },
      {
        ...base, $id: 'l-in-draft', $tableId: 'lessons', $permissions: [], communityId: TENANT_SCOPE, courseId: 'c-draft',
        title: 'Im Entwurfskurs', order: 0, content: 'Inhalt im Entwurfskurs', videoUrl: null, status: 'published', translations: '',
      },
    ],
    enrollments: [
      { ...base, $id: 'e-member-pub', $tableId: 'enrollments', $permissions: ['read("user:u-member")'], communityId: TENANT_SCOPE, courseId: 'c-pub', userId: 'u-member', completedAt: null },
      { ...base, $id: 'e-member-draft', $tableId: 'enrollments', $permissions: ['read("user:u-member")'], communityId: TENANT_SCOPE, courseId: 'c-draft', userId: 'u-member', completedAt: null },
    ],
    lesson_progress: [],
  }
}

interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

function parse(query: string): ParsedQuery {
  return JSON.parse(query) as ParsedQuery
}

/** Auswertung der Appwrite-Query-Strings, so weit die Kurs-Routen sie benutzen. */
function applyQueries(rows: Row[], queries: string[]): Row[] {
  let result = [...rows]
  let limit = Infinity
  for (const raw of queries) {
    const q = parse(raw)
    if (q.method === 'equal' && q.attribute) {
      const values = q.values ?? []
      result = result.filter(row => values.includes(row[q.attribute!]))
    }
    else if (q.method === 'limit') {
      limit = Number(q.values?.[0] ?? Infinity)
    }
    else if (q.method === 'orderAsc' && q.attribute) {
      result.sort((a, b) => Number(a[q.attribute!]) - Number(b[q.attribute!]))
    }
    else if (q.method === 'cursorAfter') {
      const index = result.findIndex(row => row.$id === q.values?.[0])
      result = index >= 0 ? result.slice(index + 1) : result
    }
  }
  return result.slice(0, limit)
}

export interface Run<T> {
  status: number
  result?: T
  error?: { status?: number, data?: { code?: string } }
  /** Jede Öffnung der Datentür, mit Klinke und Handelndem. */
  doorCalls: Array<{ as: string, actor?: string }>
  /** Welche Tabellen gelesen wurden. */
  reads: string[]
  tables: Record<string, Row[]>
  joinCalls: number
  aiCalls: number
}

const membershipModules = import.meta.glob('../../server/utils/courseMembership.ts')

export async function runRoute<T>(load: () => Promise<{ default: unknown }>, scenario: Scenario): Promise<Run<T>> {
  const tables = seedTables()
  const doorCalls: Run<T>['doorCalls'] = []
  const reads: string[] = []
  let joinCalls = 0
  let aiCalls = 0
  let status = 200

  const mode = scenario.mode ?? 'pool'
  const tenant = mode === 'pool'
    ? { mode: 'pool', tenantId: TENANT_SCOPE, communityId: 'c-a', projectId: 'pool', suspension: scenario.suspended ? 'billing' : '' }
    : null
  const user = scenario.who === 'guest'
    ? undefined
    : { $id: scenario.who === 'member' ? 'u-member' : 'u-stranger', name: 'Testperson', labels: scenario.who === 'member' ? ['c-a'] : [] }
  const isMember = Boolean(user) && (mode === 'silo' || scenario.who === 'member')
  const event = { context: { user, tenant }, path: '/api/test' }

  const error = (init: Record<string, unknown>) =>
    Object.assign(new Error(String(init.statusText ?? 'Error')), init, { statusCode: init.status })

  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('createError', error)
  vi.stubGlobal('toH3Error', (e: unknown) => e)
  vi.stubGlobal('requirePlanProduct', () => {})
  vi.stubGlobal('getRouterParam', (_e: unknown, name: string) => scenario.params?.[name])
  vi.stubGlobal('getQuery', () => ({}))
  vi.stubGlobal('setResponseStatus', (_e: unknown, code: number) => { status = code })
  vi.stubGlobal('setHeader', () => {})
  vi.stubGlobal('readValidatedBody', async (_e: unknown, parseBody: (b: unknown) => unknown) => parseBody(scenario.body ?? {}))
  vi.stubGlobal('useTenant', () => tenant)
  vi.stubGlobal('isAiConfigured', async () => true)
  vi.stubGlobal('getAppConfig', async () => ({ maintenanceMode: false }))
  vi.stubGlobal('useRateLimitStore', () => ({ store: { hit: async () => ({ count: 1, resetInMs: 1000 }) }, prefix: '' }))
  vi.stubGlobal('getEffectiveAiConfig', async () => ({ model: 'test-model' }))
  vi.stubGlobal('aiCompleteJson', async () => {
    aiCalls += 1
    return { title: 'Übersetzt', body: 'Übersetzter Text' }
  })
  vi.stubGlobal('recordActivity', async () => {})
  vi.stubGlobal('logEvent', () => {})

  // Core-Wachen, nachgebildet nach ihrem dokumentierten Vertrag
  // (core/server/utils/communityPermission.ts, communityJoin.ts).
  vi.stubGlobal('resolveCommunityMembership', async () => isMember)
  vi.stubGlobal('requireCommunityMembership', async () => {
    if (!user) throw error({ status: 401, statusText: 'Unauthorized' })
    if (!isMember) throw error({ status: 403, statusText: 'Not a member', data: { code: 'not_a_member' } })
    return user
  })
  vi.stubGlobal('joinCommunity', async () => {
    joinCalls += 1
    if (!user || mode !== 'pool') return 'unavailable'
    if (scenario.who === 'member') return 'member'
    return scenario.joinOutcome ?? 'closed'
  })

  // Die echten Layer-Helfer.
  for (const [name, value] of Object.entries(courseAccess)) {
    if (typeof value === 'function') vi.stubGlobal(name, value)
  }
  for (const loadModule of Object.values(membershipModules)) {
    const mod = await loadModule() as Record<string, unknown>
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === 'function') vi.stubGlobal(name, value)
    }
  }

  vi.stubGlobal('tenantDb', (_event: unknown, options: { as?: string, actor?: string } = {}) => {
    const handle = options.as ?? 'member'
    doorCalls.push({ as: handle, actor: options.actor })
    const visible = (table: string): Row[] => {
      const rows = (tables[table] ?? []).filter(row => mode === 'silo' || row.communityId === TENANT_SCOPE)
      if (handle === 'operator') return rows
      // Session-Client: nur, was ein Leserecht für diese Person trägt.
      return rows.filter(row => row.$permissions.some(p =>
        p === 'read("any")'
        || (user && p === 'read("users")')
        || (user && p === `read("user:${user.$id}")`)))
    }
    const writable = () => {
      const actor = options.actor ?? handle
      if (actor !== 'operator' && scenario.suspended) {
        throw error({ status: 403, statusText: 'Community is read-only', data: { code: 'community_suspended' } })
      }
    }
    return {
      tenant,
      databaseId: 'db',
      async list(table: string, queries: string[] = []) {
        reads.push(table)
        const rows = applyQueries(visible(table), queries)
        return { rows, total: rows.length }
      },
      async find(table: string, queries: string[] = []) {
        reads.push(table)
        return applyQueries(visible(table), queries)[0] ?? null
      },
      async count(table: string, queries: string[] = []) {
        reads.push(table)
        return applyQueries(visible(table), queries).length
      },
      async get(table: string, rowId: string, notFound = 'Not found') {
        reads.push(table)
        const row = visible(table).find(r => r.$id === rowId)
        if (!row) throw error({ status: 404, statusText: notFound })
        return row
      },
      async create(table: string, data: Record<string, unknown>, createOptions: { permissions?: string[] } = {}) {
        writable()
        const duplicate = table === 'enrollments'
          && (tables.enrollments ?? []).some(r => r.courseId === data.courseId && r.userId === data.userId)
        if (duplicate) throw Object.assign(new Error('conflict'), { code: 409 })
        const row: Row = { ...data, $id: `new-${table}-${(tables[table] ?? []).length}`, $permissions: createOptions.permissions ?? [], communityId: TENANT_SCOPE }
        ;(tables[table] ??= []).push(row)
        return row
      },
      async update(table: string, rowId: string, data: Record<string, unknown>) {
        const row = (tables[table] ?? []).find(r => r.$id === rowId)
        if (!row) throw error({ status: 404, statusText: 'Not found' })
        Object.assign(row, data)
        return row
      },
      async updatePermissions(table: string, rowId: string, permissions: string[]) {
        const row = (tables[table] ?? []).find(r => r.$id === rowId)
        if (row) row.$permissions = permissions
        return row
      },
    }
  })

  const mod = await load()
  const handler = mod.default as (e: unknown) => Promise<T>
  try {
    const result = await handler(event)
    return { status, result, doorCalls, reads, tables, joinCalls, aiCalls }
  }
  catch (thrown) {
    const err = thrown as { status?: number, data?: { code?: string } }
    return { status: err.status ?? 500, error: err, doorCalls, reads, tables, joinCalls, aiCalls }
  }
}

/** Felder, die eine öffentliche Antwort NIE tragen darf. */
export const FORBIDDEN_PREVIEW_KEYS = [
  'authorId', 'communityId', 'entitlementProduct', '$permissions', '$databaseId', '$tableId', '$sequence', 'internalNote',
] as const

export const FORBIDDEN_LESSON_KEYS = ['content', 'videoUrl', 'translations', 'courseId', 'communityId', '$permissions'] as const
