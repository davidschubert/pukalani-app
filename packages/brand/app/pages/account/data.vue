<script setup lang="ts">
/** `/account/data` → Datenexport (DSGVO) und Konto löschen — Inhalt der Kunden-Konto-Hülle (`../account.vue`). */
definePageMeta({ layout: 'default', middleware: 'auth' })

const { t } = useI18n()

useBrandTitle(() => t('brand.account.tabs.data'))
</script>

<template>
  <AuthAccountDataPanel />
</template>
