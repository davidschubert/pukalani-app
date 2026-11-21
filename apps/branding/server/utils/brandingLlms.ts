import { formatDerivationPrice, type BrandingProductKey } from '../../app/utils/productPricing'
import { BRANDING_ROUTES, brandingFixedRoutes, dePathFor } from './brandingSitemap'

/**
 * llms.txt von branding.supply (Q11, GEO-003) — die kompakte Übersicht für
 * Antwortmaschinen (Format-Vorschlag llmstxt.org, kein Standard). Der
 * Marktvergleich prüft bei Kunden, ob ihre Site eine hat; die eigene Site
 * hatte keine.
 *
 * NICHTS NEUES: jeder Satz kommt aus der englischen Sprachdatei der Site
 * (Titel, Einleitung und Preis-Zeile der Produktseiten), der Betrag aus
 * `DERIVATION_PRICE_EUR_NET` (über `formatDerivationPrice`), die Seitenliste aus derselben Liste wie die
 * Sitemap. Bewusst NICHT darin: Anbieter, Anschrift und eine eigene
 * Steuer-Aussage (wartet auf die rechtliche Klärung) — die Preis-Zeile steht
 * wörtlich so, wie die Seite sie zeigt.
 *
 * SEITENLISTE: nur die festen Seiten, die an keinem Produkt-Schalter hängen
 * (`brandingFixedRoutes` mit beiden Schaltern AUS) — so braucht die Datei
 * keine Datenbank und nennt nie eine Seite, die gerade leer ist.
 *
 * ENGLISCH als Hauptfassung, die deutsche Adresse je Seite daneben.
 */
/** Produkt ⇒ Pfad seiner Seite; die deutsche Adresse kommt aus `BRANDING_ROUTES`. */
export const PRODUCT_PAGE_PATHS: Readonly<Record<BrandingProductKey, string>> = {
  brandCheck: '/products/brand-check',
  brandFoundation: '/products/brand-foundation',
  marketComparison: '/products/market-comparison',
  brandDesign: '/products/brand-design',
  brandBookKit: '/products/brand-book-kit',
}

function germanPath(path: string): string {
  return BRANDING_ROUTES.find(route => route.path === path)?.dePath ?? dePathFor(path)
}

export interface BrandingLlmsMessages {
  home: { seoTitle: string, seoDescription: string }
  products: Record<string, { title: string, lead: string, priceShort: string }> & {
    overview: { lead: string }
  }
}

/** vue-i18n schreibt Sonderzeichen als `{'@'}` — hier wieder als Zeichen. */
function plain(value: string): string {
  return value.replace(/\{'([^']*)'\}/g, '$1')
}

export function brandingLlmsTxt(origin: string, messages: BrandingLlmsMessages): string {
  const base = origin.replace(/\/+$/, '')
  const price = formatDerivationPrice('en')
  const products = (Object.entries(PRODUCT_PAGE_PATHS) as [BrandingProductKey, string][]).map(([key, path]) => {
    const page = messages.products[key]!
    return `- [${plain(page.title)}](${base}${path}): ${plain(page.lead)} Price: ${plain(page.priceShort).replace('{price}', price)} Deutsch ${base}${germanPath(path)}`
  })
  const productPaths = new Set(['/products', ...Object.values(PRODUCT_PAGE_PATHS)])
  const pages = brandingFixedRoutes({ brand: false, insights: false })
    .filter(route => !productPaths.has(route.path))
    .map(route => `- [${route.path}](${base}${route.path}): Deutsch ${base}${germanPath(route.path)}`)
  return [
    `# ${plain(messages.home.seoTitle)}`,
    '',
    `> ${plain(messages.home.seoDescription)}`,
    '',
    '## Products',
    '',
    `${plain(messages.products.overview.lead)} Overview: ${base}/products (Deutsch ${base}${germanPath('/products')})`,
    '',
    ...products,
    '',
    '## Pages',
    '',
    ...pages,
    '',
  ].join('\n')
}
