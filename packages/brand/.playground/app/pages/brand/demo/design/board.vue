<script setup lang="ts">
import type { BwSidebarBrand } from '../../../../../../app/components/BwWorkspaceSidebar.vue'
import { DS_BRAND, DS_CHAPTERS, dsChapterPath } from '../../../../utils/demoDesign'
import { demoRailWithDesign } from '../../../../utils/demoRail'

/**
 * DAS ERGEBNIS-BOARD ALS EIGENE ANSICHT (Konzept docs/archiv/BRAND-DESIGN.md
 * §2.8, Davids Entscheidung 2026-09-08) — die künftige Route
 * `/brand/:id/design`: LESEN, nicht entscheiden.
 *
 * Dieselbe Hülle wie die Leseansicht der Foundation (BwWorkspace ohne Topbar,
 * Rail links, rechte Spalte), aber die BREITE Bühne der Werkstatt (72 rem):
 * ein Board ist eine Fläche, kein Fließtext. Rechts steht kein Inhaltsver-
 * zeichnis (es gibt nur eine Fläche), sondern der Weg zurück in die Kapitel —
 * korrigiert wird dort, nie hier.
 */
const railLayers = computed(() => demoRailWithDesign({ unlocked: true, done: true }))

const sidebarBrands: BwSidebarBrand[] = [
  { id: 'kailua', title: 'Kailua Coffee Co.', path: 'Neue Marke', flag: 'i-circle-flags-us', current: true },
  { id: 'schubert', title: 'Schubert UX Studio', path: 'Marken-Relaunch', flag: 'i-circle-flags-de', to: '/brand/demo/archetyp' },
]

const railCollapsed = ref(false)
const asideCollapsed = ref(false)

function print(): void {
  if (import.meta.client) window.print()
}

useHead({ title: `Visuelle Identität · ${DS_BRAND.title}` })
</script>

<template>
  <BwWorkspace
    class="fd-page"
    stage-width="72rem"
    :progress-pct="100"
    content-locale="de"
    :locale-in-topbar="false"
    :topbar="false"
    :rail-footer="false"
    rail-width="300px"
    :rail-collapsed="railCollapsed"
    :george-collapsed="asideCollapsed"
    initial-mode="stage"
    style="--bw-rail-pad-x: 1rem; --bw-rail-pad-y: 0.75rem"
  >
    <template #rail>
      <BwWorkspaceSidebar
        :layers="railLayers"
        :brands="sidebarBrands"
        @select="() => {}"
        @select-brand="to => navigateTo(to)"
      />
    </template>

    <template #stage-bar>
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <UButton
          size="sm" color="neutral" variant="ghost"
          icon="i-ph-sidebar-simple"
          :aria-label="railCollapsed ? 'Navigation einblenden' : 'Navigation ausblenden'"
          @click="railCollapsed = !railCollapsed"
        />
        <div class="min-w-0 leading-tight">
          <p class="bw-label uppercase tracking-wider" style="color: var(--bw-muted)">Brand Design</p>
          <p class="truncate font-semibold">Visuelle Identität</p>
        </div>
        <div class="ml-auto flex flex-none items-center gap-1.5">
          <UButton
            size="sm" color="neutral" variant="ghost" icon="i-ph-printer"
            label="Drucken / PDF" class="max-sm:hidden" @click="print"
          />
          <UButton
            size="sm" color="neutral" variant="ghost" class="max-sm:hidden"
            to="/brand/demo/foundation?design=done#visuell" icon="i-ph-book-open" label="Im Dokument lesen"
          />
          <UButton
            size="sm" color="neutral" variant="ghost" class="max-md:hidden"
            icon="i-ph-sidebar-simple" :ui="{ leadingIcon: '-scale-x-100' }"
            :aria-label="asideCollapsed ? 'Seitenleiste einblenden' : 'Seitenleiste ausblenden'"
            @click="asideCollapsed = !asideCollapsed"
          />
        </div>
      </div>
    </template>

    <template #default>
      <div class="flex flex-col gap-6 pb-6">
        <p class="fd-print-head bw-label">{{ DS_BRAND.title }} · Visuelle Identität · Stand {{ DS_BRAND.standDate }}</p>
        <div>
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Ergebnis-Board</p>
          <h1 class="mt-1 text-3xl font-extralight leading-tight tracking-tight">Visuelle Identität auf einer Fläche</h1>
          <p class="bw-label mt-2" style="color: var(--bw-muted)">
            Farbwelt, Schriftpaar, Zeichen, Bild-Prinzipien und Bewegung — abgenommen am {{ DS_BRAND.standDate }}. Dasselbe Board steht als Kopf von Kapitel 10 in eurer Foundation.
          </p>
        </div>

        <FdDesignBoard />

        <p class="fd-noprint bw-pending">Dieses Board entscheidet nichts. Korrigiert wird in den Kapiteln — rechts der Weg dorthin.</p>
      </div>
    </template>

    <template #george>
      <div class="flex min-h-0 flex-1 flex-col">
        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Korrigieren</p>
          <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            Jede Fläche des Boards gehört zu einem Kapitel. Wer etwas ändern will, geht dorthin — das Board zieht nach.
          </p>
          <ul class="mt-4 flex flex-col gap-1">
            <li v-for="chapter in DS_CHAPTERS" :key="chapter.key">
              <NuxtLink
                :to="dsChapterPath(chapter.key)"
                class="bw-frame flex items-center gap-3 px-3 py-2 text-sm"
                style="background: var(--bw-surface)"
              >
                <UIcon name="i-ph-check-circle-fill" class="size-4 flex-none" style="color: var(--bw-accent)" />
                <span class="min-w-0 flex-1 truncate">{{ chapter.label }}</span>
                <UIcon name="i-ph-arrow-right" class="size-4 flex-none" style="color: var(--bw-muted)" />
              </NuxtLink>
            </li>
          </ul>

          <p class="bw-label mt-6 uppercase tracking-widest" style="color: var(--bw-muted)">Was hier nicht steht</p>
          <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            Eure Vorbilder und die behaltenen KI-Entwürfe. Beides ist privat und reist weder ins Board noch in den geteilten Link.
          </p>
        </div>
        <div class="flex-none border-t px-6 pb-5" style="border-color: var(--bw-line)">
          <BwRailFooter :progress-pct="100" progress-title="Brand Design" :progress-count="`${DS_CHAPTERS.length}/${DS_CHAPTERS.length}`" />
        </div>
      </div>
    </template>
  </BwWorkspace>
</template>

<style>
/* Druck wie die Leseansicht der Foundation (dort begründet): nicht `scoped`,
 * weil die Zonen der Werkstatt fremde Komponenten sind; `.fd-page` hält die
 * Regeln bei dieser Seite. */
.fd-print-head { display: none; }
@media print {
  .fd-page header,
  .fd-page .bw-rail,
  .fd-page .bw-stage-bar,
  .fd-page .bw-george,
  .fd-page .bw-modeswitch { display: none !important; }
  .fd-page,
  .fd-page .bw-shell { display: block !important; height: auto !important; }
  .fd-page .bw-stage { overflow: visible !important; padding: 0 !important; }
  .fd-page .bw-stage-inner { max-width: none !important; }
  .fd-page .fd-print-head { display: block; }
  .fd-page .fd-noprint { display: none !important; }
}
</style>
