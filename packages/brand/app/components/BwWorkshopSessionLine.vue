<script setup lang="ts">
import type { BrandFindingDecisionResponse, BrandFindingView } from '../../shared/types/brand'

/**
 * DIE SESSION-ZEILE UNTER DEM GESPRÄCH (BW2 3c-i) — aus der Werkstatt-Seite
 * geschnitten (WS1, Rest nach Bahn C): wofür das Feld gebraucht wird, die
 * Befunde der Session, der Hinweis „veraltet" und der vierte Ausgang „Später".
 *
 * Reine Anzeige: der Zustand bleibt in der Seite (`staleHidden` als
 * `v-model`, `restamping`/`deferring` als Eingänge), jede Handlung geht als
 * Ereignis zurück — Navigieren, Stempeln und Vertagen sind Sache der Seite.
 */
defineProps<{
  profileId: string
  /** „Fliesst später in …" der aktiven Session (`affectsLine`). */
  affects: string
  findings: BrandFindingView[]
  /** Die Session ist veraltet (§9). */
  stale: boolean
  restamping: boolean
  deferred: boolean
  collected: { label: string, value: string }[]
  deferring: boolean
  allowsDefer: boolean
}>()

const staleHidden = defineModel<boolean>('staleHidden', { required: true })

const emit = defineEmits<{
  field: [slotId: string]
  decided: [decision: BrandFindingDecisionResponse]
  staleFinding: [findingId: string]
  keep: []
  defer: [deferred: boolean]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="flex flex-col gap-2" style="padding-left: 2.65rem">
    <p class="bw-label" style="color: var(--bw-muted)">{{ affects }}</p>

    <!-- DER BEFUND AN DIESER SESSION (§8) — EINMAL, neben „fliesst
         später in". George hat ihn schon ausgesprochen; hier bleibt er
         stehen, mit beiden Feld-Links und beiden Handlungen. -->
    <BwFindingChip
      v-for="finding in findings" :key="finding.id"
      :finding="finding" :profile-id="profileId"
      @field="slotId => emit('field', slotId)"
      @decided="decision => emit('decided', decision)"
      @stale="emit('staleFinding', finding.id)"
    />

    <!-- VERALTET (§9): ein Feld davor hat sich geändert. RUHIG und ohne
         Sperre — der bestätigte Wert steht weiter da. Zwei Ausgänge:
         „Gilt weiter" stempelt den neuen Stand als Grundlage, „Neu
         besprechen" räumt den Hinweis weg und überlässt das Feld dem
         Gespräch (George eröffnet mit Bezug auf die Änderung). -->
    <div
      v-if="stale && !staleHidden"
      class="rounded-2xl px-4 py-3" style="background: var(--bw-surface)"
    >
      <p class="text-sm" style="color: var(--bw-ink-soft)">{{ t('brand.session.stale') }}</p>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <UButton
          size="sm" variant="ghost" color="neutral" class="rounded-full"
          icon="i-ph-check" :loading="restamping"
          :label="t('brand.session.keep')" @click="emit('keep')"
        />
        <UButton
          size="sm" variant="ghost" color="neutral" class="rounded-full"
          icon="i-ph-chat-circle-dots"
          :label="t('brand.session.rediscuss')" @click="staleHidden = true"
        />
      </div>
    </div>

    <!-- VERTAGT: der Zwischenstand bleibt sichtbar, aber nicht
         bearbeitbar — der Wert entsteht im Gespräch. -->
    <div v-if="deferred" class="rounded-2xl px-4 py-3" style="background: var(--bw-surface)">
      <p class="text-sm" style="color: var(--bw-ink-soft)">{{ t('brand.session.deferredNote') }}</p>
      <ul v-if="collected.length" class="mt-2 space-y-1">
        <li v-for="part in collected" :key="part.label" class="bw-label" style="color: var(--bw-muted)">
          {{ part.label }}: {{ part.value }}
        </li>
      </ul>
      <UButton
        size="sm" variant="ghost" color="neutral" class="mt-2 rounded-full"
        icon="i-ph-arrow-counter-clockwise" :loading="deferring"
        :label="t('brand.session.resume')" @click="emit('defer', false)"
      />
    </div>
    <div v-else-if="allowsDefer">
      <UButton
        size="sm" variant="ghost" color="neutral" class="rounded-full"
        icon="i-ph-clock" :loading="deferring"
        :label="t('brand.session.defer')" @click="emit('defer', true)"
      />
    </div>
  </div>
</template>
