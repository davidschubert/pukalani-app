<script setup lang="ts">
import type { InsightsRanking } from '../../shared/insightsPost'
import { insightsDay } from '../utils/insightsFormat'

/**
 * PROTOTYP (I0) — DAS EINGEFRORENE RANKING (§2.4, §11 Frage 7).
 *
 * ── DIE LÜCKE IST DER PUNKT ─────────────────────────────────────────────
 * Ein Entfernen-Wunsch nimmt den Platz heraus und rechnet die Liste NICHT
 * neu: Platz 4 bleibt Platz 4 und trägt „auf Wunsch entfernt". Eine stille
 * Neunummerierung wäre bequemer und unehrlich — sie behauptete eine Liste,
 * die es so nie gab. Deshalb ist `removed` ein Feld der Zeile und kein Filter
 * beim Rendern.
 *
 * ── EINGEFROREN HEISST: MIT STAND ───────────────────────────────────────
 * Ausgabe-Nummer und Stand-Datum stehen ÜBER der Liste, nicht im Kleingedruckten.
 * Eine Auffrischung ist eine neue Ausgabe mit neuem Slug; diese hier bleibt
 * stehen und verlinkt die neue.
 *
 * ── DIE METHODIK-ZEILE IST PFLICHT ──────────────────────────────────────
 * Entscheidung 7/11 und Prüfregel 5 (§9.4): jeder gezeigte Score verlinkt die
 * Methodik. Ein Ranking ohne diesen Link ist keine Frage des Geschmacks,
 * sondern ein blockierender Befund vor der Freigabe.
 */
defineProps<{
  ranking: InsightsRanking
  locale: string
  methodologyHref: string
  /** Name je Marken-Id — die Zeile trägt Ids, der Leser will Namen. */
  resolveBrandName: (brandId: string) => string
  resolveBrandHref: (brandId: string) => string
}>()

const { t } = useI18n()
</script>

<template>
  <div>
    <div class="flex flex-wrap items-baseline justify-between gap-3 border-b pb-3" style="border-color: var(--bw-line-strong)">
      <div>
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('insights.ranking.eyebrow') }}</p>
        <p class="bw-label mt-1" style="color: var(--bw-muted)">
          {{ t('insights.ranking.issue', { number: ranking.issue }) }} · {{ t('insights.ranking.asOf', { date: insightsDay(ranking.asOf, locale) }) }}
        </p>
      </div>
      <NuxtLink :to="methodologyHref" class="bw-label underline decoration-dotted underline-offset-2" style="color: var(--bw-muted)">
        {{ t('insights.profile.methodology') }}
      </NuxtLink>
    </div>
    <p class="bw-pending mt-2">{{ t('insights.ranking.frozen') }}</p>

    <ol class="mt-6">
      <li
        v-for="entry in ranking.entries" :key="entry.rank"
        class="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-4 border-b py-4"
        style="border-color: var(--bw-line)"
      >
        <p class="bw-label" style="color: var(--bw-muted)">{{ String(entry.rank).padStart(2, '0') }}</p>

        <!-- Die Lücke: sie bleibt sichtbar und erklärt sich (§11 Frage 7). -->
        <div v-if="entry.removed" class="min-w-0">
          <p class="text-sm font-medium" style="color: var(--bw-muted)">{{ t('insights.ranking.removed') }}</p>
          <p class="bw-label mt-0.5" style="color: var(--bw-muted)">{{ t('insights.ranking.removedNote') }}</p>
        </div>

        <div v-else class="min-w-0">
          <!-- Ein Platz OHNE Adresse bleibt ein Name (BI1 I3): die Marke steht
               nicht öffentlich, oder das Markenprofil ist noch gesperrt. Ein
               `NuxtLink` auf '' zeigte auf die aktuelle Seite — ein Link, der
               nirgendwohin führt, ist schlimmer als gar keiner. -->
          <NuxtLink
            v-if="resolveBrandHref(entry.brandId)"
            :to="resolveBrandHref(entry.brandId)" class="truncate font-medium hover:underline"
          >
            {{ resolveBrandName(entry.brandId) }}
          </NuxtLink>
          <p v-else class="truncate font-medium">{{ resolveBrandName(entry.brandId) }}</p>
          <p class="mt-0.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ locale === 'de' ? entry.reasonDe : entry.reasonEn }}
          </p>
        </div>

        <div class="flex-none">
          <slot v-if="!entry.removed" name="ring" :entry="entry" />
        </div>
      </li>
    </ol>

    <!-- Der eine Einstieg des Formats (Entscheidung 9): Ranking ⇒ Brand-Check. -->
    <div class="bw-card mt-8 flex flex-wrap items-center justify-between gap-4 p-8">
      <p class="text-sm" style="color: var(--bw-ink-soft)">{{ t('insights.ranking.ctaTitle') }}</p>
      <slot name="cta">
        <UButton :label="t('insights.ranking.ctaLabel')" icon="i-ph-gauge" class="rounded-full" />
      </slot>
    </div>

    <!-- Der Korrekturweg (§9.5, §11.2 Frage 5) — dieselbe Karte wie im
         Markenprofil und im Duell. Ein Ranking ordnet zehn fremde Marken; der
         Entfernen-Wunsch aus Entscheidung 11 beginnt genau hier. -->
    <div class="bw-card mt-4 flex flex-wrap items-center justify-between gap-4 p-8">
      <p class="max-w-xl text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('insights.profile.correctionNote') }}</p>
      <slot name="correction">
        <UButton :label="t('insights.profile.correction')" color="neutral" variant="ghost" class="rounded-full" style="background: var(--bw-surface)" />
      </slot>
    </div>
  </div>
</template>
