<script setup lang="ts">
import { jsonLdScript } from '../utils/jsonLd'

/**
 * DIE STARTSEITE VON branding.supply — der Conversion-Einstieg nach dem
 * abgenommenen Klickdummy (`packages/brand/.playground/app/pages/start.vue`,
 * Runden 137–148, Perplexity-Muster; Davids Go 2026-09-04 „mach mit der
 * startseite weiter").
 *
 * ── DER AUFBAU DES DUMMYS, ÜBERNOMMEN ─────────────────────────────────────
 *   1. Hero-Split: Versprechen + NUR die zwei Weiche-Optionen (Runde 148 —
 *      der Brand-Check wird unten beworben) · rechts „George bei der Arbeit"
 *   2. Artefakte „Was am Ende auf dem Tisch liegt" — jede Karte trägt einen
 *      kleinen visuellen Beweis (Runde 140: zeigen statt beschreiben)
 *   3. Beispiel-Branding „Kailua Coffee Co." — der Beweis zu 2
 *   4. Fähigkeiten „Mehr als ein Generator"
 *   5. Brand-Check als Lead-Magnet
 *   6. Abschluss-CTA
 *
 * ── DAS BEISPIEL-BRANDING IST SEIT PAKET G5 (2026-09-07) ZURÜCK ───────────
 * Davids 404-Audit (2026-09-03) hatte es entfernt, weil die Kachel auf einen
 * Klickdummy-Pfad zeigte (`/brand/demo/beispiel`); dann gab es mit
 * `/beispiel/kailua-coffee` eine redaktionelle Zweitfassung derselben Marke.
 * SEIT DISCOVER D5 IST DAS ORIGINAL ÖFFENTLICH: die Anatomie unter
 * `/discover/kailua-coffee-co` (`packages/brand`) rendert dieselbe Marke aus
 * `brand_publications` — mit Steckbrief, Markenabdruck und eigenem og:image.
 * Die Kachel zeigt deshalb DORTHIN, und die alte Adresse antwortet 301
 * (`routeRules` in `nuxt.config.ts`): zwei Seiten für eine Marke waren zwei
 * Pflegestellen und zwei Kandidaten in derselben Suche. Sie steht direkt
 * hinter den Artefakten, weil sie deren Beweis ist — „was am Ende auf dem
 * Tisch liegt" und dann: hier liegt es. Noch offen und weiter in OPEN-ITEMS:
 * „Brand Insights" (Artikel/Profile/Duelle).
 *
 * ── DER BRAND-CHECK IST SEIT 2026-09-05 ECHT — UND WOHNT WOANDERS ─────────
 * Erst stand hier die Warteliste mit `source: 'brand-check'`, dann (seit dem
 * Bau des Instruments) das Formular selbst. Seit dem Teaser-Umbau steht hier
 * `BwBrandCheckTeaser`: das Formular lebt GENAU EINMAL, auf `/brand-check`
 * (Plan docs/archiv/BRAND-CHECK-SEITE.md §1). Grund: die Seite mit dem
 * Formular ist die indexierbare Produkt-Seite des Checks; drei Formulare an
 * drei Stellen wären drei Erklärungen und trotzdem keine Seite, die jemand
 * findet. Der Report per Mail bleibt die Warteliste — er steht auf der
 * ERGEBNISSEITE, wo er etwas zu ergänzen hat.
 *
 * ── WEICHE W1 ────────────────────────────────────────────────────────────
 * Eingeloggt führen „Neue Marke"/„Marken-Relaunch" direkt in die Anlage mit
 * vorgewähltem Pfad (`/dashboard/brands/new?path=relaunch` — die Seite liest
 * `?path=`); Gäste landen auf /invite. Der Pfad reist als Query weiter, damit
 * die Wahl nicht verloren geht.
 *
 * Wie /about und /team in der APP, nicht im Layer.
 */
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { isLoggedIn } = useCurrentUser()

/**
 * Die Beschreibung im Kopf kommt seit 2026-09-09 aus dem Sucheintrag
 * (/dashboard/community/seo), sonst wie bisher aus `home.seoDescription`.
 * Davids Entscheidung: die Owner-Beschreibung gilt auf JEDER Site, nicht nur
 * auf der Pool-Startseite — sonst wäre das Feld hier eine Fläche ohne Wirkung.
 * `noindex`, der zweite Wert derselben Zeile, gilt der ganzen Site und sitzt
 * deshalb weiterhin allein in `useLocaleSeoHead()`.
 */
const seoDescription = useCommunitySeoDescription(() => t('home.seoDescription'))

useSeoMeta({
  title: () => t('home.seoTitle'),
  description: () => seoDescription.value,
  ogTitle: () => t('home.title'),
  ogDescription: () => seoDescription.value,
})
useHead({
  script: computed(() => [jsonLdScript({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', 'name': 'Branding Supply', 'url': 'https://branding.supply' },
      {
        '@type': 'WebSite',
        'name': 'Branding Supply',
        'url': 'https://branding.supply',
        'inLanguage': locale.value,
        'description': seoDescription.value,
      },
    ],
  })]),
})

// Gäste landen ohne Query auf /invite: die Einladungs-Seite liest keinen
// Pfad, und eine Query, die niemand liest, wäre ein Versprechen ohne Leser.
function pathTarget(kind: 'new' | 'relaunch'): string {
  return isLoggedIn.value
    ? localePath({ path: '/dashboard/brands/new', query: { path: kind } })
    : localePath('/invite')
}

const process = ['process1', 'process2', 'process3', 'process4'] as const
const capabilities = [
  { key: 'cap1', icon: 'i-ph-chats-circle' },
  { key: 'cap2', icon: 'i-ph-gauge' },
  { key: 'cap3', icon: 'i-ph-seal-check' },
  { key: 'cap4', icon: 'i-ph-lock-key' },
  { key: 'cap5', icon: 'i-ph-broadcast' },
  { key: 'cap6', icon: 'i-ph-brain' },
] as const
const SWATCHES = ['#4a3123', '#b98a5e', '#e8d3b8', '#2f4a3a', '#f7f2ea']
const KIT_FILES = ['logo.svg', 'wortmarke.svg', 'boilerplate.md', 'gruender.jpg']
</script>

<template>
  <div class="pb-10">
    <div class="@container mx-auto max-w-7xl">
      <!-- 1 · Hero-Split -->
      <section class="mt-16 grid items-center gap-12 @lg:grid-cols-2">
        <div>
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('home.eyebrow') }}</p>
          <h1 class="mt-4 max-w-xl text-balance text-5xl font-extralight leading-tight tracking-tight sm:text-6xl">{{ t('home.title') }}</h1>
          <p class="mt-5 max-w-md text-lg leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('home.subtitle') }}</p>
          <div class="mt-9 flex flex-wrap items-center gap-2">
            <UButton :label="t('home.pathNew')" :to="pathTarget('new')" size="lg" color="neutral" variant="solid" class="rounded-full" />
            <UButton :label="t('home.pathRelaunch')" :to="pathTarget('relaunch')" size="lg" color="neutral" variant="solid" class="rounded-full" />
          </div>
          <p class="bw-label mt-4" style="color: var(--bw-muted)">{{ t('home.pathCaption') }}</p>
        </div>
        <div class="bw-card p-8">
          <div class="flex items-center justify-between gap-3">
            <p class="bw-label" style="color: var(--bw-muted)">{{ t('home.processLabel') }}</p>
            <UAvatar text="G" size="md" />
          </div>
          <ul class="mt-6 space-y-4">
            <li v-for="(step, index) in process" :key="step" class="flex items-center gap-3">
              <span
                class="grid size-5 flex-none place-items-center rounded-full"
                :style="index < process.length - 1 ? 'background: var(--bw-accent-soft)' : 'background: var(--bw-surface-hi)'"
              >
                <UIcon
                  :name="index < process.length - 1 ? 'i-ph-check' : 'i-ph-circle-notch'"
                  class="size-3" :class="index < process.length - 1 ? '' : 'animate-spin'"
                  :style="index < process.length - 1 ? 'color: var(--bw-accent)' : 'color: var(--bw-muted)'"
                />
              </span>
              <p class="bw-label" :style="index < process.length - 1 ? '' : 'color: var(--bw-muted)'">{{ t(`home.${step}`) }}</p>
            </li>
          </ul>
        </div>
      </section>

      <!-- 2 · Artefakte: zeigen statt beschreiben -->
      <section class="mt-24">
        <h2 class="text-center text-balance text-3xl font-extralight tracking-tight sm:text-4xl">{{ t('home.artifactsTitle') }}</h2>
        <p class="bw-label mt-2 text-center" style="color: var(--bw-muted)">{{ t('home.artifactsLead') }}</p>
        <div class="mt-10 grid gap-x-6 gap-y-6 @sm:grid-cols-2 @md:grid-cols-3">
          <div class="bw-card p-8">
            <div class="bw-frame mb-5 flex h-28 items-center p-5" style="background: var(--bw-surface-hi)">
              <div class="w-full">
                <p class="bw-label" style="color: var(--bw-muted)">{{ t('home.art1Proof1') }}</p>
                <p class="bw-label mt-2 flex items-center gap-1.5"><UIcon name="i-ph-check" class="size-3.5 flex-none" style="color: var(--bw-accent)" />{{ t('home.art1ProofDo') }}</p>
                <p class="bw-label mt-1 flex items-center gap-1.5" style="color: var(--bw-muted)"><UIcon name="i-ph-x" class="size-3.5 flex-none" style="color: var(--bw-stale)" />{{ t('home.art1ProofDont') }}</p>
              </div>
            </div>
            <p class="bw-label" style="color: var(--bw-muted)">{{ t('home.art1Label') }}</p>
            <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('home.art1Body') }}</p>
          </div>
          <div class="bw-card p-8">
            <div class="bw-frame mb-5 flex h-28 items-center p-5" style="background: var(--bw-ink)">
              <pre class="bw-label" style="color: var(--bw-paper)">{
  "voice": "ruhig, fundiert",
  "avoid": ["Deluxe", "Auszeit"]
}</pre>
            </div>
            <p class="bw-label" style="color: var(--bw-muted)">{{ t('home.art2Label') }}</p>
            <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('home.art2Body') }}</p>
          </div>
          <div class="bw-card p-8">
            <div class="bw-frame mb-5 flex h-28 items-center p-5" style="background: var(--bw-surface-hi)">
              <div class="w-full">
                <div class="flex gap-1.5">
                  <span v-for="c in SWATCHES" :key="c" class="size-7 rounded-full" :style="`background: ${c}; box-shadow: inset 0 0 0 1px rgb(20 20 20 / 0.08)`" />
                </div>
                <p class="bw-label mt-3" style="color: var(--bw-muted)">{{ t('home.art3Proof') }}</p>
              </div>
            </div>
            <p class="bw-label" style="color: var(--bw-muted)">{{ t('home.art3Label') }}</p>
            <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('home.art3Body') }}</p>
          </div>
          <div class="bw-card p-8">
            <div class="bw-frame mb-5 flex h-28 items-center p-5" style="background: var(--bw-surface-hi)">
              <div class="flex w-full flex-wrap gap-1.5">
                <span v-for="f in KIT_FILES" :key="f" class="bw-label inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style="background: var(--bw-surface)"><UIcon name="i-ph-file" class="size-3 flex-none" style="color: var(--bw-muted)" />{{ f }}</span>
              </div>
            </div>
            <p class="bw-label" style="color: var(--bw-muted)">{{ t('home.art4Label') }}</p>
            <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('home.art4Body') }}</p>
          </div>
          <div class="bw-card p-8">
            <div class="bw-frame mb-5 flex h-28 items-center p-5" style="background: var(--bw-surface-hi)">
              <div class="w-full space-y-1.5">
                <p class="bw-label flex items-baseline justify-between gap-3">{{ t('home.art5P1') }} <span style="color: var(--bw-muted)">{{ t('home.art5P1n') }}</span></p>
                <p class="bw-label flex items-baseline justify-between gap-3">{{ t('home.art5P2') }} <span style="color: var(--bw-muted)">{{ t('home.art5P2n') }}</span></p>
                <p class="bw-label flex items-baseline justify-between gap-3">{{ t('home.art5P3') }} <span style="color: var(--bw-muted)">{{ t('home.art5P3n') }}</span></p>
              </div>
            </div>
            <p class="bw-label" style="color: var(--bw-muted)">{{ t('home.art5Label') }}</p>
            <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('home.art5Body') }}</p>
          </div>
          <div class="bw-card p-8">
            <div class="bw-frame mb-5 flex h-28 items-center p-5" style="background: var(--bw-surface-hi)">
              <div class="w-full space-y-1.5">
                <p class="bw-label flex items-baseline justify-between gap-3"><span style="color: var(--bw-muted)">{{ t('home.art6W1') }}</span> {{ t('home.art6P1') }}</p>
                <p class="bw-label flex items-baseline justify-between gap-3"><span style="color: var(--bw-muted)">{{ t('home.art6W2') }}</span> {{ t('home.art6P2') }}</p>
                <p class="bw-label flex items-baseline justify-between gap-3"><span style="color: var(--bw-muted)">{{ t('home.art6W3') }}</span> {{ t('home.art6P3') }}</p>
              </div>
            </div>
            <p class="bw-label" style="color: var(--bw-muted)">{{ t('home.art6Label') }}</p>
            <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('home.art6Body') }}</p>
          </div>
        </div>
      </section>

      <!-- 3 · Beispiel-Branding: der Beweis zu den Artefakten (s. Kopf) -->
      <section class="mt-24">
        <NuxtLink
          :to="localePath('/discover/kailua-coffee-co')"
          class="bw-card bw-card--hover grid items-center gap-8 p-8 sm:grid-cols-[12rem_minmax(0,1fr)]"
        >
          <div
            class="bw-tile relative hidden overflow-hidden sm:block"
            style="aspect-ratio: 1 / 1; background: linear-gradient(165deg, #e8d3b8 0%, #b98a5e 45%, #4a3123 100%)"
          >
            <p
              class="absolute inset-0 grid place-items-center p-4 text-center text-base font-extralight leading-snug tracking-tight"
              style="color: #f7f2ea; text-shadow: 0 1px 12px rgb(20 20 20 / 0.3)"
            >Kailua Coffee Co.</p>
          </div>
          <div class="min-w-0">
            <p class="bw-label" style="color: var(--bw-muted)">{{ t('home.exampleLabel') }}</p>
            <h2 class="mt-2 text-2xl font-medium tracking-tight">{{ t('home.exampleTitle') }}</h2>
            <p class="mt-3 max-w-2xl text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('home.exampleBody') }}</p>
            <p class="bw-label mt-5 inline-flex items-center gap-1.5" style="color: var(--bw-muted)">
              {{ t('home.exampleLink') }}
              <UIcon name="i-ph-arrow-right" class="size-3.5" />
            </p>
          </div>
        </NuxtLink>
      </section>

      <!-- 4 · Fähigkeiten -->
      <section class="mt-24">
        <h2 class="text-center text-balance text-3xl font-extralight tracking-tight sm:text-4xl">{{ t('home.capTitle') }}</h2>
        <p class="bw-label mt-2 text-center" style="color: var(--bw-muted)">{{ t('home.capLead') }}</p>
        <div class="mt-10 grid gap-x-6 gap-y-6 @sm:grid-cols-2 @md:grid-cols-3">
          <div v-for="cap in capabilities" :key="cap.key" class="bw-card p-8">
            <UIcon :name="cap.icon" class="size-5" style="color: var(--bw-ink-soft)" />
            <p class="mt-3 font-medium">{{ t(`home.${cap.key}Name`) }}</p>
            <p class="mt-1.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t(`home.${cap.key}Line`) }}</p>
          </div>
        </div>
      </section>

      <!-- 5 · Brand-Check: der Relaunch-Lead-Magnet, jetzt als TEASER
           (s. Kopf) — das Formular steht auf /brand-check. -->
      <BwBrandCheckTeaser source="home" class="mt-24" />

      <!-- 6 · Discover Brands: der BEWEIS neben dem Versprechen (Paket D2).
           Er steht NACH dem Brand-Check-Teaser und VOR dem Abschluss-CTA: erst
           „was ihr bekommt", dann „so sieht es fertig aus", dann der Knopf.
           Der Abschnitt VERSCHWINDET, solange keine Marke freigegeben ist —
           die Komponente entscheidet das selbst (fail-soft, ihr Kopf sagt
           warum), die Startseite kennt die Galerie nicht. -->
      <BwDiscoverTeaser class="mt-24" />

      <!-- 7 · Abschluss-CTA -->
      <section class="bw-card mt-24 px-8 py-14 text-center sm:py-16">
        <h2 class="mx-auto max-w-2xl text-balance text-3xl font-medium tracking-tight sm:text-4xl">{{ t('home.ctaTitle') }}</h2>
        <p class="mx-auto mt-4 max-w-xl text-base leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('home.ctaBody') }}</p>
        <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
          <UButton
            :label="isLoggedIn ? t('home.cta.brands') : t('home.ctaStart')"
            :to="localePath(isLoggedIn ? '/dashboard/brands' : '/invite')"
            size="lg" icon="i-ph-plus" color="neutral" class="rounded-full"
          />
          <UButton :label="t('home.ctaAbout')" :to="localePath('/about')" size="lg" color="neutral" variant="ghost" class="rounded-full" />
        </div>
        <p class="bw-label mx-auto mt-8 max-w-xl" style="color: var(--bw-muted)">{{ t('home.beta') }}</p>
      </section>
    </div>
  </div>
</template>
