<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import {
  MARKET_FIELDS,
  MARKET_OWN_ID,
  marketAiStatement,
  marketField,
  type MarketAiView,
  type MarketBrandCheck,
  type MarketCompetitor,
  type MarketFieldId,
  type MarketProfile,
  type MarketProfileField,
} from '../../shared/marketProfile'

/**
 * PROTOTYP (M0) — Komponenten-Vorlage für M1–M4.
 *
 * DIE GEGENÜBERSTELLUNG (Plan §2.5, Davids Entscheidung 5 in §6).
 *
 * ── `UTable`, WEIL ES EINE DATENLISTE IST ────────────────────────────────
 * Davids UTable-Regel (B6, 2026-07-30): Datenlisten im Dashboard sind
 * `UTable` — Sortierung, Auswahl und Paginierung verhalten sich dann überall
 * gleich. Eine handgebaute Matrix wäre hier besonders verlockend und
 * besonders falsch: sie ist die EINE Ansicht, die der Kunde ausdruckt.
 *
 * ── EINE ZEILE JE FELD, EINE SPALTE JE MARKE ─────────────────────────────
 * Die Zeilen kommen aus `MARKET_FIELDS` und nicht aus den Daten: fehlt ein
 * Feld bei ALLEN, bleibt die Zeile trotzdem stehen und sagt „niemand
 * formuliert das öffentlich". Genau das ist eine Aussage über die Kategorie
 * (§1.10) — eine Zeile, die sich wegkürzt, wäre eine verschwiegene.
 *
 * ── EIN AUSGESCHLOSSENER WETTBEWERBER BLEIBT ALS SPALTE STEHEN ───────────
 * Grau, mit dem Wort „ausgeschlossen" im Kopf (nie nur Farbe). Ihn
 * wegzulassen hiesse, dem Kunden zu verschweigen, dass sein Feld ein Loch
 * hat — und dieses Loch ist eine Tatsache über die Auswertung, keine
 * Schönheitsfrage.
 *
 * ── DIE BESCHRIFTUNG DER EIGENEN FELDER KOMMT VON AUSSEN ─────────────────
 * `fieldLabels` ist der sichtbar gemachte Vertrag zum brand-Layer (§2.1,
 * CONCEPT A14): die SEITE löst die Slot-Ids gegen die brand-Registry auf,
 * diese Komponente kennt sie nicht. Ohne Angabe steht der neutrale Name des
 * Marktprofil-Feldes da — nie eine rohe Id.
 *
 * ── M0b: ZWEI SICHTEN, EINE TABELLE (Plan §7.5 d) ────────────────────────
 * „Website sagt" und „KI-Antworten sagen" sind ein UMSCHALTER und keine
 * zwanzig Spalten: nebeneinander passte es auf keinen Schirm, und wichtiger —
 * eine belegte Aussage neben einer unbelegten in derselben Reihe LÄSST DEN
 * UNTERSCHIED VERSCHWINDEN. Die zweite Sicht trägt deshalb ihr eigenes
 * Etikett („ungeprüfte Aussensicht"), keinen Beleg-Knopf (es gibt keine
 * Quelle) und dafür den Konsens („2 von 3 Antworten").
 *
 * ── HÄUFIGKEIT UND HERKUNFT STEHEN AN DER ZELLE (§7.4, §7.6) ─────────────
 * „auf 4 von 6 Seiten" ist das, was eine Aussage vergleichbar macht — nicht
 * ein Mittelwert über Websites, die verschieden gross sind. Und die Herkunft
 * (Website &middot; Foundation &middot; Bibliothek &middot; freigegeben) sagt,
 * WIE belastbar die Zelle ist: eine bestätigte Foundation ist beschlossen,
 * eine abgelesene Website zitiert, eine freigegebene Marke geliehen.
 */
const props = withDefaults(defineProps<{
  /** Die eigenen (bestätigten) Werte in derselben Feldstruktur. */
  own: readonly MarketProfileField[]
  ownName: string
  ownCheck?: MarketBrandCheck | null
  competitors: readonly MarketCompetitor[]
  profiles: readonly MarketProfile[]
  /** Die ungeprüfte Aussensicht, je Marke (`MARKET_OWN_ID` = wir selbst). */
  aiViews?: readonly MarketAiView[]
  fieldLabels?: Partial<Record<MarketFieldId, string>>
  resolveHref?: (sourceUrl: string) => string
  resolveBandLabel?: (band: string) => string
  resolveCheckHref?: (checkId: string) => string
}>(), {
  ownCheck: null,
  aiViews: () => [],
  fieldLabels: () => ({}),
  resolveHref: (sourceUrl: string) => sourceUrl,
  resolveBandLabel: (band: string) => band,
  resolveCheckHref: (checkId: string) => `/brand-check/${checkId}`,
})

const { t } = useI18n()

/**
 * SSR rendert IMMER „Website sagt": der Umschalter ist eine Wahl des Lesers,
 * kein Zweig, der auf Server und Client verschieden aussieht
 * (Hydrations-Regel) — und die belegte Sicht ist der Normalfall.
 */
const view = ref<'website' | 'ai'>('website')

const viewItems = computed(() => [
  { label: t('market.view.website'), value: 'website' },
  { label: t('market.view.ai'), value: 'ai' },
])

const ownId = MARKET_OWN_ID

interface Row { fieldId: MarketFieldId, label: string }

const rows = computed<Row[]>(() => MARKET_FIELDS.map(field => ({
  fieldId: field.id,
  label: props.fieldLabels[field.id] ?? t(`market.field.${field.id}`),
})))

const columns = computed<TableColumn<Row>[]>(() => [
  { id: 'field', header: () => t('market.result.field') },
  { id: 'own', header: () => props.ownName },
  ...props.competitors.map(competitor => ({
    id: competitor.id,
    header: () => competitor.name,
  })),
])

function checkOf(competitorId: string): MarketBrandCheck | null {
  return props.competitors.find(competitor => competitor.id === competitorId)?.brandCheck ?? null
}

/** Die KI-Aussage als null-oder-eins-Liste (s. `evidenceOf` unten). */
function aiOf(competitorId: string, fieldId: MarketFieldId) {
  const statement = marketAiStatement(props.aiViews, competitorId, fieldId)
  return statement ? [statement] : []
}

/** Slot-Name einer Wettbewerber-Spalte (`<id>-cell` / `<id>-header`). */
const cellSlot = (id: string): string => `${id}-cell`
const headerSlot = (id: string): string => `${id}-header`

function profileOf(competitorId: string): readonly MarketProfileField[] {
  return props.profiles.find(profile => profile.competitorId === competitorId)?.fields ?? []
}

function isExcluded(competitorId: string): boolean {
  return props.competitors.find(c => c.id === competitorId)?.status === 'excluded'
}

function cell(fields: readonly MarketProfileField[], fieldId: MarketFieldId): MarketProfileField | undefined {
  return marketField(fields, fieldId)
}

/**
 * Der Beleg als LISTE mit null oder einem Eintrag. Sieht umständlich aus und
 * ist es nicht: `v-for` über null-oder-eins erspart im Template die
 * Nicht-null-Behauptung (`!`) hinter zwei optionalen Zugriffen — und die ist
 * genau die Sorte Zusicherung, die beim nächsten Umbau still falsch wird.
 */
function evidenceOf(fields: readonly MarketProfileField[], fieldId: MarketFieldId) {
  const evidence = marketField(fields, fieldId)?.evidence
  return evidence ? [evidence] : []
}
</script>

<template>
  <section>
    <h2 class="text-lg font-medium tracking-tight">{{ t('market.result.matrix') }}</h2>
    <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('market.result.matrixHint') }}</p>

    <!-- Zwei Sichten, nie nebeneinander: siehe Kopf der Datei. -->
    <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <UTabs
        v-model="view" :items="viewItems" :content="false"
        size="sm" color="neutral" variant="pill" class="w-auto"
        data-market-view
      />
      <p v-if="view === 'ai'" class="bw-label flex items-center gap-1.5" style="color: var(--bw-draft)">
        <UIcon name="i-ph-sparkle" class="size-3.5 flex-none" />
        {{ t('market.ai.label') }}
      </p>
    </div>
    <p v-if="view === 'ai'" class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
      {{ t('market.ai.tableHint') }}
    </p>

    <!-- Breite Tabelle scrollt in IHREM Kasten, nie die Seite. -->
    <div class="mt-4 overflow-x-auto">
      <UTable
        :data="rows"
        :columns="columns"
        :ui="{ td: 'align-top whitespace-normal py-3', th: 'whitespace-normal align-bottom' }"
        data-market-comparison
      >
        <!-- Die Kopfzeile trägt den Brand-Check-Score je Marke (§7.3). -->
        <template #own-header>
          <span class="block min-w-40">
            <span class="block text-sm font-medium">{{ ownName }}</span>
            <MkBrandScore
              class="mt-1"
              :check="ownCheck"
              :resolve-band-label="resolveBandLabel"
              :resolve-check-href="resolveCheckHref"
            >
              <template #ring="ring">
                <slot name="score" v-bind="ring" />
              </template>
            </MkBrandScore>
          </span>
        </template>

        <template
          v-for="competitor in competitors" :key="`h-${competitor.id}`"
          #[headerSlot(competitor.id)]
        >
          <span class="block min-w-40">
            <span class="block text-sm font-medium">{{ competitor.name }}</span>
            <!-- Kein Score-Zustand über einem AUSGESCHLOSSENEN: der
                 Brand-Check liest dieselbe Website und hält sich an dieselbe
                 robots.txt — „läuft mit" wäre dort schlicht unwahr. -->
            <MkBrandScore
              v-if="!isExcluded(competitor.id)"
              class="mt-1"
              :check="checkOf(competitor.id)"
              :resolve-band-label="resolveBandLabel"
              :resolve-check-href="resolveCheckHref"
            >
              <template #ring="ring">
                <slot name="score" v-bind="ring" />
              </template>
            </MkBrandScore>
          </span>
        </template>

        <template #field-cell="{ row }">
          <span class="text-sm font-medium">{{ row.original.label }}</span>
        </template>

        <template #own-cell="{ row }">
          <div class="min-w-40 max-w-64">
            <template v-if="view === 'website'">
              <p v-if="cell(own, row.original.fieldId)?.value" class="text-sm leading-snug">
                {{ cell(own, row.original.fieldId)?.value }}
              </p>
              <p v-else class="bw-label" style="color: var(--bw-muted)">{{ t('market.result.missingOwn') }}</p>
              <MkCellMeta :field="cell(own, row.original.fieldId)" />
            </template>

            <!-- KI-Sicht: kein Beleg-Knopf, dafür der Konsens. -->
            <template v-else>
              <template v-for="statement in aiOf(ownId, row.original.fieldId)" :key="statement.fieldId">
                <p class="text-sm leading-snug">{{ statement.value }}</p>
                <p class="bw-label mt-1" style="color: var(--bw-muted)">
                  {{ t('market.ai.agree', { agree: statement.agree, asked: statement.asked }) }}
                </p>
              </template>
              <p v-if="!aiOf(ownId, row.original.fieldId).length" class="bw-label" style="color: var(--bw-muted)">
                {{ t('market.ai.empty') }}
              </p>
            </template>
          </div>
        </template>

        <template
          v-for="competitor in competitors" :key="competitor.id"
          #[cellSlot(competitor.id)]="{ row }"
        >
          <div class="min-w-40 max-w-64">
            <p v-if="isExcluded(competitor.id)" class="bw-label" style="color: var(--bw-muted)">
              {{ t('market.result.excluded') }}
            </p>

            <template v-else-if="view === 'website'">
              <p
                v-if="cell(profileOf(competitor.id), row.original.fieldId)?.value"
                class="text-sm leading-snug"
              >
                {{ cell(profileOf(competitor.id), row.original.fieldId)?.value }}
              </p>
              <p v-else class="bw-label" style="color: var(--bw-muted)">{{ t('market.result.empty') }}</p>
              <MkEvidence
                v-for="evidence in evidenceOf(profileOf(competitor.id), row.original.fieldId)"
                :key="evidence.sourceUrl"
                class="mt-1"
                :evidence="evidence"
                :resolve-href="resolveHref"
              />
              <MkCellMeta :field="cell(profileOf(competitor.id), row.original.fieldId)" />
            </template>

            <template v-else>
              <template v-for="statement in aiOf(competitor.id, row.original.fieldId)" :key="statement.fieldId">
                <p class="text-sm leading-snug">{{ statement.value }}</p>
                <p class="bw-label mt-1" style="color: var(--bw-muted)">
                  {{ t('market.ai.agree', { agree: statement.agree, asked: statement.asked }) }}
                </p>
              </template>
              <p
                v-if="!aiOf(competitor.id, row.original.fieldId).length"
                class="bw-label" style="color: var(--bw-muted)"
              >{{ t('market.ai.empty') }}</p>
            </template>
          </div>
        </template>
      </UTable>
    </div>
  </section>
</template>
