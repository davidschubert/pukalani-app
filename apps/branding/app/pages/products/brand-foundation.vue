<script setup lang="ts">
/**
 * PRODUKTSEITE BRAND FOUNDATION (PS1, Plan §4).
 *
 * Ebene Build, das freie Fundament (Produktentscheidung 2026-08-27: „das
 * Fundament ist frei, die Ableitung bezahlt"). Fakten aus dem gebauten Produkt:
 * Wizard + Leseansicht (BF1) unter `/brand/:id/foundation`, zwölf Kapitel,
 * jede Empfehlung mit Begründung, Bestätigung Feld für Feld, Inhaltssprache je
 * Branding fest (`pukalani.brand.contentLocales`).
 *
 * DER CTA FOLGT DER STARTSEITE: eingeloggt in die eigenen Brandings, sonst auf
 * `/invite` — die geschlossene Beta nimmt über Einladungscode oder Warteliste
 * auf, ein Knopf direkt in den Wizard wäre für Gäste eine Sackgasse.
 */
defineI18nRoute({
  paths: {
    en: '/products/brand-foundation',
    de: '/produkte/brand-foundation',
  },
})

const { isLoggedIn } = useCurrentUser()
const ctaTo = computed(() => (isLoggedIn.value ? '/dashboard/brands' : '/invite'))
</script>

<template>
  <ProductPage
    prefix="products.brandFoundation"
    icon="i-ph-compass"
    :cta-to="ctaTo"
    :proof-links="[{ to: '/beispiel/kailua-coffee', key: 'proofLink' }]"
  />
</template>
