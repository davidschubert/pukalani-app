<script setup lang="ts">
/** Übergeordnete Header-Navigation für alle Seiten (Meine Brands ·
 *  Discover · Journal) — inkl. Konto-Menü (Runde 132, David): das
 *  Avatar-Menü wohnt DAUERHAFT hier oben rechts, nicht mehr in der
 *  Werkstatt-Topbar. */
import type { NavigationMenuItem } from '@nuxt/ui'
import { navMenuChildren } from '../../../core/shared/communityNavigation'
import type { BwNewBrandSubmit } from './BwNewBrandModal.vue'

const route = useRoute()
/* Die Beschriftungen laufen seit 2026-09-01 über i18n (`brand.nav.*`) —
 * vorher standen sie fest deutsch auch auf der englischen Oberfläche.
 * AUSNAHME und Davids Design: die vier Hauptpunkte heißen in BEIDEN
 * Sprachen englisch (Products · Discover Brands · Brand Insights · About),
 * ebenso die sieben Produktnamen im Aufklapper — übersetzt sind nur ihre
 * Beschreibungen. */
const { t } = useI18n()
/* Reihenfolge (Runde 135, Empfehlung bestätigt): öffentlich → persönlich.
 * Discover und Journal sind die Außenwelt, Meine Brands steht als
 * persönlicher Bereich rechts — direkt neben seiner Aktion (Neue Brand)
 * und dem Konto. */
/* Runde 170 (David): „Our Products" als Dropdown im Nuxt-UI-Muster —
 * UNavigationMenu mit Kindern (Icon + Titel + Beschreibung). */
const localePath = useLocalePath()

/**
 * NUR ECHTE ZIELE (Davids 404-Audit 2026-09-03): „Products" (samt der sieben
 * Dropdown-Kinder), „Discover Brands" und „Brand Insights" zeigten auf
 * `/products` (404) bzw. die Klickdummy-Pfade `/brand/demo/*` — die fängt in
 * der echten App die Werkstatt-Route als profileId='demo' und rendert eine
 * leere „Namenloses Branding"-Hülle.
 *
 * „DISCOVER BRANDS" IST SEIT PAKET D2 (2026-09-08) ZURÜCK: `/discover` und
 * `/discover/<slug>` gibt es wirklich, samt öffentlicher Lese-API.
 *
 * „PRODUCTS" IST SEIT PS1 (2026-09-09) ZURÜCK — und zwar mit denselben
 * Bedingungen, unter denen es gegangen war: die Übersicht `/products` und die
 * fünf Produktseiten darunter gibt es wirklich (`apps/branding`, deutsche
 * Slugs unter `/de/produkte/…`). Die Einträge trägt die APP in ihre
 * `app.config` ein, nicht dieser Layer: ein Layer darf die anderen
 * Produkt-Layer nicht kennen (A14), die App kennt laut `site.manifest.ts` alle
 * ihre Produkte. INSIGHTS BLEIBT DRAUSSEN, bis seine Seite existiert (der
 * i18n-Schlüssel `brand.nav.insights` bleibt dafür stehen).
 *
 * ── DIE LISTE IST SEIT DEM 2026-09-08 NICHT MEHR FEST (U15 Teil 3) ─────────
 * Hier standen drei hartkodierte Einträge, und daneben gab es unter
 * /dashboard/community/navigation einen Navigations-Editor, der auf dieser Site
 * NICHTS anbot und dessen Ergebnis niemand las — ein Schalter ohne Draht. Jetzt
 * kommen die Einträge aus `useCommunityNav()`: Registry (`pukalani.chrome.nav`,
 * eingetragen in `app/app.config.ts` dieses Layers) + veröffentlichte
 * CMS-Seiten, danach die gespeicherte Wahl des Betreibers. Dieselbe Rechnung,
 * dieselbe Regel und dieselben Zusagen wie auf jedem Pool-Host
 * (PRODUKT-BILANZ: Pool und Silo zeigen identisches Produktverhalten).
 *
 * Links IMMER über `localePath()` — nackte Pfade warfen den Besucher von /de
 * auf die englische Fassung. Das tut jetzt das Composable (`candidate.to`).
 */
const { items } = useCommunityNav()

/**
 * Steht der Besucher gerade auf diesem Eintrag?
 *
 * `startsWith(to + '/')` statt des früheren `route.path.includes('/discover')`:
 * die Anatomie `/discover/<slug>` gehört zu diesem Punkt (ein Menü, das auf der
 * Unterseite ausgeht, sieht wie ein anderer Bereich aus), aber `includes` traf
 * auch jeden fremden Pfad, in dem das Wort irgendwo vorkommt — und die Ziele
 * sind jetzt frei wählbar, nicht mehr drei bekannte.
 *
 * Die Startseite (und ihre `/de`-Fassung) wird bewusst nur EXAKT aktiv: sonst
 * wäre ein eigener Link auf `/` auf jeder Seite hervorgehoben.
 */
function isActive(to: string): boolean {
  if (!to || to.startsWith('http')) return false
  if (route.path === to) return true
  if (to === '/' || /^\/[a-z]{2}$/.test(to)) return false
  return route.path.startsWith(`${to}/`)
}

/**
 * UNTERPUNKTE: `UNavigationMenu` versteht `children` selbst — waagerecht als
 * Aufklapper, im mobilen `#body`-Menü als Akkordeon.
 *
 * ── NACHGELESEN IN `node_modules/@nuxt/ui` (4.11.1), NICHT GERATEN ─────────
 * Ein Hauptpunkt MIT `to` UND `children` ist in `NavigationMenu.vue` kein
 * gewöhnlicher Link mehr: waagerecht rendert ihn die Komponente als
 * `NavigationMenuTrigger` (Reka UI), dessen Klick-Handler das Menü umschaltet
 * — das `href` bleibt zwar stehen, aber auf einem Touch-Gerät verbraucht der
 * Tipp den Klick und der Aufklapper öffnet sich nie. SENKRECHT ist es
 * schlimmer: mit `href` rendert die Komponente einen `NavigationMenuLink` statt
 * eines `AccordionTrigger`, es gibt also gar keinen Auslöser mehr — die Kinder
 * wären im mobilen Menü unerreichbar.
 *
 * Deshalb bekommt ein Hauptpunkt mit Kindern hier bewusst KEIN `to`, und sein
 * eigenes Ziel reist über `navMenuChildren()` als ERSTER Eintrag im Aufklapper
 * mit (core entscheidet das, damit beide Renderer es gleich tun). `active`
 * rechnet trotzdem den Hauptpunkt UND seine Kinder mit — die Hervorhebung soll
 * nicht verschwinden, nur weil das Ziel eine Etage tiefer steht.
 *
 * ── ICON UND BESCHREIBUNG JE KIND (PS1, 2026-09-09) ───────────────────────
 * Ebenfalls NACHGELESEN in `node_modules/@nuxt/ui` (4.11.1), nicht geraten:
 * WAAGERECHT rendert `NavigationMenu.vue` je Kind ein `childLinkIcon`
 * (`childItem.icon`) und unter dem Titel ein `childLinkDescription`
 * (`childItem.description`) — beides ohne weiteres Zutun, sobald die Felder am
 * Eintrag stehen. SENKRECHT (mobiles `#body`-Akkordeon) gibt es die
 * Beschreibung nicht: dort laufen die Kinder durch dieselbe Link-Vorlage wie
 * Hauptpunkte. Das ist kein Verlust, den man nachbauen müsste — auf einem
 * Telefon ist die Liste kurz und der Platz knapp.
 *
 * Woher die Werte kommen: `icon` stand schon in der Registry, `description` ist
 * seit PS1 der ÜBERSETZTE `descriptionKey` (core/shared/types/chrome.ts →
 * `useCommunityNav()`). Die Übersicht als erster Eintrag des Aufklappers trägt
 * bewusst keine Beschreibung: sie ist der Hauptpunkt selbst, und der hat
 * keinen `descriptionKey`.
 */
const menuItems = computed<NavigationMenuItem[]>(() => items.value.map((item) => {
  const children = navMenuChildren(item)
  if (children.length) {
    return {
      label: item.label,
      active: isActive(item.to) || children.some(child => isActive(child.to)),
      children: children.map(child => ({
        label: child.label,
        to: child.to,
        ...(child.icon ? { icon: child.icon } : {}),
        ...(child.description ? { description: child.description } : {}),
        ...(child.external ? { target: '_blank' as const, rel: 'noopener' } : {}),
      })),
    }
  }
  return {
    label: item.label,
    to: item.to,
    active: isActive(item.to),
    ...(item.external ? { target: '_blank' as const, rel: 'noopener' } : {}),
  }
}))

/* Neue Brand oeffnet das Start-Modal von jeder Seite aus — im LIVE-Modus
 * (2026-09-09, Davids Test): ohne Modus stand das Modal in der Demo und
 * führte nach der Anlage auf `/brand/demo/werte`. Anlage + Sprung ins erste
 * Kapitel kommen aus `useBrandCreate()`, wie auf der Brands-Übersicht. */
const newBrandOpen = ref(false)
const {
  contentLocales: newBrandLocales,
  creating: newBrandCreating,
  failed: newBrandFailed,
  create: createBrand,
} = useBrandCreate()

async function createFromModal(payload: BwNewBrandSubmit): Promise<void> {
  if (await createBrand(payload)) newBrandOpen.value = false
}

/* DAS KONTO IST ECHT (Nacht 2026-09-03): das Avatar trug ein hartkodiertes
 * „DS", „Abmelden" war ein toter Menüpunkt, und ein Gast sah ein Konto-Menü
 * ohne Konto. Jetzt: Initialen aus dem echten Konto (Name vor E-Mail),
 * Abmelden über den Core-Weg (useLogout), Gäste bekommen den Login-Knopf. */
const { user, isLoggedIn } = useCurrentUser()
const { logout } = useLogout()
const initials = computed(() => {
  const source = (user.value?.name || user.value?.email || '').trim()
  if (!source) return '?'
  const words = source.split(/\s+/).filter(Boolean)
  return words.length >= 2
    ? `${words[0]![0]}${words[1]![0]}`.toUpperCase()
    : source.slice(0, 2).toUpperCase()
})

/* Konto-Menü (aus BwWorkspace umgezogen): Sprachwechsel via
 * switchLocalePath, Erscheinungsbild nach Pukalani-Muster über
 * colorMode.preference. */
const { locale, locales } = useI18n()
const switchLocalePath = useSwitchLocalePath()
const LOCALE_FLAGS: Record<string, string> = { en: 'i-circle-flags-us', de: 'i-circle-flags-de' }
const colorMode = useColorMode()
/* Sprachnamen bleiben Eigennamen (de = en) — nur die drei
 * Erscheinungsbild-Beschriftungen laufen über i18n. */
const APPEARANCE = [
  ['light', 'brand.nav.theme.light', 'i-ph-sun'],
  ['dark', 'brand.nav.theme.dark', 'i-ph-moon'],
  ['system', 'brand.nav.theme.system', 'i-ph-monitor'],
] as const
const userMenu = computed(() => [[
  { label: t('brand.brands.title'), icon: 'i-ph-squares-four', to: localePath('/dashboard/brands') },
  /* „Brand-Scores" (P6c, Davids Auftrag 2026-09-06) steht DIREKT unter den
   * Brandings: es ist dieselbe Menge Brands, nur als Liste mit ihren Zahlen.
   * Er wohnt HIER und nicht in `pukalani.admin.modules` — die Registry rendert
   * ausschliesslich in der Betreiber-Shell (`layout: 'dashboard'`), und ein
   * Beta-Kunde hat keine `dashboard.access`-Capability. Sein Menüpunkt wäre
   * dort für genau die Menschen unsichtbar, für die die Seite gebaut ist. */
  { label: t('brand.myScores.list.nav'), icon: 'i-ph-gauge', to: localePath('/dashboard/brand-scores') },
  { label: t('brand.brands.new'), icon: 'i-ph-plus', onSelect: () => { newBrandOpen.value = true } },
], [
  {
    /* Ein Schlüssel JE SPRACHE — die Zeile nennt die aktive Sprache in
     * genau dieser Sprache („Sprache: Deutsch" / „Language: English"). */
    label: t('brand.nav.language'),
    icon: 'i-ph-globe-simple',
    children: locales.value.map(entry => ({
      label: entry.code === 'de' ? 'Deutsch' : 'English',
      icon: LOCALE_FLAGS[entry.code] ?? 'i-ph-globe-hemisphere-west',
      type: 'checkbox' as const,
      checked: entry.code === locale.value,
      to: switchLocalePath(entry.code),
    })),
  },
  {
    label: t('brand.nav.appearance'),
    icon: 'i-ph-sun-horizon',
    children: APPEARANCE.map(([mode, labelKey, icon]) => ({
      label: t(labelKey),
      icon,
      type: 'checkbox' as const,
      checked: colorMode.preference === mode,
      onSelect: (event: Event) => { event.preventDefault(); colorMode.preference = mode },
    })),
  },
], [
  /* Seit der admin-Montage (2026-09-03) sind das ECHTE Ziele: die
   * Konto-Seiten für jedes eingeloggte Konto, das Betreiber-Dashboard nur
   * für Konten mit `admin`/`moderator`-Label (dieselbe RBAC-Matrix, die
   * auch die Seite selbst durchsetzt — der Menüpunkt ist nur Sichtbarkeit,
   * nie die Grenze). */
  ...(userHasCapability(user.value, 'dashboard.access')
    ? [{ label: t('brand.nav.dashboard'), icon: 'i-ph-squares-four', to: localePath('/dashboard') }]
    : []),
  { label: t('brand.nav.account'), icon: 'i-ph-user-circle', to: localePath('/dashboard/settings') },
  { label: t('brand.nav.signOut'), icon: 'i-ph-sign-out', onSelect: () => { void logout() } },
]])
</script>

<template>
  <!-- Runde 178 (David): der Header IST Nuxt UIs UHeader — volle Breite,
       startet buendig oben, sticky und Mobile-Menue kommen mit. Farben
       laufen ueber unsere Tokens (Inline-Style schlaegt die Theme-Klassen). -->
  <!-- Das Logo führt zur Startseite — `/start` war der Klickdummy-Pfad und
       auf branding.supply ein 404 (Davids 404-Audit 2026-09-03). -->
  <UHeader
    :to="localePath('/')" class="bw-root -mx-6 mb-10"
    :ui="{ container: 'max-w-full px-6', title: 'flex items-center gap-2.5 text-sm font-semibold' }"
    style="background: color-mix(in srgb, var(--bw-paper) 88%, transparent); border-color: var(--bw-line)"
  >
    <template #title>
      <!-- Runde 181 (David, Referenz PLATSUPPLY): Kreis-Marke + Versal-
           Wortmarke, fette variable Geist mit weitem Tracking. -->
      <span class="grid size-8 flex-none place-items-center rounded-full" style="background: var(--bw-ink); color: var(--bw-paper)">
        <UIcon name="i-ph-fingerprint" class="size-5" />
      </span>
      <span class="whitespace-nowrap text-[18px]" style="color: var(--bw-ink); font-weight: 400; letter-spacing: -0.01em">Branding Supply</span>
    </template>

    <!-- `unmount-on-hide=false` (2026-09-08): Reka rendert den Inhalt eines
         Aufklappers sonst erst beim Öffnen — die Unterpunkte („Brand Score")
         stünden dann in KEINEM SSR-HTML, und ein Crawler fände den Link nur,
         wenn ihn eine Seite anderswo trägt. So liegen sie versteckt im DOM. -->
    <!-- AUFKLAPPER-BREITE UND -FARBE (PS1-Klickbeweis 2026-09-09, gemessen):
         Reka misst die Viewport-Breite am CONTENT-Element, und das ist im
         Nuxt-UI-Theme `absolute w-full` — es kann also nie breiter werden als
         die Menüleiste selbst (347 px bei vier Punkten), das 34-rem-Raster der
         Kinder wurde rechts abgeschnitten — und ein `w-max` am Content half
         nicht: Rekas `--reka-navigation-menu-viewport-width` blieb bei der
         ersten Messung stehen, und ein `sm:w-[34rem]` am Viewport verlor gegen
         Nuxt-UIs `sm:w-(--reka-…-viewport-width)` (tailwind-merge kennt die
         Variablen-Kurzform nicht als `w-`-Klasse, beide bleiben stehen, die
         Variable gewinnt in der CSS-Reihenfolge). `min-width` ist eine andere
         Eigenschaft und schlägt jede kleinere `width`: der Viewport ist damit
         mindestens 34 rem, der Content `w-full` davon, und Rekas
         Positionsrechnung misst genau diese Breite (Rand-Klammer rechts).
         `bw-overlay` dazu: `bw-root` allein malt den Seiten-Grund (--bw-paper),
         und der ist auf der Seite unsichtbar — teleportierte Flächen brauchen
         die KARTEN-Farbe (brand.css, Runde 19c). -->
    <UNavigationMenu
      :items="menuItems" variant="link" color="neutral" :unmount-on-hide="false"
      :ui="{ link: 'text-sm text-(--bw-muted) data-active:text-(--bw-ink) hover:text-(--bw-ink)', viewport: 'bw-root bw-overlay sm:min-w-[34rem]', childList: 'grid-cols-1 sm:grid-cols-2', childLinkDescription: 'text-(--bw-muted)' }"
    />

    <template #right>
      <!-- Runde 189 (David): Meine Brands + Neue Brand leben im
           Avatar-Menue — rechts steht nur noch das Konto. -->
      <BwNewBrandModal
        v-model:open="newBrandOpen" mode="live"
        :content-locales="newBrandLocales" :loading="newBrandCreating" :failed="newBrandFailed"
        @submit="createFromModal"
      />
      <UDropdownMenu v-if="isLoggedIn" :items="userMenu">
        <button :aria-label="t('brand.nav.accountMenu')" class="grid place-items-center"><UAvatar :text="initials" size="md" /></button>
      </UDropdownMenu>
      <UButton
        v-else :to="localePath('/login')" color="neutral" variant="ghost" size="sm"
        :label="t('brand.nav.signIn')"
      />
    </template>

    <template #body>
      <UNavigationMenu
        :items="menuItems" orientation="vertical" variant="link" color="neutral" class="-mx-2.5"
        :ui="{ link: 'text-sm text-(--bw-muted) data-active:text-(--bw-ink) hover:text-(--bw-ink)' }"
      />
    </template>
  </UHeader>
</template>
