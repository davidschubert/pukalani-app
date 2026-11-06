<script setup lang="ts">
/**
 * ArtT3 — Vier Objekte, ein Faden (Zusammenspiel des Teams)
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
    viewBox="0 0 1600 533" role="img" :aria-label="label"
    class="block h-auto w-full" :class="rounded ? 'bw-frame' : ''" style="background: var(--bw-surface-hi)"
  >
    <!-- Notizbuch · Farbfächer · Buch · Antenne — verbunden durch einen Acid-Faden -->
    <path d="M 120 360 C 400 250, 560 470, 800 360 S 1200 260, 1480 360" fill="none" stroke="var(--bw-pop)" stroke-width="6" stroke-linecap="round" />
    <ellipse cx="300" cy="440" rx="120" ry="14" fill="var(--bw-line)" opacity="0.6" />
    <ellipse cx="700" cy="440" rx="130" ry="14" fill="var(--bw-line)" opacity="0.6" />
    <ellipse cx="1100" cy="440" rx="120" ry="14" fill="var(--bw-line)" opacity="0.6" />
    <ellipse cx="1420" cy="440" rx="60" ry="14" fill="var(--bw-line)" opacity="0.6" />
    <rect x="210" y="200" width="180" height="240" rx="10" fill="var(--bw-ink-soft)" />
    <rect x="352" y="200" width="14" height="240" fill="var(--bw-line-strong)" />
    <g transform="translate(700 420)">
      <rect x="-40" y="-230" width="80" height="230" rx="8" fill="var(--bw-surface)" stroke="var(--bw-line)" stroke-width="2" transform="rotate(-36)" />
      <rect x="-40" y="-230" width="80" height="230" rx="8" fill="var(--bw-line)" transform="rotate(-18)" />
      <rect x="-40" y="-230" width="80" height="230" rx="8" fill="var(--bw-line-strong)" />
      <rect x="-40" y="-230" width="80" height="230" rx="8" fill="var(--bw-muted)" transform="rotate(18)" />
      <rect x="-40" y="-230" width="80" height="230" rx="8" fill="var(--bw-ink-soft)" transform="rotate(36)" />
      <circle r="18" fill="var(--bw-surface-hi)" stroke="var(--bw-line-strong)" stroke-width="3" />
    </g>
    <rect x="1000" y="220" width="200" height="220" rx="10" fill="var(--bw-line-strong)" />
    <rect x="1000" y="220" width="36" height="220" rx="10" fill="var(--bw-ink-soft)" />
    <rect x="1080" y="280" width="90" height="10" rx="5" fill="var(--bw-surface)" />
    <rect x="1400" y="400" width="40" height="40" rx="8" fill="var(--bw-line-strong)" />
    <rect x="1416" y="200" width="8" height="200" rx="4" fill="var(--bw-ink-soft)" />
    <circle cx="1420" cy="190" r="16" fill="none" stroke="var(--bw-ink-soft)" stroke-width="6" />
  </svg>
</template>
