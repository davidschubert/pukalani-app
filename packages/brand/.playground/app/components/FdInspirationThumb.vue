<script setup lang="ts">
import type { DsInspiration } from '../utils/demoDesign'

/**
 * DIE ATTRAPPE EINES HOCHGELADENEN VORBILDS (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.2 `g.inspiration`).
 *
 * Fünf abstrakte Kompositionen im Seitenverhältnis eines Screenshots — eine
 * Website, eine Typo-Probe, eine Palette, ein Zeichen, ein Foto-Raster. Sie
 * zeigen die FORM des Bereichs (Bild, Bereich-Chip, Notiz, Lesung), nicht
 * fremde Marken: der Klickdummy darf keine echten Screenshots tragen, das
 * wäre schon der Urheberrechts-Fall aus Leitplanke (a).
 *
 * Fremdfarben sind hier ausdrücklich erlaubt (Vorbild 4 ist Neon auf Schwarz)
 * — genau daran zeigt die Lesung, was NICHT zur Foundation passt.
 */
const props = defineProps<{
  item: Pick<DsInspiration, 'kind' | 'colors'>
  /** Ein hochgeladenes Bild aus dem Browser (Object-URL) — ersetzt die Attrappe. */
  src?: string | null
}>()

function color(index: number): string {
  return props.item.colors[index] ?? props.item.colors[0] ?? '#cccccc'
}
</script>

<template>
  <div class="fd-thumb bw-frame overflow-hidden" style="background: var(--bw-surface); aspect-ratio: 16 / 10">
    <img v-if="src" :src="src" alt="" class="size-full object-cover">

    <!-- Website: Kopfzeile, Überschrift-Balken, Textzeilen, ein Bildblock. -->
    <svg v-else-if="item.kind === 'site'" viewBox="0 0 160 100" class="size-full" role="img" aria-label="Vorbild: Website">
      <rect width="160" height="100" :fill="color(0)" />
      <rect x="12" y="10" width="22" height="4" rx="2" :fill="color(1)" />
      <rect x="120" y="10" width="28" height="4" rx="2" :fill="color(2)" />
      <rect x="12" y="30" width="80" height="7" rx="2" :fill="color(1)" />
      <rect x="12" y="41" width="62" height="7" rx="2" :fill="color(1)" />
      <rect x="12" y="58" width="70" height="2.5" rx="1" :fill="color(2)" />
      <rect x="12" y="64" width="64" height="2.5" rx="1" :fill="color(2)" />
      <rect x="12" y="70" width="56" height="2.5" rx="1" :fill="color(2)" />
      <rect x="104" y="30" width="44" height="52" rx="3" :fill="color(3)" />
    </svg>

    <!-- Typo-Probe: große Serif-Buchstaben aus dem Vorbild. -->
    <svg v-else-if="item.kind === 'type'" viewBox="0 0 160 100" class="size-full" role="img" aria-label="Vorbild: Typografie">
      <rect width="160" height="100" :fill="color(0)" />
      <text x="14" y="62" :fill="color(1)" style="font-family: Georgia, 'Times New Roman', serif; font-size: 44px; letter-spacing: -1px">Aa Qg</text>
      <rect x="14" y="74" width="60" height="2.5" rx="1" :fill="color(2)" />
      <rect x="14" y="80" width="44" height="2.5" rx="1" :fill="color(2)" />
    </svg>

    <!-- Palette: fünf Flächen, wie ein Screenshot einer Instagram-Kachel. -->
    <svg v-else-if="item.kind === 'palette'" viewBox="0 0 160 100" class="size-full" role="img" aria-label="Vorbild: Farbwelt">
      <rect width="160" height="100" :fill="color(4)" />
      <rect x="0" y="0" width="64" height="100" :fill="color(0)" />
      <rect x="64" y="0" width="40" height="60" :fill="color(1)" />
      <rect x="104" y="0" width="56" height="60" :fill="color(2)" />
      <rect x="64" y="60" width="96" height="40" :fill="color(3)" />
      <circle cx="32" cy="50" r="14" :fill="color(2)" />
    </svg>

    <!-- Zeichen: ein hartes Monogramm auf dunklem Grund. -->
    <svg v-else-if="item.kind === 'mark'" viewBox="0 0 160 100" class="size-full" role="img" aria-label="Vorbild: Zeichen">
      <rect width="160" height="100" :fill="color(0)" />
      <rect x="56" y="22" width="48" height="48" rx="4" :fill="color(1)" />
      <path d="M68 60 L80 34 L92 60 Z" :fill="color(0)" />
      <rect x="40" y="80" width="80" height="3" rx="1.5" :fill="color(2)" />
    </svg>

    <!-- Foto-Raster: vier „Fotos" als weiche Flächen mit Lichtkante. -->
    <svg v-else viewBox="0 0 160 100" class="size-full" role="img" aria-label="Vorbild: Bildsprache">
      <rect width="160" height="100" :fill="color(3)" />
      <rect x="6" y="6" width="72" height="42" rx="2" :fill="color(0)" />
      <rect x="82" y="6" width="72" height="42" rx="2" :fill="color(1)" />
      <rect x="6" y="52" width="72" height="42" rx="2" :fill="color(2)" />
      <rect x="82" y="52" width="72" height="42" rx="2" :fill="color(0)" />
      <circle cx="42" cy="27" r="9" :fill="color(1)" opacity="0.7" />
      <circle cx="118" cy="73" r="9" :fill="color(2)" opacity="0.7" />
    </svg>
  </div>
</template>
