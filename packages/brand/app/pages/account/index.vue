<script setup lang="ts">
/** `/account` → Profil: Bild, Name, Bio, @name (UserProfilePanel, core) — Inhalt der Kunden-Konto-Hülle (`../account.vue`). */
definePageMeta({ layout: 'default', middleware: 'auth' })

const { t } = useI18n()

useBrandTitle(() => t('brand.account.tabs.profile'))
</script>

<template>
  <UserProfilePanel />
</template>
