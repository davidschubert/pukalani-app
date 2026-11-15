<script setup lang="ts">
// Dünne App: nur Komposition + Branding — Logik lebt in den Layern.

// SEO: hreflang-Alternates + og:locale + canonical (Core-Composable;
// absolute URLs via NUXT_PUBLIC_I18N_BASE_URL — Single-Host-App).
useLocaleSeoHead()

/**
 * Seiten-Fade NUR auf der öffentlichen Site (Layout `site`, CSS in photos.css
 * auf `.photos-site` gescopet). Im Dashboard ist er AUS: eine
 * `out-in`-Transition über dem mehrwurzeligen `UDashboardPanel` lässt die neue
 * Seite im versteckten Container hängen (Begründung im nuxt.config.ts).
 */
const route = useRoute()
const pageTransition = computed(() => route.meta.layout === 'site'
  ? { name: 'page', mode: 'out-in' as const }
  : false)

// Nuxt UI spricht die Sprache der Seite (Texte, Datum, Kalender) — core.
const uiLocale = useNuxtUiLocale()
</script>

<template>
  <UApp :locale="uiLocale">
    <NuxtLayout>
      <NuxtPage :transition="pageTransition" />
    </NuxtLayout>
  </UApp>
</template>
