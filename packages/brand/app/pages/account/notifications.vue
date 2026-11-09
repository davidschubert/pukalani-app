<script setup lang="ts">
/** `/account/notifications` → E-Mail-Einstellungen der Benachrichtigungen — Inhalt der Kunden-Konto-Hülle (`../account.vue`). */
definePageMeta({ layout: 'default', middleware: 'auth' })

const { t } = useI18n()

useBrandTitle(() => t('brand.account.tabs.notifications'))
</script>

<template>
  <UserNotificationsPanel />
</template>
