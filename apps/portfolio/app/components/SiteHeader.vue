<script setup lang="ts">
const { t, locale } = useI18n()
const localePath = useLocalePath()
const switchLocalePath = useSwitchLocalePath()
const { trackFunnel } = useFunnelEvent()

/**
 * Der Sprachwechsler zeigt BEIDE Sprachen mit aktivem Zustand (statt nur des
 * Ziels wie in der Fußzeile): in der Kopfzeile muss auf einen Blick lesbar
 * sein, wo man steht UND wohin man kann. Ziel ist immer DIESELBE Seite in der
 * anderen Sprache (switchLocalePath); das i18n_redirected-Cookie zieht
 * nuxt-i18n beim Wechsel selbst nach, die Wahl bleibt also über Besuche
 * hinweg bestehen.
 */
const isGerman = computed(() => locale.value.startsWith('de'))

/**
 * Navigation nach dem Muster der alten Site. `priority` steuert, was auf
 * schmalen Viewports zuerst verschwindet: die Kopfzeile darf NIE überlaufen,
 * und ein Burger-Menü wäre für fünf Anker ein eigener Zustand mehr, als diese
 * Seite verdient. Die Sprungziele bleiben über die Fußzeile erreichbar.
 */
const links = computed(() => [
  { to: '/#leistungen', label: t('portfolio.nav.services'), priority: 2 },
  { to: '/ux-audit', label: t('portfolio.nav.uxAudit'), priority: 1 },
  { to: '/#referenzen', label: t('portfolio.nav.references'), priority: 3 },
  { to: '/#wissen', label: t('portfolio.nav.knowledge'), priority: 2 },
  { to: '/#faq', label: t('portfolio.nav.faq'), priority: 3 },
])
</script>

<template>
  <header class="header">
    <div class="container header__inner">
      <NuxtLink :to="localePath('/')" class="header__brand">
        Pukalani <span class="header__brand-accent">Studio</span>
      </NuxtLink>
      <nav class="header__nav" :aria-label="t('portfolio.nav.label')">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="localePath(link.to)"
          class="header__link"
          :class="`header__link--p${link.priority}`"
        >
          {{ link.label }}
        </NuxtLink>
        <!-- EIN Conversion-Ziel (W1, 2026-08-21): jeder CTA dieser Site führt in
             den Erstgespräch-Wizard, nicht mehr direkt zu cal.com. Der
             Direktlink bleibt nur an zwei Stellen: in der Fußzeile für die
             Entschlossenen und auf der Erfolgsansicht des Wizards. -->
        <NuxtLink
          :to="localePath('/erstgespraech')"
          class="header__link header__link--cta"
          @click="trackFunnel('studio_cta_erstgespraech', { source: 'header' })"
        >
          {{ t('portfolio.nav.cta') }}
        </NuxtLink>
        <!-- Bewusst OHNE priority-Klasse: die Sprachwahl verschwindet auf
             keinem Viewport — eine zweisprachige Site, deren Wechsel nur in
             der Fußzeile lebt, wirkt einsprachig (Davids Befund 2026-08-22). -->
        <span class="header__lang" :aria-label="t('portfolio.nav.language')">
          <NuxtLink
            :to="switchLocalePath('de')"
            class="header__lang-link"
            :class="{ 'header__lang-link--active': isGerman }"
            :aria-current="isGerman ? 'true' : undefined"
          >DE</NuxtLink>
          <span class="header__lang-sep" aria-hidden="true">/</span>
          <NuxtLink
            :to="switchLocalePath('en')"
            class="header__lang-link"
            :class="{ 'header__lang-link--active': !isGerman }"
            :aria-current="!isGerman ? 'true' : undefined"
          >EN</NuxtLink>
        </span>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.header {
  position: fixed;
  inset-inline: 0;
  top: 0;
  z-index: 20;
  backdrop-filter: blur(12px);
  background: color-mix(in srgb, var(--bg) 78%, transparent);
  border-bottom: 1px solid var(--line);
}
.header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 4.5rem;
}
.header__brand {
  font-weight: 800;
  letter-spacing: -0.02em;
  font-size: 1.05rem;
  white-space: nowrap;
}
.header__brand-accent {
  color: var(--accent);
}
.header__nav {
  display: flex;
  align-items: center;
  gap: clamp(0.9rem, 2.2vw, 1.8rem);
}
.header__link {
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  white-space: nowrap;
  color: var(--text-soft);
  transition: color 0.3s var(--ease);
}
.header__link:hover {
  color: var(--accent);
}
.header__link--cta {
  color: var(--accent);
}
.header__link--cta:hover {
  color: var(--text);
}
.header__lang {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.14em;
  white-space: nowrap;
}
.header__lang-link {
  color: var(--metal-text);
  transition: color 0.3s var(--ease);
}
.header__lang-link:hover {
  color: var(--accent);
}
.header__lang-link--active {
  color: var(--text);
}
.header__lang-sep {
  color: var(--metal-text);
}
/* Gestaffeltes Ausblenden statt Umbruch — die Kopfzeile bleibt einzeilig. */
@media (max-width: 1080px) {
  .header__link--p3 {
    display: none;
  }
}
@media (max-width: 820px) {
  .header__link--p2 {
    display: none;
  }
}
@media (max-width: 520px) {
  .header__link--p1 {
    display: none;
  }
}
/* Schmale Telefone (Review-Befund B2, 2026-11-22): auf Deutsch lief „EN" bei
   375 px über den Rand (rechte Kante 388 px). Übrig sind hier nur Marke,
   „Erstgespräch" und DE/EN — die rücken enger zusammen, statt dass etwas
   verschwindet. Gemessen bei 360 und 375 px auf /de. */
@media (max-width: 420px) {
  .header__inner {
    gap: 0.5rem;
  }
  .header__brand {
    font-size: 0.95rem;
  }
  .header__nav {
    gap: 0.6rem;
  }
  .header__link,
  .header__lang {
    letter-spacing: 0.04em;
  }
  .header__lang {
    gap: 0.25rem;
  }
}
</style>
