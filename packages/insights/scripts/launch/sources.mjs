/**
 * QUELLEN-BAUSTEINE DES LAUNCH-INHALTS (BI1 I6) — reine Daten, kein Abruf.
 *
 * Jede Quelle trägt GENAU EIN Zitat, wörtlich aus der Seite, wie sie der
 * Beleg-Prüfer sieht (`fetchBrandSiteForCheck` → Titel + Description + Text,
 * Text auf 20 000 Zeichen gedeckelt). Deshalb stehen manche Zitate mit einem
 * Leerzeichen vor einem Satzzeichen oder um ein Wort in Anführungszeichen da:
 * dort sass im Original ein Link, und der Prüfer ersetzt jedes Tag durch ein
 * Leerzeichen. „Schöner" zitiert hiesse: nicht mehr belegbar.
 *
 * Abrufdatum aller Quellen: 2026-10-28. Ändert sich eine Seite, schlägt die
 * Beleg-Prüfung vor `review` an — das ist gewollt, nicht ein Fehler des Seeds.
 */

export const ABRUF = '2026-10-28'

/** CC BY-SA 4.0 — Pflicht bei jeder Wikipedia-Quelle (§4.1 c). */
export const WIKIPEDIA_LICENSE = 'https://creativecommons.org/licenses/by-sa/4.0/'

/** Eine Wikipedia-Seite als Fremdquelle (Herausgeber, Datum, Lizenz). */
export function wiki(url, quote) {
  return { url, publisher: 'Wikipedia', date: ABRUF, kind: 'wikipedia', quote, license: WIKIPEDIA_LICENSE }
}

/** Die Eigenaussage einer Marke auf ihrer eigenen Website (§4.1 a). */
export function site(url, publisher, quote) {
  return { url, publisher, date: ABRUF, kind: 'brand-site', quote, license: '' }
}

// ── Die Adressen, einmal — damit zwei Zitate derselben Seite dieselbe URL tragen
//    (der Server ruft jede Adresse nur EINMAL ab, s. `insightsSourceTexts`).

export const URL = {
  nikeHome: 'https://www.nike.com/',
  nikeAbout: 'https://about.nike.com/en',
  nikeCompany: 'https://about.nike.com/en/company',
  nikeWikiEn: 'https://en.wikipedia.org/wiki/Nike,_Inc.',
  nikeWikiDe: 'https://de.wikipedia.org/wiki/Nike_Inc.',
  adidasWikiEn: 'https://en.wikipedia.org/wiki/Adidas',
  adidasWikiDe: 'https://de.wikipedia.org/wiki/Adidas',
  ikeaGlobal: 'https://www.ikea.com/global/en/',
  ikeaBusiness: 'https://www.ikea.com/global/en/our-business/',
  ikeaAboutUs: 'https://www.ikea.com/us/en/this-is-ikea/about-us/',
  ikeaAboutDe: 'https://www.ikea.com/de/de/this-is-ikea/about-us/',
  ikeaWikiEn: 'https://en.wikipedia.org/wiki/IKEA',
  ikeaWikiDe: 'https://de.wikipedia.org/wiki/IKEA',
  appleHome: 'https://www.apple.com/',
  anthropicCompany: 'https://www.anthropic.com/company',
  theBarnHome: 'https://thebarn.de/',
}
