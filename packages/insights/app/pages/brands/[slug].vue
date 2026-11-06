<script setup lang="ts">
import type { InsightsLocale } from '../../../shared/insightsPost'
import { INSIGHTS_METHODOLOGY_PATH } from '../../../shared/insightsPost'
import { insightsFormatIsPublic, readInsightsPublicFormats } from '../../../shared/insightsPublic'
import type { InsightsPublicBrandResponse } from '../../../shared/types/insightsApi'

/**
 * DAS MARKENPROFIL EINER FREMDEN MARKE — `/brands/<slug>` (§2.1, §9.3).
 *
 * ── DER RIEGEL WIRD SCHON HIER GELESEN ──────────────────────────────────
 * Solange `profile` nicht freigeschaltet ist (§11.3 — Gate der Anwaltsantworten
 * BI1-3/BI1-4), zeigt die Seite ihren 404-Zustand OHNE Request. Die Route
 * prüft denselben Riegel noch einmal; die Seite spart den Weg, sie ersetzt die
 * Sicherung nicht.
 *
 * ── „AUF WUNSCH ENTFERNT" IST 410, NICHT 404 ────────────────────────────
 * Entscheidung 11: der Notausgang wird ohne Diskussion gewährt und mit Datum
 * und Grund dokumentiert. Die Seite bleibt also stehen und sagt, dass sie weg
 * ist — mit dem Status 410 („war hier, ist weg") statt 404 („war nie hier")
 * und mit `noindex`, damit die Zeile aus dem Index fällt. Ein blankes 404 sähe
 * aus wie ein Fehler und lüde zum Nachfragen ein.
 *
 * ── JSON-LD: NUR `BreadcrumbList` ───────────────────────────────────────
 * BEWUSST kein `Organization` (§9.5): wir würden Google gegenüber behaupten,
 * strukturierte Stammdaten einer fremden Firma zu führen. Und bewusst kein
 * `Review`/`AggregateRating` — genau die Auszeichnung, die aus einer
 * Einordnung eine maschinenlesbare Bewertung machte. Das `<` wird escapet,
 * damit ein Markenname mit einem schliessenden Script-Tag darin den Block
 * nicht beendet.
 *
 * ── DER SCORE-RING IST UNSER EIGENER ────────────────────────────────────
 * `InScoreRing` und nicht `BwScoreRing`: eine Seite dieses Layers darf nichts
 * aus dem brand-Layer auto-importieren (CONCEPT A14). Die ZAHL ist trotzdem
 * dieselbe — sie kommt über den Vertrag aus `brand_checks` (Entscheidung 7).
 *
 * ── DIE KATEGORIE-NAMEN KOMMEN AUS DEM i18n-KATALOG DER APP ─────────────
 * Die Route liefert den KATALOG-SCHLÜSSEL (`distinctiveness`, …), nicht einen
 * Text — ein Server hat keine Anzeigesprache. Übersetzt wird hier gegen
 * `brand.check.categories.<key>`; kennt die App den Schlüssel nicht, steht er
 * selbst da. Das ist kein Code-Import aus dem brand-Layer, sondern ein
 * Nachschlagen im Sprachkatalog, den die App ohnehin mitbringt.
 */
definePageMeta({ layout: 'default' })

const { t, te, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const requestEvent = useRequestEvent()
const appConfig = useAppConfig() as { pukalani?: { insights?: { publicFormats?: unknown } } }

const slug = computed(() => String(route.params.slug ?? ''))
const readerLocale = computed<InsightsLocale>(() => (locale.value === 'de' ? 'de' : 'en'))
const preview = computed(() => route.query.preview === '1')

const profileAllowed = computed(() =>
  insightsFormatIsPublic('profile', readInsightsPublicFormats(appConfig.pukalani?.insights?.publicFormats)))

const { data, error } = await useFetch<InsightsPublicBrandResponse>(
  () => `/api/insights/public/brands/${encodeURIComponent(slug.value)}${preview.value ? '?preview=1' : ''}`,
  { key: 'insights-public-brand', watch: [slug, preview], immediate: profileAllowed.value },
)

const redirectTo = computed(() => (data.value?.kind === 'redirect' ? data.value.slug : ''))
if (redirectTo.value) {
  await navigateTo(localePath(`/brands/${redirectTo.value}`), { redirectCode: 301, replace: true })
}

const payload = computed(() => (data.value?.kind === 'brand' ? data.value : null))
const missing = computed(() => !profileAllowed.value || Boolean(error.value) || !payload.value)
const isPreview = computed(() => Boolean(payload.value?.preview))
const brand = computed(() => payload.value?.brand ?? null)
const removed = computed(() => brand.value?.state === 'removed')

/**
 * Der Status wird auf dem SERVER gesetzt: im Browser gibt es keinen
 * Antwort-Kopf mehr. 410 für die entfernte Marke, 404 für alles andere
 * Fehlende (s. Kopf).
 */
if (requestEvent) {
  if (missing.value) setResponseStatus(requestEvent, 404)
  else if (removed.value) setResponseStatus(requestEvent, 410)
}

/** Die acht Kategorien mit ihrem übersetzten Namen (s. Kopf). */
const score = computed(() => {
  const entry = payload.value?.score
  if (!entry) return null
  return {
    ...entry,
    dimensions: entry.dimensions.map(dimension => ({
      ...dimension,
      label: te(`brand.check.categories.${dimension.key}`) ? t(`brand.check.categories.${dimension.key}`) : dimension.key,
    })),
  }
})

const pageTitle = computed(() => {
  if (missing.value) return t('insights.public.notFoundTitle')
  if (removed.value) return t('insights.profile.removedTitle')
  return t('insights.public.brandTitle', { brand: brand.value?.name ?? '' })
})

const pageDescription = computed(() => {
  if (missing.value) return t('insights.public.notFoundBody')
  if (removed.value) return t('insights.profile.removedNote')
  return t('insights.public.brandLead', { brand: brand.value?.name ?? '' })
})

useSeoMeta({
  title: () => pageTitle.value,
  description: () => pageDescription.value,
  ogTitle: () => pageTitle.value,
  ogDescription: () => pageDescription.value,
  // Eine entfernte Marke gehört aus dem Index — das ist die halbe Zusage des
  // Notausgangs. `nofollow` dazu: die Seite trägt keine Links mehr, die jemand
  // verfolgen sollte.
  robots: () => (missing.value || removed.value || isPreview.value ? 'noindex, nofollow' : 'index, follow'),
})

useHead({
  script: computed(() => (missing.value
    ? []
    : [{
        type: 'application/ld+json' as const,
        innerHTML: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          'itemListElement': [
            { '@type': 'ListItem', 'position': 1, 'name': 'Brand Insights', 'item': localePath('/insights') },
            { '@type': 'ListItem', 'position': 2, 'name': brand.value?.name ?? '' },
          ],
        }).replace(/</g, '\\u003c'),
      }])),
})
</script>

<template>
  <div class="mx-auto mt-10 max-w-7xl pb-16">
    <div v-if="missing" class="mx-auto mt-16 max-w-xl text-center" data-insights-missing>
      <UIcon name="i-ph-buildings" class="size-10" style="color: var(--bw-muted)" />
      <h1 class="mt-6 text-3xl font-extralight tracking-tight">{{ t('insights.public.notFoundTitle') }}</h1>
      <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
        {{ t('insights.public.notFoundBody') }}
      </p>
      <UButton
        :to="localePath('/insights')" :label="t('insights.article.backToList')"
        icon="i-ph-arrow-left" class="mt-7 rounded-full" color="neutral"
      />
    </div>

    <div v-else-if="payload && brand" class="mx-auto max-w-4xl">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <NuxtLink
          :to="localePath('/insights')" class="bw-label inline-flex items-center gap-1.5"
          style="color: var(--bw-muted)"
        >
          <UIcon name="i-ph-arrow-left" class="size-4" /> Brand Insights
        </NuxtLink>
        <span
          v-if="isPreview" class="bw-label rounded-full px-2.5 py-1"
          style="background: var(--bw-surface-hi)" data-insights-preview
        >{{ t('insights.public.previewBadge') }}</span>
      </div>

      <div class="mt-6">
        <InBrandProfile
          :brand="brand"
          :score="score"
          :locale="readerLocale"
          :gradient="payload.gradient"
          :methodology-href="localePath(INSIGHTS_METHODOLOGY_PATH)"
        >
          <template #ring="{ score: value }">
            <InScoreRing :value="value.score" :size="80" :label="String(value.score)" />
          </template>

          <template #relations>
            <NuxtLink
              v-for="relation in payload.relations" :key="relation.id"
              :to="localePath(`/brands/${relation.slug}`)"
              class="flex items-center justify-between gap-3"
            >
              <p class="text-sm font-medium hover:underline">{{ relation.name }}</p>
              <UIcon name="i-ph-arrow-up-right" class="size-3.5" style="color: var(--bw-muted)" />
            </NuxtLink>
          </template>

          <!-- Der Korrekturweg (§11.2 Frage 5): dieselbe Stelle auf Profil,
               Duell und Ranking, ein Formular. -->
          <template #correction>
            <InCorrectionForm target-kind="brand" :target-id="brand.id" />
          </template>
        </InBrandProfile>
      </div>

      <!-- Beiträge zu dieser Marke: das Dossier verweist zurück ins Journal,
           statt den Text zu wiederholen. -->
      <section v-if="payload.posts.length" class="mt-10">
        <h2 class="bw-label" style="color: var(--bw-muted)">{{ t('insights.public.brandPosts') }}</h2>
        <div class="mt-4 grid gap-x-6 gap-y-10 sm:grid-cols-2">
          <InPostCard
            v-for="entry in payload.posts" :key="entry.id"
            :post="entry" :locale="readerLocale" :to="localePath(entry.href)"
            :gradient="entry.gradient" display="grid"
          />
        </div>
      </section>
    </div>
  </div>
</template>
