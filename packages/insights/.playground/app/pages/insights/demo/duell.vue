<script setup lang="ts">
import type { InsightsLocale } from '../../../../../shared/insightsPost'
import { demoBrand, demoPost, demoScore } from '../../../utils/demoInsights'

/**
 * SCREEN 4 — DAS BRAND-DUELL (Plan §2.2; Adresse `/duels/<a>-vs-<b>`).
 *
 * ── WAS DAVID HIER PRÜFEN SOLL ──────────────────────────────────────────
 *  · Die Statistik-Tafel: acht Dimensionen als gespiegelte Balken, Sieger je
 *    Zeile im Akzent, darüber der Zwischenstand.
 *  · „Zahlen & Fakten" trägt je Zeile eine BELEG-NUMMER — eine Faktenzeile
 *    ohne Beleg lässt sich gar nicht speichern (§9.3). Genau daran hing die
 *    offene Frage „Agentur-Beziehung" (§8 Frage 5): die Zeile bleibt, aber
 *    nur mit Beleg.
 *  · Der Slug steht alphabetisch (`pacific-bean-vs-upcountry-roast`), die
 *    Gegenrichtung antwortet später 301 (§11 Frage 2).
 */
const { locale } = useI18n()
const localePath = useLocalePath()

const readerLocale = computed<InsightsLocale>(() => (locale.value === 'de' ? 'de' : 'en'))
const post = computed(() => demoPost('pacific-bean-vs-upcountry-roast'))
const left = computed(() => demoBrand('upcountry-roast'))
const right = computed(() => demoBrand('pacific-bean'))
const leftScore = computed(() => demoScore('upcountry-roast', readerLocale.value))
const rightScore = computed(() => demoScore('pacific-bean', readerLocale.value))
</script>

<template>
  <div class="bw-root min-h-dvh px-6 pb-10">
    <InDemoNav />
    <div class="mx-auto max-w-7xl">
      <div class="mx-auto max-w-4xl">
        <NuxtLink :to="localePath('/insights/demo/profil')" class="bw-label inline-flex items-center gap-1.5" style="color: var(--bw-muted)">
          <UIcon name="i-ph-arrow-left" class="size-4" /> Upcountry Roast Co.
        </NuxtLink>

        <div v-if="post" class="mx-auto mt-6 max-w-3xl text-center">
          <h1 class="text-3xl font-extralight leading-tight tracking-tight sm:text-4xl">
            {{ readerLocale === 'de' ? post.titleDe : post.titleEn }}
          </h1>
          <p class="mt-3 text-lg leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ readerLocale === 'de' ? post.dekDe : post.dekEn }}
          </p>
          <p class="bw-label mt-3" style="color: var(--bw-muted)">/duels/{{ post.slug }}</p>
        </div>

        <div v-if="post && left && right && leftScore && rightScore" class="mt-8">
          <InDuel
            :left="left" :right="right"
            :left-score="leftScore" :right-score="rightScore"
            :facts="post.facts" :sources="post.sources" :locale="readerLocale"
          >
            <template #ringLeft="{ score }">
              <BwScoreRing :value="score.score" :size="72" />
            </template>
            <template #ringRight="{ score }">
              <BwScoreRing :value="score.score" :size="72" />
            </template>
            <template #verdict>
              {{ readerLocale === 'de' ? post.bodyDe : post.bodyEn }}
            </template>
          </InDuel>
        </div>

        <p class="bw-pending mt-10">Prototyp I0 — beide Marken sind erfunden; die Bewertung folgt derselben offengelegten Methodik.</p>
      </div>
    </div>
  </div>
</template>
