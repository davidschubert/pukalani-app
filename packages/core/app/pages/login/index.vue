<script setup lang="ts">
import { centralLoginUrl } from '../../../shared/centralLogin'

// Out-of-the-box Login-Page aus dem Core — Apps können sie überschreiben.
// Zweistufiger Passwort-Login (E-Mail → Passwort); der Code-Login-Link zu
// /login/code sitzt in Schritt 2 von AuthLoginForm (config-gated über pukalani.auth.otp).
definePageMeta({ layout: 'auth', middleware: 'guest' })

// Seitentitel „Anmelden · <Brand>" (Audit-Befund B3): /login ist die
// meistgebookmarkte Seite eines Mandanten — der Tab/Lesezeichen-Name muss den
// Community-Namen tragen, nicht leer bleiben.
const { t } = useI18n()
useBrandTitle(() => t('auth.login.title'))

// ZENTRALE ANMELDUNG (PK1 E2, Prototyp, Schalter `centralLogin`, Vorgabe
// aus): auf einer Community geht „Anmelden" in den Kundenbereich, mit diesem
// Host und dem Ziel nach der Anmeldung. Mit Schalter aus bleibt alles wie
// vorher.
const central = useCentralLogin()
if (central.enabled) {
  const { afterAuthTarget } = useAuthRedirect()
  const localePath = useLocalePath()
  await navigateTo(
    centralLoginUrl(central.accountUrl, localePath('/login/continue'), useRequestURL().hostname, afterAuthTarget()),
    { external: true },
  )
}
</script>

<template>
  <AuthLoginForm />
</template>
