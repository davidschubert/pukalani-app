<script setup lang="ts">
import type { BwSidebarBrand } from '../../../app/components/BwWorkspaceSidebar.vue'
import { type DsChapterKey, DS_ADVISOR, DS_ADVISOR_MOVES, DS_CHAPTERS, dsChapter, dsChapterPath } from '../utils/demoDesign'
import { demoRailWithDesign } from '../utils/demoRail'

/**
 * DIE HÜLLE DER SECHS BRAND-DESIGN-KAPITEL (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.1: „Schicht 2 derselben Werkstatt").
 *
 * Das Chrome ist das der Werkstatt (`pages/brand/demo/gespraech.vue`): drei
 * Zonen, keine Topbar, Nav-Spalte links, Balken über der Bühne, rechte Spalte
 * mit der Beraterin. Zwei Unterschiede, beide aus dem Konzept:
 *
 *  1. **Die Bühne ist die ARBEIT, nicht das Gespräch.** Ein Design-Kapitel
 *     entscheidet an Szenen, Rampen und Setzungen — die stehen in der Mitte,
 *     wo im Foundation-Gespräch die Züge stehen. Rechts begründet Frida in
 *     zwei bis drei Zügen, warum der Vorschlag so aussieht (§2.2 ff.).
 *  2. **Die Beraterin ist Frida**, nicht George: Schicht 2 gehört ihr
 *     (§2.1). George bleibt der Gastgeber der Foundation — hier taucht er
 *     nur auf, wenn eine Strategie-Frage zurückgeht.
 *
 * Die Seiten füllen nur die Bühne; alles andere (Rail, Balken, Frida-Spalte,
 * Fortschritt, Weiter-Weg) steht EINMAL hier. Sechs Seiten mit sechsmal
 * demselben Rahmen wären sechs Stellen zum Auseinanderlaufen.
 */
const props = defineProps<{
  chapter: DsChapterKey
}>()

const chapter = computed(() => dsChapter(props.chapter))
const index = computed(() => DS_CHAPTERS.findIndex(entry => entry.key === props.chapter))
const previous = computed(() => (index.value > 0 ? DS_CHAPTERS[index.value - 1] ?? null : null))
const next = computed(() => DS_CHAPTERS[index.value + 1] ?? null)
const moves = computed(() => DS_ADVISOR_MOVES[props.chapter])

const railLayers = computed(() => demoRailWithDesign({ active: props.chapter }))

const sidebarBrands: BwSidebarBrand[] = [
  { id: 'kailua', title: 'Kailua Coffee Co.', path: 'Neue Marke', flag: 'i-circle-flags-us', current: true },
  { id: 'schubert', title: 'Schubert UX Studio', path: 'Marken-Relaunch', flag: 'i-circle-flags-de', to: '/brand/demo/archetyp' },
]

/* Fortschritt der SCHICHT, nicht der Foundation: sechs Kapitel, das laufende
 * zählt noch nicht mit (es ist ja gerade offen). */
const doneCount = computed(() => index.value)
const progressPct = computed(() => Math.round((doneCount.value / DS_CHAPTERS.length) * 100))

const railCollapsed = ref(false)
const standCollapsed = ref(false)
const advisorInfoOpen = ref(false)

useHead({ title: `Brand Design · ${chapter.value.label}` })
</script>

<template>
  <BwWorkspace
    stage-width="72rem"
    :progress-pct="progressPct"
    content-locale="de"
    :locale-in-topbar="false"
    :topbar="false"
    :rail-footer="false"
    rail-width="300px"
    :rail-collapsed="railCollapsed"
    :george-collapsed="standCollapsed"
    initial-mode="stage"
    style="--bw-rail-pad-x: 1rem; --bw-rail-pad-y: 0.75rem"
  >
    <template #rail>
      <BwWorkspaceSidebar
        :layers="railLayers"
        :brands="sidebarBrands"
        @select="() => {}"
        @select-brand="to => navigateTo(to)"
        @select-session="() => {}"
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
          <p class="truncate font-semibold">{{ chapter.label }}</p>
        </div>
        <div class="ml-auto flex flex-none items-center gap-1.5">
          <UButton
            size="sm" color="neutral" variant="ghost" class="max-sm:hidden"
            to="/brand/demo/foundation?design=done" icon="i-ph-book-open" label="Euer Branding"
          />
          <UButton
            size="sm" color="neutral" variant="ghost"
            icon="i-ph-sidebar-simple" :ui="{ leadingIcon: '-scale-x-100' }"
            :aria-label="standCollapsed ? 'Frida einblenden' : 'Frida ausblenden'"
            @click="standCollapsed = !standCollapsed"
          />
        </div>
      </div>
    </template>

    <template #default>
      <!-- ABSTAND DER ABSCHNITTE (Davids Korrektur am Prototyp, 2026-09-08):
           4 rem statt 2 rem zwischen den Sessions eines Kapitels — jede
           Session ist ein eigener Entscheidungsblock mit Text UND Optionen;
           mit 2 rem lasen sie sich als eine Textwüste. Gilt für alle sechs
           Kapitel, weil sie direkte Kinder dieser Spalte sind. -->
      <div class="flex flex-col gap-16 pb-4">
        <div>
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
            Kapitel {{ index + 1 }} von {{ DS_CHAPTERS.length }} · {{ chapter.minutes }}
          </p>
          <h1 class="mt-1 text-3xl font-extralight leading-tight tracking-tight">{{ chapter.label }}</h1>
          <p class="bw-label mt-2" style="color: var(--bw-muted)">{{ chapter.note }}</p>
        </div>

        <slot />

        <!-- DER WEG WEITER. Die Rail sperrt kommende Kapitel (sie sind noch
             nicht dran) — im Klickdummy ist das hier der Durchgang. -->
        <div class="flex flex-wrap items-center gap-2 border-t pt-5" style="border-color: var(--bw-line)">
          <UButton
            v-if="previous" :to="dsChapterPath(previous.key)" :label="`Zurück zu ${previous.label}`"
            color="neutral" variant="ghost" icon="i-ph-arrow-left" class="rounded-full"
          />
          <UButton
            v-if="next" :to="dsChapterPath(next.key)" :label="`Weiter zu ${next.label}`"
            color="neutral" variant="outline" trailing-icon="i-ph-arrow-right"
            class="ml-auto rounded-full" style="background: var(--bw-surface-hi)"
          />
          <UButton
            v-else to="/brand/demo/design/board" label="Visuelle Identität ansehen"
            color="neutral" variant="outline" trailing-icon="i-ph-arrow-right"
            class="ml-auto rounded-full" style="background: var(--bw-surface-hi)"
          />
        </div>
      </div>
    </template>

    <!-- RECHTS: Frida. Zwei bis drei Züge, die den Vorschlag BEGRÜNDEN — kein
         Chat-Prompt: in diesem Kapitel antwortet man mit Klicks auf der Bühne,
         nicht mit Text (§2.2 ff.). -->
    <template #george>
      <div class="flex min-h-0 flex-1 flex-col">
        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <button
            class="flex w-full items-center gap-3 text-left"
            aria-label="Über Frida Martens" @click="advisorInfoOpen = true"
          >
            <BwGeorgeAvatar size="md" :initial="DS_ADVISOR.initial" :alt="DS_ADVISOR.name" />
            <span class="min-w-0 leading-tight">
              <span class="block text-sm font-medium">{{ DS_ADVISOR.name }}</span>
              <span class="bw-label block" style="color: var(--bw-muted)">{{ DS_ADVISOR.role }}</span>
            </span>
            <UIcon name="i-ph-info" class="ms-auto size-4 flex-none" style="color: var(--bw-muted)" />
          </button>

          <div class="mt-5 flex flex-col gap-5">
            <div v-for="move in moves" :key="move.id" class="bw-msg">
              <div class="bw-msg-body">
                <p class="whitespace-pre-wrap text-sm leading-relaxed">{{ move.text }}</p>
                <p v-if="move.help" class="bw-msg-help">{{ move.help }}</p>
              </div>
            </div>
          </div>

          <p class="bw-pending mt-6">
            Klickdummy: Fridas Züge sind geschrieben, nicht erzeugt — die Werkstatt-Mechanik (Bestätigen, Korrigieren, Abnahme) ist die der Foundation.
          </p>
        </div>

        <div class="flex-none border-t px-6 pb-5" style="border-color: var(--bw-line)">
          <BwRailFooter
            :progress-pct="progressPct" progress-title="Brand Design"
            :progress-count="`${doneCount}/${DS_CHAPTERS.length}`" progress-time="ca. 35 Min"
          />
        </div>
      </div>
    </template>
  </BwWorkspace>

  <UModal v-model:open="advisorInfoOpen">
    <template #content>
      <div class="bw-root p-7" style="background: var(--bw-surface-hi)">
        <div class="flex items-center gap-3">
          <BwGeorgeAvatar :initial="DS_ADVISOR.initial" :alt="DS_ADVISOR.name" />
          <span class="min-w-0 leading-tight">
            <span class="block text-base font-medium">{{ DS_ADVISOR.name }}</span>
            <span class="bw-label block" style="color: var(--bw-muted)">{{ DS_ADVISOR.role }}</span>
          </span>
          <UButton
            size="xs" color="neutral" variant="ghost" class="ml-auto rounded-full"
            icon="i-ph-x" aria-label="Schließen" @click="advisorInfoOpen = false"
          />
        </div>
        <p class="bw-doc-text mt-4">{{ DS_ADVISOR.desc }}</p>
        <p class="bw-label mt-4 leading-relaxed" style="color: var(--bw-muted)">{{ DS_ADVISOR.personal }}</p>
      </div>
    </template>
  </UModal>
</template>
