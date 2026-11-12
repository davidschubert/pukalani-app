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
 * DER CTA FOLGT DER STARTSEITE: eingeloggt in die eigenen Brandings; Gäste bei
 * offener Aufnahme zur Kontoanlage, sonst auf `/invite` (Einladungscode oder
 * Warteliste) — ein Knopf direkt in den Wizard wäre für Gäste eine Sackgasse.
 */
defineI18nRoute({
  paths: {
    en: '/products/brand-foundation',
    de: '/produkte/brand-foundation',
  },
})

const { isLoggedIn } = useCurrentUser()
// Gäste folgen der Aufnahme (offene Beta seit 2026-11-12): Kontoanlage, wenn
// die Anmeldung offen ist, sonst wie bisher die Einladungs-Seite.
const { guestStartPath } = await useBrandAdmission()
const ctaTo = computed(() => (isLoggedIn.value ? '/dashboard/brands' : guestStartPath.value))
</script>

<template>
  <ProductPage
    prefix="products.brandFoundation"
    icon="i-ph-compass"
    :cta-to="ctaTo"
    :proof-links="[{ to: '/beispiel/kailua-coffee', key: 'proofLink' }]"
  />
</template>
