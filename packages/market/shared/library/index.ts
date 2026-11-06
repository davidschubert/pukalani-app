/**
 * DIE BIBLIOTHEKS-DATEI (Plan §7.2 Nr. 3) — versioniert im Repo, nie in der
 * Datenbank (Anhang B).
 *
 * ── HIER STEHEN NUR ECHTE, VON HAND GEPRÜFTE MARKEN ───────────────────────
 * Stand 2026-09-06 (MV1 M6b, lib-5): VIER Einträge — `the-barn` (alle neun
 * belegten Felder), `apple` (fünf; `purpose` hat David bei der Prüfung
 * gestrichen), `nike` (alle sieben) und `anthropic` (alle sechs, Lauf 3 mit
 * der Unternehmensseite als Startadresse). `meta` bleibt bewusst Entwurf.
 * Alle vier sind am 2026-09-06 von David Schubert VON HAND geprüft: jedes Zitat
 * gegen die genannte Quellseite gehalten, jede Zuordnung bestätigt, keine
 * personenbezogenen Daten, keine Wertung (Runbook Schritt 4). Das steht als
 * `verifiedAt`/`verifiedBy` an jedem Eintrag, und `status: 'verified'` ist der
 * eine Wert, den kein Werkzeug setzt.
 *
 * ── WAS HIER BIS ZUM 2026-09-06 STAND UND WARUM ES WEG IST ────────────────
 * Zwei ERFUNDENE Einträge (`demo-atlas-roasters`, `demo-northline-supply`,
 * `.example`-Adressen). Sie waren richtig, solange die Mechanik ohne Inhalt
 * lief — mit dem Gate-Flip lief der Marktvergleich aber in PRODUKTION, und
 * damit boten wir zahlenden Kunden zwei Marken an, die es nicht gibt, mit
 * einem Prüfsiegel, das niemand geleistet hat. Sie leben als Testvorlage
 * weiter: `packages/market/tests/fixtures/marketLibraryFixture.ts`.
 *
 * ── DER RECHTS-CHECK IST OFFEN, DIE ÜBERNAHME IST TROTZDEM ENTSCHIEDEN ────
 * Die anwaltlichen Fragen aus Plan Anhang G (Namensnennung im bezahlten
 * Produkt, Zitatzweck, TDM, § 6 UWG, DSGVO, § 87b UrhG) sind zum Stand dieser
 * Datei NICHT beantwortet. David hat die Übernahme am 2026-09-06 dennoch
 * entschieden — festgehalten, nicht umgangen: die Laien-Einschätzungen stehen
 * im Plan, die Fragen bleiben dort offen, und die Rücknahme eines Eintrags ist
 * ein Handgriff (Runbook Abschnitt 6). Was das PRODUKT davon zeigt, ist
 * bewusst wenig: Wortname und Kategorie, keine Logos, keine Favicons, keine
 * Bildmarken.
 *
 * ── DIE FASSUNG IST TEIL DES BERICHT-SCHLÜSSELS ───────────────────────────
 * `MARKET_LIBRARY_VERSION` geht in `market_reports.revisionKey` ein. Wer einen
 * Eintrag ÄNDERT und die Fassung stehen lässt, hinterlässt gespeicherte
 * Berichte, die sich für aktuell halten, obwohl sich ihre Grundlage bewegt
 * hat. Die Regel lautet deshalb: jede inhaltliche Änderung hebt die Zahl.
 * Seit M6b hebt `--promote` sie SELBST — die Regel hing vorher an einer
 * gedruckten Erinnerung, und das ist keine Sicherung. Die zwei Übernahmen vom
 * 2026-09-06 hoben sie deshalb zweimal (lib-2 → lib-4); zusammengezogen auf
 * `lib-3`, weil sie EINE inhaltliche Änderung der ausgelieferten Datei sind
 * (erfundene raus, zwei echte rein) und in EINEM Commit liegen. Wichtig ist
 * nur, dass die Zahl STEIGT — sonst hielten sich gespeicherte Berichte für
 * aktuell.
 *
 * ── DIE FORM WIRD GEPRÜFT, NICHT GEGLAUBT ─────────────────────────────────
 * `shared/marketLibrary.ts` hält diese Datei gegen ein Zod-Schema (Pflichtfeld
 * `verifiedAt`/`verifiedBy` je Eintrag, Quell-Adresse je Feld, Zitatschranke
 * ≤ 200 Zeichen), und `tests/marketLibrary.test.ts` tut dasselbe im CI — dazu
 * die Redaktionsregel: echter Host, Prüfdatum nicht in der Zukunft, Beleg vom
 * Auftritt der Marke selbst. Eine Bibliothek, die durchfällt, ist LEER — nicht
 * „so gut wie möglich".
 */

/** Fassung dieser Datei. Jede inhaltliche Änderung hebt sie (`--promote` tut es selbst). */
export const MARKET_LIBRARY_VERSION = 'lib-5'

/**
 * Die Einträge. Bewusst `unknown[]`-frei getypt gelassen: die WAHRHEIT über
 * die Form ist das Zod-Schema in `marketLibrary.ts`, und ein zweiter
 * TypeScript-Typ daneben wäre eine zweite Wahrheit, die beim nächsten Feld
 * auseinanderläuft. Diese Datei ist Daten, kein Vertrag.
 */
export const MARKET_LIBRARY_ENTRIES = [
  {
    key: 'the-barn',
    status: 'verified',
    name: 'The Barn',
    homepage: 'https://thebarn.de',
    category: 'Kaffeerösterei',
    verifiedAt: '2026-09-06',
    verifiedBy: 'David Schubert',
    fields: [
      {
        fieldId: 'categoryLanguage',
        value: 'Specialty Coffee Roasters',
        sourceUrl: 'https://thebarn.de/',
        confidence: 'stated',
        quote: 'THE BARN Coffee Roasters are one of the leading Specialty Coffee Roasters in Europe.',
      },
      {
        fieldId: 'pitch',
        value: 'We roast the best coffees available on this planet and deliver freshly roasted coffee to your door.',
        sourceUrl: 'https://thebarn.de/',
        confidence: 'stated',
        quote: 'We roast the best coffees available on this planet.',
      },
      {
        fieldId: 'audience',
        value: 'Coffee lovers and specialty coffee enthusiasts seeking high-quality, freshly roasted coffee and brewing equipment.',
        sourceUrl: 'https://thebarn.de/',
        confidence: 'implied',
        quote: 'Perfect present for every coffee lover',
      },
      {
        fieldId: 'firstChoice',
        value: 'As one of the leading specialty coffee roasters in Europe, THE BARN offers the best coffees available and beautifully designed, durable brewing equipment.',
        sourceUrl: 'https://thebarn.de/',
        confidence: 'stated',
        quote: 'THE BARN Coffee Roasters are one of the leading Specialty Coffee Roasters in Europe.',
      },
      {
        fieldId: 'purpose',
        value: 'To share exciting coffee experiences and push the boundaries of specialty coffee quality.',
        sourceUrl: 'https://thebarn.de/',
        confidence: 'stated',
        quote: 'Over the years, we have pushed ourselves to share the most exciting coffee experiences with you.',
      },
      {
        fieldId: 'values',
        value: 'Quality, Design, Control, Craftsmanship, Specialty',
        sourceUrl: 'https://thebarn.de/products/hario-scale',
        confidence: 'implied',
        items: [
          'Quality',
          'Design',
          'Control',
          'Craftsmanship',
          'Specialty',
        ],
        quote: 'Not only are they beautifully designed and made to last, but they give us full control resulting in perfectly brewed coffees.',
      },
      {
        fieldId: 'toneWords',
        value: 'Informative, Passionate, Accessible, Descriptive, Engaging',
        sourceUrl: 'https://thebarn.de/',
        confidence: 'implied',
        items: [
          'Informative',
          'Passionate',
          'Accessible',
          'Descriptive',
          'Engaging',
        ],
        quote: 'The Art of Experiencing Coffee',
      },
      {
        fieldId: 'tagline',
        value: 'Freshly Roasted Coffee to your door',
        sourceUrl: 'https://thebarn.de/',
        confidence: 'stated',
        quote: 'Freshly Roasted Coffee to your door',
      },
      {
        fieldId: 'keyMessages',
        value: 'We roast the best coffees on the planet, Specialty coffee equipment for home brewing, Subscribe for seasonal single origins',
        sourceUrl: 'https://thebarn.de/',
        confidence: 'stated',
        items: [
          'We roast the best coffees on the planet',
          'Specialty coffee equipment for home brewing',
          'Subscribe for seasonal single origins',
        ],
        quote: 'We roast the best coffees on the planet',
      },
    ],
  },
  {
    key: 'apple',
    status: 'verified',
    name: 'Apple',
    homepage: 'https://www.apple.com',
    category: 'Technologie-Plattform',
    verifiedAt: '2026-09-06',
    verifiedBy: 'David Schubert',
    fields: [
      {
        fieldId: 'categoryLanguage',
        value: 'Technology products and services',
        sourceUrl: 'https://www.apple.com/',
        confidence: 'stated',
        quote: 'Discover the innovative world of Apple and shop everything iPhone, iPad, Apple Watch, Mac, and Apple TV, plus explore accessories, entertainment, and expert device support.',
      },
      {
        fieldId: 'pitch',
        value: 'Discover the innovative world of Apple and shop everything iPhone, iPad, Apple Watch, Mac, and Apple TV, plus explore accessories, entertainment, and expert device support.',
        sourceUrl: 'https://www.apple.com/',
        confidence: 'stated',
        quote: 'Discover the innovative world of Apple and shop everything iPhone, iPad, Apple Watch, Mac, and Apple TV, plus explore accessories, entertainment, and expert device support.',
      },
      {
        fieldId: 'values',
        value: 'Accessibility, Education, Environment, Inclusion and Diversity, Privacy',
        sourceUrl: 'https://www.apple.com/',
        confidence: 'stated',
        items: [
          'Accessibility',
          'Education',
          'Environment',
          'Inclusion and Diversity',
          'Privacy',
        ],
        quote: 'Apple Values Accessibility Education Environment Inclusion and Diversity Privacy Racial Equity and Justice Supply Chain Innovation',
      },
      {
        fieldId: 'tagline',
        value: 'Think different',
        sourceUrl: 'https://www.apple.com/mac/',
        confidence: 'stated',
        quote: 'Think different',
      },
      {
        fieldId: 'keyMessages',
        value: 'Innovative world of Apple, Advanced AI performance and game-changing capabilities, The most advanced Mac laptops for demanding tasks',
        sourceUrl: 'https://www.apple.com/',
        confidence: 'stated',
        items: [
          'Innovative world of Apple',
          'Advanced AI performance and game-changing capabilities',
          'The most advanced Mac laptops for demanding tasks',
        ],
        quote: 'Discover the innovative world of Apple',
      },
    ],
  },
{
    key: 'nike',
    status: 'verified',
    name: 'Nike',
    homepage: 'https://www.nike.com',
    category: 'Sportartikel',
    verifiedAt: '2026-09-06',
    verifiedBy: 'David Schubert',
    fields: [
      {
        fieldId: 'categoryLanguage',
        value: 'Athletic footwear and apparel',
        sourceUrl: 'https://www.nike.com/',
        confidence: 'stated',
        quote: 'Inspiring the world\'s athletes, Nike delivers innovative products, experiences and services.',
      },
      {
        fieldId: 'pitch',
        value: 'Nike delivers innovative products, experiences and services to inspire the world\'s athletes.',
        sourceUrl: 'https://www.nike.com/',
        confidence: 'stated',
        quote: 'Inspiring the world\'s athletes, Nike delivers innovative products, experiences and services.',
      },
      {
        fieldId: 'audience',
        value: 'Athletes of all levels, from professional to casual sports enthusiasts.',
        sourceUrl: 'https://www.nike.com/',
        confidence: 'implied',
        quote: 'Inspiring the world\'s athletes',
      },
      {
        fieldId: 'values',
        value: 'Innovation',
        sourceUrl: 'https://www.nike.com/',
        confidence: 'stated',
        items: [
          'Innovation',
        ],
        quote: 'Nike delivers innovative products, experiences and services.',
      },
      {
        fieldId: 'toneWords',
        value: 'Inspirational, energetic, action-oriented',
        sourceUrl: 'https://www.nike.com/',
        confidence: 'implied',
        items: [
          'Inspirational',
          'energetic',
          'action-oriented',
        ],
        quote: 'Inspiring the world\'s athletes, Nike delivers innovative products, experiences and services.',
      },
      {
        fieldId: 'tagline',
        value: 'Just Do It',
        sourceUrl: 'https://www.nike.com/',
        confidence: 'stated',
        quote: 'Nike. Just Do It. Nike.com',
      },
      {
        fieldId: 'keyMessages',
        value: 'Classic silhouettes and cutting-edge innovation',
        sourceUrl: 'https://www.nike.com/',
        confidence: 'stated',
        items: [
          'Classic silhouettes and cutting-edge innovation',
        ],
        quote: 'Classic silhouettes and cutting-edge innovation to build your game from the ground up.',
      },
    ],
  },
{
    key: 'anthropic',
    status: 'verified',
    name: 'Anthropic',
    homepage: 'https://www.anthropic.com/company',
    category: 'KI-Labor',
    verifiedAt: '2026-09-06',
    verifiedBy: 'David Schubert',
    fields: [
      {
        fieldId: 'categoryLanguage',
        value: 'AI safety and research company',
        sourceUrl: 'https://www.anthropic.com/company',
        confidence: 'stated',
        quote: 'Anthropic is an AI safety and research company that\'s working to build reliable, interpretable, and steerable AI systems.',
        frequency: {
          pages: 4,
          of: 8,
        },
      },
      {
        fieldId: 'audience',
        value: 'Businesses, nonprofits, civil society groups, researchers, policymakers, and people around the globe who benefit from AI tools and research.',
        sourceUrl: 'https://www.anthropic.com/company',
        confidence: 'stated',
        quote: 'We translate our research into tangible, practical tools like Claude that benefit businesses, nonprofits and civil society groups and their clients and people around the globe.',
        frequency: {
          pages: 1,
          of: 8,
        },
      },
      {
        fieldId: 'firstChoice',
        value: 'Anthropic treats AI safety as a systematic science and aims to set the industry bar for AI safety and security. The company conducts frontier research, applies safety techniques to products, and regularly shares insights with the world.',
        sourceUrl: 'https://www.anthropic.com/company',
        confidence: 'stated',
        quote: 'Safety Is a Science We treat AI safety as a systematic science, conducting research, applying it to our products, feeding those insights back into our research, and regularly sharing what we learn wit',
        frequency: {
          pages: 1,
          of: 8,
        },
      },
      {
        fieldId: 'toneWords',
        value: 'factual, direct, thoughtful, collaborative, mission-driven',
        sourceUrl: 'https://www.anthropic.com/company',
        confidence: 'implied',
        items: [
          'factual',
          'direct',
          'thoughtful',
          'collaborative',
          'mission-driven',
        ],
        quote: 'We communicate kindly and directly, assuming good intentions even in disagreement. We are thoughtful about our actions, avoiding harm and repairing relationships when needed.',
        frequency: {
          pages: 1,
          of: 8,
        },
      },
      {
        fieldId: 'tagline',
        value: 'Making AI systems you can rely on',
        sourceUrl: 'https://www.anthropic.com/company',
        confidence: 'stated',
        quote: 'Making AI systems you can rely on',
        frequency: {
          pages: 1,
          of: 8,
        },
      },
      {
        fieldId: 'distinctiveAsset',
        value: 'reliable, interpretable, and steerable',
        sourceUrl: 'https://www.anthropic.com/company',
        confidence: 'implied',
        quote: 'reliable, interpretable, and steerable AI systems',
        frequency: {
          pages: 5,
          of: 8,
        },
      },
    ],
  },
]
