<script setup lang="ts">
// Dünne App: nur Komposition + Branding — Logik lebt in den Layern.

// SEO-Kopf (hreflang-Alternates, canonical, og:url/og:locale, lang/dir) aus
// dem Core. Hier gilt zusätzlich pukalani.seo.originFromRequest: JEDER Mandanten-
// Host kanonisiert auf sich selbst (Audit-Befund B1).
useLocaleSeoHead()

// NAME DER SITE IN GETEILTEN KARTEN (SU1): der Name der Community (bzw. der
// Marke auf dem Kundenbereich), dieselbe Quelle wie der Titel. `og:type`
// bleibt `website` — Beiträge beschreiben sich über ihre strukturierten
// Daten (`useCommunityStructuredData`).
const siteName = useBrandName()
useSeoMeta({
  ogSiteName: () => siteName.value,
  ogType: 'website',
})

// Nuxt UI spricht die Sprache der Seite (Texte, Datum, Kalender) — core.
const uiLocale = useNuxtUiLocale()
</script>

<template>
  <UApp :locale="uiLocale">
    <!-- Demo-Banner lebt im default-LAYOUT (P3) — Auth-Seiten bleiben frei. -->
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
