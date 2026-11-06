import { describe, expect, it } from 'vitest'
import {
  BRAND_READING_ANCHOR_MAX,
  BRAND_READING_OBSERVATIONS_MAX,
  BRAND_READING_SUMMARY_MAX,
  type BrandReadingEntry,
  brandReadingSlotValue,
  brandReadingState,
  brandReadingUnreadCount,
  brandReadingVocabLines,
  clampBrandReadings,
  parseBrandReading,
  parseBrandReadingSlotValue,
  serializeBrandReading,
} from '../shared/brandReading'
import { brandSlotValueMatchesFormat } from '../shared/brandSlotFormat'

/**
 * DIE LESUNG — die pure Hälfte (Brand Design D2b, §2.2 Schritt 3).
 *
 * Geprüft wird das, woran alles andere hängt: dass eine Modell-Antwort
 * GEKLEMMT ankommt (Vokabular, Längen, echte Bild-Ids), dass der Slot-Wert die
 * Form seiner Art einhält und sich zurücklesen lässt, und dass die
 * Veraltet-Rechnung jeden der drei Wege kennt, auf denen eine Lesung nicht
 * mehr zu den Bildern passt.
 */
const LABELS = { keeps: 'Trägt schon', improves: 'Geht besser', run: 'Lauf', empty: 'Ohne Befund.' }

const AT = '2026-09-08T10:00:00.000Z'

function raw(overrides: Record<string, unknown> = {}) {
  return {
    readings: [{
      id: 'a',
      observed: [{ dimension: 'composition', value: 'calm' }, { dimension: 'color', value: 'earthy' }],
      verdict: 'fits',
      anchor: 'Ton-Wort „ruhig"',
      reason: 'Text vor Bild, Weissraum als Haltung.',
      ...overrides,
    }],
    summary: { keeps: ['Ruhige Komposition.'], improves: ['Weniger Sättigung.'] },
  }
}

describe('clampBrandReadings', () => {
  it('nimmt eine vollständige Lesung an und stempelt Lauf-Zeit und -Grösse', () => {
    const result = clampBrandReadings(raw(), ['a'], AT)
    expect(result.missing).toEqual([])
    expect(result.readings.a).toMatchObject({
      verdict: 'fits',
      anchor: 'Ton-Wort „ruhig"',
      at: AT,
      runSize: 1,
    })
    expect(result.summary).toEqual({ keeps: ['Ruhige Komposition.'], improves: ['Weniger Sättigung.'] })
  })

  it('WIRFT eine Lesung zu einem Bild weg, das es nicht gibt', () => {
    const result = clampBrandReadings(raw({ id: 'erfunden' }), ['a'], AT)
    expect(result.readings).toEqual({})
    expect(result.missing).toEqual(['a'])
  })

  it('wirft erfundene Dimensionen und Werte weg — kein Freitext im Vokabular', () => {
    const result = clampBrandReadings(raw({
      observed: [
        { dimension: 'vibes', value: 'cool' },
        { dimension: 'color', value: 'neon' },
        { dimension: 'color', value: 'earthy' },
      ],
    }), ['a'], AT)
    expect(result.readings.a?.observed).toEqual([{ dimension: 'color', value: 'earthy' }])
  })

  it('nimmt je Dimension nur EINE Belegung und höchstens drei insgesamt', () => {
    const result = clampBrandReadings(raw({
      observed: [
        { dimension: 'color', value: 'earthy' },
        { dimension: 'color', value: 'vivid' },
        { dimension: 'style', value: 'minimal' },
        { dimension: 'era', value: 'timeless' },
        { dimension: 'mood', value: 'warm' },
      ],
    }), ['a'], AT)
    expect(result.readings.a?.observed).toHaveLength(BRAND_READING_OBSERVATIONS_MAX)
    expect(result.readings.a?.observed.map(o => o.dimension)).toEqual(['color', 'style', 'era'])
  })

  it('OHNE Beobachtung, ohne Urteil, ohne Anker oder ohne Begründung: keine Lesung', () => {
    for (const broken of [
      { observed: [] },
      { verdict: 'schön' },
      { anchor: '   ' },
      { reason: '' },
    ]) {
      const result = clampBrandReadings(raw(broken), ['a'], AT)
      expect(Object.keys(result.readings)).toEqual([])
      expect(result.missing).toEqual(['a'])
    }
  })

  it('kürzt zu lange Texte, statt sie abzulehnen', () => {
    const result = clampBrandReadings(raw({ anchor: 'x'.repeat(500) }), ['a'], AT)
    expect(result.readings.a?.anchor).toHaveLength(BRAND_READING_ANCHOR_MAX)
  })

  it('macht aus mehrzeiligen Feldern eine Zeile — die `structured`-Form verlangt es', () => {
    const result = clampBrandReadings(raw({ reason: 'erste Zeile\n\nzweite Zeile' }), ['a'], AT)
    expect(result.readings.a?.reason).toBe('erste Zeile zweite Zeile')
  })

  it('lässt den Vorschlag weg, wenn keiner da ist', () => {
    expect(clampBrandReadings(raw(), ['a'], AT).readings.a).not.toHaveProperty('suggestion')
    expect(clampBrandReadings(raw({ suggestion: 'Nur den Grundton.' }), ['a'], AT).readings.a)
      .toMatchObject({ suggestion: 'Nur den Grundton.' })
  })

  it('deckelt das Fazit und nimmt „·" aus den Zeilen (es trennt den Slot-Wert)', () => {
    const result = clampBrandReadings({
      readings: [],
      summary: {
        keeps: Array.from({ length: 10 }, (_, i) => `Zeile ${i}`),
        improves: ['Warm · aber laut'],
      },
    }, [], AT)
    expect(result.summary.keeps).toHaveLength(BRAND_READING_SUMMARY_MAX)
    expect(result.summary.improves).toEqual(['Warm — aber laut'])
  })

  it('eine Antwort ohne alles ergibt ein leeres Ergebnis, keinen Absturz', () => {
    expect(clampBrandReadings(null, ['a'], AT)).toEqual({
      readings: {},
      summary: { keeps: [], improves: [] },
      missing: ['a'],
    })
  })
})

describe('brandReadingSlotValue', () => {
  const value = brandReadingSlotValue(
    { keeps: ['Eins.', 'Zwei.'], improves: ['Drei.'] },
    '8. Sept. 2026 — 5 Bilder gelesen — Modell x/y',
    LABELS,
  )

  it('hält die Form seiner Art ein (`structured`)', () => {
    expect(brandSlotValueMatchesFormat('structured', value)).toBe(true)
  })

  it('trägt die drei Blöcke mit gezählten Überschriften', () => {
    expect(value.startsWith('## Trägt schon · 2\n')).toBe(true)
    expect(value).toContain('## Geht besser · 1')
    expect(value).toContain('## Lauf')
  })

  it('schreibt LEERE Listen ausdrücklich — sonst verschöbe sich die Reihenfolge', () => {
    const empty = brandReadingSlotValue({ keeps: [], improves: [] }, 'Lauf-Zeile', LABELS)
    expect(empty.split('\n\n')).toHaveLength(3)
    expect(empty).toContain('Ohne Befund.')
  })

  it('lässt sich zurücklesen — dieselben Zeilen, dieselbe Lauf-Zeile', () => {
    expect(parseBrandReadingSlotValue(value)).toEqual({
      keeps: ['Eins.', 'Zwei.'],
      improves: ['Drei.'],
      runLine: '8. Sept. 2026 — 5 Bilder gelesen — Modell x/y',
    })
  })

  it('GEGENPROBE: ein formfremder Wert ergibt `null`, keine erfundene Liste', () => {
    expect(parseBrandReadingSlotValue('Ein Satz, den jemand von Hand geschrieben hat.')).toBeNull()
    expect(parseBrandReadingSlotValue('')).toBeNull()
    expect(parseBrandReadingSlotValue('## Nur ein Block\nInhalt')).toBeNull()
  })
})

describe('brandReadingState', () => {
  const reading = (at: string, runSize: number): BrandReadingEntry => ({
    observed: [{ dimension: 'color', value: 'earthy' }],
    verdict: 'fits',
    anchor: 'A',
    reason: 'R',
    at,
    runSize,
  })

  it('ohne eine einzige Lesung: `none`', () => {
    expect(brandReadingState([{ reading: null }, { reading: null }])).toBe('none')
  })

  it('alle aus demselben Lauf und vollzählig: `read`', () => {
    expect(brandReadingState([
      { reading: reading(AT, 2) },
      { reading: reading(AT, 2) },
    ])).toBe('read')
  })

  it('ein Bild kam DAZU (es hat keine Lesung): `stale`', () => {
    expect(brandReadingState([
      { reading: reading(AT, 1) },
      { reading: null },
    ])).toBe('stale')
  })

  it('ein Bild fiel WEG (der Lauf war grösser): `stale`', () => {
    expect(brandReadingState([{ reading: reading(AT, 2) }])).toBe('stale')
  })

  it('zwei verschiedene Läufe nebeneinander: `stale`', () => {
    expect(brandReadingState([
      { reading: reading(AT, 2) },
      { reading: reading('2026-09-09T10:00:00.000Z', 2) },
    ])).toBe('stale')
  })

  it('zählt die ungelesenen für die Beschriftung des Knopfes', () => {
    expect(brandReadingUnreadCount([{ reading: reading(AT, 1) }, { reading: null }])).toBe(1)
  })
})

describe('serializeBrandReading / parseBrandReading', () => {
  const entry = clampBrandReadings(raw({ suggestion: 'Nur den Grundton.' }), ['a'], AT).readings.a!

  it('geht hin und zurück', () => {
    expect(parseBrandReading(serializeBrandReading(entry))).toEqual(entry)
  })

  it('FAIL-SOFT: kaputt, leer oder fremde Fassung ⇒ `null` (= noch nicht gelesen)', () => {
    expect(parseBrandReading(null)).toBeNull()
    expect(parseBrandReading('')).toBeNull()
    expect(parseBrandReading('{kein json')).toBeNull()
    expect(parseBrandReading(JSON.stringify({ v: 99, ...entry }))).toBeNull()
    expect(parseBrandReading(JSON.stringify({ v: 1, verdict: 'fits' }))).toBeNull()
  })
})

describe('brandReadingVocabLines', () => {
  it('nennt alle zehn Dimensionen mit Id UND Lesefassung', () => {
    const lines = brandReadingVocabLines('de')
    expect(lines).toHaveLength(10)
    expect(lines[0]).toContain('style (Visueller Stil)')
    expect(lines[0]).toContain('minimal (Minimal)')
    expect(brandReadingVocabLines('en')[0]).toContain('minimal (Minimal)')
  })
})
