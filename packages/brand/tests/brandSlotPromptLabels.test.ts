import { describe, expect, it } from 'vitest'
import {
  brandDraftButtonLabel,
  brandSlotPromptLabel,
  labelSlotDependencies,
} from '../server/utils/brandSlotPromptLabels'
import { BRAND_DESIGN_VOICE, BRAND_VOICE } from '../shared/brandAdvisors'
import { formatDependencies } from '../server/utils/georgePrompt'
import { formatBrandConverseInputs } from '../server/utils/conversePrompt'
import { BRAND_STEP_KEYS, slotsForStep } from '../shared/slotRegistry'

/**
 * KEINE INTERNEN IDS ZUM MODELL (Davids Live-Fund 2026-09-03): die
 * Eingabe-Blöcke reisten als `[a.customerPraise]`, und George sprach die Ids
 * im Chat wortwörtlich nach. Die Blöcke tragen jetzt die Frage bzw. das
 * Label aus dem Locale-Katalog — in der Inhaltssprache des Profils.
 */
describe('brandSlotPromptLabel', () => {
  it('löst Fragen und Labels in beiden Sprachen auf', () => {
    expect(brandSlotPromptLabel('a.pitch', 'de', 'new', 'solo')).toBe('Elevator-Pitch')
    expect(brandSlotPromptLabel('a.customerPraise', 'de', 'new', 'solo')).toContain('glücklichsten Kunden')
    expect(brandSlotPromptLabel('a.customerPraise', 'en', 'new', 'solo')).toContain('happiest customers')
  })

  it('löst Pfad-Varianten über pathKind auf', () => {
    const neu = brandSlotPromptLabel('a.origin', 'de', 'new', 'solo')
    const relaunch = brandSlotPromptLabel('a.origin', 'de', 'relaunch', 'solo')
    expect(neu).not.toBe(relaunch)
    expect(neu.length).toBeGreaterThan(10)
    expect(relaunch.length).toBeGreaterThan(10)
  })

  it('JEDER aktive Slot hat ein Label, das keine interne Id ist', () => {
    for (const stepKey of BRAND_STEP_KEYS) {
      for (const slot of slotsForStep(stepKey)) {
        const label = brandSlotPromptLabel(slot.id, 'de', 'new', 'solo')
        expect(label, slot.id).not.toBe(slot.id)
        expect(label).not.toMatch(/^[a-z0-9]+\./i)
      }
    }
  })

  it('unbekannte Ids fallen ehrlich auf die Id zurück', () => {
    expect(brandSlotPromptLabel('x.gibtEsNicht', 'de', 'new', 'solo')).toBe('x.gibtEsNicht')
  })

  /**
   * DIE TEAM-WEICHE W3 (Paket 8): `c.discovery3` fragt solo und im Team etwas
   * anderes. Vorher gewann hier immer `Object.values(node)[0]`, also die
   * Solo-Fassung — im Prompt eines Team-Brandings stand das Etikett der
   * falschen Frage über dem richtigen Wert.
   */
  it('löst die Team-Variante über team auf — und lässt Pfad-Slots kalt', () => {
    const solo = brandSlotPromptLabel('c.discovery3', 'de', 'new', 'solo')
    const team = brandSlotPromptLabel('c.discovery3', 'de', 'new', 'team')
    expect(solo).toContain('nie dulden')
    expect(team).toContain('Team')
    expect(solo).not.toBe(team)
    expect(brandSlotPromptLabel('c.discovery3', 'en', 'new', 'team')).toContain('team')
  })

  /**
   * BEIDE ACHSEN AN EINEM SLOT (Anrede-Runde 2026-09-09): `a.origin` fragt auf
   * dem Relaunch-Pfad etwas anderes UND redet die Marke an. Der Pfad muss den
   * Ausschlag geben, die Weiche danach — nicht umgekehrt.
   */
  it('löst Pfad UND Weiche auf, wenn ein Slot beides trägt', () => {
    expect(brandSlotPromptLabel('a.origin', 'de', 'relaunch', 'team')).toContain('woran man euch')
    expect(brandSlotPromptLabel('a.origin', 'de', 'relaunch', 'solo')).toContain('woran man dich')
    // Der Gründer-Pfad fragt etwas ANDERES — die Weiche allein darf ihn nicht
    // erreichen (sonst stünde im Prompt die Relaunch-Frage).
    expect(brandSlotPromptLabel('a.origin', 'de', 'new', 'team')).toContain('Warum hast du angefangen')
    expect(brandSlotPromptLabel('a.origin', 'de', 'new', 'solo')).toContain('Warum hast du angefangen')
  })

  /**
   * DIE ABLEITUNG BLEIBT BEIM BASIS-SCHLÜSSEL. `d.gapReveal` MELDET eine
   * Relaunch-Fassung an, im Katalog steht sie nicht — die alte Auflösung
   * fischte deshalb im Knoten herum, die neue fragt die Registry
   * (`slotLabelKeyFor`) und bekommt dieselbe Antwort ohne Raten.
   */
  it('gibt einer Ableitung mit unbelegter Pfad-Variante ihr Etikett', () => {
    expect(brandSlotPromptLabel('d.gapReveal', 'de', 'relaunch', 'team')).toBe('Selbstbild und Außenbild')
    expect(brandSlotPromptLabel('d.gapReveal', 'de', 'new', 'solo')).toBe('Selbstbild und Außenbild')
  })
})

describe('Formatter drucken Labels, nie Ids', () => {
  it('formatDependencies nutzt das Label', () => {
    const block = formatDependencies(labelSlotDependencies(
      [{ slotId: 'a.customerPraise', value: 'Bestes Brot der Stadt' }],
      'de',
      'new',
      'solo',
    ))
    expect(block).not.toContain('a.customerPraise')
    expect(block).toContain('glücklichsten Kunden')
  })

  it('formatBrandConverseInputs nutzt das Label — mit Id-Rückfall ohne', () => {
    const inputs = formatBrandConverseInputs({
      startCard: { pitch: '', category: '', audience: '', website: '' },
      slots: [
        { slotId: 'a.oneThing', value: '', label: brandSlotPromptLabel('a.oneThing', 'de', 'new', 'solo') },
        { slotId: 'ohne.label', value: 'x' },
      ],
      history: [],
      answeredQuestion: '',
      text: 'Hallo',
      nextQuestion: '',
    })
    expect(inputs).not.toContain('[a.oneThing]')
    expect(inputs).toContain('[ohne.label]')
  })
})

/**
 * DER ENTWURFS-KNOPF IM PROMPT (converse-11, Befund 8): George verweist auf
 * ihn, statt zu behaupten, er trage etwas ein. Sein Name kommt aus DEMSELBEN
 * Katalog-Eintrag, den die Bühne rendert — sonst nennt der Chat einen Knopf,
 * den es so nicht gibt.
 */
describe('brandDraftButtonLabel', () => {
  it('setzt die Stimme in den Katalog-Satz — in beiden Sprachen', () => {
    expect(brandDraftButtonLabel('de', BRAND_VOICE.name)).toBe(`${BRAND_VOICE.name}, entwirf das`)
    expect(brandDraftButtonLabel('en', BRAND_VOICE.name)).toBe(`${BRAND_VOICE.name}, draft this`)
  })

  it('trägt in den Design-Kapiteln die ANDERE Stimme (D8)', () => {
    const label = brandDraftButtonLabel('de', BRAND_DESIGN_VOICE.name)
    expect(label).toContain(BRAND_DESIGN_VOICE.name)
    expect(label).not.toContain(BRAND_VOICE.name)
  })

  it('fällt auf Englisch zurück und lässt keinen Platzhalter stehen', () => {
    const label = brandDraftButtonLabel('fr', BRAND_VOICE.name)
    expect(label).toBe(`${BRAND_VOICE.name}, draft this`)
    expect(label).not.toContain('{voice}')
  })
})
