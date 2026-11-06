import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BRAND_CONFIDENCE_VALUES,
  BRAND_SETTABLE_CONFIDENCE_VALUES,
  type BrandConfidence,
  type BrandJourneyStep,
  type BrandProfileFacts,
  type BrandStepFacts,
  applyJunctionChange,
  brandAcceptableSessions,
  brandNamingIncluded,
  brandSessionAcceptable,
  brandStepAcceptance,
  brandStepCompletion,
  canEnterBrandStep,
  conditionalInputCounts,
  firstOpenBrandStep,
  includedBrandSteps,
  pickNextSession,
  resolveBrandJourney,
  resolveNextQuestion,
  resolveNextSession,
  resolveNextStop,
  resolveSessionStates,
  skippedSessionsBetween,
  transitionBrandStep,
} from '../shared/brandJourney'
import { brandRestartImpact, computeSourcesHash, sessionsAffectedBy } from '../shared/brandSessions'
import {
  BRAND_DESIGN_STEP_KEYS,
  BRAND_FOUNDATION_STEP_KEYS,
  BRAND_KIT_STEP_KEYS,
  BRAND_SLOTS,
  BRAND_STEP_KEYS,
  type BrandSlotStateFacts,
  type BrandStepKey,
  confirmableRequiredSlotsForStep,
  isBrandDesignStep,
  isBrandKitStep,
  requiredSlotsForStep,
  slotById,
  slotsForStep,
  stepProgress,
} from '../shared/slotRegistry'

/**
 * Die Zustandsmaschine. Geprüft wird nicht nur, dass der Weg funktioniert,
 * sondern vor allem, dass er sich NICHT abkürzen lässt: jede Verweigerung hat
 * hier ihren eigenen Fall, und der Happy-Path wird einmal ganz durchgespielt.
 */

/**
 * DIE SCHLÜSSELMENGE BEIDER KATALOGE, flach — für den einen Test, der beweist,
 * dass `resolveNextQuestion` keinen Schlüssel liefert, den es nicht gibt.
 * Dieselbe Rechnung wie in `i18nCatalog.test.ts`, bewusst als kleine Kopie:
 * dort wird der KATALOG gegen die Registry geprüft, hier eine RECHNUNG gegen
 * den Katalog — ein geteilter Helfer verbände zwei Beweise, die aus
 * verschiedenen Gründen rot werden sollen.
 */
function flattenKeys(node: unknown, prefix: string, into: Set<string>): Set<string> {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return into
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) flattenKeys(value, path, into)
    else into.add(path)
  }
  return into
}

const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'i18n', 'locales')
const CATALOG_KEYS = {
  de: flattenKeys(JSON.parse(readFileSync(join(localesDir, 'de.json'), 'utf8')), '', new Set<string>()),
  en: flattenKeys(JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf8')), '', new Set<string>()),
}

/** Der Basispfad der Interaktionsbilanz: neue Marke, solo, ohne B2, ohne F. */
const BASE_PROFILE: BrandProfileFacts = {
  pathKind: 'new',
  hasName: true,
  team: 'solo',
  subBrands: 'no',
}

/** Der Vollpfad: Relaunch/Neuschnitt, Team, mit B2 und mit F. */
const FULL_PROFILE: BrandProfileFacts = {
  pathKind: 'relaunch',
  relaunchScope: 'recut',
  hasName: true,
  namingOpted: true,
  team: 'team',
  subBrands: 'yes',
}

function stateOf(journey: readonly BrandJourneyStep[], stepKey: BrandStepKey) {
  return journey.find(step => step.stepKey === stepKey)!
}

/**
 * Ein Baustein mit ALLEN Pflicht-Slots bestätigt UND abgenommen.
 *
 * `accepted` steht seit BW2 Paket 3b mit drin: der Abschluss verlangt nicht
 * mehr nur, dass alles GESAGT ist, sondern auch, dass es auf der Finalen
 * Abnahme gelesen wurde (§5a). Ein „fertiger" Baustein ohne Abnahme wäre in
 * dieser Fassung kein fertiger mehr.
 */
function completedStep(stepKey: BrandStepKey, confidence: BrandConfidence = 'fits'): BrandStepFacts {
  return {
    stepKey,
    state: 'done',
    confidence,
    slots: Object.fromEntries(requiredSlotsForStep(stepKey)
      .map(slot => [slot.id, { hasValue: true, confirmed: true, accepted: true }])),
  }
}

function filledActiveStep(stepKey: BrandStepKey): BrandStepFacts {
  return { ...completedStep(stepKey), state: 'active', confidence: null }
}

describe('includedBrandSteps — die Weichen', () => {
  it('Basispfad: sieben Bausteine, ohne architecture und naming', () => {
    // Die WEICHEN kennen Brand Design nicht: Schicht 2 liegt auf JEDEM Weg und
    // wird über die FREISCHALTUNG gesperrt, nicht über eine Weiche (s. u.).
    // `includedBrandSteps` beantwortet nur die erste Frage.
    expect(includedBrandSteps(BASE_PROFILE).filter(key => !isBrandDesignStep(key)))
      .toEqual(['context', 'pvm', 'values', 'archetype', 'manifesto', 'verbal', 'result'])
    expect(includedBrandSteps(BASE_PROFILE).filter(isBrandDesignStep))
      .toEqual([...BRAND_DESIGN_STEP_KEYS])
    // SCHICHT 3 DAGEGEN LIEGT OHNE FREISCHALTUNG GAR NICHT AUF DEM WEG (K0,
    // §2.8) — anders als Schicht 2, die dort gesperrt steht. Der Unterschied
    // ist die D0-Lehre: was nicht auf dem Weg liegt, zählt nirgends mit.
    expect(includedBrandSteps(BASE_PROFILE).filter(isBrandKitStep)).toEqual([])
  })

  it('Vollpfad: alle neun der Foundation plus die sechs von Brand Design', () => {
    expect(includedBrandSteps(FULL_PROFILE))
      .toEqual([...BRAND_FOUNDATION_STEP_KEYS, ...BRAND_DESIGN_STEP_KEYS])
  })

  it('Vollpfad MIT Ableitung: die drei Kapitel von Book & Kit kommen dazu', () => {
    const unlocked: BrandProfileFacts = { ...FULL_PROFILE, derivationUnlocked: true }
    expect(includedBrandSteps(unlocked)).toEqual([...BRAND_STEP_KEYS])
  })

  it('NOMENKLATUR ERBT DIE WEICHE DER MARKENARCHITEKTUR (§2.20 Nr. 4)', () => {
    // Ohne Untermarken gibt es kein Namensmuster, das zu bestätigen wäre — die
    // Schreibweisen stehen dann in `n.guardrails`. Die anderen beiden Kapitel
    // der Schicht laufen trotzdem.
    const ohneUntermarken: BrandProfileFacts
      = { ...FULL_PROFILE, subBrands: 'no', derivationUnlocked: true }
    const steps = includedBrandSteps(ohneUntermarken)
    expect(steps).not.toContain('architecture')
    expect(steps).not.toContain('nomenclature')
    expect(steps).toContain('aiguide')
    expect(steps).toContain('presskit')
  })

  it('W4 unbeantwortet zählt NICHT als abgewählt, hält den Weg aber auch nicht auf', () => {
    const stand = [completedStep('context'), completedStep('pvm')]
    const undecided = resolveBrandJourney({ ...BASE_PROFILE, subBrands: 'unknown' }, stand)
    expect(stateOf(undecided, 'architecture')).toMatchObject({ state: 'skipped', reason: 'junction_undecided' })
    // Und genau so weit wie bei einem klaren „nein": der unbeantwortete
    // Baustein ist keine zusätzliche Sperre.
    expect(stateOf(undecided, 'values').state)
      .toBe(stateOf(resolveBrandJourney(BASE_PROFILE, stand), 'values').state)
    expect(stateOf(undecided, 'values').state).toBe('open')
  })

  it('W4 „nein" ist abgewählt und heisst auch so', () => {
    expect(stateOf(resolveBrandJourney(BASE_PROFILE), 'architecture').reason).toBe('junction_off')
  })
})

describe('brandNamingIncluded — W2 und der Neuschnitt-Chip', () => {
  it('ohne Namen immer', () => {
    expect(brandNamingIncluded({ ...BASE_PROFILE, hasName: false })).toBe(true)
    expect(brandNamingIncluded({ ...FULL_PROFILE, hasName: false, namingOpted: false })).toBe(true)
  })

  it('mit Namen auf dem Gründer-Pfad nie', () => {
    expect(brandNamingIncluded(BASE_PROFILE)).toBe(false)
  })

  it('Feinschliff öffnet Naming NICHT — auch nicht mit gesetztem Chip', () => {
    expect(brandNamingIncluded({
      pathKind: 'relaunch', relaunchScope: 'refine', hasName: true, team: 'solo', subBrands: 'no', namingOpted: true,
    })).toBe(false)
  })

  it('Neuschnitt öffnet nur MIT bewusstem Chip (Default nein)', () => {
    const recut: BrandProfileFacts = {
      pathKind: 'relaunch', relaunchScope: 'recut', hasName: true, team: 'solo', subBrands: 'no',
    }
    expect(brandNamingIncluded(recut)).toBe(false)
    expect(brandNamingIncluded({ ...recut, namingOpted: false })).toBe(false)
    expect(brandNamingIncluded({ ...recut, namingOpted: true })).toBe(true)
  })

  it('ignoriert einen relaunchScope auf dem Gründer-Pfad (widersprüchliche Tatsachen)', () => {
    expect(brandNamingIncluded({
      pathKind: 'new', relaunchScope: 'recut', hasName: true, team: 'solo', subBrands: 'no', namingOpted: true,
    })).toBe(false)
  })
})

describe('resolveBrandJourney — Reihenfolge und Freischaltung', () => {
  it('gibt IMMER alle neun Bausteine zurück, in Plan-Reihenfolge', () => {
    expect(resolveBrandJourney(BASE_PROFILE).map(step => step.stepKey)).toEqual([...BRAND_STEP_KEYS])
  })

  it('öffnet ohne jeden Stand genau den ersten und sperrt den Rest', () => {
    const journey = resolveBrandJourney(BASE_PROFILE)
    expect(stateOf(journey, 'context')).toMatchObject({ state: 'open', reason: 'entry' })
    expect(stateOf(journey, 'pvm')).toMatchObject({ state: 'locked', reason: 'awaiting_previous' })
    expect(journey.filter(step => step.state === 'open')).toHaveLength(1)
  })

  it('schaltet den nächsten erst frei, wenn der Vorgänger done ist', () => {
    const journey = resolveBrandJourney(BASE_PROFILE, [completedStep('context')])
    expect(stateOf(journey, 'context').state).toBe('done')
    expect(stateOf(journey, 'pvm')).toMatchObject({ state: 'open', reason: 'unlocked' })
    expect(stateOf(journey, 'values').state).toBe('locked')
  })

  it('reicht einen ÜBERSPRUNGENEN Baustein durch — er ist kein Hindernis', () => {
    const journey = resolveBrandJourney(BASE_PROFILE, [completedStep('context'), completedStep('pvm')])
    expect(stateOf(journey, 'architecture').state).toBe('skipped')
    expect(stateOf(journey, 'values')).toMatchObject({ state: 'open', reason: 'unlocked' })
  })

  it('zeigt einen begonnenen Baustein als active', () => {
    const journey = resolveBrandJourney(BASE_PROFILE, [{ stepKey: 'context', state: 'active' }])
    expect(stateOf(journey, 'context')).toMatchObject({ state: 'active', reason: 'in_progress' })
    expect(stateOf(journey, 'pvm').state).toBe('locked')
  })

  it('markiert architecture, naming und nomenclature als weichen-abhängig', () => {
    // `nomenclature` seit K0: sie erbt die Weiche W4 von `architecture`
    // (§2.20 Nr. 4) und ist damit genauso optional wie ihr Vorbild.
    const optional = resolveBrandJourney(FULL_PROFILE).filter(step => step.optional).map(step => step.stepKey)
    expect(optional).toEqual(['architecture', 'naming', 'nomenclature'])
  })

  it('trägt Fortschritt und offene Pflicht-Slots je Baustein', () => {
    const journey = resolveBrandJourney(BASE_PROFILE, [
      { stepKey: 'context', state: 'active', slots: { 'a.pitch': { hasValue: true } } },
    ])
    const context = stateOf(journey, 'context')
    expect(context.progress).toMatchObject({ requiredTotal: 10, requiredFilled: 1 })
    // Entwurf zählt für den Fortschritt, NICHT für „bestätigt".
    expect(context.missingRequired).toContain('a.pitch')
  })

  it('stuft ein gespeichertes done NICHT herab, auch wenn Pflicht-Slots fehlen (Migrationsvertrag §3e)', () => {
    const journey = resolveBrandJourney(BASE_PROFILE, [{ stepKey: 'context', state: 'done', confidence: 'fits' }])
    expect(stateOf(journey, 'context').state).toBe('done')
    expect(stateOf(journey, 'context').missingRequired.length).toBeGreaterThan(0)
    expect(stateOf(journey, 'pvm').state).toBe('open')
  })

  it('lässt einen späteren done stehen, wenn ein früherer wieder offen ist (reopen propagiert nicht)', () => {
    const journey = resolveBrandJourney(BASE_PROFILE, [
      { ...completedStep('context'), state: 'active' },
      completedStep('pvm'),
    ])
    expect(stateOf(journey, 'context').state).toBe('active')
    expect(stateOf(journey, 'pvm').state).toBe('done')
    // Und der Weg geht dahinter normal weiter.
    expect(stateOf(journey, 'values').state).toBe('open')
  })

  it('behält den Stand eines übersprungenen Bausteins (Daten bleiben inaktiv)', () => {
    const journey = resolveBrandJourney(BASE_PROFILE, [completedStep('architecture')])
    const architecture = stateOf(journey, 'architecture')
    expect(architecture.state).toBe('skipped')
    expect(architecture.progress.pct).toBe(100)
    expect(architecture.confidence).toBe('fits')
  })
})

describe('resolveBrandJourney — Happy-Path über den ganzen Vollpfad', () => {
  it('läuft Baustein für Baustein bis zum Ergebnis', () => {
    const done: BrandStepFacts[] = []
    // NUR SCHICHT 1: Brand Design steht ohne Freischaltung gesperrt und ist
    // damit kein Teil dieses Durchlaufs (eigener Block weiter unten).
    for (const stepKey of includedBrandSteps(FULL_PROFILE).filter(key => !isBrandDesignStep(key))) {
      const journey = resolveBrandJourney(FULL_PROFILE, done)
      // Der nächste Baustein ist offen und betretbar …
      expect(stateOf(journey, stepKey).state).toBe('open')
      expect(canEnterBrandStep(journey, stepKey).allowed).toBe(true)

      // … starten, alle Pflicht-Slots bestätigen, Konfidenz setzen, abschliessen.
      let step: BrandStepFacts = { stepKey, state: 'open' }
      const started = transitionBrandStep(step, { kind: 'start' })
      expect(started.ok).toBe(true)
      step = started.ok ? started.step : step

      for (const slot of requiredSlotsForStep(stepKey)) {
        const result = transitionBrandStep(step, { kind: 'confirmSlot', slotId: slot.id })
        expect(result.ok).toBe(true)
        step = result.ok ? result.step : step
      }
      // … und die Finale Abnahme: bestätigt ist nicht abgenommen (§5a).
      for (const slot of requiredSlotsForStep(stepKey)) {
        const result = transitionBrandStep(step, { kind: 'acceptSlot', slotId: slot.id })
        expect(result.ok).toBe(true)
        step = result.ok ? result.step : step
      }
      const confidence = transitionBrandStep(step, { kind: 'setConfidence', confidence: 'fits' })
      step = confidence.ok ? confidence.step : step

      const completed = transitionBrandStep(step, { kind: 'complete' })
      expect(completed.ok).toBe(true)
      step = completed.ok ? completed.step : step
      expect(step.state).toBe('done')
      done.push(step)
    }

    const final = resolveBrandJourney(FULL_PROFILE, done)
    expect(final.filter(step => step.state === 'done')).toHaveLength(9)
    expect(final.filter(step =>
      !isBrandDesignStep(step.stepKey) && !isBrandKitStep(step.stepKey))
      .every(step => step.progress.pct === 100)).toBe(true)
    // Und die zweite Schicht bleibt dahinter zu — ohne Freischaltung.
    expect(final.filter(step => isBrandDesignStep(step.stepKey))
      .every(step => step.state === 'locked' && step.reason === 'design_locked')).toBe(true)
    // Und die dritte Schicht liegt gar nicht erst auf dem Weg (K0).
    expect(final.filter(step => isBrandKitStep(step.stepKey))
      .every(step => step.state === 'skipped' && step.reason === 'derivation_locked')).toBe(true)
  })

  it('endet auf dem Basispfad mit sieben done und zwei skipped', () => {
    const done = includedBrandSteps(BASE_PROFILE)
      .filter(stepKey => !isBrandDesignStep(stepKey))
      .map(stepKey => completedStep(stepKey))
    const journey = resolveBrandJourney(BASE_PROFILE, done)
    expect(journey.filter(step => step.state === 'done')).toHaveLength(7)
    expect(journey.filter(step => step.state === 'skipped').map(step => step.stepKey))
      .toEqual(['architecture', 'naming', ...BRAND_KIT_STEP_KEYS])
  })
})

/**
 * DIE FREISCHALTUNG VON BRAND DESIGN (Konzept §2.10, Paket D0).
 *
 * ZWEI Bedingungen, und beide werden hier einzeln fallen gelassen — eine
 * Prüfung, die nur den gesperrten und den offenen Normalfall kennt, wäre auch
 * für eine Regel grün, die nur eine der beiden liest.
 */
describe('resolveNextSession — fragt nur, was erreichbar ist (D2c-Prüfbefund)', () => {
  const facts = (entries: Record<string, { confirmed?: boolean, hasValue?: boolean }>) =>
    Object.fromEntries(Object.entries(entries).map(([id, f]) => [id, { confirmed: f.confirmed ?? false, hasValue: f.hasValue ?? f.confirmed ?? false, accepted: false, deferred: false }])) as never

  it('die Weiche im Entwurf: die nächste Frage ist NICHT die gesperrte Board-Wahl', () => {
    // Karte geklickt, noch nicht bestätigt — vorher sprang die Bühne zu
    // `g.board`, das auf `g.boards` wartet; der Bestätigen-Knopf der Weiche
    // erscheint aber erst, wenn keine Frage mehr offen ist.
    expect(resolveNextSession('dna', facts({ 'g.source': { hasValue: true } }))).toBeNull()
  })

  it('ohne Entwurf ist die Weiche selbst die Frage', () => {
    expect(resolveNextSession('dna', facts({}))?.slotId).toBe('g.source')
  })

  it('GEGENPROBE: sind die Quellen der Board-Wahl bestätigt, wird sie gefragt', () => {
    const ready = facts({ 'g.source': { confirmed: true }, 'g.dna': { confirmed: true }, 'g.boards': { confirmed: true } })
    expect(resolveNextSession('dna', ready)?.slotId).toBe('g.board')
  })

  it('Foundation: eine Wahl mit unbestätigter Quelle wird übersprungen, nicht ins Leere gestellt', () => {
    // `c.final` wartet auf die Ableitung `c.candidates`; solange die nicht
    // bestätigt ist, darf die Werte-Wahl nicht die nächste Frage sein.
    const next = resolveNextSession('values', facts({ 'c.candidates': { hasValue: true } }))
    expect(next?.slotId).not.toBe('c.final')
  })
})

describe('resolveBrandJourney — Brand Design ist gesperrt, bis beides stimmt', () => {
  const UNLOCKED: BrandProfileFacts = { ...FULL_PROFILE, designUnlockedAt: '2026-09-07T10:00:00.000Z' }
  const foundationDone = includedBrandSteps(FULL_PROFILE)
    .filter(stepKey => !isBrandDesignStep(stepKey))
    .map(stepKey => completedStep(stepKey))

  it('ohne Freischaltung: alle sechs gesperrt, mit eigenem Grund', () => {
    const journey = resolveBrandJourney(FULL_PROFILE, foundationDone)
    for (const stepKey of BRAND_DESIGN_STEP_KEYS) {
      expect(stateOf(journey, stepKey), stepKey)
        .toMatchObject({ state: 'locked', reason: 'design_locked' })
      expect(canEnterBrandStep(journey, stepKey).allowed, stepKey).toBe(false)
    }
  })

  it('ohne fertige Foundation: auch mit Freischaltung gesperrt', () => {
    // Die zweite Bedingung allein trägt nicht — sonst stünde Frida vor einer
    // Foundation, aus der sie nichts ableiten kann.
    const journey = resolveBrandJourney(UNLOCKED, [completedStep('context')])
    for (const stepKey of BRAND_DESIGN_STEP_KEYS) {
      expect(stateOf(journey, stepKey), stepKey)
        .toMatchObject({ state: 'locked', reason: 'design_locked' })
    }
  })

  it('mit beidem: `dna` ist offen, der Rest wartet auf seinen Vorgänger', () => {
    const journey = resolveBrandJourney(UNLOCKED, foundationDone)
    expect(stateOf(journey, 'dna')).toMatchObject({ state: 'open', reason: 'unlocked' })
    expect(canEnterBrandStep(journey, 'dna').allowed).toBe(true)
    for (const stepKey of BRAND_DESIGN_STEP_KEYS.filter(key => key !== 'dna')) {
      expect(stateOf(journey, stepKey), stepKey)
        .toMatchObject({ state: 'locked', reason: 'awaiting_previous' })
    }
  })

  it('und dann Kapitel für Kapitel — wie in der Foundation', () => {
    const journey = resolveBrandJourney(UNLOCKED, [...foundationDone, completedStep('dna')])
    expect(stateOf(journey, 'dna').state).toBe('done')
    expect(stateOf(journey, 'color')).toMatchObject({ state: 'open', reason: 'unlocked' })
    expect(stateOf(journey, 'type').state).toBe('locked')
  })

  it('`designUnlockedAt: null` ist dasselbe wie „gar nicht gesetzt"', () => {
    const journey = resolveBrandJourney({ ...FULL_PROFILE, designUnlockedAt: null }, foundationDone)
    expect(stateOf(journey, 'dna')).toMatchObject({ state: 'locked', reason: 'design_locked' })
  })

  /**
   * DER GRUND REIST BIS AN DIE TÜR (D1). Ohne diesen Fall wäre die Werkstatt
   * für ein nicht freigeschaltetes Kapitel weiterhin bei „Schließ das Kapitel
   * davor ab" gelandet — einem Satz über etwas, das gar nicht fehlt.
   */
  it('`canEnterBrandStep` unterscheidet „nicht freigeschaltet" von „Vorgänger offen"', () => {
    const locked = resolveBrandJourney(FULL_PROFILE, foundationDone)
    expect(canEnterBrandStep(locked, 'dna')).toEqual({ allowed: false, reason: 'design_locked' })

    // GEGENPROBE: dasselbe Kapitel, freigeschaltet — jetzt hängt `color` am
    // Vorgänger und bekommt den ANDEREN Grund.
    const open = resolveBrandJourney(UNLOCKED, foundationDone)
    expect(canEnterBrandStep(open, 'color')).toEqual({ allowed: false, reason: 'locked' })
    expect(canEnterBrandStep(open, 'dna')).toEqual({ allowed: true, reason: null })
  })

  /**
   * DIE RÜCKNAHME SPERRT AUCH ERARBEITETES (§2.10 / D1): die Sperre steht in
   * `resolveBrandJourney` VOR dem gespeicherten `done`. Ohne diese Reihenfolge
   * liesse eine zurückgenommene Freischaltung offene Türen zurück.
   */
  it('nach der Rücknahme ist auch ein fertiges Design-Kapitel wieder zu', () => {
    const journey = resolveBrandJourney(FULL_PROFILE, [...foundationDone, completedStep('dna')])
    expect(stateOf(journey, 'dna')).toMatchObject({ state: 'locked', reason: 'design_locked' })
    expect(canEnterBrandStep(journey, 'dna').allowed).toBe(false)
  })
})

describe('canEnterBrandStep', () => {
  const journey = resolveBrandJourney(BASE_PROFILE, [completedStep('context')])

  it('lässt in einen abgeschlossenen Baustein zurück (§3b.2)', () => {
    expect(canEnterBrandStep(journey, 'context')).toEqual({ allowed: true, reason: null })
  })

  it('lässt in den offenen', () => {
    expect(canEnterBrandStep(journey, 'pvm')).toEqual({ allowed: true, reason: null })
  })

  it('verweigert das Springen in einen gesperrten', () => {
    expect(canEnterBrandStep(journey, 'values')).toEqual({ allowed: false, reason: 'locked' })
    expect(canEnterBrandStep(journey, 'result')).toEqual({ allowed: false, reason: 'locked' })
  })

  it('verweigert einen übersprungenen — der geht über die Weiche auf, nicht über die Adresszeile', () => {
    expect(canEnterBrandStep(journey, 'architecture')).toEqual({ allowed: false, reason: 'skipped' })
  })

  it('verweigert einen unbekannten Schlüssel', () => {
    expect(canEnterBrandStep(journey, 'kontext')).toEqual({ allowed: false, reason: 'unknown_step' })
  })
})

describe('transitionBrandStep — start / reopen', () => {
  it('start macht aus open ein active', () => {
    const result = transitionBrandStep({ stepKey: 'context', state: 'open' }, { kind: 'start' })
    expect(result).toMatchObject({ ok: true, changed: true })
    expect(result.ok && result.step.state).toBe('active')
  })

  it('start auf active ist ein No-op (schreibt nichts, erhöht keine revision)', () => {
    const result = transitionBrandStep({ stepKey: 'context', state: 'active' }, { kind: 'start' })
    expect(result).toMatchObject({ ok: true, changed: false })
  })

  it('start verweigert einen gesperrten Baustein', () => {
    expect(transitionBrandStep({ stepKey: 'values', state: 'locked' }, { kind: 'start' }))
      .toEqual({ ok: false, code: 'step_locked' })
  })

  it('start auf done verweist auf reopen', () => {
    expect(transitionBrandStep(completedStep('context'), { kind: 'start' }))
      .toEqual({ ok: false, code: 'already_done' })
  })

  it('reopen macht aus done wieder active und lässt Slots UND Konfidenz stehen', () => {
    const result = transitionBrandStep(completedStep('context'), { kind: 'reopen' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.step.state).toBe('active')
    expect(result.step.confidence).toBe('fits')
    expect(result.step.slots?.['a.pitch']?.confirmed).toBe(true)
  })

  it('reopen verweigert alles, was nicht done ist', () => {
    for (const state of ['open', 'active', 'locked'] as const) {
      expect(transitionBrandStep({ stepKey: 'context', state }, { kind: 'reopen' }))
        .toEqual({ ok: false, code: 'not_done' })
    }
  })

  it('mutiert den übergebenen Stand nie', () => {
    const step: BrandStepFacts = { stepKey: 'context', state: 'open' }
    transitionBrandStep(step, { kind: 'start' })
    expect(step.state).toBe('open')
  })
})

describe('transitionBrandStep — confirmSlot', () => {
  const active: BrandStepFacts = { stepKey: 'context', state: 'active' }

  it('bestätigt einen Slot des Bausteins und setzt hasValue mit', () => {
    const result = transitionBrandStep(active, { kind: 'confirmSlot', slotId: 'a.pitch' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.step.slots?.['a.pitch']).toEqual({ hasValue: true, confirmed: true })
  })

  it('ist beim zweiten Mal ein No-op', () => {
    const first = transitionBrandStep(active, { kind: 'confirmSlot', slotId: 'a.pitch' })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(transitionBrandStep(first.step, { kind: 'confirmSlot', slotId: 'a.pitch' }))
      .toMatchObject({ ok: true, changed: false })
  })

  it('verweigert einen Slot, der zu einem ANDEREN Baustein gehört', () => {
    expect(transitionBrandStep(active, { kind: 'confirmSlot', slotId: 'b.purpose' }))
      .toEqual({ ok: false, code: 'slot_foreign' })
  })

  it('verweigert eine erfundene Slot-Id', () => {
    expect(transitionBrandStep(active, { kind: 'confirmSlot', slotId: 'a.erfunden' }))
      .toEqual({ ok: false, code: 'unknown_slot' })
  })

  it('verweigert das Bestätigen in einem noch nicht gestarteten Baustein', () => {
    expect(transitionBrandStep({ stepKey: 'context', state: 'open' }, { kind: 'confirmSlot', slotId: 'a.pitch' }))
      .toEqual({ ok: false, code: 'not_started' })
  })

  it('verweigert das Bestätigen in einem gesperrten Baustein', () => {
    expect(transitionBrandStep({ stepKey: 'context', state: 'locked' }, { kind: 'confirmSlot', slotId: 'a.pitch' }))
      .toEqual({ ok: false, code: 'step_locked' })
  })

  it('verweigert das Bestätigen in einem abgeschlossenen Baustein (erst reopen)', () => {
    expect(transitionBrandStep(completedStep('context'), { kind: 'confirmSlot', slotId: 'a.origin' }))
      .toEqual({ ok: false, code: 'already_done' })
  })
})

describe('transitionBrandStep — Konfidenz lässt sich nicht manipulieren', () => {
  const active: BrandStepFacts = { stepKey: 'values', state: 'active' }

  it('nimmt die zwei SETZBAREN Chips — und `restart` ist keiner mehr', () => {
    for (const confidence of BRAND_SETTABLE_CONFIDENCE_VALUES) {
      expect(transitionBrandStep(active, { kind: 'setConfidence', confidence })).toMatchObject({ ok: true })
    }
    // Seit §5a ist „Nochmal von vorn" eine HANDLUNG (`restart`) und keine
    // Selbstauskunft: der Wert bleibt für Bestandszeilen lesbar, gesetzt wird
    // er nie mehr.
    expect(BRAND_CONFIDENCE_VALUES).toContain('restart')
    expect(transitionBrandStep(active, { kind: 'setConfidence', confidence: 'restart' }))
      .toEqual({ ok: false, code: 'invalid_confidence' })
  })

  it('weist einen erfundenen Wert ab, statt ihn zu speichern', () => {
    expect(transitionBrandStep(active, { kind: 'setConfidence', confidence: 'perfekt' as BrandConfidence }))
      .toEqual({ ok: false, code: 'invalid_confidence' })
    expect(transitionBrandStep(active, { kind: 'setConfidence', confidence: '' as BrandConfidence }))
      .toEqual({ ok: false, code: 'invalid_confidence' })
  })

  it('lässt die Konfidenz nicht am Baustein vorbei setzen (nicht gestartet / gesperrt)', () => {
    expect(transitionBrandStep({ stepKey: 'values', state: 'open' }, { kind: 'setConfidence', confidence: 'fits' }))
      .toEqual({ ok: false, code: 'not_started' })
    expect(transitionBrandStep({ stepKey: 'values', state: 'locked' }, { kind: 'setConfidence', confidence: 'fits' }))
      .toEqual({ ok: false, code: 'step_locked' })
  })

  it('lässt die Konfidenz auch bei einem ABGESCHLOSSENEN Baustein ändern (Davids Entscheidung 2026-09-02)', () => {
    // Die Konfidenz ist eine Selbstauskunft, kein Inhalt — der starre Weg
    // lief im UI in ein klebendes 400 („Not saved"). done bleibt done.
    const set = transitionBrandStep(completedStep('values'), { kind: 'setConfidence', confidence: 'almost' })
    expect(set).toMatchObject({ ok: true, changed: true })
    if (!set.ok) return
    expect(set.step.state).toBe('done')
    expect(set.step.confidence).toBe('almost')
  })

  /**
   * DIE ZWEI WEGE EINES „PASST"-KLICKS AUF EINEM ABGESCHLOSSENEN BAUSTEIN.
   *
   * Die Werkstatt schickt bei `fits` zwei Dinge los: die Konfidenz-PATCH und
   * den Abschluss. Auf `done` sagt die Zustandsmaschine dazu ZWEIERLEI — die
   * Selbstauskunft geht durch, der Abschluss nicht (`already_done`). Genau
   * diese Asymmetrie ist der Grund, warum die Seite den zweiten Weg auslassen
   * MUSS: der Konfidenz-Knopf lief sonst in einen Warn-Toast (Audit A2).
   */
  it('trennt auf done die Selbstauskunft vom Abschluss (Grundlage des UI-Guards)', () => {
    const done = completedStep('values')
    expect(transitionBrandStep(done, { kind: 'setConfidence', confidence: 'fits' }).ok).toBe(true)
    expect(transitionBrandStep(done, { kind: 'complete' }))
      .toEqual({ ok: false, code: 'already_done' })
  })

  it('ist ein No-op, wenn derselbe Chip noch einmal kommt', () => {
    const first = transitionBrandStep(active, { kind: 'setConfidence', confidence: 'almost' })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(transitionBrandStep(first.step, { kind: 'setConfidence', confidence: 'almost' }))
      .toMatchObject({ ok: true, changed: false })
  })
})

describe('transitionBrandStep — complete verlangt Vollständigkeit', () => {
  it('schliesst ab, wenn alle Pflicht-Slots bestätigt sind und eine Konfidenz steht', () => {
    const result = transitionBrandStep({ ...filledActiveStep('values'), confidence: 'fits' }, { kind: 'complete' })
    expect(result).toMatchObject({ ok: true, changed: true })
    expect(result.ok && result.step.state).toBe('done')
  })

  it('verweigert den Abschluss bei EINEM fehlenden Pflicht-Slot und nennt ihn', () => {
    const step = filledActiveStep('values')
    const slots = { ...step.slots }
    delete slots['c.conflictRule']
    const result = transitionBrandStep({ ...step, slots, confidence: 'fits' }, { kind: 'complete' })
    expect(result).toMatchObject({ ok: false, code: 'required_slots_missing' })
    expect(!result.ok && result.missing).toEqual(['c.conflictRule'])
  })

  it('lässt ein blosses hasValue NICHT als Bestätigung durchgehen', () => {
    const slots = Object.fromEntries(requiredSlotsForStep('result').map(slot => [slot.id, { hasValue: true }]))
    const result = transitionBrandStep(
      { stepKey: 'result', state: 'active', confidence: 'fits', slots },
      { kind: 'complete' },
    )
    expect(result).toMatchObject({ ok: false, code: 'required_slots_missing' })
  })

  it('verlangt zusätzlich die Konfidenz-Weiche', () => {
    expect(transitionBrandStep(filledActiveStep('values'), { kind: 'complete' }))
      .toEqual({ ok: false, code: 'confidence_missing' })
  })

  it('braucht KEINEN optionalen Slot (Solo darf „Werte" abschliessen)', () => {
    const result = transitionBrandStep({ ...filledActiveStep('values'), confidence: 'fits' }, { kind: 'complete' })
    expect(result.ok).toBe(true)
    expect(result.ok && result.step.slots?.['c.teamFilter']).toBeUndefined()
  })

  it('verweigert den Abschluss eines nicht gestarteten Bausteins', () => {
    expect(transitionBrandStep({ ...filledActiveStep('values'), state: 'open', confidence: 'fits' }, { kind: 'complete' }))
      .toEqual({ ok: false, code: 'not_started' })
  })

  it('verweigert den Abschluss eines gesperrten Bausteins', () => {
    expect(transitionBrandStep({ stepKey: 'naming', state: 'locked' }, { kind: 'complete' }))
      .toEqual({ ok: false, code: 'step_locked' })
  })
})

describe('brandStepCompletion — der Baustein archetype ist schliessbar (Audit A4)', () => {
  /**
   * DIE SACKGASSE, DIE ES NICHT MEHR GIBT. `d.pairs` ist Pflicht und hat kein
   * Instrument (P4) — solange er in der Vorbedingung stand, war `slotsReady`
   * in `archetype` unerreichbar: die Konfidenz-Weiche erschien nie, und die
   * Route hätte einen Abschluss ohnehin abgewiesen. Bühne und Route lesen
   * dieselbe Rechnung, also war der Baustein für JEDEN Weg zu.
   */
  it('wird fertig, wenn alles Bedienbare bestätigt ist — auch ohne d.pairs', () => {
    const slots = Object.fromEntries(
      confirmableRequiredSlotsForStep('archetype')
        .map(slot => [slot.id, { hasValue: true, confirmed: true, accepted: true }]),
    )
    const completion = brandStepCompletion('archetype', slots)
    expect(completion.slotsReady).toBe(true)
    expect(completion.missingRequired).toEqual([])
    expect(transitionBrandStep({ stepKey: 'archetype', state: 'active', confidence: 'fits', slots }, { kind: 'complete' }).ok)
      .toBe(true)
  })

  it('verlangt die vier Ableitungen weiterhin — sie sind bestätigbar', () => {
    const slots = Object.fromEntries(
      confirmableRequiredSlotsForStep('archetype')
        .filter(slot => slot.id !== 'd.primary')
        .map(slot => [slot.id, { hasValue: true, confirmed: true }]),
    )
    expect(brandStepCompletion('archetype', slots).missingRequired).toEqual(['d.primary'])
  })

  it('lässt den Balken 100 % erreichen (derselbe Nenner wie das Gate)', () => {
    const slots = Object.fromEntries(
      confirmableRequiredSlotsForStep('archetype').map(slot => [slot.id, { hasValue: true, confirmed: true }]),
    )
    expect(stepProgress('archetype', slots).pct).toBe(100)
  })
})

describe('brandStepCompletion — EINE Vorbedingung, zwei Leser', () => {
  /**
   * DER KERN VON DAVIDS BEFUND (Live-Durchlauf 2026-09-02): der Browser zeigte
   * die Konfidenz-Weiche, wenn `resolveNextQuestion` nichts mehr fand — die
   * Route verlangt aber BESTÄTIGTE Pflicht-Slots. Diese beiden Fragen dürfen
   * nie wieder auseinanderlaufen, und genau das nagelt dieser Block fest:
   * geprüft wird nicht, dass die Funktion „irgendwas Vernünftiges" sagt,
   * sondern dass ihr Ja/Nein IDENTISCH ist mit dem der Abschluss-Regel.
   */
  it('sagt für jeden Baustein exakt das, was `complete` entscheidet', () => {
    for (const stepKey of BRAND_STEP_KEYS) {
      const required = requiredSlotsForStep(stepKey)
      // Alle Teilmengen wären 2^n — der ehrliche Querschnitt: gar nichts,
      // lauter Entwürfe ohne Bestätigung, jeweils genau EINER offen, alles
      // bestätigt.
      // `accepted` läuft mit `confirmed`: geprüft wird hier die Deckung von
      // `brandStepCompletion` und `complete`, nicht die Abnahme daneben — ein
      // Fall ohne Abnahme schiede aus einem ANDEREN Grund aus und bewiese
      // nichts über diese Deckung (dafür gibt es `brandStepAcceptance`).
      const cases: Record<string, BrandSlotStateFacts>[] = [
        {},
        Object.fromEntries(required.map(slot => [slot.id, { hasValue: true }])),
        ...required.map(open => Object.fromEntries(
          required.map(slot => [slot.id, {
            hasValue: true,
            confirmed: slot.id !== open.id,
            accepted: slot.id !== open.id,
          }]),
        )),
        Object.fromEntries(required.map(slot => [slot.id, { hasValue: true, confirmed: true, accepted: true }])),
      ]

      for (const slots of cases) {
        const completion = brandStepCompletion(stepKey, slots)
        const result = transitionBrandStep(
          // Konfidenz gesetzt und `active`: sonst schiede der Abschluss aus
          // einem ANDEREN Grund aus, und der Vergleich bewiese nichts.
          { stepKey, state: 'active', confidence: 'fits', slots },
          { kind: 'complete' },
        )
        expect(result.ok).toBe(completion.slotsReady)
        if (!result.ok) {
          expect(result.code).toBe('required_slots_missing')
          expect(result.missing).toEqual(completion.missingRequired)
        }
      }
    }
  })

  it('zählt Bestätigtes von Pflicht — der Zähler des ruhigen Hinweises', () => {
    const required = requiredSlotsForStep('values')
    const slots = Object.fromEntries(
      required.map((slot, index) => [slot.id, { hasValue: true, confirmed: index > 0 }]),
    )
    const completion = brandStepCompletion('values', slots)
    expect(completion.total).toBe(required.length)
    expect(completion.confirmed).toBe(required.length - 1)
    expect(completion.missingRequired).toEqual([required[0]!.id])
  })

  it('DER BEFUND: ein unbestätigter Entwurfs-Slot hält die Weiche zu', () => {
    // `pvm` wie bei David: alle Fragen beantwortet, „Mission" liegt als
    // Entwurf da. `resolveNextQuestion` sieht deshalb nichts mehr — und genau
    // deswegen stand die Weiche vorher zu früh auf der Bühne.
    const slots = Object.fromEntries(
      requiredSlotsForStep('pvm').map(slot => [slot.id, {
        hasValue: true,
        confirmed: slot.id !== 'b.mission',
      }]),
    )
    expect(resolveNextQuestion('pvm', slots)).toBeNull()

    const completion = brandStepCompletion('pvm', slots)
    expect(completion.slotsReady).toBe(false)
    expect(completion.missingRequired).toEqual(['b.mission'])
    expect(completion.confirmed).toBe(completion.total - 1)
  })

  it('ist ohne jede Slot-Kenntnis nicht bereit (fail-closed)', () => {
    const completion = brandStepCompletion('pvm')
    expect(completion.slotsReady).toBe(false)
    expect(completion.missingRequired).toEqual(requiredSlotsForStep('pvm').map(slot => slot.id))
  })

  it('gibt die offenen Slots in Registry-Reihenfolge zurück', () => {
    const ordered = requiredSlotsForStep('context').map(slot => slot.id)
    expect(brandStepCompletion('context').missingRequired).toEqual(ordered)
  })
})

describe('resolveNextQuestion', () => {
  it('fragt den ersten offenen Pflicht-Slot in Registry-Reihenfolge', () => {
    // a.pitch/a.category/a.competitors/a.audienceSketch sind Ableitungen —
    // die erste FRAGE des Bausteins ist a.origin.
    expect(resolveNextQuestion('context')).toMatchObject({ slotId: 'a.origin', type: 'question' })
  })

  it('überspringt, was schon gefüllt ist', () => {
    expect(resolveNextQuestion('context', { 'a.origin': { hasValue: true } }))
      .toMatchObject({ slotId: 'a.customerPraise' })
  })

  it('fragt niemals nach Ableitungen oder Bühnen-Entwürfen', () => {
    for (const stepKey of BRAND_STEP_KEYS) {
      const next = resolveNextQuestion(stepKey)
      if (!next) continue
      expect(['question', 'choice']).toContain(next.type)
    }
  })

  it('fragt keinen optionalen Slot', () => {
    const filled = Object.fromEntries(requiredSlotsForStep('values').map(slot => [slot.id, { hasValue: true }]))
    expect(resolveNextQuestion('values', filled)).toBeNull()
  })

  it('liefert die i18n-Schlüssel gleich mit — MIT Pfad und Weiche', () => {
    // `f.nameType` trägt die Weiche W3, also gibt es den Basis-Schlüssel
    // `brand.q.f.nameType` im Katalog gar nicht mehr (beide Fassungen sind
    // Kinder). Ohne Weichen-Argument gilt die Solo-Fassung des Gründer-Pfads.
    expect(resolveNextQuestion('naming')).toEqual({
      slotId: 'f.nameType',
      questionKey: 'brand.q.f.nameType.solo',
      helpKey: 'brand.help.f.nameType',
      type: 'choice',
      editor: 'chips',
    })
    expect(resolveNextQuestion('naming', {}, { pathKind: 'relaunch', team: 'team' })?.questionKey)
      .toBe('brand.q.f.nameType.team')
    // Die Pfad-Achse zählt genauso: `a.origin` trägt beide.
    expect(resolveNextQuestion('context', {}, { pathKind: 'relaunch', team: 'team' })?.questionKey)
      .toBe('brand.q.a.origin.relaunch.team')
  })

  it('nennt NIE einen Schlüssel, den der Katalog nicht führt', () => {
    /**
     * DER REGRESSIONSSCHUTZ GEGEN ROHE SCHLÜSSEL (2026-09-09): heute rendert
     * `questionKey` niemand, aber ein Feld, das einen Schlüssel LIEFERT, ist
     * die Zusage, dass man `t()` darauf loslassen darf. vue-i18n gibt bei einem
     * Fehlgriff wortlos den Schlüssel aus — genau der stille Fehler, gegen den
     * `i18nCatalog.test.ts` gebaut ist, nur hier an der Rechnung statt am
     * Katalog. Geprüft wird über ALLE Bausteine, beide Pfade, beide Weichen und
     * jeden Füllstand: der DEFAULT gehört mit dazu, sonst wäre er der eine
     * ungedeckte Weg.
     */
    const gaps: string[] = []
    const facts = (filled: string[]): Record<string, BrandSlotStateFacts> =>
      Object.fromEntries(filled.map(id => [id, { hasValue: true }]))
    for (const stepKey of BRAND_STEP_KEYS) {
      const sessions = slotsForStep(stepKey)
      for (let filled = 0; filled <= sessions.length; filled += 1) {
        const states = facts(sessions.slice(0, filled).map(session => session.id))
        const asked = [
          resolveNextQuestion(stepKey, states),
          ...(['new', 'relaunch'] as const).flatMap(pathKind =>
            (['solo', 'team'] as const).map(team =>
              resolveNextQuestion(stepKey, states, { pathKind, team }))),
        ]
        for (const next of asked) {
          if (!next) continue
          for (const locale of ['de', 'en'] as const) {
            if (!CATALOG_KEYS[locale].has(next.questionKey)) {
              gaps.push(`${stepKey}/${filled}: ${next.questionKey} fehlt in ${locale}`)
            }
          }
        }
      }
    }
    expect(gaps).toEqual([])
    // Gegenprobe: die Schlüsselmenge ist wirklich geladen.
    expect(CATALOG_KEYS.de.has('brand.q.a.origin.relaunch.team')).toBe(true)
    expect(CATALOG_KEYS.de.has('brand.q.f.nameType')).toBe(false)
  })

  it('gibt null, wenn alle Pflicht-Fragen beantwortet sind', () => {
    const filled = Object.fromEntries(slotsForStep('archetype').map(slot => [slot.id, { confirmed: true }]))
    expect(resolveNextQuestion('archetype', filled)).toBeNull()
  })
})

describe('applyJunctionChange — Weichen umlegen, ohne zu löschen', () => {
  it('W4 auf ja schaltet architecture frei', () => {
    const effect = applyJunctionChange(BASE_PROFILE, { junction: 'subBrands', value: 'yes' })
    expect(effect.activated).toEqual(['architecture'])
    expect(effect.deactivated).toEqual([])
    expect(effect.profile.subBrands).toBe('yes')
    expect(effect.changed).toBe(true)
  })

  it('W4 zurück auf nein nimmt architecture wieder vom Weg — die Daten bleiben Sache der Route', () => {
    const effect = applyJunctionChange({ ...BASE_PROFILE, subBrands: 'yes' }, { junction: 'subBrands', value: 'no' })
    expect(effect.deactivated).toEqual(['architecture'])
    expect(effect.activated).toEqual([])
  })

  it('W2 „doch kein Name" schaltet naming frei', () => {
    const effect = applyJunctionChange(BASE_PROFILE, { junction: 'hasName', value: false })
    expect(effect.activated).toEqual(['naming'])
  })

  it('der Neuschnitt-Chip schaltet naming frei, der Feinschliff nicht', () => {
    const recut: BrandProfileFacts = {
      pathKind: 'relaunch', relaunchScope: 'recut', hasName: true, team: 'solo', subBrands: 'no',
    }
    expect(applyJunctionChange(recut, { junction: 'namingOpted', value: true }).activated).toEqual(['naming'])
    const refine: BrandProfileFacts = { ...recut, relaunchScope: 'refine' }
    expect(applyJunctionChange(refine, { junction: 'namingOpted', value: true }).activated).toEqual([])
  })

  it('vom Neuschnitt auf Feinschliff zurück nimmt naming wieder vom Weg', () => {
    const recut: BrandProfileFacts = {
      pathKind: 'relaunch', relaunchScope: 'recut', hasName: true, team: 'solo', subBrands: 'no', namingOpted: true,
    }
    expect(applyJunctionChange(recut, { junction: 'relaunchScope', value: 'refine' }).deactivated).toEqual(['naming'])
  })

  it('W3 bewegt keinen Baustein — sie tauscht Fassungen', () => {
    const effect = applyJunctionChange(BASE_PROFILE, { junction: 'team', value: 'team' })
    expect(effect).toMatchObject({ activated: [], deactivated: [], changed: true })
    expect(effect.profile.team).toBe('team')
  })

  it('meldet changed:false, wenn derselbe Wert noch einmal kommt', () => {
    expect(applyJunctionChange(BASE_PROFILE, { junction: 'subBrands', value: 'no' }).changed).toBe(false)
  })

  it('mutiert das übergebene Profil nicht', () => {
    const profile = { ...BASE_PROFILE }
    applyJunctionChange(profile, { junction: 'subBrands', value: 'yes' })
    expect(profile.subBrands).toBe('no')
  })

  it('findet den Stand wieder, wenn eine Weiche zurückgedreht wird (§3e)', () => {
    const stand = [completedStep('context'), completedStep('pvm'), completedStep('architecture')]
    const off = applyJunctionChange(FULL_PROFILE, { junction: 'subBrands', value: 'no' })
    expect(stateOf(resolveBrandJourney(off.profile, stand), 'architecture').state).toBe('skipped')
    const on = applyJunctionChange(off.profile, { junction: 'subBrands', value: 'yes' })
    expect(stateOf(resolveBrandJourney(on.profile, stand), 'architecture'))
      .toMatchObject({ state: 'done', progress: { pct: 100 } })
  })
})

/**
 * DIE SESSION-EBENE (BW2 Paket 1) — dieselbe Zustandsmaschine, eine Stufe
 * feiner. Sie ersetzt die Kapitel-Ebene NICHT, sie liegt darunter.
 */
describe('resolveNextSession', () => {
  it('ist wörtlich dieselbe Wahl wie `resolveNextQuestion`, nur mit `kind`', () => {
    // Über ALLE Bausteine und über mehrere Füllstände: die Fassungen dürfen
    // nie auseinanderlaufen — `resolveNextQuestion` delegiert hierher.
    for (const stepKey of BRAND_STEP_KEYS) {
      const sessions = slotsForStep(stepKey)
      for (let filled = 0; filled <= sessions.length; filled += 1) {
        const facts = Object.fromEntries(
          sessions.slice(0, filled).map(session => [session.id, { hasValue: true }]),
        )
        const question = resolveNextQuestion(stepKey, facts)
        const session = resolveNextSession(stepKey, facts)
        if (!question) {
          expect(session, `${stepKey}/${filled}`).toBeNull()
          continue
        }
        const { kind: _kind, ...withoutKind } = session!
        expect(withoutKind, `${stepKey}/${filled}`).toEqual(question)
      }
    }
  })

  it('nennt die Arbeitsform mit — die einzige Zugabe', () => {
    expect(resolveNextSession('context')).toMatchObject({ slotId: 'a.origin', kind: 'ask' })
    expect(resolveNextSession('naming')).toMatchObject({ slotId: 'f.nameType', kind: 'choose' })
  })

  it('fragt nie nach einer Ableitung, einem Entwurf oder dem Instrument', () => {
    for (const stepKey of BRAND_STEP_KEYS) {
      const next = resolveNextSession(stepKey)
      if (!next) continue
      expect(['ask', 'collect', 'choose']).toContain(next.kind)
    }
  })
})

describe('resolveSessionStates (§5)', () => {
  const stepFacts = (slots: Record<string, BrandSlotStateFacts>): BrandStepFacts[] =>
    BRAND_STEP_KEYS.map(stepKey => ({
      stepKey,
      state: 'active' as const,
      slots: Object.fromEntries(
        Object.entries(slots).filter(([id]) => slotById(id)!.stepId === stepKey),
      ),
    }))

  it('sperrt eine Session, solange eine Eingabe unbestätigt ist', () => {
    const states = resolveSessionStates(BASE_PROFILE)
    // a.pitch liest keine Slots — offen ab dem ersten Moment.
    expect(states['a.pitch']).toBe('open')
    // b.purpose liest vier bestätigte Werte, die es noch nicht gibt.
    expect(states['b.purpose']).toBe('locked')
  })

  /**
   * Der D2b-Befund: `g.reading` hing an `g.inspiration`, und das ist ein
   * `special`-Slot, den weder die Werkstatt noch der Server je bestätigt
   * (D2a). Die Session stand damit für immer auf `locked` — der Lauf lief, das
   * Ergebnis war nicht abnehmbar. GEGENPROBE unten: eine BESTÄTIGBARE Quelle
   * sperrt unverändert.
   */
  it('wartet NICHT auf eine Quelle, die nie bestätigt werden kann (`special`)', () => {
    const design: BrandProfileFacts = { ...BASE_PROFILE, designUnlocked: true }
    const withSource = stepFacts({ 'g.source': { hasValue: true, confirmed: true } })
    expect(resolveSessionStates(design, withSource)['g.reading']).toBe('open')
    // Die Quelle steht trotzdem in der Kette — sonst verlöre der Impact-Hinweis
    // seinen Weg und die Lesung würde bei neuen Bildern nie veraltet.
    expect(slotById('g.reading')!.inputs.slots).toContain('g.inspiration')
  })

  /**
   * Der D2c-Befund (Konzept §2.18, „offen für D2c"): `g.dna` hängt an
   * `g.reading`. Auf dem Weg „Frida schlägt vor" gibt es nie Vorbilder und nie
   * eine Lesung — der Vorschlag stünde dort für immer auf `locked` und das
   * halbe Kapitel wäre unerreichbar.
   */
  it('öffnet `g.dna` ohne Lesung, sobald die Weiche „Frida schlägt vor" sagt', () => {
    const design: BrandProfileFacts = { ...BASE_PROFILE, designUnlocked: true }
    const confirmed = (value: string): BrandSlotStateFacts =>
      ({ hasValue: true, confirmed: true, value })
    const foundationPath = stepFacts({
      'c.final': confirmed('Klartext'),
      'd.primary': confirmed('sage'),
      'd.toneWords': confirmed('ruhig'),
      'result.direction': confirmed('warm-editorial'),
      'g.source': confirmed('foundation'),
    })
    expect(resolveSessionStates(design, foundationPath)['g.dna']).toBe('open')

    // GEGENPROBE: derselbe Stand mit „wir haben Vorbilder" wartet weiter auf
    // die Lesung — die Bedingung darf die Sperre nicht generell aufheben.
    const inspirationPath = stepFacts({
      'c.final': confirmed('Klartext'),
      'd.primary': confirmed('sage'),
      'd.toneWords': confirmed('ruhig'),
      'result.direction': confirmed('warm-editorial'),
      'g.source': confirmed('inspiration'),
    })
    expect(resolveSessionStates(design, inspirationPath)['g.dna']).toBe('locked')

    // GEGENPROBE 2: ein Weichen-ENTWURF „foundation" reicht nicht — solange
    // niemand zugestimmt hat, ist der Vorschlag nicht an der Reihe.
    const draftSwitch = stepFacts({
      'c.final': confirmed('Klartext'),
      'd.primary': confirmed('sage'),
      'd.toneWords': confirmed('ruhig'),
      'result.direction': confirmed('warm-editorial'),
      'g.source': { hasValue: true, value: 'foundation' },
    })
    expect(resolveSessionStates(design, draftSwitch)['g.dna']).toBe('locked')

    // Die Quelle bleibt in der Kette: der Impact-Hinweis und die
    // Veraltet-Rechnung behalten ihren Weg.
    expect(slotById('g.dna')!.inputs.slots).toContain('g.reading')
  })

  /**
   * DIESELBE WIRKUNG EIN KAPITEL FRÜHER (Audit-Befund 2026-09-09, Test-Lücke):
   * `d.primary`/`d.secondary` hängen an `d.pairs`, und das ist ein
   * `special`-Slot — das Paarvergleichs-Instrument gibt es nicht, also wird
   * `d.pairs` nie bestätigt (Davids Interim-Entscheidung 2026-09-04). Ohne die
   * Regel „warte nicht auf eine Quelle, die nie bestätigt werden kann" stünde
   * der halbe Archetyp-Baustein für immer zu.
   *
   * Sie greift hier NICHT als Freibrief: die Kette geht durch das Instrument
   * HINDURCH auf dessen eigene Quelle `d.hypothesis` — die Gegenprobe unten
   * hält genau das fest.
   */
  it('das Instrument reicht durch: mit `d.hypothesis` sind `d.primary` und `d.secondary` offen', () => {
    const confirmed = { hasValue: true, confirmed: true, value: 'x' }
    const states = resolveSessionStates(BASE_PROFILE, stepFacts({ 'd.hypothesis': confirmed }))
    expect(states['d.primary']).toBe('open')
    expect(states['d.secondary']).toBe('open')
    // Das Instrument selbst bleibt in der Kette — sonst verlöre der
    // Impact-Hinweis seinen Weg.
    expect(slotById('d.primary')!.inputs.slots).toEqual(['d.pairs'])
    expect(slotById('d.pairs')!.type).toBe('special')
  })

  it('GEGENPROBE: ohne `d.hypothesis` bleiben beide `locked`', () => {
    const states = resolveSessionStates(BASE_PROFILE, stepFacts({}))
    expect(states['d.primary']).toBe('locked')
    expect(states['d.secondary']).toBe('locked')
    // Auch ein blosser ENTWURF der Hypothese reicht nicht — bestätigt muss sie
    // sein, sonst leitete der Archetyp aus einem Vorschlag ab.
    const draftOnly = stepFacts({ 'd.hypothesis': { hasValue: true } })
    expect(resolveSessionStates(BASE_PROFILE, draftOnly)['d.primary']).toBe('locked')
  })

  it('die bedingte Quelle ist eine EIGENE Regel, prüfbar ohne die Zustandsmaschine', () => {
    expect(conditionalInputCounts('g.reading', {})).toBe(true)
    expect(conditionalInputCounts('g.reading', {
      'g.source': { confirmed: true, value: 'inspiration' },
    })).toBe(true)
    expect(conditionalInputCounts('g.reading', {
      'g.source': { confirmed: true, value: 'foundation' },
    })).toBe(false)
    // Jede andere Quelle ist unbedingt.
    expect(conditionalInputCounts('c.final', {
      'g.source': { confirmed: true, value: 'foundation' },
    })).toBe(true)
  })

  it('GEGENPROBE: das Instrument reicht seine EIGENE Quelle durch — ohne die Weiche bleibt zu', () => {
    const design: BrandProfileFacts = { ...BASE_PROFILE, designUnlocked: true }
    expect(resolveSessionStates(design, stepFacts({}))['g.reading']).toBe('locked')
    // Ein blosser Entwurf an der Weiche reicht nicht — bestätigt muss sie sein.
    const draftOnly = stepFacts({ 'g.source': { hasValue: true } })
    expect(resolveSessionStates(design, draftOnly)['g.reading']).toBe('locked')
  })

  it('öffnet sie, sobald ALLE Eingaben bestätigt sind — nicht schon bei Entwürfen', () => {
    const drafts = stepFacts({
      'a.pitch': { hasValue: true },
      'b.whyStarted': { hasValue: true },
      'b.worldLoses': { hasValue: true },
      'b.conviction': { hasValue: true },
    })
    expect(resolveSessionStates(BASE_PROFILE, drafts)['b.purpose']).toBe('locked')

    const confirmed = stepFacts({
      'a.pitch': { confirmed: true },
      'b.whyStarted': { confirmed: true },
      'b.worldLoses': { confirmed: true },
      'b.conviction': { confirmed: true },
    })
    expect(resolveSessionStates(BASE_PROFILE, confirmed)['b.purpose']).toBe('open')
  })

  it('liest über Kapitelgrenzen — sonst stünde die halbe Registry für immer zu', () => {
    // `b.purpose` liest `a.pitch` aus einem ANDEREN Baustein.
    const states = resolveSessionStates(BASE_PROFILE, stepFacts({
      'a.pitch': { confirmed: true },
      'b.whyStarted': { confirmed: true },
      'b.worldLoses': { confirmed: true },
      'b.conviction': { confirmed: true },
    }))
    expect(states['b.purpose']).toBe('open')
  })

  it('nennt eine bestätigte Session `done`', () => {
    expect(resolveSessionStates(BASE_PROFILE, stepFacts({ 'a.pitch': { confirmed: true } }))['a.pitch'])
      .toBe('done')
  })

  it('BESTAND OHNE HASH IST NIE VERALTET (Migrationsvertrag §3e)', () => {
    // c.livedExamples ist bestätigt, seine Quelle c.final hat sich geändert —
    // ohne gespeicherten Hash bleibt es trotzdem `done`.
    const states = resolveSessionStates(BASE_PROFILE, stepFacts({
      'c.final': { confirmed: true, value: '- Mut\n- Klarheit\n- Geduld' },
      'c.livedExamples': { confirmed: true, value: 'Damals im Winter.' },
    }))
    expect(states['c.livedExamples']).toBe('done')
  })

  it('färbt eine Session bernstein, sobald ihr gespeicherter Hash abweicht', () => {
    const lived = slotById('c.livedExamples')!
    const before = { 'c.final': { confirmed: true, value: '- Mut\n- Klarheit\n- Geduld' } }
    const hash = computeSourcesHash(lived, before)

    const unchanged = stepFacts({
      ...before,
      'c.livedExamples': { confirmed: true, sourcesHash: hash },
    })
    expect(resolveSessionStates(BASE_PROFILE, unchanged)['c.livedExamples']).toBe('done')

    const moved = stepFacts({
      'c.final': { confirmed: true, value: '- Mut\n- Klarheit\n- Tempo' },
      'c.livedExamples': { confirmed: true, sourcesHash: hash },
    })
    expect(resolveSessionStates(BASE_PROFILE, moved)['c.livedExamples']).toBe('stale')
  })

  it('BESTÄTIGT SCHLÄGT GESPERRT — ein `done` wird nie herabgestuft', () => {
    // c.livedExamples ist bestätigt, seine Quelle c.final aber (noch) nicht.
    const states = resolveSessionStates(BASE_PROFILE, stepFacts({
      'c.livedExamples': { confirmed: true },
    }))
    expect(states['c.livedExamples']).toBe('done')
  })

  it('sperrt die Sessions eines übersprungenen Kapitels', () => {
    const states = resolveSessionStates(BASE_PROFILE)
    // BASE_PROFILE hat einen Namen und keine Sub-Brands: B2 und F sind aus.
    expect(states['b2.visibility']).toBe('locked')
    expect(states['f.nameType']).toBe('locked')

    const withNaming = resolveSessionStates({ ...BASE_PROFILE, hasName: false })
    expect(withNaming['f.nameType']).toBe('open')
  })

  it('spricht über jede aktive Session der Registry und keine mehr', () => {
    const states = resolveSessionStates(BASE_PROFILE)
    expect(Object.keys(states)).toEqual(BRAND_SLOTS.filter(s => !s.deactivated).map(s => s.id))
  })
})

describe('transitionBrandStep — Invarianten beim Bestätigen (§3a Nr. 6)', () => {
  const valuesStep = (slots: Record<string, BrandSlotStateFacts>): BrandStepFacts => ({
    stepKey: 'values',
    state: 'active',
    slots,
  })

  it('weist ein `c.final` mit zwei Werten ab', () => {
    const step = valuesStep({ 'c.final': { hasValue: true, value: '- Mut\n- Klarheit' } })
    expect(transitionBrandStep(step, { kind: 'confirmSlot', slotId: 'c.final' }))
      .toEqual({ ok: false, code: 'invariant_violated' })
  })

  it('lässt drei bis fünf Werte durch', () => {
    const step = valuesStep({ 'c.final': { hasValue: true, value: '- Mut\n- Klarheit\n- Geduld' } })
    const result = transitionBrandStep(step, { kind: 'confirmSlot', slotId: 'c.final' })
    expect(result.ok).toBe(true)
  })

  it('PRÜFT NICHTS OHNE WERT — fail-open, damit ein 409 nie ein Verdrahtungsfehler ist', () => {
    // Genau der Zustand von heute: `toSlotFacts` liefert nur die zwei Flags.
    const step = valuesStep({ 'c.final': { hasValue: true } })
    expect(transitionBrandStep(step, { kind: 'confirmSlot', slotId: 'c.final' }).ok).toBe(true)
  })
})

/**
 * DIE FINALE ABNAHME (BW2 §5a) — abnehmen, vertagen, und die drei neuen
 * Glieder, die `complete` seither verlangt.
 *
 * Was hier bewiesen wird, ist die Trennung, an der die ganze Ebene hängt:
 * `confirmed` heisst „in der Session so gesagt", `accepted` heisst „im
 * Zusammenhang des Kapitels gelesen". Fällt sie, ist die Abnahme-Seite ein
 * zweiter Bestätigen-Knopf ohne Aussage.
 */
describe('transitionBrandStep — abnehmen und vertagen (§5a)', () => {
  const activeValues = (slots: Record<string, BrandSlotStateFacts>): BrandStepFacts => ({
    stepKey: 'values',
    state: 'active',
    slots,
  })

  it('NIMMT einen bestätigten Wert ab', () => {
    const step = activeValues({ 'c.final': { hasValue: true, confirmed: true } })
    const result = transitionBrandStep(step, { kind: 'acceptSlot', slotId: 'c.final' })
    expect(result).toMatchObject({ ok: true, changed: true })
    expect(result.ok && result.step.slots?.['c.final']?.accepted).toBe(true)
  })

  it('ist idempotent — zweimal abnehmen schreibt nicht zweimal', () => {
    const step = activeValues({ 'c.final': { hasValue: true, confirmed: true, accepted: true } })
    expect(transitionBrandStep(step, { kind: 'acceptSlot', slotId: 'c.final' }))
      .toMatchObject({ ok: true, changed: false })
  })

  it('VERWEIGERT die Abnahme eines unbestätigten Werts', () => {
    const step = activeValues({ 'c.final': { hasValue: true } })
    expect(transitionBrandStep(step, { kind: 'acceptSlot', slotId: 'c.final' }))
      .toEqual({ ok: false, code: 'not_confirmed' })
  })

  it('lässt eine Abnahme auch auf einem ABGESCHLOSSENEN Kapitel zu', () => {
    // Nach einer Korrektur verliert die Zeile ihr `accepted`; sie danach nur
    // über `reopen` wieder annehmen zu lassen, machte aus einer
    // Kommakorrektur einen Kapitel-Neustart.
    const done = completedStep('values')
    const slots = { ...done.slots, 'c.final': { hasValue: true, confirmed: true } }
    expect(transitionBrandStep({ ...done, slots }, { kind: 'acceptSlot', slotId: 'c.final' }))
      .toMatchObject({ ok: true, changed: true })
  })

  it('weist eine fremde und eine erfundene Session ab', () => {
    const step = activeValues({})
    expect(transitionBrandStep(step, { kind: 'acceptSlot', slotId: 'a.pitch' }))
      .toEqual({ ok: false, code: 'slot_foreign' })
    expect(transitionBrandStep(step, { kind: 'acceptSlot', slotId: 'c.erfunden' }))
      .toEqual({ ok: false, code: 'unknown_slot' })
  })

  it('VERTAGT nur, wo die Session es erlaubt', () => {
    const step = activeValues({})
    // `c.conflictRule` trägt `allowDefer: true` (sessionContent.ts) …
    expect(transitionBrandStep(step, { kind: 'deferSlot', slotId: 'c.conflictRule', deferred: true }))
      .toMatchObject({ ok: true, changed: true })
    // … `c.final` nicht.
    expect(transitionBrandStep(step, { kind: 'deferSlot', slotId: 'c.final', deferred: true }))
      .toEqual({ ok: false, code: 'defer_not_allowed' })
  })

  it('vertagt KEINEN bestätigten Wert — er ist ja da', () => {
    const step = activeValues({ 'c.conflictRule': { hasValue: true, confirmed: true } })
    expect(transitionBrandStep(step, { kind: 'deferSlot', slotId: 'c.conflictRule', deferred: true }))
      .toEqual({ ok: false, code: 'already_confirmed' })
  })

  it('nimmt das Vertagen zurück und ist dabei ein No-op, wenn nichts anders wird', () => {
    const step = activeValues({ 'c.conflictRule': { deferred: true } })
    expect(transitionBrandStep(step, { kind: 'deferSlot', slotId: 'c.conflictRule', deferred: true }))
      .toMatchObject({ ok: true, changed: false })
    const back = transitionBrandStep(step, { kind: 'deferSlot', slotId: 'c.conflictRule', deferred: false })
    expect(back).toMatchObject({ ok: true, changed: true })
    expect(back.ok && back.step.slots?.['c.conflictRule']?.deferred).toBe(false)
  })

  it('ABNEHMEN HEBT EIN VERTAGEN AUF — beides zugleich wäre keine Aussage', () => {
    const step = activeValues({ 'c.conflictRule': { hasValue: true, confirmed: true, deferred: true } })
    const result = transitionBrandStep(step, { kind: 'acceptSlot', slotId: 'c.conflictRule' })
    expect(result.ok && result.step.slots?.['c.conflictRule'])
      .toMatchObject({ accepted: true, deferred: false })
  })
})

describe('brandStepAcceptance — die drei neuen Glieder (§5a Schritt 3)', () => {
  /** Alle Pflicht-Sessions bestätigt und abgenommen. */
  function ready(stepKey: BrandStepKey): Record<string, BrandSlotStateFacts> {
    return Object.fromEntries(confirmableRequiredSlotsForStep(stepKey)
      .map(slot => [slot.id, { hasValue: true, confirmed: true, accepted: true }]))
  }

  it('ist bereit, wenn alles bestätigt UND abgenommen ist', () => {
    const acceptance = brandStepAcceptance('values', ready('values'))
    expect(acceptance.ready).toBe(true)
    expect(acceptance.blockers).toEqual([])
    expect(acceptance.accepted).toBe(acceptance.total)
    expect(acceptance.total).toBe(confirmableRequiredSlotsForStep('values').length)
  })

  it('nennt JEDEN Grund beim Namen — nicht „irgendwas fehlt"', () => {
    const slots = ready('values')
    slots['c.final'] = { hasValue: true, confirmed: true }
    slots['c.livedExamples'] = { hasValue: true }
    slots['c.conflictRule'] = { deferred: true }
    const acceptance = brandStepAcceptance(
      'values',
      slots,
      { 'c.definitions': 'stale' },
      ['c.discovery1'],
    )
    expect(acceptance.ready).toBe(false)
    expect(acceptance.blockers).toContainEqual({ slotId: 'c.final', reason: 'unaccepted' })
    expect(acceptance.blockers).toContainEqual({ slotId: 'c.livedExamples', reason: 'unconfirmed' })
    expect(acceptance.blockers).toContainEqual({ slotId: 'c.conflictRule', reason: 'deferred' })
    expect(acceptance.blockers).toContainEqual({ slotId: 'c.definitions', reason: 'stale' })
    expect(acceptance.blockers).toContainEqual({ slotId: 'c.discovery1', reason: 'conflict' })
  })

  it('EIN OFFENER KONFLIKT SPERRT DIE ABNAHME — auch an einer optionalen Session', () => {
    // §5a: die eine Stelle, an der ein Befund Zwang ausübt, und zwar an der
    // KAPITEL-Grenze — nicht in der Session.
    expect(brandStepAcceptance('values', ready('values'), {}, ['c.teamFilter']).ready).toBe(false)
  })

  it('zählt eine OPTIONALE Session erst mit, wenn sie einen bestätigten Wert hat', () => {
    const without = brandStepAcceptance('values', ready('values'))
    const slots = { ...ready('values'), 'c.teamFilter': { hasValue: true, confirmed: true } }
    const withOptional = brandStepAcceptance('values', slots)
    expect(withOptional.total).toBe(without.total + 1)
    expect(withOptional.ready).toBe(false)
    expect(withOptional.blockers).toEqual([{ slotId: 'c.teamFilter', reason: 'unaccepted' }])
  })

  /**
   * „ALLE ABNEHMEN" (Davids Befund 10, 2026-09-09) — die Vorauswahl des
   * Sammel-Knopfes. Sie MUSS dieselbe Menge treffen wie der Haken je Zeile,
   * sonst lässt der Sammel-Knopf eine Zeile stehen, die daneben einen Haken
   * anbietet.
   */
  it('brandAcceptableSessions nimmt genau das, was auch der Einzel-Haken nimmt', () => {
    const slots = ready('values')
    slots['c.final'] = { hasValue: true, confirmed: true }
    slots['c.livedExamples'] = { hasValue: true }
    const acceptable = brandAcceptableSessions('values', slots)

    expect(acceptable).toEqual(['c.final'])
    // Und die Gegenprobe an der puren Einzel-Regel — beide sagen dasselbe.
    expect(brandSessionAcceptable(slots['c.final'])).toBe(true)
    expect(brandSessionAcceptable(slots['c.livedExamples'])).toBe(false)
    expect(brandSessionAcceptable(slots['c.definitions'])).toBe(false)
    expect(brandSessionAcceptable(undefined)).toBe(false)
  })

  it('nimmt eine OPTIONALE Session mit, sobald sie bestätigt ist', () => {
    const slots = { ...ready('values'), 'c.teamFilter': { hasValue: true, confirmed: true } }
    expect(brandAcceptableSessions('values', slots)).toEqual(['c.teamFilter'])
    // Ohne Wert steht sie grau da und wird nicht angefasst.
    expect(brandAcceptableSessions('values', ready('values'))).toEqual([])
  })

  it('VERALTET und VERTAGT sperren die Abnahme NICHT — sie sperren den Abschluss', () => {
    // Der Weg aus `stale` heraus ist „Gilt weiter", nicht ein verbotener Haken:
    // die Zustände sind in `blockers` sichtbar, und der Einzel-Knopf nimmt sie
    // genauso an.
    const slots = ready('values')
    slots['c.final'] = { hasValue: true, confirmed: true, deferred: true }
    expect(brandAcceptableSessions('values', slots)).toEqual(['c.final'])
  })

  it('LESEN BLEIBT NACHSICHTIG: ein gespeichertes `done` wird nicht herabgestuft', () => {
    // Ein Bestands-Kapitel kennt gar kein `accepted` — die Journey rechnet es
    // trotzdem `done` (Migrationsvertrag §3e). Streng ist nur `complete`.
    const legacy: BrandStepFacts = {
      stepKey: 'values',
      state: 'done',
      confidence: 'fits',
      slots: Object.fromEntries(confirmableRequiredSlotsForStep('values')
        .map(slot => [slot.id, { hasValue: true, confirmed: true }])),
    }
    expect(brandStepAcceptance('values', legacy.slots).ready).toBe(false)
    const journey = resolveBrandJourney(BASE_PROFILE, [
      completedStep('context'), completedStep('pvm'), legacy,
    ])
    expect(stateOf(journey, 'values').state).toBe('done')
  })

  it('`complete` weist mit `acceptance_incomplete` ab und legt die Gründe bei', () => {
    const slots = Object.fromEntries(confirmableRequiredSlotsForStep('values')
      .map(slot => [slot.id, { hasValue: true, confirmed: true }]))
    const result = transitionBrandStep(
      { stepKey: 'values', state: 'active', confidence: 'fits', slots },
      { kind: 'complete' },
    )
    expect(result).toMatchObject({ ok: false, code: 'acceptance_incomplete' })
    expect(!result.ok && result.blockers?.every(blocker => blocker.reason === 'unaccepted')).toBe(true)
    expect(!result.ok && result.missing).toEqual(confirmableRequiredSlotsForStep('values').map(slot => slot.id))
  })
})

describe('transitionBrandStep — restart (§5a)', () => {
  it('LEERT das Kapitel und stellt es auf `active`', () => {
    const result = transitionBrandStep(completedStep('values'), { kind: 'restart' })
    expect(result).toMatchObject({ ok: true, changed: true })
    if (!result.ok) return
    expect(result.step.state).toBe('active')
    expect(result.step.confidence).toBeNull()
    expect(result.step.slots).toEqual({})
  })

  it('geht von `active` genauso', () => {
    expect(transitionBrandStep(filledActiveStep('values'), { kind: 'restart' }))
      .toMatchObject({ ok: true, changed: true })
  })

  it('GEGENPROBE: ein nicht begonnenes oder gesperrtes Kapitel hat nichts zu verlieren', () => {
    expect(transitionBrandStep({ stepKey: 'values', state: 'open' }, { kind: 'restart' }))
      .toEqual({ ok: false, code: 'not_started' })
    expect(transitionBrandStep({ stepKey: 'values', state: 'locked' }, { kind: 'restart' }))
      .toEqual({ ok: false, code: 'step_locked' })
  })

  it('ist NICHT `reopen`: der lässt Slots und Konfidenz stehen', () => {
    const reopened = transitionBrandStep(completedStep('values'), { kind: 'reopen' })
    expect(reopened.ok && Object.keys(reopened.step.slots ?? {}).length).toBeGreaterThan(0)
    expect(reopened.ok && reopened.step.confidence).toBe('fits')
  })
})

describe('resolveNextStop — der Wegweiser am Kapitelende', () => {
  it('zeigt auf die nächste offene Pflicht-Session', () => {
    expect(resolveNextStop('context', {})).toEqual({ stepKey: 'context', sessionKey: 'a.origin' })
  })

  it('zeigt auf die FINALE ABNAHME, wenn nichts mehr offen ist', () => {
    const slots = Object.fromEntries(confirmableRequiredSlotsForStep('context')
      .map(slot => [slot.id, { hasValue: true, confirmed: true }]))
    expect(resolveNextStop('context', slots)).toEqual({ stepKey: 'context', acceptance: true })
  })

  /**
   * EIN UNBESTÄTIGTER WERT IST OFFEN, NICHT ERLEDIGT (Testlauf-Befund E,
   * 2026-09-09).
   *
   * Der Wegweiser rechnete über `slotIsFilled` — Entwurf ODER Bestätigung.
   * Nach dem Abschluss von Kundenstimmen hiess der Knopf deshalb „Weiter zu
   * Größtes Hindernis", obwohl Kritik & Beschwerden und Das Eine in der Leiste
   * offen standen: sie trugen einen Wert und galten als abgehakt.
   */
  it('überspringt eine Session mit WERT nicht, solange sie unbestätigt ist (Befund E)', () => {
    const slots = {
      'a.origin': { hasValue: true, confirmed: true },
      'a.customerPraise': { hasValue: true, confirmed: true },
      // Wert da, Bestätigung fehlt — GENAU der Fall aus dem Live-Test.
      'a.complaints': { hasValue: true },
    }
    expect(resolveNextStop('context', slots))
      .toEqual({ stepKey: 'context', sessionKey: 'a.complaints' })
  })

  it('überspringt Bestätigtes und Vertagtes', () => {
    const slots = {
      'a.origin': { hasValue: true, confirmed: true },
      'a.customerPraise': { hasValue: false, deferred: true },
    }
    expect(resolveNextStop('context', slots))
      .toEqual({ stepKey: 'context', sessionKey: 'a.complaints' })
  })

  it('GEGENPROBE: keine offene FRAGE, aber ein unbestätigter Entwurf ⇒ null', () => {
    const required = confirmableRequiredSlotsForStep('context')
    // Jede FRAGE bestätigt, ein ABGELEITETES Pflicht-Feld nur mit Entwurf: es
    // ist kein Ziel für „weiter" (George stellt es nie), aber das Kapitel ist
    // auch nicht fertig — der Mensch bleibt, wo er ist.
    const derived = required.find(slot => slot.type !== 'question' && slot.type !== 'choice')!
    const slots = Object.fromEntries(required.map(slot => [
      slot.id,
      slot.id === derived.id ? { hasValue: true } : { hasValue: true, confirmed: true },
    ]))
    expect(resolveNextStop('context', slots)).toBeNull()
  })

  /**
   * DIE WARTESCHLANGE „NEU BESPRECHEN" (BW2 Paket 6, §9) — sie wird VOR den
   * offenen Sessions bedient.
   *
   * Wer an einer veralteten Session vorbei die nächsten Fragen beantwortet,
   * baut auf einer Grundlage weiter, die es so nicht mehr gibt — und sieht
   * seine neuen Antworten hinterher ein zweites Mal an.
   */
  it('bedient eine VERALTETE Session vor jeder offenen', () => {
    expect(resolveNextStop('context', {}, { 'a.customerPraise': 'stale' }))
      .toEqual({ stepKey: 'context', sessionKey: 'a.customerPraise' })
  })

  it('mehrere veraltete ⇒ die erste in REGISTRY-Reihenfolge', () => {
    expect(resolveNextStop('context', {}, { 'a.complaints': 'stale', 'a.origin': 'stale' }))
      .toEqual({ stepKey: 'context', sessionKey: 'a.origin' })
  })

  it('sie gilt auch am Kapitelende — vor der Finalen Abnahme', () => {
    const slots = Object.fromEntries(confirmableRequiredSlotsForStep('context')
      .map(slot => [slot.id, { hasValue: true, confirmed: true }]))
    expect(resolveNextStop('context', slots, { 'a.oneThing': 'stale' }))
      .toEqual({ stepKey: 'context', sessionKey: 'a.oneThing' })
    // GEGENPROBE: ohne veraltete Session steht dort weiter die Abnahme.
    expect(resolveNextStop('context', slots, { 'a.oneThing': 'done' }))
      .toEqual({ stepKey: 'context', acceptance: true })
  })

  it('OHNE Session-Zustände verhält sie sich wie vor Paket 6', () => {
    // Der Vorgabewert ist leer: eine Aufrufstelle, die die Zustände nicht
    // kennt (sie sind eine Rechnung über ALLE Kapitel), bekommt wörtlich das
    // alte Verhalten.
    expect(resolveNextStop('context', {})).toEqual({ stepKey: 'context', sessionKey: 'a.origin' })
  })

  it('eine VERALTETE Session eines ANDEREN Kapitels zählt hier nicht', () => {
    expect(resolveNextStop('context', {}, { 'c.final': 'stale' }))
      .toEqual({ stepKey: 'context', sessionKey: 'a.origin' })
  })
})

describe('pickNextSession — der Vorschlag des Spezialisten, geprüft (§6/§9)', () => {
  const states = (sessions: Record<string, 'locked' | 'open' | 'done' | 'stale'>) => ({
    slots: {},
    sessions,
  })

  it('folgt einem gültigen Vorschlag aus der offenen Menge', () => {
    expect(pickNextSession('context', states({ 'a.complaints': 'open' }), 'a.complaints'))
      .toEqual({ stepKey: 'context', sessionKey: 'a.complaints' })
  })

  it('DIE WARTESCHLANGE SCHLÄGT DEN VORSCHLAG', () => {
    // Der Spezialist wählt unter den OFFENEN; die Warteschlange räumt auf, was
    // eine Korrektur gerade unsicher gemacht hat.
    expect(pickNextSession(
      'context',
      states({ 'a.complaints': 'open', 'a.origin': 'stale' }),
      'a.complaints',
    )).toEqual({ stepKey: 'context', sessionKey: 'a.origin' })
  })

  it('ein Vorschlag auf eine VERALTETE Session fällt durch — das wäre eine Korrektur', () => {
    expect(pickNextSession('context', states({ 'a.origin': 'stale' }), 'a.origin'))
      .toEqual({ stepKey: 'context', sessionKey: 'a.origin' })
    // … und ohne Warteschlange bliebe von dem Vorschlag die Grundfassung übrig.
    expect(pickNextSession('context', states({ 'a.origin': 'done' }), 'a.origin'))
      .toEqual({ stepKey: 'context', sessionKey: 'a.origin' })
  })
})

describe('brandRestartImpact — was ein Neustart kostet', () => {
  /** Jede Session der Registry bestätigt — die volle Hülle wird sichtbar. */
  const allConfirmed: Record<string, BrandSlotStateFacts> = Object.fromEntries(
    BRAND_SLOTS.filter(slot => !slot.deactivated)
      .map(slot => [slot.id, { hasValue: true, confirmed: true }]),
  )

  it('nennt nur BESTÄTIGTE Felder SPÄTERER Kapitel', () => {
    const impact = brandRestartImpact('context', allConfirmed)
    expect(impact.count).toBeGreaterThan(0)
    expect(impact.sessions.every(id => slotById(id)!.stepId !== 'context')).toBe(true)
    expect(Object.keys(impact.byStep)).not.toContain('context')
  })

  it('GEGENPROBE: ohne bestätigte Werte ist die Hülle leer', () => {
    expect(brandRestartImpact('context', {}).count).toBe(0)
  })

  it('GEGENPROBE: das letzte Kapitel berührt nichts mehr', () => {
    // Seit Brand Design D0 ist das `motion` und nicht mehr `result`: Schicht 2
    // hängt an `result.direction`, ein Neustart des Ergebnis-Kapitels kostet
    // also die 26 bestätigten Design-Felder dahinter. Beides steht hier, damit
    // die Zeile nicht bloss auf einen neuen Schlüssel umgebogen aussieht.
    expect(brandRestartImpact('motion', allConfirmed).count).toBe(0)
    const fromResult = brandRestartImpact('result', allConfirmed)
    expect(fromResult.count).toBe(26)
    expect(fromResult.sessions.every(id => isBrandDesignStep(slotById(id)!.stepId))).toBe(true)
  })

  it('ist die VEREINIGUNG über alle Sessions des Kapitels', () => {
    const union = new Set<string>()
    for (const slot of slotsForStep('values')) {
      for (const id of sessionsAffectedBy(slot.id).transitive) union.add(id)
    }
    const expected = [...union].filter(id => slotById(id)!.stepId !== 'values'
      && BRAND_STEP_KEYS.indexOf(slotById(id)!.stepId) > BRAND_STEP_KEYS.indexOf('values'))
    expect([...brandRestartImpact('values', allConfirmed).sessions].sort())
      .toEqual(expected.sort())
  })
})

/**
 * WOHIN NACH DER ANLAGE (Kailua-Befund 6, 2026-09-08).
 *
 * Zwei Oberflächen legen an (Modal und Seite) und müssen an derselben Stelle
 * landen — die Regel ist deshalb pur und wird von beiden gelesen.
 */
describe('firstOpenBrandStep', () => {
  function step(stepKey: BrandStepKey, state: BrandJourneyStep['state']): BrandJourneyStep {
    return {
      stepKey,
      state,
      reason: null,
      optional: false,
      progress: { requiredTotal: 0, requiredFilled: 0, pct: 0 },
      missingRequired: [],
      confidence: null,
    }
  }

  it('nimmt den ersten offenen Baustein', () => {
    expect(firstOpenBrandStep([
      step('context', 'open'),
      step('pvm', 'locked'),
    ])).toBe('context')
  })

  it('ein bereits begonnener (`active`) zählt genauso', () => {
    expect(firstOpenBrandStep([
      step('context', 'done'),
      step('pvm', 'active'),
    ])).toBe('pvm')
  })

  it('ÜBERSPRUNGENE sind keine Adresse — die Route antwortet dort 403', () => {
    expect(firstOpenBrandStep([
      step('architecture', 'skipped'),
      step('context', 'locked'),
    ])).toBe('context')
  })

  it('ohne Journey bleibt der erste Baustein — er ist nie übersprungen', () => {
    expect(firstOpenBrandStep([])).toBe('context')
  })
})

/**
 * WAS ZWISCHEN HIER UND DEM ZIEL ÜBERSPRUNGEN WIRD (Davids Entscheidung
 * 2026-09-09, Session-Abschluss).
 *
 * Der Abschlusszug soll den Sprung ERKLÄREN („Kundenstimmen hast du schon
 * beantwortet, weiter mit Kritik & Beschwerden") — und er darf dabei nur
 * behaupten, was auch stimmt. Genau das wird hier gemessen: die Menge ist
 * gerechnet, nicht geraten.
 */
describe('skippedSessionsBetween — der Abschlusszug erklärt den Sprung', () => {
  const CONFIRMED = { confirmed: true, deferred: false }
  const DEFERRED = { confirmed: false, deferred: true }
  const OPEN = { confirmed: false, deferred: false }

  it('nennt die bestätigten Sessions zwischen hier und dem Ziel', () => {
    expect(skippedSessionsBetween(
      'context',
      'a.origin',
      { stepKey: 'context', sessionKey: 'a.complaints' },
      { 'a.customerPraise': CONFIRMED },
    )).toEqual(['a.customerPraise'])
  })

  it('nennt auch die vertagten', () => {
    expect(skippedSessionsBetween(
      'context',
      'a.origin',
      { stepKey: 'context', sessionKey: 'a.oneThing' },
      { 'a.customerPraise': CONFIRMED, 'a.complaints': DEFERRED },
    )).toEqual(['a.customerPraise', 'a.complaints'])
  })

  it('eine GESPERRTE Session wird still übersprungen — sie ist nicht „erledigt"', () => {
    // `resolveNextStop` geht an ihr vorbei, George dürfte darüber aber nicht
    // sagen, der Mensch habe sie beantwortet. Das wäre schlicht falsch.
    expect(skippedSessionsBetween(
      'context',
      'a.origin',
      { stepKey: 'context', sessionKey: 'a.complaints' },
      { 'a.customerPraise': OPEN },
    )).toEqual([])
  })

  it('geht bis ans Ende des Kapitels, wenn das Ziel die Abnahme ist', () => {
    expect(skippedSessionsBetween(
      'context',
      'a.oneThing',
      { stepKey: 'context', acceptance: true },
      { 'a.challenge': CONFIRMED, 'a.facts': DEFERRED },
    )).toEqual(['a.challenge', 'a.facts'])
    // Dasselbe ohne Ziel — auch dort ist „dazwischen" der Rest.
    expect(skippedSessionsBetween('context', 'a.oneThing', null, { 'a.challenge': CONFIRMED }))
      .toEqual(['a.challenge'])
  })

  it('RÜCKWÄRTS wird nichts übersprungen (die Warteschlange „neu besprechen")', () => {
    // Zeigt der Wegweiser auf eine veraltete Session WEITER VORN, wird nicht
    // übersprungen, sondern zurückgesprungen — und dafür hat der Auftrag den
    // Grund der Veraltung, nicht diese Liste.
    expect(skippedSessionsBetween(
      'context',
      'a.oneThing',
      { stepKey: 'context', sessionKey: 'a.origin' },
      { 'a.customerPraise': CONFIRMED },
    )).toEqual([])
  })

  it('eine unbekannte Ausgangs-Session liefert nichts', () => {
    expect(skippedSessionsBetween('context', 'z.nope', null, {})).toEqual([])
  })
})
