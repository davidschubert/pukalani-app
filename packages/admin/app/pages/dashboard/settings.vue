<script setup lang="ts">
// Settings-Hülle nach Template-Vorbild: Panel + Navbar + horizontale Sub-Nav
// (General/Security), Kind-Seiten rendern via <NuxtPage/>.
import type { NavigationMenuItem } from '@nuxt/ui'
import type { Capability } from '../../../../core/shared/types/authz'
import type { PukalaniSettingsTab } from '../../../../core/shared/types/settings-tab'
import { resolveSettingsTabs } from '../../../../core/shared/types/settings-tab'
import { resolveDashboardPlace } from '../../../../core/shared/dashboardNav'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t } = useI18n()
const localePath = useLocalePath()
const auth = useAuthStore()
const appConfig = useAppConfig()

useBrandTitle(() => t('dashboard.settings.title'))

/**
 * FREMDE REITER (F24, 2026-08-02) kommen aus der Registry, nicht von hier.
 *
 * Bis heute stand der Community-Reiter fest in dieser Liste, obwohl die Seite
 * dahinter (damals `/dashboard/settings/community`) ausschließlich Routen des
 * onboarding-Layers ruft. Versteckt war er nur zur LAUFZEIT (`isTenantHost`) —
 * eine Silo-App ohne onboarding hatte den Reiter also im Bauplan und verließ
 * sich darauf, dass eine Beobachtung ihn wegblendet. Jetzt registriert ihn der
 * Layer, dem seine Routen gehören (packages/onboarding/app/app.config.ts):
 * ohne den Layer gibt es den Reiter gar nicht.
 *
 * Gefiltert wird mit DERSELBEN puren Regel wie die Sidebar-Module
 * (core/shared/dashboardNav.ts) — Ort × Capability. Kein zweites Regelwerk:
 * ein Reiter und ein Menüpunkt beantworten dieselbe Frage.
 */
const place = resolveDashboardPlace(
  (appConfig.pukalani as { tenancy?: { enabled?: boolean } }).tenancy?.enabled === true,
  useIsTenantHost(),
)
const { capabilities: siteCaps } = useCommunityRole()
const canAsOperator = (capability: Capability) => userHasCapability(auth.user, capability)
const canAsMember = (capability: Capability) => siteCaps.value.has(capability)

const registered = computed<PukalaniSettingsTab[]>(() => resolveSettingsTabs(
  (appConfig.pukalani as { admin?: { settingsTabs?: PukalaniSettingsTab[] } }).admin?.settingsTabs,
  { place, canAsOperator, canAsMember },
))

const links = computed<NavigationMenuItem[]>(() => [
  // Die KONTO-Reiter gehören dem admin-Layer selbst — er bringt die Hülle
  // mit, ein Registry-Umweg zu sich selbst brächte nichts. Die LISTE steht
  // seit U7/E8 in app/utils/accountSettingsTabs.ts, weil die ⌘K-Suche sie
  // ebenfalls liest; hier bleibt nur, was die Hülle daraus macht.
  ...ACCOUNT_SETTINGS_TABS.map(tab => ({ label: t(tab.labelKey), icon: tab.icon, to: localePath(tab.to), exact: tab.exact })),
  ...registered.value.map(tab => ({ label: t(tab.labelKey), icon: tab.icon, to: localePath(tab.to) })),
])

// EINE Breite für alle Konto-Reiter: 1280 px (Davids Entscheidung 2026-08-23,
// dieselbe Zahl wie in der Community-Hülle und im Kundenbereich). Vorher zog
// nur die Sessions-Route auf — der Hub sprang damit bei jedem Reiter-Wechsel
// in der Breite. Formulare begrenzen sich über ihre Felder, nicht über die Hülle.
const containerWidth = 'lg:max-w-7xl'
</script>

<template>
  <UDashboardPanel id="settings" :ui="{ body: 'lg:py-12' }">
    <template #header>
      <UDashboardNavbar :title="t('dashboard.settings.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <UNavigationMenu :items="links" highlight class="-mx-1 flex-1" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full flex-col gap-4 sm:gap-6 lg:gap-12" :class="containerWidth">
        <NuxtPage />
      </div>
    </template>
  </UDashboardPanel>
</template>
