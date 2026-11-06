import {
  MARKET_OWN_ID,
  type MarketAiView,
  type MarketCandidateSource,
  type MarketClaimList,
  type MarketCompetitor,
  type MarketEvidence,
  type MarketFinding,
  type MarketFrequency,
  type MarketProfile,
  type MarketProfileField,
  type MarketSourceOption,
} from '../../../shared/marketProfile'

/**
 * PROTOTYP (M0) — die Daten der vier Screens (Plan §2.11).
 *
 * ── ALLES ERFUNDEN, UND ZWAR ABSICHTLICH ─────────────────────────────────
 * Die Marke ist „Kailua Coffee Co." (das Beispiel-Branding des Wizards), das
 * Feld sind DREI ERFUNDENE Wettbewerber mit `.example`-Adressen. Eine reale
 * Marke im Klickdummy wäre genau das, was §2.9 dem Produkt verbietet — und
 * ein Screenshot davon wandert weiter, als man denkt (Plan §4).
 * Ihre „Websites" liegen als statische Seiten unter
 * `.playground/public/demo-sites/**` — deshalb ist der Prototyp OHNE NETZ
 * vorführbar, und jedes Zitat zeigt auf eine Textstelle, die es wirklich gibt.
 *
 * ── WAS HIER SPRACHE IST UND WAS INHALT ──────────────────────────────────
 * Beschriftungen, Zustände und Zählzeilen sind Oberfläche und laufen über
 * `market.*` (de+en). Die Aussagen, Zitate und Befund-Texte sind INHALT und
 * stehen in der Inhaltssprache der Marke (hier Englisch) — genau wie im
 * Produkt: der Bericht steht in der Sprache, in der die Marke gebaut wurde
 * (§3, Nicht-Ziele: „das Marktprofil steht in der Inhaltssprache der Marke").
 * Ein übersetztes Zitat wäre kein Beleg mehr.
 *
 * ── DIE ZITATE STEHEN WÖRTLICH IN DEN DEMO-SEITEN ────────────────────────
 * Das ist keine Kosmetik, sondern der Halluzinations-Riegel aus §2.2 im
 * Kleinen: `evidence ⊂ rawText`. Wer hier einen Satz ändert, muss ihn auch in
 * der HTML-Datei ändern — sonst zeigt der Beleg auf eine Stelle, die es nicht
 * gibt, und der Prototyp lügt an genau der Stelle, an der das Produkt es nie
 * darf.
 */

/** Abrufdatum aller Demo-Belege — ein Bericht ist ein Stand, kein Strom. */
const FETCHED = '2026-09-05'

/** Der eigene Markenname (Beispiel-Branding des Wizards). */
export const DEMO_BRAND = 'Kailua Coffee Co.'

/**
 * DIE PROTOTYP-NAHT ZU DEN DEMO-SEITEN. In der Umsetzung gibt es sie nicht:
 * dort IST `sourceUrl` das Ziel. Hier bildet sie die erfundene Adresse auf die
 * statische Seite im `public/`-Ordner ab, damit ein Klick etwas öffnet.
 */
export function demoHref(sourceUrl: string): string {
  const path = sourceUrl.replace(/^https?:\/\//, '')
  const [host, page] = [path.split('/')[0] ?? '', path.split('/')[1] ?? '']
  const slug = SITE_FOLDER[host] ?? host.replace('.example', '')
  // Seit M0b haben die Demo-Sites SECHS Seiten (§7.4: „5–8 Schlüsselseiten"),
  // nicht mehr zwei — der Pfad wird deshalb durchgereicht statt geraten.
  return `/demo-sites/${slug}/${page || 'index'}.html`
}

/**
 * EIN ORDNER HEISST ANDERS ALS SEIN HOST, UND ZWAR MIT ABSICHT: die alte
 * Website der eigenen Marke liegt unter `kailua-coffee-old/`, ihre (erfundene)
 * ADRESSE bleibt aber `kailua-coffee.example` — das ist ja der Punkt des
 * Relaunch-Falls. Ein Ordner namens `kailua-coffee` stünde beim nächsten
 * Blick neben der NEUEN Marke und wäre in einer Minute verwechselt.
 */
const SITE_FOLDER: Record<string, string> = {
  'kailua-coffee.example': 'kailua-coffee-old',
}

function evidence(quote: string, sourceUrl: string, confidence: 'stated' | 'implied' = 'stated'): MarketEvidence {
  return { quote, sourceUrl, fetchedAt: FETCHED, confidence }
}

/** „auf 4 von 6 Seiten" (§7.4) — kurz, weil es dreissigmal vorkommt. */
function freq(pages: number, of = 6): MarketFrequency {
  return { pages, of }
}

// ── Die eigene Marke ──────────────────────────────────────────────────────

/**
 * Die eigenen Werte kommen aus den BESTÄTIGTEN Feldern der Foundation (§2.3
 * Nr. 4) und tragen deshalb keinen Beleg: sie sind nicht abgelesen, sondern
 * entschieden. `keyMessages` steht LEER — das ist der Fall, den der Bericht
 * benennen muss („bei euch noch nicht bestätigt", §2.4), und deshalb ist er
 * im Prototyp vorgeführt statt weggelassen.
 */
export const DEMO_OWN: readonly MarketProfileField[] = [
  { fieldId: 'categoryLanguage', value: 'Small-batch roastery', source: 'foundation' },
  { fieldId: 'pitch', value: 'We roast coffee in small batches for cafes on Maui and deliver it ourselves.', source: 'foundation' },
  { fieldId: 'audience', value: 'Cafes and restaurants on Maui that buy 5 to 40 kilos a month.', source: 'foundation' },
  { fieldId: 'firstChoice', value: 'We know every farm personally.', source: 'foundation' },
  { fieldId: 'purpose', value: 'Coffee should stay traceable to the person who grew it.', source: 'foundation' },
  { fieldId: 'values', value: 'Origin, Closeness, Reliability', items: ['Origin', 'Closeness', 'Reliability'], source: 'foundation' },
  { fieldId: 'toneWords', value: 'direct, warm, concrete', items: ['direct', 'warm', 'concrete'], source: 'foundation' },
  { fieldId: 'tagline', value: 'Every bag has an address.', source: 'foundation' },
  { fieldId: 'keyMessages', value: '' },
  { fieldId: 'distinctiveAsset', value: 'Roasted Wednesday. At your door Thursday.', source: 'foundation' },
]

/**
 * DER BRAND-CHECK DER EIGENEN MARKE (§7.3) — der BESTEHENDE Score, hier als
 * Demo-Wert. Er sitzt bewusst im mittleren Band: ein Prototyp, in dem die
 * eigene Marke ganz oben steht, zeigt weder den Ring in seiner interessanten
 * Farbe noch den Satz, den ein Kunde wirklich lesen wird.
 */
export const DEMO_OWN_CHECK = { score: 74, band: 'strong', checkId: 'demo-kailua' }

// ── Die Kandidaten ────────────────────────────────────────────────────────

/**
 * Vor dem Lauf: Namen aus `a.competitors`, Adressen vom Kunden eingetragen.
 *
 * DREI ZEILEN, DREI QUELLEN — damit der Wähler nicht nur EXISTIERT, sondern in
 * seinen Zuständen zu beurteilen ist (§7.2): eine Adresse (der Normalfall),
 * ein Eintrag der Bibliothek (Name ohne Zitat) und eine freigegebene fremde
 * Marke. Die vierte Quelle, die eigene Marke, hat ihren eigenen Screen — den
 * Relaunch-Vergleich.
 */
export const DEMO_CANDIDATES: readonly MarketCompetitor[] = [
  {
    id: 'upcountry',
    name: 'Upcountry Roast Co.',
    url: 'https://upcountry-roast.example',
    status: 'pending',
    source: 'website',
    brandCheck: { score: 81, band: 'excellent', checkId: 'demo-upcountry' },
  },
  {
    id: 'pacific',
    name: 'Pacific Bean Supply',
    url: 'https://pacificbean.example',
    status: 'pending',
    source: 'website',
    // Ohne Check: „Brand-Check läuft mit" ist ein ZUSTAND und muss zu sehen sein.
  },
  {
    id: 'kona',
    name: 'Kona Trading',
    url: 'https://kona-trading.example',
    status: 'pending',
    source: 'website',
    // Vor dem Lauf ist noch unbekannt, dass diese Website nein sagt — hier
    // steht deshalb ehrlich „Brand-Check läuft mit".
  },
]

/**
 * DIE WÄHLBAREN EINTRÄGE DER DREI NICHT-WEBSITE-QUELLEN (§7.2 Nr. 2–4).
 *
 * ── DIE BIBLIOTHEK NENNT REALE MARKEN UND SONST NICHTS ───────────────────
 * adidas/Nike, Anthropic/OpenAI, Meta/Apple sind Davids Beispielpaare aus der
 * Prototyp-Runde. Hier stehen sie als NAME und Branche — kein Logo, kein
 * Zitat, kein Marktprofil. Das ist keine Bequemlichkeit, sondern die Regel:
 * ein erfundenes Zitat unter einem echten Markennamen wäre eine
 * Falschbehauptung über einen Dritten (§2.9 Nr. 5, § 6 UWG), und ein
 * Screenshot davon wandert weiter, als man denkt (Plan §4). Die Profile
 * rechnet und PRÜFT M6, von Hand.
 *
 * ── DIE DREI KLEINEREN SIND ERFUNDEN ─────────────────────────────────────
 * Je eine für die drei Zielbranchen (Studio, Coach, Café) — sie tragen
 * `.example`-Namen und dürfen deshalb später auch Zitate tragen.
 */
export const DEMO_SOURCE_OPTIONS: Partial<Record<MarketCandidateSource, readonly MarketSourceOption[]>> = {
  foundation: [
    { id: 'kailua-old', label: 'Kailua Coffee — old website', hint: 'kailua-coffee.example', url: 'https://kailua-coffee.example' },
    { id: 'kailua-new', label: 'Kailua Coffee — new foundation (wizard)', hint: 'Accepted fields, chapters A to E' },
  ],
  library: [
    { id: 'adidas', label: 'adidas', hint: 'Sportswear' },
    { id: 'nike', label: 'Nike', hint: 'Sportswear' },
    { id: 'anthropic', label: 'Anthropic', hint: 'AI research' },
    { id: 'openai', label: 'OpenAI', hint: 'AI research' },
    { id: 'meta', label: 'Meta', hint: 'Technology' },
    { id: 'apple', label: 'Apple', hint: 'Technology' },
    { id: 'northshore-studio', label: 'North Shore Studio', hint: 'Design studio (invented example)' },
    { id: 'makai-coaching', label: 'Makai Coaching', hint: 'Coaching (invented example)' },
    { id: 'lava-cafe', label: 'Lava Rock Cafe', hint: 'Cafe (invented example)' },
  ],
  shared: [
    { id: 'upcountry-shared', label: 'Upcountry Roast Co. — market profile released', hint: 'Released by the owner on 4 Sept 2026' },
  ],
}

/**
 * Nach dem Lauf. „Kona Trading" ist AUSGESCHLOSSEN, und zwar absichtlich: der
 * Zustand, in dem eine Website nein sagt, ist der wichtigste des ganzen
 * Ablaufs (§1.7 Nr. 2) — ein Prototyp, in dem alles klappt, zeigt ihn nie.
 * Die robots.txt dazu liegt wirklich im Playground.
 */
export const DEMO_COMPETITORS: readonly MarketCompetitor[] = [
  {
    id: 'upcountry',
    name: 'Upcountry Roast Co.',
    url: 'https://upcountry-roast.example',
    status: 'fetched',
    source: 'website',
    // Sechs Schlüsselseiten aus der sitemap.xml (§7.4) — jede liegt wirklich
    // im Playground, sonst wäre die Häufigkeit unten eine erfundene Zahl.
    pagesRead: [
      'https://upcountry-roast.example',
      'https://upcountry-roast.example/about',
      'https://upcountry-roast.example/wholesale',
      'https://upcountry-roast.example/roasting',
      'https://upcountry-roast.example/farms',
      'https://upcountry-roast.example/faq',
    ],
    fetchedAt: FETCHED,
    brandCheck: { score: 81, band: 'excellent', checkId: 'demo-upcountry' },
  },
  {
    id: 'pacific',
    name: 'Pacific Bean Supply',
    url: 'https://pacificbean.example',
    status: 'fetched',
    source: 'website',
    pagesRead: [
      'https://pacificbean.example',
      'https://pacificbean.example/about',
      'https://pacificbean.example/wholesale',
      'https://pacificbean.example/delivery',
      'https://pacificbean.example/grades',
      'https://pacificbean.example/faq',
    ],
    fetchedAt: FETCHED,
    // BEWUSST OHNE `brandCheck`: „Brand-Check läuft mit" ist ein Zustand des
    // Berichts und wird nur sichtbar, wenn eine Marke ihn wirklich hat.
  },
  {
    id: 'kona',
    name: 'Kona Trading',
    url: 'https://kona-trading.example',
    status: 'excluded',
    excludedReason: 'robots',
    source: 'website',
    // KEIN `brandCheck` mehr, sobald der Ausschluss feststeht — und das ist
    // kein Vergessen: der Brand-Check liest DIESELBE Website und hält sich an
    // dieselbe robots.txt (§7.4, geteilter Abruf). Ein Score neben dem Wort
    // „ausgeschlossen" behauptete, wir hätten doch gelesen.
  },
]

// ── Die Marktprofile ──────────────────────────────────────────────────────

export const DEMO_PROFILES: readonly MarketProfile[] = [
  {
    competitorId: 'upcountry',
    fields: [
      {
        fieldId: 'categoryLanguage',
        source: 'website',
        frequency: freq(4),
        value: 'Craft coffee roastery',
        evidence: evidence('We are a craft coffee roastery in Upcountry Maui.', 'https://upcountry-roast.example/about'),
      },
      {
        fieldId: 'pitch',
        source: 'website',
        frequency: freq(6),
        value: 'Small-batch coffee, roasted upcountry, direct from the farm.',
        evidence: evidence('Small-batch coffee, roasted upcountry, direct from the farm.', 'https://upcountry-roast.example'),
      },
      {
        fieldId: 'audience',
        source: 'website',
        frequency: freq(3),
        value: 'Cafes, restaurants and offices island-wide',
        evidence: evidence('We roast for cafes, restaurants and offices across the island.', 'https://upcountry-roast.example'),
      },
      {
        fieldId: 'firstChoice',
        source: 'website',
        frequency: freq(2),
        value: 'Buying direct from the farm and passing the story on',
        evidence: evidence('Why choose us? Because we buy direct from the farm and pass the story on.', 'https://upcountry-roast.example/about'),
      },
      // LEER heisst „nicht öffentlich formuliert" — und das ist eine Aussage
      // über die Kategorie, kein Loch im Bericht (§1.10).
      { fieldId: 'purpose', value: '' },
      {
        fieldId: 'values',
        source: 'website',
        frequency: freq(2),
        value: 'Craft, Community, Sustainability',
        items: ['Craft', 'Community', 'Sustainability'],
        evidence: evidence('Craft, community and sustainability guide everything we do.', 'https://upcountry-roast.example/about'),
      },
      {
        fieldId: 'toneWords',
        source: 'website',
        frequency: freq(3),
        value: 'warm, crafted, unhurried',
        items: ['warm', 'crafted', 'unhurried'],
        evidence: evidence('Pull up a chair. We will talk beans all afternoon.', 'https://upcountry-roast.example', 'implied'),
      },
      {
        fieldId: 'tagline',
        source: 'website',
        frequency: freq(6),
        value: 'Coffee with a story.',
        evidence: evidence('Coffee with a story.', 'https://upcountry-roast.example'),
      },
      {
        fieldId: 'keyMessages',
        source: 'website',
        frequency: freq(4),
        value: 'Small batches, farm-direct sourcing, weekly freshness',
        items: [
          'Roasted in small batches, never in bulk.',
          'We buy direct from the farm and pass the story on.',
          'Fresh every week, all across Maui.',
        ],
        evidence: evidence('Roasted in small batches, never in bulk.', 'https://upcountry-roast.example'),
      },
      { fieldId: 'distinctiveAsset', value: '' },
    ],
  },
  {
    competitorId: 'pacific',
    fields: [
      {
        fieldId: 'categoryLanguage',
        source: 'website',
        frequency: freq(3),
        value: 'Wholesale coffee supplier',
        evidence: evidence('Pacific Bean Supply is a wholesale coffee supplier based in Kahului.', 'https://pacificbean.example/about'),
      },
      {
        fieldId: 'pitch',
        source: 'website',
        frequency: freq(5),
        value: 'Reliable wholesale coffee, direct from the farm, delivered on schedule.',
        evidence: evidence('Reliable wholesale coffee for the islands, direct from the farm, delivered on schedule.', 'https://pacificbean.example'),
      },
      {
        fieldId: 'audience',
        source: 'website',
        frequency: freq(4),
        value: 'Hotels, cafes and grocery stores on four islands',
        evidence: evidence('We supply hotels, cafes and grocery stores on four islands.', 'https://pacificbean.example'),
      },
      {
        fieldId: 'firstChoice',
        source: 'website',
        frequency: freq(2),
        value: 'Shipping on schedule, every week, island-wide',
        evidence: evidence('Customers choose us because we ship on schedule, every week, island-wide.', 'https://pacificbean.example/about'),
      },
      { fieldId: 'purpose', value: '' },
      {
        fieldId: 'values',
        source: 'website',
        frequency: freq(2),
        value: 'Reliability, Scale, Service',
        items: ['Reliability', 'Scale', 'Service'],
        evidence: evidence('Reliability, scale and service. That is the whole list.', 'https://pacificbean.example/about'),
      },
      {
        fieldId: 'toneWords',
        source: 'website',
        frequency: freq(4),
        value: 'plain, businesslike',
        items: ['plain', 'businesslike'],
        evidence: evidence('One order desk for every island. Fixed windows, no surprises.', 'https://pacificbean.example', 'implied'),
      },
      {
        fieldId: 'tagline',
        source: 'website',
        frequency: freq(6),
        value: 'On schedule. Island-wide.',
        evidence: evidence('On schedule. Island-wide.', 'https://pacificbean.example'),
      },
      {
        fieldId: 'keyMessages',
        source: 'website',
        frequency: freq(3),
        value: 'Fixed delivery windows, one order desk, every grade',
        items: [
          'Fixed delivery windows, every week.',
          'One order desk for every island.',
          'Direct from the farm, in every grade.',
        ],
        evidence: evidence('Fixed delivery windows, every week.', 'https://pacificbean.example'),
      },
      { fieldId: 'distinctiveAsset', value: '' },
    ],
  },
]

// ── Die drei Listen ───────────────────────────────────────────────────────

/**
 * KONVENTIONEN zählen die EIGENE Marke mit (3 von 3): die Frage lautet „was
 * sagen alle im Feld", und wir sind Teil des Feldes. ÜBERSCHNEIDUNGEN zählen
 * sie NICHT mit (1 von 2): dort ist die eigene Aussage der Massstab, und die
 * Frage lautet „wer sagt sie AUCH".
 */
export const DEMO_CLAIMS: readonly MarketClaimList[] = [
  {
    kind: 'convention',
    entries: [
      {
        id: 'conv-farm',
        fieldId: 'firstChoice',
        statement: 'Closeness to the farm is the reason to choose us.',
        sharedBy: 3,
        of: 3,
        // ZWEI ZAHLEN, ZWEI FRAGEN (§7.4): drei von drei MARKEN sagen es, und
        // zusammen steht es auf 7 der 12 gelesenen Seiten des Feldes.
        frequency: { pages: 7, of: 12 },
        citations: [
          {
            competitorId: 'upcountry',
            competitorName: 'Upcountry Roast Co.',
            evidence: evidence('Why choose us? Because we buy direct from the farm and pass the story on.', 'https://upcountry-roast.example/about'),
            frequency: freq(2),
          },
          {
            competitorId: 'pacific',
            competitorName: 'Pacific Bean Supply',
            evidence: evidence('Reliable wholesale coffee for the islands, direct from the farm, delivered on schedule.', 'https://pacificbean.example'),
            frequency: freq(5),
          },
        ],
      },
      {
        id: 'conv-small-batch',
        fieldId: 'pitch',
        statement: 'Roasting in small batches.',
        sharedBy: 2,
        of: 3,
        frequency: { pages: 4, of: 12 },
        citations: [
          {
            competitorId: 'upcountry',
            competitorName: 'Upcountry Roast Co.',
            evidence: evidence('Roasted in small batches, never in bulk.', 'https://upcountry-roast.example'),
            frequency: freq(4),
          },
        ],
      },
    ],
  },
  {
    kind: 'overlap',
    entries: [
      {
        id: 'ovl-first-choice',
        fieldId: 'firstChoice',
        statement: 'We know every farm personally.',
        sharedBy: 1,
        of: 2,
        citations: [
          {
            competitorId: 'upcountry',
            competitorName: 'Upcountry Roast Co.',
            evidence: evidence('Why choose us? Because we buy direct from the farm and pass the story on.', 'https://upcountry-roast.example/about'),
            frequency: freq(2),
          },
        ],
      },
      {
        id: 'ovl-reliability',
        fieldId: 'values',
        statement: 'Reliability as a stated value.',
        sharedBy: 1,
        of: 2,
        citations: [
          {
            competitorId: 'pacific',
            competitorName: 'Pacific Bean Supply',
            evidence: evidence('Reliability, scale and service. That is the whole list.', 'https://pacificbean.example/about'),
            frequency: freq(2),
          },
        ],
      },
    ],
  },
  {
    kind: 'whitespace',
    entries: [
      {
        id: 'ws-delivery',
        fieldId: 'distinctiveAsset',
        statement: 'Nobody in the field says who carries the coffee to the door. Delivery is named as a schedule, never as a person. Do you want that to be yours?',
      },
      {
        id: 'ws-price',
        fieldId: 'keyMessages',
        statement: 'Nobody in the field states a minimum order or a price range in public. Do you want to be the one who does?',
      },
    ],
  },
]

// ── Die Befunde ───────────────────────────────────────────────────────────

/**
 * DREI BEFUNDE, ALLE AM EIGENEN FELD (§2.9 Nr. 5): kein Wettbewerber wird
 * genannt, keiner wird bewertet, und kein Vorschlag entwirft einen Satz, der
 * einen Dritten erkennbar macht („anders als X …"). Die Formulierung „zwei
 * andere im Feld" ist die Grenze, die das Produkt einhält.
 *
 * DER DRITTE IST NEU IN M0b und lebt vom UNTERSCHIED zwischen den beiden
 * Sichten (§7.5 d): „eure Website sagt X, KI-Antworten beschreiben euch als
 * Y". Genau dafür wird die ungeprüfte Aussensicht überhaupt erhoben — nicht
 * als zweite Wahrheit, sondern als Abstandsmessung zur eigenen.
 */
export const DEMO_FINDINGS: readonly MarketFinding[] = [
  {
    id: 'f-first-choice',
    slotId: 'b.positioningFirstChoice',
    why: 'Your reason to be chosen first — knowing every farm personally — is the promise two other sites in the field make in their own words.',
    suggestion: 'Sharpen it with the part only you do: you deliver every bag yourself, on a fixed weekday.',
    status: 'open',
  },
  {
    id: 'f-tagline',
    slotId: 'ep.taglines',
    why: 'Your tagline carries an idea the field already states plainly, while the weekly rhythm you actually run is stated nowhere in the field.',
    suggestion: 'Try a line built on that rhythm — roasted Wednesday, at the door Thursday.',
    status: 'open',
  },
  {
    id: 'f-ai-gap',
    slotId: 'a.pitch',
    why: 'Your website says you roast in small batches and deliver yourself. AI answers describe you as a wholesale coffee supplier for hotels — the delivery by hand does not appear in a single one of them.',
    suggestion: 'Put the weekday delivery into the first sentence of the start page, where a reader and a machine both look first.',
    status: 'open',
  },
]

// ── Die KI-Aussensicht ────────────────────────────────────────────────────

/**
 * WAS KI-ANTWORTEN ÜBER DIESE MARKEN SAGEN (§7.5, Davids Entscheidung GEGEN
 * die Empfehlung).
 *
 * ── KEIN BELEG, WEIL ES KEINEN GIBT ──────────────────────────────────────
 * Eine Modellantwort ist keine Quelle. Was hier steht, trägt deshalb den
 * Konsens statt eines Zitats („2 von 3 Antworten") — und übernommen ist nur,
 * worin sich mindestens zwei Modelle einig waren.
 *
 * ── SIE STEHT ABSICHTLICH DANEBEN, NICHT DARIN ───────────────────────────
 * Für die eigene Marke ist sie die interessanteste Zeile des ganzen Berichts:
 * die Website sagt „small-batch roastery, wir liefern selbst", die Modelle
 * sagen „wholesale supplier". Dieser ABSTAND ist der Befund `f-ai-gap` — kein
 * Fehler der Modelle, sondern eine Auskunft darüber, was draussen ankommt.
 *
 * Die drei kleineren Felder bleiben leer: ein Modell, das Tonwörter und
 * Markenzeichen einer kleinen Rösterei „weiss", rät.
 */
export const DEMO_AI_VIEWS: readonly MarketAiView[] = [
  {
    competitorId: MARKET_OWN_ID,
    statements: [
      { fieldId: 'categoryLanguage', value: 'Wholesale coffee supplier on Maui', agree: 3, asked: 3 },
      { fieldId: 'pitch', value: 'Sells roasted coffee to hotels and cafes across Hawaii.', agree: 2, asked: 3 },
      { fieldId: 'audience', value: 'Hotels, cafes and online buyers', agree: 2, asked: 3 },
      { fieldId: 'firstChoice', value: 'Local roasting and island sourcing', agree: 2, asked: 3 },
    ],
  },
  {
    competitorId: 'upcountry',
    statements: [
      { fieldId: 'categoryLanguage', value: 'Craft roastery in Upcountry Maui', agree: 3, asked: 3 },
      { fieldId: 'pitch', value: 'Roasts single-farm coffee in small batches and tells the farm story.', agree: 3, asked: 3 },
      { fieldId: 'values', value: 'Craft, community, sustainability', agree: 2, asked: 3 },
    ],
  },
  {
    competitorId: 'pacific',
    statements: [
      { fieldId: 'categoryLanguage', value: 'Coffee wholesaler for the Hawaiian islands', agree: 3, asked: 3 },
      { fieldId: 'audience', value: 'Hotels, grocery chains and restaurants', agree: 2, asked: 3 },
    ],
  },
]

/** Der Abschnitt „KI-Aussensicht" im Lauf — dieselben Zahlen, eine Zeile. */
export const DEMO_AI_RUN = { agree: 2, asked: 3, adopted: true }

// ── Der Relaunch-Fall: die eigene alte Website ────────────────────────────

export const DEMO_OLD_SITE_NAME = 'Kailua Coffee Co. — old website'
export const DEMO_OLD_SITE_HOST = 'kailua-coffee.example'

/**
 * DAS MARKTPROFIL DER EIGENEN ALTEN WEBSITE (§7.2 Nr. 2).
 *
 * Es entsteht mit DEMSELBEN Motor wie jedes Wettbewerber-Profil — dieselben
 * zehn Felder, dieselbe Belegpflicht, dieselben Zitate aus einer Seite, die
 * wirklich im Playground liegt (`public/demo-sites/kailua-coffee-old/`). Das
 * ist der ganze Trick der Quelle „eigene Marke": man braucht keinen zweiten
 * Vergleich, nur einen zweiten Kandidaten.
 *
 * ZWEI SEITEN, NICHT SECHS — und deshalb `of: 2` in jeder Häufigkeit: die
 * alte Website IST klein. Eine geschönte Zahl wäre hier besonders albern,
 * weil der Kunde seine eigene Website kennt.
 */
export const DEMO_OLD_SITE_PROFILE: readonly MarketProfileField[] = [
  {
    fieldId: 'categoryLanguage',
    value: 'Coffee wholesaler',
    source: 'website',
    frequency: freq(2, 2),
    evidence: evidence('Kailua Coffee Co. is a coffee wholesaler on Maui.', 'https://kailua-coffee.example'),
  },
  {
    fieldId: 'pitch',
    value: 'Wholesale coffee for hotels and cafes, delivered across the island.',
    source: 'website',
    frequency: freq(2, 2),
    evidence: evidence('Wholesale coffee for hotels and cafes, delivered across the island.', 'https://kailua-coffee.example'),
  },
  {
    fieldId: 'audience',
    value: 'Hotels, cafes and restaurants on Maui',
    source: 'website',
    frequency: freq(1, 2),
    evidence: evidence('We supply hotels, cafes and restaurants on Maui, from single bags to weekly pallets.', 'https://kailua-coffee.example'),
  },
  {
    fieldId: 'firstChoice',
    value: 'Good coffee at a fair price',
    source: 'website',
    frequency: freq(1, 2),
    evidence: evidence('Good coffee at a fair price, order by phone or by mail.', 'https://kailua-coffee.example/about'),
  },
  // Die alte Seite hat keinen Purpose-Satz — genau der Fall, den die neue
  // Foundation füllt und der unten in der Liste landet.
  { fieldId: 'purpose', value: '' },
  {
    fieldId: 'values',
    value: 'Quality, Service',
    items: ['Quality', 'Service'],
    source: 'website',
    frequency: freq(1, 2),
    evidence: evidence('Quality and service have been our two words since 2014.', 'https://kailua-coffee.example/about'),
  },
  {
    fieldId: 'toneWords',
    value: 'plain, practical',
    items: ['plain', 'practical'],
    source: 'website',
    frequency: freq(2, 2),
    evidence: evidence('Order by phone before Tuesday noon and we bring it that week.', 'https://kailua-coffee.example/about', 'implied'),
  },
  {
    fieldId: 'tagline',
    value: 'Fresh coffee, fair prices.',
    source: 'website',
    frequency: freq(2, 2),
    evidence: evidence('Fresh coffee, fair prices.', 'https://kailua-coffee.example'),
  },
  { fieldId: 'keyMessages', value: '' },
  { fieldId: 'distinctiveAsset', value: '' },
]

/** Der Stand des Berichts (Kopf der rechten Spalte). */
export const DEMO_REPORT_DATE = FETCHED
