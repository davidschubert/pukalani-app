<script setup lang="ts">
// Dünne App: Komposition + globales SEO-Head (Core-Composable; absolute URLs
// via NUXT_PUBLIC_I18N_BASE_URL — Single-Host-App). Inhalt lebt in den Sektionen.
useLocaleSeoHead()

// Nuxt UI spricht die Sprache der Seite (Texte, Datum, Kalender) — core.
const uiLocale = useNuxtUiLocale()
</script>

<template>
  <UApp :locale="uiLocale">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
