<script setup lang="ts">
import {
  MARKET_COMPETITORS_MAX,
  type MarketCandidateSource,
  type MarketCompetitor,
  type MarketCompetitorStatus,
  type MarketSourceOption,
} from '../../shared/marketProfile'

/**
 * PROTOTYP (M0) — Komponenten-Vorlage für M1–M4.
 *
 * DIE KANDIDATEN-LISTE: Name, Adresse, Zustand (Plan §2.3 Nr. 1).
 *
 * ── DIE ADRESSE IST EINGABE, DER NAME IST VORSCHLAG ──────────────────────
 * Davids Entscheidung 4 (§6): die Namen kommen aus `a.competitors`, die
 * ADRESSEN trägt der Kunde ein. „Eine geratene Adresse ist die erste
 * Halluzination des Produkts; sie darf gar nicht entstehen" (§1.4). Deshalb
 * ist das Adressfeld leer und beschriftet, statt vorbelegt — und deshalb gibt
 * es hier keinen Knopf „Adresse suchen".
 *
 * ── DER ZUSTAND STEHT ALS WORT DA, NICHT NUR ALS FARBE ───────────────────
 * Glyphe UND Wort (WCAG): „Noch nicht gelesen", „Profil erstellt",
 * „Ausgeschlossen" — und bei einem Ausschluss der GRUND in ehrlichen Worten
 * (§2.3: „ausgeschlossen, weil die Website die Auswertung untersagt"). Der
 * Grund ist aufzählbar und wird hier übersetzt; ein freier Text vom Server
 * wäre in der zweiten Sprache englisch.
 *
 * ── SIE SCHREIBT NICHT SELBST ────────────────────────────────────────────
 * Die Komponente meldet nur, WAS passiert ist (`update:url`, `remove`,
 * `add`); die Seite speichert. Dasselbe Muster wie in der Werkstatt: eine
 * Liste, die selbst speichert, tut es an drei Orten verschieden.
 *
 * ── M0b: VIER QUELLEN UND EIN SCORE JE ZEILE (Plan §7.2, §7.3) ───────────
 * Die Adresse ist seither nur noch EINE von vier Herkünften; welche es ist,
 * steht als Etikett an der Zeile und nicht nur im Wähler — nach dem Speichern
 * sieht man den Wähler nicht mehr, das Etikett schon. Der Brand-Check-Score
 * steht daneben, weil er zur MARKE gehört und nicht zum Bericht: er ist auch
 * dann eine Auskunft, wenn noch kein Vergleich gelaufen ist.
 */
const props = withDefaults(defineProps<{
  competitors: readonly MarketCompetitor[]
  /** Gesperrt, solange der Lauf läuft — oder solange die Schranke zu ist. */
  disabled?: boolean
  max?: number
  /** Die wählbaren Einträge der drei Nicht-Website-Quellen (§7.2). */
  sourceOptions?: Partial<Record<MarketCandidateSource, readonly MarketSourceOption[]>>
  /** Das Band als Wort — aufgelöst von der Seite (s. MkBrandScore). */
  resolveBandLabel?: (band: string) => string
  resolveCheckHref?: (checkId: string) => string
}>(), {
  disabled: false,
  max: MARKET_COMPETITORS_MAX,
  sourceOptions: () => ({}),
  resolveBandLabel: (band: string) => band,
  resolveCheckHref: (checkId: string) => `/brand-check/${checkId}`,
})

const emit = defineEmits<{
  'update:url': [payload: { id: string, url: string }]
  'update:source': [payload: { id: string, source: MarketCandidateSource }]
  'update:ref': [payload: { id: string, refId: string }]
  'remove': [id: string]
  'add': []
}>()

const { t } = useI18n()

const STATUS: Record<MarketCompetitorStatus, { icon: string, tone: string }> = {
  pending: { icon: 'i-ph-circle-dashed', tone: 'var(--bw-muted)' },
  reading: { icon: 'i-ph-circle-notch', tone: 'var(--bw-muted)' },
  fetched: { icon: 'i-ph-check-circle', tone: 'var(--bw-accent)' },
  excluded: { icon: 'i-ph-prohibit', tone: 'var(--bw-draft)' },
  failed: { icon: 'i-ph-warning-circle', tone: 'var(--bw-stale)' },
}

/** Fehlt die Angabe, ist es der Normalfall — eine Adresse. */
function sourceOf(competitor: MarketCompetitor): MarketCandidateSource {
  return competitor.source ?? 'website'
}

/**
 * Der Satz, den eine QUELLE über sich selbst sagt. Bei `website` steht er
 * schon im Kopf der Liste; die drei anderen brauchen ihn an der Zeile — sie
 * versprechen etwas anderes als „wir lesen eure Website".
 */
function hintKey(competitor: MarketCompetitor): string {
  return `market.source.${sourceOf(competitor)}Hint`
}

const hasHint = (competitor: MarketCompetitor): boolean => sourceOf(competitor) !== 'website'

/** Wieviele Zeilen der Deckel noch zulässt (§2.9 Nr. 8). */
const atMax = computed(() => props.competitors.length >= props.max)
</script>

<template>
  <section>
    <h2 class="text-lg font-medium tracking-tight">{{ t('market.candidates.title') }}</h2>
    <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
      {{ t('market.candidates.hint') }}
    </p>

    <ul class="mt-4 space-y-2">
      <li
        v-for="competitor in competitors" :key="competitor.id"
        class="bw-card p-3 sm:p-4"
      >
        <!-- ZWEI ZEILEN STATT EINER REIHE: die Spalte der Werkstatt ist schmal
             (die Bühne teilt sich den Schirm mit Leiste und Stand). Name und
             Adresse in eine Reihe zu zwingen hiess, beide abzuschneiden. -->
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ competitor.name }}</p>
            <!-- Das Etikett der Quelle bleibt sichtbar, auch wenn der Wähler
                 längst wieder zugeklappt ist (§7.2). -->
            <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <UBadge
                size="sm" variant="subtle" color="neutral" class="rounded-full"
                :label="t(`market.source.${sourceOf(competitor)}`)"
              />
              <span class="bw-label truncate" style="color: var(--bw-muted)">
                {{ t('market.candidates.suggested') }}
              </span>
            </p>
          </div>

          <!-- Der Score gehört zur MARKE, nicht zum Bericht — er steht deshalb
               schon vor dem ersten Lauf hier (§7.3). -->
          <MkBrandScore
            :check="competitor.brandCheck"
            :resolve-band-label="resolveBandLabel"
            :resolve-check-href="resolveCheckHref"
          >
            <template #ring="ring">
              <slot name="score" v-bind="ring" />
            </template>
          </MkBrandScore>

          <UButton
            size="xs" variant="ghost" color="neutral" class="flex-none rounded-full"
            icon="i-ph-x" :disabled="disabled"
            :aria-label="t('market.candidates.remove', { name: competitor.name })"
            @click="emit('remove', competitor.id)"
          />
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <MkSourcePicker
            class="min-w-64 flex-1"
            :source="sourceOf(competitor)"
            :url="competitor.url"
            :ref-id="competitor.sourceRefId"
            :options="sourceOptions"
            :disabled="disabled"
            :name="competitor.name"
            @update:source="emit('update:source', { id: competitor.id, source: $event })"
            @update:url="emit('update:url', { id: competitor.id, url: $event })"
            @update:ref="emit('update:ref', { id: competitor.id, refId: $event })"
          />

          <!-- Zustand als Glyphe UND Wort (WCAG): nie nur Farbe. -->
          <p class="flex flex-none items-center gap-1.5">
            <UIcon
              :name="STATUS[competitor.status].icon"
              class="size-4 flex-none"
              :class="competitor.status === 'reading' ? 'animate-spin' : ''"
              :style="`color: ${STATUS[competitor.status].tone}`"
            />
            <span class="bw-label" :style="`color: ${STATUS[competitor.status].tone}`">
              {{ t(`market.status.${competitor.status}`) }}
            </span>
          </p>
        </div>

        <p v-if="hasHint(competitor)" class="mt-2 text-sm leading-snug" style="color: var(--bw-muted)">
          {{ t(hintKey(competitor)) }}
        </p>

        <p
          v-if="competitor.excludedReason"
          class="mt-2 text-sm leading-snug" style="color: var(--bw-draft)"
        >
          {{ t(`market.reason.${competitor.excludedReason}`) }}
        </p>
      </li>
    </ul>

    <div class="mt-3 flex flex-wrap items-center gap-3">
      <UButton
        size="sm" variant="outline" color="neutral" class="rounded-full"
        icon="i-ph-plus" :label="t('market.candidates.add')"
        :disabled="disabled || atMax"
        @click="emit('add')"
      />
      <span class="bw-label" style="color: var(--bw-muted)">{{ t('market.candidates.max', { count: max }) }}</span>
    </div>
  </section>
</template>
