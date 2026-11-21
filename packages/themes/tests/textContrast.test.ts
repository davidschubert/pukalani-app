import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { contrastRatio, customThemeCss, generateNeutralRamp, hexToRgb } from '../shared/ramp'
import { rgbToOklch } from '../shared/oklch'
import { STATUS_BASES, generateContrastCss, parseNeutralPalettes, specColorToHex } from '../shared/themeGen'
import {
  TEXT_MIN_RATIO,
  auditNeutralTextTokens,
  auditStatusTokens,
  compositeOver,
  neutralSurfaces,
  neutralTextTokens,
  statusTokens,
} from '../shared/textContrast'

/**
 * Schrift-Kontrast der Text- und Statusfarben (Q07). Der Generator bricht ab,
 * wenn eine Paarung unter 4,5 zu 1 liegt — hier steht, DASS er es tut
 * (Gegenproben), und dass die ausgelieferte Datei die Rechnung trägt.
 */
const THEMES_DIR = resolve(__dirname, '..', 'public', 'themes')
const PALETTES = parseNeutralPalettes(readFileSync(resolve(THEMES_DIR, 'neutral.css'), 'utf8'))
const CONTRAST_CSS = readFileSync(resolve(THEMES_DIR, 'contrast.css'), 'utf8')

function hue(hex: string): number {
  return rgbToOklch(hexToRgb(hex)!).h
}

function hueDistance(a: string, b: string): number {
  const d = Math.abs(hue(a) - hue(b)) % 360
  return d > 180 ? 360 - d : d
}

describe('neutral.css lesen', () => {
  it('findet die neun Paletten mit allen elf Stufen', () => {
    expect(Object.keys(PALETTES)).toEqual(['neutral', 'slate', 'gray', 'zinc', 'stone', 'mist', 'taupe', 'mauve', 'olive'])
    for (const ramp of Object.values(PALETTES)) expect(Object.keys(ramp)).toHaveLength(11)
  })

  it('wirft bei einer unvollständigen Palette statt still weiterzurechnen', () => {
    expect(() => parseNeutralPalettes(`:root[data-neutral='x'] {\n  --ui-color-neutral-50: oklch(98% 0 0);\n}`)).toThrow(/Stufen fehlen/)
    expect(() => parseNeutralPalettes('')).toThrow(/keine Palette/)
  })
})

describe('blasse Textfarben je neutraler Palette', () => {
  it.each(Object.entries(PALETTES))('%s: dimmed und muted erreichen 4,5 zu 1 auf jeder Fläche, hell und dunkel', (name, ramp) => {
    const tokens = neutralTextTokens(ramp)!
    expect(auditNeutralTextTokens(name, ramp, tokens)).toEqual([])
    const surfaces = neutralSurfaces(ramp)
    for (const bg of surfaces.light) {
      expect(contrastRatio(tokens.light.dimmed, bg)!).toBeGreaterThanOrEqual(TEXT_MIN_RATIO)
      expect(contrastRatio(tokens.light.muted, bg)!).toBeGreaterThanOrEqual(TEXT_MIN_RATIO)
    }
    for (const bg of surfaces.dark) expect(contrastRatio(tokens.dark.dimmed, bg)!).toBeGreaterThanOrEqual(TEXT_MIN_RATIO)
  })

  it.each(Object.entries(PALETTES))('%s: die Abstufung dimmed → muted → toned bleibt, der Farbton auch', (_name, ramp) => {
    const tokens = neutralTextTokens(ramp)!
    const l = (hex: string) => rgbToOklch(hexToRgb(hex)!).l
    // hell: dimmed heller als muted, muted heller als die 600er (toned)
    expect(l(tokens.light.dimmed)).toBeGreaterThan(l(tokens.light.muted))
    expect(l(tokens.light.muted)).toBeGreaterThan(l(ramp[600]))
    // dunkel: dimmed bleibt dunkler als muted (400er)
    expect(l(tokens.dark.dimmed)).toBeLessThan(l(ramp[400]))
    // Farbton: nur bei echter Tönung prüfbar (Grau hat keinen). Die Grenze
    // ist weit, weil ein fast graues Hex beim Runden auf 8 Bit im Farbwinkel
    // schon um einige Grad springt — eine andere Farbfamilie läge bei 30+.
    if (rgbToOklch(hexToRgb(ramp[500])!).c > 0.01) {
      expect(hueDistance(tokens.light.dimmed, ramp[400])).toBeLessThan(12)
      expect(hueDistance(tokens.light.muted, ramp[500])).toBeLessThan(12)
      expect(hueDistance(tokens.dark.dimmed, ramp[500])).toBeLessThan(12)
    }
  })

  it('rückt nur so weit wie nötig: dimmed liegt knapp über der Schwelle, nicht eine Stufe weiter', () => {
    for (const ramp of Object.values(PALETTES)) {
      const tokens = neutralTextTokens(ramp)!
      const worst = Math.min(...neutralSurfaces(ramp).light.map(bg => contrastRatio(tokens.light.dimmed, bg)!))
      expect(worst).toBeLessThan(4.75)
    }
  })

  it('GEGENPROBE: die Vorgabe von Nuxt UI (400er/500er Stufe) macht das Gate rot', () => {
    for (const [name, ramp] of Object.entries(PALETTES)) {
      const nuxtUiDefault = { light: { dimmed: ramp[400], muted: ramp[500] }, dark: { dimmed: ramp[500] } }
      const findings = auditNeutralTextTokens(name, ramp, nuxtUiDefault)
      expect(findings.length, name).toBeGreaterThan(0)
      expect(findings.some(f => f.where.includes('hell: dimmed')), name).toBe(true)
      expect(findings.some(f => f.where.includes('dunkel: dimmed')), name).toBe(true)
    }
  })

  it('GEGENPROBE: eine einzelne zu blasse Farbe genügt', () => {
    const ramp = PALETTES.mist!
    const tokens = neutralTextTokens(ramp)!
    const findings = auditNeutralTextTokens('mist', ramp, { ...tokens, light: { ...tokens.light, muted: '#67787c' } })
    expect(findings.map(f => f.where)).toEqual([expect.stringContaining('mist hell: muted (#67787c)'), expect.stringContaining('mist hell: muted (#67787c)')])
    expect(findings.every(f => f.ratio < TEXT_MIN_RATIO)).toBe(true)
  })
})

describe('getönte Palette eines Custom Themes', () => {
  it('besteht für jeden Farbton der Marke', () => {
    for (let h = 0; h < 360; h += 5) {
      const ramp = generateNeutralRamp(specColorToHex(`oklch(60% 0.2 ${h})`)!)!
      const tokens = neutralTextTokens(ramp)
      expect(tokens, `Farbton ${h}`).not.toBeNull()
      expect(auditNeutralTextTokens(`h${h}`, ramp, tokens!), `Farbton ${h}`).toEqual([])
    }
  })

  it('customThemeCss schreibt die zwei Textfarben in den data-neutral-Block des Themes, hell und dunkel', () => {
    const css = customThemeCss({ id: 'abc123', name: 'T', primary: '#2f7fee', order: 0, config: { neutral: 'tinted' } })
    const tokens = neutralTextTokens(generateNeutralRamp('#2f7fee')!)!
    expect(css).toContain(`:root[data-neutral='c-abc123'] {\n  --ui-text-dimmed: ${tokens.light.dimmed};\n  --ui-text-muted: ${tokens.light.muted};\n}`)
    expect(css).toContain(`.dark[data-neutral='c-abc123'] {\n  --ui-text-dimmed: ${tokens.dark.dimmed};\n  --ui-text-muted: var(--ui-color-neutral-400);\n}`)
  })

  it('ohne getönte Palette bleibt das CSS eines Custom Themes frei von Textfarben', () => {
    const css = customThemeCss({ id: 'abc123', name: 'T', primary: '#2f7fee', order: 0, config: {} })
    expect(css).not.toContain('--ui-text-')
  })
})

describe('Statusfarben rot und grün', () => {
  const ramps = Object.values(PALETTES)
  const bases = {
    error: { light: specColorToHex(STATUS_BASES.error.light)!, dark: specColorToHex(STATUS_BASES.error.dark)! },
    success: { light: specColorToHex(STATUS_BASES.success.light)!, dark: specColorToHex(STATUS_BASES.success.dark)! },
  }

  it.each(['error', 'success'] as const)('%s: Fläche mit Schrift, Schrift auf der Seite und auf der 10-Prozent-Fläche bestehen', (name) => {
    const tokens = statusTokens(bases[name], ramps)!
    expect(auditStatusTokens(name, tokens, PALETTES)).toEqual([])
    expect(contrastRatio('#ffffff', tokens.light)!).toBeGreaterThanOrEqual(TEXT_MIN_RATIO)
    for (const ramp of ramps) {
      const soft = compositeOver(tokens.light, ramp[100], 0.1)
      expect(contrastRatio(tokens.light, soft)!).toBeGreaterThanOrEqual(TEXT_MIN_RATIO)
    }
    expect(hueDistance(tokens.light, bases[name].light)).toBeLessThan(6)
    expect(hueDistance(tokens.dark, bases[name].dark)).toBeLessThan(6)
  })

  it.each(['error', 'success'] as const)('GEGENPROBE %s: die Tailwind-Stufe 500 macht das Gate rot', (name) => {
    const findings = auditStatusTokens(name, bases[name], PALETTES)
    expect(findings.some(f => f.where.includes('Weiß auf der Fläche'))).toBe(true)
    expect(findings.some(f => f.where.includes('10-Prozent-Fläche'))).toBe(true)
  })
})

describe('contrast.css (ausgeliefert)', () => {
  it('ist genau das, was der Generator aus neutral.css rechnet', () => {
    expect(CONTRAST_CSS).toBe(generateContrastCss(PALETTES).css)
  })

  it('nennt zu jedem hellen Block sein dunkles Gegenstück (unlayered :root schlüge sonst .dark)', () => {
    expect(CONTRAST_CSS).toMatch(/^:root \{\n {2}--ui-error: #[0-9a-f]{6};\n {2}--ui-success: #[0-9a-f]{6};\n\}\n\n\.dark \{\n {2}--ui-error: #[0-9a-f]{6};\n {2}--ui-success: #[0-9a-f]{6};\n\}$/m)
    for (const name of Object.keys(PALETTES)) {
      const light = CONTRAST_CSS.indexOf(`:root[data-neutral='${name}'] {`)
      const dark = CONTRAST_CSS.indexOf(`.dark[data-neutral='${name}'] {`)
      expect(light, name).toBeGreaterThan(-1)
      expect(dark, name).toBeGreaterThan(light)
    }
  })

  it('GEGENPROBE: eine Palette, deren 400er Stufe keinen Abstand zur Fläche hat, bricht den Generator nicht still — das Gate rechnet nach', () => {
    // Eine von Hand „aufgehellte" Farbe in den fertigen Werten: genau das,
    // was das Gate nach dem Erzeugen findet.
    const ramp = PALETTES.olive!
    const findings = auditNeutralTextTokens('olive', ramp, { light: { dimmed: '#9a9a8c', muted: '#656551' }, dark: { dimmed: '#93937d' } })
    expect(findings.length).toBe(3)
  })
})
