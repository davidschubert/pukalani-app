<script setup lang="ts">
import type { InsightsLocale } from '../../../shared/insightsPost'
import type { InsightsPublicListResponse } from '../../../shared/types/insightsApi'

/**
 * DAS JOURNAL — `/insights` (§9.2, §9.5).
 *
 * Sie zeigt ALLE freigeschalteten Formate in EINER Liste: Insights ist EIN
 * Bereich mit vier Formaten und nicht vier Bereiche. Der Filter trennt sie,
 * die Liste nicht.
 *
 * ── „BRAND INSIGHTS" WIRD NICHT ÜBERSETZT ───────────────────────────────
 * Es ist ein Eigenname (wie „Discover Brands") — dieselbe Regel wie bei den
 * Themencluster-Labels und den Hauptpunkten der Navigation. Titel und
 * Untertitel darunter sind normale i18n-Schlüssel.
 *
 * ── DIE FACETTEN LEBEN IN `InPostList` ──────────────────────────────────
 * Format, Thema, Sprache, Sortierung und Ansicht stehen in der ADRESSE und
 * werden im Browser gerechnet (Begründung im Kopf der Komponente). Die Seite
 * holt EINE Liste und reicht `localePath` herein.
 */
definePageMeta({ layout: 'default' })

const { t, locale } = useI18n()
const localePath = useLocalePath()

const readerLocale = computed<InsightsLocale>(() => (locale.value === 'de' ? 'de' : 'en'))

const { data } = await useFetch<InsightsPublicListResponse>('/api/insights/public/posts', {
  key: 'insights-public-list',
})

const posts = computed(() => data.value?.posts ?? [])

useSeoMeta({
  title: () => t('insights.public.listTitle'),
  description: () => t('insights.public.listLead'),
  ogTitle: () => t('insights.public.listTitle'),
  ogDescription: () => t('insights.public.listLead'),
  robots: 'index, follow',
})
</script>

<template>
  <div class="mx-auto mt-10 max-w-7xl pb-16">
    <div class="text-center">
      <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Brand Insights</p>
      <h1 class="mt-2 text-balance text-4xl font-extralight leading-tight tracking-tight sm:text-5xl">
        {{ t('insights.public.listTitle') }}
      </h1>
      <p class="mx-auto mt-4 max-w-2xl text-lg leading-relaxed" style="color: var(--bw-ink-soft)">
        {{ t('insights.public.listLead') }}
      </p>
    </div>

    <div class="mt-10">
      <InPostList
        :posts="posts"
        :locale="readerLocale"
        :localize="localePath"
      />
    </div>

    <!-- Der Newsletter, zentral unter der Liste (I5a). `source: 'list'` sagt
         später, wie viele Leser aus dem Journal kommen und wie viele aus einem
         einzelnen Stück (§9.7). Die Komponente prüft ihren Riegel selbst und
         gibt ohne ihn nichts aus. -->
    <div class="mx-auto mt-16 max-w-3xl">
      <InNewsletterForm source="list" />
    </div>
  </div>
</template>
