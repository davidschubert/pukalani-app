/**
 * PREISE IN DEN STRUKTURIERTEN DATEN VON branding.supply (Q11, GEO-002).
 *
 * `PRODUCT_PRICE_EUR` sagt als Zahl, was die Produktseiten als Text sagen.
 * Der Test hält beides zusammen: „kostenlos" ⇔ 0, ein Betrag ⇔ der eine
 * Betrag der Ableitung, kein eigener Preis ⇔ null — je Sprache. Erwartete
 * Preise stehen ausgeschrieben (Beweis-Regel 1).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRODUCT_PRICE_EUR, productOfferJsonLd, type BrandingProductKey } from '../app/utils/productPricing'

const LOCALES = ['de', 'en'].map(code => JSON.parse(readFileSync(join(__dirname, '..', 'i18n', 'locales', `${code}.json`), 'utf8')) as { products: Record<string, { priceShort: string }> })
const FREE = /kostenlos|free/i

/** Was der Kurz-Preistext einer Seite sagt: kostenlos, Betrag oder keiner. */
function textSays(text: string): 'free' | 'amount' | 'none' {
  if (FREE.test(text)) return 'free'
  return text.startsWith('{price}') ? 'amount' : 'none'
}

function numberSays(price: number | null): 'free' | 'amount' | 'none' {
  if (price === null) return 'none'
  return price === 0 ? 'free' : 'amount'
}

describe('branding.supply: Preis je Produkt', () => {
  it('die Zahlen, ausgeschrieben', () => {
    expect(PRODUCT_PRICE_EUR).toEqual({ brandCheck: 0, brandFoundation: 0, marketComparison: 149, brandDesign: null, brandBookKit: null })
  })

  it('jede Zahl sagt dasselbe wie der Preis-Text der Seite, in beiden Sprachen', () => {
    for (const locale of LOCALES) {
      for (const [key, price] of Object.entries(PRODUCT_PRICE_EUR)) {
        expect(numberSays(price), key).toBe(textSays(locale.products[key]!.priceShort))
      }
    }
  })

  it('GEGENPROBE: „kostenlos" mit einem Betrag passt nicht zusammen', () => {
    expect(numberSays(149)).not.toBe(textSays(LOCALES[0]!.products.brandCheck!.priceShort))
    expect(numberSays(null)).not.toBe(textSays(LOCALES[0]!.products.marketComparison!.priceShort))
  })

  it('das Angebot: gültiges JSON-LD mit Preis, ohne Anbieter und ohne Steuer-Angabe', () => {
    const offer = productOfferJsonLd('marketComparison', 'https://branding.supply/products/market-comparison')
    expect(JSON.parse(JSON.stringify(offer))).toEqual({ '@type': 'Offer', 'price': '149.00', 'priceCurrency': 'EUR', 'url': 'https://branding.supply/products/market-comparison' })
    expect(productOfferJsonLd('brandCheck', 'x')?.price).toBe('0.00')
    expect(productOfferJsonLd('brandDesign' as BrandingProductKey, 'x')).toBeNull()
    expect(JSON.stringify(offer)).not.toMatch(/seller|provider|valueAddedTax|address/i)
  })
})
