<script setup lang="ts">
/**
 * WIE DIESE COMMUNITY IN DER SUCHE ERSCHEINT (U15 Teil 2, Davids Zuschnitt vom
 * 2026-08-13) — Reiter des Community-Hubs.
 *
 * ── WARUM DIE SEITE IM pages-LAYER LIEGT ──────────────────────────────────
 * Dieselbe Regel wie beim Menü (A14, „eine Seite reicht nur so weit wie ihre
 * Routen"), und sie fällt hier genauso aus: die Schreib-Route braucht keine
 * Naht ins Control Plane, und die VORSCHAU braucht die Startseite dieser
 * Community — die gehört diesem Layer. Der Audit vom 2026-08-09 führt den
 * Punkt unter „Settings · Website · SEO", also in derselben Gruppe wie die
 * Seiten und das Menü.
 *
 * ── DIE VORSCHAU RECHNET MIT DEM ECHTEN KOPF, NICHT MIT EINER NACHBILDUNG ─
 * Titel = `ui.metaTitle` mit dem Namen der Startseite und der Brand-Kette
 * (`useBrandName`), also Zeichen für Zeichen das, was `useBrandTitle` in den
 * Kopf schreibt. Beschreibung = `resolveCommunitySeo` mit dem Anriss der
 * Startseite als Rückfall, also dieselbe Funktion, die der Kopf benutzt. Eine
 * Vorschau, die „ungefähr dasselbe" rechnet, ist schlimmer als keine: sie sagt
 * einem Owner zu, was er dann nicht bekommt.
 *
 * ── DIE SOCIAL-KARTE WIRD GEZEIGT, NICHT GEBAUT ───────────────────────────
 * `/og/<key>.png` entsteht auf dem Server aus Themefarbe und Community-Name
 * (B2). Hier hängt nur das Bild, das der Kopf ohnehin verlinkt
 * (`useBrandOgImage()`) — es gibt bewusst kein Upload-Feld und keine zweite
 * Rechnung des Schlüssels. Ohne aktives Gate (`pukalani.seo.tenantOgImage`,
 * Core-Default aus) steht dort der ehrliche Hinweis statt eines leeren
 * Rahmens: eine Vorschau auf etwas, das es nicht gibt, wäre die schlechteste
 * Antwort.
 *
 * ── DER SCHALTER SAGT DIE WAHRHEIT ÜBER SEINE WIRKUNG ─────────────────────
 * „noindex" ist eine BITTE an die Suchmaschine, kein Schalter am Index. Zwei
 * Dinge stehen deshalb an der Fläche: dass es erst beim nächsten Crawl greift
 * (Tage bis Wochen), und dass die Community NICHT unsichtbar wird — wer den
 * Link hat, kommt weiter hinein. Wer das verwechselt, benutzt hier den
 * falschen Schalter; der richtige heisst „nur für Mitglieder" und steht auf
 * dem Reiter „Allgemein" (C18).
 */
import { pageExcerpt } from '../../../../shared/pageExcerpt'
import type { PublicPage } from '../../../../shared/types/page'
import {
  MAX_SEO_DESCRIPTION,
  RECOMMENDED_SEO_DESCRIPTION,
  type CommunitySeoSettings,
  resolveCommunitySeo,
} from '../../../../../core/shared/communitySeo'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'branding.manage' })

const { t, locale } = useI18n()
const toast = useToast()
const brand = useBrandName()
const requestUrl = useRequestURL()
const ogImage = useBrandOgImage()

useBrandTitle(() => t('pages.seo.title'))

/**
 * Der gespeicherte Zustand kommt aus dem SSR-Payload, nicht aus einer eigenen
 * Leseroute: die Werte stehen auf diesem Host ohnehin schon im Kopf jeder
 * Seite (`community-seo.server.ts`). Eine Route, die dasselbe noch einmal
 * herausgibt, wäre eine zweite Wahrheit über denselben Zustand.
 */
const saved = useCommunitySeoSettings()

const metaDescription = ref(saved.value?.metaDescription ?? '')
const noindex = ref(saved.value?.noindex ?? false)
const saving = ref(false)

// Die Startseite — für den Titel und für den Rückfall der Beschreibung.
// Dieselbe Route und derselbe Fehlerfall wie auf der Startseite selbst.
/**
 * `useRequestFetch` statt `$fetch`: im Pool entscheidet der HOST über den
 * Mandanten, und im SSR trägt ein blankes `$fetch` ihn nicht mit — die Route
 * antwortet dann `404 Unknown host`. Hier fiel es besonders leise aus, weil
 * beide Abrufe ihren Fehler mit `.catch()` in einen leeren Wert verwandeln:
 * die Seite sah dann einfach unbefüllt aus. Wächter:
 * `packages/core/tests/ssrTenantFetch.test.ts`.
 */
const requestFetch = useRequestFetch()
/**
 * Ein 404 (es gibt noch keine Startseite) ist ein ERWARTETES Ergebnis, kein
 * Fehler. Nur ein echter Ausfall (Status ab 500 oder kein Status = Netz) geht
 * weiter: sonst stünde unter dem Feld „nichts hinterlegt", obwohl nur der
 * Abruf des Auszugs scheiterte.
 */
const { data: home, error: homeError, refresh: refreshHome } = await useAsyncData(
  () => `seo-home-${locale.value}`,
  () => requestFetch<PublicPage>('/api/pages/public/home', { query: { locale: locale.value } }).catch((err: unknown) => {
    const status = (err as { statusCode?: number }).statusCode
    if (status === undefined || status >= 500) throw err
    return null
  }),
  { watch: [locale] },
)

/** Der Anriss, der ohne eigene Beschreibung im Kopf stünde (heutiges Verhalten). */
const fallbackDescription = computed(() => (home.value ? pageExcerpt(home.value.body ?? '') : ''))

/** Was gespeichert würde — und damit auch, was die Vorschau rechnet. */
const draft = computed<CommunitySeoSettings>(() => ({
  metaDescription: metaDescription.value.trim(),
  noindex: noindex.value,
}))

const head = computed(() => resolveCommunitySeo(draft.value, fallbackDescription.value))

/** Wortgleich die Titel-Rechnung aus `useBrandTitle` (leerer Seitenname ⇒ Brand allein). */
const previewTitle = computed(() => {
  const page = home.value?.title?.trim() ?? ''
  return page.length > 0 ? t('ui.metaTitle', { page, brand: brand.value }) : brand.value
})

const previewHost = computed(() => requestUrl.host)

const length = computed(() => draft.value.metaDescription.length)
const usingFallback = computed(() => length.value === 0 && fallbackDescription.value.length > 0)
const overRecommended = computed(() => length.value > RECOMMENDED_SEO_DESCRIPTION)

const dirty = computed(() =>
  draft.value.metaDescription !== (saved.value?.metaDescription ?? '')
  || draft.value.noindex !== (saved.value?.noindex ?? false))

async function save() {
  saving.value = true
  try {
    const result = await $fetch<CommunitySeoSettings>('/api/pages/seo', { method: 'PATCH', body: draft.value })
    // Der gespeicherte Zustand zurück ins Formular: die Beschreibung kann beim
    // Putzen (Umbrüche, doppelte Leerzeichen) anders geworden sein.
    saved.value = result
    metaDescription.value = result.metaDescription
    noindex.value = result.noindex
    toast.add({ title: t('pages.seo.saved'), color: 'success' })
  }
  catch {
    toast.add({ title: t('pages.seo.errorSave'), color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="font-semibold">{{ t('pages.seo.title') }}</h2>
            <p class="mt-1 text-sm text-muted">{{ t('pages.seo.description') }}</p>
          </div>
          <UButton
            :loading="saving"
            :disabled="!dirty"
            icon="i-ph-floppy-disk"
            data-testid="seo-save"
            @click="save"
          >
            {{ t('ui.save') }}
          </UButton>
        </div>
      </template>

      <div class="space-y-6">
        <div class="space-y-2">
          <label for="seo-description" class="block text-sm font-medium">
            {{ t('pages.seo.field.label') }}
          </label>
          <UTextarea
            id="seo-description"
            v-model="metaDescription"
            :rows="3"
            :maxlength="MAX_SEO_DESCRIPTION"
            :placeholder="fallbackDescription || t('pages.seo.field.placeholder')"
            data-testid="seo-description"
            class="w-full"
          />
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
            <CoreInlineLoadError v-if="homeError" :retry="refreshHome" data-seo-home-error />
            <span v-else class="text-muted">
              <template v-if="usingFallback">{{ t('pages.seo.field.usingExcerpt') }}</template>
              <template v-else-if="length === 0">{{ t('pages.seo.field.noneAtAll') }}</template>
              <template v-else>{{ t('pages.seo.field.hint') }}</template>
            </span>
            <span :class="overRecommended ? 'text-warning' : 'text-muted'" data-testid="seo-counter">
              {{ t('pages.seo.field.counter', { count: length, recommended: RECOMMENDED_SEO_DESCRIPTION }) }}
            </span>
          </div>
        </div>

        <USeparator />

        <div class="space-y-2">
          <USwitch
            v-model="noindex"
            data-testid="seo-noindex"
            :label="t('pages.seo.noindex.label')"
            :description="t('pages.seo.noindex.description')"
          />
          <UAlert
            v-if="noindex"
            icon="i-ph-clock-countdown"
            color="warning"
            variant="subtle"
            :title="t('pages.seo.noindex.delayTitle')"
            :description="t('pages.seo.noindex.delayText')"
          />
          <p class="text-xs text-muted">{{ t('pages.seo.noindex.notPrivate') }}</p>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">{{ t('pages.seo.preview.title') }}</h2>
        <p class="mt-1 text-sm text-muted">{{ t('pages.seo.preview.description') }}</p>
      </template>

      <div class="space-y-8">
        <section class="space-y-2">
          <h3 class="text-xs font-medium uppercase tracking-wide text-muted">
            {{ t('pages.seo.preview.searchTitle') }}
          </h3>
          <div
            class="max-w-xl space-y-1 rounded-lg border border-default p-4"
            :class="noindex ? 'opacity-50' : ''"
            data-testid="seo-preview-search"
          >
            <p class="truncate text-xs text-muted">{{ previewHost }}</p>
            <p class="truncate text-lg text-primary">{{ previewTitle }}</p>
            <p v-if="head.description" class="text-sm text-toned">{{ head.description }}</p>
            <p v-else class="text-sm italic text-dimmed">{{ t('pages.seo.preview.noDescription') }}</p>
          </div>
          <p v-if="noindex" class="text-xs text-warning">{{ t('pages.seo.preview.hiddenNote') }}</p>
        </section>

        <section class="space-y-2">
          <h3 class="text-xs font-medium uppercase tracking-wide text-muted">
            {{ t('pages.seo.preview.socialTitle') }}
          </h3>
          <div v-if="ogImage" class="max-w-xl space-y-2" data-testid="seo-preview-social">
            <img
              :src="ogImage.path"
              :width="ogImage.width"
              :height="ogImage.height"
              :alt="t('ui.ogImageAlt', { brand })"
              class="w-full rounded-lg border border-default"
              loading="lazy"
            >
            <p class="text-xs text-muted">{{ t('pages.seo.preview.socialGenerated') }}</p>
          </div>
          <UAlert
            v-else
            icon="i-ph-image-square"
            color="neutral"
            variant="subtle"
            :title="t('pages.seo.preview.socialOffTitle')"
            :description="t('pages.seo.preview.socialOffText')"
          />
        </section>
      </div>
    </UCard>
  </div>
</template>
