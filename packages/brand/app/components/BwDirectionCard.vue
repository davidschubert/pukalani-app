<script setup lang="ts">
import type { BrandDirection } from '../../shared/brandDirections'

/**
 * EINE RICHTUNG ALS ANWENDUNGS-AUSSCHNITT (Konzept
 * docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md §11 a, Paket G4).
 *
 * ── WARUM NICHT `BwChoiceCards` ──────────────────────────────────────────
 * Die Architektur-Karte beantwortet ihre Frage mit drei Zeilen Text (Name ·
 * Wirkung · bekanntes Beispiel), und das reicht dort: „Branded House" ist eine
 * Ordnung, die man LIEST. Eine Farbwelt ist es nicht. Wer zwischen „Warm &
 * Editorial" und „Klar & Technisch" wählen soll und nur die Namen sieht, wählt
 * das Wort und nicht die Welt — deshalb zeigt diese Karte einen winzigen
 * AUSSCHNITT einer Anwendung: Farbstreifen, Überschrift, ein Satz, ein Knopf,
 * die drei Farben. Dieselbe Semantik wie der Chip und die Auswahl-Karte
 * (`<button>`, `aria-pressed`, das Häkchen neben der Fläche — Farbe ist nie
 * die einzige Aussage), nur mit dem Gegenstand der Frage darin.
 *
 * ── DIE WEB-SCHRIFTEN WERDEN BEWUSST NICHT GELADEN ───────────────────────
 * Die Vorschau setzt `font-family` auf den STACK des Katalogs und lässt den
 * Rückfall greifen (Georgia statt Source Serif, Arial statt Inter). Das ist
 * kein Kompromiss, sondern die Grenze der Aussage: hier wird eine RICHTUNG
 * gewählt, kein Rendering abgenommen — und sechs Web-Schriften für eine
 * Auswahl zu laden, kostete jedes Mal ein paar hundert Kilobyte für einen
 * Unterschied, den erst Brand Design ausarbeitet. Der Charakter (Serif gegen
 * Grotesk) trägt auch im Rückfall.
 *
 * ── DIE FARBEN STEHEN LOKAL, NICHT IM THEME ──────────────────────────────
 * `--dir-a/-b/-c` leben am Wurzelelement DIESER Karte. Sechs Richtungen
 * nebeneinander bräuchten sonst sechs Dokumente (der Phase-1-Plan sah genau
 * deshalb iframes vor); mit lokalen Variablen bleibt es eine Seite, und das
 * Theme der Werkstatt daneben bleibt unangetastet.
 */
const props = defineProps<{
  direction: BrandDirection
  /** Name und Begründung kommen ÜBERSETZT von aussen — diese Karte kennt kein i18n-Fach. */
  name: string
  reason: string
  /** Warum genau diese vorgeschlagen wird (Haupt-/Neben-Archetyp) — optional. */
  match?: string
  selected?: boolean
  disabled?: boolean
}>()
defineEmits<{ pick: [id: string] }>()

const { t } = useI18n()

/** hell · mittel · tief — die Reihenfolge des Verlaufs aus `brandPalette.ts`. */
const vars = computed(() => {
  const [light, mid, deep] = props.direction.gradient
  return `--dir-a: ${light}; --dir-b: ${mid}; --dir-c: ${deep}`
})

/** Umgekehrt: der GRUND zuerst, wie in der Foundation (tief · mittel · hell). */
const swatches = computed(() => {
  const [light, mid, deep] = props.direction.gradient
  return [deep, mid, light]
})
</script>

<template>
  <button
    type="button"
    class="bw-choice-card bw-dir-card rounded-2xl p-3 text-left"
    :class="selected ? 'bw-choice-card--selected' : ''"
    :style="vars"
    :aria-pressed="selected"
    :disabled="disabled"
    @click="$emit('pick', direction.id)"
  >
    <!-- DER AUSSCHNITT: so sähe eine Seite in dieser Welt aus. Er ist
         dekorativ — jede Aussage darin steht unten noch einmal als Text. -->
    <span class="bw-dir-preview block overflow-hidden rounded-xl" aria-hidden="true">
      <span class="block h-9" style="background: linear-gradient(90deg, var(--dir-c), var(--dir-b) 60%, var(--dir-a))" />
      <span class="block px-3.5 pb-3.5 pt-3" style="background: var(--dir-a)">
        <span
          class="block text-[15px] leading-tight"
          :style="`font-family: ${direction.fonts.heading.stack}; color: ${swatches[0]}`"
        >{{ name }}</span>
        <span
          class="mt-1 block text-[11px] leading-snug opacity-80"
          :style="`font-family: ${direction.fonts.body.stack}; color: ${swatches[0]}`"
        >{{ t('brand.foundation.direction.previewLine') }}</span>
        <span
          class="mt-2.5 inline-block rounded-full px-2.5 py-1 text-[10px]"
          :style="`font-family: ${direction.fonts.body.stack}; background: ${swatches[0]}; color: ${swatches[2]}`"
        >{{ t('brand.foundation.direction.previewButton') }}</span>
      </span>
    </span>

    <span class="mt-3 flex items-start justify-between gap-2">
      <span class="text-sm font-medium">{{ name }}</span>
      <UIcon
        v-if="selected"
        name="i-ph-check-circle-fill" class="mt-0.5 size-4 flex-none"
        style="color: var(--bw-accent)"
      />
    </span>
    <span class="mt-1 block text-sm" style="color: var(--bw-ink-soft)">{{ reason }}</span>
    <span v-if="match" class="bw-label mt-2 block" style="color: var(--bw-muted)">{{ match }}</span>

    <span class="mt-2.5 flex items-center gap-2">
      <span
        v-for="hex in swatches" :key="hex"
        class="bw-swatch size-4 rounded-full" :style="`background: ${hex}`"
      />
      <span class="bw-label ms-1 min-w-0 truncate" style="color: var(--bw-muted)">
        {{ direction.fonts.heading.family }} · {{ direction.fonts.body.family }}
      </span>
    </span>
  </button>
</template>

<style scoped>
/* Der Ausschnitt braucht eine Kante, sonst schwimmt die helle Fläche im
 * hellen Kartengrund. Kein Schatten: die Karte hat schon einen. */
.bw-dir-preview { box-shadow: inset 0 0 0 1px rgb(0 0 0 / 8%); }
</style>
