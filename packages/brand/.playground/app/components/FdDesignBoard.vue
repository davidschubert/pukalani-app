<script setup lang="ts">
import {
  DS_BRAND,
  DS_IMAGERY_PRINCIPLES,
  DS_MARK_BRIEF,
  DS_MONO_STACK,
  DS_MOTION_STAGGER,
  DS_MOTION_TOKENS,
  DS_SHADES,
  DS_TEMPO_OPTIONS,
  dsFontPair,
  dsSceneColors,
} from '../utils/demoDesign'

/**
 * DAS ERGEBNIS-BOARD (Konzept docs/archiv/BRAND-DESIGN.md §2.8, Davids
 * Entscheidung 2026-09-08): Farbwelt, Schriftpaar, Zeichen, Bild-Prinzipien
 * und Bewegung auf EINER Fläche.
 *
 * Es ist das „Moodboard am Ende", das David für den Weg ohne Vorbilder
 * meinte — und in beiden Wegen dasselbe Artefakt: Kopf von Kapitel 10 und
 * eigene Leseansicht (`/brand/demo/design/board`). Es ENTSCHEIDET nichts:
 * keine Chips, keine Knöpfe, keine Alternativen. Was hier steht, ist
 * abgenommen; korrigiert wird in den Kapiteln.
 *
 * Warum ein eigener Baustein neben `FdDesignChapter`: das Kapitel ERKLÄRT
 * (Rollen-Liste, Tabellen, Do & Don't), das Board ZEIGT — eine Fläche, die
 * man an die Wand hängt. Zwei Aufgaben, zwei Bausteine; die Daten sind
 * dieselben.
 */
withDefaults(defineProps<{
  /** Kleiner gesetzt als Kopf eines Kapitels. */
  compact?: boolean
}>(), { compact: false })

const pair = dsFontPair('editorial')
const colors = dsSceneColors(DS_BRAND.palette.roast, DS_BRAND.palette.palm, DS_BRAND.palette.roast)
const tempo = DS_TEMPO_OPTIONS[0]!
const principle = DS_IMAGERY_PRINCIPLES[2]!

/* Die fünf tragenden Farben mit Rolle — die Kurzform der Rollen-Liste. */
const swatches = [
  { label: 'Grund', hex: colors.rampLight[900] },
  { label: 'Fläche', hex: colors.rampLight[100] },
  { label: 'Licht', hex: colors.neutral[50] },
  { label: 'Akzent', hex: DS_BRAND.palette.palm },
  { label: 'Papier', hex: DS_BRAND.palette.paper },
]

/* Drei abstrahierte Bild-Kacheln aus der Farbwelt (§1.4: keine Fotos). */
const tiles = [
  { a: colors.rampLight[800], b: colors.rampLight[300], c: DS_BRAND.palette.paper },
  { a: DS_BRAND.palette.crema, b: colors.rampLight[900], c: colors.neutral[100] },
  { a: colors.neutral[200], b: DS_BRAND.palette.palm, c: DS_BRAND.palette.milk },
]
</script>

<template>
  <div
    class="fd-board bw-frame overflow-hidden"
    :class="compact ? 'p-5 sm:p-6' : 'p-7 sm:p-9'"
    :style="`background: ${DS_BRAND.palette.paper}; color: ${colors.rampLight[900]}`"
  >
    <!-- Kopf: Wortmarke, Stand -->
    <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <p
        class="leading-none tracking-tight"
        :class="compact ? 'text-[30px]' : 'text-[40px]'"
        :style="`font-family: ${pair.headingStack}; letter-spacing: -0.5px`"
      >{{ DS_BRAND.title }}</p>
      <p class="text-[12px] leading-[18px]" :style="`font-family: ${DS_MONO_STACK}; color: ${colors.rampLight[600]}`">
        Visuelle Identität · Stand {{ DS_BRAND.standDate }}
      </p>
    </div>

    <div class="mt-6 grid gap-5" :class="compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'">
      <!-- Farbwelt -->
      <div class="fd-board-cell" :class="compact ? '' : 'lg:col-span-2'">
        <p class="fd-board-label" :style="`font-family: ${DS_MONO_STACK}; color: ${colors.rampLight[600]}`">Farbwelt · {{ colors.base }}</p>
        <div class="mt-2 flex overflow-hidden rounded-lg">
          <span
            v-for="shade in DS_SHADES" :key="shade"
            class="h-8 flex-1" :style="`background: ${colors.rampLight[shade]}`" :title="`${shade} · ${colors.rampLight[shade]}`"
          />
        </div>
        <div class="mt-3 grid grid-cols-5 gap-2">
          <div v-for="swatch in swatches" :key="swatch.label" class="min-w-0">
            <span class="block h-10 rounded-lg" :style="`background: ${swatch.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.06)`" />
            <p class="mt-1 truncate text-[11px] leading-4" :style="`font-family: ${DS_MONO_STACK}; color: ${colors.rampLight[700]}`">{{ swatch.label }}</p>
          </div>
        </div>
      </div>

      <!-- Bewegung -->
      <div class="fd-board-cell">
        <p class="fd-board-label" :style="`font-family: ${DS_MONO_STACK}; color: ${colors.rampLight[600]}`">Bewegung · {{ tempo.label }}</p>
        <div class="mt-2 flex flex-col gap-1">
          <p
            v-for="token in DS_MOTION_TOKENS" :key="token.id"
            class="flex items-baseline justify-between gap-3 text-[12px] leading-5" :style="`font-family: ${DS_MONO_STACK}`"
          >
            <span>{{ token.label }}</span>
            <span class="tabular-nums" :style="`color: ${colors.rampLight[700]}`">{{ Math.round(tempo.base * token.factor) }} ms</span>
          </p>
          <p class="flex items-baseline justify-between gap-3 text-[12px] leading-5" :style="`font-family: ${DS_MONO_STACK}`">
            <span>motion.stagger</span>
            <span class="tabular-nums" :style="`color: ${colors.rampLight[700]}`">{{ DS_MOTION_STAGGER }} ms</span>
          </p>
        </div>
        <p class="mt-2 text-[12px] leading-[18px]" :style="`font-family: ${pair.bodyStack}; color: ${colors.rampLight[700]}`">
          Langsam anlaufen, sanft ausklingen, nie federn. Reduzierte Bewegung: Endzustand sofort.
        </p>
      </div>

      <!-- Typografie -->
      <div class="fd-board-cell" :class="compact ? 'sm:col-span-2' : 'lg:col-span-2'">
        <p class="fd-board-label" :style="`font-family: ${DS_MONO_STACK}; color: ${colors.rampLight[600]}`">Typografie · {{ pair.headingFamily }} + {{ pair.bodyFamily }}</p>
        <p class="mt-2 leading-tight" :class="compact ? 'text-[24px]' : 'text-[30px]'" :style="`font-family: ${pair.headingStack}`">Eine Sorte pro Saison. Mit Ort, Monat und Namen.</p>
        <p class="mt-2 max-w-[44ch] text-[14px] leading-relaxed" :style="`font-family: ${pair.bodyStack}; color: ${colors.rampLight[800]}`">
          Anbau, Röstung und Ausschank liegen in einer Hand. Was in der Kanne ist, hat einen Ort, einen Monat und einen Namen.
        </p>
        <p class="mt-2 text-[12px]" :style="`font-family: ${DS_MONO_STACK}; color: ${colors.rampLight[700]}`">1 kg 38,00 € · Ernte 07/2026 · 1 200 m</p>
      </div>

      <!-- Zeichen -->
      <div class="fd-board-cell">
        <p class="fd-board-label" :style="`font-family: ${DS_MONO_STACK}; color: ${colors.rampLight[600]}`">Zeichen · Wortmarke und Monogramm</p>
        <div class="mt-2 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2">
          <svg viewBox="0 0 200 80" class="w-full rounded-lg" role="img" aria-label="Wortmarke" :style="`background: ${colors.neutral[50]}`">
            <text
              x="100" y="40" text-anchor="middle" dominant-baseline="middle"
              :fill="colors.rampLight[900]" :style="`font-family: ${pair.headingStack}; font-size: 19px; letter-spacing: -0.3px`"
            >Kailua Coffee Co.</text>
          </svg>
          <svg viewBox="0 0 80 80" class="w-full rounded-lg" role="img" aria-label="Monogramm K" :style="`background: ${colors.neutral[50]}`">
            <rect x="18" y="18" width="44" height="44" rx="13" :fill="colors.rampLight[900]" />
            <text
              x="40" y="41" text-anchor="middle" dominant-baseline="middle"
              :fill="DS_BRAND.palette.paper" :style="`font-family: ${pair.headingStack}; font-size: 24px`"
            >K</text>
          </svg>
        </div>
        <p class="mt-2 text-[12px] leading-[18px]" :style="`font-family: ${pair.bodyStack}; color: ${colors.rampLight[700]}`">{{ DS_MARK_BRIEF.clearSpace }}</p>
      </div>

      <!-- Bildsprache -->
      <div class="fd-board-cell" :class="compact ? 'sm:col-span-2' : 'lg:col-span-3'">
        <p class="fd-board-label" :style="`font-family: ${DS_MONO_STACK}; color: ${colors.rampLight[600]}`">Bildsprache · {{ principle.label }}</p>
        <div class="mt-2 grid gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.6fr)]">
          <svg
            v-for="(tile, i) in tiles" :key="i" viewBox="0 0 120 80" class="w-full rounded-lg" role="img" aria-label="Bild-Prinzip, abstrahiert"
          >
            <rect width="120" height="80" :fill="tile.c" />
            <circle cx="46" cy="44" r="26" :fill="tile.a" />
            <rect x="70" y="16" width="38" height="52" rx="3" :fill="tile.b" opacity="0.85" />
          </svg>
          <ul class="flex flex-col justify-center gap-1 text-[12px] leading-[18px]" :style="`font-family: ${pair.bodyStack}; color: ${colors.rampLight[800]}`">
            <li v-for="line in [principle.light, principle.crop, principle.people, principle.colorNote]" :key="line" class="flex items-start gap-2">
              <span class="mt-2 size-1 flex-none rounded-full" :style="`background: ${colors.rampLight[500]}`" />
              <span class="min-w-0">{{ line }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fd-board-label { font-size: 11px; line-height: 16px; letter-spacing: 0.04em; text-transform: uppercase; }
.fd-board-cell { min-width: 0; }
@media print {
  .fd-board { break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style>
