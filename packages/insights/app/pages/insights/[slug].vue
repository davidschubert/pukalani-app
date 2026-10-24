<script setup lang="ts">
import { markdownHeadings } from '../../../../core/shared/markdown'
import type { InsightsLocale } from '../../../shared/insightsPost'
import { insightsPublicFassung, insightsTopicLabel } from '../../../shared/insightsPost'
import { insightsFormatIsPublic, insightsOgPath, readInsightsPublicFormats } from '../../../shared/insightsPublic'
import type { InsightsPublicPostResponse } from '../../../shared/types/insightsApi'

/**
 * DER ARTIKEL — `/insights/<slug>` (§2.3, §9.5).
 *
 * ── DER RIEGEL WIRD SCHON HIER GELESEN ──────────────────────────────────
 * `pukalani.insights.publicFormats` steht in der App-Config und ist damit auch
 * im Browser bekannt. Ist `article` gesperrt, zeigt die Seite ihren
 * 404-Zustand OHNE Request — kein Ladezustand, keine 404 in der Konsole, kein
 * Serverweg für eine Antwort, die feststeht. Die Route prüft denselben Riegel
 * noch einmal: die Seite spart den Weg, sie ersetzt die Sicherung nicht.
 *
 * ── 404 IST EIN ZUSTAND DIESER SEITE, KEINE FEHLERSEITE ─────────────────
 * Unbekannt, Entwurf, zurückgezogen, gesperrt — die Route antwortet auf alles
 * dasselbe. Hier steht dazu ein eigener Zustand mit dem Weg zurück ins
 * Journal; der STATUS bleibt trotzdem 404 (`setResponseStatus`), sonst
 * indexierte ein Crawler eine „Seite", die es nicht gibt.
 *
 * ── DIE 301 EINER UMBENENNUNG LÄUFT ÜBER DIE SEITE ──────────────────────
 * Die Route sagt nur, WOHIN (`kind: 'redirect'`); den Locale-Präfix setzt
 * `localePath()`. `navigateTo(..., { redirectCode: 301 })` gibt im SSR eine
 * echte 301 und navigiert im Browser ohne Neuladen.
 *
 * ── DAS INHALTSVERZEICHNIS UND DER TEXT LESEN DIESELBE FUNKTION ─────────
 * `markdownHeadings()` (core) rechnet die Sprungmarken, `MarkdownContent`
 * setzt sie mit `heading-anchors` — dieselbe Liste, derselbe Index. Eine
 * zweite Rechnung wäre ein Verzeichnis mit toten Links, und zwar lautlos.
 *
 * ── hreflang NUR AUF VORHANDENE FASSUNGEN (§9.5) ────────────────────────
 * Zeigt die Seite die Grundfassung, weil die zweite Fassung nicht redigiert
 * ist, darf sie keine Alternate-Adresse für diese Sprache melden — sie zeigte
 * dort denselben Text. Der Eintrag geht über `useSeoHiddenLocales()` an
 * `useLocaleSeoHead()`, den EINEN Kopf-Aufruf der App. Zurückgesetzt wird er
 * im KERN beim Abräumen (es ist ein app-weiter State — bliebe er stehen,
 * verlöre die nächste Seite ihre Sprachverknüpfung).
 *
 * ── JSON-LD: `Article` + `BreadcrumbList`, SONST NICHTS ─────────────────
 * Kein `Organization` für die fremde Marke (wir behaupten Google gegenüber
 * nicht, Stammdaten einer fremden Firma zu führen) und kein `Review`/
 * `AggregateRating` — genau die Auszeichnung, die aus einer Einordnung im
 * Meinungs-Stil eine maschinenlesbare Bewertung machte (§9.5). `author` und
 * `publisher` sind UNSER Name; das ist erlaubt und beantwortet zugleich die
 * Frage nach dem Verantwortlichen.
 *
 * Das `<` im JSON wird escapet, damit ein Titel mit einem schliessenden
 * Script-Tag darin den Block nicht vorzeitig beendet. Und ja: dieser Kommentar
 * UMSCHREIBT das Tag, statt es hinzuschreiben — ein SFC-Block endet am ersten
 * schliessenden Script-Tag, auch mitten in einem Kommentar (live erwischt,
 * 2026-09-08).
 */
definePageMeta({ layout: 'default' })

const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const requestEvent = useRequestEvent()
const appConfig = useAppConfig() as { pukalani?: { insights?: { publicFormats?: unknown } } }

const slug = computed(() => String(route.params.slug ?? ''))
const readerLocale = computed<InsightsLocale>(() => (locale.value === 'de' ? 'de' : 'en'))

// Die Betreiber-Vorschau reicht die Query an die Route durch; die entscheidet
// über das Gate. Ohne Recht antwortet sie 401/403, und die Seite zeigt denselben
// „gibt es nicht"-Zustand wie bei 404.
const preview = computed(() => route.query.preview === '1')

/** Der Riegel, gelesen mit derselben puren Regel wie auf dem Server. */
const publicFormats = computed(() => readInsightsPublicFormats(appConfig.pukalani?.insights?.publicFormats))
const formatAllowed = computed(() => insightsFormatIsPublic('article', publicFormats.value))
/**
 * Verlinkt der Chip einer erwähnten Marke? Nur, wenn es die Profil-Seite auch
 * WIRKLICH gibt. Ein Link auf eine gesperrte Adresse wäre ein 404 mitten im
 * Text — und der Riegel ist genau die Zusage, dass es diese Seite noch nicht
 * gibt (§11.3).
 */
const profileAllowed = computed(() => insightsFormatIsPublic('profile', publicFormats.value))

const { data, error } = await useFetch<InsightsPublicPostResponse>(
  () => `/api/insights/public/posts/${encodeURIComponent(slug.value)}${preview.value ? '?preview=1' : ''}`,
  {
    key: 'insights-public-post',
    watch: [slug, preview],
    // Bei gesperrtem Format gibt es nichts zu holen (s. Kopf).
    immediate: formatAllowed.value,
  },
)

// Eine Weiterleitung ist die Antwort der Route auf einen alten Slug (§9.2).
// SSR: echte 301. Browser: Client-Navigation, `replace` — der alte Eintrag
// gehört nicht in den Verlauf, sonst führt „zurück" wieder auf die 301.
const redirectTo = computed(() => (data.value?.kind === 'redirect' ? data.value.slug : ''))
if (redirectTo.value) {
  await navigateTo(localePath(`/insights/${redirectTo.value}`), { redirectCode: 301, replace: true })
}

const payload = computed(() => (data.value?.kind === 'post' ? data.value : null))
const missing = computed(() => !formatAllowed.value || Boolean(error.value) || !payload.value)
const isPreview = computed(() => Boolean(payload.value?.preview))

if (missing.value && requestEvent) setResponseStatus(requestEvent, 404)

const post = computed(() => payload.value?.post ?? null)
const brands = computed(() => payload.value?.brands ?? [])
const view = computed(() => (post.value ? insightsPublicFassung(post.value, readerLocale.value) : null))
const toc = computed(() => (view.value ? markdownHeadings(view.value.body) : []))
const firstTopic = computed(() => {
  const key = post.value?.topics[0]
  return key ? { key, label: insightsTopicLabel(key) } : null
})

// ── Kopf ───────────────────────────────────────────────────────────────────

const pageTitle = computed(() => (missing.value
  ? t('insights.public.notFoundTitle')
  : view.value?.title ?? ''))

const pageDescription = computed(() => (missing.value
  ? t('insights.public.notFoundBody')
  : view.value?.dek ?? ''))

useSeoMeta({
  title: () => pageTitle.value,
  description: () => pageDescription.value,
  ogTitle: () => pageTitle.value,
  ogDescription: () => pageDescription.value,
  ogType: 'article',
  /**
   * `noindex` in DREI Fällen: die Seite gibt es nicht, die Vorschau ist
   * personengebunden — und eine Fassung, die nur als Rückfall dasteht, soll
   * nicht als eigene Sprachfassung indexiert werden (`follow` bleibt, die
   * LINKS darauf sind ja richtig).
   */
  robots: () => {
    if (missing.value || isPreview.value) return 'noindex, nofollow'
    return view.value?.fallback ? 'noindex, follow' : 'index, follow'
  },
})

/**
 * DAS VORSCHAUBILD — `/og/insights/<slug>.png`, ausgeliefert von der APP
 * (der Rasterizer lebt in `packages/themes`, und ein Produkt-Layer darf ihn
 * nicht kennen; CONCEPT A14). Eingetragen wird nur der PFAD; absolute URL,
 * Maße und `twitter:card` macht `useLocaleSeoHead()` im Core.
 *
 * KEIN BILD für 404 und Vorschau: beide tragen `noindex`, und ein og:image auf
 * eine Seite, die es nicht öffentlich gibt, wäre dieselbe Lüge im Kopf.
 */
const ogImage = useBrandOgImage()
const insightsOgImage = computed(() => {
  if (missing.value || isPreview.value) return null
  const path = insightsOgPath(slug.value)
  return path ? { path, width: 1200, height: 630, type: 'image/png' } : null
})
ogImage.value = insightsOgImage.value
watch(insightsOgImage, (value) => { ogImage.value = value })

/**
 * Die Sprache, die es hier NICHT gibt (s. Kopf) — leer, wenn beide da sind.
 * Zurückgesetzt wird der app-weite State im KERN (`useSeoHiddenLocales()`):
 * ein blindes Leeren beim Abräumen löschte den Eintrag der NEUEN Seite.
 */
useSeoHiddenLocales(() => {
  if (missing.value || !post.value || post.value.translationReviewed) return []
  return [post.value.baseLocale === 'de' ? 'en' : 'de']
})

onBeforeRouteLeave(() => { ogImage.value = null })
onUnmounted(() => { ogImage.value = null })

const jsonLd = computed(() => {
  const entry = post.value
  if (!entry || missing.value) return []
  return [{
    type: 'application/ld+json' as const,
    innerHTML: JSON.stringify([
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        'headline': view.value?.title ?? '',
        'description': view.value?.dek ?? '',
        'datePublished': entry.publishedAt,
        'dateModified': entry.reviewedAt || entry.publishedAt,
        'inLanguage': view.value?.locale ?? readerLocale.value,
        'author': { '@type': 'Organization', 'name': 'Branding Supply' },
        'publisher': { '@type': 'Organization', 'name': 'Branding Supply' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': [
          { '@type': 'ListItem', 'position': 1, 'name': 'Brand Insights', 'item': localePath('/insights') },
          { '@type': 'ListItem', 'position': 2, 'name': view.value?.title ?? '' },
        ],
      },
    ]).replace(/</g, '\\u003c'),
  }]
})

useHead({ script: jsonLd })

// ── Der eine Einstieg (Entscheidung 9): Artikel ⇒ Wizard ───────────────────

const { isLoggedIn } = useCurrentUser()
/**
 * Dasselbe Ziel wie auf der Startseite und in der Discover-Anatomie: der
 * Wizard-Einstieg hängt an der Anmeldung. Ein fester Pfad hierher wäre ein
 * dritter Weg in denselben Trichter.
 */
const startTarget = computed(() => localePath(isLoggedIn.value ? '/dashboard/brands/new' : '/invite'))
</script>

<template>
  <div class="mx-auto mt-10 max-w-7xl pb-16">
    <!-- 404: eigener Zustand mit dem Weg zurück (s. Kopf) -->
    <div v-if="missing" class="mx-auto mt-16 max-w-xl text-center" data-insights-missing>
      <UIcon name="i-ph-newspaper" class="size-10" style="color: var(--bw-muted)" />
      <h1 class="mt-6 text-3xl font-extralight tracking-tight">{{ t('insights.public.notFoundTitle') }}</h1>
      <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
        {{ t('insights.public.notFoundBody') }}
      </p>
      <UButton
        :to="localePath('/insights')" :label="t('insights.article.backToList')"
        icon="i-ph-arrow-left" class="mt-7 rounded-full" color="neutral"
      />
    </div>

    <div v-else-if="post && view">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <NuxtLink
          :to="localePath('/insights')" class="bw-label inline-flex items-center gap-1.5"
          style="color: var(--bw-muted)"
        >
          <UIcon name="i-ph-arrow-left" class="size-4" /> {{ t('insights.article.backToList') }}
        </NuxtLink>
        <span
          v-if="isPreview" class="bw-label rounded-full px-2.5 py-1"
          style="background: var(--bw-surface-hi)" data-insights-preview
        >{{ t('insights.public.previewBadge') }}</span>
      </div>

      <InArticle :post="post" :locale="readerLocale" :toc="toc" class="mt-6">
        <template #cta>
          <UButton :to="startTarget" :label="t('insights.public.ctaArticle')" icon="i-ph-plus" class="rounded-full" />
          <!-- Das erste Thema als zweiter, leiser Weg: von hier aus liest man
               weiter, ohne zurück in die volle Liste zu müssen. -->
          <UButton
            v-if="firstTopic"
            :to="localePath(`/topics/${firstTopic.key}`)" :label="firstTopic.label"
            color="neutral" variant="ghost" class="rounded-full" style="background: var(--bw-surface)"
          />
        </template>

        <!-- Der Fliesstext: DERSELBE Renderer wie überall im Repo, mit
             Sprungmarken an den Überschriften (Core-Baustein). -->
        <template #default>
          <MarkdownContent :source="view.body" heading-anchors class="mt-8 text-base" />
        </template>

        <!-- Erwähnte Marken: Name, Ring, und ein Link NUR, wenn es die
             Profil-Seite auch wirklich gibt (Riegel). -->
        <template #brands>
          <component
            :is="profileAllowed && brand.slug ? 'NuxtLink' : 'span'"
            v-for="brand in brands" :key="brand.id"
            :to="profileAllowed && brand.slug ? localePath(`/brands/${brand.slug}`) : undefined"
            class="bw-select-card flex items-center gap-2 rounded-full py-1.5 pl-4 pr-1.5 text-sm"
          >
            {{ brand.name }}
            <InScoreRing v-if="brand.score" :value="brand.score.score" :size="26" :label="String(brand.score.score)" />
          </component>
        </template>
      </InArticle>

      <!-- Der Newsletter am Ende des Stücks (I5a): wer bis hierher gelesen
           hat, ist der Leser, den der Eintrag meint. `source` trägt den Slug
           mit — die Zahl aus §9.7 sagt damit, WELCHES Stück Leser bringt. Die
           Komponente prüft ihren Riegel selbst. In der Vorschau steht sie
           nicht: ein Betreiber, der seinen Entwurf ansieht, soll sich nicht
           selbst eintragen können. -->
      <div v-if="!isPreview" class="mx-auto mt-14 max-w-3xl">
        <InNewsletterForm :source="`post:${slug}`" compact />
      </div>
    </div>
  </div>
</template>
