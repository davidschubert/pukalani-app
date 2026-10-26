<script setup lang="ts">
import type { InsightsVerdict } from '../../shared/insightsWatchlist'
import { INSIGHTS_VERDICTS } from '../../shared/insightsWatchlist'

/**
 * DER DREIFACH-SCHALTER EINES VIDEOS (BI2 K4, Plan §5).
 *
 * ── EINE KOMPONENTE FÜR BEIDE LISTEN ────────────────────────────────────
 * Radar und Fundstücke zeigen denselben Schalter, und er bedeutet in beiden
 * dasselbe. Zwei Fassungen wären zwei Orte, an denen jemand später eine
 * vierte Stellung einbaut.
 *
 * ── WARUM EIN SEGMENT-SCHALTER UND KEIN AUFKLAPPER ──────────────────────
 * Drei Stellungen, und man sieht die aktuelle ohne Klick. Ein Aufklapper
 * verlangt zwei Klicks je Urteil und verdeckt dabei die Zeile, über die man
 * gerade urteilt — in einer Liste, die man durchgeht, ist das der Unterschied
 * zwischen benutzbar und mühsam.
 *
 * ── DIE FARBEN SIND DIE AUSSAGE, NICHT DER SCHMUCK ──────────────────────
 * Grau = noch nicht angesehen, Bernstein = nein, Grün = ja. Dieselbe Ampel
 * wie im Wizard; wer die Liste überfliegt, liest sie ohne die Beschriftung.
 */
const props = defineProps<{
  modelValue: InsightsVerdict
  /** Läuft gerade ein Schreibvorgang zu DIESER Zeile? */
  busy?: boolean
  size?: 'xs' | 'sm'
}>()

const emit = defineEmits<{ 'update:modelValue': [InsightsVerdict] }>()

const { t } = useI18n()

const options = computed(() => INSIGHTS_VERDICTS.map(verdict => ({
  verdict,
  label: t(`insights.verdict.${verdict}`),
  icon: verdict === 'interesting'
    ? 'i-ph-check'
    : (verdict === 'uninteresting' ? 'i-ph-x' : 'i-ph-circle-dashed'),
  color: verdict === 'interesting'
    ? 'success' as const
    : (verdict === 'uninteresting' ? 'warning' as const : 'neutral' as const),
})))

/* Ein Klick auf die AKTUELLE Stellung tut nichts. Ohne diesen Riegel schriebe
 * jedes versehentliche Nachklicken eine Runde zum Server — und in der
 * Radar-Liste legte es womöglich eine Fundstück-Zeile an, die es schon gibt. */
function pick(verdict: InsightsVerdict): void {
  if (verdict === props.modelValue) return
  emit('update:modelValue', verdict)
}
</script>

<template>
  <!--
    `role="group"` und eine Beschriftung je Knopf: der Schalter steht in einer
    Tabellenzelle ohne sichtbaren Spaltenkopf-Text, und ohne Beschriftung
    läse eine Sprachausgabe hier drei Symbole vor.
  -->
  <div role="group" :aria-label="t('insights.verdict.label')" class="inline-flex items-center gap-0.5">
    <UButton
      v-for="option in options"
      :key="option.verdict"
      :icon="option.icon"
      :color="props.modelValue === option.verdict ? option.color : 'neutral'"
      :variant="props.modelValue === option.verdict ? 'solid' : 'ghost'"
      :size="props.size ?? 'xs'"
      :disabled="props.busy"
      :aria-label="option.label"
      :aria-pressed="props.modelValue === option.verdict"
      :title="option.label"
      @click="pick(option.verdict)"
    />
  </div>
</template>
