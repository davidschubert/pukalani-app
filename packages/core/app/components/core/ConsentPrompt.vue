<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { createConsentPromptSchema, type ConsentPromptInput } from '../../../schemas/auth'
import type { ConsentKind, ConsentStateResponse } from '../../../shared/types/consent'

/**
 * DIE NACHFRAGE (SEC-007, „Tür zu und einmal fragen"): wem eine verlangte
 * Zustimmung fehlt, der sieht diesen Dialog einmal je Besuch — mit genau den
 * fehlenden Häkchen. „Später" schließt ihn; lesen geht weiter, schreiben erst
 * nach der Bestätigung (die Tür steht in `07.consent-required.ts`).
 *
 * Geöffnet wird er über `useOverlay()` aus `consent-prompt.client.ts` —
 * dadurch braucht keine App und kein Layout eine eigene Einbindung.
 */
const props = defineProps<{ missing: ConsentKind[] }>()
const emit = defineEmits<{ close: [accepted: boolean] }>()

const { t } = useI18n()
const appConfig = useAppConfig()
const localePath = useLocalePath()
const toast = useToast()
const consentState = useConsentState()

const requireTerms = computed(() => props.missing.includes('terms'))
const requireBusiness = computed(() => props.missing.includes('business'))
const termsUrl = computed(() => appConfig.pukalani?.auth?.termsUrl ?? '')
/** Wie im Register-Formular: der AGB-Link folgt der Sprache (BS1 R1). */
const termsHref = computed(() => (termsUrl.value.startsWith('/') ? localePath(termsUrl.value) : termsUrl.value))
const termsDraft = computed(() => requireTerms.value && appConfig.pukalani?.auth?.termsDraft === true)

const schema = computed(() => createConsentPromptSchema(t, {
  requireTerms: requireTerms.value,
  requireBusiness: requireBusiness.value,
}))
const state = reactive<ConsentPromptInput>({ terms: false, business: false })
const loading = ref(false)
const errorMessage = ref<string | null>(null)

async function onSubmit(event: FormSubmitEvent<ConsentPromptInput>) {
  loading.value = true
  errorMessage.value = null
  try {
    const result = await $fetch<ConsentStateResponse>('/api/auth/consent', {
      method: 'POST',
      body: {
        ...(requireTerms.value ? { terms: event.data.terms === true } : {}),
        ...(requireBusiness.value ? { business: event.data.business === true } : {}),
      },
    })
    consentState.value = { missing: result.missing }
    if (result.missing.length) {
      errorMessage.value = t('auth.consent.failed')
      return
    }
    toast.add({ title: t('auth.consent.success'), color: 'success', icon: 'i-ph-check-circle' })
    emit('close', true)
  }
  catch {
    errorMessage.value = t('auth.consent.failed')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal
    :title="t('auth.consent.title')"
    :description="t('auth.consent.description')"
    data-consent-prompt
    @update:open="(open: boolean) => { if (!open) emit('close', false) }"
  >
    <template #body>
      <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" class="mb-4" />

      <UForm :schema="schema" :validate-on="[]" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField v-if="requireTerms" name="terms">
          <UCheckbox v-model="state.terms" :label="t('auth.register.termsLabel')" data-consent-terms />
          <p v-if="termsDraft" class="mt-1 text-xs text-muted">{{ t('auth.register.termsDraftNotice') }}</p>
          <p v-if="termsUrl" class="mt-1">
            <ULink :to="termsHref" target="_blank" class="text-sm text-muted hover:text-primary">
              {{ t('auth.register.termsLink') }}
            </ULink>
          </p>
        </UFormField>

        <UFormField v-if="requireBusiness" name="business">
          <UCheckbox v-model="state.business" :label="t('auth.register.businessLabel')" data-consent-business />
          <p class="mt-1 text-xs text-muted">{{ t('auth.register.businessNotice') }}</p>
        </UFormField>

        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <UButton color="neutral" variant="ghost" :label="t('auth.consent.later')" @click="emit('close', false)" />
          <UButton type="submit" :loading="loading" :label="t('auth.consent.submit')" data-consent-submit />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
