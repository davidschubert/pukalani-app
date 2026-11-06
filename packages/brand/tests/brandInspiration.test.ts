import { describe, expect, it } from 'vitest'
import { BRAND_INSPIRATION_AREAS } from '../shared/brandDesignVocab'
import {
  BRAND_INSPIRATION_ACCEPT,
  BRAND_INSPIRATION_MAX,
  BRAND_INSPIRATION_MAX_BYTES,
  BRAND_INSPIRATION_NOTE_MAX,
  type BrandInspirationEntry,
  brandInspirationSlotValue,
  detectBrandInspirationImage,
  isBrandInspirationArea,
  nextBrandInspirationNumber,
} from '../shared/brandInspiration'
import { brandShareableSlotValues, isBrandSlotShareable } from '../shared/brandSharing'
import { brandSlotValueMatchesFormat } from '../shared/brandSlotFormat'
import { slotById, slotIsConfirmable } from '../shared/slotRegistry'

/**
 * DIE VORBILDER — die puren Regeln (Brand Design D2a, Konzept §2.2/§2.13).
 *
 * Der wichtigste Abschnitt hier ist der LETZTE: „Bilder sind Eingabe, nie
 * Ausgabe" (Leitplanke c) ist eine Zusage, die man nur NEGATIV prüfen kann —
 * an dem, was NICHT herauskommt. Ein Test, der nur die Upload-Regeln prüft,
 * wäre grün, während die Vorbilder im geteilten Schnappschuss stünden.
 */

function png(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00])
}
function jpeg(): Uint8Array {
  return new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10])
}
function webp(): Uint8Array {
  const bytes = new Uint8Array(16)
  bytes.set([0x52, 0x49, 0x46, 0x46], 0)
  bytes.set([0x57, 0x45, 0x42, 0x50], 8)
  return bytes
}

const AREA_LABEL = (id: string) =>
  BRAND_INSPIRATION_AREAS.find(area => area.id === id)?.de ?? id

function entry(partial: Partial<BrandInspirationEntry> & { number: number }): BrandInspirationEntry {
  return {
    id: `f${partial.number}`,
    area: 'color',
    note: '',
    filename: 'x.png',
    createdAt: '2026-09-08T10:00:00.000Z',
    ...partial,
  }
}

describe('detectBrandInspirationImage — der INHALT entscheidet', () => {
  it('erkennt die drei zugesagten Formate', () => {
    expect(detectBrandInspirationImage(png())).toEqual({ mime: 'image/png', extension: 'png' })
    expect(detectBrandInspirationImage(jpeg())).toEqual({ mime: 'image/jpeg', extension: 'jpg' })
    expect(detectBrandInspirationImage(webp())).toEqual({ mime: 'image/webp', extension: 'webp' })
  })

  it('GEGENPROBE: Text mit .png im Namen ist kein Bild', () => {
    // Genau der Angriff, gegen den die Magic-Bytes stehen: der Browser darf
    // `image/png` behaupten, die Bytes sagen etwas anderes.
    expect(detectBrandInspirationImage(new TextEncoder().encode('<svg>nope</svg>'))).toBeNull()
    expect(detectBrandInspirationImage(new TextEncoder().encode('nur Text'))).toBeNull()
  })

  it('GEGENPROBE: `RIFF` allein ist kein WebP', () => {
    // WAV und AVI beginnen ebenso. Ohne die zweite Prüfung ab Position 8 wäre
    // jeder RIFF-Container ein „Bild".
    const wav = new Uint8Array(16)
    wav.set([0x52, 0x49, 0x46, 0x46], 0)
    wav.set([0x57, 0x41, 0x56, 0x45], 8)
    expect(detectBrandInspirationImage(wav)).toBeNull()
  })

  it('GEGENPROBE: zu kurze Daten laufen nicht über das Ende', () => {
    expect(detectBrandInspirationImage(new Uint8Array([0x89, 0x50]))).toBeNull()
    expect(detectBrandInspirationImage(new Uint8Array(0))).toBeNull()
  })

  it('die `accept`-Liste nennt dieselben drei Typen wie die Erkennung', () => {
    const accepted = BRAND_INSPIRATION_ACCEPT.split(',')
    expect(accepted).toEqual(['image/png', 'image/jpeg', 'image/webp'])
    for (const bytes of [png(), jpeg(), webp()]) {
      expect(accepted).toContain(detectBrandInspirationImage(bytes)!.mime)
    }
  })
})

describe('die Grenzen', () => {
  it('die Zahlen sind die zugesagten (§2.2) — und die Bucket-Grösse ist dieselbe', () => {
    expect(BRAND_INSPIRATION_MAX).toBe(12)
    expect(BRAND_INSPIRATION_NOTE_MAX).toBe(240)
    // Dezimal, nicht 5 × 1024 × 1024: `maximumFileSize` des Buckets
    // (brand-024) ist 5_000_000, und eine höhere Zahl hier hiesse 503 statt
    // einer klaren 413.
    expect(BRAND_INSPIRATION_MAX_BYTES).toBe(5_000_000)
  })

  it('der Bereich kommt aus dem Vokabular — und nichts sonst', () => {
    for (const area of BRAND_INSPIRATION_AREAS) {
      expect(isBrandInspirationArea(area.id), area.id).toBe(true)
    }
    expect(isBrandInspirationArea('motion')).toBe(false)
    expect(isBrandInspirationArea('')).toBe(false)
    expect(isBrandInspirationArea('COLOR')).toBe(false)
  })
})

describe('nextBrandInspirationNumber — die Nummer rückt nicht nach', () => {
  it('zählt vom höchsten Wert weiter, nicht von der Anzahl', () => {
    expect(nextBrandInspirationNumber([])).toBe(1)
    expect(nextBrandInspirationNumber([entry({ number: 1 }), entry({ number: 2 })])).toBe(3)
    // Nach dem Entfernen von Nummer 2 bleiben 1 und 3 — die nächste ist 4.
    // Wäre es 3, meinte die Lesung (D2b) hinterher ein anderes Bild.
    expect(nextBrandInspirationNumber([entry({ number: 1 }), entry({ number: 3 })])).toBe(4)
  })
})

describe('brandInspirationSlotValue — die Auswahl in Worten', () => {
  it('schreibt beschriftete Blöcke in der Form des Katalogs', () => {
    const value = brandInspirationSlotValue([
      entry({ number: 1, area: 'composition', note: 'Ruhig, viel Weißraum.' }),
      entry({ number: 2, area: 'type', note: 'Die Serif in den Überschriften.' }),
    ], AREA_LABEL, 'Ohne Notiz.')

    expect(value).toBe(
      '## 1 · Komposition\nRuhig, viel Weißraum.\n\n## 2 · Typografie\nDie Serif in den Überschriften.',
    )
    // Die Form ist die des Slots (`kind: 'structured'`) — geprüft mit dem
    // Leser, der sie später aufschlägt.
    expect(brandSlotValueMatchesFormat('structured', value)).toBe(true)
  })

  it('ein Bild OHNE Notiz fällt nicht aus dem Wert', () => {
    // `formatBrandSlotStructured` wirft Blöcke mit leerem Rumpf weg — ohne den
    // Ersatzsatz verschwände jedes Bild ohne Notiz aus der Auswahl, und der
    // Zähler in der Werkstatt sagte etwas anderes als das Kapitel.
    const value = brandInspirationSlotValue([entry({ number: 1, area: 'mark' })], AREA_LABEL, 'Ohne Notiz.')
    expect(value).toBe('## 1 · Zeichen\nOhne Notiz.')
  })

  it('keine Bilder ⇒ leerer Wert (der Slot wird gelöscht, nicht auf "" gesetzt)', () => {
    expect(brandInspirationSlotValue([], AREA_LABEL, 'Ohne Notiz.')).toBe('')
  })

  it('der Wert trägt weder Dateiname noch Adresse', () => {
    const value = brandInspirationSlotValue(
      [entry({ number: 1, filename: 'geheime-agentur-präsentation.png', note: 'Schön.' })],
      AREA_LABEL,
      'Ohne Notiz.',
    )
    expect(value).not.toContain('geheime-agentur')
    expect(value).not.toContain('.png')
    expect(value).not.toContain('http')
  })
})

/**
 * LEITPLANKE c — „BILDER SIND EINGABE, NIE AUSGABE" (§2.2).
 *
 * Geprüft wird die ABWESENHEIT, und zwar an genau der Funktion, durch die
 * jeder Share-Snapshot läuft (`brandShareableSlotValues` in
 * `brandSnapshot.ts`). Fiele die Regel — etwa weil jemand `sensitivity` auf
 * `public` setzt —, wäre das hier rot, bevor ein Fremdwerk in einem dreissig
 * Tage gültigen Link steht.
 */
describe('Vorbilder reisen nicht', () => {
  it('`g.inspiration` ist intern und damit nicht teilbar', () => {
    const slot = slotById('g.inspiration')
    expect(slot?.sensitivity).toBe('internal')
    expect(slot?.audience).toBe('internal')
    expect(isBrandSlotShareable('g.inspiration')).toBe(false)
  })

  it('der Snapshot-Filter lässt den Slot fallen und die Nachbarn stehen', () => {
    const kept = brandShareableSlotValues([
      { slotId: 'a.pitch', value: 'Wir rösten Kaffee.' },
      { slotId: 'g.inspiration', value: '## 1 · Farbwelt\nWarm.' },
      { slotId: 'g.source', value: 'inspiration' },
    ])
    expect(kept.map(item => item.slotId)).toEqual(['a.pitch'])
  })

  it('die Weiche selbst reist ebenfalls nicht — sie ist eine Auskunft über die Sitzung', () => {
    expect(isBrandSlotShareable('g.source')).toBe(false)
  })

  it('das Instrument ist `uploads` und NICHT bestätigbar', () => {
    // `type: 'special'` heisst: kein Abschluss-Gate hängt daran. Genau darauf
    // beruht das Überspringen im Weg „Frida schlägt vor" — ohne eine einzige
    // neue Regel in der Zustandsmaschine (§2.1).
    const slot = slotById('g.inspiration')!
    expect(slot.editor).toBe('uploads')
    expect(slot.required).toBe(false)
    expect(slotIsConfirmable(slot)).toBe(false)
  })

  it('die Weiche zeigt KARTEN — sonst stünde dort die rohe Id im Textfeld', () => {
    const slot = slotById('g.source')!
    expect(slot.type).toBe('choice')
    expect(slot.editor).toBe('cards')
  })
})
