<script setup lang="ts">
import { brandColorRoleLabel } from '../../shared/brandDesignColor'
import { brandMotionTokenLabel } from '../../shared/brandDesignMotion'
import { BRAND_MONO_STACK, brandFontPair } from '../../shared/brandFontPairs'
import { isBrandMarkSvg } from '../../shared/brandMarkSvg'
import { BRAND_RAMP_SHADES, type BrandDesignSnapshotPreset } from '../../shared/types/brand'

/**
 * DAS ERGEBNIS-BOARD (Konzept docs/archiv/BRAND-DESIGN.md §2.8, Davids
 * Entscheidung 2026-09-08; Form abgenommen am Klickdummy `FdDesignBoard`):
 * Farbwelt, Schriftpaar, Zeichen, Bild-Prinzipien und Bewegung auf EINER
 * Fläche.
 *
 * Es ist das „Moodboard am Ende", das David für den Weg ohne Vorbilder
 * meinte — und in beiden Wegen dasselbe Artefakt: Kopf von Kapitel 10 und
 * eigene Leseansicht (`/brand/:id/design`). Es ENTSCHEIDET nichts: keine
 * Chips, keine Knöpfe, keine Alternativen. Was hier steht, ist abgenommen;
 * korrigiert wird in den Kapiteln.
 *
 * ── ES RECHNET NICHTS ─────────────────────────────────────────────────────
 * Jede Zahl und jeder Hex kommt aus dem PRESET (`buildBrandDesign`). Eine
 * eigene Rampe, ein eigener Token-Satz oder eine zweite Rollen-Zuordnung hier
 * wären eine zweite Wahrheit — und die Fläche, die man an die Wand hängt,
 * wäre die falsche.
 *
 * ── DIE MARKE MALT SICH SELBST, DER RAHMEN BLEIBT DER APP ────────────────
 * Farben und Schriften stehen als LOKALE Stil-Attribute im Scope dieser
 * Fläche (dasselbe Muster wie `BwDesignScene`: kein `:root`, kein iframe).
 * Beschriftungen („Farbwelt", „Bewegung") folgen der Sprache des LESERS und
 * kommen aus dem i18n-Katalog; Marken-INHALT (Rollen-Namen, Prinzip-Zeilen,
 * Regeln) steht im Preset in der Inhaltssprache der Marke.
 *
 * ── DAS SVG KOMMT AUS DEM PRESET ──────────────────────────────────────────
 * `mark.examples` sind fertige, deterministisch erzeugte Zeichenketten (der
 * Markenname darin ist XML-escaped, `brandMarkSvg.ts`). Sie werden mit
 * `v-html` gesetzt wie in `BwMarkPanel` — mit `isBrandMarkSvg` als
 * zusätzlichem Riegel davor, weil dieselbe Fläche auch einen EINGEFRORENEN
 * Snapshot rendert: was aus einer Ablage kommt, wird geprüft, bevor es als
 * Markup gilt.
 */
const props = withDefaults(defineProps<{
  preset: BrandDesignSnapshotPreset
  /** Der Markenname — die Wortmarke im Kopf des Boards. */
  title: string
  /** Kleiner gesetzt als Kopf eines Kapitels. */
  compact?: boolean
  /** „Stand …" — leer heisst: kein Datum nennen (nie eines erfinden). */
  stand?: string
}>(), { compact: false, stand: '' })

const { t, locale } = useI18n()

const pair = computed(() => brandFontPair(props.preset.type.pair))
const headingStack = computed(() => pair.value?.headingStack ?? 'inherit')
const bodyStack = computed(() => pair.value?.bodyStack ?? 'inherit')

const ramp = computed(() => props.preset.color.rampLight)
const neutral = computed(() => props.preset.color.neutral)

/** Tinte und Papier der Fläche — dieselben zwei Enden wie in jeder Szene. */
const ink = computed(() => ramp.value[900])
const paper = computed(() => neutral.value[50])
const soft = computed(() => ramp.value[700])

const roles = computed(() => props.preset.color.roles.map(role => ({
  hex: role.hex,
  label: brandColorRoleLabel(role.id, locale.value),
})))

const transitions = computed(() => props.preset.motion.transitions.map(token => ({
  id: token.id,
  label: brandMotionTokenLabel(token.id),
  durationMs: token.durationMs,
})))

/**
 * DER NAME DES BILD-PRINZIPS für die Zeile über den Kacheln.
 *
 * Das Preset trägt die Prinzip-Zeilen (`Prinzip: <Name> · <Grund>`), nicht die
 * Id: die Zeilen sind der INHALT, die Id war nur der Weg dorthin. Für die
 * Beschriftung reicht der Name — und wenn die Form eines Tages anders aussieht,
 * bleibt die Zeile ohne Zusatz stehen statt kaputt.
 */
const principleName = computed(() => {
  const head = props.preset.imagery.principles[0] ?? ''
  const afterLabel = head.includes(':') ? head.slice(head.indexOf(':') + 1) : head
  return (afterLabel.split('·')[0] ?? '').trim()
})

/** Die Achsen-Zeilen unter dem Kopf — vier Sätze, kein Absatz. */
const principleLines = computed(() => props.preset.imagery.principles.slice(1))

/** Die letzte Regel der Bewegung ist immer der `reduced-motion`-Satz (D7). */
const motionNote = computed(() => props.preset.motion.rules.at(-1) ?? '')

/** Wortmarke und Monogramm der PRIMÄR-Variante — die ersten zwei Setzungen. */
const markSvgs = computed(() => props.preset.mark.examples.slice(0, 2).filter(isBrandMarkSvg))

/* Drei abstrahierte Bild-Kacheln aus der Farbwelt (§1.4: keine Fotos). */
const tiles = computed(() => [
  { a: ramp.value[800], b: ramp.value[300], c: paper.value },
  { a: neutral.value[200], b: ramp.value[900], c: neutral.value[100] },
  { a: neutral.value[100], b: props.preset.color.accent, c: ramp.value[100] },
])
</script>

<template>
  <div
    class="bw-board bw-frame overflow-hidden"
    :class="compact ? 'p-5 sm:p-6' : 'p-7 sm:p-9'"
    :style="`background: ${paper}; color: ${ink}`"
    data-design-board
  >
    <!-- Kopf: Wortmarke, Stand -->
    <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <p
        class="leading-none tracking-tight"
        :class="compact ? 'text-[30px]' : 'text-[40px]'"
        :style="`font-family: ${headingStack}; letter-spacing: -0.5px`"
      >{{ title }}</p>
      <p class="text-[12px] leading-[18px]" :style="`font-family: ${BRAND_MONO_STACK}; color: ${soft}`">
        {{ t('brand.foundation.design.title') }}<template v-if="stand"> · {{ t('brand.foundation.design.stand', { date: stand }) }}</template>
      </p>
    </div>

    <div class="mt-6 grid gap-5" :class="compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'">
      <!-- Farbwelt -->
      <div class="bw-board-cell" :class="compact ? '' : 'lg:col-span-2'">
        <p class="bw-board-label" :style="`font-family: ${BRAND_MONO_STACK}; color: ${soft}`">
          {{ t('brand.foundation.design.board.colors') }} · {{ preset.color.base }}
        </p>
        <div class="mt-2 flex overflow-hidden rounded-lg">
          <span
            v-for="shade in BRAND_RAMP_SHADES" :key="shade"
            class="h-8 flex-1" :style="`background: ${ramp[shade]}`" :title="`${shade} · ${ramp[shade]}`"
          />
        </div>
        <div v-if="roles.length" class="mt-3 grid gap-2" :style="`grid-template-columns: repeat(${roles.length}, minmax(0, 1fr))`">
          <div v-for="role in roles" :key="role.label" class="min-w-0">
            <span class="block h-10 rounded-lg" :style="`background: ${role.hex}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.06)`" />
            <p class="mt-1 truncate text-[11px] leading-4" :style="`font-family: ${BRAND_MONO_STACK}; color: ${soft}`">{{ role.label }}</p>
          </div>
        </div>
      </div>

      <!-- Bewegung -->
      <div class="bw-board-cell">
        <p class="bw-board-label" :style="`font-family: ${BRAND_MONO_STACK}; color: ${soft}`">
          {{ t('brand.foundation.design.board.motion') }}
        </p>
        <div class="mt-2 flex flex-col gap-1">
          <p
            v-for="token in transitions" :key="token.id"
            class="flex items-baseline justify-between gap-3 text-[12px] leading-5" :style="`font-family: ${BRAND_MONO_STACK}`"
          >
            <span>{{ token.label }}</span>
            <span class="tabular-nums" :style="`color: ${soft}`">{{ token.durationMs }} ms</span>
          </p>
        </div>
        <p v-if="motionNote" class="mt-2 text-[12px] leading-[18px]" :style="`font-family: ${bodyStack}; color: ${soft}`">
          {{ motionNote }}
        </p>
      </div>

      <!-- Typografie -->
      <div class="bw-board-cell" :class="compact ? 'sm:col-span-2' : 'lg:col-span-2'">
        <p class="bw-board-label" :style="`font-family: ${BRAND_MONO_STACK}; color: ${soft}`">
          {{ t('brand.foundation.design.board.type') }}<template v-if="pair"> · {{ pair.headingFamily }} + {{ pair.bodyFamily }}</template>
        </p>
        <p
          class="mt-2 leading-tight" :class="compact ? 'text-[24px]' : 'text-[30px]'"
          :style="`font-family: ${headingStack}`"
        >{{ t('brand.type.specimen.heading') }}</p>
        <p class="mt-2 max-w-[52ch] text-[14px] leading-relaxed" :style="`font-family: ${bodyStack}; color: ${ramp[800]}`">
          {{ t('brand.type.specimen.body') }}
        </p>
        <p class="mt-2 text-[12px]" :style="`font-family: ${BRAND_MONO_STACK}; color: ${soft}`">
          {{ t('brand.type.specimen.mono') }}
        </p>
      </div>

      <!-- Zeichen -->
      <div v-if="markSvgs.length" class="bw-board-cell">
        <p class="bw-board-label" :style="`font-family: ${BRAND_MONO_STACK}; color: ${soft}`">
          {{ t('brand.foundation.design.board.mark') }}
        </p>
        <div class="mt-2 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2">
          <!-- Der SVG-Quelltext kommt aus dem Preset (s. Kopf); `isBrandMarkSvg`
               ist der Riegel davor — dieselbe Begründung wie in `BwMarkPanel`. -->
          <!-- eslint-disable vue/no-v-html -->
          <span
            v-for="(svg, index) in markSvgs" :key="index"
            class="block w-full overflow-hidden rounded-lg" v-html="svg"
          />
          <!-- eslint-enable vue/no-v-html -->
        </div>
      </div>

      <!-- Bildsprache -->
      <div class="bw-board-cell" :class="compact ? 'sm:col-span-2' : 'lg:col-span-3'">
        <p class="bw-board-label" :style="`font-family: ${BRAND_MONO_STACK}; color: ${soft}`">
          {{ t('brand.foundation.design.board.imagery') }}<template v-if="principleName"> · {{ principleName }}</template>
        </p>
        <div class="mt-2 grid gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.6fr)]">
          <svg
            v-for="(tile, i) in tiles" :key="i" viewBox="0 0 120 80" class="w-full rounded-lg"
            role="img" :aria-label="t('brand.foundation.design.tileAlt')"
          >
            <rect width="120" height="80" :fill="tile.c" />
            <circle cx="46" cy="44" r="26" :fill="tile.a" />
            <rect x="70" y="16" width="38" height="52" rx="3" :fill="tile.b" opacity="0.85" />
          </svg>
          <ul class="flex flex-col justify-center gap-1 text-[12px] leading-[18px]" :style="`font-family: ${bodyStack}; color: ${ramp[800]}`">
            <li v-for="line in principleLines" :key="line" class="flex items-start gap-2">
              <span class="mt-2 size-1 flex-none rounded-full" :style="`background: ${ramp[500]}`" />
              <span class="min-w-0">{{ line }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bw-board-label { font-size: 11px; line-height: 16px; letter-spacing: 0.04em; text-transform: uppercase; }
.bw-board-cell { min-width: 0; }
/* Die Fläche IST die Marke — im Druck muss sie ihre Farben behalten, sonst
 * hängt jemand ein weisses Blatt an die Wand. */
@media print {
  .bw-board {
    break-inside: avoid;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
</style>
