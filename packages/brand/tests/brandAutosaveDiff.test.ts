import { describe, expect, it } from 'vitest'
import {
  type BrandSyncState,
  brandAutosaveAllowed,
  brandConflictNeedsDecision,
  brandDiscardEdit,
  brandEditReleasesConfirm,
  brandSlotDisplayValue,
  brandSlotIsConfirmed,
  diffBrandSlots,
  nextBrandSyncState,
  pruneSettledEdits,
} from '../shared/brandAutosaveDiff'
import type { BrandSlotView } from '../shared/types/brand'

/**
 * DIE AUTOSAVE-RECHNUNG OHNE NUXT. Was hier grün ist, muss im Browser nicht
 * mehr nachgestellt werden — und die drei teuren Fälle (No-op, zweiter Tab,
 * Verbindungsabbruch) sind genau die, die man von Hand kaum reproduziert.
 */

function view(partial: Partial<BrandSlotView> = {}): BrandSlotView {
  return {
    firstDraft: null,
    latestDraft: null,
    confirmed: null,
    confidence: null,
    updatedAt: null,
    ...partial,
  }
}

describe('brandSlotDisplayValue', () => {
  it('zeigt den NEUESTEN Entwurf, nicht die Bestätigung', () => {
    // Wer hier `confirmed` bevorzugt, nimmt eine Bearbeitung nach der
    // Bestätigung beim nächsten Laden still zurück.
    expect(brandSlotDisplayValue(view({
      firstDraft: 'erster',
      latestDraft: 'neuester',
      confirmed: 'bestätigter',
    }))).toBe('neuester')
  })

  it('fällt über firstDraft auf confirmed zurück und sonst auf leer', () => {
    expect(brandSlotDisplayValue(view({ firstDraft: 'erster' }))).toBe('erster')
    expect(brandSlotDisplayValue(view({ confirmed: 'nur bestätigt' }))).toBe('nur bestätigt')
    expect(brandSlotDisplayValue(undefined)).toBe('')
  })

  it('kennt die Bestätigung als Tatsache, nicht als Text-Vergleich', () => {
    expect(brandSlotIsConfirmed(view({ confirmed: 'ja' }))).toBe(true)
    expect(brandSlotIsConfirmed(view({ latestDraft: 'ja' }))).toBe(false)
    expect(brandSlotIsConfirmed(undefined)).toBe(false)
  })
})

/**
 * ÖFFNEN IST NOCH KEINE KORREKTUR (Testlauf-Befund F, 2026-09-09).
 *
 * „Korrigieren" hob die Bestätigung schon beim ÖFFNEN des Editors auf: wer
 * hineinsah und „Korrigieren beenden" drückte, stand vor 3 von 10 statt 4 von
 * 10. Aufgehoben wird jetzt von der EINGABE — und zwar an genau derselben
 * Schwelle, an der `diffBrandSlots` einen Wert verschickt.
 */
describe('brandEditReleasesConfirm', () => {
  const confirmed = view({ firstDraft: 'steht', latestDraft: 'steht', confirmed: 'steht' })

  it('derselbe Text nimmt nichts (F)', () => {
    expect(brandEditReleasesConfirm(confirmed, 'steht')).toBe(false)
  })

  it('ein anderer Text hebt die Bestätigung auf', () => {
    expect(brandEditReleasesConfirm(confirmed, 'steht anders')).toBe(true)
    expect(brandEditReleasesConfirm(confirmed, '')).toBe(true)
  })

  it('auch ein Leerzeichen zählt — sonst gäbe es eine Eingabe ohne offene Tür', () => {
    expect(brandEditReleasesConfirm(confirmed, 'steht ')).toBe(true)
  })

  it('an einem OFFENEN Slot gibt es nichts aufzuheben', () => {
    expect(brandEditReleasesConfirm(view({ latestDraft: 'entwurf' }), 'anders')).toBe(false)
    expect(brandEditReleasesConfirm(undefined, 'anders')).toBe(false)
  })

  /**
   * DIE SCHWELLE IST DIESELBE WIE IM DIFF — und das ist die eigentliche
   * Zusage: die Route weist eine Wert-Änderung an einem bestätigten Slot mit
   * 409 `slot_confirmed` ab, wenn nicht DERSELBE Patch die Bestätigung aufhebt.
   */
  it('deckt sich mit `diffBrandSlots`: jeder gesendete Wert öffnet die Tür', () => {
    const server = { 'a.origin': confirmed }
    for (const value of ['steht', 'steht ', 'anders', '']) {
      const patch = diffBrandSlots(server, { 'a.origin': { value } })['a.origin']
      const sendsValue = patch?.value !== undefined
      expect(sendsValue).toBe(brandEditReleasesConfirm(confirmed, value))
    }
  })
})

describe('diffBrandSlots', () => {
  const server = {
    'a.oneThing': view({ firstDraft: 'alt', latestDraft: 'stand', confirmed: null }),
    'a.complaints': view({ firstDraft: 'x', latestDraft: 'x', confirmed: 'x' }),
  }

  it('sendet NICHTS, wenn die lokale Eingabe dem Server entspricht (No-op)', () => {
    expect(diffBrandSlots(server, { 'a.oneThing': { value: 'stand' } })).toEqual({})
    expect(diffBrandSlots(server, {})).toEqual({})
  })

  it('sendet nur die geänderten Slots', () => {
    expect(diffBrandSlots(server, {
      'a.oneThing': { value: 'neu' },
      'a.complaints': { value: 'x' },
    })).toEqual({ 'a.oneThing': { value: 'neu' } })
  })

  it('behandelt den leeren String als echte Eingabe', () => {
    expect(diffBrandSlots(server, { 'a.oneThing': { value: '' } })).toEqual({ 'a.oneThing': { value: '' } })
  })

  it('kennt Slots, die der Server noch nicht hat', () => {
    expect(diffBrandSlots(server, { 'a.challenge': { value: 'frisch' } }))
      .toEqual({ 'a.challenge': { value: 'frisch' } })
  })

  it('bestätigt nur, wenn der Server nicht schon genau diesen Text bestätigt hat', () => {
    // schon bestätigt, gleicher Text ⇒ nichts zu tun
    expect(diffBrandSlots(server, { 'a.complaints': { confirmed: true } })).toEqual({})
    // noch nicht bestätigt ⇒ Bestätigung geht raus
    expect(diffBrandSlots(server, { 'a.oneThing': { confirmed: true } }))
      .toEqual({ 'a.oneThing': { confirmed: true } })
    // Text UND Bestätigung in einem Zug
    expect(diffBrandSlots(server, { 'a.complaints': { value: 'y', confirmed: true } }))
      .toEqual({ 'a.complaints': { value: 'y', confirmed: true } })
  })

  it('nimmt eine Bestätigung nur zurück, wenn es eine gibt', () => {
    expect(diffBrandSlots(server, { 'a.complaints': { confirmed: false } }))
      .toEqual({ 'a.complaints': { confirmed: false } })
    expect(diffBrandSlots(server, { 'a.oneThing': { confirmed: false } })).toEqual({})
  })

  it('erzeugt nie einen leeren Slot-Patch (die Route lehnt ihn ab)', () => {
    const result = diffBrandSlots(server, { 'a.oneThing': {} })
    expect(result).toEqual({})
    for (const patch of Object.values(diffBrandSlots(server, {
      'a.oneThing': { value: 'neu', confirmed: false },
    }))) {
      expect(Object.keys(patch).length).toBeGreaterThan(0)
    }
  })
})

describe('pruneSettledEdits', () => {
  it('verwirft, was der Server jetzt so trägt, und behält den Rest', () => {
    const after = {
      'a.oneThing': view({ firstDraft: 'alt', latestDraft: 'neu' }),
      'a.challenge': view({ firstDraft: 'alt', latestDraft: 'alt' }),
    }
    expect(pruneSettledEdits(after, {
      'a.oneThing': { value: 'neu' },
      'a.challenge': { value: 'noch offen' },
    })).toEqual({ 'a.challenge': { value: 'noch offen' } })
  })

  it('ist nach einer vollständigen Antwort leer — sonst speichert der nächste Tick dasselbe erneut', () => {
    const after = { 'a.oneThing': view({ firstDraft: 'neu', latestDraft: 'neu', confirmed: 'neu' }) }
    expect(pruneSettledEdits(after, { 'a.oneThing': { value: 'neu', confirmed: true } })).toEqual({})
  })
})

describe('nextBrandSyncState', () => {
  it('bildet den normalen Lauf ab', () => {
    expect(nextBrandSyncState('saved', 'start')).toBe('saving')
    expect(nextBrandSyncState('saving', 'ok')).toBe('saved')
    expect(nextBrandSyncState('saving', 'offline')).toBe('offline')
    expect(nextBrandSyncState('saving', 'error')).toBe('error')
    expect(nextBrandSyncState('offline', 'start')).toBe('saving')
  })

  it('geht aus JEDEM Zustand in den Konflikt', () => {
    const states: BrandSyncState[] = ['saving', 'saved', 'offline', 'error', 'conflict']
    for (const state of states) expect(nextBrandSyncState(state, 'conflict')).toBe('conflict')
  })

  it('KLEBT im Konflikt — eine verspätete Erfolgsmeldung löst ihn nicht auf', () => {
    // Genau hier hinge sonst die stille Überschreibung, die der 409 verhindert.
    expect(nextBrandSyncState('conflict', 'ok')).toBe('conflict')
    expect(nextBrandSyncState('conflict', 'start')).toBe('conflict')
    expect(nextBrandSyncState('conflict', 'offline')).toBe('conflict')
    expect(nextBrandSyncState('conflict', 'error')).toBe('conflict')
  })

  it('verlässt den Konflikt NUR über die menschliche Entscheidung', () => {
    expect(nextBrandSyncState('conflict', 'resolve')).toBe('saved')
  })

  it('hält den Autosave im Konflikt an', () => {
    expect(brandAutosaveAllowed('conflict')).toBe(false)
    for (const state of ['saving', 'saved', 'offline', 'error'] as BrandSyncState[]) {
      expect(brandAutosaveAllowed(state)).toBe(true)
    }
  })
})

/**
 * DER 409-DIALOG DARF NUR STEHEN, WO ES WIRKLICH ETWAS ZU ENTSCHEIDEN GIBT
 * (Kailua-Befund 2, 2026-09-08).
 *
 * Der teure Fall aus dem Live-Lauf ist der erste Test: EIN offener Tab, eine
 * Serverfassung, die für das getippte Feld leer ist — und ein Dialog, dessen
 * eine Antwort („Serverfassung laden") die Eingabe wegwarf.
 */
describe('brandConflictNeedsDecision', () => {
  it('LEERE Serverfassung ist keine zweite Fassung — kein Dialog', () => {
    expect(brandConflictNeedsDecision(
      { 'a.origin': view() },
      { 'a.origin': view() },
      { 'a.origin': { value: 'Wir haben 2019 angefangen.' } },
    )).toBe(false)
  })

  it('nur Leerraum auf dem Server zählt ebenfalls als leer', () => {
    expect(brandConflictNeedsDecision(
      { 'a.origin': view() },
      { 'a.origin': view({ latestDraft: '   \n ' }) },
      { 'a.origin': { value: 'Wir haben 2019 angefangen.' } },
    )).toBe(false)
  })

  it('ZWEI verschiedene, nicht-leere Texte sind ein echter Zusammenstoss', () => {
    expect(brandConflictNeedsDecision(
      { 'a.origin': view() },
      { 'a.origin': view({ latestDraft: 'Fassung vom zweiten Tab' }) },
      { 'a.origin': { value: 'meine Fassung' } },
    )).toBe(true)
  })

  it('BESTÄTIGEN eines unveränderten Textes ist kein Konflikt (Befund 3)', () => {
    // Der Zähler-Fall: die `revision` ist durch einen Gesprächszug gewandert,
    // der Wortlaut des Feldes nicht. Ein Dialog hier hielte jede Bestätigung
    // des Kapitels auf — genau das ist im Kailua-Lauf passiert.
    expect(brandConflictNeedsDecision(
      { 'a.origin': view({ latestDraft: 'derselbe Satz' }) },
      { 'a.origin': view({ latestDraft: 'derselbe Satz' }) },
      { 'a.origin': { confirmed: true } },
    )).toBe(false)
  })

  it('GEGENPROBE: bestätigen, nachdem der Wortlaut sich bewegt hat, fragt nach', () => {
    // Die Bestätigung meinte einen Text, der nicht mehr dasteht.
    expect(brandConflictNeedsDecision(
      { 'a.origin': view({ latestDraft: 'der Satz, den ich gelesen habe' }) },
      { 'a.origin': view({ latestDraft: 'Fassung vom zweiten Tab' }) },
      { 'a.origin': { confirmed: true } },
    )).toBe(true)
  })

  it('gleicher Wortlaut ist nichts zu entscheiden', () => {
    expect(brandConflictNeedsDecision(
      { 'a.origin': view() },
      { 'a.origin': view({ latestDraft: 'derselbe Satz' }) },
      { 'a.origin': { value: 'derselbe Satz', confirmed: true } },
    )).toBe(false)
  })

  it('GEGENPROBE: ein einziges kollidierendes Feld reicht für den Dialog', () => {
    expect(brandConflictNeedsDecision(
      { 'a.origin': view(), 'a.oneThing': view() },
      { 'a.origin': view(), 'a.oneThing': view({ latestDraft: 'fremd' }) },
      { 'a.origin': { value: 'meins' }, 'a.oneThing': { value: 'auch meins' } },
    )).toBe(true)
  })

  it('nichts offen heisst nichts zu entscheiden', () => {
    expect(brandConflictNeedsDecision(
      { 'a.origin': view({ latestDraft: 'x' }) },
      { 'a.origin': view({ latestDraft: 'x' }) },
      {},
    )).toBe(false)
  })
})

/**
 * „VERWERFEN" (Dritter Testlauf, Befund 3, 2026-09-10).
 *
 * Der Editor hatte nur einen Ausgang, und der SPEICHERTE. Die Rechnung hier
 * beantwortet zwei Fragen: worauf wird zurückgestellt, und ist überhaupt etwas
 * zu tun.
 */
describe('brandDiscardEdit', () => {
  const baseline = { value: 'steht', confirmed: true }

  it('stellt Text UND Bestätigung auf die Fassung von vor dem Öffnen zurück', () => {
    // Die erste Eingabe hat die Bestätigung mitgenommen
    // (`brandEditReleasesConfirm`) — beides muss zurück.
    expect(brandDiscardEdit(baseline, { value: 'steht anders', confirmed: false }))
      .toEqual({ value: 'steht', confirmed: true, changed: true })
  })

  it('tut NICHTS, wenn nur hineingesehen wurde — kein Request', () => {
    expect(brandDiscardEdit(baseline, { value: 'steht', confirmed: true }).changed).toBe(false)
  })

  it('sieht auch eine Bestätigung, die ohne Textänderung gefallen ist', () => {
    expect(brandDiscardEdit(baseline, { value: 'steht', confirmed: false }))
      .toEqual({ value: 'steht', confirmed: true, changed: true })
  })

  it('an einem OFFENEN Feld bleibt es offen — es wird nichts erfunden', () => {
    expect(brandDiscardEdit({ value: 'entwurf', confirmed: false }, { value: 'anders', confirmed: false }))
      .toEqual({ value: 'entwurf', confirmed: false, changed: true })
  })

  /**
   * DIE ZUSAGE AM ANDEREN ENDE: was das Verwerfen schreibt, ist genau der
   * Patch, den die Route für eine Rücknahme braucht — Wert UND Bestätigung in
   * EINEM Rumpf (sonst 409 `slot_confirmed`).
   */
  it('ergibt zusammen mit `diffBrandSlots` EINEN vollständigen Patch', () => {
    // Der Server trägt inzwischen den geänderten, unbestätigten Text.
    const server = { 'a.origin': view({ firstDraft: 'steht', latestDraft: 'steht anders' }) }
    const restore = brandDiscardEdit(baseline, { value: 'steht anders', confirmed: false })
    const patch = diffBrandSlots(server, {
      'a.origin': { value: restore.value, confirmed: restore.confirmed },
    })['a.origin']
    expect(patch).toEqual({ value: 'steht', confirmed: true })
  })
})
