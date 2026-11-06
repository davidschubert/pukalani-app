<script setup lang="ts">
import type { InsightsLocale } from '../../../shared/insightsPost'
import { insightsPublicFassung } from '../../../shared/insightsPost'
import { insightsFormatIsPublic, readInsightsPublicFormats } from '../../../shared/insightsPublic'
import type { InsightsPublicDuelResponse } from '../../../shared/types/insightsApi'

/**
 * DAS BRAND-DUELL — `/duels/<a>-vs-<b>` (§2.2, §9.2).
 *
 * ── DER RIEGEL ZUERST ───────────────────────────────────────────────────
 * Ein Duell zeigt ZWEI Scores fremder Marken und ist damit genau der Fall aus
 * §6 („ohne die Antworten zu 3 und 4 geht kein Markenprofil live"). Ist `duel`
 * gesperrt, zeigt die Seite ihren 404-Zustand ohne Request.
 *
 * ── DIE GEGENRICHTUNG IST EINE 301 ──────────────────────────────────────
 * `nike-vs-adidas` wird zu `adidas-vs-nike` (alphabetisch, §11 Frage 2). Die
 * Route entscheidet das, die Seite baut daraus den Pfad mit `localePath()` —
 * ein Pfad aus dem Server wäre auf `/de/…` die englische Adresse.
 *
 * ── DIE EINORDNUNG IST DER FLIESSTEXT DES BEITRAGS ──────────────────────
 * Sie kommt in den `#verdict`-Slot, gerendert mit demselben Markdown-Baustein
 * wie ein Artikel — OHNE Sprungmarken: eine Einordnung ist ein Absatz, kein
 * Dokument mit Verzeichnis.
 */
definePageMeta({ layout: 'default' })

const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const requestEvent = useRequestEvent()
const appConfig = useAppConfig() as { pukalani?: { insights?: { publicFormats?: unknown } } }

const slug = computed(() => String(route.params.slug ?? ''))
const readerLocale = computed<InsightsLocale>(() => (locale.value === 'de' ? 'de' : 'en'))
const preview = computed(() => route.query.preview === '1')

const publicFormats = computed(() => readInsightsPublicFormats(appConfig.pukalani?.insights?.publicFormats))
const duelAllowed = computed(() => insightsFormatIsPublic('duel', publicFormats.value))
const profileAllowed = computed(() => insightsFormatIsPublic('profile', publicFormats.value))

const { data, error } = await useFetch<InsightsPublicDuelResponse>(
  () => `/api/insights/public/duels/${encodeURIComponent(slug.value)}${preview.value ? '?preview=1' : ''}`,
  { key: 'insights-public-duel', watch: [slug, preview], immediate: duelAllowed.value },
)

const redirectTo = computed(() => (data.value?.kind === 'redirect' ? data.value.slug : ''))
if (redirectTo.value) {
  await navigateTo(localePath(`/duels/${redirectTo.value}`), { redirectCode: 301, replace: true })
}

const payload = computed(() => (data.value?.kind === 'duel' ? data.value : null))
const missing = computed(() => !duelAllowed.value || Boolean(error.value) || !payload.value)
const isPreview = computed(() => Boolean(payload.value?.preview))
const post = computed(() => payload.value?.post ?? null)
const view = computed(() => (post.value ? insightsPublicFassung(post.value, readerLocale.value) : null))

if (missing.value && requestEvent) setResponseStatus(requestEvent, 404)

const pageTitle = computed(() => (missing.value ? t('insights.public.notFoundTitle') : view.value?.title ?? ''))
const pageDescription = computed(() => (missing.value ? t('insights.public.notFoundBody') : view.value?.dek ?? ''))

useSeoMeta({
  title: () => pageTitle.value,
  description: () => pageDescription.value,
  ogTitle: () => pageTitle.value,
  ogDescription: () => pageDescription.value,
  ogType: 'article',
  robots: () => {
    if (missing.value || isPreview.value) return 'noindex, nofollow'
    return view.value?.fallback ? 'noindex, follow' : 'index, follow'
  },
})

/** Die fehlende Sprachfassung meldet keine Alternate-Adresse (§9.5). Das
 * Zurücksetzen beim Verlassen macht `useSeoHiddenLocales()` selbst — der State
 * ist app-weit, und ein blindes Leeren beim Abräumen löschte den Eintrag der
 * NEUEN Seite (Begründung im Kopf des Composables). */
useSeoHiddenLocales(() => {
  if (missing.value || !post.value || post.value.translationReviewed) return []
  return [post.value.baseLocale === 'de' ? 'en' : 'de']
})

/**
 * JSON-LD: `Article` + `BreadcrumbList` (§9.5) — kein `Organization` für die
 * zwei fremden Marken, kein `Review`/`AggregateRating`. Das `<` wird escapet
 * (ein Markenname mit schliessendem Script-Tag darin beendete sonst den
 * Block).
 */
useHead({
  script: computed(() => (missing.value || !post.value
    ? []
    : [{
        type: 'application/ld+json' as const,
        innerHTML: JSON.stringify([
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            'headline': view.value?.title ?? '',
            'description': view.value?.dek ?? '',
            'datePublished': post.value.publishedAt,
            'dateModified': post.value.reviewedAt || post.value.publishedAt,
            'inLanguage': view.value?.locale ?? readerLocale.value,
            'author': { '@type': 'Organization', 'name': 'Branding Supply' },
            'publisher': { '@type': 'Organization', 'name': 'Branding Supply' },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            'itemListElement': [
              { '@type': 'ListItem', 'position': 1, 'name': 'Brand Insights', 'item': localePath('/insights') },
              { '@type': 'ListItem', 'position': 2, 'name': view.value?.title ?? '' },
            ],
          },
        ]).replace(/</g, '\\u003c'),
      }])),
})
</script>

<template>
  <div class="mx-auto mt-10 max-w-7xl pb-16">
    <div v-if="missing" class="mx-auto mt-16 max-w-xl text-center" data-insights-missing>
      <UIcon name="i-ph-arrows-left-right" class="size-10" style="color: var(--bw-muted)" />
      <h1 class="mt-6 text-3xl font-extralight tracking-tight">{{ t('insights.public.notFoundTitle') }}</h1>
      <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
        {{ t('insights.public.notFoundBody') }}
      </p>
      <UButton
        :to="localePath('/insights')" :label="t('insights.article.backToList')"
        icon="i-ph-arrow-left" class="mt-7 rounded-full" color="neutral"
      />
    </div>

    <!-- Ohne BEIDE Scores gibt es keine Tafel (die Route antwortet dann schon
         404; die Bedingung hier ist das Netz, nicht die Regel). -->
    <!-- Ohne Scores ist das Duell kürzer, nicht weg: die Statistik-Tafel
         entfällt in `InDuel`, Fakten und Einordnung bleiben (s. Leseroute). -->
    <div v-else-if="payload && post && view" class="mx-auto max-w-4xl">
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

      <div class="mx-auto mt-6 max-w-3xl text-center">
        <h1 class="text-3xl font-extralight leading-tight tracking-tight sm:text-4xl">{{ view.title }}</h1>
        <p class="mt-3 text-lg leading-relaxed" style="color: var(--bw-ink-soft)">{{ view.dek }}</p>
      </div>

      <UAlert
        v-if="view.fallback"
        class="mx-auto mt-6 max-w-3xl"
        icon="i-ph-translate" color="warning" variant="subtle"
        :title="t('insights.article.translationMissing')"
      />

      <div class="mt-8">
        <InDuel
          :left="payload.left" :right="payload.right"
          :left-score="payload.left.score" :right-score="payload.right.score"
          :facts="payload.facts" :sources="post.sources" :locale="readerLocale"
        >
          <template #ringLeft="{ score }">
            <InScoreRing v-if="score" :value="score.score" :size="72" :label="String(score.score)" />
          </template>
          <template #ringRight="{ score }">
            <InScoreRing v-if="score" :value="score.score" :size="72" :label="String(score.score)" />
          </template>

          <template #verdict>
            <MarkdownContent :source="view.body" />
          </template>

          <template #cta>
            <UButton
              :to="localePath('/brand-check/vergleich')" :label="t('insights.duel.ctaLabel')"
              icon="i-ph-arrows-left-right" class="rounded-full"
            />
          </template>

          <template #correction>
            <InCorrectionForm target-kind="post" :target-id="post.id" />
          </template>
        </InDuel>
      </div>

      <!-- Die zwei Marken zum Weiterlesen — nur mit freigeschaltetem Profil. -->
      <div v-if="profileAllowed" class="mt-8 flex flex-wrap justify-center gap-2">
        <NuxtLink
          v-for="side in [payload.left, payload.right]" :key="side.id"
          :to="localePath(`/brands/${side.slug}`)"
          class="bw-select-card rounded-full px-4 py-2 text-sm"
        >{{ side.name }}</NuxtLink>
      </div>
    </div>
  </div>
</template>
