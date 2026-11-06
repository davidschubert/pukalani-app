import { describe, expect, it } from 'vitest'
import { BRAND_DESIGN_PRESET_VERSION, brandNeutralSource } from '../shared/brandDesign'
import { brandColorRoles, brandColorRolesSlotValue } from '../shared/brandDesignColor'
import { brandDnaMixSlotValue } from '../shared/brandDesignDna'
import {
  brandImageryDoDont,
  brandImageryDoDontSlotValue,
  brandImageryPrincipleSlotValue,
} from '../shared/brandDesignImagery'
import {
  brandMarkBriefSlotValue,
  brandMarkDerivedBriefFields,
  brandMarkInitial,
} from '../shared/brandDesignMark'
import { brandMotionRules, brandMotionRulesSlotValue } from '../shared/brandDesignMotion'
import { BRAND_TYPE_DEFAULT_RULES, brandTypeRulesSlotValue } from '../shared/brandDesignType'
import {
  BRAND_DESIGN_PRESET_SLOTS,
  brandDesignPresetFromSlots,
  brandDesignSnapshotPreset,
  brandDesignValuesFromSlots,
} from '../shared/brandDesignValues'
import { BRAND_DNA_DIMENSION_IDS } from '../shared/brandDesignVocab'
import { isBrandMarkSvg } from '../shared/brandMarkSvg'

/**
 * DER WEG VON DEN GESPEICHERTEN WERTEN ZUM PRESET (Brand Design D8, §2.8).
 *
 * ── DIE WERTE ENTSTEHEN HIER MIT DEN SCHREIBERN DES PRODUKTS ─────────────
 * Kein handgetippter Slot-Wert: jeder wird mit derselben `*SlotValue`-Funktion
 * gebaut, die auch die Werkstatt schreibt. Damit prüft dieser Test wirklich
 * den RUNDWEG (schreiben → lesen → rechnen) und nicht die Fähigkeit des
 * Testautors, ein Format nachzubauen — genau der Fehler, den ein solcher Test
 * sonst nie findet.
 */

const LOCALE = 'de'
const TITLE = 'Kailua Coffee Co.'
const BASE = '#4a3123'
const ACCENT = '#2f4a3a'
const NEUTRAL = 'warm'
const PRINCIPLE = 'closeup'

const DNA: Record<string, string> = {
  style: 'editorial',
  era: 'craft',
  form: 'soft',
  typography: 'bookish',
  color: 'earthy',
  imagery: 'craftClose',
  composition: 'calm',
  materiality: 'paper',
  motion: 'calmMotion',
  mood: 'warm',
}

const BRIEF = {
  character: 'Ruhig und handwerklich.',
  formLanguage: 'Weich gerundete Ecken, offene Punzen.',
  noGos: 'Keine Bohne, keine Tasse, kein Verlauf.',
  places: 'Tüte, Tafel, Website-Kopf.',
  ...brandMarkDerivedBriefFields(brandMarkInitial(TITLE), LOCALE),
}

/** Genau die Zeichenketten, die in `brand_steps.slots` stehen würden. */
function slotValues(): Record<string, string> {
  return {
    'g.mix': brandDnaMixSlotValue(
      BRAND_DNA_DIMENSION_IDS.map(dimension => ({
        dimension,
        value: DNA[dimension]!,
        board: 'proposed',
        origin: 'foundation' as const,
      })),
      LOCALE,
    ),
    'h.base': BASE,
    'h.neutral': NEUTRAL,
    'h.accent': ACCENT,
    'h.roles': brandColorRolesSlotValue(brandColorRoles(BASE, ACCENT, NEUTRAL) ?? [], LOCALE),
    'i.pair': 'editorial',
    'i.scale': 'calm',
    'i.rules': brandTypeRulesSlotValue(BRAND_TYPE_DEFAULT_RULES, LOCALE),
    'j.kind': 'word',
    'j.brief': brandMarkBriefSlotValue(BRIEF, LOCALE),
    'k.photo': brandImageryPrincipleSlotValue(PRINCIPLE, LOCALE),
    'k.illustration': 'line',
    'k.icons': 'regular',
    'k.dodont': brandImageryDoDontSlotValue(brandImageryDoDont(PRINCIPLE, 'line', 'regular', LOCALE)),
    'l.tempo': 'calm',
    'l.logo': 'no',
    'l.rules': brandMotionRulesSlotValue(brandMotionRules('calm', 'no', LOCALE)),
  }
}

const SOURCE = { title: TITLE, contentLocale: LOCALE, values: slotValues() }

describe('brandDesignValuesFromSlots — der Rückweg der sechs Kapitel', () => {
  it('liest jeden Slot, den das Preset braucht', () => {
    // Die Liste ist eine ZUSAGE: wer einen Slot dazu erfindet, ohne ihn hier
    // einzutragen, merkt es sonst erst, wenn ein Kapitel 10 leer bleibt.
    expect(Object.keys(SOURCE.values).sort()).toEqual([...BRAND_DESIGN_PRESET_SLOTS].sort())
  })

  it('macht aus den zehn Mix-Zeilen wieder die zehn Dimensionen', () => {
    const values = brandDesignValuesFromSlots(SOURCE)
    expect(values.dna).toEqual(DNA)
  })

  it('reicht Farben, Paar, Hierarchie, Richtung und Tempo unverändert durch', () => {
    const values = brandDesignValuesFromSlots(SOURCE)
    expect(values.base).toBe(BASE)
    expect(values.accent).toBe(ACCENT)
    expect(values.neutral).toBe(NEUTRAL)
    expect(values.pair).toBe('editorial')
    expect(values.scale).toBe('calm')
    expect(values.markKind).toBe('word')
    expect(values.tempo).toBe('calm')
    expect(values.logoMotion).toBe('no')
  })

  it('RECHNET die Setzungen, statt sie zu lesen (`j.examples` trägt kein SVG)', () => {
    const values = brandDesignValuesFromSlots(SOURCE)
    // Acht: vier Varianten, je Wortmarke und Monogramm.
    expect(values.markExamples).toHaveLength(8)
    expect(values.markExamples!.every(isBrandMarkSvg)).toBe(true)
    // Sie hängen an Paar UND Farbwelt — ein anderes Paar ergibt andere SVG.
    const other = brandDesignValuesFromSlots({
      ...SOURCE,
      values: { ...SOURCE.values, 'i.pair': 'geometric' },
    })
    expect(other.markExamples).not.toEqual(values.markExamples)
  })

  it('lässt ein unlesbares Feld weg, statt es zu raten', () => {
    const values = brandDesignValuesFromSlots({
      ...SOURCE,
      values: { ...SOURCE.values, 'k.dodont': 'irgendein Satz ohne Paar' },
    })
    expect(values.dodont).toBeUndefined()
    // Der Rest steht trotzdem — fail-soft, nicht fail-alles.
    expect(values.tempo).toBe('calm')
  })
})

describe('brandDesignPresetFromSlots — dieselbe Regel wie in der Werkstatt', () => {
  it('baut ein vollständiges Preset', () => {
    const preset = brandDesignPresetFromSlots(SOURCE)!
    expect(preset).not.toBeNull()
    expect(preset.version).toBe(BRAND_DESIGN_PRESET_VERSION)
    expect(preset.color.base).toBe(BASE)
    expect(Object.keys(preset.color.rampLight)).toHaveLength(11)
    expect(preset.color.roles).toHaveLength(5)
    expect(preset.color.contrastPairs).toHaveLength(6)
    expect(preset.type.rules.length).toBeGreaterThan(0)
    expect(preset.mark.brief.length).toBe(6)
    expect(preset.imagery.principles.length).toBe(5)
    expect(preset.motion.transitions.map(token => token.durationMs)).toEqual([120, 240, 384, 60])
  })

  it('tönt die Neutral-Rampe über dieselbe Quelle wie die Bühne', () => {
    const preset = brandDesignPresetFromSlots(SOURCE)!
    expect(brandNeutralSource(NEUTRAL, BASE)).not.toBe(BASE)
    // Warm getönt heisst: die Rampe kommt NICHT aus der Basisfarbe.
    const untinted = brandDesignPresetFromSlots({
      ...SOURCE,
      values: { ...SOURCE.values, 'h.neutral': 'tinted' },
    })!
    expect(preset.color.neutral).not.toEqual(untinted.color.neutral)
  })

  it('ist `null`, sobald etwas Tragendes fehlt', () => {
    for (const slotId of ['g.mix', 'h.base', 'h.accent', 'i.pair', 'i.scale', 'j.kind', 'l.tempo']) {
      const values = Object.fromEntries(
        Object.entries(SOURCE.values).filter(([key]) => key !== slotId),
      )
      expect(brandDesignPresetFromSlots({ ...SOURCE, values }), slotId).toBeNull()
    }
  })

  it('trägt die behaltenen Entwürfe — aber NIE im Snapshot (§1.11 b)', () => {
    const preset = brandDesignPresetFromSlots({ ...SOURCE, keptDrafts: ['draft-a', 'draft-b'] })!
    expect(preset.mark.keptDrafts).toEqual(['draft-a', 'draft-b'])

    const frozen = brandDesignSnapshotPreset(preset)
    expect('keptDrafts' in frozen.mark).toBe(false)
    expect(JSON.stringify(frozen)).not.toContain('draft-a')
    // Alles andere reist WÖRTLICH mit — das Abbild ist dasselbe Preset.
    expect(frozen.color).toEqual(preset.color)
    expect(frozen.mark.examples).toEqual(preset.mark.examples)
  })
})

describe('isBrandMarkSvg — der Riegel vor `v-html`', () => {
  it('nimmt eine echte Setzung an', () => {
    const preset = brandDesignPresetFromSlots(SOURCE)!
    expect(preset.mark.examples.every(isBrandMarkSvg)).toBe(true)
  })

  it('weist alles ab, was keine Setzung ist', () => {
    for (const value of [
      '',
      'Kailua',
      '<img src=x onerror=alert(1)>',
      '<svg><script>alert(1)</script></svg>',
      '<svg viewBox="0 0 1 1">',
    ]) {
      expect(isBrandMarkSvg(value), value).toBe(false)
    }
  })
})
