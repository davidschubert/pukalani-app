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
import type { InsightsBriefState, InsightsVerdict, InsightsWatchItem } from '../../../../shared/insightsWatchlist'
import {
  INSIGHTS_BRIEF_POLL_MS,
  INSIGHTS_VERDICTS,
  INSIGHTS_WATCHLIST_MAX,
  INSIGHTS_WATCH_NOTE_MAX,
  insightsBriefPending,
  insightsBriefState,
  insightsVideoUrl,
} from '../../../../shared/insightsWatchlist'
import type {
  InsightsBriefResponse,
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

/**
 * DIE UHR, GEGEN DIE DER BRIEF-ZUSTAND GERECHNET WIRD (BI3).
 *
 * Sie ist ein `ref` und keine `Date.now()`-Lesung im Rendern, aus zwei
 * Gründen: ein Zeitstempel im Template wäre beim SSR ein anderer als im
 * Browser (derselbe Hydration-Grund wie beim `today` aus der Antwort), und
 * „läuft gerade" muss von SELBST zu „nicht zurückgekommen" werden, wenn
 * niemand klickt — dazu braucht die Seite einen Takt und keine Momentaufnahme.
 *
 * Der Startwert ist 0 und nicht `Date.now()`: vor dem Mounten ist jede Zeile
 * mit einem Lauf „läuft" (0 minus ein Zeitstempel ist negativ, also frisch) —
 * die vorsichtige Richtung, die auch die pure Regel nimmt.
 */
const briefNow = ref(0)

// ── Rechnen, filtern, sortieren ────────────────────────────────────────────

interface FindRow extends InsightsWatchItem {
  ageDays: number
  opportunity: InsightsOpportunity
  /**
   * Der Brief-Zustand der Zeile (BI3) — GERECHNET, wie die Opportunity daneben.
   *
   * Er hängt an der Uhr (`briefRunAt` + Stall-Grenze), deshalb an `briefNow`
   * und nicht an `Date.now()` im Rendern: so springt die ganze Liste in einem
   * Takt um, und es gibt keine Zeile, die ihren Zustand aus einem anderen
   * Augenblick zeigt als ihre Nachbarin.
   */
  briefState: InsightsBriefState
}

const allRows = computed<FindRow[]>(() => items.value.map((item) => {
  const ageDays = item.publishedAt ? insightsDaysBetween(item.publishedAt, today.value) : 0
  return {
    ...item,
    ageDays,
    briefState: insightsBriefState(item, briefNow.value),
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

// ── Brief aus einem Video (K5, seit BI3 im Hintergrund) ────────────────────

/**
 * DER TEUERSTE KNOPF DIESER OBERFLÄCHE — deshalb drei Dinge, die ein
 * gewöhnlicher Speichern-Knopf nicht braucht.
 *
 *  1. EINE RÜCKFRAGE. Ein Lauf kostet echtes Geld (rund fünf Cent für ein
 *     25-Minuten-Video) und dauert bis zu drei Minuten. Ein versehentlicher
 *     Klick soll nicht beides ausgeben.
 *  2. KEIN WARTEN AUF DAS ERGEBNIS (BI3). Die Route antwortet sofort mit
 *     `202`; der Lauf läuft weiter und berichtet an die ZEILE. Vorher hing
 *     dieser Klick bis zu drei Minuten an einer offenen Verbindung — und
 *     starb nach 60 Sekunden am Proxy, mit einem Fehler-Toast über einen
 *     Entwurf, der in Wahrheit korrekt angelegt wurde.
 *  3. KEIN AUTOMATISCHES WEITERSPRINGEN. Der Beitrag entsteht, aber der
 *     Brief will gelesen werden; der Toast führt hin, statt die Liste unter
 *     den Händen wegzuziehen.
 */
const briefingId = ref('')

async function makeBrief(item: InsightsWatchItem): Promise<void> {
  if (!confirm(t('insights.finds.briefConfirm'))) return
  briefingId.value = item.videoId
  busyId.value = item.videoId
  try {
    await $fetch<InsightsBriefResponse>(
      `/api/insights/watchlist/${item.videoId}/brief`,
      { method: 'POST' },
    )
    // Die Antwort trägt die Zeile schon, aber die LISTE ist die Wahrheit —
    // und sie muss den Lauf sehen, damit der Takt unten anläuft.
    await refresh()
    toast.add({
      title: t('insights.finds.briefStarted'),
      description: t('insights.finds.briefStartedHint'),
      color: 'info',
    })
  }
  catch (error) {
    toast.add({ title: errorText(error), color: 'error' })
  }
  finally {
    briefingId.value = ''
    busyId.value = ''
  }
}

/**
 * SOLANGE EIN LAUF OFFEN IST, FRAGT DIE LISTE NACH (BI3).
 *
 * ── WARUM NACHFRAGEN UND NICHT REALTIME ─────────────────────────────────
 * Die drei insights-Tabellen sind server-only (`permissions: []`), es gibt
 * also keine Session, die `insights_watchlist` abonnieren könnte —
 * `useRealtimeRows` hätte hier nichts zu lesen. Der Preis des Nachfragens ist
 * klein und gedeckelt: EIN Mensch auf dieser Seite, ein Lauf von höchstens
 * drei Minuten, alle fünf Sekunden eine Abfrage, und der Takt hört von selbst
 * auf, sobald keine Zeile mehr „läuft" sagt.
 *
 * Der Takt tut ZWEI Dinge, und beide müssen in einem Takt liegen: er stellt
 * die Uhr (`briefNow`, damit ein verschollener Lauf von selbst umspringt) und
 * er holt die Liste. Nur die Uhr zu stellen hiesse, dass ein fertiger Brief
 * erst beim nächsten Klick auftaucht; nur zu laden hiesse, dass ein
 * verwaister Lauf bis zum Neuladen „läuft" anzeigt.
 */
const briefPolling = computed(() => insightsBriefPending(items.value, briefNow.value))

/**
 * WELCHE LÄUFE BEIM LETZTEN BLICK NOCH OFFEN WAREN.
 *
 * Daraus entsteht die Meldung: eine Zeile, die vorhin „läuft" war und jetzt
 * einen Beitrag hat, ist GERADE fertig geworden — und genau dann gehört der
 * Link zum Entwurf vor die Augen des Menschen. Das ist die Zusage, die BI3
 * wiederherstellt; kaputt gemacht hat sie der 504, nicht der Lauf.
 */
const briefWatched = new Set<string>()

/**
 * UHR STELLEN UND MELDEN — aufgerufen beim Mounten und bei JEDER neuen Liste.
 *
 * Er hängt an der Liste und nicht am Takt, damit er auch dann greift, wenn
 * die Liste aus einem anderen Grund neu kommt (Urteil geändert, Fundstück
 * weggenommen) — und damit es nur EINE Stelle gibt, die den Übergang sieht.
 */
function syncBriefRuns(): void {
  if (!hydrated.value) return
  briefNow.value = Date.now()

  for (const item of items.value) {
    const state = insightsBriefState(item, briefNow.value)
    if (state === 'running') {
      briefWatched.add(item.videoId)
      continue
    }
    // Nur wer VORHIN lief, hat gerade einen Übergang gemacht. Eine Zeile, die
    // beim ersten Blick schon fertig war, meldet nichts — sonst stünde beim
    // Seitenaufruf ein Toast für jeden alten Brief.
    if (!briefWatched.delete(item.videoId)) continue

    if (state === 'done') {
      toast.add({
        title: t('insights.finds.briefDone'),
        description: t('insights.finds.briefDoneHint'),
        color: 'success',
        actions: [{
          label: t('insights.finds.briefOpen'),
          onClick: () => navigateTo(localePath(`/dashboard/insights/${item.briefPostId}`)),
        }],
      })
      continue
    }
    // `failed` und `stalled` — der Grund steht an der Zeile, der Toast sagt
    // nur, DASS es diesen Lauf erwischt hat. Wer die Seite weggeklickt hat,
    // sieht ihn an der Zeile wieder.
    toast.add({
      title: t('insights.finds.briefFailed'),
      description: briefHint({ ...item, briefState: state }),
      color: 'error',
    })
  }
}

watch(items, syncBriefRuns)

onMounted(() => {
  syncBriefRuns()

  let timer: ReturnType<typeof setInterval> | null = null
  const stop = () => {
    if (timer === null) return
    clearInterval(timer)
    timer = null
  }

  watchEffect(() => {
    if (!briefPolling.value) {
      stop()
      return
    }
    if (timer !== null) return
    timer = setInterval(() => {
      // Die Uhr auch OHNE Antwort stellen: so springt ein verschollener Lauf
      // um, selbst wenn das Nachfragen gerade scheitert.
      briefNow.value = Date.now()
      // Ein Fehlschlag des Nachfragens ist KEIN Toast: die Seite hat gerade
      // keinen Auftrag des Menschen, und eine Netzschluckauf-Meldung alle
      // fünf Sekunden wäre schlimmer als die Verzögerung.
      void refresh().catch(() => {})
    }, INSIGHTS_BRIEF_POLL_MS)
  })

  onBeforeUnmount(stop)
})

/** Was an der Zeile über ihren Lauf steht — ein Satz je Zustand. */
function briefHint(row: Pick<FindRow, 'briefState' | 'briefError' | 'available'>): string {
  switch (row.briefState) {
    case 'running': return t('insights.finds.briefRunningHint')
    case 'stalled': return t('insights.finds.briefStalledHint')
    case 'failed': return t(`insights.finds.error.${row.briefError || 'generic'}`)
    default: return row.available ? t('insights.finds.briefHint') : t('insights.finds.gone')
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
  { id: 'brief', header: () => t('insights.finds.brief') },
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

          <!--
            VIER ANSICHTEN, WEIL ES SEIT BI3 VIER ZUSTÄNDE GIBT. Der Knopf
            allein konnte nur „noch keiner" und „fertig" sagen; „läuft gerade"
            und „schiefgegangen" sind die beiden, die der 504 verschwiegen hat.
          -->
          <template #brief-cell="{ row }">
            <UButton
              v-if="row.original.briefState === 'done'"
              icon="i-ph-article"
              color="neutral" variant="subtle" size="xs"
              :to="localePath(`/dashboard/insights/${row.original.briefPostId}`)"
              :label="t('insights.finds.briefOpen')"
            />
            <!--
              Kein Knopf, solange der Lauf offen ist: er wäre eine Einladung
              zum zweiten Mal zahlen. Die Route lehnt das ohnehin ab
              (`brief_running`), aber eine Oberfläche, die etwas anbietet, das
              der Server verweigert, ist eine falsche Auskunft.
            -->
            <span
              v-else-if="row.original.briefState === 'running'"
              class="inline-flex items-center gap-1.5 text-xs"
              style="color: var(--ui-text-muted)"
              :title="briefHint(row.original)"
            >
              <UIcon name="i-ph-spinner" class="animate-spin size-4" />
              {{ t('insights.finds.briefRunning') }}
            </span>
            <UButton
              v-else
              :icon="row.original.briefState === 'none' ? 'i-ph-sparkle' : 'i-ph-arrow-counter-clockwise'"
              :color="row.original.briefState === 'none' ? 'primary' : 'warning'"
              variant="ghost" size="xs"
              :loading="briefingId === row.original.videoId"
              :disabled="busyId === row.original.videoId || !row.original.available"
              :label="row.original.briefState === 'none' ? t('insights.finds.briefMake') : t('insights.finds.briefRetry')"
              :title="briefHint(row.original)"
              @click="makeBrief(row.original)"
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
