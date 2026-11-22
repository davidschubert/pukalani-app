import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { THEME_CATALOG } from '../theme.catalog'
import { contrastRatio, customThemeCss, generateRamp, hexToRgb, type Shade } from '../shared/ramp'
import { oklchToHex, rgbToOklch } from '../shared/oklch'
import { generateTheme, parseNeutralPalettes, specColorToHex } from '../shared/themeGen'
import { NEUTRAL_PALETTES } from '../shared/neutralPalettes.gen'
import {
  PRIMARY_FILL_SELECTOR,
  TEXT_MIN_RATIO,
  auditPrimaryTokens,
  compositeOver,
  primaryTokens,
} from '../shared/textContrast'

/**
 * Die Hauptfarbe jeder Farbwelt als Schrift (Bahn 7, Rest von UX-002).
 * Der Generator bricht ab, wenn eine Paarung unter 4,5 zu 1 liegt — hier
 * steht, DASS er es tut (Gegenproben), dass die ausgelieferten Dateien die
 * Rechnung tragen und dass ein Custom Theme die Farbe des Owners stehen lässt.
 */
const THEMES_DIR = resolve(__dirname, '..', 'public', 'themes')
const PALETTES = parseNeutralPalettes(readFileSync(resolve(THEMES_DIR, 'neutral.css'), 'utf8'))
const RAMPS = Object.values(PALETTES)
const CONTRAST_CSS = readFileSync(resolve(THEMES_DIR, 'contrast.css'), 'utf8')
const ratio = (a: string, b: string) => contrastRatio(a, b)!

describe('Hauptfarbe der 26 Farbwelten', () => {
  it.each(THEME_CATALOG.map(spec => [spec.id, spec] as const))('%s: Generator besteht sein Gate, die ausgelieferte Datei ist die gerechnete', (id, spec) => {
    const theme = generateTheme(spec, PALETTES)
    expect(readFileSync(resolve(THEMES_DIR, `${id}.css`), 'utf8')).toBe(theme.css)
  })

  it('jede Stellung jeder Farbwelt (Basis + Varianten): Schrift 4,5 zu 1 hell und dunkel, nachgerechnet ohne Generator', () => {
    const failures: string[] = []
    for (const spec of THEME_CATALOG) {
      for (const color of [spec.base, ...spec.variants.map(v => v.base)]) {
        const ramp = generateRamp(specColorToHex(color)!, { anchor: 500 })!
        const lightShade = ([600, 700, 800] as Shade[]).find(s => ratio(ramp[s], '#ffffff') >= 3)!
        const darkShade = ([400, 300, 200] as Shade[]).find(s => ratio(ramp[s], '#171717') >= 3)!
        const tokens = primaryTokens(ramp, { lightShade, darkShade, keepFill: spec.keepFill === true, ramps: RAMPS })!
        for (const ramp_ of RAMPS) {
          for (const bg of ['#ffffff', ramp_[50], ramp_[100]]) {
            if (ratio(tokens.light.text, bg) < TEXT_MIN_RATIO) failures.push(`${spec.id} ${color} hell auf ${bg}`)
          }
          for (const bg of [ramp_[900], ramp_[800]]) {
            if (ratio(tokens.dark.text, bg) < TEXT_MIN_RATIO) failures.push(`${spec.id} ${color} dunkel auf ${bg}`)
          }
        }
        const onFill = tokens.light.fill ? tokens.light.onFill! : '#ffffff'
        if (ratio(onFill, tokens.light.fill ?? tokens.light.text) < TEXT_MIN_RATIO) failures.push(`${spec.id} ${color} Knopf hell`)
      }
    }
    expect(failures).toEqual([])
  })

  it('Charakter: der Farbton bleibt (Abweichung unter 8 Grad, wo die Farbe Farbe hat)', () => {
    const hue = (hex: string) => rgbToOklch(hexToRgb(hex)!)
    for (const spec of THEME_CATALOG) {
      const ramp = generateRamp(specColorToHex(spec.base)!, { anchor: 500 })!
      const tokens = primaryTokens(ramp, { lightShade: 600, darkShade: 400, keepFill: spec.keepFill === true, ramps: RAMPS })!
      const before = hue(ramp[600])
      const after = hue(tokens.light.text)
      if (before.c < 0.03) continue
      const d = Math.abs(before.h - after.h) % 360
      expect(Math.min(d, 360 - d), spec.id).toBeLessThan(8)
    }
  })

  it('Farbwelten mit „Fläche bleibt": der Knopf behält seine Farbe und bekommt dunkle Schrift', () => {
    const honey = THEME_CATALOG.find(spec => spec.id === 'honey')!
    expect(honey.keepFill).toBe(true)
    const css = generateTheme(honey, PALETTES).css
    // Schrift rückt, Fläche bleibt die 600er
    expect(css).toMatch(/:root\[data-theme='honey'\] \{[^}]*--ui-primary: #[0-9a-f]{6};/)
    expect(css).toContain(`:root[data-theme='honey']:not(.dark) :is(${PRIMARY_FILL_SELECTOR}) {\n  --ui-primary: var(--ui-color-primary-600);`)
    const onFill = /:root\[data-theme='honey'\]:not\(\.dark\) :is\([^{]*\{[^}]*--ui-text-inverted: (#[0-9a-f]{6});/.exec(css)![1]!
    const fill = /--ui-color-primary-600: (#[0-9a-f]{6});/.exec(css)![1]!
    expect(ratio('#ffffff', fill)).toBeLessThan(TEXT_MIN_RATIO) // Weiß bestünde nicht
    expect(ratio(onFill, fill)).toBeGreaterThanOrEqual(TEXT_MIN_RATIO)
  })

  it('GEGENPROBE: die alte Hauptfarbe (600er Stufe, nur 3 zu 1 geprüft) fällt im Gate durch', () => {
    const forest = THEME_CATALOG.find(spec => spec.id === 'forest')!
    const ramp = generateRamp(specColorToHex(forest.base)!, { anchor: 500 })!
    const findings = auditPrimaryTokens('forest', { light: { text: ramp[600] }, dark: { text: ramp[400] } }, PALETTES)
    expect(findings.some(f => f.where.includes('Weiß auf der Fläche'))).toBe(true)
    expect(findings.some(f => f.where.includes('als Schrift'))).toBe(true)
  })

  it('GEGENPROBE: ein von Hand eine Spur aufgehellter Wert fällt durch, der gerechnete besteht', () => {
    const ocean = THEME_CATALOG.find(spec => spec.id === 'ocean')!
    const ramp = generateRamp(specColorToHex(ocean.base)!, { anchor: 500 })!
    const tokens = primaryTokens(ramp, { lightShade: 600, darkShade: 400, keepFill: false, ramps: RAMPS })!
    expect(auditPrimaryTokens('ocean', tokens, PALETTES)).toEqual([])
    const o = rgbToOklch(hexToRgb(tokens.light.text)!)
    const lighter = oklchToHex({ ...o, l: o.l + 0.03 })
    expect(auditPrimaryTokens('ocean', { ...tokens, light: { text: lighter } }, PALETTES).length).toBeGreaterThan(0)
  })

  it('die erzeugte Paletten-Datei für die Laufzeit trägt dieselben Werte wie neutral.css', () => {
    expect(NEUTRAL_PALETTES).toEqual(PALETTES)
  })
})

describe('Gelb und Blau als Schrift', () => {
  const value = (mode: ':root' | '.dark', name: string) =>
    new RegExp(`^\\${mode} \\{[^}]*--ui-${name}: (#[0-9a-f]{6});`, 'm').exec(CONTRAST_CSS)![1]!

  it.each(['warning', 'info'] as const)('%s: als Schrift auf jeder Fläche, auf der 10-Prozent-Fläche und mit Weiß darauf 4,5 zu 1', (name) => {
    const light = value(':root', name)
    const dark = value('.dark', name)
    expect(ratio('#ffffff', light)).toBeGreaterThanOrEqual(TEXT_MIN_RATIO)
    for (const ramp of RAMPS) {
      for (const bg of ['#ffffff', ramp[50], ramp[100]]) {
        expect(ratio(light, bg)).toBeGreaterThanOrEqual(TEXT_MIN_RATIO)
        expect(ratio(light, compositeOver(light, bg, 0.1))).toBeGreaterThanOrEqual(TEXT_MIN_RATIO)
      }
      for (const bg of [ramp[900], ramp[800]]) expect(ratio(dark, bg)).toBeGreaterThanOrEqual(TEXT_MIN_RATIO)
      expect(ratio(ramp[900], dark)).toBeGreaterThanOrEqual(TEXT_MIN_RATIO)
    }
  })

  it('GEGENPROBE: die Vorgabe von Nuxt UI (Tailwind 500) bestünde nicht', () => {
    expect(ratio('#ffffff', '#f0b100')).toBeLessThan(TEXT_MIN_RATIO) // yellow-500
    expect(ratio('#ffffff', '#2b7fff')).toBeLessThan(TEXT_MIN_RATIO) // blue-500
  })
})

describe('Fokus-Rahmen', () => {
  it('jede Farbe zeichnet ihn in voller Deckkraft (Nuxt UI: 25 Prozent)', () => {
    for (const c of ['secondary', 'success', 'info', 'warning', 'error', 'inverted']) {
      expect(CONTRAST_CSS).toMatch(new RegExp(`\\.outline-${c}\\\\/25:focus-visible \\{\\n {2}outline-color: var\\(`))
    }
    // Hauptfarbe: in einem Flächen-Element die Schriftfarbe, nicht die hellere Fläche
    expect(CONTRAST_CSS).toContain('.outline-primary\\/25:focus-visible {\n  outline-color: var(--ui-primary-focus, var(--ui-primary));')
  })
})

describe('Custom Themes: die Farbe des Owners bleibt, die Schrift passt sich an', () => {
  it('über alle Farbtöne (15-Grad-Schritte) und drei Helligkeiten: Fläche exakt die 600er, Schrift darauf und als Link 4,5 zu 1', () => {
    for (let h = 0; h < 360; h += 15) {
      for (const l of [0.6, 0.75, 0.88]) {
        const primary = oklchToHex({ l, c: 0.15, h })
        const css = customThemeCss({ id: 'p', name: 'P', primary, order: 0 })
        const ramp = generateRamp(primary)!
        const rootValue = /:root\[data-theme='c-p'\] \{[^}]*--ui-primary: ([^;]+);/.exec(css)![1]!
        const text = rootValue.startsWith('var(') ? ramp[600] : rootValue
        for (const r of RAMPS) for (const bg of ['#ffffff', r[50], r[100]]) {
          expect(ratio(text, bg), `${primary} Schrift`).toBeGreaterThanOrEqual(TEXT_MIN_RATIO)
        }
        const fillBlock = /:root\[data-theme='c-p'\]:not\(\.dark\) :is\([^{]*\{\n {2}--ui-primary: ([^;]+);\n {2}--ui-text-inverted: (#[0-9a-f]{6});/.exec(css)
        if (fillBlock) {
          expect(fillBlock[1], primary).toBe('var(--ui-color-primary-600)') // Owner-Farbe unverändert
          expect(ratio(fillBlock[2]!, ramp[600]), `${primary} Knopf`).toBeGreaterThanOrEqual(TEXT_MIN_RATIO)
        }
        else {
          expect(rootValue).toBe('var(--ui-color-primary-600)')
          expect(ratio('#ffffff', ramp[600]), `${primary} Knopf weiß`).toBeGreaterThanOrEqual(TEXT_MIN_RATIO)
        }
      }
    }
  })
})
