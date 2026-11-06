import { describe, expect, it } from 'vitest'
import { BRAND_ARCHETYPES, BRAND_ARCHITECTURE_MODELS } from '../shared/brandChoiceOptions'
import { BRAND_LIST_FORMAT_RULE } from '../shared/brandSlotFormat'
import { BRAND_SLOTS, type BrandStepKey, slotById } from '../shared/slotRegistry'
import {
  type BrandSlotInstructionOptions,
  GEORGE_PRIMARY_SOURCE_ANSWERS,
  GEORGE_PRIMARY_SOURCE_START_CARD,
  brandValueHasSpeaker,
} from '../server/utils/georgePrompt'
import { sessionInstructionForSlot } from '../server/utils/sessionPrompt'
import { MILO_CANDIDATE_RANGE } from '../server/utils/miloPrompt'
import { VERA_COMPETITOR_TEST } from '../server/utils/veraPrompt'
import {
  ARCHETYPE_PAIRS_PENDING,
  ARCHETYPE_TWO_CANDIDATES_RULE,
} from '../server/utils/archetypePrompt'

/**
 * VERAS UND MILOS AUFTRÄGE (P3.1) — geprüft ohne einen einzigen KI-Aufruf.
 *
 * Was hier bewiesen wird, ist nicht „der Prompt enthält Wörter", sondern die
 * Zusagen, die den Unterschied zwischen einem brauchbaren und einem beliebigen
 * Entwurf machen:
 *
 *  1. JEDER Slot, den die Registry als entwerfbar führt, hat einen Auftrag.
 *     Fehlt einer, wirft die Instruktion — und die Route macht daraus
 *     `provider_error`, also die Auskunft „der Anbieter ist kaputt" für einen
 *     Fehler, der in dieser Datei liegt.
 *  2. Die FORMELN aus Content-Spec §5 stehen drin — und ausdrücklich als
 *     Gerüst. Ein Modell, das die Formel abschreibt, liefert einen Satz, dem
 *     man den Bauplan ansieht.
 *  3. VERAS PRÜFSTEIN steht in jedem PVM-Auftrag: „könnte das jeder
 *     Wettbewerber wörtlich sagen?" ist die Qualitätsschwelle von §5.
 *  4. MILO DESTILLIERT AUS MOMENTEN, nicht aus Adjektiven — jeder Kandidat
 *     trägt seinen Beleg IN DER ZEILE, weil der Mensch danach an der LISTE
 *     auswählt und nicht am Chat-Verlauf.
 *  5. Die FORMALIEN sind wortgleich mit Georges Baustein A. Sie stehen seit
 *     P3.1 an einer Stelle; drei Kopien wären drei Chancen, dass eine
 *     Sicherung in einem Baustein fehlt.
 */

function optionsFor(slotId: string, overrides: Partial<BrandSlotInstructionOptions> = {}): BrandSlotInstructionOptions {
  const slot = slotById(slotId)!
  return {
    dependencies: overrides.dependencies ?? [],
    hint: overrides.hint ?? '',
    pathKind: overrides.pathKind ?? 'new',
    maxLength: overrides.maxLength ?? slot.maxLength,
    kind: overrides.kind ?? slot.schema.kind,
    hasSiteAnalysis: overrides.hasSiteAnalysis ?? false,
    hasConversation: overrides.hasConversation ?? false,
    // Die Weiche W3 (a-14) reist nur mit, wenn der Aufrufer sie nennt — ohne
    // sie sagt der Auftrag zur Person das, was er vor a-14 sagte.
    ...(overrides.team ? { team: overrides.team } : {}),
  }
}

/** Die Slots eines Bausteins, die George/Vera/Milo überhaupt entwerfen. */
function generatableSlots(...steps: BrandStepKey[]): string[] {
  return BRAND_SLOTS
    .filter(slot => steps.includes(slot.stepId) && !slot.deactivated && slot.generator !== 'none')
    .map(slot => slot.id)
}

describe('Jeder entwerfbare Slot hat einen Auftrag', () => {
  it('VERA deckt die Bausteine B und B2 vollständig ab', () => {
    const slots = generatableSlots('pvm', 'architecture')
    // Ohne diese Zeile wäre der Test grün, sobald jemand die Registry leert.
    expect(slots).toEqual([
      'b.whyStarted', 'b.positioningCategory', 'b.purpose', 'b.vision', 'b.mission',
      'b2.model', 'b2.rule',
    ])
    for (const slotId of slots) {
      expect(() => sessionInstructionForSlot(slotId, optionsFor(slotId)), slotId).not.toThrow()
    }
  })

  it('MILO deckt Baustein C vollständig ab', () => {
    const slots = generatableSlots('values')
    expect(slots).toEqual(['c.candidates', 'c.definitions'])
    for (const slotId of slots) {
      expect(() => sessionInstructionForSlot(slotId, optionsFor(slotId)), slotId).not.toThrow()
    }
  })

  it('BAUSTEIN D IST VOLLSTÄNDIG ABGEDECKT — die letzte Lücke der Registry', () => {
    const slots = generatableSlots('archetype')
    expect(slots).toEqual([
      'd.hypothesis', 'd.primary', 'd.secondary', 'd.gapReveal',
      'd.voiceSamples', 'd.toneWords', 'd.vocabulary',
    ])
    for (const slotId of slots) {
      expect(() => sessionInstructionForSlot(slotId, optionsFor(slotId)), slotId).not.toThrow()
    }
    // `d.pairs` steht bewusst NICHT dabei: er ist `generator: 'none'` und
    // bekommt sein eigenes Instrument (Spec §12.2).
    expect(slots).not.toContain('d.pairs')
    expect(() => sessionInstructionForSlot('d.pairs', optionsFor('d.pairs'))).toThrow(/d\.pairs/)
  })

  /**
   * BIS BW2 WAR DAS EINE ANDERE PRÜFUNG: vier Aufgaben-TABELLEN, je eine pro
   * Berater, und ein Slot in der falschen Tabelle warf („Kein Vera-Auftrag
   * für Slot c.candidates"). Diese Grenze gibt es nicht mehr — der Plan
   * ersetzt die vier Tabellen ausdrücklich durch EINEN Bauer über der Registry
   * (BRAND-WIZARD-SESSIONS.md §3), und für den ist `c.candidates` einfach eine
   * Session mit Auftrag. Was BLEIBT und hier festgenagelt wird, ist die
   * eigentliche Zusage: eine Session OHNE Entwurfs-Auftrag bekommt keinen
   * stillen Allzweck-Text, sondern einen Wurf.
   */
  it('EINE SESSION OHNE ENTWURFS-AUFTRAG WIRFT, statt einen Allzweck-Text zu liefern', () => {
    // Reine Menschenfragen (`generator: 'none'`) entwirft George nie.
    expect(() => sessionInstructionForSlot('a.origin', optionsFor('a.origin'))).toThrow(/a\.origin/)
    expect(() => sessionInstructionForSlot('c.livedExamples', optionsFor('c.livedExamples')))
      .toThrow(/c\.livedExamples/)
    // Entwerfbar laut Registry, aber noch ohne Verarbeitungsregeln (Paket 2).
    expect(() => sessionInstructionForSlot('e.manifesto', optionsFor('e.manifesto'))).toThrow(/e\.manifesto/)
    // Und eine Id, die es gar nicht gibt.
    expect(() => sessionInstructionForSlot('a.erfunden', optionsFor('a.pitch'))).toThrow(/a\.erfunden/)
  })
})

describe('Vera · Purpose · Vision · Mission (Content-Spec §5)', () => {
  it('PURPOSE ist das WARUM — Formel als Gerüst, nicht als Lückentext', () => {
    const instruction = sessionInstructionForSlot('b.purpose', optionsFor('b.purpose'))
    expect(instruction).toContain('the WHY')
    expect(instruction).toContain('beyond making money')
    expect(instruction).toContain('"We exist so that <who> <what changes for them>."')
    expect(instruction).toContain('never as a fill-in-the-blanks')
    expect(instruction).toContain('if your draft still looks like the formula, rewrite it')
    // Es ist kein Produkt- und kein Umsatzsatz.
    expect(instruction).toContain('not a product')
  })

  it('VISION ist das WOHIN — ein Bild, keine Zielzahl', () => {
    const instruction = sessionInstructionForSlot('b.vision', optionsFor('b.vision'))
    expect(instruction).toContain('the WHERE TO')
    expect(instruction).toContain('"In ten years, <what looks different in the world because they existed>."')
    expect(instruction).toContain('A picture, not a target figure')
    expect(instruction).toContain('no market share, no revenue, no headcount')
    // Erreichter Zustand statt Absichtserklärung.
    expect(instruction).toContain('a state that HAS arrived')
  })

  it('MISSION ist das WIE — und bleibt unter dem Purpose', () => {
    const instruction = sessionInstructionForSlot('b.mission', optionsFor('b.mission'))
    expect(instruction).toContain('the HOW')
    expect(instruction).toContain('"We <do what> for <whom>, so that <what result>."')
    expect(instruction).toContain('a new colleague could act on it tomorrow')
    expect(instruction).toContain('the mission is the how of THAT why, not a second why')
  })

  it('VERAS PRÜFSTEIN steht in allen drei — und die Verbotsliste dazu', () => {
    for (const slotId of ['b.purpose', 'b.vision', 'b.mission']) {
      const instruction = sessionInstructionForSlot(slotId, optionsFor(slotId))
      expect(instruction, slotId).toContain(VERA_COMPETITOR_TEST)
      expect(instruction, slotId).toContain('could any competitor in this industry say exactly this')
      expect(instruction, slotId).toContain('"world-class", "innovative", "passionate"')
    }
    // GEGENPROBE: er steht NICHT in den Aufträgen, die keine Aussage entwerfen —
    // eine Kategorie ist kein Satz, den ein Wettbewerber „sagen" könnte.
    expect(sessionInstructionForSlot('b2.rule', optionsFor('b2.rule'))).not.toContain(VERA_COMPETITOR_TEST)
  })

  it('b.whyStarted LEITET AB und erfindet nicht — und fragt lieber', () => {
    const instruction = sessionInstructionForSlot('b.whyStarted', optionsFor('b.whyStarted'))
    expect(instruction).toContain('This is a DERIVATION, not a new question')
    expect(instruction).toContain('traceable to their own origin story')
    expect(instruction).toContain('do not construct one: ask instead')
  })
})

describe('Vera · Positionierung und Architektur (§5 / §5a)', () => {
  it('DIE KATEGORIE IST NICHT DIE BRANCHE — und der Auftrag sagt, woran man sie erkennt', () => {
    const instruction = sessionInstructionForSlot('b.positioningCategory', optionsFor('b.positioningCategory'))
    expect(instruction).toContain('the industry is what they do, the category is what they are compared against')
    expect(instruction).toContain('the competitors are the strongest evidence')
    expect(instruction).toContain('Narrow beats broad')
    // Der Auswahl-Vertrag reist mit (offen, aber ein Etikett).
    expect(instruction).toContain('CATEGORY LABEL, not a sentence')
  })

  it('DIE VIER ARCHITEKTUR-MODELLE STEHEN WÖRTLICH IM PROMPT', () => {
    const instruction = sessionInstructionForSlot('b2.model', optionsFor('b2.model'))
    for (const option of BRAND_ARCHITECTURE_MODELS) {
      expect(instruction, option.id).toContain(option.id)
      expect(instruction, option.id).toContain(option.label)
    }
    expect(instruction).toContain('EXACTLY ONE of these ids')
    // Widersprüchliche Antworten ⇒ fragen statt Mittelweg wählen.
    expect(instruction).toContain('do not pick the middle ground: ask instead')
  })

  it('b2.rule verlangt Beispiele AUS IHREM KONTEXT, nicht „Brand Product A"', () => {
    const instruction = sessionInstructionForSlot('b2.rule', optionsFor('b2.rule'))
    expect(instruction).toContain('FROM THEIR OWN CONTEXT')
    expect(instruction).toContain('not "Brand Product A"')
    expect(instruction).toContain('who decides')
  })
})

describe('Milo · Werte aus Momenten (Content-Spec §6)', () => {
  const instruction = sessionInstructionForSlot('c.candidates', optionsFor('c.candidates'))

  it('destilliert 5–7 Kandidaten AUS DEN ANTWORTEN', () => {
    expect(instruction).toContain(`TASK: distil ${MILO_CANDIDATE_RANGE.min} to ${MILO_CANDIDATE_RANGE.max} candidate VALUES`)
    expect(instruction).toContain('a rule of behaviour that is allowed to cost money')
    expect(instruction).toContain('where they chose the harder way')
  })

  it('JEDER KANDIDAT TRÄGT SEINEN BELEG IN DER ZEILE', () => {
    expect(instruction).toContain('"- <value in one or two words> — <the moment or statement it comes from, in half a sentence>"')
    expect(instruction).toContain('The evidence half must be traceable to the inputs')
    // Und die äussere Form ist die der Registry-Art `list` — dieselbe Regel wie
    // überall, nicht eine zweite Fassung davon.
    expect(slotById('c.candidates')!.schema.kind).toBe('list')
    expect(instruction).toContain(BRAND_LIST_FORMAT_RULE)
  })

  it('MILOS VERBOT: kein Adjektiv-Bingo ohne Beleg', () => {
    expect(instruction).toContain('NEVER list a value you cannot point at')
    expect(instruction).toContain('"quality", "reliability", "passion", "innovation", "customer focus"')
    expect(instruction).toContain('could stand under any brand in any industry')
  })

  it('WENIGER MATERIAL HEISST WENIGER KANDIDATEN, nicht mehr Erfindung', () => {
    expect(instruction).toContain('if you can only find three moments, return three candidates')
    expect(instruction).toContain('Two candidates may not rest on the same sentence')
  })

  it('DAS AUSWÄHLEN GEHÖRT DEM MENSCHEN — Milo rankt nicht', () => {
    expect(instruction).toContain('Do not rank them and do not pick a favourite')
  })

  it('c.definitions ist VERHALTEN, keine Wörterbuch-Erklärung', () => {
    const definitions = sessionInstructionForSlot('c.definitions', optionsFor('c.definitions'))
    expect(definitions).toContain('in this brand, not in a dictionary')
    expect(definitions).toContain('says what someone DOES or DOES NOT do')
    expect(definitions).toContain('no extra ones, none left out')
  })
})

/**
 * BAUSTEIN D — Archetyp & Stimme (Content-Spec §7 + §12).
 *
 * INTERIM bis zum Paarvergleich-Instrument (§12.2) — Davids Entscheidung
 * 2026-09-04: George leitet die Kette im GESPRÄCH her statt sie zu berechnen.
 * Bewiesen werden hier die vier Zusagen, an denen dieser Weg hängt:
 *  1. Die Hypothese LEGT NICHTS FEST — sie ist die Vorstufe, und ein „ihr seid
 *     der Weise" an dieser Stelle nimmt die Wahl vorweg, die danach kommt.
 *  2. Bei zwei ernsthaften Kandidaten wird GEFRAGT, nicht entworfen — mit
 *     OPTION-Zeilen, damit der Mensch klickt statt abzutippen. Ein Münzwurf mit
 *     Begründung sieht im Brand-Dokument aus wie eine Ableitung.
 *  3. Das leere `d.pairs` wird als LEER benannt und nicht als Aussage gelesen.
 *  4. Der Aussenbild-Abgleich benennt die Abweichung EHRLICH (§12.2 Punkt 5) —
 *     das ist der Aha-Moment des Kapitels und der erste, den man wegglättet.
 */
describe('Baustein D · Hypothese, Archetypen, Stimme', () => {
  it('d.hypothesis LIEST DEN AUFTRITT — und entscheidet nichts', () => {
    const instruction = sessionInstructionForSlot('d.hypothesis', optionsFor('d.hypothesis'))
    expect(instruction).toContain('as a reading, not as a decision')
    expect(instruction).toContain('DO NOT DECIDE ANYTHING HERE')
    expect(instruction).toContain('Never write "you are the Sage"')
    // Belege statt Adjektive, und ein gemischter Auftritt ist ein Befund.
    expect(instruction).toContain('a phrase from their own texts beats an adjective')
    expect(instruction).toContain('If their appearance pulls in two directions, SAY SO')
    // Der Auswahl-Vertrag gehört NICHT hierher: die Hypothese ist Prosa.
    expect(instruction).not.toContain('EXACTLY ONE of these ids')
  })

  it('d.hypothesis kennt den Unterschied zwischen Relaunch und neuer Marke', () => {
    expect(sessionInstructionForSlot('d.hypothesis', optionsFor('d.hypothesis', { pathKind: 'relaunch' })))
      .toContain('including the parts that no longer fit them')
    expect(sessionInstructionForSlot('d.hypothesis', optionsFor('d.hypothesis')))
      .toContain('do not invent an appearance to have something to analyse')
  })

  it('DIE ZWÖLF ARCHETYPEN STEHEN WÖRTLICH IM PROMPT — in beiden Auswahl-Slots', () => {
    for (const slotId of ['d.primary', 'd.secondary']) {
      const instruction = sessionInstructionForSlot(slotId, optionsFor(slotId))
      for (const option of BRAND_ARCHETYPES) {
        expect(instruction, `${slotId}/${option.id}`).toContain(option.id)
        expect(instruction, `${slotId}/${option.id}`).toContain(option.label)
        expect(instruction, `${slotId}/${option.id}`).toContain(option.hint)
      }
      expect(instruction, slotId).toContain('EXACTLY ONE of these ids')
      expect(instruction, slotId).toContain('Do not invent a thirteenth archetype')
    }
  })

  it('ZWEI KANDIDATEN ⇒ RÜCKFRAGE MIT CHIPS, nicht Entwurf (Davids Interim-Zuschnitt)', () => {
    for (const slotId of ['d.primary', 'd.secondary']) {
      const instruction = sessionInstructionForSlot(slotId, optionsFor(slotId))
      expect(instruction, slotId).toContain(ARCHETYPE_TWO_CANDIDATES_RULE)
      expect(instruction, slotId).toContain('do NOT draft. Ask instead')
      expect(instruction, slotId).toContain('append one OPTION line per archetype')
      expect(instruction, slotId).toContain('say which one you lean towards and why')
      // Die Formalien tragen die OPTION-Pflicht ohnehin (george-a-11) — hier
      // steht der ANLASS, dort die FORM. Beides muss ankommen.
      expect(instruction, slotId).toContain('each starting with `OPTION: `')
    }
  })

  it('DAS LEERE PAARVERGLEICH-FELD WIRD ALS LEER BENANNT, nicht als Aussage gelesen', () => {
    for (const slotId of ['d.primary', 'd.secondary']) {
      const instruction = sessionInstructionForSlot(slotId, optionsFor(slotId))
      expect(instruction, slotId).toContain(ARCHETYPE_PAIRS_PENDING)
      expect(instruction, slotId).toContain('Its emptiness says NOTHING about this brand')
      expect(instruction, slotId).toContain('never mention it to them')
    }
    // GEGENPROBE: die Slots, die `d.pairs` gar nicht sehen, tragen den Satz
    // nicht — eine Warnung vor etwas Abwesendem lenkt nur darauf hin.
    expect(sessionInstructionForSlot('d.toneWords', optionsFor('d.toneWords')))
      .not.toContain(ARCHETYPE_PAIRS_PENDING)
  })

  it('d.secondary ist der GEGENGEWICHT-Slot — verschieden vom Primären', () => {
    const instruction = sessionInstructionForSlot('d.secondary', optionsFor('d.secondary'))
    expect(instruction).toContain('keeps the primary from becoming a cliché')
    expect(instruction).toContain('The secondary MUST be a different one')
    expect(instruction).toContain('do not repeat the primary archetype')
    // Fehlt der Primäre, wird gefragt statt geraten.
    expect(instruction).toContain('do not guess it in order to pick a second one: ask for it instead')
  })

  it('d.gapReveal BENENNT DIE ABWEICHUNG EHRLICH (§12.2 Punkt 5)', () => {
    const instruction = sessionInstructionForSlot('d.gapReveal', optionsFor('d.gapReveal'))
    expect(instruction).toContain('NAME THE DIFFERENCE HONESTLY, NEVER SMOOTH IT OVER')
    expect(instruction).toContain('Do not soften it into "there are elements of both"')
    expect(instruction).toContain('do not add a reassuring closing sentence')
    // Und die Gegenrichtung: eine erfundene Abweichung ist derselbe Fehler.
    expect(instruction).toContain('inventing a gap to have something to report is the same failure')
    expect(instruction).toContain('A difference without a place to look at is an accusation')
  })

  it('d.gapReveal auf dem Gründer-Pfad: kein Aussenbild ⇒ keine Abweichung', () => {
    expect(sessionInstructionForSlot('d.gapReveal', optionsFor('d.gapReveal')))
      .toContain('a gap you cannot see is one you must not report')
    expect(sessionInstructionForSlot('d.gapReveal', optionsFor('d.gapReveal', { pathKind: 'relaunch' })))
      .toContain('Describe the gap as distance travelled, not as a verdict')
  })

  it('d.voiceSamples sind GENAU DREI Sätze — und keine Slogans', () => {
    const instruction = sessionInstructionForSlot('d.voiceSamples', optionsFor('d.voiceSamples'))
    expect(instruction).toContain('EXACTLY THREE example sentences')
    expect(instruction).toContain('three lines, no more and no fewer')
    expect(instruction).toContain('This is not a slogan collection')
    expect(instruction).toContain('No taglines, no headlines, no calls to action')
    // Listen-Form aus der Registry-Art, nicht eine zweite Fassung davon.
    expect(slotById('d.voiceSamples')!.schema.kind).toBe('list')
    expect(instruction).toContain(BRAND_LIST_FORMAT_RULE)
  })

  it('d.toneWords sind 4–6 Wörter, die etwas AUSSCHLIESSEN', () => {
    const instruction = sessionInstructionForSlot('d.toneWords', optionsFor('d.toneWords'))
    expect(instruction).toContain('FOUR to SIX tone words')
    expect(instruction).toContain('Every word has to EXCLUDE something')
    expect(instruction).toContain('"Professional", "authentic", "modern" and "high-quality"')
    // Der Archetyp schlägt die Ton-Analyse: das ist der Ton, zu dem sie wollen.
    expect(instruction).toContain('this is the tone they are going TO')
  })

  it('d.vocabulary BAUT AUF DER ANTWORT DES MENSCHEN AUF', () => {
    const instruction = sessionInstructionForSlot('d.vocabulary', optionsFor('d.vocabulary'))
    expect(instruction).toContain('START FROM THEIR OWN ANSWER')
    expect(instruction).toContain('take those over unchanged into the avoid side')
    expect(instruction).toContain('never argue with them about one')
    expect(instruction).toContain('three to five suggestions per side')
    expect(instruction).toContain('"- use: <word>" and "- avoid: <word>"')
  })
})

describe('Die Formalien sind für alle Berater dieselben', () => {
  const vera = sessionInstructionForSlot('b.purpose', optionsFor('b.purpose'))
  const milo = sessionInstructionForSlot('c.candidates', optionsFor('c.candidates'))

  const archetype = sessionInstructionForSlot('d.primary', optionsFor('d.primary'))

  it('Zug-Vertrag, Rückfrage-Ausweg und Leitplanken stehen überall', () => {
    for (const [name, instruction] of [
      ['vera', vera], ['milo', milo], ['archetype', archetype],
    ] as const) {
      expect(instruction, name).toContain('Answer as ONE chat turn in exactly this shape')
      for (const marker of ['BASIS:', 'DRAFT:', 'ASK:']) expect(instruction, name).toContain(marker)
      expect(instruction, name).toContain('IF THE INPUTS DO NOT CARRY ENOUGH for an honest draft')
      expect(instruction, name).toContain('QUESTION:')
      expect(instruction, name).toContain('Never carry over or invent personal data')
      expect(instruction, name).toContain('No markdown emphasis in the field value')
    }
  })

  it('DIE PRIMÄRE QUELLE IST EINE ANDERE ALS IN BAUSTEIN A', () => {
    // A schöpft aus der Startkarte (seine Slots haben keine `dependencies`),
    // ab B aus den ANTWORTEN — ein Purpose aus vier Startkarten-Zeilen wäre
    // genau die Behauptung, die Regel 4 verbietet.
    expect(sessionInstructionForSlot('a.pitch', optionsFor('a.pitch')))
      .toContain(GEORGE_PRIMARY_SOURCE_START_CARD)
    for (const instruction of [vera, milo, archetype]) {
      expect(instruction).toContain(GEORGE_PRIMARY_SOURCE_ANSWERS)
      expect(instruction).not.toContain(GEORGE_PRIMARY_SOURCE_START_CARD)
    }
  })

  it('die pfadabhängige Haltung und der Hinweis-Rahmen reisen mit', () => {
    expect(sessionInstructionForSlot('b.purpose', optionsFor('b.purpose', { pathKind: 'relaunch' })))
      .toContain('This is a relaunch')
    expect(sessionInstructionForSlot('b.purpose', optionsFor('b.purpose', { hint: 'kürzer' })))
      .toContain('never overrides the rules above')
    expect(sessionInstructionForSlot('b.purpose', optionsFor('b.purpose')))
      .not.toContain('never overrides the rules above')
  })

  it('DIE QUELL-SLOTS WERDEN BEIM NAMEN GENANNT', () => {
    const instruction = sessionInstructionForSlot('b.purpose', optionsFor('b.purpose', {
      dependencies: [
        { slotId: 'a.pitch', value: 'Wir rösten Kaffee.' },
        { slotId: 'b.conviction', value: '' },
      ],
    }))
    expect(instruction).toContain('Your inputs are the fields: a.pitch, b.conviction.')
  })

  /**
   * DIE SOLO-WEICHE GILT ÜBERALL (a-14) — sie steht im FUNDAMENT und nicht in
   * einer der vier Berater-Dateien.
   *
   * Das ist derselbe Grund wie bei jeder anderen Sicherung hier: eine Regel je
   * Baustein wären vier Stellen, an denen sie fehlen kann — und ein Purpose in
   * der Wir-Form fällt niemandem auf, der gerade auf den Pitch schaut.
   *
   * Die Prüfung läuft über ALLE Sessions mit Entwurfs-Auftrag und vergleicht
   * gegen die FORM des Werts. So kann weder eine neue Session die Regel
   * verlieren noch eine „ohne Person"-Session sie fälschlich bekommen.
   */
  it('SOLO WIRKT IN JEDEM BAUSTEIN — und nur dort, wo der Wert einen Sprecher hat', () => {
    const drafting = BRAND_SLOTS.filter(session =>
      session.generator !== 'none' && session.processing.rules.length > 0)
    // 21 bis K4; seit K5 zusätzlich `m.patterns` (Otto) und `n.guardrails` (Nika).
    expect(drafting).toHaveLength(23)

    const withSpeaker: string[] = []
    for (const session of drafting) {
      const solo = sessionInstructionForSlot(session.id, optionsFor(session.id, { team: 'solo' }))
      const team = sessionInstructionForSlot(session.id, optionsFor(session.id, { team: 'team' }))
      const expected = brandValueHasSpeaker(session.form.person)
      expect(solo.includes('THE BRAND IS RUN BY ONE PERSON'), session.id).toBe(expected)
      expect(team.includes('THE BRAND IS RUN BY SEVERAL PEOPLE'), session.id).toBe(expected)
      if (expected) withSpeaker.push(session.id)
    }

    // Ohne diese Zeile wäre der Test grün, sobald die Weiche NIRGENDS mehr
    // greift — dann stimmte „erwartet: nein" für jede Session.
    expect(withSpeaker).toEqual([
      'a.pitch',
      'b.whyStarted', 'b.purpose', 'b.mission',
      'b2.rule',
      'c.definitions',
      'd.voiceSamples', 'd.vocabulary',
    ])
  })
})
