<script setup lang="ts">
import type { InsightsLocale } from '../../../shared/insightsPost'
import { insightsFormatIsPublic, readInsightsPublicFormats } from '../../../shared/insightsPublic'
import type { InsightsPublicRankingsResponse } from '../../../shared/types/insightsApi'

/**
 * DIE RANKING-ÜBERSICHT — `/rankings` (§9.2).
 *
 * ── DER RIEGEL SCHLIESST HIER GENAUSO WIE AN DER EINZELSEITE ────────────
 * Ein gesperrtes Format hat KEINE erreichbare öffentliche Adresse — Seite und
 * Leseroute antworten beide 404, wie an der Datentür (Gate der Anwaltsantworten
 * BI1-3/BI1-4, §6). Hier stand zuerst das Gegenteil („antwortet nie 404, eine
 * 404 in der Navigation wäre Davids 404-Audit"): das trägt nicht, denn bei
 * gesperrtem `ranking` steht diese Adresse in KEINER Navigation — der
 * Nav-Eintrag zeigt auf `/insights`, und die Sitemap lässt `/rankings` weg.
 * Übrig bliebe eine leere, aber indexierbare Seite („Rankings", `index,
 * follow`), die einen Bereich ankündigt, den es noch nicht geben darf. Beim
 * Klick-Beweis live erwischt (2026-09-10).
 *
 * ── DIESELBE LISTE, EIN FESTES FORMAT ───────────────────────────────────
 * Die ROUTE filtert auf `ranking`; die Liste bekommt also nur Ausgaben und
 * braucht dafür keinen eigenen Bauteil. Die Werkzeugleiste bleibt, wie sie
 * überall ist — eine zweite, abgespeckte Listen-Komponente wäre ein zweites
 * Verhalten für dieselbe Kachelwand, das beim nächsten Zuschnitt auseinander
 * liefe.
 */
definePageMeta({ layout: 'default' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const requestEvent = useRequestEvent()
const appConfig = useAppConfig() as { pukalani?: { insights?: { publicFormats?: unknown } } }

const readerLocale = computed<InsightsLocale>(() => (locale.value === 'de' ? 'de' : 'en'))

const publicFormats = computed(() => readInsightsPublicFormats(appConfig.pukalani?.insights?.publicFormats))
const rankingAllowed = computed(() => insightsFormatIsPublic('ranking', publicFormats.value))

const { data } = await useFetch<InsightsPublicRankingsResponse>('/api/insights/public/rankings', {
  key: 'insights-public-rankings',
  // Bei gesperrtem Format gibt es nichts zu holen — die Route antwortet
  // ohnehin 404, und ein Fehler im Log wäre hier nur Rauschen.
  immediate: rankingAllowed.value,
})

const posts = computed(() => data.value?.posts ?? [])

useSeoMeta({
  title: () => (rankingAllowed.value ? t('insights.public.rankingsTitle') : t('insights.public.notFoundTitle')),
  description: () => (rankingAllowed.value ? t('insights.public.rankingsLead') : t('insights.public.notFoundBody')),
  ogTitle: () => (rankingAllowed.value ? t('insights.public.rankingsTitle') : t('insights.public.notFoundTitle')),
  ogDescription: () => (rankingAllowed.value ? t('insights.public.rankingsLead') : t('insights.public.notFoundBody')),
  robots: () => (rankingAllowed.value ? 'index, follow' : 'noindex, nofollow'),
})

// Der STATUS bleibt 404, die Seite zeigt trotzdem den Weg zurück (dasselbe
// Muster wie an jeder Einzelseite) — sonst indexierte ein Crawler eine Seite,
// die es nicht geben darf.
if (!rankingAllowed.value && requestEvent) setResponseStatus(requestEvent, 404)
</script>

<template>
  <div class="mx-auto mt-10 max-w-7xl pb-16">
    <!-- Gesperrtes Format: derselbe Zustand wie an jeder Einzelseite. -->
    <div v-if="!rankingAllowed" class="mx-auto mt-16 max-w-xl text-center" data-insights-missing>
      <UIcon name="i-ph-list-numbers" class="size-10" style="color: var(--bw-muted)" />
      <h1 class="mt-6 text-3xl font-extralight tracking-tight">{{ t('insights.public.notFoundTitle') }}</h1>
      <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
        {{ t('insights.public.notFoundBody') }}
      </p>
      <UButton
        :to="localePath('/insights')" :label="t('insights.article.backToList')"
        icon="i-ph-arrow-left" class="mt-7 rounded-full" color="neutral"
      />
    </div>

    <template v-else>
      <NuxtLink
        :to="localePath('/insights')" class="bw-label inline-flex items-center gap-1.5"
        style="color: var(--bw-muted)"
      >
        <UIcon name="i-ph-arrow-left" class="size-4" /> Brand Insights
      </NuxtLink>

      <div class="mt-6 text-center">
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('insights.ranking.eyebrow') }}</p>
        <h1 class="mt-2 text-balance text-4xl font-extralight leading-tight tracking-tight sm:text-5xl">
          {{ t('insights.public.rankingsTitle') }}
        </h1>
        <p class="mx-auto mt-4 max-w-2xl text-lg leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ t('insights.public.rankingsLead') }}
        </p>
      </div>

      <div class="mt-10">
        <InPostList :posts="posts" :locale="readerLocale" :localize="localePath" />
      </div>
    </template>
  </div>
</template>
