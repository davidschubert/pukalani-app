<script setup lang="ts">
// Settings → Navigation: die persönliche Reihenfolge der Dashboard-Nav
// (NAV1 Paket 3). Die Fläche selbst ist eine Komponente, damit die Hülle hier
// dünn bleibt wie bei den vier Geschwistern.
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t } = useI18n()

useBrandTitle(() => t('dashboard.settings.navigation'))
</script>

<template>
  <DashboardNavPrefsEditor />
</template>
