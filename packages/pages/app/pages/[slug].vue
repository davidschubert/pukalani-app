<script setup lang="ts">
import { pageExcerpt } from '../../shared/pageExcerpt'
import { hasLocale, isFallbackLocale } from '../../shared/pageLocales'
import { PAGE_DRAFT_ROBOTS, pageHasDraftNotice } from '../../shared/pageDraftNotice'
import type { PublicPage } from '../../shared/types/page'

/**
 * Öffentliche Inhaltsseite unter sprechendem Pfad (/imprint, /terms …).
 * Dynamische Route mit NIEDRIGER Priorität — statische App-Routen (/login,
 * /dashboard …) gewinnen. Nur veröffentlichte Seiten; sonst 404.
 *
 * `key` = voller Pfad: bei einem Slug-Wechsel IM BROWSER (/imprint → /xyz)
 * baut Nuxt die Komponente neu auf, statt sie wiederzuverwenden. Ohne das
 * läuft das `setup` kein zweites Mal — der 404-Wurf unten bliebe aus und die
 * Seite zeigte den alten Inhalt bzw. eine leere Sektion.
 */
definePageMeta({ key: route => route.fullPath })

const route = useRoute()
const { locale, locales, t } = useI18n()
const slug = computed(() => String(route.params.slug ?? ''))

// useRequestFetch statt $fetch: der SSR-interne Aufruf MUSS den Host-Header
// (= Tenant) der eingehenden Anfrage weiterreichen, sonst löst die Tenant-
// Middleware im Pool keinen Mandanten auf und JEDE Inhaltsseite wäre 404 —
// genau so auf demo.pukalani.app gefunden (Morgenlicht-Seed, 2026-07-26).
// Im Silo-Betrieb verhält sich useRequestFetch wie $fetch.
const requestFetch = useRequestFetch()
const { data: page, error } = await useAsyncData(
  () => `page-${slug.value}-${locale.value}`,
  // encodeURIComponent: vue-router liefert den Param DEKODIERT — ein `%2F`
  // oder `..` in der Adresse stünde sonst roh im API-Pfad.
  () => requestFetch<PublicPage>(`/api/pages/public/${encodeURIComponent(slug.value)}`, { query: { locale: locale.value } }),
  { watch: [locale] },
)

if (error.value || !page.value) {
  // status/statusText ist der Projektvertrag (CLAUDE.md, Audit-Befund K8)
  throw createError({ status: 404, statusText: 'Page not found' })
}

/**
 * DIE SEITE GIBT ES NICHT IN DER SPRACHE DES LESERS (F60).
 *
 * Die Route fällt auf eine vorhandene Fassung zurück — richtig so, sonst wären
 * Impressum und Datenschutz weg, sobald der Owner nur eine Sprache pflegt
 * (Davids Entscheidung 2026-09-10). Bis heute geschah das STUMM. Drei Dinge
 * ändern sich, und alle drei sind dieselbe Aussage an drei Publikumsgruppen:
 *
 *  1. der LESER bekommt eine Zeile, die sagt, was er da liest;
 *  2. der VORLESER bekommt `lang` am Text — ohne das liest ein Screenreader
 *     deutschen Text mit englischer Aussprache vor (das Dokument sagt `en`);
 *  3. die SUCHMASCHINE bekommt nur noch die Alternate-Adressen, die es
 *     wirklich gibt — gemeldet über `useSeoHiddenLocales()` (core), den EINEN
 *     Vertrag dafür. Er ist am 2026-09-10 für BI1 I3 entstanden und wird hier
 *     BENUTZT statt nachgebaut: zwei Wege für dieselbe Sache kosten dauerhaft
 *     mehr als ein verworfener eigener.
 *
 * ZURÜCKSETZEN IST PFLICHT, und es geschieht IM KERN: der State ist app-weit.
 * Bliebe er stehen, verlöre die nächste Seite im selben Client-Lauf ihre
 * zweite Adresse, ohne dass es jemand sieht.
 */
const deliveredLocale = computed(() => page.value?.locale ?? '')
const isFallbackLanguage = computed(() => isFallbackLocale(locale.value, deliveredLocale.value))
const languageName = usePageLanguageName()

const appLocaleCodes = computed(() => locales.value.map(entry => (typeof entry === 'string' ? entry : entry.code)))

/**
 * Leere Liste heisst „diese Seite sagt nichts dazu" — nie „es gibt sie
 * nirgends". Sonst nähme eine fehlgeschlagene Abfrage der Seite alle
 * Alternate-Adressen.
 *
 * Das Zurücksetzen beim Verlassen macht `useSeoHiddenLocales()` selbst — der
 * State ist app-weit, und ein blindes Leeren beim Abräumen löschte den Eintrag
 * der NEUEN Seite (am 2026-09-10 genau hier im Klick-Beweis gefunden, Begründung
 * im Kopf des Composables). Deshalb steht der Wächter dort und nicht hier.
 */
useSeoHiddenLocales(() => {
  const available = page.value?.availableLocales ?? []
  return available.length
    ? appLocaleCodes.value.filter(code => !hasLocale(available, code))
    : []
})

// „<Seitenname> · <Brand>" + Beschreibung aus dem ersten Textabsatz der Seite
// (Audit-Befunde S8/S5) — geteilte Links waren vorher markenlos und nackt.
useBrandTitle(() => page.value?.title ?? '', {
  description: () => pageExcerpt(page.value?.body ?? ''),
})

/**
 * DER DRITTE ZUSTAND: veröffentlicht, aber noch ein ENTWURF (BS1 R1).
 * Begründung, warum das eine App-Ansage ist und keine Spalte, steht im Kopf
 * von `shared/pageDraftNotice.ts`. Leere Liste (Layer-Default) ⇒ diese Seite
 * verhält sich exakt wie bisher: kein Kasten, kein robots-Tag.
 */
const appConfig = useAppConfig() as { pukalani?: { pages?: { draftNotice?: unknown } } }
const isDraftNotice = computed(() => pageHasDraftNotice(appConfig.pukalani?.pages?.draftNotice, slug.value))
useSeoMeta({ robots: () => (isDraftNotice.value ? PAGE_DRAFT_ROBOTS : undefined) })
</script>

<template>
  <UContainer class="py-8 sm:py-12">
    <article v-if="page" class="mx-auto max-w-3xl space-y-3">
      <h1 class="text-2xl font-bold" :lang="page.locale">{{ page.title }}</h1>
      <!-- Der Hinweis ist der ERSTE Block, nicht das Kleingedruckte. -->
      <UAlert
        v-if="isDraftNotice"
        color="warning"
        variant="subtle"
        icon="i-ph-warning-bold"
        :title="t('pages.draftNotice.title')"
        :description="t('pages.draftNotice.body')"
        data-page-draft-notice
      />
      <!-- Steht in der Sprache des LESERS und darf deshalb kein `lang` erben. -->
      <UAlert
        v-if="isFallbackLanguage"
        color="neutral"
        variant="subtle"
        icon="i-ph-translate"
        :description="t('pages.public.otherLanguage', {
          requested: languageName(locale),
          delivered: languageName(deliveredLocale),
        })"
        data-page-language-notice
      />
      <div :lang="page.locale">
        <MarkdownContent :source="page.body" />
      </div>
    </article>
  </UContainer>
</template>
