import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { InsightsWatchItem } from '../shared/insightsWatchlist'
import type { InsightsWatchRow } from '../shared/insightsRows'
import { fromInsightsWatchItem, toInsightsWatchItem } from '../shared/insightsRows'
import {
  acquireRunLease,
  dropRunLease,
  finishRunLease,
  keepRunLeaseAlive,
  runDetached,
  runLeaseRowId,
} from '../../core/server/utils/runLease'
import { RUN_LEASE_STALL_MS, runLeaseState } from '../../core/shared/runLease'
import type { MemoryStore } from '../../core/tests/support/runLeaseMemoryStore'
import { memoryStore } from '../../core/tests/support/runLeaseMemoryStore'

/**
 * LL1 c (2026-11-17) — DER START DES VIDEO-BRIEFS HÄLT AUCH IM SELBEN
 * AUGENBLICK.
 *
 * Bis dahin hielt die Route ihren Start mit „erst lesen, dann Stempel
 * schreiben" fest: zwei Klicks, die die Zeile beide vor dem ersten Stempel
 * lesen, starteten zwei bezahlte Modell-Läufe. Jetzt nimmt sie die
 * Lauf-Sperre des Core (`acquireRunLease`, Art `brief`).
 *
 * Echte Route, echte Sperr-Logik, ein Speicher-Store mit echtem Konflikt beim
 * Anlegen derselben Id. Gestellt sind die Nitro-Auto-Imports, die
 * Fundstück-Zeile (jedes Lesen liefert eine KOPIE — wie Appwrite), Drossel
 * und Modell. Gezählt wird, was Geld kostet: Buchungen und Modell-Aufrufe.
 */

vi.mock('../server/contracts/brandContract', () => ({
  BRAND_PROVIDER_ROUTING_VERTEX_EU: { order: ['google-vertex/europe'], allow_fallbacks: false },
}))

let store: MemoryStore
let watchRow: InsightsWatchRow
let quotaRejects: boolean
/** Hält jeden Modell-Aufruf auf, solange gesetzt. */
let modelGate: Promise<void> | null
let modelFails: boolean

const updateInsightsWatchRow = vi.fn(async (_event: H3Event, _rowId: string, data: Record<string, unknown>) => {
  Object.assign(watchRow, data)
  return toInsightsWatchItem({ ...watchRow })
})
const insightsBeginAiRun = vi.fn(async () => {
  await Promise.resolve()
  if (quotaRejects) {
    throw Object.assign(new Error('Too many requests'), { status: 429, data: { code: 'insights_ai_hour_limit' } })
  }
  return {}
})
const aiVideoJsonDetailed = vi.fn(async () => {
  if (modelGate) await modelGate
  if (modelFails) throw new Error('provider failed')
  return { value: { title: 'Ein Brief', brief: 'Kurz und klar.', topics: [] } }
})
const createInsightsPostRow = vi.fn(async () => ({ $id: 'post-new' }))

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB: {} }))
vi.stubGlobal('insightsDb', () => ({ tablesDB: {}, databaseId: 'main' }))
vi.stubGlobal('requirePermission', () => ({ $id: 'redaktion' }))
vi.stubGlobal('getRouterParam', () => 'dQw4w9WgXcQ')
vi.stubGlobal('readValidatedBody', async (_event: H3Event, parse: (input: unknown) => unknown) => parse(undefined))
vi.stubGlobal('setResponseStatus', () => {})
vi.stubGlobal('insightsWatchMissing', () => Object.assign(new Error('missing'), { status: 404 }))
// Jedes Lesen liefert den STAND DIESES AUGENBLICKS als Kopie.
vi.stubGlobal('findInsightsWatchRow', async () => ({ ...watchRow }))
vi.stubGlobal('updateInsightsWatchRow', updateInsightsWatchRow)
vi.stubGlobal('loadInsightsPostRow', async () => null)
vi.stubGlobal('getEffectiveAiVideoConfig', async () => ({ enabled: true, model: 'google/gemini-2.5-flash' }))
vi.stubGlobal('insightsBeginAiRun', insightsBeginAiRun)
vi.stubGlobal('insightsLogAi', () => {})
vi.stubGlobal('insightsAiErrorCode', () => 'brief_failed')
vi.stubGlobal('aiVideoJsonDetailed', aiVideoJsonDetailed)
vi.stubGlobal('findFreeInsightsSlug', async () => 'ein-brief')
vi.stubGlobal('createInsightsPostRow', createInsightsPostRow)
// Die ECHTE Sperr-Logik, nur der Store liegt im Speicher.
vi.stubGlobal('appwriteRunLeaseStore', () => store)
vi.stubGlobal('acquireRunLease', acquireRunLease)
vi.stubGlobal('dropRunLease', dropRunLease)
vi.stubGlobal('finishRunLease', finishRunLease)
vi.stubGlobal('keepRunLeaseAlive', keepRunLeaseAlive)
vi.stubGlobal('runDetached', runDetached)

const handler = (await import('../server/api/insights/watchlist/[videoId]/brief.post'))
  .default as unknown as (event: H3Event) => Promise<{ item: InsightsWatchItem }>

function item(overrides: Partial<InsightsWatchItem> = {}): InsightsWatchItem {
  return {
    videoId: 'dQw4w9WgXcQ',
    verdict: 'interesting',
    note: '',
    topic: 'brand-strategy',
    addedAt: '2026-11-01T00:00:00.000Z',
    briefPostId: '',
    briefRunAt: '',
    briefError: '',
    available: true,
    refreshedAt: '',
    title: 'Ein Video',
    channelId: 'UC123',
    channelTitle: 'Ein Kanal',
    channelSubscribers: 1000,
    views: 100,
    likes: 10,
    commentCount: 1,
    publishedAt: '2026-10-01',
    ...overrides,
  }
}

function newEvent(): H3Event {
  return { context: {} } as unknown as H3Event
}

/** Arbeit hinter der Antwort (`runDetached`) zu Ende laufen lassen. */
async function settled(): Promise<void> {
  for (let round = 0; round < 50; round++) await Promise.resolve()
}

/** Ein Tor, das erst der Test öffnet. */
function gate(): { promise: Promise<void>, open: () => void } {
  let open!: () => void
  const promise = new Promise<void>((resolve) => {
    open = resolve
  })
  return { promise, open }
}

/** `n` gleichzeitige Starts — alle lesen die Sperre, bevor einer anlegt. */
async function concurrentStarts(n: number): Promise<PromiseSettledResult<{ item: InsightsWatchItem }>[]> {
  const leaseGate = gate()
  store.gate = leaseGate.promise
  const calls = Array.from({ length: n }, () => handler(newEvent()))
  await settled()
  store.gate = null
  leaseGate.open()
  return await Promise.allSettled(calls)
}

function codeOf(result: PromiseSettledResult<unknown>): unknown {
  return result.status === 'rejected'
    ? (result.reason as { data?: { code?: unknown } }).data?.code
    : 'accepted'
}

beforeEach(() => {
  store = memoryStore()
  watchRow = { $id: 'w1', $createdAt: '2026-11-01T00:00:00.000Z', ...fromInsightsWatchItem(item()) } as unknown as InsightsWatchRow
  quotaRejects = false
  modelGate = null
  modelFails = false
  updateInsightsWatchRow.mockClear()
  insightsBeginAiRun.mockClear()
  aiVideoJsonDetailed.mockClear()
  createInsightsPostRow.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(async () => {
  modelGate = null
  await settled()
})

describe('LL1 c · gleichzeitige Starts desselben Fundstücks', () => {
  for (const n of [2, 10]) {
    it(`${n} Starts im selben Augenblick ⇒ genau EIN Modell-Aufruf, genau EINE Buchung, die anderen 409 brief_running`, async () => {
      const results = await concurrentStarts(n)
      await settled()

      const codes = results.map(codeOf)
      expect(codes.filter(code => code === 'accepted')).toHaveLength(1)
      // Die Seite liest weiter den gewohnten Code der Route, nicht `run_running`.
      expect(codes.filter(code => code === 'brief_running')).toHaveLength(n - 1)
      for (const result of results) {
        if (result.status === 'rejected') expect(result.reason).toMatchObject({ status: 409 })
      }
      expect(insightsBeginAiRun).toHaveBeenCalledTimes(1)
      expect(aiVideoJsonDetailed).toHaveBeenCalledTimes(1)
      expect(createInsightsPostRow).toHaveBeenCalledTimes(1)
      // Nur der Gewinner hat gestempelt.
      expect(updateInsightsWatchRow.mock.calls.filter(call => 'briefRunAt' in call[2])).toHaveLength(1)
    })
  }

  it('der Lauf hält die Sperre, solange das Modell rechnet — und gibt sie am Ende mit „done" frei', async () => {
    const model = gate()
    modelGate = model.promise
    await handler(newEvent())
    await settled()

    const [lease] = [...store.rows.values()]
    expect(lease).toMatchObject({ scope: 'brief', subject: 'w1', seq: 1, finishedAt: '' })
    expect(runLeaseState(lease!, Date.now())).toBe('running')

    model.open()
    await settled()
    expect(store.rows.get(lease!.$id)).toMatchObject({ outcome: 'done' })
    expect(store.rows.get(lease!.$id)!.finishedAt).not.toBe('')
    expect(watchRow.briefPostId).toBe('post-new')
  })
})

describe('LL1 c · die Sperre fällt, wenn nichts lief', () => {
  it('Drossel lehnt ab ⇒ 429 wie bisher, die Sperre ist wieder frei, kein Stempel, kein Modell', async () => {
    quotaRejects = true
    await expect(handler(newEvent())).rejects.toMatchObject({ status: 429 })
    await settled()

    expect(store.rows.size).toBe(0)
    expect(store.calls.remove).toBe(1)
    expect(updateInsightsWatchRow).not.toHaveBeenCalled()
    expect(aiVideoJsonDetailed).not.toHaveBeenCalled()

    // GEGENPROBE: der nächste Start läuft durch.
    quotaRejects = false
    await handler(newEvent())
    await settled()
    expect(aiVideoJsonDetailed).toHaveBeenCalledTimes(1)
  })

  it('der Stempel scheitert ⇒ Fehler wie bisher, die Sperre ist wieder frei, kein Modell', async () => {
    updateInsightsWatchRow.mockImplementationOnce(async () => {
      throw Object.assign(new Error('Storage unavailable'), { status: 503 })
    })
    await expect(handler(newEvent())).rejects.toMatchObject({ status: 503 })
    await settled()

    expect(store.rows.size).toBe(0)
    expect(aiVideoJsonDetailed).not.toHaveBeenCalled()
  })

  it('die Sperre ist nicht prüfbar ⇒ 503 run_lease_unavailable, nichts gebucht, kein Modell', async () => {
    store.failLatest = true
    await expect(handler(newEvent())).rejects.toMatchObject({ status: 503, data: { code: 'run_lease_unavailable' } })
    expect(insightsBeginAiRun).not.toHaveBeenCalled()
    expect(aiVideoJsonDetailed).not.toHaveBeenCalled()
  })
})

describe('LL1 c · nach dem Lauf ist ein neuer Start möglich', () => {
  it('ein gescheiterter Lauf beendet die Sperre mit seinem Code, der nächste Start bekommt seq 2', async () => {
    modelFails = true
    await handler(newEvent())
    await settled()

    const first = store.rows.get(runLeaseRowId('brief', 'w1', 1))
    expect(first).toMatchObject({ outcome: 'brief_failed' })
    expect(watchRow.briefError).toBe('brief_failed')

    modelFails = false
    await handler(newEvent())
    await settled()
    expect(store.rows.get(runLeaseRowId('brief', 'w1', 2))).toMatchObject({ outcome: 'done' })
    expect(aiVideoJsonDetailed).toHaveBeenCalledTimes(2)
    expect(insightsBeginAiRun).toHaveBeenCalledTimes(2)
  })

  it('wer die Sperre nach dem Ende eines Vorgängers bekommt, liest die Zeile neu ⇒ 409 brief_exists, nichts gebucht', async () => {
    // Der Starter hat die Zeile gelesen, BEVOR der Vorgänger fertig war —
    // erst beim Neulesen unter der Sperre steht der Brief da.
    const reads = vi.fn(async () => ({ ...watchRow }))
    let call = 0
    vi.stubGlobal('findInsightsWatchRow', async () => {
      call++
      if (call === 2) Object.assign(watchRow, { briefPostId: 'post-vorher' })
      return await reads()
    })
    try {
      await expect(handler(newEvent())).rejects.toMatchObject({ status: 409, data: { code: 'brief_exists' } })
    }
    finally {
      vi.stubGlobal('findInsightsWatchRow', async () => ({ ...watchRow }))
    }
    expect(store.rows.size).toBe(0)
    expect(insightsBeginAiRun).not.toHaveBeenCalled()
    expect(aiVideoJsonDetailed).not.toHaveBeenCalled()
  })
})

describe('LL1 c · ein abgestorbener Lauf blockiert nicht für immer', () => {
  function plantLease(heartbeatAgoMs: number): void {
    const at = new Date(Date.now() - heartbeatAgoMs).toISOString()
    store.rows.set(runLeaseRowId('brief', 'w1', 1), {
      $id: runLeaseRowId('brief', 'w1', 1),
      scope: 'brief',
      subject: 'w1',
      seq: 1,
      startedAt: at,
      heartbeatAt: at,
      finishedAt: '',
      outcome: '',
      detail: '',
    })
  }

  it('Herzschlag älter als die Frist ⇒ der Start übernimmt mit seq 2', async () => {
    plantLease(RUN_LEASE_STALL_MS + 1_000)
    await handler(newEvent())
    await settled()

    expect(store.rows.get(runLeaseRowId('brief', 'w1', 2))).toMatchObject({ outcome: 'done' })
    expect(aiVideoJsonDetailed).toHaveBeenCalledTimes(1)
  })

  it('GEGENPROBE: frischer Herzschlag ⇒ 409 brief_running, auch wenn der Stempel fehlt — nichts gebucht', async () => {
    plantLease(5_000)
    await expect(handler(newEvent())).rejects.toMatchObject({ status: 409, data: { code: 'brief_running' } })
    expect(insightsBeginAiRun).not.toHaveBeenCalled()
    expect(aiVideoJsonDetailed).not.toHaveBeenCalled()
    expect(store.rows.size).toBe(1)
  })
})
