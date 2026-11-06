<script setup lang="ts">
import type { InsightsLocale } from '../../../../../shared/insightsPost'
import { demoBrandName, demoPost, demoScore } from '../../../utils/demoInsights'

/**
 * SCREEN 5 — DAS RANKING (Plan §2.4, §11 Frage 7; Adresse `/rankings/<slug>`).
 *
 * ── WAS DAVID HIER PRÜFEN SOLL ──────────────────────────────────────────
 *  · Ausgabe-Nummer und Stand-Datum stehen ÜBER der Liste: sie ist
 *    eingefroren, eine Auffrischung wird eine neue Ausgabe.
 *  · Platz 7 ist eine LÜCKE mit Wort — „auf Wunsch entfernt". Die Liste wird
 *    nicht neu nummeriert; das ist ehrlicher als eine stille Verschiebung und
 *    die sichtbare Seite von Entscheidung 11.
 *  · Über der Liste steht die Methodik-Zeile (Prüfregel 5).
 */
const { locale } = useI18n()
const localePath = useLocalePath()

const readerLocale = computed<InsightsLocale>(() => (locale.value === 'de' ? 'de' : 'en'))
const post = computed(() => demoPost('staerkste-auftritte-kaffee-2026'))
</script>

<template>
  <div class="bw-root min-h-dvh px-6 pb-10">
    <InDemoNav />
    <div class="mx-auto max-w-7xl">
      <div class="mx-auto max-w-4xl">
        <NuxtLink :to="localePath('/insights/demo/journal')" class="bw-label inline-flex items-center gap-1.5" style="color: var(--bw-muted)">
          <UIcon name="i-ph-arrow-left" class="size-4" /> Brand Insights
        </NuxtLink>

        <div v-if="post" class="mx-auto mt-6 max-w-3xl text-center">
          <h1 class="text-3xl font-extralight leading-tight tracking-tight sm:text-4xl">
            {{ readerLocale === 'de' ? post.titleDe : post.titleEn }}
          </h1>
          <p class="mt-3 text-lg leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ readerLocale === 'de' ? post.dekDe : post.dekEn }}
          </p>
        </div>

        <div v-if="post?.ranking" class="mt-10">
          <InRanking
            :ranking="post.ranking" :locale="readerLocale"
            :methodology-href="localePath('/insights/demo/journal')"
            :resolve-brand-name="demoBrandName"
            :resolve-brand-href="() => localePath('/insights/demo/profil')"
          >
            <template #ring="{ entry }">
              <BwScoreRing :value="demoScore(entry.brandId, readerLocale)?.score ?? entry.score" :size="34" />
            </template>
          </InRanking>
        </div>

        <p class="bw-pending mt-10">Prototyp I0 — alle zehn Marken sind erfunden; Platz 7 zeigt den Entfernen-Wunsch.</p>
      </div>
    </div>
  </div>
</template>
