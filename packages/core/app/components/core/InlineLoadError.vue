<script setup lang="ts">
/**
 * Der KLEINE Fehler-Zustand an Ort und Stelle (LZ1, 2026-11-22): für einen
 * Hinweis-Kasten, eine Kachel oder eine Zusatz-Auskunft, deren Abruf
 * gescheitert ist. Eine ruhige Zeile statt stillem Ausblenden — ein Ausfall
 * soll nicht aussehen wie „hier gibt es nichts".
 *
 * Für eine ganze Liste oder ein Einzelstück bleibt `CoreListState` /
 * `CoreLoadError` (großer leerer Zustand). Dieser Baustein ist bewusst klein:
 * eine Zeile, ein Satz, ein Knopf „Noch einmal versuchen".
 *
 * `retry` ist meist das `refresh` des Abrufs; solange es läuft, dreht der
 * Knopf und ist gesperrt (kein Doppelklick).
 */
const props = defineProps<{
  /** Neuer Versuch — meist `refresh` aus useFetch */
  retry?: () => unknown | Promise<unknown>
  /** Eigener Satz (Vorgabe: ui.listState.inlineError) */
  text?: string
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
  <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted" role="status" data-inline-load-error>
    <UIcon name="i-ph-warning-circle" class="size-4 shrink-0" aria-hidden="true" />
    <span>{{ text ?? t('ui.listState.inlineError') }}</span>
    <UButton
      v-if="retry"
      size="xs"
      color="neutral"
      variant="link"
      icon="i-ph-arrow-clockwise"
      :label="t('ui.listState.retry')"
      :loading="busy"
      class="px-0"
      data-inline-load-error-retry
      @click="onRetry"
    />
  </p>
</template>
