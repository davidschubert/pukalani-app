<script setup lang="ts">
import { BRAND_ARCHETYPES, brandChoiceDisplayLabel } from '../../../shared/brandChoiceOptions'
import {
  BRAND_DISCOVER_PAGE_SIZE,
  BRAND_DISCOVER_PATH_KINDS,
  BRAND_DISCOVER_SORTS,
  normalizeBrandDiscoverArchetype,
  normalizeBrandDiscoverIndustry,
  normalizeBrandDiscoverPage,
  normalizeBrandDiscoverPalette,
  normalizeBrandDiscoverPathKind,
  normalizeBrandDiscoverSort,
} from '../../../shared/brandDiscover'
import { BRAND_INDUSTRY_VALUES } from '../../../shared/brandIndustries'
import { BRAND_PALETTES } from '../../../shared/brandPalette'
import type { BrandDiscoverItem, BrandDiscoverListResponse } from '../../../shared/types/brand'

/**
 * DIE ÖFFENTLICHE GALERIE — `/discover`
 * (Konzept docs/plans/DISCOVER-BRANDS.md §4.1, Form abgenommen am Klickdummy
 * `/brand/demo/discover`, Davids Entscheidungen 5, 6 und 8 vom 2026-09-08).
 *
 * Die Seite RECHNET nichts: „Brand of the Day", Filtern, Sortieren und
 * Blättern macht `GET /api/discover` mit den puren Regeln aus
 * `shared/brandDiscover.ts`. Hier steht die Darstellung und die Adresszeile.
 *
 * ── FACETTEN UND SORTIERUNG LEBEN IN DER ADRESSE ─────────────────────────
 * „Alle Marken mit dem Archetyp Weise" ist ein Link, den man weiterschickt.
 * Die Adresszeile ist deshalb die EINZIGE Wahrheit über die Ansicht: die Chips
 * lesen aus `route.query` und schreiben über `router.replace` zurück,
 * `useFetch` hängt an denselben Werten. Ein zweiter Zustand daneben wäre die
 * Stelle, an der Zurück-Taste und Ansicht auseinanderlaufen — dieselbe
 * Begründung wie auf `/brand-check/ranking`, dieselbe `apply()`-Rechnung.
 *
 * ── DER LEERE ZUSTAND ERSETZT DIE WAND (Entscheidung 8) ──────────────────
 * Er steht nicht darunter, sondern an ihrer Stelle: eine leere Wand mit einer
 * Einladung darunter sähe aus wie eine Galerie, die gerade nicht lädt.
 *
 * ── UTable-FREI, UND ZWAR MIT GRUND ──────────────────────────────────────
 * Davids B6-Regel („UTable ist der Standard") gilt für DATENLISTEN im
 * Dashboard. Das hier ist Gestaltung: die Kachel IST die Farbwelt der Marke,
 * ihre Aussage steckt in der Fläche. Eine Tabelle zeigte davon nichts.
 *
 * ── KEINE HYDRATION-FALLEN ───────────────────────────────────────────────
 * Das Datum wird mit fester Zone (`UTC`) formatiert — ohne sie rechnet der
 * Server anders als der Browser und die Hydration bricht an einer Kachel. Die
 * Auswahlfelder tragen den Sentinel `all` statt '' (Reka verbietet ein
 * `SelectItem` mit dem leeren Wert und wirft beim Hydrieren).
 */
definePageMeta({ layout: 'default' })

const { t, te, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const localePath = useLocalePath()
const { isLoggedIn } = useCurrentUser()

useSeoMeta({
  title: () => t('brand.discover.seoTitle'),
  description: () => t('brand.discover.seoDescription'),
  ogTitle: () => t('brand.discover.title'),
  ogDescription: () => t('brand.discover.seoDescription'),
})

// ── Die Ansicht steht in der Adresszeile ───────────────────────────────────

/** Eine Query trägt `string | string[] | null` — hier zählt nur der erste Wert. */
function queryValue(raw: unknown): string {
  if (Array.isArray(raw)) return typeof raw[0] === 'string' ? raw[0] : ''
  return typeof raw === 'string' ? raw : ''
}

const path = computed(() => normalizeBrandDiscoverPathKind(queryValue(route.query.path)))
const archetype = computed(() => normalizeBrandDiscoverArchetype(queryValue(route.query.archetype)))
const palette = computed(() => normalizeBrandDiscoverPalette(queryValue(route.query.palette)))
const industry = computed(() => normalizeBrandDiscoverIndustry(queryValue(route.query.industry)))
const sort = computed(() => normalizeBrandDiscoverSort(queryValue(route.query.sort)))
const page = computed(() => normalizeBrandDiscoverPage(queryValue(route.query.page)))

interface ViewPatch {
  path?: string
  archetype?: string
  palette?: string
  industry?: string
  sort?: string
  page?: number
}

/**
 * Die neue Ansicht in die Adresse schreiben. Jeder Facetten- oder
 * Sortierwechsel setzt die Seite auf 1 zurück — sonst landet man nach dem
 * Umschalten auf „Seite 4" einer Galerie mit zwei Seiten und sieht eine leere
 * Wand, die wie ein Fehler aussieht.
 *
 * `replace` statt `push`: fünf Filterklicks sollen keine fünf Einträge im
 * Verlauf hinterlassen. Vorgaben und leere Werte fallen aus der Query —
 * `?sort=newest&page=1` ist dieselbe Ansicht wie `/discover` und sähe geteilt
 * nach mehr Absicht aus, als dahintersteckt.
 */
function apply(patch: ViewPatch): void {
  const facetTouched = patch.path !== undefined || patch.archetype !== undefined
    || patch.palette !== undefined || patch.industry !== undefined || patch.sort !== undefined
  const next = {
    path: patch.path ?? path.value,
    archetype: patch.archetype ?? archetype.value,
    palette: patch.palette ?? palette.value,
    industry: patch.industry ?? industry.value,
    sort: patch.sort ?? sort.value,
    page: patch.page ?? (facetTouched ? 1 : page.value),
  }
  const query: Record<string, string> = {}
  if (next.path) query.path = next.path
  if (next.archetype) query.archetype = next.archetype
  if (next.palette) query.palette = next.palette
  if (next.industry) query.industry = next.industry
  if (next.sort !== 'newest') query.sort = next.sort
  if (next.page > 1) query.page = String(next.page)
  router.replace({ query })
}

const hasFilter = computed(() =>
  Boolean(path.value || archetype.value || palette.value || industry.value))

// ── Daten ──────────────────────────────────────────────────────────────────

const { data } = await useFetch<BrandDiscoverListResponse>('/api/discover', {
  key: 'brand-discover',
  query: computed(() => ({
    path: path.value,
    archetype: archetype.value,
    palette: palette.value,
    industry: industry.value,
    sort: sort.value,
    page: page.value,
  })),
})

const items = computed<BrandDiscoverItem[]>(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const pageSize = computed(() => data.value?.pageSize ?? BRAND_DISCOVER_PAGE_SIZE)

/**
 * DER AUFMACHER: die kuratierte Marke — sonst die drei neuesten als Fade
 * (Entscheidung 6). Er hängt NICHT an den Facetten: „Brand of the Day" ist die
 * Empfehlung des Hauses und nicht das erste Suchergebnis.
 */
const dayItems = computed<BrandDiscoverItem[]>(() => {
  const featured = data.value?.featured
  return featured ? [featured] : (data.value?.spotlight ?? [])
})
const dayIndex = ref(0)
const day = computed<BrandDiscoverItem | null>(() => dayItems.value[dayIndex.value] ?? dayItems.value[0] ?? null)
const dayCarousel = ref<{ emblaApi?: { scrollPrev: () => void, scrollNext: () => void } } | null>(null)
watch(dayItems, () => { dayIndex.value = 0 })

// ── Die Facetten ───────────────────────────────────────────────────────────

type SelectItem = { value: string, label: string }

/**
 * „Alle" ist im Select NICHT die leere Zeichenkette (s. Kopf). In der ADRESSE
 * bleibt „alle" das Fehlen des Parameters; übersetzt wird an genau zwei
 * Stellen: hinein über `*Select`, hinaus über `fromSelect`.
 */
const ALL = 'all'
function fromSelect(value: string): string {
  return value === ALL ? '' : value
}

const industryItems = computed<SelectItem[]>(() => [
  { value: ALL, label: t('brand.discover.filter.allIndustries') },
  ...BRAND_INDUSTRY_VALUES.map(id => ({ value: id, label: industryLabel(id) })),
])
const industrySelect = computed(() => industry.value || ALL)

const sortItems = computed<SelectItem[]>(() =>
  BRAND_DISCOVER_SORTS.map(id => ({ value: id, label: t(`brand.discover.sort.${id}`) })))

const pathItems = computed(() => BRAND_DISCOVER_PATH_KINDS.map(id => ({
  id,
  label: t(`brand.discover.path.${id}`),
})))

const archetypeItems = computed(() => BRAND_ARCHETYPES.map(option => ({
  id: option.id,
  label: brandChoiceDisplayLabel('d.primary', option.id, locale.value),
})))

/** Die Farbwelt ist die einzige Facette, die man SIEHT statt liest (§4.1). */
const paletteItems = computed(() => BRAND_PALETTES.map(entry => ({
  id: entry.id,
  label: locale.value.startsWith('de') ? entry.name.de : entry.name.en,
  gradient: entry.gradient,
})))

// ── Darstellung ────────────────────────────────────────────────────────────

function industryLabel(id: string): string {
  const key = `brand.industry.${id}`
  return te(key) ? t(key) : t('brand.industry.unknown')
}

function archetypeLabel(id: string): string {
  return id ? brandChoiceDisplayLabel('d.primary', id, locale.value) : ''
}

function pathLabel(kind: string): string {
  const key = `brand.discover.path.${kind}`
  return te(key) ? t(key) : ''
}

function scoreLabel(kind: string): string {
  const key = `brand.discover.score.${kind}`
  return te(key) ? t(key) : ''
}

const FALLBACK_GRADIENT = BRAND_PALETTES[0]!.gradient

function gradientOf(paletteId: string): readonly [string, string, string] {
  return BRAND_PALETTES.find(entry => entry.id === paletteId)?.gradient ?? FALLBACK_GRADIENT
}

function tileBackground(paletteId: string): string {
  const [a, b, c] = gradientOf(paletteId)
  return `linear-gradient(165deg, ${a} 0%, ${b} 45%, ${c} 100%)`
}

/** Die Meta-Zeile einer Kachel: Branche · Weiche · Archetyp, ohne Lücken. */
function metaLine(item: BrandDiscoverItem): string {
  return [industryLabel(item.industry), pathLabel(item.pathKind), archetypeLabel(item.archetype)]
    .filter(Boolean)
    .join(' · ')
}

function entryPath(slug: string): string {
  return localePath(`/discover/${slug}`)
}

/**
 * „Starte deine eigene" — derselbe Weg wie der Haupt-CTA der Startseite:
 * eingeloggt in die Anlage, als Gast auf die Einladungs-Seite (Beta). Ein Link
 * in die Anlage, den ein Gast nicht öffnen kann, wäre ein Versprechen, das die
 * nächste Seite zurücknimmt.
 */
const startTarget = computed(() =>
  localePath(isLoggedIn.value ? '/dashboard/brands/new' : '/invite'))
</script>

<template>
  <div class="pb-10">
    <div class="@container mx-auto mt-10 max-w-7xl">
      <!-- Kopf -->
      <header class="text-center" data-discover-head>
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
          {{ t('brand.discover.eyebrow') }}
        </p>
        <h1 class="mt-2 text-balance text-4xl font-extralight leading-tight tracking-tight sm:text-5xl">
          {{ t('brand.discover.title') }}
        </h1>
        <p class="bw-label mt-4" style="color: var(--bw-muted)">{{ t('brand.discover.lead') }}</p>
      </header>

      <!-- Brand of the Day: Split-Aufmacher (Fade, wenn niemand kuratiert hat) -->
      <section
        v-if="day"
        class="mt-16 grid grid-cols-1 items-center gap-12 lg:grid-cols-2"
        data-discover-featured
      >
        <div class="min-w-0">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
            {{ t('brand.discover.featured.label') }}
          </p>
          <h2 class="mt-4 max-w-lg text-balance text-4xl font-extralight leading-tight tracking-tight sm:text-5xl">
            {{ day.title }}
          </h2>
          <p class="mt-5 max-w-md text-lg leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ metaLine(day) }}
          </p>
          <UButton
            :to="entryPath(day.slug)" :label="t('brand.discover.featured.cta')"
            trailing-icon="i-ph-arrow-right" class="mt-8 rounded-full"
          />
        </div>
        <div class="min-w-0">
          <UCarousel
            ref="dayCarousel" v-slot="{ item }" :items="dayItems" loop fade
            class="w-full" :ui="{ item: 'basis-full' }"
            @select="dayIndex = $event"
          >
            <NuxtLink
              :to="entryPath(item.slug)"
              class="bw-tile bw-tile--lg bw-on-dark group relative flex flex-col justify-between overflow-hidden p-8"
              :style="`aspect-ratio: 1 / 1; background: ${tileBackground(item.paletteId)}`"
            >
              <p class="text-xl font-medium" style="color: #f7f2ea">{{ item.title }}</p>
              <div>
                <p
                  v-if="item.score"
                  class="text-6xl font-extralight leading-none tracking-tight" style="color: #f7f2ea"
                >{{ item.score.value }}</p>
                <p class="mt-3 text-sm" style="color: rgb(247 242 234 / 0.85)">
                  <template v-if="item.score">{{ scoreLabel(item.score.kind) }} · </template>{{ metaLine(item) }}
                </p>
              </div>
            </NuxtLink>
          </UCarousel>
        </div>
      </section>

      <!-- Pfeile mittig unter dem GANZEN Aufmacher — sie blättern die Kopfzeile
           links mit. Bei einer einzigen Marke (Kuration) entfallen sie. -->
      <div v-if="dayItems.length > 1" class="mt-8 flex justify-center gap-2">
        <button
          class="grid size-9 place-items-center rounded-full"
          style="background: var(--bw-surface-hi); color: var(--bw-muted)"
          :aria-label="t('brand.discover.featured.prev')"
          @click="dayCarousel?.emblaApi?.scrollPrev()"
        ><UIcon name="i-ph-arrow-left" class="size-4" /></button>
        <button
          class="grid size-9 place-items-center rounded-full"
          style="background: var(--bw-surface-hi); color: var(--bw-ink)"
          :aria-label="t('brand.discover.featured.next')"
          @click="dayCarousel?.emblaApi?.scrollNext()"
        ><UIcon name="i-ph-arrow-right" class="size-4" /></button>
      </div>

      <!-- FACETTEN — vier Achsen, jede aus einem Katalog, den es wirklich gibt.
           Drei Zeilen statt einer langen Reihe: zwölf Archetypen und zwölf
           Farbwelten sind in EINER Zeile weder überblickbar noch treffbar. -->
      <section class="mt-20 space-y-5" data-discover-filters>
        <div class="flex flex-wrap items-center gap-2">
          <button
            class="bw-select-card rounded-full px-4 py-2 text-sm"
            :class="path ? '' : 'bw-select-card--on'"
            data-discover-path="all"
            @click="apply({ path: '' })"
          >{{ t('brand.discover.filter.allPaths') }}</button>
          <button
            v-for="kind in pathItems" :key="kind.id"
            class="bw-select-card rounded-full px-4 py-2 text-sm"
            :class="path === kind.id ? 'bw-select-card--on' : ''"
            :data-discover-path="kind.id"
            @click="apply({ path: path === kind.id ? '' : kind.id })"
          >{{ kind.label }}</button>

          <span class="ml-auto flex flex-wrap items-center gap-2">
            <USelect
              :model-value="industrySelect" :items="industryItems" color="neutral" variant="ghost"
              class="w-56 justify-between rounded-full text-sm focus-visible:outline-none"
              :ui="{ base: 'px-4 py-2' }" style="background: var(--bw-surface-hi)"
              :aria-label="t('brand.discover.filter.industry')"
              data-discover-industry
              @update:model-value="(value: string) => apply({ industry: fromSelect(value) })"
            />
            <USelect
              :model-value="sort" :items="sortItems" color="neutral" variant="ghost"
              class="w-48 justify-between rounded-full text-sm focus-visible:outline-none"
              :ui="{ base: 'px-4 py-2' }" style="background: var(--bw-surface-hi)"
              :aria-label="t('brand.discover.filter.sort')"
              data-discover-sort
              @update:model-value="(value: string) => apply({ sort: value })"
            />
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span class="bw-label w-20 flex-none" style="color: var(--bw-muted)">
            {{ t('brand.discover.filter.archetype') }}
          </span>
          <button
            v-for="option in archetypeItems" :key="option.id"
            class="bw-select-card rounded-full px-4 py-2 text-sm"
            :class="archetype === option.id ? 'bw-select-card--on' : ''"
            :aria-pressed="archetype === option.id"
            :data-discover-archetype="option.id"
            @click="apply({ archetype: archetype === option.id ? '' : option.id })"
          >{{ option.label }}</button>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span class="bw-label w-20 flex-none" style="color: var(--bw-muted)">
            {{ t('brand.discover.filter.palette') }}
          </span>
          <button
            v-for="option in paletteItems" :key="option.id"
            class="bw-select-card flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-sm"
            :class="palette === option.id ? 'bw-select-card--on' : ''"
            :aria-pressed="palette === option.id"
            :data-discover-palette="option.id"
            @click="apply({ palette: palette === option.id ? '' : option.id })"
          >
            <span
              class="bw-swatch size-6 flex-none rounded-full"
              :style="`background: linear-gradient(140deg, ${option.gradient[0]} 0%, ${option.gradient[1]} 50%, ${option.gradient[2]} 100%)`"
            />
            {{ option.label }}
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <span class="bw-label" style="color: var(--bw-muted)" data-discover-total>
            {{ t('brand.discover.total', { count: total }) }}
          </span>
          <UButton
            v-if="hasFilter" :label="t('brand.discover.filter.reset')"
            color="neutral" variant="ghost" size="xs" class="rounded-full"
            data-discover-reset
            @click="apply({ path: '', archetype: '', palette: '', industry: '' })"
          />
        </div>
      </section>

      <!-- Galerie-Wand: die Farbwelt IST die Karte -->
      <section
        v-if="items.length"
        class="mt-10 grid gap-x-6 gap-y-20 @sm:grid-cols-2 @md:grid-cols-4"
        data-discover-wall
      >
        <NuxtLink
          v-for="item in items" :key="item.slug" :to="entryPath(item.slug)"
          class="group block" :data-discover-tile="item.slug"
        >
          <div class="bw-tile relative overflow-hidden" style="aspect-ratio: 1 / 1">
            <div
              class="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.04]"
              :style="`background: ${tileBackground(item.paletteId)}`"
            />
            <span
              v-if="item.example"
              class="bw-label absolute left-4 top-4 rounded-full px-2.5 py-1"
              style="background: rgb(20 20 20 / 0.45); color: #f7f2ea"
            >{{ t('brand.discover.badge.example') }}</span>
            <span
              v-else-if="item.pathKind === 'relaunch'"
              class="bw-label absolute left-4 top-4 rounded-full px-2.5 py-1"
              style="background: rgb(20 20 20 / 0.45); color: #f7f2ea"
            >{{ t('brand.discover.badge.relaunch') }}</span>
            <p
              class="absolute inset-0 grid place-items-center p-6 text-center text-2xl font-extralight leading-snug tracking-tight"
              style="color: #f7f2ea; text-shadow: 0 1px 12px rgb(20 20 20 / 0.3)"
            >{{ item.title }}</p>
          </div>
          <div class="mt-3 flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="bw-label" style="color: var(--bw-muted)">{{ metaLine(item) }}</p>
              <!-- Zweitzeile nur, wenn es WIRKLICH zwei Zahlen gibt
                   (Entscheidung 5) — sie trägt ihre eigene Beschriftung. -->
              <p
                v-if="item.secondary" class="bw-label mt-1" style="color: var(--bw-muted)"
                :data-discover-secondary="item.slug"
              >
                {{ t('brand.discover.score.secondary', {
                  label: scoreLabel(item.secondary.kind),
                  value: item.secondary.value,
                }) }}
              </p>
            </div>
            <!-- Der Ring trägt IMMER seine Beschriftung: „87" allein sagt nicht,
                 ob ein Auftritt geprüft oder ein Fundament gereift ist. -->
            <BwScoreRing
              v-if="item.score" :value="item.score.value" :size="34"
              :label="scoreLabel(item.score.kind)" class="flex-none"
            />
          </div>
        </NuxtLink>
      </section>

      <!-- LEERER ZUSTAND — er ERSETZT die Wand (Entscheidung 8). -->
      <section v-else class="mt-10" data-discover-empty>
        <div
          class="bw-rounded-card flex flex-col items-center justify-center border border-dashed p-14 text-center"
          style="border-color: var(--bw-line-strong)"
        >
          <BwIllustration variant="journey" class="mx-auto h-16 w-auto" style="color: var(--bw-ink-soft)" />
          <p class="mt-4 text-xl font-extralight tracking-tight">{{ t('brand.discover.emptyTitle') }}</p>
          <UButton
            :to="startTarget" :label="t('brand.discover.emptyCta')"
            icon="i-ph-plus" class="mt-5 rounded-full"
          />
        </div>
      </section>

      <div v-if="total > pageSize" class="mt-12 flex justify-center" data-discover-pagination>
        <UPagination
          :page="page" :items-per-page="pageSize" :total="total"
          @update:page="(value: number) => apply({ page: value })"
        />
      </div>

      <p class="bw-label mt-16 text-center" style="color: var(--bw-muted)" data-discover-note>
        {{ t('brand.discover.note') }}
      </p>
    </div>
  </div>
</template>
