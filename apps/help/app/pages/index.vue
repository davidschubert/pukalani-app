<script setup lang="ts">
// Startseite = content/index.md (Sammlung `landing`). Kein Layout: Kopf und
// Fuß kommen aus app.vue, die Seitenleiste gehört nur den Inhaltsseiten.
definePageMeta({ layout: false })

// Die Startseite gibt es je Sprache einmal: `/` (de) und `/en` (en). Abgefragt
// wird über den ROUTENPFAD, nicht über ein festes '/', denn die englische
// Sammlung trägt das Prefix `/en` — mit '/' fände sie nichts und die Seite
// antwortete 404.
const localePath = useLocalePath()
const { locale } = useI18n()

const { data: page, error } = await useAsyncData(() => `docs-landing-${locale.value}`, () =>
  queryCollection(docsLandingCollection(locale.value)).path(localePath('/')).first(), { watch: [locale] })
if (!page.value) {
  // Ausfall der Abfrage ⇒ 503, nicht das falsche 404 (LZ1; `.first()` ohne
  // Treffer liefert `null` ohne Fehler).
  if (isFetchOutage(error.value)) {
    throw createError({ status: 503, statusText: 'Service Unavailable', fatal: true })
  }
  throw createError({ status: 404, statusText: 'Page not found', fatal: true })
}

// Die Marke dieser Site ist ein ÜBERSETZTER Ausdruck („Pukalani Hilfe" /
// „Pukalani Help"), kein Eigenname — deshalb kommt sie aus i18n und nicht aus
// `useBrandName()`. Ohne diese Übergabe stünde auf jeder englischen Seite ein
// deutscher Markenname im Titel.
const { t } = useI18n()
const brand = computed(() => t('docs.siteName'))

// Titel im Hausmuster „<Seite> · <Brand>" (useBrandTitle, Core). Die Startseite
// trägt den Site-Namen in ihrem Frontmatter schon selbst — dann bleibt der
// Seitenname leer, sonst stünde „Pukalani Hilfe · Pukalani Hilfe" im Tab.
const pageName = computed(() => {
  const title = page.value?.seo?.title || page.value?.title || ''
  return title === brand.value ? '' : title
})

useBrandTitle(pageName, {
  brand,
  description: () => page.value?.seo?.description || page.value?.description,
})
</script>

<template>
  <ContentRenderer
    v-if="page"
    :value="page"
    :prose="false"
  />
</template>
