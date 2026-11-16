import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetTimedJobsForTests, defineTimedJob, listTimedJobs } from '../server/utils/timedJob'

/**
 * DIE EINE HILFE FÜR ZEIT-LÄUFE (`server/utils/timedJob.ts`, OPS-011).
 *
 * Geprüft wird, was der Wächter auf dem Server zählt: GENAU eine
 * `job.registered`-Zeile je Anmeldung und GENAU eine `job.run`-Zeile je
 * Takt — in exakt dieser Form, auf dem richtigen Kanal (stdout bei Erfolg,
 * stderr bei `failed`). Dazu die Zusagen, die kein Typ hält: kein Sofortlauf
 * ohne `firstRunMs`, kein überlappender Lauf, der nächste Takt nach einem
 * Fehlschlag, keine unbehandelte Ablehnung.
 */

const MIN = 60 * 1000
const T0 = new Date('2026-11-16T10:00:00.000Z')

let out: string[]
let err: string[]

function lines(stream: string[], event?: string): Array<Record<string, unknown>> {
  return stream
    .map(line => JSON.parse(line) as Record<string, unknown>)
    .filter(line => event === undefined || line.event === event)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  out = []
  err = []
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => { out.push(String(line)) })
  vi.spyOn(console, 'warn').mockImplementation((line: unknown) => { out.push(String(line)) })
  vi.spyOn(console, 'error').mockImplementation((line: unknown) => { err.push(String(line)) })
})

afterEach(() => {
  __resetTimedJobsForTests()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('defineTimedJob', () => {
  it('schreibt bei der Anmeldung genau eine Zeile job.registered', () => {
    defineTimedJob({ name: 'probe-job', everyMs: 60 * MIN, run: async () => {} })
    expect(lines(out)).toEqual([
      { time: T0.toISOString(), level: 'info', event: 'job.registered', job: 'probe-job', everyMin: 60 },
    ])
    expect(err).toEqual([])
  })

  it('ok: eine job.run-Zeile auf stdout, exakt in dieser Form', async () => {
    defineTimedJob({
      name: 'probe-job',
      everyMs: 30 * MIN,
      firstRunMs: 10_000,
      run: async () => {
        await new Promise(resolve => setTimeout(resolve, 250))
      },
    })
    await vi.advanceTimersByTimeAsync(10_000 + 250)

    expect(lines(out, 'job.run')).toEqual([{
      time: new Date(T0.getTime() + 10_250).toISOString(),
      level: 'info',
      event: 'job.run',
      job: 'probe-job',
      result: 'ok',
      ms: 250,
      everyMin: 30,
    }])
    expect(err).toEqual([])
    const [state] = listTimedJobs()
    expect(state).toEqual({
      name: 'probe-job',
      everyMs: 30 * MIN,
      lastRunAt: new Date(T0.getTime() + 10_250).toISOString(),
      lastResult: 'ok',
      lastOkAt: new Date(T0.getTime() + 10_250).toISOString(),
      runs: 1,
      failures: 0,
    })
  })

  it('failed: Level error auf stderr, mit Fehlerklasse und gekürzter Nachricht', async () => {
    defineTimedJob({
      name: 'probe-job',
      everyMs: 60 * MIN,
      firstRunMs: 1000,
      run: async () => {
        throw new TypeError('x'.repeat(500))
      },
    })
    await vi.advanceTimersByTimeAsync(1000)

    expect(lines(out, 'job.run')).toEqual([])
    expect(lines(err)).toEqual([{
      time: new Date(T0.getTime() + 1000).toISOString(),
      level: 'error',
      event: 'job.run',
      job: 'probe-job',
      result: 'failed',
      ms: 0,
      everyMin: 60,
      error: 'TypeError',
      message: 'x'.repeat(300),
    }])
    expect(listTimedJobs()[0]).toMatchObject({ lastResult: 'failed', lastOkAt: null, runs: 1, failures: 1 })
  })

  it('skipped: der Lauf war dran, hatte aber nichts zu tun — info, ohne reason', async () => {
    defineTimedJob({ name: 'probe-job', everyMs: 60 * MIN, firstRunMs: 1000, run: async () => 'skipped' })
    await vi.advanceTimersByTimeAsync(1000)

    expect(lines(out, 'job.run')).toEqual([{
      time: new Date(T0.getTime() + 1000).toISOString(),
      level: 'info',
      event: 'job.run',
      job: 'probe-job',
      result: 'skipped',
      ms: 0,
      everyMin: 60,
    }])
    expect(listTimedJobs()[0]).toMatchObject({ lastResult: 'skipped', lastOkAt: null, runs: 1, failures: 0 })
  })

  it('kein Sofortlauf ohne firstRunMs: der erste Lauf kommt erst nach everyMs', async () => {
    const run = vi.fn(async () => {})
    defineTimedJob({ name: 'probe-job', everyMs: 30 * MIN, run })

    await vi.advanceTimersByTimeAsync(30 * MIN - 1)
    expect(run).not.toHaveBeenCalled()
    expect(lines(out, 'job.run')).toEqual([])

    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(1)
    expect(lines(out, 'job.run')).toHaveLength(1)
  })

  it('mit firstRunMs: erster Lauf nach der Verzögerung, dann im Takt', async () => {
    const run = vi.fn(async () => {})
    defineTimedJob({ name: 'probe-job', everyMs: 10 * MIN, firstRunMs: 30_000, run })

    await vi.advanceTimersByTimeAsync(30_000)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10 * MIN - 30_000)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('der nächste Takt läuft nach einem Fehlschlag weiter — ohne unbehandelte Ablehnung', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    let calls = 0
    defineTimedJob({
      name: 'probe-job',
      everyMs: 10 * MIN,
      run: async () => {
        calls++
        if (calls === 1) throw new Error('kaputt')
      },
    })

    await vi.advanceTimersByTimeAsync(20 * MIN)
    process.off('unhandledRejection', unhandled)

    expect(calls).toBe(2)
    expect(lines(err, 'job.run').map(line => line.result)).toEqual(['failed'])
    expect(lines(out, 'job.run').map(line => line.result)).toEqual(['ok'])
    expect(listTimedJobs()[0]).toMatchObject({ lastResult: 'ok', runs: 2, failures: 1 })
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('auch ein Nicht-Error-Wurf wird zu failed', async () => {
    defineTimedJob({
      name: 'probe-job',
      everyMs: 10 * MIN,
      firstRunMs: 0,
      run: async () => { throw 'nur ein Text' },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(lines(err, 'job.run')).toMatchObject([{ result: 'failed', error: 'string', message: 'nur ein Text' }])
  })

  it('overlap: läuft der vorige Takt noch, startet der neue nicht und meldet skipped/overlap', async () => {
    let release: () => void = () => {}
    const run = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    defineTimedJob({ name: 'probe-job', everyMs: 10 * MIN, firstRunMs: 0, run })

    await vi.advanceTimersByTimeAsync(0)
    expect(run).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10 * MIN)
    expect(run).toHaveBeenCalledTimes(1)
    expect(lines(out, 'job.run')).toEqual([{
      time: new Date(T0.getTime() + 10 * MIN).toISOString(),
      level: 'info',
      event: 'job.run',
      job: 'probe-job',
      result: 'skipped',
      ms: 0,
      everyMin: 10,
      reason: 'overlap',
    }])

    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(lines(out, 'job.run').map(line => line.result)).toEqual(['skipped', 'ok'])
    expect(lines(out, 'job.run')[1]!.ms).toBe(10 * MIN)

    await vi.advanceTimersByTimeAsync(10 * MIN)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('ungültige Kennung wirft und meldet nichts an', () => {
    for (const name of ['', 'A-job', '1job', 'j', 'job_name', 'job name', `j${'a'.repeat(40)}`]) {
      expect(() => defineTimedJob({ name, everyMs: MIN, run: async () => {} })).toThrow(/ungültige Kennung/)
    }
    expect(listTimedJobs()).toEqual([])
    expect(out).toEqual([])
  })

  it('gültige Grenzfälle der Kennung', () => {
    defineTimedJob({ name: 'ab', everyMs: MIN, run: async () => {} })
    defineTimedJob({ name: `a${'b'.repeat(39)}`, everyMs: MIN, run: async () => {} })
    expect(listTimedJobs().map(job => job.name)).toEqual(['ab', `a${'b'.repeat(39)}`])
  })

  it('doppelte Kennung wirft unter vitest', () => {
    defineTimedJob({ name: 'probe-job', everyMs: MIN, run: async () => {} })
    expect(() => defineTimedJob({ name: 'probe-job', everyMs: MIN, run: async () => {} })).toThrow(/schon angemeldet/)
    expect(listTimedJobs()).toHaveLength(1)
  })

  it('doppelte Kennung außerhalb von Tests: zweite ignoriert, eine job.duplicate-Zeile, der erste Takt läuft', async () => {
    vi.stubEnv('VITEST', '')
    const first = vi.fn(async () => {})
    const second = vi.fn(async () => {})
    defineTimedJob({ name: 'probe-job', everyMs: MIN, run: first })
    expect(() => defineTimedJob({ name: 'probe-job', everyMs: MIN, run: second })).not.toThrow()

    expect(lines(err)).toEqual([
      { time: T0.toISOString(), level: 'error', event: 'job.duplicate', job: 'probe-job' },
    ])
    expect(lines(out, 'job.registered')).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(MIN)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('listTimedJobs gibt Kopien heraus', () => {
    defineTimedJob({ name: 'probe-job', everyMs: MIN, run: async () => {} })
    const [state] = listTimedJobs()
    state!.runs = 99
    expect(listTimedJobs()[0]!.runs).toBe(0)
  })
})
