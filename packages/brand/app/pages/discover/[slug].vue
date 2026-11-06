<script setup lang="ts">
import { BRAND_CHECK_CATEGORIES } from '../../../shared/brandCheck'
import { brandChoiceDisplayLabel } from '../../../shared/brandChoiceOptions'
import { brandDiscoverOgPath, discoverPurposeLine, discoverVoiceLine } from '../../../shared/brandDiscover'
import { BRAND_PALETTES } from '../../../shared/brandPalette'
import type { BrandDiscoverEntryResponse } from '../../../shared/types/brand'

/**
 * DIE ANATOMIE EINER MARKE — `/discover/<slug>`
 * (Konzept docs/plans/DISCOVER-BRANDS.md §4.2, Form abgenommen am Klickdummy
 * `/brand/demo/anatomie`).
 *
 * Form ist das DOSSIER: sticky Steckbrief links, rechts das Fundament als
 * fliessendes Dokument. Indexierbar — das ist der ganze Zweck der Ebene
 * „Discover" (§1).
 *
 * ── DERSELBE RENDERER WIE DIE LESEANSICHT ────────────────────────────────
 * Die Kapitel kommen als fertige `BrandFoundationView` aus der Route (dort
 * rechnet `buildBrandFoundation` über den eingefrorenen Snapshot) und werden
 * mit DEMSELBEN Baustein gezeigt wie der geteilte Link: `BwFoundationChapter`
 * mit `variant="share"`. Kein zweiter Baum, keine abgeschriebenen Abschnitte —
 * ein Unterschied zwischen geteilter und öffentlicher Fassung wäre sonst ein
 * Zufall statt eines Testfalls. Die visuellen Kapitel bleiben gesperrt, weil
 * der Renderer sie so baut; die Seite hebt das nicht auf.
 *
 * ── 404 IST EIN ZUSTAND DIESER SEITE, KEINE FEHLERSEITE ──────────────────
 * Unbekannt, zurückgezogen, ausgeblendet — die Route antwortet auf alles
 * dasselbe (ihr Kopf sagt warum). Hier steht dazu ein eigener Zustand mit dem
 * Weg zurück in die Galerie statt der App-Fehlerseite: wer über einen alten
 * Link kommt, soll nicht in einer Sackgasse landen. Der STATUS bleibt
 * trotzdem 404 (`setResponseStatus`) — sonst indexierte ein Crawler eine
 * „Seite", die es nicht gibt.
 *
 * ── TEILEN: DAS NATIVE BLATT, WO ES EINS GIBT (Entscheidung 7) ───────────
 * Der Knopf trägt IMMER dieselbe Beschriftung und entscheidet erst beim KLICK,
 * ob `navigator.share` da ist. Eine Beschriftung, die von einer
 * Browser-Fähigkeit abhängt, wäre auf dem Server eine andere als im Browser —
 * also ein Hydration-Fehler an genau einem Knopf.
 */
definePageMeta({ layout: 'default' })

const { t, te, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const toast = useToast()
const { isLoggedIn } = useCurrentUser()

const slug = computed(() => String(route.params.slug ?? ''))

// Die Betreiber-Vorschau (`?preview=1`, D3-Schnittstelle) reist als Query an
// die Route durch; die entscheidet über das Gate. Ohne Recht antwortet sie
// 401/403, und die Seite zeigt denselben „gibt es nicht"-Zustand wie bei 404.
const preview = computed(() => route.query.preview === '1')

const { data, error } = await useFetch<BrandDiscoverEntryResponse>(
  () => `/api/discover/${encodeURIComponent(slug.value)}${preview.value ? '?preview=1' : ''}`,
  { key: 'brand-discover-entry', watch: [slug, preview] },
)

const missing = computed(() => Boolean(error.value) || !data.value)
const isPreview = computed(() => Boolean(data.value?.preview))

/**
 * Der HTTP-Status wird gesetzt, die Seite bleibt trotzdem diese (s. Kopf).
 * Nur auf dem Server: im Browser gibt es keinen Antwort-Kopf mehr, den man
 * ändern könnte.
 */
const requestEvent = useRequestEvent()
if (missing.value && requestEvent) setResponseStatus(requestEvent, 404)

const publication = computed(() => data.value?.publication ?? null)
const foundation = computed(() => data.value?.foundation ?? null)
const chapters = computed(() => foundation.value?.chapters ?? [])
const check = computed(() => data.value?.check ?? null)
const similar = computed(() => data.value?.similar ?? [])

const title = computed(() => publication.value?.title ?? '')
const purpose = computed(() => discoverPurposeLine(foundation.value))
const voice = computed(() => discoverVoiceLine(foundation.value))

// ── Kopf ───────────────────────────────────────────────────────────────────

/**
 * Der Titel der 404 ist NICHT die Vorlage mit leerem Markennamen: im Tab stand
 * sonst „— Anatomie einer Marke · Discover Brands", und der Gedankenstrich am
 * Anfang liest sich wie ein Fehler (live erwischt). Er sagt stattdessen, was
 * los ist.
 */
const pageTitle = computed(() => (missing.value
  ? t('brand.discover.entry.notFoundTitle')
  : t('brand.discover.entry.seoTitle', { brand: title.value })))

const pageDescription = computed(() => {
  if (missing.value) return t('brand.discover.entry.notFoundBody')
  const line = purpose.value.trim()
  if (!line) return t('brand.discover.entry.seoDescription', { brand: title.value })
  return line.length > 200 ? `${line.slice(0, 197)}…` : line
})

useSeoMeta({
  title: () => pageTitle.value,
  description: () => pageDescription.value,
  ogTitle: () => pageTitle.value,
  ogDescription: () => pageDescription.value,
  // Eine Marke, die es hier nicht (mehr) gibt, gehört in keinen Index — auch
  // dann nicht, wenn die Seite eine freundliche Rückkehr anbietet.
  robots: () => (missing.value || isPreview.value ? 'noindex, nofollow' : 'index, follow'),
})

/**
 * DAS VORSCHAUBILD DIESER ANATOMIE (D4) — die Farbwelt der Marke mit ihrer
 * Wortmarke, 1200×630 PNG.
 *
 * Eingetragen wird nur der PFAD; die absolute URL, die Maße und `twitter:card`
 * macht `useLocaleSeoHead()` im Core — der EINE Kopf-Aufruf jeder App
 * (CLAUDE.md). Der Pfad selbst kommt aus `brandDiscoverOgPath()`, damit Seite
 * und Route dieselbe Wahrheit lesen.
 *
 * AUSGELIEFERT WIRD ES VON DER APP `branding` (Kompositions-Ebene): der
 * Rasterizer lebt in `packages/themes`, und ein Produkt-Layer darf ihn nicht
 * kennen (CONCEPT.md A14). Im Playground DIESES Layers gibt es die Route
 * deshalb nicht — dort bleibt der Kopf ohne og:image.
 *
 * KEIN BILD FÜR 404 UND VORSCHAU: beide tragen `noindex`, und ein og:image auf
 * eine Seite, die es nicht (mehr) öffentlich gibt, wäre dieselbe Lüge im Kopf
 * wie ein Tag auf ein 404.
 *
 * ── ZURÜCKSETZEN IST PFLICHT, NICHT KOSMETIK ─────────────────────────────
 * `useBrandOgImage()` ist ein APP-WEITER State (useState). Bliebe er stehen,
 * trüge die nächste Seite im selben Client-Lauf die Vorschau einer fremden
 * Marke — auf `/erstgespraech` stünde dann „Kailua Coffee Co." im geteilten
 * Link. Beide Haken sind bewusst da: `onBeforeRouteLeave` greift beim
 * Weiterklicken (die Komponente lebt da noch), `onUnmounted` beim Abräumen
 * ohne Navigation.
 */
const ogImage = useBrandOgImage()
const discoverOgImage = computed(() => {
  if (missing.value || isPreview.value) return null
  const path = brandDiscoverOgPath(slug.value)
  return path ? { path, width: 1200, height: 630, type: 'image/png' } : null
})
ogImage.value = discoverOgImage.value
watch(discoverOgImage, (value) => { ogImage.value = value })
onBeforeRouteLeave(() => { ogImage.value = null })
onUnmounted(() => { ogImage.value = null })

/**
 * Der Brotkrumen als JSON-LD (§4.2: „nur `WebPage` + BreadcrumbList" — kein
 * `Organization`: wir behaupten nichts über eine fremde Firma).
 *
 * Das `<` wird escapet, damit ein Markenname mit einem schliessenden
 * Script-Tag darin den Block nicht vorzeitig beendet (dieselbe Regel wie in
 * `apps/branding/app/utils/jsonLd.ts` — hier lokal, weil eine Layer-Seite
 * nicht in die App greifen darf).
 *
 * Und ja: dieser Kommentar UMSCHREIBT das Tag, statt es hinzuschreiben. Ein
 * SFC-Block endet am ersten schliessenden Script-Tag — auch mitten in einem
 * Kommentar. Der Parser meldet dann einen unbeendeten Block-Kommentar an einer
 * Zeile, an der nichts fehlt (live erwischt, 2026-09-08).
 */
useHead({
  script: computed(() => (missing.value
    ? []
    : [{
        type: 'application/ld+json' as const,
        innerHTML: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          'itemListElement': [
            { '@type': 'ListItem', 'position': 1, 'name': t('brand.discover.eyebrow'), 'item': localePath('/discover') },
            { '@type': 'ListItem', 'position': 2, 'name': title.value },
          ],
        }).replace(/</g, '\\u003c'),
      }])),
})

// ── Steckbrief ─────────────────────────────────────────────────────────────

function industryLabel(id: string): string {
  const key = `brand.industry.${id}`
  return te(key) ? t(key) : t('brand.industry.unknown')
}

function pathLabel(kind: string): string {
  const key = `brand.discover.path.${kind}`
  return te(key) ? t(key) : ''
}

function scoreLabel(kind: string): string {
  const key = `brand.discover.score.${kind}`
  return te(key) ? t(key) : ''
}

function bandLabel(band: string): string {
  const key = `brand.check.bands.${band}`
  return band && te(key) ? t(key) : ''
}

/** Die Inhaltssprache der MARKE — nicht die des Lesers. Unbekanntes fällt weg. */
function languageLabel(code: string): string {
  const key = `brand.discover.entry.language.${code}`
  return code && te(key) ? t(key) : ''
}

const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value === 'de' ? 'de-DE' : 'en-US', {
  dateStyle: 'long',
  // Feste Zone: ohne sie rechnete der Server anders als der Browser und die
  // Hydration bräche an genau diesem Datum.
  timeZone: 'UTC',
}))
function formatDate(value: string): string {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? dateFormat.value.format(parsed) : ''
}

const archetypeLine = computed(() => {
  const item = publication.value
  if (!item?.archetype) return ''
  const primary = brandChoiceDisplayLabel('d.primary', item.archetype, locale.value)
  if (!item.archetypeSecondary) return primary
  return t('brand.discover.entry.archetypePair', {
    primary,
    secondary: brandChoiceDisplayLabel('d.secondary', item.archetypeSecondary, locale.value),
  })
})

/** Nur Zeilen, die WIRKLICH etwas sagen — „Stimme: —" wäre keine Auskunft. */
const profileRows = computed<{ key: string, label: string, value: string }[]>(() => {
  const item = publication.value
  if (!item) return []
  return [
    { key: 'industry', label: t('brand.discover.entry.field.industry'), value: industryLabel(item.industry) },
    { key: 'path', label: t('brand.discover.entry.field.path'), value: pathLabel(item.pathKind) },
    { key: 'archetype', label: t('brand.discover.entry.field.archetype'), value: archetypeLine.value },
    { key: 'voice', label: t('brand.discover.entry.field.voice'), value: voice.value },
    { key: 'language', label: t('brand.discover.entry.field.language'), value: languageLabel(item.locale) },
    { key: 'published', label: t('brand.discover.entry.field.published'), value: formatDate(item.publishedAt) },
  ].filter(row => Boolean(row.value))
})

// ── Farbwelt ───────────────────────────────────────────────────────────────

const FALLBACK_GRADIENT = BRAND_PALETTES[0]!.gradient
function gradientOf(paletteId: string): readonly [string, string, string] {
  return BRAND_PALETTES.find(entry => entry.id === paletteId)?.gradient ?? FALLBACK_GRADIENT
}
function tileBackground(paletteId: string): string {
  const [a, b, c] = gradientOf(paletteId)
  return `linear-gradient(165deg, ${a} 0%, ${b} 45%, ${c} 100%)`
}
const heroGradient = computed(() => gradientOf(publication.value?.paletteId ?? ''))

// ── Markenabdruck ──────────────────────────────────────────────────────────

/**
 * Acht Werte in KATALOG-Reihenfolge — `BwBrandFingerprint` zeichnet Zahlen und
 * kennt keine Kategorie-Ids. Eine fehlende Kategorie wird `null` („nicht
 * bewertbar") und lässt eine Lücke, statt als Null gezeichnet zu werden.
 */
const fingerprint = computed(() => {
  const entry = check.value
  if (!entry) return []
  return [{
    values: BRAND_CHECK_CATEGORIES.map(category =>
      entry.categories.find(value => value.id === category.key)?.score ?? null),
    color: 'accent' as const,
    label: title.value,
  }]
})

// ── Handlungen ─────────────────────────────────────────────────────────────

const startTarget = computed(() =>
  localePath(isLoggedIn.value ? '/dashboard/brands/new' : '/invite'))

/**
 * Teilen (Entscheidung 7): das native Blatt, wo es eins gibt — sonst der Link
 * in der Zwischenablage. Ein Abbruch durch den Menschen ist KEIN Fehler und
 * bekommt deshalb keine Meldung.
 */
async function share(): Promise<void> {
  if (!import.meta.client) return
  const url = window.location.href
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: title.value, url })
      return
    }
    catch {
      return
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    toast.add({ title: t('brand.discover.entry.copied'), color: 'success' })
  }
  catch {
    toast.add({ title: t('brand.discover.entry.copy'), description: url, color: 'neutral' })
  }
}
</script>

<template>
  <div class="pb-10">
    <!-- 404: eigener Zustand mit dem Weg zurück (s. Kopf) -->
    <div v-if="missing" class="mx-auto mt-24 max-w-xl text-center" data-discover-missing>
      <BwIllustration variant="journey" class="mx-auto h-16 w-auto" style="color: var(--bw-ink-soft)" />
      <h1 class="mt-6 text-3xl font-extralight tracking-tight">{{ t('brand.discover.entry.notFoundTitle') }}</h1>
      <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
        {{ t('brand.discover.entry.notFoundBody') }}
      </p>
      <UButton
        :to="localePath('/discover')" :label="t('brand.discover.entry.notFoundCta')"
        icon="i-ph-arrow-left" class="mt-7 rounded-full" color="neutral"
      />
    </div>

    <div v-else-if="publication" class="mx-auto mt-10 max-w-7xl">
      <!-- Volle 1280 px wie die Galerie (Davids Zuschnitt 2026-09-08) — der
           Dummy hatte das Dossier auf 896 px eingeengt. -->
      <div class="mx-auto max-w-7xl">
        <NuxtLink
          :to="localePath('/discover')" class="bw-label inline-flex items-center gap-1.5"
          style="color: var(--bw-muted)" data-discover-back
        >
          <UIcon name="i-ph-arrow-left" class="size-4" /> {{ t('brand.discover.entry.back') }}
        </NuxtLink>

        <!-- Hero in der Farbwelt der Marke -->
        <header
          class="bw-grain-hero mt-4 p-10"
          :style="`--hero-a: ${heroGradient[0]}; --hero-b: ${heroGradient[1]}; --hero-c: ${heroGradient[2]}`"
          data-discover-hero
        >
          <div class="flex flex-wrap items-start justify-between gap-6">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="bw-label uppercase tracking-widest" style="color: rgb(247 242 234 / 0.7)">
                  {{ t('brand.discover.entry.eyebrow') }}
                </p>
                <span
                  v-if="isPreview"
                  class="bw-label rounded-full px-2.5 py-1"
                  style="background: rgb(247 242 234 / 0.9); color: #1a1a1a"
                  data-discover-preview
                >{{ t('brand.discover.badge.preview') }}</span>
                <span
                  v-if="publication.example"
                  class="bw-label rounded-full px-2.5 py-1"
                  style="background: rgb(20 20 20 / 0.35); color: #f7f2ea"
                >{{ t('brand.discover.badge.example') }}</span>
                <span
                  v-else-if="publication.pathKind === 'relaunch'"
                  class="bw-label rounded-full px-2.5 py-1"
                  style="background: rgb(20 20 20 / 0.35); color: #f7f2ea"
                >{{ t('brand.discover.badge.relaunch') }}</span>
              </div>
              <h1 class="mt-3 text-3xl font-extralight leading-snug tracking-tight">{{ title }}</h1>
              <p v-if="purpose" class="mt-4 max-w-xl text-xl font-extralight leading-snug">{{ purpose }}</p>
            </div>
            <div
              v-if="publication.score"
              class="bw-on-dark flex flex-none flex-col items-center gap-1 rounded-2xl px-4 py-3"
              style="background: rgb(20 20 20 / 0.35)"
              data-discover-score
            >
              <BwScoreRing
                :value="publication.score.value" :size="72"
                :label="scoreLabel(publication.score.kind)"
              />
              <p
                v-if="bandLabel(publication.score.band)" class="bw-label"
                style="color: rgb(247 242 234 / 0.7)"
              >{{ bandLabel(publication.score.band) }}</p>
            </div>
          </div>
        </header>

        <!-- Dossier: Steckbrief-Leiste + Fundament -->
        <div class="mt-10 grid gap-12 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside class="self-start lg:sticky lg:top-10" data-discover-profile>
            <p
              class="bw-label border-b pb-3"
              style="color: var(--bw-muted); border-color: var(--bw-line-strong)"
            >{{ t('brand.discover.entry.profile') }}</p>
            <dl class="mt-4 space-y-3">
              <div v-for="row in profileRows" :key="row.key">
                <dt class="bw-label" style="color: var(--bw-muted)">{{ row.label }}</dt>
                <dd class="mt-0.5 text-sm">{{ row.value }}</dd>
              </div>
            </dl>
          </aside>

          <article class="min-w-0">
            <!-- Kapitel weit auseinander (Davids Zuschnitt 2026-09-08): ein
                 Dossier liest sich in Abschnitten, nicht als eine Textwand. -->
            <div class="flex flex-col gap-20">
              <BwFoundationChapter
                v-for="(chapter, index) in chapters" :key="chapter.id"
                :chapter="chapter" :index="index" variant="share"
              />
            </div>

            <!-- MARKENABDRUCK statt Bewertung: acht gemessene Kategorien mit
                 dem Weg zu ihrer Herkunft (§4.2). -->
            <section v-if="check && fingerprint.length" class="mt-12" data-discover-fingerprint>
              <USeparator class="mb-8" :ui="{ border: 'border-(--bw-line)' }" />
              <div class="flex flex-wrap items-baseline justify-between gap-3">
                <p class="bw-label" style="color: var(--bw-muted)">
                  {{ t('brand.discover.entry.fingerprint.title') }}
                </p>
                <NuxtLink
                  :to="localePath(`/brand-check/${check.id}`)"
                  class="bw-label inline-flex items-center gap-1.5" style="color: var(--bw-muted)"
                >
                  {{ t('brand.discover.entry.fingerprint.link') }}
                  <UIcon name="i-ph-arrow-up-right" class="size-3.5" />
                </NuxtLink>
              </div>
              <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
                {{ t('brand.discover.entry.fingerprint.lead', { score: check.score }) }}
              </p>
              <div class="mt-4">
                <BwBrandFingerprint :series="fingerprint" :size="360" />
              </div>
            </section>
          </article>
        </div>

        <!-- ÄHNLICHE MARKEN — die zwei Facetten, die nur wir haben. -->
        <section v-if="similar.length" class="mt-16" data-discover-similar>
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="text-lg font-medium">{{ t('brand.discover.entry.similar.title') }}</h2>
            <NuxtLink :to="localePath('/discover')" class="bw-label" style="color: var(--bw-muted)">
              {{ t('brand.discover.entry.similar.all') }}
            </NuxtLink>
          </div>
          <div class="mt-4 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4">
            <NuxtLink
              v-for="entry in similar" :key="entry.slug"
              :to="localePath(`/discover/${entry.slug}`)" class="group block"
            >
              <div class="bw-tile relative overflow-hidden" style="aspect-ratio: 1 / 1">
                <div
                  class="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.04]"
                  :style="`background: ${tileBackground(entry.paletteId)}`"
                />
                <p
                  class="absolute inset-0 grid place-items-center p-4 text-center text-base font-extralight leading-snug tracking-tight"
                  style="color: #f7f2ea; text-shadow: 0 1px 12px rgb(20 20 20 / 0.3)"
                >{{ entry.title }}</p>
              </div>
              <p class="bw-label mt-2" style="color: var(--bw-muted)">
                {{ t(`brand.discover.entry.similar.${entry.reason}`) }}
              </p>
            </NuxtLink>
          </div>
        </section>

        <div class="bw-card mt-12 flex flex-wrap items-center justify-between gap-4 p-8" data-discover-cta>
          <p class="text-sm" style="color: var(--bw-ink-soft)">{{ t('brand.discover.entry.cta.body') }}</p>
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              :label="t('brand.discover.entry.share')" icon="i-ph-share-network"
              color="neutral" variant="outline" class="rounded-full"
              data-discover-share
              @click="share"
            />
            <UButton
              :to="startTarget" :label="t('brand.discover.entry.cta.button')"
              icon="i-ph-plus" class="rounded-full"
            />
          </div>
        </div>

        <!-- „Melden" bleibt dezent: ein Notausgang, keine angebotene Handlung.
             Knopf UND Formular gehören `BwDiscoverReportForm` (Paket D3) — die
             Seite reicht nur die Adresse hinein. Ein zweiter Auslöser hier wäre
             ein zweiter Zustand für dasselbe Modal. -->
        <div class="mt-6 flex justify-center">
          <BwDiscoverReportForm :slug="publication.slug" />
        </div>
      </div>
    </div>
  </div>
</template>
