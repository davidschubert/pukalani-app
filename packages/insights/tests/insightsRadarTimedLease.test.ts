import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import type { InsightsRadarSweepDeps, InsightsRadarSweepResult } from '../server/utils/insightsRadarSweep'
import type { InsightsRadarRunResponse } from '../shared/types/insightsApi'
import { parseInsightsRadarRunDetail } from '../shared/insightsRadarRun'
import { RUN_LEASE_STALL_MS } from '../../core/shared/runLease'
import type { MemoryStore } from '../../core/tests/support/runLeaseMemoryStore'
import { memoryStore } from '../../core/tests/support/runLeaseMemoryStore'

/**
 * DER NÄCHTLICHE RADAR-LAUF NIMMT DIE LAUF-SPERRE (LL1 c, 2026-11-17).
 *
 * Geladen werden der ECHTE Zeit-Lauf (`server/plugins/radar-sweep.ts`, sein
 * `run` aus `defineTimedJob`), die ECHTE Knopf-Route und die ECHTE
 * Sperr-Logik des Core mit dem In-Memory-Store, der bei gleicher Zeilen-Id
 * einen Konflikt meldet wie Appwrite. Gestellt ist nur der Sweep selbst (ein
 * Tor, das ihn aufhält) — ohne Modul-Merker, damit der Test die SPERRE prüft
 * und nicht den Merker im Prozess, der über Prozesse hinweg nicht trägt.
 *
 * Die Zusagen:
 *  - Knopf läuft ⇒ der Takt überspringt (`skipped`), kein zweiter Sweep;
 *  - zwei Takte im selben Augenblick ⇒ genau ein Sweep;
 *  - der Takt läuft ⇒ der Knopf bekommt `409 run_running`;
 *  - das Ende des nächtlichen Laufs steht an der Zeile, mit Zahlen;
 *  - ohne Lauf-Tabelle (404) läuft der Takt wie früher ohne Sperre,
 *    ein anderer Lesefehler lässt den Takt scheitern.
 */

let store: MemoryStore
let sweepCalls: InsightsRadarSweepDeps[]
let sweepGate: Promise<void> | null
let sweepResult: InsightsRadarSweepResult
let apiKey: string
let hits: number

vi.mock('../server/utils/insightsRadarSweep', () => ({
  runInsightsRadarSweep: vi.fn(async (deps: InsightsRadarSweepDeps = {}) => {
    sweepCalls.push(deps)
    if (sweepGate) await sweepGate
    return sweepResult
  }),
}))

interface TestEvent {
  context: { user?: { $id: string } }
  status?: number
}

interface HttpError extends Error { statusCode?: number, data?: { code?: string } }

let timedRun: () => Promise<'skipped' | undefined>
let knopf: (event: H3Event) => Promise<InsightsRadarRunResponse>

beforeAll(async () => {
  const lease = await import('../../core/server/utils/runLease')
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('defineNitroPlugin', (setup: () => void) => setup())
  vi.stubGlobal('defineTimedJob', (options: { run: () => Promise<'skipped' | undefined> }) => {
    timedRun = options.run
  })
  vi.stubGlobal('getProductRegistry', () => ({ has: () => true }))
  vi.stubGlobal('createError', (init: { status: number, statusText: string, data?: unknown }) =>
    Object.assign(new Error(init.statusText), { statusCode: init.status, data: init.data }))
  vi.stubGlobal('logEvent', () => {})
  vi.stubGlobal('setResponseStatus', (event: TestEvent, status: number) => {
    event.status = status
  })
  vi.stubGlobal('requirePermission', (event: TestEvent) => event.context.user)
  vi.stubGlobal('useRuntimeConfig', () => ({ insightsYoutubeKey: apiKey, public: { appwriteDatabaseId: 'main' } }))
  vi.stubGlobal('createAdminClient', () => ({ tablesDB: {} }))
  vi.stubGlobal('insightsDb', () => ({ tablesDB: {}, databaseId: 'main' }))
  vi.stubGlobal('useRateLimitStore', () => ({
    prefix: 'rl:',
    store: { hit: async () => ({ count: ++hits }) },
  }))
  vi.stubGlobal('appwriteRunLeaseStore', () => store)
  vi.stubGlobal('acquireRunLease', lease.acquireRunLease)
  vi.stubGlobal('finishRunLease', lease.finishRunLease)
  vi.stubGlobal('dropRunLease', lease.dropRunLease)
  vi.stubGlobal('keepRunLeaseAlive', lease.keepRunLeaseAlive)
  vi.stubGlobal('runDetached', lease.runDetached)

  await import('../server/plugins/radar-sweep')
  knopf = (await import('../server/api/insights/radar/run.post')).default as unknown as typeof knopf
})

beforeEach(() => {
  store = memoryStore()
  sweepCalls = []
  sweepGate = null
  sweepResult = { channels: 11, videos: 22, upserted: 20, deleted: 1, tooOld: 2, errors: 0, quotaUnits: 14 }
  apiKey = 'test-key'
  hits = 0
})

afterEach(async () => {
  sweepGate = null
  await vi.waitFor(() => {
    for (const row of store.rows.values()) {
      if (!row.finishedAt && Date.parse(row.heartbeatAt) > Date.now() - RUN_LEASE_STALL_MS) throw new Error('Lauf offen')
    }
  }, { timeout: 2000, interval: 5 })
})

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

function newEvent(): TestEvent {
  return { context: { user: { $id: 'u-1' } } }
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

describe('der Zeit-Lauf insights-radar unter der Lauf-Sperre', () => {
  it('der Knopf läuft ⇒ der Takt überspringt (skipped), kein zweiter Sweep', async () => {
    const open = closeGate()
    const event = newEvent()
    await knopf(event as unknown as H3Event)
    expect(event.status).toBe(202)
    await vi.waitFor(() => expect(sweepCalls).toHaveLength(1))

    await expect(timedRun()).resolves.toBe('skipped')
    expect(sweepCalls).toHaveLength(1)

    open()
  })

  it('der Takt läuft ⇒ der Knopf bekommt 409 run_running, ohne Zählerschritt', async () => {
    const open = closeGate()
    const nightly = timedRun()
    await vi.waitFor(() => expect(sweepCalls).toHaveLength(1))

    const refused = await rejectionOf(knopf(newEvent() as unknown as H3Event))
    expect(refused.statusCode).toBe(409)
    expect(refused.data?.code).toBe('run_running')
    expect(hits).toBe(0)

    open()
    await expect(nightly).resolves.toBeUndefined()
    expect(sweepCalls).toHaveLength(1)
  })

  it('zwei Takte im selben Augenblick ⇒ genau ein Sweep, der andere `skipped`', async () => {
    let release!: () => void
    store.gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = timedRun()
    const second = timedRun()
    await new Promise(resolve => setTimeout(resolve, 5))
    store.gate = null
    release()
    const results = await Promise.all([first, second])

    expect(results.filter(result => result === 'skipped')).toHaveLength(1)
    expect(sweepCalls).toHaveLength(1)
    expect(store.rows.size).toBe(1)
  })

  it('Knopf und Takt im selben Augenblick ⇒ genau ein Sweep', async () => {
    let release!: () => void
    store.gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const event = newEvent()
    const button = knopf(event as unknown as H3Event).then(() => 'button' as const, () => 'refused' as const)
    const nightly = timedRun()
    await new Promise(resolve => setTimeout(resolve, 5))
    store.gate = null
    release()
    const [buttonResult, nightlyResult] = await Promise.all([button, nightly])

    // Genau einer hat die Zeile bekommen.
    expect([buttonResult === 'button', nightlyResult !== 'skipped'].filter(Boolean)).toHaveLength(1)
    await vi.waitFor(() => expect(sweepCalls).toHaveLength(1))
    expect(store.rows.size).toBe(1)
  })

  it('das Ende des nächtlichen Laufs steht an der Zeile, mit Zahlen und Halt-Haken', async () => {
    await expect(timedRun()).resolves.toBeUndefined()
    const row = [...store.rows.values()][0]!
    expect(row.scope).toBe('radar')
    expect(row.subject).toBe('instance')
    expect(row.outcome).toBe('done')
    expect(parseInsightsRadarRunDetail(row.detail)).toEqual(sweepResult)
    expect(typeof sweepCalls[0]?.stop).toBe('function')
    expect(sweepCalls[0]?.stop?.()).toBe(false)
  })

  it('ohne Schlüssel: keine Lauf-Zeile, der Sweep meldet sich selbst ab', async () => {
    apiKey = ''
    sweepResult = { channels: 0, videos: 0, upserted: 0, deleted: 0, tooOld: 0, errors: 0, quotaUnits: 0, skipped: 'not_configured' }
    await expect(timedRun()).resolves.toBe('skipped')
    expect(store.rows.size).toBe(0)
  })

  it('ohne Lauf-Tabelle (404) läuft der Takt wie vor LL1 c ohne Sperre', async () => {
    store.latest = async () => {
      throw new AppwriteException('Table not found', 404, 'table_not_found')
    }
    await expect(timedRun()).resolves.toBeUndefined()
    expect(sweepCalls).toHaveLength(1)
    expect(sweepCalls[0]?.stop).toBeUndefined()
  })

  it('GEGENPROBE: ein anderer Lesefehler heisst nie „frei" — der Takt scheitert, kein Sweep', async () => {
    store.failLatest = true
    await expect(timedRun()).rejects.toThrow()
    expect(sweepCalls).toHaveLength(0)
  })
})
