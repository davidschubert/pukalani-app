<script setup lang="ts">
/**
 * ArtA3 — Zwei Stühle am Tisch, von oben (Gespräch statt Formular)
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
    <!-- Von oben: runder Tisch, zwei Stühle einander gegenüber, ein Acid-Punkt -->
    <ellipse cx="600" cy="470" rx="190" ry="60" fill="var(--bw-line)" opacity="0.5" />
    <circle cx="600" cy="450" r="150" fill="var(--bw-surface)" stroke="var(--bw-line-strong)" stroke-width="4" />
    <circle cx="600" cy="450" r="110" fill="none" stroke="var(--bw-line)" stroke-width="2" />
    <rect x="230" y="380" width="30" height="140" rx="15" fill="var(--bw-ink-soft)" />
    <rect x="262" y="380" width="140" height="140" rx="20" fill="var(--bw-line-strong)" />
    <rect x="798" y="380" width="140" height="140" rx="20" fill="var(--bw-line-strong)" />
    <rect x="940" y="380" width="30" height="140" rx="15" fill="var(--bw-ink-soft)" />
    <circle cx="332" cy="450" r="16" fill="var(--bw-pop)" />
  </svg>
</template>
