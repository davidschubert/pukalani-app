#!/usr/bin/env node
/**
 * Stripe Products/Prices idempotent anlegen — für den Go-Live-Runbook
 * (docs/runbooks/STRIPE-GO-LIVE-RUNBOOK.md §3). Legt genau die `lookup_key`s an,
 * die der Code erwartet (pukalani.control.plans, Monats- + Jahres-Intervall).
 *
 * NUTZUNG (David, mit dem eigenen Key — Test ODER Live):
 *   STRIPE_KEY=sk_test_…  node scripts/stripe/ensure-prices.mjs          # Vorschau
 *   STRIPE_KEY=sk_test_…  node scripts/stripe/ensure-prices.mjs --apply  # anlegen
 *   STRIPE_KEY=sk_live_…  node scripts/stripe/ensure-prices.mjs --live           # Live-Vorschau
 *   STRIPE_KEY=sk_live_…  node scripts/stripe/ensure-prices.mjs --live --apply   # Live
 *
 * `--live` MUSS zum Schlüssel passen (OPS-002, `scripts/lib/target.mjs`): ein
 * Live-Schlüssel ohne `--live` bricht ab, `--live` mit Test-Schlüssel ebenso —
 * auch in der Vorschau, damit derselbe Aufruf nicht erst beim `--apply`
 * auffällt.
 *
 * Idempotent: existiert ein Price mit dem lookup_key UND dem richtigen
 * Betrag, wird er übersprungen. Weicht der BETRAG ab (Preisänderung), wird
 * ein neuer Price angelegt und der lookup_key per transfer_lookup_key
 * umgezogen; der alte Price wird deaktiviert (Stripe-Preise sind immutabel —
 * Bestands-Abos behalten ihren alten Price, Neu-Checkouts bekommen den
 * neuen; genau so griff der P4-Rename 2026-07-26: 19 € → 29 € Personal).
 * Der Key bleibt in DEINER Shell — dieses Skript liest nur STRIPE_KEY.
 *
 * SEIT F55 IST DAS DER ZWEITE WEG, nicht mehr der einzige: derselbe Abgleich
 * läuft im Control-Dashboard unter /dashboard/stripe („Preise → Bei Stripe
 * anlegen/abgleichen"). Beide arbeiten aus DEMSELBEN Katalog
 * (packages/control/shared/stripePriceCatalog.ts) und dieselben drei
 * Entscheidungen (decideStripePriceAction) — dieses Skript bleibt als
 * Terminal-Rückfall und für die Vorschau ohne --apply.
 */
import Stripe from 'stripe'
import { checkStripeTarget } from '../lib/target.mjs'
import { STRIPE_PRICE_CATALOG, STRIPE_PRICE_CURRENCY, STRIPE_PRICE_TAX_BEHAVIOR, decideStripePriceAction } from '../../packages/control/shared/stripePriceCatalog.ts'

// Beträge, lookup_keys und Produktnamen stehen NICHT mehr hier, sondern in
// packages/control/shared/stripePriceCatalog.ts — derselben Datei, aus der die
// Dashboard-Seite /dashboard/stripe (F55) arbeitet. Vorher war dieses Skript
// die Wahrheit und der Kommentar mahnte, sie mit app.config abzugleichen; seit
// es einen zweiten Klick-Weg gibt, wären das drei Kopien gewesen.
// Node ≥ 22.18 lädt die .ts-Datei direkt (Type-Stripping ohne Flag).
const CURRENCY = STRIPE_PRICE_CURRENCY
const PRODUCTS = STRIPE_PRICE_CATALOG

const key = process.env.STRIPE_KEY
if (!key) {
  console.error('✗ STRIPE_KEY fehlt. Aufruf: STRIPE_KEY=sk_test_… node scripts/stripe/ensure-prices.mjs [--apply] (Live-Schlüssel: zusätzlich --live)')
  process.exit(1)
}
const apply = process.argv.includes('--apply')
const target = checkStripeTarget({ key, live: process.argv.includes('--live') })
if (!target.ok) {
  console.error(`✗ ensure-prices: ${target.message}`)
  process.exit(1)
}
const mode = target.mode === 'live' ? 'LIVE' : 'TEST'
const stripe = new Stripe(key)

console.log(`Stripe ensure-prices — Modus ${mode}${apply ? ' (ANLEGEN)' : ' (Vorschau, --apply zum Anlegen)'}\n`)

/** Produkt per stabilem metadata.key finden oder anlegen (idempotent). */
async function ensureProduct(def) {
  const found = await stripe.products.search({ query: `metadata['maui_key']:'${def.key}'` })
  if (found.data[0]) return found.data[0]
  if (!apply) { console.log(`  · Produkt "${def.name}" würde angelegt`); return { id: `(neu:${def.key})` } }
  const product = await stripe.products.create({ name: def.name, metadata: { maui_key: def.key } })
  console.log(`  ✔ Produkt "${def.name}" angelegt (${product.id})`)
  return product
}

/** Price per lookup_key sicherstellen (idempotent, betrag-bewusst). */
async function ensurePrice(product, price) {
  const existing = await stripe.prices.list({ lookup_keys: [price.lookupKey], active: true, expand: ['data.product'], limit: 1 })
  const current = existing.data[0]
  const action = decideStripePriceAction(
    current ? { unitAmount: current.unit_amount, currency: current.currency } : null,
    { amount: price.amount, currency: CURRENCY },
  )
  if (action === 'skip') {
    console.log(`  = ${price.lookupKey} existiert bereits (${current.id}) — übersprungen`)
    return
  }
  if (action === 'transfer') {
    // Betrag-Drift (Preisänderung): Stripe-Preise sind immutabel — neuen
    // Price anlegen, lookup_key zieht per transfer_lookup_key um, alter
    // Price wird deaktiviert (Bestands-Abos behalten ihn intern).
    console.log(`  ~ ${price.lookupKey}: Betrag weicht ab (${current.unit_amount / 100} → ${price.amount / 100} ${CURRENCY}) — Key zieht um`)
    if (!apply) { console.log(`  · neuer Price würde angelegt, ${current.id} deaktiviert`); return }
  }
  else if (!apply) {
    console.log(`  · ${price.lookupKey} würde angelegt (${price.amount / 100} ${CURRENCY}/${price.interval})`)
    return
  }
  const created = await stripe.prices.create({
    product: product.id,
    currency: CURRENCY,
    unit_amount: price.amount,
    recurring: { interval: price.interval },
    lookup_key: price.lookupKey,
    transfer_lookup_key: true,
    // Brutto-Endpreis (A3): unveränderlich, deshalb von Anfang an richtig.
    tax_behavior: STRIPE_PRICE_TAX_BEHAVIOR,
  })
  console.log(`  ✔ ${price.lookupKey} angelegt (${created.id}, ${price.amount / 100} ${CURRENCY}/${price.interval})`)
  if (current) {
    // Ist der alte Price der `default_price` des Products, VERWEIGERT Stripe
    // das Archivieren — erst umhängen. Die Dashboard-Fassung
    // (apps/control/server/utils/stripePrices.ts) tut das seit F55; hier fehlte
    // der Schritt, und der Kopf dieser Datei sagt „dieselben Entscheidungen"
    // (Session-Audit 2026-08-09). Ein 400 mitten im Lauf ließe den Katalog
    // halb umgezogen zurück.
    const productObject = typeof current.product === 'object' && !('deleted' in current.product) ? current.product : null
    const defaultPriceId = typeof productObject?.default_price === 'string'
      ? productObject.default_price
      : productObject?.default_price?.id
    if (defaultPriceId === current.id) {
      await stripe.products.update(product.id, { default_price: created.id })
      console.log(`  ✔ default_price des Produkts auf ${created.id} umgehängt`)
    }
    await stripe.prices.update(current.id, { active: false })
    console.log(`  ✔ Alt-Price ${current.id} deaktiviert`)
  }
}

for (const def of PRODUCTS) {
  console.log(`Produkt ${def.name}:`)
  const product = await ensureProduct(def)
  for (const price of def.prices) await ensurePrice(product, price)
  console.log('')
}
console.log(apply ? 'Fertig.' : 'Vorschau fertig — mit --apply anlegen.')
