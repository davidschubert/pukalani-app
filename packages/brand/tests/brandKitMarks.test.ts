import { describe, expect, it } from 'vitest'
import { BRAND_MARK_SETTINGS, BRAND_MARK_VARIANTS } from '../shared/brandDesignVocab'
import { brandMarkSpec } from '../shared/brandDesignMark'
import { brandSceneColors } from '../shared/brandDesignScene'
import { brandMarkExampleSvgs } from '../shared/brandMarkSvg'
import { KAILUA_COFFEE_DESIGN } from '../shared/examples/kailuaCoffeeDesign'
import {
  BRAND_KIT_MARK_MIME,
  brandKitMarkCount,
  brandKitMarkFile,
  brandKitMarkReadableName,
  renderBrandMarkFiles,
} from '../shared/brandKitMarks'
import { brandKitSlug } from '../shared/brandKitFiles'
import type { BrandDesignSnapshotPreset } from '../shared/types/brand'

/**
 * DIE ZEICHEN-DATEIEN (Konzept docs/plans/BRAND-BOOK-KIT.md §2.6/§2.12,
 * Paket K6).
 *
 * Geprüft wird, was die ROUTE später zusagt und was eine Setzung allein nicht
 * hergibt: dass jeder Dateiname in der Allowlist `[a-z0-9-]` bleibt, dass der
 * Markenname als XML entschärft ist (§2.12 Nr. 5), dass es acht Dateien mit
 * Preset und keine ohne gibt — und dass die REIHENFOLGE der Beispiele im
 * Preset dieselbe ist, die dieser Erzeuger annimmt. Die Setzung selbst hat
 * ihre Goldens in `brandDesignMark.test.ts`.
 */

const KAILUA = KAILUA_COFFEE_DESIGN!
const INPUT = { title: 'Kailua Coffee Co.', slug: brandKitSlug('Kailua Coffee Co.') }

/** Ein Preset mit gesetzten Beispielen aus einem beliebigen Markennamen. */
function presetWithTitle(title: string): BrandDesignSnapshotPreset {
  const colors = brandSceneColors(KAILUA.color.base, KAILUA.color.accent, 'warm')
  const examples = brandMarkExampleSvgs(brandMarkSpec({
    title,
    pairId: KAILUA.type.pair,
    kind: KAILUA.mark.kind,
    dna: KAILUA.dna,
    colors,
  }))
  return { ...KAILUA, mark: { ...KAILUA.mark, examples } }
}

describe('die Zeichen-Dateien', () => {
  it('macht aus acht Setzungen acht Dateien — Wortmarke und Monogramm je Variante', () => {
    const files = renderBrandMarkFiles(KAILUA, INPUT)
    expect(files).toHaveLength(BRAND_MARK_VARIANTS.length * BRAND_MARK_SETTINGS.length)
    expect(files.map(file => file.id)).toEqual([
      'marks/kailua-coffee-co-wordmark-primary.svg',
      'marks/kailua-coffee-co-monogram-primary.svg',
      'marks/kailua-coffee-co-wordmark-inverted.svg',
      'marks/kailua-coffee-co-monogram-inverted.svg',
      'marks/kailua-coffee-co-wordmark-mono.svg',
      'marks/kailua-coffee-co-monogram-mono.svg',
      'marks/kailua-coffee-co-wordmark-icon.svg',
      'marks/kailua-coffee-co-monogram-icon.svg',
    ])
    expect(brandKitMarkCount(KAILUA)).toBe(files.length)
  })

  it('trifft die Reihenfolge des Presets — Variante aus dem Katalog, Setzung im Wechsel', () => {
    const files = renderBrandMarkFiles(KAILUA, INPUT)
    for (const [index, file] of files.entries()) {
      expect(file.variant).toBe(BRAND_MARK_VARIANTS[Math.floor(index / 2)]!.id)
      expect(file.setting).toBe(BRAND_MARK_SETTINGS[index % 2]!.id)
      // GEGENPROBE: es ist DIESELBE Setzung wie im Preset, nur mit Titel.
      expect(file.svg).toContain(KAILUA.mark.examples[index]!.split('\n').slice(1).join('\n'))
    }
  })

  it('ohne Preset gibt es keine einzige Datei', () => {
    expect(renderBrandMarkFiles(null, INPUT)).toEqual([])
    expect(brandKitMarkCount(null)).toBe(0)
  })

  it('hält jeden Dateinamen in der Allowlist `[a-z0-9-]` — auch bei wildem Namen', () => {
    const title = 'Grünberg & Söhne <GmbH> "Öl" / Ünïcode 北京'
    const files = renderBrandMarkFiles(presetWithTitle(title), {
      title,
      slug: brandKitSlug(title),
    })
    expect(files).toHaveLength(8)
    for (const file of files) {
      expect(file.filename).toMatch(/^[a-z0-9-]+\.svg$/)
      expect(file.id).toBe(`marks/${file.filename}`)
    }
    expect(files[0]!.filename).toBe('gruenberg-soehne-gmbh-oel-uenicode-wordmark-primary.svg')
  })

  it('entschärft den Markennamen als XML — er ist die einzige fremde Eingabe (§2.12 Nr. 5)', () => {
    const title = 'A<script>&"B'
    const files = renderBrandMarkFiles(presetWithTitle(title), {
      title,
      slug: brandKitSlug(title),
    })
    const wordmark = files.find(file => file.setting === 'wordmark')!
    // Weder im `<title>` noch im `aria-label` noch im gesetzten Text.
    expect(wordmark.svg).not.toContain('<script')
    expect(wordmark.svg).toContain('&lt;script&gt;&amp;&quot;B')
    expect(wordmark.svg).toContain('<title>A&lt;script&gt;&amp;&quot;B — wordmark primary</title>')
    expect(wordmark.svg).toContain('role="img"')
  })

  it('lässt eine Setzung weg, die nicht aus `brandMarkSvg.ts` stammt (D8)', () => {
    const broken: BrandDesignSnapshotPreset = {
      ...KAILUA,
      mark: {
        ...KAILUA.mark,
        examples: [
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
          ...KAILUA.mark.examples.slice(1),
        ],
      },
    }
    const files = renderBrandMarkFiles(broken, INPUT)
    expect(files).toHaveLength(7)
    expect(files.some(file => file.svg.includes('<script'))).toBe(false)
  })

  it('sucht einen Namen in der Liste, statt einen Pfad zu bauen', () => {
    const files = renderBrandMarkFiles(KAILUA, INPUT)
    expect(brandKitMarkFile(files, 'kailua-coffee-co-wordmark-primary.svg')?.variant).toBe('primary')
    for (const evil of ['../../etc/passwd', 'marks/kailua-coffee-co-wordmark-primary.svg', '', 'x.svg']) {
      expect(brandKitMarkFile(files, evil), evil).toBeUndefined()
    }
  })

  it('nennt keine primäre Setzung — `j.pick` steht nicht im Preset', () => {
    for (const file of renderBrandMarkFiles(KAILUA, INPUT)) {
      expect(file.primary).toBeUndefined()
    }
  })

  it('baut den lesbaren Namen mit vollem Markennamen und Stand', () => {
    const file = renderBrandMarkFiles(KAILUA, INPUT)[0]!
    expect(brandKitMarkReadableName(file, 'Kailua Coffee Co.', '2026-09-09'))
      .toBe('Kailua Coffee Co. wordmark primary 2026-09-09.svg')
    expect(brandKitMarkReadableName(file, 'Kailua\nCoffee "Co."', ''))
      .toBe('Kailua Coffee  Co. wordmark primary.svg')
    expect(BRAND_KIT_MARK_MIME).toBe('image/svg+xml; charset=utf-8')
  })
})
