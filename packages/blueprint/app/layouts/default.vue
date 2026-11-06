<script setup lang="ts">
/**
 * DAS Community-Layout (Layout-Konsolidierung Audit S9, Davids Entscheidungen
 * 2026-07-27): ersetzt die App-Overrides von comments und platform — beide
 * Apps extenden blueprint und bekommen exakt dieselbe Hülle. Aufbau:
 *
 *  - core-Hülle (max-w-(--ui-container)) + CoreDemoBanner (config-gated, pukalani.demo) +
 *    AuthEmailVerifyBanner
 *  - Header: Brand (useBrandName-Kette: Tenant vor App-Brand) · Inline-Nav
 *    mit Überlauf (ab >5 Einträgen wandert der Rest in ein „Mehr"-Dropdown,
 *    Entscheidung 1) · Utilities rechts · DisplaySettingsMenu statt
 *    CoreLocaleSwitcher (K7, Entscheidung 2 — kommt als themes-Utility)
 *  - Nav + Utilities kommen aus der Chrome-Registry (pukalani.chrome.nav /
 *    pukalani.chrome.utilities, core/shared/types/chrome.ts): ein Eintrag
 *    existiert genau dann, wenn sein Layer extended ist — der frühere
 *    „fehlt-in-platform"-Bruch ist damit strukturell weg. Zusätzliche
 *    Nav-Quelle: veröffentlichte CMS-Seiten des Mandanten (pages-Layer
 *    registriert pukalani.chrome.pagesNav).
 *  - Footer: Brand + Rechtslinks + optionaler Changelog-Link (Entscheidung 3).
 *    Rechtslinks: CMS-Seiten mit Legal-Slugs des Tenants zuerst (Entscheidung
 *    5 — der Kunde pflegt Impressum/Datenschutz selbst), sonst der
 *    pukalani.legalLinks-Fallback aus der App-Config (Demo → pukalani.app).
 *
 * Das core-default-Layout bleibt unverändert die Basis für Apps OHNE
 * blueprint (control/photos/portfolio/marketing/_template).
 */
import type { DropdownMenuItem } from '@nuxt/ui'
import { isProductStateEnabled } from '../../../core/shared/types/config'
import type { PukalaniChromeUtility } from '../../../core/shared/types/chrome'
import type { CommunityNavItem } from '../../../core/shared/communityNavigation'
import { isLegalPageSlug, navMenuChildren } from '../../../core/shared/communityNavigation'

const { t } = useI18n()
const localePath = useLocalePath()
const { isLoggedIn } = useCurrentUser()
const appConfig = useAppConfig()
const brand = useBrandName()

// Laufzeit-Produkt-Gates (F2): nur Ausblenden — die Autorität ist die
// core product-gate-Middleware (gleicher Mechanismus wie die Dashboard-Nav).
const runtimeFlags = useRuntimeFlags()
const productOn = (productKey?: string) =>
  !productKey || isProductStateEnabled(runtimeFlags.value.products[productKey])

type ChromeConfig = {
  utilities?: Record<string, PukalaniChromeUtility | false>
  changelogLink?: boolean
}
const chrome = computed<ChromeConfig>(() => (appConfig.pukalani as { chrome?: ChromeConfig }).chrome ?? {})
const legalLinks = computed(() => appConfig.pukalani?.legalLinks ?? [])

/**
 * DAS MENÜ KOMMT SEIT DEM 2026-09-08 AUS `useCommunityNav()` (U15 Teil 3).
 *
 * Hier standen bis dahin rund 60 Zeilen: zwei Abrufe, die Registry-Gates, die
 * CMS-Filter und die Auflösung. Dieselben Zeilen standen im
 * Navigations-Editor, und `BwSiteNav` (branding.supply) hätte sie ein drittes
 * Mal gebraucht. Jetzt liegen sie EINMAL in core (Begründung ausgeschrieben im
 * Kopf des Composables); dieses Layout ist nur noch ein RENDERER.
 *
 * `pages` (die rohen CMS-Seiten) kommt mit, weil der Fuß daraus die
 * Rechtsseiten zieht — dieselbe Antwort aus derselben Abfrage, statt eines
 * zweiten Abrufs daneben.
 */
const { items: navItems, pages: navPages } = useCommunityNav()

// Rechts-Slugs (Entscheidung 5): diese CMS-Seiten gehören in den Footer,
// nicht in die Haupt-Nav. Die Liste stand hier als eigenes Array und in der
// Fußzeile von apps/portfolio ein zweites Mal, unterschiedlich lang — `terms`
// und `agb` fehlten hier und landeten deshalb in der HAUPTNAVIGATION. Jetzt
// EINE Quelle: core/shared/communityNavigation.ts.
const cmsLegalPages = computed(() =>
  (navPages.value ?? []).filter(page => page.slug !== 'home' && isLegalPageSlug(page.slug)))

/**
 * Überlauf (Entscheidung 1): bis 5 Einträge inline; darüber bleiben 4 stehen
 * und der Rest wandert in ein „Mehr"-Dropdown.
 *
 * ZÄHLT HAUPTPUNKTE, und zwar ohne Zutun (Zusage 8, U15 Teil 3): Kinder hängen
 * in `item.children` und stehen gar nicht in dieser Liste. Ein Hauptpunkt mit
 * drei Unterpunkten belegt also einen Platz in der Reihe, nicht vier.
 */
const MAX_INLINE = 5
const hasOverflow = computed(() => navItems.value.length > MAX_INLINE)
const inlineNav = computed(() => (hasOverflow.value ? navItems.value.slice(0, MAX_INLINE - 1) : navItems.value))

/** Ein Eintrag als Dropdown-Zeile — für das „Mehr"-Menü und für Unterpunkte. */
function toDropdownItem(item: CommunityNavItem): DropdownMenuItem {
  return {
    label: item.label,
    icon: item.icon,
    to: item.to,
    // Ein eigener externer Link trägt im Dropdown dieselbe Absicherung wie
    // in der Reihe: neuer Tab, und `rel="noopener"` nimmt der Zielseite den
    // `window.opener`-Griff auf die Community.
    ...(item.external ? { target: '_blank' as const, rel: 'noopener' } : {}),
  }
}

/**
 * Die Unterpunkte eines Hauptpunkts als Dropdown-Einträge.
 *
 * `navMenuChildren()` und nicht `item.children`: hat der Hauptpunkt ein eigenes
 * Ziel, steht er dort SELBST als erster Eintrag — sonst wäre sein Ziel für
 * jeden unerreichbar, der den Aufklapper öffnet, statt ihn zu überspringen.
 * Die Entscheidung liegt in core, damit beide Renderer sie gleich treffen.
 */
function childItems(item: CommunityNavItem): DropdownMenuItem[] {
  return navMenuChildren(item).map(toDropdownItem)
}

/**
 * Im „Mehr"-Menü wird ein Hauptpunkt mit Kindern zu einem Untermenü
 * (`children` versteht `UDropdownMenu` selbst) — sonst verlöre der Überlauf
 * genau die Einträge, die ein Owner bewusst gruppiert hat.
 */
const overflowNav = computed<DropdownMenuItem[]>(() =>
  hasOverflow.value
    ? navItems.value.slice(MAX_INLINE - 1).map(item => (item.children?.length
        ? { label: item.label, icon: item.icon, children: childItems(item) }
        : toDropdownItem(item)))
    : [])

// Utilities (Komponenten global registriert — `.global.vue`): Zone 'menu'
// rechts im Header, Zone 'overlay' (schwebende Widgets) außerhalb.
const utilities = computed(() =>
  Object.entries(chrome.value.utilities ?? {})
    .filter((pair): pair is [string, PukalaniChromeUtility] => pair[1] !== false && !!pair[1])
    .filter(([, u]) => productOn(u.productKey))
    .filter(([, u]) => !u.requiresAuth || isLoggedIn.value)
    .map(([id, u]) => ({ id, component: u.component, order: u.order ?? 50, zone: u.zone ?? 'menu' }))
    .sort((a, b) => a.order - b.order))
const menuUtilities = computed(() => utilities.value.filter(u => u.zone === 'menu'))
const overlayUtilities = computed(() => utilities.value.filter(u => u.zone === 'overlay'))

// Footer-Rechtslinks: CMS-Seiten des Tenants zuerst, sonst der Config-
// Fallback. Absolute URLs (Demo → pukalani.app-Impressum) NICHT durch
// localePath schicken — das ist ein externer Link.
const footerLegal = computed(() => {
  if (cmsLegalPages.value.length) {
    return cmsLegalPages.value.map(page => ({ key: page.slug, label: page.title, to: localePath(`/${page.slug}`) }))
  }
  return legalLinks.value.map(link => ({
    key: link.to,
    label: t(link.labelKey),
    to: /^https?:\/\//.test(link.to) ? link.to : localePath(link.to),
  }))
})
const showChangelog = computed(() => chrome.value.changelogLink === true)
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <CoreDemoBanner />
    <AuthEmailVerifyBanner />
    <header class="border-b border-default">
      <nav data-testid="main-nav" class="mx-auto flex w-full max-w-(--ui-container) items-center justify-between gap-4 p-4">
        <div class="flex min-w-0 items-center gap-6">
          <NuxtLink :to="localePath('/')" class="shrink-0 font-bold tracking-tight">{{ brand }}</NuxtLink>
          <div data-testid="chrome-nav" class="flex items-center gap-4 overflow-x-auto text-sm">
            <template v-for="item in inlineNav" :key="item.id">
              <!-- HAUPTPUNKT MIT UNTERPUNKTEN (U15 Teil 3, 2026-09-08):
                   dasselbe Bauteil wie das „Mehr"-Menü daneben, damit ein
                   Aufklapper auf dieser Seite überall gleich aussieht und
                   gleich mit der Tastatur zu bedienen ist. Der Auslöser trägt
                   `data-nav-group`, weil ein Beweis sonst nur sein WORT sieht
                   und nicht, dass es ein Aufklapper ist. -->
              <UDropdownMenu v-if="item.children?.length" :items="childItems(item)">
                <UButton
                  :label="item.label"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  trailing-icon="i-ph-caret-down"
                  :data-nav-group="item.id"
                />
              </UDropdownMenu>
              <!-- Eigener EXTERNER Link (U15): bewusst ein rohes <a> statt
                   NuxtLink — neuer Tab und `rel="noopener"` sollen wörtlich im
                   HTML stehen und nicht davon abhängen, was NuxtLink für eine
                   absolute Adresse selbst ergänzt. -->
              <a
                v-else-if="item.external"
                :href="item.to"
                target="_blank"
                rel="noopener"
                data-nav-external="true"
                class="flex items-center gap-1.5 whitespace-nowrap text-muted hover:text-default"
              >
                {{ item.label }}
              </a>
              <NuxtLink
                v-else
                :to="item.to"
                class="flex items-center gap-1.5 whitespace-nowrap text-muted hover:text-default"
              >
                {{ item.label }}
                <CorePlanBadge v-if="item.planProduct" :product="item.planProduct" />
              </NuxtLink>
            </template>
            <UDropdownMenu v-if="hasOverflow" :items="overflowNav">
              <UButton
                :label="t('ui.more')"
                color="neutral"
                variant="ghost"
                size="sm"
                trailing-icon="i-ph-caret-down"
                data-testid="chrome-nav-more"
              />
            </UDropdownMenu>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <component :is="u.component" v-for="u in menuUtilities" :key="u.id" />
          <UserMenu v-if="isLoggedIn" />
          <UButton v-else :to="localePath('/login')" color="neutral" variant="ghost">{{ t('auth.login.title') }}</UButton>
        </div>
      </nav>
    </header>

    <main class="mx-auto w-full max-w-(--ui-container) flex-1 p-4">
      <slot />
    </main>

    <footer class="border-t border-default">
      <div class="mx-auto flex w-full max-w-(--ui-container) flex-col gap-2 p-4 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <span>{{ brand }}</span>
        <nav v-if="footerLegal.length || showChangelog" class="flex flex-wrap gap-x-4 gap-y-1">
          <NuxtLink
            v-for="link in footerLegal"
            :key="link.key"
            :to="link.to"
            class="hover:text-default"
          >
            {{ link.label }}
          </NuxtLink>
          <NuxtLink v-if="showChangelog" :to="localePath('/changelog')" class="hover:text-default">
            {{ t('changelog.title') }}
          </NuxtLink>
        </nav>
      </div>
    </footer>

    <!-- Schwebende Widgets (z. B. FeedbackButton, fixed-positioniert) -->
    <component :is="u.component" v-for="u in overlayUtilities" :key="u.id" />

    <ConsentCookieBanner />
  </div>
</template>
