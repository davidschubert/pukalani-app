<script setup lang="ts">
/**
 * PRODUKTSEITE BRAND BOOK & KIT (PS1, Plan §4/§5).
 *
 * Ebene Supply — das einzige der fünf, das NOCH NICHT GEBAUT ist (BK1, Konzept
 * §2 geschrieben 2026-09-09). Die Seite sagt das auch: die Preis-Zeile beginnt
 * mit „Folgt", und der Beleg ist kein Ergebnis, sondern die VORSTUFE —
 * Brand Design entscheidet das Aussehen, Book & Kit liefert es aus.
 *
 * WAS HIER STEHEN DARF, steht in BK1 §0/§1.2 (nichts darüber hinaus): Brand
 * Book als Handbuch mit Regel-Kapiteln und Do & Don't, Design-Tokens hell/
 * dunkel mit geprüften Kontrast-Paaren (CSS, Tailwind), `brand.json` und
 * `brand.md` („Brand Context") maschinenlesbar, Pressekit mit Zeichen und
 * Boilerplate in drei Längen. „Produkt 03 entscheidet nichts Neues mehr,
 * sondern liefert aus" — genau dieser Satz trägt die Seite.
 *
 * DERSELBE EINMALPREIS WIE DER MARKTVERGLEICH, kein zweiter Betrag: „die
 * Ableitung" ist EIN Kauf (Davids Entscheidung c2 vom 2026-09-09).
 */
defineI18nRoute({
  paths: {
    en: '/products/brand-book-kit',
    de: '/produkte/brand-book-kit',
  },
})
</script>

<template>
  <ProductPage
    prefix="products.brandBookKit"
    icon="i-ph-package"
    cta-to="/erstgespraech"
    :proof-links="[{ to: '/products/brand-design', key: 'proofLink' }]"
  />
</template>
