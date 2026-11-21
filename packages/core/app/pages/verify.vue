<script setup lang="ts">
/**
 * Ziel des Verifizierungs-Links (Mail nach Signup bzw. Banner-Resend):
 * bestätigt userId+secret aus der Query — BEWUSST ohne Login-Pflicht, der
 * Link wird oft auf einem anderen Gerät geöffnet (Mail am Handy). Mit
 * Session wird der Auth-State refresht, damit der Banner sofort verschwindet.
 */
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { isLoggedIn } = useCurrentUser()
const authStore = useAuthStore()

// Seitentitel „E-Mail bestätigen · <Brand>" — gleiche Kette wie /login (C5).
// BEWUSST der neutrale Vorgangs-Titel und nicht der Zustand: die Seite startet
// im Zustand 'working' und entscheidet erst in onMounted; ein Titel, der von
// „Bestätige …" auf „E-Mail bestätigt" springt, flackert im Tab.
useBrandTitle(() => t('auth.verification.pageTitle'))
// Konto-Seite ohne das Layout `auth` — gehört trotzdem nicht in eine Suche (Q10, SEO-007).
definePageMeta({ seoNoindex: true })

const state = ref<'working' | 'success' | 'invalid'>('working')

/**
 * M3: Bei einem abgelaufenen Link stand hier „Fordere über das Banner einen
 * neuen Bestätigungslink an" — die Seite hat kein Banner, und die einzige
 * Schaltfläche führte nach Hause. Jetzt steht der Knopf DA, wo der Nutzer
 * gerade steht; der Vorgang ist derselbe wie im Banner
 * (useEmailVerifyResend).
 *
 * Anfordern geht nur MIT Session (die Route braucht sie). Der Link wird oft
 * auf einem zweiten Gerät geöffnet — ohne Anmeldung führt der Weg deshalb
 * ehrlich über /login statt über einen Knopf, der 401 antwortet.
 */
const { sending, sent, resend } = useEmailVerifyResend()

onMounted(async () => {
  const userId = typeof route.query.userId === 'string' ? route.query.userId : ''
  const secret = typeof route.query.secret === 'string' ? route.query.secret : ''
  if (!userId || !secret) {
    state.value = 'invalid'
    return
  }
  try {
    await $fetch('/api/auth/verification', { method: 'PUT', body: { userId, secret } })
    if (isLoggedIn.value) await authStore.refresh() // Banner verschwindet sofort
    state.value = 'success'
  }
  catch {
    state.value = 'invalid'
  }
})
</script>

<template>
  <div class="mx-auto max-w-md py-16 text-center">
    <template v-if="state === 'working'">
      <p class="text-muted">{{ t('auth.verification.working') }}</p>
    </template>

    <template v-else-if="state === 'success'">
      <UIcon name="i-ph-check-circle" class="mx-auto size-10 text-success" />
      <h1 class="mt-3 text-xl font-semibold">{{ t('auth.verification.successTitle') }}</h1>
      <p class="mt-2 text-sm text-muted">{{ t('auth.verification.successMessage') }}</p>
      <UButton :to="localePath('/')" class="mt-6">{{ t('auth.verification.backHome') }}</UButton>
    </template>

    <template v-else>
      <UIcon name="i-ph-warning-circle" class="mx-auto size-10 text-error" />
      <h1 class="mt-3 text-xl font-semibold">{{ t('auth.verification.invalidTitle') }}</h1>
      <p class="mt-2 text-sm text-muted">
        {{ isLoggedIn ? t('auth.verification.invalidMessage') : t('auth.verification.invalidMessageGuest') }}
      </p>

      <div class="mt-6 flex flex-col items-center gap-2">
        <UAlert
          v-if="sent"
          color="success"
          variant="subtle"
          :title="t('auth.verification.sentTitle')"
          :description="t('auth.verification.sentDescription')"
          class="text-left"
        />
        <UButton
          v-else-if="isLoggedIn"
          icon="i-ph-envelope-simple"
          :loading="sending"
          data-verify-resend
          @click="resend()"
        >
          {{ t('auth.verification.resend') }}
        </UButton>
        <UButton v-else :to="localePath('/login')" icon="i-ph-sign-in">
          {{ t('auth.login.submit') }}
        </UButton>

        <UButton :to="localePath('/')" color="neutral" variant="subtle">{{ t('auth.verification.backHome') }}</UButton>
      </div>
    </template>
  </div>
</template>
