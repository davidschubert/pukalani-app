<script setup lang="ts">
/**
 * `/settings` → Sicherheit: Passwort UND Zwei-Faktor (S3, 2026-09-08).
 *
 * Der Index-Reiter der Konto-Hülle, wie „Allgemein" im Dashboard. Export und
 * Löschung des Kontos liegen nebenan unter „Daten" (Audit-Befund M10).
 *
 * Die Zwei-Faktor-Karte fehlte hier bis S3: sie hing nur im Dashboard-Reiter
 * (`/dashboard/settings/security`, admin-Layer), den es auf dem Kontroll-Host
 * `account.pukalani.app` nicht gibt — David konnte den Zweitfaktor für sein
 * Pool-Konto deshalb nirgends einrichten (Screenshot 2026-09-08). Die Karte
 * ist dieselbe Core-Komponente, die Routen liegen unter `/api/auth/mfa/*`
 * und sind auf Kontroll-Hosts über das Präfix `/api/auth/` erreichbar.
 */
definePageMeta({ layout: 'onboarding', middleware: 'auth' })

const { t } = useI18n()

useBrandTitle(() => t('onboarding.account.settings.tabs.security'))
</script>

<template>
  <div class="space-y-6">
    <AuthPasswordChangeForm />
    <AuthTwoFactorCard />
  </div>
</template>
