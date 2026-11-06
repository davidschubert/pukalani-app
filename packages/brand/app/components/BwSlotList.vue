<script setup lang="ts">
/** Slot-Liste je Kapitel (Davids Entscheidung, Runde 28): Fortschritt wird
 *  in BAUSTEINEN gezählt (feste Slots je Schritt), nie in Fragen — und
 *  korrigiert wird IM DOKUMENT: jeder Baustein trägt seine Antwort und
 *  einen Stift (direkt bearbeiten oder von George überarbeiten lassen). */
export interface BwSlot {
  id: string
  label: string
  value?: string
  state: 'done' | 'open' | 'stale'
}
defineProps<{ slots: BwSlot[] }>()
defineEmits<{ edit: [id: string] }>()
const { t } = useI18n()
</script>

<template>
  <div class="mt-4">
    <p class="bw-label" style="color: var(--bw-muted)">{{ t('brand.workspace.decisions') }}</p>
    <ul class="mt-2 space-y-2">
      <li
        v-for="slot in slots" :key="slot.id"
        class="flex items-center gap-3 rounded-2xl px-4 py-2.5"
        style="background: var(--bw-surface-hi)"
      >
        <span class="grid size-6 flex-none place-items-center rounded-full" :style="slot.state === 'done' ? 'background: var(--bw-accent-soft)' : 'background: var(--bw-surface)'">
          <UIcon
            :name="slot.state === 'done' ? 'i-ph-check' : slot.state === 'stale' ? 'i-ph-clock-counter-clockwise' : 'i-ph-circle'"
            class="size-3.5"
            :style="slot.state === 'done' ? 'color: var(--bw-accent)' : slot.state === 'stale' ? 'color: var(--bw-stale)' : 'color: var(--bw-muted)'"
          />
        </span>
        <span class="min-w-0 flex-1">
          <span class="bw-label block" style="color: var(--bw-muted)">{{ slot.label }}</span>
          <span v-if="slot.value" class="block truncate text-sm">{{ slot.value }}</span>
          <span v-else class="bw-pending block text-sm">{{ t('brand.workspace.stage.pending') }}</span>
        </span>
        <button
          v-if="slot.value"
          class="grid size-8 flex-none place-items-center rounded-full transition-colors hover:bg-[var(--bw-line)]"
          :aria-label="t('brand.workspace.editSlot', { label: slot.label })"
          @click="$emit('edit', slot.id)"
        >
          <UIcon name="i-ph-pencil-simple" class="size-4" style="color: var(--bw-ink-soft)" />
        </button>
      </li>
    </ul>
  </div>
</template>
