import { describe, expect, it } from 'vitest'
import {
  BRAND_CHECK_CATEGORIES,
  BRAND_CHECK_CRITERIA,
  BRAND_CHECK_WIZARD_STEPS,
  type BrandCheckCriterionLike,
  brandCheckCategoryScores,
  brandCheckWizardStep,
  computeBrandCheck,
  pickBrandCheckFindings,
  pickBrandCheckTodos,
} from '../shared/brandCheck'
import { BRAND_STEP_KEYS } from '../shared/slotRegistry'

/**
 * DIE EXPERTEN-TO-DOS (BRAND-CHECK-SEITE §5) — „dieselbe Regel ohne Deckel".
 *
 * Genau das ist die Aussage, die hier gehalten werden muss: die Liste auf der
 * Score-Seite und die drei Befunde der Ergebnis-Seite dürfen NIE in
 * verschiedener Reihenfolge dastehen. Wären es zwei Rangfolgen, nennte die
 * Ergebnis-Seite drei Punkte und die To-do-Liste darunter finge mit einem
 * vierten an — und niemand könnte sagen, welche der beiden recht hat.
 */

/** Ein vollständiger Kriterien-Satz, per Bauplan gefüllt. */
function criteria(scores: Record<string, 0 | 1 | 2 | null>): BrandCheckCriterionLike[] {
  return BRAND_CHECK_CRITERIA.map(criterion => ({
    id: criterion.id,
    score: scores[criterion.id] ?? null,
    evidence: `Beleg ${criterion.id}`,
    note: `Notiz ${criterion.id}`,
  }))
}

describe('pickBrandCheckTodos', () => {
  it('nimmt jedes Kriterium unter der vollen Punktzahl — ohne Deckel', () => {
    const todos = pickBrandCheckTodos({ criteria: criteria({ a1: 0, a2: 1, b1: 0, h1: 1, c1: 2 }) })

    expect(todos.map(todo => todo.criterionId).sort()).toEqual(['a1', 'a2', 'b1', 'h1'])
    // Eine 2 ist kein To-do, ein `null` erst recht nicht.
    expect(todos.some(todo => todo.criterionId === 'c1')).toBe(false)
    expect(todos.some(todo => todo.criterionId === 'e1')).toBe(false)
  })

  it('sortiert wie die drei Befunde — die Ergebnis-Seite und die Liste stimmen überein', () => {
    const scores: Record<string, 0 | 1 | 2 | null> = { a1: 0, b1: 1, h1: 0, e1: 1, d1: 0 }
    const todos = pickBrandCheckTodos({ criteria: criteria(scores) })
    const findings = pickBrandCheckFindings(scores, 3)

    expect(todos.slice(0, 3).map(todo => todo.criterionId)).toEqual(findings)
    // Und die Liste geht darüber hinaus, wo die Befunde aufhören.
    expect(todos.length).toBeGreaterThan(findings.length)
  })

  it('gewichtet nach Kategorie: eine Null in der Eigenständigkeit wiegt mehr als eine im Handwerk', () => {
    const todos = pickBrandCheckTodos({ criteria: criteria({ h1: 0, a1: 0 }) })
    expect(todos.map(todo => todo.criterionId)).toEqual(['a1', 'h1'])
    // 15/5 × 2 gegen 10/5 × 2 — die Zahlen stehen in der Rechnung, nicht hier.
    expect(todos[0]!.gap).toBeGreaterThan(todos[1]!.gap)
  })

  it('trägt Beleg, Notiz und Punktzahl mit — ein To-do ohne Beleg wäre wieder „gefühlt"', () => {
    const [todo] = pickBrandCheckTodos({ criteria: criteria({ a1: 1 }) })
    expect(todo).toMatchObject({
      criterionId: 'a1',
      category: 'distinctiveness',
      score: 1,
      evidence: 'Beleg a1',
      note: 'Notiz a1',
      wizardStep: 'pvm',
    })
  })

  it('leere Eingabe und lauter Zweien ergeben eine LEERE Liste', () => {
    expect(pickBrandCheckTodos({ criteria: [] })).toEqual([])
    const perfect = Object.fromEntries(BRAND_CHECK_CRITERIA.map(entry => [entry.id, 2 as const]))
    expect(pickBrandCheckTodos({ criteria: criteria(perfect) })).toEqual([])
  })

  it('eine unbekannte Kriterien-Id fällt raus, statt ohne Gewicht vorn zu landen', () => {
    const todos = pickBrandCheckTodos({
      criteria: [
        { id: 'z9', score: 0, evidence: 'erfunden', note: '' },
        { id: 'a1', score: 1, evidence: 'echt', note: '' },
      ],
    })
    expect(todos.map(todo => todo.criterionId)).toEqual(['a1'])
  })
})

describe('brandCheckWizardStep', () => {
  it('führt jede Kategorie — entweder in ein Kapitel oder bewusst in keines', () => {
    for (const category of BRAND_CHECK_CATEGORIES) {
      const step = BRAND_CHECK_WIZARD_STEPS[category.key]
      expect(step === '' || (BRAND_STEP_KEYS as readonly string[]).includes(step), category.key).toBe(true)
    }
  })

  it('Eigenständigkeit und Klarheit zeigen ins Kapitel B, Konsistenz und Gefühl ins Kapitel D', () => {
    expect(brandCheckWizardStep('a1')).toBe('pvm')
    expect(brandCheckWizardStep('e1')).toBe('pvm')
    expect(brandCheckWizardStep('c1')).toBe('archetype')
    expect(brandCheckWizardStep('f1')).toBe('archetype')
  })

  it('Umsetzungs-Kategorien bekommen KEIN Kapitel — ein Link dorthin wäre ein leeres Versprechen', () => {
    // Favicon (visual), Handlungsaufforderung (experience), Viewport
    // (adaptability), Meta-Hygiene (craft): das ist Umsetzung, kein Fundament.
    expect(brandCheckWizardStep('b1')).toBe('')
    expect(brandCheckWizardStep('d1')).toBe('')
    expect(brandCheckWizardStep('g1')).toBe('')
    expect(brandCheckWizardStep('h5')).toBe('')
  })

  it('eine unbekannte Id bekommt kein Kapitel, statt eines zu raten', () => {
    expect(brandCheckWizardStep('z9')).toBe('')
  })
})

describe('brandCheckCategoryScores', () => {
  it('normiert auf 0–100, unabhängig vom Gewicht der Kategorie', () => {
    const computation = computeBrandCheck({
      // Eigenständigkeit (Gewicht 15) und Handwerk (Gewicht 10) je zur Hälfte.
      a1: 1, a2: 1, a3: 1, a4: 1, a5: 1,
      h1: 1, h2: 1, h3: 1, h4: 1, h5: 1,
    })
    const scores = brandCheckCategoryScores(computation.categories)

    expect(scores.find(entry => entry.id === 'distinctiveness')?.score).toBe(50)
    expect(scores.find(entry => entry.id === 'craft')?.score).toBe(50)
  })

  it('gesperrt heisst `null` und NICHT 0 — „konnten wir nicht ansehen" ist keine schwache Kategorie', () => {
    const computation = computeBrandCheck({ a1: 2, a2: 2, a3: 2, a4: 2, a5: 2 })
    const scores = brandCheckCategoryScores(computation.categories)

    expect(scores.find(entry => entry.id === 'distinctiveness')?.score).toBe(100)
    expect(scores.find(entry => entry.id === 'craft')?.score).toBeNull()
  })

  it('rechnet über die BEWERTBAREN Punkte, nicht über fünf', () => {
    // Zwei von fünf bewertbar, beide voll ⇒ 100, nicht 40.
    const computation = computeBrandCheck({ a1: 2, a2: 2 })
    expect(brandCheckCategoryScores(computation.categories).find(entry => entry.id === 'distinctiveness')?.score)
      .toBe(100)
  })

  it('überspringt Einträge ohne Schlüssel, statt zu werfen', () => {
    expect(brandCheckCategoryScores([{ raw: 4, assessable: 2, locked: false }])).toEqual([])
  })
})
