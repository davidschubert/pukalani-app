<script setup lang="ts">
import type { InsightsBrandScore, InsightsDuelFact, InsightsLocale, InsightsSource } from '../../shared/insightsPost'

/**
 * PROTOTYP (I0) — DAS BRAND-DUELL ALS STATISTIK-TAFEL (§2.2; Vorlage: der
 * Klickdummy `.../demo/duell.vue`).
 *
 * ── DER SIEGER JE ZEILE STEHT IN DEN DATEN, NICHT IM RENDERING ──────────
 * Der Klickdummy verglich zwei Zahlen im Template (`d.a >= d.b`). Für die
 * DIMENSIONEN bleibt das richtig — sie kommen aus demselben Brand-Check und
 * sind vergleichbar. Für die FAKTEN nicht: „Agentur-Beziehung seit 1982" ist
 * gegen „wechselnd, zuletzt in-house" nicht rechenbar. `winner` ist deshalb
 * ein Feld der Zeile (§9.3) — eine redaktionelle Aussage, die jemand
 * verantwortet, mit `sourceIndex` als Beleg daneben.
 *
 * ── EINE FAKTENZEILE OHNE BELEG GIBT ES NICHT ───────────────────────────
 * §9.3: „`sourceIndex` zeigt in `sources` — eine Faktenzeile OHNE Beleg lässt
 * sich nicht speichern." Die Tafel ZEIGT die Beleg-Nummer; ohne sie wäre die
 * Pflicht erfüllt und unsichtbar, und die Zeile sähe aus wie eine Behauptung.
 */
/**
 * DIE ZWEI SEITEN — nur Name und Archetyp (BI1 I3).
 *
 * Der Kopf zeigt sonst nichts von der Marke, und ein volles Markenprofil je
 * Seite hereinzuverlangen hiesse, in jeder Duell-Antwort zwei Dossiers samt
 * Quellen mitzuschicken. Der ÖFFENTLICHE Verweis (`InsightsPublicDuelSide`)
 * erfüllt diesen Typ, das volle Profil des Prototyps ebenso.
 */
interface DuelSideView {
  name: string
  archetype: string
}

/**
 * DER SCORE IST OPTIONAL — dasselbe Muster wie `InBrandProfile` (dort steht
 * `score?: … | null` seit dem Prototyp), und aus einem beim Klick-Beweis
 * gefundenen Grund (2026-09-10):
 *
 * Die Prüfregeln vor `review` verlangen für ein Duell KEINEN Brand-Check
 * (`showsScore` fragt `brandRefs.some(ref => ref.checkId)`) — die Redaktion
 * kann also ein Duell zweier Marken freigeben, für die es noch keine geprüfte
 * Website gibt. Verlangte diese Komponente beide Scores, müsste die Leseroute
 * ein freigegebenes Duell mit 404 beantworten — während die Sitemap es
 * anbietet, die Journal-Karte darauf zeigt und die 301 der Gegenrichtung genau
 * dorthin führt. Ein Beitrag, den die Redaktion freigegeben hat, muss LESBAR
 * sein; die Statistik-Tafel ist ein ABSCHNITT davon, nicht seine Bedingung.
 * Fakten-Zeilen, Einordnung und Quellen stehen ohnehin für sich.
 */
const props = defineProps<{
  left: DuelSideView
  right: DuelSideView
  leftScore?: InsightsBrandScore | null
  rightScore?: InsightsBrandScore | null
  facts: readonly InsightsDuelFact[]
  sources: readonly InsightsSource[]
  locale: InsightsLocale
}>()

const { t } = useI18n()

/**
 * Die acht Dimensionen nebeneinander — dieselbe Reihenfolge auf beiden Seiten.
 * Fehlt EINER der beiden Scores, gibt es keinen Vergleich: eine Tafel, die
 * eine Seite gegen lauter Nullen stellt, wäre keine fehlende Angabe, sondern
 * eine falsche.
 */
const dimensions = computed(() => {
  const left = props.leftScore
  const right = props.rightScore
  if (!left || !right) return []
  return left.dimensions.map((dimension, index) => ({
    key: dimension.key,
    label: dimension.label,
    a: dimension.value,
    b: right.dimensions[index]?.value ?? 0,
  }))
})

const leftWins = computed(() => dimensions.value.filter(dimension => dimension.a > dimension.b).length)
const rightWins = computed(() => dimensions.value.filter(dimension => dimension.b > dimension.a).length)

function factLabel(fact: InsightsDuelFact): string {
  return props.locale === 'de' ? fact.labelDe : fact.labelEn
}
</script>

<template>
  <div>
    <!-- Aufstellung -->
    <div class="bw-card p-8 sm:p-10">
      <p class="bw-label text-center uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('insights.duel.eyebrow') }}</p>
      <div class="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div class="flex flex-col items-center gap-2 text-center">
          <slot name="ringLeft" :score="leftScore" />
          <p class="text-2xl font-extralight tracking-tight">{{ left.name }}</p>
          <p class="bw-label" style="color: var(--bw-muted)">{{ left.archetype }}</p>
        </div>
        <p class="bw-label px-2" style="color: var(--bw-muted)">{{ t('insights.duel.versus') }}</p>
        <div class="flex flex-col items-center gap-2 text-center">
          <slot name="ringRight" :score="rightScore" />
          <p class="text-2xl font-extralight tracking-tight">{{ right.name }}</p>
          <p class="bw-label" style="color: var(--bw-muted)">{{ right.archetype }}</p>
        </div>
      </div>
      <!-- Die Bilanz-Zeile zählt gewonnene Dimensionen — ohne beide Scores
           gibt es nichts zu zählen, und „0 zu 0" wäre eine Aussage. -->
      <p v-if="dimensions.length" class="bw-label mt-6 text-center" style="color: var(--bw-muted)">
        {{ t('insights.duel.standing', { left: left.name, leftCount: leftWins, right: right.name, rightCount: rightWins }) }}
      </p>
    </div>

    <!-- Dimension für Dimension, gespiegelte Balken, Sieger im Akzent. Der
         ganze Abschnitt entfällt ohne beide Scores (s. Kopf) — die Tafel ist
         ein Abschnitt des Beitrags, nicht seine Bedingung. -->
    <div v-if="dimensions.length" class="bw-card mt-4 p-8">
      <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.duel.dimensions') }}</p>
      <div class="mt-6 space-y-4">
        <div v-for="dimension in dimensions" :key="dimension.key">
          <p class="bw-label text-center" style="color: var(--bw-muted)">{{ dimension.label }}</p>
          <div class="mt-1.5 grid grid-cols-[2.5rem_1fr_1fr_2.5rem] items-center gap-3">
            <p class="bw-label" :style="`color: ${dimension.a >= dimension.b ? 'var(--bw-accent)' : 'var(--bw-muted)'}`">{{ dimension.a }}</p>
            <div class="flex justify-end">
              <div class="h-1.5 w-full overflow-hidden rounded-full" style="background: var(--bw-line)">
                <div class="ml-auto h-full rounded-full" :style="`width: ${dimension.a}%; background: ${dimension.a >= dimension.b ? 'var(--bw-accent)' : 'var(--bw-line-strong)'}`" />
              </div>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full" style="background: var(--bw-line)">
              <div class="h-full rounded-full" :style="`width: ${dimension.b}%; background: ${dimension.b >= dimension.a ? 'var(--bw-accent)' : 'var(--bw-line-strong)'}`" />
            </div>
            <p class="bw-label text-right" :style="`color: ${dimension.b >= dimension.a ? 'var(--bw-accent)' : 'var(--bw-muted)'}`">{{ dimension.b }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Zahlen & Fakten — je Zeile ein Sieger und ein Beleg. -->
    <div class="bw-card mt-4 p-8">
      <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.duel.facts') }}</p>
      <div class="mt-4 space-y-3">
        <div v-for="fact in facts" :key="fact.key" class="grid items-baseline gap-2 sm:grid-cols-[1fr_12rem_1fr]">
          <p
            class="text-sm sm:text-right"
            :style="`color: ${fact.winner === 'left' ? 'var(--bw-ink)' : 'var(--bw-ink-soft)'}; font-weight: ${fact.winner === 'left' ? 500 : 400}`"
          >{{ fact.left }}</p>
          <p class="bw-label text-center" style="color: var(--bw-muted)">
            {{ factLabel(fact) }}
            <span class="block" style="color: var(--bw-muted)">{{ t('insights.duel.factSource') }} {{ fact.sourceIndex + 1 }}</span>
          </p>
          <p
            class="text-sm"
            :style="`color: ${fact.winner === 'right' ? 'var(--bw-ink)' : 'var(--bw-ink-soft)'}; font-weight: ${fact.winner === 'right' ? 500 : 400}`"
          >{{ fact.right }}</p>
        </div>
      </div>
    </div>

    <!-- Einordnung: Kritik-/Meinungs-Stil, Wir-Stimme (Entscheidungen 4 + 7). -->
    <div class="bw-card mt-4 p-8">
      <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.duel.verdict') }}</p>
      <div class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
        <slot name="verdict" />
      </div>
    </div>

    <div class="mt-4">
      <div class="bw-card p-8">
        <InSourceList :sources="sources" :locale="locale" />
      </div>
    </div>

    <!-- Der eine Einstieg des Formats (Entscheidung 9): Duell ⇒ Vergleich. -->
    <div class="bw-card mt-4 flex flex-wrap items-center justify-between gap-4 p-8">
      <p class="text-sm" style="color: var(--bw-ink-soft)">{{ t('insights.duel.ctaTitle') }}</p>
      <slot name="cta">
        <UButton :label="t('insights.duel.ctaLabel')" icon="i-ph-arrows-left-right" class="rounded-full" />
      </slot>
    </div>

    <!-- Der Korrekturweg gehört auf JEDE Profil-, Duell- und Ranking-Seite
         (§9.5, §11.2 Frage 5) — dieselbe Karte, dieselbe Stelle wie im
         Markenprofil. Ein Duell behauptet über ZWEI fremde Marken etwas; der
         Weg zum Widerspruch darf dort nicht fehlen, nur weil die Seite ein
         anderes Format hat. -->
    <div class="bw-card mt-4 flex flex-wrap items-center justify-between gap-4 p-8">
      <p class="max-w-xl text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('insights.profile.correctionNote') }}</p>
      <slot name="correction">
        <UButton :label="t('insights.profile.correction')" color="neutral" variant="ghost" class="rounded-full" style="background: var(--bw-surface)" />
      </slot>
    </div>
  </div>
</template>
