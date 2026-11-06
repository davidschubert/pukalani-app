<script setup lang="ts">
import type { BwNewBrandSubmit } from './BwNewBrandModal.vue'

/** Brand-Auswahl (Korrekturrunde 3, David): Trigger zeigt NUR den Namen;
 *  ausgeklappt alle Brandings mit Zusatzinfo untereinander, die aktive
 *  mit Haken. "Brandings verwalten" lebt hier, nicht in der Topbar. */
defineProps<{
  current: { title: string, path: string, flag?: string }
  others: { title: string, path: string, flag?: string, to: string }[]
}>()
/* Runde 62 (David): "Neues Branding anlegen" öffnet denselben Layer wie
 * auf der Startseite — im LIVE-Modus (2026-09-09): ohne Modus zeigte das
 * Modal in die Demo. Anlage + Sprung über `useBrandCreate()`. */
const { t } = useI18n()
const newBrandOpen = ref(false)
const popoverOpen = ref(false)
const {
  contentLocales: newBrandLocales,
  creating: newBrandCreating,
  failed: newBrandFailed,
  create: createBrand,
} = useBrandCreate()

async function createFromModal(payload: BwNewBrandSubmit): Promise<void> {
  if (await createBrand(payload)) newBrandOpen.value = false
}
</script>

<template>
  <UPopover v-model:open="popoverOpen" :content="{ align: 'start' }">
    <button
      class="flex items-center gap-2 rounded-full px-4 py-1.5 text-left"
      style="background: var(--bw-surface-hi); box-shadow: var(--bw-shadow-card)"
    >
      <span class="truncate font-semibold">{{ current.title }}</span>
      <UIcon name="i-ph-caret-up-down" class="flex-none" style="color: var(--bw-muted)" />
    </button>

    <template #content>
      <div class="bw-root bw-card bw-card--menu w-72 overflow-hidden py-1.5">
        <div class="flex items-center justify-between gap-2 px-3 py-2">
          <span class="min-w-0">
            <span class="block truncate text-sm font-semibold">{{ current.title }}</span>
            <span class="bw-label flex items-center gap-1.5 truncate" style="color: var(--bw-muted)">{{ current.path }}<UIcon v-if="current.flag" :name="current.flag" class="size-4 flex-none" /></span>
          </span>
          <UIcon name="i-ph-check" class="flex-none" style="color: var(--bw-accent)" />
        </div>
        <NuxtLink
          v-for="o in others" :key="o.title" :to="o.to"
          class="flex items-center justify-between gap-2 px-3 py-2 hover:bg-(--bw-accent-soft)"
        >
          <span class="min-w-0">
            <span class="block truncate text-sm font-medium">{{ o.title }}</span>
            <span class="bw-label flex items-center gap-1.5 truncate" style="color: var(--bw-muted)">{{ o.path }}<UIcon v-if="o.flag" :name="o.flag" class="size-4 flex-none" /></span>
          </span>
        </NuxtLink>
        <div class="my-1.5 border-t" style="border-color: var(--bw-line)" />
        <button class="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-(--bw-accent-soft)" @click="popoverOpen = false; newBrandOpen = true">
          <UIcon name="i-ph-plus" style="color: var(--bw-muted)" /> {{ t('brand.nav.newBranding') }}
        </button>
        <NuxtLink to="/" class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-(--bw-accent-soft)">
          <UIcon name="i-ph-squares-four" style="color: var(--bw-muted)" /> {{ t('brand.nav.manageBrandings') }}
        </NuxtLink>
      </div>
    </template>
  </UPopover>
  <BwNewBrandModal
    v-model:open="newBrandOpen" mode="live"
    :content-locales="newBrandLocales" :loading="newBrandCreating" :failed="newBrandFailed"
    @submit="createFromModal"
  />
</template>
