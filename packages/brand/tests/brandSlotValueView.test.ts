import { describe, expect, it } from 'vitest'
import {
  brandSlotValueView,
  formatBrandSlotList,
  formatBrandSlotStructured,
} from '../shared/brandSlotFormat'

/**
 * DIE LESE-FORM EINES WERTES (BW2 Paket 3c-ii, §5a Schritt 1: „der bestätigte
 * Wert, VOLLSTÄNDIG, nicht gekürzt").
 *
 * Geprüft wird gegen die SCHREIBER derselben Datei — Schreiber und Leser
 * müssen dieselbe Form meinen, sonst zeigt die Abnahme-Seite eine leere Liste
 * für einen Wert, den George korrekt geschrieben hat. Die Gegenproben decken
 * den Fall ab, der in echten Daten am häufigsten ist: ein Wert, der seine Form
 * NICHT einhält (Bestand aus der Zeit vor der Regel, im Textfeld nachgebessert).
 */
describe('brandSlotValueView', () => {
  it('liest eine Liste als Liste — dieselbe Form, die der Schreiber erzeugt', () => {
    const value = formatBrandSlotList(['Verlässlich', 'Direkt', 'Warm'])
    expect(brandSlotValueView('list', value)).toEqual({
      kind: 'list',
      items: ['Verlässlich', 'Direkt', 'Warm'],
    })
  })

  it('liest strukturierte Werte als beschriftete Blöcke', () => {
    const value = formatBrandSlotStructured([
      { label: 'Haltung', body: 'Wir sagen zu, was wir halten.' },
      { label: 'Ton', body: 'Kurze Sätze, keine Superlative.' },
    ])
    expect(brandSlotValueView('structured', value)).toEqual({
      kind: 'blocks',
      blocks: [
        { label: 'Haltung', body: 'Wir sagen zu, was wir halten.' },
        { label: 'Ton', body: 'Kurze Sätze, keine Superlative.' },
      ],
    })
  })

  it('behält mehrzeilige Blockkörper', () => {
    const view = brandSlotValueView('structured', '## Haltung\nZeile eins\nZeile zwei')
    expect(view).toEqual({ kind: 'blocks', blocks: [{ label: 'Haltung', body: 'Zeile eins\nZeile zwei' }] })
  })

  it('freier Text bleibt freier Text', () => {
    expect(brandSlotValueView('text', '  Wir helfen Trainern.  '))
      .toEqual({ kind: 'text', text: 'Wir helfen Trainern.' })
  })

  it('GEGENPROBE: ein formfremder Wert wird gezeigt, nicht verschluckt', () => {
    // Ohne den Fail-soft-Zweig stünde hier eine leere Liste — und der Mensch
    // sähe auf der Abnahme-Seite nichts von dem, was er gesagt hat.
    expect(brandSlotValueView('list', 'Verlässlich, direkt, warm'))
      .toEqual({ kind: 'text', text: 'Verlässlich, direkt, warm' })
    expect(brandSlotValueView('structured', 'Haltung: wir sagen zu, was wir halten.'))
      .toEqual({ kind: 'text', text: 'Haltung: wir sagen zu, was wir halten.' })
  })

  it('ein leerer Wert ist Text, keine leere Liste', () => {
    expect(brandSlotValueView('list', '')).toEqual({ kind: 'text', text: '' })
  })
})
