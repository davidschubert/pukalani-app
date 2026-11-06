<script setup lang="ts">
import type { DkMarkFile } from '../utils/demoKit'
import { DK_PAIR } from '../utils/demoKit'
import { DS_BRAND } from '../utils/demoDesign'

/**
 * EINE ZEICHEN-DATEI ALS INLINE-SVG (Konzept docs/plans/BRAND-BOOK-KIT.md
 * §2.6 `marks/`).
 *
 * Die Setzung ist DIESELBE wie im Design-Dummy (`FdDesignBoard`,
 * `design/mark.vue`): `<text>` in der Überschriften-Schrift des gewählten
 * Paars, Farben aus der Ramp, das Monogramm als abgerundetes Quadrat. Sie ist
 * GERECHNET, nicht gezeichnet — deshalb ändert eine andere Basisfarbe oder ein
 * anderes Schriftpaar auch diese Datei.
 *
 * ZWEI DINGE, DIE DAS ECHTE PRODUKT GENAUSO MACHT (§2.12 Nr. 5):
 *  · Die Schrift wird als STACK referenziert, nie eingebettet — im Bündel
 *    liegen keine Schriftdateien (H8, §2.6 `LICENSES.md`).
 *  · Der Markenname ist Nutzereingabe: im echten Export wird er XML-escaped.
 *    Hier setzt Vue ihn als Textknoten, was dasselbe leistet.
 */
defineProps<{
  mark: DkMarkFile
}>()
</script>

<template>
  <svg
    v-if="mark.kind === 'wordmark'"
    viewBox="0 0 200 80" class="w-full rounded-lg"
    role="img" :aria-label="`${DS_BRAND.title} — ${mark.label}`"
    :style="`background: ${mark.bg}`"
  >
    <text
      x="100" y="41" text-anchor="middle" dominant-baseline="middle"
      :fill="mark.ink" :style="`font-family: ${DK_PAIR.headingStack}; font-size: 19px; letter-spacing: -0.3px`"
    >{{ DS_BRAND.title }}</text>
  </svg>
  <svg
    v-else
    viewBox="0 0 200 80" class="w-full rounded-lg"
    role="img" :aria-label="`Monogramm ${DS_BRAND.monogram} — ${mark.label}`"
    :style="`background: ${mark.bg}`"
  >
    <rect x="78" y="18" width="44" height="44" rx="13" :fill="mark.ink" />
    <text
      x="100" y="41" text-anchor="middle" dominant-baseline="middle"
      :fill="mark.bg" :style="`font-family: ${DK_PAIR.headingStack}; font-size: 24px`"
    >{{ DS_BRAND.monogram }}</text>
  </svg>
</template>
