<script setup lang="ts">
/**
 * ArtA6 — Fingerabdruck-Poster an der Wand (der Beweis)
 *
 * Vektor statt Foto (Davids Entscheidung 2026-09-04): die Visual DNA
 * (Geometric · Monochrome + Acid Pop · Digital-clean) als reduziertes
 * Stillleben. Alle Flächen kommen aus den `--bw-`-Tokens (brand.css), der
 * eine Pop-Akzent ist `--bw-pop` — damit stimmt das Bild in beiden
 * Farbwelten ohne zweite Fassung. `label` ist die Bildbeschreibung für
 * Screenreader (Register: docs/referenz/BRANDING-SUPPLY-BILDMATERIAL.md).
 */
withDefaults(defineProps<{ label: string, rounded?: boolean }>(), { rounded: true })
</script>

<template>
  <svg
    viewBox="0 0 1000 1000" role="img" :aria-label="label"
    class="block h-auto w-full" :class="rounded ? 'bw-frame' : ''" style="background: var(--bw-surface-hi)"
  >
    <!-- Poster an der Wand: konzentrische Fingerabdruck-Bögen, einer in Acid -->
    <rect x="0" y="880" width="1000" height="120" fill="var(--bw-surface)" />
    <rect x="212" y="152" width="600" height="760" rx="6" fill="var(--bw-line)" opacity="0.6" />
    <rect x="200" y="140" width="600" height="760" rx="6" fill="var(--bw-surface)" stroke="var(--bw-line-strong)" stroke-width="3" />
    <g fill="none" stroke="var(--bw-line-strong)" stroke-width="7" stroke-linecap="round" transform="translate(500 560)">
      <path d="M -60 0 A 60 60 0 1 1 60 0" />
      <path d="M -100 0 A 100 100 0 1 1 100 0" stroke-dasharray="180 30" />
      <path d="M -140 0 A 140 140 0 1 1 140 0" />
      <path d="M -180 0 A 180 180 0 1 1 180 0" stroke-dasharray="240 40" />
      <path d="M -220 0 A 220 220 0 1 1 220 0" stroke="var(--bw-pop)" stroke-width="9" />
      <path d="M -260 0 A 260 260 0 1 1 260 0" stroke-dasharray="320 50" />
    </g>
    <rect x="260" y="820" width="120" height="8" rx="4" fill="var(--bw-line)" />
  </svg>
</template>
