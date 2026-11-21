<script setup lang="ts">
// SEO-Vergleichsseiten (§3.1): /vs/circle · /vs/skool · /vs/mighty-networks
// (EN unter /vs/*, DE unter /de/vs/* — prefix_except_default). Long-Tail-
// Abwerbe-Keywords, ehrlich: jede Seite sagt AUCH, wann der Wettbewerber die
// bessere Wahl ist. Die Vergleichstabelle ist bewusst dieselbe Komponente wie
// auf der Startseite (eine Quelle, ein Stand-Datum, dieselben Quellen-Links).
import { VS_SLUGS } from '#shared/marketing'

definePageMeta({ layout: 'site' })

// Slug-Katalog aus shared/: dieselbe Liste baut die Sitemap
// (server/utils/marketingRoutes.ts) — eine eigene Kopie hier hieße, eine neue
// Vergleichsseite existiert, steht aber in keiner Sitemap (oder umgekehrt).
const route = useRoute()
const slug = String(route.params.slug)
if (!VS_SLUGS.includes(slug as (typeof VS_SLUGS)[number])) {
  throw createError({ status: 404, statusText: 'Page not found' })
}

const { t } = useI18n()
const localePath = useLocalePath()
const { start, demo } = useProductLinks()
useReveal()

const base = `marketing.vs.items.${slug}`
const name = computed(() => t(`${base}.name`))

/**
 * Der Branding-Block (U17, Benchmark K2/V3). Zwei Bausteine, von denen je
 * nach Anbieter EINER leer sein darf — und genau das ist der Punkt:
 *
 * - `quote` ist ein WÖRTLICHES Rezensions-Zitat mit Name und Datum. Für Skool
 *   steht im Benchmark kein solches Zitat (nur ein Halbsatz ohne Herkunft),
 *   also steht dort keins — lieber eine Lücke als ein Beleg, der keiner ist.
 * - `line` ist eine belegte TATSACHE von der Preisseite des Anbieters. Für
 *   Mighty Networks gibt der Benchmark zum Branding keine her, also fehlt sie
 *   dort.
 *
 * Zitate laufen bewusst NICHT durch die Übersetzung: sie stehen in beiden
 * Sprachen im englischen Original. Übersetzt ist nur der Rahmen.
 */
const brandingQuote = computed(() => t(`${base}.branding.quote`))
const brandingLine = computed(() => t(`${base}.branding.line`))
const brandingSource = computed(() => t(`${base}.branding.source`))

const ctaLinks = computed(() => [
  { to: start, color: 'primary' as const, size: 'xl' as const, label: t('marketing.hero.ctaPrimary') },
  {
    to: demo,
    color: 'neutral' as const,
    variant: 'ghost' as const,
    size: 'xl' as const,
    icon: 'i-ph-play-circle',
    label: t('marketing.hero.ctaSecondary'),
  },
])

useMarketingSeo({
  titleKey: `${base}.metaTitle`,
  descriptionKey: `${base}.metaDescription`,
  image: `vs-${slug}`,
})
</script>

<template>
  <div class="vs-page">
    <UPageHero
      as="section"
      class="tone-mist [--mkt-hero-title:clamp(2rem,5vw,3.2rem)]"
      :title="t(`${base}.title`)"
      :ui="{ title: 'leading-[1.05]', description: 'max-w-none' }"
    >
      <template #top>
        <div class="vs-puka puka-glow" data-parallax="0.1" aria-hidden="true" />
      </template>
      <!-- Diese Seite führt OHNE Kicker — der Augenbrauen-Bereich trägt nur
           den Zurück-Link (gleiches Muster wie auf allen Unterseiten). -->
      <template #headline>
        <UButton
          :to="localePath('/')" variant="link" color="neutral" size="sm"
          icon="i-ph-arrow-left-bold"
          class="mb-3 px-0 font-semibold text-toned hover:text-primary-600"
          :label="t('marketing.vs.backHome')"
        />
      </template>
      <!-- Farbige Unterzeile + Lead in EINEM Slot (Begründung wie auf den
           Produktseiten: zwischen Titel und Beschreibung gibt es keinen Slot). -->
      <template #description>
        <p class="mb-5 font-semibold text-primary-600">{{ t(`${base}.sub`) }}</p>
        <p class="max-w-[44rem]">{{ t(`${base}.intro`) }}</p>
      </template>
    </UPageHero>

    <!-- dieselbe Tabelle wie auf der Startseite: ein Stand, eine Wahrheit -->
    <ComparisonSection />

    <!-- Der Rechner steht NACH der Tabelle: die Tabelle sagt „2 %", der
         Rechner sagt, was 2 % bei DIESER Community heißen. Die Zeile des
         Anbieters, um den es hier geht, ist hervorgehoben. -->
    <FeeCalculator :highlight="slug" />

    <section class="mkt-section tone-dawn-hold">
      <div class="mkt-inner mkt-narrow" data-reveal>
        <h2 class="mkt-h2">{{ t('marketing.vs.brandingTitle') }}</h2>
        <!-- Zitat als <blockquote> mit <cite>: das ist die Bauform, die eine
             Vorlesehilfe als fremde Rede ansagt — und die einzige, in der die
             Quelle am Zitat klebt statt daneben zu liegen. -->
        <figure v-if="brandingQuote" class="vs-quote">
          <blockquote>{{ brandingQuote }}</blockquote>
          <figcaption><cite>{{ brandingSource }}</cite></figcaption>
        </figure>
        <p v-if="brandingLine" class="vs-fact">{{ brandingLine }}</p>
        <p v-if="brandingLine && !brandingQuote" class="vs-source">{{ brandingSource }}</p>
        <p class="vs-fact">{{ t('marketing.vs.brandingFact') }}</p>
        <UAlert
          color="primary" variant="subtle" icon="i-ph-paint-brush-bold"
          :description="t('marketing.vs.brandingUs')"
          class="mt-6"
          :ui="{ description: 'text-base/relaxed opacity-100' }"
        />
        <p class="vs-source">{{ t('marketing.vs.brandingAsOf') }}</p>
      </div>
    </section>

    <section class="mkt-section tone-dawn-hold">
      <UPageGrid as="div" class="mkt-inner mkt-narrow gap-5 sm:grid-cols-1 lg:grid-cols-2" data-reveal>
        <UPageCard as="article" :description="t(`${base}.whenThem`)">
          <template #title>
            <h2>{{ t('marketing.vs.whenThemTitle', { name }) }}</h2>
          </template>
        </UPageCard>
        <!-- „Wann wir" war schon vorher die betonte Karte (Akzentkante
             links) — in Nuxt UI ist das `highlight`. -->
        <UPageCard as="article" highlight :description="t(`${base}.whenUs`)">
          <template #title>
            <h2>{{ t('marketing.vs.whenUsTitle') }}</h2>
          </template>
        </UPageCard>
      </UPageGrid>
    </section>

    <UPageCTA
      as="section"
      class="tone-ink"
      :description="t('marketing.vs.ctaLead')"
      :links="ctaLinks"
    >
      <template #title>
        <PukaMark :size="38" class="mx-auto mb-3.5 block" />
        {{ t('marketing.vs.ctaTitle') }}
      </template>
    </UPageCTA>
  </div>
</template>

<style scoped>
/* Nur noch das Bildmotiv — Rhythmus und Typografie von Kopf und Schluss
   kommen aus den `pageHero`-/`pageCTA`-Verträgen in app/app.config.ts. */
.vs-puka {
  top: -16rem;
  right: -12rem;
  width: 34rem;
  height: 34rem;
  opacity: 0.6;
}

/* Das Zitat trägt eine Akzentkante links — dieselbe Geste wie die
   hervorgehobene `UPageCard` weiter unten, damit fremde Rede optisch als
   eingelegtes Zitat lesbar ist und nicht als unser eigener Satz. */
.vs-quote {
  margin-top: 1.75rem;
  border-left: 3px solid var(--ui-color-primary-500);
  padding-left: 1.1rem;
}
.vs-quote blockquote {
  font-size: var(--text-lg);
  line-height: 1.6;
  font-style: italic;
  color: hsl(var(--puka-ink));
}
.vs-quote figcaption {
  margin-top: 0.55rem;
  font-size: var(--text-sm);
  color: hsl(var(--puka-ink-soft) / 0.85);
}
.vs-quote cite { font-style: normal; }
.vs-fact {
  margin-top: 1.1rem;
  font-size: var(--text-base);
  color: hsl(var(--puka-ink-soft));
}
.vs-source {
  margin-top: 0.7rem;
  font-size: var(--text-sm);
  color: hsl(var(--puka-ink-soft) / 0.8);
}
</style>
