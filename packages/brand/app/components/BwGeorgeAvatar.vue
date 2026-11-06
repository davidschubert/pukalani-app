<script setup lang="ts">
/** Beraterbild (Runde 41, David): Nuxt UI UAvatar ohne Ring. Kopf 3xl,
 *  Nachrichten kleiner (UI-Audit C12).
 *
 *  SEIT DEM SICHTBAREN TEAM (2026-09-01) trägt die Komponente einen NAMEN und
 *  nicht mehr nur George: `src` leer ⇒ Monogramm statt Bild. Welches
 *  Teammitglied ein Bild hat, weiss die Berater-Registry (`brandAdvisors.ts`,
 *  Feld `avatar`), nicht diese Komponente.
 *
 *  ── DER DEFAULT IST LEER (2026-09-02) ────────────────────────────────────
 *  Bis hierher stand hier `/george.jpg` — ein Hunde-Foto aus der verworfenen
 *  Hunde-Welt (Davids Entscheidung 2026-09-02, DECISION-LOG). Die Datei ist
 *  gelöscht; ein Default, der auf ein fehlendes Bild zeigt, wäre ein 404 in
 *  jedem Aufruf ohne `src`. Default '' ⇒ Monogramm. Erst wenn es echte
 *  Porträts gibt, kommen sie in die REGISTRY, nicht in diesen Default. */
withDefaults(defineProps<{
  size?: 'md' | 'xl' | '3xl'
  /** Bildpfad; leer ⇒ Monogramm. */
  src?: string
  /** Das Monogramm (ein Buchstabe reicht). */
  initial?: string
  alt?: string
}>(), { size: '3xl', src: '', initial: 'G', alt: 'George' })
</script>

<template>
  <UAvatar v-if="src" :src="src" :alt="alt" :size="size" class="flex-none" />
  <UAvatar v-else :text="initial" :alt="alt" :size="size" class="flex-none" />
</template>
