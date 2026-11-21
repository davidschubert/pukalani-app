<script setup lang="ts">
import type { ListState } from '../../utils/listState'

/**
 * Die vier Zustände einer Liste an EINER Stelle (FE-004, UI-004, UI-008, Q14).
 *
 *   const { data, status, error, refresh } = await useFetch<…>(…)
 *   const state = computed(() => listState({ status: status.value, error: error.value, empty: !rows.value.length }))
 *
 *   <CoreListState :state="state" :retry="refresh" empty-icon="i-ph-users" :empty-title="…" :empty-description="…">
 *     <UTable :data="rows" :loading="isFetchLoading(status)">…</UTable>
 *   </CoreListState>
 *
 * - `loading` → `CoreLoadingState`, `error` → `CoreLoadError` mit „Noch einmal
 *   versuchen", `empty` → `CoreEmptyState` (oder Slot `empty`), `ready` → der
 *   Standard-Slot (meist `UTable`, Regel B6). „Filter ohne Treffer" bleibt im
 *   `#empty` der Tabelle: das ist ein Zustand der Daten, nicht des Abrufs.
 * - LAYOUT: lädt, Fehler und leer stehen in einem Kasten derselben
 *   Mindesthöhe; der Wechsel zwischen ihnen springt nicht.
 * - ANSAGE (Muster Q08): der Fehler steht in einem `role="alert"`, lädt und
 *   leer in einem `role="status"`. Beide Bereiche gibt es IMMER (auch leer),
 *   sonst sagt ein Vorleseprogramm den ersten Wechsel nicht an.
 * - Server und Browser zeichnen denselben Zweig, solange `state` aus
 *   `listState()` kommt (Q15).
 */
defineProps<{
  state: ListState
  /** Neuer Versuch im Fehler-Zustand — meist `refresh` */
  retry?: () => unknown | Promise<unknown>
  errorTitle?: string
  errorDescription?: string
  emptyIcon?: string
  emptyTitle?: string
  emptyDescription?: string
  emptyActionLabel?: string
  emptyActionIcon?: string
  emptyActionTo?: string
}>()

const emit = defineEmits<{ emptyAction: [] }>()
</script>

<template>
  <div class="contents" :data-list-state="state">
    <div role="status">
      <div v-if="state === 'loading'" class="flex min-h-56 items-center justify-center">
        <CoreLoadingState />
      </div>
      <div v-else-if="state === 'empty'" class="flex min-h-56 items-center justify-center">
        <slot name="empty">
          <CoreEmptyState
            :icon="emptyIcon"
            :title="emptyTitle ?? ''"
            :description="emptyDescription"
            :action-label="emptyActionLabel"
            :action-icon="emptyActionIcon"
            :action-to="emptyActionTo"
            @action="emit('emptyAction')"
          />
        </slot>
      </div>
    </div>
    <div role="alert">
      <div v-if="state === 'error'" class="flex min-h-56 items-center justify-center">
        <CoreLoadError :retry="retry" :title="errorTitle" :description="errorDescription" />
      </div>
    </div>
    <slot v-if="state === 'ready'" />
  </div>
</template>
