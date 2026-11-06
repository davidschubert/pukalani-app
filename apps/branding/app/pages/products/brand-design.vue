<script setup lang="ts">
/**
 * PRODUKTSEITE BRAND DESIGN (PS1, Plan §4/§5).
 *
 * Ebene Build, seit 2026-09-09 live (Produkt 02, docs/archiv/BRAND-DESIGN.md).
 * Fakten aus dem gebauten Produkt: sechs Kapitel — Farbwelt (Hell/Dunkel-Rampe
 * aus einer Basisfarbe, geprüfte Kontrast-Paare), Typografie (Schriftpaar,
 * Skala, Regeln), Zeichen, Bildsprache, Motion (mit reduced-motion) — und das
 * druckbare Ergebnis-Board `/brand/:id/design`; Kapitel 10 der Foundation wird
 * damit voll.
 *
 * KEIN PREIS, UND DAS IST EINE ENTSCHEIDUNG (G4, BRAND-DESIGN.md §1.8):
 * Brand Design ist studio-begleitet, die Freischaltung je Marke macht der
 * Betreiber nach dem Erstgespräch. Deshalb führt der CTA dorthin und nicht in
 * eine Anlage, die für diese Marke gesperrt wäre.
 */
defineI18nRoute({
  paths: {
    en: '/products/brand-design',
    de: '/produkte/brand-design',
  },
})
</script>

<template>
  <ProductPage
    prefix="products.brandDesign"
    icon="i-ph-palette"
    cta-to="/erstgespraech"
    :proof-links="[{ to: '/discover', key: 'proofLink' }]"
  />
</template>
