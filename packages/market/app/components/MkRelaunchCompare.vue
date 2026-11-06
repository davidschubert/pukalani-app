<script setup lang="ts">
import {
  MARKET_FIELDS,
  marketField,
  marketRelaunchState,
  type MarketFieldId,
  type MarketProfileField,
  type MarketRelaunchState,
} from '../../shared/marketProfile'

/**
 * PROTOTYP (M0b) — „MEINE MARKE GEGEN DIE ALTE WEBSITE" (Plan §7.2 Nr. 2:
 * „Der stärkste Relaunch-Fall: alte Website gegen neue Foundation").
 *
 * ── WARUM DIESER SCREEN DIE QUELLE „EIGENE MARKE" RECHTFERTIGT ───────────
 * Bei allen anderen Quellen vergleicht man sich mit FREMDEN. Hier vergleicht
 * man sich mit SICH SELBST — mit dem, was draussen noch steht. Das ist die
 * eine Gegenüberstellung, aus der eine To-do-Liste folgt statt einer
 * Erkenntnis: „das sagt eure Foundation, eure Website noch nicht."
 *
 * ── ZWEI SPALTEN, WEIL ES ZWEI VERSCHIEDENE DINGE SIND ───────────────────
 * Links ist ABGELESEN (mit Beleg, Zitat aus der alten Seite), rechts ist
 * BESCHLOSSEN (bestätigte Foundation, deshalb ohne Beleg — sie ist nicht
 * zitiert). Eine gemeinsame Spalte müsste so tun, als wären beide gleich
 * belastbar.
 *
 * ── DIE MARKIERUNG SAGT NIE „FALSCH" ─────────────────────────────────────
 * „anders" heisst anders, nicht schlechter: eine Website darf einfach älter
 * sein als eine Entscheidung. Deshalb Bernstein (`--bw-draft`) und keine
 * Fehlerfarbe — dieselbe Regel wie beim Ausschluss im Lauf. Und jeder Zustand
 * steht als WORT da, nie nur als Farbe (WCAG).
 */
const props = withDefaults(defineProps<{
  /** Das Marktprofil, das aus der ALTEN Website gelesen wurde. */
  website: readonly MarketProfileField[]
  websiteName: string
  websiteHost: string
  /** Die bestätigten Felder der NEUEN Foundation. */
  foundation: readonly MarketProfileField[]
  foundationName: string
  fieldLabels?: Partial<Record<MarketFieldId, string>>
  resolveHref?: (sourceUrl: string) => string
}>(), {
  fieldLabels: () => ({}),
  resolveHref: (sourceUrl: string) => sourceUrl,
})

const { t } = useI18n()

const STATE: Record<MarketRelaunchState, { icon: string, tone: string }> = {
  same: { icon: 'i-ph-equals', tone: 'var(--bw-accent)' },
  different: { icon: 'i-ph-arrows-left-right', tone: 'var(--bw-draft)' },
  onlyFoundation: { icon: 'i-ph-arrow-right', tone: 'var(--bw-draft)' },
  onlyWebsite: { icon: 'i-ph-arrow-left', tone: 'var(--bw-muted)' },
  neither: { icon: 'i-ph-circle-dashed', tone: 'var(--bw-muted)' },
}

interface Line {
  fieldId: MarketFieldId
  label: string
  website?: MarketProfileField
  foundation?: MarketProfileField
  state: MarketRelaunchState
}

/**
 * Die Zeilen kommen aus `MARKET_FIELDS` und nicht aus den Daten — dieselbe
 * Regel wie in der Gegenüberstellung: ein Feld, das auf BEIDEN Seiten fehlt,
 * bleibt stehen und sagt das auch.
 */
const lines = computed<Line[]>(() => MARKET_FIELDS.map((field) => {
  const website = marketField(props.website, field.id)
  const foundation = marketField(props.foundation, field.id)
  return {
    fieldId: field.id,
    label: props.fieldLabels[field.id] ?? t(`market.field.${field.id}`),
    website,
    foundation,
    state: marketRelaunchState(website, foundation),
  }
}))

/** Der Nutzen dieser Quelle, als Liste: was die Website noch nicht sagt. */
const missingOnSite = computed(() => lines.value.filter(line => line.state === 'onlyFoundation' || line.state === 'different'))

function evidenceOf(field: MarketProfileField | undefined) {
  return field?.evidence ? [field.evidence] : []
}
</script>

<template>
  <section>
    <div class="grid gap-3 sm:grid-cols-2">
      <div class="bw-card p-4">
        <p class="bw-label" style="color: var(--bw-muted)">{{ t('market.relaunch.oldSite') }}</p>
        <p class="mt-0.5 text-sm font-medium">{{ websiteName }}</p>
        <p class="bw-label truncate" style="color: var(--bw-muted)">{{ websiteHost }}</p>
      </div>
      <div class="bw-card p-4">
        <p class="bw-label" style="color: var(--bw-muted)">{{ t('market.relaunch.newFoundation') }}</p>
        <p class="mt-0.5 text-sm font-medium">{{ foundationName }}</p>
        <p class="bw-label" style="color: var(--bw-muted)">{{ t('market.source.foundationHint') }}</p>
      </div>
    </div>

    <ul class="mt-4 space-y-2">
      <li v-for="line in lines" :key="line.fieldId" class="bw-card p-4">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p class="bw-label min-w-0 flex-1 truncate" style="color: var(--bw-muted)">{{ line.label }}</p>
          <!-- Glyphe UND Wort: der Zustand ist nie nur eine Farbe. -->
          <p class="flex flex-none items-center gap-1.5">
            <UIcon :name="STATE[line.state].icon" class="size-4 flex-none" :style="`color: ${STATE[line.state].tone}`" />
            <span class="bw-label" :style="`color: ${STATE[line.state].tone}`">
              {{ t(`market.relaunch.state.${line.state}`) }}
            </span>
          </p>
        </div>

        <div class="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <p v-if="line.website?.value" class="text-sm leading-snug">{{ line.website.value }}</p>
            <p v-else class="text-sm italic" style="color: var(--bw-muted)">{{ t('market.result.empty') }}</p>
            <MkEvidence
              v-for="evidence in evidenceOf(line.website)"
              :key="evidence.sourceUrl"
              class="mt-1"
              :evidence="evidence"
              :resolve-href="resolveHref"
            />
            <MkCellMeta :field="line.website" />
          </div>

          <div class="sm:border-l sm:pl-3" style="border-color: var(--bw-line)">
            <p v-if="line.foundation?.value" class="text-sm leading-snug">{{ line.foundation.value }}</p>
            <p v-else class="text-sm italic" style="color: var(--bw-muted)">{{ t('market.result.missingOwn') }}</p>
            <MkCellMeta :field="line.foundation" />
          </div>
        </div>
      </li>
    </ul>

    <!-- Der Ertrag: aus dem Vergleich wird eine Liste, keine Erkenntnis. -->
    <section class="mt-8">
      <h3 class="flex items-center gap-2 text-base font-medium tracking-tight">
        <UIcon name="i-ph-list-checks" class="size-4 flex-none" style="color: var(--bw-muted)" />
        {{ t('market.relaunch.gapTitle') }}
      </h3>
      <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('market.relaunch.gapHint') }}</p>

      <ul v-if="missingOnSite.length" class="mt-3 space-y-2">
        <li v-for="line in missingOnSite" :key="`gap-${line.fieldId}`" class="bw-card p-4">
          <p class="bw-label" style="color: var(--bw-muted)">{{ line.label }}</p>
          <p class="mt-1 text-sm leading-snug">{{ line.foundation?.value }}</p>
          <p class="bw-label mt-1.5" style="color: var(--bw-draft)">
            {{ t(`market.relaunch.gap.${line.state === 'different' ? 'differs' : 'missing'}`) }}
          </p>
        </li>
      </ul>
      <p v-else class="mt-3 text-sm" style="color: var(--bw-ink-soft)">{{ t('market.relaunch.gapNone') }}</p>
    </section>
  </section>
</template>
