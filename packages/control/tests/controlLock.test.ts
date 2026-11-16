import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppwriteException } from 'node-appwrite'
import type { H3Event } from 'h3'
import type { RunLeaseCreateData, RunLeaseRow, RunLeaseStore, RunLeaseUpdateData } from '../../core/server/utils/runLease'
import { runLeaseRowId } from '../../core/server/utils/runLease'
import { createRaceTablesDB } from './support/raceTablesDB'

/**
 * BE-013 — `withControlLock`: kurze Arbeit unter der Lauf-Sperre des Core.
 *
 * Ein In-Memory-Store mit echtem Konflikt beim Anlegen (409 für eine
 * vorhandene Id) und einer Hand-Abgabe in jedem Aufruf, damit gleichzeitige
 * Anfragen sich wirklich verschränken. Geprüft wird: gleichzeitige Arbeit
 * läuft NACHEINANDER, ein toter Halter wird übernommen, eine nicht prüfbare
 * Sperre lässt die Arbeit nicht laufen, und die Sperre fällt auch, wenn die
 * Arbeit wirft.
 */

vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('logEvent', () => {})

const race = createRaceTablesDB()
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB: race.tablesDB }))

const { CONTROL_LOCK_STALL_MS, CONTROL_LOCK_TABLE, controlLockSubject, withControlLock } = await import('../server/utils/controlLock')

const event = { context: {} } as unknown as H3Event
const handOff = () => new Promise<void>(resolve => setImmediate(resolve))

function memoryStore(): RunLeaseStore & { rows: Map<string, RunLeaseRow>, failLatest: Error | null } {
  const rows = new Map<string, RunLeaseRow>()
  const store = {
    rows,
    failLatest: null as Error | null,
    async latest(scope: string, subject: string) {
      await handOff()
      if (store.failLatest) throw store.failLatest
      const matching = [...rows.values()].filter(row => row.scope === scope && row.subject === subject)
      matching.sort((a, b) => b.seq - a.seq)
      return matching[0] ? { ...matching[0] } : null
    },
    async create(id: string, data: RunLeaseCreateData) {
      await handOff()
      if (rows.has(id)) throw Object.assign(new Error('exists'), { conflict: true })
      const row: RunLeaseRow = { $id: id, finishedAt: '', outcome: '', ...data }
      rows.set(id, row)
      return { ...row }
    },
    async update(id: string, data: RunLeaseUpdateData) {
      await handOff()
      const row = rows.get(id)
      if (!row) throw new Error('missing')
      Object.assign(row, data)
      return { ...row }
    },
    async remove(id: string) {
      await handOff()
      rows.delete(id)
    },
    isConflict(error: unknown) {
      return typeof error === 'object' && error !== null && (error as { conflict?: boolean }).conflict === true
    },
  }
  return store
}

/** Arbeit, die mitzählt, wie viele gleichzeitig laufen. */
function probe() {
  let inside = 0
  let maxInside = 0
  const order: number[] = []
  const work = (n: number) => async () => {
    inside++
    maxInside = Math.max(maxInside, inside)
    for (let i = 0; i < 5; i++) await handOff()
    order.push(n)
    inside--
    return n
  }
  return { work, stats: () => ({ maxInside, order }) }
}

const FAST = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]

beforeEach(() => race.reset())

describe('withControlLock — gleichzeitige Arbeit läuft nacheinander', () => {
  it('zwei gleichzeitige: beide laufen, nie zugleich, keine Zeile bleibt', async () => {
    const store = memoryStore()
    const { work, stats } = probe()
    const results = await Promise.all([1, 2].map(n =>
      withControlLock(event, { scope: 'team', subject: 'c1', store, pausesMs: FAST }, work(n))))
    expect(results.sort()).toEqual([1, 2])
    expect(stats().maxInside).toBe(1)
    expect(store.rows.size).toBe(0)
  })

  it('zehn gleichzeitige: alle laufen, nie zwei zugleich', async () => {
    const store = memoryStore()
    const { work, stats } = probe()
    const pauses = Array.from({ length: 60 }, () => 5)
    await Promise.all(Array.from({ length: 10 }, (_, n) =>
      withControlLock(event, { scope: 'team', subject: 'c1', store, pausesMs: pauses }, work(n))))
    expect(stats().order).toHaveLength(10)
    expect(stats().maxInside).toBe(1)
    expect(store.rows.size).toBe(0)
  })

  it('verschiedene Gegenstände sperren einander nicht', async () => {
    const store = memoryStore()
    const { work, stats } = probe()
    await Promise.all([
      withControlLock(event, { scope: 'team', subject: 'c1', store, pausesMs: [] }, work(1)),
      withControlLock(event, { scope: 'team', subject: 'c2', store, pausesMs: [] }, work(2)),
    ])
    expect(stats().maxInside).toBe(2)
  })

  it('bleibt die Sperre belegt, antwortet sie nach den Pausen 409 busy — die Arbeit läuft nicht', async () => {
    const store = memoryStore()
    const subject = controlLockSubject('c1')
    const now = Date.now()
    store.rows.set(runLeaseRowId('team', subject, 1), {
      $id: runLeaseRowId('team', subject, 1), scope: 'team', subject, seq: 1,
      startedAt: new Date(now).toISOString(), heartbeatAt: new Date(now).toISOString(), finishedAt: '', outcome: '', detail: '',
    })
    const work = vi.fn(async () => 'ran')
    await expect(withControlLock(event, { scope: 'team', subject: 'c1', store, pausesMs: [1, 1, 1] }, work))
      .rejects.toMatchObject({ status: 409, data: { code: 'busy' } })
    expect(work).not.toHaveBeenCalled()
  })
})

describe('withControlLock — toter Halter', () => {
  function leftBehind(store: ReturnType<typeof memoryStore>, heartbeatMs: number) {
    const subject = controlLockSubject('c1')
    const id = runLeaseRowId('team', subject, 1)
    store.rows.set(id, {
      $id: id, scope: 'team', subject, seq: 1,
      startedAt: new Date(heartbeatMs).toISOString(), heartbeatAt: new Date(heartbeatMs).toISOString(),
      finishedAt: '', outcome: '', detail: '',
    })
    return id
  }

  it('eine liegen gebliebene Zeile älter als die Frist wird übernommen (Nachfolger-Id)', async () => {
    const store = memoryStore()
    const now = Date.now()
    const deadId = leftBehind(store, now - CONTROL_LOCK_STALL_MS - 1)
    const result = await withControlLock(event, { scope: 'team', subject: 'c1', store, pausesMs: [], nowMs: () => now }, async () => 'ran')
    expect(result).toBe('ran')
    // Die eigene Zeile (seq 2) ist wieder weg, die des Toten bleibt als Anker stehen.
    expect([...store.rows.keys()]).toEqual([deadId])
  })

  it('zwei gleichzeitige Übernahmen: genau eine läuft zuerst, die andere danach', async () => {
    const store = memoryStore()
    const now = Date.now()
    leftBehind(store, now - CONTROL_LOCK_STALL_MS - 1)
    const { work, stats } = probe()
    await Promise.all([1, 2].map(n =>
      withControlLock(event, { scope: 'team', subject: 'c1', store, pausesMs: FAST, nowMs: () => now }, work(n))))
    expect(stats().order).toHaveLength(2)
    expect(stats().maxInside).toBe(1)
  })

  it('eine Zeile jünger als die Frist wird NICHT übernommen', async () => {
    const store = memoryStore()
    const now = Date.now()
    leftBehind(store, now - CONTROL_LOCK_STALL_MS + 1_000)
    await expect(withControlLock(event, { scope: 'team', subject: 'c1', store, pausesMs: [], nowMs: () => now }, async () => 'ran'))
      .rejects.toMatchObject({ status: 409, data: { code: 'busy' } })
  })

  it('nach einer sauber freigegebenen Zeile beginnt der Nächste wieder bei seq 1', async () => {
    const store = memoryStore()
    await withControlLock(event, { scope: 'team', subject: 'c1', store, pausesMs: [] }, async () => 'one')
    const created = vi.spyOn(store, 'create')
    await withControlLock(event, { scope: 'team', subject: 'c1', store, pausesMs: [] }, async () => 'two')
    expect(created.mock.calls[0]?.[0]).toBe(runLeaseRowId('team', controlLockSubject('c1'), 1))
    expect(store.rows.size).toBe(0)
  })
})

describe('withControlLock — nicht prüfbar heißt nicht frei', () => {
  it('Lesen der Sperre scheitert ⇒ 503 run_lease_unavailable, die Arbeit läuft nicht', async () => {
    const store = memoryStore()
    store.failLatest = new Error('network down')
    const work = vi.fn(async () => 'ran')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(withControlLock(event, { scope: 'team', subject: 'c1', store }, work))
      .rejects.toMatchObject({ status: 503, data: { code: 'run_lease_unavailable' } })
    consoleError.mockRestore()
    expect(work).not.toHaveBeenCalled()
  })

  it('fehlende Tabelle (Appwrite 404) im echten Store ⇒ 503, die Arbeit läuft nicht', async () => {
    race.failingReads.set(CONTROL_LOCK_TABLE, () => new AppwriteException('Table not found', 404, 'table_not_found'))
    const work = vi.fn(async () => 'ran')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(withControlLock(event, { scope: 'team', subject: 'c1' }, work))
      .rejects.toMatchObject({ status: 503, data: { code: 'run_lease_unavailable' } })
    consoleError.mockRestore()
    expect(work).not.toHaveBeenCalled()
  })

  it('der echte Store schreibt in system_runs, und der Gegenstand steht dort nur als Hash', async () => {
    const seen: string[] = []
    await withControlLock(event, { scope: 'onboarding', subject: 'account:user-1' }, async () => {
      seen.push(...[...race.table(CONTROL_LOCK_TABLE).values()].map(row => String(row.subject)))
    })
    expect(seen).toEqual([controlLockSubject('account:user-1')])
    expect(seen[0]).toMatch(/^[0-9a-f]{64}$/)
    expect(race.table(CONTROL_LOCK_TABLE).size).toBe(0)
  })
})

describe('withControlLock — Freigabe auch beim Wurf', () => {
  it('wirft die Arbeit, fällt die Sperre trotzdem und der Fehler kommt an', async () => {
    const store = memoryStore()
    await expect(withControlLock(event, { scope: 'team', subject: 'c1', store, pausesMs: [] }, async () => {
      throw new Error('rule denied')
    })).rejects.toThrow('rule denied')
    expect(store.rows.size).toBe(0)
    await expect(withControlLock(event, { scope: 'team', subject: 'c1', store, pausesMs: [] }, async () => 'next')).resolves.toBe('next')
  })

  it('scheitert das Löschen, wird der Lauf beendet — der Gegenstand ist trotzdem frei', async () => {
    const store = memoryStore()
    store.remove = async () => { throw new Error('delete failed') }
    await withControlLock(event, { scope: 'team', subject: 'c1', store, pausesMs: [] }, async () => 'one')
    expect([...store.rows.values()].map(row => row.outcome)).toEqual(['rejected'])
    await expect(withControlLock(event, { scope: 'team', subject: 'c1', store, pausesMs: [] }, async () => 'two')).resolves.toBe('two')
  })
})
