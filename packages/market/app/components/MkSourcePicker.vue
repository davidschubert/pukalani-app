<script setup lang="ts">
import {
  MARKET_CANDIDATE_SOURCES,
  type MarketCandidateSource,
  type MarketSourceOption,
} from '../../shared/marketProfile'
import { marketDay } from '../utils/marketFormat'

/**
 * PROTOTYP (M0b) — DER QUELLEN-WÄHLER EINER KANDIDATEN-ZEILE (Plan §7.2,
 * §7.6: „Seite Markt bekommt einen Quellen-Wähler je Kandidat").
 *
 * VIER QUELLEN, VIER VERSCHIEDENE VERSPRECHEN — und deshalb vier verschiedene
 * zweite Zeilen:
 *
 *  1. `website`    — Adresse eintragen (wie bisher). Geraten wird sie nie.
 *  2. `foundation` — eine EIGENE Marke aus dem Konto. Kein Abruf: die Felder
 *                    sind bestätigt, nicht abgelesen. Der Relaunch-Fall.
 *  3. `library`    — kuratierte Bibliothek bekannter Marken, mit SUCHFELD:
 *                    eine Ausklappliste über zwölf Einträge ist eine Liste,
 *                    über zweihundert ein Problem — die Bedienung muss von
 *                    Anfang an die spätere Grösse aushalten.
 *  4. `shared`     — die freigegebene Marke eines FREMDEN Kontos.
 *
 * ── DIE BIBLIOTHEK ZEIGT NAMEN UND SONST NICHTS (§7.2 Nr. 3) ─────────────
 * Reale Marken erscheinen als NAME, ohne Logo — und im Prototyp ohne jedes
 * Zitat: die Karte sagt „Marktprofil folgt", statt eines zu erfinden. Ein
 * erfundenes Zitat unter einem echten Markennamen ist die eine Sorte Lüge,
 * die dieses Produkt nie erzählen darf (§2.9 Nr. 5, § 6 UWG) — und ein
 * Screenshot davon wandert weiter, als man denkt.
 *
 * ── UND SEIT 2026-09-06 DAS PRÜFDATUM (90-Tage-Regel) ────────────────────
 * Ein Bibliotheks-Eintrag trägt sein Gewicht daher, dass ein MENSCH seine
 * Zitate am Original geprüft hat — mit Datum und Zeichen. „Handgeprüft am 6.
 * Sept. 2026" steht deshalb an der Zeile, und ist die Prüfung älter als 90
 * Tage (Runbook Schritt 4), sagt es ein dezenter Nachsatz. Er WARNT nur; die
 * Marke bleibt wählbar, denn ein alter geprüfter Stand ist immer noch ein
 * geprüfter Stand — er ist nur älter, als unsere eigene Regel es vorsieht.
 *
 * ── DER OPT-IN-SATZ STEHT AM WÄHLER, NICHT IM KLEINGEDRUCKTEN ────────────
 * „Nur mit Zustimmung der Eigentümerin sichtbar, und nur die zehn
 * Aussen-Felder" (§7.2 Nr. 4) gehört DAHIN, wo jemand die fremde Marke
 * auswählt — dort bildet er die Erwartung, was er zu sehen bekommt.
 *
 * ── SIE SPEICHERT NICHTS ─────────────────────────────────────────────────
 * Wie die Kandidaten-Liste meldet sie nur, was passiert ist. Ein Wähler, der
 * selbst speichert, tut es an drei Orten verschieden.
 */
const props = withDefaults(defineProps<{
  source: MarketCandidateSource
  url: string
  /** Der gewählte Eintrag bei den drei Nicht-Website-Quellen. */
  refId?: string
  options?: Partial<Record<MarketCandidateSource, readonly MarketSourceOption[]>>
  disabled?: boolean
  /** Für die Beschriftung des Adressfeldes. */
  name: string
}>(), {
  refId: undefined,
  options: () => ({}),
  disabled: false,
})

const emit = defineEmits<{
  'update:source': [source: MarketCandidateSource]
  'update:url': [url: string]
  'update:ref': [refId: string]
}>()

const { t, locale } = useI18n()

const sourceItems = computed(() => MARKET_CANDIDATE_SOURCES.map(source => ({
  label: t(`market.source.${source}`),
  value: source,
})))

/** Die Einträge der aktuell gewählten Quelle — bei `website` gibt es keine. */
const entries = computed<readonly MarketSourceOption[]>(() => props.options[props.source] ?? [])

/**
 * `USelectMenu` arbeitet mit OBJEKTEN, nicht mit Zeichenketten: ein leerer
 * Wert ist dort verboten (Nuxt-UI/Reka-Falle), und die zweite Zeile („Branche",
 * Adresse) braucht ohnehin ein Feld mehr als ein Label.
 */
const items = computed(() => entries.value.map(entry => ({
  label: entry.label,
  value: entry.id,
  hint: entry.hint ?? '',
  // DAS PRÜFDATUM DER BIBLIOTHEK (seit 2026-09-06). Es steht an der Zeile,
  // nicht im Kleingedruckten: „woher wisst ihr das" beantwortet bei dieser
  // Quelle ein MENSCH mit Datum und Zeichen, und wie alt seine Prüfung ist,
  // gehört genau dorthin, wo jemand die Marke auswählt. `stale` kommt fertig
  // vom Server (`marketLibrarySourceOption`) — im Browser gerechnet, wäre es
  // an der Tagesgrenze ein anderer Wert als beim SSR.
  verified: entry.verifiedAt ? marketDay(entry.verifiedAt, locale.value) : '',
  stale: entry.stale === true,
})))

const selected = computed(() => items.value.find(item => item.value === props.refId))
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
    <USelect
      :model-value="source"
      :items="sourceItems"
      value-key="value"
      class="w-44 flex-none"
      :disabled="disabled"
      icon="i-ph-funnel-simple"
      :aria-label="`${t('market.source.label')} — ${name}`"
      @update:model-value="emit('update:source', $event as MarketCandidateSource)"
    />

    <!-- 1 · Website: die Adresse trägt der Kunde ein. -->
    <UInput
      v-if="source === 'website'"
      :model-value="url"
      class="min-w-48 flex-1"
      :placeholder="t('market.candidates.urlPlaceholder')"
      :aria-label="`${t('market.candidates.url')} — ${name}`"
      :disabled="disabled"
      icon="i-ph-globe-simple"
      @update:model-value="emit('update:url', String($event))"
    />

    <!-- 2–4 · Ein Eintrag aus einer Liste. Suchbar, weil die Bibliothek wächst. -->
    <USelectMenu
      v-else
      :model-value="selected"
      :items="items"
      class="min-w-48 flex-1"
      :disabled="disabled"
      :search-input="{ placeholder: t('market.source.search') }"
      :placeholder="t(`market.source.${source}Placeholder`)"
      :aria-label="`${t('market.source.label')} — ${name}`"
      icon="i-ph-magnifying-glass"
      @update:model-value="emit('update:ref', String(($event as { value: string } | undefined)?.value ?? ''))"
    >
      <template #item-label="{ item }">
        <span class="min-w-0">
          <span class="block truncate">{{ item.label }}</span>
          <span v-if="item.hint" class="bw-label block truncate" style="color: var(--bw-muted)">{{ item.hint }}</span>
          <span v-if="item.verified" class="bw-label block truncate" style="color: var(--bw-muted)">
            {{ t('market.library.verifiedAt', { date: item.verified }) }}<template v-if="item.stale"> &middot; {{ t('market.library.stale') }}</template>
          </span>
        </span>
      </template>
    </USelectMenu>

    <!--
      DASSELBE NOCH EINMAL FÜR DEN GEWÄHLTEN EINTRAG: die Ausklappliste ist zu,
      sobald jemand gewählt hat, und ausgerechnet dann steht die Marke in der
      Zeile, die er speichern wird. Ein Alter, das nur beim Auswählen zu sehen
      ist, erreicht niemanden mehr, der die Seite später aufschlägt.
    -->
    <p
      v-if="source !== 'website' && selected?.verified"
      class="bw-label basis-full"
      style="color: var(--bw-muted)"
    >
      {{ t('market.library.verifiedAt', { date: selected.verified }) }}<template v-if="selected.stale"> &middot; {{ t('market.library.stale') }}</template>
    </p>
  </div>
</template>
