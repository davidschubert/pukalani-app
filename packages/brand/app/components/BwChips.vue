<script setup lang="ts">
/**
 * Antwort-Chips: Empfehlung-zuerst; "Weiß ich nicht" hängt als
 * Ghost-Chip IMMER hinten dran (Interaktionsregel 5).
 *
 * ── DREI OPTIONEN MÜSSEN WIE DREI OPTIONEN AUSSEHEN (Davids Befund
 *    2026-09-02: die Konfidenz-Weiche sei „ziemlich defekt") ────────────────
 * Auf seinem Bild stand „Nochmal von vorn" dunkel gefüllt neben zwei hellen
 * Geschwistern. Das war kein Zufall und kein Fehler im Zustand: `--selected`
 * füllte den Chip mit `--bw-ink`, also fast schwarz. Ein Sprung von heller
 * Karte auf Fast-Schwarz liest sich in einer Reihe von drei Optionen wie eine
 * VORAUSWAHL — und ausgerechnet auf der Option, die am meisten kostet.
 *
 * Zwei Dinge folgen daraus, beide im Stylesheet (`.bw-chip--selected`,
 * `.bw-chip--quiet`) und nicht hier:
 *  1. „gewählt" spricht jetzt die Sprache der Werkstatt-Ampel (grüne Fläche,
 *     grüner Ring) statt die der Tinte. Dieselbe Bedeutung wie der bestätigte
 *     Slot-Knopf, dieselbe Farbe.
 *  2. `tone: 'quiet'` setzt eine Option AB, ohne sie zu betonen — für den Weg
 *     zurück („Nochmal von vorn"). Abgesetzt heisst hier LEISER, nicht lauter:
 *     eine rote Fläche wäre ein Warnschild vor einer Vertiefungsrunde, die
 *     nichts löscht.
 */
defineProps<{
  options: { id: string, label: string, recommended?: boolean, tone?: 'quiet' }[]
  multi?: boolean
  selected?: string[]
  showDontKnow?: boolean
}>()
defineEmits<{ pick: [id: string], dontKnow: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="flex flex-col items-stretch gap-2">
    <button
      v-for="o in options" :key="o.id" class="bw-chip text-left"
      :class="[
        selected?.includes(o.id) ? 'bw-chip--selected' : '',
        o.tone === 'quiet' ? 'bw-chip--quiet' : '',
      ]"
      :aria-pressed="selected ? selected.includes(o.id) : undefined"
      @click="$emit('pick', o.id)"
    >
      <span class="flex flex-wrap items-center gap-x-1.5 gap-y-1">{{ o.label }}<span v-if="o.recommended" class="bw-pop-chip">{{ t('brand.workspace.recommended') }}</span></span>
    </button>
    <button v-if="showDontKnow !== false" class="bw-chip bw-chip--ghost" @click="$emit('dontKnow')">
      {{ t('brand.workspace.dontKnow') }}
    </button>
  </div>
</template>
