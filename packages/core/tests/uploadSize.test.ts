import { afterEach, describe, expect, it, vi } from 'vitest'
import { MULTIPART_OVERHEAD_BYTES, declaredBodyTooLarge, rejectOversizedUpload } from '../server/utils/uploadSize'

/**
 * FRÜHE GRÖSSEN-PRÜFUNG FÜR UPLOADS (AB1 c).
 *
 * Die Grenze liegt bei `maxBytes + MULTIPART_OVERHEAD_BYTES` — der Zuschlag
 * wird hier ausgeschrieben (64 KiB, derselbe Wert wie im Medien-Upload), nicht
 * aus der Konstante berechnet: sonst prüfte der Test nur sich selbst.
 */

const MAX = 1024 * 1024
const LIMIT = MAX + 64 * 1024

describe('declaredBodyTooLarge', () => {
  it('der Zuschlag ist 64 KiB wie im Medien-Upload', () => {
    expect(MULTIPART_OVERHEAD_BYTES).toBe(65_536)
  })

  it('genau an der Grenze: nicht zu groß', () => {
    expect(declaredBodyTooLarge(String(LIMIT), MAX)).toBe(false)
  })

  it('ein Byte darüber: zu groß', () => {
    expect(declaredBodyTooLarge(String(LIMIT + 1), MAX)).toBe(true)
  })

  it('weit darunter: nicht zu groß', () => {
    expect(declaredBodyTooLarge('128', MAX)).toBe(false)
  })

  it('Header fehlt: keine Ablehnung', () => {
    expect(declaredBodyTooLarge(undefined, MAX)).toBe(false)
    expect(declaredBodyTooLarge(null, MAX)).toBe(false)
  })

  it('Header ist keine Zahl: keine Ablehnung', () => {
    for (const value of ['', 'abc', '12abc', '-5', '1e9', 'Infinity', '1.5']) {
      expect(declaredBodyTooLarge(value, MAX), value).toBe(false)
    }
  })

  it('Leerraum um eine Zahl wird toleriert', () => {
    expect(declaredBodyTooLarge(` ${LIMIT + 1} `, MAX)).toBe(true)
  })
})

describe('rejectOversizedUpload', () => {
  afterEach(() => vi.unstubAllGlobals())

  function stub(header: string | undefined) {
    vi.stubGlobal('getRequestHeader', (_e: unknown, name: string) => (name === 'content-length' ? header : undefined))
    vi.stubGlobal('createError', (init: { status: number, statusText: string }) =>
      Object.assign(new Error(init.statusText), init))
  }

  it('wirft 413 „File too large" über der Grenze', () => {
    stub(String(LIMIT + 1))
    expect(() => rejectOversizedUpload({} as never, MAX)).toThrow(expect.objectContaining({ status: 413, statusText: 'File too large' }))
  })

  it('lässt an der Grenze und ohne Header durch', () => {
    stub(String(LIMIT))
    expect(() => rejectOversizedUpload({} as never, MAX)).not.toThrow()
    stub(undefined)
    expect(() => rejectOversizedUpload({} as never, MAX)).not.toThrow()
  })
})
