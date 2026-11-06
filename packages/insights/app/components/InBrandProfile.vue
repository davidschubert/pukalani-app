<script setup lang="ts">
import type { InsightsBrandScore } from '../../shared/insightsPost'
import type { InsightsBrandProfileView } from '../../shared/insightsPublic'
import { insightsHost } from '../utils/insightsFormat'

/**
 * PROTOTYP (I0) — DIE ENTITY-SEITE EINER FREMDEN MARKE (§2.1, §9.3
 * `insights_brands`; Vorlage: der Klickdummy `.../demo/profil.vue`).
 *
 * ── DIE WORTMARKE IST TEXT, DAS BILD IST UNSERES ────────────────────────
 * Entscheidung 10: nur eigene Grafiken und Farbwelt-Kacheln, „keine fremden
 * Logos, keine Screenshots fremder Websites — auch nicht als Favicon oder
 * Thumbnail". Der Hero ist deshalb ein Verlauf aus der Farbwelt, und der Name
 * steht als SCHRIFT darin. Das ist nicht Notbehelf, sondern die einzige Form,
 * die ohne fremdes Material auskommt.
 *
 * ── EINE ZAHL, EINE METHODIK (Entscheidung 7) ───────────────────────────
 * Der Score ist der BESTEHENDE Brand-Check-Score, nicht ein zweiter. Er kommt
 * als Prop herein (der Vertrag zum brand-Layer zieht ihn ab I1 aus
 * `brand_checks`), und neben ihm steht IMMER der Link auf die Methodik. Ein
 * Score ohne Methodik-Link ist eine der sechs Prüfregeln vor `review` (§9.4
 * Nr. 5) — die Oberfläche hält sich an dieselbe Regel wie der Server.
 *
 * ── DER SCORE-RING KOMMT ALS SLOT ───────────────────────────────────────
 * `BwScoreRing` gehört dem brand-Layer (CONCEPT A14) — dasselbe Muster wie
 * `MkBrandScore` im market-Layer. Kein Auto-Import über die Layer-Grenze.
 *
 * ── „ENTFERNT" IST EIN ZUSTAND MIT WORT ─────────────────────────────────
 * Entscheidung 11: „Entfernen auf Wunsch ist der Notausgang und wird ohne
 * Diskussion gewährt — dokumentiert mit Datum und Grund." Eine entfernte
 * Marke verschwindet nicht spurlos; ihre Seite sagt, dass sie auf Wunsch weg
 * ist. Ein 404 sähe aus wie ein Fehler und lüde zum Nachfragen ein.
 */
defineProps<{
  /**
   * Das ÖFFENTLICHE Markenprofil (BI1 I3): ohne `claimedBy`, `checkId` und
   * `publicationId` — drei Fremdschlüssel und ein Stempel über einen Vorgang
   * zwischen uns und einem Dritten. Die Zeilen-Id fehlt bewusst ebenfalls; sie
   * gehört der Seite (Korrekturziel), nicht der Darstellung.
   */
  brand: InsightsBrandProfileView
  score?: InsightsBrandScore | null
  locale: string
  /** Die Farbwelt-Kachel; aufgelöst von der Seite (brand-Layer). */
  gradient?: readonly [string, string]
  /** Adresse der Methodik-Seite — im Produkt `/brand-check/methodik`. */
  methodologyHref: string
}>()

const { t } = useI18n()

const MARK_KEY: Record<string, string> = {
  symbol: 'insights.profile.markSymbol',
  claim: 'insights.profile.markClaim',
  type: 'insights.profile.markType',
  color: 'insights.profile.markColor',
}

function tone(value: number): string {
  return value >= 90 ? 'var(--bw-accent)' : value >= 50 ? 'var(--bw-draft)' : 'var(--bw-stale)'
}
</script>

<template>
  <div>
    <!-- Entfernt auf Wunsch: die Seite bleibt, der Inhalt geht. -->
    <div v-if="brand.state === 'removed'" class="bw-card p-10 text-center">
      <UIcon name="i-ph-eye-slash" class="size-8" style="color: var(--bw-muted)" />
      <p class="mt-4 text-xl font-medium">{{ t('insights.profile.removedTitle') }}</p>
      <p class="mx-auto mt-2 max-w-md text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('insights.profile.removedNote') }}</p>
      <p class="bw-label mt-4" style="color: var(--bw-muted)">{{ brand.removedAt }} · {{ brand.removalReason }}</p>
    </div>

    <template v-else>
      <!-- Hero: Farbwelt statt fremdem Logo, Wortmarke als Schrift. -->
      <div
        class="bw-grain-hero p-10"
        :style="`--hero-a: ${gradient?.[0] ?? '#d8d8d6'}; --hero-b: ${gradient?.[1] ?? '#5a5a58'}; --hero-c: #151515`"
      >
        <div class="flex flex-wrap items-start justify-between gap-6">
          <div class="min-w-0">
            <p class="bw-label uppercase tracking-widest" style="color: rgb(247 242 234 / 0.7)">{{ t('insights.profile.eyebrow') }}</p>
            <p class="mt-3 text-3xl font-extralight leading-snug tracking-tight">{{ brand.name }}</p>
            <p class="bw-label mt-5" style="color: rgb(247 242 234 / 0.6)">
              {{ brand.industry }}
              <template v-if="brand.country"> · {{ brand.country }}</template>
              <template v-if="brand.foundedYear"> · {{ t('insights.profile.founded') }} {{ brand.foundedYear }}</template>
              <template v-if="brand.archetype"> · {{ brand.archetype }}</template>
            </p>
          </div>
          <div
            v-if="score"
            class="bw-on-dark flex flex-none flex-col items-center gap-1 rounded-2xl px-4 py-3"
            style="background: rgb(20 20 20 / 0.35)"
          >
            <!-- Der Ring gehört dem brand-Layer und wird hereingereicht. -->
            <slot name="ring" :score="score" />
            <p class="bw-label" style="color: rgb(247 242 234 / 0.7)">{{ score.band }}</p>
          </div>
        </div>
      </div>

      <div class="mt-6 grid gap-4 lg:grid-cols-[3fr_2fr]">
        <!-- Score im Detail: die acht Kategorien des Brand-Checks. -->
        <div v-if="score" class="bw-card p-8">
          <div class="flex flex-wrap items-baseline justify-between gap-3">
            <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.profile.dimensions') }}</p>
            <NuxtLink :to="methodologyHref" class="bw-label underline decoration-dotted underline-offset-2" style="color: var(--bw-muted)">
              {{ t('insights.profile.methodology') }}
            </NuxtLink>
          </div>
          <div class="mt-5 space-y-3">
            <div v-for="dimension in score.dimensions" :key="dimension.key" class="grid grid-cols-[10rem_1fr_2.5rem] items-center gap-3">
              <p class="bw-label truncate" style="color: var(--bw-muted)">{{ dimension.label }}</p>
              <div class="h-1.5 overflow-hidden rounded-full" style="background: var(--bw-line)">
                <div class="h-full rounded-full" :style="`width: ${dimension.value}%; background: ${tone(dimension.value)}`" />
              </div>
              <p class="bw-label text-right" :style="`color: ${tone(dimension.value)}`">{{ dimension.value }}</p>
            </div>
          </div>
          <p class="bw-pending mt-4">{{ t('insights.profile.methodologyNote') }}</p>
          <!-- Die Zweitzeile der eigenen Kunden-Profile fehlt hier mit Grund. -->
          <p class="bw-pending mt-1">{{ t('insights.profile.noSecondScore') }}</p>
        </div>

        <div class="space-y-4">
          <div class="bw-card p-8">
            <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.profile.facts') }}</p>
            <ul class="mt-3 space-y-2 text-sm" style="color: var(--bw-ink-soft)">
              <li v-if="brand.industry">{{ t('insights.profile.industry') }}: {{ brand.industry }}</li>
              <li v-if="brand.country">{{ t('insights.profile.country') }}: {{ brand.country }}</li>
              <li v-if="brand.archetype">
                {{ t('insights.profile.archetype') }}: {{ brand.archetype }}
                <template v-if="brand.archetypeSecondary"> · {{ brand.archetypeSecondary }}</template>
              </li>
              <li v-if="brand.homepage">
                <a :href="brand.homepage" rel="nofollow noopener" target="_blank" class="underline decoration-dotted underline-offset-2">
                  {{ insightsHost(brand.homepage) }}
                </a>
              </li>
            </ul>
          </div>

          <div v-if="brand.relations.length" class="bw-card p-8">
            <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.profile.relations') }}</p>
            <div class="mt-4 space-y-3">
              <slot name="relations" />
            </div>
          </div>
        </div>
      </div>

      <!-- Eigenständige Markenzeichen — je Satz ein Beleg (§2.1). -->
      <div v-if="brand.marks.length" class="bw-card mt-4 p-8">
        <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.profile.marks') }}</p>
        <div class="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <div v-for="(mark, index) in brand.marks" :key="index">
            <p class="bw-label" style="color: var(--bw-muted)">{{ t(MARK_KEY[mark.kind] ?? 'insights.profile.markSymbol') }}</p>
            <p class="mt-1 text-sm" style="color: var(--bw-ink-soft)">{{ mark.text }}</p>
            <p class="bw-label mt-1" style="color: var(--bw-muted)">{{ t('insights.profile.evidence', { number: mark.sourceIndex + 1 }) }}</p>
          </div>
        </div>
      </div>

      <!-- Historie — Jahr, ein Satz, ein Beleg. -->
      <div v-if="brand.history.length" class="bw-card mt-4 p-8">
        <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.profile.history') }}</p>
        <ul class="mt-4 space-y-3">
          <li v-for="(entry, index) in brand.history" :key="index" class="grid grid-cols-[3.5rem_1fr] gap-3">
            <p class="bw-label" style="color: var(--bw-muted)">{{ entry.year }}</p>
            <p class="text-sm" style="color: var(--bw-ink-soft)">
              {{ entry.text }}
              <span class="bw-label" style="color: var(--bw-muted)"> {{ t('insights.profile.evidence', { number: entry.sourceIndex + 1 }) }}</span>
            </p>
          </li>
        </ul>
      </div>

      <div class="mt-4">
        <div class="bw-card p-8">
          <InSourceList :sources="brand.sources" :locale="locale" />
        </div>
      </div>

      <!-- Der Korrekturweg gehört auf JEDE Profil-, Duell- und Ranking-Seite
           (§9.5) — er ist die Zusage aus Entscheidung 11 und muss sichtbar
           sein, nicht auffindbar. -->
      <div class="bw-card mt-4 flex flex-wrap items-center justify-between gap-4 p-8">
        <p class="max-w-xl text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('insights.profile.correctionNote') }}</p>
        <slot name="correction">
          <UButton :label="t('insights.profile.correction')" color="neutral" variant="ghost" class="rounded-full" style="background: var(--bw-surface)" />
        </slot>
      </div>
    </template>
  </div>
</template>
