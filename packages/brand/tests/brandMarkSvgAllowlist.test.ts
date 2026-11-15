import { describe, expect, it } from 'vitest'
import { brandNeutralSource } from '../shared/brandDesign'
import { BRAND_MARK_RADIUS_BY_FORM, brandMarkSpec } from '../shared/brandDesignMark'
import { brandSceneColors } from '../shared/brandDesignScene'
import { BRAND_MARK_SETTINGS, BRAND_MARK_VARIANTS } from '../shared/brandDesignVocab'
import { BRAND_FONT_PAIRS } from '../shared/brandFontPairs'
import { renderBrandMarkFiles } from '../shared/brandKitMarks'
import { brandMarkExampleSvgs, brandMarkSettingSvg, isBrandMarkSvg } from '../shared/brandMarkSvg'
import { KAILUA_COFFEE_DESIGN } from '../shared/examples/kailuaCoffeeDesign'

/**
 * DER RIEGEL VOR `v-html` IST EINE ERLAUBNISLISTE (Audit-Befund SEC-019).
 *
 * Zwei Zusagen, zwei Blöcke:
 *  1. KOPPLUNG AN DEN ERZEUGER — alles, was `brandMarkSvg.ts` und
 *     `brandKitMarks.ts` schreiben können, besteht den Riegel. Ändert jemand
 *     den Erzeuger, ohne die Liste nachzuziehen, wird DIESER Test rot — und
 *     nicht die Oberfläche still leer.
 *  2. GEGENPROBEN — was nicht aus genau diesen Elementen, Attributen und
 *     Wertformen besteht, gilt nicht als Setzung. Die Beispiele sind bewusst
 *     ohne ausführbaren Inhalt: geprüft wird die FORM, nicht ein Angriff.
 */

const NAMES = [
  'Kailua Coffee Co.',
  'Grünberg & Söhne',
  '<GmbH> "Öl" \'n\' Co',
  'Café ☕ 北京 🚀',
  '  ',
  'a&b<c>d"e\'f',
]
const TITLES: (string | undefined)[] = [undefined, '', 'Wortmarke Kailua', 'Zeichen „<&>" \'x\' 😀']
const BASES: [string, string][] = [['#4a3123', '#22392f'], ['#0a5cff', '#ff7a00'], ['#ffffff', '#000000']]
const FORMS: (string | undefined)[] = [...Object.keys(BRAND_MARK_RADIUS_BY_FORM), undefined]
const RULES = [
  { headingWeight: 400, headingTracking: 0, headingUppercase: false },
  { headingWeight: 600, headingTracking: -0.5, headingUppercase: true },
  { headingWeight: 300, headingTracking: 1.25, headingUppercase: false },
]

function* allSpecs() {
  for (const [base, accent] of BASES) {
    const colors = brandSceneColors(base, accent, brandNeutralSource('warm', base))
    for (const pair of BRAND_FONT_PAIRS) {
      for (const form of FORMS) {
        for (const name of NAMES) {
          for (const rules of RULES) {
            yield brandMarkSpec({
              title: name,
              pairId: pair.id,
              kind: 'word',
              dna: form === undefined ? undefined : { form },
              colors,
              ...rules,
            })
          }
        }
      }
    }
  }
}

describe('isBrandMarkSvg — Kopplung an den Erzeuger', () => {
  it('lässt jede Setzung durch, die der Erzeuger schreiben kann', () => {
    let count = 0
    for (const spec of allSpecs()) {
      for (const setting of BRAND_MARK_SETTINGS) {
        for (const variant of BRAND_MARK_VARIANTS) {
          for (const clearSpace of [false, true]) {
            for (const title of TITLES) {
              const svg = brandMarkSettingSvg(spec, setting.id, variant.id, { clearSpace, title })
              if (!isBrandMarkSvg(svg)) expect.fail(`abgewiesen:\n${svg}`)
              count++
            }
          }
        }
      }
      for (const svg of brandMarkExampleSvgs(spec)) {
        if (!isBrandMarkSvg(svg)) expect.fail(`Preset-Setzung abgewiesen:\n${svg}`)
      }
    }
    expect(count).toBeGreaterThan(1000)
    // Mehrere tausend Setzungen: allein ~1 s, im vollen Lauf neben allen
    // anderen Paketen über dem Standard-Budget von 5 s (lokal gemessen 6 s).
  }, 60_000)

  it('lässt die Zeichen-Dateien des Kits durch (mit eingesetztem Titel)', () => {
    for (const name of NAMES) {
      const colors = brandSceneColors('#4a3123', '#22392f', brandNeutralSource('warm', '#4a3123'))
      const examples = brandMarkExampleSvgs(brandMarkSpec({
        title: name, pairId: 'editorial', kind: 'word', dna: undefined, colors,
      }))
      const preset = { ...KAILUA_COFFEE_DESIGN!, mark: { ...KAILUA_COFFEE_DESIGN!.mark, examples } }
      const files = renderBrandMarkFiles(preset, { title: name, slug: 'x' })
      expect(files).toHaveLength(BRAND_MARK_VARIANTS.length * BRAND_MARK_SETTINGS.length)
      for (const file of files) {
        if (!isBrandMarkSvg(file.svg)) expect.fail(`Kit-Datei abgewiesen:\n${file.svg}`)
      }
    }
  })

  it('lässt das mitgelieferte Beispiel-Preset durch', () => {
    expect(KAILUA_COFFEE_DESIGN!.mark.examples.length).toBeGreaterThan(0)
    expect(KAILUA_COFFEE_DESIGN!.mark.examples.every(isBrandMarkSvg)).toBe(true)
  })
})

describe('isBrandMarkSvg — Gegenproben', () => {
  const colors = brandSceneColors('#4a3123', '#22392f', brandNeutralSource('warm', '#4a3123'))
  const spec = brandMarkSpec({ title: 'Kailua', pairId: 'editorial', kind: 'word', dna: undefined, colors })
  const good = brandMarkSettingSvg(spec, 'monogram', 'primary', { clearSpace: true, title: 'K' })
  const end = '</svg>'
  /** Ein Stück vor dem schliessenden `</svg>` einsetzen. */
  const inject = (piece: string) => good.replace(end, `${piece}\n${end}`)
  /** Ein Attribut in die ERSTE `<rect` einsetzen. */
  const rectAttr = (attr: string) => good.replace('<rect ', `<rect ${attr} `)

  it('die Grundform besteht (sonst wären die Gegenproben wertlos)', () => {
    expect(isBrandMarkSvg(good)).toBe(true)
    expect(isBrandMarkSvg(inject('  <rect x="1" y="1" width="2" height="2" fill="#000000" />'))).toBe(true)
  })

  it('weist ein Ereignis-Attribut ab', () => {
    expect(isBrandMarkSvg(rectAttr('onload="x"'))).toBe(false)
    expect(isBrandMarkSvg(good.replace('<svg ', '<svg onload="x" '))).toBe(false)
  })

  it('weist fremde Elemente ab', () => {
    for (const piece of [
      '<foreignObject></foreignObject>',
      '<a></a>',
      '<image />',
      '<use />',
      '<style></style>',
      '<g></g>',
      '<script></script>',
    ]) {
      expect(isBrandMarkSvg(inject(piece)), piece).toBe(false)
    }
  })

  it('weist Verweis-Attribute und Verweis-Werte ab', () => {
    expect(isBrandMarkSvg(rectAttr('href="#x"'))).toBe(false)
    expect(isBrandMarkSvg(rectAttr('xlink:href="#x"'))).toBe(false)
    expect(isBrandMarkSvg(good.replace(/fill="#[0-9a-f]{6}"/, 'fill="url(#x)"'))).toBe(false)
  })

  it('weist ein unbekanntes Attribut an einem erlaubten Element ab', () => {
    expect(isBrandMarkSvg(rectAttr('style="x"'))).toBe(false)
    expect(isBrandMarkSvg(rectAttr('class="x"'))).toBe(false)
    expect(isBrandMarkSvg(good.replace('<title>', '<title id="x">'))).toBe(false)
  })

  it('weist Werte ausserhalb der erzeugten Form ab', () => {
    expect(isBrandMarkSvg(rectAttr('rx="1px"'))).toBe(false)
    expect(isBrandMarkSvg(good.replace('text-anchor="middle"', 'text-anchor="start"'))).toBe(false)
    expect(isBrandMarkSvg(good.replace('xmlns="http://www.w3.org/2000/svg"', 'xmlns="x"'))).toBe(false)
    expect(isBrandMarkSvg(good.replace(/font-family="[^"]*"/, 'font-family="a;b"'))).toBe(false)
  })

  it('weist Kommentar, CDATA, Verarbeitungsanweisung und DOCTYPE ab', () => {
    expect(isBrandMarkSvg(inject('<!-- x -->'))).toBe(false)
    expect(isBrandMarkSvg(good.replace('>K</text>', '><![CDATA[K]]></text>'))).toBe(false)
    expect(isBrandMarkSvg(`<?xml version="1.0"?>\n${good}`)).toBe(false)
    expect(isBrandMarkSvg(`<!DOCTYPE svg>\n${good}`)).toBe(false)
  })

  it('weist Text nach dem Ende und zweite Wurzeln ab', () => {
    expect(isBrandMarkSvg(`${good}x`)).toBe(false)
    expect(isBrandMarkSvg(`${good}\n${good}`)).toBe(false)
    expect(isBrandMarkSvg(`x${good}`)).toBe(false)
  })

  it('weist unbekannte Entities, einfache Anführungszeichen und offene Tags ab', () => {
    expect(isBrandMarkSvg(good.replace('>K</text>', '>&#75;</text>'))).toBe(false)
    expect(isBrandMarkSvg(good.replace('>K</text>', '>&nbsp;</text>'))).toBe(false)
    expect(isBrandMarkSvg(good.replace('text-anchor="middle"', 'text-anchor=\'middle\''))).toBe(false)
    expect(isBrandMarkSvg(good.replace('</text>', ''))).toBe(false)
    expect(isBrandMarkSvg(good.replace(' />', '>'))).toBe(false)
    expect(isBrandMarkSvg(rectAttr('x="1"'))).toBe(false) // doppeltes Attribut
  })

  it('weist rohen Markup-Text im Textinhalt ab', () => {
    expect(isBrandMarkSvg(good.replace('>K</text>', '>a>b</text>'))).toBe(false)
    expect(isBrandMarkSvg(good.replace('>K</text>', '><b>K</b></text>'))).toBe(false)
  })
})
