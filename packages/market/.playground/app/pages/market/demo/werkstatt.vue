<script setup lang="ts">
import type { MarketFinding, MarketFindingStatus } from '../../../../../shared/marketProfile'
import { DEMO_FINDINGS } from '../../../utils/demoMarket'
import { useBrandSlotLabel } from '../../../composables/useBrandFieldLabels'

/**
 * SCREEN 4 — DER MARKT-BEFUND IN DER WERKSTATT (Plan §2.11 Nr. 4).
 *
 * Die Session `b.positioningFirstChoice` („Warum sollte ein Kunde euch zuerst
 * wählen?"), und ÜBER dem Feld der Chip. Das ist die ganze Aussage dieses
 * Screens: ein Markt-Befund ist kein zweiter Ort und kein Postfach — er steht
 * da, wo das Feld steht, an derselben Stelle wie ein Konflikt-Befund (§2.5,
 * „George bekommt den Bericht als Block in der nächsten Session der
 * betroffenen Felder — einmal, wie bei Konflikten").
 *
 * ── ER SPERRT NICHTS ─────────────────────────────────────────────────────
 * Die Antwort bleibt bestätigt, das Kapitel bleibt abnehmbar. Nur `conflict`
 * sperrt (BW2 §5a) — ein Markt-Befund ist ein Hinweis von draussen, und der
 * Kunde darf ihn ablehnen, ohne dass etwas stehen bleibt.
 *
 * Die rechte Spalte ist hier der LOG des Kapitels (die Werkstatt-Rolle),
 * nicht der Markt-Stand: dieser Screen gehört dem Branding, nicht dem Markt.
 */
const { t } = useI18n()
const localePath = useLocalePath()
const slotLabel = useBrandSlotLabel()

const finding = ref<MarketFinding>({ ...(DEMO_FINDINGS[0] as MarketFinding) })

function decide(status: MarketFindingStatus): void {
  finding.value = { ...finding.value, status }
}

/** Die bestätigte eigene Antwort — Inhalt, deshalb in der Inhaltssprache. */
const answer = 'We know every farm personally. We taste every lot before it goes on the roaster, and we can name the person who grew it.'

/* Die Beschriftungen kommen über dieselbe Rangfolge wie überall
 * (`brand.labels.*` vor `brand.q.*`) — ein fest getippter Schlüssel wäre in
 * der Hälfte der Fälle ein roher Schlüssel im HTML. */
const log = [
  { slotId: 'b.purpose', text: 'Coffee should stay traceable to the person who grew it.' },
  { slotId: 'b.vision', text: 'In ten years every cafe on Maui can name the farm behind its house blend.' },
  { slotId: 'b.positioningFirstChoice', text: answer },
]
</script>

<template>
  <BwWorkspace
    :progress-pct="62" content-locale="en"
    :topbar="false" :rail-footer="false" :locale-in-topbar="false"
    rail-width="288px"
    style="--bw-rail-pad-x: 1rem; --bw-rail-pad-y: 0.75rem"
  >
    <template #rail>
      <MkDemoRail active="branding" :findings="1" session-active />
    </template>

    <template #stage-bar>
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <UIcon name="i-ph-book-open" class="size-4 flex-none" style="color: var(--bw-muted)" />
        <span class="truncate text-sm font-semibold">{{ t('brand.steps.pvm') }}</span>
        <span class="bw-label truncate" style="color: var(--bw-muted)">
          &middot; {{ slotLabel('b.positioningFirstChoice') }}
        </span>
      </div>
    </template>

    <p class="bw-label" style="color: var(--bw-muted)">{{ t('market.workshop.session') }}</p>
    <h1 class="mt-1 text-xl font-medium leading-snug tracking-tight">
      {{ t('brand.q.b.positioningFirstChoice') }}
    </h1>

    <!-- DER CHIP STEHT ÜBER DEM FELD — die eine Aussage dieses Screens. -->
    <div class="mt-5">
      <MkFindingChip
        :finding="finding"
        :field-label="slotLabel(finding.slotId)"
        @accept="decide('accepted')"
        @dismiss="decide('dismissed')"
      />
      <p class="bw-label mt-1.5" style="color: var(--bw-muted)">{{ t('market.workshop.chipHint') }}</p>
    </div>

    <div class="mt-5">
      <p class="bw-label" style="color: var(--bw-muted)">{{ t('market.workshop.yourAnswer') }}</p>
      <div
        class="mt-1.5 rounded-xl border p-4 text-sm leading-relaxed"
        style="border-color: var(--bw-line); background: var(--bw-surface-hi)"
      >
        {{ answer }}
      </div>
    </div>

    <div class="mt-8">
      <UButton
        variant="ghost" color="neutral" class="rounded-full"
        icon="i-ph-compass" :label="t('market.action.toResult')"
        :to="localePath('/market/demo/ergebnis')"
      />
    </div>

    <template #george>
      <div class="flex h-full flex-col">
        <div class="flex-none border-b px-5 py-4" style="border-color: var(--bw-line)">
          <h2 class="text-sm font-medium">{{ t('market.workshop.log') }}</h2>
        </div>
        <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div v-for="entry in log" :key="entry.slotId">
            <p class="bw-label" style="color: var(--bw-muted)">{{ slotLabel(entry.slotId) }}</p>
            <p class="mt-0.5 text-sm leading-snug" style="color: var(--bw-ink)">{{ entry.text }}</p>
          </div>
        </div>
      </div>
    </template>
  </BwWorkspace>
</template>
