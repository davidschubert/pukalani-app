/**
 * DER EINE PREIS DIESER SITE (PS1, 2026-09-09).
 *
 * ── WARUM EINE KONSTANTE UND KEIN TEXT IN DER LOCALE-DATEI ────────────────
 * Der Betrag steht auf ZWEI Marketing-Seiten (Marktvergleich und Book & Kit —
 * „ein Preis, zweimal genannt", Plan docs/archiv/PRODUCTS-SEITE.md §5) und wird
 * mit Paket Z1 ein DRITTES Mal gebraucht, dann im Stripe-Katalog. Stünde er
 * als Zeichenkette in `de.json` und `en.json`, wären das vier Orte, an denen
 * eine Preisänderung stimmen muss — und der Katalog wäre der eine, den man
 * vergisst. Deshalb: EINE Zahl hier, formatiert je Sprache, als `{price}` in
 * die i18n-Zeile gegeben.
 *
 * ── NETTO, UND DAS GEHÖRT IN DEN NAMEN ────────────────────────────────────
 * branding.supply ist ein B2B-Angebot (BS1 §9 Zeile 9, `auth.businessOnly`),
 * die Preise sind Netto-Preise zzgl. USt. Ein `PRICE_EUR` ohne dieses Wort
 * wäre die Sorte Konstante, bei der später jemand raten muss.
 *
 * ── WOHER DER BETRAG KOMMT ────────────────────────────────────────────────
 * Davids Entscheidung vom 2026-09-09 (BS1 §9.2 / BK1 §1.11 d): 149 € netto je
 * Branding, einmalig, für „die Ableitung" — Marktvergleich UND Book & Kit
 * zusammen, nicht zweimal. Paket Z1 verdrahtet ihn mit dem Stripe-Katalog
 * (`scripts/stripe/…`); bis dahin ist er eine Marketing-Aussage, hinter der
 * das Erstgespräch steht. Die SCHRANKE in der Werkstatt bleibt davon
 * unberührt: `market.paywall.price` sagt weiterhin „Preis im Erstgespräch"
 * (Plan §5, Nachtrag zu BS1 §9.2 — die Aufhebung gilt nur den
 * Marketing-Seiten).
 */
export const DERIVATION_PRICE_EUR_NET = 149

/**
 * Der Betrag, wie ein Mensch ihn liest — „149 €" auf Deutsch, „€149" auf
 * Englisch. OHNE Nachkommastellen, weil es keine gibt und „149,00 €" nach
 * Rechnung aussieht statt nach Angebot.
 *
 * `Intl` und keine Handarbeit: die Stellung von Zeichen und Zahl ist je
 * Sprache verschieden, und genau das ist die Art Detail, die man von Hand
 * einmal richtig und beim nächsten Sprachwechsel falsch macht.
 */
export function formatDerivationPrice(locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(DERIVATION_PRICE_EUR_NET)
}

/** Die fünf Produkte mit eigener Seite (Reihenfolge der Übersicht). */
export type BrandingProductKey = 'brandCheck' | 'brandFoundation' | 'marketComparison' | 'brandDesign' | 'brandBookKit'

/**
 * WAS DIE PRODUKTSEITE ÜBER DEN PREIS SAGT, als Zahl für die strukturierten
 * Daten (Q11, GEO-002) — `0` = „kostenlos", `null` = die Seite nennt keinen
 * eigenen Preis (Brand Design: nach dem Erstgespräch; Book & Kit: im Preis der
 * Ableitung enthalten). Der Betrag der Ableitung kommt aus der Konstante oben,
 * keine zweite Zahl. Ein Test hält die Zeilen gegen die Preis-Texte der Seiten
 * (`tests/productPricing.test.ts`).
 */
export const PRODUCT_PRICE_EUR: Readonly<Record<BrandingProductKey, number | null>> = {
  brandCheck: 0,
  brandFoundation: 0,
  marketComparison: DERIVATION_PRICE_EUR_NET,
  brandDesign: null,
  brandBookKit: null,
}

/**
 * Das schema.org-`Offer` eines Produkts, oder `null`. OHNE Steuer-Angabe und
 * OHNE Anbieter: beides wartet auf die rechtliche Klärung (OPEN-ITEMS) — der
 * sichtbare Text („netto") bleibt die Stelle, die das sagt.
 */
export function productOfferJsonLd(key: BrandingProductKey, url: string) {
  const price = PRODUCT_PRICE_EUR[key]
  if (price === null) return null
  return { '@type': 'Offer' as const, 'price': price.toFixed(2), 'priceCurrency': 'EUR', 'url': url }
}
