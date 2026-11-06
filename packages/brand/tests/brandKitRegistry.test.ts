import { describe, expect, it } from 'vitest'
import { BRAND_ADVISORS, colleagueForStep, techniqueForStep } from '../shared/brandAdvisors'
import { BRAND_FOUNDATION_CHAPTER_IDS, BRAND_FOUNDATION_SOURCE_STEPS } from '../shared/brandFoundation'
import {
  type BrandProfileFacts,
  type BrandStepFacts,
  canEnterBrandStep,
  includedBrandSteps,
  resolveBrandJourney,
} from '../shared/brandJourney'
import {
  BRAND_AI_REVIEWS,
  BRAND_AI_SCOPES,
  BRAND_NAME_TYPES,
  type BrandKitTerm,
  validateBrandKitVocab,
} from '../shared/brandKitVocab'
import { affectsView } from '../shared/brandSessions'
import { validateSessionOrder } from '../shared/brandSessionGroups'
import { isBrandChapterShareable } from '../shared/brandSharing'
import {
  BRAND_KIT_STEP_KEYS,
  BRAND_SLOTS,
  BRAND_STEP_KEYS,
  type BrandSlot,
  type BrandStepKey,
  isBrandKitStep,
  requiredSlotsForStep,
  sessionTravels,
  slotById,
  slotsForStep,
  validateSlotRegistry,
} from '../shared/slotRegistry'
import { resolveProfileProgress } from '../server/utils/brandStore'

/**
 * SCHICHT 3 — BRAND BOOK & KIT, PAKET K0 (Konzept docs/plans/BRAND-BOOK-KIT.md
 * §2.1–§2.5, §2.8, §2.10).
 *
 * K0 baut die VERTRÄGE: drei Kapitel in der Registry, zehn Sessions, die drei
 * Kataloge, die Berater-Zuordnung, das Journey-Gate und fünf Kapitel-Anker der
 * Leseansicht. Keine Migration, keine Route, keine Seite.
 *
 * ── WOGEGEN DIESE DATEI GESCHRIEBEN IST ──────────────────────────────────
 * Gegen die D0-Lehre (docs/archiv/BRAND-DESIGN.md §2.18): eine Registry-
 * Erweiterung sickert in VIER Leser (Rail, Dokument, Leseansicht,
 * Fortschritts-Cache) und in den Impact-Hinweis — bei Brand Design fand das
 * erst ein Klick-Beweis, 2 299 Unit-Tests sahen es nicht. Für Schicht 3 steht
 * die Zusage deshalb hier, und zwar als PRÜFUNG statt als Kommentar: ohne
 * Freischaltung zählt und erscheint sie NIRGENDS.
 */

const KIT_SESSIONS = BRAND_SLOTS.filter(session => isBrandKitStep(session.stepId))

/** Ein Profil auf dem Vollpfad — mit und ohne freigeschaltete Ableitung. */
const PROFILE: BrandProfileFacts = {
  pathKind: 'new',
  hasName: false,
  team: 'team',
  subBrands: 'yes',
  namingOpted: true,
}
const UNLOCKED: BrandProfileFacts = { ...PROFILE, derivationUnlocked: true }

describe('K0 — die drei Kapitel und ihre zehn Sessions', () => {
  it('hängt Schicht 3 ADDITIV hinter Brand Design', () => {
    expect([...BRAND_KIT_STEP_KEYS]).toEqual(['nomenclature', 'aiguide', 'presskit'])
    expect(BRAND_STEP_KEYS.slice(-3)).toEqual([...BRAND_KIT_STEP_KEYS])
  })

  it('führt die Sessions der drei Kapitel nach den Tabellen §2.2–§2.4', () => {
    const form = (id: string) => {
      const session = slotById(id)!
      return [session.stepId, session.type, session.editor, session.generator, session.required]
    }
    expect(form('m.types')).toEqual(['nomenclature', 'choice', 'chips', 'none', true])
    expect(form('m.patterns')).toEqual(['nomenclature', 'derivation', 'stage', 'draft', true])
    expect(form('m.rules')).toEqual(['nomenclature', 'stage-edit', 'stage', 'none', true])

    expect(form('n.scope')).toEqual(['aiguide', 'choice', 'cards', 'none', true])
    expect(form('n.review')).toEqual(['aiguide', 'choice', 'cards', 'none', true])
    expect(form('n.guardrails')).toEqual(['aiguide', 'derivation', 'stage', 'draft', true])
    // PUR (§2.11): drei Vorlagen, gerechnet — kein Instrument, kein Modell-Lauf.
    expect(form('n.prompts')).toEqual(['aiguide', 'derivation', 'none', 'none', true])

    expect(form('p.facts')).toEqual(['presskit', 'choice', 'chips', 'none', true])
    // Optional (§2.19 Nr. 3) — als einzige Session der Schicht.
    expect(form('p.contact')).toEqual(['presskit', 'question', 'text', 'none', false])
    expect(form('p.summary')).toEqual(['presskit', 'derivation', 'none', 'none', true])

    expect(slotsForStep('nomenclature').map(s => s.id)).toEqual(['m.types', 'm.patterns', 'm.rules'])
    expect(slotsForStep('aiguide').map(s => s.id))
      .toEqual(['n.scope', 'n.review', 'n.guardrails', 'n.prompts'])
    expect(slotsForStep('presskit').map(s => s.id)).toEqual(['p.facts', 'p.contact', 'p.summary'])
  })

  it('lässt jede Session aus den Quellen schöpfen, die das Konzept nennt', () => {
    const deps = (id: string) => [...slotById(id)!.dependencies]
    expect(deps('m.types')).toEqual([])
    expect(deps('m.patterns')).toEqual(['b2.model', 'b2.rule', 'f.decision', 'd.toneWords', 'm.types'])
    expect(deps('m.rules')).toEqual(['m.patterns'])
    expect(deps('n.scope')).toEqual([])
    expect(deps('n.review')).toEqual([])
    expect(deps('n.guardrails'))
      .toEqual(['c.final', 'd.toneWords', 'd.voiceSamples', 'd.vocabulary', 'ep.vocabulary', 'm.rules'])
    expect(deps('n.prompts')).toEqual(['d.primary', 'd.toneWords', 'd.voiceSamples', 'n.guardrails'])
    expect(deps('p.facts')).toEqual(['a.facts'])
    expect(deps('p.contact')).toEqual([])
    expect(deps('p.summary')).toEqual(['ep.taglines', 'ep.boilerplates', 'p.facts', 'p.contact'])
  })

  it('bleibt in beiden Wächtern sauber — Registry und Reihenfolge', () => {
    // Beide sind die ECHTEN Wächter, nicht nachgebaute Prüfungen: sie laufen
    // ohnehin über die volle Registry, hier steht nur, dass K0 sie nicht
    // gerissen hat (Fragen vor Ableitungen, Rückwärts-Regel, Session-Vertrag).
    expect(validateSlotRegistry()).toEqual([])
    expect(validateSessionOrder()).toEqual([])
  })
})

/**
 * DER AUSNAHME-VERTRAG VON `p.facts` (§2.10) — die einzige Stelle, an der ein
 * ÖFFENTLICHER Wert aus einer VERTRAULICHEN Quelle entsteht.
 */
describe('K0 — `p.facts` ist die eine Ausnahme, und sie ist namentlich', () => {
  it('lässt `a.facts` unangetastet intern', () => {
    const facts = slotById('a.facts')!
    expect(facts.sensitivity).toBe('internal')
    expect(facts.audience).toBe('internal')
    expect(sessionTravels(facts)).toBe(false)
  })

  it('macht aus der AUSWAHL daraus einen eigenen, reisenden Wert', () => {
    const chosen = slotById('p.facts')!
    expect(chosen.dependencies).toEqual(['a.facts'])
    expect(chosen.sensitivity).toBe('public')
    expect(chosen.audience).toBe('foundation')
    expect(sessionTravels(chosen)).toBe(true)
    // Der Wächter LÄSST das durch — er prüft `sensitivity` gegen `audience`,
    // nicht gegen die Quellen (eine Quellen-Regel träfe auch
    // `b.positioningCategory` und `g.dna`, die aus demselben guten Grund
    // öffentlich sind).
    expect(validateSlotRegistry()).toEqual([])
  })

  it('BLEIBT die einzige: keine zweite Kit-Session schöpft aus etwas Internem', () => {
    const durchgereicht = KIT_SESSIONS
      .filter(session => sessionTravels(session)
        && session.dependencies.some(id => !sessionTravels(slotById(id) as BrandSlot)))
      .map(session => session.id)
    expect(durchgereicht).toEqual(['p.facts'])
  })

  it('lässt den Presse-Kontakt bewusst öffentlich reisen (§2.4)', () => {
    const contact = slotById('p.contact')!
    // Eine Menschenfrage ist per Typ-Regel Material — hier steht die Ausnahme,
    // weil die Angabe im Pressekit und in `brand.md` steht.
    expect(contact.type).toBe('question')
    expect(contact.audience).toBe('foundation')
    expect(sessionTravels(contact)).toBe(true)
    expect(contact.answers.allowDefer).toBe(true)
  })
})

describe('K0 — die drei Kataloge (§2.2/§2.3)', () => {
  const ids = (terms: readonly BrandKitTerm[]) => terms.map(term => term.id)

  it('führt die fünf Produkttypen, vier Umfänge und drei Freigabe-Regeln', () => {
    expect(ids(BRAND_NAME_TYPES)).toEqual(['product', 'service', 'program', 'place', 'digital'])
    expect(ids(BRAND_AI_SCOPES)).toEqual(['drafts', 'text-only', 'internal', 'none'])
    expect(ids(BRAND_AI_REVIEWS)).toEqual(['every', 'sample', 'channel'])
  })

  it('gibt jedem Wert beide Sprachen und höchstens eine Empfehlung je Menge', () => {
    expect(validateBrandKitVocab()).toEqual([])
    for (const terms of [BRAND_NAME_TYPES, BRAND_AI_SCOPES, BRAND_AI_REVIEWS]) {
      expect(terms.filter(term => term.recommended).length).toBeLessThanOrEqual(1)
    }
  })

  it('GEGENPROBE: der Wächter schlägt bei einer deutschen Id und bei Doppeln an', () => {
    const kaputt: BrandKitTerm[] = [
      { id: 'Ort / Filiale', de: 'Ort', en: 'Place', noteDe: 'x', noteEn: 'x' },
      { id: 'product', de: '', en: 'Product', noteDe: 'x', noteEn: '' },
      { id: 'product', de: 'Produkt', en: 'Product', noteDe: 'x', noteEn: 'x', recommended: true },
      { id: 'digital', de: 'Digital', en: 'Digital', noteDe: 'x', noteEn: 'x', recommended: true },
    ]
    const problems = validateBrandKitVocab({ 'm.types': kaputt })
    expect(problems).toContain('m.types: Id "Ort / Filiale" ist nicht klein-englisch mit Bindestrich')
    expect(problems).toContain('m.types: doppelte Id product')
    expect(problems).toContain('m.types.product: Label unvollständig')
    expect(problems).toContain('m.types: 2 Empfehlungen — höchstens eine')
    // Und eine Menge mit einem Wert ist keine Wahl.
    expect(validateBrandKitVocab({ 'n.scope': [kaputt[3]!] }))
      .toContain('n.scope: 1 Werte — eine Menge mit weniger als zwei ist keine Wahl')
  })
})

describe('K0 — wer die drei Kapitel führt (§2.10)', () => {
  it('gibt Nomenklatur an Otto, AI-Guidelines an Nika und das Pressekit an George', () => {
    expect(techniqueForStep('nomenclature').key).toBe('otto')
    expect(techniqueForStep('aiguide').key).toBe('nika')
    expect(techniqueForStep('presskit').key).toBe('george')
  })

  it('erwähnt Otto und Nika, George aber nicht sich selbst', () => {
    expect(colleagueForStep('nomenclature')?.key).toBe('otto')
    expect(colleagueForStep('aiguide')?.key).toBe('nika')
    expect(colleagueForStep('presskit')).toBeNull()
  })

  it('lässt die Zuordnung aus dem Steckbrief folgen — nicht aus einer zweiten Liste', () => {
    const steps = (key: string) => BRAND_ADVISORS.find(advisor => advisor.key === key)!.steps
    expect(steps('otto')).toEqual(['naming', 'nomenclature'])
    expect(steps('nika')).toEqual(['manifesto', 'verbal', 'aiguide'])
    expect(steps('george')).toEqual(['context', 'result', 'presskit'])
    // KEIN neuer Steckbrief (§2.10) — die Schicht kommt ohne vierte Stimme aus.
    expect(BRAND_ADVISORS).toHaveLength(6)
    for (const session of KIT_SESSIONS) {
      expect(session.processing.technique, session.id)
        .toBe(techniqueForStep(session.stepId).key)
    }
  })
})

describe('K0 — die Freischaltung „Ableitung" (§2.8)', () => {
  it('nimmt Schicht 3 ohne Freischaltung GANZ vom Weg — nicht gesperrt darauf', () => {
    const journey = resolveBrandJourney(PROFILE)
    for (const stepKey of BRAND_KIT_STEP_KEYS) {
      const step = journey.find(entry => entry.stepKey === stepKey)!
      expect(step, stepKey).toMatchObject({ state: 'skipped', reason: 'derivation_locked' })
    }
    expect(includedBrandSteps(PROFILE).filter(isBrandKitStep)).toEqual([])
  })

  it('nennt den Grund an der Tür, damit die Oberfläche den richtigen Satz zeigt', () => {
    const journey = resolveBrandJourney(PROFILE)
    // NICHT `skipped` wie eine abgewählte Weiche: „gehört nicht zu eurem Weg"
    // und „dieses Produkt ist noch nicht geöffnet" sind zwei Sätze (D1-Muster).
    expect(canEnterBrandStep(journey, 'aiguide'))
      .toEqual({ allowed: false, reason: 'derivation_locked' })
    // GEGENPROBE: eine abgewählte Weiche behält ihren alten Grund.
    const ohneUntermarken = resolveBrandJourney({ ...PROFILE, subBrands: 'no' })
    expect(canEnterBrandStep(ohneUntermarken, 'architecture'))
      .toEqual({ allowed: false, reason: 'skipped' })
  })

  it('legt sie mit der Freischaltung auf den Weg — Brand Design ist KEINE Voraussetzung (§1.11 d)', () => {
    const foundationDone = ['context', 'pvm', 'architecture', 'values', 'archetype',
      'manifesto', 'verbal', 'naming', 'result'] as const
    const journey = resolveBrandJourney(
      UNLOCKED,
      foundationDone.map(stepKey => ({ stepKey, state: 'done' as const })),
    )
    // Brand Design steht daneben gesperrt (nicht freigeschaltet) — und reisst
    // die Kette trotzdem nicht: `nomenclature` ist offen.
    expect(journey.find(entry => entry.stepKey === 'motion'))
      .toMatchObject({ state: 'locked', reason: 'design_locked' })
    expect(journey.find(entry => entry.stepKey === 'nomenclature'))
      .toMatchObject({ state: 'open', reason: 'unlocked' })
    expect(journey.find(entry => entry.stepKey === 'aiguide'))
      .toMatchObject({ state: 'locked', reason: 'awaiting_previous' })
  })

  it('hält sie zu, solange die Foundation ihr Ergebnis nicht hat (§2.1)', () => {
    const journey = resolveBrandJourney(UNLOCKED, [{ stepKey: 'context', state: 'done' }])
    expect(journey.find(entry => entry.stepKey === 'nomenclature'))
      .toMatchObject({ state: 'locked', reason: 'awaiting_previous' })
  })

  it('lässt `nomenclature` die Weiche der Markenarchitektur erben (§2.20 Nr. 4)', () => {
    const solo: BrandProfileFacts = { ...UNLOCKED, subBrands: 'no' }
    expect(includedBrandSteps(solo)).not.toContain('nomenclature')
    expect(includedBrandSteps(solo)).toContain('aiguide')
    const unentschieden: BrandProfileFacts = { ...UNLOCKED, subBrands: 'unknown' }
    const journey = resolveBrandJourney(unentschieden)
    expect(journey.find(entry => entry.stepKey === 'nomenclature'))
      .toMatchObject({ state: 'skipped', reason: 'junction_undecided' })
  })
})

/**
 * DIE VIER LESER + DER IMPACT-HINWEIS (D0-Lehre, §2.17). Ohne Freischaltung
 * darf Schicht 3 NIRGENDS mitzählen oder erscheinen.
 */
describe('K0 — Schicht 3 zählt ohne Freischaltung nirgends mit', () => {
  it('Fortschritts-Cache: eine fertige Foundation bleibt bei 100 %', () => {
    // Der Cache füttert die Marken-Karte und „Schritt x von 9" — beides
    // Aussagen über die FOUNDATION (D1-Begründung, jetzt für Schicht 3).
    const done = (stepKey: BrandStepKey): BrandStepFacts => ({
      stepKey,
      state: 'done',
      slots: Object.fromEntries(requiredSlotsForStep(stepKey)
        .map(slot => [slot.id, { hasValue: true, confirmed: true, accepted: true }])),
    })
    const journey = resolveBrandJourney(
      { ...UNLOCKED, subBrands: 'no', hasName: true, pathKind: 'new' },
      (['context', 'pvm', 'values', 'archetype', 'manifesto', 'verbal', 'result'] as const)
        .map(done),
    )
    // Auch FREIGESCHALTET (der Tag danach): der Prozentwert einer fertigen
    // Foundation darf im Freischalt-Moment nicht fallen.
    expect(journey.some(entry => isBrandKitStep(entry.stepKey) && entry.state !== 'skipped')).toBe(true)
    expect(resolveProfileProgress(journey).currentStepKey).toBe('result')
    expect(resolveProfileProgress(journey).progressPct).toBe(100)
  })

  it('Impact-Hinweis: gesperrte Schicht 3 fällt heraus, freigeschaltet zählt sie mit', () => {
    const gesperrt = BRAND_STEP_KEYS.map(stepKey => ({
      stepKey,
      reason: isBrandKitStep(stepKey) ? 'derivation_locked' : 'completed',
    }))
    const offen = gesperrt.map(entry => ({ ...entry, reason: 'unlocked' }))

    const zu = affectsView('m.types', gesperrt)
    expect(zu).toEqual({ count: 0, steps: [] })
    const auf = affectsView('m.types', offen)
    expect(auf.count).toBe(4)
    expect(auf.steps).toEqual(['nomenclature', 'aiguide'])
  })

  it('Leseansicht: die fünf neuen Anker stehen im Vertrag (K0) und ihre Quellen (K4)', () => {
    // Die Reihenfolge IST der Vertrag (§2.17: verschickte Tieflinks dürfen
    // nicht ins Leere zeigen) — `ki-texte` bleibt, wo es steht.
    expect([...BRAND_FOUNDATION_CHAPTER_IDS]).toEqual([
      'story', 'kontext', 'purpose', 'positionierung', 'architektur', 'nomenklatur',
      'werte', 'stimme', 'manifest', 'messaging', 'name', 'visuell',
      'zeichen-anwendung', 'farbe-anwendung', 'typografie-anwendung', 'pressekit', 'ki-texte',
    ])
    expect(BRAND_FOUNDATION_SOURCE_STEPS.nomenklatur).toEqual(['nomenclature'])
    expect(BRAND_FOUNDATION_SOURCE_STEPS.pressekit).toEqual(['presskit'])
    expect(BRAND_FOUNDATION_SOURCE_STEPS['zeichen-anwendung']).toEqual(['mark'])
    expect(BRAND_FOUNDATION_SOURCE_STEPS['farbe-anwendung']).toEqual(['color'])
    expect(BRAND_FOUNDATION_SOURCE_STEPS['typografie-anwendung']).toEqual(['type'])
    // Kapitel 11 heisst nach Abnahme von `aiguide` „AI-Guidelines" (§2.20
    // Nr. 6) — seit K4 wartet es deshalb auch auf dieses Kapitel. `aiguide`
    // steht ZULETZT: `brandFoundationPendingStep` nimmt das ERSTE offene
    // Quell-Kapitel als Sprungziel, und wer den Rahmen noch nicht hat, soll
    // dorthin und nicht in eine Schicht, die er erst danach betritt.
    expect(BRAND_FOUNDATION_SOURCE_STEPS['ki-texte']).toEqual(['values', 'archetype', 'verbal', 'aiguide'])
  })

  it('Share: die drei Kapitel reisen wie Foundation-Kapitel (§2.5)', () => {
    // Anders als Brand Design, dessen Ergebnis als PRESET reist: Nomenklatur,
    // Guidelines und Pressekit sind Text und gehören ins Handbuch.
    for (const stepKey of BRAND_KIT_STEP_KEYS) {
      expect(isBrandChapterShareable(stepKey), stepKey).toBe(true)
    }
  })
})
