import { describe, expect, it } from 'vitest'
import { BRAND_CHECK_CATEGORIES } from '../shared/brandCheck'
import {
  brandCheckCompareLeader,
  compareBrandCheckInsights,
  compareBrandChecks,
  type BrandCheckComparable,
  type BrandCheckGapInsight,
  type BrandCheckInsight,
  type BrandCheckInsightInput,
  type BrandCheckNotAssessableInsight,
  type BrandCheckOverallInsight,
  type BrandCheckStrengthsInsight,
  type BrandCheckTiesInsight,
  type BrandCheckWinsInsight,
} from '../shared/brandCheckCompare'

/**
 * DER QUARTETT-VERGLEICH (docs/archiv/BRAND-CHECK-SEITE.md §4, Paket P4).
 *
 * Geprüft wird die Regel, nicht die Zeichnung: wer eine Kategorie gewinnt, was
 * ein `null` bedeutet und dass das Vertauschen der Seiten niemanden bevorzugt.
 * Die Seite verlässt sich auf genau diese drei Zusagen.
 */

/**
 * Eine Kategorie so bauen, wie sie in einer gespeicherten Zeile steht: `raw`
 * ist die Rohsumme der BEWERTBAREN Kriterien, `assessable` deren Zahl.
 * `brandCheckCategoryScores` rechnet daraus `raw / (assessable * 2) * 100` —
 * mit `assessable: 5` ist `raw` also glatt die halbe Prozentzahl durch zehn.
 */
function category(key: string, percent: number | null) {
  if (percent === null) return { key, raw: 0, assessable: 0, locked: true }
  return { key, raw: (percent / 100) * 10, assessable: 5, locked: false }
}

/** Acht Werte in Katalog-Reihenfolge zu einem vergleichbaren Check machen. */
function check(values: (number | null)[]): BrandCheckComparable {
  return {
    categories: BRAND_CHECK_CATEGORIES.map((entry, index) => category(entry.key, values[index] ?? null)),
  }
}

const EIGHT = BRAND_CHECK_CATEGORIES.length

describe('compareBrandChecks', () => {
  it('gibt immer genau die acht Kategorien des Katalogs zurück, in seiner Reihenfolge', () => {
    const result = compareBrandChecks(check([]), check([]))
    expect(result.rows).toHaveLength(EIGHT)
    expect(result.rows.map(row => row.id)).toEqual(BRAND_CHECK_CATEGORIES.map(entry => entry.key))
  })

  it('kürt je Kategorie den höheren Wert', () => {
    const a = check([100, 20, 60, 60, 80, 40, 100, 0])
    const b = check([60, 80, 60, 40, 100, 20, 0, 20])
    const { rows, summary } = compareBrandChecks(a, b)

    expect(rows.map(row => row.winner)).toEqual(['a', 'b', 'tie', 'a', 'b', 'a', 'a', 'b'])
    expect(summary).toEqual({ aWins: 4, bWins: 3, ties: 1, notAssessable: 0 })
  })

  it('gleiche Werte sind ein Gleichstand, kein Sieg des Ersten', () => {
    const same = [50, 50, 50, 50, 50, 50, 50, 50]
    const { summary } = compareBrandChecks(check(same), check(same))
    expect(summary).toEqual({ aWins: 0, bWins: 0, ties: EIGHT, notAssessable: 0 })
  })

  it('ein `null` macht die Zeile zu `na` — die andere Seite gewinnt sie NICHT', () => {
    // Die Kernregel: „nicht bewertbar" ist keine schwache Kategorie. Wer 100
    // gegen eine Messlücke hält, hat nichts gewonnen.
    const { rows, summary } = compareBrandChecks(
      check([100, null, 40, 40, 40, 40, 40, 40]),
      check([null, 100, 20, 20, 20, 20, 20, 20]),
    )
    expect(rows[0]!.winner).toBe('na')
    expect(rows[1]!.winner).toBe('na')
    expect(rows[0]!.a).toBe(100)
    expect(rows[0]!.b).toBeNull()
    expect(summary).toEqual({ aWins: 6, bWins: 0, ties: 0, notAssessable: 2 })
  })

  it('`null` auf BEIDEN Seiten ist ebenfalls `na` und kein Gleichstand', () => {
    const { rows, summary } = compareBrandChecks(check([null]), check([null]))
    expect(rows[0]!.winner).toBe('na')
    expect(summary.ties).toBe(0)
    // Alles Übrige fehlt in beiden Checks — auch das ist „nicht bewertbar".
    expect(summary.notAssessable).toBe(EIGHT)
  })

  it('eine fehlende Kategorie (alter Katalog) liest sich als `null`, nicht als 0', () => {
    const partial: BrandCheckComparable = { categories: [category('distinctiveness', 80)] }
    const { rows } = compareBrandChecks(partial, check([40, 40, 40, 40, 40, 40, 40, 40]))
    expect(rows[0]!.winner).toBe('a')
    expect(rows[1]!.a).toBeNull()
    expect(rows[1]!.winner).toBe('na')
  })

  it('die vier Zähler decken zusammen immer alle acht Kategorien ab', () => {
    const { summary } = compareBrandChecks(
      check([100, 10, 50, null, 70, 70, 30, 90]),
      check([20, 90, 50, 60, null, 70, 80, 10]),
    )
    expect(summary.aWins + summary.bWins + summary.ties + summary.notAssessable).toBe(EIGHT)
  })

  it('nichts vergleichbares ⇒ acht Zeilen `na` statt eines Absturzes', () => {
    const { rows, summary } = compareBrandChecks(null, undefined)
    expect(rows).toHaveLength(EIGHT)
    expect(summary).toEqual({ aWins: 0, bWins: 0, ties: 0, notAssessable: EIGHT })
  })

  it('SYMMETRIE: das Vertauschen der Seiten spiegelt exakt — niemand gewinnt dadurch', () => {
    // Daran hängt der „Tauschen"-Knopf der Vergleichs-Seite.
    const a = check([100, 20, 60, null, 80, 40, 100, 0])
    const b = check([60, 80, 60, 40, null, 20, 0, 20])
    const forward = compareBrandChecks(a, b)
    const backward = compareBrandChecks(b, a)

    expect(backward.summary).toEqual({
      aWins: forward.summary.bWins,
      bWins: forward.summary.aWins,
      ties: forward.summary.ties,
      notAssessable: forward.summary.notAssessable,
    })
    expect(backward.rows.map(row => row.id)).toEqual(forward.rows.map(row => row.id))
    expect(backward.rows.map(row => row.a)).toEqual(forward.rows.map(row => row.b))
    expect(backward.rows.map(row => row.b)).toEqual(forward.rows.map(row => row.a))
    // Und die Seiten-Etiketten drehen wirklich mit:
    expect(backward.rows.map(row => row.winner)).toEqual(
      forward.rows.map(row => (row.winner === 'a' ? 'b' : row.winner === 'b' ? 'a' : row.winner)),
    )
  })
})

/**
 * DIE ERKENNTNISSE (Davids Auftrag 2026-09-06, Paket P6b).
 *
 * Geprüft wird die REIHENFOLGE (sie ist die Wichtigkeit), die drei Schwellen
 * (Nähe, Abstand, Gründe) und dass auch hier niemand vom Tauschen profitiert.
 */

/** Ein Check mit Gesamtwert, Kategorien und (optional) Kriterien. */
function insightCheck(
  values: (number | null)[],
  score: number,
  criteria: { id: string, category: string, score: number | null, evidence?: string }[] = [],
): BrandCheckInsightInput {
  return { ...check(values), score, criteria }
}

/** Fünf Kriterien einer Kategorie — Index 0 ist `<buchstabe>1`. */
function criteriaFor(
  category: string,
  letter: string,
  scores: (number | null)[],
  evidencePrefix: string,
): { id: string, category: string, score: number | null, evidence: string }[] {
  return scores.map((score, index) => ({
    id: `${letter}${index + 1}`,
    category,
    score,
    evidence: `${evidencePrefix}-${letter}${index + 1}`,
  }))
}

function only<T extends BrandCheckInsight['kind']>(
  insights: BrandCheckInsight[],
  kind: T,
): Extract<BrandCheckInsight, { kind: T }>[] {
  return insights.filter((entry): entry is Extract<BrandCheckInsight, { kind: T }> => entry.kind === kind)
}

describe('compareBrandCheckInsights', () => {
  it('ordnet die Erkenntnisse nach Wichtigkeit: Gesamtbild, Bilanz, Abstände, Gleichstände, Extreme, Messlücken', () => {
    const a = insightCheck([90, 40, 50, 60, 70, 80, 30, null], 66)
    const b = insightCheck([40, 90, 50, 20, 60, 70, 20, 50], 55)
    const kinds = compareBrandCheckInsights(a, b).map(entry => entry.kind)

    expect(kinds[0]).toBe('overall')
    expect(kinds[1]).toBe('wins')
    // Danach die Abstände (hier drei: 90/40, 40/90 und 60/20), dann der Rest.
    expect(kinds.slice(2)).toEqual(['gap', 'gap', 'gap', 'ties', 'strengths', 'notAssessable'])
  })

  it('ohne beide Seiten gibt es keine Erkenntnis statt einer halben', () => {
    expect(compareBrandCheckInsights(insightCheck([50], 50), null)).toEqual([])
    expect(compareBrandCheckInsights(null, insightCheck([50], 50))).toEqual([])
    expect(compareBrandCheckInsights(null, undefined)).toEqual([])
  })

  it('das Gesamtbild misst den GESAMTWERT, nicht die gewonnenen Kategorien', () => {
    // A gewinnt sieben Kategorien, hat aber den niedrigeren Gesamtwert — beides
    // darf nebeneinander stehen (der Ausreisser-Fall aus brandCheckCompareLeader).
    const a = insightCheck([60, 60, 60, 60, 60, 60, 60, 0], 52)
    const b = insightCheck([50, 50, 50, 50, 50, 50, 50, 100], 58)
    const [overall] = only(compareBrandCheckInsights(a, b), 'overall')
    expect(overall).toMatchObject({ leader: 'b', a: 52, b: 58, delta: 6 })
    expect(brandCheckCompareLeader(compareBrandChecks(a, b).summary)).toBe('a')
  })

  it('die drei Nähe-Stufen: ≤ 5 nah, 6–15 deutlich, > 15 weit', () => {
    function closeness(scoreA: number, scoreB: number): BrandCheckOverallInsight['closeness'] {
      const [overall] = only(
        compareBrandCheckInsights(insightCheck([50], scoreA), insightCheck([50], scoreB)),
        'overall',
      )
      return overall!.closeness
    }
    expect(closeness(50, 50)).toBe('close')
    expect(closeness(55, 50)).toBe('close')
    expect(closeness(56, 50)).toBe('clear')
    expect(closeness(65, 50)).toBe('clear')
    expect(closeness(66, 50)).toBe('wide')
    // Die Richtung ändert die Stufe nicht — gemessen wird der Betrag.
    expect(closeness(50, 66)).toBe('wide')
  })

  it('die Bilanz nennt die Kategorien beim Namen, in Katalog-Reihenfolge', () => {
    const a = insightCheck([100, 20, 60, 60, 80, 40, 100, null], 70)
    const b = insightCheck([60, 80, 60, 40, 100, 20, 0, 40], 55)
    const [wins] = only(compareBrandCheckInsights(a, b), 'wins')
    expect(wins).toEqual<BrandCheckWinsInsight>({
      kind: 'wins',
      a: ['distinctiveness', 'experience', 'emotion', 'adaptability'],
      b: ['visual', 'clarity'],
      tie: ['consistency'],
    })
  })

  it('erst ab 25 Punkten Abstand bekommt eine Kategorie eine eigene Erkenntnis', () => {
    const under = compareBrandCheckInsights(insightCheck([64], 50), insightCheck([40], 50))
    expect(only(under, 'gap')).toHaveLength(0)

    const at = compareBrandCheckInsights(insightCheck([65], 50), insightCheck([40], 50))
    expect(only(at, 'gap')).toHaveLength(1)
    expect(only(at, 'gap')[0]).toMatchObject({ category: 'distinctiveness', a: 65, b: 40, delta: 25, leader: 'a' })
  })

  it('eine Messlücke ist kein Abstand — 100 gegen `null` bekommt keine Kachel', () => {
    const insights = compareBrandCheckInsights(insightCheck([100], 60), insightCheck([null], 40))
    expect(only(insights, 'gap')).toHaveLength(0)
  })

  it('die Abstände stehen nach Größe, der größte zuerst', () => {
    const a = insightCheck([60, 90, 30, 50, 50, 50, 50, 50], 60)
    const b = insightCheck([20, 20, 90, 50, 50, 50, 50, 50], 50)
    const gaps = only(compareBrandCheckInsights(a, b), 'gap')
    expect(gaps.map(gap => [gap.category, gap.delta])).toEqual([
      ['visual', 70],
      ['consistency', 60],
      ['distinctiveness', 40],
    ])
    expect(gaps.map(gap => gap.leader)).toEqual(['a', 'b', 'a'])
  })

  it('„woran liegt das": höchstens drei Kriterien, größte Notendifferenz zuerst, mit BEIDEN Belegen', () => {
    const a = insightCheck(
      [90, 40, 40, 40, 40, 40, 40, 40], 60,
      criteriaFor('distinctiveness', 'a', [2, 2, 2, 1, 2], 'A'),
    )
    const b = insightCheck(
      [20, 40, 40, 40, 40, 40, 40, 40], 40,
      criteriaFor('distinctiveness', 'a', [0, 1, 2, 0, 0], 'B'),
    )
    const [gap] = only(compareBrandCheckInsights(a, b), 'gap') as BrandCheckGapInsight[]

    // a3 ist gleich (2 zu 2) und fällt heraus; von a1(2) a2(1) a4(1) a5(2)
    // bleiben die drei größten: a1, a5 (Differenz 2), dann a2 (Katalog-Tiebreak).
    expect(gap!.reasons.map(reason => reason.criterionId)).toEqual(['a1', 'a5', 'a2'])
    expect(gap!.reasons[0]).toEqual({
      criterionId: 'a1',
      a: 2,
      b: 0,
      delta: 2,
      evidenceA: 'A-a1',
      evidenceB: 'B-a1',
    })
  })

  it('ein Kriterium ohne Note auf einer Seite ist kein Grund', () => {
    const a = insightCheck(
      [90, 40, 40, 40, 40, 40, 40, 40], 60,
      criteriaFor('distinctiveness', 'a', [null, 2, 2, 2, 2], 'A'),
    )
    const b = insightCheck(
      [20, 40, 40, 40, 40, 40, 40, 40], 40,
      criteriaFor('distinctiveness', 'a', [0, 2, 2, 2, 2], 'B'),
    )
    const [gap] = only(compareBrandCheckInsights(a, b), 'gap')
    expect(gap!.reasons).toEqual([])
  })

  it('ohne Kriterien im Check bleibt die Abstands-Kachel bestehen, nur ohne Gründe', () => {
    const [gap] = only(compareBrandCheckInsights(insightCheck([90], 60), insightCheck([20], 40)), 'gap')
    expect(gap).toMatchObject({ category: 'distinctiveness', delta: 70 })
    expect(gap!.reasons).toEqual([])
  })

  it('Gleichstände tragen den gemeinsamen Wert — und fehlen ganz, wenn es keine gibt', () => {
    const [ties] = only(
      compareBrandCheckInsights(
        insightCheck([50, 70, 30, 40, 40, 40, 40, 40], 50),
        insightCheck([50, 20, 30, 10, 10, 10, 10, 10], 40),
      ),
      'ties',
    )
    expect(ties).toEqual<BrandCheckTiesInsight>({
      kind: 'ties',
      categories: [{ id: 'distinctiveness', value: 50 }, { id: 'consistency', value: 30 }],
    })

    const without = compareBrandCheckInsights(insightCheck([60], 60), insightCheck([20], 40))
    expect(only(without, 'ties')).toHaveLength(0)
  })

  it('stärkste und schwächste Kategorie werden JE SEITE bestimmt', () => {
    const a = insightCheck([30, 100, 40, 50, 60, 70, 80, 90], 70)
    const b = insightCheck([80, 10, 40, 50, 60, 70, 20, 30], 50)
    const [strengths] = only(compareBrandCheckInsights(a, b), 'strengths')
    expect(strengths).toEqual<BrandCheckStrengthsInsight>({
      kind: 'strengths',
      a: { best: { id: 'visual', value: 100 }, worst: { id: 'distinctiveness', value: 30 } },
      b: { best: { id: 'distinctiveness', value: 80 }, worst: { id: 'visual', value: 10 } },
    })
  })

  it('eine Seite ganz ohne bewertbare Kategorie hat weder Stärke noch Schwäche', () => {
    const insights = compareBrandCheckInsights(
      insightCheck([50, 60, 70, 80, 40, 40, 40, 40], 55),
      insightCheck([], 0),
    )
    const [strengths] = only(insights, 'strengths')
    expect(strengths!.a.best).toEqual({ id: 'experience', value: 80 })
    expect(strengths!.b).toEqual({ best: null, worst: null })
  })

  it('Messlücken werden je Seite gezählt — Kategorien UND Kriterien, eine 0 ist eine Note', () => {
    const a = insightCheck(
      [null, 50, 50, 50, 50, 50, 50, 50], 50,
      criteriaFor('distinctiveness', 'a', [null, null, 0, 1, 2], 'A'),
    )
    const b = insightCheck(
      [50, 50, 50, 50, 50, 50, 50, 50], 50,
      criteriaFor('distinctiveness', 'a', [0, 0, 0, 0, 0], 'B'),
    )
    const [gaps] = only(compareBrandCheckInsights(a, b), 'notAssessable')
    expect(gaps).toEqual<BrandCheckNotAssessableInsight>({
      kind: 'notAssessable',
      categoriesA: 1,
      categoriesB: 0,
      criteriaA: 2,
      criteriaB: 0,
    })
  })

  it('ohne jede Messlücke entfällt die Kachel', () => {
    const full = [50, 50, 50, 50, 50, 50, 50, 50]
    const insights = compareBrandCheckInsights(insightCheck(full, 50), insightCheck(full, 50))
    expect(only(insights, 'notAssessable')).toHaveLength(0)
  })

  it('SYMMETRIE: das Vertauschen spiegelt jede Erkenntnis — niemand gewinnt dadurch', () => {
    const criteriaA = criteriaFor('distinctiveness', 'a', [2, 2, 1, null, 0], 'A')
    const criteriaB = criteriaFor('distinctiveness', 'a', [0, 1, 1, 2, 2], 'B')
    const a = insightCheck([90, 20, 50, null, 70, 60, 40, 30], 62, criteriaA)
    const b = insightCheck([20, 80, 50, 40, 70, 30, 60, 90], 55, criteriaB)

    const forward = compareBrandCheckInsights(a, b)
    const backward = compareBrandCheckInsights(b, a)

    expect(backward.map(entry => entry.kind)).toEqual(forward.map(entry => entry.kind))

    const [f0] = only(forward, 'overall')
    const [b0] = only(backward, 'overall')
    expect(b0).toEqual({ ...f0, leader: 'b', a: f0!.b, b: f0!.a })

    const [fWins] = only(forward, 'wins')
    const [bWins] = only(backward, 'wins')
    expect(bWins!.a).toEqual(fWins!.b)
    expect(bWins!.b).toEqual(fWins!.a)
    expect(bWins!.tie).toEqual(fWins!.tie)

    const fGaps = only(forward, 'gap')
    const bGaps = only(backward, 'gap')
    expect(bGaps.map(gap => gap.category)).toEqual(fGaps.map(gap => gap.category))
    expect(bGaps.map(gap => gap.delta)).toEqual(fGaps.map(gap => gap.delta))
    expect(bGaps.map(gap => gap.leader)).toEqual(fGaps.map(gap => (gap.leader === 'a' ? 'b' : 'a')))
    expect(bGaps[0]!.reasons.map(reason => [reason.criterionId, reason.a, reason.b, reason.evidenceA])).toEqual(
      fGaps[0]!.reasons.map(reason => [reason.criterionId, reason.b, reason.a, reason.evidenceB]),
    )

    const [fStrong] = only(forward, 'strengths')
    const [bStrong] = only(backward, 'strengths')
    expect(bStrong!.a).toEqual(fStrong!.b)
    expect(bStrong!.b).toEqual(fStrong!.a)

    const [fGap] = only(forward, 'notAssessable')
    const [bGap] = only(backward, 'notAssessable')
    expect(bGap).toEqual({
      kind: 'notAssessable',
      categoriesA: fGap!.categoriesB,
      categoriesB: fGap!.categoriesA,
      criteriaA: fGap!.criteriaB,
      criteriaB: fGap!.criteriaA,
    })
  })
})

describe('brandCheckCompareLeader', () => {
  it('zählt gewonnene Kategorien, nicht den Gesamtwert', () => {
    expect(brandCheckCompareLeader({ aWins: 5, bWins: 2, ties: 1, notAssessable: 0 })).toBe('a')
    expect(brandCheckCompareLeader({ aWins: 2, bWins: 5, ties: 1, notAssessable: 0 })).toBe('b')
  })

  it('gleich viele Siege ⇒ Gleichstand, auch wenn es gar keine gab', () => {
    expect(brandCheckCompareLeader({ aWins: 3, bWins: 3, ties: 2, notAssessable: 0 })).toBe('tie')
    expect(brandCheckCompareLeader({ aWins: 0, bWins: 0, ties: 0, notAssessable: 8 })).toBe('tie')
  })
})
