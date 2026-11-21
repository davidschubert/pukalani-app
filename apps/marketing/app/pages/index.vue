<script setup lang="ts">
// Die kinematische Startseite (Konzept §3.2 / §6.4). Szenen-Reihenfolge im DOM
// = Reihenfolge der Beats.

definePageMeta({ layout: 'site' })
useReveal()

const { t, locale } = useI18n()
const baseUrl = useSiteBaseUrl()

// Meta (Title/Description je Locale) — Canonical/Hreflang liefert useLocaleHead
// (app.vue). og:image = seiteneigenes Bild aus public/og (scripts/og-images.mjs).
// Die einzige Seite mit `website`; alle Unterseiten sind `article`.
useMarketingSeo({
  titleKey: 'marketing.meta.title',
  descriptionKey: 'marketing.meta.description',
  image: 'home',
  type: 'website',
})

// Strukturierte Daten — ehrlich (keine erfundenen Bewertungen/Preise, §5).
// KEIN FAQPage-Knoten hier (SEO-008, 2026-11-21): dieselben Fragen standen
// als strukturierte Daten auf der Startseite UND auf /faq — zwei Seiten, die
// um dasselbe Suchergebnis konkurrieren. Sie stehen nur noch auf /faq; die
// sichtbare FaqSection bleibt hier. Wächter: tests/faqJsonLd.test.ts.
const jsonLd = computed(() => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      'name': 'Pukalani',
      'url': baseUrl,
      'description': t('marketing.meta.description'),
    },
    {
      '@type': 'SoftwareApplication',
      'name': 'Pukalani',
      'applicationCategory': 'BusinessApplication',
      'operatingSystem': 'Web',
      'description': t('marketing.meta.description'),
      'url': baseUrl,
      'inLanguage': locale.value,
    },
  ],
}))

useHead(() => ({
  script: [
    { type: 'application/ld+json', innerHTML: JSON.stringify(jsonLd.value) },
  ],
}))
</script>

<template>
  <div class="mkt-page">
    <HeroSection />
    <ProblemSection />
    <StepsSection />
    <BlocksSection />
    <ModularSection />
    <PrivacySection />
    <AudienceSection />
    <ComparisonSection />
    <ProofSection />
    <PricingSection />
    <StorySection />
    <!-- Bewusste Abweichung von §6.4 (dort CTA → FAQ): die FAQ steht VOR der
         CTA, damit das Licht-Motiv (§6.3) monoton zum Peak aufhellt und die
         Seite auf dem dunkelwarmen Abschluss-CTA endet — CTA (dunkel) → FAQ
         (hell) → Footer (dunkel) hätte wie ein Fehler gewirkt. Inhaltlich
         entkräftet die FAQ die letzten Zweifel direkt VOR der Aufforderung. -->
    <FaqSection />
    <CtaSection />
    <!-- Kontakt als LETZTE Sektion (Davids Entscheidung 2026-08-09): das Ziel
         des Studio-Knopfes aus der Preistabelle. Sie steht hinter dem
         Abschluss-CTA, weil sie nicht mit ihm konkurriert — der CTA ist die
         Selbstbedienung („in 60 Sekunden"), der Kontakt das Angebot nach Maß.
         Beide tragen `tone-ink`, das dunkle Band läuft also ohne Bruch bis in
         den Fuß (§6.3). -->
    <ContactSection />
  </div>
</template>
