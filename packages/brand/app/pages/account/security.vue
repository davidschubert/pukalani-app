<script setup lang="ts">
/** `/account/security` → Sicherheit: Passwort und Zwei-Faktor — Inhalt der Kunden-Konto-Hülle (`../account.vue`). */
definePageMeta({ layout: 'default', middleware: 'auth' })

const { t } = useI18n()

useBrandTitle(() => t('brand.account.tabs.security'))
</script>

<template>
  <div class="space-y-6">
    <AuthPasswordChangeForm />
    <AuthTwoFactorCard />
  </div>
</template>
