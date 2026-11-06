<script setup lang="ts">
/** Gesamt-Fortschritt + Branding-Einstieg unten in der Rail — aus
 *  BwWorkspace extrahiert (Runde 191), weil die Rail seit dem Splitter
 *  in ZWEI Zweigen lebt (Grid-Fallback + Splitter-Panel) und der Fuß
 *  nur eine Quelle haben darf. */
withDefaults(defineProps<{
  progressPct: number
  progressNote?: string
  progressSubnote?: string
  progressTo?: string
  score?: number
  /* Runde 14 (David, 2026-09-02): Karte und Fortschritt dürfen GETRENNT
   * wohnen — „Euer Branding" unten rechts im Stand, die Zahlen + der Balken
   * unten links in der Leiste. `progress: false` lässt nur die Karte stehen;
   * für „nur Zahlen" reicht es, kein `progressTo` zu übergeben. */
  progress?: boolean
  /* Runde 16 (David, 2026-09-02): dreizeilige Fassung — Titel + Prozent /
   * Balken / Zähler + Zeit. Aktiv, sobald `progressTitle` gesetzt ist;
   * ohne ihn bleibt die einzeilige Note-Fassung (Alt-Seiten unverändert). */
  progressTitle?: string
  progressCount?: string
  progressTime?: string
}>(), {
  progressNote: undefined,
  progressSubnote: undefined,
  progressTo: undefined,
  score: undefined,
  progress: true,
  progressTitle: undefined,
  progressCount: undefined,
  progressTime: undefined,
})
/* `progressNote`/`progressSubnote` reicht die Seite übersetzt herein —
 * eigen ist hier nur die Beschriftung des Branding-Einstiegs. */
const { t } = useI18n()
</script>

<template>
  <div class="flex-none pt-5">
    <NuxtLink
      v-if="progressTo" :to="progressTo"
      class="flex w-full items-center gap-3 rounded-full py-2.5 pl-2 pr-2 text-left text-sm"
      :class="progress ? 'mb-4' : ''"
      style="background: var(--bw-surface-hi); box-shadow: var(--bw-shadow-card)"
    >
      <!-- Runde 13 (David): der Brand Score STEHT VORNE und ersetzt das
           Sparkle-Icon — er ist die Information, das Icon war Schmuck.
           Das Sparkle bleibt nur als Fallback, wenn (noch) kein Score da ist. -->
      <BwScoreRing v-if="score !== undefined" :value="score" :size="28" class="flex-none" />
      <span v-else class="grid size-7 flex-none place-items-center rounded-full" style="background: var(--bw-accent-soft)">
        <UIcon name="i-ph-sparkle" class="size-4" style="color: var(--bw-accent)" />
      </span>
      <span class="min-w-0 flex-1 font-medium">{{ t('brand.workspace.ourBranding') }}</span>
      <span class="grid size-7 flex-none place-items-center rounded-full">
        <UIcon name="i-ph-arrow-right" class="size-4" style="color: var(--bw-ink-soft)" />
      </span>
    </NuxtLink>
    <template v-if="progress && progressTitle">
      <div class="flex items-baseline justify-between gap-3">
        <p class="bw-label uppercase tracking-wider" style="color: var(--bw-muted)">{{ progressTitle }}</p>
        <span class="bw-label flex-none uppercase tracking-wider whitespace-nowrap">{{ progressPct }}&thinsp;%</span>
      </div>
      <div class="mt-2 h-1.5 overflow-hidden rounded-full" style="background: var(--bw-line)">
        <div class="h-full rounded-full transition-all" :style="`width: ${progressPct}%; background: var(--bw-accent)`" />
      </div>
      <div class="mt-2 flex items-baseline justify-between gap-3">
        <span class="bw-label tabular-nums" style="color: var(--bw-muted)">{{ progressCount }}</span>
        <span class="bw-label flex-none whitespace-nowrap" style="color: var(--bw-muted)">{{ progressTime }}</span>
      </div>
    </template>
    <template v-else-if="progress">
      <div class="flex items-baseline justify-between gap-3">
        <p v-if="progressNote" class="bw-label uppercase tracking-wider" style="color: var(--bw-muted)">
          {{ progressNote }}
          <span v-if="progressSubnote" class="block">{{ progressSubnote }}</span>
        </p>
        <span class="bw-label flex-none uppercase tracking-wider whitespace-nowrap">{{ progressPct }}&thinsp;%</span>
      </div>
      <div class="mt-2 h-1.5 overflow-hidden rounded-full" style="background: var(--bw-line)">
        <div class="h-full rounded-full transition-all" :style="`width: ${progressPct}%; background: var(--bw-accent)`" />
      </div>
    </template>
  </div>
</template>
