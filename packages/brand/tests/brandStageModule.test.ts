import { describe, expect, it } from 'vitest'
import {
  BRAND_OWN_ANSWER_PLACEHOLDER_KEY,
  BRAND_OWN_ANSWER_PLAIN_PLACEHOLDER_KEY,
  type BrandStageActiveSession,
  brandAnswerTarget,
  brandStageAnswerCard,
  brandStageAwaitsDraftAnswer,
  brandStageClaim,
  brandStaticQuestionVisible,
} from '../shared/brandStageModule'
import { partKeyFor, slotById, slotIsConfirmable, slotsForStep } from '../shared/slotRegistry'

/**
 * WELCHES MODUL ZEIGT DIE BÜHNE FÜR DIE AKTIVE SESSION? (Kailua-Befund 5,
 * Davids „Weg B", 2026-09-08).
 *
 * ── WAS HIER BEWIESEN WIRD, UND WARUM ES EINE EIGENE DATEI IST ────────────
 * Der Befund sass in der NAHT zwischen drei Ausdrücken der Werkstatt-Seite
 * (`activeAwaitsConfirm`, `nextSlot`, `stageModule`): jede Zeile für sich war
 * plausibel, zusammen zeigten sie die Frage eines FREMDEN Feldes. Genau das
 * ist der Fall, den eine pure Regel prüfbar macht — und die Gegenprobe
 * daneben beweist, dass die Katalog-Sessions ihr Verhalten behalten.
 */

function session(overrides: Partial<BrandStageActiveSession> = {}): BrandStageActiveSession {
  return {
    id: 'a.pitch',
    type: 'derivation',
    confirmable: true,
    generatable: true,
    canGenerate: true,
    hasValue: false,
    confirmed: false,
    ...overrides,
  }
}

describe('Die Entwurfs-Session beansprucht ihre eigene Bühne (Weg B)', () => {
  /**
   * DER BEFUND, ALS TEST. `a.pitch` ist `derivation` und steht in `context`
   * VOR jeder Frage — beim Betreten des Kapitels ist es die aktive Session.
   * Vorher zeigte die Bühne trotzdem die erste offene FRAGE (`a.origin`), und
   * der Entwurfs-Knopf des Feldes, auf dem der Mensch sass, war nirgends.
   */
  it('ein LEERES Entwurfs-Feld bekommt sein Entwurfs-Modul — und zwar sein eigenes', () => {
    expect(brandStageClaim(session())).toEqual({ module: 'draft', slotId: 'a.pitch' })
  })

  it('und wartet dann auf die Antwort, aus der der Entwurf entsteht', () => {
    const claim = brandStageClaim(session())
    expect(brandStageAwaitsDraftAnswer(claim, false)).toBe(true)
    // Steht schon ein Entwurf da, ist „Nochmal, mit Hinweis" der Weg — zwei
    // offene Eingabefelder für dieselbe Sache wären zwei Wahrheiten.
    expect(brandStageAwaitsDraftAnswer(claim, true)).toBe(false)
  })

  /**
   * DAS BEREITSCHAFTS-GATE NIMMT DIE BÜHNE NICHT WEG (bewusst `generatable`
   * und nicht `canGenerate`): fehlt Material, gehört GENAU DIESER Satz auf die
   * Karte (`showReadinessNote`) — und nicht die Frage eines fremden Feldes.
   */
  it('auch ohne genug Material bleibt das Feld auf der Bühne', () => {
    expect(brandStageClaim(session({ canGenerate: false }))).toEqual({
      module: 'draft',
      slotId: 'a.pitch',
    })
  })

  it('mit Wert und ohne Entwurfs-Weg bleibt die reine Bestätigungs-Karte (D2c, unverändert)', () => {
    expect(brandStageClaim(session({ hasValue: true, generatable: false, canGenerate: false }))).toEqual({
      module: 'confirm',
      slotId: 'a.pitch',
    })
  })

  it('mit Wert und Entwurfs-Weg: das Entwurfs-Modul (D2c, unverändert)', () => {
    expect(brandStageClaim(session({ hasValue: true }))).toEqual({ module: 'draft', slotId: 'a.pitch' })
  })

  /**
   * DIE DREI FÄLLE, IN DENEN DIE BÜHNE FREI BLEIBT — jeder mit eigenem Grund,
   * und keiner davon ist „Geschmack".
   */
  it('gibt die Bühne frei, wo sie nichts anzubieten hätte', () => {
    // Bestätigt: dort ist „Korrigieren" die einzige Tür, und die hängt an der
    // Karte, nicht an der Bühne.
    expect(brandStageClaim(session({ hasValue: true, confirmed: true }))).toBeNull()
    // Nicht bestätigbar (`d.pairs`, Audit A4): ein Knopf ohne Wirkung.
    expect(brandStageClaim(session({ type: 'special', confirmable: false }))).toBeNull()
    // Leer UND nicht entwerfbar: die deterministisch gerechneten Felder der
    // Design-Kapitel werden von den Panels DARÜBER gefüllt.
    expect(brandStageClaim(session({ generatable: false, canGenerate: false }))).toBeNull()
    // Und ohne aktive Session gibt es nichts zu beanspruchen.
    expect(brandStageClaim(null)).toBeNull()
  })
})

describe('Gegenprobe: die Katalog-Sessions verhalten sich unverändert', () => {
  it('eine offene FRAGE zeigt ihr Antwort-Modul', () => {
    expect(brandStageClaim(session({ id: 'a.origin', type: 'question', generatable: false, canGenerate: false })))
      .toEqual({ module: 'answer', slotId: 'a.origin' })
  })

  it('eine offene AUSWAHL zeigt ihr Options-Modul', () => {
    expect(brandStageClaim(session({ id: 'a.facts', type: 'choice', generatable: false, canGenerate: false })))
      .toEqual({ module: 'options', slotId: 'a.facts' })
  })

  /**
   * BEANTWORTET IST NICHT FERTIG (Testlauf-Befund A/G, 2026-09-09).
   *
   * Bis zum Session-Abschluss gab eine beantwortete Frage die Bühne FREI — das
   * war richtig, solange nach jeder Antwort automatisch weitergesprungen wurde.
   * Ohne den Sprung fiel die Bühne damit auf die nächste offene Frage des
   * KAPITELS zurück: fremdes Modul, fremdes Zielfeld. Jetzt behält die Session
   * ihre Bühne und zeigt, was jetzt dran ist — die Bestätigung.
   */
  it('eine beantwortete, unbestätigte Frage behält ihre Bühne (Bestätigung)', () => {
    expect(brandStageClaim(session({ id: 'a.origin', type: 'question', hasValue: true })))
      .toEqual({ module: 'confirm', slotId: 'a.origin' })
    expect(brandStageClaim(session({ id: 'a.facts', type: 'choice', hasValue: true })))
      .toEqual({ module: 'confirm', slotId: 'a.facts' })
  })

  it('erst die BESTÄTIGUNG gibt die Bühne frei', () => {
    expect(brandStageClaim(session({
      id: 'a.origin', type: 'question', hasValue: true, confirmed: true,
    }))).toBeNull()
  })

  /**
   * Eine Frage ohne Zustimmung (`slotIsConfirmable === false`) hätte auf der
   * Bestätigungs-Karte einen Knopf ohne Wirkung — sie gibt frei wie bisher.
   */
  it('ohne Zustimmung beansprucht auch eine beantwortete Frage nichts', () => {
    expect(brandStageClaim(session({
      id: 'a.origin', type: 'question', hasValue: true, confirmable: false,
    }))).toBeNull()
  })
})

describe('brandAnswerTarget — wohin gehört eine getippte Antwort', () => {
  it('immer die AKTIVE Session, auch wenn dort schon etwas steht (Befund A)', () => {
    expect(brandAnswerTarget(session({ id: 'a.customerPraise', type: 'question' })))
      .toEqual({ slotId: 'a.customerPraise', mode: 'set' })
    expect(brandAnswerTarget(session({ id: 'a.customerPraise', type: 'question', hasValue: true })))
      .toEqual({ slotId: 'a.customerPraise', mode: 'append' })
  })

  it('eine OFFENE Auswahl nimmt die eigene Formulierung entgegen', () => {
    expect(brandAnswerTarget(session({ id: 'a.facts', type: 'choice' })))
      .toEqual({ slotId: 'a.facts', mode: 'set' })
  })

  /**
   * Ihr Wert ist eine stabile Id aus einem geschlossenen Vertrag —
   * angehängte Prosa machte daraus einen Wert, den niemand mehr auflöst.
   */
  it('eine BEANTWORTETE Auswahl nimmt nichts mehr entgegen', () => {
    expect(brandAnswerTarget(session({ id: 'a.facts', type: 'choice', hasValue: true }))).toBeNull()
  })

  it('eine BESTÄTIGTE Session nimmt nichts mehr entgegen', () => {
    expect(brandAnswerTarget(session({
      id: 'a.customerPraise', type: 'question', hasValue: true, confirmed: true,
    }))).toBeNull()
  })

  it('eine ABLEITUNG ist kein Ziel — dort ist der Text ein Gesprächszug', () => {
    expect(brandAnswerTarget(session({ id: 'a.pitch', type: 'derivation' }))).toBeNull()
    expect(brandAnswerTarget(session({ id: 'b.mission', type: 'stage-edit' }))).toBeNull()
  })

  it('ohne Session gibt es kein Ziel', () => {
    expect(brandAnswerTarget(null)).toBeNull()
  })
})

/**
 * DER BEFUND AN DER ECHTEN REGISTRY — ohne sie wäre der Test oben nur eine
 * Rechnung über erfundenen Zahlen.
 *
 * ── DER BEFUND SELBST IST SEIT DEM 2026-09-09 BEHOBEN ─────────────────────
 * Bis dahin standen im Kapitel `context` VIER Entwurfs-Sessions VOR der ersten
 * Frage; genau diese Reihenfolge liess die Bühne auf `a.origin` zeigen,
 * während die Session `a.pitch` hiess. Seit Davids Gruppen-Entscheidung
 * (`brandSessionGroups.ts`) beginnt das Kapitel mit den sechs Fragen — die
 * Entwurfs-Sessions stehen dahinter. Der Test bleibt und dreht sich um: er
 * hält jetzt fest, DASS die Fragen vorne stehen und dass die Entwürfe
 * trotzdem unverändert ihr Bühnen-Modul bekommen.
 */
describe('Die Registry stützt den Befund', () => {
  it('das Kapitel `context` beginnt mit den Fragen, nicht mit den Entwürfen', () => {
    const order = slotsForStep('context')
    const leading = order.slice(0, 6).map(slot => slot.id)
    expect(leading).toEqual([
      'a.origin', 'a.customerPraise', 'a.complaints', 'a.oneThing', 'a.challenge', 'a.facts',
    ])
    for (const id of leading) {
      const slot = slotById(id)!
      expect(slot.type === 'question' || slot.type === 'choice').toBe(true)
    }
    // Die Entwurfs-Sessions stehen dahinter — bestätigbar sind sie weiterhin
    // alle, sie zählen im Abschluss-Gate mit.
    const trailing = order.slice(6).map(slot => slot.id)
    expect(trailing).toEqual([
      'a.pitch', 'a.category', 'a.competitors', 'a.audienceSketch', 'a.toneAnalysis',
    ])
    for (const id of trailing) {
      expect(slotIsConfirmable(slotById(id)!)).toBe(true)
    }
    // Die erste Session des Kapitels IST jetzt die erste echte Frage.
    expect(order.find(slot => slot.type === 'question')?.id).toBe('a.origin')
    expect(order[0]!.id).toBe('a.origin')
  })

  it('und jedes dieser vier Felder hat einen Knopf, der es füllen kann', () => {
    for (const id of ['a.pitch', 'a.category', 'a.competitors', 'a.audienceSketch']) {
      const slot = slotById(id)!
      expect(slot.generator).not.toBe('none')
      expect(brandStageClaim({
        id: slot.id,
        type: slot.type,
        confirmable: slotIsConfirmable(slot),
        generatable: slot.generator !== 'none',
        canGenerate: true,
        hasValue: false,
        confirmed: false,
      })).toEqual({ module: 'draft', slotId: slot.id })
    }
  })
})

/**
 * BEFUND 2 DES DRITTEN TESTLAUFS (2026-09-10): unter jeder Teilantwort der
 * Sammel-Session stand ZUSÄTZLICH die statische Katalog-Frage — und nach einem
 * Reload dasselbe in jeder Frage-Session.
 */
describe('Die statische Katalog-Frage ist ein Ersatz, keine Ergänzung', () => {
  it('steht da, solange in dieser Session noch kein Berater-Zug steht', () => {
    expect(brandStaticQuestionVisible({
      collecting: false,
      ownSession: true,
      advisorSpoke: false,
    })).toBe(true)
  })

  it('fällt weg, sobald George in DIESER Session gesprochen hat (Reload-Fall)', () => {
    expect(brandStaticQuestionVisible({
      collecting: false,
      ownSession: true,
      advisorSpoke: true,
    })).toBe(false)
  })

  it('fällt in der SAMMEL-Session immer weg — dort fragt George den Teil', () => {
    for (const advisorSpoke of [false, true]) {
      expect(brandStaticQuestionVisible({ collecting: true, ownSession: true, advisorSpoke }))
        .toBe(false)
      // Auch als Rückfall auf „die nächste offene Frage des Kapitels": neben
      // einer Teilfrage gehört keine zweite Frage.
      expect(brandStaticQuestionVisible({ collecting: true, ownSession: false, advisorSpoke }))
        .toBe(false)
    }
  })

  it('GEGENPROBE: ein fremdes Feld bleibt sichtbar, auch wenn George gesprochen hat', () => {
    // Die Bühne fällt auf „die nächste offene Frage des KAPITELS" zurück (die
    // aktive Session ist bestätigt). Georges Züge handeln dann von einem
    // ANDEREN Feld und sagen über diese Frage nichts.
    expect(brandStaticQuestionVisible({
      collecting: false,
      ownSession: false,
      advisorSpoke: true,
    })).toBe(true)
  })
})

/**
 * BEFUND 9 DES DRITTEN TESTLAUFS (2026-09-10): „Oder etwas ganz Eigenes …"
 * ohne die Auswahl, auf die sich das „Oder" bezieht — und der Sessionname als
 * Überschrift, während George den einzelnen Teil fragte.
 */
describe('Die Antwort-Karte beschriftet, was gerade gefragt wird', () => {
  it('nennt „Oder …" nur, wo es auch Karten gibt', () => {
    expect(brandStageAnswerCard({ hasOptions: true, partKey: '' }).placeholderKey)
      .toBe(BRAND_OWN_ANSWER_PLACEHOLDER_KEY)
    expect(brandStageAnswerCard({ hasOptions: false, partKey: '' }).placeholderKey)
      .toBe(BRAND_OWN_ANSWER_PLAIN_PLACEHOLDER_KEY)
    expect(BRAND_OWN_ANSWER_PLACEHOLDER_KEY).not.toBe(BRAND_OWN_ANSWER_PLAIN_PLACEHOLDER_KEY)
  })

  it('trägt die laufende TEILfrage als Überschrift, solange eine läuft', () => {
    const facts = slotById('a.facts')!
    const key = partKeyFor(facts, facts.parts[1]!, 'solo')
    expect(key).toBe('brand.part.a.facts.age.solo')
    expect(brandStageAnswerCard({ hasOptions: false, partKey: key }).titleKey).toBe(key)
  })

  it('und ein leerer Teil-Schlüssel heisst „nimm das Feld-Etikett"', () => {
    expect(brandStageAnswerCard({ hasOptions: true, partKey: '' }).titleKey).toBe('')
  })
})
