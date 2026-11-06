import { describe, expect, it } from 'vitest'
import {
  BRAND_CHECK_CATEGORIES,
  BRAND_CHECK_CRITERIA,
  type BrandCheckScoreValue,
  type BrandCheckScores,
  computeBrandCheck,
} from '../shared/brandCheck'
import {
  type BrandCheckInsightSource,
  brandCheckFacts,
  brandCheckHeadlineFindings,
  brandCheckImprovementPlan,
  brandCheckScoreGain,
} from '../shared/brandCheckInsights'

/**
 * DIE ERGEBNISSEITE V2 VERSPRICHT ZAHLEN (docs/archiv/BRAND-CHECK-SEITE.md §10):
 * „+3 Punkte", „Gesamt möglich: +28", „38 von 40 bewertet". Ein Versprechen
 * über Punkte, das nicht dieselbe Rechnung benutzt wie die Punkte selbst, ist
 * eine Schätzung im Gewand einer Messung — und niemand würde es merken, weil
 * beide Zahlen plausibel aussehen. Deshalb prüft dieser Test die REGELN und
 * nicht die Anzeige.
 */

/** Ein Ergebnis aus einer Wertekarte bauen — Belege und Notizen inklusive. */
function source(scores: BrandCheckScores, extra: Partial<BrandCheckInsightSource> = {}): BrandCheckInsightSource {
  const computation = computeBrandCheck(scores)
  return {
    score: computation.score,
    industry: 'food',
    source: 'website',
    createdAt: '2026-09-05T10:00:00.000Z',
    categories: computation.categories.map(category => ({
      key: category.key,
      weight: category.weight,
      raw: category.raw,
      assessable: category.assessable,
      locked: category.locked,
    })),
    criteria: BRAND_CHECK_CRITERIA.map(criterion => ({
      id: criterion.id,
      score: (scores[criterion.id] ?? null) as BrandCheckScoreValue,
      evidence: `Beleg ${criterion.id}`,
      note: `Notiz ${criterion.id}`,
    })),
    ...extra,
  }
}

/** Alle vierzig auf denselben Wert — die Grundlage der meisten Fälle. */
function all(value: BrandCheckScoreValue): BrandCheckScores {
  return Object.fromEntries(BRAND_CHECK_CRITERIA.map(criterion => [criterion.id, value]))
}

describe('brandCheckScoreGain', () => {
  it('nennt genau die Punkte, die derselbe Rechner nach der Verbesserung ausgibt', () => {
    const scores = { ...all(2), a1: 0 as const, h1: 1 as const }
    const result = source(scores)

    // Gegengerechnet mit `computeBrandCheck` selbst — nicht mit einer zweiten
    // Formel, sonst prüfte der Test seine eigene Annahme.
    const base = computeBrandCheck(scores).score
    expect(brandCheckScoreGain(result, 'a1')).toBe(computeBrandCheck({ ...scores, a1: 2 }).score - base)
    expect(brandCheckScoreGain(result, 'h1')).toBe(computeBrandCheck({ ...scores, h1: 2 }).score - base)
  })

  it('gewichtet nach Kategorie: derselbe Abstand wiegt in der Eigenständigkeit mehr als im Handwerk', () => {
    // a1 (Gewicht 15) und h1 (Gewicht 10), beide auf 0 — der Hebel ist der
    // Unterschied, nicht die Zahl.
    const result = source({ ...all(2), a1: 0, h1: 0 })
    expect(brandCheckScoreGain(result, 'a1')).toBeGreaterThan(brandCheckScoreGain(result, 'h1'))
  })

  it('gibt 0 für ein nicht bewertbares, ein perfektes und ein unbekanntes Kriterium', () => {
    const result = source({ ...all(2), a1: null, a2: 0 })
    expect(brandCheckScoreGain(result, 'a1')).toBe(0) // Schloss — kein To-do
    expect(brandCheckScoreGain(result, 'a3')).toBe(0) // schon auf 2
    expect(brandCheckScoreGain(result, 'zz9')).toBe(0) // gibt es im Katalog nicht
    expect(brandCheckScoreGain(result, 'a2')).toBeGreaterThan(0) // Gegenprobe
  })

  it('rechnet mit dem GESCHRUMPFTEN Nenner, wenn Kategorien gesperrt sind', () => {
    // Vier Kategorien komplett nicht bewertbar ⇒ die verbleibenden vier tragen
    // den ganzen Wert. Ein Punkt wiegt dort mehr als im vollen Feld — genau
    // das kann eine „Gewicht durch fünf"-Formel nicht wissen.
    const locked: BrandCheckScores = { ...all(2) }
    for (const criterion of BRAND_CHECK_CRITERIA) {
      if (['visual', 'experience', 'adaptability', 'craft'].includes(criterion.category)) {
        locked[criterion.id] = null
      }
    }
    locked.a1 = 0

    const narrow = brandCheckScoreGain(source(locked), 'a1')
    const wide = brandCheckScoreGain(source({ ...all(2), a1: 0 }), 'a1')
    expect(narrow).toBeGreaterThan(wide)
  })
})

describe('brandCheckImprovementPlan', () => {
  it('nimmt alle Kriterien mit 0 oder 1 auf und lässt 2 und null draussen', () => {
    const result = source({ ...all(2), a1: 0, b1: 1, c1: null })
    const keys = brandCheckImprovementPlan(result).entries.map(entry => entry.key)
    expect(keys).toEqual(['a1', 'b1'])
  })

  it('sortiert nach Zugewinn, dann nach Kategorie-Gewicht, dann nach Katalog-Reihenfolge', () => {
    // e1/e2 (Klarheit, 10) und a1/a2 (Eigenständigkeit, 15), alle auf 1.
    const result = source({ ...all(2), e2: 1, a2: 1, e1: 1, a1: 1 })
    const entries = brandCheckImprovementPlan(result).entries

    // Gleicher Zugewinn innerhalb einer Kategorie ⇒ Katalog-Reihenfolge; die
    // schwerere Kategorie steht davor.
    expect(entries.map(entry => entry.key)).toEqual(['a1', 'a2', 'e1', 'e2'])
    for (let index = 1; index < entries.length; index += 1) {
      expect(entries[index - 1]!.gain).toBeGreaterThanOrEqual(entries[index]!.gain)
    }
  })

  it('trägt Beleg, Notiz, Wert und Kapitel je Zeile', () => {
    const [entry] = brandCheckImprovementPlan(source({ ...all(2), a1: 1 })).entries
    expect(entry).toMatchObject({
      key: 'a1',
      category: 'distinctiveness',
      score: 1,
      evidence: 'Beleg a1',
      note: 'Notiz a1',
      wizardStep: 'pvm',
    })
    expect(entry!.gain).toBeGreaterThan(0)

    // Vier Kategorien haben BEWUSST kein Kapitel (BRAND_CHECK_WIZARD_STEPS).
    const [craft] = brandCheckImprovementPlan(source({ ...all(2), h1: 1 })).entries
    expect(craft!.wizardStep).toBe('')
  })

  it('KONTROLLE: die Summe der Zugewinne ist der Abstand zu 100 — exakt, wo nichts zu runden ist', () => {
    // Nur die vier Zehner-Kategorien werden gesenkt: dort ist ein Punkt genau
    // ein ganzer Score-Punkt (10 / (5 × 2) = 1), also entsteht keine Rundung.
    const scores: BrandCheckScores = { ...all(2), e1: 0, e2: 1, f1: 1, g1: 0, h1: 1 }
    const plan = brandCheckImprovementPlan(source(scores))
    const sum = plan.entries.reduce((total, entry) => total + entry.gain, 0)

    expect(plan.totalGain).toBe(100 - computeBrandCheck(scores).score)
    expect(sum).toBe(plan.totalGain)
  })

  it('KONTROLLE: auch mit gerundeten Zeilen bleibt die Summe im Rundungsfenster', () => {
    // Gemischt über alle acht Kategorien: jede Zeile darf um bis zu einen
    // halben Punkt danebenliegen, die Summe also um `entries.length / 2`
    // (plus die eine Rundung des Gesamtwerts selbst).
    const scores: BrandCheckScores = { ...all(1), a1: 2, b1: 0, c3: null, d2: 0, h5: 2 }
    const plan = brandCheckImprovementPlan(source(scores))
    const sum = plan.entries.reduce((total, entry) => total + entry.gain, 0)

    expect(plan.entries.length).toBeGreaterThan(20)
    expect(Math.abs(sum - plan.totalGain)).toBeLessThanOrEqual(plan.entries.length / 2 + 1)
  })

  it('ein makelloser Auftritt hat einen leeren Plan und nichts mehr zu gewinnen', () => {
    const plan = brandCheckImprovementPlan(source(all(2)))
    expect(plan.entries).toEqual([])
    expect(plan.totalGain).toBe(0)
  })

  it('unbekannte Kriterium-Ids fallen raus, statt ohne Gewicht vorn zu landen', () => {
    const result = source({ ...all(2), a1: 1 })
    const plan = brandCheckImprovementPlan({
      ...result,
      criteria: [...result.criteria, { id: 'zz9', score: 0, evidence: '', note: '' }],
    })
    expect(plan.entries.map(entry => entry.key)).toEqual(['a1'])
  })
})

describe('brandCheckHeadlineFindings', () => {
  it('Stärke = die schwerste belegte 2, Chance = die erste Plan-Zeile, Schritt = ihr Kapitel', () => {
    const result = source({ ...all(1), a1: 2, h2: 2 })
    const findings = brandCheckHeadlineFindings(result)

    // a1 (Gewicht 15) schlägt h2 (Gewicht 10).
    expect(findings.strength).toMatchObject({ key: 'a1', category: 'distinctiveness', evidence: 'Beleg a1' })
    expect(findings.opportunity?.key).toBe(brandCheckImprovementPlan(result).entries[0]?.key)
    expect(findings.nextStep).toEqual({
      key: findings.opportunity!.key,
      category: findings.opportunity!.category,
      wizardStep: findings.opportunity!.wizardStep,
    })
  })

  it('eine 2 OHNE Beleg ist keine Stärke', () => {
    const result = source({ ...all(1), a1: 2 })
    const findings = brandCheckHeadlineFindings({
      ...result,
      criteria: result.criteria.map(entry => (entry.id === 'a1' ? { ...entry, evidence: '' } : entry)),
    })
    expect(findings.strength).toBeNull()
    expect(findings.opportunity).not.toBeNull() // Gegenprobe: die Kette lebt weiter
  })

  it('ohne Chance gibt es auch keinen nächsten Schritt', () => {
    const findings = brandCheckHeadlineFindings(source(all(2)))
    expect(findings.opportunity).toBeNull()
    expect(findings.nextStep).toBeNull()
    expect(findings.strength).not.toBeNull()
  })
})

describe('brandCheckFacts', () => {
  it('nennt stärkste und schwächste Kategorie als 0–100-Wert', () => {
    const scores: BrandCheckScores = { ...all(1) }
    for (const criterion of BRAND_CHECK_CRITERIA) {
      if (criterion.category === 'craft') scores[criterion.id] = 2
      if (criterion.category === 'visual') scores[criterion.id] = 0
    }
    const facts = brandCheckFacts(source(scores))
    expect(facts.strongest).toEqual({ key: 'craft', score: 100 })
    expect(facts.weakest).toEqual({ key: 'visual', score: 0 })
  })

  it('gesperrte Kategorien sind weder die stärkste noch die schwächste', () => {
    const scores: BrandCheckScores = { ...all(1) }
    for (const criterion of BRAND_CHECK_CRITERIA) {
      if (criterion.category === 'visual') scores[criterion.id] = null
    }
    const facts = brandCheckFacts(source(scores))
    expect(facts.weakest?.key).not.toBe('visual')
    expect(facts.strongest?.key).not.toBe('visual')
  })

  it('zählt bewertet, nicht bewertbar und die drei Stufen', () => {
    const facts = brandCheckFacts(source({ ...all(2), a1: null, a2: null, b1: 0, b2: 1 }))
    expect(facts.total).toBe(BRAND_CHECK_CRITERIA.length)
    expect(facts.notAssessable).toBe(2)
    expect(facts.assessed).toBe(BRAND_CHECK_CRITERIA.length - 2)
    expect(facts.none).toBe(1)
    expect(facts.partial).toBe(1)
    expect(facts.full).toBe(BRAND_CHECK_CRITERIA.length - 4)
  })

  it('reicht Branche, Quelle und Stand unverändert durch', () => {
    const facts = brandCheckFacts(source(all(2), { industry: 'craft', source: 'document', createdAt: '2026-01-02T03:04:05.000Z' }))
    expect(facts.industry).toBe('craft')
    expect(facts.source).toBe('document')
    expect(facts.createdAt).toBe('2026-01-02T03:04:05.000Z')
  })

  it('ohne einen einzigen bewertbaren Wert gibt es keine Auszeichnung', () => {
    const facts = brandCheckFacts(source(all(null)))
    expect(facts.strongest).toBeNull()
    expect(facts.weakest).toBeNull()
    expect(facts.assessed).toBe(0)
    expect(facts.notAssessable).toBe(BRAND_CHECK_CRITERIA.length)
  })
})

describe('Katalog-Invarianten, auf die sich diese Regeln stützen', () => {
  it('die acht Gewichte summieren sich auf 100', () => {
    expect(BRAND_CHECK_CATEGORIES.reduce((total, category) => total + category.weight, 0)).toBe(100)
  })
})
