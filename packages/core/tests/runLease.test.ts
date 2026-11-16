import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  RUN_LEASE_BUSY_CODE,
  RUN_LEASE_DETAIL_MAX,
  RUN_LEASE_STALL_MS,
  clampRunLeaseDetail,
  parseRunLeaseDetail,
  runLeaseStartable,
  runLeaseState,
} from '../shared/runLease'
import type { RunLeaseRow } from '../server/utils/runLease'
import type { MemoryStore } from './support/runLeaseMemoryStore'
import { memoryStore } from './support/runLeaseMemoryStore'

/**
 * DIE LAUF-SPERRE (GA1 P18) — gegen die echte Logik mit einem In-Memory-Store,
 * dessen `create` sich wie Appwrite verhält: eine vorhandene Id ist ein
 * Konflikt. Das Rennen zweier Starter wird über ein künstlich verzögertes
 * `latest` erzwungen — beide lesen DENSELBEN Vorgänger, bevor einer anlegt.
 * Gestubbt ist nur das Nitro-Global `createError`.
 */

type Mod = typeof import('../server/utils/runLease')
let mod: Mod

beforeAll(async () => {
  vi.stubGlobal('createError', (input: { status: number, statusText: string, data?: unknown }) =>
    Object.assign(new Error(input.statusText), { statusCode: input.status, data: input.data }))
  mod = await import('../server/utils/runLease')
})

afterEach(() => {
  vi.useRealTimers()
})

interface HttpError { statusCode: number, data?: { code?: string } }

const NOW = Date.parse('2026-11-16T12:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

function seed(store: MemoryStore, seq: number, patch: Partial<RunLeaseRow> = {}): RunLeaseRow {
  const row: RunLeaseRow = {
    $id: mod.runLeaseRowId('run', 'p1', seq),
    scope: 'run',
    subject: 'p1',
    seq,
    startedAt: iso(NOW - 1000),
    heartbeatAt: iso(NOW - 1000),
    finishedAt: '',
    outcome: '',
    detail: '',
    ...patch,
  }
  store.rows.set(row.$id, row)
  return row
}

/** Ein Tor, das `latest` aufhält, bis alle Starter gelesen haben. */
function holdReads(store: MemoryStore): () => void {
  let open!: () => void
  store.gate = new Promise<void>((resolve) => {
    open = resolve
  })
  return () => {
    store.gate = null
    open()
  }
}

async function race(store: MemoryStore, n: number) {
  const release = holdReads(store)
  const starts = Array.from({ length: n }, () =>
    mod.acquireRunLease(store, { scope: 'run', subject: 'p1', nowMs: NOW }))
  await new Promise(resolve => setTimeout(resolve, 5))
  release()
  return await Promise.allSettled(starts)
}

function busy(result: PromiseSettledResult<unknown>): boolean {
  if (result.status !== 'rejected') return false
  const error = result.reason as HttpError
  return error.statusCode === 409 && error.data?.code === RUN_LEASE_BUSY_CODE
}

// ── Zustand ────────────────────────────────────────────────────────────────

describe('runLeaseState', () => {
  const lease = (patch: Partial<RunLeaseRow>) => ({ heartbeatAt: iso(NOW), finishedAt: '', outcome: '', ...patch })

  it('none / running / stalled / failed / done', () => {
    expect(runLeaseState(null, NOW)).toBe('none')
    expect(runLeaseState(lease({ heartbeatAt: iso(NOW - 10_000) }), NOW)).toBe('running')
    expect(runLeaseState(lease({ heartbeatAt: iso(NOW - RUN_LEASE_STALL_MS - 1) }), NOW)).toBe('stalled')
    expect(runLeaseState(lease({ finishedAt: iso(NOW), outcome: 'done' }), NOW)).toBe('done')
    expect(runLeaseState(lease({ finishedAt: iso(NOW), outcome: 'fetch_failed' }), NOW)).toBe('failed')
  })

  it('ein unlesbarer Herzschlag zählt als stalled, nie als running', () => {
    expect(runLeaseState(lease({ heartbeatAt: 'kaputt' }), NOW)).toBe('stalled')
    expect(runLeaseState(lease({ heartbeatAt: '' }), NOW)).toBe('stalled')
  })

  it('die Grenze liegt genau bei stallMs (darunter running, ab dort stalled)', () => {
    expect(runLeaseState(lease({ heartbeatAt: iso(NOW - 999) }), NOW, 1000)).toBe('running')
    expect(runLeaseState(lease({ heartbeatAt: iso(NOW - 1000) }), NOW, 1000)).toBe('stalled')
  })

  it('startbar ist alles außer running', () => {
    expect(runLeaseStartable('running')).toBe(false)
    for (const state of ['none', 'stalled', 'failed', 'done'] as const) {
      expect(runLeaseStartable(state)).toBe(true)
    }
  })
})

// ── Start ──────────────────────────────────────────────────────────────────

describe('acquireRunLease', () => {
  it('ZWEI gleichzeitige Starts ⇒ genau einer gewinnt, der andere 409 run_running', async () => {
    const store = memoryStore()
    const results = await race(store, 2)
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(busy)).toHaveLength(1)
    expect(store.calls.create).toBe(2) // beide haben es versucht — die Sperre hielt am Anlegen
    expect(store.rows.size).toBe(1)
  })

  it('ZEHN gleichzeitige Starts ⇒ genau einer gewinnt', async () => {
    const store = memoryStore()
    const results = await race(store, 10)
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(busy)).toHaveLength(9)
    expect(store.rows.size).toBe(1)
  })

  it('Übernahme eines abgestorbenen Laufs: genau einer gewinnt, seq ist Vorgänger + 1', async () => {
    const store = memoryStore()
    seed(store, 4, { heartbeatAt: iso(NOW - RUN_LEASE_STALL_MS - 5000) })
    const results = await race(store, 5)
    const won = results.filter(r => r.status === 'fulfilled')
    expect(won).toHaveLength(1)
    expect(results.filter(busy)).toHaveLength(4)
    const { lease, previousState } = (won[0] as PromiseFulfilledResult<Awaited<ReturnType<Mod['acquireRunLease']>>>).value
    expect(lease.seq).toBe(5)
    expect(previousState).toBe('stalled')
  })

  it('laufender Vorgänger ⇒ 409 ohne create-Aufruf', async () => {
    const store = memoryStore()
    seed(store, 1)
    const error = await mod.acquireRunLease(store, { scope: 'run', subject: 'p1', nowMs: NOW }).catch((e: HttpError) => e)
    expect(error).toMatchObject({ statusCode: 409, data: { code: RUN_LEASE_BUSY_CODE } })
    expect(store.calls.create).toBe(0)
  })

  it('beendeter Vorgänger ⇒ neuer Lauf mit seq + 1', async () => {
    const store = memoryStore()
    seed(store, 2, { finishedAt: iso(NOW - 500), outcome: 'done' })
    const { lease, previous, previousState } = await mod.acquireRunLease(store, {
      scope: 'run', subject: 'p1', nowMs: NOW, detail: { candidates: 3 },
    })
    expect(lease.seq).toBe(3)
    expect(lease.$id).toBe(mod.runLeaseRowId('run', 'p1', 3))
    expect(lease.startedAt).toBe(iso(NOW))
    expect(lease.heartbeatAt).toBe(iso(NOW))
    expect(parseRunLeaseDetail(lease.detail)).toEqual({ candidates: 3 })
    expect(previous?.seq).toBe(2)
    expect(previousState).toBe('done')
  })

  it('erster Lauf überhaupt ⇒ seq 1, previousState none', async () => {
    const store = memoryStore()
    const { lease, previousState } = await mod.acquireRunLease(store, { scope: 'run', subject: 'p1', nowMs: NOW })
    expect(lease.seq).toBe(1)
    expect(previousState).toBe('none')
  })

  it('abgestorbener Lauf: die Sperre löst sich nach stallMs von selbst', async () => {
    const store = memoryStore()
    seed(store, 1, { heartbeatAt: iso(NOW) })
    // Gegenprobe: kurz danach noch gesperrt.
    await expect(mod.acquireRunLease(store, { scope: 'run', subject: 'p1', nowMs: NOW + 1000 }))
      .rejects.toMatchObject({ statusCode: 409 })
    const later = await mod.acquireRunLease(store, { scope: 'run', subject: 'p1', nowMs: NOW + RUN_LEASE_STALL_MS })
    expect(later.previousState).toBe('stalled')
    expect(later.lease.seq).toBe(2)
  })

  it('andere (scope, subject) sperren einander nicht', async () => {
    const store = memoryStore()
    seed(store, 1)
    const other = await mod.acquireRunLease(store, { scope: 'run', subject: 'p2', nowMs: NOW })
    expect(other.lease.seq).toBe(1)
  })

  it('Lesefehler ⇒ KEIN 409 und KEIN Erfolg (≥ 500), create nie gerufen', async () => {
    const store = memoryStore()
    store.failLatest = true
    const error = await mod.acquireRunLease(store, { scope: 'run', subject: 'p1', nowMs: NOW }).then(
      () => null,
      (e: HttpError) => e,
    )
    expect(error).not.toBeNull()
    expect(error!.statusCode).toBeGreaterThanOrEqual(500)
    expect(store.calls.create).toBe(0)
  })

  it('Anlege-Fehler ohne Konflikt ⇒ ≥ 500, nicht 409', async () => {
    const store = memoryStore()
    store.create = async () => {
      throw new Error('appwrite down')
    }
    const error = await mod.acquireRunLease(store, { scope: 'run', subject: 'p1', nowMs: NOW }).catch((e: HttpError) => e)
    expect(error.statusCode).toBeGreaterThanOrEqual(500)
  })
})

// ── Ende und Rücknahme ─────────────────────────────────────────────────────

describe('finishRunLease / dropRunLease', () => {
  it('finish schreibt finishedAt, outcome (gekürzt) und detail', async () => {
    const store = memoryStore()
    const { lease } = await mod.acquireRunLease(store, { scope: 'run', subject: 'p1', nowMs: NOW })
    const done = await mod.finishRunLease(store, lease, { outcome: 'x'.repeat(50), detail: { n: 1 }, nowMs: NOW + 10 })
    expect(done.finishedAt).toBe(iso(NOW + 10))
    expect(done.outcome).toHaveLength(32)
    expect(done.detail).toBe('{"n":1}')
    expect(runLeaseState(done, NOW + 20)).toBe('failed')
  })

  it('drop löscht die Zeile — der Gegenstand ist sofort wieder frei', async () => {
    const store = memoryStore()
    const { lease } = await mod.acquireRunLease(store, { scope: 'run', subject: 'p1', nowMs: NOW })
    await mod.dropRunLease(store, lease)
    expect(store.rows.size).toBe(0)
    const again = await mod.acquireRunLease(store, { scope: 'run', subject: 'p1', nowMs: NOW })
    expect(again.lease.seq).toBe(1)
  })

  it('drop mit Löschfehler ⇒ als rejected beendet', async () => {
    const store = memoryStore()
    const { lease } = await mod.acquireRunLease(store, { scope: 'run', subject: 'p1', nowMs: NOW })
    store.failRemove = true
    await mod.dropRunLease(store, lease)
    const row = store.rows.get(lease.$id)!
    expect(row.outcome).toBe('rejected')
    expect(runLeaseStartable(runLeaseState(row, Date.now()))).toBe(true)
  })

  it('drop wirft nie — auch wenn Löschen UND Beenden scheitern', async () => {
    const store = memoryStore()
    const { lease } = await mod.acquireRunLease(store, { scope: 'run', subject: 'p1', nowMs: NOW })
    store.failRemove = true
    store.failUpdate = true
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(mod.dropRunLease(store, lease)).resolves.toBeUndefined()
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })
})

// ── Herzschlag ─────────────────────────────────────────────────────────────

describe('keepRunLeaseAlive', () => {
  async function setup() {
    const store = memoryStore()
    const { lease } = await mod.acquireRunLease(store, { scope: 'run', subject: 'p1', nowMs: NOW })
    vi.useFakeTimers()
    return { store, lease }
  }

  it('schreibt im Takt, stop() beendet', async () => {
    const { store, lease } = await setup()
    const alive = mod.keepRunLeaseAlive(store, lease, { intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(3000)
    expect(store.calls.update).toBe(3)
    alive.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(store.calls.update).toBe(3)
    expect(alive.lost()).toBe(false)
  })

  it('drei Fehlschläge in Folge ⇒ lost(); ein Erfolg dazwischen setzt zurück', async () => {
    const { store, lease } = await setup()
    const alive = mod.keepRunLeaseAlive(store, lease, { intervalMs: 1000 })
    store.failUpdate = true
    await vi.advanceTimersByTimeAsync(2000)
    expect(alive.lost()).toBe(false) // zwei Fehlschläge
    store.failUpdate = false
    await vi.advanceTimersByTimeAsync(1000) // Erfolg ⇒ Zähler 0
    store.failUpdate = true
    await vi.advanceTimersByTimeAsync(2000)
    expect(alive.lost()).toBe(false) // wieder erst zwei
    await vi.advanceTimersByTimeAsync(1000)
    expect(alive.lost()).toBe(true)
    alive.stop()
  })

  it('überlappt nicht: solange ein Schreibvorgang hängt, fällt der nächste Takt aus', async () => {
    const { store, lease } = await setup()
    let release!: () => void
    const original = store.update.bind(store)
    store.update = async (id, data) => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return await original(id, data)
    }
    const alive = mod.keepRunLeaseAlive(store, lease, { intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(5000)
    expect(store.calls.update).toBe(0) // der erste hängt noch im Wrapper
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(store.calls.update).toBe(1)
    alive.stop()
  })
})

// ── Kleinteile ─────────────────────────────────────────────────────────────

describe('Detail, Id, runDetached', () => {
  it('clampRunLeaseDetail: über der Grenze ⇒ leer; parse: kaputt ⇒ {}', () => {
    expect(clampRunLeaseDetail({ a: 1 })).toBe('{"a":1}')
    expect(clampRunLeaseDetail(undefined)).toBe('')
    expect(clampRunLeaseDetail('x'.repeat(RUN_LEASE_DETAIL_MAX))).toBe('') // + 2 Anführungszeichen
    expect(clampRunLeaseDetail('x'.repeat(RUN_LEASE_DETAIL_MAX - 2))).toHaveLength(RUN_LEASE_DETAIL_MAX)
    expect(parseRunLeaseDetail('{kaputt')).toEqual({})
    expect(parseRunLeaseDetail('[1,2]')).toEqual({})
    expect(parseRunLeaseDetail(null)).toEqual({})
    expect(parseRunLeaseDetail('{"n":2}')).toEqual({ n: 2 })
  })

  it('runLeaseRowId ist stabil, 32 Zeichen, [a-z0-9], und hängt an allen drei Teilen', () => {
    const id = mod.runLeaseRowId('run', 'p1', 1)
    expect(id).toBe(mod.runLeaseRowId('run', 'p1', 1))
    expect(id).toHaveLength(32)
    expect(id).toMatch(/^r[a-f0-9]{31}$/)
    expect(new Set([
      id,
      mod.runLeaseRowId('run', 'p1', 2),
      mod.runLeaseRowId('run', 'p2', 1),
      mod.runLeaseRowId('newsletter', 'p1', 1),
    ]).size).toBe(4)
  })

  it('runDetached fängt Ablehnungen — auch synchron geworfene', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mod.runDetached('probe', async () => {
      throw new Error('async')
    })
    mod.runDetached('probe', (() => {
      throw new Error('sync')
    }) as () => Promise<void>)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(log).toHaveBeenCalledTimes(2)
    expect(String(log.mock.calls[0]![0])).toContain('[probe]')
    log.mockRestore()
  })
})
