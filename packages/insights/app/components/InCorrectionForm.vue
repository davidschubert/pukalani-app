<script setup lang="ts">
import type { InsightsCorrectionKind, InsightsCorrectionTargetKind } from '../../shared/insightsCorrection'
import {
  INSIGHTS_CORRECTION_EMAIL_MAX,
  INSIGHTS_CORRECTION_FIELD_MAX,
  INSIGHTS_CORRECTION_HONEYPOT_MAX,
  INSIGHTS_CORRECTION_PROPOSED_MAX,
  INSIGHTS_CORRECTION_REASON_MAX,
  createInsightsCorrectionSubmitSchema,
} from '../../shared/insightsCorrection'
import type { InsightsCorrectionSubmitResponse } from '../../shared/types/insightsApi'

/**
 * „HIER STIMMT ETWAS NICHT" — der Korrektur- und Entfernungsweg auf jeder
 * Profil-, Duell- und Ranking-Seite (§9.5, §11.2 Frage 5, Entscheidung 11).
 *
 * ── KNOPF UND FORMULAR GEHÖREN ZUSAMMEN ─────────────────────────────────
 * Die Komponente bringt ihren AUSLÖSER mit (Muster: `BwDiscoverReportForm`),
 * damit eine Seite sie mit einer Zeile einbaut. Zwei Einbau-Schritte wären
 * zwei Gelegenheiten, einen zu vergessen — und der Weg, der die Zusage aus
 * Entscheidung 11 einlöst, darf auf keiner der drei Seiten fehlen.
 *
 * ── ZWEI ANLÄSSE, EIN FORMULAR ──────────────────────────────────────────
 * „Das stimmt so nicht" (`correction`) fragt nach FELD und VORSCHLAG; „bitte
 * entfernen" (`removal`) nach dem GRUND — und nur dort ist er Pflicht. Zwei
 * Formulare hätten zwei Wege zu derselben Arbeitsliste; die Umschaltung ist
 * eine Auswahl, keine zweite Maske.
 *
 * ── DAS SCHEMA IST DASSELBE WIE AUF DEM SERVER ──────────────────────────
 * `createInsightsCorrectionSubmitSchema(t)` — die Route ruft dieselbe Fabrik
 * ohne `t`. Das Formular ersetzt die Serverprüfung nicht, es fängt den
 * Tippfehler vor dem Absenden.
 *
 * ── DER HONIGTOPF REIST IMMER MIT ───────────────────────────────────────
 * Das Schema der Route ist `.strict()`; ein Feld, das erst bei Verdacht
 * mitgeschickt wird, wäre die Falle, die sich selbst ankündigt. Für Menschen
 * ist es unsichtbar UND unerreichbar (`tabindex="-1"`, `autocomplete="off"`).
 *
 * ── DIE ADRESSE BLEIBT FREIWILLIG ───────────────────────────────────────
 * Sie ist für die Rückfrage da, nicht für den Widerspruch. Eine Pflicht-Adresse
 * machte aus einem Hinweis eine Anmeldung — und aus dem Korrekturweg, nach dem
 * Anwaltsfrage 3 fragt, eine Hürde.
 */
const props = defineProps<{
  targetKind: InsightsCorrectionTargetKind
  /** Die Zeilen-Id des Beitrags bzw. des Markenprofils. */
  targetId: string
}>()

const { t } = useI18n()

const open = ref(false)
const kind = ref<InsightsCorrectionKind>('correction')
const field = ref('')
const proposed = ref('')
const reason = ref('')
const contactEmail = ref('')
const hp = ref('')
const state = ref<'idle' | 'sending' | 'done' | 'error'>('idle')
const errorKey = ref('generic')

const schema = computed(() => createInsightsCorrectionSubmitSchema(t))

const kindItems = computed(() => [
  { label: t('insights.correction.kindCorrection'), value: 'correction' },
  { label: t('insights.correction.kindRemoval'), value: 'removal' },
])

/**
 * Der Knopf ist gesperrt, solange die Eingabe die Regel nicht erfüllt: bei
 * `removal` braucht es den Grund, bei `correction` mindestens einen Vorschlag
 * oder eine Begründung. Der Server misst dieselbe Regel noch einmal; die Sperre
 * hier erspart nur den vergeblichen Versuch.
 */
const canSend = computed(() => {
  if (state.value === 'sending') return false
  if (kind.value === 'removal') return reason.value.trim().length > 0
  return proposed.value.trim().length > 0 || reason.value.trim().length > 0
})

interface FetchErrorLike {
  status?: number
  statusCode?: number
  response?: { status?: number }
  data?: { reason?: string }
}

/**
 * Der fachliche Grund reist als `data.code` durch den zentralen Fehler-Handler
 * und kommt als `error.data.reason` an (CLAUDE.md). Unbekanntes fällt auf den
 * allgemeinen Satz zurück — ein leerer Hinweis wäre schlimmer als ein
 * ungenauer.
 */
function messageKey(error: unknown): string {
  const value = error as FetchErrorLike | null
  const code = value?.status ?? value?.statusCode ?? value?.response?.status ?? 0
  const reason = typeof value?.data?.reason === 'string' ? value.data.reason : ''
  if (reason === 'correction_open') return 'alreadyOpen'
  if (reason === 'rate_limited_hour' || reason === 'rate_limited_day' || code === 429) return 'rateLimited'
  if (reason === 'target_not_found' || code === 404) return 'notFound'
  if (code === 400) return 'invalid'
  if (reason === 'storage_unavailable' || code === 503) return 'unavailable'
  return 'generic'
}

function reset(): void {
  kind.value = 'correction'
  field.value = ''
  proposed.value = ''
  reason.value = ''
  contactEmail.value = ''
  hp.value = ''
  state.value = 'idle'
  errorKey.value = 'generic'
}

function setOpen(value: boolean): void {
  open.value = value
  // Beim Schliessen aufräumen — ein zweites Öffnen soll ein leeres Formular
  // zeigen und nicht den Dank von vorhin.
  if (!value) reset()
}

async function submit(): Promise<void> {
  if (!canSend.value) return
  const parsed = schema.value.safeParse({
    targetKind: props.targetKind,
    targetId: props.targetId,
    kind: kind.value,
    field: kind.value === 'removal' ? '' : field.value,
    proposed: kind.value === 'removal' ? '' : proposed.value,
    reason: reason.value,
    contactEmail: contactEmail.value,
    hp: hp.value,
  })
  if (!parsed.success) {
    errorKey.value = 'invalid'
    state.value = 'error'
    return
  }

  state.value = 'sending'
  try {
    await $fetch<InsightsCorrectionSubmitResponse>('/api/insights/public/corrections', {
      method: 'POST',
      body: parsed.data,
    })
    state.value = 'done'
  }
  catch (error) {
    errorKey.value = messageKey(error)
    state.value = 'error'
  }
}
</script>

<template>
  <div data-insights-correction>
    <UButton
      :label="t('insights.profile.correction')"
      color="neutral" variant="ghost" class="rounded-full"
      style="background: var(--bw-surface)"
      data-insights-correction-open
      @click="setOpen(true)"
    />

    <UModal
      :open="open"
      :title="t('insights.correction.title')"
      :description="t('insights.correction.lead')"
      @update:open="setOpen"
    >
      <template #body>
        <!-- Angekommen: kein Formular mehr, ein Satz. -->
        <p v-if="state === 'done'" class="text-sm leading-relaxed" data-insights-correction-done>
          {{ t('insights.correction.thanks') }}
        </p>

        <form v-else class="space-y-4" @submit.prevent="submit">
          <UFormField :label="t('insights.correction.kindLabel')" required>
            <URadioGroup v-model="kind" :items="kindItems" value-key="value" />
          </UFormField>

          <UFormField
            v-if="kind === 'correction'"
            :label="t('insights.correction.fieldLabel')"
            :description="t('insights.correction.fieldHint')"
          >
            <UInput
              v-model="field" :maxlength="INSIGHTS_CORRECTION_FIELD_MAX"
              :placeholder="t('insights.correction.fieldPlaceholder')" class="w-full"
            />
          </UFormField>

          <UFormField
            v-if="kind === 'correction'"
            :label="t('insights.correction.proposedLabel')"
            :hint="t('insights.correction.counter', { count: proposed.length, max: INSIGHTS_CORRECTION_PROPOSED_MAX })"
          >
            <UTextarea
              v-model="proposed" :rows="2" :maxlength="INSIGHTS_CORRECTION_PROPOSED_MAX"
              :placeholder="t('insights.correction.proposedPlaceholder')" class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('insights.correction.reasonLabel')"
            :description="kind === 'removal' ? t('insights.correction.reasonRemovalHint') : t('insights.correction.reasonHint')"
            :hint="t('insights.correction.counter', { count: reason.length, max: INSIGHTS_CORRECTION_REASON_MAX })"
            :required="kind === 'removal'"
          >
            <UTextarea
              v-model="reason" :rows="4" :maxlength="INSIGHTS_CORRECTION_REASON_MAX"
              :placeholder="t('insights.correction.reasonPlaceholder')" class="w-full"
              data-insights-correction-reason
            />
          </UFormField>

          <UFormField
            :label="t('insights.correction.emailLabel')"
            :description="t('insights.correction.emailHint')"
          >
            <UInput
              v-model="contactEmail" type="email" autocomplete="email"
              :maxlength="INSIGHTS_CORRECTION_EMAIL_MAX"
              :placeholder="t('insights.correction.emailPlaceholder')" class="w-full"
            />
          </UFormField>

          <!-- Honigtopf: für Menschen unsichtbar und unerreichbar (s. Kopf). -->
          <div class="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
            <input v-model="hp" type="text" name="hp" tabindex="-1" autocomplete="off" :maxlength="INSIGHTS_CORRECTION_HONEYPOT_MAX">
          </div>

          <p
            v-if="state === 'error'"
            class="text-sm leading-relaxed"
            style="color: var(--bw-stale)"
            data-insights-correction-error
          >
            {{ t(`insights.correction.errors.${errorKey}`) }}
          </p>

          <div class="flex justify-end gap-2 pt-2">
            <UButton
              color="neutral" variant="ghost"
              :label="t('insights.correction.cancel')"
              @click="setOpen(false)"
            />
            <UButton
              type="submit" :disabled="!canSend" :loading="state === 'sending'"
              :label="t('insights.correction.submit')"
              data-insights-correction-submit
            />
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
