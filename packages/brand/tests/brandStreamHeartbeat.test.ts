import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BRAND_STREAM_HEARTBEAT_FRAME,
  BRAND_STREAM_HEARTBEAT_MS,
  startBrandStreamHeartbeat,
} from '../server/utils/brandStreamHeartbeat'
import {
  type BrandGenerationEvent,
  brandProviderFailureCode,
  decodeBrandGenerationChunk,
  isBrandAiEndpointFailure,
  parseBrandGenerationEvent,
  serializeBrandGenerationEvent,
} from '../shared/brandGeneration'

/**
 * DER HERZSCHLAG IM BERATER-STROM (LL1 b) UND DER GENAUE SATZ BEI FEHLENDEM
 * ENDPUNKT (KI1 d) — pur, mit gestellter Uhr.
 *
 * Die wichtigste Aussage steht im zweiten Block: der Leser im Browser
 * (`decodeBrandGenerationChunk`) liefert MIT Lebenszeichen dieselben Ereignisse
 * wie ohne. Dieser Leser ist seit dem Start des Protokolls unverändert — das
 * belegt zugleich, dass ein ALTER Browser-Stand den neuen Server versteht.
 */

function fakeRes() {
  const written: string[] = []
  const listeners: Record<string, (() => void)[]> = {}
  const res = {
    writableEnded: false,
    destroyed: false,
    failWrites: false,
    write(chunk: string) {
      if (res.failWrites) throw new Error('write after end')
      written.push(chunk)
      return true
    },
    once(name: 'close' | 'finish', listener: () => void) {
      (listeners[name] ??= []).push(listener)
      return res
    },
    emit(name: 'close' | 'finish') {
      for (const listener of listeners[name] ?? []) listener()
    },
  }
  return { res, written, pings: () => written.filter(chunk => chunk === BRAND_STREAM_HEARTBEAT_FRAME).length }
}

describe('startBrandStreamHeartbeat', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('40 s Stille ⇒ mindestens zwei Lebenszeichen, rund alle 15 s', () => {
    const { res, pings } = fakeRes()
    startBrandStreamHeartbeat(res)
    vi.advanceTimersByTime(14_999)
    expect(pings()).toBe(0)
    vi.advanceTimersByTime(25_001)
    expect(pings()).toBeGreaterThanOrEqual(2)
    expect(BRAND_STREAM_HEARTBEAT_MS).toBeLessThan(60_000 / 3)
  })

  it('nach dem Stopp kommt keins mehr — auch ein zweites Stoppen wirft nicht', () => {
    const { res, pings } = fakeRes()
    const stop = startBrandStreamHeartbeat(res)
    vi.advanceTimersByTime(15_000)
    stop()
    stop()
    vi.advanceTimersByTime(120_000)
    expect(pings()).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ein beendeter Strom bekommt nichts mehr, auch wenn die Route das Stoppen vergäße', () => {
    const { res, pings } = fakeRes()
    startBrandStreamHeartbeat(res)
    res.writableEnded = true
    vi.advanceTimersByTime(60_000)
    expect(pings()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ein abgerissener Strom (`destroyed` oder `close`) ebenso', () => {
    const first = fakeRes()
    startBrandStreamHeartbeat(first.res)
    first.res.destroyed = true
    vi.advanceTimersByTime(60_000)
    expect(first.pings()).toBe(0)

    const second = fakeRes()
    startBrandStreamHeartbeat(second.res)
    second.res.emit('close')
    vi.advanceTimersByTime(60_000)
    expect(second.pings()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('WIRFT NIE: ein Schreibfehler beendet nur den Takt', () => {
    const { res } = fakeRes()
    startBrandStreamHeartbeat(res)
    res.failWrites = true
    expect(() => vi.advanceTimersByTime(60_000)).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('geht auch mit einer Antwort ohne Ereignisse (Test-Fälschungen der Routen)', () => {
    const written: string[] = []
    const stop = startBrandStreamHeartbeat({ writableEnded: false, write: (chunk: string) => written.push(chunk) })
    vi.advanceTimersByTime(30_000)
    stop()
    expect(written).toEqual([BRAND_STREAM_HEARTBEAT_FRAME, BRAND_STREAM_HEARTBEAT_FRAME])
  })
})

describe('der Leser im Browser überliest das Lebenszeichen', () => {
  const frames = [
    serializeBrandGenerationEvent('generation.started', { generationId: 'g1', slotId: 'a.pitch', stepKey: 'context' }),
    serializeBrandGenerationEvent('message.delta', { generationId: 'g1', text: 'Erste Zeile\nzweite' }),
    serializeBrandGenerationEvent('message.delta', { generationId: 'g1', text: ' und mehr.' }),
    serializeBrandGenerationEvent('generation.failed', { generationId: 'g1', code: 'provider_error' }),
  ]

  function read(stream: string, step: number): BrandGenerationEvent[] {
    let buffer = ''
    const events: BrandGenerationEvent[] = []
    for (let index = 0; index < stream.length; index += step) {
      const result = decodeBrandGenerationChunk(buffer, stream.slice(index, index + step))
      buffer = result.buffer
      events.push(...result.events)
    }
    return events
  }

  it('derselbe Text mit und ohne Lebenszeichen — am Stück und buchstabenweise zerrissen', () => {
    const plain = frames.join('')
    const withPings = [
      BRAND_STREAM_HEARTBEAT_FRAME,
      frames[0],
      BRAND_STREAM_HEARTBEAT_FRAME,
      BRAND_STREAM_HEARTBEAT_FRAME,
      frames[1],
      frames[2],
      BRAND_STREAM_HEARTBEAT_FRAME,
      frames[3],
    ].join('')
    for (const step of [1, 3, 7, withPings.length]) {
      expect(read(withPings, step)).toEqual(read(plain, plain.length))
    }
    expect(read(plain, plain.length)).toHaveLength(4)
  })

  it('auch mit Windows-Zeilenenden, wie ein Zwischenhändler sie schreiben könnte', () => {
    const withPings = (BRAND_STREAM_HEARTBEAT_FRAME + frames[0]).replace(/\n/g, '\r\n')
    expect(read(withPings, 1)).toEqual(read(frames[0]!, frames[0]!.length))
  })
})

describe('kein Endpunkt unter der Bindung (KI1 d)', () => {
  it('nur der kurze Code des Transports wird zum eigenen Code', () => {
    expect(brandProviderFailureCode({ statusCode: 503, data: { code: 'ai_endpoint_unavailable' } })).toBe('ai_endpoint_unavailable')
    expect(brandProviderFailureCode({ statusCode: 503, statusText: 'AI not configured' })).toBe('provider_error')
    expect(brandProviderFailureCode({ statusCode: 503, data: { code: 'ai_disabled' } })).toBe('provider_error')
    expect(brandProviderFailureCode(new Error('ai_endpoint_unavailable'))).toBe('provider_error')
    expect(brandProviderFailureCode(null)).toBe('provider_error')
  })

  it('der Frame reist durch den Leser, und die Gesprächs-Seite erkennt ihn', () => {
    const frame = serializeBrandGenerationEvent('generation.failed', { generationId: 'g1', code: 'ai_endpoint_unavailable' })
    const parsed = parseBrandGenerationEvent(frame.split('\n')[1]!.slice('data: '.length))
    expect(parsed).toMatchObject({ type: 'generation.failed', code: 'ai_endpoint_unavailable' })
    expect(isBrandAiEndpointFailure(parsed?.type === 'generation.failed' ? parsed.code : null)).toBe(true)
    expect(isBrandAiEndpointFailure('provider_error')).toBe(false)
  })

  it('der wiederverwendete Satz des Core existiert in beiden Sprachen', () => {
    const coreLocales = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'core', 'i18n', 'locales')
    for (const locale of ['de', 'en']) {
      const messages = JSON.parse(readFileSync(join(coreLocales, `${locale}.json`), 'utf8')) as { error?: Record<string, unknown> }
      expect(typeof messages.error?.aiEndpointUnavailable).toBe('string')
      expect(typeof messages.error?.aiEndpointUnavailableHint).toBe('string')
    }
  })
})
