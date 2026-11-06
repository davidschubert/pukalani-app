<script setup lang="ts">
import type { BwSidebarBrand } from '../../../app/components/BwWorkspaceSidebar.vue'
import { type DkChapterKey, DK_ADVISORS, DK_ADVISOR_MOVES, DK_CHAPTERS, dkChapter, dkChapterPath } from '../utils/demoKit'
import { demoRailWithKit } from '../utils/demoRail'

/**
 * DIE HÜLLE DER DREI BOOK-&-KIT-KAPITEL (Konzept docs/plans/BRAND-BOOK-KIT.md
 * §2.1: „Schicht 3 derselben Werkstatt").
 *
 * Sie ist die Schwester von `FdDesignWorkspace` und bewusst nach demselben
 * Muster gebaut: drei Zonen, keine Topbar, Rail links, Balken über der Bühne,
 * rechte Spalte mit der Beraterin. Warum trotzdem eine EIGENE Komponente und
 * kein Prop an der bestehenden:
 *
 *  1. **Die Beraterin wechselt JE KAPITEL.** In Schicht 2 ist es durchgehend
 *     Frida; hier führt Otto die Nomenklatur, Nika die AI-Guidelines und
 *     George das Pressekit (§2.10). Ein `advisor`-Prop an `FdDesignWorkspace`
 *     hieße, dass eine Komponente zwei Schichten mit zwei Rails, zwei
 *     Fortschritts-Zählern und zwei Kapitel-Registern trägt.
 *  2. **Die Rail ist eine andere** (`demoRailWithKit`): Foundation UND Design
 *     stehen auf `done`, offen ist Schicht 3.
 *
 * Die Seiten füllen nur die Bühne. Der Abstand der Sessions ist derselbe wie
 * in Schicht 2 (`gap-16`, Davids Korrektur 2026-09-08) und die Bühne ist
 * 72 rem breit — eine Werkstatt ist eine Fläche, kein Fließtext.
 */
const props = defineProps<{
  chapter: DkChapterKey
}>()

const chapter = computed(() => dkChapter(props.chapter))
const index = computed(() => DK_CHAPTERS.findIndex(entry => entry.key === props.chapter))
const previous = computed(() => (index.value > 0 ? DK_CHAPTERS[index.value - 1] ?? null : null))
const next = computed(() => DK_CHAPTERS[index.value + 1] ?? null)
const moves = computed(() => DK_ADVISOR_MOVES[props.chapter])
const advisor = computed(() => DK_ADVISORS[chapter.value.advisor])

const railLayers = computed(() => demoRailWithKit({ active: props.chapter }))

const sidebarBrands: BwSidebarBrand[] = [
  { id: 'kailua', title: 'Kailua Coffee Co.', path: 'Neue Marke', flag: 'i-circle-flags-us', current: true },
  { id: 'schubert', title: 'Schubert UX Studio', path: 'Marken-Relaunch', flag: 'i-circle-flags-de', to: '/brand/demo/archetyp' },
]

/* Fortschritt der SCHICHT: drei Kapitel, das laufende zählt noch nicht mit. */
const doneCount = computed(() => index.value)
const progressPct = computed(() => Math.round((doneCount.value / DK_CHAPTERS.length) * 100))

const railCollapsed = ref(false)
const standCollapsed = ref(false)
const advisorInfoOpen = ref(false)

useHead({ title: `Brand Book & Kit · ${chapter.value.label}` })
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
          <p class="bw-label uppercase tracking-wider" style="color: var(--bw-muted)">Brand Book &amp; Kit</p>
          <p class="truncate font-semibold">{{ chapter.label }}</p>
        </div>
        <div class="ml-auto flex flex-none items-center gap-1.5">
          <UButton
            size="sm" color="neutral" variant="ghost" class="max-sm:hidden"
            to="/brand/demo/kit" icon="i-ph-package" label="Zum Kit"
          />
          <UButton
            size="sm" color="neutral" variant="ghost" class="max-lg:hidden"
            to="/brand/demo/foundation?design=done&kit=done" icon="i-ph-book-open" label="Euer Branding"
          />
          <UButton
            size="sm" color="neutral" variant="ghost"
            icon="i-ph-sidebar-simple" :ui="{ leadingIcon: '-scale-x-100' }"
            :aria-label="standCollapsed ? `${advisor.name} einblenden` : `${advisor.name} ausblenden`"
            @click="standCollapsed = !standCollapsed"
          />
        </div>
      </div>
    </template>

    <template #default>
      <!-- gap-16 wie in Schicht 2 (Davids Korrektur 2026-09-08): jede Session
           ist ein eigener Entscheidungsblock, mit 2 rem läsen sie sich als
           eine Textwüste. -->
      <div class="flex flex-col gap-16 pb-4">
        <div>
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
            Kapitel {{ index + 1 }} von {{ DK_CHAPTERS.length }} · {{ chapter.minutes }}
          </p>
          <h1 class="mt-1 text-3xl font-extralight leading-tight tracking-tight">{{ chapter.label }}</h1>
          <p class="bw-label mt-2" style="color: var(--bw-muted)">{{ chapter.note }}</p>
          <p v-if="$slots.hint" class="mt-3 max-w-3xl text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            <slot name="hint" />
          </p>
        </div>

        <slot />

        <!-- DER WEG WEITER. Nach dem letzten Kapitel geht es NICHT ins nächste
             Kapitel, sondern auf die Lieferseite — dort liegt das Ergebnis der
             ganzen Schicht (§2.20 Nr. 2). -->
        <div class="flex flex-wrap items-center gap-2 border-t pt-5" style="border-color: var(--bw-line)">
          <UButton
            v-if="previous" :to="dkChapterPath(previous.key)" :label="`Zurück zu ${previous.label}`"
            color="neutral" variant="ghost" icon="i-ph-arrow-left" class="rounded-full"
          />
          <UButton
            v-if="next" :to="dkChapterPath(next.key)" :label="`Weiter zu ${next.label}`"
            color="neutral" variant="outline" trailing-icon="i-ph-arrow-right"
            class="ml-auto rounded-full" style="background: var(--bw-surface-hi)"
          />
          <UButton
            v-else to="/brand/demo/kit" label="Kit ansehen"
            color="neutral" variant="outline" trailing-icon="i-ph-arrow-right"
            class="ml-auto rounded-full" style="background: var(--bw-surface-hi)"
          />
        </div>
      </div>
    </template>

    <!-- RECHTS: die Beraterin des Kapitels. Zwei bis drei Züge, die den
         Vorschlag BEGRÜNDEN — kein Chat-Prompt: hier antwortet man mit Klicks
         auf der Bühne (§2.2–§2.4). -->
    <template #george>
      <div class="flex min-h-0 flex-1 flex-col">
        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <button
            class="flex w-full items-center gap-3 text-left"
            :aria-label="`Über ${advisor.name}`" @click="advisorInfoOpen = true"
          >
            <BwGeorgeAvatar size="md" :initial="advisor.initial" :alt="advisor.name" />
            <span class="min-w-0 leading-tight">
              <span class="block text-sm font-medium">{{ advisor.name }}</span>
              <span class="bw-label block" style="color: var(--bw-muted)">{{ advisor.role }}</span>
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
            Klickdummy: die Züge sind geschrieben, nicht erzeugt — die Werkstatt-Mechanik (Bestätigen, Korrigieren, Abnahme) ist die der Foundation.
          </p>
        </div>

        <div class="flex-none border-t px-6 pb-5" style="border-color: var(--bw-line)">
          <BwRailFooter
            :progress-pct="progressPct" progress-title="Book &amp; Kit"
            :progress-count="`${doneCount}/${DK_CHAPTERS.length}`" progress-time="ca. 15 Min"
          />
        </div>
      </div>
    </template>
  </BwWorkspace>

  <UModal v-model:open="advisorInfoOpen">
    <template #content>
      <div class="bw-root p-7" style="background: var(--bw-surface-hi)">
        <div class="flex items-center gap-3">
          <BwGeorgeAvatar :initial="advisor.initial" :alt="advisor.name" />
          <span class="min-w-0 leading-tight">
            <span class="block text-base font-medium">{{ advisor.name }}</span>
            <span class="bw-label block" style="color: var(--bw-muted)">{{ advisor.role }}</span>
          </span>
          <UButton
            size="xs" color="neutral" variant="ghost" class="ml-auto rounded-full"
            icon="i-ph-x" aria-label="Schließen" @click="advisorInfoOpen = false"
          />
        </div>
        <p class="bw-doc-text mt-4">{{ advisor.desc }}</p>
        <p class="bw-label mt-4 leading-relaxed" style="color: var(--bw-muted)">{{ advisor.personal }}</p>
      </div>
    </template>
  </UModal>
</template>
