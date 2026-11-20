<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { createMfaChallengeSchema, type MfaChallengeInput } from '../../../schemas/auth'

/**
 * Der zweite Schritt der Anmeldung (U15 Teil 4).
 *
 * Er erscheint erst, NACHDEM das Passwort saß — die Session existiert an
 * dieser Stelle bereits, sie trägt nur noch nicht den zweiten Faktor. Deshalb
 * ist „Abbrechen" hier ein echtes Abmelden und kein bloßes Zurückblättern:
 * sonst bliebe ein halbes Session-Cookie im Browser liegen.
 *
 * ── DAS SCHEMA IST HIER KEIN KOMFORT, SONDERN EIN SCHUTZ ──────────────────
 * (Audit 2026-08-15, Schnitt C.) Die Challenge-Route ist auf 5 Versuche pro
 * Minute gedeckelt — dieselben 5, gegen die ein Angreifer rät. Ohne
 * `:schema` ging ein fünfstelliger Tippfehler als 400 hinaus und verbrauchte
 * einen davon: wer sich zweimal vertippt, sperrt sich mitten in der eigenen
 * Anmeldung aus. Mit dem Schema scheitert die Form-Prüfung im Browser, und
 * der Eimer sieht die Anfrage gar nicht erst.
 *
 * DASSELBE SCHEMA WIE DIE ROUTE, nicht ein zweites daneben: `mode` entscheidet
 * über sechs Ziffern (TOTP) oder zehn Zeichen (Wiederherstellung), und die
 * Bereinigung von Leerzeichen/Bindestrichen steckt darin — ein eigenes
 * Client-Schema würde diese Verzweigung nachbauen und beim nächsten Format
 * auseinanderlaufen.
 */
const props = defineProps<{ loading?: boolean }>()
const emit = defineEmits<{ solved: [], cancel: [] }>()

const { t } = useI18n()
const { authErrorMessage } = useAuthErrorMessage()

const busy = ref(false)
const errorMessage = ref<string | null>(null)

/**
 * `mode` gehört IN den Zustand, nicht daneben: die Regel verzweigt danach
 * (sechs Ziffern oder zehn Zeichen), und ein Schema kann nur prüfen, was das
 * Formular ihm zeigt.
 */
const state = reactive<{ mode: 'totp' | 'recovery', code: string }>({ mode: 'totp', code: '' })
const schema = computed(() => createMfaChallengeSchema(t))

const isRecovery = computed(() => state.mode === 'recovery')

function switchMode() {
  state.mode = isRecovery.value ? 'totp' : 'recovery'
  state.code = ''
  errorMessage.value = null
}

async function onSubmit(event: FormSubmitEvent<MfaChallengeInput>) {
  busy.value = true
  errorMessage.value = null
  try {
    // Der GEPUTZTE Code aus der Prüfung, nicht der getippte: die Bereinigung
    // von Leerzeichen und Bindestrichen steckt im Schema, und die Route
    // erwartet dasselbe Ergebnis.
    await $fetch('/api/auth/mfa/challenge', { method: 'POST', body: event.data })
    emit('solved')
  }
  catch (error) {
    errorMessage.value = authErrorMessage(error, t('auth.mfa.challenge.failed'))
    state.code = ''
  }
  finally {
    busy.value = false
  }
}

async function onCancel() {
  // Best effort — das Cookie räumt die Route, und selbst wenn nicht, ist die
  // halbe Session für jeden Konto-Zugriff wertlos.
  await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
  emit('cancel')
}
</script>

<template>
  <div class="w-full max-w-sm space-y-4" data-mfa-challenge>
    <div class="text-center">
      <UIcon name="i-ph-shield-check" class="mx-auto size-8 text-primary" />
      <h1 class="mt-2 text-xl font-semibold">{{ t('auth.mfa.challenge.title') }}</h1>
      <p class="text-sm text-muted">
        {{ isRecovery ? t('auth.mfa.challenge.recoveryDescription') : t('auth.mfa.challenge.description') }}
      </p>
    </div>

    <UAlert v-if="errorMessage" role="alert" color="error" variant="subtle" :title="errorMessage" data-mfa-error />

    <UForm :schema="schema" :validate-on="[]" :state="state" class="space-y-4" @error="focusFirstFormError" @submit="onSubmit">
      <UFormField :label="isRecovery ? t('auth.mfa.fields.recoveryCode') : t('auth.mfa.fields.code')" name="code" required>
        <UInput
          v-model="state.code"
          size="lg"
          autofocus
          autocomplete="one-time-code"
          :inputmode="isRecovery ? 'text' : 'numeric'"
          :placeholder="isRecovery ? t('auth.mfa.fields.recoveryPlaceholder') : t('auth.mfa.fields.codePlaceholder')"
          class="w-full"
          data-mfa-code
        />
      </UFormField>

      <UButton type="submit" block size="lg" :loading="busy || props.loading" data-mfa-submit>
        {{ t('auth.mfa.challenge.submit') }}
      </UButton>
    </UForm>

    <div class="flex items-center justify-between text-sm">
      <UButton variant="link" color="neutral" class="px-0" data-mfa-switch @click="switchMode">
        {{ isRecovery ? t('auth.mfa.challenge.useTotp') : t('auth.mfa.challenge.useRecovery') }}
      </UButton>
      <UButton variant="link" color="neutral" class="px-0" @click="onCancel">
        {{ t('auth.mfa.challenge.cancel') }}
      </UButton>
    </div>
  </div>
</template>
