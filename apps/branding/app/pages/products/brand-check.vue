<script setup lang="ts">
/**
 * PRODUKTSEITE BRAND-CHECK (PS1, Plan docs/plans/PRODUCTS-SEITE.md §4).
 *
 * Ebene Audit, der freie Einstieg: er braucht kein Konto, und genau deshalb
 * steht er in der Übersicht an erster Stelle. Die Fakten stammen aus dem
 * gebauten Produkt (`packages/brand/app/pages/brand-check/index.vue` +
 * `methodik.vue`, i18n `brand.check.*`): 40 Kriterien in acht Kategorien, nur
 * die Startseite wird gelesen, das Ergebnis ist teilbar, die Aufnahme ins
 * öffentliche Ranking ist ein Häkchen.
 *
 * DER SLUG BLEIBT IN BEIDEN SPRACHEN ENGLISCH („brand-check" ist ein
 * Eigenname, Davids Regel) — übersetzt ist nur das Wort „Produkte".
 *
 * Wie /about und /team: in der APP, nicht im Layer. Die App kennt laut
 * `site.manifest.ts` alle ihre Produkte, ein Layer darf die anderen nicht
 * kennen (CONCEPT A14).
 */
defineI18nRoute({
  paths: {
    en: '/products/brand-check',
    de: '/produkte/brand-check',
  },
})
</script>

<template>
  <ProductPage
    prefix="products.brandCheck"
    icon="i-ph-gauge"
    cta-to="/brand-check"
    :proof-links="[{ to: '/brand-check/ranking', key: 'proofLink' }]"
  />
</template>
