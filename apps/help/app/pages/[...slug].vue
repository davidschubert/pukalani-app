<script setup lang="ts">
import { findPageHeadline } from '@nuxt/content/utils'
import type { DocsNavigation } from '../../shared/types/docs'

definePageMeta({ layout: 'docs' })

const { t, locale } = useI18n()
const route = useRoute()

const fallback = ref<DocsNavigation | null>(null)
const navigation = inject(docsNavigationKey, fallback)

// Abschnitt + Sprache bestimmen die Sammlung. Alle vier sind mit ihrem
// Pfad-Prefix indiziert (`/anleitung`, `/en/anleitung`, …), Route und
// Content-Pfad sind deshalb identisch — die Abfrage bleibt eine Zeile.
const section = computed(() => resolveDocsSection(route.path))
const collection = computed(() => docsCollection(section.value, locale.value))

const { data: page, error: pageError } = await useAsyncData(route.path, () =>
  queryCollection(collection.value).path(route.path).first())
if (!page.value) {
  // AUSFALL ≠ „GIBT ES NICHT" (LZ1): `.first()` liefert für eine unbekannte
  // Seite `null` OHNE Fehler. Ein gesetzter Fehler heißt: die Abfrage selbst ist
  // gescheitert (Datenbank, Netz) — das ist ein 503, kein falsches 404.
  if (pageError.value && isFetchOutage(pageError.value)) {
    throw createError({ status: 503, statusText: 'Service Unavailable', fatal: true })
  }
  throw createError({ status: 404, statusText: 'Page not found', fatal: true })
}

const { data: surround, error: surroundError, refresh: refreshSurround } = await useAsyncData(`${route.path}-surround`, () =>
  queryCollectionItemSurroundings(collection.value, route.path, { fields: ['description'] }))

// Titel + Social-Tags im Hausmuster „<Seite> · <Brand>" (useBrandTitle, Core —
// Audit-Befund S8/S5). Getter statt fixer Werte, damit ein Seitenwechsel
// innerhalb der Route ([...slug]) den Kopf mitzieht.
// `brand` aus i18n statt aus `useBrandName()`: die Marke dieser Site ist ein
// übersetzter Ausdruck, kein Eigenname (Begründung in app/pages/index.vue).
useBrandTitle(() => page.value?.seo?.title || page.value?.title || '', {
  brand: () => t('docs.siteName'),
  description: () => page.value?.seo?.description || page.value?.description,
})

const headline = computed(() => findPageHeadline(
  docsSectionItems(navigation.value, section.value, locale.value),
  page.value?.path,
))
</script>

<template>
  <UPage v-if="page">
    <UPageHeader
      :title="page.title"
      :description="page.description"
      :headline="headline"
    >
      <template #links>
        <UButton
          v-for="(link, index) in page.links"
          :key="index"
          v-bind="link"
        />
      </template>
    </UPageHeader>

    <UPageBody>
      <ContentRenderer :value="page" />

      <USeparator v-if="surround?.length" />

      <!-- Die Nachbar-Artikel sind eine Zusatz-Auskunft: ein Ausfall sagt es
           in einer Zeile, der Artikel selbst bleibt lesbar. -->
      <CoreInlineLoadError v-if="isFetchOutage(surroundError)" :retry="refreshSurround" data-docs-surround-error />
      <UContentSurround v-else :surround="surround" />
    </UPageBody>

    <template
      v-if="page?.body?.toc?.links?.length"
      #right
    >
      <UContentToc
        :title="t('docs.toc')"
        :links="page.body?.toc?.links"
      />
    </template>
  </UPage>
</template>
