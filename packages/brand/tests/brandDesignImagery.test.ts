import { describe, expect, it } from 'vitest'
import { buildBrandDesign } from '../shared/brandDesign'
import {
  BRAND_DODONT_DONT_LABEL,
  BRAND_DODONT_DO_LABEL,
  BRAND_ICON_SAMPLE,
  BRAND_ICON_STROKE_PX,
  BRAND_ICON_STROKE_RANGE_SANS,
  BRAND_ICON_STROKE_RANGE_SERIF,
  BRAND_IMAGERY_AXES,
  BRAND_IMAGERY_PRINCIPLES,
  BRAND_IMAGERY_PRINCIPLE_BY_DNA,
  BRAND_IMAGERY_PRINCIPLE_FALLBACK,
  brandFontStackIsSerif,
  brandIconStrokePx,
  brandIconStrokeRange,
  brandIconStrokeRangeText,
  brandIconStrokeText,
  brandIconStrokeVerdict,
  brandIconSuffix,
  brandImageryDefaults,
  brandImageryDoDont,
  brandImageryDoDontSlotValue,
  brandImageryPrinciple,
  brandImageryPrincipleDefault,
  brandImageryPrincipleLines,
  brandImageryPrincipleSlotValue,
  isBrandIconOption,
  isBrandIllustrationOption,
  isBrandImageryPrinciple,
  parseBrandImageryDoDontSlotValue,
  parseBrandImageryPrincipleSlotValue,
  validateBrandImageryRules,
} from '../shared/brandDesignImagery'
import { BRAND_ICON_OPTIONS, BRAND_ILLUSTRATION_OPTIONS } from '../shared/brandDesignVocab'
import { BRAND_FONT_PAIRS } from '../shared/brandFontPairs'
import { BRAND_STAGE_SOURCE_SLOTS } from '../shared/brandSessions'
import { slotById } from '../shared/slotRegistry'
import type { BrandDesignValues } from '../shared/types/brand'

/**
 * DIE BILDSPRACHE ALS PURE REGEL (Konzept §2.6, Paket D6).
 *
 * ── WAS HIER WIRKLICH GEPRÜFT WIRD ────────────────────────────────────────
 * Nicht das Vokabular (`brandDesign.test.ts` prüft es als Ganzes) und nicht
 * das Preset im Ganzen. Geprüft wird, was D6 dazwischen legt: dass das Prinzip
 * aus der DNA kommt, dass jede Achse ihr Gegenstück hat, dass beide Slot-Werte
 * den Rundlauf überstehen, dass die Strichstärke-Regel eine AUSKUNFT ist (sie
 * urteilt, sie sperrt nicht) — und dass das Preset am Ende vier `k.*`-Werte
 * trägt.
 *
 * Die Beispielwerte sind die von Kailua Coffee Co. (dieselbe DNA wie in D5):
 * Bildwelt `craftClose`, Formsprache `soft`, Schriftpaar `editorial`.
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

describe('das Bild-Prinzip (`k.photo`)', () => {
  it('folgt der DNA-Dimension „Bildwelt"', () => {
    expect(brandImageryPrincipleDefault(KAILUA_DNA)).toBe('closeup')
    expect(brandImageryPrincipleDefault({ ...KAILUA_DNA, imagery: 'documentary' })).toBe('daylight')
    expect(brandImageryPrincipleDefault({ ...KAILUA_DNA, imagery: 'still' })).toBe('contrast')
  })

  it('fällt ohne DNA und bei unbekannter Bildwelt auf „Tageslicht" zurück', () => {
    expect(brandImageryPrincipleDefault(undefined)).toBe(BRAND_IMAGERY_PRINCIPLE_FALLBACK)
    expect(brandImageryPrincipleDefault({ imagery: 'erfunden' })).toBe(BRAND_IMAGERY_PRINCIPLE_FALLBACK)
  })

  it('jede Bildwelt des Vokabulars kennt ein Prinzip', () => {
    // Fünf Werte hat die Dimension; fehlte einer, bekäme jede Marke mit dieser
    // Bildwelt still den Rückfall statt ihres Prinzips.
    expect(Object.keys(BRAND_IMAGERY_PRINCIPLE_BY_DNA).sort())
      .toEqual(['abstract', 'craftClose', 'documentary', 'people', 'still'])
  })

  it('trägt vier Achsen, jede mit ihrem Gegenstück', () => {
    expect(BRAND_IMAGERY_AXES).toEqual(['light', 'crop', 'people', 'colour'])
    for (const principle of BRAND_IMAGERY_PRINCIPLES) {
      for (const axis of BRAND_IMAGERY_AXES) {
        expect(principle.axes[axis].doText.de.length, `${principle.id}/${axis}`).toBeGreaterThan(0)
        expect(principle.axes[axis].dontText.de.length, `${principle.id}/${axis}`).toBeGreaterThan(0)
        expect(principle.axes[axis].doText.en.length, `${principle.id}/${axis}`).toBeGreaterThan(0)
        expect(principle.axes[axis].dontText.en.length, `${principle.id}/${axis}`).toBeGreaterThan(0)
      }
    }
  })

  it('schreibt fünf Blöcke und liest die Id wieder heraus — in beiden Sprachen', () => {
    for (const locale of ['de', 'en']) {
      for (const principle of BRAND_IMAGERY_PRINCIPLES) {
        const value = brandImageryPrincipleSlotValue(principle.id, locale)
        expect(value.split('\n\n')).toHaveLength(BRAND_IMAGERY_AXES.length + 1)
        expect(parseBrandImageryPrincipleSlotValue(value)).toBe(principle.id)
      }
    }
  })

  it('nennt die Begründung im Kopf-Block, nicht nur den Namen', () => {
    const value = brandImageryPrincipleSlotValue('closeup', 'de')
    expect(value).toContain(brandImageryPrinciple('closeup')!.reason.de)
    expect(brandImageryPrincipleLines('closeup', 'de')).toHaveLength(5)
    expect(brandImageryPrincipleLines('closeup', 'de')[1]).toContain('Licht:')
  })

  it('gibt für Unsinn nichts zurück, statt zu raten', () => {
    expect(brandImageryPrincipleSlotValue('gibtsnicht', 'de')).toBe('')
    expect(parseBrandImageryPrincipleSlotValue('Nah am Handwerk')).toBeNull()
    expect(parseBrandImageryPrincipleSlotValue('## Prinzip\nEtwas Eigenes · Weil')).toBeNull()
    expect(isBrandImageryPrinciple('closeup')).toBe(true)
    expect(isBrandImageryPrinciple('daylight ')).toBe(false)
  })
})

describe('Illustration und Icons (`k.illustration`, `k.icons`)', () => {
  it('belegt beide aus der DNA vor — über die EINE Tabelle aus D0', () => {
    const defaults = brandImageryDefaults(KAILUA_DNA)
    expect(defaults).toEqual({ principle: 'closeup', illustration: 'line', icons: 'regular' })
  })

  it('fällt ohne DNA auf „keine Illustration" und den Linien-Satz zurück', () => {
    expect(brandImageryDefaults(undefined)).toEqual({
      principle: 'daylight', illustration: 'none', icons: 'regular',
    })
  })

  it('kennt nur die Ids seiner Kataloge', () => {
    expect(BRAND_ILLUSTRATION_OPTIONS.map(option => option.id))
      .toEqual(['none', 'line', 'area', 'organic'])
    expect(BRAND_ICON_OPTIONS.map(option => option.id)).toEqual(['regular', 'fill', 'bold'])
    expect(isBrandIllustrationOption('line')).toBe(true)
    expect(isBrandIllustrationOption('gezeichnet')).toBe(false)
    expect(isBrandIconOption('bold')).toBe(true)
    expect(isBrandIconOption('dünn')).toBe(false)
  })

  it('die Invarianten der Registry nennen dieselben Ids wie die Kataloge', () => {
    // `sessionContent.ts` hat bewusst keine Importe (die Ids stehen dort
    // wörtlich) — ohne diesen Test liefen Katalog und Invariante auseinander,
    // und die Route wiese eine gültige Wahl als `invariant_violated` ab.
    const illustration = slotById('k.illustration')!.invariants[0]!
    expect(illustration.kind).toBe('oneOf')
    expect([...(illustration.terms ?? [])]).toEqual(BRAND_ILLUSTRATION_OPTIONS.map(option => option.id))
    const icons = slotById('k.icons')!.invariants[0]!
    expect(icons.kind).toBe('oneOf')
    expect([...(icons.terms ?? [])]).toEqual(BRAND_ICON_OPTIONS.map(option => option.id))
  })

  it('keine der vier Sessions trägt einen Entwurfs-Generator', () => {
    // §1.4: Bildsprache sind REGELN. Ein Knopf „Frida, entwirf das" schriebe
    // Prosa in fünf beschriftete Blöcke, zwei Katalog-Ids und sechs Paare.
    for (const slotId of ['k.photo', 'k.illustration', 'k.icons', 'k.dodont']) {
      expect(slotById(slotId)!.generator, slotId).toBe('none')
    }
  })
})

describe('die Strichstärke gegen die Textschrift', () => {
  it('liest die Serif am RÜCKFALL des Stacks, nicht an einer zweiten Namensliste', () => {
    expect(brandFontStackIsSerif("'Source Serif 4', Georgia, 'Times New Roman', serif")).toBe(true)
    // `sans-serif` endet auf dieselben fünf Buchstaben und ist trotzdem keine.
    expect(brandFontStackIsSerif("Inter, 'Helvetica Neue', Arial, sans-serif")).toBe(false)
  })

  it('gibt einem Paar mit Serif die feinere Spanne', () => {
    const editorial = brandIconStrokeRange('editorial')
    expect(editorial.serif).toBe(true)
    expect({ min: editorial.min, max: editorial.max }).toEqual({ ...BRAND_ICON_STROKE_RANGE_SERIF })
    expect(editorial.family).toBe('Source Serif 4')

    const inter = brandIconStrokeRange('inter')
    expect(inter.serif).toBe(false)
    expect({ min: inter.min, max: inter.max }).toEqual({ ...BRAND_ICON_STROKE_RANGE_SANS })
    expect(inter.family).toBe('Inter')
  })

  it('urteilt, ohne zu sperren', () => {
    // Kailua: Linien-Satz mit 1,5 px neben Source Serif 4 — er passt.
    expect(brandIconStrokeVerdict('editorial', 'regular').kind).toBe('fits')
    expect(brandIconStrokePx('regular')).toBe(1.5)
    // Kräftig liegt über beiden Spannen: eine Auskunft, kein Tor.
    expect(brandIconStrokeVerdict('editorial', 'bold').kind).toBe('heavy')
    expect(brandIconStrokeVerdict('inter', 'bold').kind).toBe('heavy')
    // Die Fläche hat keinen Strich — sie bekommt ein eigenes Urteil.
    expect(brandIconStrokeVerdict('editorial', 'fill').kind).toBe('area')
    expect(brandIconStrokePx('fill')).toBe(0)
    // Ein unbekanntes Paar rechnet trotzdem (erstes Paar des Katalogs).
    expect(brandIconStrokeVerdict('gibtsnicht', 'regular').kind).toBe('fits')
  })

  it('schreibt Zahlen in der Sprache des Lesers', () => {
    expect(brandIconStrokeText(1.5, 'de')).toBe('1,5 px')
    expect(brandIconStrokeText(1.5, 'en')).toBe('1.5 px')
    expect(brandIconStrokeText(2.25, 'de')).toBe('2,25 px')
    expect(brandIconStrokeRangeText(brandIconStrokeRange('editorial'), 'de')).toBe('1,25–1,5 px')
    expect(brandIconStrokeRangeText(brandIconStrokeRange('inter'), 'en')).toBe('1.5–2 px')
  })

  it('kennt für jeden Satz den echten Phosphor-Suffix und fünf Vergleichs-Icons', () => {
    expect(brandIconSuffix('regular')).toBe('')
    expect(brandIconSuffix('fill')).toBe('-fill')
    expect(brandIconSuffix('bold')).toBe('-bold')
    expect(BRAND_ICON_SAMPLE).toHaveLength(5)
    expect(BRAND_ICON_SAMPLE.every(icon => icon.startsWith('i-ph-'))).toBe(true)
  })
})

describe('das Do & Don\'t (`k.dodont`)', () => {
  it('rechnet sechs Paare: vier Achsen, Illustration, Icons', () => {
    const pairs = brandImageryDoDont('closeup', 'line', 'regular', 'de')
    expect(pairs).toHaveLength(6)
    expect(pairs[0]!.doText).toBe(brandImageryPrinciple('closeup')!.axes.light.doText.de)
    expect(pairs[3]!.dontText).toBe(brandImageryPrinciple('closeup')!.axes.colour.dontText.de)
    expect(pairs[4]!.doText).toContain('EINER Strichstärke')
    // Die Strichstärke steht als ZAHL in der Zeile — nicht als Adjektiv.
    expect(pairs[5]!.doText).toContain('1,5 px')
    expect(pairs[5]!.doText).not.toContain('{stroke}')
  })

  it('ändert sich mit dem Prinzip', () => {
    const closeup = brandImageryDoDont('closeup', 'none', 'regular', 'de')
    const daylight = brandImageryDoDont('daylight', 'none', 'regular', 'de')
    expect(closeup[0]!.doText).not.toBe(daylight[0]!.doText)
    expect(closeup[2]!.dontText).not.toBe(daylight[2]!.dontText)
  })

  it('jedes Do hat sein Don\'t — in beiden Sprachen und für jede Kombination', () => {
    for (const locale of ['de', 'en']) {
      for (const principle of BRAND_IMAGERY_PRINCIPLES) {
        for (const illustration of BRAND_ILLUSTRATION_OPTIONS) {
          for (const icons of BRAND_ICON_OPTIONS) {
            const pairs = brandImageryDoDont(principle.id, illustration.id, icons.id, locale)
            expect(pairs, `${principle.id}/${illustration.id}/${icons.id}/${locale}`).toHaveLength(6)
            for (const pair of pairs) {
              expect(pair.doText.trim().length).toBeGreaterThan(0)
              expect(pair.dontText.trim().length).toBeGreaterThan(0)
            }
          }
        }
      }
    }
  })

  it('übersteht den Rundlauf durch den Slot-Wert', () => {
    const pairs = brandImageryDoDont('closeup', 'line', 'regular', 'de')
    const value = brandImageryDoDontSlotValue(pairs)
    expect(value.split('\n')).toHaveLength(6)
    expect(value.startsWith(`- ${BRAND_DODONT_DO_LABEL}: `)).toBe(true)
    expect(value).toContain(`${BRAND_DODONT_DONT_LABEL}: `)
    expect(parseBrandImageryDoDontSlotValue(value)).toEqual(pairs)
  })

  it('bleibt auch als EINZELNES Paar lesbar', () => {
    // `brandListEntries()` zerschneidet eine Liste aus einer Zeile an Kommas,
    // Semikola, Schrägstrichen und Mittelpunkten. Der Trenner ist deshalb ein
    // Gedankenstrich — ein ' · ' machte aus einem Paar zwei Einträge.
    const value = brandImageryDoDontSlotValue([{ doText: 'Hände, Werkzeug, Arbeit', dontText: 'Daumen hoch' }])
    expect(parseBrandImageryDoDontSlotValue(value))
      .toEqual([{ doText: 'Hände, Werkzeug, Arbeit', dontText: 'Daumen hoch' }])
  })

  it('gibt für eine halbe Zeile `null` zurück, statt ein halbes Paar zu bauen', () => {
    expect(parseBrandImageryDoDontSlotValue('- Do: Tageslicht')).toBeNull()
    expect(parseBrandImageryDoDontSlotValue('')).toBeNull()
    expect(parseBrandImageryDoDontSlotValue('- Do: Licht — Don’t:')).toBeNull()
  })
})

describe('der Katalog hält seine Zusagen', () => {
  it('ist in seiner echten Fassung fehlerfrei', () => {
    expect(validateBrandImageryRules()).toEqual([])
  })

  it('meldet, was eine mutierte Fassung bricht', () => {
    const [first, second, third] = BRAND_IMAGERY_PRINCIPLES
    // Zwei Prinzipien mit derselben Id: die Vorbelegung träfe das falsche.
    expect(validateBrandImageryRules([first!, { ...second!, id: first!.id }, third!]).length)
      .toBeGreaterThan(0)
    // Eine Achse ohne Gegenstück — genau die Regel, an der sich nichts prüfen lässt.
    const broken = {
      ...first!,
      axes: { ...first!.axes, light: { ...first!.axes.light, dontText: { de: '', en: '' } } },
    }
    expect(validateBrandImageryRules([broken, second!, third!]))
      .toContain(`${first!.id}/light: Don't fehlt`)
    // Eine Bildwelt, die auf ein Prinzip zeigt, das es nicht gibt.
    expect(validateBrandImageryRules(BRAND_IMAGERY_PRINCIPLES, BRAND_ICON_STROKE_PX, {
      ...BRAND_IMAGERY_PRINCIPLE_BY_DNA, documentary: 'sonnenlicht',
    })).toContain('Bildwelt "documentary" zeigt auf ein unbekanntes Prinzip: sonnenlicht')
    // Und eine Strichstärke, die zu keinem Schriftpaar mehr passt: dann sagte
    // die Regel für JEDE Marke „passt nicht" — und wäre keine mehr.
    const tooHeavy = validateBrandImageryRules(BRAND_IMAGERY_PRINCIPLES, { regular: 3, fill: 0, bold: 3.5 })
    expect(tooHeavy.length).toBe(BRAND_FONT_PAIRS.length)
  })

  it('die Bühne bekommt Farbwelt und Textschrift aus den Kapiteln davor', () => {
    expect(BRAND_STAGE_SOURCE_SLOTS.imagery).toEqual([
      'g.mix', 'h.base', 'h.neutral', 'h.accent', 'i.pair', 'result.direction',
    ])
  })
})

describe('das Preset trägt die Bildsprache (§2.8)', () => {
  const defaults = brandImageryDefaults(KAILUA_DNA)
  const values: BrandDesignValues = {
    dna: KAILUA_DNA,
    base: '#4a3123',
    neutral: 'warm',
    accent: '#22392f',
    pair: 'editorial',
    scale: 'calm',
    markKind: 'word',
    tempo: 'calm',
    imageryPrinciples: brandImageryPrincipleLines(defaults.principle, 'de'),
    illustration: defaults.illustration,
    icons: defaults.icons,
    dodont: brandImageryDoDont(defaults.principle, defaults.illustration, defaults.icons, 'de'),
  }

  it('nimmt Prinzip, Illustration, Icons und die sechs Paare auf', () => {
    const preset = buildBrandDesign(values)!
    expect(preset.imagery.principles).toHaveLength(5)
    expect(preset.imagery.principles[0]).toContain('Nah am Handwerk')
    expect(preset.imagery.illustration).toBe('line')
    expect(preset.imagery.icons).toBe('regular')
    expect(preset.imagery.dodont).toHaveLength(6)
    expect(preset.imagery.dodont[0]).toEqual({
      doText: brandImageryPrinciple('closeup')!.axes.light.doText.de,
      dontText: brandImageryPrinciple('closeup')!.axes.light.dontText.de,
    })
  })

  it('eine Marke ohne Bildsprache bekommt trotzdem ihr Preset', () => {
    // Eine leere Bildsprache ist kein Grund, Farbwelt und Schrift zu
    // verschweigen (`buildBrandDesign`: „tragend ist, was ein Leser braucht").
    const preset = buildBrandDesign({
      ...values,
      imageryPrinciples: undefined,
      illustration: undefined,
      icons: undefined,
      dodont: undefined,
    })!
    expect(preset.imagery).toEqual({ principles: [], illustration: '', icons: '', dodont: [] })
  })
})
