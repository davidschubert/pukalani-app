<script setup lang="ts">
/**
 * ArtA4 — Karteikarten, eine angehoben (Entscheidung für Entscheidung)
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
    <!-- Karteikarten-Stapel, eine Karte angehoben mit Acid-Kante -->
    <ellipse cx="600" cy="720" rx="330" ry="24" fill="var(--bw-line)" opacity="0.55" />
    <rect x="340" y="392" width="520" height="320" rx="12" fill="var(--bw-line-strong)" />
    <rect x="340" y="376" width="520" height="320" rx="12" fill="var(--bw-surface)" stroke="var(--bw-line)" stroke-width="2" />
    <rect x="340" y="360" width="520" height="320" rx="12" fill="var(--bw-surface-hi)" stroke="var(--bw-line)" stroke-width="2" />
    <rect x="340" y="344" width="520" height="320" rx="12" fill="var(--bw-surface)" stroke="var(--bw-line)" stroke-width="2" />
    <g transform="rotate(-10 600 330)">
      <rect x="348" y="176" width="520" height="320" rx="12" fill="var(--bw-line)" opacity="0.5" />
      <rect x="340" y="168" width="520" height="320" rx="12" fill="var(--bw-surface)" stroke="var(--bw-line-strong)" stroke-width="3" />
      <rect x="400" y="232" width="240" height="12" rx="6" fill="var(--bw-line-strong)" />
      <rect x="400" y="268" width="320" height="12" rx="6" fill="var(--bw-line)" />
      <rect x="352" y="478" width="496" height="10" rx="5" fill="var(--bw-pop)" />
    </g>
  </svg>
</template>
