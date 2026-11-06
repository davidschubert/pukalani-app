<script setup lang="ts">
import type { BrandPathKind } from '../../../../shared/slotRegistry'
import {
  type BrandNewDraft,
  brandInitialContentLocale,
  brandNewDraftBody,
  brandNewDraftComplete,
  brandNewDraftMissing,
  emptyBrandNewDraft,
} from '../../../../shared/brandStartCard'
import { firstOpenBrandStep } from '../../../../shared/brandJourney'
import type { BrandProfileDetailResponse } from '../../../../shared/types/brand'

/**
 * NEUES BRANDING ALS SEITE (Plan §3d Hauptansicht 2, Route §3e
 * `/dashboard/brands/new`).
 *
 * ── SIE IST SEIT DEM KAILUA-LAUF NICHT MEHR DIE ZWEITE HÄLFTE DES MODALS ──
 * Bis 2026-09-08 fragte das Modal auf `/dashboard/brands` Weiche, Titel und
 * Sprache und reichte sie als Query hierher weiter — wo dieselben drei Felder
 * ein zweites Mal standen (Befund 6). Davids Entscheidung: das Modal legt
 * selbst an, diese Seite bleibt das Ziel DIREKTER Links (Startseite,
 * Discover-CTA, Konto-Menü) und fragt jedes Feld genau einmal.
 *
 * Die Felder hinter der Weiche stehen deshalb in `BwNewBrandDetails` (dieselbe
 * Komponente rendert das Modal), die Regeln daneben pur in
 * `shared/brandStartCard.ts`. Hier bleibt: die Weiche W1, der Absenden-Knopf
 * und der Sprung in die Werkstatt.
 *
 * Die Inhaltssprache kommt aus `pukalani.brand.contentLocales` und NICHT aus
 * einer Liste im Layer — sonst stünde hier eine Pukalani-Annahme im Layer
 * (White-Label-Regel §3e). Sie wird bei der Anlage FIXIERT.
 */
/* KEIN `layout: 'dashboard'` mehr (2026-09-03): die Brandings-Seiten sind
 * KUNDEN-Fläche und tragen die Wizard-Nav des default-Layouts — das
 * dashboard-Layout gehört seit der admin-Montage der Betreiber-Shell. */

const { t, locale } = useI18n()
const localePath = useLocalePath()
const appConfig = useAppConfig() as { pukalani?: { brand?: { contentLocales?: string[] } } }

const contentLocales = computed(() => appConfig.pukalani?.brand?.contentLocales ?? ['en'])

/**
 * DIE WEICHE KANN AUS DER ADRESSE KOMMEN (`?path=relaunch`) — und das ist der
 * Grund, aus dem es diese Seite noch gibt.
 *
 * Vier Einstiege zeigen mit vorgewählter Weiche hierher: die Startseite von
 * branding.supply, die zwei Brand-Check-Seiten („eure Marke neu aufsetzen") und
 * die Discover-CTA. Sie tun etwas, das das Modal nicht kann: sie verlinken.
 *
 * Was aus der QUERY kommt, ist ein Vorschlag, keine Tatsache — geprüft wird er
 * hier (alles ausser `relaunch` ist `new`), bevor er ein Anfangswert wird.
 * `title`/`lang` liest die Seite bewusst NICHT mehr: sie kamen aus dem
 * Anlage-Modal, und das legt seit Kailua-Befund 6 selbst an.
 */
const route = useRoute()
const pathKind = ref<BrandPathKind>(route.query.path === 'relaunch' ? 'relaunch' : 'new')
// Die Vorgabe folgt der OBERFLÄCHE (Testlauf-Befund I, 2026-09-09) — dieselbe
// pure Regel wie im Modal; die Inhaltssprache ist beim Anlegen fixiert.
const draft = ref<BrandNewDraft>(
  emptyBrandNewDraft(brandInitialContentLocale(locale.value, contentLocales.value)),
)

const startCardComplete = computed(() => brandNewDraftComplete(draft.value))
/** Was noch fehlt — als Satz unter dem abgeschalteten Knopf (Befund J). */
const missingLine = computed(() => {
  const missing = brandNewDraftMissing(draft.value)
  return missing.length
    ? t('brand.new.missing', {
        fields: missing.map(field => t(`brand.new.startCard.short.${field}`)).join(', '),
      })
    : ''
})

const submitting = ref(false)
const failed = ref(false)

/**
 * ── B7: DIE STARTKARTE SCHLUCKTE EINGABEN (Audit 2026-09-02, dreimal
 * reproduziert) ──────────────────────────────────────────────────────────
 *
 * Wer direkt nach der Navigation hierher zu tippen anfing, verlor den Text:
 * bis zur Hydration hängt an den Feldern kein `v-model`, der Browser nimmt die
 * Zeichen an, und der erste Vue-Render überschreibt sie mit dem leeren
 * Anfangswert. Die Felder SAHEN aber bedienbar aus — das ist der ganze Fehler.
 *
 * DER KLEINSTE EHRLICHE FIX IST, NICHT ZU LÜGEN: bis `onMounted` + `nextTick`
 * sind die Felder sichtbar abgeschaltet, mit einer ruhigen Zeile darüber.
 * Kein Puffer, der vorgetipptes übernimmt — der müsste jedes Feld einzeln
 * auslesen, käme bei Auswahl-Elementen und der `datalist` an seine Grenze und
 * wäre ein zweiter Zustandsspeicher neben den Refs. Lieber eine halbe Sekunde
 * ehrlich gesperrt als scheinbar bereit.
 *
 * `false` auf BEIDEN Seiten (SSR und erster Client-Render), damit das Markup
 * übereinstimmt; das `nextTick` wartet den Render nach der Hydration ab, in dem
 * die Bindungen wirklich hängen.
 */
const hydrated = ref(false)
onMounted(async () => {
  await nextTick()
  hydrated.value = true
})

async function submit(): Promise<void> {
  submitting.value = true
  failed.value = false
  try {
    const detail = await $fetch<BrandProfileDetailResponse>('/api/brand/profiles', {
      method: 'POST',
      body: brandNewDraftBody(pathKind.value, draft.value),
    })
    await navigateTo(localePath(`/brand/${detail.profile.id}/${firstOpenBrandStep(detail.journey)}`))
  }
  catch {
    failed.value = true
  }
  finally {
    submitting.value = false
  }
}

useBrandTitle(() => t('brand.new.title'))
</script>

<template>
  <div class="bw-root mx-auto w-full max-w-2xl">
    <NuxtLink :to="localePath('/dashboard/brands')" class="bw-label inline-flex items-center gap-1.5" style="color: var(--bw-muted)">
      <UIcon name="i-ph-arrow-left" class="size-4" /> {{ t('brand.brands.title') }}
    </NuxtLink>

    <p class="bw-label mt-4 uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('brand.new.eyebrow') }}</p>
    <h1 class="mt-1 text-[28px] font-extralight leading-tight tracking-tight">{{ t('brand.new.title') }}</h1>
    <!-- B7: solange nichts angenommen wird, steht das auch da. Der Satz
         verschwindet mit der Hydration und hinterlässt keine Lücke. -->
    <p v-if="!hydrated" class="bw-pending mt-2">{{ t('brand.new.preparing') }}</p>

    <!-- W1: der Pfad -->
    <div class="mt-6 grid gap-2 sm:grid-cols-2">
      <button
        v-for="kind in (['new', 'relaunch'] as const)" :key="kind"
        type="button"
        :disabled="!hydrated"
        class="bw-select-card rounded-2xl px-4 py-4 text-left"
        :class="pathKind === kind ? 'bw-select-card--on' : ''"
        :aria-pressed="pathKind === kind"
        @click="pathKind = kind"
      >
        <span class="block text-sm font-medium">{{ t(`brand.new.kind.${kind}.label`) }}</span>
        <span class="bw-select-note mt-1 block text-sm">{{ t(`brand.new.kind.${kind}.note`) }}</span>
      </button>
    </div>

    <BwNewBrandDetails
      v-model="draft"
      :path-kind="pathKind"
      :content-locales="contentLocales"
      :disabled="!hydrated"
    />

    <div class="mt-8 flex items-center justify-end gap-3">
      <p v-if="failed" class="mr-auto text-sm" style="color: var(--bw-stale)">{{ t('brand.new.failed') }}</p>
      <UButton
        :loading="submitting"
        :disabled="!hydrated || !startCardComplete"
        trailing-icon="i-ph-arrow-right" :label="t('brand.new.submit')"
        size="lg" class="rounded-full" @click="submit"
      />
    </div>
    <!-- BEFUND J: der abgeschaltete Knopf sagt, was ihm fehlt. -->
    <p v-if="hydrated && missingLine" class="bw-label mt-2 text-right" style="color: var(--bw-muted)">{{ missingLine }}</p>
  </div>
</template>
