import { describe, expect, it } from 'vitest'
import { buildBrandDesign } from '../shared/brandDesign'
import {
  BRAND_TYPE_DEFAULT_RULES,
  BRAND_TYPE_MAX_FAMILIES,
  BRAND_TYPE_TRACKINGS,
  BRAND_TYPE_WEIGHTS,
  type BrandTypeRules,
  brandTypeClampTracking,
  brandTypeClampWeight,
  brandTypeDefaults,
  brandTypeFamilies,
  brandTypeRatioText,
  brandTypeRuleLines,
  brandTypeRulesFromLines,
  brandTypeRulesSlotValue,
  brandTypeScaleFactor,
  brandTypeScaleRatio,
  brandTypeTrackingText,
  brandTypeWeightAvailable,
  brandTypeWeightWarning,
  isBrandTypeScale,
  parseBrandTypeRulesSlotValue,
  validateBrandTypeRules,
} from '../shared/brandDesignType'
import { BRAND_TYPE_SCALES } from '../shared/brandDesignVocab'
import { BRAND_FONT_PAIRS, BRAND_MONO_FAMILY } from '../shared/brandFontPairs'
import { BRAND_STAGE_SOURCE_SLOTS } from '../shared/brandSessions'
import { slotById } from '../shared/slotRegistry'
import type { BrandDesignValues } from '../shared/types/brand'

/**
 * DIE TYPOGRAFIE ALS PURE REGEL (Konzept §2.4, Paket D4).
 *
 * ── WAS HIER WIRKLICH GEPRÜFT WIRD ────────────────────────────────────────
 * Nicht der Katalog (`brandFontPairs.test.ts` hält ihn an der CSS-Deklaration
 * fest) und nicht das Preset im Ganzen (`brandDesign.test.ts`). Geprüft wird,
 * was D4 dazwischen legt: dass die Vorbelegung aus der DNA kommt und nicht aus
 * dem Nichts, dass die Drei-Schriften-Regel eine Rechnung ist und keine
 * Behauptung, dass die Stellschrauben ihre Grenzen halten — und dass der
 * Slot-Wert von `i.rules` den Rundlauf übersteht.
 *
 * Die Beispielwerte sind die von Kailua Coffee Co.: DNA-Typografie `bookish`
 * (⇒ Paar `editorial`), Komposition `calm` (⇒ Hierarchie „ruhig"), und die
 * Regeln ruhig — 400, keine Laufweiten-Korrektur, keine Versalien.
 */

/** Die zehn Dimensionen von Kailua, so wie `g.mix` sie bestätigt trägt. */
const KAILUA_DNA: Readonly<Record<string, string>> = {
  style: 'editorial',
  era: 'timeless',
  form: 'soft',
  typography: 'bookish',
  color: 'earthy',
  imagery: 'craftClose',
  composition: 'calm',
  materiality: 'paper',
  motion: 'calmMotion',
  mood: 'warm',
}

describe('brandTypeDefaults — die Vorbelegung kommt aus der DNA (H5)', () => {
  it('leitet Paar und Hierarchie aus den zwei Dimensionen ab', () => {
    expect(brandTypeDefaults(KAILUA_DNA)).toEqual({
      pair: 'editorial',
      scale: 'calm',
      rules: { headingWeight: 400, headingTracking: 0, headingUppercase: false },
    })
  })

  it('folgt der DNA WIRKLICH — eine andere Typografie ergibt ein anderes Paar', () => {
    // Ohne diese Gegenprobe wäre die Prüfung oben auch für eine Funktion grün,
    // die immer das erste Paar des Katalogs zurückgibt.
    expect(brandTypeDefaults({ ...KAILUA_DNA, typography: 'geometricType' }).pair).toBe('geometric')
    expect(brandTypeDefaults({ ...KAILUA_DNA, typography: 'contrast' }).pair).toBe('contrast')
    expect(brandTypeDefaults({ ...KAILUA_DNA, composition: 'asymmetric' }).scale).toBe('loud')
    expect(brandTypeDefaults({ ...KAILUA_DNA, composition: 'grid' }).scale).toBe('dense')
  })

  it('fällt ohne DNA auf das erste Paar und die ruhige Hierarchie zurück', () => {
    expect(brandTypeDefaults(undefined)).toEqual({
      pair: BRAND_FONT_PAIRS[0]!.id,
      scale: BRAND_TYPE_SCALES[0]!.id,
      rules: BRAND_TYPE_DEFAULT_RULES,
    })
  })

  it('verwirft eine unbekannte Dimension still statt eine Id zu erfinden', () => {
    const defaults = brandTypeDefaults({ ...KAILUA_DNA, typography: 'blackletter', composition: 'spiral' })
    expect(defaults.pair).toBe(BRAND_FONT_PAIRS[0]!.id)
    expect(isBrandTypeScale(defaults.scale)).toBe(true)
  })
})

describe('Die Hierarchie (`i.scale`) — eine Zahl, kein zweites Feld', () => {
  it('hat für jede Hierarchie des Vokabulars einen Faktor', () => {
    for (const scale of BRAND_TYPE_SCALES) {
      expect(brandTypeScaleFactor(scale.id), scale.id).toBeGreaterThan(0)
    }
  })

  it('ordnet die drei Stufen: dicht < ruhig < plakativ', () => {
    expect(brandTypeScaleFactor('dense')).toBeLessThan(brandTypeScaleFactor('calm'))
    expect(brandTypeScaleFactor('calm')).toBeLessThan(brandTypeScaleFactor('loud'))
  })

  it('rechnet das Verhältnis aus dem Faktor — nicht daneben geschrieben', () => {
    expect(brandTypeScaleRatio('calm')).toBeCloseTo(2.6, 5)
    expect(brandTypeScaleRatio('dense')).toBeCloseTo(2.21, 5)
    expect(brandTypeRatioText('calm', 'de')).toBe('1 : 2,6')
    expect(brandTypeRatioText('calm', 'en')).toBe('1 : 2.6')
  })

  it('fällt bei unbekannter Id auf den ruhigen Vorschlag zurück', () => {
    expect(brandTypeScaleFactor('gigantisch')).toBe(brandTypeScaleFactor('calm'))
    expect(isBrandTypeScale('gigantisch')).toBe(false)
  })
})

describe('Die Drei-Schriften-Regel — eine Rechnung, keine Behauptung', () => {
  it('kommt für JEDES Paar des Katalogs auf höchstens drei Familien', () => {
    for (const pair of BRAND_FONT_PAIRS) {
      expect(brandTypeFamilies(pair.id).length, pair.id).toBeLessThanOrEqual(BRAND_TYPE_MAX_FAMILIES)
      expect(brandTypeFamilies(pair.id), pair.id).toContain(BRAND_MONO_FAMILY)
    }
  })

  it('zählt die Einfamilien-Paare richtig: `humanist` kommt auf zwei', () => {
    // Ohne diese Zeile prüfte die Obergrenze oben nur etwas, das nie jemand
    // erreicht — und der Mono-Anteil bliebe ungezählt.
    expect(brandTypeFamilies('humanist')).toHaveLength(2)
    expect(brandTypeFamilies('editorial')).toHaveLength(3)
  })

  it('GEGENPROBE: ein Paar mit zwei fremden Familien plus Mono sprengt sie', () => {
    const broken = [{
      ...BRAND_FONT_PAIRS[0]!,
      id: 'zuviel',
      headingFamily: 'A',
      headingStack: 'A, serif',
      bodyFamily: 'B',
      bodyStack: 'B, sans-serif',
    }]
    // Zwei Familien plus Mono sind genau drei — erst eine DRITTE eigene
    // Familie reisst die Regel. Deshalb prüft die Gegenprobe die Stelle, an
    // der es kippt, und nicht irgendeine kaputte Liste.
    expect(brandTypeFamilies('zuviel')).toEqual([BRAND_MONO_FAMILY])
    expect(validateBrandTypeRules(broken).some(line => line.includes('ohne Normalschnitt'))).toBe(true)
  })

  it('meldet ein angebotenes Gewicht, das in keiner Familie deklariert ist', () => {
    expect(validateBrandTypeRules(BRAND_FONT_PAIRS, [900]).join(' ')).toContain('ausserhalb 300…700')
    expect(validateBrandTypeRules(BRAND_FONT_PAIRS, [350]).join(' ')).toContain('in keiner Familie deklariert')
  })

  it('meldet eine Laufweite ausserhalb der Grenzen', () => {
    expect(validateBrandTypeRules(BRAND_FONT_PAIRS, BRAND_TYPE_WEIGHTS, [4]).join(' '))
      .toContain('Laufweite ausserhalb')
  })

  it('ist mit dem echten Katalog in jeder Hinsicht gültig', () => {
    expect(validateBrandTypeRules()).toEqual([])
  })
})

describe('Die Stellschrauben (`i.rules`) — geklemmt, nie verworfen', () => {
  it('kennt die echten Schnitte je Familie', () => {
    expect(brandTypeWeightAvailable('Source Serif 4', 600)).toBe(true)
    expect(brandTypeWeightAvailable('PT Serif', 600)).toBe(false)
    expect(brandTypeWeightAvailable('PT Serif', 700)).toBe(true)
    expect(brandTypeWeightAvailable('Comic Sans', 400)).toBe(false)
  })

  it('warnt genau dann, wenn der Browser den Schnitt fälschen würde', () => {
    expect(brandTypeWeightWarning('classic', 500)).toBe('PT Serif')
    expect(brandTypeWeightWarning('classic', 700)).toBeNull()
    expect(brandTypeWeightWarning('editorial', 500)).toBeNull()
    expect(brandTypeWeightWarning('gibtsnicht', 500)).toBeNull()
  })

  it('rastet auf den nächsten angebotenen Wert ein', () => {
    expect(brandTypeClampWeight(900)).toBe(700)
    expect(brandTypeClampWeight(100)).toBe(300)
    expect(brandTypeClampWeight(520)).toBe(500)
    expect(brandTypeClampWeight(Number.NaN)).toBe(BRAND_TYPE_DEFAULT_RULES.headingWeight)
    expect(brandTypeClampTracking(4)).toBe(1)
    expect(brandTypeClampTracking(-9)).toBe(-1)
    expect(brandTypeClampTracking(-0.4)).toBe(-0.5)
    expect(BRAND_TYPE_TRACKINGS).toContain(0)
  })

  it('schreibt die Laufweite mit Vorzeichen und in der Sprache der Marke', () => {
    expect(brandTypeTrackingText(-0.5, 'de')).toBe('-0,5 px')
    expect(brandTypeTrackingText(-0.5, 'en')).toBe('-0.5 px')
    expect(brandTypeTrackingText(1, 'de')).toBe('+1 px')
    expect(brandTypeTrackingText(0, 'de')).toBe('0 px')
  })
})

describe('Der Slot-Wert von `i.rules` — der Rundlauf', () => {
  const RULES: BrandTypeRules = { headingWeight: 600, headingTracking: -0.5, headingUppercase: true }

  it('schreibt vier beschriftete Blöcke, den letzten mit der festen Mono-Rolle', () => {
    const value = brandTypeRulesSlotValue(RULES, 'de')
    expect(value).toContain('## Überschrift-Gewicht')
    expect(value).toContain('## Laufweite')
    expect(value).toContain('## Versalien')
    expect(value).toContain('## Mono-Rolle')
    expect(value).toContain('monospace')
  })

  it('liest sich in BEIDEN Inhaltssprachen wieder zurück', () => {
    expect(parseBrandTypeRulesSlotValue(brandTypeRulesSlotValue(RULES, 'de'))).toEqual(RULES)
    expect(parseBrandTypeRulesSlotValue(brandTypeRulesSlotValue(RULES, 'en'))).toEqual(RULES)
  })

  it('klemmt beim Zurücklesen, statt einen alten Wert zu verwerfen', () => {
    const alt = brandTypeRulesSlotValue(RULES, 'de').replace('600 ·', '900 ·')
    expect(parseBrandTypeRulesSlotValue(alt)?.headingWeight).toBe(700)
  })

  it('gibt `null` zurück, wenn der Wert nicht aus dieser Regel stammt', () => {
    expect(parseBrandTypeRulesSlotValue('')).toBeNull()
    expect(parseBrandTypeRulesSlotValue('Halbfett, etwas enger, keine Versalien.')).toBeNull()
    // Drei statt vier Blöcke: die Mono-Rolle fehlt.
    const short = brandTypeRulesSlotValue(RULES, 'de').split('\n\n').slice(0, 3).join('\n\n')
    expect(parseBrandTypeRulesSlotValue(short)).toBeNull()
    // Vier Blöcke, aber im letzten steht keine Mono-Rolle mehr.
    const wrongMono = brandTypeRulesSlotValue(RULES, 'de').replaceAll('monospace', 'Wingdings')
    expect(parseBrandTypeRulesSlotValue(wrongMono)).toBeNull()
  })

  it('gibt dem Preset je Regel EINE Zeile — aus demselben Katalog', () => {
    const lines = brandTypeRuleLines(RULES, 'de')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toContain('Überschrift-Gewicht: 600')
    expect(lines[2]).toContain('Versalien: Ja')
  })
})

describe('Das Preset liest `i.*` (§2.8)', () => {
  /** Die tragenden Werte einer Marke, wie `buildBrandDesign` sie verlangt. */
  const VALUES: BrandDesignValues = {
    dna: KAILUA_DNA,
    base: '#4a3123',
    accent: '#2f4a3a',
    neutral: 'tinted',
    pair: 'editorial',
    scale: 'calm',
    typeRules: brandTypeRuleLines(BRAND_TYPE_DEFAULT_RULES, 'de'),
    markKind: 'word',
    tempo: 'calm',
  }

  it('trägt Paar, Hierarchie und Regeln von Kailua', () => {
    const preset = buildBrandDesign(VALUES)
    expect(preset?.type.pair).toBe('editorial')
    expect(preset?.type.scale).toBe('calm')
    expect(preset?.type.rules).toHaveLength(4)
    expect(preset?.type.rules[0]).toContain('400')
    expect(preset?.type.rules[2]).toContain('Nein')
  })

  it('ist ohne Paar oder Hierarchie GAR KEIN Preset', () => {
    expect(buildBrandDesign({ ...VALUES, pair: 'gibtsnicht' })).toBeNull()
    expect(buildBrandDesign({ ...VALUES, scale: '' })).toBeNull()
  })

  it('nimmt genau das Paar, das die Vorbelegung vorschlägt', () => {
    // Die Kette der Zusage: DNA ⇒ Vorbelegung ⇒ Preset. Bricht eine Stufe,
    // steht im Handbuch eine andere Schrift als in der Vorschau.
    const defaults = brandTypeDefaults(KAILUA_DNA)
    const preset = buildBrandDesign({ ...VALUES, pair: defaults.pair, scale: defaults.scale })
    expect(preset?.type).toMatchObject({ pair: 'editorial', scale: 'calm' })
  })
})

describe('Die Verträge um das Kapitel herum', () => {
  it('die Invariante von `i.pair` trägt GENAU die Ids des Katalogs', () => {
    // `sessionContent.ts` hat bewusst keine Importe (s. dessen Kopf), die Ids
    // stehen dort also wörtlich. Diese Zeile ist der Grund, warum das gehen
    // darf: läuft der Katalog davon weg, wird sie rot.
    expect(slotById('i.pair')!.invariants).toEqual([{
      kind: 'oneOf',
      terms: BRAND_FONT_PAIRS.map(pair => pair.id),
    }])
    expect(slotById('i.scale')!.invariants).toEqual([{
      kind: 'oneOf',
      terms: BRAND_TYPE_SCALES.map(scale => scale.id),
    }])
  })

  it('keine der drei Sessions hat einen Entwurfs-Generator', () => {
    // Paar, Hierarchie und Regeln entstehen auf der Werkbank. Ein Generator
    // schriebe Prosa in eine Katalog-Id (dieselbe Entscheidung wie `h.base`).
    for (const id of ['i.pair', 'i.scale', 'i.rules']) {
      expect(slotById(id)!.generator, id).toBe('none')
    }
  })

  it('die Bühne bekommt die fertige Farbwelt aus dem Kapitel davor', () => {
    // Ohne diese vier Quellen zeigte die Vorschau die Schrift auf der
    // Notfarbe — und damit nichts über DIESE Marke (D3-Klemme, D4-Zwilling).
    expect(BRAND_STAGE_SOURCE_SLOTS.type).toEqual([
      'g.mix', 'h.base', 'h.neutral', 'h.accent', 'result.direction',
    ])
  })
})

/**
 * DER RÜCKWEG AUS DEM PRESET (K2, Konzept docs/plans/BRAND-BOOK-KIT.md §2.6).
 *
 * Das Kit braucht die Schrift-Regeln als ZAHLEN (`font.weight.heading`,
 * `letterSpacing`), das Preset trägt sie als Zeilen. Ohne diesen Weg fiele das
 * Kit still auf den D4-Vorschlag zurück — eine Marke, die 700 entschieden hat,
 * bekäme 400, und niemand sähe es.
 */
describe('brandTypeRulesFromLines', () => {
  it('liest die Entscheidung aus den Preset-Zeilen zurück — in beiden Sprachen', () => {
    const rules: BrandTypeRules = { headingWeight: 700, headingTracking: -0.5, headingUppercase: true }
    for (const locale of ['de', 'en']) {
      expect(brandTypeRulesFromLines(brandTypeRuleLines(rules, locale)), locale).toEqual(rules)
    }
    expect(brandTypeRulesFromLines(brandTypeRuleLines(BRAND_TYPE_DEFAULT_RULES, 'de')))
      .toEqual(BRAND_TYPE_DEFAULT_RULES)
  })

  it('sagt `null` statt zu raten, wenn die Zeilen nicht aus dieser Regel stammen', () => {
    expect(brandTypeRulesFromLines([])).toBeNull()
    expect(brandTypeRulesFromLines(['Gewicht: 700', 'Laufweite: 0 px'])).toBeNull()
    // Vier Zeilen, aber die Mono-Rolle fehlt: dann ist es ein anderer Wert.
    expect(brandTypeRulesFromLines([
      'Überschrift-Gewicht: 700 · x',
      'Laufweite: 0 px · x',
      'Versalien: Nein · x',
      'Mono-Rolle: Helvetica · x',
    ])).toBeNull()
  })
})
