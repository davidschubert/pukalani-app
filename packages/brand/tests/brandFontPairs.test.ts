import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BRAND_DECLARED_FONT_FAMILIES,
  BRAND_DECLARED_FONT_WEIGHTS,
  BRAND_FONT_PAIRS,
  BRAND_MONO_FAMILY,
  BRAND_MONO_STACK,
  brandFontPair,
  brandFontPairFamilies,
  validateBrandFontPairs,
} from '../shared/brandFontPairs'

/**
 * DER SCHRIFTPAAR-KATALOG UND DIE FALLE DAHINTER (Konzept §2.4/§2.17).
 *
 * `@nuxt/fonts` self-hostet nur, was der BUILD im CSS sieht. Eine Familie, die
 * im Katalog steht und nirgends deklariert ist, fällt in der Vorschau STILL
 * auf den Systemstack zurück — kein Fehler, keine Warnung, kein roter Build,
 * und die Seite sähe aus wie G4 („eine Richtung, kein Rendering-Beweis"),
 * obwohl sie genau das Gegenteil beweisen soll.
 *
 * Bis D3 hielt dieser Test nur zwei HANDGEPFLEGTE Listen aneinander — Katalog
 * und Deklarations-Liste. Beide konnten gemeinsam falsch sein: wer eine
 * Familie in die Liste schrieb, ohne sie im CSS zu deklarieren, blieb grün.
 *
 * **SEIT D4 IST DAS CSS DIE QUELLE:** der Abschnitt unten LIEST
 * `app/assets/css/brand-fonts.css` und vergleicht Familien UND Schnitte
 * wörtlich mit dem, was der Code behauptet. Damit prüft dieser Test die
 * WIRKLICHKEIT (was `@nuxt/fonts` im Build sieht) und nicht mehr nur die
 * Selbstauskunft.
 */
describe('BRAND_FONT_PAIRS — der kuratierte Katalog', () => {
  it('führt die sechs Paare aus dem Themes-Konzept und dem Richtungs-Katalog', () => {
    expect(BRAND_FONT_PAIRS.map(pair => pair.id))
      .toEqual(['editorial', 'humanist', 'inter', 'geometric', 'classic', 'contrast'])
  })

  it('ist in jeder Hinsicht gültig', () => {
    expect(validateBrandFontPairs()).toEqual([])
  })

  it('JEDE Familie des Katalogs ist deklariert (§2.17)', () => {
    const declared = new Set(BRAND_DECLARED_FONT_FAMILIES)
    for (const pair of BRAND_FONT_PAIRS) {
      for (const family of brandFontPairFamilies(pair)) {
        expect(declared, `${pair.id}: ${family}`).toContain(family)
      }
    }
  })

  it('GEGENPROBE: eine nicht deklarierte Familie fällt durch', () => {
    // Ohne sie wäre die Prüfung oben auch für eine Liste grün, die einfach
    // jede Familie enthält, die je gefragt wird.
    const problems = validateBrandFontPairs(BRAND_FONT_PAIRS, ['Inter'])
    expect(problems.some(line => line.includes('Source Serif 4'))).toBe(true)
    expect(problems.some(line => line.includes('nicht deklariert'))).toBe(true)
  })

  it('GEGENPROBE: ein Stack, der seine eigene Familie nicht nennt, fällt durch', () => {
    const broken = BRAND_FONT_PAIRS.map((pair, index) => (index === 0
      ? { ...pair, headingStack: 'Georgia, serif' }
      : pair))
    expect(validateBrandFontPairs(broken).some(line => line.includes('heading-Stack'))).toBe(true)
  })

  it('gibt jedem Stack einen echten Rückfall — nie eine Familie allein', () => {
    for (const pair of BRAND_FONT_PAIRS) {
      expect(pair.headingStack.split(',').length, `${pair.id} heading`).toBeGreaterThan(1)
      expect(pair.bodyStack.split(',').length, `${pair.id} body`).toBeGreaterThan(1)
    }
  })

  it('hält die Drei-Schriften-Regel: höchstens zwei Familien je Paar plus die feste Mono', () => {
    for (const pair of BRAND_FONT_PAIRS) {
      expect(brandFontPairFamilies(pair).length, pair.id).toBeLessThanOrEqual(2)
    }
    // `humanist` nutzt EINE Familie für beide Rollen — sonst prüfte die Zeile
    // oben nur eine Obergrenze, die nie jemand erreicht.
    expect(brandFontPairFamilies(brandFontPair('humanist')!)).toHaveLength(1)
    expect(BRAND_MONO_STACK).toContain('monospace')
  })

  it('findet ein Paar über seine Id — und erfindet keines', () => {
    expect(brandFontPair('editorial')?.headingFamily).toBe('Source Serif 4')
    expect(brandFontPair('comic')).toBeUndefined()
  })
})

/**
 * DIE DEKLARATION SELBST — gelesen, nicht geglaubt (D4).
 *
 * Geparst wird genau das, was `@nuxt/fonts` im Build auch sieht: die ERSTE
 * Familie jeder `font-family`-Zeile (in Anführungszeichen, denn nur die ist
 * die Familie und nicht der Rückfall) mit dem `font-weight` derselben Zeile.
 */
function declaredFromCss(): Map<string, Set<number>> {
  const css = readFileSync(new URL('../app/assets/css/brand-fonts.css', import.meta.url), 'utf8')
  const declared = new Map<string, Set<number>>()
  for (const line of css.split('\n')) {
    const family = line.match(/font-family:\s*'([^']+)'/)?.[1]
    const weight = line.match(/font-weight:\s*(\d+)/)?.[1]
    if (!family || !weight) continue
    const weights = declared.get(family) ?? new Set<number>()
    weights.add(Number(weight))
    declared.set(family, weights)
  }
  return declared
}

describe('brand-fonts.css — die Deklaration ist die Quelle (D4)', () => {
  it('deklariert GENAU die Familien, die der Code als geladen führt', () => {
    const css = declaredFromCss()
    expect([...css.keys()].sort()).toEqual([...BRAND_DECLARED_FONT_FAMILIES].sort())
  })

  it('deklariert je Familie GENAU die Schnitte, die der Code als geladen führt', () => {
    const css = declaredFromCss()
    for (const family of BRAND_DECLARED_FONT_FAMILIES) {
      expect([...(css.get(family) ?? [])].sort((a, b) => a - b), family)
        .toEqual([...(BRAND_DECLARED_FONT_WEIGHTS[family] ?? [])].sort((a, b) => a - b))
    }
  })

  it('GEGENPROBE: der Parser findet wirklich etwas — und nicht überall dasselbe', () => {
    // Ohne diese Zeile wären die zwei Prüfungen oben auch für einen Parser
    // grün, der immer eine leere Karte zurückgibt.
    const css = declaredFromCss()
    expect(css.size).toBe(7)
    expect([...(css.get('PT Serif') ?? [])].sort((a, b) => a - b)).toEqual([400, 700])
    expect([...(css.get('Inter') ?? [])].sort((a, b) => a - b)).toEqual([300, 400, 500, 600, 700])
  })

  it('jede Familie trägt den Normalschnitt 400 — darauf läuft jeder Fliesstext', () => {
    for (const [family, weights] of declaredFromCss()) {
      expect(weights.has(400), family).toBe(true)
    }
  })

  it('die Mono-Familie steht NICHT in dieser Datei — sie gehört der Werkstatt', () => {
    // `--bw-font-mono` in `brand.css` deklariert sie; eine zweite Deklaration
    // hier wäre eine zweite Wahrheit über dieselbe Familie.
    expect(declaredFromCss().has(BRAND_MONO_FAMILY)).toBe(false)
    expect(BRAND_MONO_STACK).toContain(BRAND_MONO_FAMILY)
  })
})
