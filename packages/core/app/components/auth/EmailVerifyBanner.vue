<script setup lang="ts">
const { t } = useI18n()
const appConfig = useAppConfig()
const { user, isLoggedIn } = useCurrentUser()
// Der Vorgang selbst liegt in useEmailVerifyResend() — dieselbe Anforderung
// bedient auch die Seite /verify (M3). Hier bleibt nur die Erscheinung.
const { sending, resend } = useEmailVerifyResend()

// BEWUSST kein Close/X und keine UBanner-id: solange die Adresse
// unverifiziert ist, soll der Banner bei jedem Besuch wiederkommen (ein
// localStorage-Dismiss würde die Verifizierung dauerhaft unsichtbar machen).
// Nur nach erfolgreichem Resend verschwindet er für die laufende Sitzung.
const dismissed = ref(false)

const visible = computed(() =>
  appConfig.pukalani?.auth?.verification === true
  && isLoggedIn.value
  && user.value?.emailVerification === false
  && !dismissed.value,
)

const actions = computed(() => [{
  label: t('auth.verification.resend'),
  loading: sending.value,
  onClick: () => { void onResend() },
}])

async function onResend() {
  if (await resend()) dismissed.value = true
}
</script>

<template>
  <UBanner
    v-if="visible"
    icon="i-ph-envelope-simple"
    color="neutral"
    :title="t('auth.verification.bannerMessage')"
    :actions="actions"
    data-testid="email-verify-banner"
  />
</template>
