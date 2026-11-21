<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { createLoginSchema, type LoginInput } from '../../../schemas/auth'
import { OAUTH_UNAVAILABLE_CODE } from '../../../shared/oauthProviders'
import type { LoginResponse } from '../../../shared/types/auth-responses'

const { t } = useI18n()
const pukalaniSpeaks = usePukalaniSpeaks()
const { afterAuthTarget, authLinkTarget } = useAuthRedirect()
const appConfig = useAppConfig()
const auth = useAuthStore()
const toast = useToast()
const { authErrorMessage } = useAuthErrorMessage()
const { isEmbedPopup, completeEmbedLogin } = useEmbedPopup()

const loading = ref(false)
const errorMessage = ref<string | null>(null)
const showPassword = ref(false)
const formRoot = ref<HTMLElement | null>(null)

/**
 * Zwei-Faktor (U15 Teil 4): steht das auf true, hat das PASSWORT bereits
 * gestimmt und die Session existiert — es fehlt nur noch der zweite Faktor.
 * Der Erfolgspfad unten (refresh/Embed/Toast/Navigation) ist derselbe, egal
 * ob mit oder ohne zweiten Schritt; deshalb liegt er in `finishLogin()` und
 * nicht zweimal im Formular.
 */
const mfaRequired = ref(false)

// Code-Login-Link nur, wenn Email-OTP aktiviert ist (config-gated)
const otpEnabled = computed(() => appConfig.pukalani?.auth?.otp === true)

/**
 * Ein gescheiterter Social-Login kommt als WEITERLEITUNG zurück, nicht als
 * abgelehnter $fetch — die Routen können kein Formular ansprechen, sie können
 * nur einen Grund an die Adresse hängen. Ohne diesen Leser landete der Gast
 * auf einer makellosen Anmeldeseite und erführe nie, dass eben etwas
 * schiefging (der Grund wurde bis U14 gesetzt und nirgends gelesen).
 */
const route = useRoute()
const oauthError = computed(() =>
  route.query.error === OAUTH_UNAVAILABLE_CODE ? t(`auth.oauth.${OAUTH_UNAVAILABLE_CODE}`) : null,
)

// Eingegebene E-Mail überlebt den Wechsel Login ↔ Register ↔ Code
const sharedEmail = useState('pukalani-auth-email', () => '')
const state = reactive<LoginInput>({ email: sharedEmail.value, password: '' })
watch(() => state.email, (value) => { sharedEmail.value = value })

const schema = computed(() => createLoginSchema(t))

async function finishLogin() {
  await auth.refresh()
  // Embed-Popup (E2): Session ans iframe übergeben statt zu navigieren
  if (await completeEmbedLogin()) return
  // Toast (unten rechts, auto-dismiss) — überlebt die Navigation
  toast.add({ title: t('auth.login.success'), color: 'success', icon: 'i-ph-check-circle' })
  await navigateTo(afterAuthTarget())
}

async function onSubmit(event: FormSubmitEvent<LoginInput>) {
  loading.value = true
  errorMessage.value = null
  try {
    const result = await $fetch<LoginResponse>('/api/auth/login', { method: 'POST', body: event.data })
    // KEIN auth.refresh() vor dem zweiten Faktor: /api/auth/me antwortet auf
    // eine halbe Session mit 401, der Store würde den Nutzer also als
    // ausgeloggt führen und der Erfolgspfad liefe ins Leere.
    if (result.mfaRequired) {
      mfaRequired.value = true
      return
    }
    await finishLogin()
  }
  catch (error) {
    errorMessage.value = authErrorMessage(error, t('auth.login.failed'))
    // Der Knopf ist während des Wartens gesperrt, der Fokus fiele sonst auf
    // die Seite (UX-005).
    focusFormField(formRoot.value, 'password')
  }
  finally {
    loading.value = false
  }
}

function onMfaCancelled() {
  mfaRequired.value = false
  state.password = ''
}
</script>

<template>
  <AuthMfaChallengeForm v-if="mfaRequired" @solved="finishLogin" @cancel="onMfaCancelled" />

  <div v-else ref="formRoot" class="w-full max-w-sm space-y-4" data-login-form>
    <div class="text-center">
      <!-- Wo Pukalani spricht, steht darüber schon das Zeichen (AuthBrandHeader, Q24) — ein zweites Symbol wäre ein drittes Gesicht. -->
      <UIcon v-if="!pukalaniSpeaks" name="i-ph-user-circle" class="mx-auto size-8 text-primary" />
      <h1 class="mt-2 text-xl font-semibold">{{ t('auth.login.title') }}</h1>
      <p class="text-sm text-muted">{{ t('auth.login.description') }}</p>
    </div>

    <UAlert v-if="errorMessage" role="alert" color="error" variant="subtle" :title="errorMessage" />
    <UAlert v-else-if="oauthError" role="alert" color="error" variant="subtle" :title="oauthError" data-oauth-error />

    <AuthOauthButtons />

    <UForm :schema="schema" :validate-on="[]" :state="state" class="space-y-4" @error="focusFirstFormError" @submit="onSubmit">
      <UFormField :label="t('auth.fields.email')" name="email" required>
        <UInput v-model="state.email" type="email" autocomplete="username" size="lg" autofocus :placeholder="t('auth.fields.emailPlaceholder')" class="w-full" />
      </UFormField>

      <UFormField :label="t('auth.fields.password')" name="password" required class="relative" :ui="{ container: 'static' }">
        <UInput
          v-model="state.password"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="current-password"
          size="lg"
          :placeholder="t('auth.fields.passwordPlaceholder')"
          class="w-full"
        >
          <template #trailing>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              :icon="showPassword ? 'i-ph-eye-slash' : 'i-ph-eye'"
              :aria-label="t('auth.fields.togglePassword')"
              tabindex="-1"
              @click="() => { showPassword = !showPassword }"
            />
          </template>
        </UInput>
        <!-- „Passwort vergessen?" steht im QUELLTEXT hinter dem Feld (UX-009):
             als Hinweis der Beschriftung lag der Link davor, und Tab führte
             von der E-Mail auf ihn statt ins Passwortfeld. Zu sehen ist er
             weiter oben rechts neben der Beschriftung. -->
        <ULink
          :to="authLinkTarget('/forgot-password')"
          class="absolute top-0 end-0 text-sm text-muted hover:text-primary"
          data-login-forgot
        >
          {{ t('auth.login.forgot') }}
        </ULink>
      </UFormField>

      <UButton type="submit" block size="lg" :loading="loading">{{ t('auth.login.submit') }}</UButton>
    </UForm>

    <!-- Code-Login als gleichrangige Alternative — eigene Seite /login/code -->
    <template v-if="otpEnabled">
      <USeparator :label="t('auth.or')" />
      <UButton
        :to="authLinkTarget('/login/code', isEmbedPopup ? { embed: '1' } : {})"
        icon="i-ph-envelope-simple"
        color="neutral"
        variant="subtle"
        size="lg"
        block
        data-otp-link
      >
        {{ t('auth.otp.switchToOtp') }}
      </UButton>
    </template>

    <USeparator />
    <p class="text-center text-sm text-muted">
      {{ t('auth.login.noAccount') }}
      <ULink :to="authLinkTarget('/register')" class="font-medium text-primary">{{ t('auth.login.registerLink') }}</ULink>
    </p>
  </div>
</template>
