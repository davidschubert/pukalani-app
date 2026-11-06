import { describe, expect, it } from 'vitest'
import {
  BRAND_CHECK_CATEGORIES,
  BRAND_CHECK_CRITERIA,
  BRAND_CHECK_CRITERIA_PER_CATEGORY,
  BRAND_CHECK_SCORE_VERSION,
  type BrandCheckScores,
  brandCheckUrlKey,
  brandScoreBand,
  computeBrandCheck,
  pickBrandCheckFindings,
} from '../shared/brandCheck'

/**
 * DER KATALOG UND DIE RECHNUNG — die zwei Dinge, an denen ein Brand-Check
 * hängt und die man beim Nachschärfen des Wortlauts still kaputt macht.
 *
 * Die INVARIANTEN sind hier wichtiger als die Rechenbeispiele: vierzig
 * eindeutige Ids, fünf je Kategorie, Gewichte in der Summe 100. Verrutscht
 * eines davon, ist jeder Score falsch — und zwar plausibel falsch, also
 * unbemerkt.
 */

/** Alle Kriterien auf denselben Wert setzen — die Kurzform der Grenzfälle. */
function allScores(value: 0 | 1 | 2 | null): BrandCheckScores {
  const scores: BrandCheckScores = {}
  for (const criterion of BRAND_CHECK_CRITERIA) scores[criterion.id] = value
  return scores
}

describe('Brand-Check-Katalog', () => {
  it('hat 40 Kriterien mit eindeutigen Ids', () => {
    expect(BRAND_CHECK_CRITERIA).toHaveLength(40)
    expect(new Set(BRAND_CHECK_CRITERIA.map(entry => entry.id)).size).toBe(40)
  })

  it('hat 8 Kategorien mit zusammen 100 Gewichtspunkten', () => {
    expect(BRAND_CHECK_CATEGORIES).toHaveLength(8)
    expect(BRAND_CHECK_CATEGORIES.reduce((sum, entry) => sum + entry.weight, 0)).toBe(100)
  })

  it('hat genau fünf Kriterien je Kategorie', () => {
    for (const category of BRAND_CHECK_CATEGORIES) {
      const count = BRAND_CHECK_CRITERIA.filter(entry => entry.category === category.key).length
      expect(count, category.key).toBe(BRAND_CHECK_CRITERIA_PER_CATEGORY)
    }
  })

  it('kennt nur Kategorien aus der Kategorie-Liste', () => {
    const keys = new Set(BRAND_CHECK_CATEGORIES.map(entry => entry.key))
    for (const criterion of BRAND_CHECK_CRITERIA) {
      expect(keys.has(criterion.category), criterion.id).toBe(true)
    }
  })

  it('teilt sich in 16 gerechnete und 24 beurteilte Kriterien', () => {
    // Der Plan schreibt an einer Stelle „17 messbar, 23 beurteilt" —
    // massgeblich sind die M/K-Buchstaben an den Kriterien selbst.
    expect(BRAND_CHECK_CRITERIA.filter(entry => entry.kind === 'measured')).toHaveLength(16)
    expect(BRAND_CHECK_CRITERIA.filter(entry => entry.kind === 'judged')).toHaveLength(24)
  })

  it('gibt jedem Kriterium eine ausformulierte Regel und maxScore 2', () => {
    for (const criterion of BRAND_CHECK_CRITERIA) {
      expect(criterion.maxScore, criterion.id).toBe(2)
      // Prompt-Material: eine leere oder halbe Regel wäre eine Frage, die das
      // Modell selbst zu Ende erfindet.
      expect(criterion.rule.length, criterion.id).toBeGreaterThan(40)
      expect(criterion.rule, criterion.id).toMatch(/0 = |0 to 2|0 =/)
    }
  })

  it('hält die Fassung der Rechnung fest', () => {
    expect(BRAND_CHECK_SCORE_VERSION).toBe('score-1')
  })
})

describe('brandScoreBand', () => {
  it('trifft die sieben Grenzen aus dem Bewertungsmodell v2', () => {
    expect(brandScoreBand(100)).toBe('exceptional')
    expect(brandScoreBand(94)).toBe('exceptional')
    expect(brandScoreBand(93)).toBe('outstanding')
    expect(brandScoreBand(88)).toBe('outstanding')
    expect(brandScoreBand(87)).toBe('excellent')
    expect(brandScoreBand(80)).toBe('excellent')
    expect(brandScoreBand(79)).toBe('strong')
    expect(brandScoreBand(70)).toBe('strong')
    expect(brandScoreBand(69)).toBe('average')
    expect(brandScoreBand(60)).toBe('average')
    expect(brandScoreBand(59)).toBe('weak')
    expect(brandScoreBand(50)).toBe('weak')
    expect(brandScoreBand(49)).toBe('poor')
    expect(brandScoreBand(0)).toBe('poor')
  })
})

describe('computeBrandCheck', () => {
  it('alles 2 ⇒ 100 Punkte, keine Kategorie gesperrt', () => {
    const result = computeBrandCheck(allScores(2))

    expect(result.score).toBe(100)
    expect(result.band).toBe('exceptional')
    for (const category of result.categories) {
      expect(category.locked, category.key).toBe(false)
      expect(category.raw, category.key).toBe(10)
      expect(category.assessable, category.key).toBe(5)
      expect(category.points, category.key).toBe(category.weight)
    }
  })

  it('alles 0 ⇒ 0 Punkte, aber NICHTS gesperrt (0 ist ein Urteil)', () => {
    const result = computeBrandCheck(allScores(0))

    expect(result.score).toBe(0)
    expect(result.band).toBe('poor')
    expect(result.categories.every(category => category.locked)).toBe(false)
    expect(result.categories.every(category => category.assessable === 5)).toBe(true)
  })

  it('alles null ⇒ 0 Punkte und ALLE Kategorien gesperrt', () => {
    const result = computeBrandCheck(allScores(null))

    expect(result.score).toBe(0)
    expect(result.categories.every(category => category.locked)).toBe(true)
    expect(result.categories.every(category => category.points === 0)).toBe(true)
    expect(result.categories.every(category => category.assessable === 0)).toBe(true)
  })

  it('ein leeres Objekt ist dasselbe wie „alles null"', () => {
    expect(computeBrandCheck({})).toEqual(computeBrandCheck(allScores(null)))
  })

  it('alles 1 ⇒ genau die Hälfte', () => {
    expect(computeBrandCheck(allScores(1)).score).toBe(50)
  })

  it('normalisiert INNERHALB einer Kategorie auf die bewertbaren Kriterien', () => {
    // Eigenständigkeit: ein Kriterium mit 2, vier nicht bewertbar ⇒ volle
    // Punktzahl der Kategorie. Eine 0 für die vier `null` gäbe 3 von 15.
    const scores: BrandCheckScores = { ...allScores(null), a1: 2 }
    const result = computeBrandCheck(scores)
    const category = result.categories.find(entry => entry.key === 'distinctiveness')!

    expect(category.locked).toBe(false)
    expect(category.assessable).toBe(1)
    expect(category.raw).toBe(2)
    expect(category.points).toBe(15)
    // Und der GESAMTwert normalisiert über die freigeschalteten Gewichte —
    // die sieben gesperrten Kategorien drücken ihn nicht.
    expect(result.score).toBe(100)
  })

  it('gemischt: gesperrte Kategorien fallen aus Zähler UND Nenner', () => {
    const scores: BrandCheckScores = { ...allScores(null) }
    // Visuelle Identität (15): drei Kriterien, davon zwei mit 2 und eines mit 0
    // ⇒ 4 von 6 möglichen Punkten = 10 von 15.
    scores.b1 = 2
    scores.b2 = 2
    scores.b3 = 0
    // Handwerk (10): ein Kriterium mit 1 ⇒ 5 von 10.
    scores.h1 = 1

    const result = computeBrandCheck(scores)
    const visual = result.categories.find(entry => entry.key === 'visual')!
    const craft = result.categories.find(entry => entry.key === 'craft')!

    expect(visual.points).toBe(10)
    expect(craft.points).toBe(5)
    // (10 + 5) / (15 + 10) = 60 %
    expect(result.score).toBe(60)
    expect(result.band).toBe('average')
    expect(result.categories.filter(entry => entry.locked)).toHaveLength(6)
  })

  it('liefert die Kategorien in Plan-Reihenfolge A–H', () => {
    expect(computeBrandCheck({}).categories.map(entry => entry.key)).toEqual([
      'distinctiveness', 'visual', 'consistency', 'experience',
      'clarity', 'emotion', 'adaptability', 'craft',
    ])
  })
})

describe('pickBrandCheckFindings', () => {
  it('nimmt die drei grössten GEWICHTETEN Abstände zur 2', () => {
    const scores: BrandCheckScores = { ...allScores(2) }
    scores.a1 = 0 // Eigenständigkeit: 2 Punkte × 3 = 6
    scores.h1 = 0 // Handwerk: 2 Punkte × 2 = 4
    scores.c1 = 1 // Konsistenz: 1 Punkt × 3 = 3
    scores.e1 = 1 // Klarheit: 1 Punkt × 2 = 2

    expect(pickBrandCheckFindings(scores)).toEqual(['a1', 'h1', 'c1'])
  })

  it('ignoriert „nicht bewertbar" — eine Grenze der Messung ist kein Befund', () => {
    const scores: BrandCheckScores = { ...allScores(null), a1: 1 }
    expect(pickBrandCheckFindings(scores)).toEqual(['a1'])
  })

  it('alles 2 ⇒ KEIN Befund (nicht drei Lobeshymnen)', () => {
    expect(pickBrandCheckFindings(allScores(2))).toEqual([])
  })

  it('entscheidet Gleichstand über die Katalog-Reihenfolge', () => {
    const scores: BrandCheckScores = { ...allScores(2) }
    // Drei Kriterien derselben Kategorie, gleicher Abstand — a1 vor a3 vor a5.
    scores.a5 = 0
    scores.a3 = 0
    scores.a1 = 0

    expect(pickBrandCheckFindings(scores)).toEqual(['a1', 'a3', 'a5'])
  })

  it('achtet das Limit', () => {
    expect(pickBrandCheckFindings(allScores(0), 1)).toHaveLength(1)
    expect(pickBrandCheckFindings(allScores(0), 0)).toHaveLength(0)
    expect(pickBrandCheckFindings(allScores(0))).toHaveLength(3)
  })
})

describe('brandCheckUrlKey', () => {
  it('zieht Host und Pfad zusammen, kleingeschrieben', () => {
    expect(brandCheckUrlKey('https://Kailua.Coffee/Rösterei')).toBe('kailua.coffee/r%c3%b6sterei')
  })

  it('wirft Schema, Query und Fragment weg — sonst wäre der Deckel umgehbar', () => {
    const key = brandCheckUrlKey('https://kailua.coffee/')
    expect(brandCheckUrlKey('http://kailua.coffee')).toBe(key)
    expect(brandCheckUrlKey('https://kailua.coffee/?utm_source=newsletter')).toBe(key)
    expect(brandCheckUrlKey('https://kailua.coffee#angebot')).toBe(key)
  })

  it('behält `www` — das ist die Entscheidung des Betreibers, nicht unsere', () => {
    expect(brandCheckUrlKey('https://www.kailua.coffee')).not.toBe(brandCheckUrlKey('https://kailua.coffee'))
  })

  it('unlesbare Adresse ⇒ leerer Schlüssel (findet nichts statt irgendetwas)', () => {
    expect(brandCheckUrlKey('kailua.coffee')).toBe('')
    expect(brandCheckUrlKey('')).toBe('')
  })
})
