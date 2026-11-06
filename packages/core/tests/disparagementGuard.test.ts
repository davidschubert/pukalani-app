import { describe, expect, it } from 'vitest'
import {
  NAME_TOKEN_MIN,
  checkGuardedTexts,
  createDisparagementGuard,
  normalizeForFilter,
} from '../shared/disparagementGuard'

/**
 * DER § 6 UWG-RIEGEL (core/shared/disparagementGuard.ts) — mit GEGENPROBE an
 * jeder Stelle. Er lag bis BI1 I1a im market-Layer; die Prüfungen sind
 * MITGEZOGEN und nicht neu geschrieben, damit der Umzug nichts verändert
 * haben kann.
 *
 * Ein Filter, der nur zeigt, dass er etwas fängt, sagt nichts: er könnte
 * ALLES fangen und wäre dann kein Filter, sondern ein Aus-Schalter. Jede
 * Prüfung hier hat deshalb ein Paar — ein Satz, der fällt, und einer, der
 * stehen bleiben MUSS.
 */

const KANDIDATEN = [
  { name: 'Pacific Bean Supply', url: 'https://pacificbean.example/' },
  { name: 'Upcountry Roast Co.', url: 'https://www.upcountry-roast.example/' },
  { name: 'Müller Rösterei GmbH', url: 'https://mueller-roesterei.de/' },
]

const guard = createDisparagementGuard(KANDIDATEN)

describe('normalizeForFilter', () => {
  it('zieht Umlaut und Umschreibung auf DIESELBE Form', () => {
    expect(normalizeForFilter('Müller')).toBe(normalizeForFilter('Mueller'))
    expect(normalizeForFilter('Grösse')).toBe(normalizeForFilter('Groesse'))
    expect(normalizeForFilter('Café')).toBe('cafe')
  })

  it('macht aus Satzzeichen Trenner, nicht Buchstaben', () => {
    expect(normalizeForFilter('Upcountry-Roast, Co.')).toBe('upcountry roast co')
  })
})

describe('Wettbewerber-Namen', () => {
  /**
   * WELCHER GRUND gemeldet wird, ist zweitrangig — verworfen ist verworfen.
   * Ein Name, der auch als Domain-Label vorkommt (`pacificbean.example`),
   * schlägt zuerst dort an; der Zähler im Log trennt die beiden Wege, das
   * Ergebnis für den Kunden ist dasselbe. Nur wo GENAU EIN Weg feuern kann,
   * steht hier ein exakter Grund.
   */
  it('fängt den vollen Namen', () => {
    expect(guard.check('Schreibt es anders als Pacific Bean Supply.')).not.toBeNull()
  })

  it('fängt ein Namens-TEIL ab vier Zeichen', () => {
    // „Pacific" allein macht den Dritten erkennbar.
    expect(guard.check('Anders als Pacific klingt eure Zeile konkreter.')).toBe('competitor_name')
    expect(guard.check('Upcountry sagt dasselbe.')).toBe('competitor_name')
  })

  it('fängt einen Namen mit Umlaut auch in der Umschreibung', () => {
    // Beides muss fallen — sonst wäre der Filter mit einer Tastatur-
    // Umschreibung zu umgehen.
    expect(guard.check('Anders als Mueller Roesterei.')).not.toBeNull()
    expect(guard.check('Anders als Müller Rösterei.')).not.toBeNull()
    // Der reine NAME ohne Domain-Entsprechung: hier kann nur der Namensweg
    // feuern, also steht der Grund exakt da.
    expect(guard.check('Anders als Rösterei Müller.')).not.toBeNull()
  })

  it('fängt den zusammengezogenen Namen (Hashtag, Adresszeile)', () => {
    expect(guard.check('Nicht wie PacificBean.')).not.toBeNull()
    // Ein Name OHNE Domain-Entsprechung, zusammengezogen — nur der Namensweg.
    const nurName = createDisparagementGuard([{ name: 'Kailua Coffee' }])
    expect(nurName.check('Nicht wie KailuaCoffee klingen.')).toBe('competitor_name')
  })

  it('GEGENPROBE: kurze Teile unter der Schwelle sperren nichts', () => {
    // `Co.` ist zwei Zeichen und steht in KEINER Sperrliste-Position; ein Satz
    // mit „Co" muss durchgehen, sonst fiele jede Firmenbezeichnung.
    expect(NAME_TOKEN_MIN).toBe(4)
    expect(guard.check('Sagt, was ihr Co Working besonders macht.')).toBeNull()
  })

  it('GEGENPROBE: Rechtsformen identifizieren niemanden', () => {
    expect(guard.check('Nennt eure GmbH nicht in der ersten Zeile.')).toBeNull()
  })

  /**
   * DIE NACHSCHÄRFUNG AUS MV1 M4 (Befund aus M3).
   *
   * Bis M3 sperrte JEDES Namens-Token ab vier Zeichen. Für „Pacific Bean
   * Supply" hiess das: `supply` war in jedem Vorschlag verboten, und in der
   * Kaffee-Welt `coffee` — also ausgerechnet das Wort, um das es geht. Der
   * Riegel verwarf damit systematisch die brauchbarsten Befunde.
   *
   * Neue Regel: gesperrt sind der volle Name, die Domain und die
   * UNTERSCHEIDENDEN Tokens. Generische Kategorie- und Branchenwörter sind es
   * nicht — und die eigenen bestätigten Texte des Kunden auch nicht.
   */
  it('lässt generische Branchenwörter aus einem Namen durch (M4)', () => {
    // `supply` steht in der generischen Liste; der Name selbst bleibt gesperrt.
    expect(guard.check('Die Supply chain ist nicht euer Thema.')).toBeNull()
    expect(guard.check('Schreibt es anders als Pacific Bean Supply.')).not.toBeNull()
  })

  it('sperrt „Kailua", lässt „coffee" (M4, der Anlass-Fall)', () => {
    const kaffee = createDisparagementGuard([{ name: 'Kailua Coffee' }])
    expect(kaffee.check('Sagt, wie euer coffee geröstet wird.')).toBeNull()
    expect(kaffee.check('Anders als Kailua klingt eure Zeile konkreter.')).toBe('competitor_name')
    expect(kaffee.check('Nicht wie Kailua Coffee klingen.')).toBe('competitor_name')
  })

  it('ein EIN-WORT-Name bleibt gesperrt, auch wenn er kurz ist (M4)', () => {
    const nike = createDisparagementGuard([{ name: 'Nike' }])
    expect(nike.check('Sagt es klarer als Nike.')).toBe('competitor_name')
  })

  it('die eigenen bestätigten Texte entschärfen die Sperre (M4)', () => {
    const ohne = createDisparagementGuard([{ name: 'Bergwerk Studio' }])
    // Ohne eigene Texte ist `bergwerk` unterscheidend — und gesperrt.
    expect(ohne.check('Euer Bergwerk-Vergleich trägt nicht.')).toBe('competitor_name')

    // GEGENPROBE: sagt der Kunde selbst „Bergwerk" über seine Kategorie, ist
    // das Wort keine Kennzeichnung eines Dritten mehr.
    const mit = createDisparagementGuard([{ name: 'Bergwerk Studio' }], {
      ownTexts: ['Wir bauen Marken für das Bergwerk von morgen.'],
    })
    expect(mit.check('Euer Bergwerk-Vergleich trägt nicht.')).toBeNull()
    // Der volle Name bleibt trotzdem gesperrt.
    expect(mit.check('Anders als Bergwerk Studio.')).toBe('competitor_name')
  })

  it('GEGENPROBE: ein harmloser Vorschlag bleibt stehen', () => {
    expect(guard.check(
      'Setzt die Wochentags-Lieferung in den ersten Satz der Startseite.',
    )).toBeNull()
  })
})

describe('Domains', () => {
  it('fängt die volle Domain', () => {
    expect(guard.check('Siehe pacificbean.example für den Vergleich.')).toBe('competitor_domain')
  })

  it('fängt ein Domain-LABEL ohne Endung', () => {
    expect(guard.check('Der Auftritt von upcountry-roast ist anders gebaut.'))
      .toBe('competitor_domain')
  })

  it('fängt die Domain trotz www davor', () => {
    expect(guard.check('www.upcountry-roast.example zeigt es.')).toBe('competitor_domain')
  })

  it('GEGENPROBE: die Endung allein sperrt nicht', () => {
    // Wäre `example` gesperrt, fiele jeder Satz mit „zum Beispiel" im
    // englischen Text — und `.de` sperrte die halbe Sprache.
    expect(guard.check('For example, name the weekday in your first line.')).toBeNull()
  })
})

describe('Herabsetzung', () => {
  it('fängt deutsche Ausdrücke', () => {
    expect(guard.check('Die anderen wirken veraltet.')).toBe('disparagement')
    expect(guard.check('Das ist reine Abzocke.')).toBe('disparagement')
  })

  it('fängt englische Ausdrücke', () => {
    expect(guard.check('Their sites are cheap and outdated.')).toBe('disparagement')
    expect(guard.check('Anything beats these inferior offers.')).toBe('disparagement')
  })

  it('schlägt den Namens-Treffer, wenn ein Satz beides ist', () => {
    // Die schärfere Meldung gewinnt — sie ist der schwerere Vorwurf.
    expect(guard.check('Pacific ist schlecht gemacht.')).toBe('disparagement')
  })

  it('GEGENPROBE: eine sachliche Beschreibung bleibt stehen', () => {
    expect(guard.check(
      'Zwei andere im Feld sagen dasselbe mit eigenen Worten.',
    )).toBeNull()
    expect(guard.check(
      'Two other sites in the field make the same promise.',
    )).toBeNull()
  })
})

describe('checkGuardedTexts', () => {
  it('nimmt den GANZEN Befund, wenn EIN Teil fällt', () => {
    // Der Vorschlag ist der Satz, den der Kunde am Ende verwendet — ein Befund
    // mit gestrichenem Vorschlag wäre ein halber Befund.
    expect(checkGuardedTexts(guard, [
      'Euer Satz klingt wie zwei andere im Feld.',
      'Grenzt euch von Pacific ab.',
    ])).toBe('competitor_name')
  })

  it('lässt einen sauberen Befund durch — beide Teile', () => {
    expect(checkGuardedTexts(guard, [
      'Euer Satz klingt wie zwei andere im Feld.',
      'Schärft ihn mit dem Teil, den nur ihr macht.',
    ])).toBeNull()
  })

  it('überspringt leere Teile, statt an ihnen zu scheitern', () => {
    expect(checkGuardedTexts(guard, ['', undefined, 'Alles in Ordnung hier.'])).toBeNull()
  })
})

describe('die Sperrliste selbst', () => {
  it('enthält keine Endungen und keine Rechtsformen', () => {
    expect(guard.nameTokens.has('gmbh')).toBe(false)
    expect(guard.domainTokens.has('example')).toBe(false)
    expect(guard.domainTokens.has('de')).toBe(false)
  })

  it('enthält die Namen und Domains, die es geben soll', () => {
    expect(guard.nameTokens.has('pacific')).toBe(true)
    expect(guard.domainTokens.has('pacificbean example')).toBe(true)
  })

  it('ist LEER ohne Kandidaten — dann fängt nur die Wortliste', () => {
    const leer = createDisparagementGuard([])
    expect(leer.nameTokens.size).toBe(0)
    expect(leer.check('Pacific Bean Supply sagt das auch.')).toBeNull()
    expect(leer.check('Das ist billig gemacht.')).toBe('disparagement')
  })
})
