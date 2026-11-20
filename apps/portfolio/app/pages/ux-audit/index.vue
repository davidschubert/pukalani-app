<script setup lang="ts">
import { CONTACT } from '../../data/contact'
import type { Lang } from '../../data/localized'
import {
  AUDIT_AREAS,
  AUDIT_AREAS_HEADING,
  AUDIT_CROSS_LINK,
  AUDIT_CTA,
  AUDIT_FAQ_HEADING,
  AUDIT_FAQS,
  AUDIT_META,
  AUDIT_METHOD_NOTE,
  AUDIT_PROCESS_HEADING,
  AUDIT_QUOTE,
  AUDIT_QUOTE_SOURCE,
  AUDIT_STEPS,
  AUDIT_TIERS,
  AUDIT_TIERS_HEADING,
  UX_AUDIT_HERO,
} from '../../data/uxAudit'
import { breadcrumbList, DACH_AREA_SERVED, faqPage, personNode } from '../../utils/schema'

definePageMeta({ layout: 'site' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { trackFunnel } = useFunnelEvent()

const lang = computed<Lang>(() => (locale.value.startsWith('de') ? 'de' : 'en'))

usePortfolioSeo({
  path: '/ux-audit',
  title: () => AUDIT_META.title[lang.value],
  description: () => AUDIT_META.description[lang.value],
  ogType: 'website',
  graph: ctx => [
    personNode(ctx.origin, ctx.homeUrl, { sameAs: CONTACT.socialProfiles }),
    {
      '@type': 'Service',
      '@id': `${ctx.pageUrl}#service`,
      'name': AUDIT_META.serviceName[lang.value],
      'serviceType': AUDIT_META.serviceType[lang.value],
      'description': AUDIT_META.serviceDescription[lang.value],
      'url': ctx.pageUrl,
      'provider': { '@id': ctx.personId },
      'areaServed': DACH_AREA_SERVED,
      'hasOfferCatalog': {
        '@type': 'OfferCatalog',
        'name': AUDIT_META.catalogName[lang.value],
        // Dieselben drei Pakete wie die sichtbaren Karten (Parität).
        'itemListElement': AUDIT_TIERS.map(tier => ({
          '@type': 'Offer',
          'name': `${AUDIT_META.serviceName[lang.value]} ${tier.name[lang.value]}`,
          'description': tier.schemaDescription[lang.value],
          'price': tier.priceValue,
          'priceCurrency': 'EUR',
          'url': `${ctx.pageUrl}#pakete`,
        })),
      },
    },
    {
      '@type': 'WebPage',
      '@id': `${ctx.pageUrl}#webpage`,
      'url': ctx.pageUrl,
      'name': AUDIT_META.title[lang.value],
      'description': AUDIT_META.description[lang.value],
      'inLanguage': lang.value,
      // Angebotsseite, kein Artikel: hier ist der SITE-Stand die ehrliche
      // Angabe — dieselbe Zeile steht sichtbar unter dem Titel (B7).
      'dateModified': CONTACT.lastUpdated,
      'isPartOf': { '@id': ctx.websiteId },
      'breadcrumb': { '@id': `${ctx.pageUrl}#breadcrumb` },
    },
    breadcrumbList(ctx.pageUrl, [
      { name: t('portfolio.common.home'), item: ctx.homeUrl },
      { name: UX_AUDIT_HERO.breadcrumb[lang.value], item: ctx.pageUrl },
    ]),
    faqPage(ctx.pageUrl, AUDIT_FAQS, lang.value),
  ],
})
</script>

<template>
  <div>
    <header class="page-head">
      <div class="container reveal">
        <nav :aria-label="t('portfolio.common.contents')">
          <ol class="breadcrumb">
            <li><NuxtLink :to="localePath('/')">{{ t('portfolio.common.home') }}</NuxtLink></li>
            <li aria-hidden="true">→</li>
            <li aria-current="page">{{ UX_AUDIT_HERO.breadcrumb[lang] }}</li>
          </ol>
        </nav>
        <h1 class="page-head__title">{{ UX_AUDIT_HERO.title[lang] }}</h1>
        <p id="audit-answer" class="page-head__intro">{{ UX_AUDIT_HERO.intro[lang] }}</p>
        <div class="page-head__actions">
          <NuxtLink
            :to="localePath('/erstgespraech')"
            class="btn btn--solid"
            @click="trackFunnel('studio_cta_erstgespraech', { source: 'hero' })"
          >
            {{ UX_AUDIT_HERO.ctaPrimary[lang] }} →
          </NuxtLink>
          <NuxtLink :to="localePath('/ux-audit#pakete')" class="btn">{{ UX_AUDIT_HERO.ctaSecondary[lang] }}</NuxtLink>
        </div>
        <p class="section-note">
          {{ t('portfolio.common.state') }} {{ CONTACT.lastUpdatedHuman[lang] }} · {{ UX_AUDIT_HERO.note[lang] }}
        </p>
      </div>
    </header>

    <section class="section section--soft section--line" aria-labelledby="was-ist-title">
      <div class="container">
        <h2 id="was-ist-title" class="section-title">{{ AUDIT_AREAS_HEADING.title[lang] }}</h2>
        <p class="section-lead">{{ AUDIT_AREAS_HEADING.lead[lang] }}</p>
        <div class="grid-2">
          <div v-for="area in AUDIT_AREAS" :key="area.title.en" class="card">
            <h3 class="card__title">{{ area.title[lang] }}</h3>
            <p class="card__text">{{ area.description[lang] }}</p>
          </div>
        </div>
        <p class="section-lead method">
          {{ AUDIT_METHOD_NOTE.lead[lang] }}
        </p>
        <ul class="chips method__links">
          <li v-for="link in AUDIT_METHOD_NOTE.links" :key="link.href">
            <a :href="link.href" target="_blank" rel="noopener external" class="chip chip--accent">{{ link.label }}</a>
          </li>
        </ul>
      </div>
    </section>

    <section id="pakete" class="section section--line" aria-labelledby="pakete-title">
      <div class="container">
        <h2 id="pakete-title" class="section-title">{{ AUDIT_TIERS_HEADING.title[lang] }}</h2>
        <p class="section-lead">{{ AUDIT_TIERS_HEADING.lead[lang] }}</p>
        <div class="grid-3 tiers">
          <article
            v-for="tier in AUDIT_TIERS"
            :key="tier.name.en"
            class="card tier"
            :class="{ 'tier--featured': tier.featured }"
          >
            <p v-if="tier.featured" class="tier__flag">{{ AUDIT_TIERS_HEADING.featuredLabel[lang] }}</p>
            <h3 class="tier__name">{{ tier.name[lang] }}</h3>
            <p class="tier__audience">{{ tier.audience[lang] }}</p>
            <p class="tier__price">{{ tier.price[lang] }}</p>
            <p class="tier__meta">{{ AUDIT_TIERS_HEADING.priceNote[lang] }} · {{ tier.duration[lang] }}</p>
            <ul class="ticks tier__list">
              <li v-for="item in tier.includes[lang]" :key="item">{{ item }}</li>
            </ul>
            <NuxtLink
              :to="localePath('/erstgespraech')"
              class="btn tier__cta"
              :class="{ 'btn--solid': tier.featured }"
              @click="trackFunnel('studio_cta_erstgespraech', { source: 'pricing' })"
            >
              {{ tier.name[lang] }} {{ t('portfolio.common.request') }}
            </NuxtLink>
          </article>
        </div>
        <p class="section-note">{{ AUDIT_TIERS_HEADING.note[lang] }}</p>
      </div>
    </section>

    <section class="section section--soft section--line" aria-labelledby="ablauf-title">
      <div class="container container--narrow">
        <h2 id="ablauf-title" class="section-title">{{ AUDIT_PROCESS_HEADING.title[lang] }}</h2>
        <p class="section-lead">{{ AUDIT_PROCESS_HEADING.lead[lang] }}</p>
        <ol class="steps">
          <li v-for="(step, index) in AUDIT_STEPS" :key="step.title.en" class="step">
            <span class="step__index" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
            <div>
              <h3 class="card__title">{{ step.title[lang] }}</h3>
              <p class="card__text">{{ step.description[lang] }}</p>
            </div>
          </li>
        </ol>
        <blockquote class="quote audit__quote">
          „{{ AUDIT_QUOTE[lang] }}"
          <footer class="quote__source">— {{ AUDIT_QUOTE_SOURCE[lang] }}</footer>
        </blockquote>
      </div>
    </section>

    <section id="faq" class="section section--line" aria-labelledby="audit-faq-title">
      <div class="container container--narrow">
        <h2 id="audit-faq-title" class="section-title">{{ AUDIT_FAQ_HEADING[lang] }}</h2>
        <div class="faq faq--top">
          <details v-for="faq in AUDIT_FAQS" :key="faq.question.en" class="faq__item">
            <summary>
              <span>{{ faq.question[lang] }}</span>
              <span class="faq__sign" aria-hidden="true">+</span>
            </summary>
            <p class="faq__answer">{{ faq.answer[lang] }}</p>
          </details>
        </div>
        <p class="section-note">
          {{ AUDIT_CROSS_LINK.lead[lang] }}
          <NuxtLink :to="localePath(AUDIT_CROSS_LINK.to)" class="link-accent">{{ AUDIT_CROSS_LINK.label[lang] }}</NuxtLink>
        </p>
      </div>
    </section>

    <CtaBand :title="AUDIT_CTA.title[lang]" :text="AUDIT_CTA.text[lang]" :lang="lang" />
  </div>
</template>

<style scoped>
.page-head__title {
  margin-top: 1.6rem;
  font-size: clamp(2rem, 5.2vw, 4rem);
  max-width: 20ch;
}
.page-head__intro {
  margin-top: 1.6rem;
  max-width: 66ch;
  color: var(--text-soft);
  font-size: clamp(1rem, 1.8vw, 1.15rem);
}
.page-head__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  margin-top: 2.2rem;
}
.container--narrow {
  max-width: 62rem;
}
.grid-2,
.grid-3 {
  display: grid;
  gap: clamp(1rem, 2vw, 1.5rem);
  margin-top: clamp(2rem, 4vw, 3rem);
  list-style: none;
}
.grid-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.grid-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.method {
  margin-top: 2rem;
}
.method__links {
  margin-top: 1rem;
}

/* PAKETE --------------------------------------------------------------- */
.tier {
  display: flex;
  flex-direction: column;
}
.tier--featured {
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
}
.tier__flag {
  align-self: flex-start;
  margin-bottom: 0.8rem;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-ink);
  padding: 0.2rem 0.7rem;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}
.tier__name {
  font-family: "Syne", ui-sans-serif, system-ui, sans-serif;
  font-weight: 800;
  text-transform: uppercase;
  font-size: 1.2rem;
}
.tier__audience {
  margin-top: 0.3rem;
  color: var(--metal-text);
  font-size: 0.85rem;
}
.tier__price {
  margin-top: 1.4rem;
  font-family: "Syne", ui-sans-serif, system-ui, sans-serif;
  font-weight: 800;
  font-size: clamp(1.8rem, 4vw, 2.4rem);
  line-height: 1;
}
.tier__meta {
  margin-top: 0.5rem;
  color: var(--metal-text);
  font-size: 0.8rem;
}
.tier__list {
  flex: 1;
  margin-top: 1.4rem;
}
.tier__cta {
  margin-top: 1.8rem;
  justify-content: center;
  text-align: center;
  font-size: 0.8rem;
}

/* ABLAUF --------------------------------------------------------------- */
.steps {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
  margin-top: clamp(2rem, 4vw, 3rem);
}
.step {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1.2rem;
  align-items: start;
}
.step__index {
  font-weight: 800;
  font-size: 0.85rem;
  letter-spacing: 0.1em;
  color: var(--accent);
  padding-top: 0.15rem;
}
.audit__quote {
  margin-top: clamp(2.5rem, 5vw, 3.5rem);
}
.quote__source {
  margin-top: 0.8rem;
  color: var(--metal-text);
  font-size: 0.82rem;
}
.faq--top {
  margin-top: 2rem;
}

@media (max-width: 960px) {
  .grid-3 {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 680px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
}
</style>
