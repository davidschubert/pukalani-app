import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { runPollingShouldTick, useRunPolling } from '../app/composables/useRunPolling'

/**
 * DAS NACHFRAGEN EINES HINTERGRUND-LAUFS (GA1 P18, BE-008).
 *
 * Vier Zusagen aus dem Kopf von `useRunPolling`, jede mit Gegenprobe:
 *  1. Gefragt wird nur, solange der Lauf läuft UND der Tab sichtbar ist.
 *  2. Zwei Ticks überlappen nie.
 *  3. Sichtbar werden ⇒ sofort eine Nachfrage.
 *  4. Ein Fehler im Tick bleibt drinnen, der nächste Takt fragt wieder.
 */

class FakeDocument extends EventTarget {
  visibilityState: 'visible' | 'hidden' = 'visible'
}

let doc: FakeDocument

beforeEach(() => {
  vi.useFakeTimers()
  doc = new FakeDocument()
  vi.stubGlobal('document', doc)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('runPollingShouldTick', () => {
  it('fragt nur bei laufendem Lauf, sichtbarem Tab und ohne offenen Tick', () => {
    expect(runPollingShouldTick({ active: true, visible: true, busy: false })).toBe(true)
    expect(runPollingShouldTick({ active: false, visible: true, busy: false })).toBe(false)
    expect(runPollingShouldTick({ active: true, visible: false, busy: false })).toBe(false)
    expect(runPollingShouldTick({ active: true, visible: true, busy: true })).toBe(false)
  })
})

describe('useRunPolling', () => {
  it('fragt im Takt, solange aktiv — und hört auf, wenn der Lauf endet', async () => {
    const active = ref(true)
    const tick = vi.fn(async () => {})
    const scope = effectScope()
    scope.run(() => useRunPolling({ active, intervalMs: 1000, tick }))

    await vi.advanceTimersByTimeAsync(3000)
    expect(tick).toHaveBeenCalledTimes(3)

    active.value = false
    await nextTick()
    await vi.advanceTimersByTimeAsync(5000)
    expect(tick).toHaveBeenCalledTimes(3)
    scope.stop()
  })

  it('fragt im versteckten Tab nicht — und sofort, wenn er wieder sichtbar wird', async () => {
    const tick = vi.fn(async () => {})
    const scope = effectScope()
    scope.run(() => useRunPolling({ active: ref(true), intervalMs: 1000, tick }))

    doc.visibilityState = 'hidden'
    await vi.advanceTimersByTimeAsync(3000)
    expect(tick).not.toHaveBeenCalled()

    doc.visibilityState = 'visible'
    doc.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()
    expect(tick).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('überlappt nicht: ein offener Tick lässt den nächsten Takt ausfallen', async () => {
    let release!: () => void
    const tick = vi.fn(() => new Promise<void>((resolve) => {
      release = resolve
    }))
    const scope = effectScope()
    scope.run(() => useRunPolling({ active: ref(true), intervalMs: 1000, tick }))

    await vi.advanceTimersByTimeAsync(5000)
    expect(tick).toHaveBeenCalledTimes(1)
    release()
    await vi.advanceTimersByTimeAsync(1000)
    expect(tick).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  it('schluckt einen Fehler im Tick und fragt im nächsten Takt wieder', async () => {
    const tick = vi.fn(async () => {
      throw new Error('netz weg')
    })
    const scope = effectScope()
    scope.run(() => useRunPolling({ active: ref(true), intervalMs: 1000, tick }))

    await vi.advanceTimersByTimeAsync(2000)
    expect(tick).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  it('räumt mit dem Gültigkeitsbereich auf: kein Takt, kein Sichtbarkeits-Hörer', async () => {
    const tick = vi.fn(async () => {})
    const scope = effectScope()
    scope.run(() => useRunPolling({ active: ref(true), intervalMs: 1000, tick }))
    scope.stop()

    await vi.advanceTimersByTimeAsync(5000)
    doc.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()
    expect(tick).not.toHaveBeenCalled()
  })
})
