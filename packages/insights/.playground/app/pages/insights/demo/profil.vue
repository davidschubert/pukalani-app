<script setup lang="ts">
import type { InsightsLocale } from '../../../../../shared/insightsPost'
import { DEMO_GRADIENTS, demoBrand, demoBrandName, demoPost, demoScore } from '../../../utils/demoInsights'

/**
 * SCREEN 3 — DAS MARKENPROFIL EINER FREMDEN MARKE (Plan §2.1, §9.3;
 * Adresse `/brands/<slug>`).
 *
 * ── WAS DAVID HIER PRÜFEN SOLL ──────────────────────────────────────────
 *  · Der Hero ist eine Farbwelt-Kachel mit der Wortmarke als SCHRIFT — kein
 *    fremdes Logo, kein Screenshot (Entscheidung 10).
 *  · Neben dem Score steht IMMER der Link auf die Methodik (Entscheidung
 *    7/11) und der Satz, warum es keine zweite Zahl gibt.
 *  · Zeichen und Historie tragen je eine Beleg-Nummer, die auf die
 *    Quellenliste darunter zeigt.
 *  · Der Korrekturweg steht auf der Seite, nicht in einer Fussnote.
 *  · GANZ UNTEN: dieselbe Seite im Zustand „auf Wunsch entfernt". Er gehört
 *    zur Abnahme, weil er die Zusage aus Entscheidung 11 ist — und weil ein
 *    Prototyp, in dem alles gut geht, den wichtigsten Fall nie zeigt.
 */
const { locale } = useI18n()
const localePath = useLocalePath()

const readerLocale = computed<InsightsLocale>(() => (locale.value === 'de' ? 'de' : 'en'))
const brand = computed(() => demoBrand('upcountry-roast'))
const removed = computed(() => demoBrand('volcano-drip'))
const post = computed(() => demoPost('upcountry-roast', 'profile'))
const score = computed(() => demoScore('upcountry-roast', readerLocale.value))
const relations = computed(() => (brand.value?.relations ?? []).map(slug => ({
  slug,
  name: demoBrandName(slug),
  score: demoScore(slug, readerLocale.value),
})))
const methodologyHref = computed(() => localePath('/insights/demo/journal'))
</script>

<template>
  <div class="bw-root min-h-dvh px-6 pb-10">
    <InDemoNav />
    <div class="mx-auto max-w-7xl">
      <div class="mx-auto max-w-4xl">
        <NuxtLink :to="localePath('/insights/demo/journal')" class="bw-label inline-flex items-center gap-1.5" style="color: var(--bw-muted)">
          <UIcon name="i-ph-arrow-left" class="size-4" /> Brand Insights
        </NuxtLink>

        <!-- Die redaktionelle Einordnung steht ÜBER dem Dossier: sie ist der
             Beitrag (`insights_posts`, format `profile`), das Dossier ist die
             Entität (`insights_brands`). Zwei Datensätze, eine Seite. -->
        <div v-if="post" class="mx-auto mt-6 max-w-3xl text-center">
          <h1 class="text-3xl font-extralight leading-tight tracking-tight sm:text-4xl">
            {{ readerLocale === 'de' ? post.titleDe : post.titleEn }}
          </h1>
          <p class="mt-3 text-lg leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ readerLocale === 'de' ? post.dekDe : post.dekEn }}
          </p>
        </div>

        <div v-if="brand" class="mt-8">
          <InBrandProfile
            :brand="brand" :score="score" :locale="readerLocale"
            :gradient="DEMO_GRADIENTS[brand.slug]" :methodology-href="methodologyHref"
          >
            <template #ring="{ score: value }">
              <BwScoreRing :value="value.score" :size="80" />
            </template>
            <template #relations>
              <NuxtLink
                v-for="relation in relations" :key="relation.slug"
                :to="localePath('/insights/demo/duell')"
                class="flex items-center justify-between gap-3"
              >
                <p class="text-sm font-medium">{{ relation.name }}</p>
                <BwScoreRing v-if="relation.score" :value="relation.score.score" :size="30" class="flex-none" />
              </NuxtLink>
            </template>
          </InBrandProfile>
        </div>

        <!-- Derselbe Bildschirm, anderer Zustand (s. Kopf). -->
        <div class="mt-16">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
            {{ locale === 'de' ? 'Dieselbe Seite, anderer Zustand' : 'Same page, other state' }}
          </p>
          <div v-if="removed" class="mt-3">
            <InBrandProfile
              :brand="removed" :locale="readerLocale"
              :gradient="DEMO_GRADIENTS[removed.slug]" :methodology-href="methodologyHref"
            />
          </div>
        </div>

        <p class="bw-pending mt-10">Prototyp I0 — erfundene Marke, erfundene Belege, keine fremden Logos.</p>
      </div>
    </div>
  </div>
</template>
