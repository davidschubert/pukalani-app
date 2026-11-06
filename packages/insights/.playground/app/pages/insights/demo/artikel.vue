<script setup lang="ts">
import type { InsightsLocale } from '../../../../../shared/insightsPost'
import { DEMO_ARTICLE_SECTIONS, demoBrandName, demoPost, demoScore } from '../../../utils/demoInsights'

/**
 * SCREEN 2 — DER ARTIKEL (Plan §2.3, §9.5; Adresse `/insights/<slug>`).
 *
 * ── WAS DAVID HIER PRÜFEN SOLL ──────────────────────────────────────────
 *  · Der Kopf trägt Datum, Thema und Lesezeit — und KEINEN Autorennamen.
 *    Entscheidung 4: Wir-Stimme, „keine erfundenen Autoren, nie". Der
 *    Klickdummy trug hier noch „Lena K.".
 *  · Das Inhaltsverzeichnis ist `UContentToc` mit mitgeliefertem Scrollspy —
 *    der handgebaute Scroll-Hörer des Dummys ist weg.
 *  · Die Quellenliste steht am Ende des Textes und nicht in einer Fussnote:
 *    jede Aussage mit Herausgeber, Datum und Zitat ≤ 200 Zeichen, und vor
 *    jeder Zeile das Wort „Eigenaussage" oder „Fremdquelle".
 *  · Der eine Einstieg (Entscheidung 9): Artikel ⇒ Wizard.
 */
const { t, locale } = useI18n()
const localePath = useLocalePath()

const readerLocale = computed<InsightsLocale>(() => (locale.value === 'de' ? 'de' : 'en'))
const post = computed(() => demoPost('was-kostet-ein-rebranding'))
const toc = computed(() => DEMO_ARTICLE_SECTIONS.map(section => ({
  id: section.id,
  text: readerLocale.value === 'de' ? section.headingDe : section.headingEn,
  depth: section.depth,
})))
const mentioned = computed(() => (post.value?.brandRefs ?? []).map(ref => ({
  brandId: ref.brandId,
  name: demoBrandName(ref.brandId),
  score: demoScore(ref.brandId, readerLocale.value),
})))
</script>

<template>
  <div class="bw-root min-h-dvh px-6 pb-10">
    <InDemoNav />
    <div class="mx-auto max-w-7xl">
      <NuxtLink :to="localePath('/insights/demo/journal')" class="bw-label inline-flex items-center gap-1.5" style="color: var(--bw-muted)">
        <UIcon name="i-ph-arrow-left" class="size-4" /> {{ t('insights.article.backToList') }}
      </NuxtLink>

      <InArticle v-if="post" :post="post" :locale="readerLocale" :toc="toc" class="mt-6">
        <template #cta>
          <UButton :label="locale === 'de' ? 'Starte dein Branding' : 'Start your branding'" icon="i-ph-plus" class="rounded-full" />
          <UButton
            :to="localePath('/insights/demo/journal')"
            :label="t('insights.article.backToList')" color="neutral" variant="ghost"
            class="rounded-full" style="background: var(--bw-surface)"
          />
        </template>

        <!-- Der Fliesstext. In I3 kommt er aus dem Markdown-Renderer; die
             Abschnitts-Ids sind schon dieselben wie die Sprungmarken. -->
        <template #default>
          <section
            v-for="section in DEMO_ARTICLE_SECTIONS" :id="section.id"
            :key="section.id" class="mt-10 scroll-mt-10 space-y-5 leading-relaxed"
            style="color: var(--bw-ink-soft)"
          >
            <component
              :is="section.depth === 2 ? 'h2' : 'h3'"
              :class="section.depth === 2 ? 'text-2xl font-medium tracking-tight' : 'text-xl'"
              style="color: var(--bw-ink)"
            >{{ readerLocale === 'de' ? section.headingDe : section.headingEn }}</component>
            <p v-for="(paragraph, index) in (readerLocale === 'de' ? section.paragraphsDe : section.paragraphsEn)" :key="index">
              {{ paragraph }}
            </p>
          </section>
        </template>

        <!-- Erwähnte Marken: Name + Score-Ring; der Ring gehört dem
             brand-Layer und wird hier von der SEITE gesetzt (CONCEPT A14). -->
        <template #brands>
          <span
            v-for="brand in mentioned" :key="brand.brandId"
            class="bw-select-card flex items-center gap-2 rounded-full py-1.5 pl-4 pr-1.5 text-sm"
          >
            {{ brand.name }}
            <BwScoreRing v-if="brand.score" :value="brand.score.score" :size="26" class="flex-none" />
          </span>
        </template>
      </InArticle>

      <p class="bw-pending mt-16 text-center">Prototyp I0 — Zahlen und Zitate stammen aus erfundenen Marken.</p>
    </div>
  </div>
</template>
