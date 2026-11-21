/**
 * DIE PREISE DER POOL-PLÄNE — die EINE Zahl (Q11, GEO-002).
 *
 * Bis 2026-11-21 stand diese Tabelle in `PricingSection.vue`. Seit Preise auch
 * in den strukturierten Daten der Startseite und in `/llms.txt` stehen, lesen
 * alle drei von hier — eine zweite Zahl im Code wäre die, die man beim
 * nächsten Preiswechsel vergisst, und eine falsche Preisangabe gegenüber einer
 * Antwortmaschine ist teurer als eine falsche Beschriftung.
 *
 * Cent-Beträge = Stripe-Katalog (`scripts/stripe/ensure-prices.mjs`, P4,
 * Davids Entscheidung 2026-07-26). `yearly` ist der Jahresbetrag (exakt −25 %
 * gegenüber zwölf Monaten); die Preisseite zeigt ihn als `yearly / 12` je Monat.
 *
 * NUR die zwei kaufbaren Pläne: `basic` ist kein Angebot (F49), Enterprise ist
 * kein Plan-Key, sondern das Studio-Angebot nach Maß.
 */
export const PLAN_PRICE_KEYS = ['personal', 'pro'] as const

export type PricedPlanKey = (typeof PLAN_PRICE_KEYS)[number]

export const PLAN_PRICES_CENTS: Readonly<Record<PricedPlanKey, { monthly: number, yearly: number }>> = {
  personal: { monthly: 2900, yearly: 26100 },
  pro: { monthly: 14900, yearly: 134100 },
}

export const PLAN_PRICE_CURRENCY = 'EUR'

/** Ein Cent-Betrag als schema.org-Preis: Punkt, zwei Stellen (`29.00`). */
export function schemaPrice(cents: number): string {
  return (cents / 100).toFixed(2)
}

/**
 * Die Angebote der Pläne als schema.org-`Offer` (je Plan ein Angebot, darin
 * Monats- und Jahresplan als `UnitPriceSpecification`, beide je Monat
 * wie auf der Preisseite). OHNE Steuer-Angabe
 * und OHNE Anbieter: beides wartet auf die rechtliche Klärung (OPEN-ITEMS).
 */
export function planOffersJsonLd(names: Readonly<Record<PricedPlanKey, string>>, url: string) {
  return PLAN_PRICE_KEYS.map(key => ({
    '@type': 'Offer',
    'name': names[key],
    'url': url,
    'price': schemaPrice(PLAN_PRICES_CENTS[key].monthly),
    'priceCurrency': PLAN_PRICE_CURRENCY,
    'priceSpecification': [
      { '@type': 'UnitPriceSpecification', 'price': schemaPrice(PLAN_PRICES_CENTS[key].monthly), 'priceCurrency': PLAN_PRICE_CURRENCY, 'billingDuration': 'P1M', 'unitCode': 'MON' },
      // Wie auf der Preisseite: der Jahresplan als Betrag JE MONAT, gebucht für ein Jahr.
      { '@type': 'UnitPriceSpecification', 'price': schemaPrice(PLAN_PRICES_CENTS[key].yearly / 12), 'priceCurrency': PLAN_PRICE_CURRENCY, 'billingDuration': 'P1Y', 'unitCode': 'MON' },
    ],
  }))
}
