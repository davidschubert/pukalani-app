import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __resetPastDueNoticeReader,
  isPastDueNoticeRunning,
  registerPastDueNoticeReader,
  runPastDueNoticeSweep,
} from '../server/utils/pastDueNotice'

/**
 * WA1 e — „schon im Gange" ist kein guter Lauf.
 *
 * Der Riegel in `runPastDueNoticeSweep` gibt einem zweiten Aufruf ein leeres
 * Ergebnis zurück. Der Zeit-Lauf der Platform-App fragt deshalb VORHER
 * `isPastDueNoticeRunning()` und meldet dann `skipped`. Hier: die Frage sagt
 * während eines Laufs Ja, davor und danach Nein — auch nach einem Fehler.
 */

afterEach(() => {
  __resetPastDueNoticeReader()
  vi.unstubAllGlobals()
})

function stubRuntime(): void {
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteProjectId: 'probe-projekt' } }))
}

describe('isPastDueNoticeRunning', () => {
  it('ohne Lauf: nein', () => {
    expect(isPastDueNoticeRunning()).toBe(false)
  })

  it('während eines Laufs: ja — ein zweiter Aufruf bekommt nur das leere Ergebnis; danach: nein', async () => {
    stubRuntime()
    let release: (rows: never[]) => void = () => {}
    let reads = 0
    registerPastDueNoticeReader(() => {
      reads += 1
      return new Promise<never[]>((resolve) => {
        release = resolve
      })
    })

    const first = runPastDueNoticeSweep()
    expect(isPastDueNoticeRunning()).toBe(true)

    // Der zweite Aufruf kommt nicht an den Leser — und sein Ergebnis sieht aus
    // wie „nichts zu tun". Genau deshalb fragt der Zeit-Lauf vorher.
    await expect(runPastDueNoticeSweep()).resolves.toEqual({ checked: 0, notified: [], withoutOwner: [] })
    expect(reads).toBe(1)
    expect(isPastDueNoticeRunning()).toBe(true)

    release([])
    await expect(first).resolves.toEqual({ checked: 0, notified: [], withoutOwner: [] })
    expect(isPastDueNoticeRunning()).toBe(false)
  })

  it('nach einem gescheiterten Lauf: nein (der Riegel bleibt nicht hängen)', async () => {
    stubRuntime()
    registerPastDueNoticeReader(async () => {
      throw new Error('probe: Leser nicht erreichbar')
    })
    await expect(runPastDueNoticeSweep()).rejects.toThrow('probe: Leser nicht erreichbar')
    expect(isPastDueNoticeRunning()).toBe(false)
  })
})
