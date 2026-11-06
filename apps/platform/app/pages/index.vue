<script setup lang="ts">
import { pageExcerpt } from '../../../../packages/pages/shared/pageExcerpt'
import type { PublicPage } from '../../../../packages/pages/shared/types/page'

/**
 * Tenant-Homepage (H3, „pro Tenant konfigurierbar"): rendert die im Dashboard
 * gepflegte `home`-Seite des Request-Tenants (pages-Layer, tenant-gescopt).
 * Fällt auf eine schlichte Willkommens-Seite zurück, solange kein home-Eintrag
 * existiert. MVP: CMS-Markdown (sicheres Subset via MarkdownContent, kein
 * v-html) + optional EIN Kommentar-Block: die Zeile `[[comments]]` im Body
 * wird zur CommentSection (targetType 'page', targetId 'home').
 */
const { t, locale } = useI18n()

/**
 * ZWEI SEITEN UNTER EINER ADRESSE (AH-2, 2026-08-11).
 *
 * Auf einem KONTROLL-Host (account.pukalani.app) ist `/` die
 * Account-Startseite; die Fläche selbst gehört dem onboarding-Layer
 * (`AccountHome`), diese Datei ist nur die Weiche. Sie muss es sein, weil eine
 * Route genau EINER Datei gehören kann und `/` hier schon von der
 * Tenant-Startseite belegt ist — eine `pages/index.vue` im Layer würde von
 * dieser App-Seite verdeckt.
 *
 * Der Host steht bei SSR und im Browser gleich fest, es gibt also keinen
 * Zweig-Wechsel bei der Hydration. Anmeldepflicht und Layout entscheidet die
 * globale Middleware des onboarding-Layers (control-center.global.ts) — dort,
 * wo sie noch vor dem Rendern greifen.
 */
const isControlCenter = useIsControlCenter()

// useRequestFetch: der SSR-interne Aufruf MUSS den Host-Header (= Tenant)
// der eingehenden Anfrage weiterreichen, sonst löst die Tenant-Middleware
// den falschen/keinen Mandanten auf und die home-Seite bliebe leer.
const requestFetch = useRequestFetch()
const { data: page } = await useAsyncData(
  () => `home-${locale.value}`,
  // Auf dem Kundenbereich gibt es keinen Mandanten und deshalb auch keine
  // `home`-Seite: `/api/pages/public/home` steht dort nicht in
  // `controlApiPrefixes` und antwortet 404. Der Abruf unterbleibt ganz, statt
  // sich auf den `.catch()` zu verlassen — ein Request, dessen einzige
  // mögliche Antwort ein Fehler ist, gehört nicht abgeschickt.
  () => (isControlCenter
    ? Promise.resolve(null)
    : requestFetch<PublicPage>('/api/pages/public/home', { query: { locale: locale.value } }).catch(() => null)),
  { watch: [locale] },
)

// `[[comments]]` (eigene Zeile) trennt den Markdown-Body vom Kommentar-Block.
const COMMENT_MARKER = /^\s*\[\[comments\]\]\s*$/m
const parts = computed(() => {
  const body = page.value?.body ?? ''
  const idx = body.search(COMMENT_MARKER)
  if (idx === -1) return { markdown: body, showComments: false }
  return { markdown: body.slice(0, idx), showComments: true }
})

/**
 * „<Seitenname> · <Brand>", ohne home-Eintrag der Brand allein (Audit S8).
 *
 * DIE BESCHREIBUNG HAT SEIT U15 TEIL 2 ZWEI QUELLEN, und die Reihenfolge ist
 * die ganze Änderung: zuerst die EIGENE Beschreibung, die der Owner unter
 * /dashboard/community/seo geschrieben hat, sonst wie bisher der erste
 * Textabsatz der home-Seite (S5). Gerechnet wird das nicht hier, sondern in
 * `resolveCommunitySeo` — dieselbe Funktion, die der Editor für seine Vorschau
 * benutzt und `useLocaleSeoHead` für das robots-Signal. Eine zweite Rechnung
 * daneben wäre der Anfang zweier verschiedener Antworten auf dieselbe Frage.
 * Seit 2026-09-09 steht dieses Zusammenstecken deshalb in
 * `useCommunitySeoDescription()` (core) statt hier: branding und portfolio
 * brauchen auf ihren eigenen Startseiten dieselbe Antwort (Davids Entscheidung
 * — die Owner-Beschreibung gilt auf JEDER Site).
 *
 * Vor U15 stand hier als Fallback die Betreiber-Tagline im Tab JEDES Mandanten
 * (K11); ohne home-Eintrag UND ohne eigene Beschreibung bleibt die description
 * weiterhin ganz WEG — der Platzhaltertext der Willkommens-Sektion ist keine
 * Beschreibung dieses Mandanten (K11), und `resolveCommunitySeo` antwortet in
 * genau diesem Fall mit '' (`useBrandTitle` lässt das Tag dann weg).
 *
 * Der zweite Wert der SEO-Seite, `noindex`, landet BEWUSST nicht hier: er gilt
 * für die ganze Community, nicht für diese Seite, und gehört deshalb in den
 * EINEN Kopf-Aufruf (`useLocaleSeoHead`).
 *
 * Den Kopf setzt auf dem Kundenbereich `AccountHome` selbst — hier bliebe
 * ohnehin nur der Brand allein stehen und würde den dortigen Titel
 * überschreiben, weil das Setup der Seite VOR dem der Komponente läuft.
 */
const seoDescription = useCommunitySeoDescription(
  () => (page.value ? pageExcerpt(parts.value.markdown) : ''),
)
if (!isControlCenter) {
  useBrandTitle(() => page.value?.title ?? '', {
    // `|| undefined`: '' heisst „kein Tag", und genau das erwartet useBrandTitle.
    description: () => seoDescription.value || undefined,
  })
}
</script>

<template>
  <AccountHome v-if="isControlCenter" />

  <UContainer v-else class="py-8 sm:py-12">
    <article v-if="page" class="mx-auto max-w-3xl space-y-4">
      <h1 class="text-2xl font-bold tracking-tight">{{ page.title }}</h1>
      <MarkdownContent :source="parts.markdown" />
      <CommentSection
        v-if="parts.showComments"
        target-id="home"
        target-type="page"
        class="mt-8"
      />
    </article>

    <section v-else class="mx-auto max-w-2xl py-16 text-center">
      <h1 class="text-3xl font-bold tracking-tight">{{ t('app.tagline') }}</h1>
      <p class="mt-4 text-muted">{{ t('home.subtitle') }}</p>
    </section>
  </UContainer>
</template>
