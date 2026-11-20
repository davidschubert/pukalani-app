<script setup lang="ts">
import { isLegalPageSlug, type PublicPageNavItem } from '../../../../packages/pages/shared/types/page'
import { CONTACT } from '../data/contact'
import { SERVICE_CORES } from '../data/services'

const { t, locale } = useI18n()
const localePath = useLocalePath()
const switchLocalePath = useSwitchLocalePath()
const appConfig = useAppConfig() as { pukalani?: { chrome?: { pagesNav?: boolean } } }

const isGerman = computed(() => locale.value.startsWith('de'))
const lang = computed<'de' | 'en'>(() => (isGerman.value ? 'de' : 'en'))

/**
 * Rechtsseiten aus dem pages-CMS (Muster blueprint-Layout): nur VERÖFFENT-
 * LICHTES erscheint — ein Entwurf im Dashboard erzeugt keinen toten Link.
 * useRequestFetch, damit SSR den Host-Header weiterreicht.
 *
 * Gefragt wird nur, wenn der pages-Layer überhaupt dabei ist (er registriert
 * `pukalani.chrome.pagesNav` — dieselbe Wache wie im blueprint-Layout): sonst
 * liefe je Seitenaufbau eine Anfrage gegen eine Route, die es nicht gibt.
 *
 * DREI ZUSTÄNDE, NICHT ZWEI: `null` heißt „die Anfrage ist GESCHEITERT", `[]`
 * heißt „es ist nichts veröffentlicht". Vorher fielen beide auf `[]` zusammen
 * — und das ist der teurere von zwei Fehlern: bei einem Appwrite-Schluckauf
 * verschwand der Impressums-Link einer deutschen Geschäftsseite still aus dem
 * Fuß. Ein Link, der im Ausfall auf eine 404 zeigt, ist besser als kein
 * Impressums-Link; deshalb der feste Rückfall unten. Wer bewusst NICHTS
 * veröffentlicht hat, bekommt weiterhin nichts — das ist eine Entscheidung,
 * kein Ausfall.
 */
const pagesNavEnabled = appConfig.pukalani?.chrome?.pagesNav === true
const requestFetch = useRequestFetch()
const { data: publicPages } = await useAsyncData(
  () => `footer-legal-pages-${locale.value}`,
  () => pagesNavEnabled
    ? requestFetch<PublicPageNavItem[]>('/api/pages/public', { query: { locale: locale.value } })
        .catch(() => null)
    : Promise.resolve([] as PublicPageNavItem[]),
  { watch: [locale] },
)

/** Der Rückfall für den Ausfall (siehe oben) — die zwei Pflichtseiten. */
const LEGAL_FALLBACK: Record<'de' | 'en', PublicPageNavItem[]> = {
  de: [
    { slug: 'imprint', title: 'Impressum', sortOrder: 90 },
    { slug: 'privacy', title: 'Datenschutz', sortOrder: 91 },
  ],
  en: [
    { slug: 'imprint', title: 'Imprint', sortOrder: 90 },
    { slug: 'privacy', title: 'Privacy', sortOrder: 91 },
  ],
}

const legalPages = computed(() => {
  const pages = publicPages.value
  // Nur das ausdrückliche `null` ist der Ausfall. `undefined` heißt „noch
  // nicht gelaufen" (der Zustand vor dem ersten Auflösen) — dort den
  // Rückfall zu zeigen hiesse, ihn beim Nachladen wieder wegzunehmen.
  if (pages === null) return LEGAL_FALLBACK[lang.value]
  return (pages ?? []).filter(page => isLegalPageSlug(page.slug))
})

/** Sprachwechsel: Ziel ist immer die ANDERE Sprache derselben Seite. */
const otherLocale = computed(() => (isGerman.value ? 'en' : 'de'))
const otherLocaleLabel = computed(() =>
  isGerman.value ? t('portfolio.footer.langEn') : t('portfolio.footer.langDe'),
)

/**
 * Die Leistungen im Fuß kommen aus DENSELBEN Daten wie die Karten auf der
 * Startseite und der OfferCatalog im JSON-LD.
 *
 * Vorher waren es sechs i18n-Schlüssel, die die Titel aus `home.ts`
 * nachbildeten — und sie waren bereits abgewandert: der Fuß sagte englisch
 * „Design concept & brand design", die Daten sagen „… & digital brand
 * design". Ein Fuß, der eine Leistung anders nennt als die Seite, auf die er
 * zeigt, ist ein Widerspruch im selben Dokument.
 *
 * GEZOGEN WIRD NUR `services.ts`, NIE `home.ts`: dieser Fuß hängt im
 * `site`-Layout, sein Import landet also im JS JEDER Seite. Über `home.ts`
 * kamen dort die kompletten Startseiten-Inhalte mit (FAQ, Case Studies,
 * Timeline — 15 KiB gzip für sechs Wörter). `services.ts` trägt genau Id,
 * Titel und Detailseite; die eine Quelle je Fakt bleibt dadurch unberührt,
 * denn `home.ts` reichert DIESELBE Liste nur an.
 *
 * `link` (eigene Detailseite) schlägt den Anker auf der Startseite; die
 * Anker-Ids sind laut `services.ts` fest und werden nie umbenannt.
 */
const serviceLinks = computed(() => [
  ...SERVICE_CORES.map(service => ({
    to: service.link ?? `/#${service.id}`,
    label: service.title[lang.value],
  })),
  // KEIN Eintrag in SERVICES: die Entwickler-Seite ist kein Angebot aus dem
  // Katalog, sondern eine eigene Zielgruppen-Seite (Agenturen, Entwickler-
  // teams). Ihre Beschriftung hat deshalb keine Entsprechung in den Daten und
  // bleibt der einzige verbliebene `footer.links.*`-Schlüssel dieser Spalte.
  { to: '/nuxt-entwickler-freelancer', label: t('portfolio.footer.links.development') },
])

const knowledgeLinks = computed(() => [
  { to: '/wissen/was-kostet-ux-design', label: t('portfolio.footer.links.costs') },
  { to: '/wissen/freelancer-oder-agentur', label: t('portfolio.footer.links.comparison') },
  { to: '/#faq', label: t('portfolio.nav.faq') },
])
</script>

<template>
  <footer class="footer">
    <div class="container footer__grid">
      <div class="footer__brandcol">
        <p class="footer__brand">Pukalani Studio</p>
        <p class="footer__about">{{ t('portfolio.footer.about') }}</p>
        <p class="footer__available">
          <span class="footer__dot" aria-hidden="true" />
          {{ t('portfolio.footer.available') }}
        </p>
        <ul class="footer__social" :aria-label="t('portfolio.footer.profiles')">
          <li><a href="https://www.linkedin.com/in/davidschubert-uiux/" target="_blank" rel="noopener me" class="footer__link">LinkedIn</a></li>
          <li><a href="https://github.com/davidschubert" target="_blank" rel="noopener me" class="footer__link">GitHub</a></li>
          <li><a href="https://www.instagram.com/davidschubert/" target="_blank" rel="noopener me" class="footer__link">Instagram</a></li>
        </ul>
      </div>

      <nav :aria-label="t('portfolio.footer.services')">
        <p class="footer__heading">{{ t('portfolio.footer.services') }}</p>
        <ul class="footer__list">
          <li v-for="link in serviceLinks" :key="link.to">
            <NuxtLink :to="localePath(link.to)" class="footer__link">{{ link.label }}</NuxtLink>
          </li>
        </ul>
      </nav>

      <nav :aria-label="t('portfolio.footer.knowledge')">
        <p class="footer__heading">{{ t('portfolio.footer.knowledge') }}</p>
        <ul class="footer__list">
          <li v-for="link in knowledgeLinks" :key="link.to">
            <NuxtLink :to="localePath(link.to)" class="footer__link">{{ link.label }}</NuxtLink>
          </li>
          <li>
            <NuxtLink :to="switchLocalePath(otherLocale)" class="footer__link">{{ otherLocaleLabel }}</NuxtLink>
          </li>
        </ul>
      </nav>

      <address class="footer__contact" :aria-label="t('portfolio.footer.contact')">
        <p class="footer__heading">{{ t('portfolio.footer.contact') }}</p>
        <ul class="footer__list">
          <li><a :href="`mailto:${CONTACT.email}`" class="footer__link">{{ CONTACT.email }}</a></li>
          <li><a :href="`tel:${CONTACT.phoneTel}`" class="footer__link">{{ CONTACT.phoneHuman }}</a></li>
          <li>
            <a :href="CONTACT.calLink" target="_blank" rel="noopener nofollow" class="footer__link">
              {{ t('portfolio.footer.book') }}
            </a>
          </li>
          <li class="footer__muted">{{ CONTACT.location[lang] }}</li>
        </ul>
      </address>
    </div>

    <div class="container footer__base">
      <p class="footer__muted">© {{ new Date().getFullYear() }} David Schubert · Pukalani Studio. {{ t('portfolio.footer.rights') }}</p>
      <p class="footer__muted">
        <template v-for="page in legalPages" :key="page.slug">
          <NuxtLink :to="localePath(`/${page.slug}`)" class="footer__link">{{ page.title }}</NuxtLink>
          <span aria-hidden="true"> · </span>
        </template>
        {{ t('portfolio.footer.updated') }} {{ CONTACT.lastUpdatedHuman[lang] }}
      </p>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  border-top: 1px solid var(--line);
  padding-block: clamp(3rem, 6vw, 4.5rem) 2rem;
  background: var(--bg-soft);
}
.footer__grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr 1fr;
  gap: clamp(2rem, 4vw, 3.5rem);
  align-items: start;
}
.footer__brand {
  font-family: "Syne", ui-sans-serif, system-ui, sans-serif;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: -0.01em;
  font-size: 1.1rem;
}
.footer__about {
  margin-top: 0.9rem;
  color: var(--text-soft);
  font-size: 0.88rem;
  max-width: 42ch;
}
.footer__available {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  margin-top: 1.1rem;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  border-radius: 999px;
  padding: 0.3rem 0.9rem;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--accent);
}
.footer__dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 999px;
  background: var(--accent);
}
.footer__social,
.footer__list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1.1rem;
}
.footer__social {
  flex-direction: row;
  gap: 1.2rem;
}
.footer__heading {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--metal-text);
}
.footer__link {
  font-size: 0.88rem;
  color: var(--text-soft);
  transition: color 0.3s var(--ease);
}
.footer__link:hover {
  color: var(--accent);
}
.footer__contact {
  font-style: normal;
}
.footer__muted {
  color: var(--metal-text);
  font-size: 0.8rem;
}
.footer__base {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: clamp(2.5rem, 5vw, 3.5rem);
  padding-top: 1.6rem;
  border-top: 1px solid var(--line);
}
@media (max-width: 900px) {
  .footer__grid {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 560px) {
  .footer__grid {
    grid-template-columns: 1fr;
  }
}
</style>
