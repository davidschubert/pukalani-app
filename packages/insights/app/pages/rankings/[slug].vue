<script setup lang="ts">
import type { InsightsLocale } from '../../../shared/insightsPost'
import { INSIGHTS_METHODOLOGY_PATH, insightsPublicFassung } from '../../../shared/insightsPost'
import { insightsFormatIsPublic, readInsightsPublicFormats } from '../../../shared/insightsPublic'
import type { InsightsPublicRankingResponse } from '../../../shared/types/insightsApi'

/**
 * EINE RANKING-AUSGABE — `/rankings/<slug>` (§2.4, §11 Frage 7).
 *
 * ── EINGEFROREN, MIT SICHTBAREM STAND ───────────────────────────────────
 * Zehn Plätze, Ausgabe-Nummer und Stand-Datum über der Liste. Eine
 * Auffrischung ist eine NEUE Ausgabe mit neuem Slug; diese hier bleibt stehen.
 * Die Seite rechnet deshalb nichts nach — sie zeigt, was in der Zeile steht.
 *
 * ── DIE LÜCKE BLEIBT SICHTBAR ───────────────────────────────────────────
 * Ein Entfernen-Wunsch nimmt den Platz heraus und nummeriert NICHT neu: Platz
 * 4 bleibt Platz 4 und trägt „auf Wunsch entfernt" (Entscheidung 11). Das
 * erledigt `InRanking`; die Seite liefert nur Namen und Adressen.
 *
 * ── NAMEN OHNE LINK SIND KEIN FEHLER ────────────────────────────────────
 * Verlinkt wird eine Marke nur, wenn ihr Profil öffentlich steht (Riegel UND
 * Zustand). Fehlt sie in der Karte, zeigt die Zeile den Platz ohne Ziel — ein
 * Link auf eine gesperrte oder entfernte Seite wäre ein 404 mitten in der
 * Liste.
 *
 * ── JSON-LD: `Article` + `BreadcrumbList` + `ItemList` ──────────────────
 * `ItemList` ist die einzige Auszeichnung, die ein Ranking zusätzlich bekommt
 * (§9.5): Position und NAME, mehr nicht. KEIN Rating und kein `Organization` —
 * eine maschinenlesbare Bewertung fremder Marken ist genau die Zuspitzung von
 * Anwaltsfrage 3. Entfernte Plätze stehen NICHT darin: sie haben keinen Namen
 * mehr, den man nennen dürfte.
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
const rankingAllowed = computed(() => insightsFormatIsPublic('ranking', publicFormats.value))
const profileAllowed = computed(() => insightsFormatIsPublic('profile', publicFormats.value))

const { data, error } = await useFetch<InsightsPublicRankingResponse>(
  () => `/api/insights/public/rankings/${encodeURIComponent(slug.value)}${preview.value ? '?preview=1' : ''}`,
  { key: 'insights-public-ranking', watch: [slug, preview], immediate: rankingAllowed.value },
)

const redirectTo = computed(() => (data.value?.kind === 'redirect' ? data.value.slug : ''))
if (redirectTo.value) {
  await navigateTo(localePath(`/rankings/${redirectTo.value}`), { redirectCode: 301, replace: true })
}

const payload = computed(() => (data.value?.kind === 'ranking' ? data.value : null))
const missing = computed(() => !rankingAllowed.value || Boolean(error.value) || !payload.value)
const isPreview = computed(() => Boolean(payload.value?.preview))
const post = computed(() => payload.value?.post ?? null)
const view = computed(() => (post.value ? insightsPublicFassung(post.value, readerLocale.value) : null))

if (missing.value && requestEvent) setResponseStatus(requestEvent, 404)

/** Name zu einer Marken-Id — leer, wenn die Marke nicht öffentlich steht. */
function brandName(brandId: string): string {
  return payload.value?.brands[brandId]?.name ?? ''
}

/**
 * Adresse zu einer Marken-Id — LEER ohne Riegel oder ohne öffentliche Zeile.
 * `InRanking` rendert dann einen `NuxtLink` auf `''`; das ist ein Anker ohne
 * Ziel und damit derselbe Ort, was hier richtig ist: der Name bleibt lesbar,
 * der Weg fehlt.
 */
function brandHref(brandId: string): string {
  const entry = payload.value?.brands[brandId]
  if (!entry || !profileAllowed.value) return ''
  return localePath(`/brands/${entry.slug}`)
}

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

useHead({
  script: computed(() => {
    const entry = payload.value
    if (missing.value || !entry || !post.value) return []
    return [{
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
            { '@type': 'ListItem', 'position': 2, 'name': t('insights.public.rankingsTitle'), 'item': localePath('/rankings') },
            { '@type': 'ListItem', 'position': 3, 'name': view.value?.title ?? '' },
          ],
        },
        {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          'itemListElement': entry.ranking.entries
            .filter(place => !place.removed && brandName(place.brandId))
            .map(place => ({ '@type': 'ListItem', 'position': place.rank, 'name': brandName(place.brandId) })),
        },
      ]).replace(/</g, '\\u003c'),
    }]
  }),
})
</script>

<template>
  <div class="mx-auto mt-10 max-w-7xl pb-16">
    <div v-if="missing" class="mx-auto mt-16 max-w-xl text-center" data-insights-missing>
      <UIcon name="i-ph-list-numbers" class="size-10" style="color: var(--bw-muted)" />
      <h1 class="mt-6 text-3xl font-extralight tracking-tight">{{ t('insights.public.notFoundTitle') }}</h1>
      <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
        {{ t('insights.public.notFoundBody') }}
      </p>
      <UButton
        :to="localePath('/rankings')" :label="t('insights.public.rankingsTitle')"
        icon="i-ph-arrow-left" class="mt-7 rounded-full" color="neutral"
      />
    </div>

    <div v-else-if="payload && post && view" class="mx-auto max-w-4xl">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <NuxtLink
          :to="localePath('/rankings')" class="bw-label inline-flex items-center gap-1.5"
          style="color: var(--bw-muted)"
        >
          <UIcon name="i-ph-arrow-left" class="size-4" /> {{ t('insights.public.rankingsTitle') }}
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

      <div class="mt-10">
        <InRanking
          :ranking="payload.ranking"
          :locale="readerLocale"
          :methodology-href="localePath(INSIGHTS_METHODOLOGY_PATH)"
          :resolve-brand-name="brandName"
          :resolve-brand-href="brandHref"
        >
          <template #ring="{ entry }">
            <InScoreRing :value="entry.score" :size="34" :label="String(entry.score)" />
          </template>

          <template #cta>
            <UButton
              :to="localePath('/brand-check')" :label="t('insights.ranking.ctaLabel')"
              icon="i-ph-gauge" class="rounded-full"
            />
          </template>

          <template #correction>
            <InCorrectionForm target-kind="post" :target-id="post.id" />
          </template>
        </InRanking>
      </div>

      <!-- Die Einordnung des Beitrags unter der Liste: sie sagt, wie die
           Reihenfolge zustande kam — die Methodik-Zeile steht daneben. -->
      <div v-if="view.body" class="mt-10">
        <MarkdownContent :source="view.body" />
      </div>

      <div class="mt-10">
        <InSourceList :sources="post.sources" :locale="readerLocale" />
      </div>
    </div>
  </div>
</template>
