<script setup lang="ts">
/**
 * DIE GESCHLOSSENE AUSWAHL ALS KARTEN (P4, Infografik-Spez §12.3).
 *
 * ── WARUM KARTEN UND NICHT CHIPS ──────────────────────────────────────────
 * `BwChips` beantwortet eine Frage mit EINEM Wort („Passt" · „Fast"). Die
 * Markenarchitektur beantwortet sie mit einer ENTSCHEIDUNG, die der Mensch nur
 * treffen kann, wenn drei Dinge nebeneinander stehen: wie das Modell HEISST,
 * was es BEWIRKT und wo er es aus dem Alltag KENNT. Ein Chip trägt das nicht,
 * ein Textfeld trug bis P4 gar nichts — dort stand am Ende die rohe Id
 * `branded-house` im Dokument.
 *
 * ── DIESELBE SEMANTIK WIE DER CHIP, NUR GRÖSSER ───────────────────────────
 * Ein `<button>` je Option (kein `div` mit Klick-Handler), `aria-pressed` sagt
 * den gewählten Zustand an, und „gewählt" spricht die Sprache der Werkstatt-
 * Ampel: grüne Fläche, grüner Ring (`.bw-choice-card--selected`, dieselbe
 * Bedeutung wie `.bw-chip--selected`). Die Farbe ist nie die einzige Aussage —
 * das Häkchen steht daneben.
 *
 * ── DIE KARTE KENNT DIE MENGE NICHT ───────────────────────────────────────
 * Sie bekommt die Optionen gereicht. Woher sie kommen, entscheidet EINE
 * Stelle: der geschlossene Vertrag in `shared/brandChoiceOptions.ts`. Ein
 * Options-Katalog im Markup wäre genau der Schaden, den dieser Vertrag
 * verhindert — ein fünftes, erfundenes Architektur-Modell im Brand-Dokument.
 *
 * ── WAS ÜBERMITTELT WIRD, IST DIE ID ──────────────────────────────────────
 * `pick` trägt `option.id`, nie das Etikett. Gespeichert wird der stabile
 * Wert, gelesen wird der Name (`brandChoiceDisplayLabel`).
 */
export interface BwChoiceCard {
  /** Der stabile, gespeicherte Wert — er reist im `pick`-Ereignis. */
  id: string
  /** Der Name der Option, wie der Mensch ihn liest. */
  label: string
  /** Ein Halbsatz Wirkung — wofür dieses Modell sorgt. */
  hint?: string
  /** Ein bekanntes Beispiel, an dem man es wiedererkennt. */
  example?: string
}

defineProps<{
  options: BwChoiceCard[]
  /** Die aktuell gespeicherte Id — leer, solange nichts entschieden ist. */
  selected?: string
  /** Solange George antwortet, nimmt die Auswahl keine zweite Entscheidung an. */
  disabled?: boolean
}>()
defineEmits<{ pick: [id: string] }>()
const { t } = useI18n()
</script>

<template>
  <div class="grid gap-2 sm:grid-cols-2">
    <button
      v-for="option in options" :key="option.id"
      type="button"
      class="bw-choice-card rounded-2xl px-4 py-3 text-left"
      :class="selected === option.id ? 'bw-choice-card--selected' : ''"
      :aria-pressed="selected === option.id"
      :disabled="disabled"
      @click="$emit('pick', option.id)"
    >
      <span class="flex items-start justify-between gap-2">
        <span class="text-sm font-medium">{{ option.label }}</span>
        <UIcon
          v-if="selected === option.id"
          name="i-ph-check-circle-fill" class="mt-0.5 size-4 flex-none"
          style="color: var(--bw-accent)"
        />
      </span>
      <span v-if="option.hint" class="mt-1 block text-sm" style="color: var(--bw-ink-soft)">{{ option.hint }}</span>
      <span v-if="option.example" class="bw-label mt-2 block" style="color: var(--bw-muted)">
        {{ t('brand.choice.exampleLabel') }}: {{ option.example }}
      </span>
    </button>
  </div>
</template>
