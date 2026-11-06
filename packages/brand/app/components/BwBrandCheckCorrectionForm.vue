<script setup lang="ts">
import { BRAND_INDUSTRIES } from '../../shared/brandIndustries'
import {
  BRAND_CHECK_CORRECTION_EMAIL_MAX,
  BRAND_CHECK_CORRECTION_REASON_MAX,
} from '../../schemas/brandCheck'
import type { BrandCheckCorrectionResponse } from '../../shared/types/brand'

/**
 * „STIMMT NICHT?" — der Korrekturvorschlag zu einem Check
 * (Konzept: docs/archiv/BRAND-CHECK-SEITE.md §3b, Davids Idee „wie Google
 * Business Profile").
 *
 * Wer im Ranking oder auf einer Ergebnisseite eine falsch zugeordnete Branche
 * sieht, schlägt eine Korrektur vor; entschieden wird sie vom Betreiber unter
 * `/dashboard/brand-check/corrections`. Die Komponente trägt den AUSLÖSER
 * gleich mit, damit eine Seite sie mit einer Zeile einbaut — der Knopf und das
 * Formular gehören zusammen, und zwei Einbau-Schritte wären zwei Gelegenheiten,
 * einen zu vergessen.
 *
 * ── ANGEBOTEN WERDEN DIE SECHZEHN, NICHT SIEBZEHN ─────────────────────────
 * `unknown` ist ein gültiger SPALTEN-Wert („aus der Seite ging es nicht
 * hervor"), aber kein sinnvoller VORSCHLAG: wer korrigiert, weiss es besser als
 * das Modell und sagt genau das. Der Server nähme `unknown` an
 * (`isBrandIndustryValue`); das Formular bietet es bewusst nicht an.
 *
 * ── HONEYPOT WIE ÜBERALL IN DIESEM LAYER ──────────────────────────────────
 * `hp` ist für Menschen unsichtbar und reist trotzdem immer mit: das Schema der
 * Route ist `.strict()`, und ein Feld, das erst bei Verdacht mitgeschickt wird,
 * wäre die Falle, die sich selbst ankündigt.
 *
 * ── DER GRUND IST FREIWILLIG, DIE ADRESSE AUCH ────────────────────────────
 * Beide Felder dürfen leer bleiben (das Schema kennt `''` als gültigen Wert).
 * Eine Pflicht-Adresse machte aus einem Hinweis eine Anmeldung, und Hinweise,
 * die eine Anmeldung kosten, kommen nicht.
 */
const props = withDefaults(defineProps<{
  /** Der Check, zu dem der Vorschlag gehört. */
  checkId: string
  /**
   * Der heute gespeicherte Wert — nur zur Anzeige. Er ist OPTIONAL, weil
   * `GET /api/brand/check/<id>` die Branche (Stand P3) nicht mitliefert; sobald
   * sie in der Antwort steht, reicht die Seite sie durch, ohne dass hier etwas
   * zu ändern wäre.
   */
  current?: string
}>(), { current: '' })

const { t, te } = useI18n()

const open = ref(false)
const proposed = ref('')
const reason = ref('')
const email = ref('')
const hp = ref('')
const state = ref<'idle' | 'sending' | 'done' | 'error'>('idle')
const errorKey = ref('generic')

/**
 * Der Typ steht ausdrücklich da: ohne ihn leitet `USelect` seinen Modellwert
 * aus den LITERALEN der sechzehn Ids ab, und `proposed` (ein `string`, weil er
 * so in den Rumpf der Route geht) passte nicht mehr dazu. Geprüft wird der Wert
 * ohnehin am Ende — vom Schema der Route gegen `isBrandIndustryValue`.
 */
const industryItems = computed<{ value: string, label: string }[]>(() => BRAND_INDUSTRIES.map(id => ({
  value: id,
  label: t(`brand.industry.${id}`),
})))

const currentLabel = computed(() => {
  const key = `brand.industry.${props.current}`
  return props.current && te(key) ? t(key) : ''
})

/** Nichts gewählt ⇒ nichts zu senden. Alles Weitere entscheidet der Server. */
const canSend = computed(() => state.value !== 'sending' && Boolean(proposed.value))

interface FetchErrorLike {
  status?: number
  statusCode?: number
  response?: { status?: number }
  data?: { reason?: string }
}

/**
 * Der fachliche Grund reist als `data.code` durch den zentralen Fehler-Handler
 * und kommt als `error.data.reason` an (CLAUDE.md). Unbekanntes fällt auf den
 * allgemeinen Satz zurück — ein leerer Hinweis wäre schlimmer als ein ungenauer.
 */
function messageKey(error: unknown): string {
  const value = error as FetchErrorLike | null
  const code = value?.status ?? value?.statusCode ?? value?.response?.status ?? 0
  const reason = typeof value?.data?.reason === 'string' ? value.data.reason : ''
  if (reason === 'correction_open') return 'correctionOpen'
  if (reason === 'brand_correction_limit' || code === 429) return 'rateLimited'
  if (reason === 'check_not_found' || code === 404) return 'notFound'
  if (reason === 'correction_unavailable' || code === 503) return 'unavailable'
  return 'generic'
}

function reset(): void {
  proposed.value = ''
  reason.value = ''
  email.value = ''
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
  state.value = 'sending'
  try {
    await $fetch<BrandCheckCorrectionResponse>(
      `/api/brand/check/${encodeURIComponent(props.checkId)}/correction`,
      {
        method: 'POST',
        body: {
          field: 'industry',
          proposed: proposed.value,
          reason: reason.value,
          email: email.value,
          hp: hp.value,
        },
      },
    )
    state.value = 'done'
  }
  catch (error) {
    errorKey.value = messageKey(error)
    state.value = 'error'
  }
}
</script>

<template>
  <div data-check-correction>
    <UButton
      :label="t('brand.checkCorrection.trigger')"
      variant="link"
      color="neutral"
      size="sm"
      class="px-0"
      data-check-correction-open
      @click="setOpen(true)"
    />

    <UModal
      :open="open"
      :title="t('brand.checkCorrection.title')"
      :description="t('brand.checkCorrection.lead')"
      @update:open="setOpen"
    >
      <template #body>
        <!-- Angekommen: kein Formular mehr, ein Satz. -->
        <p v-if="state === 'done'" class="text-sm leading-relaxed" data-check-correction-done>
          {{ t('brand.checkCorrection.thanks') }}
        </p>

        <form v-else class="space-y-4" @submit.prevent="submit">
          <p v-if="currentLabel" class="text-sm" style="color: var(--bw-ink-soft)" data-check-correction-current>
            {{ t('brand.checkCorrection.current', { industry: currentLabel }) }}
          </p>

          <UFormField :label="t('brand.checkCorrection.proposedLabel')" required>
            <USelect
              v-model="proposed"
              :items="industryItems"
              :placeholder="t('brand.checkCorrection.proposedPlaceholder')"
              class="w-full"
              data-check-correction-industry
            />
          </UFormField>

          <UFormField :label="t('brand.checkCorrection.reasonLabel')" :description="t('brand.checkCorrection.reasonHint')">
            <UTextarea
              v-model="reason"
              :rows="3"
              :maxlength="BRAND_CHECK_CORRECTION_REASON_MAX"
              :placeholder="t('brand.checkCorrection.reasonPlaceholder')"
              class="w-full"
              data-check-correction-reason
            />
          </UFormField>

          <UFormField :label="t('brand.checkCorrection.emailLabel')" :description="t('brand.checkCorrection.emailHint')">
            <UInput
              v-model="email"
              type="email"
              autocomplete="email"
              :maxlength="BRAND_CHECK_CORRECTION_EMAIL_MAX"
              :placeholder="t('brand.checkCorrection.emailPlaceholder')"
              class="w-full"
              data-check-correction-email
            />
          </UFormField>

          <!-- Honeypot: für Menschen unsichtbar und unerreichbar (s. Kopf). -->
          <div class="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
            <input v-model="hp" type="text" name="hp" tabindex="-1" autocomplete="off">
          </div>

          <p v-if="state === 'error'" class="text-sm leading-relaxed" style="color: var(--bw-stale)" data-check-correction-error>
            {{ t(`brand.checkCorrection.errors.${errorKey}`) }}
          </p>

          <div class="flex justify-end gap-2 pt-2">
            <UButton color="neutral" variant="ghost" :label="t('ui.cancel')" @click="setOpen(false)" />
            <UButton
              type="submit"
              :disabled="!canSend"
              :loading="state === 'sending'"
              :label="t('brand.checkCorrection.submit')"
              data-check-correction-submit
            />
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
