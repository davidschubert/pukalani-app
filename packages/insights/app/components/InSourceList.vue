<script setup lang="ts">
import type { InsightsSource, InsightsSourceKind } from '../../shared/insightsPost'
import { INSIGHTS_QUOTE_MAX, insightsSourceIsThirdParty } from '../../shared/insightsPost'
import { insightsDay, insightsHost } from '../utils/insightsFormat'

/**
 * PROTOTYP (I0) — DIE QUELLENLISTE (§4.1, §9.3).
 *
 * ── DIE ERSTE FRAGE IST NICHT „WOHER?", SONDERN „WER SAGT DAS?" ──────────
 * Leitplanke (a) zu Entscheidung 6 verlangt, dass eine Fremdquelle als solche
 * gekennzeichnet ist — „nie als Eigenaussage der Marke". Deshalb steht vor
 * jeder Zeile ein Wort und nicht nur ein Icon: „Eigenaussage" oder
 * „Fremdquelle · Presse". Ein Favicon oder ein Logo stünde hier NICHT
 * (Entscheidung 10: keine fremden Logos, auch nicht als Thumbnail).
 *
 * ── DAS ZITAT IST DER BELEG, NICHT DER INHALT ───────────────────────────
 * Höchstens 200 Zeichen (§ 51 UrhG, §4.1 b). Der Deckel steht im Schema, in
 * der Prüfregel vor `review` UND als Satz über der Liste — wer ihn hier
 * liest, versteht, warum die Zitate kurz sind.
 *
 * ── WIKIPEDIA OHNE LIZENZ-LINK GIBT ES NICHT ────────────────────────────
 * CC-BY-SA verlangt Namensnennung (§4.1 c). Das Schema erzwingt sie; diese
 * Liste ZEIGT sie, sonst wäre die Pflicht erfüllt und unsichtbar.
 */
defineProps<{
  sources: readonly InsightsSource[]
  locale: string
  /** Öffnet die Quelle; im Prototyp zeigen die Adressen ins Erfundene. */
  resolveHref?: (source: InsightsSource) => string
  /** Nummerierung: die Belege der Faktenzeilen zeigen auf diese Zahlen. */
  numbered?: boolean
}>()

const { t } = useI18n()

const KIND_KEY: Record<InsightsSourceKind, string> = {
  'brand-site': 'insights.sources.kindBrandSite',
  'press': 'insights.sources.kindPress',
  'wikipedia': 'insights.sources.kindWikipedia',
  'youtube': 'insights.sources.kindYoutube',
  'own-data': 'insights.sources.kindOwnData',
}
</script>

<template>
  <section>
    <div class="flex flex-wrap items-baseline justify-between gap-3 border-b pb-3" style="border-color: var(--bw-line-strong)">
      <h2 class="text-lg font-medium">{{ t('insights.sources.title') }}</h2>
      <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.sources.lead', { max: INSIGHTS_QUOTE_MAX }) }}</p>
    </div>

    <p v-if="sources.length === 0" class="bw-pending mt-4">{{ t('insights.sources.empty') }}</p>

    <ol v-else class="mt-4 space-y-4">
      <li v-for="(source, index) in sources" :key="`${source.url}-${index}`" class="grid gap-x-4 sm:grid-cols-[2.5rem_minmax(0,1fr)]">
        <p v-if="numbered !== false" class="bw-label" style="color: var(--bw-muted)">{{ index + 1 }}</p>
        <div class="min-w-0">
          <p class="bw-label flex flex-wrap items-center gap-2">
            <!-- Das Wort zuerst: Eigenaussage oder Fremdquelle (§4.1 a). -->
            <span
              class="rounded-full px-2 py-0.5"
              :style="insightsSourceIsThirdParty(source.kind)
                ? 'background: var(--bw-draft-soft); color: var(--bw-draft)'
                : 'background: var(--bw-surface); color: var(--bw-muted)'"
            >{{ insightsSourceIsThirdParty(source.kind) ? t('insights.sources.third') : t('insights.sources.own') }}</span>
            <span style="color: var(--bw-muted)">{{ t(KIND_KEY[source.kind]) }}</span>
            <span v-if="source.publisher" style="color: var(--bw-ink-soft)">{{ source.publisher }}</span>
            <span v-if="source.date" style="color: var(--bw-muted)">{{ t('insights.sources.checkedOn', { date: insightsDay(source.date, locale) }) }}</span>
          </p>

          <blockquote
            v-if="source.quote"
            class="mt-2 border-l-2 py-0.5 pl-4 text-sm leading-relaxed"
            style="border-color: var(--bw-line-strong); color: var(--bw-ink-soft)"
          >{{ source.quote }}</blockquote>

          <p class="bw-label mt-2 flex flex-wrap items-center gap-3">
            <a
              :href="resolveHref ? resolveHref(source) : source.url"
              class="inline-flex items-center gap-1.5 underline decoration-dotted underline-offset-2"
              style="color: var(--bw-muted)"
              rel="nofollow noopener" target="_blank"
            >
              <UIcon name="i-ph-arrow-up-right" class="size-3.5" />
              {{ insightsHost(source.url) }}
            </a>
            <a
              v-if="source.license"
              :href="source.license" class="underline decoration-dotted underline-offset-2"
              style="color: var(--bw-muted)" rel="nofollow noopener" target="_blank"
            >{{ t('insights.sources.license') }}</a>
          </p>
        </div>
      </li>
    </ol>
  </section>
</template>
