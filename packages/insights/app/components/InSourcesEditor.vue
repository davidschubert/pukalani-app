<script setup lang="ts">
import type { InsightsSource, InsightsSourceKind } from '../../shared/insightsPost'
import { INSIGHTS_QUOTE_MAX, INSIGHTS_SOURCE_KINDS } from '../../shared/insightsPost'
import type { InsightsEvidenceResponse } from '../../shared/types/insightsApi'
import { insightsHost } from '../utils/insightsFormat'

/**
 * DAS QUELLEN-PANEL (§9.4) — die Zeilen-Oberfläche für `InsightsSource[]`.
 *
 * ── WARUM SIE SEIT DEM MARKEN-FORMULAR EINE EIGENE KOMPONENTE IST ────────
 * Ein Beitrag UND ein Markenprofil tragen dieselbe `sources`-Form (§9.3, „die
 * dieselbe Form wie oben"), und beide setzen dieselben drei Pflichten durch
 * (Herausgeber + Datum bei Fremdquellen, Lizenz-Link bei Wikipedia, Zitat
 * ≤ 200 Zeichen). Sie ein zweites Mal abzuschreiben hiesse, zwei Formulare zu
 * haben, von denen das jüngere beim nächsten Feld hinterherhinkt — und die
 * Belegpflicht ist die rechtlich teure Zusage dieses Produkts.
 *
 * Herausgezogen wurde sie WÖRTLICH aus `InEditor.vue`: dieselben Felder,
 * dieselben Deckel, dieselbe Ampel. Was sich geändert hat, ist nur, wer sie
 * hält.
 *
 * ── SIE SPRICHT MIT KEINER ROUTE ─────────────────────────────────────────
 * Wie `InEditor` selbst: der Prüfen-Knopf meldet eine ABSICHT hinaus
 * (`checkEvidence`), die AMPEL kommt als Prop herein. Die Route dahinter
 * (`POST /api/insights/posts/<id>/evidence`) hängt an einem BEITRAG — ein
 * Markenprofil hat sie heute nicht, und deshalb ist `checkable` ein
 * Schalter und keine Selbstverständlichkeit. Fail-closed: ohne das Ja des
 * Elternteils gibt es weder Knopf noch Ampel, statt eines Knopfes, der ins
 * Leere klickt.
 *
 * ── EINE ASYMMETRIE MIT GRUND: `add` HIER, `remove` DRAUSSEN ─────────────
 * Hinzufügen hat keine Folgen — eine neue Quelle hinten ändert keinen
 * bestehenden `sourceIndex`. ENTFERNEN hat welche, und zwar unsichtbare: jeder
 * Zeiger dahinter zeigt danach auf die falsche Quelle. Was daraus folgt, weiss
 * nur der Elternteil (ein Beitrag zieht `facts` mit, ein Markenprofil `marks`
 * UND `history`) — deshalb entscheidet er es, und diese Komponente fragt nur.
 */
const props = defineProps<{
  /** Die Beleg-Ampel je Quellen-Index — leer heisst „noch nicht geprüft". */
  evidence?: Readonly<Record<number, InsightsEvidenceResponse>>
  /** Welche Quelle gerade geprüft wird (Index), sonst `null`. */
  checkingIndex?: number | null
  /** Ob es hinter dem Prüfen-Knopf eine Route gibt (nur der Beitrags-Editor). */
  checkable?: boolean
}>()

const emit = defineEmits<{
  /** Prüfe den Beleg dieser Quelle (nur mit `checkable`). */
  checkEvidence: [number]
  /** Entferne diese Quelle — die Zeiger zieht der Elternteil mit (s. Kopf). */
  remove: [number]
}>()

/** Die Liste selbst — sie GEHÖRT dem Elternteil und wird hier an Ort und
 *  Stelle bearbeitet (deshalb `defineModel` und kein einfaches Prop). */
const sources = defineModel<InsightsSource[]>({ required: true })

const { t } = useI18n()

/** Ausgeschrieben statt gerechnet: `brand-site` und `own-data` tragen einen
 *  Bindestrich, und ein zusammengebauter Schlüssel wäre für den i18n-Wächter
 *  unsichtbar. */
const SOURCE_KIND_KEY: Record<InsightsSourceKind, string> = {
  'brand-site': 'insights.sources.kindBrandSite',
  'press': 'insights.sources.kindPress',
  'wikipedia': 'insights.sources.kindWikipedia',
  'youtube': 'insights.sources.kindYoutube',
  'own-data': 'insights.sources.kindOwnData',
}

const sourceKindItems = computed(() => INSIGHTS_SOURCE_KINDS.map(kind => ({
  label: t(SOURCE_KIND_KEY[kind]),
  value: kind,
})))

function addSource(): void {
  const fresh: InsightsSource = { url: '', publisher: '', date: '', kind: 'press' as InsightsSourceKind, quote: '', license: '' }
  sources.value.push(fresh)
}

/**
 * DIE AMPEL EINER QUELLE als FLACHER Wert — bewusst nicht das rohe Ergebnis.
 *
 * Im Template stünden sonst drei Nicht-Null-Behauptungen (`evidence[i]!`) für
 * denselben Wert; jede davon ist eine Zusage an den Übersetzer, die niemand
 * prüft. `known: false` sagt dasselbe, ohne dass jemand sie geben muss.
 */
interface InsightsEvidenceView {
  known: boolean
  grounded: boolean
  reasonKey: string
}

function evidenceOf(index: number): InsightsEvidenceView {
  const entry: InsightsEvidenceResponse | undefined = props.evidence?.[index]
  if (!entry) return { known: false, grounded: false, reasonKey: 'insights.editor.evidenceUnchecked' }
  return { known: true, grounded: entry.grounded, reasonKey: `insights.editor.evidenceReason.${entry.reason}` }
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-baseline justify-between gap-3">
      <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.editor.sourcesPanel') }}</p>
      <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.sources.lead', { max: INSIGHTS_QUOTE_MAX }) }}</p>
    </div>

    <ul class="mt-4 space-y-5">
      <li v-for="(source, index) in sources" :key="index" class="border-b pb-5 last:border-0" style="border-color: var(--bw-line)">
        <div class="flex flex-wrap items-center gap-2">
          <span class="bw-label" style="color: var(--bw-muted)">{{ index + 1 }}</span>
          <span class="bw-label" style="color: var(--bw-ink-soft)">{{ insightsHost(source.url) }}</span>
          <UButton
            v-if="checkable"
            :label="t('insights.editor.checkEvidence')" size="xs" color="neutral" variant="ghost"
            :loading="checkingIndex === index" :disabled="!source.url || !source.quote"
            class="ml-auto rounded-full" style="background: var(--bw-surface)"
            @click="emit('checkEvidence', index)"
          />
          <UButton
            icon="i-ph-trash" size="xs" color="neutral" variant="ghost"
            :class="checkable ? undefined : 'ml-auto'"
            :aria-label="t('insights.editor.sourceRemove')"
            @click="emit('remove', index)"
          />
        </div>

        <!-- Die Ampel: geprüft und wahr · geprüft und falsch · ungeprüft. -->
        <p
          v-if="checkable"
          class="bw-label mt-2 inline-flex items-center gap-1"
          :style="!evidenceOf(index).known
            ? 'color: var(--bw-muted)'
            : (evidenceOf(index).grounded ? 'color: var(--bw-accent)' : 'color: var(--bw-stale)')"
        >
          <UIcon
            :name="!evidenceOf(index).known ? 'i-ph-circle-dashed' : (evidenceOf(index).grounded ? 'i-ph-check-circle-fill' : 'i-ph-x-circle-fill')"
            class="size-4"
          />
          {{ t(evidenceOf(index).reasonKey) }}
        </p>

        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <UFormField :label="t('insights.editor.sourceUrl')">
            <UInput v-model="source.url" class="w-full font-mono text-xs" :maxlength="512" />
          </UFormField>
          <UFormField :label="t('insights.editor.sourceKind')">
            <USelect v-model="source.kind" :items="sourceKindItems" value-key="value" class="w-full" />
          </UFormField>
          <UFormField :label="t('insights.editor.sourcePublisher')">
            <UInput v-model="source.publisher" class="w-full" :maxlength="160" />
          </UFormField>
          <UFormField :label="t('insights.editor.sourceDate')">
            <UInput v-model="source.date" type="date" class="w-full" />
          </UFormField>
          <UFormField v-if="source.kind === 'wikipedia'" class="sm:col-span-2" :label="t('insights.editor.sourceLicense')">
            <UInput v-model="source.license" class="w-full" :maxlength="200" />
          </UFormField>
          <UFormField class="sm:col-span-2" :label="t('insights.editor.sourceQuote')">
            <UTextarea v-model="source.quote" :rows="2" class="w-full" :maxlength="INSIGHTS_QUOTE_MAX" />
          </UFormField>
        </div>
      </li>
    </ul>

    <CoreEmptyState
      v-if="sources.length === 0"
      class="mt-4"
      icon="i-ph-link-simple"
      :title="t('insights.editor.sourcesEmpty')"
      :description="t('insights.editor.sourcesEmptyHint')"
    />

    <UButton
      class="mt-4 rounded-full" icon="i-ph-plus" color="neutral" variant="ghost"
      style="background: var(--bw-surface)"
      :label="t('insights.editor.sourceAdd')"
      @click="addSource"
    />
  </div>
</template>
