import type { MarketLibraryEntry } from '../../shared/marketLibrary'

/**
 * DIE ZWEI ERFUNDENEN EINTRÄGE — ab jetzt TESTDATEN, nicht mehr Produkt
 * (MV1 M6b, 2026-09-06).
 *
 * ── WARUM SIE HIER LIEGEN UND NICHT MEHR IN `shared/library/index.ts` ─────
 * Sie standen dort als Platzhalter, solange die Mechanik ohne Inhalt lief
 * (M3/M4). Seit dem Gate-Flip läuft der Marktvergleich in PRODUKTION, und
 * damit wurden aus Platzhaltern zwei Marken, die es nicht gibt — angeboten im
 * Quellen-Wähler eines zahlenden Kunden, mit `status: 'verified'` und einem
 * Handzeichen, das niemand geleistet hat. Erfundene Marken vor Kunden sind
 * falsch; als PRÜFLING sind dieselben Zeilen weiterhin richtig, weil sie die
 * Form vollständig abdecken (Feld mit Zitat, Feld ohne Zitat, Liste, mehrere
 * Quellseiten) ohne eine Aussage über einen Dritten zu treffen.
 *
 * ── WARUM ES KEINEN INJEKTIONSPUNKT IN `marketLibrary()` GIBT ─────────────
 * Naheliegend wäre ein `marketLibraryFrom(entries)`, das der Test mit diesen
 * Daten füttert. Es wird NICHT gebraucht, und genau das ist der Grund, es
 * nicht zu bauen: die beiden Dinge, die hier geprüft werden, sind ohnehin
 * schon offen — `marketLibrarySchema` nimmt eine beliebige Eintragsliste
 * entgegen, und `marketLibraryFields()` ist eine reine Abbildung EINES
 * Eintrags auf Marktprofil-Felder. Ein zweiter Einstieg in die Bibliothek
 * wäre Produktionscode, der nur im Test vorkommt — und zugleich der eine Weg,
 * auf dem eine ungeprüfte Eintragsliste doch noch in einen Betriebspfad
 * geriete. Was `marketLibrary()` selbst tut (die AUSGELIEFERTE Datei lesen,
 * fail-closed), ist keine Frage von Testdaten: dort ist die echte Datei der
 * Prüfling.
 */
export const MARKET_LIBRARY_FIXTURE_ENTRIES: readonly MarketLibraryEntry[] = [
  {
    key: 'demo-atlas-roasters',
    status: 'verified',
    name: 'Atlas Roasters',
    homepage: 'https://atlas-roasters.example',
    category: 'Kaffeerösterei',
    verifiedAt: '2026-09-05',
    verifiedBy: 'MV1 M3 (Testeintrag)',
    fields: [
      {
        fieldId: 'categoryLanguage',
        value: 'Specialty coffee roastery',
        sourceUrl: 'https://atlas-roasters.example/about',
        quote: 'Atlas Roasters is a specialty coffee roastery.',
        confidence: 'stated',
      },
      {
        // MIT Häufigkeit: das Feld steht auf zwei der drei gelesenen Seiten.
        // Es ist der Prüfling für die Durchreiche in `marketLibraryFields()`
        // (M6b) — ohne einen solchen Eintrag wäre der „ohne Häufigkeit"-Test
        // immer grün, egal was die Abbildung tut.
        fieldId: 'pitch',
        value: 'Single-origin coffee, roasted to order and shipped the same week.',
        sourceUrl: 'https://atlas-roasters.example',
        quote: 'Single-origin coffee, roasted to order and shipped the same week.',
        confidence: 'stated',
        frequency: { pages: 2, of: 3 },
      },
      {
        fieldId: 'audience',
        value: 'Independent cafes and their regulars',
        sourceUrl: 'https://atlas-roasters.example',
        quote: 'We roast for independent cafes and the people who sit in them.',
        confidence: 'stated',
      },
      {
        fieldId: 'firstChoice',
        value: 'Roasting to order instead of to stock',
        sourceUrl: 'https://atlas-roasters.example/about',
        quote: 'We roast to order, never to stock.',
        confidence: 'stated',
      },
      {
        fieldId: 'values',
        value: 'Origin, Craft, Patience',
        items: ['Origin', 'Craft', 'Patience'],
        sourceUrl: 'https://atlas-roasters.example/about',
        quote: 'Origin, craft and patience. In that order.',
        confidence: 'stated',
      },
      {
        fieldId: 'tagline',
        value: 'Roasted to order.',
        sourceUrl: 'https://atlas-roasters.example',
        quote: 'Roasted to order.',
        confidence: 'stated',
      },
    ],
  },
  {
    key: 'demo-northline-supply',
    status: 'verified',
    name: 'Northline Supply',
    homepage: 'https://northline-supply.example',
    category: 'Grosshandel',
    verifiedAt: '2026-09-05',
    verifiedBy: 'MV1 M3 (Testeintrag)',
    fields: [
      {
        fieldId: 'categoryLanguage',
        value: 'Wholesale beverage supplier',
        sourceUrl: 'https://northline-supply.example/about',
        quote: 'Northline Supply is a wholesale beverage supplier.',
        confidence: 'stated',
      },
      {
        fieldId: 'pitch',
        value: 'One order desk for every product a cafe needs, delivered weekly.',
        sourceUrl: 'https://northline-supply.example',
        quote: 'One order desk for everything a cafe needs, delivered every week.',
        confidence: 'stated',
      },
      {
        fieldId: 'audience',
        value: 'Cafes, hotels and canteens',
        sourceUrl: 'https://northline-supply.example',
        quote: 'We supply cafes, hotels and canteens.',
        confidence: 'stated',
      },
      {
        fieldId: 'firstChoice',
        value: 'Fixed delivery windows and one contact person',
        sourceUrl: 'https://northline-supply.example/about',
        quote: 'Fixed delivery windows and one contact person for everything.',
        confidence: 'stated',
      },
      {
        // OHNE Zitat und ausdrücklich als Beobachtung eingestuft: nicht jedes
        // Feld steht wörtlich auf einer Seite (§2.2, `implied`). Die
        // Quell-Adresse bleibt trotzdem Pflicht.
        fieldId: 'toneWords',
        value: 'plain, orderly, unexcited',
        items: ['plain', 'orderly', 'unexcited'],
        sourceUrl: 'https://northline-supply.example',
        confidence: 'implied',
      },
      {
        fieldId: 'tagline',
        value: 'Everything on one delivery note.',
        sourceUrl: 'https://northline-supply.example',
        quote: 'Everything on one delivery note.',
        confidence: 'stated',
      },
    ],
  },
]

/** Ein einzelner Eintrag der Vorlage — wie `marketLibraryEntry()`, nur ohne Betriebspfad. */
export function marketLibraryFixtureEntry(key: string): MarketLibraryEntry {
  const entry = MARKET_LIBRARY_FIXTURE_ENTRIES.find(row => row.key === key)
  if (!entry) throw new Error(`Testvorlage kennt den Schlüssel ${key} nicht`)
  return entry
}
