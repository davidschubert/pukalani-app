<script setup lang="ts">
/** Antwort-Karten (Davids Wunsch, Runde 29): reiche Optionen mit Titel +
 *  Beschreibung, „Empfehlung"-Kennzeichen mit aufklappbarer STRATEGISCHER
 *  Begründung (nie Bauchgefühl — der Grund kommt aus der Markenstrategie),
 *  und am Ende immer ein Feld für eine ganz eigene Antwort. */
export interface BwOptionCard {
  id: string
  label: string
  description?: string
  recommended?: boolean
  why?: string
}
defineProps<{ options: BwOptionCard[], ownPlaceholder?: string }>()
const emit = defineEmits<{ pick: [id: string], own: [text: string], dontKnow: [] }>()
const { t } = useI18n()
const openWhy = ref<string | null>(null)
const own = ref('')
function toggleWhy(id: string) {
  openWhy.value = openWhy.value === id ? null : id
}
function submitOwn() {
  if (own.value.trim()) {
    emit('own', own.value.trim())
    own.value = ''
  }
}
</script>

<template>
  <div class="flex flex-col items-stretch gap-2">
    <div
      v-for="o in options" :key="o.id"
      class="bw-option-card rounded-2xl px-4 py-3 text-left"
    >
      <button class="flex w-full items-start justify-between gap-3 text-left" @click="$emit('pick', o.id)">
        <span class="min-w-0">
          <span class="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-medium">
            {{ o.label }}<span v-if="o.recommended" class="bw-pop-chip">{{ t('brand.workspace.recommended') }}</span>
          </span>
          <span v-if="o.description" class="mt-0.5 block text-sm" style="color: var(--bw-ink-soft)">{{ o.description }}</span>
        </span>
        <span
          v-if="o.why"
          class="bw-info-btn grid size-7 flex-none place-items-center rounded-full"
          role="button" tabindex="0"
          :aria-label="t('brand.workspace.whyRecommended', { label: o.label })" :aria-expanded="openWhy === o.id"
          @click.stop="toggleWhy(o.id)" @keydown.enter.stop="toggleWhy(o.id)"
        >
          <UIcon name="i-ph-info" class="size-4.5" />
        </span>
      </button>
      <p v-if="o.why && openWhy === o.id" class="bw-label mt-2 rounded-xl px-3 py-2.5" style="background: var(--bw-surface); color: var(--bw-ink-soft)">
        {{ o.why }}
      </p>
    </div>
    <form
      class="flex items-center gap-2 rounded-2xl px-2 py-1.5"
      style="background: var(--bw-surface-hi); box-shadow: var(--bw-shadow-card)"
      @submit.prevent="submitOwn"
    >
      <UInput
        v-model="own" variant="none" class="flex-1" :ui="{ base: 'rounded-full' }"
        :placeholder="ownPlaceholder ?? t('brand.workspace.ownAnswerPlaceholder')"
      />
      <UButton type="submit" icon="i-ph-arrow-right" :aria-label="t('brand.workspace.sendOwnAnswer')" size="sm" color="neutral" variant="ghost" class="bw-send rounded-full" :disabled="!own.trim()" />
    </form>
    <!-- Interaktionsregel 5 (Audit D16): "Weiß ich nicht" hängt IMMER hinten. -->
    <button class="bw-chip bw-chip--ghost text-left" @click="emit('dontKnow')">
      {{ t('brand.workspace.dontKnow') }}
    </button>
  </div>
</template>
