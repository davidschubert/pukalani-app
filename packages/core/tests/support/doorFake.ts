import { vi } from 'vitest'
import type { H3Event } from 'h3'
import { type CommunityWorld, wireCommunityWorld } from './participationHarness'

/**
 * EINE NACHGEBAUTE DATENTÜR MIT ZWEI KLINKEN (SEC-031, 2026-11-13).
 *
 * Der Prüfstand `participationHarness.ts` hält die Wache VOR der Tür fest und
 * bricht beim ersten `tenantDb()` ab. Für SEC-031 geht es um das, was HINTER
 * der Tür in welcher Reihenfolge passiert: liest die Route ihr Ziel zuerst über
 * die Mitglieder-Klinke (dort entscheidet das Leserecht der Zeile), bevor die
 * Operator-Klinke (sieht alles) etwas liest oder schreibt? Und was steht in der
 * Antwort?
 *
 * Nachgebildet wird deshalb nur, was die Datenbank leistet: Zeilen je Tabelle,
 * ein Leserecht je Zeile für die Mitglieder-Klinke, Filter `Query.equal`. Jeder
 * Zugriff landet im Protokoll `calls` — die Tests lesen daraus die Reihenfolge.
 */

export type Handle = 'member' | 'operator'

export interface DoorCall {
  handle: Handle
  method: string
  table: string
  id?: string
}

export type FakeRow = Record<string, unknown> & { $id: string }

export interface DoorSetup {
  /** Tabelle → Zeilen. Die Operator-Klinke sieht sie alle. */
  rows: Record<string, FakeRow[]>
  /**
   * Darf das Konto diese Zeile lesen? Standard: ja. Gilt NUR für die
   * Mitglieder-Klinke — genau wie Row-Permissions nur für den Session-Client.
   */
  readable?: (table: string, row: FakeRow) => boolean
}

export interface FakeDoor {
  calls: DoorCall[]
  rows: Record<string, FakeRow[]>
  tenantDb: (event: H3Event, options?: { as?: Handle, actor?: string }) => Record<string, unknown>
}

interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

function matches(row: FakeRow, queries: string[] = []): boolean {
  return queries.every((raw) => {
    const query = JSON.parse(raw) as ParsedQuery
    if (query.method !== 'equal' || !query.attribute) return true
    return (query.values ?? []).includes(row[query.attribute])
  })
}

function notFound(statusText: string): Error {
  return Object.assign(new Error(statusText), { status: 404, statusCode: 404, statusText })
}

export function fakeDoor(setup: DoorSetup): FakeDoor {
  const rows = setup.rows
  const calls: DoorCall[] = []
  const readable = setup.readable ?? (() => true)
  let nextId = 1

  const table = (name: string) => (rows[name] ??= [])

  const handleFor = (handle: Handle) => {
    const visible = (name: string) => table(name).filter(row => handle === 'operator' || readable(name, row))
    const log = (method: string, name: string, id?: string) => calls.push({ handle, method, table: name, id })
    const fetch = (name: string, id: string, text = 'Not found') => {
      const row = visible(name).find(r => r.$id === id)
      if (!row) throw notFound(text)
      return row
    }
    return {
      async get(name: string, id: string, text?: string) {
        log('get', name, id)
        return { ...fetch(name, id, text) }
      },
      async find(name: string, queries?: string[]) {
        log('find', name)
        const row = visible(name).find(r => matches(r, queries))
        return row ? { ...row } : null
      },
      async list(name: string, queries?: string[]) {
        log('list', name)
        const found = visible(name).filter(r => matches(r, queries))
        return { rows: found.map(r => ({ ...r })), total: found.length }
      },
      async count(name: string, queries?: string[]) {
        log('count', name)
        return visible(name).filter(r => matches(r, queries)).length
      },
      async create(name: string, data: Record<string, unknown>) {
        log('create', name)
        const row: FakeRow = { ...data, $id: `new-${nextId++}`, $createdAt: '2026-11-13T00:00:00.000Z' }
        table(name).push(row)
        return { ...row }
      },
      async update(name: string, id: string, data: Record<string, unknown>, text?: string) {
        log('update', name, id)
        const row = fetch(name, id, text)
        Object.assign(row, data)
        return { ...row }
      },
      async remove(name: string, id: string, text?: string) {
        log('remove', name, id)
        const row = fetch(name, id, text)
        rows[name] = table(name).filter(r => r !== row)
      },
      async increment(name: string, id: string, column: string, opts: { value: number }) {
        log('increment', name, id)
        const row = fetch(name, id)
        row[column] = Number(row[column] ?? 0) + opts.value
        return { ...row }
      },
      async decrement(name: string, id: string, column: string, opts: { value: number }) {
        log('decrement', name, id)
        const row = fetch(name, id)
        row[column] = Math.max(0, Number(row[column] ?? 0) - opts.value)
        return { ...row }
      },
    }
  }

  return {
    calls,
    rows,
    tenantDb: (_event, options) => handleFor(options?.as === 'operator' ? 'operator' : 'member'),
  }
}

export interface RouteRun {
  status: number
  body?: unknown
  error?: { status?: number, statusText?: string, data?: { code?: string } }
}

export interface DoorRouteProbe extends Partial<CommunityWorld> {
  door: FakeDoor
  params?: Record<string, string>
  body?: unknown
  globals?: Record<string, unknown>
}

/**
 * Führt einen ECHTEN Routen-Handler gegen die nachgebaute Tür aus. Die Wache
 * vor der Tür läuft mit (Standard: ein Mitglied), alles, was hinter einer Naht
 * liegt (Zähler, Abzeichen, Aktivität), ist ein stilles No-op.
 */
export async function runDoorRoute(load: () => Promise<{ default: unknown }>, probe: DoorRouteProbe): Promise<RouteRun> {
  const wired = wireCommunityWorld({ who: 'member', ...probe })
  const passThrough = async <T>(_id: string, fn: () => Promise<T>) => await fn()

  const stubs: Record<string, unknown> = {
    defineEventHandler: (fn: unknown) => fn,
    getRouterParam: (_e: unknown, name: string) => probe.params?.[name],
    readValidatedBody: async (_e: unknown, parse: (b: unknown) => unknown) => parse(probe.body ?? {}),
    readBody: async () => probe.body ?? {},
    setResponseStatus: () => {},
    requirePlanProduct: () => {},
    getAppConfig: async () => ({ maintenanceMode: false }),
    useAppConfig: () => ({}),
    assertCommentsWritable: async () => {},
    assertEventsWritable: async () => {},
    assertPoolWriteQuota: async () => {},
    assertContentWritable: async () => {},
    spendLikeAllowance: async () => ({ ok: true }),
    recordUserCounterEvents: async () => {},
    reportContentUpvotes: async () => {},
    recordActivity: async () => {},
    notify: async () => ({ created: true }),
    notifyContentActivity: async () => {},
    resolveMentions: async () => [],
    maybeRecordMilestone: async () => {},
    withPublishedRead: (base: string[]) => base,
    requireTurnstile: async () => {},
    serializePerPost: passThrough,
    serializePerComment: passThrough,
    serializePerEvent: passThrough,
    isError: (e: unknown) => typeof e === 'object' && e !== null && 'statusCode' in e,
    toH3Error: (e: unknown) => e,
    tenantDb: probe.door.tenantDb,
    ...probe.globals,
  }
  for (const [name, value] of Object.entries(stubs)) vi.stubGlobal(name, value)

  const handler = (await load()).default as (e: H3Event) => Promise<unknown>
  try {
    const body = await handler(wired.event)
    return { status: 200, body }
  }
  catch (thrown) {
    const error = thrown as RouteRun['error']
    return { status: error?.status ?? 500, error }
  }
}

/** Index des ersten Operator-Zugriffs (−1: keiner) — für Reihenfolge-Prüfungen. */
export function firstOperatorCall(calls: DoorCall[]): number {
  return calls.findIndex(call => call.handle === 'operator')
}
