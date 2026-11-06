<script setup lang="ts">
import type { InsightsLocale, InsightsTopicKey } from '../../../shared/insightsPost'
import { INSIGHTS_TOPIC_KEYS, insightsTopicLabel } from '../../../shared/insightsPost'
import type { InsightsPublicListResponse } from '../../../shared/types/insightsApi'

/**
 * EIN THEMENCLUSTER — `/topics/<slug>` (§9.2).
 *
 * ── DER KATALOG STEHT IM CODE, NICHT IN EINER TABELLE ───────────────────
 * Die acht Cluster ändern sich seltener als ein Deploy (§9.2). Ein unbekannter
 * Schlüssel ist deshalb ein 404-Zustand OHNE Request: die Prüfung ist eine
 * Zeile gegen `INSIGHTS_TOPIC_KEYS`, und ein Serverweg für eine Antwort, die
 * feststeht, wäre eine Einladung an Bots, den Cache mit erfundenen Themen zu
 * füllen.
 *
 * ── DAS LABEL WIRD NICHT ÜBERSETZT ──────────────────────────────────────
 * „Brand Psychology" heisst in beiden Sprachen gleich — es ist ein Eigenname
 * wie „Brand Insights" (Begründung im Katalog selbst). Die Adresse hat ohnehin
 * nur einen.
 *
 * ── DIESELBE LISTE, EIN FESTES THEMA ────────────────────────────────────
 * `InPostList` bekommt `fixed-topic` und blendet die Chip-Leiste aus: sonst
 * stünde hier eine Leiste, mit der man das Thema der Seite abwählen kann — und
 * die Adresse behauptete danach etwas anderes als die Liste zeigt. Format,
 * Sprache und Sortierung bleiben bedienbar und stehen weiter in der Query.
 */
definePageMeta({ layout: 'default' })

const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const requestEvent = useRequestEvent()

const readerLocale = computed<InsightsLocale>(() => (locale.value === 'de' ? 'de' : 'en'))
const slug = computed(() => String(route.params.slug ?? ''))
const topic = computed<InsightsTopicKey | null>(() =>
  ((INSIGHTS_TOPIC_KEYS as readonly string[]).includes(slug.value) ? slug.value as InsightsTopicKey : null))

const { data } = await useFetch<InsightsPublicListResponse>('/api/insights/public/posts', {
  key: 'insights-public-list',
  immediate: Boolean(topic.value),
})

const posts = computed(() => data.value?.posts ?? [])
const label = computed(() => (topic.value ? insightsTopicLabel(topic.value) : ''))
const missing = computed(() => !topic.value)

if (missing.value && requestEvent) setResponseStatus(requestEvent, 404)

useSeoMeta({
  title: () => (missing.value ? t('insights.public.notFoundTitle') : t('insights.public.topicTitle', { topic: label.value })),
  description: () => (missing.value ? t('insights.public.notFoundBody') : t('insights.public.topicLead', { topic: label.value })),
  ogTitle: () => (missing.value ? t('insights.public.notFoundTitle') : t('insights.public.topicTitle', { topic: label.value })),
  ogDescription: () => (missing.value ? t('insights.public.notFoundBody') : t('insights.public.topicLead', { topic: label.value })),
  robots: () => (missing.value ? 'noindex, nofollow' : 'index, follow'),
})
</script>

<template>
  <div class="mx-auto mt-10 max-w-7xl pb-16">
    <div v-if="missing" class="mx-auto mt-16 max-w-xl text-center" data-insights-missing>
      <UIcon name="i-ph-tag" class="size-10" style="color: var(--bw-muted)" />
      <h1 class="mt-6 text-3xl font-extralight tracking-tight">{{ t('insights.public.notFoundTitle') }}</h1>
      <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
        {{ t('insights.public.notFoundBody') }}
      </p>
      <UButton
        :to="localePath('/insights')" :label="t('insights.article.backToList')"
        icon="i-ph-arrow-left" class="mt-7 rounded-full" color="neutral"
      />
    </div>

    <template v-else-if="topic">
      <NuxtLink
        :to="localePath('/insights')" class="bw-label inline-flex items-center gap-1.5"
        style="color: var(--bw-muted)"
      >
        <UIcon name="i-ph-arrow-left" class="size-4" /> Brand Insights
      </NuxtLink>

      <div class="mt-6 text-center">
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('insights.public.topicEyebrow') }}</p>
        <h1 class="mt-2 text-balance text-4xl font-extralight leading-tight tracking-tight sm:text-5xl">{{ label }}</h1>
        <p class="mx-auto mt-4 max-w-2xl text-lg leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ t('insights.public.topicLead', { topic: label }) }}
        </p>
      </div>

      <div class="mt-10">
        <InPostList
          :posts="posts"
          :locale="readerLocale"
          :localize="localePath"
          :fixed-topic="topic"
        />
      </div>
    </template>
  </div>
</template>
