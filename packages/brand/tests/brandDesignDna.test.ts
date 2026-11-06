import { describe, expect, it } from 'vitest'
import {
  BRAND_DNA_CALM_ORDER,
  type BrandDnaProposalEntry,
  brandDnaBoardDifferences,
  brandDnaBoards,
  brandDnaBoardsSlotValue,
  brandDnaMixDefault,
  brandDnaMixEntries,
  brandDnaMixSlotValue,
  brandDnaResuggest,
  brandDnaSlotValue,
  brandDnaValueIdFromLabel,
  brandDnaValuesOf,
  brandFontPairForDnaTypography,
  clampBrandDnaProposal,
  parseBrandDnaMixSlotValue,
  parseBrandDnaSlotValue,
  validateBrandDnaCalmOrder,
} from '../shared/brandDesignDna'
import { brandDesignDefaultsFromDna } from '../shared/brandDesign'
import {
  BRAND_DNA_BOARD_KINDS,
  BRAND_DNA_DIMENSION_IDS,
  BRAND_DNA_ORIGIN_TERMS,
  isBrandDnaValue,
} from '../shared/brandDesignVocab'
import { BRAND_FONT_PAIRS } from '../shared/brandFontPairs'
import { brandDirectionById } from '../shared/brandDirections'
import { brandSlotValueMatchesFormat } from '../shared/brandSlotFormat'

/**
 * DER DNA-VORSCHLAG, DIE DREI BOARDS UND DER MIX (Brand Design D2c, §2.2
 * Schritte 4–5).
 *
 * ── WAS HIER WIRKLICH GEPRÜFT WIRD ────────────────────────────────────────
 * Drei Zusagen, die kein Modell und keine Oberfläche einlösen kann:
 *  1. Die KLEMMUNG lässt nur Vokabular-Ids durch und macht aus einer Zeile
 *     ohne Foundation-Bezug keine Zeile mit Vorbild-Herkunft (§2.2 Leitplanke
 *     b/e).
 *  2. Die BOARDS sind eine pure, deterministische Rechnung — und zwar genau
 *     die, die der abgenommene Prototyp auf dem Bildschirm hatte.
 *  3. Der SLOT-WERT geht hin UND zurück: er ist gleichzeitig das, was im
 *     Handbuch steht, und die einzige Quelle, aus der D3–D7 ihre Vorbelegung
 *     lesen.
 *
 * Die Beispielbelegung ist die abgenommene von Kailua Coffee Co. (Prototyp
 * `DS_DNA_PROPOSAL`) — erfundene Werte gibt es hier bewusst nicht.
 */

/** Die zehn Werte aus `DS_DNA_PROPOSAL`, wörtlich. */
const KAILUA: Record<string, string> = {
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

const PROPOSAL: BrandDnaProposalEntry[] = BRAND_DNA_DIMENSION_IDS.map(dimension => ({
  dimension,
  value: KAILUA[dimension]!,
  origin: dimension === 'color' ? 'both' : 'foundation',
  reason: `Begründung für ${dimension} aus der Foundation.`,
  ...(dimension === 'color' ? { inspirationReason: 'Vorbild 1 bestätigt die Erdtöne.' } : {}),
}))

function rawEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    dimension: 'style',
    value: 'editorial',
    origin: 'foundation',
    reason: 'Weil die Foundation es sagt.',
    ...overrides,
  }
}

describe('Vokabular-Achsen (BRAND_DNA_CALM_ORDER)', () => {
  it('trägt für jede Dimension genau ihre fünf Werte', () => {
    expect(validateBrandDnaCalmOrder()).toEqual([])
  })

  /* GEGENPROBE: die Prüfung muss an einer mutierten Tabelle scheitern —
   * sonst ist sie immer grün und beweist nichts. */
  it('GEGENPROBE: eine erfundene Wert-Id, eine fehlende Achse und eine fremde Dimension fallen auf', () => {
    const broken = { ...BRAND_DNA_CALM_ORDER, style: ['minimal', 'erfunden'], extra: ['x'] }
    delete (broken as Record<string, unknown>).mood
    const problems = validateBrandDnaCalmOrder(broken)
    expect(problems.some(line => line.includes('erfunden'))).toBe(true)
    expect(problems.some(line => line.includes('mood'))).toBe(true)
    expect(problems.some(line => line.includes('extra'))).toBe(true)
  })
})

describe('clampBrandDnaProposal (§2.2 Schritt 4)', () => {
  it('nimmt zehn gültige Zeilen und gibt sie in Katalog-Reihenfolge zurück', () => {
    const raw = { dna: [...PROPOSAL].reverse() }
    const { entries, missing } = clampBrandDnaProposal(raw, true)
    expect(missing).toEqual([])
    expect(entries.map(entry => entry.dimension)).toEqual([...BRAND_DNA_DIMENSION_IDS])
    for (const entry of entries) expect(isBrandDnaValue(entry.dimension, entry.value)).toBe(true)
  })

  it('wirft erfundene Dimensionen und erfundene Werte weg und meldet sie als fehlend', () => {
    const { entries, missing } = clampBrandDnaProposal({
      dna: [
        rawEntry(),
        rawEntry({ dimension: 'erfunden', value: 'egal' }),
        rawEntry({ dimension: 'era', value: 'steampunk' }),
      ],
    }, false)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.dimension).toBe('style')
    expect(missing).toContain('era')
    expect(missing).not.toContain('style')
  })

  it('wirft eine Zeile ohne Begründung weg — eine Ableitung ohne Foundation-Bezug ist keine', () => {
    const { entries, missing } = clampBrandDnaProposal({ dna: [rawEntry({ reason: '   ' })] }, true)
    expect(entries).toHaveLength(0)
    expect(missing).toContain('style')
  })

  it('macht aus `inspiration` immer `both` — die Foundation bleibt der Massstab', () => {
    const { entries } = clampBrandDnaProposal({
      dna: [rawEntry({ origin: 'inspiration', inspirationReason: 'Wie in Vorbild 2.' })],
    }, true)
    expect(entries[0]!.origin).toBe('both')
    expect(entries[0]!.inspirationReason).toBe('Wie in Vorbild 2.')
  })

  it('stuft `both` ohne Vorbild-Satz auf `foundation` ab', () => {
    const { entries } = clampBrandDnaProposal({ dna: [rawEntry({ origin: 'both' })] }, true)
    expect(entries[0]!.origin).toBe('foundation')
    expect(entries[0]!.inspirationReason).toBeUndefined()
  })

  it('zieht auf dem Weg OHNE Vorbilder jede Zeile auf `foundation` und wirft den Vorbild-Satz weg', () => {
    const { entries } = clampBrandDnaProposal({
      dna: [rawEntry({ origin: 'both', inspirationReason: 'Wie in Vorbild 2.' })],
    }, false)
    expect(entries[0]!.origin).toBe('foundation')
    expect(entries[0]!.inspirationReason).toBeUndefined()
  })

  it('nimmt je Dimension die ERSTE brauchbare Zeile — eine zweite ist ein Widerspruch', () => {
    const { entries } = clampBrandDnaProposal({
      dna: [rawEntry(), rawEntry({ value: 'playful', reason: 'Zweite Meinung.' })],
    }, false)
    expect(entries[0]!.value).toBe('editorial')
  })

  it('klemmt die Längen und ersetzt das Trennzeichen des Slot-Wertes', () => {
    const { entries } = clampBrandDnaProposal({
      dna: [rawEntry({ reason: `A · B${'x'.repeat(900)}` })],
    }, false)
    expect(entries[0]!.reason.includes('·')).toBe(false)
    expect(entries[0]!.reason.length).toBeLessThanOrEqual(420)
  })

  it('überlebt Unsinn statt zu werfen', () => {
    expect(clampBrandDnaProposal(null, true).entries).toEqual([])
    expect(clampBrandDnaProposal({ dna: 'nein' }, true).missing).toHaveLength(10)
    expect(clampBrandDnaProposal({ dna: [null, 7, 'x'] }, true).entries).toEqual([])
  })
})

describe('Der Slot-Wert von `g.dna` — hin und zurück', () => {
  it('schreibt die Form des Layers und liest sie in beiden Sprachen zurück', () => {
    for (const locale of ['de', 'en']) {
      const value = brandDnaSlotValue(PROPOSAL, locale)
      expect(brandSlotValueMatchesFormat('structured', value)).toBe(true)
      expect(parseBrandDnaSlotValue(value)).toEqual(PROPOSAL)
    }
  })

  it('liest einen DEUTSCHEN Wert auch dann, wenn der Leser englisch denkt', () => {
    // Der Slot-Wert steht in der Inhaltssprache der Marke; der Leser kennt sie
    // nicht (s. Kopf von `brandDesignDna.ts`).
    const entries = parseBrandDnaSlotValue(brandDnaSlotValue(PROPOSAL, 'de'))
    expect(entries?.map(entry => entry.value)).toEqual(BRAND_DNA_DIMENSION_IDS.map(id => KAILUA[id]))
  })

  it('gibt `null` bei einem Wert, der nicht passt — nie eine halbe DNA', () => {
    expect(parseBrandDnaSlotValue('einfach nur Text')).toBeNull()
    expect(parseBrandDnaSlotValue('## Visueller Stil\nRedaktionell · Aus eurer Foundation · Grund')).toBeNull()
    const broken = brandDnaSlotValue(PROPOSAL, 'de').replace('Redaktionell', 'Erfunden')
    expect(parseBrandDnaSlotValue(broken)).toBeNull()
  })

  it('findet die Wert-Id über beide Sprachen, aber nicht über eine erfundene', () => {
    expect(brandDnaValueIdFromLabel('style', 'Redaktionell')).toBe('editorial')
    expect(brandDnaValueIdFromLabel('style', 'Editorial')).toBe('editorial')
    expect(brandDnaValueIdFromLabel('style', 'Quatsch')).toBe('')
    // Gesucht wird das ETIKETT, nicht die Id: `geometricType` heisst
    // „Geometrische Grotesk" bzw. „Geometric sans" und ist über seine rohe Id
    // ausdrücklich NICHT zu finden.
    expect(brandDnaValueIdFromLabel('typography', 'geometricType')).toBe('')
    expect(brandDnaValueIdFromLabel('typography', 'Geometric sans')).toBe('geometricType')
  })

  it('kennt für jede Herkunft eine Lesefassung in beiden Sprachen', () => {
    expect(BRAND_DNA_ORIGIN_TERMS).toHaveLength(3)
    for (const term of BRAND_DNA_ORIGIN_TERMS) {
      expect(term.de.trim().length).toBeGreaterThan(0)
      expect(term.en.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('brandDnaBoards (§2.2 `g.boards`, PURE Regel ohne Modell)', () => {
  const boards = brandDnaBoards(KAILUA, 'warm-editorial')

  it('liefert genau drei Boards mit den Ids des Katalogs', () => {
    expect(boards.map(board => board.id)).toEqual(BRAND_DNA_BOARD_KINDS.map(kind => kind.id))
  })

  it('ist deterministisch — zweimal gerechnet ist zweimal dasselbe', () => {
    expect(brandDnaBoards(KAILUA, 'warm-editorial')).toEqual(boards)
  })

  it('belegt in jedem Board alle zehn Dimensionen mit gültigen Werten', () => {
    for (const board of boards) {
      for (const dimension of BRAND_DNA_DIMENSION_IDS) {
        expect(isBrandDnaValue(dimension, board.values[dimension] ?? '')).toBe(true)
      }
    }
  })

  it('unterscheidet die zwei Varianten in vier bis sechs Dimensionen vom Vorschlag', () => {
    for (const board of boards.slice(1)) {
      const differences = brandDnaBoardDifferences(boards, board.id)
      expect(differences.length).toBeGreaterThanOrEqual(4)
      expect(differences.length).toBeLessThanOrEqual(6)
    }
    expect(brandDnaBoardDifferences(boards, 'proposed')).toEqual([])
  })

  /**
   * DIE PROBE AUFS EXEMPEL: auf die abgenommene Kailua-Belegung angewandt
   * ergibt die Achsen-Regel wörtlich die zwei Varianten aus `DS_BOARDS` des
   * freigegebenen Prototyps. Das ist der Grund, warum die Achsen so stehen —
   * und der Test, der es festnagelt.
   */
  it('reproduziert die abgenommenen Prototyp-Boards', () => {
    expect(boards[1]!.values).toEqual({
      ...KAILUA,
      style: 'minimal',
      typography: 'humanist',
      color: 'monochrome',
      materiality: 'smooth',
      mood: 'focused',
    })
    expect(boards[2]!.values).toEqual({
      ...KAILUA,
      era: 'print90',
      form: 'mixed',
      typography: 'contrast',
      composition: 'dense',
      mood: 'confident',
    })
  })

  it('bewegt eine Dimension auch dann, wenn der Vorschlag schon am Ende der Achse steht', () => {
    const alreadyCalm = { ...KAILUA, style: 'minimal', mood: 'focused' }
    const shifted = brandDnaBoards(alreadyCalm, 'warm-editorial')
    expect(shifted[1]!.values.style).not.toBe('minimal')
    expect(shifted[1]!.values.mood).not.toBe('focused')
    expect(brandDnaBoardDifferences(shifted, 'calmer')).toHaveLength(5)
  })

  it('nimmt die Farbwelt der gewählten Richtung und verteilt nur ihre Rollen', () => {
    const gradient = brandDirectionById('warm-editorial')!.gradient
    expect(boards[0]!.base).toBe(gradient[2])
    expect(boards[0]!.accent).toBe(gradient[1])
    // ruhiger = ein Ton (monochrom), mutiger = der Mittelton trägt die Fläche
    expect(boards[1]!.base).toBe(boards[1]!.accent)
    expect(boards[2]!.base).toBe(gradient[1])
    expect(boards[2]!.accent).toBe(gradient[2])
  })

  it('fällt bei unbekannter Richtung auf die erste des Katalogs zurück statt leer zu bleiben', () => {
    const orphan = brandDnaBoards(KAILUA, 'gibt-es-nicht')
    expect(orphan[0]!.base).toBe(brandDirectionById('warm-editorial')!.gradient[2])
  })

  it('leitet das Schriftpaar aus dem Typografie-Charakter ab', () => {
    expect(boards[0]!.fontPairId).toBe('editorial')
    expect(boards[1]!.fontPairId).toBe('humanist')
    expect(boards[2]!.fontPairId).toBe('contrast')
    // Jedes Paar existiert im Katalog — sonst zeigte die Szene den Systemstack.
    for (const board of boards) {
      expect(BRAND_FONT_PAIRS.some(pair => pair.id === board.fontPairId)).toBe(true)
    }
    expect(brandFontPairForDnaTypography('gibt-es-nicht')).toBe(BRAND_FONT_PAIRS[0]!.id)
  })

  it('schreibt einen abnehmbaren Slot-Wert mit drei Blöcken', () => {
    const value = brandDnaBoardsSlotValue(boards, 'de')
    expect(brandSlotValueMatchesFormat('structured', value)).toBe(true)
    expect(value.split('\n\n')).toHaveLength(3)
  })
})

describe('Mix & Match (§2.2 `g.mix`)', () => {
  const boards = brandDnaBoards(KAILUA, 'warm-editorial')

  it('beginnt mit allem aus dem gewählten Board', () => {
    const sources = brandDnaMixDefault('bolder')
    expect(Object.keys(sources)).toEqual([...BRAND_DNA_DIMENSION_IDS])
    expect(new Set(Object.values(sources))).toEqual(new Set(['bolder']))
  })

  it('rückt beim Neu-Vorschlagen jede offene Dimension EIN Board weiter — festgehaltene nie', () => {
    const sources = brandDnaMixDefault('proposed')
    const held = { color: true, typography: true }
    const next = brandDnaResuggest(sources, held, boards)
    expect(next.color).toBe('proposed')
    expect(next.typography).toBe('proposed')
    expect(next.style).toBe('calmer')
    // Deterministisch und im Kreis: dreimal klicken ist wieder der Anfang.
    const round = brandDnaResuggest(brandDnaResuggest(next, held, boards), held, boards)
    expect(round.style).toBe('proposed')
  })

  it('mischt die Werte der gewählten Boards und übernimmt die Herkunft des Vorschlags', () => {
    const sources = { ...brandDnaMixDefault('proposed'), typography: 'bolder' }
    const entries = brandDnaMixEntries(boards, sources, PROPOSAL)
    expect(entries).toHaveLength(10)
    const typography = entries.find(entry => entry.dimension === 'typography')!
    expect(typography.value).toBe('contrast')
    expect(typography.board).toBe('bolder')
    // Abweichung vom Vorschlag ⇒ Foundation: die Boards sind pure Varianten
    // DERSELBEN Ableitung, ein Vorbild-Bezug wäre dort falsch.
    expect(typography.origin).toBe('foundation')
    const color = entries.find(entry => entry.dimension === 'color')!
    expect(color.origin).toBe('both')
  })

  it('schreibt und liest den Slot-Wert in beiden Sprachen zurück', () => {
    const sources = { ...brandDnaMixDefault('proposed'), color: 'calmer' }
    const entries = brandDnaMixEntries(boards, sources, PROPOSAL)
    for (const locale of ['de', 'en']) {
      const value = brandDnaMixSlotValue(entries, locale)
      expect(brandSlotValueMatchesFormat('structured', value)).toBe(true)
      expect(parseBrandDnaMixSlotValue(value)).toEqual(entries)
    }
  })

  it('gibt `null` zurück, wenn der Wert nicht passt — D3–D7 lesen hier ihre Vorbelegung', () => {
    expect(parseBrandDnaMixSlotValue('## Nur ein Block\nirgendwas')).toBeNull()
    expect(parseBrandDnaMixSlotValue('freier Text')).toBeNull()
  })

  it('ergibt eine vollständige Belegung für `buildBrandDesign`', () => {
    const entries = brandDnaMixEntries(boards, brandDnaMixDefault('calmer'), PROPOSAL)
    const values = brandDnaValuesOf(entries)
    expect(Object.keys(values).sort()).toEqual([...BRAND_DNA_DIMENSION_IDS].sort())
  })
})

describe('brandDesignDefaultsFromDna (H5: jede Session als Bestätigung durchlaufbar)', () => {
  it('belegt aus der Kailua-DNA Paar, Hierarchie, Zeichen, Bildsprache und Tempo vor', () => {
    const defaults = brandDesignDefaultsFromDna(KAILUA)
    expect(defaults.pair).toBe('editorial')
    expect(defaults.scale).toBe('calm')
    expect(defaults.markKind).toBe('word')
    expect(defaults.icons).toBe('regular')
    expect(defaults.tempo).toBe('calm')
    expect(defaults.logoMotion).toBe('no')
    expect(defaults.neutral).toBe('warm')
    expect(defaults.illustration).toBe('line')
  })

  it('schlägt für JEDE gültige Belegung etwas vor, das die Kataloge kennen', () => {
    for (const dimension of BRAND_DNA_DIMENSION_IDS) {
      for (const value of ['minimal', 'playful', 'vivid', 'dense', 'contrast', 'springy']) {
        if (!isBrandDnaValue(dimension, value)) continue
        const defaults = brandDesignDefaultsFromDna({ ...KAILUA, [dimension]: value })
        expect(defaults.pair && BRAND_FONT_PAIRS.some(pair => pair.id === defaults.pair)).toBe(true)
        expect(defaults.tempo).toBeTruthy()
      }
    }
  })

  it('gibt für eine fehlende DNA nichts zurück statt etwas zu raten', () => {
    expect(brandDesignDefaultsFromDna(undefined)).toEqual({})
    expect(brandDesignDefaultsFromDna({ style: 'erfunden' })).toEqual({ pair: 'editorial' })
  })
})
