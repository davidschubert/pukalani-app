/**
 * DER EINE PREIS DIESER SITE (PS1, 2026-09-09).
 *
 * ── WARUM EINE KONSTANTE UND KEIN TEXT IN DER LOCALE-DATEI ────────────────
 * Der Betrag steht auf ZWEI Marketing-Seiten (Marktvergleich und Book & Kit —
 * „ein Preis, zweimal genannt", Plan docs/plans/PRODUCTS-SEITE.md §5) und wird
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
