<script setup lang="ts">
import { BRAND_CHECK_CATEGORIES } from '../../shared/brandCheck'
import type { BrandCheckInsight } from '../../shared/brandCheckCompare'
import type { BrandCheckResult } from '../../shared/types/brand'

/**
 * DIE ERKENNTNISSE ZUM VERGLEICH — das Bento unter den acht Duell-Zeilen
 * (Davids Auftrag 2026-09-06, Paket P6b; Plan docs/archiv/BRAND-CHECK-SEITE.md
 * §4 und §10).
 *
 * ── DIESE KOMPONENTE ENTSCHEIDET NICHTS ───────────────────────────────────
 * Was gesagt wird und in welcher Reihenfolge, steht in
 * `compareBrandCheckInsights()` (pur, getestet). Hier steht nur, wie eine
 * Erkenntnis AUSSIEHT. Deshalb nimmt sie die fertige Liste als Prop entgegen
 * und sortiert, filtert und rechnet selbst nichts nach — sonst gäbe es die
 * Rangfolge zweimal, und die zweite wäre die ungetestete.
 *
 * ── KARTEN OHNE INHALT GIBT ES NICHT ──────────────────────────────────────
 * Die pure Regel liefert eine Erkenntnis gar nicht erst, wenn sie leer wäre
 * (kein Gleichstand ⇒ keine Gleichstands-Kachel). Das Template braucht darum
 * kein `v-if` je Kachel: es rendert, was da ist.
 *
 * ── A UND B TRAGEN IHRE FARBE ÜBERALL MIT ─────────────────────────────────
 * `--bw-accent` ist Seite A, `--bw-pop` ist Seite B — dieselbe Zuordnung wie
 * im Kopf, im Markenabdruck und in den Balken. Wer die hier ändert, macht die
 * ganze Seite unlesbar.
 */
const props = defineProps<{
  a: BrandCheckResult
  b: BrandCheckResult
  insights: BrandCheckInsight[]
}>()

const { t, te } = useI18n()

/** Wie viele Kategorien es überhaupt gibt — der Nenner der Bilanz. */
const TOTAL = BRAND_CHECK_CATEGORIES.length

/**
 * Das Bento-Raster: `UPageGrid` gibt 1 · 2 · 3 Spalten vor, die Spannweite
 * hängt am INHALT. Breit sind genau zwei Kacheln — das Gesamtbild und der
 * GRÖSSTE Abstand. Alles andere bleibt schmal, damit keine Lücke entsteht:
 * eine breite Kachel, die in die Restspalte nicht mehr passt, rutscht in die
 * nächste Zeile und lässt ein Loch stehen.
 */
const SPAN: Record<BrandCheckInsight['kind'], string> = {
  overall: 'sm:col-span-2',
  wins: 'sm:col-span-2 lg:col-span-1',
  gap: 'sm:col-span-2 lg:col-span-1',
  ties: 'sm:col-span-2 lg:col-span-1',
  strengths: 'sm:col-span-2 lg:col-span-1',
  notAssessable: 'sm:col-span-2 lg:col-span-1',
}

interface InsightCard {
  key: string
  insight: BrandCheckInsight
  span: string
  /** Der ERSTE Abstand heisst „grösster Abstand" — die weiteren nur „gross". */
  top: boolean
}

const cards = computed<InsightCard[]>(() => {
  let gaps = 0
  return props.insights.map((insight, index) => {
    let top = false
    if (insight.kind === 'gap') {
      top = gaps === 0
      gaps += 1
    }
    return {
      key: insight.kind === 'gap' ? `gap-${insight.category}` : `${insight.kind}-${index}`,
      insight,
      span: top ? 'sm:col-span-2' : SPAN[insight.kind],
      top,
    }
  })
})

// ── Wörter ────────────────────────────────────────────────────────────────

function categoryLabel(key: string): string {
  const messageKey = `brand.check.categories.${key}`
  return te(messageKey) ? t(messageKey) : key
}

function criterionTitle(id: string): string {
  const messageKey = `brand.check.criteria.${id}.title`
  return te(messageKey) ? t(messageKey) : t('brand.check.result.criterionFallback')
}

function hostOf(side: 'a' | 'b'): string {
  return side === 'a' ? props.a.host : props.b.host
}

function otherSide(side: 'a' | 'b'): 'a' | 'b' {
  return side === 'a' ? 'b' : 'a'
}

/** „7 Punkte Unterschied" — eine Wendung, damit sie in jedem Satz gleich klingt. */
function gapPhrase(delta: number): string {
  return t('brand.checkCompare.insights.pointsGap', { count: delta }, delta)
}

/** Die Note eines Kriteriums als Text („2 von 2"). */
function points(score: number): string {
  return t('brand.check.result.criterionPoints', { score })
}

// ── Farben ────────────────────────────────────────────────────────────────

function sideTone(side: 'a' | 'b'): string {
  return side === 'a' ? 'var(--bw-accent)' : 'var(--bw-pop)'
}

/** Ampel je Note: 0 rot · 1 bernstein · 2 grün (Plan §10, dieselbe Skala wie die Matrix). */
function scoreTone(score: number): string {
  if (score >= 2) return 'var(--bw-accent)'
  if (score >= 1) return 'var(--bw-draft)'
  return 'var(--bw-stale)'
}
</script>

<template>
  <section class="mt-10" data-compare-insights>
    <!--
      Die Überschrift steht BEWUSST ausserhalb einer Karte: die Kacheln sind
      selbst Karten, und eine Karte in einer Karte gibt dem Bento zwei Ränder
      und zwei Radien (im Brand-Look 44 px in 44 px — sichtbar zu viel).
    -->
    <div class="px-2 sm:px-4">
      <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
        {{ t('brand.checkCompare.insights.eyebrow') }}
      </p>
      <h2 class="mt-3 text-2xl font-extralight tracking-tight sm:text-3xl">
        {{ t('brand.checkCompare.insights.title') }}
      </h2>
      <p class="bw-label mt-2 max-w-2xl leading-relaxed" style="color: var(--bw-muted)">
        {{ t('brand.checkCompare.insights.lead') }}
      </p>
    </div>

    <UPageGrid class="mt-8">
      <UPageCard
        v-for="card in cards" :key="card.key"
        variant="ghost"
        :class="card.span"
        :ui="{
          root: 'bw-card',
          // `lg:flex` hebt das `lg:grid` der Vorlage auf: als Raster verteilt
          // die Karte ihre Höhe auf die Zeilen, und in einer Zeile gleich
          // hoher Kacheln reisst das den Text auseinander.
          container: 'p-6 sm:p-7 lg:flex',
          // Ohne `flex-none` wächst die Überschrift-Hülle (`flex-1`) und
          // schiebt den Text in einer hohen Kachel nach unten weg.
          wrapper: 'flex-none',
          title: 'text-base font-medium tracking-tight',
        }"
        :data-compare-insight="card.insight.kind"
      >
        <template #title>
          <template v-if="card.insight.kind === 'gap'">
            {{ card.top
              ? t('brand.checkCompare.insights.gap.titleTop', { category: categoryLabel(card.insight.category) })
              : t('brand.checkCompare.insights.gap.title', { category: categoryLabel(card.insight.category) }) }}
          </template>
          <template v-else>
            {{ t(`brand.checkCompare.insights.${card.insight.kind}.title`) }}
          </template>
        </template>

        <!-- 1 · Das Gesamtbild -->
        <template v-if="card.insight.kind === 'overall'">
          <p class="text-pretty text-lg font-extralight leading-snug tracking-tight sm:text-xl" data-compare-insight-overall>
            <template v-if="card.insight.leader === 'tie'">
              {{ t('brand.checkCompare.insights.overall.tie') }}
            </template>
            <template v-else>
              {{ t(`brand.checkCompare.insights.overall.${card.insight.closeness}`, {
                leader: hostOf(card.insight.leader),
                other: hostOf(otherSide(card.insight.leader)),
                gap: gapPhrase(card.insight.delta),
              }) }}
            </template>
          </p>
          <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div v-for="side in (['a', 'b'] as const)" :key="`overall-${side}`" class="flex items-center gap-2">
              <span class="size-2.5 flex-none rounded-full" :style="`background: ${sideTone(side)}`" />
              <span class="truncate text-sm" style="color: var(--bw-ink-soft)">{{ hostOf(side) }}</span>
              <span class="bw-num text-lg">{{ card.insight[side] }}</span>
            </div>
          </div>
          <p class="bw-label leading-relaxed" style="color: var(--bw-muted)">
            {{ t('brand.checkCompare.insights.overall.note') }}
          </p>
        </template>

        <!-- 2 · Die Kategorie-Bilanz -->
        <template v-else-if="card.insight.kind === 'wins'">
          <!-- Untereinander, nicht nebeneinander: die Kachel ist schmal, und
               ein abgeschnittener Hostname ist keine Bilanz. -->
          <div class="space-y-5">
            <div v-for="side in (['a', 'b'] as const)" :key="`wins-${side}`">
              <div class="flex items-center gap-2">
                <span class="size-2.5 flex-none rounded-full" :style="`background: ${sideTone(side)}`" />
                <span class="min-w-0 truncate text-sm font-medium tracking-tight">{{ hostOf(side) }}</span>
              </div>
              <p class="bw-label mt-1" style="color: var(--bw-muted)">
                {{ t('brand.checkCompare.insights.wins.count', {
                  count: card.insight[side].length, total: TOTAL,
                }, card.insight[side].length) }}
              </p>
              <ul v-if="card.insight[side].length" class="mt-2.5 flex flex-wrap gap-1.5">
                <li
                  v-for="id in card.insight[side]" :key="`${side}-${id}`"
                  class="bw-label rounded-full px-2.5 py-0.5"
                  :style="`background: ${side === 'a' ? 'var(--bw-accent-soft)' : 'var(--bw-pop)'}; color: ${side === 'a' ? 'var(--bw-ink)' : 'var(--bw-pop-ink)'}`"
                >{{ categoryLabel(id) }}</li>
              </ul>
            </div>
          </div>
          <div v-if="card.insight.tie.length">
            <p class="bw-label" style="color: var(--bw-muted)">
              {{ t('brand.checkCompare.insights.wins.tieLabel') }}
            </p>
            <ul class="mt-2 flex flex-wrap gap-1.5">
              <li
                v-for="id in card.insight.tie" :key="`tie-${id}`"
                class="bw-label rounded-full px-2.5 py-0.5"
                style="background: var(--bw-surface-hi); color: var(--bw-ink-soft)"
              >{{ categoryLabel(id) }}</li>
            </ul>
          </div>
        </template>

        <!-- 3 · Ein extremer Abstand, samt Beleg -->
        <template v-else-if="card.insight.kind === 'gap'">
          <p class="text-pretty text-base leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t('brand.checkCompare.insights.gap.line', {
              leader: hostOf(card.insight.leader),
              leaderValue: card.insight[card.insight.leader],
              other: hostOf(otherSide(card.insight.leader)),
              otherValue: card.insight[otherSide(card.insight.leader)],
              gap: gapPhrase(card.insight.delta),
            }) }}
          </p>

          <div>
            <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
              {{ t('brand.checkCompare.insights.gap.why') }}
            </p>

            <p v-if="!card.insight.reasons.length" class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
              {{ t('brand.checkCompare.insights.gap.noReasons') }}
            </p>

            <ul v-else class="mt-3 space-y-3">
              <li
                v-for="reason in card.insight.reasons" :key="reason.criterionId"
                class="bw-frame p-4" style="background: var(--bw-surface-hi)"
                :data-compare-insight-reason="reason.criterionId"
              >
                <p class="text-sm font-medium tracking-tight">{{ criterionTitle(reason.criterionId) }}</p>
                <div class="mt-3 space-y-3">
                  <div v-for="side in (['a', 'b'] as const)" :key="`${reason.criterionId}-${side}`">
                    <div class="flex items-center gap-2">
                      <span class="size-2 flex-none rounded-full" :style="`background: ${scoreTone(reason[side])}`" />
                      <span class="bw-label min-w-0 truncate" style="color: var(--bw-ink-soft)">{{ hostOf(side) }}</span>
                      <span class="bw-label" style="color: var(--bw-muted)">{{ points(reason[side]) }}</span>
                    </div>
                    <p
                      class="bw-label mt-1.5 leading-relaxed"
                      :style="`color: var(--bw-muted); border-inline-start: 2px solid ${sideTone(side)}; padding-inline-start: 0.6rem`"
                    >
                      {{ (side === 'a' ? reason.evidenceA : reason.evidenceB)
                        || t('brand.checkCompare.insights.gap.noEvidence') }}
                    </p>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </template>

        <!-- 4 · Die Gleichstände -->
        <template v-else-if="card.insight.kind === 'ties'">
          <p class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t('brand.checkCompare.insights.ties.lead') }}
          </p>
          <ul class="space-y-2">
            <li
              v-for="entry in card.insight.categories" :key="entry.id"
              class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
            >
              <span class="text-sm tracking-tight">{{ categoryLabel(entry.id) }}</span>
              <span class="bw-label" style="color: var(--bw-muted)">
                {{ t('brand.checkCompare.insights.ties.value', { value: entry.value }) }}
              </span>
            </li>
          </ul>
        </template>

        <!-- 5 · Stärkste und schwächste Kategorie je Seite -->
        <template v-else-if="card.insight.kind === 'strengths'">
          <p class="bw-label leading-relaxed" style="color: var(--bw-muted)">
            {{ t('brand.checkCompare.insights.strengths.lead') }}
          </p>
          <div class="space-y-4">
            <div v-for="side in (['a', 'b'] as const)" :key="`strength-${side}`">
              <div class="flex items-center gap-2">
                <span class="size-2.5 flex-none rounded-full" :style="`background: ${sideTone(side)}`" />
                <span class="min-w-0 truncate text-sm font-medium tracking-tight">{{ hostOf(side) }}</span>
              </div>
              <dl v-if="card.insight[side].best" class="mt-2 space-y-1">
                <div class="flex flex-wrap items-baseline justify-between gap-x-4">
                  <dt class="bw-label" style="color: var(--bw-muted)">{{ t('brand.checkCompare.insights.strengths.best') }}</dt>
                  <dd class="text-sm tracking-tight">
                    {{ categoryLabel(card.insight[side].best!.id) }} · {{ card.insight[side].best!.value }}
                  </dd>
                </div>
                <div class="flex flex-wrap items-baseline justify-between gap-x-4">
                  <dt class="bw-label" style="color: var(--bw-muted)">{{ t('brand.checkCompare.insights.strengths.worst') }}</dt>
                  <dd class="text-sm tracking-tight">
                    {{ categoryLabel(card.insight[side].worst!.id) }} · {{ card.insight[side].worst!.value }}
                  </dd>
                </div>
              </dl>
              <p v-else class="bw-label mt-2" style="color: var(--bw-muted)">
                {{ t('brand.checkCompare.insights.strengths.none') }}
              </p>
            </div>
          </div>
        </template>

        <!-- 6 · Was wir nicht ansehen konnten -->
        <template v-else>
          <p class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t('brand.checkCompare.insights.notAssessable.lead') }}
          </p>
          <ul class="space-y-2">
            <li v-for="side in (['a', 'b'] as const)" :key="`na-${side}`" class="flex items-start gap-2">
              <span class="mt-1.5 size-2 flex-none rounded-full" :style="`background: ${sideTone(side)}`" />
              <span class="bw-label leading-relaxed" style="color: var(--bw-ink-soft)">
                {{ t('brand.checkCompare.insights.notAssessable.line', {
                  host: hostOf(side),
                  categories: t(
                    'brand.checkCompare.insights.notAssessable.categories',
                    { count: side === 'a' ? card.insight.categoriesA : card.insight.categoriesB },
                    side === 'a' ? card.insight.categoriesA : card.insight.categoriesB,
                  ),
                  criteria: t(
                    'brand.checkCompare.insights.notAssessable.criteria',
                    { count: side === 'a' ? card.insight.criteriaA : card.insight.criteriaB },
                    side === 'a' ? card.insight.criteriaA : card.insight.criteriaB,
                  ),
                }) }}
              </span>
            </li>
          </ul>
        </template>
      </UPageCard>
    </UPageGrid>
  </section>
</template>
