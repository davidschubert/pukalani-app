import type {
  InsightsBrand,
  InsightsBrandScore,
  InsightsPost,
  InsightsRadarVideo,
} from '../../../shared/insightsPost'
import {
  insightsBrandSchema,
  insightsPostSchema,
  insightsRadarVideoSchema,
} from '../../../shared/insightsPost'

/**
 * PROTOTYP (I0) — DIE DATEN DER SECHS SCREENS (Plan §9.9).
 *
 * ── ALLES ERFUNDEN, UND ZWAR ABSICHTLICH ─────────────────────────────────
 * Brand Insights schreibt im Produkt über ECHTE fremde Marken — genau deshalb
 * steht hier keine einzige. Ein erfundenes Zitat unter einem echten
 * Markennamen wäre eine Falschbehauptung über einen Dritten (§ 6 UWG), und
 * ein Screenshot davon wandert weiter, als man denkt (Marktvergleich §4). Die
 * Welt ist deshalb dieselbe wie im Marktvergleichs-Prototyp: die erfundene
 * Kaffee-Welt mit `.example`-Adressen. **The Barn ist ECHT** und steht
 * deswegen nirgends in dieser Datei — für eine echte Marke gibt es keine
 * erfundenen Belege.
 *
 * ── DIE DATEN GEHEN DURCH DEN VERTRAG ────────────────────────────────────
 * Jede Zeile wird beim Laden mit `insightsPostSchema` / `insightsBrandSchema`
 * / `insightsRadarVideoSchema` GEPARST, nicht bloss getypt. Zwei Gründe: die
 * Vorgaben (Zitat ≤ 200, Fremdquelle mit Datum, Beleg-Zeiger) gelten damit
 * auch im Prototyp, und der Prototyp ist damit ein Beweis dafür, dass die
 * FORM aus §9.3 die echten Bildschirme trägt. Bricht das Schema, bricht der
 * Playground beim Start — nicht irgendwann später an einer leeren Stelle.
 *
 * ── WAS DEM brand-LAYER GEHÖRT, STEHT HIER ALS DATUM ─────────────────────
 * Archetyp-Namen, Farbwelt-Paare und die acht Score-Kategorien kommen im
 * Produkt über den Vertrag aus `packages/brand` (Plan §9.1 Nr. 2). Hier
 * stehen sie als schlichte Zeichenketten — ein relativer Import in einen
 * fremden Layer wäre genau die Grenzverletzung, die der Prototyp NICHT
 * vorführen soll (CONCEPT A14).
 */

/** Der Stichtag aller Demo-Daten. Ein Prototyp ist ein Stand, kein Strom. */
export const DEMO_TODAY = '2026-09-08'

/**
 * DIE ROHTEXTE DER QUELLEN — die Grundlage der deterministischen
 * Beleg-Prüfung (§9.4: „der prüft deterministisch, nicht mit KI").
 *
 * Im Produkt holt der Server die Seite über den SSRF-festen Abruf des
 * brand-Layers; entschieden wird auch dort mit `evidenceIsGrounded` aus dem
 * Fundament (`core/shared/evidenceGrounding.ts`, BI1 I1a). Hier steht der Text
 * als Zeichenkette daneben — dieselbe Funktion, dasselbe Ergebnis, dieselbe
 * Härte.
 *
 * EINE QUELLE IST ABSICHTLICH FALSCH BELEGT (`pacificbean.example/about`):
 * ein Prototyp, in dem alles klappt, zeigt den wichtigsten Zustand nie. Die
 * rote Ampel im Redaktions-Screen ist genau diese Zeile.
 */
export const DEMO_SOURCE_TEXTS: Record<string, string> = {
  'https://upcountry-roast.example/about': 'We roast in small batches above the cloud line. Every bag carries the farm, the altitude and the day it was roasted.',
  'https://upcountry-roast.example/roasting': 'The ridge line on our bags is the profile curve of our first roast, drawn by hand in 2011.',
  'https://kona-herald.example/upcountry-ridge': 'Upcountry kept the ridge and dropped everything else — a rare case of a small roaster editing instead of adding.',
  'https://island-grind.example': 'Loud on purpose. We put the cup first and the logo second.',
  'https://pacificbean.example/about': 'Pacific Bean Supply delivers wholesale coffee across the islands, six days a week.',
  'https://kona-trading.example': 'Kona Trading sources green coffee for roasters who prefer to stay quiet about their supply chain.',
  'https://branding.supply/brand-check/methodik': 'Der Brand Score misst acht Kategorien mit 40 Prüfkriterien und weist jede Bewertung mit ihrem Beleg aus.',
}

/**
 * DIE ACHT KATEGORIEN DES BRAND-CHECKS (Score v2, §2.1).
 *
 * Im Produkt sind das `brand.check.categories.*` — Beschriftungen des
 * brand-Layers, aufgelöst über dessen i18n-Katalog. Der Prototyp trägt sie
 * zweisprachig als Daten, damit beide Sprachfassungen der Seiten echt sind
 * und nicht halb deutsch bleiben.
 */
const SCORE_DIMENSIONS = [
  { key: 'distinctiveness', de: 'Eigenständigkeit', en: 'Distinctiveness' },
  { key: 'visualIdentity', de: 'Visuelle Identität', en: 'Visual identity' },
  { key: 'consistency', de: 'Konsistenz', en: 'Consistency' },
  { key: 'experience', de: 'Markenerlebnis', en: 'Brand experience' },
  { key: 'positioning', de: 'Positionierung & Klarheit', en: 'Positioning and clarity' },
  { key: 'emotion', de: 'Emotionale Wirkung', en: 'Emotional pull' },
  { key: 'adaptability', de: 'Anpassungsfähigkeit', en: 'Adaptability' },
  { key: 'craft', de: 'Handwerk', en: 'Craft' },
] as const

const BANDS: Record<string, { de: string, en: string }> = {
  exceptional: { de: 'Außergewöhnlich', en: 'Exceptional' },
  excellent: { de: 'Stark', en: 'Excellent' },
  solid: { de: 'Solide', en: 'Solid' },
  developing: { de: 'Im Aufbau', en: 'Developing' },
}

interface DemoScoreSeed {
  score: number
  band: keyof typeof BANDS
  values: readonly number[]
}

/** Score-Werte je Marke. Neun Zeilen — die zehnte ist die entfernte. */
const SCORE_SEEDS: Record<string, DemoScoreSeed> = {
  'upcountry-roast': { score: 88, band: 'excellent', values: [93, 90, 89, 86, 88, 87, 84, 90] },
  'island-grind': { score: 81, band: 'excellent', values: [86, 88, 76, 84, 78, 85, 79, 72] },
  'windward-coffee': { score: 79, band: 'solid', values: [80, 78, 82, 74, 79, 76, 80, 77] },
  'lava-rock-cafe': { score: 77, band: 'solid', values: [74, 80, 75, 82, 72, 81, 74, 70] },
  'pacific-bean': { score: 74, band: 'solid', values: [68, 72, 80, 70, 76, 66, 78, 82] },
  'hana-bay-coffee': { score: 72, band: 'solid', values: [70, 74, 71, 76, 68, 75, 72, 70] },
  'paniolo-roasters': { score: 64, band: 'developing', values: [58, 66, 62, 70, 60, 68, 64, 66] },
  'kona-trading': { score: 58, band: 'developing', values: [48, 54, 62, 52, 56, 50, 66, 68] },
  'saltwater-espresso': { score: 54, band: 'developing', values: [50, 58, 52, 56, 48, 60, 54, 52] },
}

/**
 * Der Score als ANSICHT (§9.3) — nie eine eigene Spalte. Die Sprache
 * entscheidet nur über die Beschriftung, nie über die Zahl.
 */
export function demoScore(slug: string, locale: 'de' | 'en'): InsightsBrandScore | null {
  const seed = SCORE_SEEDS[slug]
  if (!seed) return null
  return {
    score: seed.score,
    band: BANDS[seed.band]?.[locale] ?? seed.band,
    checkId: `demo-check-${slug}`,
    dimensions: SCORE_DIMENSIONS.map((dimension, index) => ({
      key: dimension.key,
      label: dimension[locale],
      value: seed.values[index] ?? 0,
    })),
  }
}

/**
 * DIE FARBWELT je Marke — im Produkt `brandGradientFor` aus dem brand-Layer,
 * hier zwei Farben als Datum. Sie ist das EINZIGE Bild, das eine fremde Marke
 * hier bekommt (Entscheidung 10: keine fremden Logos, keine Screenshots).
 */
export const DEMO_GRADIENTS: Record<string, readonly [string, string]> = {
  'upcountry-roast': ['#efe6db', '#a1794f'],
  'island-grind': ['#e0e8e6', '#4f8f83'],
  'windward-coffee': ['#dbe4ec', '#5f7fa8'],
  'lava-rock-cafe': ['#e8ddd8', '#8a4a3f'],
  'pacific-bean': ['#e2ead9', '#6b8f52'],
  'hana-bay-coffee': ['#f3e3e0', '#c07f6b'],
  'paniolo-roasters': ['#ece5db', '#9a8560'],
  'kona-trading': ['#e6e2da', '#6f6a60'],
  'saltwater-espresso': ['#dee9ee', '#4a7b8c'],
  'volcano-drip': ['#e4e0dd', '#5a5a58'],
}

// ── Die Marken-Entitäten ───────────────────────────────────────────────────

const brandSeeds = [
  {
    slug: 'upcountry-roast',
    name: 'Upcountry Roast Co.',
    homepage: 'https://upcountry-roast.example',
    checkId: 'demo-check-upcountry-roast',
    industry: 'Kaffeerösterei',
    country: 'US',
    foundedYear: 2011,
    archetype: 'Der Entdecker',
    archetypeSecondary: 'Der Schöpfer',
    paletteId: 'demo-clay',
    state: 'published',
    relations: ['island-grind', 'pacific-bean'],
    marks: [
      { kind: 'symbol', text: 'Die Gratlinie auf jeder Tüte — die von Hand gezeichnete Röstkurve des ersten Durchgangs.', sourceIndex: 1 },
      { kind: 'claim', text: '„Above the cloud line" — Herkunft als Versprechen, nicht als Dekor.', sourceIndex: 0 },
    ],
    history: [
      { year: 2011, text: 'Erste Röstung oberhalb der Wolkengrenze; die Kurve wird zum Zeichen.', sourceIndex: 1 },
      { year: 2024, text: 'Rebranding: alles fällt weg außer dem Grat.', sourceIndex: 2 },
    ],
    sources: [
      { url: 'https://upcountry-roast.example/about', publisher: 'Upcountry Roast Co.', date: '2026-08-14', kind: 'brand-site', quote: 'We roast in small batches above the cloud line.' },
      { url: 'https://upcountry-roast.example/roasting', publisher: 'Upcountry Roast Co.', date: '2026-08-14', kind: 'brand-site', quote: 'The ridge line on our bags is the profile curve of our first roast, drawn by hand in 2011.' },
      { url: 'https://kona-herald.example/upcountry-ridge', publisher: 'Kona Herald', date: '2026-05-12', kind: 'press', quote: 'Upcountry kept the ridge and dropped everything else' },
    ],
  },
  {
    slug: 'island-grind',
    name: 'Island Grind',
    homepage: 'https://island-grind.example',
    checkId: 'demo-check-island-grind',
    industry: 'Kaffeebar',
    country: 'US',
    foundedYear: 2019,
    archetype: 'Der Rebell',
    paletteId: 'demo-lagoon',
    state: 'published',
    relations: ['upcountry-roast'],
    marks: [
      { kind: 'color', text: 'Lagunengrün als Signal, überall gleich — Becher, Awning, App.', sourceIndex: 0 },
    ],
    history: [
      { year: 2019, text: 'Erste Bar; der Becher ist von Anfang an das Plakat.', sourceIndex: 0 },
    ],
    sources: [
      { url: 'https://island-grind.example', publisher: 'Island Grind', date: '2026-07-30', kind: 'brand-site', quote: 'Loud on purpose. We put the cup first and the logo second.' },
    ],
  },
  {
    slug: 'pacific-bean',
    name: 'Pacific Bean Supply',
    homepage: 'https://pacificbean.example',
    checkId: 'demo-check-pacific-bean',
    industry: 'Großhandel',
    country: 'US',
    foundedYear: 2004,
    archetype: 'Der Fürsorgliche',
    paletteId: 'demo-fern',
    state: 'published',
    relations: ['upcountry-roast'],
    marks: [
      { kind: 'type', text: 'Eine einzige Grotesk über Lieferschein, Website und LKW.', sourceIndex: 0 },
    ],
    history: [
      { year: 2004, text: 'Gegründet als Belieferer für Cafés auf drei Inseln.', sourceIndex: 0 },
    ],
    sources: [
      { url: 'https://pacificbean.example/about', publisher: 'Pacific Bean Supply', date: '2026-08-02', kind: 'brand-site', quote: 'Pacific Bean Supply delivers wholesale coffee across the islands, six days a week.' },
    ],
  },
  {
    slug: 'kona-trading',
    name: 'Kona Trading',
    homepage: 'https://kona-trading.example',
    checkId: 'demo-check-kona-trading',
    industry: 'Rohkaffee',
    country: 'US',
    foundedYear: 1998,
    archetype: 'Der Herrscher',
    paletteId: 'demo-stone',
    state: 'published',
    relations: [],
    marks: [],
    history: [],
    sources: [
      { url: 'https://kona-trading.example', publisher: 'Kona Trading', date: '2026-06-19', kind: 'brand-site', quote: 'Kona Trading sources green coffee for roasters who prefer to stay quiet about their supply chain.' },
    ],
  },
  /**
   * DIE ENTFERNTE MARKE (Entscheidung 11, „ohne Diskussion gewährt").
   * Sie ist der Grund für die Lücke auf Platz 7 des Rankings — dieselbe
   * Tatsache an zwei Stellen, damit der Prototyp zeigt, dass sie
   * zusammenhängen.
   */
  {
    slug: 'volcano-drip',
    name: 'Volcano Drip Co.',
    homepage: 'https://volcano-drip.example',
    industry: 'Kaffeerösterei',
    country: 'US',
    state: 'removed',
    removedAt: '2026-09-02',
    removalReason: 'Wunsch der Eigentümerin — ohne Diskussion gewährt.',
    relations: [],
    marks: [],
    history: [],
    sources: [],
  },
  // Fünf weitere Zeilen, damit das Ranking zehn Plätze hat: nur Name, Branche
  // und Adresse — ein Ranking-Platz braucht eine Zeile (Prüfregel 6), aber
  // keine Recherche, die es nicht gibt.
  { slug: 'windward-coffee', name: 'Windward Coffee Works', homepage: 'https://windward-coffee.example', industry: 'Kaffeerösterei', country: 'US', state: 'published', checkId: 'demo-check-windward-coffee', sources: [] },
  { slug: 'lava-rock-cafe', name: 'Lava Rock Cafe', homepage: 'https://lava-rock-cafe.example', industry: 'Kaffeebar', country: 'US', state: 'published', checkId: 'demo-check-lava-rock-cafe', sources: [] },
  { slug: 'hana-bay-coffee', name: 'Hana Bay Coffee', homepage: 'https://hana-bay-coffee.example', industry: 'Kaffeebar', country: 'US', state: 'published', checkId: 'demo-check-hana-bay-coffee', sources: [] },
  { slug: 'paniolo-roasters', name: 'Paniolo Roasters', homepage: 'https://paniolo-roasters.example', industry: 'Kaffeerösterei', country: 'US', state: 'published', checkId: 'demo-check-paniolo-roasters', sources: [] },
  { slug: 'saltwater-espresso', name: 'Saltwater Espresso', homepage: 'https://saltwater-espresso.example', industry: 'Kaffeebar', country: 'US', state: 'published', checkId: 'demo-check-saltwater-espresso', sources: [] },
]

export const DEMO_BRANDS: readonly InsightsBrand[] = brandSeeds.map(seed => insightsBrandSchema.parse(seed))

export function demoBrand(slug: string): InsightsBrand | undefined {
  return DEMO_BRANDS.find(brand => brand.slug === slug)
}

export function demoBrandName(slug: string): string {
  return demoBrand(slug)?.name ?? slug
}

// ── Die Beiträge ───────────────────────────────────────────────────────────

const METHODOLOGY_SOURCE = {
  url: 'https://branding.supply/brand-check/methodik',
  kind: 'own-data' as const,
  quote: '',
}

const postSeeds = [
  {
    format: 'article',
    slug: 'was-kostet-ein-rebranding',
    state: 'published',
    baseLocale: 'de',
    titleDe: 'Was kostet ein Rebranding wirklich?',
    titleEn: 'What does a rebrand really cost?',
    dekDe: 'Die Frage aus tausend Kommentarspalten — beantwortet mit unseren eigenen Zahlen statt mit „kommt drauf an".',
    dekEn: 'The question from a thousand comment threads — answered with our own numbers instead of „it depends".',
    bodyDe: 'Ein Rebranding kostet selten, was der erste Voranschlag sagt. Wir haben nachgerechnet.',
    bodyEn: 'A rebrand rarely costs what the first quote says. We did the maths.',
    topics: ['rebranding'],
    readingMinutes: 7,
    publishedAt: '2026-09-04',
    translationReviewed: true,
    translatedAt: '2026-09-04',
    brandRefs: [{ brandId: 'upcountry-roast', checkId: 'demo-check-upcountry-roast' }],
    sources: [
      METHODOLOGY_SOURCE,
      { url: 'https://kona-herald.example/upcountry-ridge', publisher: 'Kona Herald', date: '2026-05-12', kind: 'press', quote: 'Upcountry kept the ridge and dropped everything else' },
    ],
  },
  {
    format: 'profile',
    slug: 'upcountry-roast',
    state: 'published',
    baseLocale: 'de',
    titleDe: 'Upcountry Roast Co. — die Marke, die den Grat behielt',
    titleEn: 'Upcountry Roast Co. — the brand that kept the ridge',
    dekDe: 'Ein Rebranding, das fast alles wegnimmt und genau ein Zeichen stehen lässt.',
    dekEn: 'A rebrand that removes almost everything and leaves exactly one mark standing.',
    bodyDe: 'Wer wenig besitzt, darf radikal schneiden. Wer viel besitzt, zahlt dafür.',
    bodyEn: 'Brands that own little may cut hard. Brands that own a lot pay for it.',
    topics: ['brand-analysis', 'rebranding'],
    readingMinutes: 6,
    publishedAt: '2026-09-02',
    translationReviewed: true,
    translatedAt: '2026-09-02',
    brandRefs: [{ brandId: 'upcountry-roast', checkId: 'demo-check-upcountry-roast' }],
    sources: [
      { url: 'https://upcountry-roast.example/about', publisher: 'Upcountry Roast Co.', date: '2026-08-14', kind: 'brand-site', quote: 'We roast in small batches above the cloud line.' },
      { url: 'https://kona-herald.example/upcountry-ridge', publisher: 'Kona Herald', date: '2026-05-12', kind: 'press', quote: 'Upcountry kept the ridge and dropped everything else' },
      METHODOLOGY_SOURCE,
    ],
  },
  {
    format: 'duel',
    slug: 'pacific-bean-vs-upcountry-roast',
    state: 'published',
    baseLocale: 'de',
    titleDe: 'Upcountry Roast Co. gegen Pacific Bean Supply',
    titleEn: 'Upcountry Roast Co. versus Pacific Bean Supply',
    dekDe: 'Zwei Wege durch denselben Markt: das Zeichen gegen die Zuverlässigkeit.',
    dekEn: 'Two routes through the same market: the mark against the reliability.',
    bodyDe: 'Wer Wiedererkennung sucht, lernt von Upcountry; wer Anschlussfähigkeit sucht, von Pacific Bean.',
    bodyEn: 'Look to Upcountry for recognition; look to Pacific Bean for fit.',
    topics: ['brand-strategy'],
    readingMinutes: 5,
    publishedAt: '2026-08-29',
    translationReviewed: true,
    translatedAt: '2026-08-29',
    brandRefs: [
      { brandId: 'upcountry-roast', checkId: 'demo-check-upcountry-roast' },
      { brandId: 'pacific-bean', checkId: 'demo-check-pacific-bean' },
    ],
    sources: [
      { url: 'https://upcountry-roast.example/roasting', publisher: 'Upcountry Roast Co.', date: '2026-08-14', kind: 'brand-site', quote: 'The ridge line on our bags is the profile curve of our first roast, drawn by hand in 2011.' },
      { url: 'https://pacificbean.example/about', publisher: 'Pacific Bean Supply', date: '2026-08-02', kind: 'brand-site', quote: 'Pacific Bean Supply delivers wholesale coffee across the islands, six days a week.' },
      METHODOLOGY_SOURCE,
    ],
    facts: [
      { key: 'founded', labelDe: 'Gegründet', labelEn: 'Founded', left: '2011', right: '2004', winner: 'tie', sourceIndex: 0 },
      { key: 'mark', labelDe: 'Zeichen', labelEn: 'Distinctive asset', left: 'Gratlinie, seit 2011', right: 'Wortmarke in einer Grotesk', winner: 'left', sourceIndex: 0 },
      { key: 'reach', labelDe: 'Verbreitung', labelEn: 'Reach', left: 'Eigene Röstung, zwei Läden', right: 'Belieferung auf drei Inseln, sechs Tage', winner: 'right', sourceIndex: 1 },
      { key: 'claim', labelDe: 'Claim', labelEn: 'Claim', left: '„Above the cloud line"', right: 'kein fester Claim belegt', winner: 'left', sourceIndex: 0 },
    ],
  },
  {
    format: 'ranking',
    slug: 'staerkste-auftritte-kaffee-2026',
    state: 'published',
    baseLocale: 'de',
    titleDe: 'Die zehn Kaffee-Marken mit dem stärksten Auftritt',
    titleEn: 'The ten coffee brands with the strongest presence',
    dekDe: 'Sortiert nach Brand Score, mit Methodik und je einem Satz Begründung.',
    dekEn: 'Sorted by brand score, with the method in the open and one sentence each.',
    bodyDe: 'Eingefroren am Stand des Tages. Eine Auffrischung erscheint als neue Ausgabe.',
    bodyEn: 'Frozen as of that day. A refresh appears as a new issue.',
    topics: ['brand-analysis'],
    readingMinutes: 4,
    publishedAt: '2026-08-25',
    translationReviewed: true,
    translatedAt: '2026-08-25',
    brandRefs: [],
    sources: [METHODOLOGY_SOURCE],
    ranking: {
      issue: 1,
      asOf: '2026-08-25',
      entries: [
        { rank: 1, brandId: 'upcountry-roast', checkId: 'demo-check-upcountry-roast', score: 88, reasonDe: 'Ein Zeichen, das ohne Namen trägt — und ein Rebranding, das nichts anderes verschont hat.', reasonEn: 'One mark that carries without the name — and a rebrand that spared nothing else.' },
        { rank: 2, brandId: 'island-grind', checkId: 'demo-check-island-grind', score: 81, reasonDe: 'Laut mit Absicht: die Farbe ist überall dieselbe, vom Becher bis zur App.', reasonEn: 'Loud on purpose: the same colour on the cup and in the app.' },
        { rank: 3, brandId: 'windward-coffee', checkId: 'demo-check-windward-coffee', score: 79, reasonDe: 'Ruhig, gleichmäßig, ohne Ausrutscher — die Konsistenz macht den Platz.', reasonEn: 'Quiet and even, no slips — consistency earns the place.' },
        { rank: 4, brandId: 'lava-rock-cafe', checkId: 'demo-check-lava-rock-cafe', score: 77, reasonDe: 'Das Erlebnis im Laden trägt die Marke weiter als jedes Plakat.', reasonEn: 'The room carries the brand further than any poster.' },
        { rank: 5, brandId: 'pacific-bean', checkId: 'demo-check-pacific-bean', score: 74, reasonDe: 'Handwerk und Verlässlichkeit; die Eigenständigkeit bleibt der schwächste Punkt.', reasonEn: 'Craft and reliability; distinctiveness stays the weakest point.' },
        { rank: 6, brandId: 'hana-bay-coffee', checkId: 'demo-check-hana-bay-coffee', score: 72, reasonDe: 'Ein klares Bild, das sich noch nicht überall gleich zeigt.', reasonEn: 'A clear picture that is not yet the same everywhere.' },
        { rank: 7, removed: true },
        { rank: 8, brandId: 'paniolo-roasters', checkId: 'demo-check-paniolo-roasters', score: 64, reasonDe: 'Starke Herkunft, unentschiedene Form.', reasonEn: 'Strong origin, undecided form.' },
        { rank: 9, brandId: 'kona-trading', checkId: 'demo-check-kona-trading', score: 58, reasonDe: 'Bewusst zurückhaltend — und damit von aussen kaum unterscheidbar.', reasonEn: 'Deliberately reticent — and hard to tell apart from outside.' },
        { rank: 10, brandId: 'saltwater-espresso', checkId: 'demo-check-saltwater-espresso', score: 54, reasonDe: 'Im Aufbau: die Teile sind da, das System noch nicht.', reasonEn: 'Developing: the parts are there, the system is not.' },
      ],
    },
  },
  {
    /**
     * DER ZUSTAND „ZWEITE FASSUNG FEHLT NOCH" (§3.2). Grundsprache Englisch,
     * `translationReviewed: false` — auf der deutschen Oberfläche steht
     * deshalb die englische Fassung mit Hinweis, und im Sprachfilter
     * „Deutsch" taucht der Beitrag NICHT auf. Ohne diesen einen Beitrag
     * bliebe die wichtigste Sicherung des Sprach-Modells unsichtbar.
     */
    format: 'article',
    slug: 'why-good-names-are-uncomfortable',
    state: 'published',
    baseLocale: 'en',
    titleDe: '',
    titleEn: 'Why good names are uncomfortable',
    dekDe: '',
    dekEn: 'Smooth names slide off. The best ones have an edge you catch on.',
    bodyEn: 'A name that everybody likes on day one is usually a name nobody remembers on day thirty.',
    topics: ['brand-language'],
    readingMinutes: 6,
    publishedAt: '2026-08-21',
    sources: [METHODOLOGY_SOURCE],
  },
  {
    format: 'article',
    slug: 'llms-txt-wie-ki-assistenten-zitieren',
    state: 'published',
    baseLocale: 'en',
    titleDe: 'llms.txt: Wie KI-Assistenten deine Marke zitieren',
    titleEn: 'llms.txt: how AI assistants quote your brand',
    dekDe: 'Der neue Auffindbarkeits-Kanal — und warum eure Foundation dafür schon bereitliegt.',
    dekEn: 'The new discoverability channel — and why your foundation is already fit for it.',
    bodyDe: 'Eine Datei, die sagt, was zitierfähig ist, spart dem Modell das Raten.',
    bodyEn: 'A file that says what is quotable saves the model the guesswork.',
    topics: ['seo-geo'],
    readingMinutes: 6,
    publishedAt: '2026-08-18',
    translationReviewed: true,
    translatedAt: '2026-08-19',
    sources: [METHODOLOGY_SOURCE],
  },
  {
    format: 'profile',
    slug: 'island-grind',
    state: 'published',
    baseLocale: 'de',
    titleDe: 'Island Grind — laut, jung, konsequent',
    titleEn: 'Island Grind — loud, young, consistent',
    dekDe: 'Eine Farbe, überall dieselbe: was Konsequenz einer kleinen Marke bringt.',
    dekEn: 'One colour, the same everywhere: what consistency buys a small brand.',
    bodyDe: 'Der Becher ist das Plakat. Alles andere folgt ihm.',
    bodyEn: 'The cup is the poster. Everything else follows it.',
    topics: ['visual-identity'],
    readingMinutes: 5,
    publishedAt: '2026-08-14',
    translationReviewed: true,
    translatedAt: '2026-08-14',
    brandRefs: [{ brandId: 'island-grind', checkId: 'demo-check-island-grind' }],
    sources: [
      { url: 'https://island-grind.example', publisher: 'Island Grind', date: '2026-07-30', kind: 'brand-site', quote: 'Loud on purpose. We put the cup first and the logo second.' },
      METHODOLOGY_SOURCE,
    ],
  },
  {
    format: 'article',
    slug: 'der-content-kompass',
    state: 'published',
    baseLocale: 'de',
    titleDe: 'Der Content-Kompass: drei Säulen statt Posting-Panik',
    titleEn: 'The content compass: three pillars instead of posting panic',
    dekDe: 'Warum „Was poste ich heute?" eine Strategie-Frage ist und keine Kreativ-Frage.',
    dekEn: 'Why „what do I post today?" is a strategy question, not a creative one.',
    bodyDe: 'Drei Säulen reichen. Die vierte ist meistens die, die niemand durchhält.',
    bodyEn: 'Three pillars are enough. The fourth is usually the one nobody keeps up.',
    topics: ['brand-strategy'],
    readingMinutes: 5,
    publishedAt: '2026-08-11',
    translationReviewed: true,
    translatedAt: '2026-08-11',
    sources: [METHODOLOGY_SOURCE],
  },
]

export const DEMO_POSTS: readonly InsightsPost[] = postSeeds.map(seed => insightsPostSchema.parse(seed))

export function demoPost(slug: string, format?: string): InsightsPost | undefined {
  return DEMO_POSTS.find(post => post.slug === slug && (!format || post.format === format))
}

/**
 * DER ENTWURF IM REDAKTIONS-SCREEN. Er steht bewusst auf `draft` und trägt
 * genau die Fehler, die die sechs Prüfregeln finden sollen: ein Zitat, das
 * NICHT in seiner Quelle steht, eine Fremdquelle ohne Datum wäre vom Schema
 * gar nicht angenommen worden (deshalb hier ein leerer Herausgeber-Fall über
 * die Prüfregel statt über das Schema), und eine genannte Marke ohne Zeile.
 */
export const DEMO_DRAFT: InsightsPost = insightsPostSchema.parse({
  format: 'profile',
  slug: 'pacific-bean',
  state: 'draft',
  baseLocale: 'de',
  titleDe: 'Pacific Bean Supply — verlässlich, aber unsichtbar',
  titleEn: '',
  dekDe: 'Sechs Tage die Woche derselbe Lieferschein — und von aussen kaum ein Zeichen.',
  dekEn: '',
  bodyDe: 'Die Marke arbeitet, aber sie spricht nicht. Das ist keine Schwäche des Betriebs, sondern eine der Form.',
  topics: ['brand-analysis'],
  readingMinutes: 5,
  draftModel: 'demo-modell',
  draftPromptVersion: 'insights-d-1',
  brandRefs: [
    { brandId: 'pacific-bean', checkId: 'demo-check-pacific-bean' },
    // Diese Marke hat KEINE Zeile — Prüfregel 6 muss das melden.
    { brandId: 'harbor-roasters', checkId: '' },
  ],
  sources: [
    // Das Zitat steht so NICHT in der Quelle (dort: „six days a week") —
    // die Beleg-Ampel muss rot werden.
    { url: 'https://pacificbean.example/about', publisher: 'Pacific Bean Supply', date: '2026-08-02', kind: 'brand-site', quote: 'Pacific Bean Supply delivers wholesale coffee across the islands, seven days a week.' },
    METHODOLOGY_SOURCE,
  ],
})

/** Was der Herabsetzungs-Filter im Prototyp beanstandet (Prüfregel 4). */
export const DEMO_FLAG_WORDS: readonly string[] = ['unsichtbar', 'billig', 'lieblos']

// ── Der Artikel-Text (Abschnitte + Inhaltsverzeichnis) ─────────────────────

/**
 * Im Produkt kommen Abschnitte und Verzeichnis aus dem gerenderten Markdown
 * (h2/h3 — mehr kennt `core/shared/markdown.ts` nicht, §9.5). Der Prototyp
 * reicht sie als Daten herein, damit die Sprungmarken echte Elemente haben
 * und der Scrollspy etwas zu beobachten hat.
 */
export interface DemoSection {
  id: string
  headingDe: string
  headingEn: string
  depth: 2 | 3
  paragraphsDe: readonly string[]
  paragraphsEn: readonly string[]
}

export const DEMO_ARTICLE_SECTIONS: readonly DemoSection[] = [
  {
    id: 'die-frage',
    headingDe: 'Die Frage hinter der Frage',
    headingEn: 'The question behind the question',
    depth: 2,
    paragraphsDe: [
      'Wer nach dem Preis eines Rebrandings fragt, fragt fast immer nach etwas anderem: nach dem Risiko. Ein neues Zeichen kostet nicht die Zeichnung, sondern alles, was danach umgestellt werden muss — und alles, was an Wiedererkennung verloren geht.',
      'Genau deshalb ist die ehrlichste Antwort keine Zahl, sondern eine Rechnung: je mehr eigenständige Zeichen eine Marke besitzt, desto teurer ist der radikale Schnitt.',
    ],
    paragraphsEn: [
      'Anyone asking what a rebrand costs is usually asking about something else: risk. A new mark does not cost the drawing, it costs everything that has to change afterwards — and everything recognition loses on the way.',
      'The honest answer is therefore not a number but a calculation: the more distinctive assets a brand owns, the more expensive the radical cut.',
    ],
  },
  {
    id: 'zwei-wege',
    headingDe: 'Zwei Wege, ein Markt',
    headingEn: 'Two routes, one market',
    depth: 3,
    paragraphsDe: [
      'Eine kleine Rösterei, die genau ein Zeichen besitzt, kann alles andere wegnehmen und wird dadurch klarer. Ein Großhändler ohne eigenes Zeichen gewinnt durch dieselbe Bewegung nichts — er hätte danach nur weniger.',
    ],
    paragraphsEn: [
      'A small roaster that owns exactly one mark can drop everything else and comes out clearer. A wholesaler without a mark of its own gains nothing from the same move — it would simply have less.',
    ],
  },
  {
    id: 'die-rechnung',
    headingDe: 'Die Rechnung, offengelegt',
    headingEn: 'The calculation, in the open',
    depth: 2,
    paragraphsDe: [
      'Unsere Zahlen kommen aus dem Brand-Check: acht Kategorien, 40 Prüfkriterien, jede Bewertung mit Beleg. Was hier steht, lässt sich nachrechnen — und die Methodik steht öffentlich daneben.',
    ],
    paragraphsEn: [
      'Our numbers come from the brand check: eight categories, 40 criteria, every rating with its evidence. What stands here can be recalculated — and the method is published next to it.',
    ],
  },
]

// ── Themenradar ────────────────────────────────────────────────────────────

/**
 * ERFUNDENE KANÄLE UND VIDEOS. Auch hier gilt die Regel des Marktvergleichs:
 * keine echten Kanäle, keine echten Titel — ein Prototyp, der eine reale
 * Aufrufzahl behauptet, ist eine Behauptung über einen Dritten.
 *
 * Gespeichert ist NUR, was §9.6 (a) erlaubt: Kanal, Titel, Aufrufe, Likes,
 * Kommentar-ZAHL, Datum. Keine Kommentar-Texte, keine Nutzernamen.
 */
const radarSeeds = [
  { videoId: 'demo-radar-1', channelId: 'demo-ch-1', channelTitle: 'The Brand Kitchen', channelSubscribers: 42_000, title: 'Why small roasters keep changing their logo', views: 58_400, likes: 3_100, commentCount: 214, publishedAt: '2026-08-30', fetchedAt: DEMO_TODAY, topic: 'rebranding' },
  { videoId: 'demo-radar-2', channelId: 'demo-ch-2', channelTitle: 'Type & Tell', channelSubscribers: 128_000, title: 'The wordmark test nobody runs', views: 96_500, likes: 5_400, commentCount: 402, publishedAt: '2026-08-12', fetchedAt: DEMO_TODAY, topic: 'visual-identity' },
  { videoId: 'demo-radar-3', channelId: 'demo-ch-3', channelTitle: 'Small Shop Strategy', channelSubscribers: 9_800, title: 'Three content pillars, one afternoon', views: 21_300, likes: 1_900, commentCount: 168, publishedAt: '2026-09-01', fetchedAt: DEMO_TODAY, topic: 'brand-strategy' },
  { videoId: 'demo-radar-4', channelId: 'demo-ch-1', channelTitle: 'The Brand Kitchen', channelSubscribers: 42_000, title: 'Naming: the edge you catch on', views: 30_900, likes: 2_200, commentCount: 97, publishedAt: '2026-06-04', fetchedAt: DEMO_TODAY, topic: 'brand-language' },
  { videoId: 'demo-radar-5', channelId: 'demo-ch-4', channelTitle: 'Search & Signal', channelSubscribers: 71_500, title: 'Do AI assistants read your site at all?', views: 44_100, likes: 2_600, commentCount: 331, publishedAt: '2026-07-18', fetchedAt: DEMO_TODAY, topic: 'seo-geo' },
]

export const DEMO_RADAR: readonly InsightsRadarVideo[] = radarSeeds.map(seed => insightsRadarVideoSchema.parse(seed))

/**
 * Nähe zu unseren acht Clustern (0–1) — in I4 aus einer Schlagwortliste.
 *
 * `demo-radar-4` FEHLT ABSICHTLICH. Die Opportunity-Zahl ist seit dem
 * 2026-09-08 auf 100 genormt und trägt ihre Belastbarkeit in der Fussnote
 * („aus n von 5 Signalen"); eine Fussnote, in der `n` nie schwankt, beweist
 * nichts. Diese eine Zeile zeigt den Fall „aus 2 von 5" — und dass ein
 * fehlendes Signal FEHLT, statt als 0.5 geraten zu werden.
 */
export const DEMO_RELEVANCE: Record<string, number> = {
  'demo-radar-1': 0.95,
  'demo-radar-2': 0.7,
  'demo-radar-3': 0.85,
  'demo-radar-5': 0.9,
}
