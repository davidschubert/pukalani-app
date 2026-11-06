<script setup lang="ts">
/**
 * DIE REITER DES BRAND-CHECKS — Start · Ranking · Vergleich · Methodik
 * (Konzept: docs/archiv/BRAND-CHECK-SEITE.md §1).
 *
 * ── WARUM „METHODIK" EIN REITER IST UND KEIN FUSSNOTEN-LINK (BS1 R2a) ─────
 * Das Faktenblatt (§4c) sagt öffentlich zu, die Methodik sei „von jedem
 * Ergebnis aus verlinkt". Ein Reiter ist die einzige Stelle, an der das für
 * ALLE vier Ansichten auf einmal gilt — die Ergebnisseite trägt dieselbe
 * Leiste (mit `current="start"` als Rückweg). Ein Link, den man je Seite
 * einzeln setzen muss, fehlt irgendwann auf der fünften.
 *
 * ── JEDER REITER IST EINE EIGENE ADRESSE, KEIN ZUSTAND ────────────────────
 * Deshalb LINKS und kein `UTabs` mit `v-model`: die drei Ansichten sind
 * teilbar, serverseitig gerendert und im Verlauf des Browsers auffindbar.
 * Die Optik borgt sich UTabs (Pillen in einer Leiste), das Verhalten nicht.
 *
 * ── „bald" IST EIN ZUSTAND, KEIN LINK ─────────────────────────────────────
 * Ein noch nicht gebauter Reiter steht hier trotzdem, weil die Seite ihre
 * Nachbarn ankündigt — aber als ETIKETT, nicht als Link: ein Reiter, der auf
 * die Seite zurückführt, auf der man schon steht, ist eine Sackgasse mit
 * Beschriftung. Fertig heisst genau eine Änderung je Reiter: `soon: false`;
 * alles andere hier bleibt, wie es ist. Das RANKING hat diesen Schritt mit P3
 * (2026-09-05) hinter sich, der VERGLEICH mit P4 (2026-09-05) — seither steht
 * kein Reiter mehr auf „bald", der Zweig bleibt für den nächsten.
 *
 * ── DER AKTIVE REITER BLEIBT EIN LINK ─────────────────────────────────────
 * Auf der Ergebnisseite (`/brand-check/<id>`) ist „Start" der Rückweg — sie
 * setzt `current="start"` und bekommt damit den Weg zurück zur Startseite des
 * Instruments. Ein aktiver Reiter, der nicht klickbar wäre, hätte diesen
 * Rückweg nicht.
 */
const props = withDefaults(defineProps<{
  /** Welcher Reiter die aktuelle Ansicht ist. */
  current?: 'start' | 'ranking' | 'compare' | 'method'
}>(), { current: 'start' })

const { t } = useI18n()
const localePath = useLocalePath()

interface TabDefinition {
  key: 'start' | 'ranking' | 'compare' | 'method'
  path: string
  soon: boolean
}

/** Die Ziele — die EINE Stelle, die P3/P4 anfassen. */
const TABS: readonly TabDefinition[] = [
  { key: 'start', path: '/brand-check', soon: false },
  { key: 'ranking', path: '/brand-check/ranking', soon: false },
  { key: 'compare', path: '/brand-check/vergleich', soon: false },
  { key: 'method', path: '/brand-check/methodik', soon: false },
] as const

const tabs = computed(() => TABS.map(tab => ({
  ...tab,
  label: t(`brand.checkPage.tabs.${tab.key}`),
  to: localePath(tab.path),
  active: tab.key === props.current,
})))
</script>

<template>
  <nav
    :aria-label="t('brand.checkPage.tabsAria')"
    class="bw-frame inline-flex flex-wrap items-center gap-1 p-1"
    style="background: var(--bw-surface-hi)"
    data-check-tabs
  >
    <template v-for="tab in tabs" :key="tab.key">
      <NuxtLink
        v-if="!tab.soon"
        :to="tab.to"
        class="rounded-full px-4 py-1.5 text-sm tracking-tight transition-colors"
        :style="tab.active
          ? 'background: var(--bw-ink); color: var(--bw-paper)'
          : 'color: var(--bw-muted)'"
        :aria-current="tab.active ? 'page' : undefined"
        :data-check-tab="tab.key"
      >
        {{ tab.label }}
      </NuxtLink>
      <span
        v-else
        class="flex items-center gap-2 rounded-full px-4 py-1.5 text-sm tracking-tight"
        style="color: var(--bw-muted)"
        aria-disabled="true"
        :data-check-tab="tab.key"
        data-check-tab-soon
      >
        {{ tab.label }}
        <span class="bw-label rounded-full px-2 py-0.5" style="background: var(--bw-surface); color: var(--bw-muted)">
          {{ t('brand.checkPage.tabs.soon') }}
        </span>
      </span>
    </template>
  </nav>
</template>
