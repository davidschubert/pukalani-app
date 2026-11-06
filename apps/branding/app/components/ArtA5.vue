<script setup lang="ts">
/**
 * ArtA5 — Gebundenes Dokument mit Lesebändchen (festgehalten, versandfertig)
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
    viewBox="0 0 1200 900" role="img" :aria-label="label"
    class="block h-auto w-full" :class="rounded ? 'bw-frame' : ''" style="background: var(--bw-surface-hi)"
  >
    <!-- Gebundenes Dokument, Rücken, leeres Titelschild, Acid-Lesebändchen -->
    <ellipse cx="600" cy="740" rx="300" ry="24" fill="var(--bw-line)" opacity="0.55" />
    <rect x="340" y="190" width="520" height="530" rx="12" fill="var(--bw-line-strong)" />
    <rect x="340" y="190" width="64" height="530" rx="12" fill="var(--bw-ink-soft)" />
    <rect x="372" y="190" width="32" height="530" fill="var(--bw-ink-soft)" />
    <rect x="500" y="300" width="240" height="120" rx="8" fill="var(--bw-surface)" />
    <rect x="530" y="340" width="150" height="10" rx="5" fill="var(--bw-line)" />
    <rect x="530" y="370" width="100" height="10" rx="5" fill="var(--bw-line)" />
    <path d="M 700 720 C 720 790, 790 820, 850 870" fill="none" stroke="var(--bw-pop)" stroke-width="16" stroke-linecap="round" />
  </svg>
</template>
