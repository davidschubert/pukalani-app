<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { BrandSlotControls } from '../../shared/brandSlotControls'
import type { BrandSlot } from '../../shared/slotRegistry'
import type { BrandGenerationVersionsResponse } from '../../shared/types/brand'

/**
 * FRÜHERE FASSUNGEN EINES FELDS — aus der Werkstatt-Seite geschnitten (WS1,
 * Kapitel „Modale").
 *
 * DIE WIEDERHERSTELLUNG SCHREIBT IN DEN EDITOR, NICHT AUF DEN SERVER — eine
 * gewöhnliche lokale Eingabe über den NORMALEN Autosave, mit derselben
 * `revision`-Rechnung wie jeder Tastendruck. Deshalb meldet dieser Dialog die
 * Wahl nur (`use`); die Seite legt sie in den Store und plant den Autosave.
 *
 * Offen ist der Dialog, solange ein Feld gewählt ist (`v-model:slot`). Die
 * Historie holt er selbst — nichts sonst auf der Seite liest sie.
 */
const props = defineProps<{
  profileId: string
  stepKey: string
  /** Die Beschriftung des Felds (Bühne und Log rechnen sie an EINER Stelle). */
  label: string
  /** Auf einem bestätigten Slot ist die Liste lesbar, die Übernahme nicht. */
  controls: BrandSlotControls | null
}>()

const emit = defineEmits<{ use: [text: string] }>()

const slot = defineModel<BrandSlot | null>('slot', { required: true })

const { t, locale } = useI18n()

const versions = ref<BrandGenerationVersionsResponse | null>(null)
const loading = ref(false)

const open = computed({
  get: () => slot.value !== null,
  set: (value: boolean) => { if (!value) slot.value = null },
})

watch(slot, async (current) => {
  if (!current) return
  versions.value = null
  loading.value = true
  try {
    versions.value = await $fetch<BrandGenerationVersionsResponse>(
      `/api/brand/profiles/${props.profileId}/steps/${props.stepKey}/generations`,
      { query: { slotId: current.id } },
    )
  }
  catch {
    // Eine unlesbare Historie ist kein Grund, die Werkstatt zu stören.
    versions.value = null
  }
  finally {
    loading.value = false
  }
})

function useVersion(text: string): void {
  if (!slot.value) return
  emit('use', text)
  slot.value = null
}
</script>

<template>
  <!-- Frühere Fassungen: Auswahl schreibt in den EDITOR, gespeichert wird über
       den normalen Autosave (kein eigener Schreibweg — s. `useVersion`). -->
  <UModal v-model:open="open" :title="t('brand.workspace.versions.title')">
    <template #content>
      <div class="bw-root bw-overlay max-h-[85vh] overflow-y-auto p-8">
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
          {{ slot ? props.label : '' }}
        </p>
        <h2 class="mt-1 text-2xl font-extralight leading-tight tracking-tight">{{ t('brand.workspace.versions.title') }}</h2>
        <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.workspace.versions.description') }}</p>

        <!-- Lesen ja, übernehmen nein — s. `controls`. -->
        <p v-if="props.controls && !props.controls.canRestoreVersion" class="bw-pending mt-3">
          {{ t('brand.workspace.versions.confirmedLock') }}
        </p>

        <p v-if="loading" class="bw-pending mt-5">{{ t('brand.workspace.versions.loading') }}</p>

        <template v-else>
          <div v-for="item in versions?.items ?? []" :key="item.generationId" class="mt-5">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <p class="bw-label" style="color: var(--bw-muted)">
                {{ new Date(item.createdAt).toLocaleString(locale) }} · {{ item.model }} · {{ item.promptVersion }}
              </p>
              <UButton
                size="xs" variant="outline" color="neutral" class="rounded-full"
                :disabled="!item.draft || props.controls?.canRestoreVersion === false"
                :label="t('brand.workspace.versions.use')"
                @click="useVersion(item.draft ?? '')"
              />
            </div>
            <p v-if="item.draft" class="mt-1 whitespace-pre-wrap rounded-xl p-3 text-sm" style="background: var(--bw-surface)">{{ item.draft }}</p>
            <!-- Ein Eintrag ohne Text ist dem Spalten-Deckel gewichen; seine
                 Herkunft bleibt sichtbar, damit die Lücke erklärt ist. -->
            <p v-else class="bw-pending mt-1">{{ t('brand.workspace.versions.dropped') }}</p>
          </div>

          <div v-if="versions?.firstDraft" class="mt-6 border-t pt-4" style="border-color: var(--bw-line)">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <p class="bw-label" style="color: var(--bw-muted)">{{ t('brand.workspace.versions.first') }}</p>
              <UButton
                size="xs" variant="outline" color="neutral" class="rounded-full"
                :disabled="props.controls?.canRestoreVersion === false"
                :label="t('brand.workspace.versions.use')"
                @click="useVersion(versions.firstDraft ?? '')"
              />
            </div>
            <p class="mt-1 whitespace-pre-wrap rounded-xl p-3 text-sm" style="background: var(--bw-surface)">{{ versions.firstDraft }}</p>
          </div>

          <p v-if="!versions?.items.length && !versions?.firstDraft" class="bw-pending mt-5">
            {{ t('brand.workspace.versions.empty') }}
          </p>
        </template>

        <div class="mt-6 flex justify-end">
          <UButton
            variant="ghost" color="neutral" class="rounded-full"
            :label="t('brand.workspace.versions.close')" @click="slot = null"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
