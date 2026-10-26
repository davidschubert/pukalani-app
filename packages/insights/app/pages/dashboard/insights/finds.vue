<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { InsightsOpportunity, InsightsTopicKey } from '../../../../shared/insightsPost'
import {
  INSIGHTS_OPPORTUNITY_SIGNALS,
  INSIGHTS_OPPORTUNITY_SIGNALS_PLANNED,
  INSIGHTS_TOPICS,
  insightsOpportunity,
  insightsPopularity,
} from '../../../../shared/insightsPost'
import type { InsightsVerdict, InsightsWatchItem } from '../../../../shared/insightsWatchlist'
import {
  INSIGHTS_VERDICTS,
  INSIGHTS_WATCHLIST_MAX,
  INSIGHTS_WATCH_NOTE_MAX,
  insightsVideoUrl,
} from '../../../../shared/insightsWatchlist'
import type {
  InsightsWatchAddedResponse,
  InsightsWatchDeletedResponse,
  InsightsWatchSavedResponse,
  InsightsWatchlistResponse,
} from '../../../../shared/types/insightsApi'
import { insightsDay, insightsDaysBetween, insightsNumber } from '../../../utils/insightsFormat'

/**
 * DIE EIGENEN FUNDSTÜCKE (BI2 K4, Adresse `/dashboard/insights/finds`).
 *
 * ── WAS SIE VOM THEMENRADAR UNTERSCHEIDET ───────────────────────────────
 * Dieselben Spalten, dieselbe Opportunity — und eine andere Lebensdauer. Der
 * Radar zeigt, was AUF DEN KURATIERTEN KANÄLEN läuft, und seine Zeilen
 * vergehen (täglich neu, 30-Tage-Netz, Alters-Deckel). Hier steht, was DU
 * aufgehoben hast, und es bleibt, bis du es wegnimmst. Deshalb gibt es hier
 * auch keinen Alters-Filter: man hebt absichtlich auch ein Video von 2019 auf.
 *
 * ── DIE OPPORTUNITY WIRD HIER GERECHNET, NICHT GESPEICHERT ──────────────
 * Wörtlich wie im Radar (`InRadar.vue`): die Zahl steht neben ihrem
 * Rechenweg, und das Alter zählt gegen HEUTE. Eine gespeicherte Zahl wäre bei
 * einem Video, das seit einem halben Jahr in der Liste liegt, die Aussage von
 * damals — und niemand sähe ihr das an.
 *
 * ── DER EINE ZUSTAND, DEN ES IM RADAR NICHT GIBT ────────────────────────
 * `available: false` — das Video ist weg (gelöscht, privat). Dann sind die
 * Zahlen geleert und die Zeile steht mit deinem Urteil da. Die Ansicht sagt
 * das deutlich, statt eine Zeile voller Nullen zu zeigen.
 */
definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'admin'],
  requiredCapability: 'insights.manage',
  // Betreiber-Sache, wie Liste, Editor, Radar und Kanäle daneben.
  dashboardScope: 'operator',
})

const { t, locale } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
useBrandTitle(() => t('insights.finds.title'))

const readerLocale = computed(() => (locale.value === 'de' ? 'de' : 'en') as 'de' | 'en')

// ── Laden ──────────────────────────────────────────────────────────────────

const { data, refresh, status } = await useFetch<InsightsWatchlistResponse>('/api/insights/watchlist', {
  lazy: true,
  server: false,
})

/** Mount-Gate gegen den Hydration-Mismatch (Falle aus den I2-Resten). */
const hydrated = ref(false)
onMounted(() => {
  hydrated.value = true
})

const items = computed<InsightsWatchItem[]>(() => data.value?.items ?? [])
const configured = computed(() => data.value?.configured === true)
const today = computed(() => data.value?.today ?? new Date().toISOString().slice(0, 10))
const loading = computed(() => hydrated.value && status.value === 'pending')

// ── Rechnen, filtern, sortieren ────────────────────────────────────────────

interface FindRow extends InsightsWatchItem {
  ageDays: number
  opportunity: InsightsOpportunity
}

const allRows = computed<FindRow[]>(() => items.value.map((item) => {
  const ageDays = item.publishedAt ? insightsDaysBetween(item.publishedAt, today.value) : 0
  return {
    ...item,
    ageDays,
    opportunity: insightsOpportunity({
      // OHNE ZAHLEN KEINE SIGNALE: ein verschwundenes Video hat keine
      // Popularität, und 0 wäre eine Bewertung statt einer Lücke.
      ...(item.available && item.channelSubscribers > 0
        ? { popularity: insightsPopularity(item.views, item.channelSubscribers) }
        : {}),
      ...(item.available && item.publishedAt ? { ageDays } : {}),
    }),
  }
}))

/** Die Vorauswahl — der Filter, für den K4 gebaut wurde. */
const verdictFilter = ref<InsightsVerdict | 'all'>('all')
const filterItems = computed(() => [
  { label: t('insights.finds.filterAll'), value: 'all' as const },
  ...INSIGHTS_VERDICTS.map(verdict => ({ label: t(`insights.verdict.${verdict}`), value: verdict })),
])

const rows = computed<FindRow[]>(() =>
  verdictFilter.value === 'all'
    ? allRows.value
    : allRows.value.filter(row => row.verdict === verdictFilter.value),
)

const interestingCount = computed(() => allRows.value.filter(row => row.verdict === 'interesting').length)

// ── Hinzufügen ─────────────────────────────────────────────────────────────

const addInput = ref('')
const adding = ref(false)

async function add(): Promise<void> {
  const input = addInput.value.trim()
  if (!input) return
  adding.value = true
  try {
    await $fetch<InsightsWatchAddedResponse>('/api/insights/watchlist', {
      method: 'POST',
      body: { input },
    })
    addInput.value = ''
    toast.add({ title: t('insights.finds.added'), color: 'success' })
    await refresh()
  }
  catch (error) {
    toast.add({ title: errorText(error), color: 'error' })
  }
  finally {
    adding.value = false
  }
}

// ── Ändern und wegnehmen ───────────────────────────────────────────────────

/** Welche Zeile gerade schreibt — damit nur IHR Schalter lädt. */
const busyId = ref('')

async function patch(item: InsightsWatchItem, body: Record<string, unknown>): Promise<void> {
  busyId.value = item.videoId
  try {
    await $fetch<InsightsWatchSavedResponse>(`/api/insights/watchlist/${item.videoId}`, {
      method: 'PATCH',
      body,
    })
    await refresh()
  }
  catch (error) {
    toast.add({ title: errorText(error), color: 'error' })
  }
  finally {
    busyId.value = ''
  }
}

async function remove(item: InsightsWatchItem): Promise<void> {
  // Wegnehmen ist nicht umkehrbar, aber auch nicht schwer wiederzubeschaffen
  // (der Link steht daneben). Eine Rückfrage genügt; „Uninteressant" ist der
  // Weg für alle, die die Zeile behalten wollen.
  if (!confirm(t('insights.finds.removeConfirm'))) return
  busyId.value = item.videoId
  try {
    await $fetch<InsightsWatchDeletedResponse>(`/api/insights/watchlist/${item.videoId}`, { method: 'DELETE' })
    toast.add({ title: t('insights.finds.removed'), color: 'success' })
    await refresh()
  }
  catch (error) {
    toast.add({ title: errorText(error), color: 'error' })
  }
  finally {
    busyId.value = ''
  }
}

/** Der Ablehnungsgrund aus dem Envelope — sonst ein Satz. */
function errorText(error: unknown): string {
  const reason = (error as { data?: { reason?: string } } | null)?.data?.reason
  const key = `insights.finds.error.${reason ?? 'generic'}`
  const text = t(key)
  return text === key ? t('insights.finds.error.generic') : text
}

const topicItems = INSIGHTS_TOPICS.map(topic => ({ label: topic.label, value: topic.key }))

// ── Die Tabelle ────────────────────────────────────────────────────────────

const columns = computed<TableColumn<FindRow>[]>(() => [
  { accessorKey: 'title', header: () => t('insights.radar.video') },
  { accessorKey: 'topic', header: () => t('insights.radar.topic') },
  { accessorKey: 'views', header: () => t('insights.radar.views') },
  { accessorKey: 'likes', header: () => t('insights.radar.likes') },
  { accessorKey: 'commentCount', header: () => t('insights.radar.comments') },
  { id: 'age', header: () => t('insights.radar.age') },
  { id: 'opportunity', header: () => t('insights.radar.opportunity') },
  { accessorKey: 'note', header: () => t('insights.finds.note') },
  { id: 'verdict', header: () => t('insights.verdict.label') },
  { id: 'open', header: () => t('insights.radar.openLabel') },
])

function formulaFor(opportunity: InsightsOpportunity): string {
  return t('insights.radar.formula', { count: opportunity.signals, total: opportunity.of })
}
</script>

<template>
  <UDashboardPanel id="insights-finds">
    <template #header>
      <UDashboardNavbar :title="t('insights.finds.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            :label="t('insights.radar.title')" icon="i-ph-broadcast"
            color="neutral" variant="ghost"
            :to="localePath('/dashboard/insights/radar')"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="text-sm leading-relaxed" style="color: var(--ui-text-muted)">{{ t('insights.finds.lead') }}</p>

      <UAlert
        v-if="hydrated && !configured"
        class="mt-4 shrink-0"
        icon="i-ph-key" color="warning" variant="subtle"
        :description="t('insights.finds.keyMissing')"
      />

      <!-- Der Link-Wurf: ein Feld, ein Knopf, fertig. -->
      <UCard class="mt-4 shrink-0">
        <UFormField :label="t('insights.finds.addLabel')" :hint="t('insights.finds.addHint')" name="findInput">
          <div class="flex gap-2">
            <UInput
              v-model="addInput"
              :placeholder="t('insights.finds.addPlaceholder')"
              :disabled="!configured"
              class="flex-1"
              @keydown.enter.prevent="add"
            />
            <UButton
              :label="t('insights.finds.add')" icon="i-ph-plus"
              :loading="adding"
              :disabled="!configured || !addInput.trim()"
              @click="add"
            />
          </div>
        </UFormField>
      </UCard>

      <div v-if="allRows.length > 0" class="mt-6 flex flex-wrap items-center gap-3">
        <USelect
          v-model="verdictFilter"
          :items="filterItems"
          value-key="value"
          icon="i-ph-check-square-offset"
          class="w-52"
        />
        <p class="text-sm" style="color: var(--ui-text-dimmed)">
          {{ t('insights.finds.shown', { shown: rows.length, total: allRows.length }) }}
          · {{ t('insights.finds.interesting', { count: interestingCount }) }}
        </p>
        <p class="bw-label ms-auto" style="color: var(--ui-text-dimmed)">
          {{ t('insights.finds.capacity', { max: INSIGHTS_WATCHLIST_MAX }) }}
        </p>
      </div>

      <CoreEmptyState
        v-if="hydrated && !loading && allRows.length === 0"
        class="mt-6" icon="i-ph-bookmark-simple"
        :title="t('insights.finds.title')" :description="t('insights.finds.empty')"
      />

      <CoreEmptyState
        v-else-if="hydrated && !loading && rows.length === 0"
        class="mt-6" icon="i-ph-funnel"
        :title="t('insights.finds.title')" :description="t('insights.finds.emptyFiltered')"
      />

      <div v-else-if="allRows.length > 0" class="mt-4 overflow-x-auto">
        <UTable :data="rows" :columns="columns" :loading="loading">
          <template #title-cell="{ row }">
            <div class="flex flex-col">
              <span class="text-sm font-medium">
                {{ row.original.title || row.original.videoId }}
              </span>
              <span class="text-xs" style="color: var(--ui-text-dimmed)">
                <template v-if="row.original.available">{{ row.original.channelTitle }}</template>
                <template v-else>{{ t('insights.finds.gone') }}</template>
              </span>
            </div>
          </template>

          <template #topic-cell="{ row }">
            <USelectMenu
              :model-value="row.original.topic"
              :items="topicItems"
              value-key="value"
              size="xs"
              class="w-44"
              :disabled="busyId === row.original.videoId"
              @update:model-value="(value: InsightsTopicKey) => patch(row.original, { topic: value })"
            />
          </template>

          <template #views-cell="{ row }">
            <span class="bw-label tabular-nums">
              <template v-if="row.original.available">{{ insightsNumber(row.original.views, readerLocale) }}</template>
              <template v-else>—</template>
            </span>
          </template>
          <template #likes-cell="{ row }">
            <span class="bw-label tabular-nums">
              <template v-if="row.original.available">{{ insightsNumber(row.original.likes, readerLocale) }}</template>
              <template v-else>—</template>
            </span>
          </template>
          <template #commentCount-cell="{ row }">
            <span class="bw-label tabular-nums">
              <template v-if="row.original.available">{{ insightsNumber(row.original.commentCount, readerLocale) }}</template>
              <template v-else>—</template>
            </span>
          </template>

          <template #age-cell="{ row }">
            <span class="bw-label tabular-nums" style="color: var(--ui-text-muted)">
              <template v-if="row.original.publishedAt">{{ insightsDay(row.original.publishedAt, readerLocale) }}</template>
              <template v-else>—</template>
            </span>
          </template>

          <template #opportunity-cell="{ row }">
            <UTooltip :text="formulaFor(row.original.opportunity)">
              <span class="bw-label tabular-nums" style="color: var(--bw-accent, var(--ui-primary))">
                <template v-if="row.original.opportunity.score === null">
                  {{ t('insights.radar.opportunityNone') }}
                </template>
                <template v-else>
                  {{ t('insights.radar.opportunityOf', { score: row.original.opportunity.score }) }}
                </template>
              </span>
            </UTooltip>
          </template>

          <template #note-cell="{ row }">
            <UTextarea
              :model-value="row.original.note"
              :rows="2"
              :maxlength="INSIGHTS_WATCH_NOTE_MAX"
              :placeholder="t('insights.finds.notePlaceholder')"
              size="xs"
              class="w-64"
              :disabled="busyId === row.original.videoId"
              @blur="(event: FocusEvent) => {
                const value = (event.target as HTMLTextAreaElement).value.trim()
                if (value !== row.original.note) patch(row.original, { note: value })
              }"
            />
          </template>

          <template #verdict-cell="{ row }">
            <InVerdictSwitch
              :model-value="row.original.verdict"
              :busy="busyId === row.original.videoId"
              @update:model-value="value => patch(row.original, { verdict: value })"
            />
          </template>

          <template #open-cell="{ row }">
            <div class="flex items-center gap-1">
              <UButton
                icon="i-ph-youtube-logo"
                color="neutral" variant="ghost" size="xs"
                :to="insightsVideoUrl(row.original.videoId)"
                target="_blank" rel="noopener"
                :aria-label="t('insights.radar.openLabel')"
                :title="t('insights.radar.openLabel')"
              />
              <UButton
                icon="i-ph-trash"
                color="error" variant="ghost" size="xs"
                :disabled="busyId === row.original.videoId"
                :aria-label="t('insights.finds.remove')"
                :title="t('insights.finds.remove')"
                @click="remove(row.original)"
              />
            </div>
          </template>
        </UTable>
      </div>

      <p class="bw-pending mt-6">
        {{ t('insights.radar.signals', {
          count: INSIGHTS_OPPORTUNITY_SIGNALS.length,
          total: INSIGHTS_OPPORTUNITY_SIGNALS_PLANNED.length,
        }) }}
      </p>
    </template>
  </UDashboardPanel>
</template>
