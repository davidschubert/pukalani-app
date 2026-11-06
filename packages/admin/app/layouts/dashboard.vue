<script setup lang="ts">
// Dashboard-Shell nach Vorbild des offiziellen Nuxt-UI-Dashboard-Templates:
// UDashboardGroup + collapsible/resizable Sidebar (Brand oben, UserMenu unten),
// Command-Palette-Suche (⌘K). Die Seiten rendern in <slot/> als UDashboardPanel.
import type { CommandPaletteGroup, CommandPaletteItem, NavigationMenuItem } from '@nuxt/ui'
import type { PukalaniSettingsTab } from '../../../core/shared/types/settings-tab'
import { resolveSettingsTabs } from '../../../core/shared/types/settings-tab'
import { applyDashboardNavPrefs, configFlagEnabled, parseDashboardNavPrefs } from '../../../core/shared/dashboardNav'

const { t } = useI18n()
const localePath = useLocalePath()
const auth = useAuthStore()
const appConfig = useAppConfig()

/**
 * DIE ZUTATEN DER NAVIGATION KOMMEN AUS EINER HAND (NAV1 Paket 3): Ort, die
 * zwei Rechte-Quellen (N1) und die drei Produkt-Gates (F2 · C2 · F37) rechnet
 * `useDashboardNavModules()` — dieselbe Rechnung liest die Konto-Seite
 * „Navigation", damit dort nie etwas zum Sortieren angeboten wird, das die
 * Leiste gar nicht zeigt. Die Begründungen zu jedem Gate stehen dort.
 */
const {
  place,
  operatorHere,
  can,
  tabFilter,
  navModules,
  bottomModules,
} = useDashboardNavModules()

// Glocke in der Betreiber-Shell (C17): dieselbe Config-Naht wie im
// core-default-Layout. Betrifft heute apps/control — dort liegen die
// kontobezogenen Meldungen (Early-Access-Anfragen an die Betreiber,
// Zahlungsprobleme des Betreiber-Kontos), und /dashboard ist die Shell, in
// der ein Betreiber sie liest. Core-Default aus: eine Community-Shell soll
// nicht ungefragt eine zweite Glocke bekommen.
const accountBell = computed(() =>
  (appConfig.pukalani as { chrome?: { accountBell?: boolean } }).chrome?.accountBell === true)

const open = ref(false)

// Sidebar-Optik umschaltbar: sidebar | floating | inset. Nuxt UI hat diese
// Varianten nicht nativ — floating/inset bilden wir per CSS nach. Default floating.
const sidebarVariant = useCookie<'sidebar' | 'floating' | 'inset'>('pukalani-sidebar-variant', { default: () => 'floating' })

const sidebarClass = computed(() => {
  switch (sidebarVariant.value) {
    case 'floating': return 'm-2 h-[calc(100svh-1rem)] min-h-[calc(100svh-1rem)] rounded-xl border border-default bg-elevated shadow-lg'
    case 'inset': return 'border-0 bg-transparent'
    default: return 'bg-elevated/25'
  }
})

const close = () => { open.value = false }
const route = useRoute()

/**
 * Community-Switcher im Sidebar-Kopf (F50, 2026-08-07 — Davids Entscheidung im
 * DECISION-LOG „Konto-Modell bestätigt, Community-Switcher kommt"). ZWEI
 * Bedingungen, und beide sind nötig:
 *  1. Der Config-Schalter sagt, ob diese APP die Routen mitbringt (der
 *     onboarding-Layer besitzt sie, A14) — sonst wäre das Menü eine Attrappe,
 *     die beim ersten Öffnen in einen 404 läuft.
 *  2. Der ORT sagt, ob es hier etwas zu wechseln GIBT. Auf einem Kontroll-Host
 *     (`account.*`) steht die vollständige Übersicht ohnehin als eigene Seite, und
 *     `/api/community/switcher` antwortet dort bewusst 404; im Einzelbetrieb
 *     gibt es überhaupt nur eine Community.
 * Trifft eines nicht zu, bleibt es beim Branding wie bisher (DashboardBrand).
 */
const communitySwitcher = computed(() =>
  (appConfig.pukalani as { chrome?: { communitySwitcher?: boolean } }).chrome?.communitySwitcher === true
  && place === 'community')

const canManageUsers = computed(() => can('users.manage'))
// Kommentar-Treffer der Palette springen in die Moderations-Warteschlange
// (Davids Entscheidung, Befund B7) — die verlangt `comments.moderate`.
const canModerateComments = computed(() => can('comments.moderate'))

// Von Produkt-Layern registrierte Dashboard-Module (z.B. comments-Moderation),
// nach EBENE und Capability gefiltert — admin kennt sie nicht hart
// (Modul-Registry, A14). Mit children wird der Eintrag zum aufklappbaren
// Abschnitt (Unterpunkte erben die Capability des Moduls, sofern keine
// eigene gesetzt ist). placement 'bottom' rendert unten, 'userMenu' im
// Account-Menü (DashboardUserMenu) — beides nicht hier.
const toItem = (m: PukalaniAdminModule): NavigationMenuItem => {
  const children = (m.children ?? [])
    .filter(child => can(child.requiredCapability ?? m.requiredCapability))
    .map(child => ({ label: t(child.labelKey), icon: child.icon, to: localePath(child.to), exact: child.exact, onSelect: close }))
  return children.length
    ? { label: t(m.labelKey), icon: m.icon, defaultOpen: route.path.startsWith(localePath(m.to)), children }
    : { label: t(m.labelKey), icon: m.icon, to: localePath(m.to), onSelect: close }
}

/**
 * Die Module in Abschnitte legen und in Menü-Einträge übersetzen — erst die
 * ohne Gruppe, dann je Gruppe ein Label und darunter ihre Einträge. Die
 * Gruppen-Reihenfolge steht als `DASHBOARD_NAV_GROUPS` in
 * core/shared/dashboardNav.ts (bis NAV1 Paket 3 als Literal-Array hier).
 *
 * Innerhalb sortiert `order` (Vergabe-Regel ebendort); Label-Abstand kommt
 * einheitlich über :ui der UNavigationMenu.
 */
function toNavItems(layout: ReturnType<typeof applyDashboardNavPrefs<PukalaniAdminModule>>): NavigationMenuItem[] {
  const items: NavigationMenuItem[] = [
    { label: t('admin.nav.overview'), icon: 'i-ph-gauge', to: localePath('/dashboard'), exact: true, onSelect: close },
  ]
  for (const m of layout.ungrouped) items.push(toItem(m))
  for (const group of layout.groups) {
    items.push({ label: t(`admin.nav.groups.${group.group}`), type: 'label' })
    for (const m of group.modules) items.push(toItem(m))
  }
  // Settings bewusst nicht hier — sitzt schon im User-Menü unten (DashboardUserMenu)
  return items
}

/**
 * DIE SEITENLEISTE ZEIGT DIE WAHL DIESER PERSON (NAV1 Paket 3, Entscheidung 3
 * vom 2026-09-08). `prefs.dashboardNav` kommt aus dem Konto und ist SSR-
 * hydriert (`auth.user` steht im Payload) — es gibt hier keine Client-only-
 * Verzweigung und damit keinen Hydration-Bruch. Ohne gespeicherte Wahl ist das
 * Ergebnis exakt die bisherige Nav (Zusage 1).
 *
 * Gelesen wird IMMER durch `parseDashboardNavPrefs`: ein Prefs-Dokument kann
 * alles enthalten, und ein kaputtes darf höchstens die Standard-Reihenfolge
 * kosten, nie das Menü.
 */
const navPrefs = computed(() => parseDashboardNavPrefs(auth.user?.prefs?.dashboardNav))

const links = computed<NavigationMenuItem[]>(() =>
  toNavItems(applyDashboardNavPrefs(navModules.value, navPrefs.value)))

/**
 * DIESELBE NAV OHNE DIE PERSÖNLICHE WAHL — die liest die ⌘K-Suche (Zusage 5).
 *
 * „Ausblenden" nimmt einen Eintrag aus der SEITENLEISTE, nicht aus der
 * Anwendung: die Fläche darf man weiterhin betreten, die Route sagt dazu
 * unverändert ja. Läse die Suche `links`, wäre ein Ausblenden ein Weg, sich
 * selbst auszusperren — und der einzige Rückweg ein Besuch der Konto-Seite.
 * Reihenfolge spielt hier keine Rolle (die Palette sortiert nach Treffer);
 * es geht allein um die VOLLSTÄNDIGKEIT.
 */
const allLinks = computed<NavigationMenuItem[]>(() =>
  toNavItems(applyDashboardNavPrefs(navModules.value, undefined)))

/**
 * Der INSTANZ-Unterbau, knapp über dem User-Menü: Nutzer · (registrierte
 * 'bottom'-Module, z. B. die interne Doku) · Admin · Speicher · System.
 * Davids Struktur (E9) stellt genau diese selten gebrauchten Betreiber-
 * Einträge nach unten.
 *
 * ZWEI Filter, und beide sind nötig: die Capabilities hier trägt zwar keine
 * Community-Rolle (N1-Vertrag, communityAuthz.test.ts) — aber der BETREIBER
 * trägt sie überall, auch wenn er den Host einer Kundencommunity aufruft.
 * `operatorHere` ist das, was ihn dort davor bewahrt, die Instanz-Verwaltung
 * im Kunden-Dashboard vor sich zu haben.
 */
/**
 * Der EINE Einstieg in die Community-Einstellungen (F51, 2026-08-07 — Davids
 * Community-Settings-Hub). Er steht ganz oben im Unterbau, weil ihn der Owner
 * einer Kunden-Community regelmäßig braucht, während darunter die selten
 * gebrauchte Instanz-Verwaltung des BETREIBERS folgt.
 *
 * SICHTBAR NUR MIT INHALT: gerechnet wird dieselbe Liste, die die Hülle
 * rendert (`resolveSettingsTabs` über `pukalani.admin.communityTabs`) — Ort ×
 * Capability × Produkt-Gates. Damit erledigt der Ort-Filter Davids
 * Ebenen-Entscheidung von selbst: auf einem Kontroll-Host bleibt von den
 * Community-Reitern nichts übrig, also gibt es den Punkt dort nicht; eine App
 * ohne registrierende Layer (photos, control) hat ihn nie. Kein zweites
 * Regelwerk, keine Liste, die man mitpflegen muss — und kein Menüpunkt, der
 * in den 404 der Hülle führt.
 */
const communityTabsHere = computed(() => resolveSettingsTabs(
  (appConfig.pukalani?.admin?.communityTabs ?? []) as PukalaniSettingsTab[],
  tabFilter,
))

/**
 * WIE DIESE HÜLLE HEISST (U7/G1, 2026-08-11).
 *
 * In einer SILO-App (apps/comments) gibt es keine Community — trotzdem hieß
 * der Menüpunkt „Community-Einstellungen", und darin standen Produkte,
 * Speicher, Konfiguration und System. Das ist keine Struktur-, sondern eine
 * WORT-Frage: für ein Verzeichnis der Instanz-Verwaltung ist „Community" eine
 * falsche Auskunft.
 *
 * Der Schalter dafür war schon da: `admin.instanceTabs` (Core-Default aus)
 * hängt genau die vier Betreiber-Reiter in diese Hülle (packages/admin/app/
 * app.config.ts). Wo er an ist, heißt sie „Website-Einstellungen" — Davids
 * Wort vom 2026-09-08 (davor „Instanz-Einstellungen": für einen Kunden ist
 * „Instanz" Technik, „Website" das, was er vor sich hat; der i18n-SCHLÜSSEL
 * `instanceSettings` bleibt, Label ≠ Key). An ist er in den drei Silo-Apps
 * comments, portfolio und branding. Gelesen
 * über dieselbe pure Regel wie die Registry-Gates (`configFlagEnabled`,
 * fail-closed) — kein zweiter Weg zu derselben Tatsache.
 *
 * Dieselbe Rechnung steht in der Hülle selbst (packages/admin/app/pages/
 * dashboard/community.vue): Menüpunkt und Kopfzeile dürfen nicht zwei Namen
 * für eine Fläche tragen.
 */
const communityHullLabel = computed(() =>
  configFlagEnabled(appConfig.pukalani, 'admin.instanceTabs')
    ? t('admin.nav.instanceSettings')
    : t('admin.nav.communitySettings'))

const bottomLinks = computed<NavigationMenuItem[]>(() => {
  const items: NavigationMenuItem[] = []
  // Ziel ist der ERSTE sichtbare Reiter, nicht fest `/dashboard/community`:
  // den Index der Hülle bringt der onboarding-Layer mit (Reiter „Allgemein"),
  // und den hat eine SILO-App nicht. Dort beginnt der Hub bei „Eigene Domain"
  // oder was sonst zuerst kommt — ein Menüpunkt auf eine Adresse ohne Kind
  // führte in eine leere Fläche.
  const firstCommunityTab = communityTabsHere.value[0]
  if (firstCommunityTab) {
    items.push({ label: communityHullLabel.value, icon: 'i-ph-users-three', to: localePath(firstCommunityTab.to), onSelect: close })
  }
  if (operatorHere && canManageUsers.value) {
    items.push({ label: t('admin.nav.people'), icon: 'i-ph-users', to: localePath('/dashboard/users'), onSelect: close })
  }
  for (const m of bottomModules.value) {
    items.push({ label: t(m.labelKey), icon: m.icon, to: localePath(m.to), onSelect: close })
  }
  if (operatorHere && can('audit.read')) items.push({ label: t('admin.nav.admin'), icon: 'i-ph-shield-check', to: localePath('/dashboard/admin'), onSelect: close })
  // Storage sitzt bei der Infrastruktur (selten gebraucht), nicht bei den Produkten
  if (operatorHere && can('storage.manage')) items.push({ label: t('admin.nav.storage'), icon: 'i-ph-folder', to: localePath('/dashboard/storage'), onSelect: close })
  if (operatorHere && can('system.manage')) items.push({ label: t('admin.nav.system'), icon: 'i-ph-cpu', to: localePath('/dashboard/system'), onSelect: close })
  // Raus aus dem Dashboard: zurück zur Startseite (ohne Capability — jeder)
  items.push({ label: t('admin.nav.homepage'), icon: 'i-ph-house', to: localePath('/'), onSelect: close })
  return items
})

// Globale Suche: Tippen fragt serverseitig User + Kommentare ab (debounced).
// Leichte lokale Typen — der volle CommandPaletteGroup<CommandPaletteItem>-Generic
// löst bei Array-Operationen TS2589 aus (zu tiefe Instanziierung), daher bauen wir
// damit und casten einmal an der Prop.
interface PaletteItem { label: string, icon?: string, suffix?: string, to?: string, onSelect?: () => void }
interface PaletteGroup { id: string, label: string, items: PaletteItem[], ignoreFilter?: boolean }

const searchTerm = ref('')
const searchLoading = ref(false)
const searchResults = ref<PaletteGroup[]>([])
let searchTimer: ReturnType<typeof setTimeout> | undefined

interface SearchResponse {
  users: { $id: string, name: string, email: string }[]
  comments: { $id: string, content: string, authorId: string, authorName: string }[]
}

// Stale-Response-Guard: nur die JÜNGSTE Suche darf die Ergebnisse setzen —
// sonst überschreibt eine langsam zurückkommende ältere Antwort die neuere
// (klassisches Race bei schnellem Tippen).
let searchSeq = 0

async function runSearch(term: string) {
  const seq = ++searchSeq
  if (term.trim().length < 2) {
    searchResults.value = []
    return
  }
  searchLoading.value = true
  try {
    const res = await $fetch<SearchResponse>('/api/admin/search', { query: { q: term.trim() } })
    if (seq !== searchSeq) return // veraltete Antwort verwerfen
    const groups: PaletteGroup[] = []
    // Nutzer-Treffer führen auf /dashboard/users/:id — die Seite verlangt
    // `users.manage`. Ohne die Capability wäre der Treffer ein Knopf in ein
    // 403, deshalb erscheint die Gruppe nur mit ihr (im Pool ist sie ohnehin
    // leer, Audit B2 — das trifft den Silo/Einzelbetrieb).
    if (res.users.length && canManageUsers.value) {
      groups.push({
        id: 'users',
        label: t('dashboard.search.users'),
        ignoreFilter: true,
        items: res.users.map(u => ({ label: u.name, suffix: u.email, icon: 'i-ph-user', to: localePath(`/dashboard/users/${u.$id}`), onSelect: () => { open.value = false } })),
      })
    }
    // Kommentar-Treffer führen per Deeplink in die Moderations-Warteschlange
    // auf genau diesen Eintrag (Befund B7, Davids Entscheidung) — NICHT mehr
    // auf die Nutzer-Detailseite des Autors, die `users.manage` verlangt und
    // dieselben Aufrufer mit 403 abwies. Query hinter den lokalisierten Pfad
    // gehängt: localePath bekommt reine Pfade, sonst geht der Prefix verloren.
    if (res.comments.length && canModerateComments.value) {
      const queue = localePath('/dashboard/comments')
      groups.push({
        id: 'comments',
        label: t('dashboard.search.comments'),
        ignoreFilter: true,
        items: res.comments.map(c => ({ label: c.content, suffix: c.authorName, icon: 'i-ph-chat-circle', to: `${queue}?comment=${encodeURIComponent(c.$id)}`, onSelect: () => { open.value = false } })),
      })
    }
    searchResults.value = groups
  }
  catch {
    if (seq === searchSeq) searchResults.value = []
  }
  finally {
    // Spinner nur beenden, wenn keine neuere Suche läuft
    if (seq === searchSeq) searchLoading.value = false
  }
}

watch(searchTerm, (term) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => runSearch(term), 250)
})

/**
 * WAS DIE SUCHE FINDET (U7/E8, 2026-08-11).
 *
 * Bis hierher indexierte sie NUR die Seitenleiste (`links` + `bottomLinks`) —
 * und die kennt von den Einstellungen genau zwei Einträge: den EINEN Menüpunkt
 * in den Community-Hub und den EINEN ins Konto. Die Flächen dahinter (heute bis
 * zu elf Community-Reiter und fünf Konto-Reiter) waren über die Suche
 * unerreichbar; wer „Domain", „Mitglieder" oder „Sitzungen" tippte, bekam
 * nichts. Eine Suche, die die halbe Anwendung nicht kennt, erzieht dazu, sie
 * nicht zu benutzen.
 *
 * Zwei Quellen, beide schon da, keine dritte Liste:
 *  - `communityTabsHere` — dieselbe gefilterte Reiter-Liste, die auch der
 *    Menüpunkt unten links benutzt (Ort × Capability × die drei Produkt-Gates).
 *    Damit findet die Suche nie einen Reiter, den die Hülle wegfiltert.
 *  - `ACCOUNT_SETTINGS_TABS` — die Konto-Reiter aus der Hülle selbst
 *    (app/utils/accountSettingsTabs.ts). Sie tragen keine Capability: sein
 *    eigenes Konto verwaltet jeder Angemeldete.
 * Registrierte FREMDE Konto-Reiter (`pukalani.admin.settingsTabs`) kommen
 * dazu, sobald es welche gibt — die Registry hat heute null Produzenten
 * (Audit-Befund M11), der Weg ist aber derselbe.
 *
 * EINE Gruppe für beides, weil ein Suchender die Hüllen nicht auseinanderhält:
 * er sucht eine Fläche, nicht ihren Behälter. Die Vereinigung ist bewusst
 * doppelfrei — `to` ist der Schlüssel, und der ist je Fläche eindeutig.
 *
 * SEIT NAV1 PAKET 3 liest die Nav-Gruppe `allLinks`, nicht `links`: die
 * persönliche Wahl gehört in die Seitenleiste, nicht in die Suche (Zusage 5,
 * Begründung an `allLinks`).
 */
const settingsTabsHere = computed(() => resolveSettingsTabs(
  (appConfig.pukalani?.admin?.settingsTabs ?? []) as PukalaniSettingsTab[],
  tabFilter,
))

const searchGroups = computed(() => {
  const navGroup: PaletteGroup = {
    id: 'links',
    label: t('dashboard.search.label'),
    items: [...allLinks.value, ...bottomLinks.value].map(link => ({ label: String(link.label), icon: link.icon, to: String(link.to) })),
  }
  const seen = new Set(navGroup.items.map(item => item.to))
  const tabItems: PaletteItem[] = []
  for (const tab of [
    ...communityTabsHere.value,
    ...settingsTabsHere.value,
    ...ACCOUNT_SETTINGS_TABS,
  ]) {
    const to = localePath(tab.to)
    if (seen.has(to)) continue
    seen.add(to)
    tabItems.push({ label: t(tab.labelKey), icon: tab.icon, to, onSelect: close })
  }
  const tabsGroup: PaletteGroup = { id: 'settings-tabs', label: t('dashboard.search.settings'), items: tabItems }
  return [navGroup, ...(tabItems.length ? [tabsGroup] : []), ...searchResults.value] as unknown as CommandPaletteGroup<CommandPaletteItem>[]
})
</script>

<template>
  <UDashboardGroup unit="rem" :class="sidebarVariant === 'inset' ? 'bg-elevated/50' : undefined">
    <UDashboardSidebar
      id="dashboard"
      v-model:open="open"
      collapsible
      :resizable="sidebarVariant === 'sidebar'"
      :class="sidebarClass"
      :ui="{ footer: sidebarVariant === 'sidebar' ? 'lg:border-t lg:border-default' : '' }"
    >
      <template #header="{ collapsed }">
        <DashboardCommunityMenu v-if="communitySwitcher" :collapsed="collapsed" />
        <DashboardBrand v-else :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <!-- Suche + Glocke in EINER Reihe (C17). Die Glocke gehört bewusst in
             die Sidebar und nicht in eine schwebende Ecke: oben rechts sitzen
             die Aktionen der Seiten-Kopfzeilen („Neuer Code", „Nachfüllen"),
             dort verdeckt ein fixes Widget echte Knöpfe. Eingeklappt stapelt
             die Reihe (flex-col), damit die schmale Leiste nicht überläuft. -->
        <div class="flex items-center gap-1.5" :class="collapsed ? 'flex-col' : ''">
          <!-- label explizit — der Nuxt-UI-Default ist englisch ("Search...") -->
          <UDashboardSearchButton :collapsed="collapsed" :label="t('dashboard.search.button')" class="grow bg-transparent ring-default" />
          <NotificationBell v-if="accountBell && auth.user" />
        </div>
        <UNavigationMenu :collapsed="collapsed" :items="links" orientation="vertical" tooltip popover :ui="{ label: 'mt-4' }" />
        <div class="flex-1" />
        <UNavigationMenu :collapsed="collapsed" :items="bottomLinks" orientation="vertical" tooltip popover />
      </template>

      <template #footer="{ collapsed }">
        <DashboardUserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch
      v-model:search-term="searchTerm"
      :groups="searchGroups"
      :loading="searchLoading"
      :placeholder="t('dashboard.search.placeholder')"
    />

    <!-- Global: wer sonst noch auf DIESER Seite ist (Betrachtungs-Presence) -->
    <ClientOnly>
      <div class="pointer-events-none fixed end-3 top-3 z-50 flex justify-end">
        <DashboardViewers class="pointer-events-auto" />
      </div>
    </ClientOnly>

    <!-- inset: Hauptinhalt sitzt als abgesetzte Karte im gedämpften Hintergrund -->
    <div
      v-if="sidebarVariant === 'inset'"
      class="m-2 flex min-w-0 flex-1 overflow-hidden rounded-xl bg-default shadow-sm ring ring-default"
    >
      <slot />
    </div>
    <slot v-else />
  </UDashboardGroup>
</template>
