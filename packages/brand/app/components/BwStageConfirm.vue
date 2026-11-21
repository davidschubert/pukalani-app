<script setup lang="ts">
import { computed } from 'vue'
import type { BrandSlotControls } from '../../shared/brandSlotControls'
import type { BrandSlot } from '../../shared/slotRegistry'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DAS BESTÄTIGUNGS-MODUL IM ZUG — aus der Werkstatt-Seite geschnitten (WS1,
 * Kapitel c). Die Karte trägt als Kopf die URSPRUNGSFRAGE des Inhalts
 * (Runde 37c), die Abschluss-Frage steht über den Knöpfen, „Korrigieren" links
 * neben „Bestätigen".
 *
 * Der Wert kommt aus dem Store; was die Bühne über das Feld weiss (Steuerung,
 * Anzeige-Wert, „steht oben schon", abgeschnitten), reicht die Seite herein —
 * dieselben Rechnungen wie für das Entwurfs-Modul und den Log. Jede Handlung
 * geht als Ereignis zurück: Autosave, Korrektur-Regel und Abschluss der
 * Session hängen an der Seite.
 */
const props = defineProps<{
  /** Das Feld dieser Karte (`slot` ist als Attribut-Name in Vue vergeben). */
  field: BrandSlot
  controls: BrandSlotControls
  label: string
  /** Steht DIESES Feld gerade im Editor? */
  editing: boolean
  /** Der Wert steht schon im Panel darüber (`RENDERED_ABOVE`). */
  renderedAbove: boolean
  /** Was der Mensch liest (Name statt Id bei einer geschlossenen Auswahl). */
  display: string
  /** Das Modell hat an seiner Decke abgebrochen (KI1 d). */
  truncated: boolean
  /** … und ein Neuversuch ist für dieses Feld möglich. */
  canRetryTruncated: boolean
}>()

const emit = defineEmits<{
  input: [value: string]
  flush: []
  retryTruncated: []
  apply: []
  discard: []
  edit: []
  confirm: []
}>()

const { t } = useI18n()
const store = useBrandWorkspaceStore()

const value = computed(() => store.slotValue(props.field.id))
</script>

<template>
  <div class="mt-3">
    <div class="bw-draft-frame mb-3">
      <p class="bw-label" style="color: var(--bw-muted)">{{ props.label }}</p>
      <UTextarea
        v-if="props.editing && props.controls.editable"
        class="mt-2 w-full" :rows="3" :maxlength="props.field.maxLength"
        :model-value="value"
        @update:model-value="next => emit('input', String(next))"
        @blur="emit('flush')"
      />
      <p
        v-else-if="value && props.renderedAbove"
        class="bw-pending mt-2"
      >
        {{ t('brand.dna.card.above') }}
      </p>
      <BwSlotValue
        v-else-if="value"
        class="mt-2"
        :slot-id="props.field.id"
        :value="props.display"
      />
      <p v-else class="bw-pending mt-2">{{ t('brand.workspace.stage.pending') }}</p>
      <!-- ABGESCHNITTEN AM FELD (KI1 d), wie im Entwurfs-Modul. -->
      <div v-if="props.truncated" class="mt-2 flex flex-wrap items-center gap-2">
        <span class="bw-state bw-state--stale">
          <UIcon name="i-ph-scissors" />
          {{ t('brand.workspace.truncated.fieldBadge') }}
        </span>
        <p class="bw-msg-help">{{ t('brand.workspace.truncated.fieldHint') }}</p>
        <UButton
          v-if="props.canRetryTruncated"
          size="sm" color="neutral" variant="soft" class="rounded-full" icon="i-ph-arrow-clockwise"
          :label="t('brand.workspace.truncated.retry')"
          @click="emit('retryTruncated')"
        />
      </div>
    </div>
    <!-- Befund 9, zweite Stelle: dieselbe Auskunft an derselben
         Regel — ein abgeschalteter Knopf ohne Begründung ist ein
         stiller No-op, egal in welchem Modul er steht. -->
    <p v-if="props.controls.showConfirmBlockedNote" class="bw-pending mb-2">
      {{ t('brand.workspace.confirmNeedsValue') }}
    </p>
    <p class="mb-2 font-medium">{{ t('brand.workspace.confirmQuestion') }}</p>
    <div class="flex flex-wrap items-center justify-end gap-2">
      <!-- Dieselben zwei Ausgänge wie im Entwurfs-Modul (Befund 3). -->
      <template v-if="props.controls.editable && props.editing">
        <button type="button" class="bw-confirm bw-confirm--ghost" @click="emit('apply')">
          <UIcon name="i-ph-check" class="size-4" />
          {{ t('brand.workspace.reviseApply') }}
        </button>
        <button type="button" class="bw-confirm bw-confirm--ghost" @click="emit('discard')">
          <UIcon name="i-ph-arrow-counter-clockwise" class="size-4" />
          {{ t('brand.workspace.reviseDiscard') }}
        </button>
      </template>
      <button
        v-else-if="props.controls.editable"
        type="button" class="bw-confirm bw-confirm--ghost"
        @click="emit('edit')"
      >
        <UIcon name="i-ph-pencil-simple" class="size-4" />
        {{ t('brand.workspace.reviseSlot') }}
      </button>
      <button
        v-if="props.controls.showConfirm"
        type="button" class="bw-confirm bw-confirm--open"
        :disabled="!props.controls.confirmEnabled"
        @click="emit('confirm')"
      >
        <UIcon name="i-ph-check" class="size-4" />
        {{ t('brand.workspace.confirmSlot') }}
      </button>
    </div>
  </div>
</template>
