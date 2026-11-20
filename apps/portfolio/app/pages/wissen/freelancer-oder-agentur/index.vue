<script setup lang="ts">
import { CONTACT } from '../../../data/contact'
import type { Lang } from '../../../data/localized'
import {
  AGENTUR_AGENCY_FIT,
  AGENTUR_COMPARISON,
  AGENTUR_CONCLUSION,
  AGENTUR_COSTS,
  AGENTUR_CTA,
  AGENTUR_FAQ_TITLE,
  AGENTUR_FAQS,
  AGENTUR_FREELANCER_FIT,
  AGENTUR_HERO,
  AGENTUR_META,
  AGENTUR_RISKS,
  AGENTUR_TOC,
  COMPARISON_ROWS,
} from '../../../data/wissenFreelancerAgentur'
import { breadcrumbList, faqPage, personNode } from '../../../utils/schema'

definePageMeta({ layout: 'site' })

const { t, locale } = useI18n()
const localePath = useLocalePath()

const lang = computed<Lang>(() => (locale.value.startsWith('de') ? 'de' : 'en'))

// Die „Wissen"-Station der Brotkrumen ist ein ANKER auf der Startseite und
// deshalb nicht aus `ctx` ableitbar — die Composable kennt nur diese Seite.
// `useSiteOrigin()` MUSS im Setup stehen (es liest `useRequestURL()`); in
// einem `computed` liefe es beim Auswerten ausserhalb des Nuxt-Kontexts und
// die Seite antwortete 500 (NUXT_E1001, beim Beweis live erwischt).
const siteOrigin = useSiteOrigin()
const knowledgeUrl = computed(() => `${siteOrigin}${localePath('/#wissen')}`)

usePortfolioSeo({
  path: '/wissen/freelancer-oder-agentur',
  title: () => AGENTUR_META.title[lang.value],
  description: () => AGENTUR_META.description[lang.value],
  ogType: 'article',
  // Das Datum DIESES Artikels (B7) — dieselben Felder speisen die sichtbare
  // Zeile im Kopf.
  article: { published: AGENTUR_META.published, modified: AGENTUR_META.updated },
  graph: ctx => [
    personNode(ctx.origin, ctx.homeUrl, { sameAs: CONTACT.socialProfiles }),
    {
      '@type': 'Article',
      '@id': `${ctx.pageUrl}#article`,
      'headline': AGENTUR_META.headline[lang.value],
      'description': AGENTUR_META.description[lang.value],
      'url': ctx.pageUrl,
      'inLanguage': lang.value,
      'author': { '@id': ctx.personId },
      'publisher': { '@id': ctx.personId },
      'datePublished': AGENTUR_META.published,
      'dateModified': AGENTUR_META.updated,
      'image': `${ctx.origin}/images/og-pukalani-studio.png`,
      'isPartOf': { '@id': ctx.websiteId },
    },
    breadcrumbList(ctx.pageUrl, [
      { name: t('portfolio.common.home'), item: ctx.homeUrl },
      { name: t('portfolio.common.knowledge'), item: knowledgeUrl.value },
      { name: AGENTUR_HERO.breadcrumb[lang.value], item: ctx.pageUrl },
    ]),
    faqPage(ctx.pageUrl, AGENTUR_FAQS, lang.value),
  ],
})
</script>

<template>
  <article>
    <header class="page-head section--line">
      <div class="container container--narrow reveal">
        <nav :aria-label="t('portfolio.common.contents')">
          <ol class="breadcrumb">
            <li><NuxtLink :to="localePath('/')">{{ t('portfolio.common.home') }}</NuxtLink></li>
            <li aria-hidden="true">→</li>
            <li><NuxtLink :to="localePath('/#wissen')">{{ t('portfolio.common.knowledge') }}</NuxtLink></li>
            <li aria-hidden="true">→</li>
            <li aria-current="page">{{ AGENTUR_HERO.breadcrumb[lang] }}</li>
          </ol>
        </nav>
        <h1 class="page-head__title">{{ AGENTUR_HERO.title[lang] }}</h1>
        <p class="page-head__intro">{{ AGENTUR_HERO.intro[lang] }}</p>
        <div class="byline">
          <p>
            <NuxtLink :to="localePath('/#ueber-mich')" class="link-accent">David Schubert</NuxtLink>
            {{ AGENTUR_HERO.bylineRole[lang] }}
          </p>
          <p>
            {{ t('portfolio.common.updatedAt') }}
            <time :datetime="AGENTUR_META.updated">{{ AGENTUR_META.updatedHuman[lang] }}</time>
          </p>
        </div>
        <p class="note head__note">
          <strong>{{ AGENTUR_HERO.disclosureLabel[lang] }}</strong> {{ AGENTUR_HERO.disclosure[lang] }}
        </p>
      </div>
    </header>

    <nav class="toc section--line" :aria-label="t('portfolio.common.contents')">
      <div class="container container--narrow">
        <p class="toc__label">{{ t('portfolio.common.contents') }}</p>
        <ol class="toc__list">
          <li v-for="item in AGENTUR_TOC" :key="item.href">
            <a :href="item.href" class="toc__link">{{ item.label[lang] }}</a>
          </li>
        </ol>
      </div>
    </nav>

    <div class="container container--narrow guide-body">
      <!-- VERGLEICHSTABELLE -->
      <section id="vergleich" aria-labelledby="vergleich-title" class="chapter">
        <h2 id="vergleich-title" class="section-title">{{ AGENTUR_COMPARISON.title[lang] }}</h2>
        <div class="prose">
          <p>{{ AGENTUR_COMPARISON.lead[lang] }}</p>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <caption>{{ AGENTUR_COMPARISON.caption[lang] }}</caption>
            <thead>
              <tr>
                <th scope="col">{{ AGENTUR_COMPARISON.columns.criterion[lang] }}</th>
                <th scope="col">{{ AGENTUR_COMPARISON.columns.freelancer[lang] }}</th>
                <th scope="col">{{ AGENTUR_COMPARISON.columns.agency[lang] }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in COMPARISON_ROWS" :key="row.criterion.en">
                <th scope="row">{{ row.criterion[lang] }}</th>
                <td>{{ row.freelancer[lang] }}</td>
                <td>{{ row.agency[lang] }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- KOSTEN -->
      <section id="kosten" aria-labelledby="kosten-title" class="chapter">
        <h2 id="kosten-title" class="section-title">{{ AGENTUR_COSTS.title[lang] }}</h2>
        <div class="prose">
          <p>{{ AGENTUR_COSTS.paragraph1[lang] }}</p>
          <p>
            {{ AGENTUR_COSTS.paragraph2Lead[lang] }} <em>{{ AGENTUR_COSTS.paragraph2Emphasis[lang] }}</em>
            {{ AGENTUR_COSTS.paragraph2Middle[lang] }}
            <NuxtLink :to="localePath('/wissen/was-kostet-ux-design')" class="link-accent">
              {{ AGENTUR_COSTS.paragraph2LinkLabel[lang] }}
            </NuxtLink>
            {{ AGENTUR_COSTS.paragraph2End[lang] }}
          </p>
        </div>
      </section>

      <!-- WANN FREELANCER -->
      <section id="wann-freelancer" aria-labelledby="wann-freelancer-title" class="chapter">
        <h2 id="wann-freelancer-title" class="section-title">{{ AGENTUR_FREELANCER_FIT.title[lang] }}</h2>
        <div class="prose">
          <p>{{ AGENTUR_FREELANCER_FIT.lead[lang] }}</p>
        </div>
        <ul class="ticks fit-list">
          <li v-for="item in AGENTUR_FREELANCER_FIT.items[lang]" :key="item">{{ item }}</li>
        </ul>
      </section>

      <!-- WANN AGENTUR -->
      <section id="wann-agentur" aria-labelledby="wann-agentur-title" class="chapter">
        <h2 id="wann-agentur-title" class="section-title">{{ AGENTUR_AGENCY_FIT.title[lang] }}</h2>
        <div class="prose">
          <p>{{ AGENTUR_AGENCY_FIT.lead[lang] }}</p>
        </div>
        <ul class="arrows fit-list">
          <li v-for="item in AGENTUR_AGENCY_FIT.items[lang]" :key="item">{{ item }}</li>
        </ul>
        <div class="prose">
          <p>{{ AGENTUR_AGENCY_FIT.note[lang] }}</p>
        </div>
      </section>

      <!-- RISIKEN -->
      <section id="risiken" aria-labelledby="risiken-title" class="chapter">
        <h2 id="risiken-title" class="section-title">{{ AGENTUR_RISKS.title[lang] }}</h2>
        <div class="risks">
          <div class="card">
            <h3 class="card__title">{{ AGENTUR_RISKS.freelancerTitle[lang] }}</h3>
            <p class="card__text">{{ AGENTUR_RISKS.freelancerText[lang] }}</p>
          </div>
          <div class="card">
            <h3 class="card__title">{{ AGENTUR_RISKS.agencyTitle[lang] }}</h3>
            <p class="card__text">{{ AGENTUR_RISKS.agencyText[lang] }}</p>
          </div>
        </div>
      </section>

      <!-- FAQ -->
      <section id="faq" aria-labelledby="agentur-faq-title" class="chapter">
        <h2 id="agentur-faq-title" class="section-title">{{ AGENTUR_FAQ_TITLE[lang] }}</h2>
        <div class="faq faq--top">
          <details v-for="faq in AGENTUR_FAQS" :key="faq.question.en" class="faq__item">
            <summary>
              <span>{{ faq.question[lang] }}</span>
              <span class="faq__sign" aria-hidden="true">+</span>
            </summary>
            <p class="faq__answer">{{ faq.answer[lang] }}</p>
          </details>
        </div>
      </section>

      <!-- FAZIT -->
      <section id="fazit" aria-labelledby="fazit-title" class="chapter">
        <h2 id="fazit-title" class="section-title">{{ AGENTUR_CONCLUSION.title[lang] }}</h2>
        <div class="prose">
          <p>{{ AGENTUR_CONCLUSION.text[lang] }}</p>
        </div>
      </section>
    </div>

    <CtaBand :title="AGENTUR_CTA.title[lang]" :text="AGENTUR_CTA.text[lang]" :lang="lang" />
  </article>
</template>

<style scoped>
.container--narrow {
  max-width: 52rem;
}
.page-head__title {
  margin-top: 1.6rem;
  font-size: clamp(1.9rem, 4.6vw, 3.4rem);
}
.page-head__intro {
  margin-top: 1.6rem;
  color: var(--text-soft);
  font-size: clamp(1rem, 1.8vw, 1.15rem);
}
.byline {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 2rem;
  margin-top: 2rem;
  color: var(--metal-text);
  font-size: 0.82rem;
}
.head__note {
  margin-top: 1.6rem;
}
.toc {
  background: var(--bg-soft);
  padding-block: 1.6rem;
  border-bottom: 1px solid var(--line);
}
.toc__label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--metal-text);
}
.toc__list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.4rem 1.5rem;
  margin-top: 0.8rem;
  list-style: none;
}
.toc__link {
  font-size: 0.88rem;
  color: var(--text-soft);
  transition: color 0.3s var(--ease);
}
.toc__link:hover {
  color: var(--accent);
}
.guide-body {
  padding-block: clamp(3rem, 7vw, 5rem);
}
.chapter + .chapter {
  margin-top: clamp(3rem, 7vw, 4.5rem);
}
.fit-list {
  margin-top: 1.6rem;
}
/* Gegenstück zu `.ticks`: der Pfeil markiert „dafür spricht die Agentur". */
.arrows {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.arrows li {
  position: relative;
  padding-left: 1.4rem;
  color: var(--text-soft);
  font-size: 0.95rem;
}
.arrows li::before {
  content: "→";
  position: absolute;
  left: 0;
  color: var(--metal-text);
}
.risks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.2rem;
  margin-top: 2rem;
}
.faq--top {
  margin-top: 1.8rem;
}
@media (max-width: 680px) {
  .toc__list,
  .risks {
    grid-template-columns: 1fr;
  }
}
</style>
