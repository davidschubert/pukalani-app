<script setup lang="ts">
import { insightsNewsletterEnabled } from '../../../shared/insightsPublic'
import type { InsightsNewsletterConfirmResponse } from '../../../shared/types/insightsApi'

/**
 * DIE LANDESTELLE DES BESTÄTIGUNGS-LINKS — `/newsletter/confirm?token=…`
 * (BI1 I5a, Muster: `brand/app/pages/waitlist/confirm.vue`).
 *
 * Die Mail trägt den ROHEN Token, die Tabelle nur seinen Hash; diese Seite
 * reicht ihn genau einmal an die Route weiter und zeigt, was der Server sagt.
 * Sie entscheidet nichts selbst — fünf Zustände, fünf Sätze, ein Weg weiter.
 *
 * ── ÖFFENTLICH, ABSICHTLICH ─────────────────────────────────────────────
 * Wer sich einträgt, hat typischerweise KEIN Konto; ein Auth-Guard schickte
 * ihn auf /login, und dort hilft ihm niemand.
 *
 * ── EINSPRACHIGER SLUG, ZWEISPRACHIGE SEITE ─────────────────────────────
 * Die Adresse heisst in beiden Sprachen `/newsletter/confirm` (unter `/de`
 * davor) — ein übersetzter Slug wäre ein zweiter Pfad, den die Mail-Links
 * kennen müssten. Verlinkt wird von hier aus mit `localePath()`.
 *
 * ── `noindex` UND NICHT IN DER SITEMAP ──────────────────────────────────
 * Diese Seite hat ohne Token keinen Inhalt; indexiert wäre sie eine Adresse,
 * die jedem „Link ungültig" sagt. Die Sitemap der App zählt nur, was
 * `listInsightsSitemapEntries` liefert — und das sind Beiträge, nie diese
 * Seite.
 *
 * ── IST DER RIEGEL ZU, GIBT ES DIESE SEITE NICHT ────────────────────────
 * Dann steht hier derselbe 404-Zustand wie bei einem gesperrten Format, samt
 * echtem Status (`setResponseStatus`): ein Crawler soll keine Seite
 * indexieren, die es nicht geben darf, und die Route antwortet ohnehin 404.
 *
 * ── DER TOKEN REIST NUR IM BODY ─────────────────────────────────────────
 * Ein GET mit `?token=` in der API läge im Server-Log; der Browser hat ihn
 * ohnehin in der Adresszeile — mehr Stellen braucht er nicht.
 */
definePageMeta({ layout: 'default' })

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const requestEvent = useRequestEvent()
const appConfig = useAppConfig() as { pukalani?: { insights?: { newsletter?: { enabled?: unknown } } } }

const open = computed(() => insightsNewsletterEnabled(appConfig.pukalani?.insights?.newsletter?.enabled))

useSeoMeta({
  title: () => (open.value ? t('insights.newsletter.confirm.title') : t('insights.public.notFoundTitle')),
  robots: 'noindex, nofollow',
})

if (!open.value && requestEvent) setResponseStatus(requestEvent, 404)

type State = 'checking' | 'confirmed' | 'already' | 'invalid' | 'expired' | 'unavailable'
const state = ref<State>('checking')

const token = computed(() => {
  const raw = route.query.token
  return typeof raw === 'string' ? raw.trim() : ''
})

onMounted(async () => {
  if (!open.value) return
  if (!token.value) { state.value = 'invalid'; return }
  try {
    const result = await $fetch<InsightsNewsletterConfirmResponse>('/api/insights/public/newsletter/confirm', {
      method: 'POST',
      body: { token: token.value },
    })
    state.value = result.state === 'already_confirmed' ? 'already' : 'confirmed'
  }
  catch (error) {
    const value = error as { status?: number, statusCode?: number, response?: { status?: number } } | null
    const code = value?.status ?? value?.statusCode ?? value?.response?.status ?? null
    // 410 ist der EINE Fall, für den es einen eigenen Satz gibt („trag dich
    // noch einmal ein"). 503 bekommt seinen eigenen, damit niemand seinen
    // gültigen Link für kaputt hält. Alles andere ist „ungültig".
    if (code === 410) state.value = 'expired'
    else if (code === 503) state.value = 'unavailable'
    else state.value = 'invalid'
  }
})

const ok = computed(() => state.value === 'confirmed' || state.value === 'already')
</script>

<template>
  <div class="pb-10">
    <!-- Riegel zu: derselbe Zustand wie an jeder gesperrten Seite. -->
    <div v-if="!open" class="mx-auto mt-16 max-w-xl text-center" data-insights-missing>
      <UIcon name="i-ph-envelope-simple" class="size-10" style="color: var(--bw-muted)" />
      <h1 class="mt-6 text-3xl font-extralight tracking-tight">{{ t('insights.public.notFoundTitle') }}</h1>
      <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
        {{ t('insights.public.notFoundBody') }}
      </p>
      <UButton
        :to="localePath('/insights')" :label="t('insights.article.backToList')"
        icon="i-ph-arrow-left" class="mt-7 rounded-full" color="neutral"
      />
    </div>

    <div v-else class="mx-auto mt-14 max-w-xl">
      <div class="bw-card p-10 text-center" data-insights-newsletter-confirm>
        <template v-if="state === 'checking'">
          <UIcon name="i-ph-circle-notch" class="mx-auto size-6 animate-spin" style="color: var(--bw-muted)" />
          <p class="mt-4 text-sm" style="color: var(--bw-ink-soft)">
            {{ t('insights.newsletter.confirm.checking') }}
          </p>
        </template>
        <template v-else>
          <span
            class="mx-auto grid size-12 place-items-center rounded-full"
            :style="ok ? 'background: var(--bw-accent-soft)' : 'background: var(--bw-stale-soft)'"
          >
            <UIcon
              :name="ok ? 'i-ph-check' : 'i-ph-link-break'" class="size-5"
              :style="ok ? 'color: var(--bw-accent)' : 'color: var(--bw-stale)'"
            />
          </span>
          <h1 class="mt-6 text-balance text-3xl font-extralight tracking-tight">
            {{ t(`insights.newsletter.confirm.${state}Title`) }}
          </h1>
          <p class="mx-auto mt-4 max-w-md text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t(`insights.newsletter.confirm.${state}Text`) }}
          </p>
          <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
            <UButton
              :to="localePath('/insights')" :label="t('insights.newsletter.confirm.toList')"
              size="lg" class="rounded-full" :color="ok ? 'primary' : 'neutral'"
            />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
