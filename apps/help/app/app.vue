<script setup lang="ts">
import type { DocsNavigation } from '../shared/types/docs'

// Dünne App: Kopf/Fuß + die Content-Sammlungen. Inhalt lebt in content/.
const { t, locale } = useI18n()

// Navigation und Suche gehören der SPRACHE der aktuellen Seite. Der Schlüssel
// des useAsyncData trägt sie deshalb mit: ohne ihn behielte ein Sprachwechsel
// die zwischengespeicherte Navigation der alten Sprache, und der Leser
// bekäme englische Artikel in einer deutschen Seitenleiste.
const { data: navigation } = await useAsyncData(() => `docs-navigation-${locale.value}`, async () => {
  const [anleitung, entwickler] = await Promise.all([
    queryCollectionNavigation(docsCollection('anleitung', locale.value)),
    queryCollectionNavigation(docsCollection('entwickler', locale.value)),
  ])
  return { anleitung, entwickler } satisfies DocsNavigation
}, { watch: [locale] })

// Volltextsuche über beide Abschnitte der aktuellen Sprache (client-only, wie
// im Nuxt-UI-Vorbild). Bewusst NICHT über beide Sprachen: ein Treffer, den man
// nicht lesen kann, ist kein Treffer.
const { data: searchFiles } = useLazyAsyncData(() => `docs-search-${locale.value}`, async () => {
  const [anleitung, entwickler] = await Promise.all([
    queryCollectionSearchSections(docsCollection('anleitung', locale.value)),
    queryCollectionSearchSections(docsCollection('entwickler', locale.value)),
  ])
  return [...anleitung, ...entwickler]
}, { server: false, watch: [locale] })

const searchNavigation = computed(() => [
  ...(navigation.value?.anleitung ?? []),
  ...(navigation.value?.entwickler ?? []),
])

provide(docsNavigationKey, navigation)

// SEO-Kopf: EIN Core-Aufruf (lang/dir, canonical, og:url/og:locale) statt der
// handgebauten useLocaleHead/useHead-Kopie — Audit-Befund B1. Single-Host-App,
// also bleibt das Gate `pukalani.seo.originFromRequest` aus und die absolute Basis
// kommt aus NUXT_PUBLIC_I18N_BASE_URL. Seit der Umstellung auf
// 'prefix_except_default' (nuxt.config.ts) liefert der Aufruf hier auch
// hreflang-Alternates — vorher konnte er das nicht, weil beide Sprachen
// dieselbe URL trugen.
useLocaleSeoHead()

// KEIN eigenes titleTemplate mehr: den Titel setzen die Seiten selbst über
// useBrandTitle() im Hausmuster „<Seite> · <Brand>" (Audit-Befund S8).
// og:site_name folgt derselben Regel wie der Titel: die Marke dieser Site ist
// ein übersetzter Ausdruck (Begründung in app/pages/index.vue).
useSeoMeta({
  ogSiteName: () => t('docs.siteName'),
})

// DIE CHROME IST DIE DER MARKE (Davids Entscheidung 2026-08-18): Kopf und Fuß
// kommen aus packages/marketing, die Hilfe-eigene Navigation sitzt als
// Subnav darunter (DocsSubnav). `body.marketing-site` ist dabei Pflicht,
// keine Zierde: marketing.css ist auf diese Klasse gescopet, und
// puka-theme.css setzt erst unter ihr `--ui-primary` auf die Sonne sowie die
// --puka-*-Tokens, aus denen Kopf- und Fußzeile ihre Flächen bauen — ohne die
// Klasse stünde der Kopf durchsichtig auf falschen Farben (dieselbe Zeile
// setzt auf pukalani.app das Layout site.vue).
useHead({
  bodyAttrs: { class: 'marketing-site' },
})

// Nuxt UI spricht die Sprache der Seite (Texte, Datum, Kalender) — core.
const uiLocale = useNuxtUiLocale()
</script>

<template>
  <UApp :locale="uiLocale">
    <NuxtLoadingIndicator />

    <MarketingHeader />
    <DocsSubnav />

    <UMain>
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </UMain>

    <MarketingFooter />

    <ClientOnly>
      <LazyUContentSearch
        :files="searchFiles"
        :navigation="searchNavigation"
        :placeholder="t('docs.search.placeholder')"
      />
    </ClientOnly>
  </UApp>
</template>
