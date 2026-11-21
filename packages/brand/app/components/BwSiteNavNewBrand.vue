<script setup lang="ts">
import type { BwNewBrandSubmit } from './BwNewBrandModal.vue'

/**
 * „Neue Marke" aus der Kopfzeile (`BwSiteNav`) — als EIGENER Baustein, damit
 * die Kopfzeile ihn erst beim ersten Klick lädt (PERF-006, Paket 2 der Bahn 5).
 *
 * Das Fenster und `useBrandCreate()` hängen über `brandJourney` am ganzen
 * Fragen-Katalog des Wizards (rund 50 KB gepackt). Fest in der Kopfzeile
 * importiert, lud JEDE Seite von branding.supply diesen Katalog mit, auch die
 * Startseite eines Gastes, der nie eine Marke anlegt. Die Kopfzeile rendert
 * diesen Baustein deshalb erst, wenn jemand „Neue Marke" wählt
 * (`<LazyBwSiteNavNewBrand v-if>`); Verhalten und Texte sind unverändert —
 * Anlage im LIVE-Modus, danach Sprung ins erste Kapitel (2026-09-09).
 */
const open = defineModel<boolean>('open', { required: true })

const {
  contentLocales,
  creating,
  failed,
  create,
} = useBrandCreate()

async function createFromModal(payload: BwNewBrandSubmit): Promise<void> {
  if (await create(payload)) open.value = false
}
</script>

<template>
  <BwNewBrandModal
    v-model:open="open" mode="live"
    :content-locales="contentLocales" :loading="creating" :failed="failed"
    @submit="createFromModal"
  />
</template>
