<script setup lang="ts">
// Dünne App: nur Komposition + Branding — Logik lebt in den Layern.

/**
 * Die Ansage an Suchmaschinen — EINMAL für die ganze Site und BEWUSST OHNE
 * `index,follow`.
 *
 * Vorher stand diese Zeile in fünf Seiten, jede mit `index,follow` davor. Das
 * ist erstens überflüssig (indexieren und Links folgen ist die Voreinstellung
 * jedes Crawlers) und zweitens gefährlich: ein gezieltes `noindex` — heute
 * für eine Rechtsseite aus dem pages-Layer denkbar, morgen für eine
 * Kampagnen-Landingpage — stünde dann neben einem `index` derselben Site, und
 * welche Angabe ein Crawler nimmt, wäre nicht mehr unsere Entscheidung. Exakt
 * diese Begründung steht im Kern (`useLocaleSeoHead`, `robotsMeta`), der
 * deshalb nur im Ausnahmefall (geschlossene Community) überhaupt etwas stempelt.
 *
 * Was bleibt, sind die drei DARSTELLUNGS-Direktiven: volle Snippet-Länge,
 * grosse Bildvorschau, keine Video-Begrenzung. Sie erlauben nichts zu
 * indexieren, sie beschreiben nur, wie ein Treffer aussehen darf — ohne sie
 * kürzt Google in der EU auf wenige Zeichen ohne Bild.
 *
 * VOR `useLocaleSeoHead()`: stempelt der Kern (oder später eine Seite) ein
 * `noindex`, gewinnt bei unhead der SPÄTER angemeldete Eintrag desselben
 * `name`. Diese Reihenfolge sorgt dafür, dass ein Ausschluss immer sticht.
 */
useHead({
  meta: [
    { name: 'robots', content: 'max-snippet:-1,max-image-preview:large,max-video-preview:-1' },
  ],
})

// SEO: hreflang-Alternates + og:locale + canonical (Core-Composable;
// absolute URLs via NUXT_PUBLIC_I18N_BASE_URL — Single-Host-App).
useLocaleSeoHead()

/**
 * Vorschaubild für geteilte Links. Es wird BEWUSST nicht in den Seiten per
 * `useHead` gesetzt: `useLocaleSeoHead()` ist der einzige Ort, an dem
 * canonical/og:url entstehen, und genau dort gehört og:image dazu — sonst
 * laufen die absoluten URLs wieder auseinander (Audit-Befund B1). Der Kern
 * macht aus dem Pfad die absolute URL auf dem richtigen Host und ergänzt
 * Maße, Typ und `twitter:card`. PNG, nicht SVG: Facebook, WhatsApp und
 * LinkedIn zeigen SVG als Vorschaubild nicht an.
 */
useBrandOgImage().value = {
  path: '/images/og-pukalani-studio.png',
  width: 1200,
  height: 630,
  type: 'image/png',
}

/**
 * Seiten-Fade NUR auf der öffentlichen Site (Layout `site`, CSS in
 * portfolio.css auf `.portfolio-site` gescopet). Im Dashboard ist er AUS —
 * nicht aus Geschmack: eine `out-in`-Transition über einem mehrwurzeligen
 * `UDashboardPanel` lässt Vue Suspense die neue Seite im versteckten Container
 * hängen, der Seitenbereich bleibt nach dem ersten Klick leer (Begründung und
 * Bisektion im nuxt.config.ts, 2026-09-08).
 */
const route = useRoute()
const pageTransition = computed(() => route.meta.layout === 'site'
  ? { name: 'page', mode: 'out-in' as const }
  : false)
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage :transition="pageTransition" />
    </NuxtLayout>
  </UApp>
</template>
