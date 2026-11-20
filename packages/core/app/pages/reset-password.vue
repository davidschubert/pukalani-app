<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { createResetSchema, type ResetFormInput } from '../../schemas/auth'

definePageMeta({ layout: 'auth', middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const toast = useToast()
const loading = ref(false)
const failed = ref(false)
// Der Grund des Fehlschlags, sobald wir einen kennen (heute: die Minuten-
// Sperre). Sonst bleibt es beim allgemeinen „hat nicht geklappt".
const failedMessage = ref('')
const { authErrorMessage } = useAuthErrorMessage()

// Seitentitel „Neues Passwort · <Brand>" — gleiche Kette wie /login (B3-Rest).
useBrandTitle(() => t('auth.reset.title'))

// userId + secret kommen aus dem Link der Recovery-Mail
const userId = computed(() => String(route.query.userId ?? ''))
const secret = computed(() => String(route.query.secret ?? ''))
const linkValid = computed(() => userId.value.length > 0 && secret.value.length > 0)

const schema = computed(() => createResetSchema(t))
const state = reactive<ResetFormInput>({ password: '', passwordConfirm: '' })

async function onSubmit(event: FormSubmitEvent<ResetFormInput>) {
  loading.value = true
  failed.value = false
  failedMessage.value = ''
  try {
    await $fetch('/api/auth/recovery', {
      method: 'PUT',
      body: { userId: userId.value, secret: secret.value, password: event.data.password },
    })
    toast.add({ title: t('auth.reset.success'), color: 'success' })
    await navigateTo(localePath('/login'))
  }
  catch (error) {
    // Auch das Setzen des neuen Passworts ist gedrosselt (PUT /recovery,
    // FAILURE_LIMITED) — nach fünf Fehlversuchen ist „hat nicht geklappt"
    // richtig, aber unbrauchbar; die Sperre nennt sich selbst (G7).
    failed.value = true
    failedMessage.value = authErrorMessage(error, t('auth.reset.failed'))
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-sm space-y-4" data-reset-password>
    <div class="text-center">
      <UIcon name="i-ph-lock-key" class="mx-auto size-8 text-primary" />
      <h1 class="mt-2 text-xl font-semibold">{{ t('auth.reset.title') }}</h1>
      <p class="text-sm text-muted">{{ t('auth.reset.description') }}</p>
    </div>

    <UAlert v-if="!linkValid" role="alert" color="error" variant="subtle" :title="t('auth.reset.invalidLink')" />

    <template v-else>
      <UAlert v-if="failed" role="alert" color="error" variant="subtle" :title="failedMessage || t('auth.reset.failed')" />

      <UForm :schema="schema" :validate-on="[]" :state="state" class="space-y-4" @error="focusFirstFormError" @submit="onSubmit">
        <UFormField :label="t('auth.fields.password')" name="password" required>
          <UInput v-model="state.password" type="password" autocomplete="new-password" size="lg" :placeholder="t('auth.fields.passwordHint')" class="w-full" />
        </UFormField>
        <UFormField :label="t('auth.fields.passwordConfirm')" name="passwordConfirm" required>
          <UInput v-model="state.passwordConfirm" type="password" autocomplete="new-password" size="lg" :placeholder="t('auth.fields.passwordConfirmPlaceholder')" class="w-full" />
        </UFormField>
        <UButton type="submit" block size="lg" :loading="loading">{{ t('auth.reset.submit') }}</UButton>
      </UForm>
    </template>

    <p class="text-center text-sm text-muted">
      <ULink :to="localePath('/forgot-password')" class="font-medium text-primary">{{ t('auth.reset.requestNew') }}</ULink>
    </p>
  </div>
</template>
