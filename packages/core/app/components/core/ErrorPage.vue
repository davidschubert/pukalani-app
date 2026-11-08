<script setup lang="ts">
import type { NuxtError } from '#app'
import { isUnknownHostError } from '../../../shared/unknownHost'

/**
 * Core-Fehlerseite. Nuxt löst error.vue NICHT aus Layern auf — jede App
 * legt daher eine dünne app/error.vue an, die diese Komponente rendert:
 *
 *   <template><CoreErrorPage :error="error" /></template>
 */
const props = defineProps<{ error: NuxtError }>()

const { t } = useI18n()
const localePath = useLocalePath()
// EINE Brand-Kette für alle (useBrandName: Tenant vor App-Brand vor
// „Pukalani"-Fallback) — vorher stand hier hart „PUKA-ERROR" (Audit B2/K3).
const brand = useBrandName()
const appConfig = useAppConfig() as { pukalani?: { brand?: { homeUrl?: string } } }

const status = computed(() => props.error?.statusCode ?? 500)

/**
 * Unbekannter Host (C12b): die Adresse gehört zu KEINER Community — ein
 * „Diese Seite existiert nicht" wäre hier irreführend (es existiert die ganze
 * Site nicht), und „Zur Startseite" führte in denselben 404 zurück. Die Regel
 * ist bewusst geteilt mit der Middleware, die den Fehler wirft
 * (shared/unknownHost.ts).
 */
const unknownHost = computed(() => isUnknownHostError(props.error))
const description = computed(() => {
  if (unknownHost.value) return t('error.unknownHost')
  return status.value === 404 ? t('error.notFound') : t('error.generic')
})
/** Ausweg für den unbekannten Host: die Betreiber-Seite, sofern die App eine kennt. */
const homeUrl = computed(() => appConfig.pukalani?.brand?.homeUrl || '')

// Titel statt nackter URL im Tab/in geteilten Links: „404 · Morgenlicht" —
// über dieselbe Composable wie alle anderen Seiten (ui.metaTitle-Muster, S8).
useBrandTitle(() => String(status.value))

/**
 * `lang` und `dir` am <html> — und zwar HIER, weil `useLocaleSeoHead()` in
 * app.vue sitzt und Nuxt bei einem Fehler `error.vue` STATT app.vue rendert.
 * Der Kopf von dort läuft also nie: jede 404 kam mit nacktem `<html>` heraus
 * (am 2026-08-15 auf pukalani.app, demo, help und account nachgemessen). Der
 * TEXT war die ganze Zeit richtig übersetzt — das Dokument sagte nur nicht, in
 * welcher Sprache er ist, und ein Screenreader spricht deutschen Text dann in
 * seiner Vorgabesprache aus.
 *
 * BEWUSST NUR lang/dir, nicht der ganze `useLocaleSeoHead()`: eine Fehlerseite
 * darf kein canonical auf sich selbst setzen und keine hreflang-Alternates für
 * eine Seite anbieten, die es nicht gibt. Das wäre die Einladung an
 * Suchmaschinen, 404 zu indexieren.
 */
const localeHead = useLocaleHead({ seo: false, lang: true, dir: true })
// Reaktiv ist die GANZE Angabe, nicht das einzelne Feld — dieselbe Form wie in
// `useLocaleSeoHead()`. Ein `htmlAttrs: () => …` wäre ein Typfehler: unhead
// erwartet dort ein Objekt, dessen Felder Getter sein dürfen, keine Funktion
// an der Stelle des Objekts.
useHead(() => ({ htmlAttrs: localeHead.value.htmlAttrs }))

// Nuxt UI in der Seitensprache — die Fehlerseite rendert ihren EIGENEN UApp.
const uiLocale = useNuxtUiLocale()
</script>

<template>
  <UApp :locale="uiLocale">
    <main class="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p class="text-sm font-medium text-muted">{{ brand }}</p>
      <h1 class="text-5xl font-bold">{{ status }}</h1>
      <p class="text-muted">{{ description }}</p>
      <UButton
        v-if="unknownHost && homeUrl"
        :to="homeUrl"
        external
      >{{ t('error.toOperatorSite', { brand }) }}</UButton>
      <UButton
        v-else-if="!unknownHost"
        @click="clearError({ redirect: localePath('/') })"
      >{{ t('error.backHome') }}</UButton>
    </main>
  </UApp>
</template>
