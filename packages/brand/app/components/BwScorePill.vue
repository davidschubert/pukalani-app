<script setup lang="ts">
/**
 * DER SCORE ALS TABELLEN-ZELLE — Zahl plus Band, in einer Zeile
 * (Konzept: docs/archiv/BRAND-CHECK-SEITE.md §3).
 *
 * `BwScoreRing` ist der Kopf einer Ergebnisseite: 132 px, ein Wert, viel Luft.
 * Eine Ranking-Tabelle zeigt fünfundzwanzig davon untereinander — dort ist ein
 * Ring fünfundzwanzigmal dieselbe Zeichnung und einmal zu viel Farbe. Deshalb
 * diese kleine Schwester: dieselbe FARBLOGIK (90+ · 50–89 · darunter), aber als
 * Zahl mit einem ruhigen Band-Etikett daneben.
 *
 * ── DIE FARBSCHWELLEN STEHEN ZWEIMAL, UND ZWAR BEWUSST ────────────────────
 * Sie sind hier abgeschrieben aus `BwScoreRing` statt in eine geteilte Funktion
 * gehoben: es sind drei Zahlen in einer Darstellungs-Entscheidung, und der
 * gemeinsame Helfer wäre ein Modul, das nichts weiter kann, als eine CSS-
 * Variable auszuwählen. Ändert jemand die Schwellen, ändert er die OPTIK an
 * zwei Stellen — die BÄNDER (`brandScoreBand`) sind davon unberührt, sie sind
 * die fachliche Einteilung und leben im Katalog.
 *
 * ── DAS BAND-WORT KOMMT AUS DEMSELBEN SCHLÜSSEL WIE ÜBERALL ───────────────
 * `brand.check.bands.<band>` ist der Vorrat der Ergebnisseite. Ein leeres oder
 * unbekanntes Band zeigt gar kein Etikett, statt einen rohen Schlüssel zu
 * drucken — auf einer indexierbaren Seite wäre `brand.check.bands.foo` das
 * Schlimmere von beidem.
 */
const props = withDefaults(defineProps<{
  value: number
  /** Der Band-Schlüssel der Zeile; leer ⇒ nur die Zahl. */
  band?: string
}>(), { band: '' })

const { t, te } = useI18n()

const tone = computed(() => (props.value >= 90
  ? 'var(--bw-accent)'
  : props.value >= 50 ? 'var(--bw-draft)' : 'var(--bw-stale)'))

const bandLabel = computed(() => {
  const key = `brand.check.bands.${props.band}`
  return props.band && te(key) ? t(key) : ''
})
</script>

<template>
  <span class="flex items-center gap-2" data-score-pill>
    <span
      class="text-lg tabular-nums"
      :style="`color: ${tone}; font-family: var(--bw-font-mono)`"
    >{{ value }}</span>
    <span
      v-if="bandLabel"
      class="bw-label rounded-full px-2 py-0.5 whitespace-nowrap"
      style="background: var(--bw-surface-hi); color: var(--bw-muted)"
    >{{ bandLabel }}</span>
  </span>
</template>
