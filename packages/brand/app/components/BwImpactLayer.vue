<script setup lang="ts">
import { computed } from 'vue'
import type { BrandStepKey } from '../../shared/slotRegistry'
import type { BrandSessionImpactResponse } from '../../shared/types/brand'
import { useBrandFieldLabel } from '../composables/useBrandFieldLabel'

/**
 * DER IMPACT-HINWEIS VOR EINER KORREKTUR (BW2 Paket 6, Plan §9 Schritt 2).
 *
 * ── EINE KOMPONENTE FÜR DREI EINGÄNGE ────────────────────────────────────
 * „Korrigieren" gibt es an drei Stellen: an der Log-Karte der Werkstatt, als
 * „Bearbeiten" auf der Finalen Abnahme und am Feld-Link eines Befund-Chips.
 * Alle drei stellen dieselbe Frage und brauchen dieselbe Antwort — dreimal
 * gebaut wäre der Text irgendwann an einer Stelle freundlicher als an den
 * anderen. Die SEITE hält die eine Instanz und reicht die Hülle herein
 * (dieselbe Arbeitsteilung wie beim Befund-Chip: die Komponente zeigt, die
 * Seite navigiert und speichert).
 *
 * ── ER ZEIGT FELDER, NICHT ZAHLEN ────────────────────────────────────────
 * „Berührt 14 bestätigte Felder in vier Kapiteln" ist die Überschrift; darunter
 * stehen die Felder mit ihren BESCHRIFTUNGEN, je Kapitel gruppiert. Eine
 * blosse Zahl liesse dem Menschen nur die Wahl zwischen Vertrauen und
 * Abbrechen — er soll aber erkennen, ob das eine Feld darunter ist, an dem
 * seine ganze Arbeit hängt.
 *
 * DIREKT und INDIREKT stehen getrennt, weil sie sich verschieden anfühlen:
 * „das schöpft unmittelbar aus diesem Feld" ist eine andere Nachricht als
 * „das hängt über zwei Ecken daran". Die Mengen ÜBERLAPPEN sich bewusst nicht
 * in der Anzeige — indirekt ist hier die Hülle OHNE die direkten, sonst
 * stünde ein Feld zweimal da und die Summe ginge nicht auf (`transitive` ist
 * im Vertrag die volle Hülle, s. `BrandSessionsAffected`).
 *
 * ── NIE PER `v-if` UNMOUNTET ─────────────────────────────────────────────
 * `UModal` bleibt im Baum und wird über `open` gesteuert (Nuxt-UI/Reka-Falle:
 * ein offener Dialog, den man wegrendert, lässt Fokus-Falle und Overlay
 * zurück). Der Inhalt darin darf leer sein — solange nichts geladen ist,
 * steht dort die Ladezeile.
 */

const props = defineProps<{
  open: boolean
  /** Die Hülle aus `GET …/sessions/:id/impact`. `null` = wird noch geholt. */
  impact: BrandSessionImpactResponse | null
  loading?: boolean
  /** Die Hülle hat sich seit dem letzten Zeigen bewegt (409 `impact_unacknowledged`). */
  changed?: boolean
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  /** Annehmen — die Seite korrigiert und springt. */
  'accept': []
  /** Abbrechen — nichts passiert, das Dokument bleibt unberührt. */
  'cancel': []
}>()

const { t } = useI18n()
const fieldLabel = useBrandFieldLabel()

const direct = computed(() => new Set(props.impact?.direct ?? []))

/** Die Kapitel mit ihren Feldern — leere Kapitel kommen gar nicht erst an. */
const steps = computed(() => Object.entries(props.impact?.byStep ?? {})
  .map(([stepKey, slots]) => ({
    stepKey,
    label: t(`brand.steps.${stepKey as BrandStepKey}`),
    fields: (slots ?? []).map(slotId => ({
      slotId,
      label: fieldLabel(slotId),
      direct: direct.value.has(slotId),
    })),
  }))
  .filter(entry => entry.fields.length > 0))

function close(): void {
  emit('update:open', false)
  emit('cancel')
}
</script>

<template>
  <UModal
    :open="open" :title="t('brand.impact.title')"
    @update:open="value => { if (!value) close() }"
  >
    <template #content>
      <div class="bw-root bw-overlay max-h-[85vh] overflow-y-auto p-8">
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-stale)">
          {{ t('brand.impact.eyebrow') }}
        </p>
        <h2 class="mt-1 text-[24px] font-extralight leading-tight tracking-tight">
          {{ t('brand.impact.title') }}
        </h2>

        <p v-if="loading || !impact" class="bw-pending mt-4">{{ t('brand.impact.loading') }}</p>

        <template v-else>
          <p v-if="changed" class="mt-3 text-sm" style="color: var(--bw-stale)">
            {{ t('brand.impact.changed') }}
          </p>
          <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t('brand.impact.summary', { fields: t('brand.impact.fieldCount', impact.count), chapters: t('brand.impact.chapterCount', steps.length) }) }}
          </p>

          <div class="mt-4 flex flex-col gap-4">
            <div v-for="entry in steps" :key="entry.stepKey">
              <p class="bw-label" style="color: var(--bw-ink-soft)">{{ entry.label }}</p>
              <ul class="mt-1 flex flex-col gap-0.5">
                <li
                  v-for="field in entry.fields" :key="field.slotId"
                  class="bw-label" style="color: var(--bw-muted)"
                >
                  · {{ field.label }}
                  <span class="opacity-70">
                    {{ field.direct ? t('brand.impact.direct') : t('brand.impact.indirect') }}
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <p class="mt-5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t('brand.impact.note') }}
          </p>
        </template>

        <div class="mt-6 flex items-center justify-end gap-2">
          <UButton
            color="neutral" variant="ghost" class="rounded-full"
            :label="t('brand.impact.cancel')" @click="close"
          />
          <UButton
            color="neutral" class="rounded-full"
            :disabled="!impact || loading"
            :label="t('brand.impact.accept')" @click="emit('accept')"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
