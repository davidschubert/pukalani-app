<script setup lang="ts">
/**
 * ArtA1 — Papierbogen mit Fingerabdruck-Zeile und Acid-Pin (About-Hero)
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
    viewBox="0 0 1600 700" role="img" :aria-label="label"
    class="block h-auto w-full" :class="rounded ? 'bw-frame' : ''" style="background: var(--bw-surface-hi)"
  >
    <!-- Bodenschatten, Blatt (leicht gedreht), drei Zeilen Mono-„Text", Acid-Pin -->
    <ellipse cx="800" cy="600" rx="380" ry="26" fill="var(--bw-line)" opacity="0.55" />
    <g transform="rotate(-3 800 350)">
      <rect x="528" y="132" width="560" height="460" rx="8" fill="var(--bw-line)" opacity="0.7" />
      <rect x="520" y="120" width="560" height="460" rx="8" fill="var(--bw-surface)" />
      <rect x="586" y="212" width="300" height="10" rx="5" fill="var(--bw-line-strong)" />
      <rect x="586" y="242" width="200" height="10" rx="5" fill="var(--bw-line-strong)" />
      <rect x="586" y="272" width="250" height="10" rx="5" fill="var(--bw-line)" />
      <rect x="586" y="470" width="140" height="8" rx="4" fill="var(--bw-line)" />
    </g>
    <circle cx="1062" cy="150" r="22" fill="var(--bw-pop)" />
    <circle cx="1054" cy="142" r="5" fill="var(--bw-surface-hi)" opacity="0.8" />
  </svg>
</template>
