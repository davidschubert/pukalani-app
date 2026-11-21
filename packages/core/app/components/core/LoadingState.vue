<script setup lang="ts">
/**
 * Der EINE Lade-Zustand einer Seite oder Liste (UI-008, Q14).
 *
 * Das Symbol kommt aus `ui.icons.loading` der App-Konfiguration — dasselbe,
 * das die Knöpfe von Nuxt UI drehen; kein zweites, handgesetztes Zeichen.
 * Für Vorleseprogramme steht daneben „Lädt …" (das Symbol selbst ist stumm).
 */
const { t } = useI18n()
const appConfig = useAppConfig()
const icon = computed(() => (appConfig.ui as { icons?: { loading?: string } } | undefined)?.icons?.loading ?? 'i-ph-circle-notch')
</script>

<template>
  <div class="flex items-center justify-center py-16" data-loading>
    <UIcon :name="icon" class="size-6 animate-spin text-muted" aria-hidden="true" />
    <span class="sr-only">{{ t('ui.listState.loading') }}</span>
  </div>
</template>
