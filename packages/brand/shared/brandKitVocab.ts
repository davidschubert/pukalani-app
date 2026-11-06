/**
 * DIE VOKABULARE VON BRAND BOOK & KIT — die kontrollierten Mengen, aus denen
 * Schicht 3 ihre Werte nimmt (Konzept docs/plans/BRAND-BOOK-KIT.md §2.2–§2.4,
 * Paket K0).
 *
 * ── WARUM ES SIE GIBT ─────────────────────────────────────────────────────
 * Dieselbe Begründung wie bei `brandDesignVocab.ts`: was hier steht, muss ein
 * EXPORT belegen können. `m.types` entscheidet, für welche Produkttypen es
 * überhaupt ein Namensmuster gibt; `n.scope` und `n.review` stehen wörtlich in
 * `brand.md` und `brand.json` (§2.6) und werden dort von einer MASCHINE
 * gelesen. Ein frei getippter Umfang („eigentlich nur Social, ausser bei
 * Kampagnen") wäre in der Datei ein Satz, den kein Agent auswerten kann.
 *
 * ── DIESE DATEI IST PUR ───────────────────────────────────────────────────
 * Kein i18n, kein H3, kein Appwrite, keine Layer-Importe. Die LABEL stehen
 * hier zweisprachig und NICHT als i18n-Schlüssel — dieselbe Auflösung wie in
 * `brandDesignVocab.ts`, `brandChoiceOptions.ts` und `brandAdvisors.ts`: die
 * Namen reisen in den Prompt (Server, ohne vue-i18n) UND in gespeicherte
 * Werte, sie werden also nicht aus einem Katalog gerendert. Die Ids sind die
 * Wahrheit, die Labels sind ihre Lesefassung.
 *
 * ── DIE IDS SIND UNVERÄNDERLICH ───────────────────────────────────────────
 * Wie eine Slot-Id: sie stehen in `brand_steps.slots` und später in jeder
 * ausgelieferten Datei. Ein Wert, der nicht mehr gebraucht wird, bleibt in der
 * Liste stehen; ein Rename wäre eine stille Datenlöschung.
 *
 * K0: Ids und Struktur sind aus dem freigegebenen Prototyp übernommen
 * (`.playground/app/utils/demoKit.ts`: `DK_NAME_TYPES`, `DK_AI_SCOPE`,
 * `DK_AI_REVIEW`, wörtlich); die englischen Labels und die Hinweiszeilen sind
 * eine erste Fassung — **Davids Inhalts-Gate ist K5** (§2.18).
 */

/**
 * Ein kontrollierter Wert: stabile Id, Lesefassung je Oberflächen-Sprache und
 * die eine Zeile, die auf der Karte darunter steht.
 *
 * Er trägt die Hinweiszeile ANDERS als `BrandDesignTerm` (dort steht sie an
 * der Dimension, nicht am Wert): die drei Kataloge hier werden als KARTEN
 * bzw. CHIPS mit Erklärung gewählt (§2.7), und eine Karte ohne ihren Satz ist
 * eine Vokabel, die der Mensch raten muss.
 */
export interface BrandKitTerm {
  readonly id: string
  readonly de: string
  readonly en: string
  /** Was diese Wahl bedeutet — eine Zeile, kein Absatz. */
  readonly noteDe: string
  readonly noteEn: string
  /** Die Voreinstellung bzw. Empfehlung dieser Menge — höchstens eine je Liste. */
  readonly recommended?: true
}

/**
 * DIE FÜNF PRODUKTTYPEN (§2.2, `m.types`) — MEHRFACHWAHL.
 *
 * Sie beantworten „wofür braucht ihr überhaupt Namen?", nicht „was verkauft
 * ihr". Deshalb steht hier `place` neben `digital`: ein zweiter Ausschank und
 * ein Newsletter sind beides Dinge, die einen Namen bekommen — und beide
 * bekämen ohne Muster irgendeinen.
 */
export const BRAND_NAME_TYPES: readonly BrandKitTerm[] = [
  {
    id: 'product',
    de: 'Produkt',
    en: 'Product',
    noteDe: 'Was ihr herstellt oder verkauft — das, was am Ende in der Hand liegt.',
    noteEn: 'What you make or sell — the thing that ends up in someone’s hand.',
  },
  {
    id: 'service',
    de: 'Dienstleistung',
    en: 'Service',
    noteDe: 'Leistungen mit Termin: Beratung, Schulung, Wartung, Abo.',
    noteEn: 'Work with an appointment: advice, training, maintenance, a subscription.',
  },
  {
    id: 'program',
    de: 'Programm / Format',
    en: 'Programme or format',
    noteDe: 'Wiederkehrendes mit eigenem Namen: Kurse, Reihen, Feste.',
    noteEn: 'Recurring things with a name of their own: courses, series, events.',
  },
  {
    id: 'place',
    de: 'Ort / Filiale',
    en: 'Place or location',
    noteDe: 'Jeder Ort, den man betreten kann — heute einer, später mehrere.',
    noteEn: 'Any place people can walk into — one today, more of them later.',
  },
  {
    id: 'digital',
    de: 'Digital',
    en: 'Digital',
    noteDe: 'Alles mit einer Adresse: Shop, App, Newsletter, Werkzeug.',
    noteEn: 'Anything with an address: shop, app, newsletter, tool.',
  },
]

/**
 * WAS KI IM NAMEN DER MARKE ERZEUGEN DARF (§2.3, `n.scope`) — EINE Wahl.
 *
 * Die vier Stufen sind absteigend geordnet, und das ist Absicht: die
 * grosszügigste Fassung steht oben, weil sie die empfohlene ist (§1.7 — „der
 * Mensch entscheidet zuletzt" ist die Freigabe-Regel `n.review`, nicht ein
 * Verbot zu entwerfen). Wer strenger sein will, liest nach unten weiter.
 */
export const BRAND_AI_SCOPES: readonly BrandKitTerm[] = [
  {
    id: 'drafts',
    de: 'Entwürfe für alles',
    en: 'Drafts for everything',
    noteDe: 'KI darf jeden Text vorschlagen — Website, Social, Mail, Verpackung. Veröffentlicht wird nichts ohne Mensch.',
    noteEn: 'AI may draft any text — website, social, mail, packaging. Nothing goes out without a human.',
    recommended: true,
  },
  {
    id: 'text-only',
    de: 'Nur Text',
    en: 'Text only',
    noteDe: 'Texte ja, Bilder und Zeichen nie. Passt zu Marken, deren Bildsprache an Fotografie hängt.',
    noteEn: 'Text yes, images and marks never. Fits brands whose imagery rests on photography.',
  },
  {
    id: 'internal',
    de: 'Nur intern',
    en: 'Internal only',
    noteDe: 'Notizen, Zusammenfassungen, Übersetzungen — nichts, was ein Kunde je sieht.',
    noteEn: 'Notes, summaries, translations — nothing a customer will ever see.',
  },
  {
    id: 'none',
    de: 'Nichts Kundenseitiges',
    en: 'Nothing customer-facing',
    noteDe: 'Die strengste Fassung: KI bleibt aus der Marke heraus. Ehrlich, aber teuer im Alltag.',
    noteEn: 'The strictest version: AI stays out of the brand. Honest, but expensive day to day.',
  },
]

/**
 * DIE FREIGABE-REGEL (§2.3, `n.review`) — EINE Wahl.
 *
 * Sie ist die zweite Hälfte der Auskunft und nie dieselbe Frage wie der
 * Umfang: „KI darf alles entwerfen" und „jede Veröffentlichung liest ein
 * Mensch" sind zusammen die empfohlene Kombination, nicht ein Widerspruch.
 */
export const BRAND_AI_REVIEWS: readonly BrandKitTerm[] = [
  {
    id: 'every',
    de: 'Jede Veröffentlichung durch einen Menschen',
    en: 'Every publication reviewed by a human',
    noteDe: 'Eine Person liest, bevor es rausgeht — und trägt es dann auch.',
    noteEn: 'One person reads it before it goes out — and then owns it.',
    recommended: true,
  },
  {
    id: 'sample',
    de: 'Stichprobe',
    en: 'Spot check',
    noteDe: 'Jeder fünfte Text wird geprüft. Schneller, aber der Fehler steht dann schon draussen.',
    noteEn: 'Every fifth text gets read. Faster, but by then the mistake is already out there.',
  },
  {
    id: 'channel',
    de: 'Kanal-abhängig',
    en: 'Depends on the channel',
    noteDe: 'Website und Verpackung immer, Social nur stichprobenartig.',
    noteEn: 'Website and packaging always, social only as a spot check.',
  },
]

/**
 * DIE INVARIANTEN DER DREI KATALOGE als prüfbare Funktion — sie nimmt
 * BELIEBIGE Listen, damit der Beweis mutierte Fassungen vorlegen kann (eine
 * Prüfung, die nur den richtigen Katalog kennt, ist immer grün und beweist
 * nichts; dieselbe Regel wie `validateSlotRegistry`).
 *
 * Gibt die Befunde als Zeilen zurück, leeres Array = in Ordnung.
 */
export function validateBrandKitVocab(
  catalogues: Readonly<Record<string, readonly BrandKitTerm[]>> = {
    'm.types': BRAND_NAME_TYPES,
    'n.scope': BRAND_AI_SCOPES,
    'n.review': BRAND_AI_REVIEWS,
  },
): readonly string[] {
  const problems: string[] = []

  for (const [name, terms] of Object.entries(catalogues)) {
    if (terms.length < 2) {
      problems.push(`${name}: ${terms.length} Werte — eine Menge mit weniger als zwei ist keine Wahl`)
    }
    const seen = new Set<string>()
    let recommended = 0
    for (const term of terms) {
      if (seen.has(term.id)) problems.push(`${name}: doppelte Id ${term.id}`)
      seen.add(term.id)
      // Die Ids reisen in Dateien, die eine Maschine liest (§2.6) — sie sind
      // deshalb englisch, klein und ohne Leerzeichen. Ein „Ort / Filiale" als
      // Id stünde so in `brand.json`.
      if (!/^[a-z][a-z0-9-]*$/.test(term.id)) {
        problems.push(`${name}: Id "${term.id}" ist nicht klein-englisch mit Bindestrich`)
      }
      if (!term.de.trim() || !term.en.trim()) problems.push(`${name}.${term.id}: Label unvollständig`)
      if (!term.noteDe.trim() || !term.noteEn.trim()) {
        problems.push(`${name}.${term.id}: Hinweiszeile unvollständig`)
      }
      if (term.recommended) recommended += 1
    }
    // Zwei Empfehlungen sind keine Empfehlung — die Karte müsste dann sagen,
    // welche der beiden gemeint ist, und genau das kann sie nicht.
    if (recommended > 1) problems.push(`${name}: ${recommended} Empfehlungen — höchstens eine`)
  }

  return problems
}
