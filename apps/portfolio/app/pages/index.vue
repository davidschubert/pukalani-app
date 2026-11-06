<script setup lang="ts">
import { CASES } from '../data/cases'
import { CONTACT } from '../data/contact'
import {
  ABOUT_AI_NOTE,
  ABOUT_QUOTE,
  AUDIENCES,
  CASE_STUDIES,
  CONTACT_CHANNELS,
  FAQS,
  GUIDES,
  HERO,
  HOME_META,
  KEY_FACTS,
  KNOWS_ABOUT,
  PROCESS_STEPS,
  REMOTE_CARDS,
  SECTIONS,
  SERVICES,
  SERVICES_NOTE,
  STACK_GROUPS,
  TESTIMONIALS,
  TIMELINE,
  TRUST_BADGES,
} from '../data/home'
import type { Lang } from '../data/localized'
import {
  DACH_AREA_SERVED,
  faqPage,
  organizationId,
  personNode,
  SITE_NAME,
  STUDIO_ADDRESS,
} from '../utils/schema'

definePageMeta({ layout: 'site' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { trackFunnel } = useFunnelEvent()

const lang = computed<Lang>(() => (locale.value.startsWith('de') ? 'de' : 'en'))

/**
 * Der Terminkanal zeigt seit W1 (2026-08-21) auf den Erstgespräch-Wizard und
 * nicht mehr direkt auf cal.com — ein Conversion-Ziel überall. `external` ist
 * damit `false` und die Karte trägt kein `target="_blank"` mehr; die Zusage im
 * Text („30 Minuten, kostenlos") gilt unverändert, gebucht wird am Ende des
 * Wizards.
 */
const contactChannels = computed(() => CONTACT_CHANNELS.map(channel => ({
  ...channel,
  url: channel.href === 'cal'
    ? localePath('/erstgespraech')
    : channel.href === 'mail'
      ? `mailto:${CONTACT.email}`
      : `tel:${CONTACT.phoneTel}`,
})))

/**
 * Die Beschreibung im Kopf kommt seit 2026-09-09 aus dem Sucheintrag
 * (/dashboard/community/seo), sonst wie bisher aus `HOME_META`. Davids
 * Entscheidung: die Owner-Beschreibung gilt auf JEDER Site, nicht nur auf der
 * Pool-Startseite — sonst wäre das Feld hier eine Fläche ohne Wirkung. Der
 * `WebPage`-Knoten unten trägt sie mit, weil er DIESE Seite beschreibt;
 * `personDescription` bleibt unangetastet — das ist die Person, nicht die Site.
 */
const seoDescription = useCommunitySeoDescription(() => HOME_META.description[lang.value])

usePortfolioSeo({
  path: '/',
  title: () => HOME_META.title[lang.value],
  description: () => seoDescription.value,
  ogType: 'website',
  // Person, Marke, Angebot, Site, Seite, FAQ — die Startseite ist die einzige
  // Seite, die den Graphen VOLLSTÄNDIG aufspannt; alle anderen verweisen nur
  // noch auf diese `@id`s.
  graph: ctx => [
    personNode(ctx.origin, ctx.homeUrl, {
      description: HOME_META.personDescription[lang.value],
      email: `mailto:${CONTACT.email}`,
      telephone: CONTACT.phoneTel,
      sameAs: CONTACT.socialProfiles,
      worksFor: { '@id': organizationId(ctx.origin) },
      knowsLanguage: ['de', 'en'],
      hasCredential: [
        { '@type': 'EducationalOccupationalCredential', 'name': 'Mediengestalter Digital und Print (Ausbildung)' },
        { '@type': 'EducationalOccupationalCredential', 'name': 'Bachelor Professional in Digital Media (IHK)' },
      ],
      knowsAbout: KNOWS_ABOUT[lang.value],
      address: STUDIO_ADDRESS,
    }),
    {
      '@type': 'Organization',
      '@id': organizationId(ctx.origin),
      'name': SITE_NAME,
      'url': ctx.origin,
      'logo': `${ctx.origin}/icon.svg`,
      'founder': { '@id': ctx.personId },
      'sameAs': CONTACT.socialProfiles,
    },
    {
      '@type': 'ProfessionalService',
      '@id': `${ctx.origin}/#service`,
      'name': 'Pukalani Studio – UI/UX Design, Brand Design & Web-Umsetzung',
      'description': HOME_META.serviceDescription[lang.value],
      'url': ctx.pageUrl,
      'image': `${ctx.origin}/images/og-pukalani-studio.png`,
      'priceRange': '€2.500 – €75.000+',
      'telephone': CONTACT.phoneTel,
      'email': `mailto:${CONTACT.email}`,
      'provider': { '@id': ctx.personId },
      'address': STUDIO_ADDRESS,
      'areaServed': DACH_AREA_SERVED,
      'availableLanguage': ['Deutsch', 'Englisch'],
      'hasOfferCatalog': {
        '@type': 'OfferCatalog',
        'name': lang.value === 'de' ? 'Leistungen' : 'Services',
        // Aus DEMSELBEN Array wie die sichtbaren Karten — ein Angebot, das im
        // Katalog steht, aber nicht auf der Seite, wäre eine Lüge im Markup.
        'itemListElement': SERVICES.map(service => ({
          '@type': 'Offer',
          'itemOffered': {
            '@type': 'Service',
            'name': service.title[lang.value],
            'description': service.schemaDescription[lang.value],
            'url': `${ctx.pageUrl}#${service.id}`,
          },
          ...(service.minPrice
            ? {
                priceSpecification: {
                  '@type': 'PriceSpecification',
                  'minPrice': service.minPrice,
                  'maxPrice': service.maxPrice,
                  'priceCurrency': 'EUR',
                },
              }
            : {}),
        })),
      },
    },
    {
      '@type': 'WebSite',
      '@id': ctx.websiteId,
      'url': ctx.origin,
      'name': SITE_NAME,
      'publisher': { '@id': organizationId(ctx.origin) },
      'inLanguage': lang.value,
    },
    {
      '@type': 'WebPage',
      '@id': `${ctx.pageUrl}#webpage`,
      'url': ctx.pageUrl,
      'name': HOME_META.title[lang.value],
      'description': seoDescription.value,
      'isPartOf': { '@id': ctx.websiteId },
      'about': { '@id': ctx.personId },
      // Das Datum DIESER Seite (HOME_META), nicht der Site-Stand: die
      // Startseite ist ein eigenes Dokument mit eigener Pflege (Befund B7).
      'dateModified': HOME_META.updated,
      'inLanguage': lang.value,
      'primaryImageOfPage': {
        '@type': 'ImageObject',
        'url': `${ctx.origin}/images/og-pukalani-studio.png`,
        'width': 1200,
        'height': 630,
      },
      'speakable': {
        '@type': 'SpeakableSpecification',
        'cssSelector': ['#hero-answer', '#ueberblick'],
      },
    },
    // Parität: dasselbe Array wie das sichtbare FAQ weiter unten.
    faqPage(ctx.pageUrl, FAQS, lang.value),
  ],
})
</script>

<template>
  <div>
    <!-- HERO ------------------------------------------------------------ -->
    <section id="hero" class="hero">
      <div class="container reveal">
        <p class="hero__badge">
          <span class="hero__dot" aria-hidden="true" />
          {{ HERO.availability[lang] }}
        </p>
        <p class="eyebrow hero__eyebrow">{{ HERO.eyebrow[lang] }}</p>
        <h1 class="hero__title">{{ HERO.title[lang] }}</h1>
        <p id="hero-answer" class="hero__intro">{{ HERO.intro[lang] }}</p>
        <p class="hero__brands">
          {{ HERO.brandsLead[lang] }} <strong>{{ HERO.brands[lang] }}</strong>.
        </p>
        <ul class="chips hero__badges" :aria-label="t('portfolio.common.keyFacts')">
          <li v-for="badge in TRUST_BADGES[lang]" :key="badge" class="chip">{{ badge }}</li>
        </ul>
        <div class="hero__actions">
          <NuxtLink
            :to="localePath('/erstgespraech')"
            class="btn btn--solid"
            @click="trackFunnel('studio_cta_erstgespraech', { source: 'hero' })"
          >
            {{ HERO.ctaPrimary[lang] }} →
          </NuxtLink>
          <NuxtLink :to="localePath('/#leistungen')" class="btn">{{ HERO.ctaSecondary[lang] }}</NuxtLink>
        </div>
      </div>
    </section>

    <!-- AUF EINEN BLICK -------------------------------------------------- -->
    <section id="ueberblick" class="section section--soft section--line" aria-labelledby="ueberblick-title">
      <div class="container">
        <h2 id="ueberblick-title" class="section-title">{{ SECTIONS.overview.title[lang] }}</h2>
        <p class="section-lead">{{ SECTIONS.overview.lead[lang] }}</p>
        <dl class="facts">
          <div v-for="fact in KEY_FACTS" :key="fact.label.en" class="facts__item">
            <dt class="facts__label">{{ fact.label[lang] }}</dt>
            <dd class="facts__value">{{ fact.value[lang] }}</dd>
          </div>
        </dl>
        <!-- Das Datum DIESER Seite, nicht der Site-Stand (der steht im Fuß). -->
        <p class="section-note">{{ t('portfolio.common.updatedAt') }} {{ HOME_META.updatedHuman[lang] }}</p>
      </div>
    </section>

    <!-- FÜR WEN ---------------------------------------------------------- -->
    <section id="fuer-wen" class="section section--line" aria-labelledby="fuer-wen-title">
      <div class="container">
        <h2 id="fuer-wen-title" class="section-title">{{ SECTIONS.audiences.title[lang] }}</h2>
        <p class="section-lead">{{ SECTIONS.audiences.lead[lang] }}</p>
        <div class="grid-3">
          <div v-for="audience in AUDIENCES" :key="audience.title.en" class="card">
            <h3 class="card__title">{{ audience.title[lang] }}</h3>
            <p class="card__text">{{ audience.description[lang] }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- LEISTUNGEN & PREISE ---------------------------------------------- -->
    <section id="leistungen" class="section section--soft section--line" aria-labelledby="leistungen-title">
      <div class="container">
        <h2 id="leistungen-title" class="section-title">{{ SECTIONS.services.title[lang] }}</h2>
        <p class="section-lead">{{ SECTIONS.services.lead[lang] }}</p>
        <div class="grid-2 services">
          <article v-for="service in SERVICES" :id="service.id" :key="service.id" class="card service">
            <h3 class="service__title">{{ service.title[lang] }}</h3>
            <p class="card__text">{{ service.description[lang] }}</p>
            <ul class="ticks service__list">
              <li v-for="item in service.deliverables[lang]" :key="item">{{ item }}</li>
            </ul>
            <p class="service__result">{{ service.result[lang] }}</p>
            <div class="service__foot">
              <div>
                <p class="service__price">{{ service.price[lang] }}</p>
                <p class="service__duration">{{ service.duration[lang] }} · {{ t('portfolio.common.fixedPrice') }}</p>
              </div>
              <NuxtLink
                :to="localePath(service.link ?? '/#kontakt')"
                class="service__cta"
                :aria-label="service.title[lang]"
              >
                {{ service.link ? t('portfolio.common.details') : t('portfolio.common.request') }}
              </NuxtLink>
            </div>
          </article>
        </div>
        <p class="section-note">{{ SERVICES_NOTE[lang] }}</p>
      </div>
    </section>

    <!-- PROZESS ---------------------------------------------------------- -->
    <section id="prozess" class="section section--line" aria-labelledby="prozess-title">
      <div class="container">
        <h2 id="prozess-title" class="section-title">{{ SECTIONS.process.title[lang] }}</h2>
        <p class="section-lead">{{ SECTIONS.process.lead[lang] }}</p>
        <ol class="grid-3 steps">
          <li v-for="(step, index) in PROCESS_STEPS" :key="step.title.en" class="card step">
            <span class="step__index" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
            <h3 class="card__title">{{ step.title[lang] }}</h3>
            <p class="card__text">{{ step.description[lang] }}</p>
            <p class="step__duration">{{ step.duration[lang] }}</p>
          </li>
        </ol>
      </div>
    </section>

    <!-- REFERENZEN ------------------------------------------------------- -->
    <section id="referenzen" class="section section--soft section--line" aria-labelledby="referenzen-title">
      <div class="container">
        <h2 id="referenzen-title" class="section-title">{{ SECTIONS.references.title[lang] }}</h2>
        <p class="section-lead">{{ SECTIONS.references.lead[lang] }}</p>

        <div class="grid-2 studies">
          <article v-for="project in CASE_STUDIES" :key="project.title.en" class="card">
            <ul class="chips" :aria-label="t('portfolio.common.categories')">
              <li v-for="tag in project.tags" :key="tag" class="chip">{{ tag }}</li>
            </ul>
            <h3 class="study__title">{{ project.title[lang] }}</h3>
            <p class="card__text">
              <strong>{{ t('portfolio.common.situation') }}</strong> {{ project.challenge[lang] }}
            </p>
            <p class="card__text">
              <strong>{{ t('portfolio.common.solution') }}</strong> {{ project.solution[lang] }}
            </p>
            <ul class="chips study__results" :aria-label="t('portfolio.common.results')">
              <li v-for="result in project.results[lang]" :key="result" class="chip chip--accent">{{ result }}</li>
            </ul>
          </article>
        </div>

        <!-- Eigene Produkte: dieselben Cases wie bisher, mit Detailseite. -->
        <h3 class="subheading own__heading">{{ SECTIONS.ownWork.title[lang] }}</h3>
        <p class="section-lead">{{ SECTIONS.ownWork.lead[lang] }}</p>
        <ol class="cases" data-cases>
          <li v-for="(entry, index) in CASES" :key="entry.slug" class="case">
            <NuxtLink :to="localePath(`/cases/${entry.slug}`)" class="case__link" :data-case="entry.slug">
              <span class="case__index">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="case__main">
                <span class="case__title">{{ entry.title }}</span>
                <span class="case__teaser">{{ entry.teaser[lang] }}</span>
                <span class="case__meta">{{ entry.year }} · {{ entry.stack.slice(0, 3).join(' · ') }}</span>
              </span>
              <span class="case__arrow" aria-hidden="true">→</span>
            </NuxtLink>
          </li>
        </ol>

        <h3 class="subheading own__heading">{{ SECTIONS.testimonials.title[lang] }}</h3>
        <div class="grid-2 quotes">
          <figure v-for="quote in TESTIMONIALS" :key="quote.text.en" class="card">
            <blockquote class="quote-text">„{{ quote.text[lang] }}"</blockquote>
            <figcaption class="quote-source">— {{ quote.attribution[lang] }}</figcaption>
          </figure>
        </div>
        <p class="section-note">{{ SECTIONS.testimonials.lead[lang] }}</p>
      </div>
    </section>

    <!-- DAS STUDIO (Anker `ueber-mich` bleibt: verlinkt aus Nav, Fuß, Guides) -->
    <section id="ueber-mich" class="section section--line" aria-labelledby="ueber-mich-title">
      <div class="container">
        <h2 id="ueber-mich-title" class="section-title">{{ SECTIONS.about.title[lang] }}</h2>
        <p class="section-lead">{{ SECTIONS.about.lead[lang] }}</p>

        <div class="about">
          <div>
            <h3 class="subheading">{{ t('portfolio.about.career') }}</h3>
            <ol class="timeline">
              <li v-for="milestone in TIMELINE" :key="milestone.period.en" class="timeline__item">
                <p class="timeline__period">{{ milestone.period[lang] }}</p>
                <p class="card__text">{{ milestone.description[lang] }}</p>
              </li>
            </ol>
            <blockquote class="quote about__quote">„{{ ABOUT_QUOTE[lang] }}"</blockquote>
          </div>

          <div>
            <h3 class="subheading">{{ t('portfolio.about.tools') }}</h3>
            <div class="stackgroups">
              <div v-for="group in STACK_GROUPS" :key="group.title.en">
                <p class="stackgroups__label">{{ group.title[lang] }}</p>
                <ul class="chips stackgroups__items">
                  <li v-for="tool in group.items[lang]" :key="tool" class="chip">{{ tool }}</li>
                </ul>
              </div>
            </div>
            <p class="note about__note">
              <strong>{{ t('portfolio.about.alsoLabel') }}</strong> {{ ABOUT_AI_NOTE[lang] }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- REMOTE & DACH ---------------------------------------------------- -->
    <section id="remote-dach" class="section section--soft section--line" aria-labelledby="remote-dach-title">
      <div class="container">
        <h2 id="remote-dach-title" class="section-title">{{ SECTIONS.remote.title[lang] }}</h2>
        <p class="section-lead">{{ SECTIONS.remote.lead[lang] }}</p>
        <div class="grid-3">
          <div v-for="card in REMOTE_CARDS" :key="card.title.en" class="card">
            <h3 class="card__title">{{ card.title[lang] }}</h3>
            <p class="card__text">{{ card.description[lang] }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- WISSEN ----------------------------------------------------------- -->
    <section id="wissen" class="section section--line" aria-labelledby="wissen-title">
      <div class="container">
        <h2 id="wissen-title" class="section-title">{{ SECTIONS.knowledge.title[lang] }}</h2>
        <p class="section-lead">{{ SECTIONS.knowledge.lead[lang] }}</p>
        <div class="grid-2 guides">
          <NuxtLink v-for="guide in GUIDES" :key="guide.to" :to="localePath(guide.to)" class="card guide">
            <p class="guide__kicker">{{ guide.kicker[lang] }}</p>
            <h3 class="guide__title">{{ guide.title[lang] }}</h3>
            <p class="card__text guide__text">{{ guide.description[lang] }}</p>
            <p class="guide__more">{{ t('portfolio.common.read') }}</p>
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- FAQ -------------------------------------------------------------- -->
    <section id="faq" class="section section--soft section--line" aria-labelledby="faq-title">
      <div class="container container--narrow">
        <h2 id="faq-title" class="section-title">{{ SECTIONS.faq.title[lang] }}</h2>
        <p class="section-lead">{{ SECTIONS.faq.lead[lang] }}</p>
        <div class="faq">
          <details v-for="faq in FAQS" :key="faq.question.en" class="faq__item">
            <summary>
              <span>{{ faq.question[lang] }}</span>
              <span class="faq__sign" aria-hidden="true">+</span>
            </summary>
            <p class="faq__answer">{{ faq.answer[lang] }}</p>
          </details>
        </div>
      </div>
    </section>

    <!-- KONTAKT ---------------------------------------------------------- -->
    <section id="kontakt" class="section section--line" aria-labelledby="kontakt-title">
      <div class="container">
        <h2 id="kontakt-title" class="section-title">{{ SECTIONS.contact.title[lang] }}</h2>
        <p class="section-lead">{{ SECTIONS.contact.lead[lang] }}</p>
        <div class="grid-3 channels">
          <a
            v-for="channel in contactChannels"
            :key="channel.title.en"
            :href="channel.url"
            :target="channel.external ? '_blank' : undefined"
            :rel="channel.external ? 'noopener nofollow' : undefined"
            class="card channel"
            @click="channel.href === 'cal' && trackFunnel('studio_cta_erstgespraech', { source: 'contact' })"
          >
            <h3 class="card__title">{{ channel.title[lang] }}</h3>
            <p class="card__text">{{ channel.description[lang] }}</p>
            <p class="channel__link">{{ channel.linkLabel[lang] }} →</p>
          </a>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* HERO ---------------------------------------------------------------- */
.hero {
  padding-top: clamp(7.5rem, 16vh, 11rem);
  padding-bottom: clamp(3rem, 8vw, 6rem);
}
.hero__badge {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  border-radius: 999px;
  padding: 0.35rem 0.95rem;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--accent);
}
.hero__dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 999px;
  background: var(--accent);
}
.hero__eyebrow {
  margin-top: 1.6rem;
  color: var(--metal);
}
.hero__title {
  margin-top: 0.9rem;
  font-size: clamp(2rem, 5.6vw, 4.4rem);
  max-width: 20ch;
}
.hero__intro {
  margin-top: 1.6rem;
  max-width: 62ch;
  color: var(--text-soft);
  font-size: clamp(1rem, 1.8vw, 1.2rem);
}
.hero__brands {
  margin-top: 1.1rem;
  max-width: 62ch;
  color: var(--metal);
  font-size: 0.9rem;
}
.hero__brands strong {
  color: var(--text-soft);
}
.hero__badges {
  margin-top: 1.8rem;
}
.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  margin-top: 2.2rem;
}

/* RASTER --------------------------------------------------------------- */
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
.container--narrow {
  max-width: 62rem;
}

/* AUF EINEN BLICK ------------------------------------------------------ */
.facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.4rem clamp(1.5rem, 3vw, 2.5rem);
  margin-top: clamp(2rem, 4vw, 3rem);
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  padding: clamp(1.4rem, 3vw, 2.2rem);
}
.facts__label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--metal);
}
.facts__value {
  margin-top: 0.4rem;
  color: var(--text-soft);
  font-size: 0.92rem;
}

/* LEISTUNGEN ----------------------------------------------------------- */
.service {
  display: flex;
  flex-direction: column;
  scroll-margin-top: 6rem;
}
.service__title {
  font-family: "Syne", ui-sans-serif, system-ui, sans-serif;
  font-weight: 800;
  letter-spacing: -0.01em;
  font-size: 1.2rem;
}
.service__list {
  margin-top: 1.1rem;
}
.service__result {
  margin-top: 1.2rem;
  align-self: flex-start;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  border-radius: 999px;
  padding: 0.3rem 0.85rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--accent);
}
.service__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: auto;
  padding-top: 1.4rem;
  border-top: 1px solid var(--line);
}
.service__price {
  font-weight: 800;
  font-size: 1rem;
}
.service__duration {
  color: var(--metal);
  font-size: 0.8rem;
}
.service__cta {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--accent);
  transition: color 0.3s var(--ease);
}
.service__cta:hover {
  color: var(--text);
}
.service__foot + .section-note {
  margin-top: 1rem;
}

/* PROZESS -------------------------------------------------------------- */
.step {
  position: relative;
}
.step__index {
  display: block;
  margin-bottom: 0.7rem;
  font-weight: 800;
  font-size: 0.85rem;
  color: var(--accent);
  letter-spacing: 0.1em;
}
.step__duration {
  margin-top: 0.9rem;
  font-size: 0.76rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--metal);
}

/* REFERENZEN ----------------------------------------------------------- */
.study__title {
  margin-top: 1rem;
  font-family: "Syne", ui-sans-serif, system-ui, sans-serif;
  font-weight: 800;
  letter-spacing: -0.01em;
  font-size: 1.15rem;
}
.study__results {
  margin-top: 1.2rem;
}
.own__heading {
  margin-top: clamp(3rem, 7vw, 5rem);
}
.quote-text {
  font-size: 1.02rem;
  color: var(--text);
}
.quote-source {
  margin-top: 0.9rem;
  color: var(--metal);
  font-size: 0.82rem;
}

/* Eigene Cases — identische Liste wie zuvor auf der Startseite. */
.cases {
  list-style: none;
  margin-top: clamp(1.6rem, 4vw, 2.6rem);
  border-top: 1px solid var(--line);
}
.case {
  border-bottom: 1px solid var(--line);
}
.case__link {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: clamp(1rem, 4vw, 2.5rem);
  padding-block: clamp(1.2rem, 3vw, 2rem);
  transition: padding-inline 0.35s var(--ease);
}
.case__link:hover {
  padding-inline: 0.6rem;
}
.case__index {
  font-weight: 800;
  color: var(--metal);
  font-size: 0.9rem;
}
.case__main {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
}
.case__title {
  font-family: "Syne", ui-sans-serif, system-ui, sans-serif;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: -0.01em;
  font-size: clamp(1.3rem, 3.5vw, 2.1rem);
  line-height: 1.05;
  transition: color 0.3s var(--ease);
}
.case__link:hover .case__title {
  color: var(--accent);
}
.case__teaser {
  color: var(--text-soft);
  max-width: 62ch;
}
.case__meta {
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--metal);
  font-weight: 700;
}
.case__arrow {
  font-size: 1.4rem;
  color: var(--text-soft);
  transition: color 0.3s var(--ease), transform 0.35s var(--ease);
}
.case__link:hover .case__arrow {
  color: var(--accent);
  transform: translateX(4px);
}

/* DAS STUDIO ----------------------------------------------------------- */
.about {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: clamp(2rem, 5vw, 4rem);
  margin-top: clamp(2rem, 4vw, 3rem);
  align-items: start;
}
.timeline {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  margin-top: 1.4rem;
  border-left: 1px solid var(--line);
  padding-left: 1.4rem;
}
.timeline__period {
  font-weight: 800;
  font-size: 0.95rem;
}
.about__quote {
  margin-top: 2.2rem;
}
.stackgroups {
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  margin-top: 1.4rem;
}
.stackgroups__label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--metal);
}
.stackgroups__items {
  margin-top: 0.7rem;
}
.about__note {
  margin-top: 2rem;
}

/* WISSEN --------------------------------------------------------------- */
.guide {
  display: flex;
  flex-direction: column;
  transition: border-color 0.3s var(--ease), transform 0.35s var(--ease);
}
.guide:hover {
  border-color: var(--accent);
  transform: translateY(-3px);
}
.guide__kicker {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--accent);
}
.guide__title {
  margin-top: 0.7rem;
  font-family: "Syne", ui-sans-serif, system-ui, sans-serif;
  font-weight: 800;
  letter-spacing: -0.01em;
  font-size: 1.2rem;
}
.guide__text {
  flex: 1;
}
.guide__more {
  margin-top: 1.4rem;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--accent);
}

/* KONTAKT -------------------------------------------------------------- */
.channel {
  transition: border-color 0.3s var(--ease), transform 0.35s var(--ease);
}
.channel:hover {
  border-color: var(--accent);
  transform: translateY(-3px);
}
.channel__link {
  margin-top: 1.4rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--accent);
  overflow-wrap: anywhere;
}

@media (max-width: 960px) {
  .grid-3 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .about {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 680px) {
  .grid-2,
  .grid-3,
  .facts {
    grid-template-columns: 1fr;
  }
  .case__arrow {
    display: none;
  }
}
</style>
