<script setup lang="ts">
import type { DocsNavigation } from '../shared/types/docs'

// Dünne App: Kopf/Fuß + die Content-Sammlungen. Inhalt lebt in content/.
const { t, locale } = useI18n()

// Navigation und Suche gehören der SPRACHE der aktuellen Seite. Der Schlüssel
// des useAsyncData trägt sie deshalb mit: ohne ihn behielte ein Sprachwechsel
// die zwischengespeicherte Navigation der alten Sprache, und der Leser
// bekäme englische Artikel in einer deutschen Seitenleiste.
const { data: navigation, error: navigationError, refresh: refreshNavigation } = await useAsyncData(() => `docs-navigation-${locale.value}`, async () => {
  const [anleitung, entwickler] = await Promise.all([
    queryCollectionNavigation(docsCollection('anleitung', locale.value)),
    queryCollectionNavigation(docsCollection('entwickler', locale.value)),
  ])
  return { anleitung, entwickler } satisfies DocsNavigation
}, { watch: [locale] })

// Volltextsuche über beide Abschnitte der aktuellen Sprache (client-only, wie
// im Nuxt-UI-Vorbild). Bewusst NICHT über beide Sprachen: ein Treffer, den man
// nicht lesen kann, ist kein Treffer.
//
// ERST BEI BEDARF (PERF-007, 2026-11-20): die Such-Abschnitte holt Nuxt Content
// im Browser aus einer Datenbank-Laufzeit (WebAssembly, rund 850 KB) samt
// Inhalts-Abzug. Bis dahin lud das jede Seite beim ersten Aufruf — rund ein
// Megabyte für eine Suche, die die meisten nie öffnen. Jetzt fragt die Seite
// erst, wenn jemand die Suche öffnet (Knopf oder Tastenkürzel; beide setzen
// `open` aus `useContentSearch`). Bis die Antwort da ist, zeigt die Suche die
// Navigation und ihren Lade-Zustand. Einmal geöffnet, bleibt sie geladen und
// folgt dem Sprachwechsel wie vorher.
const { open: searchOpen } = useContentSearch()
const searchWanted = ref(false)
watch(searchOpen, (isOpen) => {
  if (isOpen) searchWanted.value = true
}, { immediate: true })

const { data: searchFiles, status: searchStatus, error: searchError, refresh: refreshSearch } = useLazyAsyncData(
  () => `docs-search-${locale.value}-${searchWanted.value ? 'wanted' : 'idle'}`,
  async () => {
    if (!searchWanted.value) return []
    const [anleitung, entwickler] = await Promise.all([
      queryCollectionSearchSections(docsCollection('anleitung', locale.value)),
      queryCollectionSearchSections(docsCollection('entwickler', locale.value)),
    ])
    return [...anleitung, ...entwickler]
  },
  { server: false, watch: [locale, searchWanted] },
)

// AUSFALL SICHTBAR (LZ1): die Inhalte kommen aus der Content-Datenbank (im
// Browser per Abruf). Scheitert die Navigation, stünde die Seitenleiste leer
// und läse sich wie „es gibt keine Artikel" — stattdessen eine ruhige Zeile mit
// „Noch einmal versuchen" über dem Inhalt. Nuxt Content wirft für „nichts
// gefunden" nicht, jeder Fehler hier ist also ein Ausfall.
const navigationFailed = computed(() => isFetchOutage(navigationError.value))

// Die Suche hat keinen eigenen Fehler-Platz (UContentSearch zeigt nur Treffer):
// ein Ausfall beim Laden der Such-Abschnitte meldet sich als Hinweis, sonst
// bliebe die Suche still leer. Nur im Browser (der Abruf läuft `server: false`).
const toast = useToast()
watch(searchError, (error) => {
  if (!error) return
  toast.add({
    color: 'warning',
    title: t('docs.search.loadFailed'),
    actions: [{ label: t('ui.listState.retry'), color: 'neutral', variant: 'outline', onClick: () => refreshSearch() }],
  })
})

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

// VORSCHAUBILD FÜR GETEILTE LINKS (SEO-005, 2026-11-20): bis dahin hatte keine
// Seite der Hilfe eines. Je Sprache eine committete Datei im Look der Marke
// (erzeugt von `scripts/og-site-cards.mjs`); der Kern macht aus dem Pfad die
// absolute Adresse und ergänzt Maße, Typ und `twitter:card`. Der Eintrag folgt
// der Sprache der Seite.
const ogImage = useBrandOgImage()
watch(locale, (code) => {
  ogImage.value = {
    path: `/og/help-${code === 'de' ? 'de' : 'en'}.jpg`,
    width: 1200,
    height: 630,
    type: 'image/jpeg',
  }
}, { immediate: true })

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
      <UContainer v-if="navigationFailed" class="pt-4">
        <CoreInlineLoadError :retry="refreshNavigation" data-docs-navigation-error />
      </UContainer>
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
        :loading="searchWanted && searchStatus === 'pending'"
      />
    </ClientOnly>
  </UApp>
</template>
