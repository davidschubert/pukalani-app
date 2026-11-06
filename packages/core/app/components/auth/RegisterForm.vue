<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { createRegisterFormSchema, type RegisterFormInput } from '../../../schemas/auth'

/**
 * REGISTRIERUNG AUF EINLADUNG (Davids Entscheidung 2026-08-15) — die drei
 * Angaben, mit denen die Einladungs-Seite dieses Formular benutzt.
 *
 * Bewusst hier und nicht als zweites Formular auf `/join`: Passwortregeln,
 * AGB-Gate, Fehlermeldungen und der Trichter-Punkt leben an EINER Stelle. Eine
 * Kopie daneben wäre die Stelle, an der eine Regel künftig fehlt.
 */
const props = defineProps<{
  /**
   * Öffnet die Registrierung auf einer Community mit geschlossener
   * Anmeldung — der Server prüft ihn (`inviteOpensRegistrationFor`) und lässt
   * ihn NUR für die eingeladene Adresse gelten.
   */
  inviteToken?: string
  /**
   * Die eingeladene Adresse. Sie steht fest, weil der Server ohnehin nur sie
   * durchlässt: ein änderbares Feld böte hier eine Eingabe an, die garantiert
   * abgelehnt würde.
   */
  lockedEmail?: string
  /**
   * Wohin nach der Anmeldung. Ohne Angabe gilt wie bisher `?redirect=` bzw.
   * die Startseite — die Einladungs-Seite bleibt dagegen bei sich, dort wartet
   * noch der Klick auf „Einladung annehmen".
   */
  redirectTo?: string
  /**
   * Zulassungs-Code eines Produkt-Layers (Brand-Beta, …). Er öffnet eine per
   * Admission-Naht geschlossene INSTANZ-Registrierung für genau diese Anlage —
   * `core/server/utils/signupAdmission.ts` fragt den registrierten Provider,
   * der Layer antwortet.
   *
   * Er ist NICHT `inviteToken` darüber: der gehört zu `community_invites` und
   * öffnet eine geschlossene COMMUNITY. Beide können nebeneinander stehen,
   * weil sie zwei verschiedene Türen aufschliessen.
   *
   * Hier wird nichts entschieden und nichts versprochen: Format, Ablauf,
   * Adressbindung und Widerruf prüft ausschliesslich der Server, und er lehnt
   * für JEDEN Grund gleich ab (keine Enumeration). Die UI reicht durch.
   */
  admissionCode?: string
}>()

const { t } = useI18n()
const { afterAuthTarget } = useAuthRedirect()
const appConfig = useAppConfig()
const auth = useAuthStore()
const { authErrorMessage } = useAuthErrorMessage()
/**
 * Trichter-Punkt „registriert" (U18) — NUR auf einem Kontroll-Host.
 *
 * Dieses Formular gehört dem Core und läuft damit auch auf JEDEM
 * Mandanten-Host. Dort misst die Community ihre eigene Plausible-Site; ein
 * Betreiber-Trichter-Ereignis in fremden Kundenzahlen wäre schlicht falsch.
 * Der Trichter, um den es geht, beginnt auf account.pukalani.app.
 */
const { trackFunnel } = useFunnelEvent()
const isControlCenter = useIsControlCenter()
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const showPassword = ref(false)
const showPasswordConfirm = ref(false)

/**
 * BOT-BEWEIS (Turnstile, Vorfall 2026-10-27). Ohne Site-Key rendert das Widget
 * nichts, der Token bleibt leer und wird nicht mitgeschickt, der Knopf bleibt
 * frei — das Formular verhält sich exakt wie vorher. Mit Site-Key wartet der
 * Knopf, bis der Token da ist (meist unsichtbar, `interaction-only`).
 */
const turnstileToken = ref('')
const botCheck = ref<{ reset: () => void } | null>(null)
const turnstileEnabled = Boolean(useRuntimeConfig().public.turnstileSiteKey)
const waitingForBotCheck = computed(() => turnstileEnabled && turnstileToken.value === '')

// AGB-Checkbox nur, wenn die App eine termsUrl konfiguriert (config-gated)
const termsUrl = computed(() => appConfig.pukalani?.auth?.termsUrl ?? '')
const requireTerms = computed(() => !!termsUrl.value)
const localePath = useLocalePath()
/**
 * DER AGB-LINK FOLGT DER SPRACHE (BS1 R1). `termsUrl` ist ein App-PFAD
 * (`/terms`, `/agb`) — ohne `localePath()` landet ein deutscher Leser auf der
 * englischen Fassung, und zwar bei genau dem Text, dem er gerade zustimmt.
 * Eine absolute Adresse (falls eine App je eine setzt) bleibt unberührt.
 */
const termsHref = computed(() => (termsUrl.value.startsWith('/') ? localePath(termsUrl.value) : termsUrl.value))
/**
 * „Entwurf, in anwaltlicher Prüfung" NEBEN dem Häkchen (Davids Entscheidung 7
 * vom 2026-09-07, BS1 R1): auf branding.supply steht das Häkchen ab sofort,
 * obwohl die AGB noch ein Entwurf sind. Wer zustimmt, soll das WISSEN — der
 * Hinweis steht deshalb am Häkchen und nicht nur auf der Seite dahinter.
 * Ohne Häkchen kein Hinweis: er hinge sonst an nichts.
 */
const termsDraft = computed(() => requireTerms.value && appConfig.pukalani?.auth?.termsDraft === true)
/**
 * NUR FÜR UNTERNEHMEN UND SELBSTSTÄNDIGE (BS1 R1c, Davids Entscheidung vom
 * 2026-09-08): ein ZWEITES Pflicht-Häkchen, wenn die App B2B ist. Es hängt an
 * einem eigenen Schalter (`businessOnly`) und nicht an `termsUrl` — die AGB
 * sagen, welchem TEXT jemand zustimmt, dieses Häkchen sagt, WER zustimmt.
 * Festgehalten wird die Bestätigung server-seitig aus derselben Config
 * (`server/utils/businessConfirmation.ts`), nicht aus diesem Feld.
 */
const requireBusiness = computed(() => appConfig.pukalani?.auth?.businessOnly === true)
const schema = computed(() => createRegisterFormSchema(t, {
  requireTerms: requireTerms.value,
  requireBusiness: requireBusiness.value,
}))

// Eingegebene E-Mail + Name überleben den Wechsel Login ↔ Register ↔ Code
const sharedEmail = useState('pukalani-auth-email', () => '')
const sharedName = useState('pukalani-auth-name', () => '')
const state = reactive<RegisterFormInput>({
  name: sharedName.value,
  // Eine gebundene Einladung schlägt den gemerkten Wert: die Adresse ist hier
  // keine Wahl, sondern eine Tatsache.
  email: props.lockedEmail || sharedEmail.value,
  password: '',
  passwordConfirm: '',
  terms: false,
  business: false,
})
watch(() => state.email, (value) => { sharedEmail.value = value })
watch(() => state.name, (value) => { sharedName.value = value })

/**
 * DER GOOGLE-KNOPF IST DIE HINTERTÜR, WENN MAN IHN LÄSST (U14, erweitert um
 * BS1 R1c): er ist gesperrt, solange EIN Pflicht-Häkchen offen ist — nicht nur
 * das AGB-Häkchen. Sonst wäre „nur Unternehmen" eine Zusage, die man mit einem
 * Klick daneben umgeht.
 *
 * Der Hinweis nennt das ZUERST offene Häkchen; zwei Gründe in einem Titel
 * würden nur die Frage verschieben, welcher davon gemeint ist.
 */
const oauthBlockedBy = computed(() => {
  if (requireTerms.value && !state.terms) return t('auth.register.termsLabel')
  if (requireBusiness.value && !state.business) return t('auth.register.businessLabel')
  return ''
})

async function onSubmit(event: FormSubmitEvent<RegisterFormInput>) {
  loading.value = true
  errorMessage.value = null
  try {
    // passwordConfirm/terms sind reine UI-Validierung — der Server bekommt sie nicht
    await $fetch('/api/auth/signup', {
      method: 'POST',
      body: {
        name: event.data.name,
        email: event.data.email,
        password: event.data.password,
        // Nur gesetzt, wenn die Seite eine Einladung trägt. Der Server prüft
        // ihn selbst; hier wird nichts entschieden, nur weitergereicht.
        ...(props.inviteToken ? { inviteToken: props.inviteToken } : {}),
        // Dasselbe für den Zulassungs-Code der Instanz (Brand-Beta) — eine
        // andere Tür, dieselbe Arbeitsteilung.
        ...(props.admissionCode ? { admissionCode: props.admissionCode } : {}),
        // Nur mit Site-Key gesetzt — ohne fehlt das Feld wie vor dem Vorfall.
        ...(turnstileToken.value ? { turnstileToken: turnstileToken.value } : {}),
      },
    })
    await auth.refresh()
    if (isControlCenter) trackFunnel('funnel_register_done')
    await navigateTo(props.redirectTo || afterAuthTarget())
  }
  catch (error) {
    // Server weg ≠ gesperrt ≠ Account existiert ≠ Registrierung zu — ehrliche
    // Meldung je nach Ursache. Netzwerk und Sperre beantwortet der geteilte
    // Helfer (G7), den Rest nur dieses Formular.
    const status = (error as { statusCode?: number }).statusCode
    let fallback = t('auth.register.failed')
    if (status === 403) fallback = t('auth.register.disabled')
    else if (status === 409) fallback = t('auth.register.emailExists')
    else if (status === 422) fallback = t('auth.register.emailNotAllowed')
    errorMessage.value = authErrorMessage(error, fallback)
    // Der Token ist verbraucht (ein Token gilt einmal) — neuen holen.
    botCheck.value?.reset()
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-4" data-register-form>
    <div class="text-center">
      <UIcon name="i-ph-user-circle-plus" class="mx-auto size-8 text-primary" />
      <h1 class="mt-2 text-xl font-semibold">{{ t('auth.register.title') }}</h1>
      <p class="text-sm text-muted">{{ t('auth.register.description') }}</p>
    </div>

    <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />

    <UForm :schema="schema" :validate-on="[]" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField :label="t('auth.fields.name')" name="name" required>
        <UInput v-model="state.name" size="lg" :placeholder="t('auth.fields.namePlaceholder')" class="w-full" />
      </UFormField>

      <UFormField
        :label="t('auth.fields.email')"
        name="email"
        required
        :description="lockedEmail ? t('auth.register.invitedEmailNote') : undefined"
      >
        <UInput
          v-model="state.email"
          type="email"
          size="lg"
          :readonly="Boolean(lockedEmail)"
          :placeholder="t('auth.fields.emailPlaceholder')"
          class="w-full"
        />
      </UFormField>

      <UFormField :label="t('auth.fields.password')" name="password" required>
        <UInput
          v-model="state.password"
          :type="showPassword ? 'text' : 'password'"
          size="lg"
          :placeholder="t('auth.fields.passwordHint')"
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
      </UFormField>

      <UFormField :label="t('auth.fields.passwordConfirm')" name="passwordConfirm" required>
        <UInput
          v-model="state.passwordConfirm"
          :type="showPasswordConfirm ? 'text' : 'password'"
          size="lg"
          :placeholder="t('auth.fields.passwordConfirmPlaceholder')"
          class="w-full"
        >
          <template #trailing>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              :icon="showPasswordConfirm ? 'i-ph-eye-slash' : 'i-ph-eye'"
              :aria-label="t('auth.fields.togglePassword')"
              tabindex="-1"
              @click="() => { showPasswordConfirm = !showPasswordConfirm }"
            />
          </template>
        </UInput>
      </UFormField>

      <!-- Passwort-Stärke-Indikator (unter dem zweiten Passwortfeld) -->
      <AuthPasswordStrengthMeter :password="state.password" :password-confirm="state.passwordConfirm" />

      <UFormField v-if="requireTerms" name="terms">
        <UCheckbox v-model="state.terms" :label="t('auth.register.termsLabel')" />
        <p v-if="termsDraft" class="mt-1 text-xs text-muted" data-terms-draft>{{ t('auth.register.termsDraftNotice') }}</p>
      </UFormField>

      <UFormField v-if="requireBusiness" name="business">
        <UCheckbox v-model="state.business" :label="t('auth.register.businessLabel')" data-business-check />
        <p class="mt-1 text-xs text-muted" data-business-notice>{{ t('auth.register.businessNotice') }}</p>
      </UFormField>

      <AuthTurnstileWidget ref="botCheck" v-model="turnstileToken" action="signup" />

      <UButton type="submit" block size="lg" :loading="loading" :disabled="waitingForBotCheck">{{ t('auth.register.submit') }}</UButton>
    </UForm>

    <!--
      Social-Login BEWUSST unter dem Formular (U14): das AGB-Häkchen gilt für
      JEDEN Weg ins Konto, nicht nur für den mit Passwort. Stünde der
      Google-Knopf oben, wäre er die Hintertür um genau diese Zusage herum;
      gesperrt neben der Checkbox ist der Zusammenhang sichtbar.
      Der Server kann die Zustimmung nicht nachprüfen — er bekommt sie auch
      beim Passwort-Weg nicht (`terms` ist reine UI-Validierung, s. onSubmit).
      Damit ist der Google-Weg genauso streng wie der bestehende, und nicht
      strenger vorgetäuscht.
      SEIT BS1 R1c gilt dasselbe für das Unternehmer-Häkchen: gesperrt ist der
      Knopf, solange EINES der beiden Pflicht-Häkchen offen ist.
    -->
    <AuthOauthButtons
      separator="before"
      :disabled="oauthBlockedBy !== ''"
      :disabled-hint="oauthBlockedBy || undefined"
    />

    <p v-if="termsUrl" class="text-center">
      <ULink :to="termsHref" target="_blank" class="text-sm text-muted hover:text-primary">
        {{ t('auth.register.termsLink') }}
      </ULink>
    </p>
  </div>
</template>
