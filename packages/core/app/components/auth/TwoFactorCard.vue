<script setup lang="ts">
/**
 * Konto → Sicherheit: Zwei-Faktor (U15 Teil 4).
 *
 * Vier Zustände in EINER Karte, weil es für den Nutzer EINE Sache ist:
 *  aus → einrichten (QR scannen) → Codes notieren → an.
 *
 * Die Wiederherstellungs-Codes erscheinen GENAU EINMAL — es gibt bewusst
 * keine Route, die sie später nochmal zeigt (Appwrite gibt sie ein zweites
 * Mal nur beim Neu-Würfeln heraus). Deshalb kommt man aus diesem Schritt nur
 * mit einer aktiven Bestätigung heraus, nicht durch Wegklicken.
 */
import type {
  MfaDisableResponse,
  MfaSetupResponse,
  MfaStatusResponse,
  MfaVerifyResponse,
} from '../../../shared/types/auth-responses'

const { t } = useI18n()
const toast = useToast()

type Step = 'idle' | 'scan' | 'codes' | 'disable'

const step = ref<Step>('idle')
const busy = ref(false)
const errorMessage = ref<string | null>(null)

const secret = ref('')
const uri = ref('')
const qr = ref('')
const code = ref('')
const recoveryCodes = ref<string[]>([])
const codesNoted = ref(false)

const disableMode = ref<'totp' | 'recovery'>('totp')

// BEWUSST ohne top-level await: das machte die Karte zu einer async-Komponente
// und haengte das Rendern der Seite an einen Appwrite-Aufruf. Die Vorlagen
// unten vertragen `status === null` (der Zustand heisst dann „aus"), und der
// Nachtrag kommt still an.
const { data: status, refresh, error: statusError } = useFetch<MfaStatusResponse>('/api/auth/mfa/status')
// LZ1: scheitert die Auskunft, sagt die Karte NICHT „aus" (und bietet „Einrichten"
// an), sondern zeigt den Fehler mit Neuversuch — bei einer Sicherheits-Einstellung
// wäre das falsche „aus" eine gefährliche Auskunft.
const enabled = computed(() => status.value?.enabled === true)

function reset() {
  step.value = 'idle'
  secret.value = ''
  uri.value = ''
  qr.value = ''
  code.value = ''
  recoveryCodes.value = []
  codesNoted.value = false
  errorMessage.value = null
}

async function startSetup() {
  busy.value = true
  errorMessage.value = null
  try {
    const result = await $fetch<MfaSetupResponse>('/api/auth/mfa/setup', { method: 'POST' })
    secret.value = result.secret
    uri.value = result.uri
    qr.value = result.qr
    step.value = 'scan'
  }
  catch {
    errorMessage.value = t('account.twoFactor.setupFailed')
  }
  finally {
    busy.value = false
  }
}

async function confirmSetup() {
  busy.value = true
  errorMessage.value = null
  try {
    const result = await $fetch<MfaVerifyResponse>('/api/auth/mfa/verify', { method: 'POST', body: { code: code.value } })
    recoveryCodes.value = result.recoveryCodes
    // Ab hier ist der Zweitfaktor scharf — das Geheimnis darf aus dem Speicher.
    secret.value = ''
    uri.value = ''
    qr.value = ''
    code.value = ''
    step.value = 'codes'
    await refresh()
  }
  catch (error) {
    errorMessage.value = (error as { data?: { reason?: string } })?.data?.reason === 'mfa_invalid_code'
      ? t('account.twoFactor.invalidCode')
      : t('account.twoFactor.setupFailed')
    code.value = ''
  }
  finally {
    busy.value = false
  }
}

async function confirmDisable() {
  busy.value = true
  errorMessage.value = null
  try {
    await $fetch<MfaDisableResponse>('/api/auth/mfa/disable', { method: 'POST', body: { mode: disableMode.value, code: code.value } })
    toast.add({ title: t('account.twoFactor.disabled'), color: 'success', icon: 'i-ph-check-circle' })
    reset()
    await refresh()
  }
  catch (error) {
    errorMessage.value = (error as { data?: { reason?: string } })?.data?.reason === 'mfa_invalid_code'
      ? t('account.twoFactor.invalidCode')
      : t('account.twoFactor.disableFailed')
    code.value = ''
  }
  finally {
    busy.value = false
  }
}

function finishCodes() {
  reset()
  toast.add({ title: t('account.twoFactor.enabled'), color: 'success', icon: 'i-ph-shield-check' })
}

async function copyCodes() {
  try {
    await navigator.clipboard.writeText(recoveryCodes.value.join('\n'))
    toast.add({ title: t('account.twoFactor.codesCopied'), color: 'success', icon: 'i-ph-check-circle' })
  }
  catch {
    // Zwischenablage verweigert (Berechtigung/Kontext) — die Codes stehen
    // sichtbar daneben, abschreiben geht immer.
  }
}
</script>

<template>
  <UPageCard
    :title="t('account.twoFactor.title')"
    :description="t('account.twoFactor.description')"
    variant="subtle"
    data-two-factor
  >
    <div class="flex w-full max-w-sm flex-col gap-4">
      <UAlert v-if="errorMessage" role="alert" color="error" variant="subtle" :title="errorMessage" data-two-factor-error />

      <CoreInlineLoadError v-if="step === 'idle' && statusError" :retry="refresh" data-two-factor-load-error />

      <!-- Zustand: aus oder an -->
      <template v-else-if="step === 'idle'">
        <UBadge
          :color="enabled ? 'success' : 'neutral'"
          variant="subtle"
          class="w-fit"
          :icon="enabled ? 'i-ph-shield-check' : 'i-ph-shield'"
          data-two-factor-state
        >
          {{ enabled ? t('account.twoFactor.stateOn') : t('account.twoFactor.stateOff') }}
        </UBadge>

        <UButton
          v-if="!enabled"
          :label="t('account.twoFactor.enable')"
          size="lg"
          class="w-fit"
          :loading="busy"
          data-two-factor-enable
          @click="startSetup"
        />
        <UButton
          v-else
          :label="t('account.twoFactor.disable')"
          color="error"
          variant="subtle"
          size="lg"
          class="w-fit"
          data-two-factor-disable
          @click="() => { step = 'disable'; code = '' }"
        />
      </template>

      <!-- Zustand: QR scannen und ersten Code eingeben -->
      <template v-else-if="step === 'scan'">
        <p class="text-sm text-muted">{{ t('account.twoFactor.scanHint') }}</p>

        <img v-if="qr" :src="qr" :alt="t('account.twoFactor.qrAlt')" class="size-40 rounded bg-white p-2" data-two-factor-qr>

        <!-- Ohne Bild (oder ohne Kamera) bleibt der Weg über das Geheimnis offen -->
        <div class="rounded border border-default p-3">
          <p class="text-xs text-muted">{{ t('account.twoFactor.manualHint') }}</p>
          <code class="mt-1 block break-all font-mono text-xs" data-two-factor-secret>{{ secret }}</code>
        </div>

        <UFormField :label="t('auth.mfa.fields.code')" name="code" required>
          <UInput
            v-model="code"
            size="lg"
            autocomplete="one-time-code"
            inputmode="numeric"
            :placeholder="t('auth.mfa.fields.codePlaceholder')"
            class="w-full"
            data-two-factor-code
          />
        </UFormField>

        <div class="flex gap-2">
          <UButton
            :label="t('account.twoFactor.confirm')"
            size="lg"
            :loading="busy"
            data-two-factor-confirm
            @click="confirmSetup"
          />
          <UButton :label="t('ui.cancel')" color="neutral" variant="ghost" size="lg" @click="reset" />
        </div>
      </template>

      <!-- Zustand: Wiederherstellungs-Codes — einmalig! -->
      <template v-else-if="step === 'codes'">
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-ph-warning"
          :title="t('account.twoFactor.codesTitle')"
          :description="t('account.twoFactor.codesWarning')"
        />

        <ul class="grid grid-cols-2 gap-2 rounded border border-default p-3 font-mono text-sm" data-two-factor-codes>
          <li v-for="entry in recoveryCodes" :key="entry">{{ entry }}</li>
        </ul>

        <UButton
          :label="t('account.twoFactor.copyCodes')"
          icon="i-ph-copy"
          color="neutral"
          variant="subtle"
          class="w-fit"
          @click="copyCodes"
        />

        <UCheckbox v-model="codesNoted" :label="t('account.twoFactor.codesConfirm')" data-two-factor-noted />

        <UButton
          :label="t('account.twoFactor.done')"
          size="lg"
          class="w-fit"
          :disabled="!codesNoted"
          data-two-factor-done
          @click="finishCodes"
        />
      </template>

      <!-- Zustand: abschalten, gegen einen gültigen zweiten Faktor -->
      <template v-else-if="step === 'disable'">
        <p class="text-sm text-muted">
          {{ disableMode === 'recovery' ? t('account.twoFactor.disableRecoveryHint') : t('account.twoFactor.disableHint') }}
        </p>

        <UFormField
          :label="disableMode === 'recovery' ? t('auth.mfa.fields.recoveryCode') : t('auth.mfa.fields.code')"
          name="code"
          required
        >
          <UInput
            v-model="code"
            size="lg"
            autocomplete="one-time-code"
            :inputmode="disableMode === 'recovery' ? 'text' : 'numeric'"
            class="w-full"
            data-two-factor-disable-code
          />
        </UFormField>

        <UButton
          variant="link"
          color="neutral"
          class="w-fit px-0"
          @click="() => { disableMode = disableMode === 'recovery' ? 'totp' : 'recovery'; code = '' }"
        >
          {{ disableMode === 'recovery' ? t('auth.mfa.challenge.useTotp') : t('auth.mfa.challenge.useRecovery') }}
        </UButton>

        <div class="flex gap-2">
          <UButton
            :label="t('account.twoFactor.disableConfirm')"
            color="error"
            size="lg"
            :loading="busy"
            data-two-factor-disable-confirm
            @click="confirmDisable"
          />
          <UButton :label="t('ui.cancel')" color="neutral" variant="ghost" size="lg" @click="reset" />
        </div>
      </template>
    </div>
  </UPageCard>
</template>
