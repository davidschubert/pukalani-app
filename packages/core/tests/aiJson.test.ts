import { describe, expect, it } from 'vitest'
import { extractJsonObject, parseModelJson, repairModelJson } from '../shared/aiJson'

/**
 * DIE REGEL AUS BI4 (2026-11-08) — und ihre Gegenproben.
 *
 * Die Vorlagen in `describe('die gemessenen Fehlschläge')` sind WÖRTLICHE
 * Ausschnitte aus echten Läufen gegen `anthropic/claude-haiku-4.5` vom
 * 2026-11-08 (4 von 52 Läufen). Sie sind der eigentliche Beweis: jede dieser
 * Antworten war vollständig, bezahlt — und ohne diese Datei verloren.
 *
 * Die andere Hälfte wiegt genauso schwer: gültiges JSON darf die Reparatur
 * NICHT anfassen. Sie läuft im Betrieb nur nach einem gescheiterten
 * `JSON.parse`, aber eine Regel, die aus gültigem Text etwas anderes macht,
 * wäre eine Zeitbombe für die nächste Aufrufstelle.
 */

interface Draft { title: string, dek: string, body: string }

describe('repairModelJson — lässt gültiges JSON in Ruhe', () => {
  it('gibt gültiges JSON zeichengleich zurück', () => {
    const valid = JSON.stringify({
      title: 'Ein Titel mit „typografischen" Zeichen',
      dek: 'Zeilen\numbruch und ein escaptes \\" Zitat',
      body: '## Überschrift\n\n- Punkt\n- Punkt\n\nEin Link: [a](https://example.org)',
    })
    expect(repairModelJson(valid)).toBe(valid)
    expect(JSON.parse(repairModelJson(valid))).toEqual(JSON.parse(valid))
  })

  it('fasst escapte Anführungszeichen und Backslashes nicht an', () => {
    const valid = '{"body":"er sagte \\"Hallo\\" und ging\\\\"}'
    expect(repairModelJson(valid)).toBe(valid)
  })

  it('ist idempotent — zweimal reparieren ändert nichts mehr', () => {
    const broken = '{"body":"die Wortmarke „Adidas" erscheint im Abspann"}'
    const once = repairModelJson(broken)
    expect(repairModelJson(once)).toBe(once)
  })
})

describe('repairModelJson — die gemessenen Fehlschläge (BI4)', () => {
  // Alle vier: `„Wort"` — deutsches Anführungszeichen auf, ASCII-" zu.
  const cases: Readonly<Record<string, string>> = {
    'Adidas im Abspann': 'In elf von vierzehn Einstellungen steht das Symbol allein im Bild. Die Wortmarke „Adidas" erscheint ausschließlich im Abspann.',
    'zwei Zitate in einem Satz': '**Sprachübergreifend.** Eine Wortmarke ist an Sprache gebunden – „Adidas" ist ein deutsches Wort, „Nike" ein englisches.',
    'Gedankenstrich danach': 'Die Marke zeigt in einer neuen Kampagne die drei Streifen ohne das Wort „Adidas" — das Erkennungszeichen muss allein tragen.',
    'Swoosh allein': 'Den Weg, den Nike seit Jahren konsequent beschreitet: Der Swoosh steht allein, das Wort „Nike" tritt in den Hintergrund.',
  }

  for (const [name, body] of Object.entries(cases)) {
    it(`holt „${name}" zurück`, () => {
      const broken = `{"title": "Das Symbol trägt allein", "dek": "Ein Vorspann.", "body": "${body}"}`
      expect(() => JSON.parse(broken)).toThrow()

      const parsed = parseModelJson<Draft>(broken)
      expect(parsed).not.toBeNull()
      expect(parsed?.repaired).toBe(true)
      // Der Text kommt UNVERÄNDERT zurück — inklusive beider Anführungszeichen.
      expect(parsed?.value.body).toBe(body)
      expect(parsed?.value.title).toBe('Das Symbol trägt allein')
    })
  }

  it('trägt auch den Zaun und mehrere Fehler in einer Antwort', () => {
    const raw = '```json\n{"title": "Marke „X" im Test", "dek": "Das Wort „Y" fehlt", "body": "Drittens „Z" auch."}\n```'
    const parsed = parseModelJson<Draft>(raw)
    expect(parsed?.repaired).toBe(true)
    expect(parsed?.value.title).toBe('Marke „X" im Test')
    expect(parsed?.value.dek).toBe('Das Wort „Y" fehlt')
    expect(parsed?.value.body).toBe('Drittens „Z" auch.')
  })
})

describe('repairModelJson — die Grenze zwischen Prosa und Struktur', () => {
  it('schliesst am Komma, wenn dahinter ein Schlüssel folgt', () => {
    const parsed = parseModelJson<{ a: string, b: string }>('{"a": "eins", "b": "zwei"}')
    expect(parsed?.repaired).toBe(false)
    expect(parsed?.value).toEqual({ a: 'eins', b: 'zwei' })
  })

  it('schliesst NICHT am Komma, wenn dahinter Prosa folgt', () => {
    // Genau der Fall, an dem die naive Regel „Komma schliesst" einen
    // fertigen Artikel zerschnitten hätte.
    const broken = '{"body": "er sagte "Hallo", und ging dann"}'
    const parsed = parseModelJson<{ body: string }>(broken)
    expect(parsed?.repaired).toBe(true)
    expect(parsed?.value.body).toBe('er sagte "Hallo", und ging dann')
  })

  it('hält ein Array mit mehreren Strings zusammen', () => {
    const parsed = parseModelJson<{ xs: string[] }>('{"xs": ["a", "b", "c"]}')
    expect(parsed?.repaired).toBe(false)
    expect(parsed?.value.xs).toEqual(['a', 'b', 'c'])
  })

  it('reicht verschachtelte Objekte unverändert durch', () => {
    const parsed = parseModelJson<{ items: { id: string }[] }>('{"items":[{"id":"a1"},{"id":"a2"}]}')
    expect(parsed?.repaired).toBe(false)
    expect(parsed?.value.items).toHaveLength(2)
  })
})

describe('repairModelJson — rohe Steuerzeichen', () => {
  it('escapt einen echten Zeilenumbruch im String', () => {
    const broken = '{"body": "erste Zeile\nzweite Zeile"}'
    expect(() => JSON.parse(broken)).toThrow()
    const parsed = parseModelJson<{ body: string }>(broken)
    expect(parsed?.repaired).toBe(true)
    expect(parsed?.value.body).toBe('erste Zeile\nzweite Zeile')
  })

  it('lässt Leerraum ZWISCHEN den Werten unangetastet', () => {
    const parsed = parseModelJson<{ a: string }>('{\n  "a": "x"\n}')
    expect(parsed?.repaired).toBe(false)
    expect(parsed?.value.a).toBe('x')
  })
})

describe('parseModelJson — wo nichts zu retten ist', () => {
  it('gibt null für eine abgeschnittene Antwort', () => {
    // Das ist der `finish_reason: 'length'`-Fall: KEINE Reparatur klebt hier
    // ein Ende an, der Transport soll ihn stattdessen BENENNEN.
    expect(parseModelJson('{"title": "Anfang", "body": "Der Text bricht mitten')).toBeNull()
  })

  it('gibt null für eine Antwort ohne JSON', () => {
    expect(parseModelJson('Ich kann diese Anfrage nicht bearbeiten.')).toBeNull()
  })

  it('gibt null für leeren Text', () => {
    expect(parseModelJson('')).toBeNull()
  })
})

describe('extractJsonObject — unverändert aus aiComplete.ts übernommen', () => {
  it('nimmt das ÄUSSERE Objekt, nicht das erste innere Ende', () => {
    const raw = '{"items":[{"id":"a1"},{"id":"a2"}]}'
    expect(extractJsonObject(raw)).toBe(raw)
  })

  it('schneidet Zaun und Plauderei weg', () => {
    expect(extractJsonObject('Klar! ```json\n{"a":1}\n``` Viel Erfolg.')).toBe('{"a":1}')
  })

  it('gibt bei fehlendem Objekt den getrimmten Text', () => {
    expect(extractJsonObject('  kein json  ')).toBe('kein json')
    expect(extractJsonObject('} {')).toBe('} {')
  })
})
