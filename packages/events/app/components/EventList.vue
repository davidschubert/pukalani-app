<script setup lang="ts">
import type { EventListResponse, EventWithRsvp } from '../../shared/types/event'
import {
  EVENT_MINE_VIEWS,
  EVENT_TIME_VIEWS,
  INITIAL_EVENT_LIST_FILTER,
  eventListQuery,
  selectEventListView,
  toggleEventListGoing,
  type EventListFilterState,
  type EventListView,
} from '../../shared/eventListFilter'

/**
 * Event-Übersicht als ZWEI Spalten (kein Ansicht-Switch mehr — die Filter
 * wirkten im Kalender nicht, und Platz ist da): links die Liste mit
 * Filter-Chips (Kommende/Heute/Morgen/Wochenende/Archiv + eingeloggt:
 * Geliked/Teilgenommen — Letzteres ist der Unterschied zum Archiv: nur MEINE
 * besuchten Events — und der SCHALTER „Zugesagt", der sich zu „Kommende" und
 * „Wochenende" zuschalten lässt, Issue 417), Monats-Gruppierung und Cursor-Pagination
 * (nur Kommende/Archiv); rechts DAUERHAFT der Monats-Kalender (sticky,
 * eigene Monats-Navigation). Hover auf einer Card hebt das Event im
 * Kalender hervor. Zeitfenster (Heute/Morgen/Wochenende) rechnet der
 * CLIENT in lokaler Zeit und nutzt die Range-Query.
 */
const { t, locale, locales } = useI18n()
const { isLoggedIn } = useCurrentUser()

const filter = ref<EventListFilterState>({ ...INITIAL_EVENT_LIST_FILTER })
const rows = ref<EventWithRsvp[]>([])
const nextCursor = ref<string | null>(null)
const loadingMore = ref(false)

/** Card unter dem Cursor → Kalender-Pill-Highlight */
const hoveredId = ref<string | null>(null)

/** Gegenrichtung: Kalender-Pill unter dem Cursor → Card-Highlight + sanft in Sicht scrollen */
const calendarHoveredId = ref<string | null>(null)
watch(calendarHoveredId, (id) => {
  if (!id) return
  document.querySelector(`[data-event-card="${id}"]`)
    ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
})

function selectView(view: EventListView) {
  filter.value = selectEventListView(filter.value, view)
}
function toggleGoing() {
  filter.value = toggleEventListGoing(filter.value)
}

// Suche: debounct gegen ?q (Fulltext auf title, Migration 003)
const search = ref('')
const debouncedSearch = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { debouncedSearch.value = value.trim() }, 300)
})
onBeforeUnmount(() => clearTimeout(searchTimer))

// Zeitfenster rechnet der Browser in SEINER Zone (shared/eventListFilter.ts)
const listQuery = computed<Record<string, string>>(() => eventListQuery(filter.value, debouncedSearch.value, new Date()))

/**
 * `useRequestFetch` statt `$fetch`: im Pool entscheidet der HOST über den
 * Mandanten, und ein blankes `$fetch` verliert ihn im SSR (dieselbe Regel wie
 * in blueprint/app/pages/feed.vue, CLAUDE.md).
 *
 * Was das konkret hiess: `/api/events` antwortete beim serverseitigen Rendern
 * mit `404 Unknown host`, `useAsyncData` merkte sich den Fehler, und die Seite
 * schrieb auf JEDEM Mandanten-Host „Aktuell sind keine Events geplant" — auch
 * dann, wenn Termine da waren. Der Kalender direkt darunter zeigte sie
 * trotzdem, weil er erst im Browser lädt; genau dieser Widerspruch auf
 * demselben Bildschirm hat den Fehler am 2026-08-15 auf demo.pukalani.app
 * auffliegen lassen.
 *
 * `loadMore()` unten darf bei `$fetch` bleiben: das läuft ausschliesslich nach
 * einem Klick, also im Browser, und dort ist der Host echt.
 */
const requestFetch = useRequestFetch()
const { data, status, error, refresh } = await useAsyncData<EventListResponse>(
  'events:list',
  () => requestFetch<EventListResponse>('/api/events', { query: listQuery.value }),
  { watch: [filter, debouncedSearch] },
)

// Lädt / Fehler / leer / Daten (FE-004, LZ1): ein Fehler heißt nicht „keine Termine".
const listing = computed(() => listState({ status: status.value, error: error.value, empty: rows.value.length === 0 }))

watch(data, (value) => {
  rows.value = value?.rows ?? []
  nextCursor.value = value?.nextCursor ?? null
}, { immediate: true })

async function loadMore() {
  if (!nextCursor.value || loadingMore.value) return
  loadingMore.value = true
  try {
    const res = await $fetch<EventListResponse>('/api/events', {
      query: { ...listQuery.value, cursor: nextCursor.value },
    })
    rows.value = [...rows.value, ...res.rows]
    nextCursor.value = res.nextCursor
  }
  catch {
    // nächster Klick versucht es erneut
  }
  finally {
    loadingMore.value = false
  }
}

/** Vote-Updates aus der Card in die Liste übernehmen */
function onCardUpdated(updated: EventWithRsvp) {
  rows.value = rows.value.map(row => (row.$id === updated.$id ? updated : row))
}

// Monats-Gruppierung (Referenz S1): Überschrift je Monat, locale-korrekt
const language = computed(() => {
  const entries = locales.value as Array<{ code: string, language?: string }>
  return entries.find(entry => entry.code === locale.value)?.language ?? locale.value
})
const groups = computed(() => {
  const fmt = new Intl.DateTimeFormat(language.value, { month: 'long', year: 'numeric' })
  const out: Array<{ label: string, events: EventWithRsvp[] }> = []
  for (const ev of rows.value) {
    const label = fmt.format(new Date(ev.startAt))
    const last = out.at(-1)
    if (last && last.label === label) last.events.push(ev)
    else out.push({ label, events: [ev] })
  }
  return out
})
</script>

<template>
  <div class="gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
    <!-- Linke Spalte: Filter + Suche + Liste -->
    <div class="min-w-0">
      <!--
        Eine Gruppe aus Umschalt-Knöpfen (`aria-pressed`), keine Reiter: seit
        Issue 417 können ZWEI zugleich an sein („Wochenende" + „Zugesagt"), und
        das kann eine Reiterleiste nicht ausdrücken. Vorher stand hier
        `role="tablist"` ohne einen einzigen Reiter darin.
      -->
      <div
        class="flex flex-wrap items-center gap-1"
        role="group"
        :aria-label="t('events.list.filtersLabel')"
        data-testid="events-filters"
      >
        <UButton
          v-for="item in EVENT_TIME_VIEWS"
          :key="item"
          :color="filter.view === item ? 'primary' : 'neutral'"
          :variant="filter.view === item ? 'soft' : 'ghost'"
          size="sm"
          :aria-pressed="filter.view === item"
          :data-filter="item"
          @click="() => selectView(item)"
        >
          {{ t(`events.list.filters.${item}`) }}
        </UButton>
        <template v-if="isLoggedIn">
          <span class="mx-1 h-4 w-px bg-accented" aria-hidden="true" />
          <UButton
            :color="filter.going ? 'primary' : 'neutral'"
            :variant="filter.going ? 'soft' : 'ghost'"
            :icon="filter.going ? 'i-ph-check' : undefined"
            size="sm"
            :aria-pressed="filter.going"
            data-filter="going"
            @click="toggleGoing"
          >
            {{ t('events.list.filters.going') }}
          </UButton>
          <UButton
            v-for="item in EVENT_MINE_VIEWS"
            :key="item"
            :color="filter.view === item ? 'primary' : 'neutral'"
            :variant="filter.view === item ? 'soft' : 'ghost'"
            size="sm"
            :aria-pressed="filter.view === item"
            :data-filter="item"
            @click="() => selectView(item)"
          >
            {{ t(`events.list.filters.${item}`) }}
          </UButton>
        </template>
      </div>

      <UInput
        v-model="search"
        icon="i-ph-magnifying-glass"
        :placeholder="t('events.list.searchPlaceholder')"
        class="mt-3 w-full"
        data-testid="events-search"
      />

      <CoreListState :state="listing" :retry="refresh">
        <template #empty>
          <CoreEmptyState
            icon="i-ph-calendar-blank"
            :title="debouncedSearch
              ? t('events.list.searchEmpty')
              : filter.view === 'archive' ? t('events.list.pastEmpty')
                : filter.view === 'upcoming' && !filter.going ? t('events.list.empty') : t('events.list.filterEmpty')"
            data-testid="events-empty"
          />
        </template>
      <div class="mt-4 space-y-6" data-testid="events-list">
        <section v-for="group in groups" :key="group.label">
          <h2 class="mb-2 text-sm font-semibold text-muted capitalize" data-testid="events-month">{{ group.label }}</h2>
          <div class="space-y-4">
            <EventCard
              v-for="event in group.events"
              :key="event.$id"
              :event="event"
              :highlighted="calendarHoveredId === event.$id"
              @updated="onCardUpdated"
              @mouseenter="() => { hoveredId = event.$id }"
              @mouseleave="() => { hoveredId = null }"
            />
          </div>
        </section>
      </div>
      </CoreListState>

      <div v-if="nextCursor" class="mt-4 flex justify-center">
        <UButton color="neutral" variant="outline" size="sm" :loading="loadingMore" @click="loadMore">
          {{ t('events.list.loadMore') }}
        </UButton>
      </div>
    </div>

    <!-- Rechte Spalte: Kalender, dauerhaft sichtbar (mobil unter der Liste) -->
    <aside class="mt-8 lg:sticky lg:top-4 lg:mt-0">
      <ClientOnly>
        <EventCalendar :highlight-id="hoveredId" @hover="($event) => { calendarHoveredId = $event }" />
        <template #fallback>
          <CoreLoadingState />
        </template>
      </ClientOnly>
    </aside>
  </div>
</template>
