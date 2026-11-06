import { describe, expect, it } from 'vitest'
import { brandMotionTransitions, buildBrandDesign } from '../shared/brandDesign'
import {
  BRAND_LOGO_MOTION_BUILD_MS,
  BRAND_MOTION_TOKEN_USAGE,
  brandMotionDefaults,
  brandMotionDuration,
  brandMotionDurationText,
  brandMotionRules,
  brandMotionRulesSlotValue,
  brandMotionScene,
  brandMotionTempoFromTransitions,
  brandMotionTokenLabel,
  brandMotionTokens,
  brandMotionTransitionsSlotValue,
  brandTempoOrFirst,
  isBrandLogoMotion,
  isBrandTempo,
  parseBrandMotionRulesSlotValue,
  parseBrandMotionTransitionsSlotValue,
  validateBrandMotionRules,
} from '../shared/brandDesignMotion'
import {
  BRAND_LOGO_MOTION_OPTIONS,
  BRAND_MOTION_STAGGER_MS,
  BRAND_MOTION_TOKENS,
  BRAND_TEMPO_OPTIONS,
} from '../shared/brandDesignVocab'
import { BRAND_STAGE_SOURCE_SLOTS } from '../shared/brandSessions'
import { SESSION_CONTENT } from '../shared/sessionContent'
import { slotById } from '../shared/slotRegistry'
import type { BrandDesignValues } from '../shared/types/brand'

/**
 * DIE BEWEGUNG ALS PURE REGEL (Konzept §2.7, Paket D7).
 *
 * ── WAS HIER WIRKLICH GEPRÜFT WIRD ────────────────────────────────────────
 * Nicht das Vokabular (`brandDesign.test.ts` prüft es als Ganzes) und nicht
 * das Preset im Ganzen. Geprüft wird, was D7 dazwischen legt: dass Tempo und
 * kinetisches Zeichen aus der DNA kommen, dass die Tokens dieselbe Rechnung
 * sind wie im Preset, dass beide Slot-Werte den Rundlauf überstehen, dass die
 * sechs Regeln aus den zwei Entscheidungen FOLGEN — und dass der
 * `reduced-motion`-Satz immer dabei ist.
 *
 * Die Beispielwerte sind die von Kailua Coffee Co. (dieselbe DNA wie in D5/D6):
 * Bewegungs-Charakter `calmMotion`, also Tempo „ruhig" (240 ms) und ein
 * stillstehendes Zeichen.
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

describe('das Tempo (`l.tempo`)', () => {
  it('folgt der DNA-Dimension „Bewegungs-Charakter"', () => {
    expect(brandMotionDefaults(KAILUA_DNA)).toEqual({ tempo: 'calm', logo: 'no' })
    expect(brandMotionDefaults({ ...KAILUA_DNA, motion: 'springy' })).toEqual({ tempo: 'lively', logo: 'yes' })
    expect(brandMotionDefaults({ ...KAILUA_DNA, motion: 'precise' })).toEqual({ tempo: 'snappy', logo: 'no' })
    expect(brandMotionDefaults({ ...KAILUA_DNA, motion: 'playfulMotion' })).toEqual({ tempo: 'lively', logo: 'yes' })
    expect(brandMotionDefaults({ ...KAILUA_DNA, motion: 'none' })).toEqual({ tempo: 'calm', logo: 'no' })
  })

  it('fällt ohne DNA und bei erfundenem Charakter auf „ruhig" und „steht still" zurück', () => {
    expect(brandMotionDefaults(undefined)).toEqual({ tempo: 'calm', logo: 'no' })
    expect(brandMotionDefaults({ motion: 'erfunden' })).toEqual({ tempo: 'calm', logo: 'no' })
  })

  it('kennt genau die drei Ids des Katalogs', () => {
    expect(BRAND_TEMPO_OPTIONS.map(option => option.id)).toEqual(['calm', 'lively', 'snappy'])
    expect(isBrandTempo('calm')).toBe(true)
    expect(isBrandTempo('zügig')).toBe(false)
    expect(brandTempoOrFirst('zügig').id).toBe('calm')
    expect(isBrandLogoMotion('yes')).toBe(true)
    expect(isBrandLogoMotion('vielleicht')).toBe(false)
  })

  /**
   * DIE INVARIANTE AN DER SESSION IST DIE ZWEITE HÄLFTE DES KATALOGS: ohne sie
   * stünde ein von Hand getipptes „mittelschnell" bestätigt im Slot, und
   * `buildBrandDesign` fände dafür weder Dauer noch Kurve.
   */
  it('die Session-Invarianten nennen dieselben Ids wie das Vokabular', () => {
    expect(SESSION_CONTENT['l.tempo']?.invariants)
      .toEqual([{ kind: 'oneOf', terms: BRAND_TEMPO_OPTIONS.map(option => option.id) }])
    expect(SESSION_CONTENT['l.logo']?.invariants)
      .toEqual([{ kind: 'oneOf', terms: BRAND_LOGO_MOTION_OPTIONS.map(option => option.id) }])
  })

  it('keine der vier Sessions trägt einen Entwurfs-Generator', () => {
    for (const slotId of ['l.tempo', 'l.transitions', 'l.logo', 'l.rules']) {
      expect(slotById(slotId)?.generator, slotId).toBe('none')
    }
  })
})

describe('die Übergänge (`l.transitions`)', () => {
  it('rechnen dieselben Zahlen wie das Preset — vier Tokens je Tempo', () => {
    const tokens = brandMotionTokens('calm', 'de')
    expect(tokens.map(token => token.id)).toEqual(['fast', 'base', 'slow', 'stagger'])
    expect(tokens.map(token => token.durationMs)).toEqual([120, 240, 384, BRAND_MOTION_STAGGER_MS])
    expect(tokens.map(token => token.label)).toEqual([
      'motion.fast', 'motion.base', 'motion.slow', 'motion.stagger',
    ])
    // Die Rechnung steht in D0 und wird hier NICHT nachgebaut (s. Kopf der
    // Regel-Datei): beide Wege müssen dieselben Zahlen zeigen.
    expect(tokens.map(token => token.durationMs))
      .toEqual(brandMotionTransitions('calm').map(token => token.durationMs))
    expect(brandMotionTokens('snappy', 'de').map(token => token.durationMs))
      .toEqual([60, 120, 192, BRAND_MOTION_STAGGER_MS])
    expect(brandMotionTokens('lively', 'de').map(token => token.durationMs))
      .toEqual([90, 180, 288, BRAND_MOTION_STAGGER_MS])
  })

  it('jedes Token sagt, wofür es da ist — in beiden Sprachen', () => {
    for (const locale of ['de', 'en']) {
      for (const token of brandMotionTokens('calm', locale)) {
        expect(token.usage.length, `${token.id}/${locale}`).toBeGreaterThan(0)
        expect(token.easing).toBe(brandTempoOrFirst('calm').easing)
      }
    }
    expect(brandMotionTokens('calm', 'en')[0]!.usage).toBe(BRAND_MOTION_TOKEN_USAGE.fast!.en)
    expect(brandMotionTokens('calm', 'de')[0]!.usage).toBe(BRAND_MOTION_TOKEN_USAGE.fast!.de)
  })

  it('ein unbekanntes Tempo ergibt keine Tabelle aus Notwerten', () => {
    expect(brandMotionTokens('zügig', 'de')).toEqual([])
    expect(brandMotionTransitionsSlotValue('zügig', 'de')).toBe('')
    expect(brandMotionDuration('zügig', 'base')).toBe(0)
    expect(brandMotionDuration('calm', 'gibtsnicht')).toBe(0)
  })

  it('schreibt vier Blöcke und liest das Tempo wieder heraus — in beiden Sprachen', () => {
    for (const locale of ['de', 'en']) {
      for (const option of BRAND_TEMPO_OPTIONS) {
        const value = brandMotionTransitionsSlotValue(option.id, locale)
        expect(value.split('\n\n')).toHaveLength(4)
        expect(value).toContain(`## ${brandMotionTokenLabel('base')}`)
        const tokens = parseBrandMotionTransitionsSlotValue(value)!
        expect(tokens.map(token => token.durationMs))
          .toEqual(brandMotionTransitions(option.id).map(token => token.durationMs))
        expect(brandMotionTempoFromTransitions(value)).toBe(option.id)
      }
    }
  })

  it('gibt für Unsinn nichts zurück, statt zu raten', () => {
    expect(parseBrandMotionTransitionsSlotValue('240 ms, schnell genug')).toBeNull()
    expect(parseBrandMotionTransitionsSlotValue('## dauer.schnell\n120 ms · linear')).toBeNull()
    expect(parseBrandMotionTransitionsSlotValue('## motion.fast\nkurz · linear')).toBeNull()
    expect(brandMotionTempoFromTransitions('## motion.fast\n121 ms · linear · Hover')).toBeNull()
  })

  /**
   * EINE VON HAND KORRIGIERTE DAUER IST KEIN TEMPO MEHR — genau das
   * Anti-Muster von `l.transitions` („a duration corrected by hand, which the
   * next recalculation would drop"). Der Rückweg sagt dann `null` statt das
   * nächstliegende Tempo zu raten.
   */
  it('erkennt eine von Hand veränderte Dauer', () => {
    const value = brandMotionTransitionsSlotValue('calm', 'de').replace('384 ms', '400 ms')
    expect(parseBrandMotionTransitionsSlotValue(value)).not.toBeNull()
    expect(brandMotionTempoFromTransitions(value)).toBeNull()
  })

  it('die Szene spielt mit denselben Werten wie die Tabelle', () => {
    expect(brandMotionScene('calm')).toEqual({
      duration: 240,
      easing: brandTempoOrFirst('calm').easing,
      stagger: BRAND_MOTION_STAGGER_MS,
    })
    expect(brandMotionScene('snappy').duration).toBe(brandMotionDuration('snappy', 'base'))
    // Ein unbekanntes Tempo hält die Szene an der Katalog-Vorgabe, nicht bei 0.
    expect(brandMotionScene('zügig').duration).toBe(240)
    expect(brandMotionDurationText(383.6)).toBe('384 ms')
  })
})

describe('die Bewegungs-Regeln (`l.rules`)', () => {
  it('sind sechs Zeilen und folgen aus Tempo und Zeichen', () => {
    const rules = brandMotionRules('calm', 'no', 'de')
    expect(rules).toHaveLength(6)
    expect(rules[2]).toContain('federt nie')
    expect(rules[3]).toContain('steht still')
    expect(rules[4]).toContain('384 ms')
    const lively = brandMotionRules('lively', 'yes', 'de')
    expect(lively[2]).toContain('Überschwingen')
    expect(lively[3]).toContain(brandMotionDurationText(BRAND_LOGO_MOTION_BUILD_MS))
    expect(lively[4]).toContain('288 ms')
  })

  /**
   * DER DECKEL IST GERECHNET, NICHT GESETZT: er ist `motion.slow` DIESES
   * Tempos — ein fester Wert wäre beim knappen Tempo doppelt so gross wie der
   * langsamste eigene Token.
   */
  it('der Dauer-Deckel ist das eigene `motion.slow`', () => {
    for (const option of BRAND_TEMPO_OPTIONS) {
      const cap = brandMotionDurationText(brandMotionDuration(option.id, 'slow'))
      expect(brandMotionRules(option.id, 'no', 'de')[4], option.id).toContain(cap)
    }
  })

  it('der Satz zu „weniger Bewegung" steht immer dabei — in beiden Sprachen', () => {
    for (const locale of ['de', 'en']) {
      for (const option of BRAND_TEMPO_OPTIONS) {
        for (const logo of BRAND_LOGO_MOTION_OPTIONS) {
          const rules = brandMotionRules(option.id, logo.id, locale)
          expect(rules, `${option.id}/${logo.id}/${locale}`).toHaveLength(6)
          const last = rules[5]!
          expect(last.length).toBeGreaterThan(0)
          expect(last).toMatch(locale === 'de' ? /Endzustand/ : /end state/)
          // KEINE Ersatz-Animation: das Anti-Muster steht wörtlich in
          // `sessionContent.ts` und muss auch im Satz stehen.
          expect(last).toMatch(locale === 'de' ? /Ersatz-Animation/ : /replacement animation/)
        }
      }
    }
  })

  it('eine unbekannte Wahl fällt auf den ruhigen, stillen Fall zurück', () => {
    const rules = brandMotionRules('zügig', 'vielleicht', 'de')
    expect(rules[2]).toBe(brandMotionRules('calm', 'no', 'de')[2])
    expect(rules[3]).toBe(brandMotionRules('calm', 'no', 'de')[3])
  })

  it('schreibt eine Liste und liest sie wieder heraus', () => {
    const rules = brandMotionRules('calm', 'no', 'de')
    const value = brandMotionRulesSlotValue(rules)
    expect(value.split('\n')).toHaveLength(6)
    expect(value.startsWith('- ')).toBe(true)
    expect(parseBrandMotionRulesSlotValue(value)).toEqual(rules)
    // Eine von Hand ergänzte Zeile bleibt eine Regel — `l.rules` ist
    // `stage-edit`, und ein Rückweg auf dem Katalog-Wortlaut machte jede
    // Verbesserung zum Formfehler.
    expect(parseBrandMotionRulesSlotValue(`${value}\n- Ladebalken bewegen sich nie rückwärts.`))
      .toHaveLength(7)
    expect(parseBrandMotionRulesSlotValue('')).toBeNull()
    expect(parseBrandMotionRulesSlotValue('Bewegung erklärt einen Zusammenhang.')).toBeNull()
  })
})

describe('die Invarianten des Kapitels', () => {
  it('der Katalog hält seine Zusagen', () => {
    expect(validateBrandMotionRules()).toEqual([])
  })

  /**
   * GEGENPROBE: die Prüfung muss an mutierten Fassungen ANSCHLAGEN — eine, die
   * nur die richtigen Listen kennt, ist immer grün.
   */
  it('… und sagt es, wenn sie gebrochen werden', () => {
    const [calm, lively, snappy] = BRAND_TEMPO_OPTIONS
    expect(validateBrandMotionRules([{ ...calm!, base: 900 }, lively!, snappy!]))
      .toContain('calm: Grunddauer ausserhalb 80…400 ms (900)')
    expect(validateBrandMotionRules([{ ...calm!, easing: 'ease-in-out' }, lively!, snappy!]))
      .toContain('calm: Easing ist keine cubic-bezier-Kurve (ease-in-out)')
    // Ein Tempo ohne eigene Kurven-Regel: die Liste zeigte dann den Satz eines
    // fremden Tempos.
    expect(validateBrandMotionRules([{ ...calm!, id: 'gemächlich' }, lively!, snappy!]))
      .toContain('Tempo ohne eigene Regel: gemächlich')
    expect(validateBrandMotionRules(BRAND_TEMPO_OPTIONS, [{ id: 'fast', factor: 0.5 }]))
      .toContain('Pflicht-Token fehlt: base')
    expect(validateBrandMotionRules(BRAND_TEMPO_OPTIONS, [...BRAND_MOTION_TOKENS, { id: 'crawl', factor: 4 }]))
      .toContain('Faktor ausserhalb 0…3: crawl = 4')
    expect(validateBrandMotionRules(BRAND_TEMPO_OPTIONS, BRAND_MOTION_TOKENS, 0))
      .toContain('Versatz ausserhalb 0…200 ms (0)')
  })

  it('die Bühne bekommt die ganze Marke aus den Kapiteln davor', () => {
    expect(BRAND_STAGE_SOURCE_SLOTS.motion).toEqual([
      'g.mix', 'h.base', 'h.neutral', 'h.accent', 'i.pair', 'i.rules', 'result.direction',
    ])
  })
})

describe('das Preset trägt die Bewegung (§2.8)', () => {
  const defaults = brandMotionDefaults(KAILUA_DNA)
  const values: BrandDesignValues = {
    dna: KAILUA_DNA,
    base: '#4a3123',
    neutral: 'warm',
    accent: '#22392f',
    pair: 'editorial',
    scale: 'calm',
    markKind: 'word',
    tempo: defaults.tempo,
    logoMotion: defaults.logo,
    motionRules: brandMotionRules(defaults.tempo, defaults.logo, 'de'),
  }

  it('nimmt Tempo, Tokens, Zeichen und Regeln auf', () => {
    const preset = buildBrandDesign(values)!
    expect(preset.motion.tempo).toBe('calm')
    expect(preset.motion.logo).toBe('no')
    expect(preset.motion.rules).toHaveLength(6)
    expect(preset.motion.transitions.map(token => token.durationMs)).toEqual([120, 240, 384, 60])
    expect(preset.motion.transitions[1]!.easing).toBe(brandTempoOrFirst('calm').easing)
  })

  it('ein erfundenes Tempo ergibt kein Preset', () => {
    // Ohne Tempo gibt es keine einzige Dauer — ein Preset mit leerem
    // Token-Satz wäre für Produkt 03 eine Bewegung, die es nicht gibt.
    expect(buildBrandDesign({ ...values, tempo: 'zügig' })).toBeNull()
    expect(buildBrandDesign({ ...values, tempo: undefined })).toBeNull()
  })

  it('eine Marke ohne aufgeschriebene Regeln bekommt trotzdem ihr Preset', () => {
    const preset = buildBrandDesign({ ...values, motionRules: undefined, logoMotion: undefined })!
    expect(preset.motion.rules).toEqual([])
    expect(preset.motion.logo).toBe('')
    expect(preset.motion.transitions).toHaveLength(4)
  })
})
