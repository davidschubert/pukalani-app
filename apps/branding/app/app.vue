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

/**
 * VORSCHAUBILD UND NAME DER SITE FÜR GETEILTE LINKS (SEO-005, 2026-11-20).
 * Bis dahin trugen nur die Marken-Profile der Galerie ein Bild — Startseite,
 * Produkte, Insights-Liste, About und Team keines, und nirgends stand
 * `og:site_name`. Das Bild ist eine committete Datei (Zeichen und Schriftzug
 * der Site, erzeugt von `scripts/og-site-cards.mjs`); der Kern macht aus dem
 * Pfad die absolute Adresse und ergänzt Maße, Typ und `twitter:card`.
 *
 * Seiten mit eigenem Bild (Marken-Profil, Insights-Artikel) überschreiben den
 * Eintrag in ihrem eigenen Setup — beim Server-Rendern läuft das NACH dieser
 * Zeile, und nur das Server-HTML liest ein Vorschau-Dienst. Dass diese Seiten
 * den Eintrag beim Verlassen leeren, betrifft nur den Kopf im Browser.
 */
useBrandOgImage().value = {
  path: '/og/branding-supply.png',
  width: 1200,
  height: 630,
  type: 'image/png',
}
const siteName = useBrandName()
useSeoMeta({
  ogSiteName: () => siteName.value,
})

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
