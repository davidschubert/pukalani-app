<script setup lang="ts">
import type { BwRailLayer, BwRailStep } from '../../../app/components/BwProgressRail.vue'

/**
 * RUNDE 16 (Davids „Sidebar wie Nuxt UI", 2026-09-02) — die linke Leiste im
 * Muster der Nuxt-UI-Dashboard-Sidebar, aber in der bw-Farb- und Formenwelt:
 *
 * 1. OBEN der Brand-Switcher (Team-Switcher-Muster): aktuelles Branding mit
 *    Monogramm, Klick öffnet die Marken-Liste + „Neues Branding" /
 *    „Brandings verwalten". Er ERSETZT den Switcher aus der Topbar.
 * 2. KEINE Suche (Davids Entscheidung).
 * 3. Bereiche als einklappbare Gruppen (UCollapsible) mit schlanken Zeilen:
 *    vorn der STATUS (Haken/Halbmond/Kreis/Schloss — dieselbe Semantik wie
 *    die Pillen-Leiste), hinten das Info-Icon als echter Knopf — erst bei
 *    Hover/Fokus sichtbar, damit die schlanken Zeilen ruhig bleiben.
 * 4. Der Gesamt-Fortschritt bleibt unten links (BwRailFooter via BwWorkspace,
 *    Runde 14/15) — er ist NICHT Teil dieser Komponente.
 *
 * Der Erklär-Layer (Modal) ist wörtlich von BwProgressRail übernommen — beim
 * echten Umbau wird er in EINE Quelle gezogen; im Dummy zählt der Beweis.
 */

defineProps<{
  layers: BwRailLayer[]
  /* Ohne Topbar zeigt die Sidebar den Sync-Zustand selbst (nur Abweichungen). */
  syncState?: 'saving' | 'offline' | 'conflict' | null
}>()

const { t } = useI18n()

const SYNC = {
  saving: { key: 'brand.workspace.sync.saving', icon: 'i-ph-circle-notch', spin: true },
  offline: { key: 'brand.workspace.sync.offline', icon: 'i-ph-cloud-slash', spin: false },
  conflict: { key: 'brand.workspace.sync.conflict', icon: 'i-ph-warning', spin: false },
} as const

/* Dummy-Daten des Switchers — im echten Produkt kommt die Liste vom Konto.
 * Runde 19 (David): die Marken-Einträge tragen ihr MONOGRAMM (identisch zum
 * Trigger) — deshalb eigene Item-Slots statt des Standard-Renderings. */
const brandMenu = [
  [
    { label: 'Brot & Zeit', slot: 'brand-current' as const },
    { label: 'Kailua Coffee Co.', slot: 'brand-kailua' as const, onSelect: () => { navigateTo('/brand/demo/werte') } },
  ],
  [
    { label: 'Neues Branding', icon: 'i-ph-plus-circle' },
    { label: 'Brandings verwalten', icon: 'i-ph-gear-six' },
  ],
]

/* Erklär-Layer — 1:1 aus BwProgressRail (s. Kopf-Kommentar). */
const infoStep = ref<{ step: BwRailStep, layerLabel: string } | null>(null)
const infoOpen = computed({
  get: () => infoStep.value !== null,
  set: (v: boolean) => { if (!v) infoStep.value = null },
})
const infoPct = computed(() => {
  const b = infoStep.value?.step.info?.bausteine ?? []
  return b.length ? Math.round((b.filter(x => x.done).length / b.length) * 100) : 0
})

function openLayerInfo(layer: BwRailLayer): void {
  if (!layer.info) return
  infoStep.value = {
    step: { id: layer.id, label: layer.label, icon: '', state: 'open', info: layer.info },
    layerLabel: layer.lockedNote ?? layer.note ?? t('brand.workspace.rail.overview'),
  }
}

function glyph(layer: BwRailLayer, step: BwRailStep): { name: string, style: string } {
  if (layer.locked) return { name: 'i-ph-lock-simple', style: 'color: var(--bw-muted)' }
  if (step.kind === 'result') return { name: 'i-ph-sparkle', style: step.state === 'done' ? 'color: var(--bw-accent)' : 'color: var(--bw-muted)' }
  if (step.state === 'done') return { name: 'i-ph-check-circle-fill', style: 'color: var(--bw-accent)' }
  if (step.state === 'active') return { name: 'i-ph-circle-half-fill', style: 'color: var(--bw-ink)' }
  return { name: 'i-ph-circle', style: 'color: var(--bw-muted)' }
}
</script>

<template>
  <nav :aria-label="t('brand.workspace.rail.progressNav')">
    <!-- 1. Brand-Switcher oben (ersetzt den Topbar-Switcher) -->
    <!-- Runde 19 (David): das Menü spannt die VOLLE Trigger-Breite auf
         (Reka-Variable), wie beim Team-Switcher des Vorbilds. `bw-root` am
         CONTENT ist Pflicht: das Menü teleportiert an den Body, außerhalb
         des Token-Wirtes — ohne die Klasse sind alle --bw-*-Farben leer
         (Monogramme ohne Quadrat, Häkchen schwarz; Runde 19b live erwischt).
         Dasselbe Muster wie beim Erklär-Layer unten. -->
    <UDropdownMenu :items="brandMenu" :content="{ align: 'start' }" :ui="{ content: 'bw-root bw-overlay w-(--reka-dropdown-menu-trigger-width)' }">
      <!-- Runde 17: Nuxt-UI-Standardmetrik — px-2.5 / gap-1.5 wie die
           NavigationMenu-Zeilen, damit alles auf einer Flucht sitzt. -->
      <button
        class="gd-switch flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left"
        aria-label="Branding wechseln"
      >
        <span
          class="grid size-7 flex-none place-items-center rounded-lg text-xs font-semibold"
          style="background: var(--bw-ink); color: var(--bw-paper)"
        >B</span>
        <span class="min-w-0 flex-1 truncate text-sm font-medium">Brot &amp; Zeit</span>
        <UIcon name="i-ph-caret-up-down" class="size-4 flex-none" style="color: var(--bw-muted)" />
      </button>

      <!-- Inline statt scoped-Klasse: der Slot-Inhalt landet im teleportierten
           Menü, wo Scoped-CSS nicht verlässlich greift.
           Runde 21 (David): ZWEIZEILIG wie der alte BwBrandSwitcher — Name,
           darunter Vorhaben (Neue Marke / Marken-Relaunch) + Inhaltssprache
           als Flaggen-Icon. -->
      <template #brand-current>
        <span class="grid size-7 flex-none place-items-center rounded-lg text-xs font-semibold" style="background: var(--bw-ink); color: var(--bw-paper)">B</span>
        <span class="min-w-0 flex-1 text-left leading-tight">
          <span class="block truncate font-medium">Brot &amp; Zeit</span>
          <span class="bw-label flex items-center gap-1.5" style="color: var(--bw-muted)">
            Neue Marke <UIcon name="i-circle-flags-de" class="size-3.5 flex-none" />
          </span>
        </span>
        <UIcon name="i-ph-check" class="size-4 flex-none" style="color: var(--bw-accent)" />
      </template>
      <template #brand-kailua>
        <span class="grid size-7 flex-none place-items-center rounded-lg text-xs font-semibold" style="background: var(--bw-ink); color: var(--bw-paper)">K</span>
        <span class="min-w-0 flex-1 text-left leading-tight">
          <span class="block truncate font-medium">Kailua Coffee Co.</span>
          <span class="bw-label flex items-center gap-1.5" style="color: var(--bw-muted)">
            Neue Marke <UIcon name="i-circle-flags-us" class="size-3.5 flex-none" />
          </span>
        </span>
      </template>
    </UDropdownMenu>

    <!-- 3. Bereiche als einklappbare Gruppen -->
    <div class="mt-4 space-y-1">
      <UCollapsible
        v-for="layer in layers" :key="layer.id"
        :default-open="!layer.locked" :unmount-on-hide="false" class="group/section"
      >
        <button
          class="gd-row group/row flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-sm font-medium"
          :style="layer.locked ? 'color: var(--bw-muted)' : ''"
        >
          <UIcon v-if="layer.locked" name="i-ph-lock-simple" class="size-4 flex-none" style="color: var(--bw-muted)" />
          <span class="min-w-0 flex-1 truncate">{{ layer.label }}</span>
          <span
            v-if="layer.info"
            class="bw-info-btn gd-info grid size-6 flex-none place-items-center rounded-full"
            role="button" tabindex="0"
            :aria-label="t('brand.workspace.rail.whatsIn', { label: layer.label })"
            @click.stop="openLayerInfo(layer)"
            @keydown.enter.stop="openLayerInfo(layer)"
          >
            <UIcon name="i-ph-info" class="size-4" />
          </span>
          <UIcon
            name="i-ph-caret-down" class="size-4 flex-none transition-transform group-data-[state=closed]/section:-rotate-90"
            style="color: var(--bw-muted)"
          />
        </button>

        <template #content>
          <!-- Kinder mit Führungslinie, wie in der Nuxt-UI-Sidebar -->
          <!-- Führungslinie mit Nuxt-UI-Einzug: childList ms-5, Kinder ps-1.5. -->
          <ul class="ml-5 mt-0.5 space-y-0.5 border-l pl-1.5" style="border-color: var(--bw-line)">
            <li v-for="step in layer.steps ?? []" :key="step.id">
              <button
                class="gd-row group/row flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-sm"
                :class="!layer.locked && step.state === 'active' ? 'font-medium' : ''"
                :style="!layer.locked && step.state === 'active'
                  ? 'background: var(--bw-surface-hi); color: var(--bw-ink); box-shadow: var(--bw-shadow-card)'
                  : layer.locked || step.state === 'open' ? 'color: var(--bw-muted)' : 'color: var(--bw-ink-soft)'"
                :disabled="layer.locked || (step.kind === 'result' ? step.state !== 'done' : step.state === 'open')"
                @click="step.kind === 'result' && step.to && navigateTo(step.to)"
              >
                <UIcon :name="glyph(layer, step).name" class="size-4 flex-none" :style="glyph(layer, step).style" />
                <span class="min-w-0 flex-1 truncate">{{ step.label }}</span>
                <span
                  v-if="step.info && !layer.locked"
                  class="bw-info-btn gd-info grid size-6 flex-none place-items-center rounded-full"
                  role="button" tabindex="0"
                  :aria-label="t('brand.workspace.rail.whatMeans', { label: step.label })"
                  @click.stop="infoStep = { step, layerLabel: layer.label }"
                  @keydown.enter.stop="infoStep = { step, layerLabel: layer.label }"
                >
                  <UIcon name="i-ph-info" class="size-4" />
                </span>
                <UIcon
                  v-if="step.kind === 'result' && step.state === 'done'"
                  name="i-ph-arrow-right" class="size-4 flex-none" style="color: var(--bw-ink-soft)"
                />
              </button>
            </li>
          </ul>
        </template>
      </UCollapsible>
    </div>

    <!-- Sync-Zustand: ohne Topbar zeigt ihn die Sidebar (nur Abweichungen). -->
    <Transition name="bw-sync">
      <p v-if="syncState" class="bw-label mt-4 flex items-center gap-1.5 px-2" style="color: var(--bw-muted)">
        <UIcon :name="SYNC[syncState].icon" :class="SYNC[syncState].spin ? 'animate-spin' : ''" class="size-4" />
        {{ t(SYNC[syncState].key) }}
      </p>
    </Transition>

    <!-- Erklär-Layer — 1:1 aus BwProgressRail. -->
    <UModal v-model:open="infoOpen">
      <template #content>
        <div v-if="infoStep" class="bw-root relative max-h-[85vh] overflow-y-auto p-8" style="background: var(--bw-surface-hi)">
          <button
            class="absolute right-5 top-5 grid size-8 place-items-center rounded-full transition-colors hover:bg-[var(--bw-line)]"
            :aria-label="t('brand.common.close')"
            @click="infoStep = null"
          >
            <UIcon name="i-ph-x" class="size-4.5" style="color: var(--bw-ink-soft)" />
          </button>
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ infoStep.layerLabel }}</p>
          <h2 class="mt-1 text-[28px] font-extralight leading-tight tracking-tight">{{ infoStep.step.label }}</h2>
          <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ infoStep.step.info!.description }}</p>

          <p class="bw-label mt-6" style="color: var(--bw-muted)">{{ t('brand.workspace.decisions') }}</p>
          <ul class="mt-2 space-y-2.5">
            <li v-for="b in infoStep.step.info!.bausteine" :key="b.label" class="flex items-start gap-3">
              <span class="mt-0.5 grid size-6 flex-none place-items-center rounded-full" :style="b.done ? 'background: var(--bw-accent-soft)' : 'background: var(--bw-surface)'">
                <UIcon :name="b.done ? 'i-ph-check' : 'i-ph-circle'" class="size-3.5" :style="b.done ? 'color: var(--bw-accent)' : 'color: var(--bw-muted)'" />
              </span>
              <span class="min-w-0">
                <span class="block text-sm font-medium">{{ b.label }}</span>
                <span class="block text-sm" style="color: var(--bw-ink-soft)">{{ b.note }}</span>
              </span>
            </li>
          </ul>

          <div class="mt-7">
            <div class="flex items-baseline justify-between gap-3">
              <p class="bw-label uppercase tracking-wider" style="color: var(--bw-muted)">
                {{ infoStep.step.slots ?? t('brand.workspace.progress', { filled: infoStep.step.info!.bausteine.filter(b => b.done).length, total: infoStep.step.info!.bausteine.length }) }}<template v-if="infoStep.step.info!.minutes"> · {{ infoStep.step.info!.minutes }}</template>
              </p>
              <span class="bw-label uppercase tracking-wider">{{ infoPct }}&thinsp;%</span>
            </div>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full" style="background: var(--bw-line)">
              <div class="h-full rounded-full transition-all" :style="`width: ${infoPct}%; background: var(--bw-accent)`" />
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </nav>
</template>

<style scoped>
.gd-switch:hover, .gd-switch:focus-visible { background: var(--bw-surface-hi); }
.gd-row:not(:disabled):hover { background: var(--bw-surface-hi); }
/* Info-Icons ruhen, bis die Zeile Hover/Fokus hat — sie bleiben fokussierbar. */
.gd-info { opacity: 0; transition: opacity 120ms; }
.gd-row:hover .gd-info, .gd-row:focus-within .gd-info, .gd-info:focus-visible { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .gd-info { transition: none; } }
</style>
