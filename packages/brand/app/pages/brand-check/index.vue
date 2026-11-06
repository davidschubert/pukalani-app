<script setup lang="ts">
import { BRAND_CHECK_CATEGORIES } from '../../../shared/brandCheck'
import { brandJsonLdScript } from '../../utils/brandJsonLd'

/**
 * DIE START-SEITE DES BRAND-CHECKS — `/brand-check`
 * (Konzept: docs/archiv/BRAND-CHECK-SEITE.md §1 und §2).
 *
 * Bis heute gab es unter `/brand-check` nur `[id].vue`; die Adresse selbst
 * antwortete 404, und das Formular lebte auf der Startseite der App. Jetzt
 * ist es umgekehrt: das Formular lebt GENAU EINMAL, hier, und die Startseite
 * verweist mit einem Teaser hierher (`BwBrandCheckTeaser`).
 *
 * ── DAS IST DIE SEO-SEITE DES INSTRUMENTS ─────────────────────────────────
 * Anders als die Ergebnisseite (`noindex`, sie urteilt über eine FREMDE
 * Website) will diese Seite gefunden werden: SSR, indexierbar, Titel und
 * Beschreibung mit den Worten, nach denen jemand sucht („Brand-Check",
 * „Markenauftritt prüfen", „Brand Score"), FAQ als sichtbarer Text UND als
 * FAQPage-JSON-LD.
 *
 * ── DIE ACHT KATEGORIEN KOMMEN AUS DEM KATALOG ────────────────────────────
 * `BRAND_CHECK_CATEGORIES` ist die Quelle für Reihenfolge UND Gewicht — eine
 * zweite, abgetippte Liste im Markup wäre spätestens beim ersten
 * Gewichts-Wechsel eine Lüge. Die Namen kommen aus denselben i18n-Schlüsseln
 * wie auf der Ergebnisseite (`brand.check.categories.*`).
 *
 * ── DER FAQ-INHALT STEHT IMMER IM MARKUP ──────────────────────────────────
 * `UAccordion` hängt seinen Inhalt normalerweise aus dem DOM, sobald er zu
 * ist — eine Suchmaschine liest kein Klick-Ereignis. `:unmount-on-hide="false"`
 * lässt ihn stehen (dieselbe Haltung wie das handgebaute FAQ auf /about, nur
 * mit der Nuxt-UI-Komponente statt einem eigenen Klapp-Mechanismus).
 *
 * ── JSON-LD LIEGT IM LAYER, NICHT IN DER APP ──────────────────────────────
 * `apps/branding/app/utils/jsonLd.ts` gehört den App-Seiten; eine Layer-Seite
 * darf sich nicht auf eine Datei ihres Wirts stützen (A14). Deshalb die
 * eigene, gleichlautende Fassung `../../utils/brandJsonLd`.
 */
definePageMeta({ layout: 'default' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { isLoggedIn } = useCurrentUser()

useSeoMeta({
  title: () => t('brand.checkPage.seoTitle'),
  description: () => t('brand.checkPage.seoDescription'),
  ogTitle: () => t('brand.checkPage.hero.title'),
  ogDescription: () => t('brand.checkPage.seoDescription'),
})

const FAQ_IDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const

useHead({
  script: computed(() => [brandJsonLdScript({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        'name': t('brand.checkPage.seoTitle'),
        'description': t('brand.checkPage.seoDescription'),
        'inLanguage': locale.value,
      },
      {
        '@type': 'FAQPage',
        'inLanguage': locale.value,
        'mainEntity': FAQ_IDS.map(id => ({
          '@type': 'Question',
          'name': t(`brand.checkPage.faq.${id}Q`),
          'acceptedAnswer': { '@type': 'Answer', 'text': t(`brand.checkPage.faq.${id}A`) },
        })),
      },
    ],
  })]),
})

/** Die acht Kategorien mit Gewicht — Reihenfolge und Zahl aus dem Katalog. */
const categories = computed(() => BRAND_CHECK_CATEGORIES.map(category => ({
  key: category.key,
  weight: category.weight,
  label: t(`brand.check.categories.${category.key}`),
})))

const WHAT_FACTS = ['f1', 'f2', 'f3'] as const
const VALUES = ['v1', 'v2', 'v3'] as const
/** Das Ranking steht seit P3; Vergleich (P4) und Verlauf (P5) sind angekündigt. */
const FEATURES = [
  { key: 'f1', icon: 'i-ph-clock-counter-clockwise', soon: false },
  { key: 'f2', icon: 'i-ph-list-numbers', soon: false },
  { key: 'f3', icon: 'i-ph-columns', soon: false },
  { key: 'f4', icon: 'i-ph-chart-line-up', soon: true },
] as const

/** Dieselbe Weiche wie auf der Ergebnisseite und der Startseite. */
const relaunchTarget = computed(() => (isLoggedIn.value
  ? localePath({ path: '/dashboard/brands/new', query: { path: 'relaunch' } })
  : localePath('/invite')))

const faqItems = computed(() => FAQ_IDS.map(id => ({
  value: id,
  label: t(`brand.checkPage.faq.${id}Q`),
  content: t(`brand.checkPage.faq.${id}A`),
})))
</script>

<template>
  <div class="pb-10">
    <div class="@container mx-auto max-w-7xl">
      <!-- 0 · Die Reiter des Instruments -->
      <div class="mt-10">
        <BwBrandCheckTabs current="start" />
      </div>

      <!-- 1 · Hero mit dem EINEN Formular -->
      <section class="bw-card mt-8 grid items-center gap-10 p-10 @lg:grid-cols-[minmax(0,1fr)_24rem] @lg:p-14" data-check-hero>
        <div class="min-w-0">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('brand.checkPage.hero.eyebrow') }}</p>
          <h1 class="mt-4 max-w-xl text-balance text-5xl font-extralight leading-tight tracking-tight sm:text-6xl">
            {{ t('brand.checkPage.hero.title') }}
          </h1>
          <p class="mt-5 max-w-lg text-lg leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkPage.hero.lead') }}</p>
        </div>
        <BwBrandCheckForm source="check-page" />
      </section>

      <!-- 2 · Was der Check ist -->
      <section class="mt-24" data-check-what>
        <div class="mx-auto max-w-3xl text-center">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('brand.checkPage.what.eyebrow') }}</p>
          <h2 class="mt-3 text-balance text-3xl font-extralight tracking-tight sm:text-4xl">{{ t('brand.checkPage.what.title') }}</h2>
          <p class="mx-auto mt-5 max-w-2xl text-base leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkPage.what.body') }}</p>
          <p class="bw-label mx-auto mt-4 max-w-2xl leading-relaxed" style="color: var(--bw-muted)">{{ t('brand.checkPage.what.honest') }}</p>
        </div>
        <div class="mt-10 grid gap-6 @md:grid-cols-3">
          <div v-for="fact in WHAT_FACTS" :key="fact" class="bw-card p-8">
            <p class="text-2xl font-extralight tracking-tight">{{ t(`brand.checkPage.what.${fact}Label`) }}</p>
            <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t(`brand.checkPage.what.${fact}Body`) }}</p>
          </div>
        </div>
      </section>

      <!-- 3 · Warum es ihn gibt -->
      <section class="bw-card mt-24 p-10 sm:p-14" data-check-why>
        <div class="mx-auto max-w-3xl">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('brand.checkPage.why.eyebrow') }}</p>
          <h2 class="mt-3 text-balance text-3xl font-extralight leading-snug tracking-tight sm:text-4xl">{{ t('brand.checkPage.why.title') }}</h2>
          <p class="mt-6 text-base leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkPage.why.body1') }}</p>
          <p class="mt-4 text-base leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkPage.why.body2') }}</p>
        </div>
      </section>

      <!-- 4 · Was ihr davon habt -->
      <section class="mt-24" data-check-value>
        <div class="mx-auto max-w-3xl text-center">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('brand.checkPage.value.eyebrow') }}</p>
          <h2 class="mt-3 text-balance text-3xl font-extralight tracking-tight sm:text-4xl">{{ t('brand.checkPage.value.title') }}</h2>
        </div>
        <div class="mt-10 grid gap-6 @md:grid-cols-3">
          <div v-for="value in VALUES" :key="value" class="bw-card p-8">
            <h3 class="text-lg font-medium tracking-tight">{{ t(`brand.checkPage.value.${value}Title`) }}</h3>
            <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t(`brand.checkPage.value.${value}Body`) }}</p>
          </div>
        </div>
      </section>

      <!-- 5 · Worauf er aufbaut: die acht Kategorien mit ihrem Gewicht -->
      <section class="bw-card mt-24 p-10 sm:p-14" data-check-basis>
        <div class="mx-auto max-w-3xl text-center">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('brand.checkPage.basis.eyebrow') }}</p>
          <h2 class="mt-3 text-balance text-3xl font-extralight tracking-tight sm:text-4xl">{{ t('brand.checkPage.basis.title') }}</h2>
          <p class="mx-auto mt-4 max-w-xl text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkPage.basis.lead') }}</p>
        </div>
        <ul class="mx-auto mt-10 max-w-3xl space-y-5">
          <li v-for="category in categories" :key="category.key">
            <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p class="font-medium tracking-tight">{{ category.label }}</p>
              <p class="bw-label" style="color: var(--bw-muted)">{{ t('brand.checkPage.basis.weight', { weight: category.weight }) }}</p>
            </div>
            <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full" style="background: var(--bw-line)">
              <div class="h-full rounded-full" :style="`inline-size: ${category.weight}%; background: var(--bw-accent)`" />
            </div>
          </li>
        </ul>
        <p class="mx-auto mt-10 max-w-3xl text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkPage.basis.note') }}</p>
        <p class="bw-label mx-auto mt-3 max-w-3xl leading-relaxed" style="color: var(--bw-muted)">{{ t('brand.checkPage.basis.lockedNote') }}</p>
        <!-- Der Weg in die volle Rechnung (BS1 R2a). Er steht GENAU hier, wo
             die Gewichte stehen: wer sich für die Zahlen interessiert, ist an
             dieser Stelle der Seite und nirgends sonst. -->
        <p class="mx-auto mt-6 max-w-3xl">
          <ULink :to="localePath('/brand-check/methodik')" class="text-sm underline underline-offset-4" data-check-method>
            {{ t('brand.checkMethod.title') }}
          </ULink>
        </p>
      </section>

      <!-- 6 · Features rund um den Check -->
      <section class="mt-24" data-check-features>
        <div class="mx-auto max-w-3xl text-center">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('brand.checkPage.features.eyebrow') }}</p>
          <h2 class="mt-3 text-balance text-3xl font-extralight tracking-tight sm:text-4xl">{{ t('brand.checkPage.features.title') }}</h2>
        </div>
        <div class="mt-10 grid gap-6 @sm:grid-cols-2 @lg:grid-cols-4">
          <div v-for="feature in FEATURES" :key="feature.key" class="bw-card p-8">
            <UIcon :name="feature.icon" class="size-5" style="color: var(--bw-ink-soft)" />
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <p class="font-medium tracking-tight">{{ t(`brand.checkPage.features.${feature.key}Label`) }}</p>
              <span
                v-if="feature.soon" class="bw-label rounded-full px-2 py-0.5"
                style="background: var(--bw-surface-hi); color: var(--bw-muted)"
              >{{ t('brand.checkPage.tabs.soon') }}</span>
            </div>
            <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t(`brand.checkPage.features.${feature.key}Body`) }}</p>
          </div>
        </div>
      </section>

      <!-- 7 · Und dann? -->
      <section class="bw-card mt-24 px-8 py-14 text-center sm:py-16" data-check-next>
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('brand.checkPage.next.eyebrow') }}</p>
        <h2 class="mx-auto mt-3 max-w-2xl text-balance text-3xl font-medium tracking-tight sm:text-4xl">{{ t('brand.checkPage.next.title') }}</h2>
        <p class="mx-auto mt-4 max-w-xl text-base leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkPage.next.body') }}</p>
        <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
          <UButton
            :label="t('brand.checkPage.next.cta')" :to="relaunchTarget" size="lg"
            color="neutral" class="rounded-full" data-check-relaunch
          />
          <UButton
            v-if="isLoggedIn" :label="t('brand.checkPage.next.brands')" :to="localePath('/dashboard/brands')"
            size="lg" color="neutral" variant="ghost" class="rounded-full" data-check-brands
          />
        </div>
        <p v-if="isLoggedIn" class="bw-label mx-auto mt-6 max-w-xl" style="color: var(--bw-muted)">{{ t('brand.checkPage.next.brandsHint') }}</p>
      </section>

      <!-- 8 · FAQ (sichtbar UND als FAQPage-JSON-LD, s. Kopf) -->
      <section class="mt-24" data-check-faq>
        <div class="mx-auto max-w-3xl text-center">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('brand.checkPage.faq.eyebrow') }}</p>
          <h2 class="mt-3 text-balance text-3xl font-extralight tracking-tight sm:text-4xl">{{ t('brand.checkPage.faq.title') }}</h2>
        </div>
        <UAccordion
          :items="faqItems" :unmount-on-hide="false" class="mx-auto mt-10 max-w-3xl"
          :ui="{ item: 'border-(--bw-line)', trigger: 'text-lg font-medium tracking-tight', body: 'text-sm leading-relaxed text-(--bw-ink-soft)' }"
        />
      </section>
    </div>
  </div>
</template>
