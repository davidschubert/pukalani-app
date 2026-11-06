import { describe, expect, it } from 'vitest'
import { brandNeutralSource, buildBrandDesign } from '../shared/brandDesign'
import {
  BRAND_MARK_BRIEF_FIELDS,
  BRAND_MARK_BRIEF_FIELD_MAX,
  BRAND_MARK_KIND_FALLBACK,
  BRAND_MARK_MIN_WIDTH_MM,
  BRAND_MARK_MIN_WIDTH_PX,
  BRAND_MARK_MONOGRAM_MIN_PX,
  BRAND_MARK_RADIUS_BY_FORM,
  type BrandMarkBrief,
  brandMarkBriefLines,
  brandMarkBriefSlotValue,
  brandMarkDerivedBriefFields,
  brandMarkExamplesSlotValue,
  brandMarkInitial,
  brandMarkKindDefault,
  brandMarkMeasuresText,
  brandMarkPickDefault,
  brandMarkRadiusPercent,
  brandMarkSpec,
  brandMarkVariantColors,
  clampBrandMarkBrief,
  isBrandMarkKind,
  isBrandMarkSetting,
  parseBrandMarkBriefSlotValue,
  parseBrandMarkExamplesSlotValue,
  validateBrandMarkRules,
} from '../shared/brandDesignMark'
import { brandSceneColors } from '../shared/brandDesignScene'
import { BRAND_MARK_KINDS, BRAND_MARK_SETTINGS, BRAND_MARK_VARIANTS } from '../shared/brandDesignVocab'
import {
  brandMarkCapHeight,
  brandMarkExampleSvgs,
  brandMarkMonogramSvg,
  brandMarkWordmarkSvg,
  escapeXml,
} from '../shared/brandMarkSvg'
import { BRAND_STAGE_SOURCE_SLOTS } from '../shared/brandSessions'
import { slotById } from '../shared/slotRegistry'
import type { BrandDesignValues } from '../shared/types/brand'

/**
 * DAS ZEICHEN ALS PURE REGEL (Konzept §2.5, Pakete D5a + D5b).
 *
 * ── WAS HIER WIRKLICH GEPRÜFT WIRD ────────────────────────────────────────
 * Nicht das Vokabular (`brandDesign.test.ts` prüft es als Ganzes) und nicht
 * das Preset im Ganzen. Geprüft wird, was D5 dazwischen legt: dass die
 * Richtung aus der DNA kommt, dass die zwei GERECHNETEN Briefing-Felder von
 * keinem Modell überschrieben werden können, dass beide Slot-Werte den
 * Rundlauf überstehen — und dass die Setzung eine Zeichenkette ist, die sich
 * festnageln lässt.
 *
 * Die Beispielwerte sind die von Kailua Coffee Co.: DNA `editorial/soft/
 * bookish`, Basisfarbe Roast `#4a3123`, Akzent `#22392f`, warme Neutral-Rampe,
 * Schriftpaar `editorial` (Source Serif 4 · Source Sans 3).
 */

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

const KAILUA_COLORS = brandSceneColors('#4a3123', '#22392f', brandNeutralSource('warm', '#4a3123'))

function kailuaSpec(overrides: Partial<Parameters<typeof brandMarkSpec>[0]> = {}) {
  return brandMarkSpec({
    title: 'Kailua Coffee Co.',
    pairId: 'editorial',
    kind: 'word',
    dna: KAILUA_DNA,
    colors: KAILUA_COLORS,
    ...overrides,
  })
}

const FULL_BRIEF: BrandMarkBrief = {
  character: 'Ruhig, handwerklich, überprüfbar.',
  formLanguage: 'Weiche Kanten, eine Idee statt einer Szene.',
  ...brandMarkDerivedBriefFields('K', 'de'),
  noGos: 'Nicht verzerren, nicht schräg stellen, keinen Schatten.',
  places: 'Ladenschild, Tüte, Website-Kopf, Rechnung.',
}

// ── Die Richtung (`j.kind`) ───────────────────────────────────────────────

describe('die Richtung des Zeichens', () => {
  it('kommt aus der DNA-Dimension „Visueller Stil"', () => {
    // `editorial` ⇒ Wortmarke, `technical` ⇒ Monogramm — dieselbe Tabelle,
    // die auch das Preset liest (`brandDesignDefaultsFromDna`).
    expect(brandMarkKindDefault(KAILUA_DNA)).toBe('word')
    expect(brandMarkKindDefault({ ...KAILUA_DNA, style: 'technical' })).toBe('monogram')
    expect(brandMarkKindDefault({ ...KAILUA_DNA, style: 'playful' })).toBe('pictorial')
  })

  it('fällt ohne DNA auf die Wortmarke zurück — die Antwort mit dem geringsten Schaden', () => {
    expect(brandMarkKindDefault(undefined)).toBe(BRAND_MARK_KIND_FALLBACK)
    expect(brandMarkKindDefault({ style: 'gibt-es-nicht' })).toBe(BRAND_MARK_KIND_FALLBACK)
  })

  it('kennt genau die vier Richtungen des Katalogs', () => {
    for (const kind of BRAND_MARK_KINDS) expect(isBrandMarkKind(kind.id)).toBe(true)
    expect(isBrandMarkKind('Eine warme Wortmarke mit Wellenpunkt')).toBe(false)
  })

  it('die Invariante der Session nennt dieselben vier Ids', () => {
    // Ohne diese Kopplung stünde ein von Hand korrigierter Satz bestätigt im
    // Slot, und weder die Setzungen noch `buildBrandDesign` könnten etwas
    // damit anfangen (dieselbe Prüfung wie bei `i.pair`, D4).
    expect(slotById('j.kind')!.invariants).toEqual([{
      kind: 'oneOf',
      terms: BRAND_MARK_KINDS.map(kind => kind.id),
    }])
    expect(slotById('j.pick')!.invariants).toEqual([{
      kind: 'oneOf',
      terms: BRAND_MARK_SETTINGS.map(setting => setting.id),
    }])
  })
})

// ── Das Briefing (`j.brief`) ──────────────────────────────────────────────

describe('das Briefing', () => {
  it('rechnet Schutzraum und Varianten — mit den Zahlen des Katalogs', () => {
    const derived = brandMarkDerivedBriefFields('K', 'de')
    expect(derived.clearSpace).toContain('Versal-K')
    expect(derived.clearSpace).toContain(`${BRAND_MARK_MIN_WIDTH_PX} px`)
    expect(derived.clearSpace).toContain(`${BRAND_MARK_MIN_WIDTH_MM} mm`)
    expect(derived.clearSpace).toContain(`${BRAND_MARK_MONOGRAM_MIN_PX} px`)
    for (const variant of BRAND_MARK_VARIANTS) {
      expect(derived.variants).toContain(variant.de)
    }
  })

  it('verwirft, was ein Modell zu Schutzraum und Varianten sagt', () => {
    // Die zwei Felder sind MASSE. Ein Modell, das eine andere Zahl nennt,
    // wäre eine zweite Wahrheit über eine Setzung (Kopf von brandDesignMark).
    const { brief } = clampBrandMarkBrief({
      character: 'Ruhig.',
      formLanguage: 'Weich.',
      noGos: 'Nicht verzerren.',
      places: 'Ladenschild.',
      clearSpace: 'Genug Platz ringsum, ungefähr 5 mm.',
      variants: 'Nur eine Variante, das reicht.',
    }, 'K', 'de')
    expect(brief?.clearSpace).toBe(brandMarkDerivedBriefFields('K', 'de').clearSpace)
    expect(brief?.variants).toBe(brandMarkDerivedBriefFields('K', 'de').variants)
    expect(brief?.clearSpace).not.toContain('5 mm')
  })

  it('ein fehlendes geschriebenes Feld macht das ganze Briefing unbrauchbar', () => {
    const result = clampBrandMarkBrief({
      character: 'Ruhig.',
      formLanguage: '   ',
      noGos: 'Nicht verzerren.',
      places: '',
    }, 'K', 'de')
    expect(result.brief).toBeNull()
    expect([...result.missing]).toEqual(['formLanguage', 'places'])
  })

  it('klemmt Länge, Zeilenumbrüche und den Trenner ` · `', () => {
    const long = 'A'.repeat(BRAND_MARK_BRIEF_FIELD_MAX + 80)
    const { brief } = clampBrandMarkBrief({
      character: `Zeile eins\n  Zeile zwei · mit Trenner`,
      formLanguage: long,
      noGos: 'Nicht verzerren.',
      places: 'Ladenschild.',
    }, 'K', 'de')
    expect(brief?.character).toBe('Zeile eins Zeile zwei — mit Trenner')
    expect(brief?.formLanguage.length).toBe(BRAND_MARK_BRIEF_FIELD_MAX)
  })

  it('der Slot-Wert übersteht den Rundlauf', () => {
    const value = brandMarkBriefSlotValue(FULL_BRIEF, 'de')
    expect(value.split('\n\n')).toHaveLength(BRAND_MARK_BRIEF_FIELDS.length)
    expect(parseBrandMarkBriefSlotValue(value)).toEqual(FULL_BRIEF)
  })

  it('… und ein formfremder Wert ergibt `null` statt eines halben Briefings', () => {
    expect(parseBrandMarkBriefSlotValue('Ein Briefing in Prosa.')).toBeNull()
    expect(parseBrandMarkBriefSlotValue('## Charakter\nRuhig.')).toBeNull()
  })

  it('die Preset-Zeilen kommen aus demselben Katalog wie der Slot-Wert', () => {
    const lines = brandMarkBriefLines(FULL_BRIEF, 'de')
    expect(lines).toHaveLength(BRAND_MARK_BRIEF_FIELDS.length)
    expect(lines[0]).toBe(`Charakter: ${FULL_BRIEF.character}`)
    expect(lines[2]).toContain('Versal-K')
  })

  it('englisch ist eine andere Sprache, nicht eine andere Struktur', () => {
    const en = brandMarkBriefSlotValue({ ...FULL_BRIEF, ...brandMarkDerivedBriefFields('K', 'en') }, 'en')
    expect(en).toContain('## Clear space & minimum sizes')
    expect(en).toContain('capital K')
    expect(parseBrandMarkBriefSlotValue(en)).not.toBeNull()
  })
})

// ── Die Setzungen (`j.examples`) ──────────────────────────────────────────

describe('die Setzungen', () => {
  it('nehmen ihre vier Varianten aus der Farbwelt, nicht aus einer Palette', () => {
    const variants = brandMarkVariantColors(KAILUA_COLORS)
    expect(variants.map(variant => variant.id))
      .toEqual(BRAND_MARK_VARIANTS.map(variant => variant.id))
    expect(variants[0]!.ground).toBe(KAILUA_COLORS.paper)
    expect(variants[0]!.ink).toBe(KAILUA_COLORS.rampLight[900])
    // Invertiert ist dieselbe Entscheidung, andersherum.
    expect(variants[1]!.ground).toBe(variants[0]!.ink)
    expect(variants[1]!.ink).toBe(variants[0]!.ground)
    // Einfarbig kennt keinen Marken-Ton: Prägung hat keine zweite Farbe.
    expect(variants[2]!.ink).toBe(KAILUA_COLORS.neutral[950])
  })

  it('die Eckenrundung kommt aus der DNA-Formsprache — kantig ist wirklich 0', () => {
    expect(brandMarkRadiusPercent(KAILUA_DNA)).toBe(BRAND_MARK_RADIUS_BY_FORM.soft)
    expect(brandMarkRadiusPercent({ ...KAILUA_DNA, form: 'sharp' })).toBe(0)
    expect(brandMarkRadiusPercent(undefined)).toBeGreaterThan(0)
  })

  it('das Monogramm nimmt den ersten Buchstaben, nicht das erste Zeichen', () => {
    expect(brandMarkInitial('Kailua Coffee Co.')).toBe('K')
    expect(brandMarkInitial('&Söhne')).toBe('S')
    expect(brandMarkInitial('  ökobau')).toBe('Ö')
    expect(brandMarkInitial('')).toBe('A')
  })

  it('die Anweisung fällt bei unbekanntem Paar auf den Katalog zurück', () => {
    const spec = kailuaSpec({ pairId: 'gibt-es-nicht' })
    expect(spec.pairId).toBe('editorial')
    expect(spec.headingFamily).toBe('Source Serif 4')
  })

  it('der Slot-Wert übersteht den Rundlauf', () => {
    const spec = kailuaSpec()
    const value = brandMarkExamplesSlotValue(spec, 'de')
    const parsed = parseBrandMarkExamplesSlotValue(value)
    expect(parsed?.wordmark).toBe('Kailua Coffee Co.')
    expect(parsed?.initial).toBe('K')
    expect(parsed?.headingFamily).toBe('Source Serif 4')
    expect(parsed?.variants.map(variant => variant.ink)).toEqual(spec.variants.map(v => v.ink))
    expect(parsed?.variants.map(variant => variant.ground)).toEqual(spec.variants.map(v => v.ground))
  })

  it('… und trägt die Hex-Werte UND die Familie im Klartext', () => {
    // Genau daran hängt der Beweis am Server: der Wert im Dokument nennt die
    // bestätigten Farben und die bestätigte Schrift, nicht nur eine Id.
    const value = brandMarkExamplesSlotValue(kailuaSpec(), 'de')
    expect(value).toContain('Source Serif 4')
    expect(value).toContain(KAILUA_COLORS.rampLight[900])
    expect(value).toContain(KAILUA_COLORS.paper)
  })

  it('ein formfremder Wert ergibt `null`', () => {
    expect(parseBrandMarkExamplesSlotValue('Wortmarke in Serif, dunkel auf hell.')).toBeNull()
    expect(parseBrandMarkExamplesSlotValue('## Setzungen\nWortmarke: X · Monogramm: X · Schrift: X')).toBeNull()
  })

  it('der Mass-Satz nennt dieselben Zahlen wie das Briefing', () => {
    const text = brandMarkMeasuresText(kailuaSpec(), 'de')
    expect(text).toContain(`${BRAND_MARK_MIN_WIDTH_PX} px`)
    expect(text).toContain('Eckenradius 34 %')
  })

  it('die Wahl folgt der Richtung', () => {
    expect(brandMarkPickDefault('monogram')).toBe('monogram')
    expect(brandMarkPickDefault('word')).toBe('wordmark')
    expect(brandMarkPickDefault('combination')).toBe('wordmark')
    for (const setting of BRAND_MARK_SETTINGS) expect(isBrandMarkSetting(setting.id)).toBe(true)
    expect(isBrandMarkSetting('bildmarke')).toBe(false)
  })
})

// ── Der Satz als Zeichenkette (`brandMarkSvg.ts`) ─────────────────────────

describe('der SVG-Satz', () => {
  const spec = kailuaSpec()

  it('setzt die Wortmarke Zeichen für Zeichen so und nicht anders', () => {
    // GOLDEN: die Setzung ist deterministisch, und genau das ist die Zusage
    // („dieselben Eingaben, dieselbe Zeichenkette"). Ändert sich hier etwas,
    // ändert sich das Zeichen JEDER Marke — das soll auffallen.
    expect(brandMarkWordmarkSvg(spec, 'primary')).toBe([
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120">',
      '  <rect x="0" y="0" width="400" height="120" fill="#fcfaf9" />',
      '  <text x="200" y="68" text-anchor="middle" fill="#352217"'
      + ' font-family="&apos;Source Serif 4&apos;, Georgia, &apos;Times New Roman&apos;, serif"'
      + ' font-size="34" font-weight="400" letter-spacing="0">Kailua Coffee Co.</text>',
      '</svg>',
    ].join('\n'))
  })

  it('setzt das Monogramm ins gerundete Quadrat', () => {
    expect(brandMarkMonogramSvg(spec, 'primary')).toBe([
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">',
      '  <rect x="0" y="0" width="160" height="120" fill="#fcfaf9" />',
      '  <rect x="48" y="28" width="64" height="64" rx="21.76" fill="#352217" />',
      '  <text x="80" y="68" text-anchor="middle" fill="#fcfaf9"'
      + ' font-family="&apos;Source Serif 4&apos;, Georgia, &apos;Times New Roman&apos;, serif"'
      + ' font-size="34" font-weight="400">K</text>',
      '</svg>',
    ].join('\n'))
  })

  it('zeichnet den Schutzraum nur, wenn er verlangt ist — und in Versalhöhe', () => {
    const plain = brandMarkWordmarkSvg(spec, 'primary')
    const guarded = brandMarkWordmarkSvg(spec, 'primary', { clearSpace: true })
    expect(plain).not.toContain('stroke-dasharray')
    const cap = brandMarkCapHeight(34)
    expect(cap).toBe(24)
    expect(guarded).toContain(`x="${cap}" y="${cap}" width="${400 - 2 * cap}" height="${120 - 2 * cap}"`)
  })

  it('nimmt Gewicht, Laufweite und Versalien aus den Schrift-Regeln', () => {
    const loud = kailuaSpec({ headingWeight: 600, headingTracking: -0.5, headingUppercase: true })
    const svg = brandMarkWordmarkSvg(loud, 'primary')
    expect(svg).toContain('font-weight="600"')
    expect(svg).toContain('letter-spacing="-0.5"')
    expect(svg).toContain('>KAILUA COFFEE CO.<')
  })

  it('entschärft den Markennamen — die einzige fremde Eingabe', () => {
    const evil = kailuaSpec({ title: '<script>alert(1)</script> & Co' })
    const svg = brandMarkWordmarkSvg(evil, 'primary', { title: 'x' })
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co')
    expect(escapeXml('a"b\'c')).toBe('a&quot;b&apos;c')
  })

  it('trägt ohne Beschriftung KEINE leere Bild-Rolle', () => {
    expect(brandMarkWordmarkSvg(spec, 'primary')).not.toContain('aria-label')
    const labelled = brandMarkWordmarkSvg(spec, 'primary', { title: 'Wortmarke Kailua' })
    expect(labelled).toContain('role="img" aria-label="Wortmarke Kailua"')
    expect(labelled).toContain('<title>Wortmarke Kailua</title>')
  })

  it('liefert acht Setzungen fürs Preset — vier Varianten mal zwei Marken, ohne Hilfslinie', () => {
    const svgs = brandMarkExampleSvgs(spec)
    expect(svgs).toHaveLength(BRAND_MARK_VARIANTS.length * 2)
    expect(svgs.every(svg => !svg.includes('stroke-dasharray'))).toBe(true)
    expect(new Set(svgs).size).toBe(svgs.length)
    // Jede Variante bringt ihren eigenen Grund mit — sonst wären es vier
    // Kopien derselben Setzung.
    for (const variant of brandMarkVariantColors(KAILUA_COLORS)) {
      expect(svgs.some(svg => svg.includes(`fill="${variant.ground}" />`))).toBe(true)
    }
  })

  it('eine unbekannte Variante fällt auf die primäre zurück statt leer zu bleiben', () => {
    expect(brandMarkWordmarkSvg(spec, 'gibt-es-nicht')).toBe(brandMarkWordmarkSvg(spec, 'primary'))
  })
})

// ── Die Kopplung an Registry, Bühne und Preset ────────────────────────────

describe('das Kapitel `mark` im Ganzen', () => {
  it('die Invarianten des Katalogs halten — und die Gegenprobe fällt', () => {
    expect(validateBrandMarkRules()).toEqual([])
    // Eine fünfte Variante ohne Einsatzort stünde im Briefing als Wort ohne
    // Ort; eine Rundung über 50 % wäre ein Kreis, kein Quadrat.
    expect(validateBrandMarkRules(
      BRAND_MARK_KINDS,
      [...BRAND_MARK_VARIANTS, { id: 'neon' }],
      { ...BRAND_MARK_RADIUS_BY_FORM, soft: 80 },
    ).length).toBe(2)
    // Ohne den Rückfall im Katalog zeigte die Vorbelegung auf eine Id, die es
    // nicht gibt.
    expect(validateBrandMarkRules([{ id: 'pictorial' }]).length).toBe(1)
  })

  it('die Bühne bekommt DNA, Farbwelt UND Schrift aus den Kapiteln davor', () => {
    expect(BRAND_STAGE_SOURCE_SLOTS.mark).toEqual([
      'g.mix', 'h.base', 'h.neutral', 'h.accent', 'i.pair', 'i.rules', 'result.direction',
    ])
  })

  it('`j.examples` und `j.pick` haben keinen Entwurfs-Generator, `j.brief` schon', () => {
    // Die Setzungen sind Satz (`derivation`, PUR), die Wahl ist eine Wahl —
    // ein Generator schriebe Prosa in einen gerechneten Wert. Das Briefing
    // ist der EINE Lauf dieses Kapitels.
    expect(slotById('j.examples')!.generator).toBe('none')
    expect(slotById('j.pick')!.generator).toBe('none')
    expect(slotById('j.brief')!.generator).toBe('draft')
  })

  it('das Preset trägt Richtung, Briefing und Setzungen', () => {
    const spec = kailuaSpec()
    const values: BrandDesignValues = {
      dna: KAILUA_DNA,
      base: '#4a3123',
      neutral: 'warm',
      accent: '#22392f',
      pair: 'editorial',
      scale: 'calm',
      markKind: 'word',
      markBrief: brandMarkBriefLines(FULL_BRIEF, 'de'),
      markExamples: brandMarkExampleSvgs(spec),
      tempo: 'calm',
    }
    const preset = buildBrandDesign(values)
    expect(preset?.mark.kind).toBe('word')
    expect(preset?.mark.brief).toHaveLength(BRAND_MARK_BRIEF_FIELDS.length)
    expect(preset?.mark.examples).toHaveLength(BRAND_MARK_VARIANTS.length * 2)
    expect(preset?.mark.examples[0]).toContain('Kailua Coffee Co.')
    // Stufe 3 ist D5c: das Preset kennt das Feld, gefüllt wird es hier nicht.
    expect(preset?.mark.keptDrafts).toEqual([])
  })
})
