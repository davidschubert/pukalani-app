<script setup lang="ts">
/**
 * Der EINE Fehler-Zustand eines Abrufs (FE-004, Q14): ein Satz, was nicht
 * geklappt hat, und genau ein nächster Schritt — „Noch einmal versuchen".
 *
 * Bewusst getrennt von `CoreEmptyState`: „konnte nicht laden" ist eine andere
 * Auskunft als „es gibt nichts". Wer beides gleich zeichnet, sagt bei einer
 * Störung „du hast keine Community".
 *
 * `retry` ist meist das `refresh` des Abrufs; solange es läuft, dreht der
 * Knopf und ist gesperrt (kein Doppelklick).
 */
const props = defineProps<{
  /** Neuer Versuch — meist `refresh` aus useFetch */
  retry?: () => unknown | Promise<unknown>
  /** Eigene Überschrift (Vorgabe: ui.listState.errorTitle) */
  title?: string
  /** Eigener Satz (Vorgabe: ui.listState.errorText) */
  description?: string
}>()

const { t } = useI18n()
const busy = ref(false)

async function onRetry(): Promise<void> {
  if (!props.retry || busy.value) return
  busy.value = true
  try {
    await props.retry()
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UEmpty
    icon="i-ph-warning-circle"
    :title="title ?? t('ui.listState.errorTitle')"
    :description="description ?? t('ui.listState.errorText')"
    data-load-error
  >
    <template v-if="retry" #actions>
      <UButton
        icon="i-ph-arrow-clockwise"
        color="neutral"
        variant="subtle"
        :label="t('ui.listState.retry')"
        :loading="busy"
        data-load-error-retry
        @click="onRetry"
      />
    </template>
  </UEmpty>
</template>
