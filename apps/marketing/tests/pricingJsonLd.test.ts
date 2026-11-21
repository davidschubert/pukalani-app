/**
 * PREISE IN DEN STRUKTURIERTEN DATEN (Q11, GEO-002).
 *
 * Die Startseite nennt die zwei Pläne als `offers`, aus DERSELBEN Quelle wie
 * die Preistabelle (`PLAN_PRICES_CENTS`). Die Erwartungen stehen hier
 * AUSGESCHRIEBEN (29 €, 21,75 €, 149 €, 111,75 €), nicht aus der Quelle
 * gerechnet — sonst wäre die Prüfung immer grün (Beweis-Regel 1).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PLAN_PRICES_CENTS, planOffersJsonLd } from '#shared/marketing'

const APP = join(__dirname, '..')
const offers = planOffersJsonLd({ personal: 'Personal', pro: 'Pro' }, 'https://pukalani.app/#preise')

/** Preise je Plan als `{ monatlich, jährlich je Monat }` aus einem Angebots-Block. */
function pricesOf(list: unknown): Record<string, [string, string]> {
  const parsed = JSON.parse(JSON.stringify(list)) as Array<{ name: string, priceSpecification: Array<{ price: string, billingDuration: string }> }>
  return Object.fromEntries(parsed.map(offer => [
    offer.name,
    [offer.priceSpecification.find(spec => spec.billingDuration === 'P1M')!.price, offer.priceSpecification.find(spec => spec.billingDuration === 'P1Y')!.price],
  ]))
}

describe('Startseite: Preise als schema.org-Angebote', () => {
  it('zwei Pläne mit den Preisen der Preistabelle', () => {
    expect(pricesOf(offers)).toEqual({ Personal: ['29.00', '21.75'], Pro: ['149.00', '111.75'] })
    for (const offer of offers) {
      expect(offer['@type']).toBe('Offer')
      expect(offer.priceCurrency).toBe('EUR')
    }
  })

  it('kein basic, kein Anbieter, keine Steuer-Angabe (wartet auf die rechtliche Klärung)', () => {
    const text = JSON.stringify(offers)
    expect(text).not.toMatch(/basic/i)
    expect(text).not.toMatch(/seller|provider|offeredBy|valueAddedTax|address/i)
  })

  it('GEGENPROBE: ein geänderter Preis in der Quelle fällt auf', () => {
    const changed = JSON.parse(JSON.stringify(offers)) as typeof offers
    changed[0]!.priceSpecification[0]!.price = '19.00'
    expect(pricesOf(changed)).not.toEqual({ Personal: ['29.00', '21.75'], Pro: ['149.00', '111.75'] })
  })
})

describe('eine Quelle: weder Preistabelle noch Startseite tragen eine eigene Zahl', () => {
  // Ein Cent-Betrag oder Euro-Preis als Zahl im Quelltext — die Form, in der
  // die Tabelle bis Q11 in der Komponente stand.
  const PRICE_LITERAL = /\b(2900|26100|14900|134100)\b|\b(29|149)(\.00)?\s*(€|EUR)/

  it('die Quelle ist die einzige Stelle', () => {
    expect(PLAN_PRICES_CENTS.personal.monthly).toBe(2900)
    for (const file of ['app/components/PricingSection.vue', 'app/pages/index.vue']) {
      const source = readFileSync(join(APP, file), 'utf8').replace(/^\s*(\/\/|\*).*$/gm, '')
      expect(source, file).not.toMatch(PRICE_LITERAL)
    }
    expect(readFileSync(join(APP, 'app/pages/index.vue'), 'utf8')).toContain('planOffersJsonLd(')
  })

  it('GEGENPROBE: die alte Zeile aus der Komponente wäre ein Treffer', () => {
    expect('const PRICES = { personal: { monthly: 2900, yearly: 26100 } }').toMatch(PRICE_LITERAL)
  })
})
