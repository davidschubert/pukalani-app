import { PLAN_PRICE_CURRENCY, PLAN_PRICE_KEYS, PLAN_PRICES_CENTS } from '#shared/marketing'
import { MARKETING_ROUTES } from './marketingRoutes'

/**
 * llms.txt von pukalani.app (Q11, GEO-003) — die kompakte Übersicht für
 * Antwortmaschinen (Format-Vorschlag llmstxt.org, kein Standard).
 *
 * NICHTS NEUES: jeder Satz kommt aus der englischen Sprachdatei der Site, die
 * Preise aus `PLAN_PRICES_CENTS` (dieselbe Quelle wie Preistabelle und
 * strukturierte Daten), die Seitenliste aus `MARKETING_ROUTES` (dieselbe wie
 * die Sitemap). Wer hier einen Werbesatz von Hand ergänzt, umgeht die
 * Richtigstellung von Q02. Bewusst NICHT darin: Anbieter, Anschrift und jede
 * Steuer-Angabe (wartet auf die rechtliche Klärung, OPEN-ITEMS).
 *
 * ENGLISCH als Hauptfassung, die deutsche Adresse je Seite daneben —
 * dieselbe Sprache wie die Standard-Locale dieser Site.
 *
 * Pur, damit der Test sie ohne Server prüft.
 */
export interface MarketingLlmsMessages {
  marketing: {
    meta: { title: string, description: string }
    pricing: {
      title: string
      lead: string
      trialNote: string
      perMonth: string
      perMonthYearly: string
      enterprisePrice: string
      plans: Record<'personal' | 'pro' | 'enterprise', { name: string, tag: string, desc: string }>
    }
  }
}

/** vue-i18n schreibt Sonderzeichen als `{'@'}` — hier wieder als Zeichen. */
export function plainMessage(value: string): string {
  return value.replace(/\{'([^']*)'\}/g, '$1')
}

export function marketingLlmsTxt(origin: string, messages: MarketingLlmsMessages): string {
  const plain = plainMessage
  const base = origin.replace(/\/+$/, '')
  const { meta, pricing } = messages.marketing
  const money = (cents: number) => new Intl.NumberFormat('en', { style: 'currency', currency: PLAN_PRICE_CURRENCY }).format(cents / 100)
  const plans = PLAN_PRICE_KEYS.map((key) => {
    const plan = pricing.plans[key]
    const cents = PLAN_PRICES_CENTS[key]
    return `- [${plain(plan.name)}](${base}/#preise): ${money(cents.monthly)} ${pricing.perMonth}, or ${money(cents.yearly / 12)} ${pricing.perMonthYearly}. ${plain(plan.desc)}`
  })
  const enterprise = pricing.plans.enterprise
  const pages = MARKETING_ROUTES.map(route => `- [${route.en}](${base}${route.en === '/' ? '/' : route.en}): Deutsch ${base}${route.de}`)
  return [
    `# ${plain(meta.title)}`,
    '',
    `> ${plain(meta.description)}`,
    '',
    '## Pricing',
    '',
    `${plain(pricing.title)} ${plain(pricing.lead)}`,
    '',
    ...plans,
    `- ${plain(enterprise.name)} (${plain(enterprise.tag)}): ${plain(pricing.enterprisePrice)}. ${plain(enterprise.desc)}`,
    '',
    plain(pricing.trialNote),
    '',
    '## Pages',
    '',
    ...pages,
    '',
  ].join('\n')
}
