import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import {
  BRAND_KIT_ZIP_EPOCH,
  brandKitZipMtime,
  brandKitZipRawBytes,
  buildBrandKitZip,
} from '../shared/brandKitZip'
import {
  BRAND_KIT_TOO_LARGE_CODE,
  BRAND_KIT_ZIP_MAX_BYTES,
  BRAND_KIT_ZIP_WEIGHT,
  decideBrandKitZipSize,
} from '../shared/brandKitLimits'

/**
 * DAS BÜNDEL ALS PURE RECHNUNG (Konzept docs/plans/BRAND-BOOK-KIT.md
 * §2.6/§2.11, Paket K6).
 *
 * Die drei Zusagen, die einer Zeichenkette nicht anzusehen sind: es ist ein
 * GÜLTIGES Zip (zurückgelesen, nicht bloss „beginnt mit PK"), es ist bei
 * gleichem Stand BYTE-GLEICH, und der Deckel entscheidet ohne Route.
 */

const ENTRIES = [
  { path: 'brand.md', content: '# Kailua Coffee Co.\n\nBrand Context aus branding.supply\n' },
  { path: 'brand.json', content: '{\n  "schemaVersion": 1\n}\n' },
  { path: 'tokens.json', content: '{ "color": {} }' },
  { path: 'marks/kailua-coffee-co-wordmark-primary.svg', content: '<svg><title>K</title></svg>' },
  { path: 'README.md', content: '# Brand Kit — Kailua Coffee Co.\n' },
]

const STAND = '2026-09-06T08:00:00.000Z'

describe('das Bündel', () => {
  it('ist ein gültiges Zip und trägt jeden Eintrag unter seinem Pfad', () => {
    const zip = buildBrandKitZip(ENTRIES, STAND)
    const back = unzipSync(zip)
    expect(Object.keys(back).sort()).toEqual(ENTRIES.map(entry => entry.path).sort())
    for (const entry of ENTRIES) {
      expect(strFromU8(back[entry.path]!), entry.path).toBe(entry.content)
    }
    // Der Ordner `marks/` bleibt ein Pfad IM Zip, kein Dateiname mit Schrägstrich.
    expect(Object.keys(back)).toContain('marks/kailua-coffee-co-wordmark-primary.svg')
    expect(Object.keys(back)).toContain('README.md')
  })

  it('ist bei gleichem Stand byte-gleich — zweimal gepackt, dieselben Bytes', () => {
    const first = Buffer.from(buildBrandKitZip(ENTRIES, STAND))
    const second = Buffer.from(buildBrandKitZip(ENTRIES, STAND))
    expect(first.equals(second)).toBe(true)
    expect(first.byteLength).toBeGreaterThan(0)
  })

  it('trägt den Stand als Zeitstempel — ein anderer Stand ergibt andere Bytes', () => {
    const first = Buffer.from(buildBrandKitZip(ENTRIES, STAND))
    const later = Buffer.from(buildBrandKitZip(ENTRIES, '2026-10-01T08:00:00.000Z'))
    expect(first.equals(later)).toBe(false)
    // GEGENPROBE: nur der Stand hat sich geändert, der Inhalt ist derselbe.
    expect(Object.keys(unzipSync(later))).toEqual(Object.keys(unzipSync(first)))
  })

  it('fällt ohne Stand auf 1980 zurück, statt „heute" zu behaupten', () => {
    expect(brandKitZipMtime('')).toBe(BRAND_KIT_ZIP_EPOCH)
    expect(brandKitZipMtime('kein Datum')).toBe(BRAND_KIT_ZIP_EPOCH)
    expect(brandKitZipMtime(STAND)).toBe(Date.parse(STAND))
    const a = Buffer.from(buildBrandKitZip(ENTRIES))
    const b = Buffer.from(buildBrandKitZip(ENTRIES))
    expect(a.equals(b)).toBe(true)
  })

  it('packt auch eine leere Liste, statt zu werfen', () => {
    expect(Object.keys(unzipSync(buildBrandKitZip([], STAND)))).toEqual([])
  })

  it('zählt die unkomprimierte Summe in UTF-8-Bytes, nicht in Zeichen', () => {
    expect(brandKitZipRawBytes([{ path: 'a.txt', content: 'ä' }])).toBe(2)
    expect(brandKitZipRawBytes(ENTRIES))
      .toBe(ENTRIES.reduce((sum, entry) => sum + Buffer.byteLength(entry.content, 'utf8'), 0))
  })
})

describe('der Deckel', () => {
  it('lässt 5 MB durch und weist alles darüber mit `kit_too_large` ab', () => {
    expect(BRAND_KIT_ZIP_MAX_BYTES).toBe(5 * 1024 * 1024)
    expect(decideBrandKitZipSize(BRAND_KIT_ZIP_MAX_BYTES)).toBeNull()
    expect(decideBrandKitZipSize(BRAND_KIT_ZIP_MAX_BYTES + 1)).toBe(BRAND_KIT_TOO_LARGE_CODE)
  })

  it('nimmt einen eigenen Deckel — damit der 413-Zweig ohne Env-Schalter prüfbar ist', () => {
    expect(decideBrandKitZipSize(64, 64)).toBeNull()
    expect(decideBrandKitZipSize(65, 64)).toBe('kit_too_large')
  })

  it('das Bündel zählt fünffach auf den Tages-Eimer (§2.11)', () => {
    expect(BRAND_KIT_ZIP_WEIGHT).toBe(5)
  })
})
