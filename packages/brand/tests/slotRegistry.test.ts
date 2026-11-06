import { describe, expect, it } from 'vitest'
import { techniqueForStep } from '../shared/brandAdvisors'
import { computeSourcesHash } from '../shared/brandSessions'
import {
  BRAND_DESIGN_STEP_KEYS,
  BRAND_FOUNDATION_STEP_KEYS,
  BRAND_KIT_STEP_KEYS,
  BRAND_SLOTS,
  BRAND_SLOT_MAX_LENGTH,
  BRAND_STEP_KEYS,
  BRAND_STEP_SLOTS_MAX_LENGTH,
  type BrandSlot,
  type BrandStepKey,
  REGISTRY_VERSION,
  confirmableRequiredSlotsForStep,
  dependencyClosure,
  exampleKeyFor,
  isBrandDesignStep,
  isBrandKitStep,
  partKeyFor,
  questionKeyFor,
  requiredSlotsForStep,
  sessionKindFor,
  sessionTravels,
  slotById,
  slotIsConfirmable,
  slotIsFilled,
  slotLabelKeyFor,
  slotsForStep,
  stepProgress,
  validateSlotRegistry,
} from '../shared/slotRegistry'

/**
 * Die Registry ist eine TABELLE — Fehler darin sind Tippfehler, keine
 * Logikfehler, und genau deshalb fällt niemandem einer auf. Diese Datei prüft
 * die Invarianten, die der Katalog-Kopf zusagt, und legt zu jeder eine
 * MUTIERTE Fassung vor: eine Prüfung, die nur die richtige Liste kennt, wäre
 * immer grün.
 */

/** Bequemer Baukasten für die Gegenproben — kopiert einen echten Slot. */
function mutate(id: string, patch: Partial<BrandSlot>): readonly BrandSlot[] {
  return BRAND_SLOTS.map(slot => (slot.id === id ? { ...slot, ...patch } : slot))
}

describe('Registry-Invarianten (die echte Liste)', () => {
  it('ist in jeder Hinsicht gültig', () => {
    expect(validateSlotRegistry()).toEqual([])
  })

  it('startet bei Version 1 (Migrationsvertrag §3e)', () => {
    expect(REGISTRY_VERSION).toBe(1)
  })

  it('hat einzigartige Slot-Ids', () => {
    const ids = BRAND_SLOTS.map(slot => slot.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('kennt die neun Bausteine der Foundation, die sechs von Brand Design und die drei von Book & Kit', () => {
    expect([...BRAND_FOUNDATION_STEP_KEYS]).toEqual([
      'context', 'pvm', 'architecture', 'values',
      'archetype', 'manifesto', 'verbal', 'naming', 'result',
    ])
    // Schicht 2 (Konzept §2.1) — ADDITIV und IMMER hinter der Foundation.
    expect([...BRAND_DESIGN_STEP_KEYS]).toEqual([
      'dna', 'color', 'type', 'mark', 'imagery', 'motion',
    ])
    // Schicht 3 (Konzept BRAND-BOOK-KIT.md §2.1) — ADDITIV hinter Brand Design.
    expect([...BRAND_KIT_STEP_KEYS]).toEqual([
      'nomenclature', 'aiguide', 'presskit',
    ])
    expect([...BRAND_STEP_KEYS])
      .toEqual([...BRAND_FOUNDATION_STEP_KEYS, ...BRAND_DESIGN_STEP_KEYS, ...BRAND_KIT_STEP_KEYS])
    for (const slot of BRAND_SLOTS) {
      expect(BRAND_STEP_KEYS).toContain(slot.stepId)
    }
  })

  it('`isBrandDesignStep` / `isBrandKitStep` trennen die drei Schichten — und nur sie', () => {
    for (const stepKey of BRAND_DESIGN_STEP_KEYS) expect(isBrandDesignStep(stepKey)).toBe(true)
    for (const stepKey of BRAND_FOUNDATION_STEP_KEYS) expect(isBrandDesignStep(stepKey)).toBe(false)
    for (const stepKey of BRAND_KIT_STEP_KEYS) expect(isBrandDesignStep(stepKey)).toBe(false)
    expect(isBrandDesignStep('gibt-es-nicht')).toBe(false)

    for (const stepKey of BRAND_KIT_STEP_KEYS) expect(isBrandKitStep(stepKey)).toBe(true)
    for (const stepKey of BRAND_FOUNDATION_STEP_KEYS) expect(isBrandKitStep(stepKey)).toBe(false)
    for (const stepKey of BRAND_DESIGN_STEP_KEYS) expect(isBrandKitStep(stepKey)).toBe(false)
    expect(isBrandKitStep('gibt-es-nicht')).toBe(false)
  })

  it('lässt jede Abhängigkeit auf einen existierenden Slot zeigen', () => {
    const ids = new Set(BRAND_SLOTS.map(slot => slot.id))
    for (const slot of BRAND_SLOTS) {
      for (const dependencyId of slot.dependencies) expect(ids).toContain(dependencyId)
    }
  })

  it('lässt Abhängigkeiten IMMER rückwärts zeigen — damit sind Zyklen strukturell aus', () => {
    const position = new Map(BRAND_SLOTS.map((slot, index) => [slot.id, index]))
    BRAND_SLOTS.forEach((slot, index) => {
      for (const dependencyId of slot.dependencies) {
        expect(position.get(dependencyId)!).toBeLessThan(index)
      }
    })
  })

  it('gibt jedem Baustein mindestens einen Slot', () => {
    for (const stepKey of BRAND_STEP_KEYS) expect(slotsForStep(stepKey).length).toBeGreaterThan(0)
  })

  it('hält jeden Slot unter dem Schema-Anhang-Limit von 20k', () => {
    for (const slot of BRAND_SLOTS) {
      expect(slot.maxLength).toBeLessThanOrEqual(BRAND_SLOT_MAX_LENGTH)
      expect(slot.schema.maxLength).toBe(slot.maxLength)
    }
  })

  it('hält die Summe je Baustein unter dem 200k-Deckel der slots-Spalte', () => {
    for (const stepKey of BRAND_STEP_KEYS) {
      const sum = slotsForStep(stepKey).reduce((total, slot) => total + slot.maxLength, 0)
      expect(sum).toBeLessThanOrEqual(BRAND_STEP_SLOTS_MAX_LENGTH)
    }
  })

  it('baut alle i18n-Schlüssel mechanisch aus der Id', () => {
    for (const slot of BRAND_SLOTS) {
      expect(slot.questionKey).toBe(`brand.q.${slot.id}`)
      expect(slot.helpKey === null || slot.helpKey === `brand.help.${slot.id}`).toBe(true)
    }
  })

  it('kennt genau DREI eigene Instrumente — die Konfidenz ist kein Slot', () => {
    // `d.pairs` (Paarvergleich, P4) und seit Brand Design D0 die zwei
    // Instrumente der Schicht 2: Vorbilder hochladen (D2) und KI-Entwürfe
    // (D5c). Alle drei sind DEKLARIERT und noch nicht gebaut — deshalb sind
    // sie `special` und fallen aus der bedienbaren Pflicht-Menge (s. u.).
    expect(BRAND_SLOTS.filter(slot => slot.type === 'special').map(slot => slot.id))
      .toEqual(['d.pairs', 'g.inspiration', 'j.drafts'])
    expect(BRAND_SLOTS.some(slot => slot.id.includes('confidence'))).toBe(false)
  })

  it('erlaubt Markdown nur dort, wo Plan §3e es erlaubt', () => {
    expect(BRAND_SLOTS.filter(slot => slot.schema.kind === 'richtext').map(slot => slot.id))
      .toEqual(['e.manifesto'])
  })

  it('hat keinen deaktivierten Slot — Version 1 ist der erste Katalog', () => {
    expect(BRAND_SLOTS.filter(slot => slot.deactivated)).toEqual([])
  })
})

describe('Registry-Invarianten — Gegenproben (jede Regel fällt einzeln)', () => {
  it('erkennt eine doppelte Id', () => {
    const broken = [...BRAND_SLOTS, BRAND_SLOTS[0]!]
    expect(validateSlotRegistry(broken).some(line => line.includes('doppelte Slot-Id'))).toBe(true)
  })

  it('erkennt einen unbekannten stepId', () => {
    const broken = mutate('a.pitch', { stepId: 'kontext' as unknown as BrandStepKey })
    expect(validateSlotRegistry(broken).some(line => line.includes('unbekannter stepId'))).toBe(true)
  })

  it('erkennt eine Abhängigkeit ins Leere', () => {
    const broken = mutate('b.purpose', { dependencies: ['a.gibtEsNicht'] })
    expect(validateSlotRegistry(broken).some(line => line.includes('existiert nicht'))).toBe(true)
  })

  it('erkennt eine VORWÄRTS zeigende Abhängigkeit (der Zyklus-Fall)', () => {
    const broken = mutate('a.pitch', { dependencies: ['e.manifesto'] })
    expect(validateSlotRegistry(broken).some(line => line.includes('steht nicht VOR dem Slot'))).toBe(true)
  })

  it('erkennt einen Selbstbezug', () => {
    const broken = mutate('c.final', { dependencies: ['c.final'] })
    expect(validateSlotRegistry(broken).some(line => line.includes('steht nicht VOR dem Slot'))).toBe(true)
  })

  it('erkennt einen Baustein ohne Slot', () => {
    const broken = BRAND_SLOTS.filter(slot => slot.stepId !== 'result')
    expect(validateSlotRegistry(broken).some(line => line.includes('hat keinen aktiven Slot'))).toBe(true)
  })

  it('erkennt eine Überschreitung des 20k-Limits', () => {
    const broken = mutate('e.manifesto', { maxLength: 100_000, schema: { kind: 'richtext', maxLength: 100_000 } })
    expect(validateSlotRegistry(broken).some(line => line.includes('Schema-Anhang §2'))).toBe(true)
  })

  it('erkennt auseinanderlaufende maxLength-Angaben', () => {
    const broken = mutate('a.pitch', { maxLength: 500 })
    expect(validateSlotRegistry(broken).some(line => line.includes('laufen auseinander'))).toBe(true)
  })

  it('erkennt einen von Hand geschriebenen i18n-Schlüssel', () => {
    const broken = mutate('a.origin', { questionKey: 'brand.q.origin' })
    expect(validateSlotRegistry(broken).some(line => line.includes('brand.q.<id>'))).toBe(true)
  })

  it('erkennt einen Baustein, dessen Slots zusammen die 200k sprengen', () => {
    const inflated = BRAND_SLOTS.map(slot => (slot.stepId === 'archetype'
      ? { ...slot, maxLength: BRAND_SLOT_MAX_LENGTH, schema: { ...slot.schema, maxLength: BRAND_SLOT_MAX_LENGTH } }
      : slot))
    // 12 × 20k = 240k > 200k.
    expect(validateSlotRegistry(inflated).some(line => line.includes('Summe maxLength'))).toBe(true)
  })
})

describe('Slot-Zählung je Baustein (der Katalog ist die Quelle)', () => {
  const expected: Record<BrandStepKey, number> = {
    // A 11 · B 10 (purpose/vision/mission sind drei Ids) · B2 5 ·
    // C 9 (discovery1–3 sind drei Ids) · D 12 (primary/secondary sind zwei) ·
    // E 6 (composition ist EIN strukturierter Slot) · E+ 5 · F 8 · Ergebnis 2.
    context: 11,
    pvm: 10,
    architecture: 5,
    values: 9,
    archetype: 12,
    manifesto: 6,
    verbal: 5,
    naming: 8,
    result: 2,
    // Schicht 2 (Konzept §2.2–§2.7): Moodboard 7 (mit Weiche, Vorbildern und
    // Lesung) · Farbwelt 6 · Typografie 3 · Zeichen 5 (`j.pick` ist die Wahl
    // unter den Setzungen) · Bildsprache 4 · Bewegung 4.
    dna: 7,
    color: 6,
    type: 3,
    mark: 5,
    imagery: 4,
    motion: 4,
    // Schicht 3 (Konzept BRAND-BOOK-KIT.md §2.2–§2.4): Nomenklatur 3 ·
    // AI-Guidelines 4 · Pressekit 3.
    nomenclature: 3,
    aiguide: 4,
    presskit: 3,
  }

  for (const stepKey of BRAND_STEP_KEYS) {
    it(`${stepKey}: ${expected[stepKey]} Slots`, () => {
      expect(slotsForStep(stepKey).length).toBe(expected[stepKey])
    })
  }

  it('sind zusammen 107 Slots — 68 Foundation, 29 Brand Design, 10 Book & Kit', () => {
    expect(BRAND_SLOTS.length).toBe(107)
    expect(Object.values(expected).reduce((a, b) => a + b, 0)).toBe(107)
    const foundation = BRAND_SLOTS.filter(slot =>
      !isBrandDesignStep(slot.stepId) && !isBrandKitStep(slot.stepId))
    expect(foundation).toHaveLength(68)
    // 29, nicht die „~27" des Konzepts §2.11: die Zahl dort ist eine Schätzung
    // vor dem Schnitt — gezählt sind 7 + 6 + 3 + 5 + 4 + 4.
    expect(BRAND_SLOTS.filter(slot => isBrandDesignStep(slot.stepId))).toHaveLength(29)
    // 10, die „~8" aus BRAND-BOOK-KIT.md §2.1 ist ebenfalls eine Schätzung vor
    // dem Schnitt — gezählt sind 3 + 4 + 3.
    expect(BRAND_SLOTS.filter(slot => isBrandKitStep(slot.stepId))).toHaveLength(10)
  })

  it('trägt die Ids des Katalogs wörtlich', () => {
    for (const id of ['a.pitch', 'b.purpose', 'c.conflictRule', 'd.pairs', 'e.statements', 'ep.taglines', 'f.checks']) {
      expect(slotById(id)?.id).toBe(id)
    }
  })

  it('kennt genau sieben nicht-pflichtige Slots, jeder mit Grund', () => {
    // Drei in der Foundation (keine Texte zu analysieren · nur im Team gefragt ·
    // ausdrücklich freiwillig), drei in Brand Design (die Vorbilder und ihre
    // Lesung gibt es nur auf dem Weg MIT Vorbildern, die KI-Entwürfe sind ein
    // Angebot und keine Station) — und seit K0 einer in Book & Kit: der
    // Presse-Kontakt ist ausdrücklich optional (§2.19 Nr. 3), ein Pressekit
    // ohne Ansprechperson ist ärmer, aber kein halbes.
    expect(BRAND_SLOTS.filter(slot => !slot.required).map(slot => slot.id))
      .toEqual(['a.toneAnalysis', 'c.teamFilter', 'result.rating',
        'g.inspiration', 'g.reading', 'j.drafts', 'p.contact'])
  })
})

describe('slotsForStep / requiredSlotsForStep / slotById', () => {
  it('liefert nur Slots des Bausteins, in Katalog-Reihenfolge', () => {
    const values = slotsForStep('values').map(slot => slot.id)
    expect(values[0]).toBe('c.discovery1')
    expect(values.at(-1)).toBe('c.teamFilter')
    expect(values.every(id => id.startsWith('c.'))).toBe(true)
  })

  it('lässt den optionalen Team-Slot aus den Pflicht-Slots heraus', () => {
    const required = requiredSlotsForStep('values').map(slot => slot.id)
    expect(required).not.toContain('c.teamFilter')
    expect(required).toHaveLength(8)
  })

  it('findet einen unbekannten Slot nicht', () => {
    expect(slotById('z.nope')).toBeUndefined()
  })
})

/**
 * DIE BEDIENBARE PFLICHT-MENGE (Audit-Befund A4, 2026-09-02).
 *
 * Der Katalog darf mehr verlangen, als heute gebaut ist; das GATE darf es
 * nicht. Genau ein Slot fällt auseinander — der Paarvergleich `d.pairs`, dessen
 * Instrument mit P4 kommt. Solange er in der Pflicht-Menge stand, konnte
 * `archetype` nie abgeschlossen werden (Bühne wie Route lesen dieselbe
 * Rechnung). Die Gegenprobe unten ist der Wächter: taucht ein ZWEITER
 * bedienungsloser Pflicht-Slot auf, ist das keine stille Sackgasse mehr.
 */
/**
 * DIE ANNAHME DER ÜBERSICHTS-KACHEL (Audit-Befund C4).
 *
 * `/dashboard/brands` schaltet den „Euer Branding"-Einstieg frei, sobald
 * `currentStepKey === 'result'` — und das heisst nur deshalb „alles davor ist
 * fertig", weil `result` der LETZTE Baustein des Weges ist
 * (`resolveProfileProgress` nimmt den ersten offenen, sonst den letzten).
 * Rutschte ein neuer Baustein dahinter, ginge das Schloss lautlos auf.
 */
describe('BRAND_FOUNDATION_STEP_KEYS — das Ergebnis steht am Ende der Foundation', () => {
  it('hat `result` als letzten Eintrag der SCHICHT 1', () => {
    // Seit Brand Design D0 ist `result` nicht mehr der letzte Eintrag von
    // `BRAND_STEP_KEYS` — dahinter liegen die sechs Design-Kapitel. Die
    // Zusage der Kachel hängt aber an der FOUNDATION, und genau die steht
    // jetzt in einer eigenen Liste; `resolveProfileProgress` rechnet über sie.
    expect(BRAND_FOUNDATION_STEP_KEYS.at(-1)).toBe('result')
    // Seit K0 steht hinter Brand Design noch Schicht 3 — die Zusage der Kachel
    // hängt weiter allein an `BRAND_FOUNDATION_STEP_KEYS`.
    expect(BRAND_STEP_KEYS.at(-1)).toBe('presskit')
    expect(isBrandKitStep(BRAND_STEP_KEYS.at(-1)!)).toBe(true)
    expect(BRAND_DESIGN_STEP_KEYS.at(-1)).toBe('motion')
  })
})

describe('slotIsConfirmable / confirmableRequiredSlotsForStep', () => {
  it('nennt genau die drei Instrumente unbestätigbar', () => {
    const unconfirmable = BRAND_SLOTS.filter(slot => !slot.deactivated && !slotIsConfirmable(slot))
    expect(unconfirmable.map(slot => slot.id)).toEqual(['d.pairs', 'g.inspiration', 'j.drafts'])
  })

  it('nimmt d.pairs aus der Pflicht-Menge von archetype, sonst nichts', () => {
    const all = requiredSlotsForStep('archetype').map(slot => slot.id)
    const gate = confirmableRequiredSlotsForStep('archetype').map(slot => slot.id)
    expect(all).toContain('d.pairs')
    expect(gate).not.toContain('d.pairs')
    expect(gate).toEqual(all.filter(id => id !== 'd.pairs'))
    // Die vier Ableitungen BLEIBEN drin: sie haben kein Feld, aber sehr wohl
    // eine Zustimmung (`brandSlotControls`) — sie sind Pflicht und bedienbar.
    expect(gate).toEqual(expect.arrayContaining(['d.hypothesis', 'd.primary', 'd.secondary', 'd.gapReveal']))
  })

  it('lässt jeden anderen Baustein unverändert', () => {
    // `dna` und `mark` tragen ihre Instrumente als NICHT-Pflicht — sie fallen
    // schon aus `requiredSlotsForStep` und ändern die Gleichheit nicht.
    for (const stepKey of BRAND_STEP_KEYS.filter(key => key !== 'archetype')) {
      expect(confirmableRequiredSlotsForStep(stepKey)).toEqual(requiredSlotsForStep(stepKey))
    }
  })
})

describe('dependencyClosure', () => {
  it('liefert die transitive Quellmenge, ohne den Slot selbst', () => {
    const closure = dependencyClosure('b.mission')
    expect(closure).toContain('b.purpose')
    // über b.purpose mitgezogen:
    expect(closure).toContain('b.whyStarted')
    expect(closure).toContain('a.origin')
    expect(closure).not.toContain('b.mission')
  })

  it('ist bei einer reinen Menschenfrage leer', () => {
    expect(dependencyClosure('d.party')).toEqual([])
    expect(dependencyClosure('a.complaints')).toEqual([])
  })

  it('liefert stabile Katalog-Reihenfolge (nicht Besuchsreihenfolge)', () => {
    const closure = dependencyClosure('e.manifesto')
    const position = new Map(BRAND_SLOTS.map((slot, index) => [slot.id, index]))
    const positions = closure.map(id => position.get(id)!)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('zieht die ganze Kette bis in den Kontext', () => {
    // ep.taglines ← e.anchorLine ← e.manifesto ← e.statements ← b.purpose ← a.pitch
    expect(dependencyClosure('ep.taglines')).toContain('a.pitch')
  })

  it('gibt für einen unbekannten Slot nichts zurück, statt zu werfen', () => {
    expect(dependencyClosure('z.nope')).toEqual([])
  })

  it('TERMINIERT auch bei einem künstlichen Zyklus (Gegenprobe)', () => {
    const cyclic: BrandSlot[] = [
      { ...BRAND_SLOTS[0]!, id: 'x.a', dependencies: ['x.b'] },
      { ...BRAND_SLOTS[0]!, id: 'x.b', dependencies: ['x.a'] },
    ]
    expect(dependencyClosure('x.a', cyclic)).toEqual(['x.a', 'x.b'])
    // …und der Wächter meldet ihn, statt ihn durchzulassen.
    expect(validateSlotRegistry(cyclic).some(line => line.includes('steht nicht VOR dem Slot'))).toBe(true)
  })
})

describe('stepProgress — die ehrliche Formel', () => {
  it('ist ohne einen einzigen Wert bei 0 %', () => {
    expect(stepProgress('pvm', {})).toEqual({ requiredTotal: 10, requiredFilled: 0, pct: 0 })
  })

  it('zählt schon Georges ENTWURF, nicht erst die Bestätigung', () => {
    expect(stepProgress('pvm', { 'b.purpose': { hasValue: true } }).requiredFilled).toBe(1)
    expect(stepProgress('pvm', { 'b.purpose': { confirmed: true } }).requiredFilled).toBe(1)
  })

  it('rundet auf ganze Prozent (die Form von progressPct)', () => {
    const state = Object.fromEntries(
      requiredSlotsForStep('pvm').slice(0, 3).map(slot => [slot.id, { hasValue: true }]),
    )
    expect(stepProgress('pvm', state).pct).toBe(30)
  })

  it('erreicht 100 %, wenn alle Pflicht-Slots gefüllt sind', () => {
    const state = Object.fromEntries(requiredSlotsForStep('values').map(slot => [slot.id, { confirmed: true }]))
    expect(stepProgress('values', state)).toEqual({ requiredTotal: 8, requiredFilled: 8, pct: 100 })
  })

  it('zählt optionale Slots WEDER oben NOCH unten', () => {
    const state = Object.fromEntries(requiredSlotsForStep('values').map(slot => [slot.id, { confirmed: true }]))
    const withOptional = { ...state, 'c.teamFilter': { confirmed: true } }
    expect(stepProgress('values', withOptional)).toEqual(stepProgress('values', state))
  })

  it('lässt fremde Slot-Ids im Zustand kalt', () => {
    expect(stepProgress('result', { 'b.purpose': { confirmed: true } }).requiredFilled).toBe(0)
  })

  it('behandelt leere Zustände als ungefüllt', () => {
    expect(slotIsFilled(undefined)).toBe(false)
    expect(slotIsFilled({})).toBe(false)
    expect(slotIsFilled({ hasValue: false, confirmed: false })).toBe(false)
    expect(slotIsFilled({ hasValue: true })).toBe(true)
  })
})

describe('exampleKeyFor — dieselben Konventionen unter brand.example', () => {
  it('hängt den Pfad nur an, wo die Frage eine eigene Fassung hat', () => {
    const origin = slotById('a.origin')!
    expect(exampleKeyFor(origin, 'new')).toBe('brand.example.a.origin.new')
    expect(exampleKeyFor(origin, 'relaunch')).toBe('brand.example.a.origin.relaunch')
    const worldLoses = slotById('b.worldLoses')!
    expect(exampleKeyFor(worldLoses, 'new')).toBe('brand.example.b.worldLoses')
    expect(exampleKeyFor(worldLoses, 'relaunch')).toBe('brand.example.b.worldLoses')
  })

  /**
   * DIE TEAM-WEICHE GILT AUCH FÜRS BEISPIEL (Paket 8): sonst stünde unter
   * der Team-Frage von `c.discovery3` die Musterantwort zur Solo-Frage.
   * Wie bei `questionKeyFor` trägt der Schlüssel IMMER ein Suffix — ein
   * JSON-Katalog kann unter einem Schlüssel nicht Text UND Kinder halten.
   */
  it('hängt bei der Team-Variante immer solo/team an', () => {
    const discovery = slotById('c.discovery3')!
    expect(exampleKeyFor(discovery, 'new')).toBe('brand.example.c.discovery3.solo')
    expect(exampleKeyFor(discovery, 'new', 'solo')).toBe('brand.example.c.discovery3.solo')
    expect(exampleKeyFor(discovery, 'relaunch', 'team')).toBe('brand.example.c.discovery3.team')
  })

  /**
   * DAS BEISPIEL FOLGT DER FRAGE NICHT AUTOMATISCH (Anrede-Runde 2026-09-09):
   * die FRAGE spricht George („bekommt ihr" / „bekommst du"), das BEISPIEL
   * spricht der Nutzer („Wir gewinnen kaum Neukunden") — und diese Stimme
   * ändert die Weiche nicht. Deshalb ein eigenes Feld `teamExample`, gesetzt
   * an genau zwei Stellen.
   */
  it('teilt nur die zwei Beispiele, die sich wirklich unterscheiden', () => {
    expect(BRAND_SLOTS.filter(session => session.teamExample).map(session => session.id))
      .toEqual(['a.customerPraise', 'c.discovery3'])
    const praise = slotById('a.customerPraise')!
    expect(exampleKeyFor(praise, 'new', 'solo')).toBe('brand.example.a.customerPraise.solo')
    expect(exampleKeyFor(praise, 'new', 'team')).toBe('brand.example.a.customerPraise.team')
    // Die Frage von `a.complaints` hat eine Solo-Fassung, das Beispiel nicht.
    const complaints = slotById('a.complaints')!
    expect(complaints.teamVariant).toBe(true)
    expect(exampleKeyFor(complaints, 'new', 'team')).toBe('brand.example.a.complaints')
  })

  it('lässt ein eigenes Beispiel nur zu einer eigenen Frage zu', () => {
    // `c.discovery2` fragt beide Seiten der Weiche dasselbe — ein eigenes
    // Beispiel je Weiche zeigte dort auf ein Kind unter einem Schlüssel, den
    // `questionKeyFor` als Zeichenkette liest.
    expect(slotById('c.discovery2')!.teamVariant).toBeUndefined()
    expect(validateSlotRegistry(mutate('c.discovery2', { teamExample: true })))
      .toContain('c.discovery2: teamExample ohne teamVariant')
  })
})

describe('questionKeyFor — die Pfad-Konvention', () => {
  /**
   * ERST DER PFAD, DANN DIE WEICHE. `a.origin` trägt seit dem 2026-09-09
   * BEIDE Achsen: der Relaunch-Pfad fragt etwas anderes, und er redet die
   * Marke an. Die Reihenfolge im Schlüssel ist nicht beliebig — sie sortiert
   * die gröbere Unterscheidung nach oben, sonst stünden dieselben zwei Fragen
   * unter `solo` und unter `team` doppelt im Katalog.
   */
  it('hängt den Pfad nur an, wo es eine eigene Fassung gibt — und die Weiche danach', () => {
    const origin = slotById('a.origin')!
    expect(questionKeyFor(origin, 'new')).toBe('brand.q.a.origin.new.solo')
    expect(questionKeyFor(origin, 'new', 'team')).toBe('brand.q.a.origin.new.team')
    expect(questionKeyFor(origin, 'relaunch')).toBe('brand.q.a.origin.relaunch.solo')
    expect(questionKeyFor(origin, 'relaunch', 'team')).toBe('brand.q.a.origin.relaunch.team')
  })

  it('lässt einen Pfad ohne Variante auf dem Basis-Schlüssel', () => {
    const gap = slotById('d.gapReveal')!
    expect(questionKeyFor(gap, 'relaunch')).toBe('brand.q.d.gapReveal.relaunch')
    expect(questionKeyFor(gap, 'new')).toBe('brand.q.d.gapReveal')
  })

  it('gibt bei Slots ohne Varianten immer den Basis-Schlüssel', () => {
    const discovery2 = slotById('c.discovery2')!
    expect(questionKeyFor(discovery2, 'new')).toBe('brand.q.c.discovery2')
    expect(questionKeyFor(discovery2, 'relaunch', 'team')).toBe('brand.q.c.discovery2')
  })

  it('kennt genau die drei pfad-abhängigen Slots des Katalogs', () => {
    expect(BRAND_SLOTS.filter(slot => slot.pathVariants).map(slot => slot.id))
      .toEqual(['a.origin', 'b.whyStarted', 'd.gapReveal'])
  })
})

/**
 * DIE BESCHRIFTUNGS-REGEL — eine Rechnung für Bühne, Log, Abnahme und den
 * Prompt-Aufbau des Servers (`slotLabelKeyFor`).
 */
describe('slotLabelKeyFor — welcher Fragetext ein Feld beschriftet', () => {
  it('nimmt die Weiche mit, auch wenn der Slot nicht gefragt wird', () => {
    // `d.pairs` ist `special` (der Paarvergleich baut seine eigene Oberfläche)
    // und hat trotzdem eine Solo-Fassung. Die alte Typ-Aufzählung
    // („question oder choice") hätte hier den Basis-Schlüssel geliefert — und
    // der steht seit der Anrede-Runde nicht mehr im Katalog.
    const pairs = slotById('d.pairs')!
    expect(pairs.type).toBe('special')
    expect(slotLabelKeyFor(pairs, 'new', 'solo')).toBe('brand.q.d.pairs.solo')
    expect(slotLabelKeyFor(pairs, 'new', 'team')).toBe('brand.q.d.pairs.team')
  })

  it('hält `d.gapReveal` beim Basis-Schlüssel', () => {
    // Der Slot MELDET eine Relaunch-Fassung an, im Katalog steht sie bis heute
    // nicht (s. `tests/i18nCatalog.test.ts`). Er wird nie gefragt, also
    // beschriftet ihn der Basis-Schlüssel — auf BEIDEN Pfaden.
    const gap = slotById('d.gapReveal')!
    expect(slotLabelKeyFor(gap, 'relaunch', 'team')).toBe('brand.q.d.gapReveal')
    expect(slotLabelKeyFor(gap, 'new', 'solo')).toBe('brand.q.d.gapReveal')
  })

  it('bleibt für gefragte Slots wörtlich `questionKeyFor`', () => {
    for (const slot of BRAND_SLOTS.filter(s => s.type === 'question' || s.type === 'choice')) {
      for (const pathKind of ['new', 'relaunch'] as const) {
        for (const team of ['solo', 'team'] as const) {
          expect(slotLabelKeyFor(slot, pathKind, team)).toBe(questionKeyFor(slot, pathKind, team))
        }
      }
    }
  })
})

/**
 * DER SESSION-VERTRAG (BW2 Paket 1, Plan BRAND-WIZARD-SESSIONS.md §3/§3a).
 *
 * Die Registry ist damit nicht mehr nur eine Feld-Tabelle, sondern die
 * Beschreibung von 68 Arbeitseinheiten. Was hier geprüft wird, ist genau das,
 * was der Plan zusagt — jeweils mit einer MUTIERTEN Fassung als Gegenprobe:
 * eine Prüfung, die nur die richtige Liste kennt, wäre immer grün.
 */
describe('Session-Vertrag', () => {
  it('gibt jeder Session ein nicht-leeres Ziel', () => {
    for (const session of BRAND_SLOTS) expect(session.goal.trim(), session.id).not.toBe('')
  })

  it('meldet ein fehlendes Ziel als Registry-Fehler', () => {
    expect(validateSlotRegistry(mutate('b.purpose', { goal: '' })))
      .toContain('b.purpose: leeres goal — jede Session braucht ein Ziel')
  })

  it('leitet `kind` mechanisch aus dem Füllweg ab — mit der einen Ausnahme', () => {
    const byKind = (kind: string) => BRAND_SLOTS.filter(session => session.kind === kind).map(s => s.id)
    for (const session of BRAND_SLOTS) {
      if (session.id === 'a.facts') continue
      expect(sessionKindFor(session), session.id).toBe(session.kind)
      expect({
        question: 'ask',
        choice: 'choose',
        derivation: 'derive',
        'stage-edit': 'draft',
        special: 'instrument',
      }[session.type], session.id).toBe(session.kind)
    }
    // `a.facts` steht als `choice` im Katalog und ist trotzdem eine SAMMLUNG.
    expect(byKind('collect')).toEqual(['a.facts'])
    expect(slotById('a.facts')!.type).toBe('choice')
    expect(byKind('instrument')).toEqual(['d.pairs', 'g.inspiration', 'j.drafts'])
  })

  it('meldet ein `kind`, das nicht zum Füllweg passt', () => {
    expect(validateSlotRegistry(mutate('b.purpose', { kind: 'ask' })))
      .toContain('b.purpose: kind "ask" passt nicht zum type "stage-edit"')
  })

  it('gibt Teile NUR der Sammel-Session', () => {
    expect(slotById('a.facts')!.parts).toEqual(['teamSize', 'age', 'markets'])
    for (const session of BRAND_SLOTS) {
      if (session.kind === 'collect') continue
      expect(session.parts, session.id).toEqual([])
    }
    expect(validateSlotRegistry(mutate('b.purpose', { parts: ['x'] })))
      .toContain('b.purpose: parts sind nur bei kind "collect" erlaubt')
    expect(validateSlotRegistry(mutate('a.facts', { parts: [] })))
      .toContain('a.facts: kind "collect" ohne parts')
  })

  it('führt `inputs.slots` und `dependencies` als DIESELBE Liste', () => {
    for (const session of BRAND_SLOTS) {
      expect(session.inputs.slots, session.id).toBe(session.dependencies)
    }
    expect(validateSlotRegistry(mutate('b.purpose', { inputs: { ...slotById('b.purpose')!.inputs, slots: [] } })))
      .toContain('b.purpose: inputs.slots und dependencies sind nicht dieselbe Liste')
  })

  it('spiegelt Schema, Editor und Generator im Output-Vertrag', () => {
    for (const session of BRAND_SLOTS) {
      expect(session.output.schema, session.id).toEqual(session.schema)
      expect(session.output.editor, session.id).toBe(session.editor)
      expect(session.output.generator, session.id).toBe(session.generator)
    }
    const purpose = slotById('b.purpose')!
    expect(validateSlotRegistry(mutate('b.purpose', {
      output: { ...purpose.output, editor: 'chips' },
    }))).toContain('b.purpose: output.editor/generator laufen auseinander')
  })

  it('gibt jeder Session genau EINE Technik — die ihres Kapitels', () => {
    for (const session of BRAND_SLOTS) {
      expect(session.processing.technique, session.id).toBe(techniqueForStep(session.stepId).key)
    }
    // Und sie ist nicht überall dieselbe — sonst prüfte die Zeile oben nichts.
    expect(new Set(BRAND_SLOTS.map(session => session.processing.technique)).size).toBeGreaterThan(1)
  })

  it('setzt Vertraulichkeit und Umfang für jede Session', () => {
    for (const session of BRAND_SLOTS) {
      expect(['public', 'internal', 'private'], session.id).toContain(session.sensitivity)
      expect([1, 2, 3, 5, 10], session.id).toContain(session.effort.minutes)
      expect(session.effort.turns, session.id).toBeGreaterThan(0)
    }
  })

  it('hält genau die sieben heiklen Sessions zurück (Plan §3a Nr. 7)', () => {
    // Drei nennt der Plan (Beschwerden, Herausforderung, Zahlen); die vierte ist
    // Davids Entscheidung vom 2026-09-04 (Audit Punkt 8): `a.competitors` nennt
    // NAMENTLICH Dritte und zu jedem eine Schwäche — das Erste, was ein Kunde
    // nicht teilen will. Umgekehrt ist `b2.roleOfMaster` zurück auf `public`:
    // die Architektur-Aussage wird im geteilten Dokument gebraucht, sobald
    // `b2.rule` darauf verweist.
    // Drei kommen mit Brand Design D0 dazu (Konzept §2.13): die hochgeladenen
    // VORBILDER sind Fremdwerke, ihre LESUNG beschreibt fremde Werke, und die
    // KI-ENTWÜRFE sind ausdrücklich privat (§1.11 b) — keines von dreien reist
    // je in Snapshot, Share oder Beispiel.
    expect(BRAND_SLOTS.filter(session => session.sensitivity !== 'public').map(session => session.id))
      .toEqual(['a.complaints', 'a.challenge', 'a.facts', 'a.competitors',
        'g.inspiration', 'g.reading', 'j.drafts'])
  })

  it('gibt jeder Session eine Zielgruppe (BF-Leseansicht §2.3)', () => {
    for (const session of BRAND_SLOTS) {
      expect(['foundation', 'internal'], session.id).toContain(session.audience)
    }
    // Und beide Werte kommen vor — sonst prüfte die Zeile oben nichts.
    expect(BRAND_SLOTS.some(session => session.audience === 'foundation')).toBe(true)
    expect(BRAND_SLOTS.some(session => session.audience === 'internal')).toBe(true)
  })

  it('macht aus jeder Menschenfrage Material und aus jedem Entwurf eine Festlegung — bis auf die Ausnahmen', () => {
    // Die Ausnahmen sind namentlich in `slotRegistry.ts` begründet; hier steht,
    // dass es genau DIESE sind. Eine neue Ausnahme muss also durch diesen Test.
    const abweichend = BRAND_SLOTS
      .filter((session) => {
        const default_ = session.type === 'question' || session.type === 'special' ? 'internal' : 'foundation'
        return session.audience !== default_
      })
      .map(session => session.id)
    expect(abweichend).toEqual([
      // vertraulich ⇒ intern (Verbindungsregel, s. u.). Seit dem Gruppen-Umbau
      // (2026-09-09) stehen die Fragen des Kapitels `context` vor seinen
      // Ableitungen — daher `a.facts` vor `a.competitors`/`a.toneAnalysis`.
      'a.facts',
      'a.competitors',
      'a.toneAnalysis',
      // Menschenfragen, die eine Festlegung sind
      'b.positioningFirstChoice',
      'c.candidates',
      'c.livedExamples',
      'c.conflictRule',
      'c.teamFilter',
      // Nachzug 2026-09-09: `d.emotion` ist eine der vier abhängigkeitsfreien
      // Menschenfragen, die in `archetype` vor die Ableitungen gerückt sind —
      // deshalb steht sie hier jetzt vor `d.hypothesis`/`d.gapReveal`.
      'd.emotion',
      'd.hypothesis',
      'd.gapReveal',
      'd.vocabulary',
      'e.statements',
      'f.nameType',
      'f.candidates',
      'f.shortlist',
      'result.direction',
      'result.rating',
      // Brand Design D0: die Weiche „Habt ihr Vorbilder?" ist eine Auskunft
      // über die Sitzung, `g.boards` der Vorrat vor der Wahl (`g.board`).
      'g.source',
      // vertraulich ⇒ intern (Verbindungsregel)
      'g.reading',
      'g.boards',
      // Book & Kit K0: der Presse-Kontakt ist eine Menschenfrage und trotzdem
      // eine Festlegung — er steht im Pressekit und reist BY DESIGN (§2.4).
      'p.contact',
    ])
  })

  it('DIE VERBINDUNGSREGEL: was nicht reisen darf, ist auch keine Festlegung', () => {
    for (const session of BRAND_SLOTS.filter(session => session.sensitivity !== 'public')) {
      expect(session.audience, session.id).toBe('internal')
    }
    // GEGENPROBE 1: eine Fassung, die beides behauptet, wird gemeldet.
    expect(validateSlotRegistry(mutate('a.complaints', { audience: 'foundation' })))
      .toContain('a.complaints: sensitivity "internal" verlangt audience "internal"')
    // GEGENPROBE 2: umgekehrt gilt sie NICHT — `a.origin` ist öffentlich und
    // trotzdem intern (eine Rohantwort, kein Handbuch-Inhalt). Das ist der
    // ganze Grund für das zweite Feld.
    expect(slotById('a.origin')!.sensitivity).toBe('public')
    expect(slotById('a.origin')!.audience).toBe('internal')
    expect(validateSlotRegistry()).toEqual([])
  })

  it('`sessionTravels` verlangt BEIDES — öffentlich und Festlegung', () => {
    expect(sessionTravels(slotById('b.purpose')!)).toBe(true)
    expect(sessionTravels(slotById('a.origin')!), 'öffentliche Rohantwort').toBe(false)
    expect(sessionTravels(slotById('a.competitors')!), 'vertraulich').toBe(false)
    expect(
      sessionTravels({ sensitivity: 'public', audience: 'foundation', deactivated: true }),
      'abgeschaltet',
    ).toBe(false)
  })

  it('lässt `audience` in KEINEN Hash-Input einfliessen (Registry-Fassung bleibt 1)', () => {
    // §2.7: das Feld berührt weder Prompt noch Quell-Stand. Liefe es in den
    // Hash, färbte der Deploy jedes bestätigte Feld eines fertigen Brandings
    // bernstein.
    expect(REGISTRY_VERSION).toBe(1)
    const facts = { 'a.pitch': { value: 'Wir rösten eine Sorte pro Saison.' } }
    for (const session of BRAND_SLOTS) {
      const gedreht: BrandSlot = {
        ...session,
        audience: session.audience === 'foundation' ? 'internal' : 'foundation',
      }
      expect(computeSourcesHash(gedreht, facts), session.id).toBe(computeSourcesHash(session, facts))
    }
  })

  it('lässt Invarianten nur auf Sessions zeigen, die VOR ihnen stehen', () => {
    const position = new Map(BRAND_SLOTS.map((session, index) => [session.id, index]))
    BRAND_SLOTS.forEach((session, index) => {
      for (const invariant of session.invariants) {
        if (invariant.of === undefined) continue
        expect(position.get(invariant.of), `${session.id} → ${invariant.of}`).toBeLessThan(index)
      }
    })
  })

  it('meldet eine Invariante, die nach vorne zeigt', () => {
    expect(validateSlotRegistry(mutate('c.final', { invariants: [{ kind: 'memberOf', of: 'f.shortlist' }] })))
      .toContain('c.final: Invariante zeigt auf "f.shortlist", der nicht VOR dem Slot steht')
    expect(validateSlotRegistry(mutate('c.final', { invariants: [{ kind: 'memberOf', of: 'gibtsnicht' }] })))
      .toContain('c.final: Invariante zeigt auf unbekannten Slot "gibtsnicht"')
  })

  it('gibt jeder Session 3 bis 5 prüfbare Qualitätsmerkmale', () => {
    for (const session of BRAND_SLOTS) {
      expect(session.quality.length, session.id).toBeGreaterThanOrEqual(3)
      expect(session.quality.length, session.id).toBeLessThanOrEqual(5)
    }
    expect(validateSlotRegistry(mutate('b.purpose', { quality: ['nur eines'] })))
      .toContain('b.purpose: 1 Qualitätsmerkmale — verlangt sind 3 bis 5')
  })

  it('gibt jeder Session mindestens zwei Anti-Muster', () => {
    for (const session of BRAND_SLOTS) {
      expect(session.antiPatterns.length, session.id).toBeGreaterThanOrEqual(2)
    }
    expect(validateSlotRegistry(mutate('b.purpose', { antiPatterns: ['eines'] })))
      .toContain('b.purpose: weniger als zwei Anti-Muster')
  })

  it('gibt eine Leiter NUR den Sessions, in denen jemand gefragt wird', () => {
    const asks = (session: BrandSlot) =>
      session.kind === 'ask' || session.kind === 'collect' || session.kind === 'choose'
    for (const session of BRAND_SLOTS) {
      if (asks(session)) expect(session.ladder.opening.trim(), session.id).not.toBe('')
      else expect(session.ladder.opening, session.id).toBe('')
    }
    // Foundation: 29 Fragen + 1 Sammlung (a.facts) + 15 Auswahlen = 45. Die
    // Registry führt dort 16 `choice`-Slots, aber `a.facts` ist davon die
    // Sammlung (Plan, Anhang A). Brand Design legt 11 Auswahlen dazu.
    expect(BRAND_SLOTS.filter(asks)).toHaveLength(61)
    expect(BRAND_SLOTS.filter(session => asks(session) && isBrandDesignStep(session.stepId)))
      .toHaveLength(11)
    // Book & Kit legt vier Auswahlen (`m.types`, `n.scope`, `n.review`,
    // `p.facts`) und eine Menschenfrage (`p.contact`) dazu.
    expect(BRAND_SLOTS.filter(session => asks(session) && isBrandKitStep(session.stepId)))
      .toHaveLength(5)

    expect(validateSlotRegistry(mutate('a.origin', {
      ladder: { opening: '', probes: [], reframes: [] },
    }))).toContain('a.origin: kind "ask" ohne Eröffnung in der Leiter')
    expect(validateSlotRegistry(mutate('b.purpose', {
      ladder: { opening: 'etwas', probes: [], reframes: [] },
    }))).toContain('b.purpose: kind "draft" braucht keine Leiter — hier fragt niemand')
  })

  it('gibt jeder Entwurfs-Session ein Beispiel je Pfad UND je Sprache', () => {
    const drafts = BRAND_SLOTS.filter(session =>
      session.kind === 'derive' || session.kind === 'draft' || session.generator === 'candidates')
    // Foundation: 11 Ableitungen + 11 Entwürfe + `ep.taglines` (Auswahl mit
    // Kandidaten-Generator) = 23. Brand Design legt 10 Ableitungen und 6
    // Entwürfe dazu.
    // Book & Kit legt vier Ableitungen (`m.patterns`, `n.guardrails`,
    // `n.prompts`, `p.summary`) und einen Entwurf (`m.rules`) dazu.
    expect(drafts).toHaveLength(44)
    for (const session of drafts) {
      for (const pathKind of ['new', 'relaunch'] as const) {
        expect(session.examples[pathKind].de.length, `${session.id}/${pathKind}/de`).toBeGreaterThan(0)
        expect(session.examples[pathKind].en.length, `${session.id}/${pathKind}/en`).toBeGreaterThan(0)
      }
    }

    const purpose = slotById('b.purpose')!
    expect(validateSlotRegistry(mutate('b.purpose', {
      examples: { ...purpose.examples, relaunch: { de: [], en: [] } },
    }))).toContain('b.purpose: kein Beispiel für Pfad "relaunch" in "de"')
  })

  it('lässt genau zwei Sessions bewusst ohne Beispiel', () => {
    // `d.pairs` ist ein Instrument (der Wert entsteht Karte gegen Karte) und
    // `result.rating` eine freiwillige Zahl — beides sind Fälle, in denen ein
    // Beispiel keine Form zeigte, sondern nur ein Ergebnis vorwegnähme.
    //
    // Brand Design legt dieselbe Sorte dazu: die zwei Instrumente (`g.inspiration`
    // nimmt Dateien entgegen, `j.drafts` erzeugt auf Knopfdruck) und neun reine
    // AUSWAHLEN, die aus einer geschlossenen Menge gewählt werden — dort zeigte
    // ein Beispiel keine Form, sondern nähme die Wahl vorweg.
    const withoutExamples = BRAND_SLOTS
      .filter(session => session.examples.new.de.length === 0 && session.examples.relaunch.de.length === 0)
      .map(session => session.id)
    expect(withoutExamples).toEqual([
      'd.pairs', 'result.rating',
      'g.source', 'g.inspiration', 'g.board',
      'h.neutral', 'h.accent',
      'i.pair',
      'j.kind', 'j.pick', 'j.drafts',
      'k.illustration', 'k.icons',
      'l.tempo', 'l.logo',
      // Book & Kit K0: dieselbe Sorte — vier reine AUSWAHLEN aus geschlossenen
      // Mengen und die Kontaktfrage, deren „Beispiel" der Composer-Platzhalter
      // ist (`brand.example.p.contact`), nicht ein Formvorbild im Prompt.
      'm.types', 'n.scope', 'n.review', 'p.facts', 'p.contact',
    ])
  })

  it('meldet einen unbrauchbaren Umfang', () => {
    expect(validateSlotRegistry(mutate('b.purpose', { effort: { minutes: 3, turns: 0 } })))
      .toContain('b.purpose: unbrauchbarer Umfang (3 min, 0 Züge)')
  })

  it('hält spitze Klammern aus allem heraus, was ein MENSCH liest', () => {
    // Die Verarbeitungsregeln dürfen sie tragen (die Formeln brauchen ihre
    // Platzhalter) — Ziel, Qualität, Anti-Muster, Leiter und Beispiele nicht:
    // die stehen im Info-Modal und auf der Abnahme-Seite.
    expect(BRAND_SLOTS.some(session => session.processing.rules.some(rule => /[<>]/.test(rule)))).toBe(true)
    expect(validateSlotRegistry(mutate('a.origin', { goal: 'capture <what>' })))
      .toContain('a.origin: spitze Klammern in goal')
    expect(validateSlotRegistry(mutate('a.origin', {
      examples: { new: { de: ['<name>'], en: [] }, relaunch: { de: [], en: [] } },
    }))).toContain('a.origin: spitze Klammern in examples')
  })

  it('hält den Basispfad bei 70 bis 80 Minuten (Davids Entscheidung 2026-09-04)', () => {
    // Die alte Summe war 154 Min im Basispfad — gegen die Kommunikationslinie
    // „~45 Minuten" (Content-Spec §16). Entschieden ist „halbieren und in
    // Kapitel-Etappen kommunizieren". Die SPANNE steht hier und nicht die
    // genaue Zahl: eine einzelne Session darf sich bewegen, die Zusage nicht.
    const OPTIONAL: readonly string[] = ['architecture', 'naming']
    // NUR die FOUNDATION: die Zusage „~45 Minuten, halbiert auf ~77" ist die
    // des Fundaments (Content-Spec §16). Brand Design ist eine eigene, extra
    // freigeschaltete Schicht mit eigener Uhr — sie hier mitzuzählen hiesse,
    // eine Kommunikationslinie an einem Produkt zu messen, das der Kunde ohne
    // Freischaltung gar nicht sieht.
    const active = BRAND_SLOTS.filter(session => !session.deactivated
      && !isBrandDesignStep(session.stepId) && !isBrandKitStep(session.stepId))
    const minutes = (sessions: readonly BrandSlot[]) =>
      sessions.reduce((sum, session) => sum + session.effort.minutes, 0)
    const base = minutes(active.filter(session => !OPTIONAL.includes(session.stepId)))
    const full = minutes(active)

    expect(base, `Basispfad ${base} Min`).toBeGreaterThanOrEqual(70)
    expect(base, `Basispfad ${base} Min`).toBeLessThanOrEqual(80)
    // Der Vollpfad ist der Basispfad plus zwei Kapitel hinter einer Weiche —
    // er muss grösser sein, sonst rechnet die Zeile oben über die falsche Menge.
    expect(full).toBeGreaterThan(base)
    expect(full).toBeLessThanOrEqual(100)
  })

  it('schreibt keine Nachfrage auf, die der Deckel verbietet (Audit Teil 3 Nr. 1)', () => {
    const contradicting = BRAND_SLOTS
      .filter(session => session.answers.maxProbes < session.ladder.probes.length)
      .map(session => `${session.id}: ${session.ladder.probes.length} > ${session.answers.maxProbes}`)
    expect(contradicting).toEqual([])
    // Ohne diese Zeile wäre der Test grün, sobald keine Leiter mehr Nachfragen
    // trägt — 14 Auswahl-Sessions standen genau deshalb im Audit.
    expect(BRAND_SLOTS.filter(session => session.ladder.probes.length > 0).length).toBeGreaterThan(20)

    expect(validateSlotRegistry(mutate('c.final', {
      answers: { ...slotById('c.final')!.answers, maxProbes: 0 },
    }))).toContain('c.final: 1 Nachfragen in der Leiter, aber maxProbes 0')
  })

  it('gibt Frage- und Auswahl-Sessions genug Züge für ihre Leiter', () => {
    for (const session of BRAND_SLOTS) {
      if (session.kind !== 'ask' && session.kind !== 'choose') continue
      expect(session.effort.turns, session.id).toBeGreaterThanOrEqual(1 + session.answers.maxProbes)
    }
    expect(validateSlotRegistry(mutate('a.origin', { effort: { minutes: 2, turns: 2 } })))
      .toContain('a.origin: 2 Züge tragen keine Eröffnung plus 2 Nachfragen')
  })

  it('lässt in Beispielen, in denen die MARKE spricht, keine Anrede zu', () => {
    // Davids Entscheidung 2026-09-04 (Audit Punkt 5): wessen Kundschaft geduzt
    // oder gesiezt wird, entscheidet diese Marke — nicht unser Beispiel. Der
    // Bruch stand in `ep.keyMessages`: „Sie müssen nicht ausziehen" auf dem
    // einen Pfad, „dass ihr wiederkommt" auf dem anderen.
    //
    // GEPRÜFT WIRD DIE LISTE, IN DER DIE MARKE SPRICHT — nicht alle Beispiele:
    // wo George oder der Kunde spricht (`d.hypothesis`, `d.gapReveal`,
    // `a.customerPraise` …), IST „ihr/euch" der richtige Ton.
    const BRAND_SPEAKS = [
      'a.pitch', 'b.whyStarted', 'b.purpose', 'b.vision', 'b.mission', 'b2.rule',
      'c.definitions', 'd.voiceSamples',
      'e.statements', 'e.manifesto', 'e.anchorLine',
      'ep.taglines', 'ep.boilerplates', 'ep.keyMessages', 'ep.distinctiveAsset',
    ]
    const GERMAN = /\b(du|dich|dir|dein\w*|euch|euer|eure\w*|ihr)\b/i
    const FORMAL = /\b(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer)\b/
    const ENGLISH = /\b(you|your|yours)\b/i

    const hits: string[] = []
    for (const id of BRAND_SPEAKS) {
      const session = slotById(id)!
      for (const pathKind of ['new', 'relaunch'] as const) {
        for (const text of session.examples[pathKind].de) {
          if (GERMAN.test(text) || FORMAL.test(text)) hits.push(`${id}/${pathKind}/de`)
        }
        for (const text of session.examples[pathKind].en) {
          if (ENGLISH.test(text)) hits.push(`${id}/${pathKind}/en`)
        }
      }
    }
    expect(hits).toEqual([])
    // GEGENPROBE: die Muster greifen überhaupt.
    expect(GERMAN.test('Sie müssen nicht ausziehen, damit ihr wiederkommt')).toBe(true)
    expect(FORMAL.test('Sie müssen nicht ausziehen')).toBe(true)
    expect(ENGLISH.test('You do not have to move out')).toBe(true)
    // Und die Liste ist nicht leer geworden.
    expect(BRAND_SPEAKS.every(id => slotById(id) !== undefined)).toBe(true)
  })

  it('führt die Weiche W3 an 49 Sessions — eine andere Frage, 48-mal eine andere Anrede', () => {
    /**
     * ZWEI GRÜNDE, EIN FELD. `c.discovery3` fragt solo etwas ANDERES (Paket
     * 2b: D3 statt D7). Die anderen 48 fragen dasselbe und reden nur anders:
     * die abgenommenen Texte sagen „ihr/euch/euer", und auf der Weiche
     * „Nur ich" ist das falsch (Davids Entscheidung 2026-09-09).
     *
     * Die ZAHL steht hier, damit ein stilles Wegfallen auffällt; WELCHE Texte
     * es sind, prüft `tests/i18nCatalog.test.ts` gegen den Katalog.
     */
    const withTeam = BRAND_SLOTS.filter(session => session.teamVariant)
    expect(withTeam).toHaveLength(49)
    expect(withTeam.map(session => session.id)).toContain('c.discovery3')

    const discovery3 = slotById('c.discovery3')!
    expect(questionKeyFor(discovery3, 'new', 'solo')).toBe('brand.q.c.discovery3.solo')
    expect(questionKeyFor(discovery3, 'relaunch', 'team')).toBe('brand.q.c.discovery3.team')
    // Ohne Angabe gilt die persönliche Fassung — sie passt immer.
    expect(questionKeyFor(discovery3, 'new')).toBe('brand.q.c.discovery3.solo')
    // Eine Session OHNE Team-Fassung bleibt unberührt.
    expect(questionKeyFor(slotById('c.discovery2')!, 'new', 'team')).toBe('brand.q.c.discovery2')
    // Pfad- und Team-Variante zugleich sind seit dem 2026-09-09 erlaubt — und
    // zwar an genau zwei Slots, weil ihr Relaunch-Wortlaut die Marke anredet.
    expect(BRAND_SLOTS.filter(session => session.teamVariant && session.pathVariants).map(s => s.id))
      .toEqual(['a.origin', 'b.whyStarted'])
  })

  it('trägt die beiden Invarianten-Entscheidungen aus Paket 2', () => {
    // `f.decision` ist „top three, in order" — eine LISTE, deren Zeilen alle
    // aus der Shortlist stammen müssen (Paket-1-Befund (b), jetzt entschieden).
    expect(slotById('f.decision')!.invariants).toEqual([{ kind: 'subsetOf', of: 'f.shortlist' }])
    // `f.shortlist` bekommt BEWUSST keine: eine Kandidaten-Zeile trägt laut
    // Content-Spec §10 den Namenstyp mit, `subsetOf` verglich also Zeilen, die
    // nie gleich sein können.
    expect(slotById('f.shortlist')!.invariants).toEqual([])
    expect(slotById('c.final')!.invariants).toEqual([{ kind: 'count', min: 3, max: 5 }])
    expect(slotById('e.anchorLine')!.invariants).toEqual([{ kind: 'sentenceOf', of: 'e.manifesto' }])
  })

  it('lässt vertagen, wo jemand fehlt, der nicht am Tisch sitzt', () => {
    // Zahlen (a.facts), Team-Fragen (Konfliktregel, Einstellungsfilter) und das
    // ganze Kapitel Markenarchitektur — überall dort ist die Alternative zum
    // Vertagen eine erfundene Antwort.
    //
    // PAKET 2b hat die Liste mit sich selbst in Einklang gebracht (Audit Punkt
    // 7): `b2.model` und `b2.rule` sind dazugekommen (wer die drei VORFRAGEN
    // vertagen darf, kann die ENTSCHEIDUNG daraus erst recht nicht allein
    // treffen), ebenso `c.livedExamples` („ein echtes Beispiel je Wert, mit
    // Datum, Ort oder Person"). RAUS ist `f.noGos` — die persönlichste
    // Geschmacksfrage des Bausteins braucht niemanden, der gerade fehlt.
    expect(BRAND_SLOTS.filter(session => session.answers.allowDefer).map(session => session.id))
      .toEqual([
        'a.facts',
        'b2.visibility', 'b2.roleOfMaster', 'b2.namingPattern', 'b2.model', 'b2.rule',
        'c.livedExamples', 'c.conflictRule', 'c.teamFilter',
        // Book & Kit K0: wer die Presse-Zuständigkeit erst klären muss, soll
        // das Kapitel trotzdem abschliessen können (§2.19 Nr. 3).
        'p.contact',
      ])
  })

  it('nennt die Teile der Sammel-Session so, wie der Locale-Katalog sie führt', () => {
    const facts = slotById('a.facts')!
    // OHNE Weiche fällt jeder Teil auf `solo` zurück — und die zwei Teile, die
    // die Marke anreden, tragen dort ein Suffix (`teamParts`).
    expect(facts.parts.map(part => partKeyFor(facts, part))).toEqual([
      'brand.part.a.facts.teamSize',
      'brand.part.a.facts.age.solo',
      'brand.part.a.facts.markets.solo',
    ])
    expect(facts.parts.map(part => partKeyFor(facts, part, 'team'))).toEqual([
      // „Wie viele Leute arbeiten mit" ist auf beiden Seiten derselbe Satz —
      // deshalb hat `teamSize` keine zweite Fassung und keinen Suffix.
      'brand.part.a.facts.teamSize',
      'brand.part.a.facts.age.team',
      'brand.part.a.facts.markets.team',
    ])
  })

  it('kennt zu jedem Inhalts-Eintrag eine Session', () => {
    // Die Gegenprobe läuft über die echte Registry: ein verwaister Eintrag
    // wäre ein Tippfehler in einer Id und ein Ziel, das niemand liest.
    expect(validateSlotRegistry()).toEqual([])
  })
})
