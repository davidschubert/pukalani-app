<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

/**
 * `/account` — die KONTO-Seite für Kundinnen und Kunden von branding.supply
 * (Davids Entscheidung 2026-11-09, Plan docs/plans/BRAND-INSIGHTS-KURATION.md
 * §20 „Befunde").
 *
 * ── WARUM ES DIESE HÜLLE GIBT ────────────────────────────────────────────
 * Der Menüpunkt „Konto" in `BwSiteNav` zeigte seit der admin-Montage
 * (2026-09-03) auf `/dashboard/settings`. Diese Seite hängt an der
 * admin-Middleware und verlangt `dashboard.access` — jedes Konto OHNE
 * admin/moderator-Label bekam ein 403. Kunden hatten damit keine Profil-,
 * Sicherheits-, Sitzungs-, Benachrichtigungs- oder Datenseite, obwohl seit
 * BI2 K7 Antwort-Benachrichtigungen für sie entstehen.
 *
 * ── ZWEI HÜLLEN, EINE IMPLEMENTIERUNG ────────────────────────────────────
 * Dasselbe Muster wie `/settings` im onboarding-Layer: jeder Reiter rendert
 * genau die Core-Komponente, die auch im Dashboard steht. Was hier steht, sind
 * Wege, keine Formulare — wer ein Feld ergänzt, ergänzt es in der Komponente.
 * Die Routen dahinter (`/api/auth/*`, `/api/account/handle`) gehören core und
 * verlangen nur eine Sitzung.
 *
 * Bewusst NICHT die Dashboard-Hülle für alle geöffnet: das hätte JEDE App mit
 * admin-Layer verändert und Kunden in eine Betreiber-Shell mit leerer
 * Seitenleiste gesetzt. Kein Reiter „Navigation" (das ist die Dashboard-Nav
 * eines Betreibers), keine Reiter-Registry (es gibt nichts zu filtern).
 *
 * Layout `default` = auf branding.supply die EINE Kopfzeile `BwSiteNav`.
 */
definePageMeta({ layout: 'default', middleware: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()

const links = computed<NavigationMenuItem[]>(() => [
  { label: t('brand.account.tabs.profile'), icon: 'i-ph-user-circle', to: localePath('/account'), exact: true },
  { label: t('brand.account.tabs.security'), icon: 'i-ph-shield', to: localePath('/account/security') },
  { label: t('brand.account.tabs.sessions'), icon: 'i-ph-devices', to: localePath('/account/sessions') },
  { label: t('brand.account.tabs.notifications'), icon: 'i-ph-bell', to: localePath('/account/notifications') },
  { label: t('brand.account.tabs.data'), icon: 'i-ph-database', to: localePath('/account/data') },
])
</script>

<template>
  <div class="bw-root">
    <div class="mx-auto w-full max-w-5xl space-y-6 pb-16">
      <div>
        <h1 class="text-2xl font-semibold">{{ t('brand.account.title') }}</h1>
        <p class="mt-1 text-sm" style="color: var(--bw-muted)">{{ t('brand.account.subtitle') }}</p>
      </div>

      <!-- Fünf Reiter passen auf 375 px nicht nebeneinander: ohne `shrink-0`
           kürzt Nuxt UI jede Beschriftung auf „S…" (Klickbeweis 2026-11-09).
           Die Leiste scrollt stattdessen seitlich, die Seite selbst nicht. -->
      <UNavigationMenu :items="links" highlight class="-mx-1 overflow-x-auto" :ui="{ item: 'shrink-0' }" />

      <!-- Dieselben Abstände wie in den beiden anderen Hüllen: die Karten
           sind Geschwister eines flex-Containers, und AuthAccountDataPanel
           verlässt sich darauf (es bringt bewusst keinen eigenen Wrapper mit). -->
      <div class="flex w-full flex-col gap-4 sm:gap-6">
        <NuxtPage />
      </div>
    </div>
  </div>
</template>
