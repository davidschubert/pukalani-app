<script setup lang="ts">
// Dünne App: nur Komposition + Branding — Logik lebt in den Layern.

// SEO: hreflang-Alternates + og:locale + canonical (Core-Composable;
// absolute URLs via NUXT_PUBLIC_I18N_BASE_URL — Single-Host-App).
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
