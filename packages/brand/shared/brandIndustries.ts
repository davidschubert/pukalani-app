/**
 * DIE BRANCHEN DES BRAND-CHECKS (docs/archiv/BRAND-CHECK-SEITE.md §3 und §8.2) —
 * eine GESCHLOSSENE Liste, pur, ohne h3, ohne Appwrite, ohne Vue.
 *
 * ── WARUM GESCHLOSSEN, OBWOHL DIE STARTKARTE FREITEXT NIMMT ───────────────
 * `brand_profiles.industry` ist bewusst ein FREIER Text mit Vorschlägen
 * (`shared/industrySuggestions.ts`): dort schreibt ein Mensch über SEINE eigene
 * Marke, und die interessanten Marken stehen selten in zehn Kästchen.
 *
 * Hier ist die Frage eine andere. Die Branche des Checks ist ein FILTER über
 * fremde Auftritte („zeig mir die Agenturen") und eine Spalte, nach der
 * sortiert und gezählt wird. Ein Freitext ergäbe dort drei Schreibweisen für
 * dasselbe Gewerbe, und ein Filter, der „Agentur", „Agency" und „agentur &
 * beratung" nicht zusammenbringt, ist kein Filter. Deshalb: feste Ids,
 * vergeben vom Modell im ohnehin bezahlten Judge-Aufruf (§8.2), korrigierbar
 * über den Korrekturvorschlag-Weg (§3b).
 *
 * ── DIE IDS SIND ENGLISCH UND STABIL ──────────────────────────────────────
 * Sie stehen in gespeicherten Zeilen und in Adresszeilen (`?industry=agency`).
 * Umbenennen hiesse: Bestandszeilen umschreiben UND geteilte Links brechen.
 * Englisch, weil sie zugleich PROMPT-MATERIAL sind — das Modell wählt aus
 * genau dieser Liste (dieselbe Trennung wie beim Kriterien-Katalog: die Regeln
 * sprechen die Sprache des Modells, die Überschriften die des Lesers).
 *
 * ── DIE LABELS LEBEN IM CLIENT ────────────────────────────────────────────
 * Der Frontend-Lauf (P3) legt je Id einen i18n-Schlüssel `brand.industry.<id>`
 * an — in de.json UND en.json, für ALLE Ids dieser Datei einschliesslich
 * `unknown`. Ein zweisprachiger Katalog hier wäre eine dritte
 * Übersetzungsstelle neben den beiden Locale-Dateien.
 *
 * ── `unknown` IST KEIN AUSFALL, SONDERN EIN BEFUND ────────────────────────
 * Es heisst „aus dieser Startseite ging die Branche nicht hervor" — und das
 * ist über einen Auftritt eine Aussage, keine Lücke. Es steht deshalb IN der
 * Liste (Bestandszeilen aus der Zeit vor brand-017 tragen es ebenfalls) und
 * ist zugleich der Spalten-Vorgabewert.
 */

/**
 * DIE SECHZEHN. Reihenfolge = Anzeigereihenfolge des Filters; sie ist grob
 * nach Häufigkeit im Zielmarkt sortiert und nicht alphabetisch, damit die
 * ersten Einträge die sind, die jemand sucht.
 *
 * `other` und `unknown` sind ZWEI verschiedene Aussagen und werden nicht
 * zusammengelegt: `other` heisst „die Branche war klar erkennbar und ist keine
 * der fünfzehn", `unknown` heisst „sie war nicht erkennbar". Ein gemeinsamer
 * Topf verlöre genau den Unterschied, an dem man sieht, ob die Liste eine
 * Lücke hat.
 */
export const BRAND_INDUSTRIES = [
  'agency',
  'software',
  'ecommerce',
  'consulting',
  'craft',
  'food',
  'hospitality',
  'health',
  'finance',
  'education',
  'creative',
  'realestate',
  'manufacturing',
  'nonprofit',
  'personal',
  'other',
] as const

export type BrandIndustry = typeof BRAND_INDUSTRIES[number]

/** Die Antwort „aus dieser Seite ging es nicht hervor" (s. Kopf). */
export const BRAND_INDUSTRY_UNKNOWN = 'unknown'

/** Alle gültigen Spaltenwerte — die sechzehn PLUS `unknown`. */
export const BRAND_INDUSTRY_VALUES: readonly string[] = [
  ...BRAND_INDUSTRIES,
  BRAND_INDUSTRY_UNKNOWN,
]

/**
 * KURZE HINWEISE FÜR DAS MODELL — nur dort, wo die blosse Id mehrdeutig ist.
 *
 * Sie gehen wörtlich in den Systemprompt (`brandCheckJudgeSystemPrompt`). Wer
 * hier etwas ändert, ändert damit ausdrücklich, was das Modell gefragt wird —
 * genau wie bei den `rule`-Texten des Kriterien-Katalogs.
 *
 * Ids ohne Eintrag stehen ohne Erläuterung im Prompt: „software" oder
 * „education" erklärt sich, „personal" nicht.
 */
export const BRAND_INDUSTRY_HINTS: Readonly<Record<string, string>> = {
  agency: 'agencies, studios, marketing and design services',
  ecommerce: 'online shops and retail',
  craft: 'trades and handwork (builders, electricians, carpenters)',
  food: 'food producers, roasters, bakeries, breweries',
  hospitality: 'restaurants, cafes, hotels, travel',
  health: 'medical, care, therapy, fitness, wellbeing',
  finance: 'finance, insurance, legal and tax services',
  creative: 'arts, culture, music, media, publishing',
  realestate: 'real estate and construction',
  manufacturing: 'industry, manufacturing, engineering, logistics',
  personal: 'a single person selling themselves (coach, freelancer, artist, portfolio)',
  other: 'clearly recognisable but none of the above',
  [BRAND_INDUSTRY_UNKNOWN]: 'the page does not make the industry clear',
}

/** Ein bekannter Wert der SPALTE (die sechzehn oder `unknown`) — nie geraten. */
export function isBrandIndustryValue(value: unknown): boolean {
  return typeof value === 'string' && BRAND_INDUSTRY_VALUES.includes(value)
}

/**
 * DIE ANTWORT DES MODELLS IN EINEN SPALTENWERT ÜBERSETZEN.
 *
 * Alles Unbekannte wird `unknown` — auch ein leeres Feld, auch eine erfundene
 * Branche, auch `null`. Das ist dieselbe Nachsicht wie bei den Urteilen: eine
 * fremde Id wird verworfen, statt die Zeile zu kosten. Gross-/Kleinschreibung
 * wird eingeebnet, Rand-Leerzeichen fallen weg — ein Modell, das „Agency"
 * schreibt, hat die Frage beantwortet.
 */
export function normalizeBrandIndustry(value: unknown): string {
  if (typeof value !== 'string') return BRAND_INDUSTRY_UNKNOWN
  const lowered = value.trim().toLowerCase()
  return BRAND_INDUSTRY_VALUES.includes(lowered) ? lowered : BRAND_INDUSTRY_UNKNOWN
}

/**
 * DIE LISTE, WIE SIE IM PROMPT STEHT — eine Zeile je Id, Hinweis in Klammern.
 *
 * Sie wird aus DIESER Datei gebaut und nicht daneben gepflegt: eine zweite,
 * abgeschriebene Liste im Prompt wäre beim ersten neuen Gewerbe eine Liste, aus
 * der das Modell etwas wählt, das die Spalte nicht kennt.
 */
export function brandIndustryPromptList(): string {
  return BRAND_INDUSTRY_VALUES
    .map((id) => {
      const hint = BRAND_INDUSTRY_HINTS[id]
      return hint ? `- ${id} (${hint})` : `- ${id}`
    })
    .join('\n')
}
