import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSharedPoll, type SharedPollSource } from '../shared/sharedPoll'

/**
 * EIN Abruf je Reiter (PERF-011, Q23): Leser der Anwesenheit teilen Liste,
 * Abo und Takt (`shared/sharedPoll.ts`, benutzt von `usePresence()`).
 *
 * GEGENPROBE (2026-11-21): der Fall „vier Leser je eine eigene Instanz" unten
 * zählt das alte Verhalten nach — vier Leser, vier Abrufe je Takt, wie im
 * Befund gemessen (zwölf in 65 s auf der Dashboard-Übersicht).
 */
const POLL_MS = 20_000
const options = { pollMs: POLL_MS, debounceMs: 250, lingerMs: 2_000 }

function fakeSource(values: () => number) {
  let onChange: (() => void) | undefined
  const unsubscribe = vi.fn()
  const source: SharedPollSource<number> = {
    list: vi.fn(async () => values()),
    subscribe: vi.fn(async (cb: () => void) => { onChange = cb; return unsubscribe }),
  }
  return { source, unsubscribe, fire: () => onChange?.() }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('createSharedPoll', () => {
  it('vier Leser = EIN Abruf beim Start und EINER je Takt', async () => {
    const poll = createSharedPoll<number>(options)
    const { source } = fakeSource(() => 1)
    const connect = vi.fn(async () => source)
    const seen: number[][] = [[], [], [], []]
    for (const s of seen) poll.acquire(v => s.push(v), connect)
    await vi.advanceTimersByTimeAsync(0)

    expect(connect).toHaveBeenCalledTimes(1)
    expect(source.subscribe).toHaveBeenCalledTimes(1)
    expect(source.list).toHaveBeenCalledTimes(1)

    // 65 s Ruhe wie in der Messung des Befunds: Start + 3 Takte = 4 Abrufe
    await vi.advanceTimersByTimeAsync(65_000)
    expect(source.list).toHaveBeenCalledTimes(4)
    for (const s of seen) expect(s).toEqual([1, 1, 1, 1])
  })

  it('GEGENPROBE: vier eigene Instanzen = vier Abrufe je Takt (das alte Verhalten)', async () => {
    const { source } = fakeSource(() => 1)
    for (let i = 0; i < 4; i++) createSharedPoll<number>(options).acquire(() => {}, async () => source)
    await vi.advanceTimersByTimeAsync(65_000)
    expect(source.list).toHaveBeenCalledTimes(16)
  })

  it('der Takt setzt aus, wenn ein Ereignis kurz vorher schon abgerufen hat', async () => {
    const poll = createSharedPoll<number>(options)
    const { source, fire } = fakeSource(() => 1)
    poll.acquire(() => {}, async () => source)
    await vi.advanceTimersByTimeAsync(0) // Start: 1
    // Herzschlag-Ereignis kurz vor jedem Takt (wie im Browser gemessen)
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(POLL_MS - 1_000)
      fire()
      await vi.advanceTimersByTimeAsync(1_000)
    }
    // 1 Start + 3 Ereignis-Abrufe, die drei Takte setzen aus
    expect(source.list).toHaveBeenCalledTimes(4)
  })

  it('Ereignis knapp NACH dem fälligen Takt-Zeitpunkt: trotzdem nur ein Abruf je Takt', async () => {
    const poll = createSharedPoll<number>(options)
    const { source, fire } = fakeSource(() => 1)
    poll.acquire(() => {}, async () => source)
    await vi.advanceTimersByTimeAsync(0) // Start: 1, Takt fällig bei 20 s
    // Ereignis bei 19,9 s bricht den Takt ab, Abruf bei 20,15 s stellt ihn
    // auf 40,15 s; das nächste Ereignis bei 39,9 s wieder, usw.
    for (let i = 1; i <= 3; i++) {
      await vi.advanceTimersByTimeAsync(i === 1 ? POLL_MS - 100 : POLL_MS - 250)
      fire()
      await vi.advanceTimersByTimeAsync(250)
    }
    await vi.advanceTimersByTimeAsync(1_000)
    expect(source.list).toHaveBeenCalledTimes(4)
  })

  it('ein später Leser bekommt sofort den Stand, ohne neuen Abruf', async () => {
    const poll = createSharedPoll<number>(options)
    const { source } = fakeSource(() => 7)
    poll.acquire(() => {}, async () => source)
    await vi.advanceTimersByTimeAsync(0)
    const late = vi.fn()
    poll.acquire(late, async () => source)
    expect(late).toHaveBeenCalledWith(7)
    expect(source.list).toHaveBeenCalledTimes(1)
  })

  it('Ereignis-Bursts werden zu EINEM Abruf gebündelt', async () => {
    const poll = createSharedPoll<number>(options)
    const { source, fire } = fakeSource(() => 1)
    poll.acquire(() => {}, async () => source)
    await vi.advanceTimersByTimeAsync(0)
    fire(); fire(); fire()
    await vi.advanceTimersByTimeAsync(300)
    expect(source.list).toHaveBeenCalledTimes(2)
  })

  it('Seitenwechsel im Nachlauf: kein Abbau, kein neuer Start', async () => {
    const poll = createSharedPoll<number>(options)
    const { source, unsubscribe } = fakeSource(() => 1)
    const connect = vi.fn(async () => source)
    const release = poll.acquire(() => {}, connect)
    await vi.advanceTimersByTimeAsync(0)
    release()
    await vi.advanceTimersByTimeAsync(500)
    poll.acquire(() => {}, connect)
    await vi.advanceTimersByTimeAsync(0)
    expect(connect).toHaveBeenCalledTimes(1)
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it('der letzte Leser räumt nach dem Nachlauf ab: Abo zu, kein Takt mehr', async () => {
    const poll = createSharedPoll<number>(options)
    const { source, unsubscribe } = fakeSource(() => 1)
    const a = poll.acquire(() => {}, async () => source)
    const b = poll.acquire(() => {}, async () => source)
    await vi.advanceTimersByTimeAsync(0)
    a(); b(); b() // doppeltes Abmelden ist harmlos
    await vi.advanceTimersByTimeAsync(2_000)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    const calls = vi.mocked(source.list).mock.calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(source.list).toHaveBeenCalledTimes(calls)
    expect(poll.readers()).toBe(0)
  })

  it('Abmelden, bevor die Quelle steht: kein Abo, kein Takt bleibt zurück', async () => {
    const poll = createSharedPoll<number>(options)
    const { source } = fakeSource(() => 1)
    let resolve!: (s: SharedPollSource<number>) => void
    const release = poll.acquire(() => {}, () => new Promise(r => { resolve = r }))
    release()
    await vi.advanceTimersByTimeAsync(2_000)
    resolve(source)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(source.list).not.toHaveBeenCalled()
    expect(source.subscribe).not.toHaveBeenCalled()
  })

  it('ein fehlgeschlagener Abruf behält den letzten Stand; der Takt läuft weiter', async () => {
    const poll = createSharedPoll<number>(options)
    let n = 0
    const source: SharedPollSource<number> = {
      list: vi.fn(async () => { n++; if (n === 2) throw new Error('401'); return n }),
    }
    const seen: number[] = []
    poll.acquire(v => seen.push(v), async () => source)
    await vi.advanceTimersByTimeAsync(2 * POLL_MS)
    expect(seen).toEqual([1, 3])
  })

  it('keine Quelle (Realtime aus): kein Abruf; ein Fehler beim Aufbau lässt den nächsten Leser neu starten', async () => {
    const empty = createSharedPoll<number>(options)
    const seen = vi.fn()
    empty.acquire(seen, async () => null)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(seen).not.toHaveBeenCalled()

    const poll = createSharedPoll<number>(options)
    const { source } = fakeSource(() => 1)
    const connect = vi.fn()
      .mockRejectedValueOnce(new Error('jwt'))
      .mockResolvedValue(source)
    poll.acquire(() => {}, connect)
    await vi.advanceTimersByTimeAsync(0)
    poll.acquire(() => {}, connect)
    await vi.advanceTimersByTimeAsync(0)
    expect(connect).toHaveBeenCalledTimes(2)
    expect(source.list).toHaveBeenCalledTimes(1)
  })
})
