<script setup lang="ts">
import type { MarketProfileField } from '../../shared/marketProfile'

/**
 * PROTOTYP (M0b) — HÄUFIGKEIT UND HERKUNFT EINER ZELLE (Plan §7.4, §7.6).
 *
 * ── ZWEI ANGABEN, EINE ZEILE, EINE STELLE ────────────────────────────────
 * „auf 4 von 6 Seiten &middot; Website". Beides gehört an JEDE Aussage — in
 * der Gegenüberstellung, in der Profil-Karte und im Relaunch-Vergleich. Drei
 * Kopien wären drei Orte, an denen die Zeile anders aussieht (dasselbe
 * Argument wie bei `MkClaimList`).
 *
 * ── WARUM DIE HÄUFIGKEIT ÜBERHAUPT DASTEHT ───────────────────────────────
 * Sie ist die Antwort auf Davids Frage, wie Aussagen über verschieden grosse
 * Websites vergleichbar werden (§7.4): NICHT durch einen Mittelwert, sondern
 * durch „wie oft wiederholt eine Marke das". Was auf jeder Seite steht, meint
 * sie; was einmal im Fussbereich steht, ist Rand.
 *
 * ── EINE FOUNDATION HAT KEINE HÄUFIGKEIT, UND DAS IST RICHTIG ────────────
 * Sie hat keine Seiten: ein bestätigtes Feld ist beschlossen, nicht
 * wiederholt. Deshalb steht dort nur die Herkunft — eine erfundene „1 von 1"
 * wäre eine Zahl, die etwas anderes behauptet, als sie misst.
 */
withDefaults(defineProps<{
  field?: MarketProfileField | null
  /** In engen Spalten reicht die Herkunft als Etikett ohne Rahmen. */
  compact?: boolean
}>(), { field: null, compact: true })

const { t } = useI18n()
</script>

<template>
  <p
    v-if="field && field.value && (field.frequency || field.source)"
    class="bw-label mt-1 flex flex-wrap items-center gap-x-1.5"
    style="color: var(--bw-muted)"
    :class="compact ? '' : 'text-sm'"
  >
    <span v-if="field.frequency">
      {{ t('market.frequency.pages', { pages: field.frequency.pages, of: field.frequency.of }) }}
    </span>
    <span v-if="field.frequency && field.source">&middot;</span>
    <span v-if="field.source">{{ t(`market.source.${field.source}`) }}</span>
  </p>
</template>
