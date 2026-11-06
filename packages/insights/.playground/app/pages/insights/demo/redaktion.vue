<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { InsightsPost, InsightsReviewIssue } from '../../../../../shared/insightsPost'
import { insightsMethodologyLinked, insightsPublicFassung, insightsReviewIssues } from '../../../../../shared/insightsPost'
import type { InsightsBrandListItem } from '../../../../../shared/types/insightsApi'
import {
  DEMO_BRANDS,
  DEMO_DRAFT,
  DEMO_FLAG_WORDS,
  DEMO_POSTS,
  DEMO_RADAR,
  DEMO_RELEVANCE,
  DEMO_SOURCE_TEXTS,
  DEMO_TODAY,
} from '../../../utils/demoInsights'

/**
 * SCREEN 6 — DIE REDAKTION (Plan §9.4; Adressen `/dashboard/insights` und
 * `/dashboard/insights/<id>`).
 *
 * Drei Teile auf einer Seite, damit man den Ablauf in einem Blick beurteilen
 * kann: die LISTE (was gibt es, in welchem Zustand), der EDITOR (woran wird
 * gearbeitet, was blockiert die Freigabe) und der RADAR (woher kommt das
 * nächste Thema). In der Umsetzung sind das drei Adressen — hier ist es eine,
 * weil ein Klickdummy den Zusammenhang zeigen soll und nicht die Navigation.
 *
 * ── WAS DAVID HIER PRÜFEN SOLL ──────────────────────────────────────────
 *  · Die Liste ist ein `UTable` (Davids B6-Regel), nicht eine handgebaute.
 *  · Der Entwurf ist ABSICHTLICH nicht freigabereif: sein Zitat steht nicht
 *    in der Quelle, er nennt eine Marke ohne Zeile, und der Filter findet ein
 *    Wort. Der Knopf „In die Redaktion geben" ist deshalb gesperrt, und
 *    daneben steht, WARUM und WO — nicht bloss, dass etwas fehlt.
 *  · „Beleg prüfen" antwortet deterministisch (Zitat wörtlich in der Quelle),
 *    nicht mit einem Modell.
 *  · Der Übersetzen-Knopf legt einen ENTWURF an; erst das Häkchen macht ihn
 *    öffentlich (§11 Frage 4).
 *  · Der Radar speichert je Video nur die öffentlichen Zahlen der API und
 *    sagt seine 30-Tage-Frist an. Unsere Opportunity-Zahl heisst „von 60" und
 *    „3 von 5 Signalen" — Suchnachfrage und Konkurrenz fehlen, solange es
 *    keine Datenquelle gibt.
 */
const { t, locale } = useI18n()

const readerLocale = computed(() => (locale.value === 'de' ? 'de' : 'en') as 'de' | 'en')

const columns = computed<TableColumn<InsightsPost>[]>(() => [
  { id: 'title', header: () => t('insights.editor.colTitle') },
  { accessorKey: 'format', header: () => t('insights.editor.colFormat') },
  { accessorKey: 'state', header: () => t('insights.editor.colState') },
  { accessorKey: 'baseLocale', header: () => t('insights.editor.colLocale') },
  { accessorKey: 'publishedAt', header: () => t('insights.editor.colUpdated') },
])

const rows = computed(() => [DEMO_DRAFT, ...DEMO_POSTS])
const knownBrandIds = computed(() => DEMO_BRANDS.map(brand => brand.slug))

/**
 * SEIT BI1 I2 IST `InEditor` DIE ECHTE KOMPONENTE — der Prototyp füttert sie
 * jetzt so, wie es die Dashboard-Seite tut: Beitrag, Marken, Prüfpunkte.
 *
 * Der Unterschied ist die NAHT, nicht die Form: die Komponente spricht mit
 * keiner Route, und hier hängt an jedem Ereignis ein Hinweis statt eines
 * Abrufs. Genau dafür ist sie so geschnitten — der freigegebene Klickdummy
 * und die Umsetzung teilen dieselbe Fläche, statt auseinanderzulaufen.
 *
 * Die Marken-Ids sind hier die SLUGS (die Demo-Daten haben keine Zeilen-Ids);
 * `brandRefs` im Entwurf zeigt auf dieselben Werte, und eine davon fehlt
 * absichtlich — Prüfregel 6 muss sie melden.
 */
const demoBrands = computed<InsightsBrandListItem[]>(() => DEMO_BRANDS.map(brand => ({
  id: brand.slug,
  name: brand.name,
  slug: brand.slug,
  homepage: brand.homepage,
  industry: brand.industry,
  state: brand.state,
})))

const demoIssues = computed<InsightsReviewIssue[]>(() => insightsReviewIssues(DEMO_DRAFT, {
  sourceTexts: DEMO_SOURCE_TEXTS,
  flagText: text => DEMO_FLAG_WORDS.filter(word => text.toLowerCase().includes(word.toLowerCase())),
  knownBrandIds: knownBrandIds.value,
  methodologyLinked: insightsMethodologyLinked(DEMO_DRAFT),
}))

const toast = useToast()

/** Ein Klickdummy speichert nicht, ruft kein Modell und holt keine Quelle. */
function demoOnly(): void {
  toast.add({ title: t('insights.editor.prototypeOnly'), duration: 2500 })
}
</script>

<template>
  <div class="bw-root min-h-dvh px-6 pb-10">
    <InDemoNav />
    <div class="mx-auto max-w-7xl">
      <h1 class="text-2xl font-medium tracking-tight">{{ t('insights.editor.title') }}</h1>
      <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('insights.editor.lead') }}</p>

      <!-- 1. Die Liste -->
      <section class="mt-8">
        <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.editor.listTitle') }}</p>
        <div class="bw-card mt-3 overflow-x-auto p-2">
          <UTable :data="rows" :columns="columns">
            <template #title-cell="{ row }">
              <span class="text-sm font-medium">
                {{ insightsPublicFassung(row.original, readerLocale).title }}
              </span>
            </template>
            <template #format-cell="{ row }">
              <span class="bw-label">{{ t(`insights.format.${row.original.format}`) }}</span>
            </template>
            <template #state-cell="{ row }">
              <span
                class="bw-label rounded-full px-2 py-0.5"
                :style="row.original.state === 'draft'
                  ? 'background: var(--bw-draft-soft); color: var(--bw-draft)'
                  : 'background: var(--bw-accent-soft); color: var(--bw-accent)'"
              >{{ t(`insights.state.${row.original.state}`) }}</span>
            </template>
            <template #baseLocale-cell="{ row }">
              <span class="bw-label" style="color: var(--bw-muted)">
                {{ row.original.baseLocale }}<template v-if="!row.original.translationReviewed"> · 1</template>
              </span>
            </template>
            <template #publishedAt-cell="{ row }">
              <span class="bw-label tabular-nums" style="color: var(--bw-muted)">{{ row.original.publishedAt || '—' }}</span>
            </template>
          </UTable>
        </div>
      </section>

      <!-- 2. Der Editor -->
      <section class="mt-10">
        <InEditor
          :post="DEMO_DRAFT"
          :brands="demoBrands"
          :known-brand-ids="knownBrandIds"
          :issues="demoIssues"
          @save="demoOnly"
          @change-state="demoOnly"
          @check-evidence="demoOnly"
          @translate="demoOnly"
          @draft="demoOnly"
          @create-brand="demoOnly"
        />
      </section>

      <!-- 3. Der Radar -->
      <section class="mt-12">
        <InRadar
          :videos="DEMO_RADAR" :locale="readerLocale" :today="DEMO_TODAY"
          :resolve-relevance="video => DEMO_RELEVANCE[video.videoId]"
        />
      </section>

      <p class="bw-pending mt-12">Prototyp I0 — nichts wird gespeichert, kein Modell wird gerufen, keine Route ruft an.</p>
    </div>
  </div>
</template>
