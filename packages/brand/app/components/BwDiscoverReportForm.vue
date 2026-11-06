<script setup lang="ts">
import {
  BRAND_PUBLICATION_REPORT_EMAIL_MAX,
  BRAND_PUBLICATION_REPORT_REASON_MAX,
  BRAND_PUBLICATION_REPORT_REASON_MIN,
} from '../../shared/brandPublication'
import type { BrandPublicationReportResponse } from '../../shared/types/brand'

/**
 * „MELDEN" — die Beanstandung einer Marke in der öffentlichen Galerie
 * (docs/plans/DISCOVER-BRANDS.md §3.4, §4.2 „Melden").
 *
 * Sie ist die Gegenseite der Veröffentlichung: öffentlich zeigen dürfen wir
 * nur, was auch jemand beanstanden kann. Wie beim Korrekturvorschlag trägt die
 * Komponente den AUSLÖSER gleich mit, damit eine Seite sie mit einer Zeile
 * einbaut — der Knopf und das Formular gehören zusammen, und zwei
 * Einbau-Schritte wären zwei Gelegenheiten, einen zu vergessen.
 *
 * ── DER GRUND IST PFLICHT, ANDERS ALS BEIM KORREKTURVORSCHLAG ─────────────
 * Dort sagt schon die Auswahl („Branche X statt Y"), worum es geht; hier gibt
 * es nichts ausser dem Satz. Eine Meldung ohne Begründung wäre für den
 * Betreiber ein Zeiger auf eine Seite und die Aufforderung, selbst zu suchen.
 * Der Senden-Knopf ist deshalb gesperrt, solange die Untergrenze nicht steht —
 * der Server misst dieselbe Zahl noch einmal (`createBrandPublicationReport
 * Schema`), die Sperre hier erspart nur den vergeblichen Versuch.
 *
 * ── DIE ADRESSE BLEIBT FREIWILLIG ─────────────────────────────────────────
 * Sie ist für die Rückfrage da, nicht für die Meldung. Eine Pflicht-Adresse
 * machte aus einem Hinweis eine Anmeldung, und Hinweise, die eine Anmeldung
 * kosten, kommen nicht.
 *
 * ── HONEYPOT WIE ÜBERALL IN DIESEM LAYER ──────────────────────────────────
 * `hp` ist für Menschen unsichtbar und reist trotzdem immer mit: das Schema
 * der Route ist `.strict()`, und ein Feld, das erst bei Verdacht mitgeschickt
 * wird, wäre die Falle, die sich selbst ankündigt.
 */
const props = defineProps<{
  /** Die Adresse der gemeldeten Marke — `/discover/<slug>`. */
  slug: string
}>()

const { t } = useI18n()

const open = ref(false)
const reason = ref('')
const email = ref('')
const hp = ref('')
const state = ref<'idle' | 'sending' | 'done' | 'error'>('idle')
const errorKey = ref('generic')

const canSend = computed(() =>
  state.value !== 'sending'
  && reason.value.trim().length >= BRAND_PUBLICATION_REPORT_REASON_MIN,
)

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
  if (reason === 'report_open') return 'reportOpen'
  if (reason === 'report_limit' || code === 429) return 'rateLimited'
  if (reason === 'publication_not_found' || code === 404) return 'notFound'
  // Ein 400 kann hier nur die Untergrenze sein — der Knopf lässt nichts
  // anderes durch, und ein „bitte noch einmal versuchen" wäre dort falsch.
  if (code === 400) return 'tooShort'
  if (reason === 'publication_admin_unavailable' || code === 503) return 'unavailable'
  return 'generic'
}

function reset(): void {
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
    await $fetch<BrandPublicationReportResponse>(
      `/api/discover/${encodeURIComponent(props.slug)}/report`,
      { method: 'POST', body: { reason: reason.value, email: email.value, hp: hp.value } },
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
  <div data-discover-report>
    <UButton
      :label="t('brand.discoverReport.trigger')"
      variant="link"
      color="neutral"
      size="sm"
      class="px-0"
      data-discover-report-open
      @click="setOpen(true)"
    />

    <UModal
      :open="open"
      :title="t('brand.discoverReport.title')"
      :description="t('brand.discoverReport.lead')"
      @update:open="setOpen"
    >
      <template #body>
        <!-- Angekommen: kein Formular mehr, ein Satz. -->
        <p v-if="state === 'done'" class="text-sm leading-relaxed" data-discover-report-done>
          {{ t('brand.discoverReport.thanks') }}
        </p>

        <form v-else class="space-y-4" @submit.prevent="submit">
          <UFormField
            :label="t('brand.discoverReport.reasonLabel')"
            :description="t('brand.discoverReport.reasonHint', { min: BRAND_PUBLICATION_REPORT_REASON_MIN })"
            :hint="t('brand.discoverReport.counter', { count: reason.length, max: BRAND_PUBLICATION_REPORT_REASON_MAX })"
            required
          >
            <UTextarea
              v-model="reason"
              :rows="4"
              :maxlength="BRAND_PUBLICATION_REPORT_REASON_MAX"
              :placeholder="t('brand.discoverReport.reasonPlaceholder')"
              class="w-full"
              data-discover-report-reason
            />
          </UFormField>

          <UFormField
            :label="t('brand.discoverReport.emailLabel')"
            :description="t('brand.discoverReport.emailHint')"
          >
            <UInput
              v-model="email"
              type="email"
              autocomplete="email"
              :maxlength="BRAND_PUBLICATION_REPORT_EMAIL_MAX"
              :placeholder="t('brand.discoverReport.emailPlaceholder')"
              class="w-full"
              data-discover-report-email
            />
          </UFormField>

          <!-- Honeypot: für Menschen unsichtbar und unerreichbar (s. Kopf). -->
          <div class="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
            <input v-model="hp" type="text" name="hp" tabindex="-1" autocomplete="off">
          </div>

          <p
            v-if="state === 'error'"
            class="text-sm leading-relaxed"
            style="color: var(--bw-stale)"
            data-discover-report-error
          >
            {{ t(`brand.discoverReport.errors.${errorKey}`) }}
          </p>

          <div class="flex justify-end gap-2 pt-2">
            <UButton
              color="neutral"
              variant="ghost"
              :label="t('brand.discoverReport.cancel')"
              @click="setOpen(false)"
            />
            <UButton
              type="submit"
              :disabled="!canSend"
              :loading="state === 'sending'"
              :label="t('brand.discoverReport.submit')"
              data-discover-report-submit
            />
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
