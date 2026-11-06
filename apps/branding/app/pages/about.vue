<script setup lang="ts">
import { jsonLdScript } from '../utils/jsonLd'

/**
 * DIE ABOUT-SEITE — „Wer wir sind", als Produkt-Seite gedacht (Davids
 * Auftrag 2026-09-04: Struktur, Konzept und Texte auf Verständlichkeit,
 * Verkaufsargumente, SEO und Lead-Generierung optimieren — Vorbild Apple:
 * ein Gedanke je Abschnitt, grosse Aussage, ein Satz darunter, ein Bild).
 *
 * ── DER AUFBAU IST EIN VERKAUFSGESPRÄCH, KEIN LEBENSLAUF ──────────────────
 *   1. Hero — die Behauptung (wir sind unser eigener Beweis)
 *   2. Warum es uns gibt — das Problem in zwei Spalten, die Lösung in der
 *      dritten (Agentur · Generator · George)
 *   3. Grundsätze — woran man uns messen kann
 *   4. So arbeiten wir — drei Schritte mit Zeit-Versprechen (45 Minuten,
 *      abgenommener Landing-Dummy Runde 137)
 *   5. Der Beweis — diese Seite selbst
 *   6. FAQ — die Einwände, bevor sie jemand stellt (und Suchmaschinen-Futter:
 *      FAQPage-JSON-LD)
 *   7. Brand-Check — der kostenlose Einstieg als Teaser auf /brand-check
 *   8. Frühzugang — die Warteliste, die EINE Lead-Erfassung der Beta
 *   9. Team-Teaser — der Weg zu den Menschen
 *
 * ── WAS HIER NICHT STEHT ──────────────────────────────────────────────────
 * Artefakte und Beispiel-Branding gehören der Startseite (abgenommener Dummy
 * `packages/brand/.playground/app/pages/start.vue`) — About wiederholt sie
 * nicht. Der Brand-Check steht seit dem Teaser-Umbau (Plan
 * docs/archiv/BRAND-CHECK-SEITE.md §1) auch hier, aber NUR als Verweis: das
 * Formular lebt genau einmal, auf /brand-check. Preise nennt nur die FAQ, und zwar den Stand
 * der Produktentscheidung vom 2026-08-27: Fundament frei, Ableitung bezahlt.
 *
 * ── BILDER SIND PLATZHALTER MIT PROMPT ────────────────────────────────────
 * `BwImagePlaceholder` trägt die Kennung; die Generierungs-Anweisung steht
 * als `prompt` IM Code (nicht im DOM) und gesammelt in
 * docs/referenz/BRANDING-SUPPLY-BILDMATERIAL.md.
 *
 * Wie /team: in der APP, nicht im Layer — der brand-Layer ist host-agnostisch.
 */

const { t, locale } = useI18n()
const localePath = useLocalePath()

useSeoMeta({
  title: () => t('about.seoTitle'),
  description: () => t('about.seoDescription'),
  ogTitle: () => t('about.title'),
  ogDescription: () => t('about.seoDescription'),
})

const FAQ_IDS = ['faq1', 'faq2', 'faq3', 'faq4', 'faq5', 'faq6'] as const

/**
 * FAQPage + Organization als JSON-LD — dieselben Texte wie auf der Seite,
 * reaktiv über `locale` (`t` liest die aktive Sprache).
 */
useHead({
  script: computed(() => [jsonLdScript({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        'name': 'Branding Supply',
        'url': 'https://branding.supply',
        'description': t('about.seoDescription'),
      },
      {
        '@type': 'FAQPage',
        'inLanguage': locale.value,
        'mainEntity': FAQ_IDS.map(id => ({
          '@type': 'Question',
          'name': t(`about.${id}Q`),
          'acceptedAnswer': { '@type': 'Answer', 'text': t(`about.${id}A`) },
        })),
      },
    ],
  })]),
})

const openFaq = ref<string | null>(null)
</script>

<template>
  <div class="pb-10">
    <div class="@container mx-auto max-w-7xl">
      <!-- 1 · Hero: die Behauptung -->
      <section class="mt-14">
        <div class="mx-auto max-w-3xl text-center">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('about.eyebrow') }}</p>
          <h1 class="mt-4 text-balance text-5xl font-extralight leading-tight tracking-tight sm:text-6xl">{{ t('about.title') }}</h1>
          <p class="mx-auto mt-6 max-w-2xl text-lg leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('about.intro1') }}</p>
          <p class="mx-auto mt-4 max-w-2xl text-lg leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('about.intro2') }}</p>
        </div>
        <!-- A1 · Hero-Bild (16:9) -->
        <ArtA1 :label="t('about.heroImage')" class="mt-12" />
        <p class="bw-label mx-auto mt-6 max-w-3xl text-center leading-relaxed" style="color: var(--bw-muted)">{{ t('about.fingerprint') }}</p>
      </section>

      <!-- 2 · Warum es uns gibt: Agentur · Generator · George -->
      <section class="mt-28">
        <div class="mx-auto max-w-3xl text-center">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('about.whyEyebrow') }}</p>
          <h2 class="mt-3 text-balance text-3xl font-extralight tracking-tight sm:text-4xl">{{ t('about.whyTitle') }}</h2>
        </div>
        <div class="mt-10 grid gap-6 @md:grid-cols-3">
          <div class="bw-card p-8" style="color: var(--bw-muted)">
            <p class="bw-label">01</p>
            <h3 class="mt-2 text-lg font-medium tracking-tight" style="color: var(--bw-ink-soft)">{{ t('about.whyAgencyTitle') }}</h3>
            <p class="mt-3 text-sm leading-relaxed">{{ t('about.whyAgencyBody') }}</p>
          </div>
          <div class="bw-card p-8" style="color: var(--bw-muted)">
            <p class="bw-label">02</p>
            <h3 class="mt-2 text-lg font-medium tracking-tight" style="color: var(--bw-ink-soft)">{{ t('about.whyGeneratorTitle') }}</h3>
            <p class="mt-3 text-sm leading-relaxed">{{ t('about.whyGeneratorBody') }}</p>
          </div>
          <!-- Die dritte Karte ist die Antwort — sie trägt den Pop. -->
          <div class="bw-card p-8" style="background: var(--bw-ink); color: var(--bw-paper)">
            <p class="bw-label" style="color: var(--bw-pop)">03</p>
            <h3 class="mt-2 text-lg font-medium tracking-tight">{{ t('about.whyUsTitle') }}</h3>
            <p class="mt-3 text-sm leading-relaxed" style="opacity: 0.85">{{ t('about.whyUsBody') }}</p>
          </div>
        </div>
        <!-- A2 · Bild zum Warum (3:1 Streifen) -->
        <ArtA2 :label="t('about.whyImage')" class="mt-6" />
      </section>

      <!-- 3 · Grundsätze -->
      <section class="mt-28">
        <div class="mx-auto max-w-3xl text-center">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('about.principlesEyebrow') }}</p>
          <h2 class="mt-3 text-balance text-3xl font-extralight tracking-tight sm:text-4xl">{{ t('about.principlesTitle') }}</h2>
        </div>
        <div class="mt-10 grid gap-6 @md:grid-cols-3">
          <div v-for="p in ['p1', 'p2', 'p3']" :key="p" class="bw-card p-8">
            <h3 class="text-lg font-medium tracking-tight">{{ t(`about.${p}Title`) }}</h3>
            <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t(`about.${p}Body`) }}</p>
          </div>
        </div>
      </section>

      <!-- 4 · So arbeiten wir: drei Schritte, je ein Bild (A3–A5) -->
      <section class="mt-28">
        <div class="mx-auto max-w-3xl text-center">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('about.howEyebrow') }}</p>
          <h2 class="mt-3 text-balance text-3xl font-extralight tracking-tight sm:text-4xl">{{ t('about.howTitle') }}</h2>
          <p class="mx-auto mt-4 max-w-xl text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('about.howLead') }}</p>
        </div>
        <div class="mt-10 grid gap-6 @md:grid-cols-3">
          <div class="bw-card overflow-hidden">
            <ArtA3 :label="t('about.h1Image')" :rounded="false" />
            <div class="p-8">
              <p class="bw-label" style="color: var(--bw-muted)">01</p>
              <h3 class="mt-2 text-lg font-medium tracking-tight">{{ t('about.h1Title') }}</h3>
              <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('about.h1Body') }}</p>
            </div>
          </div>
          <div class="bw-card overflow-hidden">
            <ArtA4 :label="t('about.h2Image')" :rounded="false" />
            <div class="p-8">
              <p class="bw-label" style="color: var(--bw-muted)">02</p>
              <h3 class="mt-2 text-lg font-medium tracking-tight">{{ t('about.h2Title') }}</h3>
              <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('about.h2Body') }}</p>
            </div>
          </div>
          <div class="bw-card overflow-hidden">
            <ArtA5 :label="t('about.h3Image')" :rounded="false" />
            <div class="p-8">
              <p class="bw-label" style="color: var(--bw-muted)">03</p>
              <h3 class="mt-2 text-lg font-medium tracking-tight">{{ t('about.h3Title') }}</h3>
              <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('about.h3Body') }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- 5 · Der Beweis: diese Seite (A6) -->
      <section class="bw-card mt-28 grid items-center gap-10 overflow-hidden @lg:grid-cols-2">
        <ArtA6 :label="t('about.proofImage')" :rounded="false" />
        <div class="p-10 @lg:pr-14">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('about.proofEyebrow') }}</p>
          <h2 class="mt-3 text-balance text-3xl font-extralight tracking-tight sm:text-4xl">{{ t('about.proofTitle') }}</h2>
          <p class="mt-5 text-base leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('about.proofBody') }}</p>
          <p class="bw-label mt-6 leading-relaxed" style="color: var(--bw-muted)">{{ t('about.fingerprint') }}</p>
        </div>
      </section>

      <!-- 6 · FAQ: Einwände vorwegnehmen, Suchmaschinen füttern -->
      <section class="mt-28">
        <div class="mx-auto max-w-3xl text-center">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('about.faqEyebrow') }}</p>
          <h2 class="mt-3 text-balance text-3xl font-extralight tracking-tight sm:text-4xl">{{ t('about.faqTitle') }}</h2>
        </div>
        <div class="mx-auto mt-10 max-w-3xl divide-y" style="border-color: var(--bw-line)">
          <div v-for="id in FAQ_IDS" :key="id" class="py-5" style="border-color: var(--bw-line)">
            <button
              type="button" class="flex w-full items-center justify-between gap-4 text-left"
              :aria-expanded="openFaq === id" @click="openFaq = openFaq === id ? null : id"
            >
              <span class="text-lg font-medium tracking-tight">{{ t(`about.${id}Q`) }}</span>
              <UIcon :name="openFaq === id ? 'i-ph-minus' : 'i-ph-plus'" class="size-4 flex-none" style="color: var(--bw-muted)" />
            </button>
            <!-- Die Antwort steht IMMER im Markup (Suchmaschinen lesen kein
                 Klick-Ereignis) — geklappt wird nur die Sichtbarkeit. -->
            <p :hidden="openFaq !== id" class="mt-3 max-w-2xl text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t(`about.${id}A`) }}</p>
          </div>
        </div>
      </section>

      <!-- 7 · Brand-Check: der kostenlose Einstieg NEBEN der Warteliste
           (Plan docs/archiv/BRAND-CHECK-SEITE.md §1 — ergänzend, nicht
           ersetzend: wer noch nichts hinterlassen will, kann trotzdem etwas
           mitnehmen). -->
      <BwBrandCheckTeaser source="about" class="mt-28" />

      <!-- 8 · Frühzugang: die Warteliste -->
      <section class="bw-card mt-28 grid items-center gap-10 p-10 @lg:grid-cols-[minmax(0,1fr)_26rem] @lg:p-14">
        <div class="min-w-0">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('lead.eyebrow') }}</p>
          <h2 class="mt-3 max-w-lg text-balance text-3xl font-extralight leading-snug tracking-tight sm:text-4xl">{{ t('lead.title') }}</h2>
          <p class="mt-4 max-w-lg text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('lead.body') }}</p>
        </div>
        <BwWaitlistForm source="about" />
      </section>

      <!-- 9 · Team-Teaser -->
      <section class="mt-16 flex flex-wrap items-center justify-between gap-6 px-2">
        <div class="max-w-xl">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('about.teamTeaserEyebrow') }}</p>
          <h2 class="mt-2 text-2xl font-medium tracking-tight">{{ t('about.teamTeaserTitle') }}</h2>
          <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('about.teamTeaserBody') }}</p>
        </div>
        <UButton :label="t('about.teamLink')" :to="localePath('/team')" size="lg" color="neutral" variant="soft" trailing-icon="i-ph-arrow-right" class="rounded-full" />
      </section>
    </div>
  </div>
</template>
