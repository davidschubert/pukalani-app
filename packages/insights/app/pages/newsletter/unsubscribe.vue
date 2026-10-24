<script setup lang="ts">
import { insightsNewsletterEnabled } from '../../../shared/insightsPublic'
import type { InsightsNewsletterUnsubscribeResponse } from '../../../shared/types/insightsApi'

/**
 * DIE ABMELDE-SEITE — `/newsletter/unsubscribe?token=…` (BI1 I5a).
 *
 * Sie ist die Einlösung der Zusage „jede Mail trägt den Abmelde-Link": ein
 * Klick, kein Konto, keine Rückfrage, kein Formular. Deshalb meldet sie
 * SELBST ab, sobald sie geladen ist, statt erst einen Knopf zu zeigen — wer
 * hier ankommt, hat den Knopf schon in der Mail gedrückt.
 *
 * ── VIER ZUSTÄNDE, UND DREI DAVON SIND „ERLEDIGT" ───────────────────────
 * Die Route antwortet auf alles 200: abgemeldet, schon abgemeldet, Zeile längst
 * gelöscht, Token aus der Zeit vor einem Schlüsseltausch. Diese Seite sagt
 * deshalb in all diesen Fällen denselben Satz — ein Mensch, der sich abmelden
 * will, darf nie in einer Sackgasse stehen.
 *
 * Nur zwei Fälle weichen ab:
 *  · GAR KEIN TOKEN in der Adresse (jemand ruft die Seite direkt auf) ⇒ der
 *    Satz, was zu tun ist: der Link steht in jeder Mail.
 *  · 503 ⇒ ehrlich „gerade nicht möglich", denn hier ist die Abmeldung
 *    NICHT erfolgt. Ein „erledigt" wäre an dieser Stelle eine Lüge über
 *    genau das, worauf sich jemand verlässt.
 *
 * ── `noindex`, NICHT IN DER SITEMAP, UND 404 BEI GESCHLOSSENEM RIEGEL ───
 * Dieselben drei Regeln wie bei der Bestätigungs-Seite daneben, aus denselben
 * Gründen (Kopf dort).
 */
definePageMeta({ layout: 'default' })

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const requestEvent = useRequestEvent()
const appConfig = useAppConfig() as { pukalani?: { insights?: { newsletter?: { enabled?: unknown } } } }

const open = computed(() => insightsNewsletterEnabled(appConfig.pukalani?.insights?.newsletter?.enabled))

useSeoMeta({
  title: () => (open.value ? t('insights.newsletter.unsubscribe.title') : t('insights.public.notFoundTitle')),
  robots: 'noindex, nofollow',
})

if (!open.value && requestEvent) setResponseStatus(requestEvent, 404)

type State = 'checking' | 'done' | 'missing' | 'unavailable'
const state = ref<State>('checking')

const token = computed(() => {
  const raw = route.query.token
  return typeof raw === 'string' ? raw.trim() : ''
})

onMounted(async () => {
  if (!open.value) return
  if (!token.value) { state.value = 'missing'; return }
  try {
    await $fetch<InsightsNewsletterUnsubscribeResponse>('/api/insights/public/newsletter/unsubscribe', {
      method: 'POST',
      body: { token: token.value },
    })
    state.value = 'done'
  }
  catch (error) {
    const value = error as { status?: number, statusCode?: number, response?: { status?: number } } | null
    const code = value?.status ?? value?.statusCode ?? value?.response?.status ?? null
    // 400 kann hier nur ein Token sein, der die Formprüfung nicht passiert
    // (abgeschnitten im Mail-Programm). Für den Menschen ist das dasselbe wie
    // „Link unbrauchbar" — und der Weg heraus ist derselbe.
    state.value = code === 503 ? 'unavailable' : 'missing'
  }
})

const ok = computed(() => state.value === 'done')
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
      <div class="bw-card p-10 text-center" data-insights-newsletter-unsubscribe>
        <template v-if="state === 'checking'">
          <UIcon name="i-ph-circle-notch" class="mx-auto size-6 animate-spin" style="color: var(--bw-muted)" />
          <p class="mt-4 text-sm" style="color: var(--bw-ink-soft)">
            {{ t('insights.newsletter.unsubscribe.checking') }}
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
            {{ t(`insights.newsletter.unsubscribe.${state}Title`) }}
          </h1>
          <p class="mx-auto mt-4 max-w-md text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t(`insights.newsletter.unsubscribe.${state}Text`) }}
          </p>
          <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
            <UButton
              :to="localePath('/insights')" :label="t('insights.newsletter.unsubscribe.toList')"
              size="lg" class="rounded-full" :color="ok ? 'primary' : 'neutral'"
            />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
