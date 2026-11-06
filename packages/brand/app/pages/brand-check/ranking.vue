<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { BRAND_CHECK_CATEGORIES, BRAND_SCORE_BANDS } from '../../../shared/brandCheck'
import { BRAND_INDUSTRY_VALUES, isBrandIndustryValue } from '../../../shared/brandIndustries'
import {
  BRAND_CHECK_RANKING_PAGE_SIZE,
  brandCheckRankingCategoryScore,
  normalizeBrandCheckRankingPage,
  normalizeBrandCheckRankingSort,
} from '../../../shared/brandCheckRanking'
import type { BrandCheckRankingItem, BrandCheckRankingResponse } from '../../../shared/types/brand'

/**
 * DAS RANKING — `/brand-check/ranking`
 * (Konzept: docs/archiv/BRAND-CHECK-SEITE.md §3, Paket P3).
 *
 * Alle Auftritte, deren Prüfer sie ins Ranking aufgenommen haben (Opt-in,
 * Davids Entscheidung §8.1), filter- und sortierbar. Die Seite RECHNET nichts:
 * „je Adresse der jüngste", Filter, Sortierung und Blättern macht die Route
 * mit den puren Regeln aus `shared/brandCheckRanking.ts` — hier steht die
 * Darstellung und die Adresszeile.
 *
 * ── FILTER UND SORTIERUNG LEBEN IN DER ADRESSE, NICHT IM ZUSTAND ──────────
 * „Die Besten in Konsistenz" ist ein Link, den man weiterschickt. Deshalb ist
 * die Adresszeile die EINZIGE Wahrheit über die Ansicht: die Auswahlfelder
 * lesen aus `route.query` und schreiben über `router.replace` zurück, und
 * `useFetch` hängt an denselben Werten. Ein zweiter Zustand daneben (ein `ref`,
 * das die Query „spiegelt") wäre die Stelle, an der Zurück-Taste und Ansicht
 * auseinanderlaufen.
 *
 * Geschrieben wird mit `replace` und nicht mit `push`: fünf Filterklicks
 * sollen keine fünf Einträge im Verlauf hinterlassen, durch die man sich
 * zurücktippen muss. Nur der BLÄTTER-Schritt ist eine echte Bewegung — er geht
 * denselben Weg, weil eine halb historisierte Ansicht schlimmer wäre als eine
 * gar nicht historisierte.
 *
 * ── DIE STANDARDWERTE STEHEN NICHT IN DER ADRESSE ─────────────────────────
 * `?sort=score&page=1&industry=&band=` ist dieselbe Ansicht wie `/ranking` und
 * sähe geteilt nach mehr Absicht aus, als dahintersteckt. Deshalb räumt
 * `apply()` leere Werte und Vorgaben aus der Query.
 *
 * ── INDEXIERBAR, ANDERS ALS DIE ERGEBNISSEITE ─────────────────────────────
 * Die Ergebnisseite urteilt über EINE fremde Website und steht auf `noindex`.
 * Diese Liste zeigt ausschliesslich Auftritte, deren Prüfer das Häkchen gesetzt
 * hat — sie ist die Bestenliste des Instruments und darf gefunden werden. SSR
 * (`useFetch` ohne `server: false`) sorgt dafür, dass ein Crawler die Zeilen
 * auch sieht.
 *
 * ── DIE AUSWAHL IST EIGENE ARBEIT, KEIN TABLE-ZUSTAND ─────────────────────
 * Zwei Häkchen ⇒ „Vergleichen". Die Auswahl steckt bewusst in einem eigenen
 * `ref` und nicht in der Zeilen-Auswahl von `UTable`: der Vergleich nimmt GENAU
 * ZWEI Checks (§4), und ein Deckel bei zwei ist in einer eigenen Liste eine
 * Zeile Code, während er im Table-Zustand ein Nachfassen bei jedem Klick wäre.
 * Das Ziel `/brand-check/vergleich` kommt mit P4 — der Knopf zeigt schon
 * dorthin, weil eine Auswahl ohne Ausgang keine Auswahl ist.
 */
definePageMeta({ layout: 'default' })

const { t, te, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const localePath = useLocalePath()

useSeoMeta({
  title: () => t('brand.checkRanking.seoTitle'),
  description: () => t('brand.checkRanking.seoDescription'),
  ogTitle: () => t('brand.checkRanking.title'),
  ogDescription: () => t('brand.checkRanking.seoDescription'),
})

// ── Die Ansicht steht in der Adresszeile ───────────────────────────────────

/** Eine Query trägt `string | string[] | null` — hier zählt nur der erste Wert. */
function queryValue(raw: unknown): string {
  if (Array.isArray(raw)) return typeof raw[0] === 'string' ? raw[0] : ''
  return typeof raw === 'string' ? raw : ''
}

const industry = computed(() => {
  const value = queryValue(route.query.industry)
  return isBrandIndustryValue(value) ? value : ''
})
const band = computed(() => {
  const value = queryValue(route.query.band)
  return BRAND_SCORE_BANDS.includes(value) ? value : ''
})
const sort = computed(() => normalizeBrandCheckRankingSort(queryValue(route.query.sort)))
const page = computed(() => normalizeBrandCheckRankingPage(queryValue(route.query.page)))

interface ViewPatch {
  industry?: string
  band?: string
  sort?: string
  page?: number
}

/**
 * Die neue Ansicht in die Adresse schreiben. Ein Filter- oder Sortierwechsel
 * setzt die Seite auf 1 zurück — sonst landet man nach dem Umschalten auf
 * „Seite 7" einer Liste, die drei Seiten hat, und sieht eine leere Tabelle, die
 * wie ein Fehler aussieht.
 */
function apply(patch: ViewPatch): void {
  const next = {
    industry: patch.industry ?? industry.value,
    band: patch.band ?? band.value,
    sort: patch.sort ?? sort.value,
    page: patch.page ?? (patch.industry === undefined && patch.band === undefined && patch.sort === undefined
      ? page.value
      : 1),
  }
  const query: Record<string, string> = {}
  if (next.industry) query.industry = next.industry
  if (next.band) query.band = next.band
  if (next.sort !== 'score') query.sort = next.sort
  if (next.page > 1) query.page = String(next.page)
  router.replace({ query })
}

// ── Daten ──────────────────────────────────────────────────────────────────

const { data, status } = await useFetch<BrandCheckRankingResponse>('/api/brand/check/ranking', {
  key: 'brand-check-ranking',
  query: computed(() => ({
    industry: industry.value,
    band: band.value,
    sort: sort.value,
    page: page.value,
  })),
})

const items = computed<BrandCheckRankingItem[]>(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const pageSize = computed(() => data.value?.pageSize ?? BRAND_CHECK_RANKING_PAGE_SIZE)

// ── Die Auswahlfelder ──────────────────────────────────────────────────────

/**
 * Der Eintrags-Typ steht ausdrücklich da (`{ value: string }`): sonst leitet
 * `USelect` seinen Modellwert aus den LITERALEN der Katalog-Listen ab, und die
 * Werte aus der Adresszeile sind gewöhnliche `string`. Geprüft werden sie
 * ohnehin zweimal — hier beim Lesen der Query und noch einmal im Schema der
 * Route.
 */
type SelectItem = { value: string, label: string }

/**
 * „Alle" ist im Select NICHT die leere Zeichenkette: Reka verbietet ein
 * `<SelectItem>` mit `''` (sein Wert für „nichts gewählt") und wirft beim
 * Hydrieren — die Seite stand am 2026-09-06 kurz und sprang dann auf die
 * 500-Seite. In der ADRESSE bleibt „alle" das Fehlen des Parameters; übersetzt
 * wird an genau zwei Stellen: `*Select` hinein, `fromSelect` hinaus.
 */
const ALL = 'all'

/** Alle Branchen samt `unknown` — die Liste ist der Katalog, nicht das Ergebnis. */
const industryItems = computed<SelectItem[]>(() => [
  { value: ALL, label: t('brand.checkRanking.filter.allIndustries') },
  ...BRAND_INDUSTRY_VALUES.map(id => ({ value: id, label: t(`brand.industry.${id}`) })),
])

const bandItems = computed<SelectItem[]>(() => [
  { value: ALL, label: t('brand.checkRanking.filter.allBands') },
  ...BRAND_SCORE_BANDS.map(id => ({ value: id, label: t(`brand.check.bands.${id}`) })),
])

const industrySelect = computed(() => industry.value || ALL)
const bandSelect = computed(() => band.value || ALL)
function fromSelect(value: string): string {
  return value === ALL ? '' : value
}

/** Score · Datum · die acht Kategorien — dieselbe Menge wie `BRAND_CHECK_RANKING_SORTS`. */
const sortItems = computed<SelectItem[]>(() => [
  { value: 'score', label: t('brand.checkRanking.sort.score') },
  { value: 'date', label: t('brand.checkRanking.sort.date') },
  ...BRAND_CHECK_CATEGORIES.map(category => ({
    value: category.key,
    label: t('brand.checkRanking.sort.category', { category: t(`brand.check.categories.${category.key}`) }),
  })),
])

// ── Darstellung ────────────────────────────────────────────────────────────

const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value === 'de' ? 'de-DE' : 'en-US', {
  dateStyle: 'medium',
  // Wie auf der Ergebnisseite: ohne feste Zone rechnete der Server anders als
  // der Browser und die Hydration bräche an einem Datum.
  timeZone: 'UTC',
}))
function formatDate(value: string): string {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? dateFormat.value.format(parsed) : ''
}

function industryLabel(id: string): string {
  const key = `brand.industry.${id}`
  return te(key) ? t(key) : t('brand.industry.unknown')
}

/** `website` oder `document` (§5b) — Unbekanntes bekommt kein erfundenes Wort. */
function sourceLabel(id: string): string {
  const key = `brand.checkRanking.source.${id}`
  return te(key) ? t(key) : ''
}

/**
 * DIE STÄRKSTE KATEGORIE einer Zeile. `null` heisst „nicht bewertbar" und
 * nimmt an diesem Vergleich gar nicht teil (dieselbe Regel wie in der
 * Sortierung); hat eine Zeile keine einzige bewertbare Kategorie, steht dort
 * ein Strich statt einer Behauptung.
 */
function strongestCategoryLabel(item: BrandCheckRankingItem): string {
  let bestKey = ''
  let bestScore = -1
  for (const category of BRAND_CHECK_CATEGORIES) {
    const score = brandCheckRankingCategoryScore(item, category.key)
    if (score === null || score <= bestScore) continue
    bestKey = category.key
    bestScore = score
  }
  if (!bestKey) return ''
  const messageKey = `brand.check.categories.${bestKey}`
  return te(messageKey) ? t(messageKey) : bestKey
}

// ── Auswahl für den Vergleich ──────────────────────────────────────────────

const selected = ref<string[]>([])

function isSelected(id: string): boolean {
  return selected.value.includes(id)
}

/**
 * Höchstens zwei. Ein dritter Haken schiebt den ÄLTESTEN heraus, statt den
 * Klick zu verschlucken: „nichts passiert" ist die schlechteste Antwort auf
 * einen bewussten Klick.
 */
function toggle(id: string, on: boolean): void {
  if (!on) {
    selected.value = selected.value.filter(entry => entry !== id)
    return
  }
  selected.value = [...selected.value, id].slice(-2)
}

const compareTarget = computed(() => {
  const [a, b] = selected.value
  if (!a || !b) return ''
  return localePath({ path: '/brand-check/vergleich', query: { a, b } })
})

const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }
const HIDE_LG = { td: 'hidden lg:table-cell', th: 'hidden lg:table-cell' }

const columns = computed<TableColumn<BrandCheckRankingItem>[]>(() => [
  /**
   * EINE LEERE ÜBERSCHRIFT IST KEINE ÜBERSCHRIFT (2026-09-06, P6b) — hier
   * gefunden, seit H1 als `srOnlyHeader()` in core/app/utils/tableHeader.ts
   * für alle Tabellen gelöst. Die Begründung (warum ein leerer Text still
   * einen Hydration-Fehler auslöst) steht im Kopf dieses Helfers.
   */
  { id: 'pick', header: srOnlyHeader(() => t('brand.checkRanking.col.pick')) },
  { id: 'rank', header: () => t('brand.checkRanking.col.rank') },
  { accessorKey: 'host', header: () => t('brand.checkRanking.col.host') },
  { accessorKey: 'score', header: () => t('brand.checkRanking.col.score') },
  { accessorKey: 'industry', header: () => t('brand.checkRanking.col.industry'), meta: { class: HIDE_MD } },
  { accessorKey: 'source', header: () => t('brand.checkRanking.col.source'), meta: { class: HIDE_LG } },
  { id: 'strongest', header: () => t('brand.checkRanking.col.strongest'), meta: { class: HIDE_LG } },
  { accessorKey: 'createdAt', header: () => t('brand.checkRanking.col.date'), meta: { class: HIDE_MD } },
])

/** Die laufende Nummer in DIESER Ansicht — sie folgt der gewählten Sortierung. */
function rankOf(index: number): number {
  return (page.value - 1) * pageSize.value + index + 1
}
</script>

<template>
  <div class="pb-10">
    <div class="mx-auto mt-10 max-w-7xl">
      <div class="mb-8">
        <BwBrandCheckTabs current="ranking" />
      </div>

      <!-- Kopf: was diese Liste ist und was sie nicht ist -->
      <header class="mx-auto max-w-3xl text-center" data-ranking-head>
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('brand.checkRanking.eyebrow') }}</p>
        <h1 class="mt-3 text-balance text-4xl font-extralight tracking-tight sm:text-5xl">{{ t('brand.checkRanking.title') }}</h1>
        <p class="mx-auto mt-5 max-w-2xl text-base leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkRanking.lead') }}</p>
        <!-- „So rechnen wir" (BS1 R2a): eine Liste, die fremde Auftritte
             ordnet, muss ihre Rechnung von genau dieser Stelle aus offenlegen
             — Faktenblatt §4c. Der Reiter oben tut es auch; hier steht der
             Weg im Lesefluss. -->
        <p class="mt-5">
          <ULink :to="localePath('/brand-check/methodik')" class="text-sm underline underline-offset-4" data-ranking-method>
            {{ t('brand.checkMethod.title') }}
          </ULink>
        </p>
      </header>

      <!-- Filterleiste: Branche · Band · Sortierung -->
      <section class="bw-card mt-10 p-6 sm:p-8" data-ranking-filters>
        <div class="flex flex-wrap items-end gap-4">
          <UFormField :label="t('brand.checkRanking.filter.industry')" class="w-full sm:w-56">
            <USelect
              :model-value="industrySelect"
              :items="industryItems"
              class="w-full"
              data-ranking-industry
              @update:model-value="(value: string) => apply({ industry: fromSelect(value) })"
            />
          </UFormField>
          <UFormField :label="t('brand.checkRanking.filter.band')" class="w-full sm:w-48">
            <USelect
              :model-value="bandSelect"
              :items="bandItems"
              class="w-full"
              data-ranking-band
              @update:model-value="(value: string) => apply({ band: fromSelect(value) })"
            />
          </UFormField>
          <UFormField :label="t('brand.checkRanking.filter.sort')" class="w-full sm:w-72">
            <USelect
              :model-value="sort"
              :items="sortItems"
              class="w-full"
              data-ranking-sort
              @update:model-value="(value: string) => apply({ sort: value })"
            />
          </UFormField>
          <div class="ms-auto flex items-center gap-3">
            <span class="bw-label" style="color: var(--bw-muted)" data-ranking-total>
              {{ t('brand.checkRanking.total', { count: total }) }}
            </span>
            <UButton
              :label="t('brand.checkRanking.compare')"
              :to="compareTarget || undefined"
              :disabled="!compareTarget"
              color="neutral"
              class="rounded-full"
              data-ranking-compare
            />
          </div>
        </div>
        <p class="bw-label mt-4 leading-relaxed" style="color: var(--bw-muted)">{{ t('brand.checkRanking.compareHint') }}</p>
      </section>

      <!-- Die Tabelle (Davids B6-Regel: UTable ist der Standard) -->
      <section class="mt-6" data-ranking-table>
        <UTable :data="items" :columns="columns" :loading="status === 'pending'">
          <template #pick-cell="{ row }">
            <UCheckbox
              :model-value="isSelected(row.original.id)"
              :aria-label="t('brand.checkRanking.pick', { host: row.original.host })"
              :data-ranking-pick="row.original.id"
              @update:model-value="(value: boolean | 'indeterminate') => toggle(row.original.id, value === true)"
            />
          </template>

          <template #rank-cell="{ row }">
            <span class="tabular-nums" style="color: var(--bw-muted)">{{ rankOf(row.index) }}</span>
          </template>

          <template #host-cell="{ row }">
            <NuxtLink
              :to="localePath(`/brand-check/${row.original.id}`)"
              class="font-medium tracking-tight hover:underline"
            >{{ row.original.host }}</NuxtLink>
          </template>

          <template #score-cell="{ row }">
            <BwScorePill :value="row.original.score" :band="row.original.band" />
          </template>

          <template #industry-cell="{ row }">
            <span class="text-sm" style="color: var(--bw-ink-soft)">{{ industryLabel(row.original.industry) }}</span>
          </template>

          <template #source-cell="{ row }">
            <span
              v-if="sourceLabel(row.original.source)"
              class="bw-label rounded-full px-2 py-0.5"
              style="background: var(--bw-surface-hi); color: var(--bw-muted)"
            >{{ sourceLabel(row.original.source) }}</span>
            <span v-else style="color: var(--bw-muted)">—</span>
          </template>

          <template #strongest-cell="{ row }">
            <span v-if="strongestCategoryLabel(row.original)" class="text-sm" style="color: var(--bw-ink-soft)">
              {{ strongestCategoryLabel(row.original) }}
            </span>
            <span v-else style="color: var(--bw-muted)">—</span>
          </template>

          <template #createdAt-cell="{ row }">
            <span class="text-sm" style="color: var(--bw-muted)">{{ formatDate(row.original.createdAt) }}</span>
          </template>

          <template #empty>
            <CoreEmptyState
              icon="i-ph-list-numbers"
              :title="t('brand.checkRanking.emptyTitle')"
              :description="t('brand.checkRanking.empty')"
              :action-label="t('brand.checkRanking.emptyCta')"
              :action-to="localePath('/brand-check')"
              data-ranking-empty
            />
          </template>
        </UTable>
      </section>

      <div v-if="total > pageSize" class="mt-8 flex justify-center" data-ranking-pagination>
        <UPagination
          :page="page"
          :items-per-page="pageSize"
          :total="total"
          @update:page="(value: number) => apply({ page: value })"
        />
      </div>

      <p class="bw-label mx-auto mt-10 max-w-3xl text-center leading-relaxed" style="color: var(--bw-muted)" data-ranking-note>
        {{ t('brand.checkRanking.note') }}
      </p>
    </div>
  </div>
</template>
