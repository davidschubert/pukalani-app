import { describe, expect, it } from 'vitest'
import {
  BRAND_KIT_BUILDERS,
  BRAND_KIT_FILES,
  brandKitAvailability,
  brandKitContentDisposition,
  brandKitDownloadName,
  brandKitFile,
  brandKitFileErrorCode,
  brandKitReadableName,
  brandKitSlug,
  brandKitStandStamp,
  isBrandKitFileId,
} from '../shared/brandKitFiles'
import { BRAND_KIT_DAILY_LIMIT, BRAND_KIT_LIMIT_CODE, brandKitDayKey, decideBrandKitQuota } from '../shared/brandKitLimits'
import { brandLicenseRows, renderBrandLicenses } from '../shared/brandKitLicenses'
import { BRAND_FONT_PAIRS, BRAND_MONO_FAMILY, brandFontPair, validateBrandFontPairs } from '../shared/brandFontPairs'
import { KAILUA_COFFEE_DESIGN } from '../shared/examples/kailuaCoffeeDesign'
import type { BrandKitFileId } from '../shared/types/brandKit'

/**
 * DIE REGISTRY, DIE DATEINAMEN UND DIE LIZENZEN (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.6/§2.11/§2.12, Paket K2).
 *
 * Der Schwerpunkt liegt auf den Zusagen, die SICHERHEIT sind (§2.12 Nr. 4):
 * `:file` ist eine Wahl aus einer Liste, der Dateiname kommt aus einer
 * Allowlist, und der Markenname reist nur prozentkodiert. Ein Test, der nur
 * die glücklichen Namen prüft, ist auch dann grün, wenn es keine Allowlist
 * gibt — deshalb steht neben jedem Beispiel ein Gegenbeispiel.
 */

const KAILUA = KAILUA_COFFEE_DESIGN!

describe('die Registry', () => {
  it('kennt genau die sieben Dateien des Konzepts, jede genau einmal', () => {
    const ids = BRAND_KIT_FILES.map(file => file.id)
    expect(ids).toEqual(['tokens.json', 'tokens.css', 'licenses.md', 'brand.md', 'brand.json', 'readme.md'])
    expect(new Set(ids).size).toBe(ids.length)
    for (const file of BRAND_KIT_FILES) {
      expect(file.filename).toMatch(/^[A-Za-z0-9._-]+$/)
      expect(file.mime).toContain('charset=utf-8')
    }
  })

  it('ist die Allowlist — alles andere ist unbekannt', () => {
    expect(isBrandKitFileId('tokens.json')).toBe(true)
    for (const evil of ['evil.txt', '../../etc/passwd', 'tokens.json/../x', 'TOKENS.JSON', '', 'marks/a.svg']) {
      expect(isBrandKitFileId(evil), evil).toBe(false)
      expect(brandKitFile(evil), evil).toBeUndefined()
    }
  })

  it('hat seit K3 für JEDE Datei einen Erzeuger', () => {
    // Bis K2 waren `brand.md`, `brand.json` und `README.md` `null` und damit
    // ehrlich `not_built_yet`; K3 hat sie eingelöst. Die Zusage dahinter gilt
    // weiter und steht in `brandContext.test.ts`: ein Eintrag OHNE Erzeuger
    // ist `available: false` mit Grund, nicht eine Datei mit null Bytes.
    for (const file of BRAND_KIT_FILES) {
      expect(BRAND_KIT_BUILDERS[file.id], file.id).toBeTruthy()
    }
    const erfunden = { id: 'x.md' as BrandKitFileId, filename: 'x.md', mime: 'text/markdown', needsDesign: false }
    expect(brandKitAvailability(erfunden, true)).toEqual({ available: false, reason: 'not_built_yet' })
  })

  it('sperrt die Design-Dateien ohne Preset — und gibt sie mit frei', () => {
    for (const id of ['tokens.json', 'tokens.css', 'licenses.md'] as const) {
      const file = brandKitFile(id)!
      expect(brandKitAvailability(file, false)).toEqual({ available: false, reason: 'design_missing' })
      expect(brandKitAvailability(file, true)).toEqual({ available: true })
    }
  })

  it('erzeugt mit Preset Inhalt, ohne Preset nichts', () => {
    // Die Ansicht ist seit K3 Pflicht — die drei Token-Dateien lesen sie nicht,
    // eine leere reicht ihnen (`brandContext.test.ts` prüft die andere Seite).
    const input = {
      preset: KAILUA,
      view: { chapters: [] },
      title: 'Kailua Coffee Co.',
      stand: '2026-09-09T10:20:00.000Z',
      locale: 'de',
    }
    expect(BRAND_KIT_BUILDERS['tokens.json']!(input)).toContain('"$type": "color"')
    expect(BRAND_KIT_BUILDERS['tokens.css']!(input)).toContain('--ui-color-primary-600')
    expect(BRAND_KIT_BUILDERS['tokens.json']!({ ...input, preset: null })).toBeNull()
    expect(BRAND_KIT_BUILDERS['tokens.css']!({ ...input, preset: null })).toBeNull()
  })
})

describe('die Dateinamen', () => {
  it('macht aus jedem Markennamen einen Slug aus [a-z0-9-]', () => {
    expect(brandKitSlug('Kailua Coffee Co.')).toBe('kailua-coffee-co')
    expect(brandKitSlug('Grünberg & Söhne')).toBe('gruenberg-soehne')
    expect(brandKitSlug('  ../../etc/passwd  ')).toBe('etc-passwd')
    expect(brandKitSlug('Café Ölmühle')).toBe('cafe-oelmuehle')
    // Bleibt nichts übrig, heißt der Stamm `brand` — nie ein leerer Name.
    expect(brandKitSlug('北京')).toBe('brand')
    expect(brandKitSlug('')).toBe('brand')
    expect(brandKitSlug('x'.repeat(80))).toHaveLength(40)
    for (const title of ['Kailua Coffee Co.', 'Grünberg & Söhne', '"; rm -rf /', '北京']) {
      expect(brandKitSlug(title)).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('setzt Stamm, Datei und Stand zusammen — Endung aus der Registry', () => {
    const stand = '2026-09-09T10:20:00.000Z'
    expect(brandKitStandStamp(stand)).toBe('2026-09-09')
    expect(brandKitStandStamp('')).toBe('')
    expect(brandKitDownloadName(brandKitFile('tokens.json')!, 'kailua-coffee', stand))
      .toBe('kailua-coffee-tokens-2026-09-09.json')
    expect(brandKitDownloadName(brandKitFile('tokens.css')!, 'kailua-coffee', stand))
      .toBe('kailua-coffee-tokens-2026-09-09.css')
    // `LICENSES.md` wird kleingeschrieben — Dateinamen sind sprachneutral und
    // gleichförmig, der Inhalt trägt die Marke.
    expect(brandKitDownloadName(brandKitFile('licenses.md')!, 'kailua-coffee', stand))
      .toBe('kailua-coffee-licenses-2026-09-09.md')
    // Ohne Stand fällt der Teil weg, statt ein „heute" zu behaupten.
    expect(brandKitDownloadName(brandKitFile('tokens.json')!, 'kailua-coffee', ''))
      .toBe('kailua-coffee-tokens.json')
  })

  it('trägt den vollen Namen nur prozentkodiert im Kopf', () => {
    const file = brandKitFile('tokens.json')!
    const readable = brandKitReadableName(file, 'Kailua Coffee Co.', '2026-09-09T10:20:00.000Z')
    expect(readable).toBe('Kailua Coffee Co. tokens 2026-09-09.json')
    const header = brandKitContentDisposition('kailua-coffee-tokens-2026-09-09.json', readable)
    expect(header).toBe(
      'attachment; filename="kailua-coffee-tokens-2026-09-09.json"; '
      + 'filename*=UTF-8\'\'Kailua%20Coffee%20Co.%20tokens%202026-09-09.json',
    )
    // Anführungszeichen und Zeilenumbrüche kommen nie in den Kopf: sie würden
    // ihn aufbrechen (Header-Injection).
    const evil = brandKitReadableName(file, 'A" \r\nX-Evil: 1', '')
    expect(evil).not.toMatch(/["\r\n]/)
    expect(brandKitContentDisposition('a.json', evil)).not.toMatch(/[\r\n]/)
  })
})

describe('der Download-Eimer (§2.11)', () => {
  it('deckelt je Marke, nicht je Konto und nicht je Datei', () => {
    expect(brandKitDayKey('p1')).toBe('brand-kit-day:p1')
    expect(brandKitDayKey('p1')).not.toBe(brandKitDayKey('p2'))
  })

  it('lässt 60 durch und weist den 61. ab', () => {
    expect(decideBrandKitQuota(1)).toBeNull()
    expect(decideBrandKitQuota(BRAND_KIT_DAILY_LIMIT)).toBeNull()
    expect(decideBrandKitQuota(BRAND_KIT_DAILY_LIMIT + 1)).toBe(BRAND_KIT_LIMIT_CODE)
  })
})

describe('LICENSES.md', () => {
  it('gibt jedem Paar beide Lizenzen — und der Wächter sieht eine fehlende', () => {
    expect(validateBrandFontPairs()).toEqual([])
    for (const pair of BRAND_FONT_PAIRS) {
      for (const entry of [pair.headingLicense, pair.bodyLicense]) {
        expect(entry.spdx, pair.id).toBe('OFL-1.1')
        expect(entry.source, pair.id).toMatch(/^https:\/\//)
      }
    }
    // Gegenprobe: eine Lizenz-Lücke wird rot, sonst prüfte der Test nur sich
    // selbst (dieselbe Regel wie bei den anderen Katalog-Wächtern).
    const broken = BRAND_FONT_PAIRS.map((pair, index) => (index === 0
      ? { ...pair, bodyLicense: { spdx: '', source: '' } }
      : pair))
    expect(validateBrandFontPairs(broken)).toEqual([
      `${BRAND_FONT_PAIRS[0]!.id}: body ohne Lizenz (SPDX)`,
      `${BRAND_FONT_PAIRS[0]!.id}: body ohne Lizenz-Quelle`,
    ])
  })

  it('nennt nur die Familien DIESER Marke, jede genau einmal', () => {
    const rows = brandLicenseRows(KAILUA, 'de')
    const pair = brandFontPair(KAILUA.type.pair)!
    expect(rows.map(row => row.family)).toEqual([pair.headingFamily, pair.bodyFamily, BRAND_MONO_FAMILY])
    expect(new Set(rows.map(row => row.family)).size).toBe(rows.length)
    for (const row of rows) {
      expect(row.spdx, row.family).toBeTruthy()
      expect(row.source, row.family).toMatch(/^https:\/\//)
    }
  })

  it('zieht eine doppelt benutzte Familie zu EINER Zeile zusammen', () => {
    // `humanist` setzt Überschrift und Fließtext in derselben Familie.
    const preset = { ...KAILUA, type: { ...KAILUA.type, pair: 'humanist' } }
    const rows = brandLicenseRows(preset, 'de')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.role).toBe('Überschriften, Fließtext')
  })

  it('rendert die Tabelle in der Inhaltssprache und immer den Bezugs-Satz', () => {
    const de = renderBrandLicenses(KAILUA, 'de')
    expect(de).toContain('| Familie | Rolle | Schnitte | Lizenz | Quelle |')
    expect(de).toContain('| Source Serif 4 | Überschriften | 300, 400, 500, 600, 700 | OFL-1.1 |')
    expect(de).toContain('Dateien bei der Quelle laden')
    const en = renderBrandLicenses(KAILUA, 'en')
    expect(en).toContain('| Family | Role | Weights | Licence | Source |')
    expect(en).toContain('Download the files from the source')
  })

  it('sagt ohne Preset, warum sie leer ist — statt zu fehlen', () => {
    const empty = renderBrandLicenses(null, 'de')
    expect(empty).toContain('# Schriften und Lizenzen')
    expect(empty).toContain('Brand Design')
    expect(empty).toContain('Dateien bei der Quelle laden')
    expect(empty).not.toContain('| Familie |')
    expect(brandLicenseRows(null, 'de')).toEqual([])
  })
})

describe('brandKitFileErrorCode — der Grund reist als Code', () => {
  it('nennt beide Gründe mit eigenem Schlüssel', () => {
    expect(brandKitFileErrorCode('design_missing')).toBe('kit_file_design_missing')
    expect(brandKitFileErrorCode('not_built_yet')).toBe('kit_file_not_built_yet')
  })

  it('bleibt ein Schlüssel, den der zentrale Handler durchlässt', () => {
    // core/server/error.ts lässt nur `^[a-z][a-z0-9_]{0,63}$` durch — ein
    // Grund, der daran scheitert, käme beim Client als „irgendwas ging
    // schief" an (dieselbe tote Hälfte wie `last_admin` vor dem 2026-07-29).
    for (const reason of ['design_missing', 'not_built_yet'] as const) {
      expect(brandKitFileErrorCode(reason)).toMatch(/^[a-z][a-z0-9_]{0,63}$/)
    }
  })
})
