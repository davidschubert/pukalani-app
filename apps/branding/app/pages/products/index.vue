<script setup lang="ts">
/**
 * DIE PRODUKT-ÜBERSICHT (PS1, Plan docs/plans/PRODUCTS-SEITE.md §3).
 *
 * ── DIE REIHENFOLGE IST DER KUNDENWEG, NICHT DIE KARTE ────────────────────
 * Brand-Check (Audit) → Brand Foundation (Build) → Marktvergleich (Compare) →
 * Brand Design (Build) → Book & Kit (Supply). Foundation steht VOR dem
 * Marktvergleich, obwohl Compare in der Ebenen-Karte vor Build kommt: der
 * Marktvergleich setzt eine abgenommene Foundation voraus (`requires:
 * ['brand']`) — die Seite zeigt den Weg, den ein Kunde wirklich gehen kann.
 *
 * ── DIE ZWEI „KOMMT"-KARTEN (Davids Entscheidung a, 2026-09-09) ───────────
 * Brand Experience und Brand Monitoring stehen abgeblendet und OHNE Link am
 * Ende: die volle Suite bleibt sichtbar, ohne Seite und ohne Datum. Sie
 * bekommen keine Produktseite und keinen Nav-Eintrag — ein Menüpunkt ins
 * Leere ist genau der 404 aus Davids Audit vom 2026-09-03. „Brand Insights"
 * fehlt hier bewusst: das ist Redaktion, kein Produkt.
 *
 * ── bw-card STATT UPageCard ───────────────────────────────────────────────
 * Diese Site hat eine eigene Optik (`bw-*` plus Tokens als Inline-Style), und
 * Startseite, About und Team sind ihr Maßstab. Ein `UPageCard` brächte seine
 * eigenen Farben und Radien mit und stünde als einziges Nuxt-UI-Bauteil
 * zwischen lauter bw-Karten — die Vorlage schlägt hier die Bequemlichkeit.
 * Die Nuxt-UI-Bauteile bleiben, wo sie ohnehin schon stehen: Knöpfe, Icons.
 */
import { jsonLdScript } from '../../utils/jsonLd'
import { formatDerivationPrice } from '../../utils/productPricing'

defineI18nRoute({
  paths: {
    en: '/products',
    de: '/produkte',
  },
})

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { isLoggedIn } = useCurrentUser()

/**
 * Der Betrag reist als `{price}`-Platzhalter in die Kurz-Preiszeile — zwei der
 * fünf Karten nennen ihn (Marktvergleich, und Book & Kit über denselben
 * Einmalpreis). Die drei anderen Zeilen haben keinen Platzhalter; ein
 * ungenutzter Parameter stört vue-i18n nicht und erspart einen Zweig.
 */
const price = computed(() => formatDerivationPrice(locale.value))

useSeoMeta({
  title: () => t('products.overview.seoTitle'),
  description: () => t('products.overview.seoDescription'),
  ogTitle: () => t('products.overview.title'),
  ogDescription: () => t('products.overview.seoDescription'),
})

/**
 * ItemList als JSON-LD — dieselben Namen und Ziele wie auf der Seite, damit
 * eine Suchmaschine die fünf Produktseiten als ZUSAMMENGEHÖRIG liest und nicht
 * als fünf verstreute Unterseiten. Die zwei „kommt"-Karten stehen bewusst
 * NICHT darin: sie haben kein Ziel.
 */
const products = [
  { key: 'brandCheck', icon: 'i-ph-gauge', to: '/products/brand-check' },
  { key: 'brandFoundation', icon: 'i-ph-compass', to: '/products/brand-foundation' },
  { key: 'marketComparison', icon: 'i-ph-scales', to: '/products/market-comparison' },
  { key: 'brandDesign', icon: 'i-ph-palette', to: '/products/brand-design' },
  { key: 'brandBookKit', icon: 'i-ph-package', to: '/products/brand-book-kit' },
] as const

const coming = [
  { key: 'brandExperience', icon: 'i-ph-broadcast' },
  { key: 'brandMonitoring', icon: 'i-ph-binoculars' },
] as const

useHead({
  script: computed(() => [jsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'name': t('products.overview.title'),
    'inLanguage': locale.value,
    'itemListElement': products.map((product, index) => ({
      '@type': 'ListItem',
      'position': index + 1,
      'name': t(`products.${product.key}.title`),
      'url': `https://branding.supply${localePath(product.to)}`,
    })),
  })]),
})
</script>

<template>
  <div class="pb-10">
    <div class="@container mx-auto max-w-7xl">
      <!-- 1 · Kopf: die Karte in einem Satz -->
      <section class="mt-14">
        <div class="mx-auto max-w-3xl text-center">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('products.common.eyebrow') }}</p>
          <h1 class="mt-4 text-balance text-5xl font-extralight leading-tight tracking-tight sm:text-6xl">{{ t('products.overview.title') }}</h1>
          <p class="mx-auto mt-6 max-w-2xl text-lg leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('products.overview.lead') }}</p>
        </div>
      </section>

      <!-- 2 · Die fünf Produkte, in der Reihenfolge des Kundenwegs -->
      <section class="mt-16">
        <div class="grid gap-6 @sm:grid-cols-2 @lg:grid-cols-3">
          <NuxtLink
            v-for="product in products" :key="product.key"
            :to="localePath(product.to)" class="bw-card bw-card--hover flex flex-col p-8"
          >
            <UIcon :name="product.icon" class="size-6" style="color: var(--bw-ink-soft)" />
            <p class="bw-label mt-5 uppercase tracking-widest" style="color: var(--bw-muted)">{{ t(`products.${product.key}.level`) }}</p>
            <h2 class="mt-2 text-xl font-medium tracking-tight">{{ t(`products.${product.key}.title`) }}</h2>
            <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t(`products.${product.key}.short`) }}</p>
            <p class="bw-label mt-auto pt-6" style="color: var(--bw-muted)">{{ t(`products.${product.key}.priceShort`, { price }) }}</p>
            <p class="bw-label mt-3 inline-flex items-center gap-1.5">
              {{ t('products.common.more') }}
              <UIcon name="i-ph-arrow-right" class="size-3.5" />
            </p>
          </NuxtLink>

          <!-- 3 · Was kommt: sichtbar, abgeblendet, ohne Link und ohne Datum -->
          <div
            v-for="item in coming" :key="item.key"
            class="bw-card flex flex-col p-8" style="opacity: 0.55"
          >
            <UIcon :name="item.icon" class="size-6" style="color: var(--bw-muted)" />
            <div class="mt-5 flex items-center justify-between gap-3">
              <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t(`products.${item.key}.level`) }}</p>
              <span class="bw-label rounded-full px-2.5 py-1" style="background: var(--bw-surface-hi); color: var(--bw-muted)">{{ t('products.common.coming') }}</span>
            </div>
            <h2 class="mt-2 text-xl font-medium tracking-tight">{{ t(`products.${item.key}.title`) }}</h2>
            <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t(`products.${item.key}.short`) }}</p>
          </div>
        </div>
      </section>

      <!-- 4 · Abschluss-CTA — dieselben zwei Wege wie auf der Startseite -->
      <section class="bw-card mt-24 px-8 py-14 text-center sm:py-16">
        <h2 class="mx-auto max-w-2xl text-balance text-3xl font-medium tracking-tight sm:text-4xl">{{ t('products.overview.ctaTitle') }}</h2>
        <p class="mx-auto mt-4 max-w-xl text-base leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('products.overview.ctaBody') }}</p>
        <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
          <UButton
            :label="isLoggedIn ? t('home.cta.brands') : t('home.ctaStart')"
            :to="localePath(isLoggedIn ? '/dashboard/brands' : '/invite')"
            size="lg" icon="i-ph-plus" color="neutral" class="rounded-full"
          />
          <UButton
            :label="t('products.overview.ctaCall')" :to="localePath('/erstgespraech')"
            size="lg" color="neutral" variant="ghost" class="rounded-full"
          />
        </div>
      </section>
    </div>
  </div>
</template>
