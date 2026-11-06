import { describe, expect, it } from 'vitest'
import { BRAND_ARCHETYPES, brandChoiceContract, brandChoiceDisplayLabel } from '../shared/brandChoiceOptions'
import {
  BRAND_DIRECTIONS,
  BRAND_DIRECTIONS_VERSION,
  BRAND_DIRECTION_OPTIONS,
  BRAND_DIRECTION_SOURCE_SLOTS,
  brandDirectionById,
  brandGradientIsCurated,
  suggestBrandDirections,
} from '../shared/brandDirections'
import { brandStageSourceSlots } from '../shared/brandSessions'
import { slotById } from '../shared/slotRegistry'

/**
 * DER RICHTUNGS-KATALOG UND SEINE EINE REGEL (Konzept
 * docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md §11 a/b, Paket G4).
 *
 * Drei Zusagen hängen daran, und alle drei sind teuer, wenn sie brechen:
 *  1. Der Katalog ist GESCHLOSSEN und stabil — seine Ids stehen in
 *     `result.direction`, in `presetId` jedes Share-Snapshots und in jedem
 *     Kapitel 10, das jemand verschickt hat.
 *  2. `suggestBrandDirections` liefert IMMER genau drei verschiedene — auch
 *     für eine Marke ohne bestätigten Archetyp und für einen von Hand
 *     verdorbenen Wert. Zwei Karten sähen aus wie ein Fehler, null wäre einer.
 *  3. Jeder der zwölf Archetypen findet mindestens drei passende Richtungen.
 *     Sonst wären die Vorschläge einer Marke nur noch Katalog-Reihenfolge,
 *     und die Begründung darunter („passt zu eurem Archetyp") eine Lüge.
 */

const ARCHETYPE_IDS = BRAND_ARCHETYPES.map(option => option.id)

describe('Der Katalog der sechs Richtungen', () => {
  it('hat sechs Einträge mit eindeutigen, erwarteten Ids', () => {
    const ids = BRAND_DIRECTIONS.map(direction => direction.id)
    expect(ids).toEqual([
      'warm-editorial',
      'clear-technical',
      'calm-natural',
      'bold-contrast',
      'light-playful',
      'classic-serious',
    ])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('kennt jede Archetyp-Id wirklich — der Katalog erfindet keinen Archetyp', () => {
    for (const direction of BRAND_DIRECTIONS) {
      for (const archetype of direction.archetypes) {
        expect(ARCHETYPE_IDS, `${direction.id} nennt ${archetype}`).toContain(archetype)
      }
      // Keine Dopplung innerhalb einer Richtung: sie zählte doppelt und
      // verschöbe die Rechnung unten still.
      expect(new Set(direction.archetypes).size).toBe(direction.archetypes.length)
    }
  })

  it('JEDER der zwölf Archetypen kommt in mindestens DREI Richtungen vor', () => {
    for (const archetype of ARCHETYPE_IDS) {
      const hits = BRAND_DIRECTIONS.filter(direction => direction.archetypes.includes(archetype))
      expect(hits.length, `${archetype} passt nur zu ${hits.length} Richtungen`).toBeGreaterThanOrEqual(3)
    }
    // Und je Richtung eine Menge, die man noch überblickt. Die Skizze des
    // Pakets sprach von „3–5"; das ist bei sechs Richtungen und zwölf
    // Archetypen arithmetisch unmöglich (6 × 5 = 30 < 12 × 3 = 36) — s. Kopf
    // von `brandDirections.ts`.
    for (const direction of BRAND_DIRECTIONS) {
      expect(direction.archetypes.length, direction.id).toBeGreaterThanOrEqual(5)
      expect(direction.archetypes.length, direction.id).toBeLessThanOrEqual(7)
    }
  })

  it('nimmt jede Farbwelt aus der kuratierten Tabelle — und keine zweimal', () => {
    for (const direction of BRAND_DIRECTIONS) {
      expect(brandGradientIsCurated(direction.gradient), direction.id).toBe(true)
    }
    const worlds = BRAND_DIRECTIONS.map(direction => direction.gradient.join('/'))
    expect(new Set(worlds).size).toBe(worlds.length)
    // GEGENPROBE: eine erfundene Welt fällt durch, sonst wäre die Prüfung oben
    // für jede beliebige Farbe grün.
    expect(brandGradientIsCurated(['#ff00ff', '#00ff00', '#0000ff'])).toBe(false)
  })

  it('trägt je Richtung drei Farbrollen und ein Schriftpaar mit Rückfall-Stack', () => {
    for (const direction of BRAND_DIRECTIONS) {
      expect(direction.roles, direction.id).toHaveLength(3)
      for (const font of [direction.fonts.heading, direction.fonts.body]) {
        expect(font.family.length, direction.id).toBeGreaterThan(0)
        // Der Stack muss die Familie NENNEN und einen generischen Rückfall
        // haben: die Web-Schrift wird bewusst nicht geladen (s. Kopf von
        // `BwDirectionCard.vue`), es rendert also immer der Rückfall.
        expect(font.stack, `${direction.id}/${font.family}`).toContain(font.family)
        expect(/(?:serif|sans-serif)$/.test(font.stack), `${direction.id}/${font.family}`).toBe(true)
      }
    }
  })

  it('löst eine Id auf — und eine unbekannte zu `null`', () => {
    expect(brandDirectionById('warm-editorial')?.id).toBe('warm-editorial')
    expect(brandDirectionById('gibt-es-nicht')).toBeNull()
    expect(brandDirectionById('')).toBeNull()
  })

  it('hat eine Fassung, die als Zeichenkette in den Snapshot passt', () => {
    expect(BRAND_DIRECTIONS_VERSION).toBe(1)
    expect(String(BRAND_DIRECTIONS_VERSION)).toBe('1')
  })
})

describe('suggestBrandDirections — immer genau drei, in Rangfolge der Belegkraft', () => {
  it('liefert für JEDES Paar aus 12 × (12 + keiner) genau drei verschiedene Ids', () => {
    const candidates: (string | null)[] = [...ARCHETYPE_IDS, null]
    let pairs = 0
    for (const primary of ARCHETYPE_IDS) {
      for (const secondary of candidates) {
        const result = suggestBrandDirections(primary, secondary)
        const ids = result.map(entry => entry.id)
        expect(ids, `${primary}/${secondary}`).toHaveLength(3)
        expect(new Set(ids).size, `${primary}/${secondary}`).toBe(3)
        for (const id of ids) expect(brandDirectionById(id), id).not.toBeNull()
        pairs++
      }
    }
    // Ohne diese Zeile wäre der Test auch für eine leere Schleife grün.
    expect(pairs).toBe(12 * 13)
  })

  it('setzt die Richtungen, die zu BEIDEN Archetypen passen, nach vorn', () => {
    // „Der Weise" + „Der Herrscher" teilen sich `clear-technical` und
    // `classic-serious` — beide müssen vor allem anderen stehen.
    const result = suggestBrandDirections('sage', 'ruler')
    expect(result.slice(0, 2).map(entry => entry.id).sort())
      .toEqual(['classic-serious', 'clear-technical'])
    expect(result[0]!.reasonKey).toBe('brand.foundation.direction.reason.both')
    expect(result[1]!.reasonKey).toBe('brand.foundation.direction.reason.both')
    // Der dritte kommt aus dem Haupt-Archetyp — und sagt das auch.
    expect(result[2]!.reasonKey).toBe('brand.foundation.direction.reason.primary')
    expect(brandDirectionById(result[2]!.id)!.archetypes).toContain('sage')
  })

  it('ohne Neben-Archetyp zählt nur der Haupt-Archetyp', () => {
    const result = suggestBrandDirections('jester', null)
    expect(result.every(entry => entry.reasonKey.endsWith('.primary'))).toBe(true)
    for (const entry of result) {
      expect(brandDirectionById(entry.id)!.archetypes, entry.id).toContain('jester')
    }
    // Leerer Text ist derselbe Fall wie `null` — er kommt aus einem leeren Feld.
    expect(suggestBrandDirections('jester', '')).toEqual(result)
  })

  it('kennt den Neben-Archetyp als eigenen Rang', () => {
    // `innocent` passt zu keiner Richtung von `hero` — die Vorschläge müssen
    // also erst die des Helden nehmen und dann die des Unschuldigen.
    const result = suggestBrandDirections('hero', 'innocent')
    expect(result[0]!.reasonKey).toBe('brand.foundation.direction.reason.primary')
    const secondary = result.find(entry => entry.reasonKey.endsWith('.secondary'))
    expect(secondary).toBeUndefined()
    // `hero` hat genau drei Richtungen — der Neben-Archetyp kommt gar nicht
    // mehr zum Zug. Das ist die Rangfolge, nicht ein Fehler.
    expect(result.every(entry => brandDirectionById(entry.id)!.archetypes.includes('hero'))).toBe(true)
  })

  it('GEGENPROBE: ein UNBEKANNTER Archetyp wirft nicht — er bekommt den Rückfall', () => {
    const result = suggestBrandDirections('gibt-es-nicht', 'auch-nicht')
    expect(result.map(entry => entry.id)).toEqual([
      'warm-editorial', 'clear-technical', 'calm-natural',
    ])
    expect(result.every(entry => entry.reasonKey.endsWith('.fallback'))).toBe(true)
    // Und der leere Wert (kein bestätigter Archetyp) bekommt dasselbe.
    expect(suggestBrandDirections('', null)).toEqual(result)
  })
})

describe('Die Richtung als Auswahl-Vertrag', () => {
  const contract = brandChoiceContract('result.direction')!

  it('ist geschlossen und kennt genau die sechs Katalog-Ids', () => {
    expect(contract.kind).toBe('closed')
    expect(contract.kind === 'closed' && contract.options).toBe(BRAND_DIRECTION_OPTIONS)
    expect(BRAND_DIRECTION_OPTIONS.map(option => option.id))
      .toEqual(BRAND_DIRECTIONS.map(direction => direction.id))
  })

  it('zeigt statt der rohen Id den Namen — in beiden Sprachen der Oberfläche', () => {
    expect(brandChoiceDisplayLabel('result.direction', 'clear-technical', 'de')).toBe('Klar & Technisch')
    expect(brandChoiceDisplayLabel('result.direction', 'clear-technical', 'en')).toBe('Clear & Technical')
    // Ein Alt-Wert aus der Zeit vor dem Katalog bleibt stehen, statt zu
    // verschwinden (dieselbe Regel wie bei den Archetypen).
    expect(brandChoiceDisplayLabel('result.direction', 'irgendwas', 'de')).toBe('irgendwas')
  })

  it('zeigt auf die FOUNDATION-Schlüssel, nicht auf eine zweite Karten-Copy', () => {
    // Die Richtung hat ihre eigene Karte (`BwDirectionCard`); zwei
    // Schlüsselfamilien für denselben Namen wären zwei Namen, sobald jemand
    // einen davon ändert.
    for (const option of BRAND_DIRECTION_OPTIONS) {
      expect(option.copyKey, option.id).toMatch(/^brand\.foundation\.direction\./)
    }
    // Die Registry bedient den Slot wirklich mit Karten — sonst zeigte die
    // Werkstatt ein Textfeld mit der rohen Id darin.
    expect(slotById('result.direction')?.editor).toBe('cards')
    expect(slotById('result.direction')?.schema.kind).toBe('choice')
  })
})

describe('Woher die Bühne ihre zwei Archetypen bekommt', () => {
  it('nennt genau die zwei Quell-Slots — und beide wohnen in einem FREMDEN Kapitel', () => {
    expect([...BRAND_DIRECTION_SOURCE_SLOTS]).toEqual(['d.primary', 'd.secondary'])
    expect(brandStageSourceSlots('result')).toBe(BRAND_DIRECTION_SOURCE_SLOTS)
    for (const slotId of BRAND_DIRECTION_SOURCE_SLOTS) {
      const slot = slotById(slotId)
      expect(slot, slotId).toBeDefined()
      expect(slot!.stepId, slotId).not.toBe('result')
    }
  })

  it('jedes andere Kapitel braucht nichts von aussen', () => {
    expect(brandStageSourceSlots('context')).toEqual([])
    expect(brandStageSourceSlots('archetype')).toEqual([])
  })
})
