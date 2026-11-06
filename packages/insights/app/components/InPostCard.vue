<script setup lang="ts">
import type { InsightsLocale } from '../../shared/insightsPost'
import { insightsPublicKopf, insightsTopicLabel } from '../../shared/insightsPost'
import type { InsightsPostCardView } from '../../shared/insightsPublic'
import { insightsDay } from '../utils/insightsFormat'

/**
 * PROTOTYP (I0) — EIN BEITRAG IN DER LISTE, in zwei Ansichten (§9.5).
 *
 * ── DIE FARBWELT KOMMT VON AUSSEN HEREIN (CONCEPT A14) ───────────────────
 * `brandGradientFor` gehört `packages/brand`; `insights` hängt daran über
 * einen Vertrag, den erst I1 zieht. Der Verlauf kommt deshalb als PROP —
 * dasselbe Muster wie `MkBrandScore` im market-Layer, wo der Score-Ring als
 * Slot hereinkommt. Eine Komponente, die still einen fremden Layer
 * auto-importiert, ist in einer App ohne diesen Layer leer, ohne dass es
 * jemand merkt.
 *
 * ── „NUR AUF DEUTSCH" IST EIN ZUSTAND, KEINE LEERE ───────────────────────
 * Ein Beitrag, dessen zweite Fassung noch nicht redigiert ist, verschwindet
 * NICHT aus der Liste — er steht mit seiner Grundfassung da und sagt es. Das
 * ist die Anzeige-Seite von `insightsPublicFassung()`; eine stille
 * Rohübersetzung wäre der Bruch von §3.2.
 */
const props = withDefaults(defineProps<{
  /**
   * Der SCHMALSTE Typ, der reicht (BI1 I3): so passt sowohl der volle Beitrag
   * (Redaktion, Prototyp) als auch das Listen-Item der öffentlichen Route, das
   * bewusst KEINEN Fliesstext trägt. Eine Karte, die `InsightsPost` verlangte,
   * zwänge die Liste dazu, zwei Artikel-Fassungen je Kachel mitzuschicken.
   */
  post: InsightsPostCardView
  /** Anzeigesprache des Lesers — NICHT die Grundsprache des Beitrags. */
  locale: InsightsLocale
  to: string
  /** Zwei Farben der Marken-Farbwelt; von der Seite aufgelöst (s. Kopf). */
  gradient?: readonly [string, string]
  display?: 'grid' | 'list'
}>(), {
  gradient: () => ['#e6e2da', '#8f867a'] as const,
  display: 'grid',
})

const { t } = useI18n()

// Titel und Vorspann in der richtigen Sprache — OHNE Fliesstext. Die
// Sprach-Entscheidung ist dieselbe wie auf der Beitragsseite
// (`insightsPublicKopf` ist der gemeinsame Kern von `insightsPublicFassung`).
const view = computed(() => insightsPublicKopf(props.post, props.locale))
const formatLabel = computed(() => t(`insights.format.${props.post.format}`))
const day = computed(() => insightsDay(props.post.publishedAt, props.locale))
const topicLabels = computed(() => props.post.topics.map(key => insightsTopicLabel(key)))
const baseLanguage = computed(() => t(`insights.list.locale${props.post.baseLocale === 'de' ? 'De' : 'En'}`))
</script>

<template>
  <NuxtLink
    :to="to"
    class="group"
    :class="display === 'grid'
      ? 'bw-card bw-card--hover flex flex-col overflow-hidden'
      : 'grid gap-x-8 gap-y-1 border-b py-6 sm:grid-cols-[9rem_minmax(0,1fr)]'"
    :style="display === 'list' ? 'border-color: var(--bw-line)' : undefined"
  >
    <!-- Rasteransicht: Farb-Thumbnail statt fremder Logos (Entscheidung 10). -->
    <div
      v-if="display === 'grid'"
      class="h-28 flex-none"
      :style="`background: linear-gradient(135deg, ${gradient[1]}, ${gradient[0]})`"
    />
    <div v-else>
      <p class="bw-label" style="color: var(--bw-muted)">{{ day }}</p>
      <p class="bw-label mt-1" style="color: var(--bw-muted)">{{ formatLabel }}</p>
    </div>

    <div :class="display === 'grid' ? 'flex flex-1 flex-col p-5' : 'min-w-0'">
      <p v-if="display === 'grid'" class="bw-label" style="color: var(--bw-muted)">
        {{ formatLabel }}<template v-if="topicLabels.length"> · {{ topicLabels[0] }}</template> · {{ day }}
      </p>
      <p v-else class="bw-label" style="color: var(--bw-muted)">{{ topicLabels.join(' · ') }}</p>

      <h3 :class="display === 'grid' ? 'mt-1.5 font-medium leading-snug' : 'text-lg font-medium leading-snug'">
        {{ view.title }}
      </h3>
      <p class="mt-1.5 text-sm leading-relaxed" :class="display === 'grid' ? 'flex-1' : ''" style="color: var(--bw-ink-soft)">
        {{ view.dek }}
      </p>

      <p class="bw-label mt-3 flex flex-wrap items-center gap-2" style="color: var(--bw-muted)">
        <span>{{ t('insights.article.byline') }}</span>
        <span>·</span>
        <span>{{ t('insights.list.readingMinutes', { count: post.readingMinutes }) }}</span>
        <!-- Der Zustand, den eine Liste ohne diesen Hinweis verschweigen
             würde: der Leser sieht eine andere Sprache, als er gewählt hat. -->
        <span v-if="view.fallback" class="inline-flex items-center gap-1" style="color: var(--bw-draft)">
          <UIcon name="i-ph-translate" class="size-3.5" />
          {{ t('insights.list.onlyBase', { language: baseLanguage }) }}
        </span>
        <UIcon
          v-if="display === 'list'" name="i-ph-arrow-right"
          class="size-3.5 opacity-0 transition-opacity group-hover:opacity-100"
        />
      </p>
    </div>
  </NuxtLink>
</template>
