import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import type { InsightsRadarSweepDeps, InsightsRadarSweepResult } from '../server/utils/insightsRadarSweep'
import type { InsightsRadarResponse, InsightsRadarRunResponse } from '../shared/types/insightsApi'
import { parseInsightsRadarRunDetail } from '../shared/insightsRadarRun'
import { isInsightsRowMissing } from '../server/utils/insightsStore'
import { RUN_LEASE_STALL_MS } from '../../core/shared/runLease'
import type { MemoryStore } from '../../core/tests/support/runLeaseMemoryStore'
import { memoryStore } from '../../core/tests/support/runLeaseMemoryStore'

/**
 * „JETZT LAUFEN LASSEN" IM HINTERGRUND (LL1 a, 2026-11-17) — die ECHTEN Routen
 * `POST /api/insights/radar/run` und `GET /api/insights/radar`, der echte
 * Hintergrund-Lauf (`insightsRadarRun.ts`) und die echte Lauf-Sperre aus dem
 * Core mit einem In-Memory-Store, der bei gleicher Zeilen-Id einen Konflikt
 * meldet wie Appwrite.
 *
 * Gestellt sind nur: Nitro-/h3-Globals, die Stunden-Drossel (ein Zähler) und
 * der Sweep selbst (ein Tor, das ihn aufhält — der Sweep hat seine eigenen
 * Tests in `insightsRadarSweep.test.ts`).
 *
 * Die Zusagen, die hier geprüft werden:
 *  - „antwortet sofort und rechnet im Hintergrund" ⇒ 202, während das Tor
 *    des Sweeps noch ZU ist;
 *  - „kein zweiter Lauf zur selben Zeit" ⇒ 409 `run_running`, auch bei zwei
 *    und zehn Anfragen im selben Augenblick, und der Zähler zählt EINEN;
 *  - eine abgelehnte Drossel gibt die Sperre wieder frei;
 *  - ein abgestorbener Lauf wird übernommen;
 *  - das Ergebnis steht danach im `detail` und in der Antwort von GET.
 */

// ── Zustand der Fälschungen ─────────────────────────────────────────────────

let store: MemoryStore
let sweepCalls: InsightsRadarSweepDeps[]
let sweepGate: Promise<void> | null
let sweepResult: InsightsRadarSweepResult
let sweepThrows: boolean
let sweepsFinished: number
let hits: number
let limiterDown: boolean
let apiKey: string
let logs: { level: string, name: string, data: Record<string, unknown> }[]

vi.mock('../server/utils/insightsRadarSweep', () => ({
  runInsightsRadarSweep: vi.fn(async (deps: InsightsRadarSweepDeps) => {
    sweepCalls.push(deps)
    if (sweepGate) await sweepGate
    sweepsFinished++
    if (sweepThrows) throw new TypeError('kaputt')
    return sweepResult
  }),
}))

// ── Nitro-/h3-Globals ───────────────────────────────────────────────────────

interface TestEvent {
  context: { user?: { $id: string } }
  status?: number
}

interface HttpError extends Error { statusCode?: number, data?: { code?: string } }

let run: (event: H3Event) => Promise<InsightsRadarRunResponse>
let overview: (event: H3Event) => Promise<InsightsRadarResponse>

beforeAll(async () => {
  const lease = await import('../../core/server/utils/runLease')
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('createError', (init: { status: number, statusText: string, data?: unknown }) =>
    Object.assign(new Error(init.statusText), { statusCode: init.status, data: init.data }))
  vi.stubGlobal('logEvent', (level: string, name: string, data: Record<string, unknown> = {}) => {
    logs.push({ level, name, data })
  })
  vi.stubGlobal('setResponseStatus', (event: TestEvent, status: number) => {
    event.status = status
  })
  vi.stubGlobal('requirePermission', (event: TestEvent) => {
    if (!event.context.user) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 })
    return event.context.user
  })
  vi.stubGlobal('useRuntimeConfig', () => ({ insightsYoutubeKey: apiKey, public: { appwriteDatabaseId: 'main' } }))
  vi.stubGlobal('useAppConfig', () => ({}))
  vi.stubGlobal('createAdminClient', () => ({ tablesDB: {} }))
  vi.stubGlobal('useRateLimitStore', () => ({
    prefix: 'rl:',
    store: {
      hit: async () => {
        if (limiterDown) throw new Error('redis down')
        hits++
        return { count: hits }
      },
    },
  }))
  // Die ECHTE Sperr-Logik, als Auto-Import gestellt — nur der Store ist der
  // In-Memory-Store.
  vi.stubGlobal('appwriteRunLeaseStore', () => store)
  vi.stubGlobal('acquireRunLease', lease.acquireRunLease)
  vi.stubGlobal('finishRunLease', lease.finishRunLease)
  vi.stubGlobal('dropRunLease', lease.dropRunLease)
  vi.stubGlobal('keepRunLeaseAlive', lease.keepRunLeaseAlive)
  vi.stubGlobal('runDetached', lease.runDetached)
  // Für GET: die Radar-Zeilen und Kanäle sind leer, die Lauf-Zeile zählt.
  vi.stubGlobal('insightsDb', () => ({ tablesDB: { listRows: async () => ({ rows: [], total: 0 }) }, databaseId: 'main' }))
  vi.stubGlobal('readActiveRadarChannels', async () => [])
  vi.stubGlobal('readInsightsVerdicts', async () => ({}))
  vi.stubGlobal('isInsightsRowMissing', isInsightsRowMissing)
  vi.stubGlobal('INSIGHTS_TOPICS_TABLE', 'insights_topics')
  vi.stubGlobal('INSIGHTS_TOPICS_LIMIT', 500)

  run = (await import('../server/api/insights/radar/run.post')).default as unknown as typeof run
  overview = (await import('../server/api/insights/radar/index.get')).default as unknown as typeof overview
})

beforeEach(() => {
  store = memoryStore()
  sweepCalls = []
  sweepGate = null
  sweepResult = { channels: 12, videos: 240, upserted: 238, deleted: 3, tooOld: 2, errors: 0, quotaUnits: 15 }
  sweepThrows = false
  sweepsFinished = 0
  hits = 0
  limiterDown = false
  apiKey = 'test-key'
  logs = []
})

afterEach(async () => {
  // Kein Lauf darf in den nächsten Test hineinlaufen.
  sweepGate = null
  await settled()
})

// ── Helfer ──────────────────────────────────────────────────────────────────

function newEvent(): TestEvent {
  return { context: { user: { $id: 'u-1' } } }
}

/** Ein Tor, das erst der Test öffnet. */
function closeGate(): () => void {
  let open!: () => void
  sweepGate = new Promise<void>((resolve) => {
    open = resolve
  })
  return () => {
    sweepGate = null
    open()
  }
}

function latestRow() {
  return [...store.rows.values()].sort((a, b) => b.seq - a.seq)[0] ?? null
}

/** Wartet, bis kein Lauf mehr offen ist (alle Zeilen beendet). */
async function settled(): Promise<void> {
  await vi.waitFor(() => {
    for (const row of store.rows.values()) {
      if (!row.finishedAt && Date.parse(row.heartbeatAt) > Date.now() - RUN_LEASE_STALL_MS) {
        throw new Error('Lauf offen')
      }
    }
  }, { timeout: 2000, interval: 5 })
}

async function rejectionOf(promise: Promise<unknown>): Promise<HttpError> {
  try {
    await promise
  }
  catch (error) {
    return error as HttpError
  }
  throw new Error('kein Fehler')
}

/** N Starts, die alle DENSELBEN Vorgänger lesen, bevor einer anlegt. */
async function simultaneousStarts(n: number) {
  let release!: () => void
  store.gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const events = Array.from({ length: n }, newEvent)
  const starts = events.map(event => run(event as unknown as H3Event))
  await new Promise(resolve => setTimeout(resolve, 5))
  store.gate = null
  release()
  const results = await Promise.allSettled(starts)
  return { events, results }
}

// ── LL1 a ───────────────────────────────────────────────────────────────────

describe('POST /api/insights/radar/run — antwortet sofort, sperrt den zweiten Klick', () => {
  it('antwortet 202, BEVOR der Lauf fertig ist; ein zweiter Aufruf bekommt 409 run_running ohne Zähler', async () => {
    const open = closeGate()

    const event = newEvent()
    const response = await run(event as unknown as H3Event)

    expect(event.status).toBe(202)
    expect(response.run).toMatchObject({ state: 'running', finishedAt: '', result: null })
    expect(response.run.startedAt).toBe(latestRow()?.startedAt)
    // Das Tor ist noch zu: der Sweep hat begonnen, aber nicht geendet.
    await vi.waitFor(() => expect(sweepCalls).toHaveLength(1))
    expect(sweepsFinished).toBe(0)
    expect(latestRow()?.finishedAt).toBe('')

    const second = await rejectionOf(run(newEvent() as unknown as H3Event))
    expect(second.statusCode).toBe(409)
    expect(second.data?.code).toBe('run_running')
    expect(hits).toBe(1)

    open()
    await settled()
    expect(latestRow()?.outcome).toBe('done')
    expect(sweepCalls).toHaveLength(1)
  })

  it('der Lauf hat KEINE Frist mehr, aber den Halt-Haken der Sperre', async () => {
    await run(newEvent() as unknown as H3Event)
    await settled()
    const deps = sweepCalls[0]!
    expect(deps).not.toHaveProperty('deadlineMs')
    expect(typeof deps.stop).toBe('function')
    // Solange der Herzschlag lebt, hält der Haken nicht an.
    expect(deps.stop?.()).toBe(false)
  })

  it.each([2, 10])('%i GLEICHZEITIGE Starts: genau ein 202, der Rest 409, ein Zählerschritt, ein Sweep', async (n) => {
    const { events, results } = await simultaneousStarts(n)

    const accepted = results.filter(result => result.status === 'fulfilled')
    const refused = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    expect(accepted).toHaveLength(1)
    expect(refused).toHaveLength(n - 1)
    for (const result of refused) expect((result.reason as HttpError).data?.code).toBe('run_running')
    expect(events.filter(event => event.status === 202)).toHaveLength(1)

    await settled()
    expect(hits).toBe(1)
    expect(sweepCalls).toHaveLength(1)
    expect(store.rows.size).toBe(1)
  })

  it('ohne Schlüssel: 503 not_configured — keine Sperre, kein Zählerschritt', async () => {
    apiKey = ''
    const refused = await rejectionOf(run(newEvent() as unknown as H3Event))
    expect(refused.statusCode).toBe(503)
    expect(refused.data?.code).toBe('not_configured')
    expect(store.rows.size).toBe(0)
    expect(hits).toBe(0)
  })

  it('Drossel lehnt ab ⇒ 429 rate_limited, die Sperre ist wieder frei, ein späterer Start gelingt', async () => {
    hits = 3
    const event = newEvent()
    const refused = await rejectionOf(run(event as unknown as H3Event))
    expect(refused.statusCode).toBe(429)
    expect(refused.data?.code).toBe('rate_limited')
    expect(event.status).toBeUndefined()
    expect(store.rows.size).toBe(0)
    expect(sweepCalls).toHaveLength(0)

    hits = 0
    const next = newEvent()
    await run(next as unknown as H3Event)
    expect(next.status).toBe(202)
    await settled()
  })

  it('Drossel nicht erreichbar ⇒ der Fehler kommt an, und die Sperre fällt wieder', async () => {
    limiterDown = true
    const refused = await rejectionOf(run(newEvent() as unknown as H3Event))
    expect(refused.message).toBe('redis down')
    expect(store.rows.size).toBe(0)
    expect(sweepCalls).toHaveLength(0)
  })
})

describe('der abgestorbene Lauf', () => {
  it('ein alter Herzschlag wird übernommen: GET meldet stalled, ein neuer Start läuft als seq 2', async () => {
    const old = new Date(Date.now() - RUN_LEASE_STALL_MS - 60_000).toISOString()
    store.rows.set('r-old', {
      $id: 'r-old', scope: 'radar', subject: 'instance', seq: 1,
      startedAt: old, heartbeatAt: old, finishedAt: '', outcome: '', detail: '',
    })

    const before = await overview({ context: { user: { $id: 'u-1' } } } as unknown as H3Event)
    expect(before.run?.state).toBe('stalled')

    const event = newEvent()
    await run(event as unknown as H3Event)
    expect(event.status).toBe(202)
    await settled()
    expect(latestRow()?.seq).toBe(2)
    expect(latestRow()?.outcome).toBe('done')
    // Der Vorgänger bleibt stehen (ein verspäteter Starter legte die freie
    // Kennung sonst noch einmal an — Kopf von `core/shared/runLease.ts`).
    expect(store.rows.has('r-old')).toBe(true)
  })
})

describe('das Ergebnis des Laufs', () => {
  it('steht nach dem Ende im `detail` und in GET — nur Zahlen', async () => {
    sweepResult = {
      channels: 12, videos: 240, upserted: 238, deleted: 3, tooOld: 2, errors: 1, quotaUnits: 16,
      watchlist: { items: 40, updated: 39, gone: 1 },
    }
    const open = closeGate()
    await run(newEvent() as unknown as H3Event)

    const during = await overview(newEvent() as unknown as H3Event)
    expect(during.run).toMatchObject({ state: 'running', result: null })

    open()
    await settled()
    expect(parseInsightsRadarRunDetail(latestRow()?.detail)).toEqual(sweepResult)

    const after = await overview(newEvent() as unknown as H3Event)
    expect(after.run?.state).toBe('done')
    expect(after.run?.finishedAt).not.toBe('')
    expect(after.run?.result).toEqual(sweepResult)
  })

  it('`skipped: running` (der nächtliche Lauf hielt das Flag) ist ein beendeter Lauf mit Grund', async () => {
    sweepResult = { channels: 0, videos: 0, upserted: 0, deleted: 0, tooOld: 0, errors: 0, quotaUnits: 0, skipped: 'running' }
    await run(newEvent() as unknown as H3Event)
    await settled()
    const after = await overview(newEvent() as unknown as H3Event)
    expect(after.run?.state).toBe('done')
    expect(after.run?.result?.skipped).toBe('running')
  })

  it('ein geworfener Fehler endet als `failed`, ohne Zahlen; ins Log nur der Fehler-Name', async () => {
    sweepThrows = true
    await run(newEvent() as unknown as H3Event)
    await settled()
    expect(latestRow()?.outcome).toBe('failed')
    const after = await overview(newEvent() as unknown as H3Event)
    expect(after.run).toMatchObject({ state: 'failed', result: null })
    expect(logs.find(entry => entry.name === 'insights.radar_run_failed')?.data).toEqual({ error: 'TypeError' })
    // Danach ist der Knopf wieder frei.
    sweepThrows = false
    const next = newEvent()
    await run(next as unknown as H3Event)
    expect(next.status).toBe(202)
    await settled()
  })

  it('GET ohne Lauf-Tabelle (404) bleibt heil: `run: null`', async () => {
    store.latest = async () => {
      throw new AppwriteException('Table not found', 404, 'table_not_found')
    }
    const response = await overview(newEvent() as unknown as H3Event)
    expect(response.run).toBeNull()
  })
})
