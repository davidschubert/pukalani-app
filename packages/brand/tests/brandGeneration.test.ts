import { describe, expect, it } from 'vitest'
import type { BrandGenerationEntry } from '../shared/types/brand'
import {
  BRAND_GENERATION_EVENTS,
  BRAND_GENERATIONS_KEEP,
  brandGenerationHashInput,
  brandGenerationLockHeld,
  brandGenerationLockKey,
  decodeBrandGenerationChunk,
  findBrandGenerationByKey,
  packBrandGenerations,
  parseBrandGenerationEvent,
  serializeBrandGenerationEvent,
  stripBrandGenerationDrafts,
} from '../shared/brandGeneration'

/**
 * DAS PROTOKOLL, DIE SPERRE, DER HASH, DER BESCHNITT — die vier Rechnungen der
 * Generierungs-Route, jede mit Gegenprobe.
 *
 * Warum das hier steht und nicht in einem Routen-Test: die Route hängt an
 * Appwrite, an einer Session und an einem KI-Anbieter. Diese vier Regeln hängen
 * an nichts — und sie sind die, bei denen ein Fehler still bleibt: ein
 * verschobener Beschnitt löscht Fassungen, die niemand vermisst, bis sie jemand
 * sucht; eine kaputte Sperre lässt zwei Läufe denselben Slot überschreiben; ein
 * unempfindlicher Hash meldet einen veralteten Entwurf als aktuell.
 */

function entry(overrides: Partial<BrandGenerationEntry> & { generationId: string }): BrandGenerationEntry {
  return {
    slotId: 'b.purpose',
    schemaVersion: 1,
    promptVersion: 'stub-1',
    model: 'test/model',
    provider: 'test',
    locale: 'de',
    inputHash: 'hash',
    createdAt: '2026-08-31T10:00:00.000Z',
    ...overrides,
  }
}

describe('Ereignis-Serialisierung (§3e)', () => {
  it('schreibt ein SSE-Frame mit event-Kopf und typisiertem data-JSON', () => {
    const frame = serializeBrandGenerationEvent('generation.started', {
      generationId: 'g1', slotId: 'b.purpose', stepKey: 'pvm',
    })
    expect(frame).toBe(
      'event: generation.started\n'
      + 'data: {"type":"generation.started","generationId":"g1","slotId":"b.purpose","stepKey":"pvm"}\n\n',
    )
  })

  it('hält die data-Zeile EINZEILIG, auch bei mehrzeiligem Entwurf', () => {
    const frame = serializeBrandGenerationEvent('slot.ready', {
      generationId: 'g1', slotId: 'e.manifesto', draft: 'Zeile 1\nZeile 2\n\nZeile 4',
    })
    const dataLines = frame.split('\n').filter(line => line.startsWith('data:'))
    expect(dataLines).toHaveLength(1)
    // Und der Umbruch überlebt trotzdem: er reist maskiert.
    const parsed = parseBrandGenerationEvent(dataLines[0]!.slice('data: '.length))
    expect(parsed).toMatchObject({ type: 'slot.ready', draft: 'Zeile 1\nZeile 2\n\nZeile 4' })
  })

  it('kennt genau die fünf Ereignisse des Plans', () => {
    expect([...BRAND_GENERATION_EVENTS]).toEqual([
      'generation.started', 'message.delta', 'slot.ready', 'generation.completed', 'generation.failed',
    ])
  })

  /**
   * ANTWORT-MÖGLICHKEITEN IM ABSCHLUSS-FRAME (Davids Anforderung 2026-09-04).
   *
   * `options` ist das EINZIGE Feld, aus dem die Oberfläche eine Liste rendert —
   * ein Text statt eines Arrays wäre dort kein falscher Wert, sondern ein
   * Fehler im Rendern. Deshalb wird genau dieses Feld beim Lesen geprüft, und
   * genau deshalb braucht es hier eine Gegenprobe je Bruchstelle.
   */
  describe('options im generation.completed-Frame', () => {
    function completed(options: unknown) {
      const frame = JSON.stringify({
        type: 'generation.completed',
        generationId: 'g1',
        slotId: '',
        revision: 3,
        messageId: 'm1',
        model: 'test',
        promptVersion: 'converse-5',
        createdAt: '2026-09-04T10:00:00.000Z',
        reused: false,
        outcome: 'question',
        options,
      })
      return parseBrandGenerationEvent(frame)
    }

    it('reicht zwei bis drei Beschriftungen durch', () => {
      expect(completed(['Der Handwerker', 'Der Mentor']))
        .toMatchObject({ options: ['Der Handwerker', 'Der Mentor'] })
      expect(completed(['A', 'B', 'C'])).toMatchObject({ options: ['A', 'B', 'C'] })
    })

    it('RÜCKWÄRTS-VERTRAG: ohne das Feld ist der Frame vollständig, nur ohne Chips', () => {
      const frame = serializeBrandGenerationEvent('generation.completed', {
        generationId: 'g1',
        slotId: '',
        revision: 3,
        messageId: 'm1',
        model: 'test',
        promptVersion: 'converse-3',
        createdAt: '2026-09-04T10:00:00.000Z',
        reused: false,
        outcome: 'question',
      })
      const parsed = parseBrandGenerationEvent(frame.split('\n')[1]!.slice('data: '.length))
      expect(parsed).toMatchObject({ type: 'generation.completed', outcome: 'question' })
      expect((parsed as { options?: unknown }).options).toBeUndefined()
    })

    it('GEGENPROBE: Unsinn verschwindet, der Frame bleibt', () => {
      // Vier Bruchstellen, EIN Verhalten: der Zug ist die Sache, die Chips sind
      // die Beilage — ein kaputtes `options` darf keinen Zug verschlucken.
      for (const broken of ['Der Handwerker', 42, null, [{ label: 'A' }, 7]]) {
        const parsed = completed(broken)
        expect(parsed).toMatchObject({ type: 'generation.completed' })
        expect((parsed as { options?: unknown }).options).toBeUndefined()
      }
    })

    it('EINE Möglichkeit ist keine Wahl, VIER werden auf drei geklemmt', () => {
      expect((completed(['nur eine']) as { options?: unknown }).options).toBeUndefined()
      expect(completed(['A', 'B', 'C', 'D'])).toMatchObject({ options: ['A', 'B', 'C'] })
    })
  })

  it('GEGENPROBE: ein erfundener Typ, kaputtes JSON und ein Array fallen durch', () => {
    expect(parseBrandGenerationEvent('{"type":"generation.exploded"}')).toBeNull()
    expect(parseBrandGenerationEvent('{kaputt')).toBeNull()
    expect(parseBrandGenerationEvent('[1,2,3]')).toBeNull()
    expect(parseBrandGenerationEvent('{"generationId":"g1"}')).toBeNull()
  })
})

describe('Lese-Seite: der Frame-Splitter des Clients', () => {
  const stream = [
    serializeBrandGenerationEvent('generation.started', { generationId: 'g1', slotId: 'a.pitch', stepKey: 'context' }),
    serializeBrandGenerationEvent('message.delta', { generationId: 'g1', text: 'Hallo ' }),
    serializeBrandGenerationEvent('message.delta', { generationId: 'g1', text: 'Welt' }),
    serializeBrandGenerationEvent('slot.ready', { generationId: 'g1', slotId: 'a.pitch', draft: 'Hallo Welt' }),
  ].join('')

  function readAll(pieces: readonly string[]) {
    let buffer = ''
    const events = []
    for (const piece of pieces) {
      const step = decodeBrandGenerationChunk(buffer, piece)
      buffer = step.buffer
      events.push(...step.events)
    }
    return events
  }

  it('liest einen ganzen Strom', () => {
    expect(readAll([stream]).map(item => item.type)).toEqual([
      'generation.started', 'message.delta', 'message.delta', 'slot.ready',
    ])
  })

  it('liefert BUCHSTABENWEISE zerrissen exakt dasselbe', () => {
    expect(readAll([...stream])).toEqual(readAll([stream]))
  })

  it('gibt ein unvollständiges Frame NICHT heraus', () => {
    const cut = stream.indexOf('Welt')
    const step = decodeBrandGenerationChunk('', stream.slice(0, cut))
    expect(step.events.map(item => item.type)).toEqual(['generation.started', 'message.delta'])
    expect(step.buffer).toContain('message.delta')
  })

  it('überspringt Fremdes, statt den Strom abzubrechen', () => {
    const noisy = ': keepalive\n\ndata: {"type":"nichts"}\n\ndata: {kaputt\n\n' + stream
    expect(readAll([noisy]).map(item => item.type)).toEqual([
      'generation.started', 'message.delta', 'message.delta', 'slot.ready',
    ])
  })
})

describe('Sperre — max EINE aktive Generierung je Profil × Baustein', () => {
  const key = brandGenerationLockKey('p1', 'pvm')

  it('trennt Profile und Bausteine', () => {
    expect(key).toBe('p1:pvm')
    expect(brandGenerationLockKey('p1', 'values')).not.toBe(key)
    expect(brandGenerationLockKey('p2', 'pvm')).not.toBe(key)
  })

  it('LEHNT DEN ZWEITEN AUFRUF AB, solange der erste läuft', () => {
    const held = { generationId: 'g1', startedAt: 1_000 }
    expect(brandGenerationLockHeld(undefined, 1_000, 60_000)).toBe(false)
    expect(brandGenerationLockHeld(held, 1_500, 60_000)).toBe(true)
  })

  it('gibt eine VERWAISTE Sperre nach der Frist frei', () => {
    const held = { generationId: 'g1', startedAt: 1_000 }
    expect(brandGenerationLockHeld(held, 61_000, 60_000)).toBe(false)
    // Genau auf der Frist ist sie schon frei — sonst hinge sie eine Runde länger.
    expect(brandGenerationLockHeld(held, 61_000 - 1, 60_000)).toBe(true)
  })
})

describe('inputHash-Eingabe — „veraltet" ist abgeleitet', () => {
  const deps = [
    { slotId: 'a.pitch', value: 'Wir bauen Werkzeug.' },
    { slotId: 'b.whyStarted', value: 'Aus Ärger.' },
  ]

  it('ist stabil bei gleichem Stand', () => {
    expect(brandGenerationHashInput('b.purpose', 'de', deps))
      .toBe(brandGenerationHashInput('b.purpose', 'de', deps))
  })

  it('ÄNDERT SICH, wenn ein Quell-Slot sich ändert', () => {
    const changed = [deps[0]!, { slotId: 'b.whyStarted', value: 'Aus Neugier.' }]
    expect(brandGenerationHashInput('b.purpose', 'de', changed))
      .not.toBe(brandGenerationHashInput('b.purpose', 'de', deps))
  })

  it('ändert sich mit Ziel-Slot und Sprache', () => {
    expect(brandGenerationHashInput('b.vision', 'de', deps))
      .not.toBe(brandGenerationHashInput('b.purpose', 'de', deps))
    expect(brandGenerationHashInput('b.purpose', 'en', deps))
      .not.toBe(brandGenerationHashInput('b.purpose', 'de', deps))
  })

  it('SCHIEBT ZWEI STÄNDE NICHT ZUSAMMEN (Trennzeichen-Gegenprobe)', () => {
    // Mit einem gewöhnlichen Trennzeichen wären diese beiden gleich.
    const a = brandGenerationHashInput('x', 'de', [{ slotId: 's', value: 'a|b' }, { slotId: 't', value: 'c' }])
    const b = brandGenerationHashInput('x', 'de', [{ slotId: 's', value: 'a' }, { slotId: 't', value: 'b|c' }])
    expect(a).not.toBe(b)
  })
})

describe('Historien-Beschnitt', () => {
  const many = Array.from({ length: 14 }, (_, index) => entry({
    generationId: `g${index}`,
    draft: `Fassung ${index}`,
  }))

  it('BEHÄLT DIE NEUESTEN ZEHN — und zählt trotzdem weiter', () => {
    const packed = packBrandGenerations(many, 14)
    expect(packed.items).toHaveLength(BRAND_GENERATIONS_KEEP)
    expect(packed.items[0]!.generationId).toBe('g4')
    expect(packed.items.at(-1)!.generationId).toBe('g13')
    expect(packed.count).toBe(14)
  })

  it('lässt eine kurze Historie unangetastet', () => {
    const packed = packBrandGenerations(many.slice(0, 3), 3)
    expect(packed.items.map(item => item.generationId)).toEqual(['g0', 'g1', 'g2'])
    expect(packed.items.every(item => typeof item.draft === 'string')).toBe(true)
  })

  it('LEERT BEIM SPALTEN-DECKEL DIE ÄLTESTEN ENTWÜRFE ZUERST', () => {
    const big = Array.from({ length: 4 }, (_, index) => entry({
      generationId: `g${index}`,
      draft: 'x'.repeat(1_000),
    }))
    // Der Deckel wird aus dem GEWÜNSCHTEN Ergebnis abgeleitet statt geraten:
    // genau so viel Platz, wie zwei geleerte Entwürfe brauchen.
    const maxLength = JSON.stringify({
      items: big.map((item, index) => (index < 2 ? { ...item, draft: undefined } : item)),
      count: 4,
    }).length
    const packed = packBrandGenerations(big, 4, { maxLength })
    expect(packed.json.length).toBeLessThanOrEqual(maxLength)
    // Die zwei ältesten haben ihren Entwurf verloren, die zwei jüngsten nicht —
    // und KEIN Eintrag ist verschwunden.
    expect(packed.items.map(item => item.draft === undefined)).toEqual([true, true, false, false])
    expect(packed.items).toHaveLength(4)
  })

  it('wirft erst Einträge weg, wenn auch ohne Entwürfe zu wenig Platz ist', () => {
    const packed = packBrandGenerations(many, 14, { maxLength: 600 })
    expect(packed.json.length).toBeLessThanOrEqual(600)
    expect(packed.items.length).toBeLessThan(BRAND_GENERATIONS_KEEP)
    expect(packed.count).toBe(14)
  })

  it('GEGENPROBE: ohne Deckel bliebe genau dieselbe Historie vollständig', () => {
    const big = Array.from({ length: 4 }, (_, index) => entry({
      generationId: `g${index}`, draft: 'x'.repeat(1_000),
    }))
    expect(packBrandGenerations(big, 4).items.every(item => typeof item.draft === 'string')).toBe(true)
  })

  it('rührt die Eingabe nicht an', () => {
    const source = [entry({ generationId: 'g0', draft: 'bleibt' })]
    packBrandGenerations(source, 1, { maxLength: 10 })
    expect(source[0]!.draft).toBe('bleibt')
  })
})

describe('Metadaten hinausgeben und Fassungen wiederfinden', () => {
  it('streift den Entwurf für die Detailantwort ab', () => {
    const stripped = stripBrandGenerationDrafts([entry({ generationId: 'g0', draft: 'geheim' })])
    expect(stripped[0]).not.toHaveProperty('draft')
    expect(stripped[0]!.generationId).toBe('g0')
  })

  it('findet den JÜNGSTEN Lauf mit demselben Idempotenzschlüssel', () => {
    const items = [
      entry({ generationId: 'g0', idempotencyKey: 'k1', draft: 'alt' }),
      entry({ generationId: 'g1', idempotencyKey: 'k2', draft: 'anderer' }),
      entry({ generationId: 'g2', idempotencyKey: 'k1', draft: 'neu' }),
    ]
    expect(findBrandGenerationByKey(items, 'k1')?.draft).toBe('neu')
  })

  it('GEGENPROBE: ohne Schlüssel und ohne Entwurf gibt es nichts wiederzuverwenden', () => {
    const items = [entry({ generationId: 'g0', idempotencyKey: 'k1' })]
    expect(findBrandGenerationByKey(items, undefined)).toBeNull()
    expect(findBrandGenerationByKey(items, 'k1')).toBeNull()
    expect(findBrandGenerationByKey(items, 'k9')).toBeNull()
  })
})
