import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { brandShareableSlotValues, isBrandSlotShareable } from '../shared/brandSharing'
import { BRAND_SLOTS, slotById } from '../shared/slotRegistry'

/**
 * WAS DAS KONTO VERLASSEN DARF (BF1 §3a Nr. 7; eingelöst in MV1 M5).
 *
 * Die Gegenprobe ist der ganze Wert dieses Tests: ein Filter, der ALLES
 * durchlässt, bestünde jede Prüfung, die nur „öffentliche Slots reisen mit"
 * behauptet — und genau das war der Zustand vor MV1 M5. Jede Zusage hier hat
 * deshalb ihr Gegenstück.
 */

/** Die vier internen Sessions, die es heute gibt (s. `slotRegistry.test.ts`). */
const INTERNAL = ['a.competitors', 'a.complaints', 'a.challenge', 'a.facts'] as const

describe('isBrandSlotShareable', () => {
  it('ein öffentlicher Slot reist mit', () => {
    expect(isBrandSlotShareable('b.purpose')).toBe(true)
  })

  it('GEGENPROBE: die vier internen Sessions reisen NICHT', () => {
    for (const slotId of INTERNAL) {
      expect(slotById(slotId)?.sensitivity, `${slotId} ist im Katalog nicht mehr internal`).toBe('internal')
      expect(isBrandSlotShareable(slotId), slotId).toBe(false)
    }
  })

  it('`a.competitors` ist der Massstab, mit dem der Marktvergleich seine Vertraulichkeit begründet', () => {
    // Plan BRAND-MARKTVERGLEICH §2.9 Nr. 7 sagt „vertraulich wie
    // `a.competitors`". Der Satz hat nur Bedeutung, solange diese Zeile hält —
    // und sie hielt bis MV1 M5 nicht: der Snapshot trug die Wettbewerber-Namen
    // samt notierter Schwäche in einen 30 Tage öffentlich abrufbaren Link.
    expect(isBrandSlotShareable('a.competitors')).toBe(false)
  })

  it('FAIL-CLOSED: ein unbekannter Slot reist nicht', () => {
    expect(isBrandSlotShareable('gibt.es.nicht')).toBe(false)
    expect(isBrandSlotShareable('')).toBe(false)
  })

  it('FAIL-CLOSED: ein abgeschalteter Slot reist nicht — auch wenn er `public` ist', () => {
    const deactivated = BRAND_SLOTS.find(slot => slot.deactivated && slot.sensitivity === 'public')
    // Der Katalog muss so einen nicht haben; wenn er einen hat, gilt die Regel.
    if (!deactivated) return
    expect(isBrandSlotShareable(deactivated.id)).toBe(false)
  })
})

describe('brandShareableSlotValues', () => {
  const values = [
    { slotId: 'b.purpose', value: 'Wir machen X.' },
    { slotId: 'a.competitors', value: 'Kona Trading — teuer, langsam' },
    { slotId: 'a.complaints', value: 'Kunden sagen, wir seien schwer erreichbar' },
    { slotId: 'gibt.es.nicht', value: 'unbekannt' },
  ]

  it('lässt öffentliche Werte durch und hält interne zurück', () => {
    expect(brandShareableSlotValues(values).map(entry => entry.slotId)).toEqual(['b.purpose'])
  })

  it('GEGENPROBE: kein Wettbewerber-Name überlebt den Filter', () => {
    const payload = JSON.stringify(brandShareableSlotValues(values))
    expect(payload).not.toContain('Kona Trading')
    expect(payload).not.toContain('schwer erreichbar')
  })

  it('die Reihenfolge bleibt, wie sie kam', () => {
    const many = [
      { slotId: 'b.mission', value: 'b' },
      { slotId: 'a.competitors', value: 'x' },
      { slotId: 'b.purpose', value: 'a' },
    ]
    expect(brandShareableSlotValues(many).map(entry => entry.slotId)).toEqual(['b.mission', 'b.purpose'])
  })

  it('eine leere Liste bleibt leer (kein Sonderweg)', () => {
    expect(brandShareableSlotValues([])).toEqual([])
  })
})

/**
 * SEIT PAKET G1 HÄNGT EINE ZWEITE BEDINGUNG DARAN (BF-Leseansicht §2.3):
 * `audience: 'foundation'`. Ohne sie fror der Snapshot auch jede ROHANTWORT
 * ein — nicht vertraulich, aber Material und kein Handbuch-Inhalt.
 */
describe('der Snapshot trägt nur Festlegungen', () => {
  const confirmed = [
    { slotId: 'a.complaints', value: 'Zweimal war die Suppe um 13 Uhr alle.' },
    { slotId: 'a.competitors', value: 'Kona Trading — teuer, langsam' },
    { slotId: 'a.origin', value: 'Angefangen hat es mit einer geliehenen Maschine.' },
    { slotId: 'a.pitch', value: 'Eine Rösterei mit Ausschank auf Oʻahu.' },
  ]

  it('lässt von vier bestätigten Werten genau EINEN durch', () => {
    // GEGENPROBE ist die Zeile darunter: ohne Filter wären es vier — die
    // Beschwerde, das Wettbewerber-Profil und die Gründungsgeschichte
    // eingeschlossen, dreissig Tage lang öffentlich abrufbar.
    expect(confirmed).toHaveLength(4)
    expect(brandShareableSlotValues(confirmed).map(entry => entry.slotId)).toEqual(['a.pitch'])
  })

  it('hält die ROHANTWORT zurück, obwohl sie öffentlich ist', () => {
    // `a.origin` ist `sensitivity: 'public'` — das allein hätte sie
    // durchgelassen. Zurück hält sie `audience: 'internal'`.
    expect(slotById('a.origin')?.sensitivity).toBe('public')
    expect(isBrandSlotShareable('a.origin')).toBe(false)
  })

  it('DER SCHREIBWEG BENUTZT DIESEN FILTER (Doppelnetz §2.8)', () => {
    // Der Filter ist wertlos, solange ihn niemand ruft — genau das war der
    // Zustand vor MV1 M5. Der Lesepfad (`brandFoundation.ts`) hat seinen
    // eigenen Beweis; hier steht der Schreibpfad.
    //
    // SEIT DISCOVER D1 steht die Rechnung in `server/utils/brandSnapshot.ts`:
    // der Share-Link UND die öffentliche Veröffentlichung frieren dasselbe
    // Abbild ein, und zwei Kopien wären die Stelle, an der eines Tages die eine
    // einen neuen Filter bekommt und die andere nicht. Geprüft wird deshalb der
    // Bauer — plus die zwei Routen, die ihn wirklich rufen (ein Bauer, den
    // niemand aufruft, ist genau der Zustand von vor MV1 M5).
    const builder = readFileSync(
      new URL('../server/utils/brandSnapshot.ts', import.meta.url),
      'utf8',
    )
    expect(builder).toContain('brandShareableSlotValues(confirmedSlotValues(row))')

    //
    // SEIT BRAND DESIGN D8 nimmt der Bauer eine OPTION entgegen (das
    // eingefrorene Preset). Geprüft wird deshalb der Aufruf mit Profil und
    // Zeilen — nicht die genaue Klammer: die Zusage ist „beide Routen fahren
    // DIESEN Bauer", nicht „beide Routen rufen ihn mit zwei Argumenten".
    for (const route of ['share.post.ts', 'publication.post.ts']) {
      const source = readFileSync(
        new URL(`../server/api/brand/profiles/[id]/${route}`, import.meta.url),
        'utf8',
      )
      expect(source).toContain('buildBrandSnapshot(profile, stepRows')
    }
  })
})
