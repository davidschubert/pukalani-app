import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * WÄCHTER FÜR DIE SCHRIFTFARBEN DER HILFE (Q07).
 *
 * Die Hilfe liegt ausserhalb des Themes-Layers; das Kontrast-Gate des
 * Theme-Generators sieht sie nicht. Der Test rechnet die Werte aus help.css
 * gegen die Flächen nach, auf denen hier Text steht, und hält fest, dass die
 * Sonne nicht wieder zur Schriftfarbe wird.
 */
const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, '..', 'app/assets/css/help.css'), 'utf8')
const pukaTheme = readFileSync(join(here, '../../../packages/marketing/app/assets/css/puka-theme.css'), 'utf8')

/** Flächen im hellen Schema: Weiss, Karten (Papier mit Alpha über dem Grund), Wolkengrau (--puka-cloud). */
const LIGHT_SURFACES = ['#ffffff', '#fbfcfc', '#f9fbfb', '#f0f2f4']
/** Flächen im dunklen Schema: Grund (--puka-cloud dunkel, hsl(222 24% 10%)) und die 800er der mist-Palette. */
const DARK_SURFACES = ['#131620', '#22292b']

function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`))
  if (!match?.[1]) throw new Error(`Block '${selector}' fehlt in help.css`)
  return match[1]
}

function hexVar(body: string, name: string): string {
  const match = body.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})\\s*;`, 'i'))
  if (!match?.[1]) throw new Error(`Variable ${name} fehlt oder ist kein sechsstelliger Hex-Wert`)
  return match[1]
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

/** Hex-Wert einer puka-Stufe aus dem Kommentar hinter dem oklch-Wert in puka-theme.css. */
function puka(shade: number): string {
  const match = pukaTheme.match(new RegExp(`--color-puka-${shade}:[^;]+;\\s*/\\*\\s*(#[0-9a-f]{6})`, 'i'))
  if (!match?.[1]) throw new Error(`puka-${shade} nicht gefunden`)
  return match[1]
}

describe('Schriftfarben der Hilfe', () => {
  it('die Rechnung stimmt (Schwarz auf Weiss ist 21 zu 1)', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })

  const light = block('.marketing-site')
  const dark = block('.dark .marketing-site')

  it.each(LIGHT_SURFACES)('hell: text-dimmed und text-muted haben auf %s mindestens 4,5 zu 1', (surface) => {
    expect(contrast(hexVar(light, '--ui-text-dimmed'), surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hexVar(light, '--ui-text-muted'), surface)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(DARK_SURFACES)('dunkel: text-dimmed hat auf %s mindestens 4,5 zu 1', (surface) => {
    expect(contrast(hexVar(dark, '--ui-text-dimmed'), surface)).toBeGreaterThanOrEqual(4.5)
  })

  it('der dunkle Block setzt text-muted zurück (sonst gälte der helle Wert auch im Dunkeln)', () => {
    expect(dark).toMatch(/--ui-text-muted:\s*var\(--ui-color-neutral-400\)/)
  })

  it('GEGENPROBE: die Vorgaben von Nuxt UI (mist-400 und mist-500) bestehen nicht', () => {
    expect(contrast('#9ca8ab', '#ffffff')).toBeLessThan(4.5)
    expect(contrast('#67787c', '#f0f2f4')).toBeLessThan(4.5)
  })
})

describe('Die Sonne als Schrift', () => {
  it('text-primary zeigt auf die Schrift-Stufe, nicht auf die Sonne', () => {
    const rule = css.match(/\.marketing-site \.text-primary:not\(\.tone-ink \*\),\s*\.marketing-site \.hover\\:text-primary:not\(\.tone-ink \*\):hover \{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/color:\s*var\(--ui-color-primary-600\)/)
  })

  it('das dunkle Band der Fußzeile behält die Sonne: dort wäre die Schrift-Stufe unlesbar', () => {
    const footerBand = '#141d2e'
    expect(contrast(puka(500), footerBand)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(puka(800), footerBand)).toBeLessThan(4.5)
  })

  it('die Schrift-Stufe ist im Hellen puka-800 und im Dunkeln puka-400 (puka-theme.css)', () => {
    expect(pukaTheme).toMatch(/--ui-color-primary-600:\s*var\(--color-puka-800\)/)
    expect(pukaTheme).toMatch(/--ui-color-primary-600:\s*var\(--color-puka-400\)/)
  })

  it.each(LIGHT_SURFACES)('hell: puka-800 hat auf %s mindestens 4,5 zu 1', (surface) => {
    expect(contrast(puka(800), surface)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(DARK_SURFACES)('dunkel: puka-400 hat auf %s mindestens 4,5 zu 1', (surface) => {
    expect(contrast(puka(400), surface)).toBeGreaterThanOrEqual(4.5)
  })

  it('GEGENPROBE: die Sonne selbst (puka-500) wäre als Schrift im Hellen unlesbar', () => {
    expect(contrast(puka(500), '#f0f2f4')).toBeLessThan(2)
  })
})
