<script setup lang="ts">
/**
 * PRODUKTSEITE MARKTVERGLEICH (PS1, Plan §4/§5).
 *
 * Ebene Compare, und die einzige Seite, die BEIDES zeigt: einen Betrag und
 * eine Voraussetzung. Fakten aus dem gebauten Produkt (`packages/market`,
 * Manifest + `market.paywall.*`): Wettbewerber in derselben Feldstruktur wie
 * die eigene Foundation, jede Aussage mit Zitat und Quelle (Beleg-Riegel),
 * drei Läufe je Branding und Tag, ein Lauf auf unverändertem Stand kostet
 * nichts. `requires: ['brand']` ist die Voraussetzung, nicht die Höflichkeit.
 *
 * DER BETRAG ERSCHEINT HIER, IN DER WERKSTATT NICHT: Davids Entscheidung vom
 * 2026-09-09 hebt „vor Z1 erscheint der Betrag nirgends" (BS1 §9.2) für die
 * MARKETING-Seiten auf; die Schranke im Produkt sagt weiterhin „Preis im
 * Erstgespräch". Die Zahl selbst lebt in `shared/productPricing.ts`.
 *
 * DER DEUTSCHE SLUG IST ÜBERSETZT („Marktvergleich" ist kein Eigenname) —
 * anders als bei den vier Produkten mit englischem Namen.
 */
defineI18nRoute({
  paths: {
    en: '/products/market-comparison',
    de: '/produkte/marktvergleich',
  },
})
</script>

<template>
  <ProductPage
    prefix="products.marketComparison"
    icon="i-ph-scales"
    cta-to="/erstgespraech"
    :proof-links="[
      { to: '/brand-check/methodik', key: 'proofLinkMethod' },
      { to: '/discover', key: 'proofLinkDiscover' },
    ]"
  />
</template>
