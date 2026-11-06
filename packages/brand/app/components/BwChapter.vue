<script setup lang="ts">
/** Dokument-Kapitel mit Zustandssprache (§3d-Matrix): Kennzeichen ist
 *  immer Icon + Text, nie nur Farbe. Entwürfe tragen die Handschrift der
 *  STIMME dieses Kapitels — George in der Foundation, Frida in Schicht 2
 *  (D8). Deshalb nennt `voiceName` sie von aussen; der Vorgabewert ist
 *  `BRAND_VOICE`, weil das Kapitel ohne Angabe ein Foundation-Kapitel ist. */
import { BRAND_VOICE } from '../../shared/brandAdvisors'

const props = withDefaults(defineProps<{
  title: string
  state: 'empty' | 'active' | 'generating' | 'draft' | 'edited' | 'confirmed' | 'stale'
  staleNote?: string
  /** Vorname der Stimme, die in diesem Kapitel entwirft. */
  voiceName?: string
  /**
   * DER KAPITEL-BALKEN (Davids Live-Walkthrough, 2026-09-02) — bestätigte
   * Entscheidungen von allen möglichen DIESES Kapitels, gerechnet in
   * `brandChapterProgress`. Er bleibt beim Scrollen oben stehen: die
   * Kopfzeile wandert weg, die Auskunft „3/7" nicht.
   *
   * `progressTotal: 0` (oder fehlend) heisst „dieses Kapitel hat nichts zu
   * zählen" — dann erscheint die Linie gar nicht. Ein Balken über einem
   * leeren Nenner stünde für immer auf null und sähe aus wie Stillstand.
   */
  progressConfirmed?: number
  progressTotal?: number
}>(), {
  staleNote: undefined,
  voiceName: BRAND_VOICE.name,
  progressConfirmed: undefined,
  progressTotal: undefined,
})

const showProgress = computed(() => (props.progressTotal ?? 0) > 0)
const progressPct = computed(() => (showProgress.value
  ? Math.round(((props.progressConfirmed ?? 0) / (props.progressTotal ?? 1)) * 100)
  : 0))
defineEmits<{ confirm: [] }>()
const { t } = useI18n()
/* `draft` liest BEWUSST `brand.workspace.draftBadge` statt eines eigenen
 * Schlüssels: das ist derselbe Satz, den die Werkstatt-Seite über einem
 * Entwurf zeigt — zwei Schlüssel wären zwei Wortlaute. */
const STATE = {
  empty: { key: 'brand.workspace.chapterState.empty', icon: 'i-ph-circle-dashed', cls: '' },
  active: { key: 'brand.workspace.chapterState.active', icon: 'i-ph-circle-half-fill', cls: '' },
  generating: { key: 'brand.workspace.chapterState.generating', icon: 'i-ph-circle-notch', cls: '' },
  draft: { key: 'brand.workspace.draftBadge', icon: 'i-ph-pen-nib', cls: 'bw-state--draft' },
  edited: { key: 'brand.workspace.chapterState.edited', icon: 'i-ph-user-focus', cls: 'bw-state--draft' },
  confirmed: { key: 'brand.workspace.chapterState.confirmed', icon: 'i-ph-check', cls: 'bw-state--confirmed' },
  stale: { key: 'brand.workspace.chapterState.stale', icon: 'i-ph-clock-counter-clockwise', cls: 'bw-state--stale' },
} as const
const stateMeta = computed(() => {
  const meta = STATE[props.state]
  return { label: t(meta.key, { voice: props.voiceName }), icon: meta.icon, cls: meta.cls }
})

/* Iteration 2: der Abschluss-Moment — beim Übergang zu 'confirmed'
 *  blitzt das Kapitel einmal in der Fertig-Farbe auf (reduced-motion
 *  respektiert die CSS). */
const celebrating = ref(false)
watch(() => props.state, (next, prev) => {
  if (next === 'confirmed' && prev && prev !== 'confirmed') {
    celebrating.value = true
    setTimeout(() => { celebrating.value = false }, 1500)
  }
})
</script>

<template>
  <section class="bw-chapter" :class="celebrating ? 'bw-celebrate' : ''">
    <div class="mb-3 flex items-center justify-between gap-3">
      <h2 class="text-lg">{{ title }}</h2>
      <span class="bw-state" :class="stateMeta.cls"><UIcon :name="stateMeta.icon" /> {{ stateMeta.label }}</span>
    </div>

    <!-- Sticky: die Kopfzeile scrollt weg, der Stand bleibt. -->
    <div v-if="showProgress" class="bw-chapter-progress mb-4 flex items-center gap-3">
      <div
        class="bw-chapter-progress-track min-w-0 flex-1"
        role="progressbar"
        :aria-valuenow="progressConfirmed ?? 0"
        aria-valuemin="0"
        :aria-valuemax="progressTotal"
        :aria-label="t('brand.workspace.chapterProgress.label')"
      >
        <div class="bw-chapter-progress-fill" :style="`inline-size: ${progressPct}%`" />
      </div>
      <span class="bw-label flex-none tabular-nums" style="color: var(--bw-muted)">
        {{ progressConfirmed ?? 0 }}/{{ progressTotal }}
      </span>
    </div>
    <p v-if="state === 'stale' && staleNote" class="bw-label mb-3 flex items-start gap-1.5" style="color: var(--bw-stale)">
      <UIcon name="i-ph-arrow-elbow-down-right" class="mt-0.5 size-3.5 flex-none" />
      <span class="min-w-0">{{ staleNote }}</span>
    </p>
    <div :class="state === 'draft' || state === 'edited' ? 'bw-draft-frame' : ''">
      <slot />
    </div>
    <div v-if="state === 'draft' || state === 'edited'" class="mt-3 flex justify-end gap-2">
      <UButton size="sm" color="neutral" variant="outline" icon="i-ph-pencil-simple" :label="t('brand.workspace.adjust')" />
      <UButton size="sm" icon="i-ph-check" :label="t('brand.workspace.confirmSlot')" @click="$emit('confirm')" />
    </div>
  </section>
</template>
