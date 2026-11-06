<script setup lang="ts">
/**
 * ArtA2 — Agentur · Generator · George als drei Objekte (About-Warum)
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
    <!-- Agentur-Mappe · Schablone · Lautsprecher mit Acid-Ring -->
    <ellipse cx="400" cy="420" rx="170" ry="16" fill="var(--bw-line)" opacity="0.6" />
    <ellipse cx="800" cy="420" rx="170" ry="16" fill="var(--bw-line)" opacity="0.6" />
    <ellipse cx="1200" cy="420" rx="110" ry="16" fill="var(--bw-line)" opacity="0.6" />
    <rect x="270" y="210" width="260" height="200" rx="10" fill="var(--bw-ink-soft)" />
    <rect x="270" y="210" width="260" height="48" rx="10" fill="var(--bw-muted)" />
    <rect x="470" y="300" width="36" height="22" rx="4" fill="var(--bw-line-strong)" />
    <rect x="670" y="210" width="260" height="200" rx="6" fill="var(--bw-surface)" stroke="var(--bw-line-strong)" stroke-width="3" />
    <circle cx="730" cy="270" r="26" fill="var(--bw-surface-hi)" />
    <rect x="790" y="244" width="52" height="52" rx="6" fill="var(--bw-surface-hi)" />
    <polygon points="900,296 872,244 928,244" fill="var(--bw-surface-hi)" />
    <rect x="700" y="330" width="200" height="14" rx="7" fill="var(--bw-surface-hi)" />
    <rect x="1130" y="190" width="140" height="220" rx="26" fill="var(--bw-line-strong)" />
    <g fill="var(--bw-surface-hi)">
      <circle cx="1170" cy="300" r="6" /><circle cx="1200" cy="300" r="6" /><circle cx="1230" cy="300" r="6" />
      <circle cx="1170" cy="330" r="6" /><circle cx="1200" cy="330" r="6" /><circle cx="1230" cy="330" r="6" />
      <circle cx="1170" cy="360" r="6" /><circle cx="1200" cy="360" r="6" /><circle cx="1230" cy="360" r="6" />
    </g>
    <circle cx="1200" cy="238" r="30" fill="none" stroke="var(--bw-pop)" stroke-width="10" />
  </svg>
</template>
