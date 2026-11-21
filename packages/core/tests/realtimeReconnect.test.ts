import { describe, expect, it } from 'vitest'
import { RECONNECT_MAX_MS, RECONNECT_STABLE_MS, nextReconnectFailures, reconnectDelayMs } from '../shared/realtimeReconnect'

/**
 * WACHSENDE ABSTÄNDE BEIM NEUVERSUCH (Q23-Rest). Gegenprobe zur Lage davor:
 * das SDK nullte seinen Zähler bei jedem `open` — eine angenommene und gleich
 * wieder geschlossene Verbindung wartete so immer 1 s. Hier zählt die DAUER.
 */
describe('nextReconnectFailures', () => {
  it('eine kurz offene Verbindung ist ein Fehlschlag (das SDK sah hier „gesund")', () => {
    expect(nextReconnectFailures(0, 200)).toBe(1)
    expect(nextReconnectFailures(3, 5_000)).toBe(4)
  })
  it('eine nie aufgegangene Verbindung ist ein Fehlschlag', () => {
    expect(nextReconnectFailures(2, null)).toBe(3)
  })
  it('erst eine Verbindung, die lange genug hielt, setzt zurück', () => {
    expect(nextReconnectFailures(7, RECONNECT_STABLE_MS)).toBe(0)
    expect(nextReconnectFailures(7, RECONNECT_STABLE_MS - 1)).toBe(8)
  })
})

describe('reconnectDelayMs', () => {
  it('beginnt bei 1 s wie bisher und verdoppelt sich', () => {
    expect([1, 2, 3, 4, 5, 6].map(reconnectDelayMs)).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 32_000])
  })
  it('hat eine Obergrenze', () => {
    expect(reconnectDelayMs(7)).toBe(RECONNECT_MAX_MS)
    expect(reconnectDelayMs(10_000)).toBe(RECONNECT_MAX_MS)
  })
  it('in einer Stunde Ablehnung nach dem Öffnen: dutzende statt 3600 Versuche', () => {
    let failures = 0
    let elapsed = 0
    let attempts = 0
    while (elapsed < 3_600_000) {
      failures = nextReconnectFailures(failures, 100)
      elapsed += reconnectDelayMs(failures) + 100
      attempts++
    }
    expect(attempts).toBeLessThan(70)
  })
})
