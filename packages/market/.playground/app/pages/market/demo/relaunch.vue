<script setup lang="ts">
import { marketRelaunchState } from '../../../../../shared/marketProfile'
import {
  DEMO_BRAND,
  DEMO_OLD_SITE_HOST,
  DEMO_OLD_SITE_NAME,
  DEMO_OLD_SITE_PROFILE,
  DEMO_OWN,
  demoHref,
} from '../../../utils/demoMarket'
import { useBrandFieldLabels } from '../../../composables/useBrandFieldLabels'

/**
 * SCREEN 5 — „EURE MARKE GEGEN EURE ALTE WEBSITE" (Plan §7.2 Nr. 2, neu in
 * M0b).
 *
 * ── ER IST DIE BEGRÜNDUNG FÜR DIE QUELLE „EIGENE MARKE" ──────────────────
 * Alle anderen Quellen beantworten „wo stehen wir im Feld". Diese hier
 * beantwortet „was steht draussen noch, das wir längst anders entschieden
 * haben" — und aus der Antwort folgt eine Liste, keine Erkenntnis. Für einen
 * Relaunch ist das der ganze Auftrag.
 *
 * ── DERSELBE MOTOR, KEIN ZWEITER ─────────────────────────────────────────
 * Die linke Spalte ist ein ganz gewöhnliches Marktprofil (§7.1: „ein Motor,
 * drei Ansichten") — dieselben zehn Felder, dieselbe Belegpflicht, dieselben
 * Zitate aus einer Seite, die wirklich im Playground liegt. Die rechte Spalte
 * sind die BESTÄTIGTEN Felder der Foundation und tragen deshalb keinen Beleg.
 *
 * ── KEIN BRAND-SCORE AUF DIESEM SCREEN ───────────────────────────────────
 * Er würde hier zwei verschiedene Dinge messen: die alte Website hat einen
 * (sie existiert im Netz), die Foundation hat keinen (sie ist noch nicht
 * veröffentlicht). Zwei Ringe nebeneinander, von denen einer nichts messen
 * kann, sind schlechter als keiner.
 */
const { t } = useI18n()
const localePath = useLocalePath()
const fieldLabels = useBrandFieldLabels()

const differing = computed(() => DEMO_OWN.filter((field) => {
  const website = DEMO_OLD_SITE_PROFILE.find(entry => entry.fieldId === field.fieldId)
  const state = marketRelaunchState(website, field)
  return state === 'different' || state === 'onlyFoundation'
}).length)

const standRows = computed(() => [
  { label: t('market.stand.candidates'), value: '1' },
  { label: t('market.stand.profiles'), value: '1' },
  { label: t('market.relaunch.gapTitle'), value: String(differing.value) },
])
</script>

<template>
  <BwWorkspace
    :progress-pct="62" content-locale="en"
    :topbar="false" :rail-footer="false" :locale-in-topbar="false"
    rail-width="288px"
    style="--bw-rail-pad-x: 1rem; --bw-rail-pad-y: 0.75rem"
  >
    <template #rail>
      <MkDemoRail active="market" :findings="0" />
    </template>

    <template #stage-bar>
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <UIcon name="i-ph-compass" class="size-4 flex-none" style="color: var(--bw-muted)" />
        <span class="truncate text-sm font-semibold">{{ t('market.page.title') }}</span>
        <span class="bw-label truncate" style="color: var(--bw-muted)">&middot; {{ t('market.relaunch.title') }}</span>
      </div>
    </template>

    <h1 class="text-2xl font-medium tracking-tight">{{ t('market.relaunch.title') }}</h1>
    <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('market.relaunch.lead') }}</p>
    <p class="bw-label mt-2" style="color: var(--bw-muted)">{{ t('market.evidence.demoNote') }}</p>

    <div class="mt-8">
      <MkRelaunchCompare
        :website="DEMO_OLD_SITE_PROFILE"
        :website-name="DEMO_OLD_SITE_NAME"
        :website-host="DEMO_OLD_SITE_HOST"
        :foundation="DEMO_OWN"
        :foundation-name="DEMO_BRAND"
        :field-labels="fieldLabels"
        :resolve-href="demoHref"
      />
    </div>

    <div class="mt-10 flex flex-wrap items-center gap-3">
      <UButton
        variant="ghost" color="neutral" class="rounded-full"
        icon="i-ph-arrow-left" :label="t('market.action.back')"
        :to="localePath('/market/demo/markt')"
      />
      <UButton
        variant="ghost" color="neutral" class="rounded-full"
        icon="i-ph-table" :label="t('market.action.toResult')"
        :to="localePath('/market/demo/ergebnis')"
      />
    </div>

    <template #george>
      <MkDemoStand
        :rows="standRows"
        :notes="[t('market.source.foundationHint'), t('market.stand.confidential')]"
      />
    </template>
  </BwWorkspace>
</template>
