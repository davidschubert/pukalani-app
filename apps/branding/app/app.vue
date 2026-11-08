<script setup lang="ts">
// Dünne App: nur Komposition + Branding — Logik lebt in den Layern.

/**
 * SEO: hreflang-Alternates + og:locale + canonical. `useLocaleSeoHead()` ist
 * der EINZIGE Aufruf dieser Art in der ganzen App (Repo-Regel) — absolute URLs
 * kommen aus `NUXT_PUBLIC_I18N_BASE_URL`, denn branding.supply ist eine
 * Single-Host-App (kein `pukalani.seo.originFromRequest` wie bei den
 * Mehr-Host-Apps).
 */
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
