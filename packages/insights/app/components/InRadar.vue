<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { InsightsOpportunity, InsightsRadarVideo } from '../../shared/insightsPost'
import {
  INSIGHTS_OPPORTUNITY_SIGNALS,
  INSIGHTS_OPPORTUNITY_SIGNALS_PLANNED,
  INSIGHTS_RADAR_RETENTION_DAYS,
  insightsOpportunity,
  insightsPopularity,
  insightsTopicLabel,
} from '../../shared/insightsPost'
import type { InsightsRadarFilterState, InsightsRadarRange, InsightsRadarSortKey } from '../../shared/insightsRadarView'
import {
  INSIGHTS_RADAR_RANGES,
  INSIGHTS_RADAR_SORT_DEFAULT,
  insightsRadarFacets,
  insightsRadarFilterActive,
  insightsRadarFilterNone,
  insightsRadarFilterRows,
  insightsRadarFirstDesc,
  insightsRadarSort,
} from '../../shared/insightsRadarView'
import type { InsightsRadarVerdictFilter, InsightsVerdict } from '../../shared/insightsWatchlist'
import { INSIGHTS_RADAR_VERDICT_FILTERS, insightsVideoUrl } from '../../shared/insightsWatchlist'
import { insightsDaysBetween, insightsNumber } from '../utils/insightsFormat'

/**
 * PROTOTYP (I0) — DER THEMENRADAR IN DER REDAKTION (§9.6, Paket I4).
 *
 * ── WAS HIER STEHT, IST ALLES, WAS STEHEN DARF ──────────────────────────
 * Je Video die öffentlichen Zahlen der API: Kanal, Titel, Aufrufe, Likes,
 * Kommentar-ZAHL, Alter. KEINE Kommentar-Texte, KEINE Nutzernamen
 * (Leitplanke b) und kein Verdichten über Kanäle hinweg (Policies III.E.2).
 * Die Aufbewahrung ist auf {INSIGHTS_RADAR_RETENTION_DAYS} Kalendertage
 * begrenzt (III.E.4) — der Satz darüber steht in der Oberfläche und nicht nur
 * im Plan, weil er das Verhalten der Tabelle erklärt: sie ist kurzlebig.
 *
 * ── UNSERE ZAHL IST AUF 100 GENORMT, DIE FUSSNOTE TRÄGT DIE WAHRHEIT ────
 * „73" von 100, und daneben IMMER „aus n von 5 Signalen" (Davids Entscheidung
 * 2026-09-08 gegen die alte Anzeige „44 von 60"). Der Plan nennt fünf
 * Signale; für Suchnachfrage und Konkurrenz gibt es heute keine Datenquelle
 * (§11.1 Nr. 2). Ein mitwachsender NENNER wäre ehrlich, aber unlesbar: zwei
 * Läufe liessen sich nicht vergleichen, sobald ein viertes Signal dazukommt.
 * Genormt wird deshalb auf 100, und wie belastbar die Zahl ist, sagt die
 * Fussnote. Die Formel hängt als Tooltip an der Spalte — eine Zahl ohne
 * Rechenweg ist eine Behauptung.
 *
 * KEIN SIGNAL ⇒ KEINE ZAHL: die Zelle zeigt dann einen Strich, keine 0. Eine
 * 0 wäre eine Bewertung, wo gar nicht gemessen wurde.
 *
 * ── `UTable` IST DER STANDARD (Davids B6-Regel) ─────────────────────────
 * Spaltenbreiten und Zeilenverhalten kommen mitgeliefert; eine handgebaute
 * Tabelle wäre hier nur eine zweite, schlechtere.
 *
 * ── SEIT BI2 K2: FILTERN UND SORTIEREN ──────────────────────────────────
 * Bis dahin war die Liste FEST nach Opportunity sortiert und ohne jeden
 * Filter. Beides liegt jetzt beim Menschen, und beide Regeln liegen PUR in
 * `shared/insightsRadarView.ts` — mit Test, weil sie entscheiden, welches
 * Video oben steht. Die Vorgabe ist unverändert Opportunity absteigend: die
 * Seite darf sich durch dieses Paket beim Öffnen nicht anders zeigen.
 *
 * Was diese Datei dazu beisteuert, ist nur der Zustand (drei Refs) und die
 * Übersetzung der Cluster-Schlüssel in Etiketten. Die Trefferzeile über der
 * Tabelle ist kein Beiwerk: ein Filter, der greift, ohne dass man es sieht,
 * ist die Quelle für „warum ist das Video weg?".
 */
const props = defineProps<{
  videos: readonly InsightsRadarVideo[]
  locale: string
  /** Der Stichtag, gegen den das Alter gerechnet wird — nie `new Date()` im
   *  Rendern: das ist auf dem Server ein anderer Wert als im Browser. */
  today: string
  /**
   * Nähe zu unseren Themenclustern (0–1), je Video — in I4 aus Schlagwörtern.
   * `undefined` heisst „für dieses Video kein Relevanz-Signal": die Zahl wird
   * dann aus zwei Signalen gerechnet und sagt es in ihrer Fussnote. Ein
   * geratener Mittelwert (früher 0.5) wäre eine erfundene Messung.
   */
  resolveRelevance?: (video: InsightsRadarVideo) => number | undefined
  /**
   * Der Alters-Deckel des Laufs (Tage ab Veröffentlichung), wie ihn der
   * Server meldet — die Ansicht sagt ihn dazu, damit niemand ein fehlendes
   * Video für ein vergessenes hält. Ohne Wert (Prototyp, Playground) fehlt
   * nur die Zeile.
   */
  maxAgeDays?: number
  /**
   * Das Urteil je Video-Id (BI2 K4) — aus den FUNDSTÜCKEN dazugelesen. Was
   * fehlt, ist `unrated`. Ohne diese Karte (Prototyp, Playground) ist jede
   * Zeile ungeprüft und der Schalter stumm.
   */
  verdicts?: Record<string, InsightsVerdict>
  /** Welche Zeile gerade schreibt — damit nur IHR Schalter lädt. */
  busyVideoId?: string
}>()

const emit = defineEmits<{ verdict: [videoId: string, verdict: InsightsVerdict] }>()

const { t } = useI18n()

interface RadarRow extends InsightsRadarVideo {
  ageDays: number
  opportunity: InsightsOpportunity
  /** Dasselbe wie `opportunity.score` — die reinen Sortier-Regeln erwarten es flach. */
  score: number | null
  /** Das dazugelesene Urteil (BI2 K4) — ohne Eintrag „nicht geprüft". */
  verdict: InsightsVerdict
}

/* Alle Zeilen, gerechnet — vor Filter und Sortierung. Die Auswahllisten der
 * Filter kommen von HIER und nicht von den sichtbaren Zeilen: sonst
 * verschwände der Eintrag, mit dem man gerade gefiltert hat, aus seiner
 * eigenen Auswahl. */
const allRows = computed<RadarRow[]>(() => props.videos.map((video) => {
  const ageDays = insightsDaysBetween(video.publishedAt, props.today)
  const opportunity = insightsOpportunity({
    popularity: insightsPopularity(video.views, video.channelSubscribers),
    ageDays,
    relevance: props.resolveRelevance?.(video),
  })
  // `score` ist dieselbe Zahl noch einmal flach: die reinen Sortier-Regeln
  // sollen nichts über die Form der Opportunity wissen müssen — und `null`
  // bleibt `null`, damit „keine Messung" nicht zu „null Punkte" wird.
  return {
    ...video,
    ageDays,
    opportunity,
    score: opportunity.score,
    verdict: props.verdicts?.[video.videoId] ?? 'unrated',
  }
}))

const filter = ref<InsightsRadarFilterState>(insightsRadarFilterNone())
const sortKey = ref<InsightsRadarSortKey>(INSIGHTS_RADAR_SORT_DEFAULT)
const sortDesc = ref(insightsRadarFirstDesc(INSIGHTS_RADAR_SORT_DEFAULT))

const facets = computed(() => insightsRadarFacets(allRows.value))
const filterActive = computed(() => insightsRadarFilterActive(filter.value))

const rows = computed<RadarRow[]>(() => insightsRadarSort(
  insightsRadarFilterRows(allRows.value, filter.value),
  sortKey.value,
  sortDesc.value,
))

/* Ein zweiter Klick auf dieselbe Spalte dreht um; eine ANDERE Spalte fängt in
 * ihrer eigenen ersten Richtung an (beim Alter das Jüngste zuerst). */
function toggleSort(key: InsightsRadarSortKey): void {
  if (sortKey.value === key) {
    sortDesc.value = !sortDesc.value
    return
  }
  sortKey.value = key
  sortDesc.value = insightsRadarFirstDesc(key)
}

function sortIcon(key: InsightsRadarSortKey): string {
  if (sortKey.value !== key) return 'i-ph-arrows-down-up'
  return sortDesc.value ? 'i-ph-arrow-down' : 'i-ph-arrow-up'
}

function resetFilter(): void {
  filter.value = insightsRadarFilterNone()
}

/* Die Auswahl-Einträge tragen den SCHLÜSSEL als Wert und das Etikett als
 * Beschriftung — nie das Etikett als Wert: die Zeile in der Datenbank kennt
 * nur den Schlüssel. */
const topicItems = computed(() => facets.value.topics.map(key => ({
  label: insightsTopicLabel(key),
  value: key,
})))
const channelItems = computed(() => facets.value.channels.map(name => ({ label: name, value: name })))
const verdictItems = computed(() => INSIGHTS_RADAR_VERDICT_FILTERS.map(value => ({
  label: t(`insights.radar.verdictFilter.${value}`),
  value: value as InsightsRadarVerdictFilter,
})))
const rangeItems = computed(() => INSIGHTS_RADAR_RANGES.map(days => ({
  label: days === 0 ? t('insights.radar.rangeAll') : t('insights.radar.rangeDays', { days }),
  value: days as InsightsRadarRange,
})))

const columns = computed<TableColumn<RadarRow>[]>(() => [
  { accessorKey: 'channelTitle', header: () => t('insights.radar.channel') },
  { accessorKey: 'title', header: () => t('insights.radar.video') },
  { accessorKey: 'topic', header: () => t('insights.radar.topic') },
  { accessorKey: 'views', header: () => t('insights.radar.views') },
  { accessorKey: 'likes', header: () => t('insights.radar.likes') },
  { accessorKey: 'commentCount', header: () => t('insights.radar.comments') },
  { id: 'age', header: () => t('insights.radar.age') },
  { id: 'opportunity', header: () => t('insights.radar.opportunity') },
  // Die zwei Links je Zeile (Plan §5): das Urteil und der Weg zum Video.
  { id: 'verdict', header: () => t('insights.verdict.label') },
  { id: 'open', header: () => t('insights.radar.openLabel') },
])

/* Der Rechenweg NENNT die drei heutigen Signale und sagt, aus wie vielen die
 * Zahl in DIESER Zeile entstanden ist — nicht, wie viele es im Schnitt sind. */
function formulaFor(opportunity: InsightsOpportunity): string {
  return t('insights.radar.formula', { count: opportunity.signals, total: opportunity.of })
}
</script>

<template>
  <section>
    <div class="flex flex-wrap items-baseline justify-between gap-3">
      <h2 class="text-lg font-medium">{{ t('insights.radar.title') }}</h2>
      <p class="bw-label" style="color: var(--bw-muted)">
        {{ t('insights.radar.signals', { count: INSIGHTS_OPPORTUNITY_SIGNALS.length, total: INSIGHTS_OPPORTUNITY_SIGNALS_PLANNED.length }) }}
      </p>
    </div>
    <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('insights.radar.lead') }}</p>
    <p class="bw-pending mt-2">{{ t('insights.radar.retention', { days: INSIGHTS_RADAR_RETENTION_DAYS }) }}</p>
    <p class="bw-pending mt-1">{{ t('insights.radar.noComments') }}</p>
    <p v-if="props.maxAgeDays" class="bw-pending mt-1">{{ t('insights.radar.maxAge', { days: props.maxAgeDays }) }}</p>

    <!--
      DIE FILTERLEISTE steht auch dann da, wenn gerade nichts durchkommt: sie
      ist der einzige Weg zurück. Sie verschwindet nur, wenn es ÜBERHAUPT keine
      Zeilen gibt — dann gäbe es nichts zu filtern, und die Auswahllisten wären
      leer.
    -->
    <div v-if="allRows.length > 0" class="mt-4 flex flex-wrap items-center gap-2">
      <USelectMenu
        v-model="filter.topics"
        :items="topicItems"
        value-key="value"
        multiple
        icon="i-ph-tag"
        :placeholder="t('insights.radar.filterTopic')"
        class="w-56"
      />
      <USelectMenu
        v-model="filter.channels"
        :items="channelItems"
        value-key="value"
        multiple
        icon="i-ph-broadcast"
        :placeholder="t('insights.radar.filterChannel')"
        class="w-56"
      />
      <!--
        `USelect` (EINE Wahl aus vier festen Einträgen), nicht `USelectMenu`
        wie die zwei Filter daneben — dort ist die Mehrfachauswahl der Grund.
        Die ZAHL als Wert ist geprüft und trägt: Rekas `SelectItem` deklariert
        `value` zwar als `type: String`, Vue wandelt aber nichts um, und der
        Vergleich läuft über `valueComparator`. Im Klick-Beweis (2026-09-09)
        kam die 30 als Zahl zurück und der Filter griff — ohne Warnung in der
        Konsole. Die `0` für „alle" bleibt trotzdem eine Zahl und nie `''`:
        eine leere Zeichenkette wirft Reka ausdrücklich (SelectItem.js).
      -->
      <USelect
        v-model="filter.range"
        :items="rangeItems"
        value-key="value"
        icon="i-ph-clock-counter-clockwise"
        class="w-44"
      />
      <!--
        Der Urteils-Filter (BI2 K4). Er steht als LETZTER, weil seine Vorgabe
        bereits greift: wer nichts anfasst, sieht die Liste ohne das, was er
        abgehakt hat — und genau dafür gibt es den Schalter in der Zeile.
      -->
      <USelect
        v-model="filter.verdict"
        :items="verdictItems"
        value-key="value"
        icon="i-ph-check-square-offset"
        class="w-52"
      />
      <UButton
        v-if="filterActive"
        :label="t('insights.radar.filterReset')"
        icon="i-ph-x"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="resetFilter"
      />
      <p class="bw-label ms-auto" style="color: var(--bw-muted)">
        {{ t('insights.radar.shown', { shown: rows.length, total: allRows.length }) }}
      </p>
    </div>

    <CoreEmptyState
      v-if="rows.length === 0"
      class="mt-6" icon="i-ph-broadcast"
      :title="t('insights.radar.title')"
      :description="filterActive ? t('insights.radar.emptyFiltered') : t('insights.radar.empty')"
    />

    <div v-else class="bw-card mt-4 overflow-x-auto p-2">
      <UTable :data="rows" :columns="columns">
        <!--
          SORTIERBARE KÖPFE als Knopf, nicht als Text mit Klick-Handler: die
          Spalte ist bedienbar, also gehört sie in ein Element, das die Tastatur
          erreicht. Die Beschriftung bleibt dieselbe Zeichenkette wie in der
          Spalten-Definition — ein LEERER Kopf wäre ein stiller
          Hydration-Fehler (im Projekt schon erwischt).
        -->
        <template #views-header>
          <UButton
            :label="t('insights.radar.views')" :icon="sortIcon('views')" trailing
            color="neutral" variant="ghost" size="xs" class="-mx-2"
            @click="toggleSort('views')"
          />
        </template>
        <template #likes-header>
          <UButton
            :label="t('insights.radar.likes')" :icon="sortIcon('likes')" trailing
            color="neutral" variant="ghost" size="xs" class="-mx-2"
            @click="toggleSort('likes')"
          />
        </template>
        <template #commentCount-header>
          <UButton
            :label="t('insights.radar.comments')" :icon="sortIcon('commentCount')" trailing
            color="neutral" variant="ghost" size="xs" class="-mx-2"
            @click="toggleSort('commentCount')"
          />
        </template>
        <template #age-header>
          <UButton
            :label="t('insights.radar.age')" :icon="sortIcon('age')" trailing
            color="neutral" variant="ghost" size="xs" class="-mx-2"
            @click="toggleSort('age')"
          />
        </template>
        <template #opportunity-header>
          <UButton
            :label="t('insights.radar.opportunity')" :icon="sortIcon('opportunity')" trailing
            color="neutral" variant="ghost" size="xs" class="-mx-2"
            @click="toggleSort('opportunity')"
          />
        </template>
        <template #channelTitle-cell="{ row }">
          <span class="text-sm" style="color: var(--bw-ink-soft)">{{ row.original.channelTitle }}</span>
        </template>
        <template #title-cell="{ row }">
          <span class="text-sm font-medium">{{ row.original.title }}</span>
        </template>
        <template #topic-cell="{ row }">
          <span class="bw-label rounded-full px-2 py-0.5" style="background: var(--bw-surface-hi); color: var(--bw-muted)">
            {{ insightsTopicLabel(row.original.topic) }}
          </span>
        </template>
        <template #views-cell="{ row }">
          <span class="bw-label tabular-nums">{{ insightsNumber(row.original.views, locale) }}</span>
        </template>
        <template #likes-cell="{ row }">
          <span class="bw-label tabular-nums">{{ insightsNumber(row.original.likes, locale) }}</span>
        </template>
        <template #commentCount-cell="{ row }">
          <span class="bw-label tabular-nums">{{ insightsNumber(row.original.commentCount, locale) }}</span>
        </template>
        <template #age-cell="{ row }">
          <span class="bw-label tabular-nums" style="color: var(--bw-muted)">
            {{ t('insights.radar.ageDays', { count: row.original.ageDays }) }}
          </span>
        </template>
        <template #opportunity-cell="{ row }">
          <UTooltip :text="formulaFor(row.original.opportunity)">
            <span class="bw-label tabular-nums" style="color: var(--bw-accent)">
              <template v-if="row.original.opportunity.score === null">
                {{ t('insights.radar.opportunityNone') }}
              </template>
              <template v-else>
                {{ t('insights.radar.opportunityOf', { score: row.original.opportunity.score }) }}
                <span style="color: var(--bw-muted)">
                  · {{ t('insights.radar.signals', { count: row.original.opportunity.signals, total: row.original.opportunity.of }) }}
                </span>
              </template>
            </span>
          </UTooltip>
        </template>
        <template #verdict-cell="{ row }">
          <InVerdictSwitch
            :model-value="row.original.verdict"
            :busy="props.busyVideoId === row.original.videoId"
            @update:model-value="value => emit('verdict', row.original.videoId, value)"
          />
        </template>

        <!--
          Der zweite Link: das Video selbst, in einem NEUEN Tab. `noopener`
          ist Pflicht und nicht Geschmack — ohne ihn bekäme die geöffnete
          Seite über `window.opener` Zugriff auf diese hier.
        -->
        <template #open-cell="{ row }">
          <UButton
            icon="i-ph-youtube-logo"
            color="neutral"
            variant="ghost"
            size="xs"
            :to="insightsVideoUrl(row.original.videoId)"
            target="_blank"
            rel="noopener"
            :aria-label="t('insights.radar.openLabel')"
            :title="t('insights.radar.openLabel')"
          />
        </template>
      </UTable>
    </div>
  </section>
</template>
