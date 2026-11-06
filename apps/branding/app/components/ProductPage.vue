<script setup lang="ts">
import { formatDerivationPrice } from '../utils/productPricing'

/**
 * DER RAHMEN JEDER PRODUKTSEITE (PS1, Plan docs/plans/PRODUCTS-SEITE.md §4).
 *
 * ── WARUM EIN BAUTEIL UND NICHT FÜNF SEITEN ───────────────────────────────
 * Die fünf Produktseiten haben denselben Aufbau — Hero · „Was ihr bekommt" ·
 * „So funktioniert es" · Beleg · Preis-Zeile mit CTA und Voraussetzung. Fünf
 * Kopien desselben Markups wären fünf Orte, an denen eine Korrektur an der
 * Optik stimmen muss, und der fünfte ist der, den man vergisst. Die SEITE
 * bleibt trotzdem eine Seite: sie bringt ihre Route (`defineI18nRoute`), ihre
 * Fakten und ihr CTA-Ziel selbst mit.
 *
 * ── DIE TEXTE KOMMEN ÜBER EIN PRÄFIX, NICHT ÜBER ZWANZIG PROPS ────────────
 * `prefix` ist der i18n-Ast dieses Produkts (`products.brandCheck`, …); alles
 * Übrige darunter liegt an FESTEN Namen (`title`, `lead`, `get1Title`, …).
 * Zwanzig Text-Props durchzureichen hieße, jeden Text zweimal zu schreiben —
 * einmal in der Locale-Datei und einmal in der Seite. Die gemeinsamen
 * Überschriften („Was ihr bekommt") stehen EINMAL unter `products.common.*`:
 * sie gehören dem Rahmen, nicht dem Produkt.
 *
 * ── DER PREIS IST EIN PLATZHALTER, KEINE ZEICHENKETTE ─────────────────────
 * `t(<prefix>.price, { price })` — der Betrag lebt als EINE Konstante in
 * `shared/productPricing.ts` und wird je Sprache formatiert. Drei der fünf
 * Zeilen nennen gar keinen Betrag; ein ungenutzter Parameter stört vue-i18n
 * nicht, und die Alternative wären zwei Preis-Zeilen-Arten mit zwei Zweigen.
 *
 * ── SEO STEHT HIER, DAS SPRACH-ROUTING IN DER SEITE ───────────────────────
 * `useSeoMeta` läuft in einem Bauteil genauso wie in einer Seite (unhead
 * kennt den Unterschied nicht) — der Titel folgt demselben Präfix wie der
 * Rest. `defineI18nRoute` ist dagegen ein MAKRO und muss in der Seitendatei
 * stehen; hier wäre es wirkungslos. `useLocaleSeoHead()` bleibt unangetastet
 * in `app.vue` (hreflang/canonical/og:url für die ganze Site).
 */
const props = withDefaults(defineProps<{
  /** i18n-Ast dieses Produkts, z. B. `products.brandCheck` */
  prefix: string
  /** Icon des Produkts (i-ph-…) — im Hero neben der Ebene */
  icon: string
  /** Wie viele „Was ihr bekommt"-Punkte die Locale-Datei hergibt */
  benefits?: number
  /** Wie viele Schritte „So funktioniert es" hat */
  steps?: number
  /** Beleg-Links: Pfad OHNE Sprach-Präfix + i18n-Suffix unter `prefix` */
  proofLinks?: Array<{ to: string, key: string }>
  /** Ziel des primären CTA, Pfad OHNE Sprach-Präfix */
  ctaTo: string
}>(), {
  benefits: 4,
  steps: 3,
  proofLinks: () => [],
})

const { t, locale } = useI18n()
const localePath = useLocalePath()

const price = computed(() => formatDerivationPrice(locale.value))
const benefitIds = computed(() => Array.from({ length: props.benefits }, (_, i) => i + 1))
const stepIds = computed(() => Array.from({ length: props.steps }, (_, i) => i + 1))

useSeoMeta({
  title: () => t(`${props.prefix}.seoTitle`),
  description: () => t(`${props.prefix}.seoDescription`, { price: price.value }),
  ogTitle: () => t(`${props.prefix}.title`),
  ogDescription: () => t(`${props.prefix}.seoDescription`, { price: price.value }),
})
</script>

<template>
  <div class="pb-10">
    <div class="@container mx-auto max-w-7xl">
      <!-- 1 · Hero: Ebene, Name, ein Satz, der eine Knopf -->
      <section class="mt-14">
        <div class="mx-auto max-w-3xl text-center">
          <p class="bw-label flex items-center justify-center gap-2 uppercase tracking-widest" style="color: var(--bw-muted)">
            <UIcon :name="icon" class="size-4" />
            {{ t(`${prefix}.level`) }} · {{ t('products.common.eyebrow') }}
          </p>
          <h1 class="mt-4 text-balance text-5xl font-extralight leading-tight tracking-tight sm:text-6xl">{{ t(`${prefix}.title`) }}</h1>
          <p class="mx-auto mt-6 max-w-2xl text-lg leading-relaxed" style="color: var(--bw-ink-soft)">{{ t(`${prefix}.lead`) }}</p>
          <div class="mt-9 flex flex-wrap items-center justify-center gap-3">
            <UButton :label="t(`${prefix}.cta`)" :to="localePath(ctaTo)" size="lg" color="neutral" class="rounded-full" />
            <UButton
              :label="t('products.common.allProducts')" :to="localePath('/products')"
              size="lg" color="neutral" variant="ghost" class="rounded-full"
            />
          </div>
        </div>
      </section>

      <!-- 2 · Was ihr bekommt -->
      <section class="mt-24">
        <h2 class="text-center text-balance text-3xl font-extralight tracking-tight sm:text-4xl">{{ t('products.common.getTitle') }}</h2>
        <div class="mt-10 grid gap-6 @sm:grid-cols-2">
          <div v-for="n in benefitIds" :key="`get-${n}`" class="bw-card p-8">
            <UIcon name="i-ph-check" class="size-5" style="color: var(--bw-accent)" />
            <h3 class="mt-3 text-lg font-medium tracking-tight">{{ t(`${prefix}.get${n}Title`) }}</h3>
            <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t(`${prefix}.get${n}Body`) }}</p>
          </div>
        </div>
      </section>

      <!-- 3 · So funktioniert es -->
      <section class="mt-24">
        <h2 class="text-center text-balance text-3xl font-extralight tracking-tight sm:text-4xl">{{ t('products.common.howTitle') }}</h2>
        <div class="mt-10 grid gap-6 @md:grid-cols-3">
          <div v-for="n in stepIds" :key="`how-${n}`" class="bw-card p-8">
            <p class="bw-label" style="color: var(--bw-muted)">{{ `0${n}` }}</p>
            <h3 class="mt-2 text-lg font-medium tracking-tight">{{ t(`${prefix}.how${n}Title`) }}</h3>
            <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t(`${prefix}.how${n}Body`) }}</p>
          </div>
        </div>
      </section>

      <!-- 4 · Beleg: ein echtes Ziel, keine Behauptung -->
      <section class="bw-card mt-24 p-10 @lg:p-14">
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('products.common.proofEyebrow') }}</p>
        <h2 class="mt-3 max-w-2xl text-balance text-3xl font-extralight tracking-tight sm:text-4xl">{{ t(`${prefix}.proofTitle`) }}</h2>
        <p class="mt-5 max-w-2xl text-base leading-relaxed" style="color: var(--bw-ink-soft)">{{ t(`${prefix}.proofBody`) }}</p>
        <div v-if="proofLinks.length" class="mt-7 flex flex-wrap items-center gap-3">
          <UButton
            v-for="link in proofLinks" :key="link.key"
            :label="t(`${prefix}.${link.key}`)" :to="localePath(link.to)"
            size="lg" color="neutral" variant="soft" trailing-icon="i-ph-arrow-right" class="rounded-full"
          />
        </div>
      </section>

      <!-- 5 · Preis-Zeile, CTA und Voraussetzung — genau EINE Aussage je Produkt -->
      <ProductPriceLine
        :price-text="t(`${prefix}.price`, { price })"
        :requirement="t(`${prefix}.requirement`)"
        :cta-label="t(`${prefix}.cta`)"
        :cta-to="ctaTo"
        class="mt-24"
      />
    </div>
  </div>
</template>
