<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { createOtpRequestSchema, type OtpRequestInput } from '../../../schemas/auth'
import type { OtpVerifyResponse } from '../../../shared/types/auth-responses'

const props = defineProps<{
  /** true = Registrierungs-Kontext: eigene Texte, AGB-Pflicht bei termsUrl */
  register?: boolean
}>()

const { t } = useI18n()
const { afterAuthTarget } = useAuthRedirect()
const appConfig = useAppConfig()
const auth = useAuthStore()
const { completeEmbedLogin } = useEmbedPopup()
const { authErrorMessage } = useAuthErrorMessage()
const toast = useToast()
/**
 * Trichter-Punkt „registriert" (U18) — dieselbe Kontroll-Host-Klammer wie im
 * Passwort-Formular (RegisterForm.vue, dort die Begründung). Zusätzlich hängt
 * er an `register`: dieselbe Maske bedient auch die ANMELDUNG bestehender
 * Konten, und ein Login ist kein Trichter-Eintritt. Der Preis ist bekannt: wer
 * über /register/code ein BESTEHENDES Konto anmeldet, wird mitgezählt — die
 * Route unterscheidet Anlegen und Anmelden bewusst nicht (Auto-Signup).
 */
const { trackFunnel } = useFunnelEvent()
const isControlCenter = useIsControlCenter()

const step = ref<'email' | 'code'>('email')
const loading = ref(false)
const errorMessage = ref<string | null>(null)

/**
 * Zwei-Faktor, auch auf dem Code-Weg (Befund 2026-10-24, prod): steht das auf
 * true, hat der E-MAIL-CODE bereits gestimmt und die Session existiert — es
 * fehlt nur noch der zweite Faktor aus der Authenticator-App. Bis dahin kannte
 * dieses Formular die Antwort `mfaRequired` nicht: es rief `auth.refresh()`,
 * bekam auf die halbe Session 401, und der Nutzer stand nach dem richtigen
 * Code wortlos wieder vor dem Login. Der Erfolgspfad ist derselbe, mit oder
 * ohne zweiten Schritt — deshalb liegt er in `finishLogin()` (wie im
 * Passwort-Formular) und nicht zweimal hier.
 */
const mfaRequired = ref(false)

/**
 * BOT-BEWEIS (Turnstile, Vorfall 2026-10-27). Das Widget steht AUSSERHALB des
 * E-Mail-Schritts, damit es auch im Code-Schritt lebt: „Code erneut senden"
 * ist ein zweiter `POST /api/auth/otp` und braucht einen frischen Token. Ohne
 * Site-Key rendert es nichts und beide Knöpfe verhalten sich wie vorher.
 */
const turnstileToken = ref('')
const botCheck = ref<{ reset: () => void } | null>(null)
const turnstileEnabled = Boolean(useRuntimeConfig().public.turnstileSiteKey)
const waitingForBotCheck = computed(() => turnstileEnabled && turnstileToken.value === '')

// AGB nur im register-Modus erzwingen — Login bestehender User bleibt friktionsfrei
const termsUrl = computed(() => appConfig.pukalani?.auth?.termsUrl ?? '')
const requireTerms = computed(() => props.register === true && termsUrl.value.length > 0)
const localePath = useLocalePath()
/** Wie im Register-Formular: der AGB-Link folgt der Sprache (BS1 R1). */
const termsHref = computed(() => (termsUrl.value.startsWith('/') ? localePath(termsUrl.value) : termsUrl.value))
/** Der Entwurfs-Hinweis am Häkchen — dieselbe Regel wie dort (BS1 R1). */
const termsDraft = computed(() => requireTerms.value && appConfig.pukalani?.auth?.termsDraft === true)
/**
 * NUR FÜR UNTERNEHMEN UND SELBSTSTÄNDIGE (BS1 R1c) — dieselbe Regel wie im
 * Passwort-Formular, mit derselben Abgrenzung wie beim AGB-Häkchen: nur im
 * register-Modus. Wer sich mit einem BESTEHENDEN Konto per Code anmeldet, hat
 * die Frage bei der Anlage schon beantwortet.
 */
const requireBusiness = computed(() => props.register === true && appConfig.pukalani?.auth?.businessOnly === true)

const schema = computed(() => createOtpRequestSchema(t, {
  requireTerms: requireTerms.value,
  requireBusiness: requireBusiness.value,
  requireName: props.register === true,
}))

// E-Mail + Name teilen sich den State mit Login/Register (Flow-Wechsel)
const sharedEmail = useState('pukalani-auth-email', () => '')
const sharedName = useState('pukalani-auth-name', () => '')
const state = reactive<OtpRequestInput>({
  email: sharedEmail.value,
  name: props.register ? sharedName.value : '',
  terms: false,
  business: false,
})
// Namen nur im Register-Kontext mit dem Passwort-Register-Formular teilen
watch(() => state.name, (value) => { if (props.register) sharedName.value = value ?? '' })

const userId = ref('')
const phrase = ref('')
const code = ref<string[]>([])

// "Code erneut senden" mit Countdown
const resendIn = ref(0)
let countdown: ReturnType<typeof setInterval> | null = null

function startCountdown() {
  resendIn.value = 30
  if (countdown) clearInterval(countdown)
  countdown = setInterval(() => {
    resendIn.value -= 1
    if (resendIn.value <= 0 && countdown) clearInterval(countdown)
  }, 1000)
}

onScopeDispose(() => {
  if (countdown) clearInterval(countdown)
})

async function requestToken() {
  let response: { ok: boolean, userId: string, phrase: string }
  try {
    response = await $fetch<{ ok: boolean, userId: string, phrase: string }>('/api/auth/otp', {
      method: 'POST',
      body: { email: state.email, ...(turnstileToken.value ? { turnstileToken: turnstileToken.value } : {}) },
    })
  }
  finally {
    // Ein Token gilt einmal — egal, wie der Request ausgeht, er ist
    // verbraucht; der nächste Versuch (Wiederholen, „erneut senden") braucht
    // einen frischen.
    botCheck.value?.reset()
  }
  userId.value = response.userId
  phrase.value = response.phrase
  startCountdown()
}

async function requestCode(event: FormSubmitEvent<OtpRequestInput>) {
  loading.value = true
  errorMessage.value = null
  try {
    sharedEmail.value = event.data.email
    await requestToken()
    code.value = []
    step.value = 'code'
  }
  catch (error) {
    errorMessage.value = requestErrorMessage(error)
  }
  finally {
    loading.value = false
  }
}

/**
 * F37 (2026-08-02): der Fall „diese Instanz kann kein OTP" bekommt einen
 * eigenen Satz. Vorher lief er in `auth.otp.requestFailed` („Code konnte nicht
 * angefordert werden") — also in einen Text, der zum Wiederholen einlädt,
 * obwohl Wiederholen nie hilft. Der Grund reist als `reason` im Envelope
 * (core/server/error.ts), nicht über den Status: 503 allein könnte auch eine
 * überlastete Instanz sein.
 */
function requestErrorMessage(error: unknown): string {
  // `otp_unavailable` steht VOR dem geteilten Helfer, weil es der speziellere
  // Grund ist; Netzwerk und Sperre erledigt danach authErrorMessage (G7).
  if ((error as { data?: { reason?: string } })?.data?.reason === 'otp_unavailable') {
    return t('auth.otp.unavailable')
  }
  const status = (error as { statusCode?: number }).statusCode
  const fallback = props.register && status === 403
    ? t('auth.register.disabled')
    : t('auth.otp.requestFailed')
  return authErrorMessage(error, fallback)
}

async function resend() {
  if (resendIn.value > 0) return
  loading.value = true
  errorMessage.value = null
  try {
    await requestToken()
  }
  catch (error) {
    errorMessage.value = requestErrorMessage(error)
  }
  finally {
    loading.value = false
  }
}

async function finishLogin() {
  await auth.refresh()

  // Optionaler Name — NUR setzen, wenn der Account noch keinen hat
  // (Auto-Signup legt User mit leerem Namen an; Bestandsnamen bleiben unangetastet)
  const pendingName = state.name?.trim() ?? ''
  if (pendingName.length >= 2 && auth.user && auth.user.name === '') {
    try {
      await $fetch('/api/auth/profile', { method: 'PUT', body: { name: pendingName } })
      await auth.refresh()
    }
    catch {
      // Name setzen fehlgeschlagen — Login bleibt trotzdem erfolgreich
    }
  }

  if (props.register && isControlCenter) trackFunnel('funnel_register_done')

  // Embed-Popup (E2): Session ans iframe übergeben statt zu navigieren
  if (await completeEmbedLogin()) return
  toast.add({ title: t('auth.login.success'), color: 'success', icon: 'i-ph-check-circle' })
  await navigateTo(afterAuthTarget())
}

async function verify() {
  const secret = code.value.join('')
  if (secret.length !== 6) return
  loading.value = true
  errorMessage.value = null
  try {
    const result = await $fetch<OtpVerifyResponse>('/api/auth/otp/verify', {
      method: 'POST',
      body: { userId: userId.value, code: secret },
    })
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
    // Auch die Code-PRÜFUNG ist gedrosselt (FAILURE_LIMITED) — nach fünf
    // Fehlversuchen wäre „Der Code stimmt nicht" die zweite Unwahrheit
    // hintereinander, denn geprüft wurde er gar nicht mehr (G7).
    errorMessage.value = authErrorMessage(error, t('auth.otp.invalidCode'))
    code.value = []
  }
  finally {
    loading.value = false
  }
}

/**
 * „Abbrechen" in der Zwei-Faktor-Maske hat die halbe Session bereits
 * abgemeldet (AuthMfaChallengeForm). Der E-Mail-Code ist mit dem Anlegen der
 * Session VERBRAUCHT — zurück geht es deshalb zum E-Mail-Schritt, nicht zur
 * Code-Eingabe: dort wäre jeder Versuch ein garantierter Fehlschlag.
 */
function onMfaCancelled() {
  mfaRequired.value = false
  code.value = []
  step.value = 'email'
}
</script>

<template>
  <AuthMfaChallengeForm v-if="mfaRequired" @solved="finishLogin" @cancel="onMfaCancelled" />

  <div v-else class="space-y-4" data-otp-login>
    <div class="text-center">
      <UIcon name="i-ph-envelope-simple" class="mx-auto size-8 text-primary" />
      <h1 class="mt-2 text-xl font-semibold">
        {{ register ? t('auth.otp.registerTitle') : t('auth.otp.title') }}
      </h1>
      <p class="text-sm text-muted">
        {{ step === 'email'
          ? (register ? t('auth.otp.registerDescription') : t('auth.otp.description'))
          : t('auth.otp.codeDescription', { email: state.email }) }}
      </p>
    </div>

    <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />

    <UForm v-if="step === 'email'" :schema="schema" :validate-on="[]" :state="state" class="space-y-4" @submit="requestCode">
      <!-- Name nur im Register-Kontext — auf /login hat der User längst einen -->
      <UFormField v-if="register" :label="t('auth.fields.name')" name="name" required>
        <UInput v-model="state.name" size="lg" :placeholder="t('auth.fields.namePlaceholder')" class="w-full" />
      </UFormField>
      <UFormField :label="t('auth.fields.email')" name="email" required>
        <UInput v-model="state.email" type="email" size="lg" :placeholder="t('auth.fields.emailPlaceholder')" class="w-full" />
      </UFormField>
      <UFormField v-if="requireTerms" name="terms">
        <UCheckbox v-model="state.terms" :label="t('auth.register.termsLabel')" />
        <p v-if="termsDraft" class="mt-1 text-xs text-muted" data-terms-draft>{{ t('auth.register.termsDraftNotice') }}</p>
      </UFormField>
      <UFormField v-if="requireBusiness" name="business">
        <UCheckbox v-model="state.business" :label="t('auth.register.businessLabel')" data-business-check />
        <p class="mt-1 text-xs text-muted" data-business-notice>{{ t('auth.register.businessNotice') }}</p>
      </UFormField>
      <UButton type="submit" block size="lg" :loading="loading" :disabled="waitingForBotCheck">{{ t('auth.otp.requestCode') }}</UButton>
      <p v-if="requireTerms" class="text-center">
        <ULink :to="termsHref" target="_blank" class="text-sm text-muted hover:text-primary">
          {{ t('auth.register.termsLink') }}
        </ULink>
      </p>
    </UForm>

    <template v-else>
      <!-- Phishing-Schutz: dieselbe Phrase steht in der echten Mail -->
      <UAlert color="info" variant="subtle" :title="t('auth.otp.phraseHint')" :description="`«${phrase}»`" />

      <div class="flex justify-center">
        <UPinInput v-model="code" :length="6" otp size="lg" autofocus @complete="verify" />
      </div>

      <UButton block size="lg" :loading="loading" :disabled="code.join('').length !== 6" @click="verify">
        {{ t('auth.otp.verify') }}
      </UButton>

      <p class="text-center text-sm text-muted">
        <UButton variant="link" size="sm" :disabled="resendIn > 0 || loading || waitingForBotCheck" @click="resend">
          {{ resendIn > 0 ? t('auth.otp.resendIn', { seconds: resendIn }) : t('auth.otp.resend') }}
        </UButton>
      </p>
    </template>

    <AuthTurnstileWidget ref="botCheck" v-model="turnstileToken" action="otp" />
  </div>
</template>
