<script setup lang="ts">
import { computed, ref } from 'vue'
import { brandSlotDisplayValue } from '../../shared/brandAutosaveDiff'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * 409: BEIDE FASSUNGEN, nichts wird automatisch überschrieben (§3e) — aus der
 * Werkstatt-Seite geschnitten (WS1, Kapitel „Modale").
 *
 * Der Konflikt LEBT im Store (`store.conflict`, gesetzt vom Autosave); dieser
 * Dialog liest ihn nur und löst ihn über die eine Store-Aktion
 * `resolveWithServer()`. Die Beschriftung eines Felds rechnet die Seite (an
 * EINER Stelle für Bühne, Log und hier) und reicht sie als Funktion herein.
 */
const props = defineProps<{
  labelFor: (slotId: string) => string
}>()

const { t } = useI18n()
const store = useBrandWorkspaceStore()

const open = computed({
  get: () => store.conflict !== null,
  // Wegklicken löst den Konflikt NICHT auf — der Autosave bleibt angehalten,
  // bis eine der beiden Aktionen gewählt wurde.
  set: () => {},
})

interface ConflictRow { slotId: string, label: string, mine: string, server: string }

const rows = computed<ConflictRow[]>(() => {
  const current = store.conflict
  if (!current) return []
  return Object.keys(store.localEdits)
    .map(slotId => ({
      slotId,
      label: props.labelFor(slotId),
      mine: store.slotValue(slotId),
      server: brandSlotDisplayValue(current.slots[slotId]),
    }))
    // Nur ECHTE Abweichungen (Davids „same same"-Fund).
    .filter(row => row.mine !== row.server)
})

const copied = ref<'ok' | 'failed' | null>(null)

async function copyMine(): Promise<void> {
  const text = rows.value.map(row => `${row.label}\n${row.mine}`).join('\n\n')
  try {
    await navigator.clipboard.writeText(text)
    copied.value = 'ok'
  }
  catch {
    copied.value = 'failed'
  }
}

function loadServerVersion(): void {
  copied.value = null
  store.resolveWithServer()
}
</script>

<template>
  <UModal v-model:open="open" :title="t('brand.workspace.conflict.title')">
    <template #content>
      <div class="bw-root bw-overlay max-h-[85vh] overflow-y-auto p-8">
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-stale)">{{ t('brand.workspace.sync.conflict') }}</p>
        <h2 class="mt-1 text-2xl font-extralight leading-tight tracking-tight">{{ t('brand.workspace.conflict.title') }}</h2>
        <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.workspace.conflict.description') }}</p>

        <div v-for="row in rows" :key="row.slotId" class="mt-5">
          <p class="bw-label" style="color: var(--bw-muted)">{{ row.label }}</p>
          <div class="mt-2 grid gap-3 sm:grid-cols-2">
            <div class="rounded-xl p-3" style="background: var(--bw-surface)">
              <p class="bw-label" style="color: var(--bw-muted)">{{ t('brand.workspace.conflict.mineLabel') }}</p>
              <p class="mt-1 whitespace-pre-wrap text-sm">{{ row.mine }}</p>
            </div>
            <div class="rounded-xl p-3" style="background: var(--bw-surface)">
              <p class="bw-label" style="color: var(--bw-muted)">{{ t('brand.workspace.conflict.serverLabel') }}</p>
              <p class="mt-1 whitespace-pre-wrap text-sm">{{ row.server }}</p>
            </div>
          </div>
        </div>

        <p v-if="copied" class="bw-label mt-4" style="color: var(--bw-muted)">
          {{ copied === 'ok' ? t('brand.workspace.conflict.copied') : t('brand.workspace.conflict.copyFailed') }}
        </p>

        <div class="mt-6 flex flex-wrap justify-end gap-2">
          <UButton
            variant="outline" color="neutral" class="rounded-full"
            :label="t('brand.workspace.conflict.copyMine')" @click="copyMine"
          />
          <UButton class="rounded-full" :label="t('brand.workspace.conflict.loadServer')" @click="loadServerVersion" />
        </div>
      </div>
    </template>
  </UModal>
</template>
