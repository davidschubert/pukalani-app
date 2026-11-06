import { describe, expect, it } from 'vitest'
import {
  BRAND_DESIGN_PRESET_VERSION,
  brandContrast,
  brandMotionTransitions,
  brandNeutralRamp,
  brandRampDark,
  brandRampLight,
  buildBrandDesign,
  isBrandHex,
} from '../shared/brandDesign'
import {
  BRAND_DNA_DIMENSION_IDS,
  BRAND_DNA_DIMENSIONS,
  BRAND_TEMPO_OPTIONS,
  validateBrandDesignVocab,
} from '../shared/brandDesignVocab'
import { BRAND_RAMP_SHADES, type BrandDesignValues } from '../shared/types/brand'

/**
 * DIE PURE REGEL VON BRAND DESIGN (Konzept §2.8, Paket D0).
 *
 * ── WAS HIER WIRKLICH GEPRÜFT WIRD ────────────────────────────────────────
 * Nicht die Ramp-Mathematik — die gehört der Themes-Engine und ist dort mit
 * 30+ Tests belegt. Geprüft wird der VERTRAG darüber: dass `buildBrandDesign`
 * deterministisch ist, dass beide Rampen alle elf Stufen tragen, dass jedes
 * Kontrast-Paar sein WCAG-Urteil bekommt — und vor allem, dass ein
 * unvollständiger Stand `null` ergibt statt eines halben Presets.
 *
 * Die Beispielwerte sind die abgenommenen von Kailua Coffee Co.
 * (`beispiel.vue`, `demoFoundation.ts`, Prototyp `demoDesign.ts`): Roast,
 * Palm, Paper und das Paar „Redaktionell". Erfundene Farben gibt es hier
 * bewusst nicht — was auf dem Bildschirm des Klickdummys stand, soll dieselbe
 * Zahl ergeben.
 */

const ROAST = '#4a3123'
const PALM = '#2f4a3a'
const PAPER = '#f7f2ea'

/** Die Belegung aller zehn Dimensionen — Fridas Vorschlag für Kailua. */
const KAILUA_DNA: Record<string, string> = {
  style: 'editorial',
  era: 'craft',
  form: 'soft',
  typography: 'bookish',
  color: 'earthy',
  imagery: 'craftClose',
  composition: 'calm',
  materiality: 'paper',
  motion: 'calmMotion',
  mood: 'honest',
}

const KAILUA: BrandDesignValues = {
  dna: KAILUA_DNA,
  base: ROAST,
  neutral: 'tinted',
  accent: PALM,
  roles: [
    { id: 'ground', source: 'Ramp 900 auf Papier', hex: ROAST },
    { id: 'quiet', source: 'Paper', hex: PAPER },
    // Eine Rolle OHNE aufgelösten Hex — sie ist eine Beschriftung und fällt
    // aus dem Preset heraus (s. `buildBrandDesign`).
    { id: 'surface', source: 'Ramp 100/200' },
  ],
  pair: 'editorial',
  scale: 'calm',
  typeRules: ['Mono gehört den Herkunftsangaben und Preisen.'],
  markKind: 'word',
  markBrief: ['Ruhig, handwerklich, überprüfbar.'],
  markExamples: ['<svg viewBox="0 0 100 100"></svg>'],
  keptDrafts: ['draft-1'],
  imageryPrinciples: ['Tageslicht, nichts gestellt.'],
  illustration: 'line',
  icons: 'regular',
  dodont: [{ doText: 'Hände und Werkzeug.', dontText: 'Daumen hoch.' }],
  tempo: 'calm',
  logoMotion: 'no',
  motionRules: ['Dekoration bewegt sich nie.'],
}

describe('Die Vokabulare (§2.2)', () => {
  it('sind in jeder Hinsicht gültig — zehn Dimensionen, je fünf Werte', () => {
    expect(validateBrandDesignVocab()).toEqual([])
    expect(BRAND_DNA_DIMENSIONS).toHaveLength(10)
  })

  it('GEGENPROBE: eine Dimension mit vier Werten fällt durch', () => {
    const broken = BRAND_DNA_DIMENSIONS.map((dimension, index) => (index === 0
      ? { ...dimension, values: dimension.values.slice(0, 4) }
      : dimension))
    expect(validateBrandDesignVocab(broken).some(line => line.includes('4 Werte'))).toBe(true)
  })
})

describe('Ramp und Kontrast — der A14-Vertrag zur Themes-Engine (§2.3)', () => {
  it('liefert elf Stufen je Rampe, hell wie dunkel', () => {
    for (const ramp of [brandRampLight(ROAST), brandRampDark(ROAST), brandNeutralRamp(ROAST)]) {
      expect(ramp).not.toBeNull()
      expect(Object.keys(ramp!)).toHaveLength(11)
      for (const shade of BRAND_RAMP_SHADES) {
        expect(isBrandHex(ramp![shade]), String(shade)).toBe(true)
      }
    }
  })

  it('die dunkle Rampe ist eine EIGENE Rechnung, nicht die helle umgedreht', () => {
    // Ohne diese Zeile wäre `brandRampDark` durch `brandRampLight` ersetzbar,
    // und die Marke kippte auf dunklem Grund ins Schwarz (Prototyp-Begründung).
    const light = brandRampLight(ROAST)!
    const dark = brandRampDark(ROAST)!
    expect(dark[50]).not.toBe(light[50])
    expect(dark[950]).not.toBe(light[950])
  })

  it('gibt bei ungültigem Hex `null` statt einer erfundenen Farbe', () => {
    expect(brandRampLight('roast')).toBeNull()
    expect(brandRampDark('#xyz')).toBeNull()
    expect(brandNeutralRamp('')).toBeNull()
    expect(brandContrast('roast', PAPER)).toBeNull()
  })

  it('urteilt nach WCAG — und der Prüfstein fällt in beide Richtungen', () => {
    const dark = brandContrast(ROAST, PAPER)
    expect(dark).not.toBeNull()
    expect(dark!.ratio).toBeGreaterThan(7)
    expect(dark!.level).toBe('AAA')
    // Papier auf Papier ist kein Kontrast — sonst prüfte die Zeile oben nur,
    // dass die Funktion überhaupt etwas zurückgibt.
    expect(brandContrast(PAPER, PAPER)!.level).toBe('fail')
  })
})

describe('buildBrandDesign — das Preset aus den bestätigten Werten (§2.8)', () => {
  it('baut das volle Preset für Kailua', () => {
    const preset = buildBrandDesign(KAILUA)
    expect(preset).not.toBeNull()
    expect(preset!.version).toBe(BRAND_DESIGN_PRESET_VERSION)
    expect(preset!.color.base).toBe(ROAST)
    expect(preset!.color.accent).toBe(PALM)
    expect(preset!.type.pair).toBe('editorial')
    expect(preset!.mark.kind).toBe('word')
    expect(preset!.motion.tempo).toBe('calm')
  })

  it('ist DETERMINISTISCH — dieselben Werte, dasselbe Preset', () => {
    expect(buildBrandDesign(KAILUA)).toEqual(buildBrandDesign({ ...KAILUA }))
    // Und es bewegt sich, sobald sich ein Wert bewegt (sonst prüfte die Zeile
    // oben nur, dass zwei Aufrufe dasselbe Objekt zurückgeben).
    expect(buildBrandDesign({ ...KAILUA, base: PALM })).not.toEqual(buildBrandDesign(KAILUA))
  })

  it('trägt alle zehn DNA-Dimensionen und KEINE elfte', () => {
    const preset = buildBrandDesign({
      ...KAILUA,
      dna: { ...KAILUA_DNA, erfunden: 'irgendwas' },
    })!
    expect(Object.keys(preset.dna)).toEqual([...BRAND_DNA_DIMENSION_IDS])
  })

  it('rechnet die drei Rampen und die Kontrast-Paare mit Urteil', () => {
    const preset = buildBrandDesign(KAILUA)!
    expect(Object.keys(preset.color.rampLight)).toHaveLength(11)
    expect(Object.keys(preset.color.rampDark)).toHaveLength(11)
    expect(Object.keys(preset.color.neutral)).toHaveLength(11)
    expect(preset.color.contrastPairs).toHaveLength(6)
    for (const pair of preset.color.contrastPairs) {
      expect(isBrandHex(pair.foreground), pair.id).toBe(true)
      expect(isBrandHex(pair.background), pair.id).toBe(true)
      expect(pair.ratio, pair.id).toBeGreaterThan(0)
      expect(['AAA', 'AA', 'AA18', 'fail'], pair.id).toContain(pair.level)
    }
    // Beide Welten kommen vor — eine Matrix nur fürs Helle wäre die halbe
    // Zusage (§2.3: „Text/Grund hell UND dunkel").
    expect(new Set(preset.color.contrastPairs.map(pair => pair.scheme))).toEqual(new Set(['light', 'dark']))
  })

  it('nimmt nur Rollen MIT aufgelöstem Hex ins Preset', () => {
    const preset = buildBrandDesign(KAILUA)!
    expect(preset.color.roles.map(role => role.id)).toEqual(['ground', 'quiet'])
  })

  it('leitet die Bewegungs-Tokens aus dem Tempo ab', () => {
    const preset = buildBrandDesign(KAILUA)!
    expect(preset.motion.transitions.map(token => token.id))
      .toEqual(['fast', 'base', 'slow', 'stagger'])
    const base = BRAND_TEMPO_OPTIONS.find(option => option.id === 'calm')!.base
    expect(preset.motion.transitions.find(token => token.id === 'base')!.durationMs).toBe(base)
    expect(preset.motion.transitions.find(token => token.id === 'fast')!.durationMs)
      .toBe(Math.round(base * 0.5))
    // Ein unbekanntes Tempo ergibt keine erfundenen Tokens.
    expect(brandMotionTransitions('gibt-es-nicht')).toEqual([])
  })

  it('behält die KI-Entwürfe im Werkstatt-Preset (der Snapshot lässt sie weg, D8)', () => {
    expect(buildBrandDesign(KAILUA)!.mark.keptDrafts).toEqual(['draft-1'])
  })
})

describe('buildBrandDesign — unvollständig heisst `null`', () => {
  const cases: readonly [string, BrandDesignValues][] = [
    ['ganz leer', {}],
    ['DNA fehlt', { ...KAILUA, dna: undefined }],
    ['DNA unvollständig', { ...KAILUA, dna: { style: 'editorial' } }],
    ['DNA mit erfundenem Wert', { ...KAILUA, dna: { ...KAILUA_DNA, color: 'neon' } }],
    ['Basisfarbe fehlt', { ...KAILUA, base: undefined }],
    ['Basisfarbe kein Hex', { ...KAILUA, base: 'roast' }],
    ['Akzent fehlt', { ...KAILUA, accent: undefined }],
    ['Schriftpaar fehlt', { ...KAILUA, pair: undefined }],
    ['Schriftpaar nicht im Katalog', { ...KAILUA, pair: 'comic' }],
    ['Hierarchie fehlt', { ...KAILUA, scale: undefined }],
    ['Zeichen-Richtung fehlt', { ...KAILUA, markKind: undefined }],
    ['Tempo fehlt', { ...KAILUA, tempo: undefined }],
    ['Tempo unbekannt', { ...KAILUA, tempo: 'rasend' }],
  ]

  it.each(cases)('%s ⇒ null', (_label, values) => {
    expect(buildBrandDesign(values)).toBeNull()
  })

  it('aber ein fehlender REGEL-Text macht das Preset nicht kaputt', () => {
    // Eine Marke ohne aufgeschriebene Bewegungs-Regel hat trotzdem eine
    // Farbwelt — nur was ein Leser zum Zeigen BRAUCHT, ist tragend.
    const preset = buildBrandDesign({
      ...KAILUA,
      typeRules: undefined,
      markBrief: undefined,
      markExamples: undefined,
      keptDrafts: undefined,
      imageryPrinciples: undefined,
      dodont: undefined,
      motionRules: undefined,
    })
    expect(preset).not.toBeNull()
    expect(preset!.motion.rules).toEqual([])
    expect(preset!.mark.keptDrafts).toEqual([])
  })
})
