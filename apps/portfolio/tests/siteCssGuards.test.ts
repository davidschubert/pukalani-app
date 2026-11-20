import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * ZWEI WÄCHTER FÜR DIE HANDGESCHRIEBENE FARBWELT VON pukalani.studio.
 *
 * Die Site liegt ausserhalb des Theme-Systems; das Kontrast-Gate des
 * Theme-Generators sieht sie nicht. Beide Fehler unten waren live und fielen
 * weder im Typecheck noch im Lint noch im Auge auf:
 *
 * 1. Die Nebenfarbe `--metal` färbte Schrift mit 2,5 bis 2,8 zu 1. Schrift
 *    nimmt seitdem `--metal-text`; der Test rechnet den Kontrast aus den
 *    Werten der CSS-Datei nach und verbietet `--metal` als Schriftfarbe.
 * 2. Der Seitenkopf (`.reveal`) begann bei Deckkraft 0. Der Browser zählt
 *    einen unsichtbar gemalten Block nicht als grössten Inhalt (LCP) und
 *    wertete ihn erst nach dem Laden aller Skripte (mobil rund 10 s).
 */

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'app')
const css = readFileSync(join(appDir, 'assets/css/portfolio.css'), 'utf8')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(vue|css)$/.test(entry.name) ? [path] : []
  })
}

function cssVar(name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})\\s*;`, 'i'))
  if (!match?.[1]) throw new Error(`Variable ${name} fehlt oder ist kein sechsstelliger Hex-Wert`)
  return match[1]
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

describe('Farbwelt der Studio-Site', () => {
  it('die Rechnung stimmt (Schwarz auf Weiss ist 21 zu 1)', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })

  it.each(['--bg', '--bg-soft', '--surface'])('--metal-text hat auf %s mindestens 4,5 zu 1', (background) => {
    expect(contrast(cssVar('--metal-text'), cssVar(background))).toBeGreaterThanOrEqual(4.5)
  })

  it('--metal selbst wäre als Schrift zu dunkel (darum gibt es --metal-text)', () => {
    expect(contrast(cssVar('--metal'), cssVar('--surface'))).toBeLessThan(4.5)
  })

  it('keine Datei setzt --metal als Schriftfarbe', () => {
    const offenders = sourceFiles(appDir).filter(file =>
      /(?<![-\w])color:\s*var\(--metal\)/.test(readFileSync(file, 'utf8')),
    )
    expect(offenders).toEqual([])
  })
})

describe('Auftritt des Seitenkopfs (.reveal)', () => {
  const rule = css.match(/\.portfolio-site \.reveal \{[^}]*\}/)?.[0] ?? ''
  const keyframes = css.match(/@keyframes portfolio-reveal \{(?:[^{}]*\{[^}]*\})*\s*\}/)?.[0] ?? ''

  it('die Regel und ihre Animation werden gefunden', () => {
    expect(rule).toContain('animation')
    expect(keyframes).toContain('transform')
  })

  it('der Kopf beginnt nie unsichtbar: keine Deckkraft in Regel und Animation', () => {
    expect(rule).not.toMatch(/opacity|visibility/)
    expect(keyframes).not.toMatch(/opacity|visibility/)
  })
})
