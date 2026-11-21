<script setup lang="ts">
import { ANALYTICS_RANGE, ANALYTICS_STATS_RANGES, countryFlagEmoji } from '../../../../shared/analyticsStats'
import type { AnalyticsStatsRange } from '../../../../shared/analyticsStats'
import type { AnalyticsNamedCount, AnalyticsStatsResponse } from '../../../../shared/types/analytics'

/**
 * DIE ZAHLEN IN VOLLER BREITE — der zweite Reiter des Community-Hubs neben
 * „Analytics" (dort steht der Schalter, hier steht das Ergebnis).
 *
 * WARUM EINE EIGENE SEITE: die Karte auf der Einstellungs-Seite beantwortet
 * „läuft es?" mit vier Zahlen. Sie beantwortet nicht „woher kommen die Leute,
 * womit lesen sie, wo steigen sie ein" — und dafür einen Schalter-Reiter
 * immer weiter nach unten wachsen zu lassen, hätte aus einer Einstellung eine
 * Halde gemacht. Zwei Fragen, zwei Reiter.
 *
 * Rechte wie nebenan: `community.analytics` (Owner-Klasse). Die Autorität ist
 * die Route (`server/api/analytics/stats.get.ts`), die zusätzlich das
 * Tarif-Gate zieht; die Page-Meta hier ist die UX-Seite derselben Regel.
 *
 * BEWUSST OHNE CHART-BIBLIOTHEK — dieselbe Entscheidung wie auf der Karte
 * nebenan, und aus demselben Grund: ein zusätzliches Paket im Client-Bundle
 * JEDER Kunden-Community ist der teuerste Weg zu ein paar Balken. Die
 * Tagesreihe sind Flex-Höhen, die Anteils-Balken sind Breiten in Prozent, und
 * jeder Balken trägt sein eigenes Label — eine Grafik ohne Text ist für einen
 * Teil der Nutzer nichts.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'community.analytics' })

const { t, locale } = useI18n()
const localePath = useLocalePath()

useBrandTitle(() => t('analytics.stats.title'))

/**
 * TARIF (P4): nur Sichtbarkeit. Ohne den Plan antwortet die Route 404 — ein
 * Ladefehler an dieser Stelle sähe für den Owner aus wie ein Defekt, obwohl es
 * eine Vertragsfrage ist. Ohne Pool-Tenant (Silo) gibt `planAllows` true.
 */
const { planAllows } = useTenantPlan()
const planOk = computed(() => planAllows('analytics'))

/**
 * Der Zeitraum lebt im Client und reist als Query mit. Die Route glaubt ihn
 * NICHT (`normalizeStatsRange`, fail-closed) — dieser Ref ist Bedienung, keine
 * Zusicherung.
 */
const range = ref<AnalyticsStatsRange>(ANALYTICS_RANGE)

/**
 * `immediate: false`: erst fragen, wenn der Tarif es hergibt. Sonst liefe beim
 * Öffnen der Seite eine Anfrage in ein 404, und die Ansicht müsste einen
 * Fehler erklären, den es gar nicht gibt. Das reaktive `query` sorgt dafür,
 * dass ein Wechsel des Zeitraums von selbst nachlädt — ein zusätzliches
 * `refresh()` im Klick-Handler wäre die zweite Abfrage zur selben Antwort.
 *
 * Ob überhaupt gemessen wird, sagt die ANTWORT (`active`) — eine zweite Frage
 * an /api/analytics/config wäre eine zweite Wahrheit über denselben Zustand.
 */
const { data: stats, status, error, refresh } = await useFetch<AnalyticsStatsResponse>('/api/analytics/stats', {
  query: { range },
  lazy: true,
  server: false,
  immediate: false,
})

watch(planOk, (ok) => { if (ok) refresh() }, { immediate: true })

const loading = computed(() => status.value === 'pending')
/** Ein Fehler an dieser Stelle ist dasselbe wie „gerade nicht erreichbar". */
const unavailable = computed(() => Boolean(error.value) || stats.value?.unavailable === true)
const active = computed(() => stats.value?.active === true)

const totals = computed(() => stats.value?.totals)
const series = computed(() => stats.value?.series ?? [])
const countries = computed(() => stats.value?.countries ?? [])
const regions = computed(() => stats.value?.regions ?? [])

/**
 * „Noch keine Daten" heißt: die Abfrage lief, es steht nur nichts drin. Genau
 * so sieht eine frisch eingeschaltete Community aus — und für die ist der Satz
 * gedacht, nicht für einen Fehler.
 */
const empty = computed(() =>
  active.value
  && !unavailable.value
  && (totals.value?.pageviews ?? 0) === 0
  && (stats.value?.today?.visitors ?? 0) === 0,
)

/**
 * Der Umschalter hat nur dort einen Sinn, wo darunter auch Zahlen stehen —
 * ausgeblendet wird er also genau dann, wenn die Antwort „hier wird nichts
 * gemessen" lautet. Solange noch keine Antwort da ist, bleibt er stehen: ein
 * Bedienelement, das beim Laden auftaucht, springt.
 */
const rangeVisible = computed(() => planOk.value && (!stats.value || active.value))

const rangeOptions = ANALYTICS_STATS_RANGES

// ── Zahlen zu Text ──────────────────────────────────────────────────────────

function formatCount(value: number | undefined): string {
  return (value ?? 0).toLocaleString(locale.value)
}

/** Eine Nachkommastelle: „1,9 Aufrufe" ist eine Aussage, „1,87421" ist Lärm. */
function formatRatio(value: number | undefined): string {
  return (value ?? 0).toLocaleString(locale.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** Verweildauer als m:ss — „94 Sekunden" liest niemand als anderthalb Minuten. */
function formatDuration(seconds: number | undefined): string {
  const total = Math.max(0, Math.round(seconds ?? 0))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Datum kurz (5. Aug.) — die Balkenreihe hat für ISO-Daten keinen Platz. */
function formatDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString(locale.value, { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** Höchster Tageswert — der Maßstab der Balken (mindestens 1, sonst 0/0). */
const seriesMax = computed(() => Math.max(1, ...series.value.map(point => point.visitors)))

/** Anteil am größten Eintrag EINER Liste, in Prozent. Dieselbe 0/0-Sicherung. */
function share(items: { visitors: number }[], value: number): number {
  const max = Math.max(1, ...items.map(item => item.visitors))
  return Math.max(2, Math.round((value / max) * 100))
}

/**
 * DIE RANG-LISTEN als Daten statt als sechsmal kopiertes Markup. Titel, Icon
 * und Spaltenbreite gehören zur jeweiligen Frage, der Rest ist überall gleich.
 */
interface StatsListPanel {
  key: string
  title: string
  icon: string
  /** Adressen in Monospace — eine Pfadliste liest sich sonst als Fließtext. */
  mono?: boolean
  wide?: boolean
  items: AnalyticsNamedCount[]
}

const listPanels = computed<StatsListPanel[]>(() => [
  { key: 'topPages', title: t('analytics.stats.topPages'), icon: 'i-ph-file-text', mono: true, wide: true, items: stats.value?.topPages ?? [] },
  { key: 'entryPages', title: t('analytics.stats.entryPages'), icon: 'i-ph-sign-in', mono: true, wide: true, items: stats.value?.entryPages ?? [] },
  { key: 'sources', title: t('analytics.stats.sources'), icon: 'i-ph-share-network', wide: true, items: stats.value?.topSources ?? [] },
  { key: 'devices', title: t('analytics.stats.devices'), icon: 'i-ph-devices', items: stats.value?.devices ?? [] },
  { key: 'browsers', title: t('analytics.stats.browsers'), icon: 'i-ph-browser', items: stats.value?.browsers ?? [] },
  { key: 'os', title: t('analytics.stats.os'), icon: 'i-ph-desktop', items: stats.value?.os ?? [] },
])

/**
 * Die KPI-Kacheln — auch das lieber eine Liste als sechs fast gleiche Blöcke.
 * `hint` trägt nur, wo eine Zahl ohne Zusatz missverständlich wäre; der Typ
 * steht ausgeschrieben da, damit aus den sechs Objekten keine Union wird, in
 * der `hint` fünfmal gar nicht existiert.
 */
interface StatsKpi {
  key: string
  label: string
  value: string
  icon: string
  hint?: string
}

const kpis = computed<StatsKpi[]>(() => [
  { key: 'today', label: t('analytics.stats.today'), value: formatCount(stats.value?.today?.visitors), icon: 'i-ph-sun' },
  { key: 'visits', label: t('analytics.stats.visits'), value: formatCount(totals.value?.visits), icon: 'i-ph-door-open' },
  { key: 'pageviews', label: t('analytics.stats.pageviews'), value: formatCount(totals.value?.pageviews), icon: 'i-ph-file' },
  { key: 'viewsPerVisit', label: t('analytics.stats.viewsPerVisit'), value: formatRatio(totals.value?.viewsPerVisit), icon: 'i-ph-stack' },
  { key: 'duration', label: t('analytics.stats.duration'), value: formatDuration(totals.value?.visitDurationSeconds), icon: 'i-ph-clock' },
  {
    key: 'bounceRate',
    label: t('analytics.stats.bounceRate'),
    value: `${Math.round(totals.value?.bounceRate ?? 0)} %`,
    icon: 'i-ph-arrow-u-up-left',
    hint: t('analytics.stats.bounceRateHint'),
  },
])
</script>

<template>
  <!-- Kind der Community-Hülle (F51): Panel, Kopfzeile und Scroll-Container
       bringt die Hülle mit (packages/admin/app/pages/dashboard/community.vue). -->
  <div class="flex w-full flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted">{{ t('analytics.stats.subtitle') }}</p>

      <UFieldGroup v-if="rangeVisible" size="xs" data-analytics-range>
        <UButton
          v-for="option in rangeOptions"
          :key="option"
          :color="range === option ? 'primary' : 'neutral'"
          :variant="range === option ? 'solid' : 'subtle'"
          :aria-pressed="range === option"
          :label="t(`analytics.stats.range.${option}`)"
          @click="range = option"
        />
      </UFieldGroup>
    </div>

    <UAlert
      v-if="!planOk"
      color="warning"
      variant="subtle"
      icon="i-ph-seal-check"
      :title="t('analytics.stats.planTitle')"
      :description="t('analytics.stats.planHint')"
      data-analytics-plan-hint
    />

    <!-- Ladezustand im SELBEN Raster: die Seite springt beim Eintreffen der
         Zahlen nicht um, sie füllt sich. -->
    <div v-else-if="loading && !stats" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <USkeleton class="h-56 rounded-lg sm:col-span-2 lg:row-span-2" />
      <USkeleton v-for="n in 6" :key="n" class="h-28 rounded-lg" />
    </div>

    <UAlert
      v-else-if="unavailable"
      color="neutral"
      variant="subtle"
      icon="i-ph-plugs"
      :title="t('analytics.stats.unavailableTitle')"
      :description="t('analytics.stats.unavailableHint')"
      data-analytics-stats-unavailable
    />

    <!-- Es wird nichts gemessen. Der nächste Schritt liegt einen Reiter
         weiter — deshalb steht er hier als Knopf und nicht als Satz. -->
    <CoreEmptyState
      v-else-if="!active"
      icon="i-ph-toggle-left"
      :title="t('analytics.stats.inactiveTitle')"
      :description="t('analytics.stats.inactiveHint')"
      :action-label="t('analytics.stats.inactiveAction')"
      action-icon="i-ph-chart-line-up"
      :action-to="localePath('/dashboard/community/analytics')"
    />

    <CoreEmptyState
      v-else-if="empty"
      icon="i-ph-chart-line-up"
      :title="t('analytics.stats.emptyTitle')"
      :description="t('analytics.stats.emptyHint')"
    />

    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-analytics-bento>
      <!-- DIE GROSSE KACHEL: die Gesamtzahl und ihr Verlauf gehören zusammen
           — eine Zahl ohne Verlauf sagt nicht, ob sie gut ist. -->
      <UCard class="sm:col-span-2 lg:row-span-2" :ui="{ body: 'flex h-full flex-col gap-4' }">
        <div>
          <p class="text-sm text-muted">{{ t('analytics.stats.visitors') }}</p>
          <p class="text-4xl font-bold tabular-nums">{{ formatCount(totals?.visitors) }}</p>
          <p class="text-xs text-muted">{{ t(`analytics.stats.rangeHint.${range}`) }}</p>
        </div>

        <div v-if="series.length" class="mt-auto flex flex-col gap-2">
          <p class="text-sm font-medium">{{ t('analytics.stats.chartTitle') }}</p>
          <div class="flex h-32 items-end gap-px" data-analytics-chart>
            <div
              v-for="point in series"
              :key="point.date"
              role="img"
              :aria-label="t('analytics.stats.bar', { date: formatDay(point.date), count: point.visitors })"
              class="min-w-0 flex-1 rounded-t-sm bg-primary/70"
              :style="{ height: `${Math.max(2, Math.round((point.visitors / seriesMax) * 100))}%` }"
            />
          </div>
          <div class="flex justify-between text-xs text-muted">
            <span>{{ formatDay(series[0]!.date) }}</span>
            <span>{{ formatDay(series[series.length - 1]!.date) }}</span>
          </div>
        </div>
      </UCard>

      <!-- „Letzte 30 Minuten", NICHT „live": die Antwort kann bis zu zwei
           Minuten alt sein (Microcache der Route). Der Punkt pulst, das Wort
           verspricht nichts. -->
      <UCard data-analytics-recent>
        <div class="flex items-center gap-2">
          <span class="size-2 shrink-0 animate-pulse rounded-full bg-primary" aria-hidden="true" />
          <p class="text-2xl font-bold tabular-nums">{{ formatCount(stats?.recentVisitors) }}</p>
        </div>
        <p class="truncate text-sm text-muted">{{ t('analytics.stats.recent') }}</p>
      </UCard>

      <UCard v-for="kpi in kpis" :key="kpi.key" :data-analytics-kpi="kpi.key">
        <div class="flex items-center gap-2">
          <UIcon :name="kpi.icon" class="size-4 shrink-0 text-muted" />
          <p class="text-2xl font-bold tabular-nums">{{ kpi.value }}</p>
        </div>
        <p class="truncate text-sm text-muted">{{ kpi.label }}</p>
        <p v-if="kpi.hint" class="truncate text-xs text-muted">{{ kpi.hint }}</p>
      </UCard>

      <!-- LÄNDER: eigene Kachel statt einer weiteren Rang-Liste, weil hier
           eine Flagge neben dem Namen steht — sie kommt aus dem ISO-Code, den
           die Länder-Abfrage als zweite Dimension mitbringt. -->
      <UCard v-if="countries.length" class="sm:col-span-2" data-analytics-countries>
        <div class="mb-3 flex items-center gap-2">
          <UIcon name="i-ph-globe-hemisphere-west" class="size-4 shrink-0 text-muted" />
          <p class="text-sm font-medium">{{ t('analytics.stats.countries') }}</p>
        </div>
        <!-- KEINE UTable (B6): das ist eine Rang-Mini-Liste in einer
             Bento-Kachel, keine Datenliste — es gibt nichts zu sortieren,
             nichts auszuwählen und keine Seite zwei. Eine Tabellen-Hülle
             brächte hier Kopfzeile und Bedienung für acht Zeilen. -->
        <ul class="flex flex-col gap-2">
          <li v-for="country in countries" :key="country.code + country.name" class="flex flex-col gap-1">
            <div class="flex items-baseline justify-between gap-3 text-sm">
              <span class="truncate">
                <span aria-hidden="true">{{ countryFlagEmoji(country.code) }}</span>
                {{ country.name }}
              </span>
              <span class="shrink-0 tabular-nums">{{ formatCount(country.visitors) }}</span>
            </div>
            <div class="h-1 rounded-full bg-elevated">
              <div class="h-1 rounded-full bg-primary/70" :style="{ width: `${share(countries, country.visitors)}%` }" />
            </div>
          </li>
        </ul>
      </UCard>

      <!-- REGIONEN nur, wenn es welche gibt: Besuche aus der Zeit vor der
           Geo-Auflösung tragen keine, und eine dauerhaft leere Kachel wäre
           eine Frage, auf die diese Community nie eine Antwort bekommt. -->
      <UCard v-if="regions.length" class="sm:col-span-2" data-analytics-regions>
        <div class="mb-3 flex items-center gap-2">
          <UIcon name="i-ph-map-pin" class="size-4 shrink-0 text-muted" />
          <p class="text-sm font-medium">{{ t('analytics.stats.regions') }}</p>
        </div>
        <ul class="flex flex-col gap-2">
          <li v-for="region in regions" :key="region.name" class="flex flex-col gap-1">
            <div class="flex items-baseline justify-between gap-3 text-sm">
              <span class="truncate">{{ region.name }}</span>
              <span class="shrink-0 tabular-nums">{{ formatCount(region.visitors) }}</span>
            </div>
            <div class="h-1 rounded-full bg-elevated">
              <div class="h-1 rounded-full bg-primary/70" :style="{ width: `${share(regions, region.visitors)}%` }" />
            </div>
          </li>
        </ul>
      </UCard>

      <!-- Sechs gleich gebaute Rang-Listen aus einer Vorlage. Auch sie sind
           bewusst keine UTable (B6) — dieselbe Begründung wie oben. -->
      <UCard
        v-for="panel in listPanels"
        :key="panel.key"
        :class="panel.wide ? 'sm:col-span-2' : ''"
        :data-analytics-list="panel.key"
      >
        <div class="mb-3 flex items-center gap-2">
          <UIcon :name="panel.icon" class="size-4 shrink-0 text-muted" />
          <p class="text-sm font-medium">{{ panel.title }}</p>
        </div>

        <p v-if="!panel.items.length" class="text-sm text-muted">{{ t('analytics.stats.listEmpty') }}</p>

        <ul v-else class="flex flex-col gap-2">
          <li v-for="item in panel.items" :key="item.name" class="flex flex-col gap-1">
            <div class="flex items-baseline justify-between gap-3 text-sm">
              <span class="truncate" :class="panel.mono ? 'font-mono text-muted' : ''">{{ item.name }}</span>
              <span class="shrink-0 tabular-nums">{{ formatCount(item.visitors) }}</span>
            </div>
            <div class="h-1 rounded-full bg-elevated">
              <div class="h-1 rounded-full bg-primary/70" :style="{ width: `${share(panel.items, item.visitors)}%` }" />
            </div>
          </li>
        </ul>
      </UCard>
    </div>
  </div>
</template>
