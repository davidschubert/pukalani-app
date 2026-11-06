import { describe, expect, it } from 'vitest'
import {
  GEORGE_TURN_MARKERS,
  createGeorgeTurnScrubber,
  dropControlOptions,
  parseGeorgeConfirm,
  parseGeorgeOptions,
  parseGeorgeTurn,
  stripGeorgeTurnMarkers,
} from '../server/utils/georgeTurn'
import { BRAND_TURN_OPTION_LABEL_MAX } from '../shared/brandGeneration'

/**
 * DER ZUG-VERTRAG (george-a-4) — vier Aussagen, die ohne Beweis Glaubenssache
 * wären und deren Bruch man erst im Brand-Dokument sähe:
 *
 *  1. Der FELDWERT enthält keinen Marker. Ein „ASK: trifft das?" im Slot stünde
 *     wörtlich im fertigen Brand-Dokument.
 *  2. Der CHAT-Zug enthält die Rahmung — sonst war der ganze B2-Umbau umsonst
 *     und die Sprechblase zeigt wieder einen nackten Entwurf.
 *  3. OHNE Marker ist alles wie vorher (`george-a-3`). Das ist der
 *     Sicherheitsgurt: der schlimmste Fall dieses Umbaus ist der Stand von
 *     gestern, nie ein zerschnittener Entwurf.
 *  4. Der Strom-Putzer liefert ZERRISSEN dasselbe wie am Stück. Deltas kommen
 *     an beliebiger Stelle zerteilt an, und ein Marker, der über zwei Chunks
 *     fällt, ist der Normalfall, nicht die Ausnahme.
 */

const FRAMED = [
  'BASIS: Aus eurem Startbogen und der Antwort zur Ursprungsgeschichte.',
  'DRAFT:',
  'Wir rösten Kaffee in kleinen Mengen für Cafés auf Maui.',
  'Jede Charge wird von Hand abgeschmeckt.',
  'ASK: Trifft das, oder fehlt euch etwas Wesentliches?',
].join('\n')

describe('parseGeorgeTurn — Entwurf', () => {
  it('trennt Feldwert und Chat-Zug', () => {
    const turn = parseGeorgeTurn(FRAMED)
    expect(turn.outcome).toBe('draft')
    expect(turn.draft).toBe(
      'Wir rösten Kaffee in kleinen Mengen für Cafés auf Maui.\nJede Charge wird von Hand abgeschmeckt.',
    )
    // Der Zug rahmt: Basis, Entwurf, genau eine Frage.
    expect(turn.message).toBe(
      'Aus eurem Startbogen und der Antwort zur Ursprungsgeschichte.\n\n'
      + 'Wir rösten Kaffee in kleinen Mengen für Cafés auf Maui.\nJede Charge wird von Hand abgeschmeckt.\n\n'
      + 'Trifft das, oder fehlt euch etwas Wesentliches?',
    )
  })

  it('KEIN MARKER LANDET IM FELDWERT', () => {
    const turn = parseGeorgeTurn(FRAMED)
    // Über die REGISTRIERTE Liste, nicht über eine zweite Aufzählung: ein
    // sechster Marker wäre sonst hier ungedeckt und stünde im Brand-Dokument.
    for (const marker of GEORGE_TURN_MARKERS) {
      expect(turn.draft).not.toContain(marker)
      expect(turn.message).not.toContain(marker)
    }
  })

  it('nimmt auch Text, der direkt hinter DRAFT: steht', () => {
    expect(parseGeorgeTurn('BASIS: kurz\nDRAFT: Ein Satz.\nASK: passt?').draft).toBe('Ein Satz.')
  })

  it('hält eine mehrzeilige Liste zusammen — auch mit Bindestrichen', () => {
    const turn = parseGeorgeTurn([
      'BASIS: Aus eurer Website.',
      'DRAFT:',
      '- Kona Roasters - strong: Reichweite - weak: austauschbar',
      '- Maui Beans - assumption, please verify: kleine Röstmenge',
      'ASK: Fehlt jemand?',
    ].join('\n'))
    expect(turn.draft.split('\n')).toHaveLength(2)
    expect(turn.draft).toContain('assumption, please verify')
  })

  it('kommt ohne BASIS und ohne ASK aus — dann rahmt eben nichts', () => {
    const turn = parseGeorgeTurn('DRAFT:\nNur der Wert.')
    expect(turn.draft).toBe('Nur der Wert.')
    expect(turn.message).toBe('Nur der Wert.')
  })
})

describe('parseGeorgeTurn — Rückfrage (B3)', () => {
  it('erkennt QUESTION: und lässt den Feldwert LEER', () => {
    const turn = parseGeorgeTurn('QUESTION: Wen von euren Wettbewerbern nennt ihr selbst zuerst?')
    expect(turn).toEqual({
      outcome: 'question',
      draft: '',
      message: 'Wen von euren Wettbewerbern nennt ihr selbst zuerst?',
    })
  })

  it('nimmt auch eine mehrzeilige Rückfrage mit', () => {
    const turn = parseGeorgeTurn('QUESTION: Zwei Namen reichen mir.\nWelche fallen euch zuerst ein?')
    expect(turn.outcome).toBe('question')
    expect(turn.message).toBe('Zwei Namen reichen mir.\nWelche fallen euch zuerst ein?')
  })

  it('EIN ENTWURF SCHLÄGT EINE FRAGE: schickt das Modell beides, gilt der Entwurf', () => {
    // Die verlässlichere Auskunft gewinnt — eine Frage neben einem fertigen
    // Entwurf hiesse sonst, den Entwurf wegzuwerfen, für den bezahlt wurde.
    const turn = parseGeorgeTurn('QUESTION: unsicher?\nDRAFT:\nTrotzdem ein Wert.')
    expect(turn.outcome).toBe('draft')
    expect(turn.draft).toBe('Trotzdem ein Wert.')
  })
})

describe('parseGeorgeTurn — der Rückfall auf george-a-3', () => {
  it('OHNE MARKER ist der ganze Text Entwurf UND Zug', () => {
    const turn = parseGeorgeTurn('Wir rösten Kaffee in kleinen Mengen.')
    expect(turn).toEqual({
      outcome: 'draft',
      draft: 'Wir rösten Kaffee in kleinen Mengen.',
      message: 'Wir rösten Kaffee in kleinen Mengen.',
    })
  })

  it('leerer Text bleibt leer — die Route macht daraus `empty_result`', () => {
    expect(parseGeorgeTurn('   \n  ')).toEqual({ outcome: 'draft', draft: '', message: '' })
  })

  it('ein Marker MITTEN im Satz ist keiner', () => {
    const turn = parseGeorgeTurn('Wir fragen: ASK: ist ein Wort in diesem Satz.')
    expect(turn.draft).toBe('Wir fragen: ASK: ist ein Wort in diesem Satz.')
  })

  it('versteht auch CRLF — Windows-Zeilenenden kommen von echten Anbietern', () => {
    expect(parseGeorgeTurn('BASIS: x\r\nDRAFT:\r\nWert\r\nASK: ja?').draft).toBe('Wert')
  })
})

describe('stripGeorgeTurnMarkers', () => {
  it('nimmt die Etiketten weg und lässt die DRAFT-Trennzeile ganz verschwinden', () => {
    expect(stripGeorgeTurnMarkers(FRAMED)).toBe([
      'Aus eurem Startbogen und der Antwort zur Ursprungsgeschichte.',
      'Wir rösten Kaffee in kleinen Mengen für Cafés auf Maui.',
      'Jede Charge wird von Hand abgeschmeckt.',
      'Trifft das, oder fehlt euch etwas Wesentliches?',
    ].join('\n'))
  })

  it('lässt Text ohne Marker unangetastet', () => {
    expect(stripGeorgeTurnMarkers('einfach nur Text\nzweite Zeile')).toBe('einfach nur Text\nzweite Zeile')
  })

  it('nimmt eine OPTION-Zeile GANZ weg — sie ist ein Knopf, kein Satz', () => {
    // Der Unterschied zu BASIS/ASK ist die eigentliche Aussage: bliebe die
    // Beschriftung als loser Satz stehen, stünde sie zweimal da — einmal als
    // Text, einmal auf dem Knopf.
    expect(stripGeorgeTurnMarkers('Was passt besser?\nOPTION: Der Handwerker\nOPTION: Der Mentor'))
      .toBe('Was passt besser?')
  })
})

/**
 * DIE ANTWORT-MÖGLICHKEITEN (Davids Anforderung 2026-09-04) — vier Aussagen,
 * deren Bruch man erst an der Bühne sähe:
 *
 *  1. Zwei oder drei Beschriftungen werden zu Chips, der Text verliert die
 *     Zeilen — sonst steht der Marker-Vertrag roh in der Sprechblase.
 *  2. EINE Möglichkeit ist keine Wahl: ein einzelner Knopf läse sich als
 *     Zustimmung, obwohl George eine Alternative gemeint hat.
 *  3. Die Zeilen gehen AUCH dann, wenn die Wahl verworfen wird.
 *  4. Ein Marker mitten im Satz ist keiner — dieselbe Regel wie bei den vier
 *     anderen.
 */
describe('parseGeorgeOptions', () => {
  it('zieht zwei Möglichkeiten heraus und lässt den Zug ohne sie stehen', () => {
    const turn = parseGeorgeOptions([
      'Das trage ich mit. Was passt besser zu euch?',
      'OPTION: Der Handwerker',
      'OPTION: Der Mentor',
    ].join('\n'))
    expect(turn.options).toEqual(['Der Handwerker', 'Der Mentor'])
    expect(turn.message).toBe('Das trage ich mit. Was passt besser zu euch?')
  })

  it('nimmt auch drei', () => {
    const turn = parseGeorgeOptions('Was davon?\nOPTION: A\nOPTION: B\nOPTION: C')
    expect(turn.options).toEqual(['A', 'B', 'C'])
  })

  it('nimmt HÖCHSTENS drei — vier wären ein Formular', () => {
    const turn = parseGeorgeOptions('Was davon?\nOPTION: A\nOPTION: B\nOPTION: C\nOPTION: D')
    expect(turn.options).toEqual(['A', 'B', 'C'])
    // Und die vierte Zeile ist trotzdem aus dem Text verschwunden.
    expect(turn.message).toBe('Was davon?')
  })

  it('EINE Möglichkeit ist keine Wahl — Optionen leer, Zeile trotzdem weg', () => {
    const turn = parseGeorgeOptions('Passt der Handwerker?\nOPTION: Der Handwerker')
    expect(turn.options).toEqual([])
    expect(turn.message).toBe('Passt der Handwerker?')
  })

  it('verwirft leere Beschriftungen — und kippt damit auch die Wahl', () => {
    const turn = parseGeorgeOptions('Was davon?\nOPTION: Der Mentor\nOPTION:   ')
    expect(turn.options).toEqual([])
    expect(turn.message).toBe('Was davon?')
  })

  it('klemmt eine zu lange Beschriftung — ein Chip passt in EINE Zeile', () => {
    const long = 'x'.repeat(BRAND_TURN_OPTION_LABEL_MAX + 40)
    const turn = parseGeorgeOptions(`Was davon?\nOPTION: ${long}\nOPTION: kurz`)
    expect(turn.options[0]).toHaveLength(BRAND_TURN_OPTION_LABEL_MAX)
    expect(turn.options[1]).toBe('kurz')
  })

  it('ein OPTION mitten im Satz ist keins', () => {
    const turn = parseGeorgeOptions('Wir schreiben OPTION: als Wort in diesen Satz.')
    expect(turn.options).toEqual([])
    expect(turn.message).toBe('Wir schreiben OPTION: als Wort in diesen Satz.')
  })

  it('OHNE OPTION-Zeilen bleibt alles, wie es war (Rückwärts-Vertrag)', () => {
    const turn = parseGeorgeOptions('Das nehme ich mit. Was loben eure Kunden?')
    expect(turn).toEqual({ message: 'Das nehme ich mit. Was loben eure Kunden?', options: [] })
  })

  it('versteht CRLF — Windows-Zeilenenden kommen von echten Anbietern', () => {
    const turn = parseGeorgeOptions('Was davon?\r\nOPTION: A\r\nOPTION: B')
    expect(turn.options).toEqual(['A', 'B'])
  })
})

/**
 * `CONFIRM:` — DER SECHSTE MARKER (Davids Entscheidung 2026-09-09,
 * Session-Abschluss).
 *
 * Dieselben drei Zusagen wie bei `OPTION:`, weil es derselbe Vertragstyp ist:
 * er ist ein BEDIENELEMENT, er fällt aus dem Feldtext, und er fällt aus dem
 * Chat. Die vierte ist neu und trägt die Produktentscheidung: WAS hinter dem
 * Doppelpunkt steht, wird nicht gelesen — die Beschriftungen gehören dem
 * Locale-Katalog, ein vom Modell geschriebenes Etikett wäre in der zweiten
 * Sprache erfunden.
 */
describe('parseGeorgeConfirm', () => {
  it('erkennt die Zeile und lässt den Zug ohne sie stehen', () => {
    const turn = parseGeorgeConfirm([
      'Das trägt für mich. Sag Bescheid, wenn du magst.',
      'CONFIRM:',
    ].join('\n'))
    expect(turn.confirm).toBe(true)
    expect(turn.message).toBe('Das trägt für mich. Sag Bescheid, wenn du magst.')
  })

  it('liest keine Beschriftung — der Knopf gehört dem Katalog', () => {
    const turn = parseGeorgeConfirm('Passt das?\nCONFIRM: Ja bitte eintragen')
    expect(turn.confirm).toBe(true)
    expect(turn.message).toBe('Passt das?')
  })

  it('zwei Zeilen sind eine Wahl — und beide verschwinden', () => {
    const turn = parseGeorgeConfirm('Passt das?\nCONFIRM:\nCONFIRM:')
    expect(turn.confirm).toBe(true)
    expect(turn.message).toBe('Passt das?')
  })

  it('ein CONFIRM mitten im Satz ist keins', () => {
    const turn = parseGeorgeConfirm('Wir schreiben CONFIRM: als Wort in diesen Satz.')
    expect(turn.confirm).toBe(false)
    expect(turn.message).toBe('Wir schreiben CONFIRM: als Wort in diesen Satz.')
  })

  it('OHNE die Zeile bleibt alles, wie es war (Rückwärts-Vertrag)', () => {
    expect(parseGeorgeConfirm('Was loben eure Kunden?'))
      .toEqual({ message: 'Was loben eure Kunden?', confirm: false })
  })

  it('versteht CRLF', () => {
    expect(parseGeorgeConfirm('Passt das?\r\nCONFIRM:').confirm).toBe(true)
  })

  it('FÄLLT AUS FELDTEXT UND CHAT — wie jedes andere Bedienelement', () => {
    // Der Entwurfs-Fall kennt gar keine Bestätigungs-Zeile; schriebe das Modell
    // trotzdem eine, stünde sie sonst wörtlich im Brand-Dokument.
    const turn = parseGeorgeTurn([
      'BASIS: Aus eurer Antwort.',
      'DRAFT:',
      'Wir rösten in kleinen Mengen.',
      'CONFIRM:',
      'ASK: Trifft das?',
    ].join('\n'))
    expect(turn.draft).toBe('Wir rösten in kleinen Mengen.')
    expect(turn.message).not.toContain('CONFIRM')
    expect(stripGeorgeTurnMarkers('Passt das?\nCONFIRM:')).toBe('Passt das?')
  })

  it('der Strom-Putzer hält die angebrochene Zeile zurück', () => {
    // „C" könnte noch ein `CONFIRM:` werden — flösse es als Text durch, müsste
    // es eine Zeichenkette später wieder verschwinden, und Deltas kennen kein
    // Zurück.
    const scrub = createGeorgeTurnScrubber()
    expect(scrub('Passt das?\n')).toBe('Passt das?\n')
    expect(scrub('C')).toBe('')
    expect(scrub('ONFIRM:')).toBe('')
  })
})

/**
 * DER STROM-PUTZER. Gemessen wird gegen die Fassung am Stück — und zwar mit
 * ZUFÄLLIGEN Schnitten, weil ein Beweis mit hübschen Grenzen genau den Fall
 * nicht trifft, der in echt vorkommt.
 */
function stream(text: string, cut: (rest: string) => number): string {
  const scrub = createGeorgeTurnScrubber()
  let out = ''
  let rest = text
  while (rest.length > 0) {
    const size = Math.max(1, Math.min(cut(rest), rest.length))
    out += scrub(rest.slice(0, size))
    rest = rest.slice(size)
  }
  return out
}

describe('createGeorgeTurnScrubber', () => {
  it('liefert BUCHSTABENWEISE dasselbe wie am Stück', () => {
    expect(stream(FRAMED, () => 1)).toBe(stripGeorgeTurnMarkers(FRAMED))
  })

  it('liefert bei ZUFÄLLIGEN Schnitten dasselbe — 200 Läufe', () => {
    const expected = stripGeorgeTurnMarkers(FRAMED)
    for (let run = 0; run < 200; run += 1) {
      expect(stream(FRAMED, () => 1 + Math.floor(Math.random() * 7))).toBe(expected)
    }
  })

  it('ZEIGT ZU JEDEM ZEITPUNKT NUR EINEN PRÄFIX DES ENDTEXTS — und nie ein Etikett', () => {
    // Das ist die eigentliche Aussage: ein Delta kennt kein Zurück. Was einmal
    // in der Sprechblase stand, muss dort stehen bleiben dürfen — sonst
    // flackert der Text, sobald ein Marker vollständig wird.
    const expected = stripGeorgeTurnMarkers(FRAMED)
    const scrub = createGeorgeTurnScrubber()
    let shown = ''
    for (const letter of [...FRAMED]) {
      shown += scrub(letter)
      expect(expected.startsWith(shown), shown).toBe(true)
      expect(shown).not.toMatch(/(^|\n)(QUESTION:|BASIS:|DRAFT:|ASK:)/)
    }
    expect(shown).toBe(expected)
  })

  it('putzt auch die Rückfrage — der Marker gehört nicht in den Verlauf', () => {
    const text = 'QUESTION: Wen nennt ihr selbst zuerst?'
    expect(stream(text, () => 3)).toBe('Wen nennt ihr selbst zuerst?')
  })

  it('hält einen Text OHNE Marker nicht auf', () => {
    expect(stream('Wir rösten Kaffee.\nIn kleinen Mengen.', () => 2))
      .toBe('Wir rösten Kaffee.\nIn kleinen Mengen.')
  })

  it('LÄSST KEINE OPTION-ZEILE IN DEN STROM — auch nicht buchstabenweise', () => {
    // Der Fall, den man beim Umbauen verliert: die Beschriftung tröpfelt in die
    // Sprechblase und verschwindet dort NIE wieder (Deltas kennen kein Zurück).
    const text = 'Was passt besser?\nOPTION: Der Handwerker\nOPTION: Der Mentor'
    const scrub = createGeorgeTurnScrubber()
    let shown = ''
    for (const letter of [...text]) {
      shown += scrub(letter)
      expect(shown).not.toContain('OPTION')
      expect(shown).not.toContain('Handwerker')
    }
    expect(shown.trim()).toBe('Was passt besser?')
  })
})

/**
 * KEIN ZWEITES PAAR KNÖPFE FÜR DIESELBE ENTSCHEIDUNG (Testlauf-Befund D,
 * 2026-09-09).
 *
 * Der Auftrag nennt dem Modell die Beschriftung des Bestätigen-Knopfes — und
 * das Modell schrieb sie als `OPTION:`-Zeilen mit. Der Chip ist aber eine
 * ANTWORT: sein Klick schreibt seinen Text in das Feld. Im Live-Test landete
 * so „Ich ergänze noch etwas" als Wert in einer Session.
 */
describe('dropControlOptions', () => {
  const LABELS = ['Passt so, bestätigen', 'Ich ergänze noch etwas']

  it('wirft eine Option weg, die den Bestätigen-Knopf nachbaut (D)', () => {
    expect(dropControlOptions(['Passt so, bestätigen', 'Der Handwerker'], LABELS))
      .toEqual(['Der Handwerker'])
  })

  it('… und den zweiten Knopf ebenso', () => {
    expect(dropControlOptions(['Ich ergänze noch etwas', 'Der Gastgeber'], LABELS))
      .toEqual(['Der Gastgeber'])
  })

  it('grosszügig bei Satzzeichen und Grossschreibung, streng beim Wortlaut', () => {
    expect(dropControlOptions(['passt so — bestätigen!', 'Der Handwerker'], LABELS))
      .toEqual(['Der Handwerker'])
    // Eine Option, die etwas ANDERES sagt, bleibt eine Antwort.
    expect(dropControlOptions(['Passt so wie es ist', 'Der Handwerker'], LABELS))
      .toEqual(['Passt so wie es ist', 'Der Handwerker'])
  })

  it('ohne Beschriftungen ändert sie nichts (fehlender Locale-Eintrag)', () => {
    expect(dropControlOptions(['Passt so, bestätigen'], ['', '  '])).toEqual(['Passt so, bestätigen'])
    expect(dropControlOptions(['Passt so, bestätigen'], [])).toEqual(['Passt so, bestätigen'])
  })

  it('lässt die Liste sonst unangetastet — Reihenfolge inklusive', () => {
    expect(dropControlOptions(['A', 'B', 'C'], LABELS)).toEqual(['A', 'B', 'C'])
  })
})
