<script setup lang="ts">
/**
 * DIE PREIS-ZEILE EINER PRODUKTSEITE (PS1, Plan docs/plans/PRODUCTS-SEITE.md §5).
 *
 * GENAU EINE AUSSAGE JE PRODUKT, und daneben die Voraussetzung — mehr steht
 * hier nicht. Der Zuschnitt ist Absicht: eine Preis-TABELLE mit fünf Spalten
 * würde behaupten, die fünf Produkte seien Varianten desselben Angebots. Sie
 * sind es nicht — zwei sind frei, eines ist ein Einmalpreis, zwei laufen über
 * das Erstgespräch.
 *
 * Sie bekommt FERTIGE TEXTE und übersetzt selbst nichts: der Preis ist bereits
 * eingesetzt (`ProductPage.vue`), und ein zweites `t()` hier hiesse, dass zwei
 * Bauteile dieselbe Schlüssel-Konvention kennen müssen. Nur der Pfad des CTA
 * kommt roh (ohne Sprach-Präfix) — `localePath()` gehört an die Stelle, die
 * den Link baut.
 */
defineProps<{
  /** Die eine Preis-Aussage, Betrag bereits eingesetzt */
  priceText: string
  /** Die Voraussetzung („setzt eine abgenommene Brand Foundation voraus") */
  requirement: string
  ctaLabel: string
  /** Ziel des CTA, Pfad OHNE Sprach-Präfix */
  ctaTo: string
}>()

const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <section class="bw-card grid items-center gap-8 p-10 @lg:grid-cols-[minmax(0,1fr)_auto] @lg:p-14">
    <div class="min-w-0">
      <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('products.common.priceEyebrow') }}</p>
      <p class="mt-3 max-w-2xl text-balance text-2xl font-medium leading-snug tracking-tight sm:text-3xl">{{ priceText }}</p>
      <p class="bw-label mt-5 max-w-2xl leading-relaxed" style="color: var(--bw-muted)">
        {{ t('products.common.requirementLabel') }} {{ requirement }}
      </p>
    </div>
    <UButton :label="ctaLabel" :to="localePath(ctaTo)" size="lg" color="neutral" class="rounded-full" />
  </section>
</template>
